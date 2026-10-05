/**
 * `blindqa retest --run-tests` / MCP `blindqa_retest { run: true }`: changes → plan → run → report.
 *   node src/retest-run.mjs [--since <git-ref>] [--headless] [--accept] [--all-roles] [--run id]
 * The report is the run's summary.md (and a copy in .blindqa/reports/).
 */
import { writeFileSync } from 'node:fs'
import { loadProject } from './project.mjs'
import { computeChanges, formatChanges } from './index/changes.mjs'
import { planRetest, runRetest } from './index/retest.mjs'

const argv = process.argv.slice(2)
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : null }
const project = loadProject()
const runDir = project.runDir(opt('run') ?? `retest-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`)

const changes = computeChanges(project, { since: opt('since'), log: console.log })
console.log(formatChanges(changes))
const plan = planRetest(project, changes, { allRoles: argv.includes('--all-roles') })
if (!plan.steps.length) {
  const text = `# Re-test\n\n${formatChanges(changes)}\n\nNothing to run: ${changes.files.length ? 'no earlier crawl or journey visited the affected routes' : 'no changes since the baseline'}.\n${plan.notes.map((n) => `- ${n}`).join('\n')}\n`
  writeFileSync(runDir + 'summary.md', text)
  console.log('\nnothing to run')
} else {
  console.log(`\n${plan.steps.length} step(s)`)
  const r = runRetest(project, plan, changes, { headless: argv.includes('--headless'), accept: argv.includes('--accept'), reportDir: runDir })
  console.log(`\nreport: ${r.report}${r.accepted ? ' (baseline moved)' : ''}`)
  process.exitCode = r.ok ? 0 : 1
}
