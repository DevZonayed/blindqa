/**
 * Human-like browser driving + "can a person actually see/use this?" checks.
 * Implements the three fixes from bench/jev/TODO.md:
 *   1. openers / menus / row-scoped actions are first-class (see crawler.mjs)
 *   2. canSee(): visible to a PERSON — in viewport, not covered, not clipped, no invisible ancestor,
 *      readable contrast, sensible size
 *   3. scrollToFind(): mouse-wheel scrolling in steps, re-checking after each step, so scroll-locked
 *      pages and lazy content are caught
 */
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { robotCursorInit, glideTo, pressFx, takeHumanMoves } from './cursor.mjs'

/** Where this run writes findings, trace and screenshots. Set with useRunDir() before anything runs. */
export let RUN_DIR = process.env.BLINDQA_RUN_DIR ?? `${tmpdir()}/blindqa-run-${process.pid}/`
mkdirSync(`${RUN_DIR}shots`, { recursive: true })
export function useRunDir(dir) {
  RUN_DIR = dir.endsWith('/') ? dir : dir + '/'
  mkdirSync(`${RUN_DIR}shots`, { recursive: true })
  return RUN_DIR
}

/** Origins of the app under test: only their 4xx/5xx responses become findings. Empty = any localhost. */
export const watch = { origins: [] }

/** Optional hooks, e.g. shadow mode asks Jev which control it would pick before every click. */
export const hooks = { beforeClick: null }

export const VISIBLE = !process.argv.includes('--headless')
const PACE = VISIBLE ? Number(process.env.QA_PACE ?? 1) : 0 // multiplier for human pauses

/* ------------------------------------------------------------------ findings */
let findingSeq = 0
export const findings = []
export const ctx = { portal: '', role: '', screen: '', step: '', strict: false }

export async function finding(page, kind, severity, detail, extra = {}) {
  const id = `F${String(++findingSeq).padStart(4, '0')}`
  if (page) humanMovesThisStep += await takeHumanMoves(page)
  if (humanMovesThisStep) extra = { ...extra, humanInputDuringStep: humanMovesThisStep }
  let shot = null
  if (page && !extra.noShot) {
    shot = `shots/${id}-${kind}.png`
    await page.screenshot({ path: RUN_DIR + shot }).catch(() => { shot = null })
  }
  const f = { id, kind, severity, detail, ...ctx, url: page ? page.url() : '', shot, at: new Date().toISOString(), ...extra }
  delete f.noShot
  findings.push(f)
  appendFileSync(`${RUN_DIR}findings.jsonl`, JSON.stringify(f) + '\n')
  console.log(`   ⚑ ${severity.toUpperCase().padEnd(6)} ${kind}: ${detail}`)
  return f
}

export function log(line) {
  appendFileSync(`${RUN_DIR}trace.log`, `${new Date().toISOString()} [${ctx.portal}/${ctx.role}] ${line}\n`)
  console.log(`  ${line}`)
}

/* ------------------------------------------------------------- page wiring */
const IGNORED_CONSOLE = [/Download the React DevTools/i, /\[Fast Refresh\]/i, /ERR_BLOCKED_BY_CLIENT/] // the last: writes the crawler blocked on purpose

/* -------------------------------------------- a person's mouse on the robot's window */
let humanMovesThisStep = 0
/** Start a step: forget mouse movement from before it. */
async function beginStep(page, step) {
  ctx.step = step
  await takeHumanMoves(page)
  humanMovesThisStep = 0
}
/** End a step: warn if someone moved their real mouse over the window while it ran. */
async function endStep(page) {
  humanMovesThisStep += await takeHumanMoves(page)
  if (humanMovesThisStep) log(`⚠ real mouse moved over the window during "${ctx.step}" (${humanMovesThisStep} events) — hover state may have been disturbed`)
}

