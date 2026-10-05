---
title: "The .blindqa folder and the never-push guard"
description: "Where blindqa keeps QA data, and the three local layers that stop it from ever being committed or pushed to a git remote."
---

# The .blindqa/ folder — and why it never reaches a remote

Everything blindqa knows about an app lives in one folder at the root of the app's repo (or the folder you
pointed it at). `blindqa layout` prints this list.

| Path | Holds |
|---|---|
| `README.md` | what the folder is (regenerated) |
| `.gitignore` | `*` — git ignores everything in here, this file included |
| `profile.json` | apps (`baseUrl`, `loginPath`, `nav`), roles, start commands, mail catcher, safety rules |
| `credentials.json` | sign-in per role (owner-only file permissions) |
| `.env` | optional environment values for runs, e.g. `MAILPIT_URL` |
| `journeys/` | journey scripts written for this app |
| `index/` | code index: `state.json` (commit, branch, per-file hash), `facts.json`, `graph.json` |
| `runs/<id>/` | one run: `summary.md`, `findings.jsonl`, `map.json` (crawls), `journey.json` (journeys), `shots/`, `trace.log`, `effects.jsonl` (act mode) |
| `jobs/` | background jobs |
| `reports/` | re-test reports, the findings register (`FINDINGS.md`) |
| `sessions/` | saved sign-ins per role |
| `browser-profile/` | the local window's browser profile |

Machine-wide (not per app): `~/.blindqa/machine.json` (browser mode), `~/.blindqa/.env` (keys),
`~/.blindqa/projects/` (repos blindqa cloned for testing).

## Never committed, never pushed — three local layers
1. **`.blindqa/.gitignore` is `*`.** The folder ignores itself. Nothing in the repo's own `.gitignore` changes.
2. **`/.blindqa/` in `.git/info/exclude`.** Git's per-clone ignore list; it is never committed.
3. **A `pre-push` hook** that refuses any push whose commits contain a `.blindqa/` path — this catches
   `git add -f` and mistakes in other tools. It lives in `.git/hooks/`, which is never pushed.

Plus, for repos blindqa clones itself (`blindqa init <github-link>`): the push URL of every remote is set
to `DISABLED-by-blindqa-no-push`, so nothing at all can be pushed from that copy.

blindqa never edits tracked files to set this up, so installing it leaves `git status` clean.

`blindqa guard` checks all of it, plus: no `.blindqa/` file is tracked, and no unpushed local commit
contains one. `blindqa guard --install` repairs what is missing. `blindqa doctor` includes these checks.

### When blindqa leaves hooks alone
- **You already have a `pre-push` hook** (Husky, lefthook, your own): blindqa doesn't touch it. Add the
  check to it: `blindqa guard --hook-script` prints the script (POSIX sh, reads the refs git passes on stdin).
- **`core.hooksPath` is set** (a hooks folder inside the repo would be committed; a global one is shared by
  every repo): blindqa doesn't write there. Same fix as above.
Layers 1 and 2 still protect you in both cases.

### Something slipped in anyway
`blindqa guard` tells you which files. Untrack them (`git rm -r --cached .blindqa`) and take them out of the
local commits (amend or interactive rebase) before pushing. If it was already pushed, rotate any credentials
that were in `credentials.json`.
