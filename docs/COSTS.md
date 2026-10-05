---
title: "Costs — who does what"
description: "How blindqa keeps AI agent token use low: scripts do the repeatable work, Jev makes small calls, the agent only sets up and verifies."
---

# Who does what, and what it costs

| Work | Done by | Cost |
|---|---|---|
| Driving the browser, every visibility/scroll/contrast check, write blocking, permission probes, code index, change impact, re-test plan, run comparison | scripts | machine time only |
| Small judgment calls per screen (what kind of screen, raw codes on screen, unclear names, which control a step means) | Jev (optional) | ~$0.00002 per decision, cached across runs |
| Setting up a project, writing journeys, verifying new high-severity findings, writing reports | the coding agent (Claude Code, Codex, …) | model tokens — the only real cost |

## What costs tokens once, and what doesn't repeat
- **Once per app:** profile and roles, the first crawl per role, journeys for the core workflows. Most of
  the agent's work is here, and almost all of it is writing files that are reused.
- **Every re-test after a change:** `blindqa retest` decides what to run from the code index, runs it, and
  writes a short report. The agent reads that report and verifies what is new. A change that renames a
  button costs one short report; a new feature costs one new journey.
- **Never:** reading the whole codebase, watching a run, re-planning from scratch.

## Habits the skills enforce
- Plan first, then one item at a time.
- No sub-agents without asking the user; when used, the cheap read-only `blindqa-verifier` (Sonnet), one
  finding per call, with the evidence handed to it.
- Background jobs, one check later; summaries, not logs.
- Read a source file only when a script can't answer.

## Lessons this is built on
In the large end-to-end QA that blindqa grew out of, about two thirds of the agent usage went to 27
planning sub-agents that each re-read the codebase in parallel; almost none of their output was used. The
work that found the 64 verified bugs was one main session that read only the code each next test needed,
plus scripts that ran for free on every re-test. blindqa packages the second way.
