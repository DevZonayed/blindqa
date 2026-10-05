import { test } from 'node:test'
import assert from 'node:assert/strict'
import { controlEffect, isIrreversible, fieldKind, messageKind, rawValues, unclearNames, screenHealth, submitOutcome, actionOutcome } from '../src/judge.mjs'

test('control effects come from role, name and attributes', () => {
  assert.equal(controlEffect({ role: 'button', name: 'New task' }), 'opens_form')
  assert.equal(controlEffect({ role: 'button', name: '+' }), 'opens_form')
  assert.equal(controlEffect({ role: 'button', name: '⋯' }), 'opens_menu')
  assert.equal(controlEffect({ role: 'button', name: 'Status', haspopup: 'menu' }), 'opens_menu')
  assert.equal(controlEffect({ role: 'tab', name: 'Archived' }), 'changes_view')
  assert.equal(controlEffect({ role: 'button', name: 'Delete', context: 'Invoice 42' }), 'destructive')
  assert.equal(controlEffect({ role: 'button', name: 'Export CSV' }), 'downloads')
  assert.equal(controlEffect({ role: 'link', name: 'Docs', external: true }), 'leaves_app')
  assert.equal(controlEffect({ role: 'link', name: 'Billing' }), 'navigates')
  assert.equal(controlEffect({ role: 'button', name: 'Sign out' }), 'signs_out')
  assert.equal(controlEffect({ role: 'checkbox', name: 'Select row', context: 'Task 1' }), 'changes_view')
  assert.equal(controlEffect({ role: 'switch', name: 'Email alerts' }), 'saves_immediately')
  assert.equal(controlEffect({ role: 'button', name: 'Filter' }), 'changes_view')
})

test('irreversible actions are recognised, harmless ones are not', () => {
  assert.ok(isIrreversible({ role: 'button', name: 'Send invoice' }))
  assert.ok(isIrreversible({ role: 'button', name: 'Archive done tasks' }))
  assert.ok(!isIrreversible({ role: 'button', name: 'Edit' }))
  assert.ok(!isIrreversible({ role: 'tab', name: 'Sent' }))
})

test('field kinds come from type, autocomplete and label', () => {
  assert.equal(fieldKind({ type: 'email', name: 'Work address' }), 'email')
  assert.equal(fieldKind({ name: 'Mobile number' }), 'phone')
  assert.equal(fieldKind({ type: 'password', name: 'Password' }), 'password')
  assert.equal(fieldKind({ autocomplete: 'one-time-code', name: 'Code' }), 'code')
  assert.equal(fieldKind({ type: 'date', name: 'Due' }), 'date')
  assert.equal(fieldKind({ name: 'Date of birth' }), 'date_of_birth')
  assert.equal(fieldKind({ name: 'Unit price (৳)' }), 'money')
  assert.equal(fieldKind({ name: 'Discount rate (%)' }), 'percentage')
  assert.equal(fieldKind({ type: 'number', name: 'Qty' }), 'quantity')
  assert.equal(fieldKind({ name: 'Shop name' }), 'name')
  assert.equal(fieldKind({ type: 'textarea', name: 'Notes' }), 'free_text')
  assert.equal(fieldKind({ name: 'Title' }), 'other')
})

test('messages: clear, technical, vague, success', () => {
  assert.equal(messageKind('Title is required'), 'clear')
  assert.equal(messageKind('Please enter a valid email'), 'clear')
  assert.equal(messageKind('Request failed with status code 422'), 'technical')
  assert.equal(messageKind('TypeError: cannot read x'), 'technical')
  assert.equal(messageKind('{"error":"bad"}'), 'technical')
  assert.equal(messageKind('Something went wrong'), 'vague')
  assert.equal(messageKind('Task saved'), 'success')
  assert.equal(messageKind('Showing 1-10 of 25'), 'info')
  // an ordinary word that ends in "error" is not an exception name
  assert.equal(messageKind('Mirror created'), 'success')
})

test('raw values on screen are listed; emails, links and file names are not', () => {
  const t = 'Status: PENDING_APPROVAL · owner undefined · 3f2b8c1e-1d2a-4c3b-9a8e-0b1c2d3e4f50 · 2026-10-05T11:38:05Z · mail ops_team@example.com · report_2026.pdf · https://x.dev/a_b'
  assert.deepEqual(rawValues(t), ['3f2b8c1e-1d2a-4c3b-9a8e-0b1c2d3e4f50', 'undefined', '2026-10-05T11:38:05Z', 'PENDING_APPROVAL'])
  assert.deepEqual(rawValues('Pending approval · due 5 Oct 2026 · 3 tasks'), [])
})

test('control names a screen reader cannot tell apart', () => {
  const rows = ['Task 1', 'Task 2', 'Task 3'].map((context) => ({ role: 'button', name: 'Edit', context }))
  const out = unclearNames([...rows, { role: 'button', name: '+' }, { role: 'button', name: 'Edit Task 1' }, { role: 'button', name: 'Save' }])
  assert.deepEqual(out.map((o) => o.name), ['Edit', '+'])
  assert.deepEqual(unclearNames([{ role: 'button', name: 'Edit' }]), [], 'one Edit button is fine')
})

