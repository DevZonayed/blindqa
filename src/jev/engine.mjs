/**
 * Everything that talks to Jev goes through here:
 *   - one request per screen state (callers pass every question about that state at once)
 *   - answer cache: (model, state, question) → answer; an unchanged screen is never asked twice
 *   - log of every question and answer (runs/<id>/jev-log.jsonl) for calibration
 *   - ledger: requests, tokens, $, latency, cache hits (runs/<id>/jev-ledger.json)
 *   - thresholds per question name, and an escalation queue for answers below them
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname } from 'node:path'
import { createClient, envValue, PRICE_PER_INPUT_TOKEN } from './client.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24)

/** How sure an answer is, whatever its type. */
export function certainty(answer) {
  if (!answer) return 0
  if (typeof answer.noul === 'number') return Math.max(answer.noul, 1 - answer.noul)
  if (typeof answer.confidence === 'number') return answer.confidence
  const ps = Object.values(answer.probabilities ?? {})
  return ps.length ? Math.max(...ps) : 0
}

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))] : 0)

export function createEngine({ cacheFile, runDir, model, url, thresholds = {}, enabled = true } = {}) {
  const on = enabled && process.env.BLINDQA_JEV !== 'off' && !!envValue('TYPESAFE_API_KEY')
  const client = on ? createClient({ model, url }) : null
  const ledger = { model: client?.model ?? model ?? null, requests: 0, questions: 0, cachedQuestions: 0, inputTokens: 0, errors: 0, ms: [] }
  const cache = new Map()
  if (cacheFile && existsSync(cacheFile)) {
    for (const line of readFileSync(cacheFile, 'utf8').split('\n')) {
      if (!line) continue
      try { const { k, a } = JSON.parse(line); cache.set(k, a) } catch { /* torn line */ }
    }
  }
  if (cacheFile) mkdirSync(dirname(cacheFile), { recursive: true })

  const write = (file, obj) => runDir && appendFileSync(runDir + file, JSON.stringify(obj) + '\n')

  /**
   * Ask every question about one state. Returns { answers, cachedAll } — answers keyed like `questions`.
   * Only questions missing from the cache are sent. Returns null answers when Jev is off or failing,
   * so callers fall back to their rules.
   */
  async function ask(state, questions, { tag = '' } = {}) {
    const stateText = JSON.stringify(state)
    const stateHash = sha(stateText)
    const keyOf = (q) => sha(`${ledger.model}\u0000${stateText}\u0000${JSON.stringify(q)}`)
    const answers = {}
    const missing = {}
    for (const [id, q] of Object.entries(questions)) {
      const hit = cache.get(keyOf(q))
      if (hit) { answers[id] = { ...hit, cached: true }; ledger.cachedQuestions += 1 } else missing[id] = q
    }
    ledger.questions += Object.keys(questions).length
    if (Object.keys(missing).length && client) {
      try {
        const res = await client.ask(state, missing)
        ledger.requests += 1
        ledger.inputTokens += res.usage.input_tokens ?? 0
        if (res.model) ledger.answeredBy = res.model
        ledger.ms.push(res.ms)
        for (const [id, q] of Object.entries(missing)) {
          const a = res.answers[id]
          if (!a) continue
          answers[id] = a
          const k = keyOf(q)
          cache.set(k, a)
          if (cacheFile) appendFileSync(cacheFile, JSON.stringify({ k, a }) + '\n')
        }
      } catch (error) {
        ledger.errors += 1
        write('jev-log.jsonl', { at: new Date().toISOString(), tag, stateHash, error: String(error.message ?? error).slice(0, 300) })
      }
    }
    for (const [id, q] of Object.entries(questions)) {
      const a = answers[id]
      write('jev-log.jsonl', {
        at: new Date().toISOString(), tag, stateHash, id, type: q.type, q: (typeof q.instructions === 'string' ? q.instructions : JSON.stringify(q.instructions)).slice(0, 160),
        answer: a ? (a.choice ?? a.noul ?? a.score ?? null) : null, certainty: a ? Number(certainty(a).toFixed(3)) : null, cached: !!a?.cached,
      })
    }
    return { answers, cachedAll: !Object.keys(missing).length }
  }

  /** Is this answer sure enough to act on? `name` picks a threshold from profile.jev.thresholds. */
  function confident(answer, name) {
    return certainty(answer) >= (thresholds[name] ?? thresholds.default ?? 0.8)
  }

  /** Park something for the coding agent to look at after the run (never during it). */
  function escalate(item) { write('escalations.jsonl', { at: new Date().toISOString(), ...item }) }

  function summary() {
    const asked = ledger.questions || 1
    return {
      enabled: !!client,
      model: ledger.model,
      answeredBy: ledger.answeredBy ?? null,
      requests: ledger.requests,
      questions: ledger.questions,
      cacheHitRate: Number((ledger.cachedQuestions / asked).toFixed(3)),
      inputTokens: ledger.inputTokens,
      costUsd: Number((ledger.inputTokens * PRICE_PER_INPUT_TOKEN).toFixed(5)),
      p50ms: Math.round(pct(ledger.ms, 50)),
      p95ms: Math.round(pct(ledger.ms, 95)),
      errors: ledger.errors,
    }
  }

  function save() { if (runDir) writeFileSync(runDir + 'jev-ledger.json', JSON.stringify(summary(), null, 2) + '\n') }

  return { ask, confident, escalate, summary, save, enabled: !!client }
}

/** The engine for a loaded project and run folder. */
export function engineFor(project, runDir) {
  return createEngine({
    cacheFile: project.path('cache', 'jev.jsonl'),
    runDir,
    model: project.profile.jev?.model,
    url: project.profile.jev?.url,
    thresholds: project.profile.jev?.thresholds ?? {},
  })
}
