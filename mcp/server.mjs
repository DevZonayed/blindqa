#!/usr/bin/env node
/**
 * blindqa as an MCP server (stdio). Works in Claude Code, Codex and any MCP client.
 *
 * Long work (crawls, journeys) runs as background jobs: start one, then read its summary when it is
 * done. Tools return short text on purpose — the calling agent pays for every token it reads.
 * Every tool takes an optional `project` (path inside the app's repo); default: BLINDQA_PROJECT or cwd.
 * Nothing here writes to stdout except the protocol.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { initProject, loadProject, findProjectRoot } from '../src/project.mjs'
import { doctor } from '../src/doctor.mjs'
import { startJob, jobStatus, listJobs, stopJob, SRC } from '../src/jobs.mjs'
import { listRuns, groupFindings, compareRuns, readJsonl } from '../src/summary.mjs'
import { installGuard, checkGuard } from '../src/guard.mjs'
import { LAYOUT } from '../src/layout.mjs'
import { detectMachine, resolveBrowser, writeMachine, MODES, MACHINE_FILE } from '../src/machine.mjs'
import { buildIndex } from '../src/index/indexer.mjs'
import { computeChanges, formatChanges } from '../src/index/changes.mjs'
import { planRetest } from '../src/index/retest.mjs'

const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
const server = new McpServer({ name: 'blindqa', version: pkg.version })

const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] })
const fail = (e) => ({ content: [{ type: 'text', text: `Error: ${e.message ?? e}` }], isError: true })
const projectArg = { project: z.string().optional().describe('Absolute path inside the app repo (its .blindqa/ is found by walking up). Default: BLINDQA_PROJECT or the server cwd.') }
const tool = (name, description, shape, fn) =>
  server.registerTool(name, { description, inputSchema: { ...projectArg, ...shape } }, async (args) => { try { return await fn(args) } catch (e) { return fail(e) } })

tool('blindqa_init',
  'Make a repo testable: clone a GitHub link (or use a local folder) and create .blindqa/profile.json with guessed apps, ports and start commands, plus an empty credentials.json. Review and complete the profile afterwards.',
  { source: z.string().describe('GitHub URL, owner/repo, or a local folder'), dir: z.string().optional().describe('Where to clone (default ~/.blindqa/projects/<repo>)'), ref: z.string().optional(), name: z.string().optional() },
  async ({ source, dir, ref, name }) => {
    const r = initProject(source, { dir, ref, name, quiet: true })
    return text({ root: r.root, profile: join(r.dir, 'profile.json'), credentials: join(r.dir, 'credentials.json'), detected: r.detected.notes, next: 'Start the app (profile.start.commands), add roles to profile.json and their logins to credentials.json, then call blindqa_doctor.' })
  })

tool('blindqa_doctor', 'Check that everything needed for a run is in place: Chromium, project profile, never-push guard, app reachable, roles with credentials, mail catcher.',
  {},
  async ({ project }) => {
    const r = await doctor(project)
    return text(r.checks.map((c) => `${c.pass ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`).join('\n'))
  })

tool('blindqa_setup', 'Install the Chromium build that Playwright drives (one time, ~150 MB). Run when blindqa_doctor says Chromium is missing.', {},
  async () => {
    const { spawnSync } = await import('node:child_process')
    const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url))
    const r = spawnSync(process.execPath, [cli, 'install', 'chromium'], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
    return text(r.status === 0 ? 'Chromium installed.' : `Install failed: ${(r.stderr || r.stdout).slice(-800)}`)
  })

tool('blindqa_profile', 'Show the project profile (apps, roles, start commands, safety rules) and which roles have credentials. Never shows passwords.', {},
  async ({ project }) => {
    const p = loadProject(project)
    return text({ root: p.root, profile: p.profile, rolesWithCredentials: Object.keys(p.credentials.roles ?? {}).filter((r) => p.credentials.roles[r]?.email) })
  })

tool('blindqa_crawl',
  'Start a read-only crawl as one role in the background (writes to the app are blocked at the network level). Visits every screen like a person, checks visibility, menus, forms (empty submit), scrolling, console/HTTP errors, error or blank screens, raw ids and codes shown to users, and control names a screen reader cannot tell apart. Returns a job id; poll blindqa_job until done, then read its summary.',
  {
    role: z.string().describe('Role name from profile.roles, e.g. ADMIN'),
    phone: z.boolean().optional().describe('390x844 window, navigation through the menu button'),
    max: z.number().int().optional().describe('Screen budget (default 60)'),
    only: z.string().optional().describe('Regex: only nav items whose name matches'),
    start: z.string().optional().describe('Hub path: crawl every screen linked from this page instead of the nav'),
    headless: z.boolean().optional().describe('No visible window (faster, parallel-safe)'),
  },
  async ({ project, role, phone, max, only, start, headless }) => {
    const p = loadProject(project)
    const args = ['--role', role, ...(phone ? ['--phone'] : []), ...(max ? ['--max', String(max)] : []), ...(only ? ['--only', only] : []), ...(start ? ['--start', start] : []), ...(headless ? ['--headless'] : [])]
    const job = startJob(p, { kind: `crawl-${role.toLowerCase()}${phone ? '-phone' : ''}`, script: join(SRC, 'crawl.mjs'), args })
    return text({ job: job.id, runDir: job.runDir, note: 'Running in the background. Call blindqa_job with this id later; do not poll in a tight loop.' })
  })

tool('blindqa_act',
  'Act mode (REAL writes): as one role, use every option on every screen — fill and submit every form with valid values, open menus, switch tabs, do actions — and record what each one actually did (effects.jsonl), with problems as findings. Destructive or irreversible actions only on records this run created. Only run against environments where test writes are allowed.',
  { role: z.string(), only: z.string().optional().describe('Regex: only these nav items'), maxActions: z.number().int().optional(), headless: z.boolean().optional() },
  async ({ project, role, only, maxActions, headless }) => {
    const p = loadProject(project)
    const args = ['--role', role, ...(only ? ['--only', only] : []), ...(maxActions ? ['--max-actions', String(maxActions)] : []), ...(headless ? ['--headless'] : [])]
    const job = startJob(p, { kind: `act-${role.toLowerCase()}`, script: join(SRC, 'act.mjs'), args })
    return text({ job: job.id, runDir: job.runDir })
  })

tool('blindqa_journey',
  'Run a scripted journey file (.mjs using the blindqa harness) in the background. The routes it visits are recorded so blindqa_retest knows which journeys cover a changed page.',
  { file: z.string().describe('Journey file path (absolute or relative to the project root)'), args: z.array(z.string()).optional().describe('Extra arguments for the journey') },
  async ({ project, file, args = [] }) => {
    const p = loadProject(project)
    const abs = existsSync(file) ? file : join(p.root, file)
    const job = startJob(p, { kind: abs.split('/').pop().replace(/\.m?js$/, ''), script: join(SRC, 'run-journey.mjs'), args: [abs, ...args] })
    return text({ job: job.id, runDir: job.runDir })
  })

tool('blindqa_job', 'Status of a background job: running or done, the last log lines, and the run summary once finished.', { id: z.string() },
  async ({ project, id }) => {
    const s = jobStatus(loadProject(project), id)
    if (!s) throw new Error(`no job ${id}`)
    return text(s.running ? `RUNNING ${s.id} (started ${s.startedAt})\n${s.tail.join('\n')}` : `DONE ${s.id}\n\n${s.summary ?? `(no summary)\n${s.tail.join('\n')}`}`)
  })

tool('blindqa_jobs', 'List background jobs, newest first.', {}, async ({ project }) => text(listJobs(loadProject(project)).slice(0, 20)))

tool('blindqa_stop', 'Stop a running background job.', { id: z.string() }, async ({ project, id }) => text(stopJob(loadProject(project), id) ? 'stopped' : 'not running'))

tool('blindqa_runs', 'List run folders, newest first.', {}, async ({ project }) => text(listRuns(loadProject(project)).slice(0, 30).map((r) => `${r.at.slice(0, 16)} ${r.id}${r.hasSummary ? '' : ' (no summary)'}`).join('\n')))

tool('blindqa_summary', 'The short summary.md of a run (latest finished run if none given). Read this instead of logs.', { run: z.string().optional() },
  async ({ project, run }) => {
    const p = loadProject(project)
    const id = run ?? listRuns(p).find((r) => r.hasSummary)?.id
    if (!id) throw new Error('no finished runs yet')
    return text(readFileSync(p.path('runs', id, 'summary.md'), 'utf8'))
  })

tool('blindqa_findings', 'Grouped findings of a run with screens and screenshot paths, filterable. Use to verify specific findings.',
  { run: z.string(), severity: z.enum(['critical', 'high', 'medium', 'low']).optional(), kind: z.string().optional(), limit: z.number().int().optional() },
  async ({ project, run, severity, kind, limit = 20 }) => {
    const p = loadProject(project)
    const runDir = p.path('runs', run)
    const groups = groupFindings(runDir).filter((g) => (!severity || g.severity === severity) && (!kind || g.kind === kind)).slice(0, limit)
    return text(groups.map((g) => ({ ...g, shot: g.shot ? join(runDir, g.shot) : null })))
  })

tool('blindqa_compare', 'Compare two runs: NEW, GONE and STILL findings (by fingerprint). Use for PR re-tests.', { before: z.string(), after: z.string() },
  async ({ project, before, after }) => {
    const p = loadProject(project)
    const r = compareRuns(p.path('runs', before), p.path('runs', after))
    const brief = (list) => list.slice(0, 40).map((g) => `${g.severity} ${g.kind}: ${String(g.detail).slice(0, 160)}`)
    return text({ new: brief(r.new), gone: brief(r.gone), stillCount: r.still.length })
  })

tool('blindqa_unsure', 'Act-mode outcomes the script checks could not settle (effects.jsonl entries with sure=false), with their screenshots: the only items in a run that need an agent or a person to look.', { run: z.string(), limit: z.number().int().optional() },
  async ({ project, run, limit = 30 }) => text(readJsonl(loadProject(project).path('runs', run, 'effects.jsonl')).filter((e) => e.sure === false).slice(0, limit)))

const lines = (checks) => checks.map((c) => `${c.pass ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`).join('\n')

tool('blindqa_guard',
  'Prove nothing in .blindqa/ can be committed or pushed (self-ignoring folder, .git/info/exclude entry, pre-push hook that refuses any push containing .blindqa/). install=true sets up whatever is missing. Never edits tracked files.',
  { install: z.boolean().optional() },
  async ({ project, install }) => {
    const root = findProjectRoot(project)
    if (!root) throw new Error('No blindqa project here (blindqa_init first)')
    const done = install ? installGuard(root) : null
    return text(`${done ? `${done.done.map((d) => `set: ${d}`).join('\n')}${done.notes.length ? `\n${done.notes.map((n) => `note: ${n}`).join('\n')}` : ''}\n\n` : ''}${lines(checkGuard(root))}`)
  })

tool('blindqa_layout', 'What lives where inside .blindqa/ (the fixed folder structure blindqa manages).', {},
  async () => text(LAYOUT.map(([p, what]) => `.blindqa/${p} — ${what}`).join('\n')))

tool('blindqa_machine',
  `This computer's browser for blindqa runs. action: show (what is in force), detect (what the machine offers + a suggestion), set (save mode/cdpUrl/viewerUrl/tab to ${MACHINE_FILE}). Modes: local (one Playwright window, default; works inside Orca terminals), headless, cdp (attach to any Chrome with remote debugging; isolated context), neko (Chromium in an n.eko container, watched in its web viewer), orca (Orca's built-in browser — experimental).`,
  { action: z.enum(['show', 'detect', 'set']).optional(), browser: z.enum(MODES).optional(), cdpUrl: z.string().optional(), viewerUrl: z.string().optional(), tab: z.enum(['new', 'reuse']).optional() },
  async ({ project, action = 'show', browser, cdpUrl, viewerUrl, tab }) => {
    let p = null
    try { p = loadProject(project) } catch { /* machine settings work without a project */ }
    if (action === 'detect') return text(await detectMachine())
    if (action === 'set') return text(writeMachine({ browser: Object.fromEntries(Object.entries({ mode: browser, cdpUrl, viewerUrl, tab }).filter(([, v]) => v !== undefined)) }))
    return text(resolveBrowser(p))
  })

