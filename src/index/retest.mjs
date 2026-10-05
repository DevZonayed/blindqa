/**
 * Re-test only what a change touches.
 *   coverage  which earlier run looked at which route: crawls (map.json screens → nav item) and journeys
 *             (journey.json routes), latest run of each kind
 *   plan      affected routes → crawls limited to the nav items that reach them (--only) + the journeys
 *             that pass through them; a WIDE change → every role's full crawl and every journey
 *   run       runs the plan one step at a time, then compares each new run with the previous run of the
 *             same kind, counting only routes the new run visited: FIXED / STILL / NEW
 * Runs cost no model tokens: crawls and journeys are scripts. Only reading the report does.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { listRuns, compareRuns, readJsonl } from '../summary.mjs'
import { normRoute } from './changes.mjs'
import { buildIndex } from './indexer.mjs'
import { SRC } from '../jobs.mjs'

const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
const TS = /-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/
export const runKind = (id) => id.replace(TS, '')
const navOf = (path) => (path?.[0] ?? '').replace(/^(Sidebar|☰|Hub|Nav): /, '')
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

/** Latest crawl per role (+phone) and latest run per journey file, with the routes each one saw. */
export function testCoverage(project) {
  const crawls = new Map()
  const journeys = new Map()
  for (const r of listRuns(project)) { // newest first
    const map = read(join(r.dir, 'map.json'))
    if (map?.screens) {
      const phone = /-phone(-|$)/.test(r.id) || (map.viewport?.width ?? 1440) < 500
      const key = `${map.role}${phone ? ':phone' : ''}`
      if (crawls.has(key) || map.start) continue // hub crawls (--start) are not re-planned automatically
      const routes = new Map()
      for (const s of map.screens) {
        const route = normRoute(s.route)
        const nav = navOf(s.path)
        if (!routes.has(route)) routes.set(route, new Set())
        if (nav && nav !== 'Landing') routes.get(route).add(nav)
      }
      crawls.set(key, { kind: 'crawl', role: map.role, phone, run: r.id, routes })
    }
    const j = read(join(r.dir, 'journey.json'))
    if (j?.file && !journeys.has(j.file)) journeys.set(j.file, { kind: 'journey', name: j.name, file: j.file, run: r.id, routes: new Set(j.routes.map(normRoute)) })
  }
  return { crawls: [...crawls.values()], journeys: [...journeys.values()] }
}

/** Which crawls and journeys to run for these changes. */
export function planRetest(project, changes, { allRoles = false } = {}) {
  const cov = testCoverage(project)
  const roles = Object.keys(project.profile.roles ?? {})
  const affected = new Set(changes.routes.map(normRoute))
  const steps = []
  const covered = new Set()
  const notes = []

  if (changes.wide || allRoles) {
    notes.push(changes.wide ? `wide change (${changes.wideReasons.slice(0, 3).join('; ')}) — full re-test` : 'all roles requested')
    for (const role of roles) steps.push({ kind: 'crawl', role, phone: false, only: null, why: 'full crawl' })
    for (const c of cov.crawls.filter((c) => c.phone)) steps.push({ kind: 'crawl', role: c.role, phone: true, only: null, why: 'full phone crawl' })
    for (const j of cov.journeys) steps.push({ kind: 'journey', file: j.file, name: j.name, why: 'every journey' })
    for (const f of journeyFiles(project).filter((f) => !cov.journeys.some((j) => j.file === f))) steps.push({ kind: 'journey', file: f, name: f.split('/').pop().replace(/\.m?js$/, ''), why: 'journey never run before' })
  } else if (affected.size) {
    for (const c of cov.crawls) {
      const navs = new Set()
      let landing = false
      for (const [route, ns] of c.routes) if (affected.has(route)) { covered.add(route); if (ns.size) ns.forEach((n) => navs.add(n)); else landing = true }
      if (!navs.size && !landing) continue
      const only = navs.size ? `^(${[...navs].map(escapeRe).join('|')})$` : '(?!)' // (?!) = landing page only
      steps.push({ kind: 'crawl', role: c.role, phone: c.phone, only, why: `${navs.size ? [...navs].join(', ') : 'landing page'} (from ${c.run})` })
    }
    for (const j of cov.journeys) {
      const hit = [...j.routes].filter((r) => affected.has(r))
      if (!hit.length) continue
      hit.forEach((r) => covered.add(r))
      steps.push({ kind: 'journey', file: j.file, name: j.name, why: `passes ${hit.slice(0, 3).join(', ')}` })
    }
    if (!cov.crawls.length && !cov.journeys.length) {
      notes.push('no earlier crawls or journeys to compare with — run a full crawl per role once to create the baseline')
      for (const role of roles) steps.push({ kind: 'crawl', role, phone: false, only: null, why: 'first crawl (baseline)' })
    }
  }
  const untested = [...affected].filter((r) => !covered.has(r) && !(changes.wide || allRoles))
  if (untested.length) notes.push(`${untested.length} affected route(s) no earlier run visited — a crawl may not reach them (behind data or a button) or they are new: consider a journey`)
  if (changes.apiRoutes?.length) notes.push(`${changes.apiRoutes.length} server endpoint(s) changed — screens that call them are included; re-run your API/permission checks for: ${changes.apiRoutes.slice(0, 5).join(', ')}${changes.apiRoutes.length > 5 ? ' …' : ''}`)
  return { steps, untested, notes, affected: [...affected] }
}

