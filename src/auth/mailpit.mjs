/** Read emails caught by Mailpit (profile.mail.mailpit, default http://localhost:8025). */
let MP = process.env.MAILPIT_URL ?? 'http://localhost:8025'
export function useMailpit(url) { if (url) MP = url.replace(/\/$/, '') }

export async function clearMail() {
  await fetch(`${MP}/api/v1/messages`, { method: 'DELETE' })
}

/** Wait for the newest message to `to` (optionally whose subject matches) and return it with its body. */
export async function waitForMail(to, { subject = null, timeoutMs = 20000, after = 0 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MP}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)
    const { messages = [] } = await res.json()
    const hit = messages.find((m) => (!subject || subject.test(m.Subject)) && new Date(m.Created).getTime() >= after)
    if (hit) {
      const full = await (await fetch(`${MP}/api/v1/message/${hit.ID}`)).json()
      return { subject: full.Subject, text: full.Text ?? '', html: full.HTML ?? '', id: hit.ID, created: hit.Created }
    }
    await new Promise((r) => setTimeout(r, 700))
  }
  return null
}

/** All http(s) links in a message (text first, then HTML hrefs). */
export function linksIn(mail) {
  const set = new Set()
  for (const m of (mail.text || '').matchAll(/https?:\/\/[^\s<>"')\]]+/g)) set.add(m[0])
  for (const m of (mail.html || '').matchAll(/href="(https?:\/\/[^"]+)"/g)) set.add(m[1].replace(/&amp;/g, '&'))
  return [...set]
}
