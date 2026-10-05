/**
 * Nothing blindqa writes may ever reach a git remote. Three layers, all local to this machine:
 *   1. `.blindqa/.gitignore` is "*"            — the folder ignores itself (layout.mjs)
 *   2. a line in `.git/info/exclude`           — git's per-clone ignore list, never committed
 *   3. a `pre-push` hook                       — refuses a push whose commits contain any .blindqa/ path,
 *                                                even one added with `git add -f`
 * blindqa never edits the repo's tracked files (no change to the project's own .gitignore), so setting
 * this up leaves nothing to commit. Repos blindqa clones for testing also get their push URL disabled.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative } from 'node:path'
import { ensureLayout } from './layout.mjs'

const MARK = 'blindqa-guard'

function git(root, args) {
  try { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() } catch { return null }
}

/** Where the repo's git data lives (works for worktrees and submodules too). Null outside a repo. */
export function gitInfo(root) {
  const top = git(root, ['rev-parse', '--show-toplevel'])
  if (!top) return null
  const abs = (p) => (p && !isAbsolute(p) ? join(root, p) : p)
  const hooksPathSetting = git(root, ['config', '--get', 'core.hooksPath'])
  return {
    top,
    exclude: abs(git(root, ['rev-parse', '--git-path', 'info/exclude'])),
    hooks: hooksPathSetting ? (isAbsolute(hooksPathSetting) ? hooksPathSetting : join(top, hooksPathSetting)) : abs(git(root, ['rev-parse', '--git-path', 'hooks'])),
    hooksPathSetting,
    remotes: (git(root, ['remote']) ?? '').split('\n').filter(Boolean),
  }
}

/** The .blindqa/ path relative to the repo top, as git prints paths. Git reports real paths, so compare real
 * paths too (on macOS /var and /tmp are symlinks into /private). */
const real = (p) => { try { return realpathSync(p) } catch { return p } }
const relDir = (info, root) => {
  const r = relative(real(info.top), real(root)).split('\\').join('/')
  return r ? `${r}/.blindqa` : '.blindqa'
}

const HOOK = `#!/bin/sh
# ${MARK}: refuse to push commits that contain .blindqa/ (local QA data: credentials, sessions, runs).
# Installed by blindqa. Delete this file to remove the guard.
fail=0
while read local_ref local_sha remote_ref remote_sha; do
  case "$local_sha" in *[!0]*) ;; *) continue ;; esac            # branch deletion: nothing is sent
  case "$remote_sha" in
    *[!0]*) range="$remote_sha..$local_sha" ;;
    *)      range="$local_sha --not --remotes" ;;                # new branch: everything not on a remote yet
  esac
  hits=$(git log --name-only --format= $range 2>/dev/null | grep -E '(^|/)\\.blindqa(/|$)' | sort -u | head -10)
  if [ -n "$hits" ]; then
    echo "blindqa guard: push to $remote_ref refused — these commits contain local QA files:" >&2
    echo "$hits" | sed 's/^/  /' >&2
    fail=1
  fi
done
if [ "$fail" = 1 ]; then
  echo "Take them out of the commits (git rm -r --cached <path>, then amend or rebase) and push again." >&2
  exit 1
fi
exit 0
`

/**
 * Set up all three layers for the project at `root` (the folder that holds .blindqa/).
 * `{ disablePush: true }` additionally makes every remote of this clone push-proof (for QA clones).
 */
