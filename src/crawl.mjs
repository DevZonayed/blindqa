/**
 * Read-only crawler: walks the app like a person for one role and checks what a person can actually
 * see and use on every screen. Fixed rules decide what to touch, and each screen also gets script checks
 * a person would notice: is it an error or blank page, does it show raw ids or codes, can a screen-reader
 * user tell its controls apart (src/judge.mjs). No model is involved.
 *
 *   blindqa crawl --role ADMIN [--max 60] [--only "Settings|Clients"] [--phone] [--start /path] [--headless] [--run name]
 *
 * Order (one pass per page, like reading it):
 *   nav item → ONE top-to-bottom wheel pass over the page. Controls are audited as they come into
 *   view (covered, clipped, transparent, unnamed, low contrast, tiny), and each kind of menu, select
 *   list and "New / Add …" form is handled where it appears: opened, checked, closed.
 *   Forms get an empty-submit probe: pressing the main button on an empty form must show what is
 *   missing, not send it to the server.
 *   → then the page's tabs / settings sections / one detail page per kind, in order, then the next
 *   nav item. Never goes back up for a control it already passed.
 * Read-only for real: every write request (POST/PUT/PATCH/DELETE) to the app is blocked at the network
 * level and logged with the click that caused it.
 * Output: .blindqa/runs/<run>/map.json, findings.jsonl, summary.md
 */
import { readFileSync, existsSync } from 'node:fs'
import { openSession, sessionOptions, DEFAULT_VIEWPORT } from './browser/session.mjs'
import { openAs, persistSession } from './auth/login.mjs'
import { glideTo } from './browser/cursor.mjs'
import { ctx, humanClick, settle, flushSignals, finding, log, pause, saveJson, scrollLockLeak, canSeeInPage, animationsDone, VISIBLE, RUN_DIR, useRunDir, watch } from './browser/human.mjs'
import { extractCandidates } from './browser/extract.mjs'
import { loadProject } from './project.mjs'
import { screenFacts, screenHealth, rawValues, unclearNames } from './judge.mjs'
import { writeSummary } from './summary.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const ROLE = arg('role', 'ADMIN').toUpperCase()
const MAX_SCREENS = Number(arg('max', 60))
const ONLY = arg('only', null) ? new RegExp(arg('only'), 'i') : null
const PHONE = process.argv.includes('--phone')
const START = arg('start', null) // e.g. /books/<id>: crawl every screen linked from that hub page, in order
const project = loadProject(arg('project', undefined))
const who = project.role(ROLE)
useRunDir(project.runDir(arg('run', `crawl-${ROLE.toLowerCase()}${PHONE ? '-phone' : ''}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`)))
const ORIGINS = [...new Set([...Object.values(project.profile.apps ?? {}).map((a) => new URL(a.baseUrl).origin), ...(project.profile.api?.origins ?? []).map((o) => new URL(o).origin)])]
watch.origins = ORIGINS

// Never click these (outside dialogs' Cancel/Close and the empty-submit probe, which can't write).
const DANGER = /\b(delete|remove|archive|deactivate|suspend|sign ?out|log ?out|revoke|reset|disable|void|submit|approve|reject|send|finali[sz]e|post|pay|publish|lock|unlock|disconnect|purge|erase|enter workspace|impersonat|rename|domains?|connect|download|export|print|mark as|restore|activate|cancel subscription|run|retry)\b/i
const OPENS_FORM = /^\+?\s*(new|add|invite|upload|import|record|log time)\b/i // never "create …": that usually saves at once
const PRIMARY = /\b(save|create|add|submit|send|invite|continue|next|confirm|upload|import|apply|done)\b/i
const LIMITS = process.argv.includes('--thorough') ? { menus: 60, selects: 20, forms: 40, links: 12 } : { menus: 8, selects: 3, forms: 4, links: 4 }
const ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const routeOf = (url) => new URL(url).pathname.replace(ID_RE, ':id').replace(/\/\d+(?=\/|$)/g, '/:n')
const norm = (n) => n.replace(/\b(for|of)\b.*$/i, '').trim().toLowerCase()

/* ------------------------------------------------------------------ in-page helpers (serialised) */
function auditInPage(canSee, rootSel) {
  const root = document.querySelector(rootSel) || document.body
  const SEL = 'a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=link],[role=tab],[role=switch],[role=checkbox],[role=combobox],[role=menuitem],[role=radio],[role=option]'
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim()
  const nameOf = (el) => {
    if (el.getAttribute('aria-label')) return t(el.getAttribute('aria-label'))
    const lb = el.getAttribute('aria-labelledby')
    if (lb) { const s = t(lb.split(/\s+/).map((i) => document.getElementById(i)?.textContent ?? '').join(' ')); if (s) return s }
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && t(l.textContent)) return t(l.textContent) }
    const wrap = el.closest('label'); if (wrap && t(wrap.textContent)) return t(wrap.textContent)
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return t(el.getAttribute('title') || '')
    return t(el.innerText).slice(0, 80) || t(el.getAttribute('title') || el.querySelector('img[alt]')?.alt || '')
  }
  const inSideScroller = (el) => {
    for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true
    }
    return false
  }
  let seq = window.__qaSeq || 0
  const out = []
  for (const el of root.querySelectorAll(SEL)) {
    if (el.closest('[data-qa-ui]')) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 2 && r.height <= 2) continue // zero-size or visually-hidden-by-design (sr-only)
    if (!(r.bottom > 0 && r.top < innerHeight)) continue // in the vertical band; sideways-hidden ones are judged below
    if (!el.dataset.qaId) el.dataset.qaId = String(++seq)
    const res = canSee(el)
    if (res.reasons.some((x) => /display none|visibility hidden/.test(x))) continue
    out.push({
      id: el.dataset.qaId, role: el.getAttribute('role') || el.tagName.toLowerCase(), name: nameOf(el),
      fully: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
      ok: res.ok, reasons: res.reasons, sideScroll: inSideScroller(el),
      disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      size: [Math.round(r.width), Math.round(r.height)],
    })
  }
  window.__qaSeq = seq
  return out
}

