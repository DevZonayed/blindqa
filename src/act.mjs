/**
 * Act mode: use every option a role has and record what each one actually does.
 *
 *   blindqa act --role R [--only "Purchase orders|Retailers"] [--max-actions 200] [--headless] [--run id]
 *
 * For every screen in the role's navigation:
 *   - Jev says what each control will do (open a form, change the view, save at once, delete, …)
 *   - forms are opened, filled with valid values for each field's kind, submitted (confirmations
 *     accepted) and judged: accepted / says what's missing / silently nothing / crashed …
 *   - menus are opened and each item is tried; tabs and filters are switched
 *   - things that save at once are done; destructive or irreversible actions only on records this
 *     run created (their names carry the tag), never on seeded data
 * Writes are real. Every effect goes to effects.jsonl (+ a screenshot); problems become findings.
 */
import { appendFileSync } from 'node:fs'
import { loadProject } from './project.mjs'
import { openSession, sessionOptions } from './browser/session.mjs'
import { openAs, persistSession } from './auth/login.mjs'
import { ctx, humanClick, humanFill, settle, flushSignals, finding, log, useRunDir, watch, VISIBLE, RUN_DIR } from './browser/human.mjs'
import { extractCandidates, digest } from './browser/extract.mjs'
import { engineFor, certainty } from './jev/engine.mjs'
import { Q } from './jev/questions.mjs'
import { writeSummary } from './summary.mjs'
import { inboxBefore, waitForCode, typeCode } from './auth/otp.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const ROLE = arg('role', 'ADMIN').toUpperCase()
const ONLY = arg('only', null) ? new RegExp(arg('only'), 'i') : null
const MAX_ACTIONS = Number(arg('max-actions', 250))
const project = loadProject(arg('project', undefined))
const who = project.role(ROLE)
const runId = arg('run', `act-${ROLE.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`)
useRunDir(project.runDir(runId))
watch.origins = [...new Set([...Object.values(project.profile.apps).map((a) => new URL(a.baseUrl).origin), ...(project.profile.api?.origins ?? []).map((o) => new URL(o).origin)])]
const jev = engineFor(project, RUN_DIR)
if (!jev.enabled) throw new Error('act mode needs Jev (TYPESAFE_API_KEY)')

const OTP = { ...(project.profile.otp ?? {}), ...(project.credentials.otp ?? {}) }
const STAMP = new Date().toISOString().slice(5, 16).replace(/[-:T]/g, '')
const TAG = `BQA${STAMP}`
// Never touched: anything that could lock the real users out or wipe the environment.
const NEVER = /\b(sign ?out|log ?out|delete (my )?account|close (my )?account|deactivate (my )?account|reset (all|everything|demo)|wipe|purge|disconnect|revoke all|change (my )?(phone|mobile|number|email)|update (phone|mobile|email)|security|two-?factor|2fa|authenticator|recovery codes?|regenerate|reset (password|authenticator|2fa)|sessions?|api keys?|webhooks?)\b/i
const actionsDone = { n: 0 }
const effects = []
const record = (e) => { effects.push(e); appendFileSync(RUN_DIR + 'effects.jsonl', JSON.stringify({ at: new Date().toISOString(), role: ROLE, ...e }) + '\n') }

/* ---------------------------------------------------------------- valid values per kind of field */
const rnd = (n) => String(Math.floor(Math.random() * 10 ** n)).padStart(n, '0')
const today = () => new Date().toISOString().slice(0, 10)
function valueFor(kind, c) {
  const label = `${c.name} ${c.placeholder}`.toLowerCase()
  if (/\bnid\b|national id|district|division|thana|upazila|licen[cs]e/.test(label)) kind = 'other'
  switch (kind) {
    case 'money': return '1500'
    case 'quantity': return '2'
    case 'percentage': return '5'
    case 'date': return today()
    case 'date_of_birth': return '1990-05-15'
    case 'email': return `bqa+${STAMP}${rnd(3)}@example.com`
    case 'phone': return `017${rnd(8)}`
    case 'postcode': return '1216'
    case 'url': return 'https://example.com'
    case 'name': return /shop|store|company|business|organi|trade/.test(label) ? `${TAG} Shop` : `${TAG} Tester`
    case 'free_text': return /address/.test(label) ? 'House 12, Road 5, Mirpur 10, Dhaka' : `${TAG} note`
    case 'vat_number': case 'company_number': case 'tax_reference': return `00${rnd(11)}`
    case 'account_number': return rnd(13)
    case 'search': case 'password': case 'code': return null
    default:
      if (/\bnid\b|national id/.test(label)) return `19${rnd(11)}`.slice(0, 13)
      if (/address/.test(label)) return 'House 12, Road 5, Mirpur 10, Dhaka'
      if (/city|district|division|area|thana|upazila/.test(label)) return 'Dhaka'
      if (/licen[cs]e/.test(label)) return `TRAD/DNCC/${rnd(6)}/2026`
      return `${TAG} ${(c.name || 'value').split(/\s+/)[0]}`.slice(0, 20)
  }
}