export async function preparePage(page) {
  if (VISIBLE) await page.addInitScript(robotCursorInit)
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const text = m.text()
    if (IGNORED_CONSOLE.some((r) => r.test(text))) return
    pending.push({ kind: 'console-error', severity: 'medium', detail: text.slice(0, 300) })
  })
  page.on('pageerror', (e) => pending.push({ kind: 'page-crash', severity: 'high', detail: String(e).slice(0, 300) }))
  page.on('response', (r) => {
    const s = r.status()
    const url = r.url()
    if (s < 400) return
    if (watch.origins.length ? !watch.origins.some((o) => url.startsWith(o)) : !/\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return
    if (expectedStatuses.some((x) => x.status === s && x.match.test(url))) return
    pending.push({
      kind: s >= 500 ? 'server-error' : 'http-' + s,
      severity: s >= 500 ? 'high' : s === 403 || s === 401 ? 'low' : 'medium',
      detail: `${r.request().method()} ${url.replace(/^https?:\/\/[^/]+/, '')} → ${s}`,
    })
  })
  return page
}

const pending = []
const expectedStatuses = []
/** Declare a response as expected (e.g. a deliberate 403 probe) so it isn't reported. */
export function expectStatus(status, match) { expectedStatuses.push({ status, match }) }

/** Drop buffered console/network problems (e.g. a page still polling while we switch who is signed in). */
export function discardSignals() { return pending.splice(0).length }

/** Turn buffered console/network problems into findings, attributed to the current step. */
export async function flushSignals(page) {
  const batch = pending.splice(0)
  const seen = new Set()
  for (const p of batch) {
    const key = p.kind + p.detail
    if (seen.has(key)) continue
    seen.add(key)
    await finding(page, p.kind, p.severity, p.detail, { noShot: true })
  }
  return batch.length
}

export const pause = (page, ms) => (PACE ? page.waitForTimeout(ms * PACE) : Promise.resolve())

/* --------------------------------------------------- wait for the page to settle */
export async function settle(page, { timeout = 8000 } = {}) {
  await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
  // no visible spinners / skeletons / aria-busy regions
  await page
    .waitForFunction(() => {
      const busy = [...document.querySelectorAll('[aria-busy="true"], [role="progressbar"], .animate-spin, .animate-pulse, [data-loading="true"]')]
      return !busy.some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
    }, null, { timeout })
    .catch(() => {})
  await dismissInterruptions(page)
}

/* ------------------------------------------------- interruptions a person would close */
export const interruptions = { tourClosed: 0 }
/** Close the onboarding tour (driver.js) if it is showing. Returns true when something was closed. */
export async function dismissInterruptions(page) {
  const pop = page.locator('.driver-popover')
  if (await pop.count() && await pop.isVisible().catch(() => false)) {
    const title = (await pop.locator('.driver-popover-title').innerText().catch(() => '')).replace(/\s+/g, ' ')
    log(`onboarding tour is showing ("${title}") — closing it like a person would`)
    const close = pop.getByRole('button', { name: 'Close' })
    const box = await close.boundingBox().catch(() => null)
    if (box && VISIBLE) { await glideTo(page, box.x + box.width / 2, box.y + box.height / 2, { steps: 14 }); await pressFx(page) }
    await close.click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'))
    await page.waitForTimeout(400)
    interruptions.tourClosed += 1
    return true
  }
  return false
}

