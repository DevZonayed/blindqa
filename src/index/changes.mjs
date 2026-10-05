/**
 * What changed since the baseline (the index, or a git ref), and what it touches:
 *   files     added / modified / deleted, with which facts changed (labels, pages, API routes, guards…)
 *   routes    page routes whose code imports a changed file, directly or through any chain of imports
 *   apiRoutes server endpoints defined in, or reached from, a changed file; UI pages calling them count too
 *   wide      the change can affect any screen (global layout/CSS, config, dependencies, migrations…)
 * Read-only: the baseline only moves with `blindqa index` or `blindqa retest --accept`.
 */
import { diffFacts, EXTRACTOR_VERSION } from './extract.mjs'
import { loadIndex, buildIndex, factsOnDisk, factsAtRef } from './indexer.mjs'
import { listFiles, hashFiles, makeResolver, git, isRepo, WIDE_RE, TEST_RE, CODE_RE } from './files.mjs'

export const normRoute = (r) => (String(r || '/').split('?')[0].replace(/\/:[^/]+/g, '/:p').replace(/\/\*$/, '/:p').replace(/\/+$/, '') || '/')
const apiPath = (r) => normRoute(r.replace(/^[A-Z]+ /, ''))

export function computeChanges(project, { since = null, log = () => {} } = {}) {
  const root = project.root
  let idx = loadIndex(project)
  if (!idx) { log('no index yet — building the baseline from the current files first'); buildIndex(project); idx = loadIndex(project) }

  const files = listFiles(root)
  const current = new Set(files)
  const status = new Map()
  if (since) {
    if (!isRepo(root)) throw new Error('--since needs a git repository')
    if (git(root, ['rev-parse', '--verify', '--quiet', `${since}^{commit}`]) === null) throw new Error(`unknown git ref: ${since}`)
    for (const line of (git(root, ['diff', '--relative', '--name-status', '--no-renames', since, '--', '.']) ?? '').split('\n').filter(Boolean)) {
      const [st, p] = line.split('\t')
      status.set(p, st === 'A' ? 'added' : st === 'D' ? 'deleted' : 'modified')
    }
    for (const p of (git(root, ['ls-files', '-o', '--exclude-standard', '--', '.']) ?? '').split('\n').filter(Boolean)) status.set(p, 'added')
    for (const p of [...status.keys()]) if (!current.has(p) && status.get(p) !== 'deleted') status.delete(p)
  } else {
    const hashes = hashFiles(root, files)
    for (const f of files) {
      const before = idx.state.files[f]
      if (!before) status.set(f, 'added')
      else if (before.hash !== hashes.get(f)) status.set(f, 'modified')
    }
    for (const f of Object.keys(idx.state.files)) if (!current.has(f)) status.set(f, 'deleted')
  }

  const changed = []
  const nowFacts = { ...idx.facts }
  // an index built by an older extractor: read the "before" side from the indexed commit instead
  const stale = idx.state.extractor !== EXTRACTOR_VERSION && idx.state.commit && isRepo(root)
  for (const [path, st] of status) {
    if (!(CODE_RE.test(path) || WIDE_RE.test(path) || /\.(css|scss|sass|less)$/.test(path))) continue
    const before = since ? factsAtRef(root, since, path) : stale ? factsAtRef(root, idx.state.commit, path) ?? idx.facts[path] ?? null : idx.facts[path] ?? null
    const after = st === 'deleted' ? null : factsOnDisk(root, path)
    if (after) nowFacts[path] = after; else delete nowFacts[path]
    const diff = diffFacts(before, after)
    changed.push({ path, status: st, test: TEST_RE.test(path), wide: WIDE_RE.test(path), factsChanged: Object.keys(diff).some((k) => k !== 'imports'), diff, dynamicLabels: after?.dynamic ?? 0 })
  }

  // import graph as it is now: baseline edges, with changed files' edges re-resolved
  const resolve = makeResolver(root, files)
  const graph = { ...idx.graph }
  for (const c of changed) {
    if (c.status === 'deleted') delete graph[c.path]
    else graph[c.path] = [...new Set((nowFacts[c.path]?.imports ?? []).map((s) => resolve(c.path, s)).filter(Boolean))]
  }
  const importers = new Map()
  for (const [f, deps] of Object.entries(graph)) for (const d of deps) importers.set(d, [...(importers.get(d) ?? []), f])

  // everything that (transitively) imports a changed non-test file
  const reached = new Set()
  const queue = changed.filter((c) => !c.test).map((c) => c.path)
  while (queue.length) {
    const f = queue.shift()
    if (reached.has(f)) continue
    reached.add(f)
    for (const imp of importers.get(f) ?? []) if (!reached.has(imp)) queue.push(imp)
  }

  const factsOf = (f) => nowFacts[f] ?? idx.facts[f] ?? {}
  const routes = new Set()
  const why = {} // route -> the file that made it affected
  const addRoute = (r, f) => { routes.add(r); why[r] ??= f }
  const apiRoutes = new Set()
  for (const f of reached) {
    if (TEST_RE.test(f)) continue
    for (const r of factsOf(f).pages ?? []) addRoute(r, f)
    for (const r of factsOf(f).apiRoutes ?? []) apiRoutes.add(r)
  }
  for (const c of changed) for (const k of ['pages', 'apiRoutes']) for (const r of c.diff[k]?.removed ?? []) if (k === 'pages') addRoute(r, c.path); else apiRoutes.add(r)

  // a server change reaches the screens that call its endpoints
  let callersFound = []
  if (apiRoutes.size) {
    const paths = [...new Set([...apiRoutes].map(apiPath))].filter((a) => a.length > 1)
    // the UI usually calls "/api/v1/<controller path>"; the server declares "<controller path>"
    // generic clients and proxies call "/api/v1/${path}": only a path with a fixed segment says which endpoint
    const fixed = (p) => p.split('/').filter((x) => x && x !== ':p').length
    const calls = (p) => { const s = normRoute(p); const bare = s.replace(/^\/api(\/v\d+)?/, ''); return fixed(bare) > 0 && paths.some((a) => s.endsWith(a) || a.endsWith(bare)) }
    const callers = Object.keys(nowFacts).filter((f) => !TEST_RE.test(f) && (nowFacts[f].apiCalls ?? []).some(calls))
    callersFound = callers
    const seen = new Set()
    const q = [...callers]
    while (q.length) { const f = q.shift(); if (seen.has(f) || TEST_RE.test(f)) continue; seen.add(f); for (const r of factsOf(f).pages ?? []) addRoute(r, `${f} (calls a changed endpoint)`); for (const imp of importers.get(f) ?? []) q.push(imp) }
  }

  const allPages = Object.values(nowFacts).reduce((n, x) => n + (x.pages?.length ?? 0), 0)
  const wideReasons = changed.filter((c) => c.wide).map((c) => `${c.path} (global file)`)
  if (allPages > 4 && routes.size > allPages * 0.5) wideReasons.push(`reaches ${routes.size} of ${allPages} pages`)

  const commits = isRepo(root) && idx.state.commit && !since
    ? (git(root, ['log', '--oneline', '--no-decorate', '-30', `${idx.state.commit}..HEAD`, '--', '.']) ?? '').split('\n').filter(Boolean)
    : []
  return {
    base: since ? { ref: since } : { commit: idx.state.commit, builtAt: idx.state.builtAt },
    commits,
    files: changed.sort((a, b) => a.path.localeCompare(b.path)),
    routes: [...routes].sort(),
    why,
    callers: typeof callersFound === 'undefined' ? [] : callersFound,
    apiRoutes: [...apiRoutes].sort(),
    reached: reached.size,
    wide: wideReasons.length > 0,
    wideReasons,
    unresolved: changed.filter((c) => c.dynamicLabels > 0 && c.factsChanged).map((c) => `${c.path} (${c.dynamicLabels} computed labels)`),
  }
}

