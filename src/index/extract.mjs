/**
 * Facts a script can read straight from one source file — no model involved:
 *   imports      what it depends on (for impact: a change flows to everything that imports it)
 *   pages        the URL route(s) the file renders (Next.js app/pages router, SvelteKit, Nuxt, Remix, React Router)
 *   labels       words a person sees: JSX text, aria-label / title / placeholder / label / alt, `label: '…'` configs
 *   dynamic      how many visible labels are computed (`aria-label={t('x')}`) — the part a script can't read
 *   apiRoutes    server endpoints it defines (NestJS decorators, Express/Fastify/Hono calls, Next route handlers)
 *   guards       permission/role decorators next to those endpoints
 *   apiCalls     endpoint paths the UI calls (string literals starting with /api, /v1, … or passed to fetch/axios)
 * Regex on purpose: fast, dependency-free, and good enough for impact. What it can't resolve is counted in
 * `dynamic`, so an agent knows which few files might be worth reading.
 */
import { createHash } from 'node:crypto'

/** Bump when extraction changes, so stored facts are re-read instead of reused. */
export const EXTRACTOR_VERSION = 4

const uniq = (a) => [...new Set(a)].sort()
const clean = (s) => s.replace(/\s+/g, ' ').trim()

const IMPORT_RES = [
  /\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
]

/** Route from a file path for file-system routers, or null. */
export function pageRoute(path) {
  const p = path.replace(/\\/g, '/')
  const seg = (s) => s.split('/').filter((x) => x && !/^\(.*\)$/.test(x) && !x.startsWith('@'))
    .map((x) => x.replace(/^\[\[?\.\.\.(\w+)\]?\]$/, '*').replace(/^\[(\w+)\]$/, ':$1').replace(/^\$(\w+)$/, ':$1'))
  let m = p.match(/(?:^|\/)app\/(.*?)\/?page\.(?:t|j)sx?$/) // Next.js app router
  if (m) return '/' + seg(m[1]).join('/')
  m = p.match(/(?:^|\/)pages\/(.*?)\.(?:t|j)sx?$/) // Next.js pages router
  if (m && !/(^|\/)(_app|_document|_error|api\/)/.test(m[1])) return '/' + seg(m[1].replace(/(^|\/)index$/, '')).join('/')
  m = p.match(/(?:^|\/)src\/routes\/(.*?)\/?\+page\.svelte$/) // SvelteKit
  if (m) return '/' + seg(m[1]).join('/')
  m = p.match(/(?:^|\/)pages\/(.*?)\.vue$/) // Nuxt
  if (m) return '/' + seg(m[1].replace(/(^|\/)index$/, '')).join('/')
  m = p.match(/(?:^|\/)app\/routes\/(.*?)\.(?:t|j)sx?$/) // Remix flat routes: users.$id.edit.tsx
  if (m && !m[1].includes('/')) return '/' + seg(m[1].replace(/^_index$|\._index$/, '').split('.').filter((x) => !x.startsWith('_')).join('/')).join('/')
  return null
}

/** Next.js route handler (app/…/route.ts) → API path. */
function routeHandlerPath(path) {
  const m = path.replace(/\\/g, '/').match(/(?:^|\/)app\/(.*?)\/?route\.(?:t|j)s$/)
  if (!m) return null
  return '/' + m[1].split('/').filter((x) => x && !/^\(.*\)$/.test(x)).map((x) => x.replace(/^\[\[?\.\.\.(\w+)\]?\]$/, '*').replace(/^\[(\w+)\]$/, ':$1')).join('/')
}