/* ---------------------------------------------------------------- helpers */
const overlaySel = '[role=alertdialog]:visible, [role=dialog]:visible'
async function closeOverlays(page) {
  for (let i = 0; i < 3; i += 1) {
    const open = page.locator(overlaySel).last()
    if (!(await open.count())) return
    const cancel = open.getByRole('button', { name: /^(cancel|close|no|not now|discard|keep editing|back|done)$/i }).last()
    if (await cancel.count()) await cancel.click({ timeout: 2000 }).catch(() => {})
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}
/** The control by its marker; if the page re-rendered it, by role and name. */
function locate(page, c) {
  const byMarker = page.locator(c.selector).first()
  return c.roleSelector ? byMarker.or(page.locator(c.roleSelector).first()).first() : byMarker
}

/** A focused search-as-you-type picker: try a few probes, pick the first suggestion. Returns its label or null. */
async function pickFromFocusedTypeahead(page) {
  for (const probe of ['te', 'a', 'SKU', '1', 'e', 'pr']) {
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await page.keyboard.type(probe, { delay: 70 })
    await page.waitForTimeout(1300)
    const opt = page.getByRole('option').first()
    if (await opt.isVisible().catch(() => false)) {
      const label = (await opt.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 60)
      await opt.click({ timeout: 3000 }).catch(() => {})
      await page.waitForTimeout(800)
      return label
    }
  }
  return null
}
async function toastText(page) {
  return page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert],[data-sonner-toast],.toast,[class*=toast i]')].map((t) => t.innerText.trim()).filter(Boolean).join(' / ').slice(0, 200)).catch(() => '')
}
async function apiErrors(page, sinceIdx) { return (page.__bqResponses ?? []).slice(sinceIdx).filter((r) => r.status >= 400) }

async function judge(page, before, kind, action, extra = {}) {
  const after = await digest(page, { maxChars: 1500 })
  const q = kind === 'submit' ? { outcome: Q.submitOutcome() } : { outcome: Q.actionOutcome() }
  const { answers } = await jev.ask({ action, screen_before: before, screen_after: after, ...extra }, q, { tag: `act.${kind}` })
  return { outcome: answers.outcome?.choice ?? 'unknown', certainty: Number(certainty(answers.outcome).toFixed(2)), after }
}

