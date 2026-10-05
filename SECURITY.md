# Security Policy

## Supported versions
Security fixes go into the latest release. Please upgrade before reporting
(`claude plugin update blindqa@blindqa`, or `codex plugin marketplace upgrade`).

## Reporting a vulnerability
**Do not open a public issue.** Use GitHub's private reporting:
[Report a vulnerability](https://github.com/DevZonayed/blindqa/security/advisories/new).
If that isn't possible, email **dev.jonayed@gmail.com** with "blindqa security" in the subject.

Please include: what an attacker can do, the steps to reproduce, the blindqa version, the browser mode
(`blindqa machine show`), and your OS. You'll get an acknowledgement within 3 working days and a plan or
fix target within 14. You'll be credited in the release notes unless you prefer not to be.

## What is in scope
blindqa handles credentials and drives browsers, so these matter most:
- **The never-push guarantee** — any way blindqa's own files (`.blindqa/`: credentials, sessions, runs)
  could be committed or pushed despite the guard, or blindqa editing a project's tracked files.
- **Credential handling** — logins, authenticator secrets, emailed codes or saved sessions leaking into
  logs, reports, screenshots, run summaries, MCP tool output, or anything an agent is shown.
- **Browser attach modes** — `cdp`/`neko`/`orca` touching a person's own browser profile or cookies
  outside the isolated context, or the n.eko template exposing the DevTools port beyond localhost.
- **Read-only crawls changing data** — a write getting past the crawl's network write-blocker.
- **Command injection** through project files (`profile.json`, journey paths, git refs) passed to shell or git.

Out of scope: vulnerabilities in the apps you test with blindqa (report those to their owners), and
issues that need an attacker who already controls your machine or your `~/.blindqa/` folder.

## Safe use
- Run crawls freely; run journeys and act mode only against local or test environments.
- Never publish the DevTools port of a browser (`cdp`, `neko`) to a network — tunnel it over SSH.
- Keep `.blindqa/` out of shared drives and backups you don't control; it holds test credentials.
