---
name: blindqa-retest
description: Re-test only what changed — after code edits, new commits, or on a PR branch — using blindqa's code index (git commit + per-file hashes + script-extracted facts) to find the affected pages, then re-running just the crawls and journeys that cover them and reporting NEW / FIXED / STILL. Use when the user changed some files, pulled commits, or asks to check a PR or a branch with blindqa.
---

# blindqa-retest

The first full run is paid once. After that, a change costs a few minutes of machine time and only a short
report for you to read — scripts work out what changed and what to re-run.

## Steps (say them, then do them in order)
1. **What changed** — `blindqa_changes` (against the indexed baseline) or `blindqa_changes { since: "main" }`
   (against a branch or commit). It lists changed files and which facts changed (labels, pages, API routes,
   permission decorators), the affected page routes and why, affected API routes, and whether the change
   is WIDE (global layout/CSS, config, dependencies, migrations → re-test everything).
2. **Plan** — `blindqa_retest` (no `run`) shows the steps: crawls limited to the nav items that reach the
   affected routes, plus the journeys that pass through them. Tell the user the plan.
3. **Run** — `blindqa_retest { run: true }` (background job; add `headless: true` for unattended),
   then `blindqa_job { id }` once later. The report lists, per step, NEW / FIXED / STILL — compared only on
   the screens that were re-visited, so a partial re-test never claims untouched screens are fixed.
4. **Triage** the NEW items (`blindqa-triage`). FIXED items are evidence for the change that fixed them.
5. **Accept** — when the user is happy with the results, `blindqa_retest { run: true, accept: true }` next
   time, or `blindqa_index` now, moves the baseline to the current commit.

## When to read code (and when not)
- Don't read the diff to decide what to test — the plan already did that.
- Read only: (a) files listed under "labels computed at runtime" if a step fails there, (b) a new page or
  feature no earlier run covers ("affected but not covered" in the report) — write a journey for it
  (`blindqa-journeys`), (c) the code behind a NEW high/critical finding when verifying it.

## PR branches
Check out the PR in a separate clone (`blindqa_init` with the repo link clones with pushing disabled), build
and start it, then `blindqa_changes { since: "<base-branch>" }` → plan → run. Never comment on, push to, or
otherwise write to the PR unless the user asks.

## Limits to tell the user about
Impact follows imports and UI calls to changed endpoints. It can't see: API paths built from variables,
behaviour that depends on data or feature flags, third-party services. Changes to global files trigger a full
re-test for that reason. Keep a full run on a schedule (nightly or before a release) as the safety net — it
costs machine time, not model tokens.