/* ---------------------------------------------------------------- forms */
async function fillForm(page, scopeSel) {
  const ex = await extractCandidates(page, { scope: scopeSel })
  const fields = ex.candidates.filter((c) => /^(textbox|searchbox|combobox|checkbox|radio|switch|date|spinbutton)$/.test(c.role) && !c.disabled)
  if (process.env.BLINDQA_DEBUG) log(`fill: ${fields.length} field(s): ${fields.map((c) => `${c.role}"${c.name}"=${c.value || ''}`).join(' | ')} (scope ok: ${!!(await page.locator(scopeSel).count())}, overlay ${ex.overlayRole})`)
  const filled = []
  const text = fields.filter((c) => /^(textbox|spinbutton|date)$/.test(c.role) && !c.value)
  const kinds = {}
  if (text.length) {
    const qs = Object.fromEntries(text.map((c) => [`f${c.index}`, Q.fieldType(c)]))
    const { answers } = await jev.ask({ form: (await digest(page, { maxChars: 900 })) }, qs, { tag: 'act.fieldType' })
    for (const c of text) kinds[c.index] = answers[`f${c.index}`]?.choice ?? 'other'
  }
  for (const c of fields) {
    const el = locate(page, c)
    try {
      if (c.role === 'combobox' && c.nativeSelect) {
        const opts = await el.evaluate((s) => [...s.options].filter((o) => o.value && !o.disabled).map((o) => o.value))
        if (opts.length && !c.value) { await el.selectOption(opts[0]); filled.push(`${c.name}=option 1`) }
      } else if (c.role === 'combobox') {
        if (c.value) continue
        await humanClick(page, el, c.name || 'choose')
        const opt = page.getByRole('option').first()
        if (await opt.count()) { await opt.click({ timeout: 3000 }); filled.push(`${c.name}=first option`) }
        else { const v = valueFor('other', c); await page.keyboard.type('a'); await page.waitForTimeout(600); const o2 = page.getByRole('option').first(); if (await o2.count()) { await o2.click(); filled.push(`${c.name}=suggestion`) } else { await page.keyboard.press('Escape'); filled.push(`${c.name}=(no options)`); void v } }
      } else if (c.role === 'checkbox' || c.role === 'switch') {
        if (c.required) { await humanClick(page, el, c.name); filled.push(`${c.name}=on`) }
      } else if (c.role === 'radio') {
        // first radio of each group only
        const group = await el.evaluate((r) => r.name || r.closest('[role=radiogroup]')?.getAttribute('aria-label') || '')
        if (!filled.some((f) => f.startsWith(`radio:${group}`))) { await humanClick(page, el, c.name); filled.push(`radio:${group}=${c.name}`) }
      } else {
        if (c.value) continue // already filled (by us in the first pass, or by the app)
        const kind = kinds[c.index] ?? 'other'
        if (kind === 'password') continue
        if (kind === 'code') {
          if (!fillForm.phone) continue
          const code = await waitForCode(OTP, fillForm.phone.number, fillForm.phone.before, { timeoutMs: 45000 })
          if (!code) { filled.push(`${c.name}=(no code arrived for ${fillForm.phone.number})`); await finding(page, 'otp-not-delivered', 'high', `"${c.name}": no one-time code arrived for ${fillForm.phone.number}`, { noShot: true }); continue }
          await typeCode(page, code)
          filled.push(`${c.name}=code from inbox`)
          continue
        }
        // search-as-you-type pickers ("Item code or name") get a probe and the first suggestion
        const typeahead = kind === 'search' || /code or name|search|find|pick|choose|add a /i.test(`${c.name} ${c.placeholder}`)
        const v = typeahead ? 'a' : valueFor(kind, c)
        if (v === null) continue
        if (!(await el.count())) continue // replaced since the screen was read (e.g. a picker that became a line)
        await humanFill(page, el, v, c.name || c.placeholder || 'field')
        if (kind === 'phone' && OTP.relay) fillForm.phone = { number: v, before: await inboxBefore(OTP, v) }
        await page.waitForTimeout(typeahead ? 1500 : 300)
        if (typeahead && !(await page.getByRole('option').first().isVisible().catch(() => false))) {
          // pickers often need more than one letter, or a code: try a few common probes
          for (const probe of ['te', 'SKU', '1', 'e', 'pr', 'ma']) {
            await el.fill('').catch(() => {})
            await page.keyboard.type(probe, { delay: 60 })
            await page.waitForTimeout(1200)
            if (await page.getByRole('option').first().isVisible().catch(() => false)) break
          }
        }
        const opt = page.getByRole('option').first()
        if (await opt.isVisible().catch(() => false)) {
          const label = (await opt.innerText().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 50)
          await opt.click({ timeout: 3000 }).catch(() => {})
          await page.waitForTimeout(700)
          filled.push(`${c.name || c.placeholder}=picked "${label}"`)
        } else filled.push(`${c.name || c.placeholder}=${v}`)
      }
    } catch (e) { filled.push(`${c.name}=!${String(e.message).slice(0, 60)}`) }
  }
  if (!fillForm.second) {
    fillForm.second = true
    const more = await fillForm(page, scopeSel).catch(() => [])
    fillForm.second = false
    return [...filled, ...more.filter((m) => !filled.includes(m))]
  }
  return filled
}