function actionsInPage(rootSel) {
  const root = document.querySelector(rootSel) || document.body
  const t = (s) => (s || '').replace(/\s+/g, ' ').trim()
  let seq = window.__qaSeq || 0
  const items = []
  for (const el of root.querySelectorAll('button,[role=button],[role=tab],a[href],[role=combobox]')) {
    if (el.closest('[data-qa-ui],[role=menu],[role=listbox]')) continue
    if (rootSel !== '[data-qa-dialog]' && el.closest('[role=dialog],[role=alertdialog]')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || getComputedStyle(el).visibility === 'hidden') continue
    if (!el.dataset.qaId) el.dataset.qaId = String(++seq)
    items.push({
      id: el.dataset.qaId, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '',
      name: t(el.getAttribute('aria-label') || el.innerText || el.getAttribute('title')).slice(0, 80),
      popup: el.getAttribute('aria-haspopup') || '', selected: el.getAttribute('aria-selected') || el.getAttribute('aria-current') || '',
      href: el.getAttribute('href') || '', disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      title: el.getAttribute('title') || '', inRow: !!el.closest('tr,[role=row]'), inNav: !!el.closest('nav'),
      submit: el.getAttribute('type') === 'submit' || !!el.closest('form'),
      inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, top: Math.round(r.top), left: Math.round(r.left),
    })
  }
  window.__qaSeq = seq
  return items
}

const auditExpr = (rootSel) => `(() => { const canSee = ${canSeeInPage.toString()}; return (${auditInPage.toString()})(canSee, ${JSON.stringify(rootSel)}) })()`
const actionsExpr = (rootSel) => `(${actionsInPage.toString()})(${JSON.stringify(rootSel)})`
const byId = (page, id) => page.locator(`[data-qa-id="${id}"]`)
/** The same control as `a`, freshly located (ids are lost when the page re-renders or we go back). */
async function resolve(page, a) {
  if (await byId(page, a.id).count()) return a
  const now = await page.evaluate(actionsExpr('main')).catch(() => [])
  return now.find((x) => x.name === a.name && x.tag === a.tag && x.role === a.role && x.popup === a.popup) ?? null
}
let fileChoosers = 0
const formsSeen = new Set()

/** What a person would do with this control on a read-only pass, or null to leave it alone. */
function classify(a, origin) {
  if (a.disabled) return null
  if (a.role === 'tab') return a.selected === 'true' ? null : 'tab'
  if (a.tag === 'a' && a.inNav) return a.href.startsWith('/') && a.selected !== 'page' ? 'section' : null
  if (/^(menu|true)$/.test(a.popup)) return DANGER.test(a.name) ? null : 'menu'
  if (a.popup === 'listbox') return 'select'
  if ((a.tag === 'button' || a.role === 'button') && !a.popup && !a.submit && OPENS_FORM.test(a.name) && !DANGER.test(a.name)) return 'form'
  if (a.tag === 'a' && a.href && !a.href.startsWith('#') && !DANGER.test(a.name)) {
    const abs = new URL(a.href, origin)
    return abs.origin === new URL(origin).origin && !/\/(api|logout)\b/.test(abs.pathname) ? 'link' : null
  }
  return null
}

/* ------------------------------------------------------------------ scrolling */
async function scrollSig(page) {
  return page.evaluate(() => { let s = `${scrollX},${scrollY}`; for (const el of document.querySelectorAll('*')) if (el.scrollTop || el.scrollLeft) s += `|${el.scrollTop}`; return s })
}
async function resetScroll(page) {
  await page.evaluate(() => { scrollTo(0, 0); for (const el of document.querySelectorAll('*')) if (el.scrollTop) el.scrollTop = 0 }).catch(() => {})
}

/**
 * ONE wheel pass over `rootSel`, top → bottom. At every stop: audit the controls in view, then let
 * `onStop` act on the ones that just came into view. Returns the audit of everything seen.
 */