/* ------------------------------------------------------------ canSee (fix #2) */
/** Runs in the page. Returns { ok, reasons[], rect } for a single element. */
export function canSeeInPage(el) {
  const reasons = []
  const r = el.getBoundingClientRect()
  const vw = innerWidth
  const vh = innerHeight
  if (r.width < 1 || r.height < 1) return { ok: false, reasons: ['zero size'], rect: null }
  if (r.width < 8 || r.height < 8) reasons.push(`tiny (${Math.round(r.width)}×${Math.round(r.height)}px)`)
  const inView = r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw
  if (!inView) reasons.push('outside viewport')

  // invisible through any ancestor
  let opacity = 1
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = getComputedStyle(n)
    opacity *= Number(s.opacity)
    if (s.visibility === 'hidden' || s.visibility === 'collapse') { reasons.push('visibility hidden'); break }
    if (s.display === 'none') { reasons.push('display none'); break }
  }
  if (opacity < 0.15) reasons.push(`effectively transparent (opacity ${opacity.toFixed(2)})`)

  // clipped by an overflow ancestor
  let visible = { top: r.top, left: r.left, bottom: r.bottom, right: r.right }
  for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (/(hidden|clip|auto|scroll)/.test(s.overflow + s.overflowX + s.overflowY)) {
      const p = n.getBoundingClientRect()
      visible = { top: Math.max(visible.top, p.top), left: Math.max(visible.left, p.left), bottom: Math.min(visible.bottom, p.bottom), right: Math.min(visible.right, p.right) }
    }
  }
  const vArea = Math.max(0, visible.right - visible.left) * Math.max(0, visible.bottom - visible.top)
  if (inView && vArea < r.width * r.height * 0.5) reasons.push(`clipped by a container (${Math.round((100 * vArea) / (r.width * r.height))}% showing)`)

  // covered: hit-test the centre of the visible part (our cursor/HUD are pointer-events:none)
  if (inView && vArea > 0) {
    const cx = Math.min(Math.max((visible.left + visible.right) / 2, 1), vw - 1)
    const cy = Math.min(Math.max((visible.top + visible.bottom) / 2, 1), vh - 1)
    const top = document.elementFromPoint(cx, cy)
    if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el.htmlFor && top.id === el.htmlFor)) {
      const label = (top.getAttribute('aria-label') || top.textContent || top.tagName).replace(/\s+/g, ' ').trim().slice(0, 50)
      const cls = typeof top.className === 'string' ? top.className.split(' ').slice(0, 2).join('.') : ''
      reasons.push(`covered by <${top.tagName.toLowerCase()}${cls ? '.' + cls : ''}> "${label}"`)
    }
  }

  // contrast of the text a person actually reads: the colour of the element holding the first visible
  // text node vs the first opaque background behind THAT element (not the control's own colour —
  // e.g. white initials on an avatar inside a dark-text button). Checkbox/radio "values" aren't text.
  const textInput = /^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|file|range|color|button|submit|reset|image|hidden)$/i.test(el.type || '')
  let holder = null
  let text = ''
  if (textInput) { text = (el.value || '').trim(); holder = el }
  else if (!/^(INPUT|SELECT)$/.test(el.tagName)) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement
        if (!n.textContent.trim() || !p) return NodeFilter.FILTER_SKIP
        const pr = p.getBoundingClientRect()
        return pr.width > 1 && pr.height > 1 && getComputedStyle(p).visibility !== 'hidden' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      },
    })
    const tn = walker.nextNode()
    if (tn) { text = tn.textContent.trim(); holder = tn.parentElement }
  }
  if (text && holder) {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number)
    const lum = ([R, G, B]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(R) + 0.7152 * f(G) + 0.0722 * f(B)
    }
    const fg = parse(getComputedStyle(holder).color)
    let bg = null
    for (let n = holder; n && n.nodeType === 1; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c.length === 3 || (c.length === 4 && c[3] > 0.6)) { bg = c; break }
      if (getComputedStyle(n).backgroundImage !== 'none') { bg = null; break } // gradients/images: can't judge
    }
    if (!bg && holder.ownerDocument) bg = [255, 255, 255]
    if (fg.length >= 3 && bg && (fg[3] === undefined || fg[3] > 0.3)) {
      const L1 = lum(fg.slice(0, 3))
      const L2 = lum(bg.slice(0, 3))
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const large = parseFloat(getComputedStyle(holder).fontSize) >= 18.6
      if (ratio < (large ? 3 : 4.5) && !el.disabled && el.getAttribute('aria-disabled') !== 'true') {
        reasons.push(`low contrast ${ratio.toFixed(2)}:1`)
      }
    }
  }
  const blocking = reasons.filter((x) => !/^low contrast|^tiny/.test(x))
  return { ok: blocking.length === 0, reasons, rect: { x: r.x, y: r.y, w: r.width, h: r.height } }
}

/** Wait for CSS transitions/animations (dialog fade-ins, slide-overs) to finish. */
export async function animationsDone(page, timeout = 1500) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming?.().iterations === Infinity), null, { timeout }).catch(() => {})
}

