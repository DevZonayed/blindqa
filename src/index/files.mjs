/**
 * Which files the index covers, their content hashes, and how an import string resolves to a file.
 * Uses git when the project is a repo (tracked + untracked-but-not-ignored files; `git hash-object`
 * for hashes), and a plain folder walk otherwise.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix, relative } from 'node:path'

export const CODE_RE = /\.(m?[jt]sx?|cjs|vue|svelte)$/
const STYLE_RE = /\.(css|scss|sass|less)$/
/** Files that can change any screen: a change here means "re-test everything". */
export const WIDE_RE = /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?|tsconfig[\w.]*\.json|(next|vite|nuxt|svelte|remix|astro|tailwind|postcss)\.config\.\w+|\.env[\w.]*|schema\.prisma|middleware\.(t|j)s)$|(^|\/)(migrations?|drizzle)\/|(^|\/)app\/layout\.(t|j)sx?$|(^|\/)pages\/_app\.(t|j)sx?$|(^|\/)(globals?|index|app|main|styles?)\.(css|scss)$/
const SKIP_RE = /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.turbo|\.cache|coverage|vendor|\.blindqa|\.git)\/|\.d\.ts$|\.min\.js$|\.map$/
export const TEST_RE = /(^|\/)(__tests__|__mocks__|e2e|tests?|cypress|playwright)\/|\.(test|spec|stories|e2e)\.\w+$/

export const git = (root, args, input) => {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'ignore'] }) } catch { return null }
}

export const isRepo = (root) => git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true'

/** Indexed files, relative to root, "/" separators. */
export function listFiles(root) {
  let files
  const out = isRepo(root) ? git(root, ['ls-files', '-co', '--exclude-standard', '-z', '--', '.']) : null
  if (out !== null) files = out.split('\0').filter(Boolean)
  else {
    files = []
    ;(function walk(d) {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        const rel = relative(root, p).split('\\').join('/')
        if (SKIP_RE.test(rel + '/')) continue
        if (statSync(p).isDirectory()) walk(p); else files.push(rel)
      }
    })(root)
  }
  return files.filter((f) => !SKIP_RE.test(f) && (CODE_RE.test(f) || STYLE_RE.test(f) || WIDE_RE.test(f)) && existsSync(join(root, f)))
}

/** path → content hash (git's blob hash when git is there, so it matches `git ls-tree`). */
export function hashFiles(root, files) {
  const out = new Map()
  const viaGit = files.length ? git(root, ['hash-object', '--stdin-paths'], files.join('\n') + '\n') : ''
  if (viaGit !== null) {
    viaGit.trim().split('\n').forEach((h, i) => { if (files[i]) out.set(files[i], h) })
    if (out.size === files.length) return out
  }
  for (const f of files) out.set(f, createHash('sha1').update(readFileSync(join(root, f))).digest('hex'))
  return out
}

/** Comments and trailing commas are allowed in tsconfig/jsconfig. */
function readLooseJson(file) {
  try {
    const text = readFileSync(file, 'utf8').replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str ?? '').replace(/,\s*([}\]])/g, '$1')
    return JSON.parse(text)
  } catch { return null }
}

/**
 * resolve(fromFile, spec) → indexed file or null. Handles relative paths, tsconfig/jsconfig `paths`
 * aliases (nearest config, one level of `extends`), workspace packages by package.json name, and
 * TS-ESM `.js` specifiers that point at `.ts` sources.
 */
export function makeResolver(root, files) {
  const known = new Set(files)
  const exts = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.css', '.scss']
  const tryPath = (p) => {
    p = posix.normalize(p).replace(/^\.\//, '')
    const bases = [p, p.replace(/\.(m?js|cjs)$/, '')]
    for (const b of bases) {
      for (const e of exts) if (known.has(b + e)) return b + e
      for (const e of exts.slice(1)) if (known.has(`${b}/index${e}`)) return `${b}/index${e}`
    }
    return null
  }

  const configs = []
  for (const f of files.filter((x) => /(^|\/)(tsconfig|jsconfig)\.json$/.test(x))) {
    const dir = posix.dirname(f) === '.' ? '' : posix.dirname(f)
    let cfg = readLooseJson(join(root, f))
    if (cfg?.extends && typeof cfg.extends === 'string' && cfg.extends.startsWith('.')) {
      const base = readLooseJson(join(root, dir, cfg.extends.endsWith('.json') ? cfg.extends : `${cfg.extends}.json`))
      cfg = { ...base, ...cfg, compilerOptions: { ...(base?.compilerOptions ?? {}), ...(cfg.compilerOptions ?? {}) } }
    }
    const co = cfg?.compilerOptions ?? {}
    if (!co.paths && !co.baseUrl) continue
    configs.push({ dir, baseUrl: posix.join(dir, co.baseUrl ?? '.'), paths: co.paths ?? {} })
  }
  configs.sort((a, b) => b.dir.length - a.dir.length)

  const packages = new Map()
  for (const f of files.filter((x) => /(^|\/)package\.json$/.test(x))) {
    const pj = readLooseJson(join(root, f))
    if (!pj?.name) continue
    const dir = posix.dirname(f) === '.' ? '' : posix.dirname(f)
    const entry = [pj.source, pj.module, pj.main, typeof pj.exports === 'string' ? pj.exports : pj.exports?.['.']?.import ?? pj.exports?.['.']?.default ?? pj.exports?.['.']]
      .filter((x) => typeof x === 'string').map((x) => posix.join(dir, x))
    packages.set(pj.name, { dir, entry })
  }

  return function resolve(from, spec) {
    if (spec.startsWith('.')) return tryPath(posix.join(posix.dirname(from), spec))
    const cfg = configs.find((c) => !c.dir || from.startsWith(c.dir + '/'))
    if (cfg) {
      for (const [pattern, targets] of Object.entries(cfg.paths)) {
        const star = pattern.indexOf('*')
        const head = star >= 0 ? pattern.slice(0, star) : pattern
        if (star >= 0 ? spec.startsWith(head) : spec === pattern) {
          const rest = star >= 0 ? spec.slice(head.length) : ''
          for (const t of targets) { const hit = tryPath(posix.join(cfg.baseUrl, t.replace('*', rest))); if (hit) return hit }
        }
      }
      const viaBase = cfg.baseUrl && !spec.startsWith('@') ? tryPath(posix.join(cfg.baseUrl, spec)) : null
      if (viaBase) return viaBase
    }
    const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    const pkg = packages.get(name)
    if (!pkg) return null
    const sub = spec.slice(name.length).replace(/^\//, '')
    if (sub) return tryPath(posix.join(pkg.dir, sub)) ?? tryPath(posix.join(pkg.dir, 'src', sub))
    for (const e of pkg.entry) { const hit = tryPath(e) ?? tryPath(e.replace(/^(.*\/)?dist\//, '$1src/')); if (hit) return hit }
    return tryPath(posix.join(pkg.dir, 'src/index')) ?? tryPath(posix.join(pkg.dir, 'index'))
  }
}

export const relFrom = (root, abs) => relative(root, abs).split('\\').join('/')
export const parentDir = dirname
