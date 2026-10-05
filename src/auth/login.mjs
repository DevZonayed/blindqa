/**
 * Sign in as a role like a person, and switch who is signed in inside one window.
 * Works from profile.json alone: password forms (with an optional second factor by authenticator
 * code or emailed code) and email-link sign-in. Field finding falls back to Jev on unusual forms.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { humanFill, humanClick, settle, ctx, log, preparePage, discardSignals } from '../browser/human.mjs'
import { extractCandidates, digest } from '../browser/extract.mjs'
import { controlOptions, screenState, Q } from '../jev/questions.mjs'
import { freshCode } from './totp.mjs'
import { useMailpit, waitForMail, linksIn } from './mailpit.mjs'
import { otpSignIn } from './otp.mjs'

const rx = (s, flags = 'i') => (s instanceof RegExp ? s : new RegExp(s, flags))

/** Signed out = a password box is on screen, or we are on the sign-in path (when it isn't just "/"). */
async function onSignIn(page, who) {
  if ((await page.locator('input[type=password]:visible').count().catch(() => 0)) > 0) return true
  if (who.login === 'otp') {
    const asking = page.getByRole('textbox', { name: /email address or mobile|mobile number|phone number/i })
      .or(page.locator('input[autocomplete="one-time-code"]:visible, input[inputmode="numeric"]:visible'))
    if ((await asking.count().catch(() => 0)) > 0) return true
  }
  const path = who.loginPath ?? who.app.loginPath ?? '/login'
  return path !== '/' && new URL(page.url()).pathname.replace(/\/$/, '').endsWith(path.replace(/\/$/, ''))
}

/** Find a control by the profile's hint, the usual names, or — if neither works — by asking Jev. */
async function findControl(page, jev, { hint, roles, fallback, goal }) {
  const base = page.locator('main, form, body').first()
  if (hint) {
    const byHint = hint.startsWith('css:') ? page.locator(hint.slice(4)) : base.getByLabel(rx(hint)).or(base.getByRole('button', { name: rx(hint) }))
    if (await byHint.count()) return byHint.first()
  }
  for (const role of roles) {
    const l = base.getByRole(role, { name: fallback })
    if (await l.count()) return l.first()
  }
  if (!jev?.enabled) return null
  const extracted = await extractCandidates(page)
  const { criteria, byKey } = controlOptions(extracted.candidates)
  const { answers } = await jev.ask(await screenState(page, extracted, digest), { target: Q.target(goal, criteria) }, { tag: 'login.find' })
  const c = byKey.get(answers.target?.choice)
  return c ? page.locator(c.selector).first() : null
}

/** One-time code into the code box(es) of `scope`. */
async function typeCode(page, scope, code) {
  const boxes = scope.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"], input[name*=code i], input[aria-label*=code i]')
  const first = (await boxes.count()) ? boxes.first() : scope.getByRole('textbox').first()
  await humanClick(page, first, 'code field')
  await page.keyboard.type(code, { delay: 70 })
}

/** A code from the role's authenticator key, or from "email me a code" + the mail catcher. */
async function codeFor(page, scope, who) {
  if (who.totpSecret) return freshCode(who.totpSecret)
  const sentAt = Date.now() - 1500
  let ask = scope.getByRole('button', { name: /email me a code|send (me )?a code|resend/i }).first()
  if (!(await ask.count())) {
    const other = scope.getByRole('button', { name: /try another way/i }).or(scope.getByRole('link', { name: /try another way/i })).first()
    if (await other.count()) { await humanClick(page, other, 'Try another way'); await page.waitForTimeout(500); ask = scope.getByRole('button', { name: /email me a code|email/i }).first() }
  }
  if (await ask.count()) await humanClick(page, ask, 'Email me a code')
  log(`waiting for the emailed code to ${who.email}`)
  const mail = await waitForMail(who.email, { after: sentAt, timeoutMs: 25000 })
  return mail && ((mail.text || '').match(/\b(\d{6})\b/) ?? [])[1]
}

async function secondFactor(page, who) {
  const mfaUrl = rx(who.app.mfaPath ?? '/(mfa|2fa|two-factor|verify)(?!-setup)')
  if (!mfaUrl.test(new URL(page.url()).pathname) || !(who.totpSecret || who.mfaByEmail)) return
  log(`second factor: ${who.totpSecret ? 'authenticator code' : 'emailed code'}`)
  const scope = page.locator('main, body').first()
  if (who.totpSecret) { const alt = page.getByRole('button', { name: /authenticator app/i }); if (await alt.count()) await humanClick(page, alt, 'use the authenticator app') }
  const code = await codeFor(page, scope, who)
  if (!code) return
  await typeCode(page, scope, code)
  const verify = page.getByRole('button', { name: /^(verify|continue|sign in|submit)/i }).first()
  if (await verify.isEnabled().catch(() => false)) await humanClick(page, verify, 'Verify')
  await page.waitForURL((u) => !mfaUrl.test(u.pathname), { timeout: 15000 }).catch(() => {})
  await settle(page)
}

