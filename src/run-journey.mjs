/**
 * Run a scripted journey (a .mjs file that drives the app through blindqa's harness) inside a project
 * run folder, optionally in shadow mode (Jev guesses every click; the script still decides).
 *
 *   node src/run-journey.mjs <journey.mjs> [--shadow] [--run id] [journey args…]
 *
 * Journeys import the harness from blindqa (src/browser/human.mjs, src/auth/login.mjs) so they share
 * this process's run folder and hooks.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { basename, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadProject } from './project.mjs'
import { useRunDir, watch } from './browser/human.mjs'
import { engineFor } from './jev/engine.mjs'
import { enableShadow, shadowReport } from './shadow.mjs'
import { writeSummary, urlRoute } from './summary.mjs'
import * as human from './browser/human.mjs'
import * as session from './browser/session.mjs'
import * as mail from './auth/mailpit.mjs'
import { openAs } from './auth/login.mjs'
import { extractCandidates, digest } from './browser/extract.mjs'
import { Q, controlOptions } from './jev/questions.mjs'

const argv = process.argv.slice(2)
const script = argv.find((a) => a.endsWith('.mjs') || a.endsWith('.js'))
if (!script) { console.error('usage: run-journey <journey.mjs> [--shadow] [--run id]'); process.exit(2) }
const runAt = argv.indexOf('--run')
const project = loadProject()
const name = basename(script).replace(/\.m?js$/, '')
const runDir = useRunDir(project.runDir(runAt >= 0 ? argv[runAt + 1] : `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`))
watch.origins = [...Object.values(project.profile.apps ?? {}).map((a) => new URL(a.baseUrl).origin), ...(project.profile.api?.origins ?? []).map((o) => new URL(o).origin)]
process.env.BLINDQA_JOURNEY = name

const jev = engineFor(project, runDir)
const shadow = argv.includes('--shadow')
if (shadow) {
  if (!jev.enabled) console.log('shadow mode needs TYPESAFE_API_KEY — running without it')
  else enableShadow(jev)
}

// Journeys get the harness from here, so they never need to know where blindqa is installed:
//   const { project, openSession, sessionOptions, openAs, humanClick, humanFill, runJourney } = globalThis.blindqa
// Every route the journey visits (on the app's own origins) — `blindqa retest` uses it to know which
// journeys cover a changed page.
const visited = new Set()
const track = (page) => page.on('framenavigated', (frame) => {
  if (frame !== page.mainFrame()) return
  try { if (watch.origins.includes(new URL(frame.url()).origin)) visited.add(urlRoute(frame.url())) } catch { /* about:blank */ }
})

globalThis.blindqa = {
  ...human, ...session, mail, project, jev, Q, controlOptions, extractCandidates, digest,
  openAs: (s, role, o = {}) => openAs(s, project, role, { jev, ...o }),
  session: async (o = {}) => {
    const s = await session.openSession(session.sessionOptions(project, { visible: !process.argv.includes('--headless'), ...o }))
    track(s.page)
    s.context.on('page', track)
    return s
  },
}

let finished = false
function finish() {
  if (finished) return
  finished = true
  writeFileSync(runDir + 'journey.json', JSON.stringify({ name, file: relative(project.root, resolve(script)), routes: [...visited].sort(), at: new Date().toISOString() }, null, 2))
  jev.save()
  const extra = []
  if (shadow) {
    const r = shadowReport([runDir + 'shadow.jsonl'])
    extra.push(`Shadow (Jev picks the scripted control): ${r.asked} steps, top-1 ${r.top1}, top-3 ${r.top3}, safe threshold ${r.safeThreshold} covering ${r.coverageAtSafeThreshold} of steps, misses ${r.misses.length}`)
  }
  writeSummary(runDir, { title: `journey ${name}${shadow ? ' (shadow)' : ''}`, jev: jev.summary(), extra })
}
process.on('exit', finish)
process.on('SIGTERM', () => { finish(); process.exit(143) })

await import(pathToFileURL(existsSync(resolve(script)) ? resolve(script) : resolve(project.root, script)).href)