async function pass(page, rootSel, onStop) {
  const seen = new Map()
  await resetScroll(page)
  await animationsDone(page)
  let moved = false
  for (let i = 0; i < 40; i += 1) {
    const batch = await page.evaluate(auditExpr(rootSel)).catch(() => [])
    for (const c of batch) {
      const s = seen.get(c.id) ?? { ...c, everOk: false, everFully: false, last: c.reasons, style: new Set() }
      s.everFully ||= c.fully
      if (c.fully) { s.everOk ||= c.ok; if (!c.ok) s.last = c.reasons } else if (!s.everFully) s.last = c.reasons
      for (const r of c.reasons) if (/^low contrast|^tiny/.test(r)) s.style.add(r)
      seen.set(c.id, s)
    }
    if (onStop) await onStop()
    const box = await page.evaluate((sel) => {
      const r = (document.querySelector(sel) || document.documentElement).getBoundingClientRect()
      const top = Math.max(r.top, 0); const bottom = Math.min(r.bottom, innerHeight)
      return { x: Math.min(Math.max(r.left + r.width / 2, 5), innerWidth - 5), y: Math.max(top + (bottom - top) / 2, 5), tall: document.documentElement.scrollHeight > innerHeight + 4 }
    }, rootSel).catch(() => null)
    if (!box) break
    const before = await scrollSig(page)
    await glideTo(page, box.x, box.y, { steps: 6, visible: VISIBLE })
    await page.mouse.wheel(0, 550)
    await page.waitForTimeout(VISIBLE ? 250 : 100)
    if ((await scrollSig(page)) === before) {
      if (!moved && box.tall && rootSel === 'main' && (await scrollLockLeak(page))) {
        await finding(page, 'scroll-lock-leak', 'high', 'Page content is taller than the window but the page will not scroll (body overflow:hidden with no dialog open)')
      }
      break
    }
    moved = true
  }
  return seen
}

/** Turn a pass into findings; returns a short summary for the map. */
async function report(page, seen, where) {
  const all = [...seen.values()]
  // inside a strip/table a person can scroll sideways: not blocked, just needs a sideways scroll
  const sideways = all.filter((s) => s.sideScroll && !s.everOk && s.last.every((r) => /clipped|outside viewport|^low contrast|^tiny/.test(r)))
  const blocked = all.filter((s) => s.everFully && !s.everOk && !sideways.includes(s))
  const clipped = all.filter((s) => !s.everFully && !s.sideScroll && s.last.some((r) => /clipped/.test(r)))
  const unnamed = all.filter((s) => !s.name && /^(button|a|link|input|select|textarea|combobox|switch|checkbox|tab)$/.test(s.role))
  const lowContrast = all.filter((s) => [...s.style].some((r) => /contrast/.test(r)) && !s.disabled)
  const tinyTargets = all.filter((s) => /^(button|checkbox|switch|radio)$/.test(s.role) && s.size[0] < 24 && s.size[1] < 24 && !s.disabled)
  const ex = (list, f = (s) => `"${s.name || s.role}"`) => list.slice(0, 6).map(f).join(', ') + (list.length > 6 ? ` … +${list.length - 6}` : '')

  for (const s of blocked) {
    if (s.last.some((r) => /covered by/.test(r))) {
      // a person scrolls a little until it's clear of a sticky header/footer: centre it, look again
      const el = byId(page, s.id)
      const b = await el.boundingBox().catch(() => null)
      if (b) {
        const dy = Math.round(b.y + b.height / 2 - page.viewportSize().height / 2)
        await page.mouse.wheel(0, dy)
        await page.waitForTimeout(250)
        const again = await el.evaluate(canSeeInPage).catch(() => null)
        if (again?.ok) continue
        if (again) s.last = again.reasons
      }
    }
    if (s.last.some((r) => /transparent/.test(r))) {
      // a person may reveal it by hovering its row/card first
      const el = byId(page, s.id)
      const host = el.locator('xpath=ancestor::*[self::tr or @role="row" or self::li][1]')
      const hb = (await host.count()) ? await host.boundingBox().catch(() => null) : null
      if (hb) { await glideTo(page, hb.x + hb.width / 3, hb.y + hb.height / 2, { visible: VISIBLE }); await page.waitForTimeout(350) }
      const after = await el.evaluate(canSeeInPage).catch(() => null)
      if (after?.ok) { await finding(page, 'hover-only-control', 'low', `${where}: "${s.name}" only appears while hovering its row — invisible on touch screens and to people who don't think to hover`); continue }
    }
    await finding(page, 'not-humanly-visible', 'high', `${where}: "${s.name || s.role}" is on screen but a person can't use it — ${s.last.filter((r) => !/^low contrast|^tiny/.test(r)).join('; ')}`)
  }
  if (clipped.length) await finding(page, 'clipped', 'high', `${where}: ${clipped.length} control(s) cut off by their container and never fully visible: ${ex(clipped)}`)
  if (sideways.length) await finding(page, 'needs-sideways-scroll', 'low', `${where}: ${sideways.length} control(s) only reachable by scrolling a panel sideways at ${page.viewportSize()?.width}px: ${ex(sideways)}`)
  if (unnamed.length) await finding(page, 'a11y-unnamed-control', unnamed.every((s) => s.disabled) ? 'low' : 'medium', `${where}: ${unnamed.length} control(s) with no accessible name (screen readers say just "button"/"link"): ${ex(unnamed, (s) => `${s.role}#${s.id}`)}`)
  if (lowContrast.length) await finding(page, 'low-contrast', 'low', `${where}: ${lowContrast.length} control(s) with text below WCAG contrast: ${ex(lowContrast, (s) => `"${s.name}" (${[...s.style].find((r) => /contrast/.test(r))})`)}`, { noShot: true })
  if (tinyTargets.length) await finding(page, 'small-target', 'low', `${where}: ${tinyTargets.length} clickable control(s) smaller than 24×24 px: ${ex(tinyTargets, (s) => `"${s.name || s.role}" ${s.size.join('×')}`)}`, { noShot: true })
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth).catch(() => 0)
  if (overflowX > 2) await finding(page, 'page-scrolls-sideways', 'medium', `${where}: the whole page is ${overflowX}px wider than the window`)
  const checked = await checkScreen(page, where)
  return { controls: all.length, blocked: blocked.length, clipped: clipped.length, unnamed: unnamed.length, ...checked }
}