/** A short human-readable view (also what the MCP tool returns). */
export function formatChanges(ch, { max = 40 } = {}) {
  const lines = []
  lines.push(`Baseline: ${ch.base.ref ? `git ${ch.base.ref}` : `${ch.base.commit?.slice(0, 10) ?? 'no commit'} (indexed ${ch.base.builtAt?.slice(0, 16)})`}`)
  if (ch.commits.length) lines.push(`Commits since: ${ch.commits.length} — ${ch.commits.slice(0, 5).join(' | ')}${ch.commits.length > 5 ? ' …' : ''}`)
  lines.push(`Changed files: ${ch.files.length}${ch.files.length ? '' : ' — nothing to re-test'}`)
  for (const f of ch.files.slice(0, max)) {
    const what = Object.entries(f.diff).filter(([k]) => k !== 'imports').map(([k, v]) => `${k} +${v.added.length}/-${v.removed.length}`).join(', ')
    lines.push(`  ${f.status.padEnd(8)} ${f.path}${f.test ? ' (test)' : ''}${f.wide ? ' (GLOBAL)' : ''}${what ? ` — ${what}` : f.status === 'modified' ? ' — logic only' : ''}`)
  }
  if (ch.files.length > max) lines.push(`  … +${ch.files.length - max} more`)
  if (ch.files.length) {
    lines.push(`Affected page routes: ${ch.routes.length}${ch.routes.length ? ` — ${ch.routes.slice(0, 15).join(', ')}${ch.routes.length > 15 ? ' …' : ''}` : ''}`)
    if (ch.apiRoutes.length) lines.push(`Affected API routes: ${ch.apiRoutes.length} — ${ch.apiRoutes.slice(0, 10).join(', ')}${ch.apiRoutes.length > 10 ? ' …' : ''}`)
    lines.push(ch.wide ? `WIDE change — re-test everything: ${ch.wideReasons.slice(0, 5).join('; ')}` : `Scope: ${ch.reached} files reached through imports`)
    if (ch.unresolved.length) lines.push(`Labels computed at runtime (the crawl checks them on screen; read only if a step fails): ${ch.unresolved.slice(0, 8).join(', ')}`)
  }
  return lines.join('\n')
}
