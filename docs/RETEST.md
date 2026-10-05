---
title: "Re-test only what changed"
description: "How blindqa indexes your code, maps git changes to affected pages and re-runs only the crawls and journeys that cover them."
---

# Re-test only what changed

The first full test of an app is the expensive part (setting up, writing journeys). After that, blindqa
works out from the code what a change touches and re-runs only those crawls and journeys. Scripts do all of
it; a coding agent only reads the short report.

```
blindqa index                    # once, after the first full crawl per role: the baseline
# … edit code, pull commits, check out a branch …
blindqa changes                  # what changed since the baseline, and which pages it reaches
blindqa changes --since main     # or against any git ref
blindqa retest                   # the plan
blindqa retest --run-tests [--headless] [--bg]     # run it; report in .blindqa/reports/retest-<time>.md
blindqa retest --run-tests --accept                # …and move the baseline to now if every step ran
```

## The index (`.blindqa/index/`)
Built by script in well under a second for a few thousand files (a 3,312-file TypeScript monorepo in ~0.5 s;
a rebuild with nothing changed reads nothing). For every file:
- its content hash and the commit the index was built at,
- **facts** read with regular expressions — page routes (Next.js app/pages, SvelteKit, Nuxt, Remix,
  React Router configs, a single-page app's entry), visible labels (JSX text, `aria-label`, `title`,
  `placeholder`, `label`, `label: '…'` configs, toast messages), server endpoints (NestJS decorators,
  Express/Fastify/Hono calls, Next.js route handlers) with their permission/role/feature decorators, the API
  paths the UI calls, and its imports (resolved through tsconfig `paths` aliases and workspace packages),
- how many visible labels are computed at runtime (`aria-label={t('x')}`) — the only part a script can't
  read; the crawl still checks those on screen.

## How a change becomes a plan
1. **Changed files** — hash differs from the baseline (or `git diff --since <ref>`), plus new and deleted files.
2. **Reach** — everything that imports a changed file, directly or through any chain of imports.
3. **Pages** — routes of the reached page files. A server change also reaches the screens whose code calls
   one of its endpoints (`/api/v1/users/:id/roles` in the UI ↔ `PATCH /users/:userId/roles` on the server).
   Generic calls (an API client's `/api/v1/${path}`) don't count, or every page would.
4. **WIDE** — a global file changed (root layout, global CSS, `package.json`/lockfile, tsconfig, bundler or
   Tailwind config, `.env*`, database migrations, middleware) or the change reaches more than half the pages
   → full re-test.
5. **Plan** — for each earlier crawl (latest per role, desktop/phone): the nav items whose screens are on
   affected routes → `crawl --only "^(Item A|Item B)$"`. Every journey whose last run visited an affected
   route. Affected routes no earlier run visited are listed — usually a new page that needs a journey.
6. **Compare** — each new run against the previous run of the same kind, **counting only routes the new run
   visited**: NEW, FIXED (gone), STILL.

`blindqa changes --json` includes `why`: the file that made each route affected.

## Limits
Impact follows imports and literal API paths. It can't see API paths built from variables, behaviour that
depends on data, feature flags or time, or third-party services. Global files trigger a full re-test for
that reason. Keep a scheduled full run (nightly, or before each release) as the safety net — it costs
machine time only.

## Apps without code access
For an app tested blind (no repo), there is no index. Compare a new crawl with the last one per role:
`blindqa compare <before> <after>`.
