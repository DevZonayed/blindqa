/**
 * Judgments without a model: what a control will likely do, what a field expects, whether a screen is
 * healthy, and what happened after a click or a submit. Everything here is read from roles, names,
 * attributes, network answers and what changed on screen, so the same screen always gets the same
 * verdict. When the signals can't settle a question the result says `sure: false`, and nothing is
 * reported for it: the record stays in the run for the coding agent to look at.
 *
 * The pure functions take plain objects (tested in test/judge.test.mjs); screenSignals() and
 * screenFacts() collect those objects from a Playwright page.
 */

/* ------------------------------------------------------------------ words */
const SIGNS_OUT = /\b(sign ?out|log ?out|end session)\b/i
const DOWNLOADS = /\b(download|export|print|csv|pdf|xlsx?)\b/i
const MENU_NAME = /^(⋯|…|\.\.\.|⋮|more|more actions|actions|options|menu)$|^(actions|options|more) for\b/i
const DESTRUCTIVE = /\b(delete|remove|discard|void|revoke|deactivate|disable|archive|reject|decline|refund|terminate|unpublish|erase|clear all|cancel (order|invoice|booking|subscription|request|plan))\b/i
const IRREVERSIBLE = /\b(delete|remove|send|submit|file|pay|publish|approve|reject|finali[sz]e|void|refund|terminate|lock|sign( and)? (send|submit)|mark as (final|paid|complete|done|left|resigned))\b/i
const OPENS_FORM = /^(\+\s*)?(new|add|create|edit|invite|upload|import|compose|write|book|schedule|register|apply for|rename|change|update|set up|configure|assign|reassign|move|duplicate)\b|^\+$/i
const CHANGES_VIEW = /\b(filter|sort|search|show|hide|expand|collapse|view|grid|list|board|table|next|previous|prev|page \d+|show more|show less|load more|all|today|this (week|month|year)|clear filters?|reset filters?|refresh)\b/i
const SAVES = /\b(save|apply|mark|approve|accept|confirm|send|submit|publish|enable|activate|star|pin|follow|subscribe|complete|done|resolve|reopen|restore)\b/i

