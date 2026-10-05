---
title: "Install blindqa for Claude Code, Codex or the CLI"
description: "How to install the blindqa QA plugin in Claude Code and Codex, use it as an MCP server or CLI, and set it up on a new machine."
---

# Install

Needs Node.js 20 or newer and git. Chromium for Playwright is installed on first use (`blindqa setup`, ~150 MB)
unless the machine uses a `cdp`, `neko` or `orca` browser.

## Claude Code (plugin)
```
/plugin marketplace add DevZonayed/blindqa       # or a local clone: /plugin marketplace add /path/to/blindqa
/plugin install blindqa@blindqa
```
Claude Code asks for the optional Jev (TypeSafe) key and stores it in its credential store.
You get: the `blindqa` MCP server (all `blindqa_*` tools), six skills (`blindqa`, `blindqa-setup`,
`blindqa-run`, `blindqa-journeys`, `blindqa-retest`, `blindqa-triage`) and the `blindqa-verifier` agent
(Sonnet, read-only, one finding at a time — the skills only use it after you agree).
Then ask: *"Set up blindqa for this repo"*, *"QA this app with blindqa"*, *"I changed some files — re-test with blindqa"*.

The main conversation keeps whatever model you run Claude Code with; sub-agents should be cheaper. The
`blindqa-verifier` agent already pins Sonnet. To make every other sub-agent default to Sonnet too, add this
to `~/.claude/settings.json` (present in Claude Code 2.1.289):
```json
{ "env": { "CLAUDE_CODE_SUBAGENT_MODEL": "claude-sonnet-5-5" } }
```

## Codex (plugin)
```
codex plugin marketplace add DevZonayed/blindqa  # or a local clone path
codex plugin add blindqa@blindqa
```
Put the optional Jev key in `~/.blindqa/.env` (`TYPESAFE_API_KEY=…`). Codex gets the MCP server and the six
skills (Codex has no plugin agents; the triage skill works without one).

## Any other agent or MCP client
`node /path/to/blindqa/mcp/launch.mjs` — an MCP server on stdio. It installs its own dependencies on first start.

## CLI only
```
git clone https://github.com/DevZonayed/blindqa.git && cd blindqa && npm install
node bin/blindqa.mjs setup                        # Chromium for Playwright, once
node bin/blindqa.mjs machine detect               # which browser this machine should use
node bin/blindqa.mjs init <github-link | owner/repo | folder>
node bin/blindqa.mjs doctor
```
Plugin hosts put `bin/` on PATH, so inside Claude Code / Codex shells `blindqa <command>` works directly.

## After installing on a new machine
1. `blindqa machine detect` → `blindqa machine set --browser …` if the suggestion isn't `local` (see BROWSERS.md).
2. In each app repo: `blindqa init .` (creates `.blindqa/`, installs the never-push guard), fill roles and
   credentials, `blindqa doctor`.
Projects copied from another machine keep working: the browser setting is per machine, the project is not.
