---
name: blindqa
description: Human-like QA for web apps with blindqa — start here. Routes to the right blindqa skill (setup, run, journeys, retest, triage) and holds the rules every blindqa task follows (cost, never push, plan first). Use when asked to QA, test, crawl, audit or re-test a web app or a repo of one, or when anything mentions blindqa or a .blindqa/ folder.
---

# blindqa — start here

blindqa tests a web app the way a person uses it: a real browser, wheel scrolling, a visible cursor,
clicking only what a person could see and reach. Scripts do the driving and the checking; Jev (optional,
~$0.00002 per decision) makes small judgment calls; **you, the agent, are the expensive part** — you set
things up, decide what to run, read short reports and verify what matters.

## Which skill
| Task | Skill |
|---|---|
| First time on this machine or this app: browser mode, project folder, roles, credentials, never-push guard | `blindqa-setup` |
| Crawl every role, phone width, act mode, background jobs, reading results | `blindqa-run` |
| Write or fix a scripted journey (real data, end to end) | `blindqa-journeys` |
| After code changed or for a PR: re-test only what changed | `blindqa-retest` |
| Decide which findings are real, write the report / findings register | `blindqa-triage` |

Tools: the `blindqa_*` MCP tools; without MCP, the same commands as `blindqa <command>`
(or `node <blindqa>/bin/blindqa.mjs <command>`). Every tool/command takes a project path; default is the
nearest `.blindqa/` above the current folder.

## Rules for every blindqa task
1. **Plan first, then one by one.** Say the order you will work in (fastest and most valuable first,
   with why), then do the items one at a time and finish with a per-item result table.
2. **Scripts before tokens.** Never read the codebase to "understand the app". The crawl map, the code index
   (`blindqa_index`/`blindqa_changes`) and run summaries are the map. Read a source file only when a script
   can't answer (a failing journey step, a label computed at runtime, a new feature that needs a journey).
3. **No sub-agents without asking.** Never start parallel agents on your own; ask the user first and say
   roughly what they cost. If the user agrees and the host supports it, the `blindqa-verifier` agent
   (Sonnet) checks one finding at a time.
4. **Long runs in the background.** Start crawls/journeys/re-tests as jobs, check back once with
   `blindqa_job`; don't poll in a loop, don't watch logs. Read `summary.md`, not raw output.
5. **Never push QA files.** Everything blindqa writes lives in `<repo>/.blindqa/`, which git ignores and a
   pre-push hook guards (`blindqa_guard`). Never `git add -f` anything in it, never move its files elsewhere
   in the repo, never edit the project's own `.gitignore` for it. Repos blindqa clones for testing have
   pushing disabled. Don't write to the app's repo or remote at all unless the user asks.
6. **Reads are free, writes are not.** Crawls are read-only (writes blocked at the network). Journeys and
   act mode change data: only against local/test environments.
7. **Say what you verified.** Report what was run and seen; mark anything unverified as such.

## The .blindqa/ folder
`profile.json` (apps, roles, start commands) · `credentials.json` (logins, owner-only) · `journeys/` ·
`index/` (code index + baseline commit) · `runs/<id>/` (summary.md, findings.jsonl, map.json, shots/) ·
`reports/` · `jobs/` · `sessions/` · `cache/` · `browser-profile/`. `blindqa_layout` prints it.