/** What a person would notice about the screen as a whole: an error or blank page, raw values, controls they can't tell apart. */
async function checkScreen(page, where) {
  const facts = await screenFacts(page).catch(() => null)
  if (!facts) return {}
  const health = screenHealth(facts)
  if (health.kind !== 'content') await finding(page, 'screen-unhealthy', health.kind === 'loading' ? 'medium' : 'high', `${where}: the screen shows ${health.kind === 'error' ? `an error ("${health.why}")` : health.why} instead of content`)
  const raw = rawValues(facts.mainText)
  if (raw.length) await finding(page, 'raw-text', 'low', `${where}: the screen shows values a user shouldn't see: ${raw.map((v) => `"${v.slice(0, 60)}"`).join(', ')}`, { needsReview: true })
  const unclear = unclearNames((await extractCandidates(page).catch(() => ({ candidates: [] }))).candidates)
  if (unclear.length) await finding(page, 'a11y-unclear-name', unclear.some((u) => u.why === 'only a symbol') ? 'medium' : 'low', `${where}: ${unclear.length} control name(s) don't say what they act on (a screen reader hears only the name): ${unclear.slice(0, 8).map((u) => `"${u.name}" (${u.why})`).join(', ')}`, { noShot: true })
  return { kind: health.kind }
}

/* ------------------------------------------------------------------ menus, selects, forms */
async function closeAndCheck(page, overlaySel, label, how) {
  if (how) await how()
  else await page.keyboard.press('Escape')
  const gone = await page.waitForFunction((sel) => ![...document.querySelectorAll(sel)].some((n) => n.getBoundingClientRect().width > 0), overlaySel, { timeout: 3000 }).then(() => true, () => false)
  if (!gone) {
    await finding(page, 'wont-close', 'high', `${label} stays open after ${how ? 'Cancel/Close' : 'Escape'}`)
    await page.keyboard.press('Escape').catch(() => {})
  }
  await animationsDone(page)
  await page.waitForTimeout(150)
  if (await scrollLockLeak(page)) {
    await finding(page, 'scroll-lock-leak', 'high', `After closing ${label} the page can no longer scroll (body overflow:hidden left behind)`)
    await page.reload(); await settle(page)
    return 'reloaded'
  }
  return gone
}

async function rectCheck(page, sel, label, { sidewaysOnly = false } = {}) {
  const r = await page.locator(sel).last().boundingBox().catch(() => null)
  const vp = page.viewportSize()
  const outY = !sidewaysOnly && (r.y + r.height > vp.height + 1 || r.y < -1)
  if (r && (outY || r.x + r.width > vp.width + 1 || r.x < -1)) {
    await finding(page, 'popup-off-screen', 'medium', `${label} sticks out of the window (${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)} in ${vp.width}×${vp.height})`)
  }
}

async function exploreMenu(page, a, where) {
  if (a.inRow) { const row = byId(page, a.id).locator('xpath=ancestor::*[self::tr or @role="row"][1]'); const b = await row.boundingBox().catch(() => null); if (b) await glideTo(page, b.x + b.width / 2, b.y + b.height / 2, { visible: VISIBLE }) }
  if (!(await humanClick(page, byId(page, a.id), `${a.name || 'menu button'} (menu)`))) return null
  const menu = page.locator('[role=menu]').last()
  if (!(await menu.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false))) {
    await finding(page, 'dead-control', 'medium', `${where}: "${a.name}" says it opens a menu but nothing opened`)
    return null
  }
  await animationsDone(page)
  await rectCheck(page, '[role=menu]', `${where}: menu of "${a.name}"`)
  const items = await page.evaluate(`(() => {
    const canSee = ${canSeeInPage.toString()}
    const m = [...document.querySelectorAll('[role=menu]')].at(-1)
    if (!m) return []
    return [...m.querySelectorAll('[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]')].map((i) => ({ name: (i.getAttribute('aria-label') || i.innerText).replace(/\\s+/g, ' ').trim(), disabled: i.getAttribute('aria-disabled') === 'true' || !!i.disabled, see: canSee(i) }))
  })()`).catch(() => [])
  const bad = items.filter((i) => !i.see.ok)
  if (bad.length) await finding(page, 'not-humanly-visible', 'high', `${where}: in the "${a.name}" menu, ${bad.map((i) => `"${i.name}" (${i.see.reasons.join('; ')})`).join(', ')}`)
  if (!items.length) await finding(page, 'empty-menu', 'medium', `${where}: the "${a.name}" menu opened with no items`)
  log(`menu "${a.name}": ${items.map((i) => i.name + (i.disabled ? ' (disabled)' : '')).join(' | ')}`)
  await pause(page, 300)
  await closeAndCheck(page, '[role=menu]', `the "${a.name}" menu`)
  return { opener: a.name, inRow: a.inRow, items: items.map(({ name, disabled }) => ({ name, disabled })) }
}

