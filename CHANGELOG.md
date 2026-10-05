# Changelog

All notable changes to blindqa. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] — 2026-10-05
### Changed
- **No AI model in the test loop.** Every judgment is now a script (`src/judge.mjs`), so the same screen
  always gets the same verdict and a run costs no model tokens:
  - crawls check each screen for error, blank or stuck-loading pages, raw ids, codes and timestamps shown to
    users, and control names a screen reader can't tell apart (symbol-only, or the same name on every row);
  - act mode reads a control's likely effect from its role, name and attributes, a field's kind from its
    type, autocomplete hint and label, and the outcome of every click or submit from what changed on screen
    and what the server answered. Outcomes the signals can't settle are kept with `"sure": false` for the
    agent (`blindqa_unsure`) instead of being reported.
- New act-mode findings: `submit-failed-silently` (form closed as if saved, server refused),
  `silent-refusal`, `crash-on-action`; sign-outs after a submit are reported too.
- Journeys get the same checks as `blindqa.judge`.
### Added
- Landing page (`site/`) built from 21st.dev components, pre-rendered to static HTML with structured data
  (SoftwareApplication, SoftwareSourceCode, FAQPage); docs pages restyled to match, with breadcrumbs, a 404
  page and `llms.txt`. "Star on GitHub" button with the live star count. CI type-checks and builds the site.
- Act mode works on one-screen apps (no navigation links): it acts where sign-in lands.
### Fixed
- Act mode no longer reports "silently nothing" for a form whose submit button a person can't reach (that
  is already reported as unreachable); the press is recorded as not done.
- The screen digest left out the wrong marker, so the robot's own cursor notice could count as a change.
### Removed
- The optional external judgment model and everything that used it: `doctor --jev`, `jev-ping`,
  `crawl --no-jev`, journey `--shadow` and `shadow-report`, MCP `blindqa_shadow_report` and
  `blindqa_escalations` (use `blindqa_unsure`), and the plugin's API-key settings. No keys are needed.

## [0.2.0] — 2026-10-05
### Added
- **Never-push guarantee** for `.blindqa/`: the folder ignores itself, an entry in `.git/info/exclude`,
  and a `pre-push` hook that refuses any push containing it; repos cloned for testing get pushing disabled.
  `blindqa guard [--install] [--hook-script]`, `blindqa layout`, MCP `blindqa_guard`, `blindqa_layout`.
- **Fixed folder layout** with a generated README inside `.blindqa/`.
- **Browser per machine** (`~/.blindqa/machine.json`): `local`, `headless`, `cdp` (isolated context),
  `neko` (n.eko container + docker-compose template), `orca` (experimental). `blindqa machine
  detect|set|show|test`, `blindqa template neko`, MCP `blindqa_machine`.
- **Code index and targeted re-tests**: `blindqa index`, `blindqa changes [--since ref]`,
  `blindqa retest [--run-tests] [--accept]`, MCP `blindqa_index`, `blindqa_changes`, `blindqa_retest`.
  Re-test comparisons count only the routes that were re-visited.
- Journeys record the routes they visit (`runs/<id>/journey.json`).
- **Skill family** for Claude Code and Codex: `blindqa`, `blindqa-setup`, `blindqa-run`,
  `blindqa-journeys`, `blindqa-retest`, `blindqa-triage`; Claude Code agent `blindqa-verifier` (Sonnet, read-only).
- Docs: INSTALL, BROWSERS, LAYOUT, RETEST, COSTS; contribution guidelines, security policy, tests and CI.
### Changed
- `blindqa doctor` also checks the browser mode and the never-push guard.
- MIT license.

## 0.1.0 — 2026-10-03 (not published)
### Added
- First portable version: CLI, MCP server, Claude Code and Codex plugin; project init from a GitHub link
  or folder; human-like harness; read-only crawler; act mode; journeys; background jobs; summaries and
  run comparison.

[Unreleased]: https://github.com/DevZonayed/blindqa/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/DevZonayed/blindqa/releases/tag/v0.3.0
[0.2.0]: https://github.com/DevZonayed/blindqa/releases/tag/v0.2.0