tool('blindqa_index',
  'Build or refresh the code index (.blindqa/index/): the commit it was built from, every file\'s hash, and facts read by script — pages, visible labels, API routes, permission decorators, API calls, imports. Only changed files are re-read. This is the baseline blindqa_changes and blindqa_retest measure against. No model tokens.',
  {},
  async ({ project }) => {
    const { stats } = buildIndex(loadProject(project))
    return text(stats)
  })

tool('blindqa_changes',
  'What changed since the baseline (the index) or a git ref, and what it touches: changed files with which facts changed, affected page routes (through imports and through UI calls to changed endpoints), affected API routes, whether the change is WIDE (global file → re-test everything), and why each route is affected. Read-only.',
  { since: z.string().optional().describe('git ref to compare with instead of the index, e.g. main or HEAD~3'), json: z.boolean().optional() },
  async ({ project, since, json }) => {
    const ch = computeChanges(loadProject(project), { since })
    return text(json ? ch : `${formatChanges(ch)}\n\nWhy each route: ${JSON.stringify(ch.why ?? {}, null, 1)}`)
  })

tool('blindqa_retest',
  'Re-test only what changed. run=false (default): show the plan — crawls limited to the nav items that reach affected routes, plus journeys that pass through them. run=true: start it as a background job; when done, blindqa_job shows the report (NEW / FIXED / STILL per step, compared only on re-visited routes). accept=true moves the baseline to now after a clean run.',
  { since: z.string().optional(), run: z.boolean().optional(), headless: z.boolean().optional(), accept: z.boolean().optional(), allRoles: z.boolean().optional() },
  async ({ project, since, run, headless, accept, allRoles }) => {
    const p = loadProject(project)
    if (!run) {
      const ch = computeChanges(p, { since })
      const plan = planRetest(p, ch, { allRoles })
      return text(`${formatChanges(ch)}\n\nPlan:\n${plan.steps.map((s) => `- ${s.kind} ${s.role ?? s.file}${s.phone ? ' (phone)' : ''}${s.only ? ` only ${s.only}` : ''} — ${s.why}`).join('\n') || '- nothing to run'}${plan.notes.length ? `\n\n${plan.notes.map((n) => `· ${n}`).join('\n')}` : ''}`)
    }
    const args = [...(since ? ['--since', since] : []), ...(headless ? ['--headless'] : []), ...(accept ? ['--accept'] : []), ...(allRoles ? ['--all-roles'] : [])]
    const job = startJob(p, { kind: 'retest', script: join(SRC, 'retest-run.mjs'), args })
    return text({ job: job.id, runDir: job.runDir, note: 'Running in the background. Call blindqa_job with this id once, a few minutes later.' })
  })

await server.connect(new StdioServerTransport())
