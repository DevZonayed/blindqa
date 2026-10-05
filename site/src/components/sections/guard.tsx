// "Never pushes your QA data" — the three local layers, with the lock animation from the SecurityBadge
// of 21st.dev component #9594 (one lock per layer) and a Border Beam (#1268) around the panel.
import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Lock, ShieldCheck } from 'lucide-react'
import { BorderBeam } from '@/components/ui/border-beam'
import { SectionHeading } from '@/components/sections/section-heading'
import { cn } from '@/lib/utils'

const layers = [
  { file: '.blindqa/.gitignore', is: '*', text: 'The folder ignores itself — this file included. Nothing in your repo’s own .gitignore changes.' },
  { file: '.git/info/exclude', is: '/.blindqa/', text: 'Git’s per-clone ignore list. Local to this machine, never committed.' },
  { file: '.git/hooks/pre-push', is: 'refuse', text: 'Refuses any push whose commits contain a .blindqa/ path — even after git add -f.' },
]

function Locks() {
  const [active, setActive] = useState(3) // all on in the pre-rendered HTML; cycles after hydration
  useEffect(() => {
    setActive(0)
    const t = setInterval(() => setActive((a) => (a >= 3 ? 0 : a + 1)), 900)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.div key={i} className={cn('grid size-12 place-items-center rounded-xl border transition-colors', i < active ? 'border-primary/40 bg-primary/15' : 'border-border bg-white/[0.03]')} animate={{ scale: i === active - 1 ? 1.08 : 1 }} transition={{ duration: 0.3 }}>
          <Lock className={cn('size-5', i < active ? 'text-primary' : 'text-muted-foreground/50')} />
        </motion.div>
      ))}
    </div>
  )
}

export function Guard() {
  return (
    <section id="guard" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-24">
      <div className="reveal relative overflow-hidden rounded-3xl border border-border bg-surface/50 p-8 md:p-12">
        <BorderBeam size={260} duration={14} colorFrom="#34d399" colorTo="#60a5fa" />
        <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center">
          <div className="min-w-0">
            <SectionHeading eyebrow="Safe by default" size="md" title={<>Your QA data <span className="text-muted-foreground">never reaches a git remote.</span></>} className="mb-6">
              Logins, saved sessions, screenshots and reports live in one <code className="font-mono text-foreground">.blindqa/</code> folder.
              blindqa never edits your tracked files, crawls are read-only, and repos it clones for testing can’t push at all.
            </SectionHeading>
            <Locks />
          </div>
          <div className="min-w-0 space-y-3">
            {layers.map((l, i) => (
              <div key={l.file} className="rounded-2xl border border-border bg-background/50 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-sm text-foreground"><span className="mr-2 text-muted-foreground">{i + 1}</span>{l.file}</span>
                  <span className="rounded-md bg-success/10 px-2 py-0.5 font-mono text-xs text-success">{l.is}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{l.text}</p>
              </div>
            ))}
            <div className="break-words rounded-2xl border border-danger/20 bg-danger/[0.06] p-4 font-mono text-[12px] leading-relaxed text-danger/90">
              <span className="text-muted-foreground">$ git push</span><br />
              blindqa guard: push to refs/heads/main refused — these commits contain local QA files:<br />
              &nbsp;&nbsp;.blindqa/credentials.json
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-success" /> Proven in CI against a real local remote on every commit.</p>
          </div>
        </div>
      </div>
    </section>
  )
}
