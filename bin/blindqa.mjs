#!/usr/bin/env node
/**
 * blindqa — blind, human-like QA for any web app.
 *
 *   blindqa init <github-url | owner/repo | folder> [--dir d] [--ref branch] [--name n]
 *   (every command accepts --project <path> to pick the app; default: walk up from the current folder)
 *   blindqa doctor                         check browser, never-push guard, profile, app, credentials
 *   blindqa setup                          install the Chromium that Playwright drives
 *   blindqa guard [--install] [--hook-script]   prove nothing in .blindqa/ can be committed or pushed
 *   blindqa layout                         what lives where inside .blindqa/
 *   blindqa machine [show|detect|test]     this computer's browser: local | headless | cdp | neko | orca
 *   blindqa machine set --browser <mode> [--cdp-url u] [--viewer-url u] [--tab new|reuse] [--port n] | --reset
 *   blindqa template neko <dir>            copy the n.eko docker-compose template into <dir>
 *   blindqa index                          (re)build the code index — the baseline changes are measured against
 *   blindqa changes [--since <git-ref>] [--json]   what changed since the baseline and which routes it touches
 *   blindqa retest [--since ref] [--run-tests] [--headless] [--accept] [--all-roles] [--bg]
 *                                          plan (default) or run only the crawls/journeys the changes touch
 *   blindqa browser start|stop|status      the one always-open window used by visible runs (local mode)
 *   blindqa crawl --role R [--phone] [--max N] [--only re] [--start /path] [--headless] [--bg]
 *   blindqa journey <file.mjs> [--bg] [journey args…]
 *   blindqa act --role R [--only re] [--max-actions N] [--headless] [--bg]   use every option (REAL writes; own records only for destructive ones)
 *   blindqa signin <ROLE> [--headless]     sign in once (saves the session) and show the landing screen
 *   blindqa runs | summary [run] | compare <before> <after> | jobs | job <id> | stop <id>
 *   blindqa mcp                            MCP server on stdio (for Claude Code, Codex, any MCP client)
 */
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'src')
const argvAll = process.argv.slice(2)
// --project <path> works with every command: which app's .blindqa/ to use (default: walk up from cwd)
const pi = argvAll.indexOf('--project')
if (pi >= 0) { process.env.BLINDQA_PROJECT = resolve(argvAll[pi + 1]); argvAll.splice(pi, 2) }
const [cmd = 'help', ...rest] = argvAll
const flag = (k) => rest.includes(`--${k}`)
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i >= 0 ? rest[i + 1] : d }
const BOOL_FLAGS = ['--bg', '--phone', '--headless', '--quiet', '--force', '--install', '--hook-script', '--reset', '--json', '--run-tests', '--accept', '--full', '--all-roles']
const positional = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1].startsWith('--') && !BOOL_FLAGS.includes(rest[i - 1])))

const lazy = {
  project: () => import(join(SRC, 'project.mjs')),
  summary: () => import(join(SRC, 'summary.mjs')),
  jobs: () => import(join(SRC, 'jobs.mjs')),
}

function runNode(script, args) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', env: process.env })
    child.on('exit', (code) => done(code ?? 1))
  })
}

async function chromiumInstalled() {
  try { const { chromium } = await import('playwright'); return existsSync(chromium.executablePath()) } catch { return false }
}

