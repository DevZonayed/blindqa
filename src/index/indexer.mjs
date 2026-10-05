/**
 * The code index — the baseline later changes are measured against. Lives in .blindqa/index/:
 *   state.json   commit + branch it was built from, and every file's hash and facts digest
 *   facts.json   per file: pages, labels, API routes, guards, API calls, unresolved-label count
 *   graph.json   per file: the indexed files it imports
 * Re-indexing re-reads only files whose hash changed; everything else is reused.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { extractFacts, EXTRACTOR_VERSION } from './extract.mjs'
import { listFiles, hashFiles, makeResolver, git, isRepo, CODE_RE } from './files.mjs'

export const INDEX_VERSION = 1
const MAX_BYTES = 1_500_000

const read = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback } }

export function loadIndex(project) {
  const dir = project.path('index')
  const state = read(join(dir, 'state.json'), null)
  if (!state || state.version !== INDEX_VERSION) return null
  return { state, facts: read(join(dir, 'facts.json'), {}), graph: read(join(dir, 'graph.json'), {}) }
}

/** Facts of one file as it is on disk now. */
export function factsOnDisk(root, path) {
  const abs = join(root, path)
  if (!existsSync(abs) || !CODE_RE.test(path) || statSync(abs).size > MAX_BYTES) return { imports: [], pages: [], labels: [], dynamic: 0, apiRoutes: [], guards: [], apiCalls: [], digest: 'none' }
  return extractFacts(path, readFileSync(abs, 'utf8'))
}

/** Facts of one file at a git ref (for `changes --since <ref>`). */
export function factsAtRef(root, ref, path) {
  if (!CODE_RE.test(path)) return null
  const src = git(root, ['show', `${ref}:./${path}`])
  return src === null ? null : extractFacts(path, src)
}

export function gitHead(root) {
  if (!isRepo(root)) return { commit: null, branch: null }
  return { commit: git(root, ['rev-parse', 'HEAD'])?.trim() ?? null, branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])?.trim() ?? null }
}

/** Build (or refresh) the baseline from the working tree as it is now. */
export function buildIndex(project, { log = () => {} } = {}) {
  const t0 = Date.now()
  const root = project.root
  const prev = loadIndex(project)
  const files = listFiles(root)
  const hashes = hashFiles(root, files)
  const facts = {}
  let reread = 0
  for (const f of files) {
    const h = hashes.get(f)
    if (prev?.state.extractor === EXTRACTOR_VERSION && prev.state.files[f]?.hash === h && prev.facts[f]) facts[f] = prev.facts[f]
    else { facts[f] = factsOnDisk(root, f); reread += 1 }
  }
  const resolve = makeResolver(root, files)
  const graph = {}
  for (const f of files) {
    const deps = [...new Set((facts[f].imports ?? []).map((s) => resolve(f, s)).filter(Boolean))]
    if (deps.length) graph[f] = deps
  }
  const head = gitHead(root)
  const dirty = isRepo(root) ? (git(root, ['status', '--porcelain', '--', '.']) ?? '').split('\n').filter((l) => l && !/\.blindqa\//.test(l)).length : 0
  const state = {
    version: INDEX_VERSION,
    extractor: EXTRACTOR_VERSION,
    builtAt: new Date().toISOString(),
    commit: head.commit,
    branch: head.branch,
    uncommittedFiles: dirty,
    files: Object.fromEntries(files.map((f) => [f, { hash: hashes.get(f), digest: facts[f].digest }])),
  }
  const dir = project.path('index')
  writeFileSync(join(dir, 'facts.json'), JSON.stringify(facts))
  writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph))
  writeFileSync(join(dir, 'state.json'), JSON.stringify(state, null, 1))
  const stats = {
    files: files.length,
    reread,
    reused: files.length - reread,
    ms: Date.now() - t0,
    pages: Object.values(facts).reduce((n, x) => n + x.pages.length, 0),
    apiRoutes: Object.values(facts).reduce((n, x) => n + x.apiRoutes.length, 0),
    labels: Object.values(facts).reduce((n, x) => n + x.labels.length, 0),
    unresolvedLabels: Object.values(facts).reduce((n, x) => n + (x.dynamic ?? 0), 0),
    importEdges: Object.values(graph).reduce((n, x) => n + x.length, 0),
    commit: head.commit,
  }
  log(`indexed ${stats.files} files (${reread} read, ${stats.reused} reused) in ${stats.ms} ms`)
  return { state, stats }
}
