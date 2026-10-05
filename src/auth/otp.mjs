/**
 * One-time-code sign-in, like a person with a phone: type the number or email, press "send me a code",
 * read the newest code from the inbox, type it. Then handle whatever the app asks next, one screen at a
 * time: pick a role, enrol an authenticator (the secret and recovery codes are saved for the next run),
 * type an authenticator code, acknowledge recovery codes.
 *
 * Code sources (profile/credentials `otp`):
 *   { "relay": "https://otp.example", "token": "…" }   GET /inbox?token=…&to=<E.164>  → { messages: [...] }
 *   { "mailpit": "http://localhost:8025" }              emailed codes
 */
import { humanClick, humanFill, settle, log, finding } from '../browser/human.mjs'
import { freshCode } from './totp.mjs'
import { waitForMail, useMailpit } from './mailpit.mjs'

const digits = (s) => (String(s ?? '').match(/\b(\d{6})\b/) ?? [])[1] ?? null

/** Local number → E.164 (Bangladesh default, as on the demo; set otp.countryCode for others). */
export function e164(phone, countryCode = '880') {
  const p = String(phone).replace(/[^\d+]/g, '')
  if (p.startsWith('+')) return p
  if (p.startsWith(countryCode)) return `+${p}`
  return `+${countryCode}${p.replace(/^0/, '')}`
}

