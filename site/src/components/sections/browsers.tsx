// "One browser setting per machine" — the Animated Beam of 21st.dev component #919 (dillionverma):
// agents on the left, blindqa in the middle, whatever browser this machine has on the right.
import { forwardRef, useRef, type ReactNode } from 'react'
import { Bot, Terminal as TerminalIcon, Monitor, Server, Globe, Container, Laptop } from 'lucide-react'
import { AnimatedBeam } from '@/components/ui/animated-beam'
import { Logo } from '@/components/ui/logo'
import { SectionHeading } from '@/components/sections/section-heading'
import { cn } from '@/lib/utils'

const Node = forwardRef<HTMLDivElement, { className?: string; children: ReactNode; label: string; sub?: string }>(({ className, children, label, sub }, ref) => (
  <div className="flex flex-col items-center gap-2">
    <div ref={ref} className={cn('z-10 grid size-14 place-items-center rounded-2xl border border-border bg-surface shadow-[0_0_24px_-8px_rgb(0_0_0/0.9)]', className)}>{children}</div>
    <div className="text-center">
      <div className="text-xs font-medium text-foreground">{label}</div>
      {sub && <div className="font-mono text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  </div>
))
Node.displayName = 'Node'

const modes = [
  { mode: 'local', use: 'A desktop: one visible Chromium window that stays open, robot cursor included.' },
  { mode: 'headless', use: 'CI and servers without a display.' },
  { mode: 'cdp', use: 'Your own Chrome, Browserless, any Chromium with remote debugging — in an isolated context, your cookies untouched.' },
  { mode: 'neko', use: 'A shared browser in an n.eko container your team watches live. Compose template included.' },
  { mode: 'orca', use: 'Orca’s built-in browser (experimental) — or simply run blindqa in an Orca terminal in local mode.' },
]

export function Browsers() {
  const container = useRef<HTMLDivElement>(null)
  const center = useRef<HTMLDivElement>(null)
  const agents = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]
  const targets = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)]

  return (
    <section id="browsers" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-24">
      <SectionHeading eyebrow="Any machine, any browser" title={<>One browser setting <span className="text-muted-foreground">per machine.</span></>} center>
        Projects move between machines; browsers don’t. Each machine keeps its own mode in <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-sm text-foreground">~/.blindqa/machine.json</code> —
        <code className="ml-1 rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-sm text-foreground">blindqa machine detect</code> suggests one.
      </SectionHeading>

      <div ref={container} className="reveal relative mx-auto flex max-w-4xl items-center justify-between gap-4 overflow-hidden rounded-3xl border border-border bg-surface/40 px-6 py-10 sm:px-12">
        <div className="flex flex-col gap-8">
          <Node ref={agents[0]} label="Claude Code" sub="plugin"><Bot className="size-6 text-[#d97757]" /></Node>
          <Node ref={agents[1]} label="Codex" sub="plugin"><Laptop className="size-6 text-foreground" /></Node>
          <Node ref={agents[2]} label="CLI / MCP" sub="any agent"><TerminalIcon className="size-6 text-success" /></Node>
        </div>
        <Node ref={center} label="blindqa" sub="the robot" className="size-20 border-primary/40 bg-background shadow-[0_0_60px_-10px_rgb(96_165_250/0.6)]"><Logo className="size-10" /></Node>
        <div className="flex flex-col gap-3">
          <Node ref={targets[0]} label="local" className="size-11 rounded-xl"><Monitor className="size-5 text-primary" /></Node>
          <Node ref={targets[1]} label="headless" className="size-11 rounded-xl"><Server className="size-5 text-primary" /></Node>
          <Node ref={targets[2]} label="cdp" className="size-11 rounded-xl"><Globe className="size-5 text-primary" /></Node>
          <Node ref={targets[3]} label="n.eko" className="size-11 rounded-xl"><Container className="size-5 text-primary" /></Node>
          <Node ref={targets[4]} label="orca" className="size-11 rounded-xl"><span className="font-mono text-sm font-bold text-primary">O</span></Node>
        </div>
        {agents.map((ref, i) => (
          <AnimatedBeam key={`a${i}`} containerRef={container} fromRef={ref} toRef={center} curvature={i === 0 ? 40 : i === 2 ? -40 : 0} duration={4} delay={i * 0.4} gradientStartColor="#60a5fa" gradientStopColor="#a78bfa" pathColor="#94a3b8" pathOpacity={0.12} />
        ))}
        {targets.map((ref, i) => (
          <AnimatedBeam key={`t${i}`} containerRef={container} fromRef={center} toRef={ref} curvature={(2 - i) * 18} duration={4} delay={1 + i * 0.3} gradientStartColor="#a78bfa" gradientStopColor="#60a5fa" pathColor="#94a3b8" pathOpacity={0.12} />
        ))}
      </div>

      <dl className="mx-auto mt-8 grid max-w-4xl gap-x-8 gap-y-4 sm:grid-cols-2">
        {modes.map((m) => (
          <div key={m.mode} className="reveal flex gap-3">
            <dt className="w-20 shrink-0 font-mono text-sm text-primary">{m.mode}</dt>
            <dd className="text-sm leading-relaxed text-muted-foreground">{m.use}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
