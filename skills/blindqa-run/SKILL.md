---
name: blindqa-run
description: Run blindqa tests — read-only crawls of every screen per role (desktop and phone), act mode that uses every option with real writes, scripted journeys, all as background jobs — and read the results cheaply. Use when asked to crawl, test, or check a web app that already has a .blindqa/ project, or to look at the results of a run.
---

# blindqa-run

## Plan, then run one by one
Before starting, state the order. A good default for a first full pass:
1. a crawl per role, most privileged first (desktop), 2. the same at phone width for the main roles,
3. journeys for the core workflows (`blindqa-journeys`), 4. act mode only where test writes are allowed.

## Crawl (read-only)
`blindqa_crawl { role }` — signs in as the role, then one top-to-bottom pass per page: visibility of every
control (covered, clipped, transparent, unnamed, low contrast, tiny), ⋯ menus, dropdowns, "New/Add" forms
with an empty-submit probe, tabs and sections in order. Every write request is blocked at the network, so
nothing in the app changes.
- `phone: true` → 390×844 through the ☰ menu. `headless: true` → no window.
- `only: "^(Clients|Settings)$"` → just those nav items. `start: "/books/<id>"` → every screen linked from a hub page.
- `max` → screen budget (default 60).

## Act mode (REAL writes)
`blindqa_act { role }` uses every option on every screen (fills and submits forms with valid values, does
actions) and records what each one did. Destructive actions only on records the run created. Only against
local or test environments, and say so to the user before starting.

## Journeys
`blindqa_journey { file }` runs a scripted end-to-end flow; see `blindqa-journeys` to write one.

## Background jobs
Every run tool returns a job id at once. Check back **once**, a few minutes later: `blindqa_job { id }` →
RUNNING with the last lines, or DONE with the run's summary. `blindqa_jobs` lists them, `blindqa_stop` stops one.

## Reading results (cheap first)
1. `blindqa_summary { run }` — findings grouped by severity, ≤ 200 lines. Start here.
2. `blindqa_findings { run, severity: "high" }` — screens and screenshot paths for the ones you verify.
3. `blindqa_escalations { run }` — answers Jev was unsure about; decide them yourself.
4. `blindqa_compare { before, after }` — NEW / GONE / STILL between two runs.
Then hand over to `blindqa-triage` to decide what is real and write it up.

## Which browser
The machine's mode (`blindqa_machine`) decides: a local window, headless, an attached Chrome, an n.eko
container people can watch, or Orca's browser. In visible modes, ask the user to keep their mouse off the
window — the run logs any step where human input happened.