const commands = {
  async help() {
    const text = readFileSync(fileURLToPath(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1]
    console.log(text.replace(/^ \* ?/gm, '').trim())
  },

  async setup() {
    if (await chromiumInstalled()) { if (!flag('quiet')) console.log('Chromium for Playwright is installed.'); return }
    console.log('Installing Chromium for Playwright (one time)…')
    execFileSync(process.execPath, [join(ROOT, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], { stdio: 'inherit' })
  },

  async init() {
    const source = positional[0]
    if (!source) throw new Error('usage: blindqa init <github-url | owner/repo | folder>')
    const { initProject } = await lazy.project()
    const r = initProject(source, { dir: opt('dir'), ref: opt('ref'), name: opt('name'), force: flag('force') })
    console.log(`Project ready: ${r.root}`)
    console.log(`  profile:     ${join(r.dir, 'profile.json')}   (check apps, roles, start commands)`)
    console.log(`  credentials: ${join(r.dir, 'credentials.json')}   (one entry per role; never committed)`)
    for (const n of r.detected.notes) console.log(`  · ${n}`)
    console.log('Next: start the app, fill in roles + credentials, then `blindqa doctor`.')
  },

  async doctor() {
    const { doctor } = await import(join(SRC, 'doctor.mjs'))
    const r = await doctor()
    for (const c of r.checks) console.log(`${c.pass ? '✔' : '✖'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
    process.exitCode = r.ok ? 0 : 1
  },

  async guard() {
    const { findProjectRoot } = await lazy.project()
    const { installGuard, checkGuard, hookScript } = await import(join(SRC, 'guard.mjs'))
    if (flag('hook-script')) { process.stdout.write(hookScript()); return }
    const root = findProjectRoot()
    if (!root) throw new Error('No blindqa project here (run `blindqa init <folder>` first)')
    if (flag('install')) {
      const r = installGuard(root)
      for (const d of r.done) console.log(`✔ ${d}`)
      for (const n of r.notes) console.log(`! ${n}`)
    }
    const checks = checkGuard(root)
    for (const c of checks) console.log(`${c.pass ? '✔' : '✖'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`)
    process.exitCode = checks.every((c) => c.pass) ? 0 : 1
  },

  async layout() {
    const { LAYOUT } = await import(join(SRC, 'layout.mjs'))
    for (const [p, what] of LAYOUT) console.log(`.blindqa/${p.padEnd(18)} ${what}`)
  },

  async machine() {
    const m = await import(join(SRC, 'machine.mjs'))
    const sub = positional[0] ?? 'show'
    let project = null
    try { project = (await lazy.project()).loadProject() } catch { /* machine settings work without a project */ }
    if (sub === 'set') {
      if (flag('reset')) { m.writeMachine({ browser: { mode: null, cdpUrl: null, viewerUrl: null, tab: null, port: null } }); console.log(`browser settings cleared in ${m.MACHINE_FILE}`); return }
      const browser = { mode: opt('browser'), cdpUrl: opt('cdp-url'), viewerUrl: opt('viewer-url'), tab: opt('tab'), port: opt('port') ? Number(opt('port')) : undefined }
      for (const k of Object.keys(browser)) if (browser[k] === undefined) delete browser[k]
      if (browser.mode && !m.MODES.includes(browser.mode)) throw new Error(`--browser must be one of ${m.MODES.join(', ')}`)
      const next = m.writeMachine({ browser })
      console.log(`saved ${m.MACHINE_FILE}:\n${JSON.stringify(next.browser, null, 2)}`)
      return
    }
    if (sub === 'detect') {
      const r = await m.detectMachine()
      console.log(JSON.stringify(r.found, null, 2))
      console.log(`\nsuggested browser mode: ${r.suggest}`)
      for (const w of r.why) console.log(`  · ${w}`)
      console.log(`currently in force: ${r.current.mode} (from ${r.current.source})`)
      if (r.suggest !== r.current.mode) console.log(`to use it: blindqa machine set --browser ${r.suggest}`)
      return
    }
    if (sub === 'test') {
      if (!project) throw new Error('`machine test` needs a project (run it inside a repo with .blindqa/)')
      const { openSession, sessionOptions } = await import(join(SRC, 'browser', 'session.mjs'))
      const o = sessionOptions(project, { visible: !flag('headless') })
      const t0 = Date.now()
      const s = await openSession(o)
      await s.page.goto('data:text/html,<title>blindqa machine test</title><h1>blindqa can drive this browser</h1>')
      console.log(`✔ ${s.mode} browser answered in ${Date.now() - t0} ms — page title "${await s.page.title()}"`)
      await s.close()
      return
    }
    const b = m.resolveBrowser(project)
    console.log(JSON.stringify({ ...b, machineFile: m.MACHINE_FILE }, null, 2))
  },

  async template() {
    const [name, dest] = positional
    if (name !== 'neko' || !dest) throw new Error('usage: blindqa template neko <dir>')
    const { cpSync } = await import('node:fs')
    cpSync(join(ROOT, 'templates', 'neko'), resolve(dest), { recursive: true, errorOnExist: true, force: false })
    console.log(`Copied to ${resolve(dest)}. Next: cd ${dest} && docker compose up -d && blindqa machine set --browser neko`)
  },

  async index() {
    const { loadProject } = await lazy.project()
    const { buildIndex } = await import(join(SRC, 'index', 'indexer.mjs'))
    const { stats } = buildIndex(loadProject())
    console.log(`Indexed ${stats.files} files in ${stats.ms} ms (${stats.reread} read, ${stats.reused} unchanged) at ${stats.commit?.slice(0, 10) ?? 'no git commit'}`)
    console.log(`  pages ${stats.pages} · API routes ${stats.apiRoutes} · labels ${stats.labels} (computed at runtime: ${stats.unresolvedLabels}) · import links ${stats.importEdges}`)
  },

  async changes() {
    const { loadProject } = await lazy.project()
    const { computeChanges, formatChanges } = await import(join(SRC, 'index', 'changes.mjs'))
    const ch = computeChanges(loadProject(), { since: opt('since'), log: (l) => console.error(l) })
    console.log(flag('json') ? JSON.stringify(ch, null, 2) : formatChanges(ch))
  },

  async retest() {
    const { loadProject } = await lazy.project()
    const p = loadProject()
    const script = join(SRC, 'retest-run.mjs')
    const args = [...(opt('since') ? ['--since', opt('since')] : []), ...['headless', 'accept', 'all-roles'].filter(flag).map((f) => `--${f}`)]
    if (!flag('run-tests')) {
      const { computeChanges, formatChanges } = await import(join(SRC, 'index', 'changes.mjs'))
      const { planRetest } = await import(join(SRC, 'index', 'retest.mjs'))
      const ch = computeChanges(p, { since: opt('since'), log: (l) => console.error(l) })
      const plan = planRetest(p, ch, { allRoles: flag('all-roles') })
      console.log(formatChanges(ch))
      console.log(`\nPlan (${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}):`)
      for (const s of plan.steps) console.log(`  ${s.kind} ${s.role ?? s.file}${s.phone ? ' (phone)' : ''}${s.only ? ` --only "${s.only}"` : ''} — ${s.why}`)
      for (const n of plan.notes) console.log(`  · ${n}`)
      if (plan.steps.length) console.log('\nRun it: blindqa retest --run-tests [--headless] [--accept] [--bg]')
      return
    }
    if (flag('bg')) {
      const { startJob } = await lazy.jobs()
      const job = startJob(p, { kind: 'retest', script, args })
      console.log(JSON.stringify({ job: job.id, runDir: job.runDir, log: job.log }, null, 2))
      return
    }
    process.exitCode = await runNode(script, args)
  },

  async browser() {
    const { loadProject } = await lazy.project()
    const { startBrowser, stopBrowser, browserRunning, sessionOptions } = await import(join(SRC, 'browser', 'session.mjs'))
    const o = sessionOptions(loadProject())
    if (o.mode !== 'local') { console.log(`browser mode is "${o.mode}" on this machine — blindqa does not start or stop that browser (see blindqa machine)`); return }
    const sub = positional[0] ?? 'status'
    if (sub === 'start') console.log((await startBrowser(o)) ? `browser started (port ${o.port})` : 'browser already running')
    else if (sub === 'stop') console.log((await stopBrowser(o)) ? 'browser closed' : 'browser not running')
    else console.log((await browserRunning(o.port)) ? `browser running on port ${o.port}` : 'browser not running')
  },

  async crawl() {
    const script = join(SRC, 'crawl.mjs')
    const args = rest.filter((a) => a !== '--bg')
    if (flag('bg')) {
      const { loadProject } = await lazy.project()
      const { startJob } = await lazy.jobs()
      const job = startJob(loadProject(), { kind: `crawl-${(opt('role', 'admin')).toLowerCase()}`, script, args: args.filter((a, i) => a !== '--run' && args[i - 1] !== '--run') })
      console.log(JSON.stringify({ job: job.id, runDir: job.runDir, log: job.log }, null, 2))
      return
    }
    process.exitCode = await runNode(script, args)
  },

  async journey() {
    const script = join(SRC, 'run-journey.mjs')
    const file = positional[0]
    if (!file) throw new Error('usage: blindqa journey <file.mjs> [--bg]')
    const args = [resolve(file), ...rest.filter((a) => a !== file && a !== '--bg')]
    if (flag('bg')) {
      const { loadProject } = await lazy.project()
      const { startJob } = await lazy.jobs()
      const job = startJob(loadProject(), { kind: file.split('/').pop().replace(/\.m?js$/, ''), script, args })
      console.log(JSON.stringify({ job: job.id, runDir: job.runDir, log: job.log }, null, 2))
      return
    }
    process.exitCode = await runNode(script, args)
  },

  async act() {
    const script = join(SRC, 'act.mjs')
    const args = rest.filter((a) => a !== '--bg')
    if (flag('bg')) {
      const { loadProject } = await lazy.project()
      const { startJob } = await lazy.jobs()
      const job = startJob(loadProject(), { kind: `act-${(opt('role', 'admin')).toLowerCase()}`, script, args: args.filter((a, i) => a !== '--run' && args[i - 1] !== '--run') })
      console.log(JSON.stringify({ job: job.id, runDir: job.runDir, log: job.log }, null, 2))
      return
    }
    process.exitCode = await runNode(script, args)
  },

  async signin() {
    if (!positional[0]) throw new Error('usage: blindqa signin <ROLE> [--headless]')
    process.exitCode = await runNode(join(SRC, 'signin.mjs'), [positional[0], ...rest.filter((a) => a === '--headless')])
  },

  async runs() {
    const { loadProject } = await lazy.project()
    const { listRuns } = await lazy.summary()
    for (const r of listRuns(loadProject()).slice(0, 30)) console.log(`${r.at.slice(0, 16)}  ${r.id}${r.hasSummary ? '' : '  (no summary)'}`)
  },

  async summary() {
    const { loadProject } = await lazy.project()
    const { listRuns } = await lazy.summary()
    const p = loadProject()
    const run = positional[0] ?? listRuns(p).find((r) => r.hasSummary)?.id
    if (!run) throw new Error('no runs with a summary yet')
    console.log(readFileSync(p.path('runs', run, 'summary.md'), 'utf8'))
  },

  async compare() {
    const { loadProject } = await lazy.project()
    const { compareRuns } = await lazy.summary()
    const p = loadProject()
    const [a, b] = positional
    const r = compareRuns(p.path('runs', a), p.path('runs', b))
    for (const [k, list] of Object.entries(r)) {
      console.log(`\n${k.toUpperCase()} (${list.length})`)
      for (const g of list.slice(0, 40)) console.log(`  ${g.severity.padEnd(8)} ${g.kind}: ${String(g.detail).slice(0, 140)}`)
    }
  },

  async jobs() {
    const { loadProject } = await lazy.project()
    const { listJobs } = await lazy.jobs()
    for (const j of listJobs(loadProject())) console.log(`${j.startedAt.slice(0, 16)}  ${j.running ? 'running' : 'done   '}  ${j.id}`)
  },

  async job() {
    const { loadProject } = await lazy.project()
    const { jobStatus } = await lazy.jobs()
    console.log(JSON.stringify(jobStatus(loadProject(), positional[0]), null, 2))
  },

  async stop() {
    const { loadProject } = await lazy.project()
    const { stopJob } = await lazy.jobs()
    console.log(stopJob(loadProject(), positional[0]) ? 'stopped' : 'not running')
  },

  async mcp() { await import(join(ROOT, 'mcp', 'server.mjs')) },
}

const run = commands[cmd] ?? commands.help
run().catch((e) => { console.error(`blindqa ${cmd}: ${e.message}`); process.exitCode = 1 })