async function exploreSelect(page, a, where) {
  if (!(await humanClick(page, byId(page, a.id), `${a.name || 'select'} (list)`))) return null
  const list = page.locator('[role=listbox]').last()
  if (!(await list.waitFor({ state: 'visible', timeout: 2000 }).then(() => true, () => false))) return null
  await animationsDone(page)
  await rectCheck(page, '[role=listbox]', `${where}: list of "${a.name}"`)
  const options = await list.getByRole('option').allInnerTexts().catch(() => [])
  log(`list "${a.name}": ${options.length} option(s)`)
  await closeAndCheck(page, '[role=listbox]', `the "${a.name}" list`)
  return { select: a.name, options: options.map((o) => o.replace(/\s+/g, ' ').trim()).slice(0, 30) }
}

/**
 * Empty-submit probe: press the form's main button with nothing filled in. A good form says what is
 * missing (or keeps the button disabled). Writes are blocked, so this can never save anything.
 */
async function probeEmptySubmit(page, rootSel, where) {
  const root = page.locator(rootSel).last()
  const submit = root.getByRole('button', { name: PRIMARY }).last()
  if (!(await submit.count())) return 'no main button'
  const name = (await submit.innerText().catch(() => '')).replace(/\s+/g, ' ').trim() || 'submit'
  if (!(await submit.isEnabled().catch(() => false))) { log(`"${name}" stays disabled until the form is filled — good`); return 'disabled until filled' }
  const writes = map.blockedWrites.length
  const before = (await root.innerText().catch(() => '')).replace(/\s+/g, ' ')
  if (!(await humanClick(page, submit, `${name} on the empty form`))) return 'could not press'
  await page.waitForTimeout(700)
  const after = (await root.innerText().catch(() => '')).replace(/\s+/g, ' ')
  const shown = await root.evaluate((d) => {
    const visible = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
    const errs = [...d.querySelectorAll('[role=alert],[aria-invalid=true],[data-error],.text-status-danger')].filter(visible)
    return { count: errs.length, text: errs.map((e) => (e.textContent || '').trim()).filter(Boolean).slice(0, 3).join(' / ') }
  }).catch(() => ({ count: 0, text: '' }))
  const confirm = page.locator('[role=alertdialog]:visible, [role=dialog]:visible').filter({ hasText: /\?/ }).last()
  if (rootSel === 'main' && (await confirm.count()) && !(await page.locator(rootSel).locator('[role=alertdialog], [role=dialog]').count())) {
    const title = ((await confirm.innerText().catch(() => '')).split('\n')[0] || '').trim()
    log(`"${name}" asks to confirm first ("${title.slice(0, 80)}") — cancelling`)
    await closeOverlays(page)
    return 'asks to confirm'
  }
  if (map.blockedWrites.length > writes) {
    const w = map.blockedWrites.at(-1)
    await finding(page, 'no-client-validation', 'medium', `${where}: pressing "${name}" on the EMPTY form sends it to the server (${w.method} ${w.path}) instead of first showing what is missing`)
    return 'sent to server'
  }
  if (!shown.count && after !== before && map.blockedWrites.length === writes) {
    log(`"${name}" moved on to the next step (nothing on this step is required)`)
    return 'moved on'
  }
  if (!shown.count) {
    await finding(page, 'no-feedback', 'medium', `${where}: pressing "${name}" on the empty form shows nothing — no message says what is missing`)
    return 'no feedback'
  }
  log(`empty "${name}" → ${shown.count} message(s): ${shown.text.slice(0, 120)}`)
  return 'errors shown'
}