const TEST_FILE = /(^|\/)(__tests__|__mocks__|e2e|tests?|cypress|playwright)\/|\.(test|spec|stories|e2e)\.\w+$/
const join = (...parts) => '/' + parts.map((x) => String(x ?? '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')
/** Text between JSX tags that is really code (ternaries, comparisons, calls), not words on screen. */
const CODEISH = /^[\w.]+\(|=>|&&|\|\||^\/\/|[=;{}]|\)\s*[:?]|[?:]\s*\(|^[)\]:?]|\bnull\b|\bundefined\b/
/** A run of decorators followed by the method they decorate (NestJS). Args may nest one level of parens/objects. */
const DECORATED_METHOD = /((?:\s*@\w+\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\))+)\s*(?:public\s+|private\s+|protected\s+)?(?:async\s+)?(\w+)\s*\(/g
/** A call that looks like an HTTP request with a literal path: fetch('/x'), api.get<T>('/x'), apiPost<T>(`/x/${id}`) … */
const CLIENT_CALL = /\b(?:[A-Za-z$_][\w$]*\.)?(?:fetch|axios|ky|request|get|post|put|patch|delete|api\w*|http\w*|\w+(?:Get|Post|Put|Patch|Delete|Fetch|Request))\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\(\s*['"`](\/[^'"`\s?]*)/g

export function extractFacts(path, src) {
  const imports = []
  for (const re of IMPORT_RES) for (const m of src.matchAll(re)) imports.push(m[1])

  const pages = []
  const pr = pageRoute(path)
  if (pr) pages.push(pr)
  // a single-page app's entry (Vite/CRA/Vue): everything it mounts is on "/" unless a router says otherwise
  if (/(^|\/)src\/(main|index)\.(t|j)sx?$/.test(path) && /\bcreateRoot\(|\bhydrateRoot\(|ReactDOM\.render\(|\bcreateApp\([\s\S]*?\.mount\(|new Vue\(/.test(src)) pages.push('/')
  // route configs, only in files that use a router (test fixtures and API clients also say `path: '/x'`)
  if (!TEST_FILE.test(path) && /react-router|vue-router|@tanstack\/(react-)?router|createBrowserRouter|createRouter\(|<Route\b/.test(src)) {
    for (const m of src.matchAll(/(?:\bpath\s*:\s*|<Route\b[^>]*?\bpath\s*=\s*\{?\s*)['"`](\/[^'"`]*)['"`]/g)) if (!/^\/api\b/.test(m[1])) pages.push(m[1])
  }

  const labels = []
  let dynamic = 0
  if (/\.(t|j)sx$|\.vue$|\.svelte$/.test(path)) {
    for (const m of src.matchAll(/>\s*([^<>{}\n][^<>{}]{1,120}?)\s*</g)) {
      const t = clean(m[1])
      if (/[A-Za-z]{2}/.test(t) && !CODEISH.test(t)) labels.push(t)
    }
    for (const m of src.matchAll(/\b(?:aria-label|title|placeholder|label|alt)\s*=\s*(?:"([^"]{1,120})"|'([^']{1,120})'|\{\s*['"`]([^'"`${}]{1,120})['"`]\s*\})/g)) labels.push(clean(m[1] ?? m[2] ?? m[3]))
    dynamic += (src.match(/\b(?:aria-label|title|placeholder|label|alt)\s*=\s*\{(?!\s*['"`][^'"`${}]*['"`]\s*\})/g) ?? []).length
    dynamic += (src.match(/\{\s*t\(\s*['"`]/g) ?? []).length // i18n keys: the words live in a dictionary
  }
  for (const m of src.matchAll(/\b(?:label|title|description|placeholder|name)\s*:\s*['"`]([^'"`$\n]{2,120})['"`]/g)) if (/[A-Za-z]{2}/.test(m[1]) && /\s|^[A-Z]/.test(m[1])) labels.push(clean(m[1]))
  for (const m of src.matchAll(/\btoast(?:\.\w+)?\(\s*['"`]([^'"`$\n]{2,160})['"`]/g)) labels.push(clean(m[1]))

  const apiRoutes = []
  const guards = []
  const ctrl = src.match(/@Controller\(\s*(?:['"`]([^'"`]*)['"`]|\{[^}]*?path\s*:\s*['"`]([^'"`]*)['"`])?/)
  if (ctrl) {
    const prefix = ctrl[1] ?? ctrl[2] ?? ''
    for (const m of src.matchAll(DECORATED_METHOD)) {
      const verb = m[1].match(/@(Get|Post|Put|Patch|Delete|All|Head|Options)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/)
      if (!verb) continue
      const route = `${verb[1].toUpperCase()} ${join(prefix, verb[2])}`
      apiRoutes.push(route)
      for (const g of m[1].matchAll(/@(\w*(?:Permission|Role|Roles|Guard|Guards|Feature|Public|Auth|StepUp|Throttle)\w*)\(([^)]{0,160})\)/g)) guards.push(`${route} ${g[1]}(${clean(g[2])})`)
    }
    for (const g of src.slice(0, src.indexOf('export class') > 0 ? src.indexOf('export class') : 0).matchAll(/@(\w*(?:Permission|Role|Roles|Guard|Guards|Feature|Auth)\w*)\(([^)]{0,160})\)/g)) guards.push(`* ${g[1]}(${clean(g[2])})`)
  }
  for (const m of src.matchAll(/\b(?:app|router|server|fastify|api|routes)\.(get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`]*)['"`]/g)) apiRoutes.push(`${m[1].toUpperCase()} ${m[2]}`)
  const handler = routeHandlerPath(path)
  if (handler) for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)) apiRoutes.push(`${m[1]} ${handler}`)

  const apiCalls = []
  for (const m of src.matchAll(/['"`]((?:\/api|\/v\d+|\/graphql|\/trpc)(?:\/[^'"`\s?]*)?)/g)) apiCalls.push(m[1].replace(/\$\{[^}]*\}/g, ':p'))
  for (const m of src.matchAll(CLIENT_CALL)) if (!/^\/\//.test(m[1])) apiCalls.push(m[1].replace(/\$\{[^}]*\}/g, ':p'))

  const facts = { imports: uniq(imports), pages: uniq(pages), labels: uniq(labels), dynamic, apiRoutes: uniq(apiRoutes), guards: uniq(guards), apiCalls: uniq(apiCalls) }
  facts.digest = createHash('sha1').update(JSON.stringify({ ...facts, imports: undefined })).digest('hex').slice(0, 12)
  return facts
}

/** What differs between two fact sets (null = file added/removed). Labels etc. as added/removed lists. */
export function diffFacts(before, after) {
  const out = {}
  for (const k of ['pages', 'labels', 'apiRoutes', 'guards', 'apiCalls', 'imports']) {
    const a = new Set(before?.[k] ?? [])
    const b = new Set(after?.[k] ?? [])
    const added = [...b].filter((x) => !a.has(x))
    const removed = [...a].filter((x) => !b.has(x))
    if (added.length || removed.length) out[k] = { added, removed }
  }
  return out
}