/** Fill and submit the form in `scopeSel`, accept a confirmation, judge the result. */
async function submitForm(page, scopeSel, label, where, { button = null, step = 1 } = {}) {
  const filled = await fillForm(page, scopeSel)
  const before = await digest(page, { maxChars: 1500 })
  const scope = page.locator(scopeSel).last()
  const btn = button ? scope.getByRole('button', { name: button, exact: true }).last() : scope.getByRole('button', { name: /^(save|create|add|submit|send|invite|continue|next|confirm|apply|done|record|place|raise|onboard|request|post|update)\b/i }).last()
  if (!(await btn.count())) { record({ screen: where, control: label, kind: 'form', outcome: 'no submit button', filled }); return null }
  const btnName = (await btn.innerText().catch(() => 'submit')).trim()
  const mark = page.__bqResponses.length
  await humanClick(page, btn, `${btnName} (${label})`)
  await page.waitForTimeout(800)
  // a confirmation is part of the flow here: accept it
  const confirm = page.locator('[role=alertdialog]:visible, [role=dialog]:visible').filter({ hasText: /\?/ }).last()
  let confirmed = null
  if (await confirm.count()) {
    confirmed = ((await confirm.innerText().catch(() => '')).split('\n')[0] || '').trim()
    const yes = confirm.getByRole('button', { name: /^(yes|confirm|submit|send|save|create|continue|ok|place|approve|post)\b/i }).last()
    if (await yes.count()) await humanClick(page, yes, `confirm "${confirmed.slice(0, 50)}"`)
  }
  await settle(page)
  const toast = await toastText(page)
  const errs = await apiErrors(page, mark)
  const j = await judge(page, before, 'submit', `${btnName} on "${label}"`, { values_entered: filled.slice(0, 20), toast })
  const e = { screen: where, control: label, kind: 'form', submit: btnName, confirmed, filled, toast, http: errs.map((r) => `${r.method} ${r.path} → ${r.status}`), outcome: j.outcome, certainty: j.certainty }
  e.shot = `shots/act-${String(effects.length + 1).padStart(3, '0')}.png`
  await page.screenshot({ path: RUN_DIR + e.shot }).catch(() => {})
  record(e)
  const sure = j.certainty >= 0.7
  if (errs.some((r) => r.status >= 500)) await finding(page, 'server-error-on-submit', 'high', `${where}: "${label}" → ${btnName} gave a server error (${e.http.join('; ')})`, { noShot: true })
  else if (sure && /^(silently_nothing|error_behind_dialog|crashed)$/.test(j.outcome)) await finding(page, `submit-${j.outcome.replace(/_/g, '-')}`, j.outcome === 'crashed' ? 'high' : 'medium', `${where}: filled "${label}" with valid values and pressed ${btnName} — ${j.outcome.replace(/_/g, ' ')}${errs.length ? ` (${e.http.join('; ')})` : ''}`, { noShot: true })
  else if (sure && j.outcome === 'unclear_error') await finding(page, 'unclear-error', 'medium', `${where}: "${label}" → ${btnName}: the error shown is technical or vague${toast ? ` ("${toast.slice(0, 120)}")` : ''}`, { noShot: true })
  else if (!sure) jev.escalate({ screen: where, control: label, question: 'submitOutcome', answer: j.outcome, certainty: j.certainty })
  log(`form "${label}" → ${j.outcome} (${j.certainty})${toast ? ` toast: ${toast.slice(0, 80)}` : ''}${errs.length ? ` http: ${e.http.join('; ')}` : ''}`)
  // a multi-step form: fill and continue the next step, up to 6 steps
  if (j.outcome === 'moved_on' && step < 6 && actionsDone.n < MAX_ACTIONS) {
    const next = page.locator(overlaySel).last()
    const sel = (await next.count()) ? '[data-bq-step]' : scopeSel
    if (await next.count()) await next.evaluate((d) => d.setAttribute('data-bq-step', ''))
    else if (!(await page.locator(scopeSel).count())) await page.locator('main').first().evaluate((d) => d.setAttribute('data-bq-form', ''))
    actionsDone.n += 1
    return submitForm(page, sel, `${label} (step ${step + 1})`, where, { step: step + 1 })
  }
  return e
}

/* ---------------------------------------------------------------- form screens */
const FINISH = /^(save( as)? draft|save|submit|create( account)?|place( order)?|send|record|request|post|onboard|raise|confirm|register|apply|continue|next|sign up)\b/i
const ADD_LINE = /^(\+\s*)?add (a )?(row|line|item|product|another)/i

/** A screen whose job is one form (not a list with a filter bar). */
async function isFormScreen(page) {
  const main = page.locator('main').first()
  const fields = await main.locator('input:not([type=hidden]):not([type=search]):not([type=date]):not([type=checkbox]), textarea, select, [role=combobox]').count()
  const rows = await main.locator('[role=row], tbody tr').count()
  const finishers = await main.getByRole('button', { name: FINISH }).count()
  return fields > 0 && finishers > 0 && rows <= 2
}

