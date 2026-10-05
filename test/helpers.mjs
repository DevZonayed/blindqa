/** Shared test helpers: a throwaway home, temp git repos with a local "remote", file writing. */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

export const ROOT = new URL('..', import.meta.url).pathname

// Never touch the real ~/.blindqa from tests — set before any blindqa module is imported.
process.env.BLINDQA_HOME = mkdtempSync(join(tmpdir(), 'blindqa-home-'))
delete process.env.BLINDQA_BROWSER
delete process.env.BLINDQA_CDP_URL
// …nor the developer's git config (a global core.hooksPath would change what the guard does)
process.env.GIT_CONFIG_GLOBAL = '/dev/null'
process.env.GIT_CONFIG_NOSYSTEM = '1'

const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 'test@example.com', GIT_CONFIG_NOSYSTEM: '1' }

export function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'init.defaultBranch=main', ...args], { cwd, env: GIT_ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Try a git command; returns { ok, out } instead of throwing. */
export function gitTry(cwd, ...args) {
  try { return { ok: true, out: git(cwd, ...args) } } catch (e) { return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` } }
}

export function write(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
}

/** A repo with one commit, pushed to a bare "remote" next to it. */
export function repoWithRemote(files = { 'package.json': '{"name":"demo"}\n' }) {
  const base = mkdtempSync(join(tmpdir(), 'blindqa-repo-'))
  const remote = join(base, 'remote.git')
  const app = join(base, 'app')
  mkdirSync(app)
  git(base, 'init', '-q', '--bare', remote)
  git(app, 'init', '-q')
  write(app, files)
  git(app, 'add', '.')
  git(app, 'commit', '-qm', 'init')
  git(app, 'remote', 'add', 'origin', remote)
  git(app, 'push', '-q', 'origin', 'main')
  return { base, app, remote }
}
