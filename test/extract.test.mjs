/** Code index extraction: what a script reads from one file. Each pattern has a case that must match and one that must not. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import './helpers.mjs'
import { extractFacts, pageRoute, diffFacts } from '../src/index/extract.mjs'

test('file-system routes', () => {
  assert.equal(pageRoute('apps/web/app/(workspace)/books/[entityId]/pay-runs/page.tsx'), '/books/:entityId/pay-runs')
  assert.equal(pageRoute('app/page.tsx'), '/')
  assert.equal(pageRoute('app/docs/[...slug]/page.tsx'), '/docs/*')
  assert.equal(pageRoute('src/pages/users/[id].tsx'), '/users/:id')
  assert.equal(pageRoute('src/pages/index.tsx'), '/')
  assert.equal(pageRoute('src/pages/_app.tsx'), null)
  assert.equal(pageRoute('src/pages/api/users.ts'), null)
  assert.equal(pageRoute('src/routes/blog/[slug]/+page.svelte'), '/blog/:slug')
  assert.equal(pageRoute('app/routes/users.$id.edit.tsx'), '/users/:id/edit')
  assert.equal(pageRoute('src/components/Button.tsx'), null)
})

test('visible labels, without code fragments', () => {
  const f = extractFacts('src/Team.tsx', `
    <button aria-label="Close dialog">x</button>
    <h1>Team members</h1>
    <input placeholder="Search people" />
    {busy ? (<span>Saving…</span>) : flagged ? (<b>ok</b>) : null}
    <Field label={'Full name'} />
    <Tip title={t('tip.key')} />
    const nav = [{ label: 'Billing settings', href: '/billing' }]
    toast.success('Member added to the team')`)
  for (const l of ['Close dialog', 'Team members', 'Search people', 'Full name', 'Billing settings', 'Member added to the team', 'Saving…']) assert.ok(f.labels.includes(l), `label ${l}`)
  assert.ok(!f.labels.some((l) => /[=;{}?]|\)\s*:/.test(l)), `no code in labels: ${f.labels.join(' | ')}`)
  assert.ok(f.dynamic >= 2, 'computed labels are counted')
})

test('UI API calls, including generic helpers and template paths', () => {
  const f = extractFacts('src/api/users.ts', `
    apiGet<User[]>('/users')
    apiPatch<void>(\`/users/\${id}/roles\`, body)
    fetch('/api/v1/reports?x=1')
    http.post('/v2/teams', {})`)
  assert.deepEqual(f.apiCalls.sort(), ['/api/v1/reports', '/users', '/users/:p/roles', '/v2/teams'])
  assert.deepEqual(extractFacts('src/x.ts', `const url = 'https://example.com/a'; log('/not/a/call')`).apiCalls, [])
})

test('NestJS endpoints with their permission decorators', () => {
  const f = extractFacts('server/pay-run.controller.ts', `
    @RequireFeature('PAYROLL')
    @Controller('ledger/books/:entityId/payroll/pay-runs')
    export class PayRunController {
      @Get()
      @RequirePermission(Permission.PayrollView)
      @ApiOperation({ summary: 'List (with parens) runs' })
      list(@Param('entityId') entityId: string) {}

      @Post(':payRunId/approve')
      @RequirePermission(Permission.PayrollRun)
      async approve(@Param('payRunId') id: string) {}
    }`)
  assert.deepEqual(f.apiRoutes, ['GET /ledger/books/:entityId/payroll/pay-runs', 'POST /ledger/books/:entityId/payroll/pay-runs/:payRunId/approve'])
  assert.ok(f.guards.includes('POST /ledger/books/:entityId/payroll/pay-runs/:payRunId/approve RequirePermission(Permission.PayrollRun)'))
  assert.ok(f.guards.some((g) => g.startsWith('* RequireFeature')))
})

test('Express routes and Next.js route handlers', () => {
  assert.deepEqual(extractFacts('server/app.js', `router.get('/health', h); app.post('/orders', o)`).apiRoutes, ['GET /health', 'POST /orders'])
  assert.deepEqual(extractFacts('app/api/users/[id]/route.ts', 'export async function GET() {}\nexport const DELETE = () => {}').apiRoutes, ['DELETE /api/users/:id', 'GET /api/users/:id'])
})

test('router configs only count in files that use a router', () => {
  const routerFile = extractFacts('src/router.tsx', `import { createBrowserRouter } from 'react-router-dom'\nconst r = [{ path: '/settings', element: <S/> }]`)
  assert.deepEqual(routerFile.pages, ['/settings'])
  assert.deepEqual(extractFacts('src/fixtures.ts', `const routes = [{ path: '/settings' }]`).pages, [], 'plain objects with path: are not routes')
  assert.deepEqual(extractFacts('test/reach.spec.ts', `import 'react-router'; const r = [{ path: '/x' }]`).pages, [], 'tests never declare routes')
})

test('a single-page app entry renders "/"', () => {
  assert.deepEqual(extractFacts('src/main.tsx', `createRoot(document.getElementById('root')!).render(<App />)`).pages, ['/'])
  assert.deepEqual(extractFacts('src/main.ts', `export const x = 1`).pages, [])
})

test('imports and fact diffs', () => {
  const before = extractFacts('src/a.tsx', `import B from './b'\nexport default () => <button>Add member</button>`)
  const after = extractFacts('src/a.tsx', `import B from './b'\nimport { c } from '@/lib/c'\nexport default () => <button>Add teammate</button>`)
  assert.deepEqual(after.imports, ['./b', '@/lib/c'])
  const d = diffFacts(before, after)
  assert.deepEqual(d.labels, { added: ['Add teammate'], removed: ['Add member'] })
  assert.notEqual(before.digest, after.digest)
})
