/** The never-push guarantee, against a real local "remote". */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { repoWithRemote, git, gitTry, write } from './helpers.mjs'
import { initProject } from '../src/project.mjs'
import { installGuard, checkGuard } from '../src/guard.mjs'

test('init sets up all three layers and leaves git status clean', () => {
  const { app } = repoWithRemote()
  const r = initProject(app, { quiet: true })
  assert.equal(readFileSync(join(app, '.blindqa/.gitignore'), 'utf8').trim(), '*')
  assert.match(readFileSync(join(app, '.git/info/exclude'), 'utf8'), /^\/\.blindqa\/$/m)
  assert.ok(existsSync(join(app, '.git/hooks/pre-push')))
  assert.equal(git(app, 'status', '--porcelain'), '', 'nothing to commit after init')
  assert.ok(checkGuard(app).every((c) => c.pass), JSON.stringify(checkGuard(app)))
  assert.equal(r.guard.notes.length, 0)
})

test('normal pushes pass, pushes containing .blindqa/ are refused', () => {
  const { app, remote } = repoWithRemote()
  initProject(app, { quiet: true })
  write(app, { 'src/a.js': 'export const a = 1\n' })
  git(app, 'add', 'src/a.js')
  git(app, 'commit', '-qm', 'normal change')
  assert.ok(gitTry(app, 'push', '-q', 'origin', 'main').ok, 'a normal push goes through')

  git(app, 'add', '-f', '.blindqa/credentials.json')
  git(app, 'commit', '-qm', 'oops')
  const onMain = gitTry(app, 'push', 'origin', 'main')
  assert.equal(onMain.ok, false)
  assert.match(onMain.out, /blindqa guard: push .* refused/)
  const onNewBranch = gitTry(app, 'push', 'origin', 'main:sneaky')
  assert.equal(onNewBranch.ok, false, 'new branches are checked too')
  assert.doesNotMatch(git(remote, 'ls-tree', '-r', '--name-only', 'main'), /\.blindqa/)

  const failing = checkGuard(app).filter((c) => !c.pass).map((c) => c.name)
  assert.deepEqual(failing.sort(), ['no unpushed commit contains .blindqa/', 'nothing in .blindqa/ is tracked'])
})

test('an existing pre-push hook or core.hooksPath is left alone', () => {
  const a = repoWithRemote()
  mkdirSync(join(a.app, '.git/hooks'), { recursive: true })
  writeFileSync(join(a.app, '.git/hooks/pre-push'), '#!/bin/sh\necho mine\n')
  const r1 = installGuard(a.app)
  assert.equal(readFileSync(join(a.app, '.git/hooks/pre-push'), 'utf8'), '#!/bin/sh\necho mine\n')
  assert.match(r1.notes.join(' '), /already exists/)

  const b = repoWithRemote()
  git(b.app, 'config', 'core.hooksPath', '.husky')
  const r2 = installGuard(b.app)
  assert.ok(!existsSync(join(b.app, '.husky/pre-push')), 'nothing written into a tracked hooks folder')
  assert.match(r2.notes.join(' '), /core\.hooksPath/)
  assert.equal(git(b.app, 'status', '--porcelain'), '')
})

test('push can be disabled for QA clones', () => {
  const { app } = repoWithRemote()
  installGuard(app, { disablePush: true })
  assert.match(git(app, 'remote', 'get-url', '--push', 'origin'), /DISABLED-by-blindqa/)
  assert.equal(gitTry(app, 'push', 'origin', 'main').ok, false)
})
