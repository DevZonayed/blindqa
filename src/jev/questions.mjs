/**
 * Every question blindqa asks Jev, in one place. A question's wording is part of its cache key,
 * so editing one here automatically re-asks it and leaves every other cached answer alone.
 * Each one owns exactly one judgment; code combines them.
 */
import { Choice, Noul, Score } from './client.mjs'

/** Controls on screen → option map for a Choice, plus a way back from key to control. */
/** The screen as Jev sees it when choosing a control (the shape measured at 186/186 on the benchmark). */
export async function screenState(page, extracted, digestFn, extra = {}) {
  return {
    screen_title: extracted.title,
    url: new URL(page.url()).pathname,
    overlay_present: extracted.overlayPresent,
    overlay_role: extracted.overlayRole,
    visible_text: (await digestFn(page, { maxChars: 1500 })).slice(0, 1500),
    controls: extracted.candidates.map((c) => `e${c.index}: ${c.role} "${c.name}" in ${c.region}${c.context ? ` (row "${c.context}")` : ''}`),
    ...extra,
  }
}

export function controlOptions(candidates) {
  const criteria = {}
  const byKey = new Map()
  for (const c of candidates) {
    const key = `e${c.index}`
    const extras = [
      c.context ? `in the row/item "${c.context}"` : '',
      c.options?.length ? `offering [${c.options.join(', ')}]` : '',
      c.placeholder ? `hint "${c.placeholder}"` : '',
      c.disabled ? '(disabled)' : '',
    ].filter(Boolean).join(' ')
    criteria[key] = `${c.role} "${c.name}" in ${c.region}${extras ? ' ' + extras : ''}`
    byKey.set(key, c)
  }
  return { criteria, byKey }
}

export const Q = {
  /** Which control does this step mean? (journeys, shadow mode) */
  target: (goal, criteria) => Choice({ goal, question: 'The tester wants to achieve `goal` on this screen. Which single control listed in the options performs that action?' }, criteria),

  /** Has the step's intent been achieved on the screen after it? */
  stepDone: () => Noul('Comparing `screen_before` and `screen_after`, did the action described in `goal` visibly take effect?'),

  screenKind: () => Choice('What is the user looking at?', {
    content: 'a normal screen showing real content or records',
    empty_state: 'a screen that loaded correctly but has no records yet',
    form: 'a form or dialog asking the user to fill something in',
    confirm: 'a confirmation asking the user to approve or cancel an action',
    error: 'an error page or an error message instead of the content',
    permission_denied: 'a message that the user is not allowed to see or do this',
    loading: 'still loading, a spinner or skeleton with no content',
    blank: 'an empty or broken page with nothing usable',
    sign_in: 'a sign-in or verification screen',
  }),

  controlEffect: (c) => Choice(`What will happen if the user activates the ${c.role} labelled "${c.name}"${c.context ? ` in "${c.context}"` : ''}?`, {
    opens_form: 'opens a form, dialog or drawer to fill in; nothing is saved yet',
    opens_menu: 'opens a menu or list of further choices',
    navigates: 'goes to another page or section',
    changes_view: 'filters, sorts, searches, switches tab or expands/collapses something on this screen',
    saves_immediately: 'creates, changes or sends something right away',
    destructive: 'deletes, removes, cancels, revokes or otherwise undoes data',
    signs_out: 'signs the user out or ends the session',
    downloads: 'downloads, exports or prints a file',
    leaves_app: 'opens an external site or app',
  }),

  irreversible: (c) => Noul(`Would activating the ${c.role} labelled "${c.name}"${c.context ? ` in "${c.context}"` : ''} make a change that cannot easily be undone (delete, send, file, pay, mark as final, record that someone left)?`),

  rawText: () => Noul('Does the visible text show anything a normal business user should never see: database ids or UUIDs, internal code values like snake_case words, exception or class names, stack traces, or money shown as raw pence/cents?'),

  nameClear: (c) => Noul(`Is the name "${c.name}" enough for a screen-reader user, who hears only this name, to know what this ${c.role} does and which item it belongs to?`),

  contradiction: () => Noul('Do two parts of this screen state different things about the same fact (for example a setting shown one way in one section and another way in another)?'),

  submitOutcome: () => Choice('The user pressed the main button of the form in `screen_before`. Comparing with `screen_after`, what happened?', {
    says_what_is_missing: 'the form stayed open and clearly says what is wrong or missing',
    unclear_error: 'an error is shown but it is technical, vague or does not say how to fix it',
    silently_nothing: 'nothing visible happened and no message explains why',
    error_behind_dialog: 'a message appeared somewhere the user cannot see it, such as behind the dialog',
    accepted: 'the form was accepted: it closed or moved on and the change was made',
    moved_on: 'it moved to the next step of a multi-step form',
    crashed: 'a crash, server error or broken page',
  }),

  actionOutcome: () => Choice('The user activated the control named in `action` on `screen_before`. Comparing with `screen_after`, what happened?', {
    asked_to_confirm: 'a confirmation appeared asking whether to go ahead',
    done_with_feedback: 'it was done and the screen clearly confirms it',
    done_silently: 'it appears to have been done but nothing confirms it',
    refused_clear: 'it was refused with a clear explanation',
    refused_raw: 'it was refused with a technical or confusing message',
    nothing_happened: 'nothing visible happened',
    signed_out: 'the user was signed out or sent to a sign-in screen',
  }),

  messageMatches: () => Noul('Does the message or confirmation text on screen correctly describe the change in `steps_taken` (right items, right amounts, right people)?'),

  fieldType: (c) => Choice(`What kind of value does the ${c.role} labelled "${c.name}"${c.placeholder ? ` (hint "${c.placeholder}")` : ''} expect?`, {
    money: 'an amount of money', quantity: 'a count or quantity', percentage: 'a percentage or rate',
    date: 'a date', date_of_birth: "a person's date of birth", email: 'an email address', phone: 'a phone number',
    postcode: 'a postcode or zip code', vat_number: 'a VAT registration number', sort_code: 'a bank sort code',
    account_number: 'a bank account number', ni_number: 'a National Insurance number', tax_reference: 'a tax reference such as a UTR or PAYE reference',
    company_number: 'a company registration number', url: 'a web address', name: "a person's or organisation's name",
    free_text: 'free text such as a description or note', search: 'a search query', password: 'a password', code: 'a one-time or verification code', other: 'something else',
  }),

  acceptableValue: () => Noul('Would a real business, following normal rules for this kind of field, accept `value_entered` as valid for `field`?'),

  sameProblem: () => Noul('Do `finding_a` and `finding_b` describe the same underlying problem (same cause), even if seen on different screens?'),

  origin: () => Choice('Where does the problem in `finding` most likely come from?', {
    real_bug: 'a real defect users of the product would hit',
    dev_environment: 'only the local development or test setup (missing service, build quirk, local config)',
    missing_credentials: 'a third-party integration that is not configured with credentials here',
    test_data: 'odd test data rather than the product',
  }),

  severity: () => Score('How severe is the problem in `finding` for the people using this product?', {
    low: 'cosmetic or minor inconvenience; easy workaround',
    medium: 'confusing or wrong in a way that costs time or causes mistakes; a workaround exists',
    high: 'blocks a task, shows wrong figures, or misleads in a way with real consequences',
    critical: 'data loss, security or permission breach, money or legal impact, or a whole feature unusable',
  }),
}