/** Fill and finish the form once per way of finishing it (e.g. "Save as draft", then "Submit"). */
async function formScreen(page, where, reopen) {
  const names = [...new Set((await page.locator('main').first().getByRole('button', { name: FINISH }).allInnerTexts()).map((t) => t.trim()).filter(Boolean))]
    .sort((a, b) => Number(!/draft/i.test(a)) - Number(!/draft/i.test(b)))
  log(`form screen "${where}": finishing buttons ${names.join(' | ')}`)
  for (const [i, name] of names.entries()) {
    if (actionsDone.n >= MAX_ACTIONS) return
    if (i > 0) { await reopen(); await screenReady(page) }
    await page.waitForTimeout(1500) // let the page finish hydrating before the first click
    const add = page.locator('main').first().getByRole('button', { name: ADD_LINE }).first()
    if (await add.count()) {
      const fieldsBefore = await page.locator('main input:not([type=hidden])').count()
      for (let t = 0; t < 2; t += 1) {
        await humanClick(page, add, (await add.innerText()).trim())
        await page.waitForTimeout(900)
        if ((await page.locator('main input:not([type=hidden])').count()) > fieldsBefore) {
          const focusedInput = await page.evaluate(() => document.activeElement?.tagName === 'INPUT' && document.activeElement.type !== 'checkbox')
          if (focusedInput) { const picked = await pickFromFocusedTypeahead(page); log(picked ? `new line: picked "${picked}"` : 'new line: the picker offered nothing for the probes') }
          break
        }
        if (t === 1) await finding(page, 'dead-control', 'medium', `${where}: "${(await add.innerText()).trim()}" added no line`, { noShot: true })
      }
    }
    await page.locator('main').first().evaluate((d) => d.setAttribute('data-bq-form', ''))
    actionsDone.n += 1
    await submitForm(page, '[data-bq-form]', `${where} → ${name}`, where, { button: name })
    await page.locator('[data-bq-form]').evaluate((d) => d.removeAttribute('data-bq-form')).catch(() => {})
    await closeOverlays(page)
  }
}

