---
title: "blindqa — human-like QA testing for any web app"
description: "blindqa is an AI QA plugin for Claude Code and Codex, an MCP server and a CLI. It drives your web app in a real browser like a person, finds visual, accessibility, permission and workflow bugs, and re-tests only what your code changes touch."
---

![blindqa — human-like QA for any web app]({{ '/assets/social-preview.png' | relative_url }})

**blindqa** is an automated, human-like QA tester for web applications. It drives your app in a real
browser the way a person does — mouse-wheel scrolling, a visible cursor, clicking only what a person could
see and reach — signs in as every role, opens every menu and form, and reports the bugs real users would hit.
It ships as a **Claude Code plugin**, a **Codex plugin**, an **MCP server** and a **CLI**, built on
[Playwright](https://playwright.dev).

[Get it on GitHub](https://github.com/DevZonayed/blindqa) · [Install](INSTALL.md) · [Browser modes](BROWSERS.md) ·
[Re-test what changed](RETEST.md) · [The .blindqa folder](LAYOUT.md) · [Costs](COSTS.md)

## Install in two commands

**Claude Code**
```
/plugin marketplace add DevZonayed/blindqa
/plugin install blindqa@blindqa
```

**Codex**
```
codex plugin marketplace add DevZonayed/blindqa
codex plugin add blindqa@blindqa
```

Then ask your agent: *"Set up blindqa for this repo."* Full instructions: [Install](INSTALL.md).

## What it finds
- Buttons that are in the page but invisible, covered by a toast or sticky header, or clipped by their container
- Pages that stay scroll-locked after a dialog closes
- Menus that open off-screen; forms whose empty submit shows no error
- Buttons a role can see but the server refuses; permission rules that differ between UI and API
- Forms that accept nonsense; errors shown as raw developer text or behind the dialog
- Navigation that breaks at phone width

## Why it's different
- **It tests like a person, not like a DOM query.** A control counts as usable only if a person could see
  and reach it: not covered, clipped, transparent, off-screen or scroll-locked.
- **It re-tests only what changed.** A script-built code index maps your git changes to the pages they
  reach and re-runs just those crawls and journeys, reporting NEW, FIXED and STILL.
- **It is read-only by default.** Crawls block every write request; data-changing runs are opt-in.
- **It never pushes your QA data.** Everything lives in `.blindqa/`, ignored by git and guarded by a pre-push hook.
- **It keeps AI costs low.** Scripts do the repeatable work; the agent only sets up, writes journeys and verifies what's new.
- **It runs on any machine's browser:** a local window, headless CI, your Chrome over CDP, an n.eko container, or Orca.

## Open source
MIT licensed. Contributions welcome — see
[CONTRIBUTING](https://github.com/DevZonayed/blindqa/blob/main/CONTRIBUTING.md) and
[Discussions](https://github.com/DevZonayed/blindqa/discussions).
