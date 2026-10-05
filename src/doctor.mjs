/** Is everything in place to run? Shared by `blindqa doctor` and the MCP tool. */
import { existsSync } from 'node:fs'
import { loadProject } from './project.mjs'
import { checkGuard } from './guard.mjs'
import { resolveBrowser, orcaCdpUrl } from './machine.mjs'
import { cdpWebSocket } from './browser/session.mjs'

async function chromiumInstalled() {
  try { const { chromium } = await import('playwright'); return existsSync(chromium.executablePath()) } catch { return false }
}

/** Can this machine's browser be reached? */
async function browserCheck(project, ok) {
  const b = resolveBrowser(project)
  const label = `browser (${b.mode}, from ${b.source})`
  if (b.mode === 'local' || b.mode === 'headless') return ok(label, await chromiumInstalled(), 'Chromium for Playwright — run `blindqa setup` if missing')
  try {
    const url = b.mode === 'orca' ? b.cdpUrl ?? orcaCdpUrl(b.orcaBin) : b.cdpUrl
    if (!url) throw new Error('no CDP address — blindqa machine set --cdp-url http://<host>:9222')
    await cdpWebSocket(url)
    ok(label, true, url)
  } catch (e) { ok(label, false, e.message) }
  if (b.viewerUrl) {
    const up = await fetch(b.viewerUrl, { signal: AbortSignal.timeout(3000) }).then((r) => r.status < 500, () => false)
    ok('browser viewer', up, b.viewerUrl)
  }
}

export async function doctor(start) {
  const checks = []
  const ok = (name, pass, detail = '') => checks.push({ name, pass, detail })
  ok('node >= 20', Number(process.versions.node.split('.')[0]) >= 20, process.versions.node)
  let project
  try { project = loadProject(start) } catch (e) { ok('project', false, e.message) }
  await browserCheck(project, ok)
  if (project) {
    ok('project', true, project.root)
    for (const c of checkGuard(project.root)) ok(`never pushed: ${c.name}`, c.pass, c.detail)
    for (const [name, app] of Object.entries(project.profile.apps ?? {})) {
      const status = await fetch(app.baseUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) }).then((r) => r.status, () => 0)
      ok(`app ${name} reachable`, status > 0 && status < 500, `${app.baseUrl} -> ${status || 'no answer'}`)
    }
    const roles = Object.keys(project.profile.roles ?? {})
    ok('roles defined', roles.length > 0, roles.join(', ') || 'add roles to .blindqa/profile.json')
    for (const r of roles) ok(`credentials ${r}`, project.profile.roles[r].login === 'none' || !!(project.credentials.roles?.[r]?.email || project.credentials.roles?.[r]?.phone), project.profile.roles[r].login === 'none' ? 'no sign-in' : project.credentials.roles?.[r]?.email ?? 'missing in .blindqa/credentials.json')
    if (project.profile.mail?.mailpit) {
      ok('mail catcher', await fetch(project.profile.mail.mailpit, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok, () => false), project.profile.mail.mailpit)
    }
  }
  return { ok: checks.every((c) => c.pass), checks }
}
