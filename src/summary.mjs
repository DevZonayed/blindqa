/**
 * summary.md — the one file a coding agent reads after a run (kept short on purpose), plus helpers
 * to list runs and read findings without opening raw logs.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SEV = ['critical', 'high', 'medium', 'low']

export function readJsonl(file) {
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)] } catch { return [] } })
}

/** Findings of a run, grouped: same kind + same text after numbers/ids are blanked = one entry. `keep` filters raw findings. */
export function groupFindings(runDir, keep = null) {
  const groups = new Map()
  for (const f of readJsonl(join(runDir, 'findings.jsonl'))) {
    if (keep && !keep(f)) continue
    const fp = `${f.kind}|${String(f.detail).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, ':id').replace(/\d+/g, '#').slice(0, 160)}`
    const g = groups.get(fp) ?? { fingerprint: fp, kind: f.kind, severity: f.severity, detail: f.detail, count: 0, screens: new Set(), ids: [], judgedBy: f.judgedBy ?? 'rules', needsReview: !!f.needsReview, shot: f.shot }
    g.count += 1
    g.screens.add(f.screen)
    g.ids.push(f.id)
    groups.set(fp, g)
  }
  return [...groups.values()].map((g) => ({ ...g, screens: [...g.screens] }))
    .sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || b.count - a.count)
}

export function writeSummary(runDir, { title, map = null, jev = null, extra = [] } = {}) {
  const groups = groupFindings(runDir)
  const escalations = readJsonl(join(runDir, 'escalations.jsonl'))
  const bySev = Object.fromEntries(SEV.map((s) => [s, groups.filter((g) => g.severity === s).length]))
  const lines = [
    `# ${title ?? 'blindqa run'}`,
    '',
    `Run folder: \`${runDir}\``,
    map ? `Screens: ${map.screens?.length ?? 0} · seconds: ${map.seconds ?? '?'} · writes blocked: ${map.blockedWrites?.length ?? 0}` : '',
    `Findings (grouped): ${groups.length} — critical ${bySev.critical}, high ${bySev.high}, medium ${bySev.medium}, low ${bySev.low}`,
    jev ? `Jev: ${jev.enabled ? `${jev.requests} requests, ${jev.questions} questions, cache hit ${Math.round(jev.cacheHitRate * 100)}%, ${jev.inputTokens} tokens, $${jev.costUsd}, p50 ${jev.p50ms} ms, errors ${jev.errors}` : 'off (no TYPESAFE_API_KEY or --no-jev)'}` : '',
    escalations.length ? `Unsure Jev answers parked for review: ${escalations.length} (escalations.jsonl)` : '',
    ...extra,
    '',
    '## Findings',
    '',
    '| Sev | Kind | Times | What | Screens | Review |',
    '|---|---|---|---|---|---|',
    ...groups.slice(0, 60).map((g) => `| ${g.severity} | ${g.kind} | ${g.count} | ${String(g.detail).replace(/\|/g, '/').slice(0, 220)} | ${g.screens.slice(0, 3).join('; ').replace(/\|/g, '/').slice(0, 120)}${g.screens.length > 3 ? ` +${g.screens.length - 3}` : ''} | ${g.needsReview ? 'yes' : ''}${g.judgedBy === 'jev' ? ' (jev)' : ''} |`),
    groups.length > 60 ? `\n…and ${groups.length - 60} more in findings.jsonl` : '',
  ].filter((l) => l !== '')
  writeFileSync(join(runDir, 'summary.md'), lines.join('\n') + '\n')
  return { file: join(runDir, 'summary.md'), groups: groups.length, bySev }
}

/** Runs of a project, newest first. */
export function listRuns(project) {
  const dir = project.path('runs')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory())
    .map((d) => ({ id: d, dir: join(dir, d) + '/', at: statSync(join(dir, d)).mtime.toISOString(), hasSummary: existsSync(join(dir, d, 'summary.md')) }))
    .sort((a, b) => b.at.localeCompare(a.at))
}

const ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/** A page URL as a route pattern (ids and numbers become parameters), comparable with index routes. */
export const urlRoute = (url) => {
  try { return (new URL(url).pathname.replace(ID_RE, ':p').replace(/\/\d+(?=\/|$)/g, '/:p').replace(/\/:[^/]+/g, '/:p').replace(/\/+$/, '')) || '/' } catch { return null }
}

/**
 * NEW / GONE / STILL between two runs, by fingerprint. With `scope` (a Set of routes), only findings on
 * those routes count — a partial re-test must not report everything it didn't look at as fixed.
 */
export function compareRuns(beforeDir, afterDir, { scope = null } = {}) {
  const keep = scope ? (f) => scope.has(urlRoute(f.url)) : null
  const a = new Map(groupFindings(beforeDir, keep).map((g) => [g.fingerprint, g]))
  const b = new Map(groupFindings(afterDir, keep).map((g) => [g.fingerprint, g]))
  return {
    new: [...b.values()].filter((g) => !a.has(g.fingerprint)),
    gone: [...a.values()].filter((g) => !b.has(g.fingerprint)),
    still: [...b.values()].filter((g) => a.has(g.fingerprint)),
  }
}
