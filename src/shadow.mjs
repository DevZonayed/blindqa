/**
 * Shadow mode — measures Jev on a real app for free, using existing scripted journeys as ground truth.
 *
 * Before every scripted click, the control the script is about to click is marked, the screen's
 * controls are extracted, and Jev is asked which one performs the step (the script's own label, plus
 * the last few steps as context). The click then happens exactly as scripted; Jev never steers.
 * Each step is logged to shadow.jsonl; shadowReport() turns that into accuracy per confidence band.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { extractCandidates, digest } from './browser/extract.mjs'
import { controlOptions, screenState, Q } from './jev/questions.mjs'
import { certainty } from './jev/engine.mjs'
import { hooks, ctx, RUN_DIR } from './browser/human.mjs'

/** Turn on shadow mode for everything humanClick() does from now on. */
export function enableShadow(jev, { recent = 5 } = {}) {
  const history = []
  hooks.beforeClick = async (page, target, label) => {
    const marked = await target.evaluate((el) => { el.setAttribute('data-bq-target', ''); return true }).catch(() => false)
    try {
      if (!marked) return
      const extracted = await extractCandidates(page)
      const { candidates } = extracted
      const truth = candidates.filter((c) => c.isTarget).map((c) => `e${c.index}`)
      const row = { at: new Date().toISOString(), journey: process.env.BLINDQA_JOURNEY ?? '', step: ctx.step, label, url: page.url(), candidates: candidates.length, truth }
      if (!truth.length) { appendFileSync(RUN_DIR + 'shadow.jsonl', JSON.stringify({ ...row, skipped: 'target not among extracted controls' }) + '\n'); return }
      const { criteria } = controlOptions(candidates.map(({ isTarget, ...c }) => c))
      const clean = { ...extracted, candidates: candidates.map(({ isTarget, ...c }) => c) }
      const state = await screenState(page, clean, digest, { previous_steps: history.slice(-recent) })
      const { answers } = await jev.ask(state, { target: Q.target(label, criteria) }, { tag: 'shadow.target' })
      const a = answers.target
      const top3 = Object.entries(a?.probabilities ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => k)
      appendFileSync(RUN_DIR + 'shadow.jsonl', JSON.stringify({
        ...row, chosen: a?.choice ?? null, correct: a ? truth.includes(a.choice) : null, top3Correct: a ? top3.some((k) => truth.includes(k)) : null,
        certainty: a ? Number(certainty(a).toFixed(3)) : null, cached: !!a?.cached,
        chosenText: a ? criteria[a.choice] : null, truthText: criteria[truth[0]],
      }) + '\n')
    } finally {
      history.push(label)
      await target.evaluate((el) => el.removeAttribute('data-bq-target')).catch(() => {})
    }
  }
}

/** Accuracy overall and per certainty band, plus the misses — from one or more shadow.jsonl files. */
export function shadowReport(files) {
  const rows = files.filter(existsSync).flatMap((f) => readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)))
  const asked = rows.filter((r) => r.correct !== null && r.correct !== undefined)
  const bands = [[0, 0.5], [0.5, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 0.95], [0.95, 1.01]]
  const rate = (xs, f) => (xs.length ? Number((xs.filter(f).length / xs.length).toFixed(3)) : null)
  const byBand = bands.map(([lo, hi]) => {
    const xs = asked.filter((r) => r.certainty >= lo && r.certainty < hi)
    return { band: `${lo}–${Math.min(hi, 1)}`, n: xs.length, accuracy: rate(xs, (r) => r.correct) }
  }).filter((b) => b.n)
  // the lowest threshold at which every answer at or above it was right (what we can trust blindly)
  const sorted = [...asked].sort((a, b) => b.certainty - a.certainty)
  let safeThreshold = null
  let wrongSeen = false
  for (const r of sorted) { if (!r.correct) { wrongSeen = true; break } safeThreshold = r.certainty }
  return {
    steps: rows.length,
    asked: asked.length,
    skipped: rows.length - asked.length,
    top1: rate(asked, (r) => r.correct),
    top3: rate(asked, (r) => r.top3Correct),
    byBand,
    safeThreshold: wrongSeen || asked.length ? safeThreshold : null,
    coverageAtSafeThreshold: safeThreshold === null ? 0 : rate(asked, (r) => r.certainty >= safeThreshold),
    misses: asked.filter((r) => !r.correct).map((r) => ({ journey: r.journey, label: r.label, certainty: r.certainty, chose: r.chosenText, should: r.truthText, url: r.url })),
  }
}
