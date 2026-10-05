/**
 * Long runs (crawls, journeys) as background jobs, so an agent starts one, goes quiet, and later reads
 * one summary instead of watching output. A job = a child process + .blindqa/jobs/<id>.json + a log.
 */
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SRC = fileURLToPath(new URL('.', import.meta.url))

const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

/** Start `node <script> ...args` for the project in the background. Returns the job record. */
export function startJob(project, { kind, script, args = [], runId, env = {} }) {
  const jobsDir = project.path('jobs')
  mkdirSync(jobsDir, { recursive: true })
  const id = runId ?? `${kind}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
  const runDir = project.runDir(id)
  const log = join(runDir, 'output.log')
  const fd = openSync(log, 'a')
  const child = spawn(process.execPath, [script, ...args, '--run', id], {
    cwd: project.root,
    env: { ...process.env, BLINDQA_PROJECT: project.root, BLINDQA_RUN: id, BLINDQA_RUN_DIR: runDir, ...env },
    detached: true,
    stdio: ['ignore', fd, fd],
  })
  child.unref()
  closeSync(fd)
  const job = { id, kind, pid: child.pid, script, args, runDir, log, startedAt: new Date().toISOString() }
  writeFileSync(join(jobsDir, `${id}.json`), JSON.stringify(job, null, 2))
  return job
}

export function jobStatus(project, id) {
  const file = project.path('jobs', `${id}.json`)
  if (!existsSync(file)) return null
  const job = JSON.parse(readFileSync(file, 'utf8'))
  const running = alive(job.pid)
  const tail = existsSync(job.log) ? readFileSync(job.log, 'utf8').split('\n').filter(Boolean).slice(-15) : []
  const summary = existsSync(join(job.runDir, 'summary.md')) ? readFileSync(join(job.runDir, 'summary.md'), 'utf8') : null
  return { ...job, running, tail, summary: running ? null : summary }
}

export function listJobs(project) {
  const dir = project.path('jobs')
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
    .map((j) => ({ id: j.id, kind: j.kind, startedAt: j.startedAt, running: alive(j.pid) }))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function stopJob(project, id) {
  const st = jobStatus(project, id)
  if (!st?.running) return false
  try { process.kill(-st.pid, 'SIGTERM') } catch { try { process.kill(st.pid, 'SIGTERM') } catch { return false } }
  return true
}
