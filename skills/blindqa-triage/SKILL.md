---
name: blindqa-triage
description: Decide which blindqa findings are real bugs, environment-only, or test noise; verify the important ones in the running app and in the code; keep a findings register in .blindqa/reports/; and write the report for people. Use after any blindqa run or re-test, or when the user asks what blindqa found or whether a finding is real.
---

# blindqa-triage

## Order of work
1. `blindqa_summary` for the run (or the re-test report). List what you will verify: every NEW
   high/critical finding, then `needsReview` ones, then `blindqa_escalations` (Jev unsure). Say the list.
2. Verify them one by one:
   - open the screenshot (`blindqa_findings { run, severity }` gives paths),
   - reproduce it in the running app if it isn't obvious from the screenshot,
   - find the code behind it — use `.blindqa/index/facts.json` (labels → file, routes → file,
     API route → controller and its permission decorators) to go straight to the right file,
   - decide: **real bug**, **environment-only** (missing third-party keys, dev mode, local time zone,
     test data), or **robot mistake** (the harness misjudged — say so; it's a blindqa bug, not an app bug).
3. Record each verified finding in `.blindqa/reports/FINDINGS.md` (create it if missing): number, severity,
   what a person experiences, where (screen + route), evidence (screenshot path, file:line),
   environment-only or not, first seen (run id), status. Re-tests update the status (still / fixed).
4. Report to the user: what was run, the verified findings by severity, what works, what was not covered.
   Keep unverified items clearly labelled.

## Cheaper verification with a sub-agent (ask first)
If the host offers the `blindqa-verifier` agent (Claude Code plugin; runs on Sonnet), it checks ONE finding
against its screenshot and the code and returns a verdict. Use it only after the user agrees, one finding
at a time, handing it the finding text, the screenshot path, the route and the likely file from the index —
never "go understand the app".

## Never
- Never file a finding you haven't seen evidence for.
- Never write findings anywhere but `.blindqa/` (or a document the user asked for) — the register stays
  out of the repo's history.
