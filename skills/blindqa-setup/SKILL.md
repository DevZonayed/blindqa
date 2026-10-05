---
name: blindqa-setup
description: Set up blindqa on a machine and for an app — pick the browser this machine drives (local window, headless, your own Chrome over CDP, an n.eko container, or Orca), create the project's .blindqa/ folder from a GitHub link or folder, fill roles and logins, prove nothing can be pushed, and get blindqa_doctor all green. Use before the first blindqa run on a new machine or app, or when doctor fails.
---

# blindqa-setup

Work in this order and report each step's result.

## 1. This machine's browser (once per machine)
Browsers differ per machine, so this setting lives in `~/.blindqa/machine.json`, never in the project.
1. `blindqa_machine { action: "detect" }` → what the machine has (Playwright Chromium, Chrome, Docker,
   n.eko containers, open CDP ports, Orca) and a suggested mode.
2. Pick the mode with the user if it isn't obvious:

| Mode | When | Set it |
|---|---|---|
| `local` (default) | a desktop with a screen; also inside Orca's terminals | nothing to set |
| `headless` | CI, servers without a display, unattended runs | `browser: "headless"` |
| `cdp` | drive a Chrome that is already running with remote debugging | `browser: "cdp", cdpUrl: "http://127.0.0.1:9222"` |
| `neko` | a browser in an n.eko container that people watch in its web viewer | `browser: "neko", cdpUrl, viewerUrl` |
| `orca` | Orca's built-in browser (experimental) | `browser: "orca"` |

   `blindqa_machine { action: "set", browser, cdpUrl?, viewerUrl? }` saves it. Environment variables
   `BLINDQA_BROWSER`, `BLINDQA_CDP_URL`, `BLINDQA_VIEWER_URL` override it for one shell.
3. Details per mode (starting Chrome with remote debugging, the n.eko docker-compose template, SSH tunnels,
   Orca requirements): `docs/BROWSERS.md` in the blindqa package. For n.eko: `blindqa template neko <dir>`,
   then `docker compose up -d` there.
4. In `cdp` mode blindqa works in an **isolated context** (own window, own cookies) and removes it after the
   run, so a person's own Chrome profile is never touched. `neko` and `orca` reuse their tab.
5. `blindqa machine test` (CLI) opens the browser, loads a page, and closes cleanly.

Local/headless need Chromium for Playwright once: `blindqa_setup`.

## 2. The app's project folder
1. `blindqa_init { source }` with a GitHub URL, `owner/repo`, or a local folder.
   - A link is cloned to `~/.blindqa/projects/<repo>` with **pushing disabled** for every remote.
   - It creates `<repo>/.blindqa/` with the fixed layout and installs the never-push guard.
2. `blindqa_guard` must be all OK. If it reports tracked or unpushed `.blindqa/` files, tell the user and
   show the fix it prints — don't rewrite their git history yourself. If they already have their own
   pre-push hook or `core.hooksPath`, blindqa leaves it alone: tell them `blindqa guard --hook-script`
   prints the check to add.
3. Fill `.blindqa/profile.json` — read the repo's README / docker-compose / .env.example only as far as needed:
   - `apps.<name>`: `baseUrl`, `loginPath`, `nav` (CSS selector of the main navigation),
   - `start.commands` and `start.health` (how to start the app; run them yourself),
   - `roles.<ROLE>`: `{ "app": "<name>", "login": "password" | "email-link" | "otp" | "none" }`,
   - `mail.mailpit` if the app sends sign-in or invitation emails to a mail catcher.
4. `.blindqa/credentials.json`: `{ "roles": { "ADMIN": { "email": "…", "password": "…", "totpSecret"?: "…", "mfaByEmail"?: true } } }`.
   Seed users through the app's own sign-up/invite flow or seed script if there are no demo accounts.
   Never print passwords back to the user.
5. `blindqa_doctor` until every line is OK.

## 3. Baseline (once per app)
Crawl every role once (`blindqa-run`), then `blindqa_index`. From then on, `blindqa-retest` re-tests only
what changed.
