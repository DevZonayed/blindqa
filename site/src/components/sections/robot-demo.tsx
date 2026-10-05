// The hero demo: a small app inside the 21st Safari frame (#1241), with blindqa's robot cursor walking it
// and flagging what a person couldn't use. Finding texts are ones blindqa really printed on a demo app.
// Positions are measured from the rendered app (and on resize), so the cursor and flags stay on target.
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Safari } from '@/components/ui/safari'
import { cn } from '@/lib/utils'

const DURATION = 11
// when the cursor arrives at each stop (fraction of the loop); the stops are measured below
const TIMES = [0, 0.1, 0.16, 0.27, 0.33, 0.47, 0.6, 0.72, 0.88, 1]
const CLICKS = [0.16, 0.33]
const FLAG_AT = [0.47, 0.72]

type Box = { x: number; y: number; w: number; h: number } // % of the app area

function measure(container: HTMLElement, el: HTMLElement | null): Box | null {
  if (!el) return null
  const c = container.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return { x: ((r.left - c.left) / c.width) * 100, y: ((r.top - c.top) / c.height) * 100, w: (r.width / c.width) * 100, h: (r.height / c.height) * 100 }
}
const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

function Flag({ box, at, text, place }: { box: Box; at: number; text: string; place: 'below-left' | 'above-right' }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="pointer-events-none absolute z-20"
      style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
      animate={reduce ? { opacity: 1 } : { opacity: [0, 0, 1, 1, 0] }}
      transition={reduce ? undefined : { duration: DURATION, times: [0, at, at + 0.03, 0.96, 1], repeat: Infinity, ease: 'linear' }}
    >
      <div className="absolute -inset-[0.6cqw] rounded-[0.6cqw] border-[0.2cqw] border-dashed border-[#f87171] shadow-[0_0_0_0.4cqw_rgb(248_113_113/0.12)]" />
      <div className={cn('absolute w-[21cqw]', place === 'below-left' ? 'right-[-0.6cqw] top-[calc(100%+1cqw)]' : 'bottom-[calc(100%+1cqw)] right-[-0.6cqw]')}>
        <div className="rounded-[0.6cqw] bg-[#e5484d] px-[0.9cqw] py-[0.6cqw] text-[0.95cqw] font-semibold leading-snug text-white shadow-[0_0.6cqw_2cqw_rgb(0_0_0/0.5)]">
          ⚑ HIGH · {text}
        </div>
      </div>
    </motion.div>
  )
}

function Card({ title, tag }: { title: string; tag: string }) {
  return (
    <div className="rounded-[0.6cqw] border border-white/[0.06] bg-white/[0.04] p-[0.8cqw]">
      <div className="text-[1.05cqw] font-medium text-slate-200">{title}</div>
      <div className="mt-[0.5cqw] inline-block rounded-full bg-primary/15 px-[0.6cqw] py-[0.15cqw] text-[0.8cqw] text-primary">{tag}</div>
    </div>
  )
}

const Ref = ({ r, className, children }: { r: RefObject<HTMLDivElement | null>; className?: string; children: ReactNode }) => <div ref={r} className={className}>{children}</div>

