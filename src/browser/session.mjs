/**
 * The browser blindqa drives. Which one depends on the machine (machine.mjs):
 *   local     one Playwright Chromium window that stays open across runs; switching role swaps cookies
 *   headless  a private headless Chromium per run
 *   cdp/neko  attach to a browser that is already running (remote debugging); never closes it
 *   orca      attach to Orca's built-in browser through the CDP address Orca hands out (experimental)
 * Every mode returns the same { browser, context, page, shared, mode, close() }.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolveBrowser, orcaCdpUrl } from '../machine.mjs'

export const DEFAULT_VIEWPORT = { width: 1440, height: 900 }
export const PHONE_VIEWPORT = { width: 390, height: 844 }

const endpoint = (port) => `http://127.0.0.1:${port}`
const running = (port) => fetch(`${endpoint(port)}/json/version`).then((r) => r.ok, () => false)

export async function browserRunning(port = 9333) { return running(port) }

export async function startBrowser({ port = 9333, profileDir, viewport = DEFAULT_VIEWPORT } = {}) {
  if (await running(port)) return false
  mkdirSync(profileDir, { recursive: true })
  const child = spawn(chromium.executablePath(), [
    `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-search-engine-choice-screen',
    `--window-size=${viewport.width},${viewport.height + 90}`, '--window-position=40,40', 'about:blank',
  ], { detached: true, stdio: 'ignore' })
  child.unref()
  for (let i = 0; i < 50 && !(await running(port)); i += 1) await new Promise((r) => setTimeout(r, 200))
  if (!(await running(port))) throw new Error('the blindqa browser did not start')
  return true
}

export async function stopBrowser({ port = 9333 } = {}) {
  if (!(await running(port))) return false
  const b = await chromium.connectOverCDP(endpoint(port))
  const s = await b.newBrowserCDPSession()
  await s.send('Browser.close').catch(() => {})
  return true
}

/**
 * The WebSocket address of a browser's DevTools endpoint. Accepts ws:// as is; for http(s):// reads
 * /json/version and points the answer at the host:port we were given — inside containers the browser
 * reports its own internal address (e.g. 127.0.0.1:9223 behind a port forward).
 */
export async function cdpWebSocket(url) {
  if (/^wss?:\/\//.test(url)) return url
  const base = new URL(url)
  const res = await fetch(new URL('/json/version', base), { signal: AbortSignal.timeout(5000) }).catch((e) => { throw new Error(`no browser answers at ${url} (${e.cause?.code ?? e.message})`) })
  if (!res.ok) throw new Error(`${url}/json/version answered ${res.status}${res.status === 500 ? ' — Chrome refuses a Host header that is not an IP or localhost; use the IP address' : ''}`)
  const ws = new URL((await res.json()).webSocketDebuggerUrl)
  ws.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
  ws.host = base.host
  return ws.toString()
}

/**
 * Attach to a running browser.
 *   tab 'new'    an isolated context (own window, own cookies) that is removed afterwards — for a browser
 *                that is also someone's own, so signing roles in and out never touches their cookies
 *   tab 'reuse'  the browser's first tab — for a browser that exists only for testing (neko, Orca)
 */
async function attach(url, { viewport, tab = 'reuse', mode }) {
  const browser = await chromium.connectOverCDP(await cdpWebSocket(url))
  const isolated = tab === 'new'
  const context = isolated ? await browser.newContext({ viewport }) : browser.contexts()[0] ?? (await browser.newContext({ viewport }))
  const page = (isolated ? null : context.pages().find((p) => !p.url().startsWith('devtools://'))) ?? (await context.newPage())
  await page.setViewportSize(viewport).catch(() => {})
  await page.bringToFront().catch(() => {})
  const close = async () => { if (isolated) await context.close().catch(() => {}); await browser.close().catch(() => {}) } // browser.close() only disconnects
  return { browser, context, page, shared: !isolated, mode, close }
}

/** { browser, context, page, shared, mode, close() } — close() never closes a shared or remote browser. */
export async function openSession({ visible = true, mode = 'local', port = 9333, profileDir, viewport = DEFAULT_VIEWPORT, cdpUrl, tab, orcaBin } = {}) {
  if (!visible || mode === 'headless') {
    const browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({ viewport })
    const page = await context.newPage()
    return { browser, context, page, shared: false, mode: 'headless', close: () => browser.close() }
  }
  if (mode === 'cdp' || mode === 'neko') {
    if (!cdpUrl) throw new Error(`browser mode "${mode}" needs a CDP address: blindqa machine set --browser ${mode} --cdp-url http://<host>:9222`)
    return attach(cdpUrl, { viewport, tab, mode })
  }
  if (mode === 'orca') return attach(cdpUrl ?? orcaCdpUrl(orcaBin), { viewport, tab: tab ?? 'reuse', mode })

  await startBrowser({ port, profileDir, viewport })
  const browser = await chromium.connectOverCDP(endpoint(port))
  const context = browser.contexts()[0]
  const pages = context.pages()
  const page = pages[0] ?? (await context.newPage())
  for (const p of pages.slice(1)) await p.close().catch(() => {})
  await page.setViewportSize(viewport)
  await page.bringToFront()
  return { browser, context, page, shared: true, mode: 'local', close: () => browser.close() }
}

/** Session settings for a loaded project on this machine. `visible: false` (--headless) always wins. */
export function sessionOptions(project, { visible = true, phone = false } = {}) {
  const b = resolveBrowser(project)
  return {
    visible,
    mode: b.mode,
    cdpUrl: b.cdpUrl,
    tab: b.tab,
    orcaBin: b.orcaBin,
    port: b.port,
    profileDir: project.path('browser-profile'),
    viewport: phone ? PHONE_VIEWPORT : project.profile.browser?.viewport ?? DEFAULT_VIEWPORT,
  }
}
