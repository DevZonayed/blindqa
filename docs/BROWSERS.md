---
title: "Browser modes — local, headless, CDP, n.eko, Orca"
description: "Run blindqa against a local Playwright window, headless CI, your own Chrome over CDP, an n.eko container or Orca, with exact setup steps for each machine."
---

# Browsers — one setting per machine

Projects move between machines; browsers don't. So blindqa keeps the browser choice in
`~/.blindqa/machine.json` on each machine, never in the project. Override it for one shell with
`BLINDQA_BROWSER`, `BLINDQA_CDP_URL`, `BLINDQA_VIEWER_URL`.

```
blindqa machine detect          # what this machine has, and a suggestion
blindqa machine set --browser <local|headless|cdp|neko|orca> [--cdp-url …] [--viewer-url …] [--tab new|reuse]
blindqa machine show            # what is in force and where it came from
blindqa machine test            # inside a project: open the browser, load a page, close cleanly
blindqa machine set --reset     # back to the default (local)
```

Every mode gives the robot the same thing — a Playwright page — so crawls, journeys, the visible cursor,
the visibility checks and the write blocker work the same in all of them.

| Mode | Use when | What blindqa does with the browser |
|---|---|---|
| `local` (default) | a desktop with a screen | starts Playwright's Chromium once (port 9333), keeps that one window open across runs, swaps cookies to switch roles |
| `headless` | CI, servers without a display, unattended or parallel runs | a private headless Chromium per run |
| `cdp` | you want it to drive a Chrome that is already running | attaches over the DevTools protocol, works in an **isolated context** (own window, own cookies) and removes it afterwards — your profile is never touched |
| `neko` | a shared browser in an n.eko container that people watch live | attaches over DevTools, reuses the container's tab, leaves the browser running |
| `orca` | you want the run inside Orca's built-in browser | experimental: asks Orca for its browser's DevTools address and attaches |

`--headless` on any command always wins.

## local
Nothing to configure. `blindqa setup` installs the Chromium build Playwright drives (once).
Keep your mouse off the window while a run is going — the robot's cursor is drawn only from its own moves,
and any step where real mouse input happened is marked in the log.

## headless
`blindqa machine set --browser headless` — or add `--headless` to a single command. Linux servers need the
browser libraries once: `npx playwright install --with-deps chromium`.

## cdp — your own Chrome (or any Chromium with remote debugging)
Start Chrome with remote debugging on **a separate profile** (Chrome refuses remote debugging on your
default profile, and you don't want that anyway):

```
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir="$HOME/.blindqa/chrome-cdp"
# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.blindqa/chrome-cdp"
# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="$env:USERPROFILE\.blindqa\chrome-cdp"
```
then `blindqa machine set --browser cdp --cdp-url http://127.0.0.1:9222`.

- Remote machine: don't open the port to the network — tunnel it: `ssh -N -L 9222:127.0.0.1:9222 you@host`,
  then use `http://127.0.0.1:9222` locally.
- Chrome rejects DevTools requests whose `Host` header is a name other than `localhost` — use an IP address.
- `--tab reuse` drives the first existing tab instead of an isolated context (only for a browser that exists
  just for testing).
- Hosted browsers (Browserless and similar) give you a `ws://…` or `wss://…` address: pass it as `--cdp-url`.

## neko — a browser in a container that people can watch
[n.eko](https://github.com/m1k1o/neko) runs a desktop browser in Docker and streams it to a web page, so a
team can watch the robot (and take over) live. blindqa ships a compose file that also exposes Chromium's
DevTools port to the host:

```
blindqa template neko ~/blindqa-neko
cd ~/blindqa-neko && docker compose up -d
blindqa machine set --browser neko --cdp-url http://127.0.0.1:9222 --viewer-url http://127.0.0.1:8080
blindqa machine test
```
Watch at http://127.0.0.1:8080 (user password `neko`, admin `admin` — change them in the compose file).

How it works: the image's Chromium launcher reads `/etc/chromium.d/*`; the template mounts a file there that
adds `--remote-debugging-port=9223`. Chromium only listens on the container's loopback, so a small `socat`
sidecar in the same network namespace forwards 9222 → 9223, and compose publishes 9222 on the host's
`127.0.0.1` only.

If `machine test` can't connect:
- `docker compose logs neko` — Chromium started? (`curl http://127.0.0.1:9222/json/version` should answer)
- your neko image may launch Chromium differently: add `--remote-debugging-port=9223` to its supervisord
  command instead (see the neko docs for your version), keep the `cdp` sidecar.
- the template follows neko v3 variable names; older images use `NEKO_SCREEN`, `NEKO_PASSWORD`,
  `NEKO_PASSWORD_ADMIN`, `NEKO_EPR`, `NEKO_ICELITE`, `NEKO_NAT1TO1`.
- teammates on other machines: change the `8080` port line to listen on the LAN and set
  `NEKO_WEBRTC_NAT1TO1` to this machine's LAN IP. Never publish 9222 beyond localhost.

The viewer is for people; blindqa only needs the DevTools port. `blindqa doctor` checks both.

## Orca
Orca (the agent workspace app) works with blindqa in two ways:
1. **Recommended — local mode in an Orca terminal.** Run blindqa (CLI, or Claude Code / Codex with the
   plugin) in an Orca terminal as usual; it opens its own Chromium window next to Orca. Nothing to configure.
2. **Experimental — Orca's built-in browser.** `blindqa machine set --browser orca`. blindqa asks the `orca`
   CLI for the built-in browser's DevTools address (`orca exec --command "get cdp-url"`) and attaches to it.
   Needs: Orca running, the project folder opened as an Orca worktree, a browser tab open there
   (blindqa opens `about:blank` if none). If Orca doesn't hand out an address, `blindqa doctor` says so —
   switch back with `blindqa machine set --reset`.

Orca's own `orca snapshot/click/fill` commands are a different automation style (accessibility refs, no
Playwright) — blindqa doesn't use them; its human-like checks need a Playwright page.

## Which one is in force?
`blindqa doctor` prints `browser (<mode>, from <source>)` and checks it can be reached.