/** Judge visibility only once the UI is at rest; re-check once so transient states aren't reported. */
export async function canSee(locator) {
  const check = () => locator.evaluate(canSeeInPage).catch((e) => ({ ok: false, reasons: [String(e).split('\n')[0].slice(0, 80)] }))
  const page = locator.page()
  await animationsDone(page)
  let r = await check()
  if (!r.ok) { await page.waitForTimeout(700); await animationsDone(page); r = await check() }
  return r
}

/** Thrown when a journey cannot continue; the journey runner records "blocked at …". */
export class StepFailed extends Error {}
const fail = (msg) => { if (ctx.strict) throw new StepFailed(msg); return false }

/* ----------------------------------------------------- scrollToFind (fix #3) */
async function scrollState(page) {
  return page.evaluate(() => {
    let sig = `${scrollX},${scrollY}`
    for (const el of document.querySelectorAll('*')) if (el.scrollTop || el.scrollLeft) sig += `|${el.scrollTop},${el.scrollLeft}`
    return sig
  })
}

/**
 * Runs in the page: where is `el` relative to the part of the screen it can actually show in
 * (viewport ∩ every clipping ancestor), and which container should the wheel go over to bring it in?
 * Only the axis that needs it is scrolled — vertical first, then horizontal (e.g. a sideways tab strip).
 */
