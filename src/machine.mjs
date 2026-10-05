/**
 * Machine settings: which browser blindqa drives on THIS computer. Projects travel between machines;
 * browsers don't, so this lives in ~/.blindqa/machine.json, never in the project.
 *
 * Browser modes
 *   local     Playwright's Chromium in one window that stays open (default; works inside Orca's terminals too)
 *   headless  no window (CI, servers without a display, parallel runs)
 *   cdp       attach to any Chromium-family browser with remote debugging on (your Chrome, Browserless, …)
 *   neko      attach to the Chromium inside an n.eko container; people watch it in neko's web viewer
 *   orca      experimental: attach to Orca's built-in browser through the CDP address Orca hands out
 *
 * Precedence: environment (BLINDQA_BROWSER, BLINDQA_CDP_URL, BLINDQA_VIEWER_URL) > ~/.blindqa/machine.json
 *             > the project's profile.browser > local.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join } from 'node:path'

export const HOME = process.env.BLINDQA_HOME ?? join(homedir(), '.blindqa')
export const MACHINE_FILE = join(HOME, 'machine.json')
export const MODES = ['local', 'headless', 'cdp', 'neko', 'orca']
const DEFAULTS = { neko: { cdpUrl: 'http://127.0.0.1:9222', viewerUrl: 'http://127.0.0.1:8080' } }

export function readMachine() {
  try { return JSON.parse(readFileSync(MACHINE_FILE, 'utf8')) } catch { return {} }
}

export function writeMachine(patch) {
  const cur = readMachine()
  const next = { ...cur, ...patch, browser: { ...(cur.browser ?? {}), ...(patch.browser ?? {}) } }
  for (const [k, v] of Object.entries(next.browser)) if (v === null || v === '') delete next.browser[k]
  mkdirSync(HOME, { recursive: true })
  writeFileSync(MACHINE_FILE, JSON.stringify(next, null, 2) + '\n')
  return next
}

/** The browser settings in force for this project on this machine. */
export function resolveBrowser(project) {
  const fromProject = project?.profile?.browser ?? {}
  const fromMachine = readMachine().browser ?? {}
  const env = {
    mode: process.env.BLINDQA_BROWSER,
    cdpUrl: process.env.BLINDQA_CDP_URL,
    viewerUrl: process.env.BLINDQA_VIEWER_URL,
  }
  const pick = (k) => env[k] ?? fromMachine[k] ?? fromProject[k]
  const mode = pick('mode') ?? 'local'
  if (!MODES.includes(mode)) throw new Error(`Unknown browser mode "${mode}" (use ${MODES.join(', ')})`)
  return {
    mode,
    cdpUrl: pick('cdpUrl') ?? DEFAULTS[mode]?.cdpUrl ?? null,
    viewerUrl: pick('viewerUrl') ?? DEFAULTS[mode]?.viewerUrl ?? null,
    tab: pick('tab') ?? (mode === 'cdp' ? 'new' : 'reuse'), // your own Chrome: work in a tab of our own
    port: fromMachine.port ?? fromProject.port ?? 9333,
    orcaBin: fromMachine.orcaBin ?? orcaPath(),
    source: env.mode ? 'environment' : fromMachine.mode ? MACHINE_FILE : fromProject.mode ? 'project profile' : 'default',
  }
}

function which(cmd) {
  try { return execFileSync(platform() === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n')[0].trim() || null } catch { return null }
}

export function orcaPath() {
  return which('orca') ?? (existsSync('/Applications/Orca.app/Contents/Resources/bin/orca') ? '/Applications/Orca.app/Contents/Resources/bin/orca' : null)
}

const reachable = (url) => fetch(url, { signal: AbortSignal.timeout(1500) }).then((r) => r.ok, () => false)

/** What this computer offers, and the mode blindqa suggests. Read-only. */
export async function detectMachine() {
  const found = { os: `${platform()} ${process.arch}`, node: process.versions.node }
  try { const { chromium } = await import('playwright'); found.playwrightChromium = existsSync(chromium.executablePath()) } catch { found.playwrightChromium = false }
  found.chrome = ['/Applications/Google Chrome.app', '/Applications/Chromium.app'].find(existsSync) ?? which('google-chrome') ?? which('chromium') ?? which('chromium-browser') ?? null
  found.display = platform() !== 'linux' || !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY)
  found.ci = !!process.env.CI
  const docker = which('docker')
  found.docker = !!docker
  found.neko = []
  if (docker) {
    try {
      const out = execFileSync(docker, ['ps', '--format', '{{.Image}}|{{.Names}}|{{.Ports}}'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })
      found.neko = out.split('\n').filter((l) => /neko/i.test(l)).map((l) => { const [image, name, ports] = l.split('|'); return { image, name, ports } })
    } catch { /* docker not running */ }
  }
  found.cdpEndpoints = []
  for (const port of [9222, 9223, 9229]) if (await reachable(`http://127.0.0.1:${port}/json/version`)) found.cdpEndpoints.push(`http://127.0.0.1:${port}`)
  const orca = orcaPath()
  found.orca = orca ? { cli: orca, running: orcaRunning(orca) } : null

  let suggest = 'local'
  const why = []
  if (found.neko.length && found.cdpEndpoints.length) { suggest = 'neko'; why.push(`neko container ${found.neko[0].name} with a CDP endpoint at ${found.cdpEndpoints[0]}`) }
  else if (!found.display || found.ci) { suggest = 'headless'; why.push(found.ci ? 'running in CI' : 'no display on this Linux machine') }
  else why.push('a display is available: one visible window that stays open')
  if (found.neko.length && !found.cdpEndpoints.length) why.push('a neko container runs but no CDP port answers — see docs/BROWSERS.md (Neko) to expose it')
  if (found.orca) why.push('Orca is installed: blindqa works in Orca terminals in local mode; "orca" mode (Orca\'s own browser) is experimental')
  if (!found.playwrightChromium && (suggest === 'local' || suggest === 'headless')) why.push('Chromium for Playwright is missing: run `blindqa setup`')
  return { found, suggest, why, current: resolveBrowser(null), machineFile: MACHINE_FILE }
}

function orcaRunning(bin) {
  try { return JSON.parse(execFileSync(bin, ['status', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 })).result?.app?.running === true } catch { return false }
}

/** Ask Orca for a CDP address of its built-in browser (opens a blank tab if none exists). Experimental. */
export function orcaCdpUrl(bin = orcaPath()) {
  if (!bin) throw new Error('Orca CLI not found (install Orca, or put `orca` on PATH)')
  const run = (args) => { try { return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 }) } catch (e) { return String(e.stdout ?? '') + String(e.stderr ?? '') } }
  let out = run(['exec', '--command', 'get cdp-url', '--json'])
  if (/browser_no_tab/.test(out)) { run(['tab', 'create', '--url', 'about:blank', '--json']); out = run(['exec', '--command', 'get cdp-url', '--json']) }
  const url = out.match(/\b(wss?|https?):\/\/[^\s"']+/)?.[0]
  if (!url) {
    throw new Error(`Orca did not hand out a CDP address for its built-in browser (${out.replace(/\s+/g, ' ').slice(0, 200)}). ` +
      'Run blindqa in local mode instead — inside an Orca terminal it opens its own window next to Orca and works the same. ' +
      'Orca\'s browser needs the current folder to be an Orca worktree with a browser tab open.')
  }
  return url
}
