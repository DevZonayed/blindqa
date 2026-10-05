/**
 * The robot's on-screen cursor. Unlike bench/jev/overlayui.mjs it does NOT follow DOM mouse events:
 * it only moves when the harness tells it to, so a person moving their own mouse over the window
 * can't drag the dot around. Real mouse movement that isn't the robot's is counted and shows a
 * "hands off" notice, because it can still hover/open things on the page.
 */

/** Init script (runs in every document). */
export function robotCursorInit() {
  const boot = () => {
    if (window.__qaCursor || !document.body) return
    const dot = document.createElement('div')
    dot.setAttribute('data-qa-ui', '')
    dot.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:20px', 'height:20px', 'margin:-10px 0 0 -10px',
      'border-radius:50%', 'background:rgba(79,70,229,.35)', 'border:2px solid #4f46e5',
      'box-shadow:0 0 0 5px rgba(79,70,229,.15)', 'pointer-events:none', 'z-index:2147483647',
      'will-change:transform',
    ].join(';')
    const notice = document.createElement('div')
    notice.setAttribute('data-qa-ui', '')
    notice.textContent = 'The test robot is driving this window. Please keep your mouse off it.'
    notice.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:6px;background:#111827;color:#fff;font:12px/1.4 system-ui,sans-serif;pointer-events:none;z-index:2147483647;display:none'
    document.body.append(dot, notice)

    let pos = [-40, -40]
    try { pos = JSON.parse(sessionStorage.getItem('qa-cursor')) ?? pos } catch {}
    let busyUntil = 0
    let hideNotice
    const place = (x, y, ms) => {
      dot.style.transition = `transform ${ms}ms ease-in-out`
      dot.style.transform = `translate(${x}px, ${y}px)`
      pos = [x, y]
      try { sessionStorage.setItem('qa-cursor', JSON.stringify(pos)) } catch {}
    }
    place(pos[0], pos[1], 0)

    window.__qaCursor = {
      humanMoves: 0,
      /** Glide the dot to (x, y) over `ms`; mouse events during the glide are the robot's. */
      move(x, y, ms = 0) { busyUntil = Date.now() + ms + 400; place(x, y, ms) },
      /** Click feedback at the current position. */
      press() {
        busyUntil = Date.now() + 600
        dot.style.background = 'rgba(217,45,32,.5)'
        const ring = document.createElement('div')
        ring.setAttribute('data-qa-ui', '')
        ring.style.cssText = `position:fixed;left:${pos[0]}px;top:${pos[1]}px;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid #4f46e5;pointer-events:none;z-index:2147483646;transition:all 450ms ease-out`
        document.body.appendChild(ring)
        requestAnimationFrame(() => { ring.style.width = ring.style.height = '54px'; ring.style.margin = '-27px 0 0 -27px'; ring.style.opacity = '0' })
        setTimeout(() => { ring.remove(); dot.style.background = 'rgba(79,70,229,.35)' }, 480)
      },
    }

    // Anything that isn't the robot: not during a robot glide/press, and not at the robot's position.
    addEventListener('mousemove', (e) => {
      if (Date.now() < busyUntil) return
      if (Math.abs(e.clientX - pos[0]) <= 2 && Math.abs(e.clientY - pos[1]) <= 2) return
      window.__qaCursor.humanMoves += 1
      notice.style.display = 'block'
      clearTimeout(hideNotice)
      hideNotice = setTimeout(() => { notice.style.display = 'none' }, 2500)
    }, true)
  }
  if (document.body) boot()
  else addEventListener('DOMContentLoaded', boot)
}

/** Move the real mouse and the dot together. */
export async function glideTo(page, x, y, { steps = 18, visible = true } = {}) {
  if (visible) await page.evaluate(([x, y, ms]) => window.__qaCursor?.move(x, y, ms), [x, y, steps * 16]).catch(() => {})
  await page.mouse.move(x, y, { steps: visible ? steps : 1 })
}

/** Show click feedback at the dot (call right before the real click). */
export async function pressFx(page) {
  await page.evaluate(() => window.__qaCursor?.press()).catch(() => {})
}

/** How many non-robot mouse moves the page has seen since the last reset. */
export async function takeHumanMoves(page) {
  return page.evaluate(() => { const c = window.__qaCursor; if (!c) return 0; const n = c.humanMoves; c.humanMoves = 0; return n }).catch(() => 0)
}
