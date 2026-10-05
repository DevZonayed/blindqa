/**
 * First guess at how to run an unknown repo: which web apps it has, on which ports, and how to
 * start them. Only a starting point for profile.json — the coding agent (or a person) confirms it.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return null } }
const readText = (f) => { try { return readFileSync(f, 'utf8') } catch { return '' } }

function packageDirs(root) {
  const dirs = [root]
  for (const group of ['apps', 'packages', 'services', 'frontend', 'web', 'client', 'server', 'backend']) {
    const g = join(root, group)
    if (!existsSync(g) || !statSync(g).isDirectory()) continue
    if (existsSync(join(g, 'package.json'))) dirs.push(g)
    for (const d of readdirSync(g)) if (existsSync(join(g, d, 'package.json'))) dirs.push(join(g, d))
  }
  return dirs
}

const FRAMEWORKS = [
  ['next', 'next', 3000, 'web'],
  ['@nestjs/core', 'nest', 3000, 'api'],
  ['vite', 'vite', 5173, 'web'],
  ['react-scripts', 'cra', 3000, 'web'],
  ['@angular/core', 'angular', 4200, 'web'],
  ['nuxt', 'nuxt', 3000, 'web'],
  ['@sveltejs/kit', 'sveltekit', 5173, 'web'],
  ['astro', 'astro', 4321, 'web'],
  ['@remix-run/dev', 'remix', 3000, 'web'],
  ['express', 'express', 3000, 'api'],
  ['fastify', 'fastify', 3000, 'api'],
]

export function detect(root) {
  const notes = []
  const apps = {}
  const apiOrigins = []
  const startCommands = []
  const health = []

  const rootPkg = readJson(join(root, 'package.json'))
  const pm = existsSync(join(root, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(root, 'yarn.lock')) ? 'yarn' : 'npm'

  for (const dir of packageDirs(root)) {
    const pkg = readJson(join(dir, 'package.json'))
    if (!pkg) continue
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const fw = FRAMEWORKS.find(([dep]) => deps[dep])
    if (!fw || (dir === root && packageDirs(root).length > 1 && fw[3] === 'api')) continue
    const [, kind, defaultPort, side] = fw
    const scripts = pkg.scripts ?? {}
    const dev = scripts.dev ?? scripts['start:dev'] ?? scripts.start ?? ''
    const port = Number((dev.match(/(?:-p|--port)[ =](\d{2,5})/) ?? [])[1] ?? (readText(join(dir, '.env.example')).match(/^PORT=(\d+)/m) ?? [])[1] ?? defaultPort)
    const name = (pkg.name ?? relative(root, dir) ?? 'app').replace(/^@[^/]+\//, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'app'
    const where = relative(root, dir) || '.'
    notes.push(`${where}: ${kind} (${side}) — dev script "${dev || 'none'}", guessed port ${port}`)
    if (side === 'web') {
      apps[name] = { baseUrl: `http://localhost:${port}`, loginPath: '/login', nav: 'nav' }
      health.push(`http://localhost:${port}/`)
    } else apiOrigins.push(`http://localhost:${port}`)
    if (dev) startCommands.push({ cwd: where, run: `${pm} run ${scripts.dev ? 'dev' : scripts['start:dev'] ? 'start:dev' : 'start'}` })
  }

  const compose = readdirSync(root).filter((f) => /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(f))
  if (compose.length) {
    notes.push(`docker compose files: ${compose.join(', ')}`)
    startCommands.unshift({ cwd: '.', run: `docker compose -f ${compose.find((f) => /dev/.test(f)) ?? compose[0]} up -d` })
  }
  const allCompose = compose.map((f) => readText(join(root, f))).join('\n')
  const mailpit = /mailpit|mailhog/i.test(allCompose) ? 'http://localhost:8025' : null
  if (mailpit) notes.push('mail catcher found (Mailpit/MailHog) — emailed codes and links can be read')
  if (rootPkg?.scripts?.dev && !startCommands.some((c) => c.cwd === '.')) startCommands.push({ cwd: '.', run: `${pm} run dev` })
  if (!Object.keys(apps).length) {
    apps.web = { baseUrl: 'http://localhost:3000', loginPath: '/login', nav: 'nav' }
    notes.push('no web framework recognised — set apps.web.baseUrl by hand')
  }
  const readme = readText(join(root, 'README.md'))
  if (/seed|fixtures|demo (user|account)|default (user|login)/i.test(readme)) notes.push('README mentions seed data / demo users — check it for role credentials')
  return { apps, apiOrigins, startCommands, health, mailpit, notes }
}
