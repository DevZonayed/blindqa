/**
 * The robot's authenticator app: RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from the base32 key a person
 * would type into Google Authenticator. Never reuses a code: servers reject a replayed code, so if the
 * current 30-second window was already used it waits for the next one, like a person would.
 */
import { createHmac } from 'node:crypto'

const lastStep = new Map()

function base32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of secret.replace(/[\s=-]/g, '').toUpperCase()) {
    const v = alphabet.indexOf(ch)
    if (v < 0) throw new Error(`not a base32 key: ${ch}`)
    bits += v.toString(2).padStart(5, '0')
  }
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export function totpAt(secret, step) {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(step))
  const h = createHmac('sha1', base32(secret)).update(msg).digest()
  const o = h[h.length - 1] & 0xf
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 1e6).padStart(6, '0')
}

/** A fresh code for `secret`, waiting for the next 30 s window if this one was already used. */
export async function freshCode(secret) {
  let step = Math.floor(Date.now() / 30000)
  if (lastStep.get(secret) >= step) {
    const wait = (lastStep.get(secret) + 1) * 30000 - Date.now() + 300
    await new Promise((r) => setTimeout(r, Math.max(0, wait)))
    step = Math.floor(Date.now() / 30000)
  }
  lastStep.set(secret, step)
  return totpAt(secret, step)
}

// RFC 6238 test vector (SHA-1, T=59 → 94287082, last 6 digits 287082) — run: node harness/totp.mjs
if (import.meta.url === `file://${process.argv[1]}`) {
  const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' // "12345678901234567890"
  console.log(totpAt(secret, 1) === '287082' ? 'TOTP self-test: PASS' : `TOTP self-test: FAIL (${totpAt(secret, 1)})`)
}