/* ---------------------------------------------------------------- one screen */
async function actOnScreen(page, where, navNames) {
  const seen = new Set()
  for (let round = 0; round < 80 && actionsDone.n < MAX_ACTIONS; round += 1) {
    await closeOverlays(page)
    const ex = await extractCandidates(page)
    const controls = ex.candidates.filter((c) => /^(button|link|tab|menuitem|switch|checkbox)$/.test(c.role) && c.name && !c.disabled
      && (c.inMain || ex.overlayPresent) && !navNames.has(c.name) && !seen.has(`${c.role}|${c.name}|${c.context}`) && !NEVER.test(c.name))
      .slice(0, 40)
    if (!controls.length) return
    const qs = {}
    for (const c of controls) { qs[`e${c.index}`] = Q.controlEffect(c); qs[`i${c.index}`] = Q.irreversible(c) }
    const { answers } = await jev.ask({ screen: where, text: await digest(page, { maxChars: 1200 }) }, qs, { tag: 'act.plan' })
    const order = { changes_view: 0, opens_menu: 1, opens_form: 2, navigates: 3, saves_immediately: 4, destructive: 5, downloads: 6, signs_out: 9, leaves_app: 9 }
    const plan = controls.map((c) => ({ c, effect: answers[`e${c.index}`]?.choice ?? 'navigates', irreversible: (answers[`i${c.index}`]?.noul ?? 0) >= 0.6 }))
      .sort((a, b) => order[a.effect] - order[b.effect])
    let acted = false
    let stale = false
    for (const { c, effect, irreversible } of plan) {
      if (actionsDone.n >= MAX_ACTIONS) return
      const key = `${c.role}|${c.name}|${c.context}`
      if (seen.has(key)) continue
      seen.add(key)
      const ours = (c.context ?? '').includes('BQA') || c.name.includes('BQA')
      if (effect === 'signs_out' || effect === 'leaves_app' || effect === 'downloads') { record({ screen: where, control: c.name, effect, outcome: 'not exercised' }); continue }
      if ((effect === 'destructive' || irreversible) && !ours && c.context) { record({ screen: where, control: c.name, row: c.context, effect, outcome: 'skipped: would change seeded data' }); continue }
      const el = locate(page, c)
      if (!(await el.count())) { seen.delete(key); stale = true; break } // the screen changed under the plan: re-read it
      actionsDone.n += 1
      const before = await digest(page, { maxChars: 1500 })
      const url0 = page.url()
      const mark = page.__bqResponses.length
      ctx.screen = where
      if (!(await humanClick(page, el, `${c.name}${c.context ? ` (${c.context.slice(0, 40)})` : ''}`, { mustSee: false }))) { record({ screen: where, control: c.name, effect, outcome: 'could not click' }); continue }
      await page.waitForTimeout(600)
      await settle(page)
      acted = true
      const dialog = page.locator(overlaySel).last()
      if (await dialog.count()) {
        const hasFields = (await dialog.locator('input:not([type=hidden]), textarea, select, [role=combobox]').count()) > 0
        const isConfirm = !hasFields && /\?/.test(((await dialog.innerText().catch(() => '')).split('\n')[0]) || '')
        if (hasFields) { await dialog.evaluate((d) => d.setAttribute('data-bq-form', '')); await submitForm(page, '[data-bq-form]', c.name, where) }
        else if (isConfirm) {
          if (irreversible && !ours) { await closeOverlays(page); record({ screen: where, control: c.name, effect, outcome: 'asked to confirm; cancelled (seeded data)' }) }
          else {
            const yes = dialog.getByRole('button', { name: /^(yes|confirm|delete|remove|submit|send|save|continue|ok|approve|archive|cancel order|void|post)\b/i }).last()
            if (await yes.count()) await humanClick(page, yes, 'confirm')
            await settle(page)
            const j = await judge(page, before, 'action', c.name)
            record({ screen: where, control: c.name, row: c.context, effect, confirmed: true, outcome: j.outcome, certainty: j.certainty, http: (await apiErrors(page, mark)).map((r) => `${r.method} ${r.path} → ${r.status}`) })
          }
        } else { const j = await judge(page, before, 'action', c.name); record({ screen: where, control: c.name, effect, outcome: `dialog: ${j.outcome}`, certainty: j.certainty }) }
        await closeOverlays(page)
        continue
      }
      const menu = page.locator('[role=menu]:visible').last()
      if (await menu.count()) {
        const items = (await menu.getByRole('menuitem').allInnerTexts().catch(() => [])).map((t) => t.trim()).filter(Boolean)
        record({ screen: where, control: c.name, row: c.context, effect: 'opens_menu', outcome: `menu: ${items.join(' | ')}` })
        await page.keyboard.press('Escape')
        continue // its items are tried next round, as menuitems, when the menu is opened again by the plan
      }
      if (page.url() !== url0 && effect !== 'changes_view') {
        // a new page: a form page gets filled and submitted; anything else is just noted, then back
        await screenReady(page)
        const formHere = (await page.locator('main input:not([type=hidden]):not([type=search]), main textarea, main select, main [role=combobox]').count()) > 0
          && (await page.locator('main').getByRole('button', { name: /^(save|create|add|submit|send|place|raise|record|request|post)\b/i }).count()) > 0
        if (formHere && effect === 'opens_form') { await page.locator('main').first().evaluate((d) => d.setAttribute('data-bq-form', '')); await submitForm(page, '[data-bq-form]', c.name, where) }
        else record({ screen: where, control: c.name, effect, outcome: `navigated to ${new URL(page.url()).pathname}` })
        await page.goBack().catch(() => {}); await settle(page)
        continue
      }
      const errs = await apiErrors(page, mark)
      const j = await judge(page, before, 'action', c.name)
      record({ screen: where, control: c.name, row: c.context, effect, outcome: j.outcome, certainty: j.certainty, toast: await toastText(page), http: errs.map((r) => `${r.method} ${r.path} → ${r.status}`) })
      if (errs.some((r) => r.status >= 500)) await finding(page, 'server-error-on-action', 'high', `${where}: "${c.name}" gave a server error (${errs.map((r) => `${r.method} ${r.path} → ${r.status}`).join('; ')})`)
      else if (j.certainty >= 0.7 && j.outcome === 'nothing_happened' && effect !== 'changes_view') await finding(page, 'dead-control', 'medium', `${where}: "${c.name}" (expected: ${effect.replace(/_/g, ' ')}) did nothing visible`, { judgedBy: 'jev' })
      else if (j.certainty >= 0.7 && j.outcome === 'refused_raw') await finding(page, 'raw-refusal', 'medium', `${where}: "${c.name}" was refused with a technical message`, { judgedBy: 'jev' })
      else if (j.certainty >= 0.7 && j.outcome === 'done_silently' && effect === 'saves_immediately') await finding(page, 'no-feedback', 'low', `${where}: "${c.name}" seems to have worked but nothing confirms it`, { judgedBy: 'jev' })
      else if (j.certainty >= 0.7 && j.outcome === 'signed_out') await finding(page, 'unexpected-sign-out', 'high', `${where}: "${c.name}" signed the user out`)
      if (page.url() !== url0) { await page.goBack().catch(() => {}); await settle(page) }
      await flushSignals(page)
      break // the screen may have changed: re-read it before the next control
    }
    if (!acted && !stale) return
  }
}

