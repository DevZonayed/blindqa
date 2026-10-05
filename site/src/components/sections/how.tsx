// "How it works" — who decides what, and the three ways to test. Card shell shared with the bento.
import type { ReactNode } from 'react'
import { Cpu, Sparkles, Bot, ScanEye, Workflow, MousePointer2 } from 'lucide-react'
import { SectionHeading } from '@/components/sections/section-heading'
import { cn } from '@/lib/utils'

function Decider({ icon, who, cost, highlight, children }: { icon: ReactNode; who: string; cost: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div className={cn('reveal relative flex flex-col rounded-2xl border p-6', highlight ? 'border-primary/30 bg-primary/[0.06]' : 'border-border bg-surface/70')}>
      <div className="mb-4 flex items-center justify-between">
        <div className="grid size-10 place-items-center rounded-xl border border-border bg-background/60 text-primary">{icon}</div>
        <span className={cn('rounded-full px-2.5 py-1 font-mono text-[11px]', highlight ? 'bg-primary/15 text-primary' : 'bg-white/[0.05] text-muted-foreground')}>{cost}</span>
      </div>
      <h3 className="text-lg font-medium">{who}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </div>
  )
}

const modes = [
  { icon: <ScanEye className="size-5" />, name: 'Crawl', text: 'Read-only. One top-to-bottom pass per page for a role: every control audited, menus and dropdowns opened, “New/Add” forms checked with an empty submit. Every write request is blocked.' },
  { icon: <Workflow className="size-5" />, name: 'Journeys', text: 'Short scripts for real workflows — sign in, create data, switch roles, check the figures — written once, reused on every run and every re-test.' },
  { icon: <MousePointer2 className="size-5" />, name: 'Act mode', text: 'Uses every option on every screen with valid data and records what each one really did. For test environments only.' },
]

export function How() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-24">
      <SectionHeading eyebrow="How it works" title={<>Scripts do the work. <span className="text-muted-foreground">Your agent does the thinking.</span></>}>
        Every repeatable decision is made by code, so re-runs are free. Your coding agent is the expensive part — it
        only sets things up, writes journeys and verifies what’s new.
      </SectionHeading>
      <div className="grid gap-4 md:grid-cols-3">
        <Decider icon={<Cpu className="size-5" />} who="Scripts" cost="machine time">
          Drive the browser, check visibility, scrolling, contrast and size, block writes, catch console and HTTP
          errors, index your code, work out what a change touches, compare runs.
        </Decider>
        <Decider icon={<Sparkles className="size-5" />} who="Jev (optional)" cost="~$0.00002 each">
          Small person-like judgments: what kind of screen this is, whether raw codes leak to users, whether a button’s
          name is clear, which control a step means. Cached across runs.
        </Decider>
        <Decider icon={<Bot className="size-5" />} who="Your coding agent" cost="tokens — only here" highlight>
          Claude Code, Codex or any MCP client: sets up the project, writes journeys, verifies new high-severity
          findings, writes the report. Never watches a run.
        </Decider>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {modes.map((m) => (
          <div key={m.name} className="reveal rounded-2xl border border-border bg-surface/40 p-6">
            <h3 className="flex items-center gap-2 font-medium"><span className="text-primary">{m.icon}</span>{m.name}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
