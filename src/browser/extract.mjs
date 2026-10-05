/**
 * Playwright page -> the candidate list Jev will choose from.
 * Pure DOM work, runs inside the page, ~5ms. No model involved.
 */
const INTERACTIVE =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="combobox"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [contenteditable="true"]'

export async function extractCandidates(page, { onlyVisible = true, max = 255, scope = null } = {}) {
  return page.evaluate(
    ({ selector, onlyVisible, max, scope }) => {
      const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim().slice(0, 120)

      const accessibleName = (el) => {
        if (el.getAttribute('aria-label')) return clean(el.getAttribute('aria-label'))
        const labelledBy = el.getAttribute('aria-labelledby')
        if (labelledBy) {
          const target = document.getElementById(labelledBy)
          if (target) return clean(target.textContent)
        }
        if (el.id) {
          const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
          if (label) return clean(label.textContent)
        }
        const wrapping = el.closest('label')
        if (wrapping) return clean(wrapping.textContent)
        if (el.placeholder) return clean(el.placeholder)
        if (el.title) return clean(el.title)
        return clean(el.textContent)
      }

      const roleOf = (el) => {
        const explicit = el.getAttribute('role')
        if (explicit) return explicit
        const tag = el.tagName.toLowerCase()
        if (tag === 'a') return 'link'
        if (tag === 'select') return 'combobox'
        if (tag === 'textarea') return 'textbox'
        if (tag === 'input') {
          const type = (el.getAttribute('type') || 'text').toLowerCase()
          if (type === 'checkbox') return 'checkbox'
          if (type === 'radio') return 'radio'
          if (type === 'date') return 'date'
          if (type === 'search') return 'searchbox'
          return 'textbox'
        }
        return tag
      }

      const regionOf = (el) => {
        const container = el.closest(
          '[role="dialog"], [role="alertdialog"], section[aria-label], header, main, aside, form',
        )
        if (!container) return 'page'
        if (container.getAttribute('role') === 'dialog') return 'dialog'
        if (container.getAttribute('role') === 'alertdialog') return 'confirm dialog'
        const label = container.getAttribute('aria-label')
        if (label) return clean(label)
        return container.tagName.toLowerCase()
      }

      const isVisible = (el) => {
        const box = el.getBoundingClientRect()
        if (box.width === 0 || box.height === 0) return false
        const style = getComputedStyle(el)
        return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0'
      }

      // An overlay makes everything behind it unreachable; drop the background.
      // The confirm dialog opens ON TOP of the edit drawer, and both are overlays,
      // so take the topmost: an alertdialog wins, otherwise the last one in the DOM.
      const shown = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 }
      const popovers = [...document.querySelectorAll('[role="menu"], [role="listbox"]')].filter(shown)
      const overlays = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].filter(shown)
      const overlay =
        popovers[popovers.length - 1] ??
        overlays.find((el) => el.getAttribute('role') === 'alertdialog') ??
        overlays[overlays.length - 1] ??
        null
      // An explicit scope wins, then any open overlay, then the whole document.
      // A page often has several <form> elements — the site search is one — so
      // pick whichever candidate actually holds the most interactive controls,
      // and fall back to the document if it turns out to be trivial.
      let picked = null
      if (scope) {
        const els = [...document.querySelectorAll(scope)]
        picked = els
          .map((el) => [el, el.querySelectorAll(selector).length])
          .sort((a, b) => b[1] - a[1])
          .filter(([, n]) => n >= 3)
          .map(([el]) => el)[0] ?? null
      }
      const scopeEl = picked || overlay || document

      const out = []
      // a unique marker per control: repeated controls (one per table row) stay distinguishable
      window.__bqSeq = window.__bqSeq ?? 0
      for (const el of scopeEl.querySelectorAll(selector)) {
        if (onlyVisible && !isVisible(el)) continue
        const testid = el.getAttribute('data-testid')
        const testidUnique =
          testid && document.querySelectorAll(`[data-testid="${testid}"]`).length === 1
        const name = accessibleName(el)
        const role = roleOf(el)
        // A dropdown's options are the single most useful thing code knows and
        // the model cannot see. Without them "Status" is just a word; with them
        // it is visibly the control that owns columns.
        const options =
          el.tagName === 'SELECT' ? [...el.options].map((o) => clean(o.label)).slice(0, 12) : null
        const nativeSelect = el.tagName === 'SELECT'
        // Repeated controls ("⋯", "Edit", "Actions for <id>") only make sense with the row they act on.
        const item = el.closest('[role="row"], tr, li, [role="listitem"], article, [role="gridcell"]')
        const context = item && item !== el ? clean(item.innerText).slice(0, 90) : ''

        out.push({
          index: out.length,
          role,
          name,
          options,
          placeholder: clean(el.placeholder || ''),
          required: !!el.required,
          nativeSelect,
          region: regionOf(el),
          disabled: !!el.disabled,
          value: el.value !== undefined && el.type !== 'password' ? clean(String(el.value)) : '',
          testid,
          context: context && !context.startsWith(name) ? context : context && name.length < 3 ? context : '',
          isTarget: el.hasAttribute('data-bq-target') || !!el.querySelector('[data-bq-target]') || !!el.closest('[data-bq-target]'),
          inMain: !!el.closest('main, [role=main]'),
          roleSelector: testidUnique ? `[data-testid="${testid}"]` : `role=${role}[name="${name}"]`,
          selector: `[data-bq-i="${el.getAttribute('data-bq-i') || (el.setAttribute('data-bq-i', String(++window.__bqSeq)), el.getAttribute('data-bq-i'))}"]`,
        })
        if (out.length >= max) break
      }
      return {
        candidates: out,
        overlayPresent: !!overlay,
        overlayRole: overlay ? overlay.getAttribute('role') : null,
        title: document.title,
        url: location.href,
      }
    },
    { selector: INTERACTIVE, onlyVisible, max, scope },
  )
}