/** Open a "New / Add …" form, inspect it, probe it empty, close it with Cancel. Returns the record, or a navigation. */
async function exploreForm(page, a, where, path) {
  const startUrl = page.url()
  const choosersBefore = fileChoosers
  const fieldsIn = () => page.evaluate(() => document.querySelectorAll('main input, main select, main textarea, main [role=combobox]').length).catch(() => 0)
  const fieldsBefore = await fieldsIn()
  if (!(await humanClick(page, byId(page, a.id), a.name))) return null
  const opened = await page.waitForFunction((u) => location.href !== u || [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].some((d) => d.getBoundingClientRect().width > 0), startUrl, { timeout: 3000 }).then(() => true, () => false)
  if (!opened && fileChoosers > choosersBefore) return { opener: a.name, fileChooser: true }
  if (!opened && (await fieldsIn()) > fieldsBefore) { log(`"${a.name}" added fields in the page (${fieldsBefore} → ${await fieldsIn()})`); return { opener: a.name, inline: true } }
  if (!opened) { await finding(page, 'dead-control', 'medium', `${where}: "${a.name}" did nothing visible`); return null }
  if (page.url() !== startUrl) return { navigated: page.url() }
  await animationsDone(page)
  await page.evaluate(() => { const ds = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter((d) => d.getBoundingClientRect().width > 0); document.querySelectorAll('[data-qa-dialog]').forEach((d) => d.removeAttribute('data-qa-dialog')); ds.at(-1)?.setAttribute('data-qa-dialog', '') })
  const title = await page.locator('[data-qa-dialog]').evaluate((d) => (d.getAttribute('aria-label') || d.querySelector('h1,h2,h3')?.textContent || '').trim()).catch(() => '')
  const dWhere = `${where} › dialog "${title || a.name}"`
  if (title && formsSeen.has(`${where}|${title}`)) { // a second button that opens the same form
    log(`"${a.name}" opens "${title}" again — already checked on this page`)
    await closeAndCheck(page, '[data-qa-dialog]', `the "${title}" dialog`)
    return { opener: a.name, title, sameAsEarlier: true }
  }
  formsSeen.add(`${where}|${title}`)
  await rectCheck(page, '[data-qa-dialog]', dWhere, { sidewaysOnly: true })
  ctx.screen = [...path, `Dialog: ${title || a.name}`].join(' › ')
  const seen = await pass(page, '[data-qa-dialog]')
  await report(page, seen, dWhere)
  const all = [...seen.values()]
  const fields = all.filter((s) => /^(input|select|textarea|combobox|switch|checkbox|radio)$/.test(s.role))
  const buttons = all.filter((s) => s.role === 'button')
  const unreachable = buttons.filter((b) => PRIMARY.test(b.name) && !b.everFully)
  if (unreachable.length) await finding(page, 'dialog-action-unreachable', 'high', `${dWhere}: ${unreachable.map((b) => `"${b.name}"`).join(', ')} can't be scrolled fully into view`)
  log(`form "${title || a.name}": ${fields.length} field(s): ${fields.map((f) => f.name || `(unnamed ${f.role})`).join(' | ')}`)
  const emptySubmit = fields.length ? await probeEmptySubmit(page, '[data-qa-dialog]', dWhere) : 'no fields'
  if (await page.locator('[data-qa-dialog]').isVisible().catch(() => false)) {
    const cancel = page.locator('[data-qa-dialog]').getByRole('button', { name: /^(cancel|close|not now|discard)$/i }).last()
    const how = (await cancel.count()) ? async () => { await humanClick(page, cancel, `Cancel (${title || a.name})`) } : null
    await closeAndCheck(page, '[data-qa-dialog]', `the "${title || a.name}" dialog`, how)
  }
  ctx.screen = path.join(' › ')
  return { opener: a.name, title, fields: fields.map((f) => f.name || `(unnamed ${f.role})`), buttons: buttons.map((b) => b.name + (b.disabled ? ' (disabled)' : '')), emptySubmit }
}

/* ------------------------------------------------------------------ one page, one pass */
const map = { role: ROLE, startedAt: new Date().toISOString(), screens: [], blockedWrites: [] }
const seenRoutes = new Set()
const sidebarRoutes = new Set()

/**
 * Visit the page the browser is on: one top-to-bottom pass that handles each control where it appears,
 * then its tabs / sections / detail pages in order. `kind` = 'landing' | 'page' | 'tab'.
 */
async function visit(page, path, depth, kind = 'page') {
  if (map.screens.length >= MAX_SCREENS) return
  await settle(page)
  const where = path.join(' › ')
  ctx.screen = where
  const route = routeOf(page.url())
  seenRoutes.add(route)
  const heading = await page.locator('main h1, h1').first().innerText().catch(() => '')
  log(`━━ ${where}  (${route})  "${heading.trim()}"`)
  const shot = `screens/${String(map.screens.length + 1).padStart(3, '0')}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'}.png`
  await resetScroll(page)
  await page.screenshot({ path: RUN_DIR + shot }).catch(() => {})
  const screen = { path, url: page.url(), route, heading: heading.trim(), shot, menus: [], selects: [], forms: [], disabledActions: [], queued: [] }
  map.screens.push(screen)

  const handled = new Set()
  const queue = []
  const used = { menus: 0, selects: 0, forms: 0, links: 0 }
  const origin = page.url()

  // handle whatever just came into view, in reading order; never scroll back for a control
  const onStop = async () => {
    const inView = (await page.evaluate(actionsExpr(kind === 'landing' ? 'body' : 'main')).catch(() => []))
      .filter((a) => a.inView).sort((x, y) => x.top - y.top || x.left - y.left)
    for (const a of inView) {
      if (a.disabled && a.name && !handled.has(`disabled:${a.name}`)) { handled.add(`disabled:${a.name}`); screen.disabledActions.push({ name: a.name, why: a.title }) }
      const k = classify(a, origin)
      if (!k) continue
      const key = k === 'link' ? `link:${routeOf(new URL(a.href, origin).href)}` : `${k}:${norm(a.name)}`
      if (handled.has(key)) continue
      handled.add(key)
      if (k === 'section' && START) continue // in hub mode every section is one of the hub's own cards
      if (k === 'tab' || k === 'section') { if (kind !== 'tab') queue.push({ k, a }); continue }
      if (k === 'link') {
        const r = routeOf(new URL(a.href, origin).href)
        if (kind === 'page' && used.links < LIMITS.links && !seenRoutes.has(r) && !sidebarRoutes.has(r)) { used.links += 1; queue.push({ k, a }) }
        continue
      }
      const k2 = `${k}s`
      if (used[k2] >= LIMITS[k2]) continue
      used[k2] += 1
      const fresh = await resolve(page, a)
      if (!fresh) continue
      if (k === 'menu') { const m = await exploreMenu(page, fresh, where); if (m) screen.menus.push(m) }
      if (k === 'select') { const s = await exploreSelect(page, fresh, where); if (s) screen.selects.push(s) }
      if (k === 'form') {
        const f = await exploreForm(page, fresh, where, path)
        if (f?.navigated) {
          // the button opened its own page: look at it now (one hop, like a person), then come back
          if (kind === 'page' && !seenRoutes.has(routeOf(f.navigated))) await visit(page, [...path, `Button: ${a.name}`], depth + 1)
          await page.goBack(); await settle(page); ctx.screen = where
        }
        else if (f) screen.forms.push(f)
      }
    }
  }

  const seen = await pass(page, kind === 'landing' ? 'body' : 'main', onStop)
  screen.audit = await report(page, seen, where)
  if (/\/new$/.test(route)) screen.emptySubmit = await probeEmptySubmit(page, 'main', where)
  await flushSignals(page)
  screen.queued = queue.map((q) => `${q.k}: ${q.a?.name ?? q.name}`)
  if (depth >= 2 || kind !== 'page') return

  // then, in order: tabs, sections, pages opened by a button, detail pages
  let left = false // once we leave this page's own view, only same-level things still make sense
  for (const q of queue) {
    if (map.screens.length >= MAX_SCREENS) break
    if (q.k === 'tab') {
      const t = await resolve(page, q.a); if (!t) continue
      if (await humanClick(page, byId(page, t.id), `tab ${t.name}`)) await visit(page, [...path, `Tab: ${t.name}`], depth + 1, 'tab')
    } else if (q.k === 'section') {
      const href = new URL(q.a.href, origin).href
      if (seenRoutes.has(routeOf(href))) continue
      const link = page.locator('main nav').getByRole('link', { name: q.a.name, exact: true }).first()
      if (await humanClick(page, link, `section ${q.a.name}`)) { left = true; await visit(page, [...path, `Section: ${q.a.name}`], depth + 1) }
    } else if (q.k === 'link' && !left) {
      const l = await resolve(page, q.a); if (!l) continue
      if (!(await humanClick(page, byId(page, l.id), `link ${l.name}`))) continue
      await settle(page)
      if (routeOf(page.url()) !== route) { await visit(page, [...path, `Link: ${l.name || routeOf(page.url())}`], depth + 1); await page.goBack(); await settle(page) }
    }
  }
}