function scrollPlan(el) {
  const er = el.getBoundingClientRect()
  let box = { top: 0, left: 0, bottom: innerHeight, right: innerWidth }
  for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (/(hidden|clip|auto|scroll)/.test(s.overflowX + s.overflowY)) {
      const p = n.getBoundingClientRect()
      box = { top: Math.max(box.top, p.top), left: Math.max(box.left, p.left), bottom: Math.min(box.bottom, p.bottom), right: Math.min(box.right, p.right) }
    }
  }
  const dy = er.top < box.top - 1 ? -1 : er.bottom > box.bottom + 1 ? 1 : 0
  const dx = dy ? 0 : er.left < box.left - 1 ? -1 : er.right > box.right + 1 ? 1 : 0
  const dist = Math.max(0, box.top - er.top) + Math.max(0, er.bottom - box.bottom) + Math.max(0, box.left - er.left) + Math.max(0, er.right - box.right)
  let sc = null
  for (let n = el.parentElement; (dy || dx) && n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const s = getComputedStyle(n)
    if (dy && /(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) { sc = n; break }
    if (dx && /(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) { sc = n; break }
  }
  const r = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  const vt = Math.max(r.top, 0); const vb = Math.min(r.bottom, innerHeight); const vl = Math.max(r.left, 0); const vr = Math.min(r.right, innerWidth)
  const clamp = (v, max) => Math.min(Math.max(v, 5), max - 5)
  return {
    inView: dist < 1 && er.width > 0 && er.height > 0,
    x: clamp((vl + vr) / 2, innerWidth), y: clamp((vt + vb) / 2, innerHeight),
    dy, dx, dist: Math.round(dist), span: dy ? vb - vt : vr - vl, sideways: !!dx,
  }
}

/**
 * Scroll like a person (mouse wheel, small steps, over the right container) until `locator` is in view.
 * Returns { found, reason }. Fails honestly when nothing moves, or when scrolling doesn't bring the
 * element any closer (cut off by a container that can't scroll) — never loops back and forth.
 */
export async function scrollToFind(page, locator, { maxSteps = 25, step = 450 } = {}) {
  let stuck = 0
  let noProgress = 0
  let best = Infinity
  let everSeen = false
  for (let i = 0; i <= maxSteps; i += 1) {
    const n = await locator.count()
    if (n > 0) everSeen = true
    const plan = n > 0
      ? await locator.first().evaluate(scrollPlan).catch(() => null)
      : await page.evaluate(() => { // not rendered yet: keep scrolling the main content down (lazy lists)
          const m = document.querySelector('main') || document.body
          const r = m.getBoundingClientRect()
          return { inView: false, x: Math.min(r.left + r.width / 2, innerWidth - 5), y: Math.min(Math.max(r.top + 200, 5), innerHeight - 5), dy: 1, dx: 0, dist: Infinity, span: innerHeight }
        })
    if (!plan) return { found: false, reason: 'element vanished' }
    if (plan.inView) return { found: true, steps: i }
    if (n > 0) {
      if (plan.dist < best - 1) { best = plan.dist; noProgress = 0 } else noProgress += 1
      if (noProgress >= 3) return { found: false, reason: `scrolling ${plan.sideways ? 'sideways ' : ''}doesn't bring it any closer — it is cut off by a container that can't be scrolled to it` }
    }
    const delta = Math.max(120, Math.min(step, plan.span * 0.8))
    const before = await scrollState(page)
    await glideTo(page, plan.x, plan.y, { steps: 8, visible: VISIBLE })
    await page.mouse.wheel(plan.dx * delta, plan.dy * delta)
    await page.waitForTimeout(VISIBLE ? 260 : 120)
    if ((await scrollState(page)) === before) {
      stuck += 1
      if (stuck >= 2) {
        return { found: false, notFound: !everSeen, reason: n > 0 ? `element is out of view and the ${plan.sideways ? 'strip/panel can\'t be scrolled sideways' : 'page/panel cannot be scrolled'} to it` : 'no such element anywhere on the page, even after scrolling to the end' }
      }
    } else stuck = 0
  }
  return { found: false, reason: `not in view after ${maxSteps} wheel steps` }
}

/** Body/html scroll locked while no dialog is open = a leaked modal scroll lock. */
export async function scrollLockLeak(page) {
  return page.evaluate(() => {
    const locked = [document.body, document.documentElement].some((n) => getComputedStyle(n).overflow === 'hidden' || getComputedStyle(n).overflowY === 'hidden')
    const open = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[aria-modal=true]')].some((d) => d.getBoundingClientRect().width > 0)
    return locked && !open && document.documentElement.scrollHeight > innerHeight + 4
  }).catch(() => false)
}

/** Shared recovery: report a leaked scroll lock once per screen, reload like a person, retry. */
const lockLeaksReported = new Set()
async function scrollWithRecovery(page, target, label) {
  let found = await scrollToFind(page, target)
  if (!found.found && !found.notFound && (await scrollLockLeak(page))) {
    const key = `${ctx.portal}|${ctx.screen}`
    if (!lockLeaksReported.has(key)) {
      lockLeaksReported.add(key)
      await finding(page, 'scroll-lock-leak', 'high', `Page can't be scrolled although no dialog is open (body overflow:hidden left behind) — "${label}" is below the fold and unreachable until reload`)
    } else log(`scroll lock leaked again on "${ctx.screen}" (already reported)`)
    log('recovering like a person: reload the page')
    await page.reload()
    await settle(page)
    found = await scrollToFind(page, target)
  }
  return found
}

/* ------------------------------------------------------- human actions */
async function moveTo(page, locator) {
  const box = await locator.boundingBox().catch(() => null)
  if (box && VISIBLE) {
    await glideTo(page, box.x + box.width / 2, box.y + box.height / 2)
    await pause(page, 120)
  }
  return box
}

/**
 * Runs in the page: what sits on top of `el` at the point a click lands (its box centre)?
 * null when nothing covers it. A toast/notification is flagged, with its close button's centre.
 */
export function coverAtClickPoint(el) {
  const r = el.getBoundingClientRect()
  if (r.width < 1 || r.height < 1 || !el.isConnected) return { isToast: false, isSticky: false, gone: true, text: 'the element is no longer rendered (it disappeared)', close: null, tag: 'none' }
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const top = document.elementFromPoint(x, y)
  if (!top || top === el || el.contains(top) || top.contains(el) || (el.htmlFor && top.id === el.htmlFor)) return null
  const toast = top.closest('[role=status],[role=alert],[data-sonner-toast],[class*=toast i],[class*=snackbar i]')
  const host = toast ?? top
  const text = (host.innerText || host.getAttribute('aria-label') || host.tagName).replace(/\s+/g, ' ').trim().slice(0, 60)
  let close = null
  if (toast) {
    const btn = [...toast.querySelectorAll('button,[role=button]')].find((b) => /dismiss|close|×|✕/i.test(b.getAttribute('aria-label') || b.textContent || ''))
    if (btn) { const b = btn.getBoundingClientRect(); close = { x: b.left + b.width / 2, y: b.top + b.height / 2 } }
  }
  let isSticky = false
  for (let n = top; n && n !== document.body; n = n.parentElement) if (/^(sticky|fixed)$/.test(getComputedStyle(n).position)) { isSticky = true; break }
  return { isToast: !!toast, isSticky: !toast && isSticky, text, close, tag: top.tagName.toLowerCase() }
}

/**
 * Before clicking: if a toast sits on the click point, report it and get rid of it the way a person
 * would (its ✕, else wait for it to fade). Returns null when the point is clear, else the cover.
 */
const toastCoversReported = new Set()
async function clearTransientCover(page, target, label) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const cover = await target.evaluate(coverAtClickPoint).catch(() => null)
    if (cover?.isSticky && attempt < 2) {
      // under a sticky header/footer: a person scrolls a little until it's clear — centre it
      const b = await target.boundingBox().catch(() => null)
      if (b) {
        log(`"${label}" is under a sticky "${cover.text.slice(0, 30)}" — scrolling it to the middle`)
        await page.mouse.wheel(0, Math.round(b.y + b.height / 2 - page.viewportSize().height / 2))
        await page.waitForTimeout(250)
        continue
      }
    }
    if (cover?.gone) return cover
    if (!cover || !cover.isToast) return cover
    const key = `${label}|${cover.text}`
    if (!toastCoversReported.has(key)) {
      toastCoversReported.add(key)
      await finding(page, 'covered-by-toast', 'medium', `"${label}" is covered by the toast "${cover.text}" — a person has to close it or wait for it to fade before they can click`)
    }
    if (cover.close) {
      log(`closing the toast "${cover.text}" like a person would`)
      await glideTo(page, cover.close.x, cover.close.y, { steps: 12, visible: VISIBLE })
      await pressFx(page)
      await page.mouse.click(cover.close.x, cover.close.y)
    } else {
      log(`waiting for the toast "${cover.text}" to go away`)
      await page.waitForTimeout(1200)
    }
    await page.waitForTimeout(350)
    await animationsDone(page)
  }
  return target.evaluate(coverAtClickPoint).catch(() => null)
}