async function relayMessages(otp, to) {
  const url = `${otp.relay.replace(/\/$/, '')}/inbox?token=${encodeURIComponent(otp.token)}${to ? `&to=${encodeURIComponent(to)}` : ''}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`OTP relay ${res.status}`)
  const json = await res.json()
  return json.messages ?? json.items ?? (Array.isArray(json) ? json : [])
}

const msgKey = (m) => JSON.stringify(m)
const msgCode = (m) => (m.code ? String(m.code) : digits(m.body ?? m.text ?? m.message ?? m.content ?? JSON.stringify(m)))

/** Snapshot of the inbox before asking for a code, so only a NEW message counts. */
export async function inboxBefore(otp, identifier) {
  if (otp?.relay && !String(identifier).includes('@')) {
    const msgs = await relayMessages(otp, e164(identifier, otp.countryCode)).catch(() => [])
    return { kind: 'relay', seen: new Set(msgs.map(msgKey)), at: Date.now() }
  }
  return { kind: 'mail', at: Date.now() - 1500 }
}

export async function waitForCode(otp, identifier, before, { timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs
  if (before.kind === 'relay') {
    const to = e164(identifier, otp.countryCode)
    while (Date.now() < deadline) {
      const fresh = (await relayMessages(otp, to).catch(() => [])).filter((m) => !before.seen.has(msgKey(m)))
      const code = fresh.map(msgCode).find(Boolean)
      if (code) return code
      await new Promise((r) => setTimeout(r, 1500))
    }
    return null
  }
  if (otp?.mailpit) useMailpit(otp.mailpit)
  const mail = await waitForMail(identifier, { after: before.at, timeoutMs })
  return mail && digits(mail.text)
}

/** Type a code into one box or a row of single-digit boxes. */
export async function typeCode(page, code) {
  const boxes = page.locator('input[autocomplete="one-time-code"]:visible, input[inputmode="numeric"]:visible, input[name*=code i]:visible, input[aria-label*=code i]:visible, input[aria-label*=digit i]:visible')
  const n = await boxes.count()
  const first = n ? boxes.first() : page.getByRole('textbox').first()
  await humanClick(page, first, 'code field')
  await page.keyboard.type(code, { delay: 80 })
}

async function pressContinue(page, re = /^(verify|continue|sign in|log in|submit|confirm|next|done)\b/i) {
  const btn = page.getByRole('button', { name: re }).first()
  if ((await btn.count()) && (await btn.isEnabled().catch(() => false))) await humanClick(page, btn, (await btn.innerText().catch(() => 'Continue')).trim() || 'Continue')
}

const visibleText = (page) => page.evaluate(() => document.body.innerText).catch(() => '')

/** Find an authenticator secret on an enrolment screen: otpauth:// anywhere, or a shown setup key. */
async function readTotpSecret(page) {
  const found = await page.evaluate(() => {
    const html = document.documentElement.outerHTML
    const uri = decodeURIComponent((html.match(/otpauth:\/\/[^"'<>\s]+/) ?? [''])[0])
    const fromUri = (uri.match(/[?&]secret=([A-Z2-7]+)/i) ?? [])[1]
    if (fromUri) return { secret: fromUri.toUpperCase(), uri }
    const text = document.body.innerText.replace(/\s+/g, ' ')
    const key = (text.match(/\b([A-Z2-7]{4}(?:[ -]?[A-Z2-7]{4}){3,})\b/) ?? [])[1]
    return key ? { secret: key.replace(/[ -]/g, ''), uri: null } : null
  }).catch(() => null)
  if (found) return found
  // "Can't scan it?" / "Enter a setup key" links reveal the key as text
  const reveal = page.getByRole('button', { name: /can.?t scan|enter (a |the )?(setup )?key|show (the )?key|manual/i }).or(page.getByRole('link', { name: /can.?t scan|setup key|manual/i })).first()
  if (await reveal.count()) {
    await humanClick(page, reveal, "Can't scan the QR code")
    await page.waitForTimeout(500)
    return page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ')
      const key = (text.match(/\b([A-Z2-7]{4}(?:[ -]?[A-Z2-7]{4}){3,})\b/) ?? [])[1]
      return key ? { secret: key.replace(/[ -]/g, ''), uri: null } : null
    }).catch(() => null)
  }
  return null
}

/**
 * Sign `who` in with a one-time code. `saveSecret(patch)` persists what the app hands out
 * (authenticator secret, recovery codes) into credentials.json for every role on the same account.
 */
export async function otpSignIn(page, who, { otp, saveSecret }) {
  const identifier = who.phone ?? who.email
  if (!identifier) throw new Error(`${who.key}: no phone or email in credentials`)
  await page.goto(who.app.baseUrl + (who.loginPath ?? who.app.loginPath ?? '/'))
  await settle(page)
  const field = page.getByRole('textbox', { name: /email|mobile|phone|number/i }).first()
  await humanFill(page, field, identifier, 'Email address or mobile number')
  const before = await inboxBefore(otp, identifier)
  await pressContinue(page, /send( me)? (a )?code|continue|next|get code/i)
  log(`waiting for the one-time code for ${identifier}`)
  const code = await waitForCode(otp, identifier, before)
  if (!code) throw new Error(`no one-time code arrived for ${identifier} (rate limit is 3 codes/hour per account)`)
  await settle(page)
  await typeCode(page, code)
  await pressContinue(page)
  await settle(page)

  // whatever comes next, one screen at a time
  for (let step = 0; step < 8; step += 1) {
    await settle(page)
    const text = await visibleText(page)
    const codeBox = (await page.locator('input[autocomplete="one-time-code"]:visible, input[inputmode="numeric"]:visible').count()) > 0
    if (/recovery codes?|backup codes?/i.test(text) && !codeBox) {
      const codes = [...new Set(text.match(/\b[A-Za-z0-9]{4,6}-[A-Za-z0-9]{4,6}\b|\b[a-z0-9]{10}\b/g) ?? [])].slice(0, 16)
      if (codes.length) { saveSecret({ recoveryCodes: codes }); log(`saved ${codes.length} recovery codes to credentials.json`) }
      const ack = page.getByRole('checkbox', { name: /saved|stored|kept|written/i }).first()
      if (await ack.count()) await humanClick(page, ack, "I've saved them")
      await pressContinue(page, /continue|done|i.?ve saved|finish|go to/i)
      continue
    }
    if (/scan|qr code|set up (your |an )?authenticator|add (it|this) to/i.test(text) && codeBox) {
      const s = await readTotpSecret(page)
      if (!s) {
        await finding(page, 'blocked-sign-in', 'high', `${who.key}: authenticator enrolment shows a QR code but blindqa could not read its secret`, { needsReview: true })
        throw new Error(`${who.key}: could not read the authenticator secret from the enrolment screen`)
      }
      saveSecret({ totpSecret: s.secret })
      who.totpSecret = s.secret
      log(`enrolled an authenticator for ${who.key}; secret saved to credentials.json`)
      await typeCode(page, await freshCode(s.secret))
      await pressContinue(page)
      continue
    }
    if (codeBox && /authenticator|two-?factor|2fa|6-digit|verification/i.test(text)) {
      if (!who.totpSecret && process.env.BLINDQA_MANUAL_2FA) {
        // a person types the authenticator code into the open window; wait until the step is gone
        log('▶ waiting for you to type the authenticator code in the browser window (up to 5 minutes)…')
        console.log('\n>>> Type the 6-digit authenticator code in the browser window and press Verify. <<<\n')
        await page.bringToFront().catch(() => {})
        await page.waitForFunction(() => !/enter the code from your authenticator|authenticator code/i.test(document.body.innerText), null, { timeout: 300000, polling: 1000 })
          .catch(() => { throw new Error(`${who.key}: no authenticator code was entered within 5 minutes`) })
        log('authenticator step passed')
        continue
      }
      if (!who.totpSecret) {
        const rc = (who.recoveryCodes ?? []).find((c) => !(who.usedRecoveryCodes ?? []).includes(c))
        if (!rc) throw new Error(`${who.key}: the account already has an authenticator; put its secret (totpSecret) or a recovery code in credentials.json`)
        const use = page.getByRole('button', { name: /recovery|backup/i }).or(page.getByRole('link', { name: /recovery|backup/i })).first()
        if (await use.count()) await humanClick(page, use, 'Use a recovery code')
        await humanFill(page, page.getByRole('textbox').first(), rc, 'Recovery code')
        saveSecret({ usedRecoveryCodes: [...(who.usedRecoveryCodes ?? []), rc] })
      } else await typeCode(page, await freshCode(who.totpSecret))
      await pressContinue(page)
      continue
    }
    if (who.pickRole) {
      const choice = page.getByRole('button', { name: new RegExp(who.pickRole, 'i') })
        .or(page.getByRole('radio', { name: new RegExp(who.pickRole, 'i') }))
        .or(page.getByRole('link', { name: new RegExp(who.pickRole, 'i') })).first()
      if (/choose|select|pick|which role|sign in as|continue as/i.test(text) && (await choice.count())) {
        await humanClick(page, choice, `role ${who.pickRole}`)
        await pressContinue(page, /continue|next|enter|go/i)
        continue
      }
    }
    break // nothing more to answer: signed in, or stuck (caller checks)
  }
}