/** Close any dialog left open (by the app or by a probe) so it can't cover the next click. */
async function closeOverlays(page) {
  for (let i = 0; i < 3; i += 1) {
    const open = page.locator('[role=alertdialog]:visible, [role=dialog]:visible').last()
    if (!(await open.count())) return
    const cancel = open.getByRole('button', { name: /^(cancel|close|no|not now|discard|keep editing|back)$/i }).last()
    if (await cancel.count()) await cancel.click({ timeout: 2000 }).catch(() => {})
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

/* ------------------------------------------------------------------ main */
const session = await openSession(sessionOptions(project, { visible: VISIBLE }))
const page = await openAs(session, project, ROLE)
if (!page) throw new Error(`${ROLE} could not sign in`)
if (PHONE) { await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await settle(page); log('phone size: 390×844') }
map.viewport = page.viewportSize()
page.on('filechooser', (fc) => { fileChoosers += 1; log(`file chooser opened (${fc.isMultiple() ? 'multiple' : 'single'}) — left unanswered`) })
page.on('dialog', (d) => { log(`browser dialog "${d.message()}" — dismissed`); d.dismiss().catch(() => {}) })
ctx.strict = false
ctx.quietStyle = true // contrast/size is reported once per page by the pass, not on every click
ctx.role = ROLE

// Hard read-only guarantee: whatever gets clicked, no write reaches the app. Each blocked write is
// logged with the step that caused it (so the map shows which buttons save immediately).
const ALLOW_WRITE = new RegExp((project.profile.safety?.allowWrite ?? []).join('|') || '^$')
await page.route((url) => ORIGINS.includes(url.origin), (route) => {
  const req = route.request()
  const p = new URL(req.url()).pathname
  if (/^(GET|HEAD|OPTIONS)$/.test(req.method()) || ALLOW_WRITE.test(p)) return route.continue()
  map.blockedWrites.push({ method: req.method(), path: p, screen: ctx.screen, step: ctx.step })
  log(`🛡 blocked a write: ${req.method()} ${p} (during "${ctx.step}")`)
  return route.abort('blockedbyclient')
})
const started = Date.now()

const navSel = `${who.nav ?? who.app.nav ?? 'nav'}:visible`
const nav = () => page.locator(navSel).first()
const main = () => page.getByRole('main')
/** On a phone the sidebar lives behind ☰: open it the way a person would. */
async function openMenu() {
  if (!PHONE || (await nav().count())) return true
  const burger = page.getByRole('button', { name: /open navigation menu|open menu|menu/i }).first()
  if (!(await burger.count())) { await finding(page, 'no-phone-navigation', 'high', 'At phone width the sidebar is gone and there is no menu button to reach the other pages'); return false }
  if (!(await humanClick(page, burger, '☰ Open navigation menu'))) return false
  return nav().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, async () => { await finding(page, 'dead-control', 'high', '☰ opened no navigation'); return false })
}

const hasNav = PHONE || (await page.locator(navSel).first().locator('a[href], button').count().catch(() => 0)) > 0
if (!hasNav && !START) {
  log('no navigation found — crawling the landing page only (set nav in profile.json if this is wrong)')
  await visit(page, ['Landing'], 1)
} else if (START) {
  // a hub page of screen cards (e.g. a set of books): open each card in order, come back with Back
  const hub = who.app.baseUrl + START
  await page.goto(hub) // entry point, like opening a bookmark
  await settle(page)
  await visit(page, ['Hub'], 0, 'landing')
  const cards = await main().getByRole('link').evaluateAll((els, start) => {
    const seen = new Set()
    return els.map((e) => ({ href: new URL(e.getAttribute('href') || '', location.href).pathname, name: (e.innerText || e.getAttribute('aria-label') || '').split('\n')[0].trim() }))
      .filter((l) => l.href.startsWith(start + '/') && l.name && !seen.has(l.href) && seen.add(l.href))
  }, START)
  for (const l of cards) sidebarRoutes.add(routeOf(new URL(l.href, hub).href))
  map.sidebar = cards.map((c) => c.name)
  log(`hub ${START}: ${cards.length} screens — ${map.sidebar.join(' | ')}`)
  for (const c of cards) {
    if (map.screens.length >= MAX_SCREENS) { log(`screen budget (${MAX_SCREENS}) reached`); break }
    if (ONLY && !ONLY.test(c.name)) continue
    for (let i = 0; i < 4 && routeOf(page.url()) !== routeOf(hub); i += 1) { await page.goBack().catch(() => {}); await settle(page) }
    if (routeOf(page.url()) !== routeOf(hub)) { await page.goto(hub); await settle(page) }
    ctx.screen = `Hub: ${c.name}`
    if (!(await humanClick(page, main().locator(`a[href="${c.href}"]`).first(), `card ${c.name}`))) continue
    await visit(page, [`Hub: ${c.name}`], 1)
  }
} else {
  await openMenu()
  // nav items are links in most apps, buttons in single-page apps whose screens share one URL
  const sidebar = (await nav().locator('a[href], button').evaluateAll((els) => els.map((e) => ({ name: (e.getAttribute('aria-label') || e.innerText).replace(/\s+/g, ' ').trim(), href: e.getAttribute('href'), tag: e.tagName.toLowerCase(), popup: e.getAttribute('aria-haspopup'), expanded: e.getAttribute('aria-expanded') }))).catch(() => []))
    .filter((l) => l.name && (l.href || l.tag === 'button') && !DANGER.test(l.name) && !l.popup && l.expanded === null)
  for (const l of sidebar) if (l.href) sidebarRoutes.add(routeOf(new URL(l.href, page.url()).href))
  map.sidebar = sidebar.map((l) => l.name)
  log(`${ROLE} ${PHONE ? '☰ menu' : 'sidebar'}: ${map.sidebar.join(' | ')}`)
  if (PHONE) {
    await page.keyboard.press('Escape')
    const close = page.getByRole('button', { name: /close navigation menu/i })
    if (await close.isVisible().catch(() => false)) {
      await finding(page, 'a11y-escape', 'medium', 'The ☰ menu does not close with Escape (no dialog role, no key handler) — keyboard and screen-reader users are stuck with it open')
      await humanClick(page, close, 'Close navigation menu')
    }
  }

  await visit(page, ['Landing'], 0, 'landing')
  for (const item of sidebar) {
    if (map.screens.length >= MAX_SCREENS) { log(`screen budget (${MAX_SCREENS}) reached`); break }
    if (ONLY && !ONLY.test(item.name)) continue
    if (item.href && seenRoutes.has(routeOf(new URL(item.href, page.url()).href))) continue
    ctx.screen = `${PHONE ? '☰' : 'Sidebar'}: ${item.name}`
    await closeOverlays(page)
    if (!(await openMenu())) break
    if (!(await humanClick(page, nav().getByRole(item.tag === 'a' ? 'link' : 'button', { name: item.name, exact: true }).first(), `${PHONE ? '☰' : 'sidebar'} ${item.name}`))) continue
    if (PHONE) {
      await settle(page)
      const stillOpen = page.getByRole('button', { name: /close navigation menu/i })
      if (await stillOpen.isVisible().catch(() => false)) {
        await finding(page, 'drawer-stays-open', 'medium', `After choosing "${item.name}" the ☰ menu stays open over the page`)
        await humanClick(page, stillOpen, 'Close navigation menu')
      }
    }
    await visit(page, [`${PHONE ? '☰' : 'Sidebar'}: ${item.name}`], 1)
  }
}
if (PHONE) await page.setViewportSize(project.profile.browser?.viewport ?? DEFAULT_VIEWPORT)
map.seconds = Math.round((Date.now() - started) / 1000)
saveJson('map.json', map)
const counts = {}
for (const line of (existsSync(`${RUN_DIR}findings.jsonl`) ? readFileSync(`${RUN_DIR}findings.jsonl`, 'utf8') : '').trim().split('\n').filter(Boolean)) { const f = JSON.parse(line); counts[f.kind] = (counts[f.kind] ?? 0) + 1 }
console.log(`\n✔ crawl ${ROLE}: ${map.screens.length} screens in ${map.seconds}s, ${map.blockedWrites.length} write(s) blocked → ${RUN_DIR}`)
console.log('findings by kind:', counts)
writeSummary(RUN_DIR, { title: `crawl ${ROLE}${PHONE ? ' (phone)' : ''}`, map })
await persistSession(session, project, ROLE)
await session.close()
