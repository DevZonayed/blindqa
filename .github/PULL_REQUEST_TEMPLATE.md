## What this changes
<!-- What a user will notice. Link the issue: Fixes #123 -->

## How I tested it
<!-- npm test, plus: which app you crawled / which journey you ran / which browser mode -->

## Checklist
- [ ] `npm test` passes
- [ ] CLI, MCP tool and skills stay in sync (new/changed command updated in all three, plus README / docs)
- [ ] Crawls stay read-only; nothing writes outside `.blindqa/`; no tracked project files are edited
- [ ] Extraction output changed → `EXTRACTOR_VERSION` bumped and a test added (one that matches, one that must not)
- [ ] Plugin files changed → `claude plugin validate` on the manifest, skills and agents
- [ ] Site changed → `cd site && npm run typecheck && npm run build`, and the built `docs/` files are committed
- [ ] No secrets, private URLs or customer data in code, tests, fixtures or screenshots
- [ ] `CHANGELOG.md` has a line under "Unreleased"