/** Messages that say the app crashed rather than refused. */
export const CRASH = /\b(something went wrong|application error|unexpected (application )?error|internal server error|this page (isn't|is not) working|cannot read propert(y|ies)|is not a function|chunkloaderror|minified react error)\b/i
/** Text no person should have to read in a message. */
const TECHNICAL = [
  /\b(\d{3} (bad request|unauthori[sz]ed|forbidden|not found|conflict|unprocessable|internal)|bad request|unprocessable (entity|content)|request failed with status|status code \d{3}|failed to fetch|network ?error|sqlstate|violates .* constraint|duplicate key|null value in column|invalid input syntax|stack ?trace|traceback)\b/i,
  /\b(ECONN[A-Z]+|undefined|NaN|[A-Z]\w*(Error|Exception))\b|\[object Object\]|[{[]\s*"\w+"\s*:/,
]
/** A message that tells the person what to fix. */
const CLEAR = /\b(required|please (enter|choose|select|fill|provide|add|pick)|must (be|have|contain|include|match)|is (missing|too (short|long)|not valid)|can(no|')t be (blank|empty)|enter (a|an|the|your)|invalid (email|phone|date|number|format|code)|at least|at most|no more than|not allowed|already (exists|taken|in use|registered)|you (don't|do not) have (permission|access)|not permitted|doesn't match|does not match)\b/i
const SUCCESS = /\b(saved|created|updated|added|deleted|removed|archived|restored|sent|submitted|approved|rejected|published|success(fully)?|completed|uploaded|imported|invited|moved|assigned|changes? (saved|applied)|done)\b/i
const FAILED = /\b(fail(ed|ure)?|error|could ?n[o']t|unable|went wrong|denied|refused|invalid|not (saved|allowed|possible))\b/i

/* ------------------------------------------------------------------ controls and fields */

/**
 * The likely effect of activating control `c` (an extractCandidates() row): opens_form, opens_menu,
 * navigates, changes_view, saves_immediately, destructive, signs_out, downloads or leaves_app.
 */
export function controlEffect(c) {
  const name = (c.name ?? '').trim()
  if (SIGNS_OUT.test(name)) return 'signs_out'
  if (c.external) return 'leaves_app'
  if (c.download || DOWNLOADS.test(name)) return 'downloads'
  if (c.haspopup === 'menu' || c.haspopup === 'true' || c.haspopup === 'listbox' || MENU_NAME.test(name)) return 'opens_menu'
  if (c.haspopup === 'dialog') return 'opens_form'
  if (c.role === 'tab' || c.role === 'option' || c.role === 'menuitemradio') return 'changes_view'
  // a checkbox in a row selects it; a switch or a lone checkbox usually saves a setting
  if (c.role === 'checkbox' || c.role === 'menuitemcheckbox') return c.context ? 'changes_view' : 'saves_immediately'
  if (c.role === 'switch') return 'saves_immediately'
  if (DESTRUCTIVE.test(name)) return 'destructive'
  if (c.role === 'link') return c.samePage ? 'changes_view' : 'navigates'
  if (OPENS_FORM.test(name)) return 'opens_form'
  if (CHANGES_VIEW.test(name)) return 'changes_view'
  if (SAVES.test(name)) return 'saves_immediately'
  return 'saves_immediately' // unknown buttons go late in the plan, after everything that only looks
}

/** Would activating `c` make a change that can't easily be undone? */
export function isIrreversible(c) {
  return IRREVERSIBLE.test(c.name ?? '') || controlEffect(c) === 'destructive'
}

/** The kind of value field `c` expects, from its type, autocomplete hint, label and placeholder. */
export function fieldKind(c) {
  const type = (c.type ?? '').toLowerCase()
  const ac = (c.autocomplete ?? '').toLowerCase()
  const label = `${c.name ?? ''} ${c.placeholder ?? ''}`.toLowerCase()
  const says = (re) => re.test(label)
  if (type === 'password' || /(current|new)-password/.test(ac)) return 'password'
  if (ac === 'one-time-code' || says(/\b(otp|one[- ]time|verification code|security code|2fa|\d-digit code)\b/)) return 'code'
  if (type === 'email' || ac === 'email' || says(/\be-?mail\b/)) return 'email'
  if (type === 'tel' || ac.startsWith('tel') || says(/\b(phone|mobile|telephone|whatsapp)\b/)) return 'phone'
  if (type === 'url' || ac === 'url' || says(/\b(url|website|web address)\b/)) return 'url'
  if (type === 'search' || says(/\bsearch\b/)) return 'search'
  if (ac === 'bday' || says(/\b(date of birth|dob|birth ?date|birthday)\b/)) return 'date_of_birth'
  if (/^(date|datetime-local|month|week)$/.test(type) || says(/\b(date|deadline|due on|due by)\b/)) return 'date'
  if (ac === 'postal-code' || says(/\b(post ?code|zip( code)?|postal code)\b/)) return 'postcode'
  if (says(/\b(vat|tax id|tin)\b/) && !says(/rate|%/)) return 'vat_number'
  if (says(/\b(company (number|reg\w*)|registration (no|number))\b/)) return 'company_number'
  if (says(/\b(utr|paye|tax ref\w*)\b/)) return 'tax_reference'
  if (says(/\b(account (no|number)|iban)\b/)) return 'account_number'
  if (says(/%|\bpercent(age)?\b|\b(discount|tax|vat|interest) rate\b/)) return 'percentage'
  if (says(/\b(price|amount|cost|fee|salary|total|balance|budget|payment|value|mrp|tk|bdt|usd|gbp|eur)\b|[$£€৳]/)) return 'money'
  if (type === 'number' || c.inputmode === 'numeric' || says(/\b(qty|quantity|count|number of|units|pieces|pcs|stock|seats)\b/)) return 'quantity'
  if (/^(name|given-name|family-name|organization)$/.test(ac) || says(/\b(name|company|business|shop|store|organi[sz]ation)\b/)) return 'name'
  if (type === 'textarea' || says(/\b(description|notes?|comment|message|details|reason|address|bio|about)\b/)) return 'free_text'
  return 'other'
}

/* ------------------------------------------------------------------ messages and screens */

/** clear (says what to fix) · technical · vague · success · info, or null for no text. */
export function messageKind(text) {
  if (!text) return null
  if (TECHNICAL.some((re) => re.test(text))) return 'technical'
  if (CLEAR.test(text)) return 'clear'
  if (FAILED.test(text)) return 'vague'
  if (SUCCESS.test(text)) return 'success'
  return 'info'
}

const RAW = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi],
  [/\[object Object\]/g],
  [/\b(undefined|NaN|Invalid Date)\b/g],
  [/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g],
  [/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g],
  [/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g],
  [/\b\w+(?:Error|Exception): /g],
  [/\{\{\s*[\w.]+\s*\}\}|\$\{[\w.]+\}/g],
]
const NOT_RAW = /\S+@\S+\.\w+|https?:\/\/\S+|\S+\.(pdf|csv|png|jpe?g|gif|svg|xlsx?|docx?|zip|txt|json)\b/gi

/** Values a person should never see on a screen (ids, codes, raw timestamps, missing values), up to `max`. */
export function rawValues(text, max = 5) {
  const t = (text ?? '').replace(NOT_RAW, ' ')
  const out = []
  for (const [re] of RAW) for (const m of t.matchAll(re)) if (!out.includes(m[0].trim()) && out.length < max) out.push(m[0].trim())
  return out
}

/**
 * Control names a screen-reader user can't act on: symbol-only names ("+", "⋯"), and the same short
 * name repeated across rows ("Edit" ×5), where only the name is announced.
 */
export function unclearNames(controls) {
  const named = controls.filter((c) => c.name && /^(button|link|menuitem|switch|checkbox|tab)$/.test(c.role))
  const out = []
  for (const c of named) {
    const name = c.name.trim()
    if (out.some((o) => o.name === name)) continue
    if (/^[^\p{L}\p{N}]{1,3}$/u.test(name)) { out.push({ name, why: 'only a symbol' }); continue }
    const same = named.filter((o) => o.name.trim() === name)
    const rows = new Set(same.map((o) => o.context).filter(Boolean))
    if (rows.size >= 2 && name.split(/\s+/).length <= 2) out.push({ name, why: `${same.length} controls share it, one per row` })
  }
  return out
}

/** content · error · loading · blank, from screenFacts(). */
export function screenHealth(f) {
  const t = f.mainText ?? ''
  if (t.length < 600 && (CRASH.test(t) || /\b(404|page not found)\b/i.test(t))) return { kind: 'error', why: (t.match(CRASH) ?? t.match(/\b(404|page not found)\b/i))[0] }
  if (f.busy && t.length < 200) return { kind: 'loading', why: 'still busy with no content' }
  if (t.length < 15 && !f.mainControls) return { kind: 'blank', why: 'no text and no controls' }
  return { kind: 'content' }
}

/* ------------------------------------------------------------------ outcomes */
// new = an element that wasn't on screen before, or whose text changed ("Saving…" → "Saved")
const isNew = (before, m) => ('prev' in m ? m.prev !== m.text : !before.messages.some((b) => b.text === m.text))
const fresh = (before, after) => after.messages.filter((m) => isNew(before, m)).map((m) => ({ ...m, kind: messageKind(m.text) }))
// the page itself, without its messages: a toast saying "something went wrong" is a refusal, not a crash
const pageText = (s) => s.messages.reduce((t, m) => t.split(m.text).join(' '), s.text ?? '')
const crashed = (before, after) => CRASH.test(pageText(after)) && !CRASH.test(pageText(before))
const changed = (before, after) => before.url !== after.url || before.textHash !== after.textHash || before.state !== after.state || before.dialog !== after.dialog
const statuses = (rs) => [...new Set(rs.map((r) => `${r.method} ${r.path} → ${r.status}`))].join('; ')
const say = (outcome, sure, why) => ({ outcome, sure, why })

/**
 * After pressing a form's main button. `http` = the non-GET responses since the press.
 * accepted · moved_on · says_what_is_missing · unclear_error · error_behind_dialog · failed_silently ·
 * silently_nothing · crashed · signed_out · unknown
 */
export function submitOutcome(before, after, http = []) {
  const msgs = fresh(before, after)
  const bad = msgs.filter((m) => /^(clear|technical|vague)$/.test(m.kind))
  const server = http.filter((r) => r.status >= 500)
  const refused = http.filter((r) => r.status >= 400 && r.status < 500)
  if (after.passwordBox && !before.passwordBox) return say('signed_out', true, 'a sign-in form appeared')
  if (server.length) return say('crashed', true, `server error: ${statuses(server)}`)
  if (crashed(before, after)) return say('crashed', true, `the screen says "${pageText(after).match(CRASH)[0]}"`)
  const hidden = bad.find((m) => m.covered)
  if (hidden) return say('error_behind_dialog', true, `"${hidden.text}" appeared where it can't be seen`)
  const open = after.scopeOpen !== false && after.url === before.url
  if (!open) {
    if (bad.length) return say('unclear_error', true, `the form closed but "${bad[0].text}" appeared`)
    if (refused.length) return say('failed_silently', true, `the form closed as if saved, but ${statuses(refused)} and nothing says so`)
    return say('accepted', true, msgs.find((m) => m.kind === 'success')?.text ?? 'the form closed')
  }
  const clear = bad.find((m) => m.kind === 'clear')
  if (after.invalid.length || clear) return say('says_what_is_missing', true, clear?.text ?? `fields marked invalid: ${after.invalid.join(', ')}`)
  if (bad.length) return say('unclear_error', true, `"${bad[0].text}"`)
  const ok = msgs.find((m) => m.kind === 'success')
  if (ok) return say('accepted', true, ok.text)
  if (after.fields !== before.fields) return say('moved_on', true, 'the form now asks for different fields')
  if (refused.length) return say('silently_nothing', true, `${statuses(refused)} and nothing on screen says so`)
  if (!changed(before, after)) return say('silently_nothing', true, 'nothing on screen changed')
  return say('unknown', false, 'the screen changed but nothing says whether it worked')
}

/**
 * After clicking a control that is not a form submit. `http` = the non-GET responses since the click.
 * signed_out · crashed · refused_clear · refused_raw · refused_silently · done_with_feedback ·
 * done_silently · changed · nothing_happened
 */
export function actionOutcome(before, after, http = [], { name = '' } = {}) {
  const msgs = fresh(before, after)
  const server = http.filter((r) => r.status >= 500)
  const refused = http.filter((r) => r.status >= 400 && r.status < 500)
  const wrote = http.filter((r) => r.status < 400)
  if ((after.passwordBox && !before.passwordBox) || (/\/(log ?in|sign-?in|auth)\b/i.test(after.url) && !/\/(log ?in|sign-?in|auth)\b/i.test(before.url))) return say('signed_out', true, 'sent to a sign-in screen')
  if (server.length) return say('crashed', true, `server error: ${statuses(server)}`)
  if (crashed(before, after)) return say('crashed', true, `the screen says "${pageText(after).match(CRASH)[0]}"`)
  const clear = msgs.find((m) => m.kind === 'clear')
  if (clear) return say('refused_clear', true, clear.text)
  const raw = msgs.find((m) => m.kind === 'technical' || m.kind === 'vague')
  if (raw) return say('refused_raw', true, raw.text)
  if (refused.length) return say('refused_silently', true, `${statuses(refused)} and nothing on screen says so`)
  const ok = msgs.find((m) => m.kind === 'success')
  if (ok) return say('done_with_feedback', true, ok.text)
  if (changed(before, after)) return say('changed', true, before.url !== after.url ? `now at ${new URL(after.url).pathname}` : 'the screen changed')
  if (wrote.length) return say('done_silently', true, `${statuses(wrote)} but nothing on screen changed`)
  // copying, sharing or help buttons can work without changing the page
  return say('nothing_happened', !/\b(copy|share|help|info|print|tooltip)\b/i.test(name), 'no request, no message, nothing on screen changed')
}

/* ------------------------------------------------------------------ reading the page */

/**
 * What a person could notice on screen right now. `scopeSel` = the form being submitted, if any.
 * Our own cursor and notices ([data-qa-ui]) are left out.
 */
export async function screenSignals(page, scopeSel = null) {
  return page.evaluate((scopeSel) => {
    const shown = (el) => { const b = el.getBoundingClientRect(); const s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05 }
    const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
    const ours = [...document.querySelectorAll('[data-qa-ui]')].map((el) => [el, el.style.display])
    for (const [el] of ours) el.style.display = 'none'
    try {
      const dialogs = [...document.querySelectorAll('[role=dialog], [role=alertdialog], dialog[open]')].filter(shown)
      const top = dialogs[dialogs.length - 1] ?? null
      const main = document.querySelector('main, [role=main]') ?? document.body
      const scoped = scopeSel ? [...document.querySelectorAll(scopeSel)].filter(shown) : []
      const scope = scoped[scoped.length - 1] ?? null
      const MSG = '[role=alert], [role=status], [aria-live=assertive], [aria-live=polite], [data-sonner-toast], [class*=toast i], [class*=snackbar i]'
      const messages = []
      for (const el of document.querySelectorAll(MSG)) {
        if (!shown(el)) continue
        if ([...el.querySelectorAll(MSG)].some((inner) => shown(inner) && clean(inner.innerText))) continue // the innermost one carries the text
        const text = clean(el.innerText).slice(0, 200)
        if (!text) continue
        const prev = el.getAttribute('data-bq-msg') // the text this element had at the last look
        el.setAttribute('data-bq-msg', text)
        const b = el.getBoundingClientRect()
        const x = Math.min(Math.max(b.left + b.width / 2, 0), innerWidth - 1)
        const y = Math.min(Math.max(b.top + Math.min(b.height / 2, 12), 0), innerHeight - 1)
        const hit = document.elementFromPoint(x, y)
        messages.push({ text, prev, covered: !!hit && !el.contains(hit) && !hit.contains(el), inDialog: !!top && top.contains(el) })
      }
      const root = scope ?? top ?? main
      const fields = [...root.querySelectorAll('input:not([type=hidden]), select, textarea, [role=combobox], [role=textbox]')].filter(shown)
      const labelOf = (f) => clean(f.getAttribute('aria-label') || f.labels?.[0]?.innerText || f.getAttribute('name') || f.getAttribute('placeholder') || f.type).slice(0, 60)
      const body = clean(document.body.innerText)
      let hash = 5381
      for (let i = 0; i < body.length; i += 1) hash = ((hash * 33) ^ body.charCodeAt(i)) >>> 0
      return {
        url: location.href,
        dialog: top ? (top.getAttribute('role') || 'dialog') : null,
        scopeOpen: scopeSel ? !!scope : null,
        fields: fields.map(labelOf).join('|'),
        invalid: fields.filter((f) => f.getAttribute('aria-invalid') === 'true' || (f.matches(':invalid') && f.validationMessage)).map(labelOf),
        messages,
        passwordBox: [...document.querySelectorAll('input[type=password]')].some(shown),
        state: main.querySelectorAll('[aria-pressed=true], [aria-expanded=true], [aria-selected=true], [aria-checked=true], [aria-current]:not([aria-current=false]), input:checked').length,
        text: (top ? clean(top.innerText) : body).slice(0, 3000),
        textHash: `${hash}:${body.length}`,
      }
    } finally { for (const [el, d] of ours) el.style.display = d }
  }, scopeSel)
}

/** One screen's facts for screenHealth() and rawValues(): its visible text (code blocks and inputs left out). */
export async function screenFacts(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main, [role=main]') ?? document.body
    const parts = []
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const el = n.parentElement
        if (!el || el.closest('code, pre, kbd, samp, script, style, textarea, [contenteditable=true], [data-qa-ui], [aria-hidden=true]')) return NodeFilter.FILTER_REJECT
        if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return NodeFilter.FILTER_REJECT
        return n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    })
    while (walk.nextNode() && parts.length < 4000) parts.push(walk.currentNode.textContent.trim())
    return {
      mainText: parts.join(' ').replace(/\s+/g, ' ').slice(0, 20000),
      busy: !!main.querySelector('[aria-busy=true], [role=progressbar]'),
      mainControls: main.querySelectorAll('a[href], button, input, select, textarea, [role=button], [role=link], [role=tab]').length,
    }
  })
}