export function RobotDemo() {
  const reduce = useReducedMotion()
  const app = useRef<HTMLDivElement>(null)
  const navBoard = useRef<HTMLDivElement>(null)
  const newTask = useRef<HTMLDivElement>(null)
  const plus = useRef<HTMLDivElement>(null)
  const archive = useRef<HTMLDivElement>(null)
  const [boxes, setBoxes] = useState<{ nav: Box; newTask: Box; plus: Box; archive: Box } | null>(null)

  const update = useCallback(() => {
    const c = app.current
    if (!c) return
    const m = { nav: measure(c, navBoard.current), newTask: measure(c, newTask.current), plus: measure(c, plus.current), archive: measure(c, archive.current) }
    if (m.nav && m.newTask && m.plus && m.archive) setBoxes(m as { nav: Box; newTask: Box; plus: Box; archive: Box })
  }, [])

  useEffect(() => {
    update()
    const ro = new ResizeObserver(update)
    if (app.current) ro.observe(app.current)
    return () => ro.disconnect()
  }, [update])

  // cursor stops: rest → nav item (click) → "New task" (click) → the invisible "+" → the covered button → rest
  const stops = boxes ? [{ x: 50, y: 58 }, center(boxes.nav), center(boxes.nav), center(boxes.newTask), center(boxes.newTask), center(boxes.plus), center(boxes.plus), center(boxes.archive), center(boxes.archive), { x: 50, y: 58 }] : null
  const last = boxes ? center(boxes.archive) : { x: 50, y: 58 }

  return (
    <div className="relative">
      <Safari url="localhost:3000/board" className="h-auto w-full" />
      {/* the page inside the browser frame: 1200×700 of 1203×753 */}
      <div ref={app} className="absolute left-[0.08%] top-[6.9%] h-[92.96%] w-[99.75%] overflow-hidden rounded-b-[1cqw] bg-[#0d1424] [container-type:inline-size]">
        <div className="flex h-full text-left">
          <aside className="w-[18%] border-r border-white/[0.06] bg-[#0a101d] p-[1.2cqw]">
            <div className="mb-[1.6cqw] flex items-center gap-[0.6cqw]">
              <div className="size-[1.8cqw] rounded-[0.4cqw] bg-gradient-to-br from-violet-400 to-fuchsia-500" />
              <span className="text-[1.15cqw] font-semibold text-slate-100">Acme Tasks</span>
            </div>
            {['Board', 'Clients', 'Invoices', 'Reports', 'Settings'].map((n, i) => (
              <div key={n} ref={i === 0 ? navBoard : undefined} className={cn('mb-[0.4cqw] rounded-[0.5cqw] px-[0.8cqw] py-[0.55cqw] text-[1.05cqw]', i === 0 ? 'bg-white/[0.07] text-slate-100' : 'text-slate-400')}>{n}</div>
            ))}
          </aside>

          <main className="relative flex-1 p-[1.6cqw]">
            <div className="mb-[1.4cqw] flex items-center justify-between">
              <div>
                <div className="text-[1.7cqw] font-semibold text-slate-100">Board</div>
                <div className="text-[0.95cqw] text-slate-500">12 tasks · 3 due this week</div>
              </div>
              <Ref r={newTask} className="rounded-[0.5cqw] bg-violet-500 px-[1.1cqw] py-[0.6cqw] text-[1cqw] font-medium text-white">New task</Ref>
            </div>

            <div className="mb-[1.4cqw] grid grid-cols-4 gap-[1.2cqw]">
              {[['Open tasks', '12', 'text-slate-100'], ['Due this week', '3', 'text-amber-300'], ['Overdue', '1', 'text-rose-300'], ['Done this month', '27', 'text-emerald-300']].map(([k, v, c]) => (
                <div key={k} className="rounded-[0.8cqw] border border-white/[0.05] bg-white/[0.02] px-[1.1cqw] py-[0.9cqw]">
                  <div className="text-[0.9cqw] text-slate-500">{k}</div>
                  <div className={cn('mt-[0.2cqw] text-[2cqw] font-semibold', c)}>{v}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-[1.2cqw]">
              {[
                { name: 'Backlog', cards: [['Onboarding flow', 'design'], ['API docs', 'docs']] },
                { name: 'In progress', cards: [['Settings migration', 'backend'], ['Contrast audit', 'a11y']] },
                { name: 'Done', cards: [['Weekly digest', 'email'], ['Error tracking', 'infra']] },
              ].map((col, ci) => (
                <div key={col.name} className="rounded-[0.8cqw] border border-white/[0.05] bg-white/[0.02] p-[0.9cqw]">
                  <div className="mb-[0.8cqw] flex items-center justify-between">
                    <span className="text-[1.05cqw] font-medium text-slate-300">{col.name} <span className="text-slate-500">{col.cards.length}</span></span>
                    {/* the Backlog "+" is the bug: it is in the page, but at opacity 0 */}
                    <div ref={ci === 0 ? plus : undefined} className={cn('grid size-[1.7cqw] place-items-center rounded-[0.4cqw] border border-white/10 text-[1.1cqw] text-slate-300', ci === 0 && 'opacity-[0.05]')}>+</div>
                  </div>
                  <div className="grid gap-[0.7cqw]">{col.cards.map(([t, g]) => <Card key={t} title={t} tag={g} />)}</div>
                </div>
              ))}
            </div>

            <div className="mt-[1.4cqw] rounded-[0.8cqw] border border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center justify-between border-b border-white/[0.05] px-[1.2cqw] py-[0.8cqw]">
                <span className="text-[1.05cqw] font-medium text-slate-300">Due this week</span>
                <span className="text-[0.9cqw] text-slate-500">Assignee · Due · Status</span>
              </div>
              {[['Invite teammates step', 'Ada', 'Tue', 'In progress', 'text-amber-300'], ['Bulk update route docs', 'Alan', 'Wed', 'Backlog', 'text-slate-400'], ['Rollback plan', 'Katherine', 'Thu', 'Blocked', 'text-rose-300']].map(([t, who, due, st, c]) => (
                <div key={t} className="grid grid-cols-[1fr_8cqw_5cqw_8cqw] items-center border-b border-white/[0.04] px-[1.2cqw] py-[0.75cqw] text-[1cqw] last:border-0">
                  <span className="text-slate-200">{t}</span><span className="text-slate-400">{who}</span><span className="text-slate-400">{due}</span><span className={c}>{st}</span>
                </div>
              ))}
            </div>

            {/* a footer action, covered by a toast that won't go away */}
            <Ref r={archive} className="absolute bottom-[4.2cqw] right-[3.2cqw] rounded-[0.5cqw] border border-white/10 px-[1.1cqw] py-[0.6cqw] text-[1cqw] text-slate-300">Archive done tasks</Ref>
            <div className="absolute bottom-[3.2cqw] right-[1.6cqw] z-10 flex items-center gap-[0.6cqw] rounded-[0.7cqw] border border-white/10 bg-[#1b2440] px-[1.2cqw] py-[0.85cqw] text-[1cqw] text-slate-100 shadow-xl">
              <span className="size-[0.7cqw] rounded-full bg-success" /> Task saved
            </div>
          </main>
        </div>

        {boxes && (
          <>
            <Flag box={boxes.plus} at={FLAG_AT[0]} place="below-left" text={'"Add task to Backlog" can\'t be used by a person — effectively transparent (opacity 0.00)'} />
            <Flag box={boxes.archive} at={FLAG_AT[1]} place="above-right" text={'"Archive done tasks" is covered by a toast — a person can\'t click it'} />
          </>
        )}

        {/* the robot cursor (its own moves only — like the real one) */}
        <motion.div
          className="pointer-events-none absolute z-30 -ml-[0.4cqw] -mt-[0.3cqw]"
          style={reduce || !stops ? { left: `${last.x}%`, top: `${last.y}%` } : undefined}
          animate={reduce || !stops ? undefined : { left: stops.map((s) => `${s.x}%`), top: stops.map((s) => `${s.y}%`) }}
          transition={reduce || !stops ? undefined : { duration: DURATION, times: TIMES, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg viewBox="0 0 24 24" className="size-[2.4cqw] drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]"><path d="M4 2l7 19 2.5-7.5L21 11z" fill="#60a5fa" stroke="#e0edff" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          {!reduce && stops && CLICKS.map((c) => (
            <motion.span
              key={c}
              className="absolute left-0 top-0 size-[3cqw] -translate-x-1/3 -translate-y-1/3 rounded-full border-[0.2cqw] border-primary"
              animate={{ scale: [0, 0, 1.6, 1.6], opacity: [0, 0.9, 0, 0] }}
              transition={{ duration: DURATION, times: [0, c, c + 0.05, 1], repeat: Infinity }}
            />
          ))}
        </motion.div>

        <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-white/[0.06] bg-[#070b16]/95 px-[1.4cqw] py-[0.6cqw] font-mono text-[0.95cqw] text-slate-400">
          <span><span className="text-primary">blindqa</span> crawl ADMIN · read-only · writes blocked</span>
          <span>screen 3/12 · <span className="text-[#f87171]">2 findings</span></span>
        </div>
      </div>
    </div>
  )
}