export function installGuard(root, { disablePush = false } = {}) {
  const dir = ensureLayout(join(root, '.blindqa'))
  const info = gitInfo(root)
  const done = ['.blindqa/.gitignore is "*"']
  if (!info) return { repo: false, done, notes: ['not a git repository — nothing here can be pushed'] }
  const notes = []

  const line = `/${relDir(info, root)}/`
  const current = existsSync(info.exclude) ? readFileSync(info.exclude, 'utf8') : ''
  if (!current.split('\n').some((l) => l.trim() === line)) {
    mkdirSync(dirname(info.exclude), { recursive: true })
    appendFileSync(info.exclude, `${current && !current.endsWith('\n') ? '\n' : ''}# ${MARK}: local QA data, never committed\n${line}\n`)
  }
  done.push(`${line} listed in ${info.exclude}`)

  const hook = join(info.hooks, 'pre-push')
  if (info.hooksPathSetting) {
    // a hooks folder inside the repo would be committed; a global one is shared by every repo
    notes.push(`core.hooksPath is set (${info.hooksPathSetting}), so blindqa leaves hooks alone. Add the check to your pre-push hook yourself: blindqa guard --hook-script`)
  } else if (existsSync(hook) && !readFileSync(hook, 'utf8').includes(MARK)) {
    notes.push(`a pre-push hook already exists (${hook}) and is not blindqa's — left as it is. Add the check to it: blindqa guard --hook-script`)
  } else {
    mkdirSync(info.hooks, { recursive: true })
    writeFileSync(hook, HOOK)
    chmodSync(hook, 0o755)
    done.push(`pre-push hook ${hook}`)
  }

  if (disablePush) {
    for (const r of info.remotes) git(root, ['remote', 'set-url', '--push', r, 'DISABLED-by-blindqa-no-push'])
    if (info.remotes.length) done.push(`push disabled for remotes: ${info.remotes.join(', ')}`)
  }
  return { repo: true, done, notes, dir }
}

export const hookScript = () => HOOK

/** Is everything in place, and has anything already slipped into git? Each check: { name, pass, detail }. */
export function checkGuard(root) {
  const checks = []
  const ok = (name, pass, detail = '') => checks.push({ name, pass, detail })
  const dir = join(root, '.blindqa')
  const selfIgnore = existsSync(join(dir, '.gitignore')) && readFileSync(join(dir, '.gitignore'), 'utf8').trim() === '*'
  ok('.blindqa/.gitignore is "*"', selfIgnore, selfIgnore ? '' : 'run `blindqa guard --install`')
  const info = gitInfo(root)
  if (!info) { ok('git', true, 'not a git repository — nothing here can be pushed'); return checks }
  const rel = relDir(info, root)
  const tracked = (git(info.top, ['ls-files', '--', rel]) ?? '').split('\n').filter(Boolean)
  ok('nothing in .blindqa/ is tracked', tracked.length === 0, tracked.length ? `${tracked.length} tracked: ${tracked.slice(0, 3).join(', ')} — untrack with: git rm -r --cached ${rel}` : '')
  const ignored = execOk(info.top, ['check-ignore', '-q', `${rel}/profile.json`])
  ok('git ignores .blindqa/', ignored, ignored ? '' : 'run `blindqa guard --install`')
  const exclude = existsSync(info.exclude) && readFileSync(info.exclude, 'utf8').split('\n').some((l) => l.trim() === `/${rel}/`)
  ok('listed in .git/info/exclude', exclude, exclude ? '' : 'run `blindqa guard --install`')
  const unpushed = (git(info.top, ['log', '--branches', '--not', '--remotes', '--name-only', '--format=']) ?? '').split('\n').filter((p) => /(^|\/)\.blindqa(\/|$)/.test(p))
  ok('no unpushed commit contains .blindqa/', unpushed.length === 0, unpushed.length ? `${[...new Set(unpushed)].slice(0, 3).join(', ')} — remove them from those commits before pushing` : '')
  const hook = join(info.hooks, 'pre-push')
  const ours = existsSync(hook) && readFileSync(hook, 'utf8').includes(MARK)
  ok('pre-push guard', ours || existsSync(hook), ours ? hook : existsSync(hook) ? `your own pre-push hook is in place (${hook}); add \`blindqa guard --hook-script\` to it for this layer` : 'run `blindqa guard --install`')
  return checks
}

function execOk(root, args) {
  try { execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' }); return true } catch { return false }
}
