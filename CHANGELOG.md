# Changelog

All notable changes to blindqa. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
- `blindqa doctor` also checks the browser mode and the never-push guard; the Jev key is optional.
- MIT license.

## 0.1.0 — 2026-10-03 (not published)
### Added
- First portable version: CLI, MCP server, Claude Code and Codex plugin; project init from a GitHub link
  or folder; human-like harness; read-only crawler with per-screen Jev judgments; act mode; journeys with
  shadow mode; background jobs; summaries and run comparison.

[Unreleased]: https://github.com/DevZonayed/blindqa/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/DevZonayed/blindqa/releases/tag/v0.2.0