/** After a navigation click, wait until the screen's own content is there (single-page apps render late). */
async function screenReady(page) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForFunction(() => {
    const m = document.querySelector('main, [role=main]')
    return m && m.querySelectorAll('button, a[href], input, select, textarea, [role=tab], [role=row]').length > 0 && !m.querySelector('[aria-busy=true], [role=progressbar]')
  }, null, { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(400)
}

/* ---------------------------------------------------------------- main */
const s = await openSession(sessionOptions(project, { visible: VISIBLE }))
const page = await openAs(s, project, ROLE, { jev })
page.__bqResponses = []
page.on('response', (r) => { if (watch.origins.some((o) => r.url().startsWith(o)) && r.request().method() !== 'GET') page.__bqResponses.push({ method: r.request().method(), path: new URL(r.url()).pathname, status: r.status() }) })
page.on('dialog', (d) => { log(`browser dialog "${d.message()}" — accepted`); d.accept().catch(() => {}) })
ctx.quietStyle = true
log(`act mode as ${ROLE}; records created by this run carry the tag ${TAG}`)
const navSel = `${who.nav ?? who.app.nav ?? 'nav'}:visible`
const nav = () => page.locator(navSel).first()
const items = (await nav().locator('a[href], button').evaluateAll((els) => els.map((e) => ({ name: (e.getAttribute('aria-label') || e.innerText).replace(/\s+/g, ' ').trim(), tag: e.tagName.toLowerCase() }))).catch(() => []))
  .filter((i) => i.name && !NEVER.test(i.name))
const navNames = new Set(items.map((i) => i.name))
log(`screens: ${items.map((i) => i.name).join(' | ')}`)
const started = Date.now()
for (const item of items) {
  if (ONLY && !ONLY.test(item.name)) continue
  if (actionsDone.n >= MAX_ACTIONS) { log(`action budget (${MAX_ACTIONS}) reached`); break }
  await closeOverlays(page)
  ctx.screen = `${item.name}`
  if (!(await humanClick(page, nav().getByRole(item.tag === 'a' ? 'link' : 'button', { name: item.name, exact: true }).first(), `nav ${item.name}`))) continue
  await settle(page)
  await screenReady(page)
  log(`━━ ${item.name}`)
  const reopen = async () => { await closeOverlays(page); await humanClick(page, nav().getByRole(item.tag === 'a' ? 'link' : 'button', { name: item.name, exact: true }).first(), `nav ${item.name}`); await settle(page) }
  if (await isFormScreen(page)) { await formScreen(page, item.name, reopen).catch(async (e) => { await finding(page, 'act-error', 'low', `${item.name}: form routine stopped: ${String(e.message).slice(0, 160)}`, { noShot: true }) }); continue }
  await actOnScreen(page, item.name, navNames).catch(async (e) => { await finding(page, 'act-error', 'low', `${item.name}: act mode stopped on this screen: ${String(e.message).slice(0, 160)}`, { noShot: true }) })
  await flushSignals(page)
}
jev.save()
const by = {}
for (const e of effects) by[e.outcome] = (by[e.outcome] ?? 0) + 1
writeSummary(RUN_DIR, { title: `act ${ROLE}`, jev: jev.summary(), extra: [`Actions tried: ${actionsDone.n} in ${Math.round((Date.now() - started) / 1000)}s · effects recorded: ${effects.length} (effects.jsonl) · tag ${TAG}`, `Outcomes: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}`] })
console.log(`\n✔ act ${ROLE}: ${actionsDone.n} actions, ${effects.length} effects → ${RUN_DIR}`)
await persistSession(s, project, ROLE)
await s.close()
