/** Change impact on a small Next.js-style app: precise when it can be, wide when it must be. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { repoWithRemote, git } from './helpers.mjs'
import { initProject, loadProject } from '../src/project.mjs'
import { buildIndex } from '../src/index/indexer.mjs'
import { computeChanges } from '../src/index/changes.mjs'

const APP = {
  'package.json': '{"name":"shop","private":true}\n',
  'tsconfig.json': '{ // comments are allowed\n "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } }, }\n',
  'app/layout.tsx': `import '@/styles/globals.css'\nexport default function L({ children }) { return children }\n`,
  'app/team/page.tsx': `import Team from '@/features/Team'\nexport default Team\n`,
  'app/pay/page.tsx': `import Pay from '@/features/Pay'\nexport default Pay\n`,
  'src/styles/globals.css': 'body { margin: 0 }\n',
  'src/lib/api.ts': 'export const apiGet = (path) => fetch(`/api/v1/${path}`)\n', // generic client: used by every page
  'src/features/Team.tsx': `import { apiGet } from '@/lib/api'\nexport default () => <button onClick={() => apiGet('/team')}>Add member</button>\n`,
  'src/features/Pay.tsx': `import { apiGet } from '@/lib/api'\nexport default () => { apiGet('/payroll/runs'); return <h1>Pay runs</h1> }\n`,
  'server/payroll.controller.ts': `import { PayrollService } from './payroll.service'\n@Controller('payroll')\nexport class C {\n  @Get('runs')\n  @RequirePermission('payroll:view')\n  list() {}\n}\n`,
  'server/payroll.service.ts': 'export class PayrollService { total() { return 1 } }\n',
  'test/routes.spec.ts': `import 'react-router'\nconst all = [{ path: '/team' }, { path: '/pay' }]\n`,
}

function setup() {
  const { app } = repoWithRemote(APP)
  initProject(app, { quiet: true })
  const project = loadProject(app)
  const { stats } = buildIndex(project)
  return { app, project, stats }
}

test('index reads pages, endpoints and resolves @/ aliases', () => {
  const { stats } = setup()
  assert.equal(stats.pages, 2)
  assert.equal(stats.apiRoutes, 1)
  assert.ok(stats.importEdges >= 6)
})

test('a label edit affects only its page', () => {
  const { app, project } = setup()
  const f = join(app, 'src/features/Team.tsx')
  writeFileSync(f, readFileSync(f, 'utf8').replace('Add member', 'Add teammate'))
  const ch = computeChanges(project)
  assert.deepEqual(ch.routes, ['/team'])
  assert.equal(ch.wide, false)
  assert.deepEqual(ch.files[0].diff.labels, { added: ['Add teammate'], removed: ['Add member'] })
})

test('a server change reaches the pages that call its endpoints — not every page via the generic client', () => {
  const { app, project } = setup()
  appendFileSync(join(app, 'server/payroll.service.ts'), '// changed\n')
  const ch = computeChanges(project)
  assert.deepEqual(ch.apiRoutes, ['GET /payroll/runs'])
  assert.deepEqual(ch.routes, ['/pay'])
  assert.match(ch.why['/pay'], /calls a changed endpoint/)
})

test('a global stylesheet is a wide change', () => {
  const { app, project } = setup()
  appendFileSync(join(app, 'src/styles/globals.css'), 'a { color: red }\n')
  const ch = computeChanges(project)
  assert.equal(ch.wide, true)
})

test('--since compares with a git ref and lists the commits', () => {
  const { app, project } = setup()
  const f = join(app, 'src/features/Pay.tsx')
  writeFileSync(f, readFileSync(f, 'utf8').replace('Pay runs', 'Payroll runs'))
  git(app, 'commit', '-qam', 'rename heading')
  const viaRef = computeChanges(project, { since: 'HEAD~1' })
  assert.deepEqual(viaRef.routes, ['/pay'])
  const viaIndex = computeChanges(project)
  assert.equal(viaIndex.commits.length, 1)
  buildIndex(project)
  assert.equal(computeChanges(project).files.length, 0, 'after re-indexing nothing is left to re-test')
})
