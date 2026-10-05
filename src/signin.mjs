/**
 * Sign in as one role and stop on its landing screen (saves the session for later runs).
 *   node src/signin.mjs <ROLE> [--headless]
 */
import { loadProject } from './project.mjs'
import { openSession, sessionOptions } from './browser/session.mjs'
import { openAs, persistSession } from './auth/login.mjs'
import { useRunDir, watch, VISIBLE, flushSignals } from './browser/human.mjs'
import { extractCandidates, digest } from './browser/extract.mjs'
import { engineFor } from './jev/engine.mjs'

const role = process.argv[2]
const project = loadProject()
const runDir = useRunDir(project.runDir(`signin-${role.toLowerCase()}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`))
watch.origins = [...Object.values(project.profile.apps).map((a) => new URL(a.baseUrl).origin), ...(project.profile.api?.origins ?? [])]
const s = await openSession(sessionOptions(project, { visible: VISIBLE }))
try {
  const page = await openAs(s, project, role, { jev: engineFor(project, runDir) })
  await flushSignals(page)
  const c = await extractCandidates(page)
  console.log(`\n${role} signed in → ${page.url()}  "${c.title}"`)
  console.log(await digest(page, { maxChars: 900 }))
  console.log('controls:', c.candidates.slice(0, 60).map((x) => `${x.role} "${x.name}"`).join(' | '))
} catch (e) {
  console.log(`\n✖ ${role}: ${e.message}`)
  const p = s.page
  await p.screenshot({ path: runDir + 'shots/signin-failed.png' }).catch(() => {})
  console.log('screen now:', p.url(), (await digest(p, { maxChars: 700 }).catch(() => '')))
  console.log('controls:', (await extractCandidates(p).catch(() => ({ candidates: [] }))).candidates.slice(0, 40).map((x) => `${x.role} "${x.name}"`).join(' | '))
  process.exitCode = 1
} finally { await persistSession(s, project, role); await s.close() }
