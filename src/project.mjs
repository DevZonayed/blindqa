/**
 * A "project" is the app under test. Everything blindqa knows about it lives in `<repo>/.blindqa/`
 * (layout in layout.mjs). None of it is ever committed or pushed (guard.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { detect } from './detect.mjs'
import { ensureLayout } from './layout.mjs'
import { installGuard } from './guard.mjs'

export const HOME = process.env.BLINDQA_HOME ?? join(homedir(), '.blindqa')

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback)

/** Walk up from `start` to the folder holding `.blindqa/profile.json`. */
export function findProjectRoot(start = process.env.BLINDQA_PROJECT ?? process.cwd()) {
  let dir = resolve(start)
  for (;;) {
    if (existsSync(join(dir, '.blindqa', 'profile.json'))) return dir
    const up = dirname(dir)
    if (up === dir) return null
    dir = up
  }
}

/** Load KEY=value lines into process.env without overwriting what the shell already set. */
function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && (!process.env[m[1]] || /^\$\{.*\}$/.test(process.env[m[1]]))) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

export function loadProject(start) {
  const root = findProjectRoot(start)
  if (!root) throw new Error('No blindqa project here. Run `blindqa init <github-url | folder>` first, or set BLINDQA_PROJECT.')
  const dir = ensureLayout(join(root, '.blindqa'))
  loadEnvFile(join(dir, '.env'))
  loadEnvFile(join(HOME, '.env'))
  const profile = readJson(join(dir, 'profile.json'), {})
  const credentials = readJson(join(dir, 'credentials.json'), { roles: {} })
  return {
    root,
    dir,
    profile,
    credentials,
    path: (...p) => join(dir, ...p),
    /** Folder for one run; created on first use. */
    runDir(id = process.env.BLINDQA_RUN ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)) {
      const d = join(dir, 'runs', id) + '/'
      mkdirSync(join(d, 'shots'), { recursive: true })
      return d
    },
    /**
     * Save values the app handed out (authenticator secret, recovery codes) for every role that signs in
     * with the same phone/email as `who`. credentials.json stays git-ignored and owner-only.
     */
    saveCredential(who, patch) {
      const file = join(dir, 'credentials.json')
      const cur = readJson(file, { roles: {} })
      const same = (r) => (who.phone && r.phone === who.phone) || (who.email && r.email === who.email)
      for (const [k, r] of Object.entries(cur.roles ?? {})) if (k === who.key || same(r)) Object.assign(r, patch)
      writeFileSync(file, JSON.stringify(cur, null, 2) + '\n', { mode: 0o600 })
      Object.assign(credentials, cur)
    },
    /** Merged view of a role: profile settings + credentials + its app. */
    role(name) {
      const key = String(name).toUpperCase()
      const spec = profile.roles?.[key]
      if (!spec) throw new Error(`Role ${key} is not in .blindqa/profile.json (roles: ${Object.keys(profile.roles ?? {}).join(', ') || 'none'})`)
      const appName = spec.app ?? Object.keys(profile.apps ?? {})[0]
      if (!profile.apps?.[appName]) throw new Error(`Role ${key} points at app "${appName}", which is not in profile.apps`)
      const app = { name: appName, ...profile.apps[appName] }
      return { key, session: spec.session ?? key.toLowerCase(), ...spec, app, ...(credentials.roles?.[key] ?? {}) }
    },
  }
}

const GIT_URL = /^(https?:\/\/|git@|ssh:\/\/)|^[\w.-]+\/[\w.-]+(\.git)?$/

/**
 * Turn a GitHub link or a local folder into a blindqa project.
 * A link is cloned (shallow) into `dir`, default ~/.blindqa/projects/<repo>; a folder is used in place.
 */
export function initProject(source, { dir, ref, name, force = false, quiet = false } = {}) {
  let root
  let repo = null
  if (GIT_URL.test(source) && !existsSync(source)) {
    repo = /^[\w.-]+\/[\w.-]+(\.git)?$/.test(source) ? `https://github.com/${source}` : source
    const repoName = basename(repo).replace(/\.git$/, '')
    root = resolve(dir ?? join(HOME, 'projects', repoName))
    if (!existsSync(join(root, '.git'))) {
      mkdirSync(dirname(root), { recursive: true })
      const args = ['clone', '--depth', '1', ...(ref ? ['--branch', ref] : []), repo, root]
      execFileSync('git', args, { stdio: quiet ? 'pipe' : 'inherit' })
    }
  } else {
    root = resolve(source)
    if (!existsSync(root)) throw new Error(`Folder not found: ${root}`)
  }

  const bq = ensureLayout(join(root, '.blindqa'))
  // a repo blindqa cloned only for testing can't push at all; a repo you work in keeps its remotes
  const guard = installGuard(root, { disablePush: !!repo })
  const profileFile = join(bq, 'profile.json')
  const found = detect(root)
  if (!existsSync(profileFile) || force) {
    const profile = {
      name: name ?? basename(root),
      source: { repo, ref: ref ?? null },
      apps: found.apps,
      api: { origins: found.apiOrigins },
      roles: {},
      start: { commands: found.startCommands, health: found.health },
      mail: { mailpit: found.mailpit },
      safety: { allowWrite: ['^/api/auth/refresh$'] },
      browser: { port: 9333, viewport: { width: 1440, height: 900 } },
      detected: found.notes,
    }
    writeFileSync(profileFile, JSON.stringify(profile, null, 2) + '\n')
  }
  const credFile = join(bq, 'credentials.json')
  if (!existsSync(credFile)) {
    writeFileSync(credFile, JSON.stringify({ roles: { ADMIN: { email: '', password: '' } } }, null, 2) + '\n', { mode: 0o600 })
  }
  return { root, dir: bq, repo, detected: found, guard }
}
