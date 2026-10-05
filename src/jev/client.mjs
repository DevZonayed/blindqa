/**
 * Jev (TypeSafe's System One model): one request = one piece of state + any number of typed questions.
 * Retries 429/529, times every call, refuses to send the key to any host but the official one.
 */
const OFFICIAL_HOSTS = ['api.typesafe.ai']

export const Choice = (instructions, criteria) => ({ type: 'choice', instructions, criteria })
export const Noul = (instructions, criteria) => ({ type: 'noul', instructions, ...(criteria ? { criteria } : {}) })
export const Score = (instructions, criteria) => ({ type: 'score', instructions, criteria })

/** $ per input token; output tokens are free. */
export const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000

/** An env value a plugin host left unexpanded ("${user_config.x}") or empty counts as unset. */
export const envValue = (name) => { const v = process.env[name]; return v && !/^\$\{.*\}$/.test(v) ? v : undefined }

export function createClient({ url, model, key, timeoutMs = 20000, retries = 3 } = {}) {
  url ||= envValue('TYPESAFE_URL') ?? 'https://api.typesafe.ai/v1/systemone'
  model ||= envValue('TYPESAFE_MODEL') ?? 'jev-latest'
  key ||= envValue('TYPESAFE_API_KEY')
  const host = new URL(url).hostname
  const extra = (process.env.BLINDQA_JEV_ALLOW_HOST ?? '').split(',').filter(Boolean)
  if (![...OFFICIAL_HOSTS, ...extra].includes(host)) {
    throw new Error(`Refusing to send the Jev key to ${host}: only ${OFFICIAL_HOSTS.join(', ')} is official (lookalike resellers exist). Set BLINDQA_JEV_ALLOW_HOST=${host} only if you are sure.`)
  }

  async function ask(state, questions) {
    if (!key) throw new Error('TYPESAFE_API_KEY is not set (environment, <project>/.blindqa/.env or ~/.blindqa/.env)')
    const body = JSON.stringify({ state, model, questions })
    let lastError
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const started = performance.now()
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        })
        clearTimeout(timer)
        const ms = performance.now() - started
        if (res.status === 429 || res.status === 529 || res.status >= 500) {
          const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 400 * 2 ** attempt
          lastError = new Error(`Jev ${res.status}`)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        if (!res.ok) throw Object.assign(new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 300)}`), { fatal: true })
        const json = await res.json()
        return { answers: json.answers ?? {}, usage: json.usage ?? {}, model: json.model ?? model, ms }
      } catch (error) {
        clearTimeout(timer)
        if (error.fatal) throw error
        lastError = error
        if (attempt < retries) await new Promise((r) => setTimeout(r, 300 * 2 ** attempt))
      }
    }
    throw lastError
  }

  return { ask, model, url }
}