/**
 * Click the target only if a person could click it right now. Playwright's own click would quietly
 * wait (up to `timeout`) for a covering element to disappear, which hides overlays from the report,
 * so we probe with a short trial click first and handle covers ourselves.
 */
async function clickLikeAPerson(page, target, label, timeout) {
  const cover = await clearTransientCover(page, target, label)
  if (cover) return `covered by <${cover.tag}> "${cover.text}"`
  await moveTo(page, target)
  const trial = await target.click({ trial: true, timeout: 1500 }).then(() => null, (e) => String(e))
  if (trial && /intercepts pointer events/.test(trial)) {
    const again = await clearTransientCover(page, target, label)
    if (again) return `covered by <${again.tag}> "${again.text}"`
    await moveTo(page, target)
  }
  if (VISIBLE) await pressFx(page)
  await target.click({ timeout })
  return null
}

/**
 * Click like a person: scroll to it by wheel, prove a human can see it, move the cursor, click.
 * Problems become findings. Returns true when the click happened.
 */
export async function humanClick(page, locator, label, { mustSee = true, timeout = 6000 } = {}) {
  await beginStep(page, `click ${label}`)
  const target = locator.first()
  if (hooks.beforeClick) await hooks.beforeClick(page, target, label).catch((e) => log(`shadow: ${String(e.message ?? e).slice(0, 120)}`))
  const found = await scrollWithRecovery(page, target, label)
  if (!found.found) {
    await finding(page, found.notFound ? 'element-not-found' : 'unreachable-by-scrolling', found.notFound ? 'medium' : 'high', `"${label}": ${found.reason}`)
    return fail(label)
  }
  await clearTransientCover(page, target, label)
  const seen = await canSee(target)
  if (!seen.ok && mustSee) {
    await finding(page, 'not-humanly-visible', 'high', `"${label}" can't be used by a person: ${seen.reasons.join('; ')}`)
    return fail(label)
  }
  if (seen.reasons.length && !ctx.quietStyle) await finding(page, 'visual-quality', 'low', `"${label}": ${seen.reasons.join('; ')}`)
  try {
    const blocked = await clickLikeAPerson(page, target, label, timeout)
    if (blocked) {
      await finding(page, 'not-humanly-visible', 'high', `"${label}" can't be clicked by a person: ${blocked}`)
      return fail(label)
    }
  } catch (e) {
    const msg = String(e).split('\n').find((l) => /intercepts|not visible|not enabled|detached|Timeout/.test(l)) ?? String(e).split('\n')[0]
    await finding(page, 'click-failed', 'high', `"${label}": ${msg.trim().slice(0, 160)}`)
    return fail(label)
  }
  await endStep(page)
  await pause(page, 250)
  return true
}