async function passwordSignIn(page, who, jev) {
  const form = who.app.login ?? {}
  await page.goto(who.app.baseUrl + (who.loginPath ?? who.app.loginPath ?? '/login'))
  await settle(page)
  const email = await findControl(page, jev, { hint: form.email, roles: ['textbox'], fallback: /e-?mail|user ?name|login/i, goal: 'type the email address or username to sign in' })
  const password = (await page.locator('input[type=password]').count()) ? page.locator('input[type=password]').first()
    : await findControl(page, jev, { hint: form.password, roles: ['textbox'], fallback: /password/i, goal: 'type the password' })
  if (!email || !password) throw new Error(`could not find the sign-in fields at ${page.url()} — set apps.<app>.login in profile.json`)
  await humanFill(page, email, who.email, 'Email')
  await humanFill(page, password, who.password, 'Password')
  const submit = await findControl(page, jev, { hint: form.submit, roles: ['button'], fallback: /^(sign in|log ?in|login|continue|submit)$/i, goal: 'submit the sign-in form' })
  const before = page.url()
  await humanClick(page, submit, 'Sign in')
  await page.waitForFunction((u) => !document.querySelector('input[type=password]') || location.href !== u, before, { timeout: 15000 }).catch(() => {})
  await settle(page)
  await secondFactor(page, who)
}

async function emailLinkSignIn(page, who) {
  await page.goto(who.app.baseUrl + (who.loginPath ?? who.app.loginPath ?? '/login'))
  await settle(page)
  await humanFill(page, page.getByLabel(/email/i), who.email, 'Email')
  const sentAt = Date.now() - 2000
  await humanClick(page, page.getByRole('button', { name: rx(who.requestButton ?? 'email me|send (me )?(a )?(sign-?in |magic )?link|continue') }), 'Email me a sign-in link')
  const mail = await waitForMail(who.email, { after: sentAt, subject: /sign|link|log/i })
  const link = mail && linksIn(mail).find((l) => rx(who.linkPattern ?? 'sign-?in|login|magic|token').test(l))
  if (!link) throw new Error(`no sign-in link arrived for ${who.email}`)
  log('opens the sign-in link from the email')
  await page.goto(link)
  await settle(page)
}

/**
 * Make the session's page signed in as `roleName`. Reuses the saved session (cookies swapped in place)
 * while it is valid; otherwise signs in like a person and saves the session.
 */
export async function openAs(session, project, roleName, { jev = null } = {}) {
  const who = project.role(roleName)
  const { context, page } = session
  if (!page.__bqPrepared) { await preparePage(page); page.__bqPrepared = true }
  if (who.login === 'none') { // public app or already open: just go there
    Object.assign(ctx, { portal: who.app.name, role: who.key, screen: 'landing' })
    await page.goto(who.app.baseUrl + (who.landing ?? '/'))
    await settle(page)
    return page
  }
  if (!who.email && !who.phone) throw new Error(`No credentials for ${who.key}: add them to .blindqa/credentials.json`)
  if (project.profile.mail?.mailpit) useMailpit(project.profile.mail.mailpit)
  const dir = project.path('sessions')
  mkdirSync(dir, { recursive: true })
  const file = `${dir}/${who.session}.json`
  if (page.url() !== 'about:blank') await page.goto('about:blank').catch(() => {})
  await context.clearCookies()
  Object.assign(ctx, { portal: who.app.name ?? who.app.baseUrl, role: who.key, screen: 'sign-in' })
  if (existsSync(file)) {
    const { cookies = [], origins = [] } = JSON.parse(readFileSync(file, 'utf8'))
    await context.addCookies(cookies)
    await page.goto(who.app.baseUrl + (who.landing ?? '/'))
    const stored = origins.find((o) => o.origin === new URL(who.app.baseUrl).origin)?.localStorage ?? []
    if (stored.length) { await page.evaluate((items) => { for (const { name, value } of items) localStorage.setItem(name, value) }, stored); await page.reload() }
    await settle(page)
    if (!(await onSignIn(page, who))) {
      await context.storageState({ path: file }) // tokens may have been refreshed just now: keep the new ones
      log(`${who.key}: switched to saved session`)
      ctx.screen = 'landing'
      return page
    }
    await context.clearCookies()
  }
  log(`${who.key} signs in at ${who.app.baseUrl}`)
  if (who.login === 'email-link') await emailLinkSignIn(page, who)
  else if (who.login === 'otp') {
    const otp = { ...(project.profile.otp ?? {}), ...(project.credentials.otp ?? {}) }
    await otpSignIn(page, who, { otp, saveSecret: (patch) => { project.saveCredential(who, patch); Object.assign(who, patch) } })
  } else await passwordSignIn(page, who, jev)
  if (await onSignIn(page, who)) throw new Error(`${who.key} is still on the sign-in page after signing in (${page.url()})`)
  await context.storageState({ path: file })
  discardSignals()
  ctx.screen = 'landing'
  return page
}

/**
 * Save the role's current session (cookies + local storage) — call before closing the browser, so tokens
 * the app rotated during the run are the ones used next time (otherwise the saved session dies and the
 * next run must sign in again, costing a one-time code or, for 2FA accounts, a person).
 */
export async function persistSession(session, project, roleName) {
  try {
    const who = project.role(roleName)
    if (who.login === 'none') return
    const page = session.page
    if (await onSignIn(page, who)) return // signed out: don't overwrite a good file with a dead session
    await session.context.storageState({ path: `${project.path('sessions')}/${who.session}.json` })
  } catch { /* best effort */ }
}