/** Compact text digest of what is on screen — the "did anything change" input. */
export async function digest(page, { maxChars = 1800 } = {}) {
  return page.evaluate((limit) => {
    // our cursor + HUD are not part of the application
    const ours = [...document.querySelectorAll('[data-jev-ui]')]
    const restore = ours.map((el) => [el, el.style.display])
    for (const el of ours) el.style.display = 'none'
    const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim()
    const overlays = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')]
    const overlay =
      overlays.find((el) => el.getAttribute('role') === 'alertdialog') ??
      overlays[overlays.length - 1] ??
      null
    const columns = [...document.querySelectorAll('section.column')].map(
      (c) => `${c.getAttribute('aria-label')}=${c.querySelectorAll('.card-title').length}`,
    )
    const result = clean(
      [
        `overlay:${overlay ? overlay.getAttribute('role') : 'none'}`,
        columns.length ? `columns:${columns.join(',')}` : '',
        `text:${clean((overlay ?? document.body).innerText).slice(0, limit)}`,
      ]
        .filter(Boolean)
        .join(' | '),
    )
    for (const [el, display] of restore) el.style.display = display
    return result
  }, maxChars)
}

/** The option map handed to a Jev Choice. Two key strategies, so we can measure both. */
export function toCriteria(candidates, strategy = 'indexed') {
  const criteria = {}
  const keyFor = new Map()
  for (const c of candidates) {
    let key
    if (strategy === 'named') {
      const base = (c.name || c.role).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'el'
      key = base
      let n = 2
      while (criteria[key]) key = `${base}_${n++}`
    } else {
      key = `e${c.index}`
    }
    const opts = c.options?.length ? ` offering the values [${c.options.join(', ')}]` : ''
    const hint = c.placeholder ? ` with the hint "${c.placeholder}"` : ''
    criteria[key] =
      strategy === 'named'
        ? `${c.role} in ${c.region}${opts}${hint}${c.disabled ? ' (disabled)' : ''}`
        : `${c.role} labelled "${c.name}" in ${c.region}${opts}${hint}${c.disabled ? ' (disabled)' : ''}`
    keyFor.set(key, c)
  }
  return { criteria, keyFor }
}
