# blindqa

Human-like QA for any web app, as a Claude Code plugin, a Codex plugin, an MCP server and a CLI.

It drives the app in a real browser the way a person does — wheel scrolling, a visible cursor, clicking only
what a person could see and reach — and reports what a real user would hit: invisible or covered controls,
stuck dialogs, broken menus, forms that accept nonsense, buttons the server refuses, errors on screen.
After the first run it re-tests **only what your code changes touch**, from a script-built code index.

- **Scripts do the work** (driving, checks, impact analysis, comparisons) — free to re-run.
- **Jev** (optional, TypeSafe) makes small judgment calls for ~$0.00002 each.
- **Your coding agent** sets things up, writes journeys, verifies what's new — the only real cost.
- **Nothing it writes ever reaches a git remote**: one `.blindqa/` folder, self-ignored, excluded, guarded by a pre-push hook.
- **One browser setting per machine**: a local window, headless, your Chrome over CDP, an n.eko container people can watch, or Orca.

## Install

Requirements: **Node.js 20+** and **git**. The first run installs the plugin's dependencies and (for the
default browser mode) Chromium for Playwright.

### Claude Code
In Claude Code:
```
/plugin marketplace add DevZonayed/blindqa
/plugin install blindqa@blindqa
```
or from a terminal:
```
claude plugin marketplace add DevZonayed/blindqa
claude plugin install blindqa@blindqa
```
Restart Claude Code, then ask: *"Set up blindqa for this repo."* You get the `blindqa` MCP server
(`blindqa_*` tools), six skills and the `blindqa-verifier` agent. Claude Code asks for the optional Jev
(TypeSafe) key on install; leave it empty to run with fixed rules only.

Update: `claude plugin marketplace update blindqa && claude plugin update blindqa@blindqa`
· Remove: `claude plugin uninstall blindqa@blindqa && claude plugin marketplace remove blindqa`

### Codex
```
codex plugin marketplace add DevZonayed/blindqa
codex plugin add blindqa@blindqa
```
Start a new Codex session and ask the same way. Optional Jev key: `TYPESAFE_API_KEY=…` in `~/.blindqa/.env`.

Update: `codex plugin marketplace upgrade` (then `codex plugin add blindqa@blindqa` again)
· Remove: `codex plugin remove blindqa@blindqa && codex plugin marketplace remove blindqa`

### Command line / any MCP client
```
git clone https://github.com/DevZonayed/blindqa.git && cd blindqa && npm install
node bin/blindqa.mjs setup            # Chromium for Playwright, once
node bin/blindqa.mjs help
```
MCP server on stdio for any other client: `node /path/to/blindqa/mcp/launch.mjs`.

More: [docs/INSTALL.md](docs/INSTALL.md) (first steps on a new machine, sub-agent model settings).

## Workflow
```
blindqa machine detect                 # this machine's browser (docs/BROWSERS.md)
blindqa init <github-link | folder>    # .blindqa/ + never-push guard (docs/LAYOUT.md)
blindqa doctor                         # everything green?
blindqa crawl --role ADMIN --bg        # read-only crawl per role; journeys for workflows
blindqa index                          # baseline
# … code changes …
blindqa changes && blindqa retest --run-tests     # only what changed (docs/RETEST.md)
```
In Claude Code or Codex just ask — the skills know the order: *"set up blindqa for this repo"*,
*"crawl every role"*, *"write a journey for invoicing"*, *"I changed some files, re-test"*, *"which findings are real?"*.

## Package contents
| Path | What |
|---|---|
| `bin/blindqa.mjs` | the CLI (`blindqa help` lists every command) |
| `mcp/` | MCP server (stdio) with every command as a `blindqa_*` tool; `launch.mjs` installs dependencies on first start |
| `skills/` | `blindqa` (start here + rules), `blindqa-setup`, `blindqa-run`, `blindqa-journeys`, `blindqa-retest`, `blindqa-triage` — shared by Claude Code and Codex |
| `agents/blindqa-verifier.md` | Claude Code sub-agent: Sonnet, read-only, verifies one finding |
| `src/` | harness (`browser/`), crawler, act mode, journeys runner, auth (password, 2FA by app or email, magic links, OTP), Jev engine, code index (`index/`), guard, machine settings |
| `templates/neko/` | docker-compose for an n.eko Chromium with DevTools exposed to localhost |
| `docs/` | INSTALL, BROWSERS, LAYOUT, RETEST, COSTS |
| `.claude-plugin/`, `.codex-plugin/`, `.agents/plugins/` | plugin and marketplace manifests |

## Commands
| CLI | MCP tool | What |
|---|---|---|
| `machine detect\|set\|show\|test` | `blindqa_machine` | this computer's browser mode |
| `init <src>` | `blindqa_init` | clone (push disabled) or adopt a repo; create `.blindqa/`; install the guard |
| `guard [--install]` / `layout` | `blindqa_guard` / `blindqa_layout` | never-push checks / folder layout |
| `doctor [--jev]` | `blindqa_doctor` | browser, guard, app, roles, credentials, mail, Jev |
| `setup` | `blindqa_setup` | Chromium for Playwright |
| `crawl --role R [--phone] [--only re] [--start /path] [--headless] [--bg]` | `blindqa_crawl` | read-only crawl |
| `act --role R` | `blindqa_act` | use every option (real writes; test environments only) |
| `journey <file> [--shadow]` | `blindqa_journey` | run a journey |
| `index` / `changes [--since ref]` / `retest [--run-tests] [--accept]` | `blindqa_index` / `blindqa_changes` / `blindqa_retest` | code index, change impact, targeted re-test |
| `jobs` / `job <id>` / `stop <id>` | `blindqa_jobs` / `blindqa_job` / `blindqa_stop` | background runs |
| `runs` / `summary [run]` / `compare a b` | `blindqa_runs` / `blindqa_summary` / `blindqa_compare` | results |
| — | `blindqa_findings` / `blindqa_escalations` / `blindqa_profile` | details for verification |
| `shadow-report <run>…` | `blindqa_shadow_report` | Jev accuracy on scripted journeys |

## Status (0.2)
Tested on this machine: never-push guard against a local remote (normal pushes pass; force-added
`.blindqa/` files refused on existing and new branches), `cdp` mode against a Chromium with remote
debugging (isolated context removed after the run), headless and local modes, the code index on a
3,312-file monorepo (~0.5 s), change impact (label edit → its page; server change → the pages calling its
endpoints), and a full change → plan → targeted re-test → NEW/FIXED/STILL → accept cycle on a demo app.
Not yet run here: `neko` mode (template provided, image not pulled), `orca` mode (experimental).

## License
MIT — see [LICENSE](LICENSE).