/** Type like a person into a field found by label/role. */
export async function humanFill(page, locator, value, label) {
  await beginStep(page, `type into ${label}`)
  const target = locator.first()
  const found = await scrollWithRecovery(page, target, label)
  if (!found.found) { await finding(page, found.notFound ? 'element-not-found' : 'unreachable-by-scrolling', found.notFound ? 'medium' : 'high', `field "${label}": ${found.reason}`); return fail(label) }
  await clearTransientCover(page, target, label)
  const seen = await canSee(target)
  if (!seen.ok) { await finding(page, 'not-humanly-visible', 'high', `field "${label}": ${seen.reasons.join('; ')}`); return fail(label) }
  try {
    const blocked = await clickLikeAPerson(page, target, label, 4000)
    if (blocked) { await finding(page, 'not-humanly-visible', 'high', `field "${label}" can't be clicked by a person: ${blocked}`); return fail(label) }
    await target.fill('')
    if (VISIBLE && String(value).length < 40) await target.pressSequentially(String(value), { delay: 18 })
    else await target.fill(String(value))
  } catch (e) {
    await finding(page, 'type-failed', 'high', `field "${label}": ${String(e).split('\n')[0].slice(0, 140)}`)
    return fail(label)
  }
  await endStep(page)
  return true
}

export function saveJson(name, data) { writeFileSync(RUN_DIR + name, JSON.stringify(data, null, 2)) }

/** Run a journey body: strict mode on, a failing step ends the journey as "blocked at …". */
export async function runJourney(name, body, { onExit } = {}) {
  ctx.strict = true
  const started = Date.now()
  let status = 'passed'
  try {
    await body()
  } catch (e) {
    status = e instanceof StepFailed ? `blocked at: ${e.message}` : `crashed: ${String(e).split('\n')[0].slice(0, 200)}`
    console.log(`\n✖ ${name} ${status}`)
    appendFileSync(`${RUN_DIR}findings.jsonl`, JSON.stringify({ id: 'JOURNEY', kind: 'journey-' + (e instanceof StepFailed ? 'blocked' : 'crashed'), severity: 'high', detail: `${name}: ${status}`, ...ctx, at: new Date().toISOString() }) + '\n')
  } finally {
    if (onExit) await onExit().catch(() => {})
  }
  const summary = { journey: name, status, seconds: Math.round((Date.now() - started) / 1000), findings: findings.length }
  appendFileSync(`${RUN_DIR}journeys.jsonl`, JSON.stringify(summary) + '\n')
  console.log(`\n${status === 'passed' ? '✔' : '✖'} ${name}: ${status} — ${findings.length} finding(s) in ${summary.seconds}s → ${RUN_DIR}`)
  return summary
}