/** Run every step (sequentially), compare with the previous run of the same kind, write a report. */
export function runRetest(project, plan, changes, { headless = false, accept = false, reportDir = null, log = console.log } = {}) {
  const at = stamp()
  const results = []
  const before = new Map(listRuns(project).map((r) => [r.id, r]))
  for (const step of plan.steps) {
    const id = step.kind === 'crawl' ? `crawl-${step.role.toLowerCase()}${step.phone ? '-phone' : ''}-${at}` : `${step.name}-${at}`
    const script = join(SRC, step.kind === 'crawl' ? 'crawl.mjs' : 'run-journey.mjs')
    const args = step.kind === 'crawl'
      ? ['--role', step.role, ...(step.phone ? ['--phone'] : []), ...(step.only ? ['--only', step.only] : []), ...(headless ? ['--headless'] : []), '--run', id]
      : [join(project.root, step.file), ...(headless ? ['--headless'] : []), '--run', id]
    log(`▶ ${step.kind} ${step.role ?? step.name}${step.only ? ` only ${step.only}` : ''} — ${step.why}`)
    const r = spawnSync(process.execPath, [script, ...args], { cwd: project.root, env: { ...process.env, BLINDQA_PROJECT: project.root }, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const runDir = project.path('runs', id)
    const prev = [...before.values()].find((x) => runKind(x.id) === runKind(id) && (existsSync(join(x.dir, 'findings.jsonl')) || existsSync(join(x.dir, 'summary.md'))))
    const map = read(join(runDir, 'map.json'))
    const journey = read(join(runDir, 'journey.json'))
    const scope = new Set((map?.screens ?? []).map((s) => normRoute(s.route)).concat(journey?.routes?.map(normRoute) ?? []))
    const cmp = prev ? compareRuns(prev.dir, runDir, { scope: scope.size ? scope : null }) : null
    results.push({ step, id, exit: r.status, prev: prev?.id ?? null, scope: scope.size, new: cmp?.new ?? readJsonl(join(runDir, 'findings.jsonl')).map((f) => ({ severity: f.severity, kind: f.kind, detail: f.detail })), fixed: cmp?.gone ?? [], still: cmp?.still ?? [], error: r.status ? (r.stderr || r.stdout).split('\n').filter(Boolean).slice(-3).join(' | ') : null })
    log(`  ${r.status ? `✖ exit ${r.status}` : '✔'} ${id}: ${cmp ? `${cmp.new.length} new, ${cmp.gone.length} fixed, ${cmp.still.length} still` : 'no earlier run to compare (this one becomes the baseline)'}`)
  }
  const ok = results.every((r) => r.exit === 0)
  let accepted = false
  if (accept && ok) { buildIndex(project); accepted = true }
  const report = formatReport({ changes, plan, results, accepted, at })
  const file = join(reportDir ?? project.path('reports'), reportDir ? 'summary.md' : `retest-${at}.md`)
  writeFileSync(file, report)
  if (reportDir) writeFileSync(project.path('reports', `retest-${at}.md`), report)
  return { ok, results, report: file, accepted }
}

function formatReport({ changes, plan, results, accepted, at }) {
  const sevOrder = ['critical', 'high', 'medium', 'low']
  const top = (list) => [...list].sort((a, b) => sevOrder.indexOf(a.severity) - sevOrder.indexOf(b.severity)).slice(0, 12)
  const lines = [`# Re-test ${at}`, '']
  lines.push(`Changed files: ${changes.files.length} · affected routes: ${changes.routes.length}${changes.wide ? ' · WIDE change' : ''}${changes.apiRoutes.length ? ` · server endpoints: ${changes.apiRoutes.length}` : ''}`)
  for (const n of plan.notes) lines.push(`- ${n}`)
  lines.push('', '| Step | Run | Compared with | New | Fixed | Still |', '|---|---|---|---|---|---|')
  for (const r of results) lines.push(`| ${r.step.kind} ${r.step.role ?? r.step.name}${r.step.phone ? ' (phone)' : ''}${r.exit ? ` ✖ exit ${r.exit}` : ''} | ${r.id} | ${r.prev ?? '—'} | ${r.new.length} | ${r.fixed.length} | ${r.still.length} |`)
  const allNew = results.flatMap((r) => r.new.map((g) => ({ ...g, run: r.id })))
  const allFixed = results.flatMap((r) => r.fixed.map((g) => ({ ...g, run: r.id })))
  if (allNew.length) { lines.push('', '## New', ''); for (const g of top(allNew)) lines.push(`- **${g.severity}** ${g.kind}: ${String(g.detail).slice(0, 200)} _(${g.run})_`) }
  if (allFixed.length) { lines.push('', '## Fixed (gone on re-visited screens)', ''); for (const g of top(allFixed)) lines.push(`- ${g.severity} ${g.kind}: ${String(g.detail).slice(0, 160)}`) }
  const errors = results.filter((r) => r.error)
  if (errors.length) { lines.push('', '## Steps that failed', ''); for (const r of errors) lines.push(`- ${r.id}: ${r.error}`) }
  if (plan.untested.length) { lines.push('', '## Affected but not covered by any earlier run', ''); for (const r of plan.untested.slice(0, 20)) lines.push(`- ${r} — ${changes.why?.[r] ?? ''}`) }
  lines.push('', accepted ? 'Baseline moved to now (index rebuilt).' : 'Baseline unchanged — run `blindqa retest --accept` (or `blindqa index`) once these results are accepted.')
  return lines.join('\n') + '\n'
}

/** Journey files present in .blindqa/journeys (for "run every journey" when nothing has run yet). */
export function journeyFiles(project) {
  const dir = project.path('journeys')
  return existsSync(dir) ? readdirSync(dir).filter((f) => /\.m?js$/.test(f)).map((f) => join('.blindqa', 'journeys', f)) : []
}
