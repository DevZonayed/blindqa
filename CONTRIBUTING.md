# Contributing to blindqa

Thanks for helping. blindqa is a human-like QA tool for web apps that ships as a Claude Code plugin, a
Codex plugin, an MCP server and a CLI. This page is everything you need to get a change merged.

## Ways to contribute
- **Report a bug** — [open an issue](https://github.com/DevZonayed/blindqa/issues/new/choose) with the
  bug form. Include `blindqa doctor` output and the run's `summary.md` (remove anything private).
- **A false finding** (blindqa reported a problem a person wouldn't have) — use the "False finding" form.
  These are bugs in the robot, and they are the most valuable reports we get.
- **A new browser setup** (a remote browser service, a container image, another agent workspace) — use the
  "Browser / machine setup" form, or send a PR that adds it to `docs/BROWSERS.md`.
- **Framework support for the code index** (a router or server framework the extractor doesn't know yet) —
  see "Changing the code index" below.
- **Docs and skills** — clearer instructions are always welcome.
- **Questions and ideas** — [Discussions](https://github.com/DevZonayed/blindqa/discussions).
- **Security issues** — never in public issues; see [SECURITY.md](SECURITY.md).

## Development setup
```
git clone https://github.com/DevZonayed/blindqa.git && cd blindqa
npm install                      # also installs Chromium for Playwright (skip with: npm install --ignore-scripts)
npm test                         # fast checks, no browser needed
node bin/blindqa.mjs help
```
Try your change in a real app: `node bin/blindqa.mjs init /path/to/app`, then crawl, journey or re-test.
Load your working copy as a plugin with `/plugin marketplace add /path/to/blindqa` (Claude Code) or
`codex plugin marketplace add /path/to/blindqa` (Codex, ideally with a throwaway `CODEX_HOME`).

Requirements: Node.js 20+, git. No build step — the code is plain ES modules.

## Project layout
| Path | What |
|---|---|
| `bin/blindqa.mjs` | CLI — every command |
| `mcp/server.mjs` | MCP server — every command as a `blindqa_*` tool |
| `skills/*/SKILL.md` | skills shared by Claude Code and Codex |
| `agents/` | Claude Code sub-agents |
| `src/browser/` | the human-like harness: session (browser modes), cursor, visibility checks, extraction |
| `src/crawl.mjs`, `src/act.mjs`, `src/run-journey.mjs` | the runners |
| `src/auth/` | sign-in: password, 2FA by authenticator or email, magic links, OTP |
| `src/index/` | code index, change impact, targeted re-tests |
| `src/guard.mjs`, `src/layout.mjs` | the `.blindqa/` folder and its never-push guard |
| `src/machine.mjs` | per-machine browser settings and detection |
| `src/jev/` | optional Jev judgment engine |
| `test/` | `npm test` |
| `docs/` | user docs, published as the website with GitHub Pages (Jekyll; layout in `docs/_layouts/`) |
| `site/` | the landing page: React + Tailwind + components from 21st.dev, pre-rendered into `docs/index.html` |

## Rules every change follows
1. **Keep the three surfaces in sync.** A new or changed command updates the CLI (`bin/blindqa.mjs` + its
   help comment), the MCP tool (`mcp/server.mjs`) and the skill that tells agents when to use it. Update
   `README.md`'s command table and the right page in `docs/`.
2. **Never weaken the never-push guarantee.** Nothing blindqa writes may leave `.blindqa/`; blindqa must
   never edit a project's tracked files (its `.gitignore` included) or push anywhere.
3. **Reads stay read-only.** Crawls must not change app data: keep the network write-blocker in place.
   Anything that writes (act mode, journeys) is opt-in and documented as such.
4. **Scripts before tokens.** Prefer a deterministic check or a regex over asking a model. If a model is
   needed, it is Jev (small, cached, with a confidence threshold) — not the calling agent.
5. **A person's view decides.** Visibility checks must reflect what a person can see and use (covered,
   clipped, transparent, off-screen, scroll-locked), not what is in the DOM.
6. **No secrets, no private data** in code, tests, fixtures, docs or issues.
7. **Small dependencies.** Runtime deps are `playwright`, `@modelcontextprotocol/sdk` and `zod`. Adding one
   needs a reason in the PR.
8. **Match the surrounding code.** ES modules, 2-space indent, no semicolons, single quotes, short functions
   with a one-line comment saying why — look at the file you're editing and follow it.

## Changing the code index
- Facts come from `src/index/extract.mjs` (regex, no model). Add a fixture-based test in
  `test/extract.test.mjs` for every new pattern, including one that must **not** match.
- **Bump `EXTRACTOR_VERSION`** whenever extraction output changes, so stored indexes are re-read.
- Impact logic lives in `src/index/changes.mjs`; keep it conservative but not wide: a change that marks
  every page affected is a bug (see the generic-API-client and test-fixture cases in the tests).

## Adding a browser mode
Add it to `MODES` and `resolveBrowser` in `src/machine.mjs`, open it in `openSession` in
`src/browser/session.mjs` (return the same `{ browser, context, page, close }` shape), add a reachability
check in `src/doctor.mjs`, detection in `detectMachine`, and a section in `docs/BROWSERS.md` with exact
setup steps. A mode that attaches to someone's own browser must use an isolated context.

## The website
The landing page lives in `site/` and is built into `docs/index.html` + `docs/assets/site/` (commit the
output; GitHub Pages serves `docs/` as is):
```
cd site && npm install
npm run dev          # live preview
npm run typecheck && npm run build
```
The build pre-renders the page to static HTML (so search engines and link previews see all of it) and
adds structured data (SoftwareApplication + FAQPage from `site/src/content.ts`). Keep text visible
without JavaScript — use the `.reveal` CSS class for entrance effects, not JS-driven opacity. The other
pages are the markdown files in `docs/`, rendered by Jekyll with `docs/_layouts/default.html`.

## Tests and checks
- `npm test` must pass (CI runs it on Node 20 and 22).
- If you touched the plugin: `claude plugin validate ./.claude-plugin/plugin.json`, `claude plugin validate ./skills`
  and `claude plugin validate ./agents` (needs Claude Code), and an install with a throwaway `CODEX_HOME`.
- If you touched runners or the harness: run a crawl against a real app and say which in the PR.

## Commits and pull requests
- One topic per PR; describe what a user will notice and how you tested it.
- Commit messages: a short imperative summary line ("Add Fastify route extraction"), then why.
- Fill in the PR template's checklist. Add a line to `CHANGELOG.md` under "Unreleased".
- By contributing you agree your work is released under the [MIT License](LICENSE).

## Releases (maintainers)
Bump the version in `package.json`, `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` (the tests
check they match), move "Unreleased" in `CHANGELOG.md` under the new version, tag `vX.Y.Z`, and publish a
GitHub release with the changelog section.

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.
