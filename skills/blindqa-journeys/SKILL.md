---
name: blindqa-journeys
description: Write, run and repair blindqa journeys — short scripts in .blindqa/journeys/ that walk a real workflow end to end (sign in, create data, switch roles, check figures) with the human-like harness, reused on every run and every re-test. Use when a workflow needs testing with real data, when a re-test reports an affected route no crawl covers, or when a journey step fails.
---

# blindqa-journeys

A journey is written once and reused forever, so it is worth getting right — and it is the only place you
read the app's source: just the screens the journey touches, just enough to know their labels.

## Shape
```js
/** J01: a manager raises an invoice and a second person authorises it. */
const { session, openAs, humanClick, humanFill, settle, finding, runJourney, flushSignals, waitToast } = globalThis.blindqa

const s = await session()                                  // the machine's browser (local, cdp, neko, orca) or headless
await runJourney('J01 invoice', async () => {
  const page = await openAs(s, 'MANAGER')                  // signs in from profile + credentials, reuses saved sessions
  await humanClick(page, page.getByRole('link', { name: 'Invoices' }), 'Open Invoices')
  await humanClick(page, page.getByRole('button', { name: /new invoice/i }), 'Start a new invoice')
  await humanFill(page, page.getByLabel('Amount'), '1000', 'Amount')
  await humanClick(page, page.getByRole('button', { name: 'Save' }), 'Save the invoice')
  if (!(await waitToast(page, /saved/i))) await finding(page, 'no-feedback', 'medium', 'Saving an invoice shows no confirmation')
  await flushSignals(page)                                  // console errors and failed requests become findings
})
await s.close()
```
- Reach screens by clicking from where a person starts (sidebar → tab → row ⋯ menu), never by typing URLs —
  except as a deliberate permission check.
- Locate by role and visible name (`getByRole`, `getByLabel`), not CSS classes or test ids.
- Give each `humanClick` the label a tester would say ("Start a new invoice"): shadow mode asks Jev to find
  the control from it, and its accuracy tells you when plain-language steps are reliable.
- Check outcomes the way the user would see them (the row, the total, the toast), and report problems with
  `finding(page, kind, severity, detail)`. Prefer one journey per workflow, split into phases that can be
  re-run from the middle.
- Unique names for anything you create (a run id in the name), so re-runs don't collide.

## Finding labels without reading the whole app
`blindqa_changes { json: true }` and `.blindqa/index/facts.json` hold every file's visible labels and the
page route it renders. Look up the screen's file there, then read only that file if you still need to.

## Run and repair
- `blindqa_journey { file: ".blindqa/journeys/j01.mjs" }` (background job), then `blindqa_job` once.
- `shadow: true` also measures Jev against your script without changing what the script does.
- A step that fails: open the step's screenshot from `blindqa_findings`, compare the label with the
  index facts for that file (a renamed button shows as `labels +1/-1` in `blindqa_changes`), fix the
  locator, re-run from that phase.
- Each run records the routes it visited (`runs/<id>/journey.json`), which is how `blindqa_retest` knows
  to re-run this journey when one of those pages changes.