test('screen health', () => {
  assert.equal(screenHealth({ mainText: 'Something went wrong. Try again.', mainControls: 1 }).kind, 'error')
  assert.equal(screenHealth({ mainText: '404 — page not found', mainControls: 1 }).kind, 'error')
  assert.equal(screenHealth({ mainText: '', busy: true, mainControls: 0 }).kind, 'loading')
  assert.equal(screenHealth({ mainText: '', mainControls: 0 }).kind, 'blank')
  assert.equal(screenHealth({ mainText: 'Board · Backlog · 3 tasks · New task', mainControls: 6 }).kind, 'content')
})

const screen = (o = {}) => ({ url: 'http://app/board', dialog: 'dialog', scopeOpen: true, fields: 'Title|Due', invalid: [], messages: [], passwordBox: false, state: 0, text: 'New task Title Due Save', textHash: '1:20', ...o })

test('submit outcomes', () => {
  const before = screen()
  assert.equal(submitOutcome(before, screen({ scopeOpen: false, dialog: null, textHash: '2:30' })).outcome, 'accepted')
  assert.equal(submitOutcome(before, screen({ invalid: ['Title'] })).outcome, 'says_what_is_missing')
  assert.equal(submitOutcome(before, screen({ messages: [{ text: 'Title is required', prev: null }] })).outcome, 'says_what_is_missing')
  assert.equal(submitOutcome(before, screen({ messages: [{ text: 'Request failed with status code 500', prev: null }] }), [{ method: 'POST', path: '/api/tasks', status: 500 }]).outcome, 'crashed')
  assert.equal(submitOutcome(before, screen({ messages: [{ text: 'Request failed with status code 422', prev: null }] })).outcome, 'unclear_error')
  assert.equal(submitOutcome(before, screen({ messages: [{ text: 'Could not save', prev: null, covered: true }] })).outcome, 'error_behind_dialog')
  assert.equal(submitOutcome(before, screen()).outcome, 'silently_nothing')
  assert.equal(submitOutcome(before, screen({ scopeOpen: false, dialog: null }), [{ method: 'POST', path: '/api/tasks', status: 422 }]).outcome, 'failed_silently')
  assert.equal(submitOutcome(before, screen({ fields: 'Assignee|Priority', textHash: '3:40' })).outcome, 'moved_on')
  const unsure = submitOutcome(before, screen({ textHash: '9:99' }))
  assert.equal(unsure.outcome, 'unknown')
  assert.equal(unsure.sure, false)
})

test('a toast already on screen is not a new message; the same element with new text is', () => {
  const before = screen({ messages: [{ text: 'Task saved', prev: null }] })
  assert.equal(submitOutcome(before, screen({ messages: [{ text: 'Task saved', prev: 'Task saved' }] })).outcome, 'silently_nothing')
  assert.equal(submitOutcome(screen({ messages: [{ text: 'Saving…', prev: null }] }), screen({ messages: [{ text: 'Task saved', prev: 'Saving…' }] })).outcome, 'accepted')
})

test('action outcomes', () => {
  const before = screen({ dialog: null, scopeOpen: null, text: 'Board Backlog New task' })
  assert.equal(actionOutcome(before, before, [], { name: 'Archive' }).outcome, 'nothing_happened')
  assert.equal(actionOutcome(before, before, [], { name: 'Copy link' }).sure, false, 'copy buttons can work without a visible change')
  assert.equal(actionOutcome(before, screen({ ...before, textHash: '5:50' })).outcome, 'changed')
  assert.equal(actionOutcome(before, screen({ ...before, messages: [{ text: 'Task archived', prev: null }] })).outcome, 'done_with_feedback')
  assert.equal(actionOutcome(before, before, [{ method: 'PATCH', path: '/api/tasks/1', status: 200 }]).outcome, 'done_silently')
  assert.equal(actionOutcome(before, before, [{ method: 'DELETE', path: '/api/tasks/1', status: 403 }]).outcome, 'refused_silently')
  assert.equal(actionOutcome(before, screen({ ...before, messages: [{ text: 'You do not have permission to archive', prev: null }] })).outcome, 'refused_clear')
  assert.equal(actionOutcome(before, screen({ ...before, messages: [{ text: 'Something went wrong', prev: null }] })).outcome, 'refused_raw', 'a toast is a refusal, not a crash')
  assert.equal(actionOutcome(before, screen({ ...before, text: 'Something went wrong', textHash: '7:7' })).outcome, 'crashed', 'the page itself saying it is a crash')
  assert.equal(actionOutcome(before, screen({ ...before, url: 'http://app/login', passwordBox: true })).outcome, 'signed_out')
})