/** Pick a date in the app's calendar popover ("Choose date" dialog with gridcells named "02 Oct 2026"). */
export async function pickDate(page, date, label = 'date') {
  const name = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const picker = page.getByRole('dialog', { name: 'Choose date' }).last()
  await picker.waitFor({ timeout: 4000 })
  // far away (a date of birth): use the Year and Month lists, like a person would, instead of 400 arrow clicks
  const yearSel = picker.getByLabel('Year', { exact: true })
  if (await yearSel.count()) {
    const shown = (await picker.innerText()).match(/([A-Z][a-z]+) (\d{4})/)
    const months = shown ? Math.abs((date.getFullYear() - Number(shown[2])) * 12 + date.getMonth() - new Date(`${shown[1]} 1, ${shown[2]}`).getMonth()) : 99
    if (months > 2) {
      await humanClick(page, yearSel, `${label}: Year`)
      await yearSel.selectOption(String(date.getFullYear()))
      const monthSel = picker.getByLabel('Month', { exact: true })
      if (await monthSel.count()) { await humanClick(page, monthSel, `${label}: Month`); await monthSel.selectOption({ index: date.getMonth() }) }
      await page.waitForTimeout(200)
    }
  }
  for (let i = 0; i < 24; i += 1) {
    const cell = picker.getByRole('gridcell', { name, exact: true })
    if (await cell.count()) return humanClick(page, cell, `${label}: ${name}`)
    const shown = (await picker.innerText()).match(/([A-Z][a-z]+) (\d{4})/)
    const forward = !shown || new Date(`${shown[1]} 1, ${shown[2]}`) < date
    await humanClick(page, picker.getByRole('button', { name: forward ? 'Next month' : 'Previous month' }), forward ? 'Next month' : 'Previous month')
  }
  return humanClick(page, picker.getByRole('gridcell', { name, exact: true }), `${label}: ${name}`)
}

/** Texts of the toasts currently showing (design-system Toast: region "Notifications" > role=status). */
export async function toastTexts(page) {
  return page.locator('[role=region][aria-label=Notifications] [role=status]').allInnerTexts().catch(() => [])
}

/** Wait for a toast matching `re`; returns its text or null. */
export async function waitToast(page, re = /./, timeout = 5000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const hit = (await toastTexts(page)).findLast((t) => re.test(t)) // newest toast is last
    if (hit) { log(`toast: "${hit.trim()}"`); return hit.trim() }
    await page.waitForTimeout(150)
  }
  return null
}

/** After a save/confirm, a dialog should close; report it if it doesn't within `timeout`. */
export async function expectClosed(page, dialog, label, timeout = 6000) {
  const closed = await dialog.waitFor({ state: 'hidden', timeout }).then(() => true, () => false)
  if (!closed) {
    const text = (await dialog.innerText().catch(() => '')).replace(/\s+/g, ' ')
    const msg = text.match(/[^.]*(required|invalid|must|error|failed|already|cannot|can't)[^.]*/i)?.[0]
    await finding(page, 'dialog-stuck-open', 'high', `${label}: dialog still open after submitting${msg ? ` — shows "${msg.trim().slice(0, 160)}"` : ''}`)
    return fail(label)
  }
  await animationsDone(page)
  return true
}

/** If a confirmation dialog popped up on top, read it and press its confirm button. Returns its text or null. */
export async function confirmIfAsked(page, confirmName = /confirm|create new version|publish|yes|continue|save|activate|ok/i, { timeout = 2500 } = {}) {
  const top = page.locator('[role=alertdialog], [role=dialog]').last()
  const appeared = await page.waitForFunction(() => document.querySelectorAll('[role=alertdialog], [role=dialog]').length > 0, null, { timeout }).then(() => true, () => false)
  if (!appeared) return null
  const title = (await top.getAttribute('aria-label').catch(() => null)) ?? (await top.locator('h1,h2,h3').first().innerText().catch(() => ''))
  const text = (await top.innerText().catch(() => '')).replace(/\s+/g, ' ')
  log(`confirmation shown: "${title}" — ${text.slice(0, 200)}`)
  await humanClick(page, top.getByRole('button', { name: confirmName }).last(), `confirm "${title}"`)
  await top.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {})
  return text
}
