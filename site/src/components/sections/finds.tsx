// "What it finds" — the bento layout and card shell of 21st.dev component #9594 ("bento grid 01" by
// avanishverma4): 6-column grid, dark bordered cards, hover lift, a visual on top and the title below.
// Each visual shows a real kind of finding; entrance is a CSS scroll reveal so the text is in the HTML.
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { EyeOff, Lock, Ban, FileWarning, Smartphone, Layers } from 'lucide-react'
import { SectionHeading } from '@/components/sections/section-heading'
import { cn } from '@/lib/utils'

function BentoCard({ className, icon, title, children, visual }: { className?: string; icon: ReactNode; title: string; children: ReactNode; visual: ReactNode }) {
  return (
    <article className={cn('reveal group flex flex-col overflow-hidden rounded-2xl border border-border bg-surface/70 p-6 transition-[border-color,transform,background-color] duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:bg-surface md:p-7', className)}>
      <div className="flex min-h-[9rem] flex-1 items-center justify-center">{visual}</div>
      <div className="mt-5">
        <h3 className="flex items-center gap-2 text-lg font-medium text-foreground">{icon}{title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
      </div>
    </article>
  )
}

const Tile = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col items-center gap-2">
    <div className="relative grid h-16 w-full place-items-center overflow-hidden rounded-lg border border-white/[0.06] bg-background/60">{children}</div>
    <span className="text-center text-[11px] text-muted-foreground">{label}</span>
  </div>
)
const Btn = ({ className }: { className?: string }) => <span className={cn('rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground', className)}>Save</span>

function UnusableControls() {
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-4">
      <Tile label="opacity 0"><Btn className="opacity-[0.07]" /><span className="absolute inset-3 rounded-md border border-dashed border-danger/80" /></Tile>
      <Tile label="under a toast"><Btn /><span className="absolute bottom-2 right-1 rounded bg-surface-2 px-2 py-1 text-[10px] text-foreground shadow-lg ring-1 ring-white/10">✓ Saved</span></Tile>
      <Tile label="clipped"><div className="h-6 w-14 overflow-hidden"><Btn className="ml-6 inline-block" /></div></Tile>
      <Tile label="off-screen"><Btn className="translate-x-16" /></Tile>
    </div>
  )
}

function ScrollLock() {
  return (
    <div className="relative h-32 w-48 overflow-hidden rounded-lg border border-white/[0.06] bg-background/60 p-3">
      {[0, 1, 2, 3].map((i) => <div key={i} className="mb-2 h-3 rounded bg-white/[0.06]" style={{ width: `${90 - i * 12}%` }} />)}
      <div className="absolute right-1.5 top-2 h-[calc(100%-1rem)] w-1 rounded-full bg-white/[0.04]">
        <motion.div className="h-8 w-1 rounded-full bg-danger/70" animate={{ y: [0, 4, 0, 4, 0] }} transition={{ duration: 2.4, repeat: Infinity }} />
      </div>
      <div className="absolute inset-x-0 bottom-0 grid h-12 place-items-center bg-gradient-to-t from-background to-transparent">
        <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] text-danger"><Lock className="size-3" /> overflow: hidden left on body</span>
      </div>
    </div>
  )
}

function ServerRefuses() {
  return (
    <div className="w-full max-w-xs space-y-2 font-mono text-[11px]">
      {[
        ['REVIEWER', 'POST /invoices/:id/approve', '403'],
        ['AUDITOR', 'PATCH /clients/:id/status', '403'],
        ['STAFF', 'GET /settings/roles', '403'],
      ].map(([role, call, code]) => (
        <div key={call} className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-background/60 px-2.5 py-1.5">
          <span className="text-primary">{role}</span><span className="truncate text-muted-foreground">{call}</span><span className="rounded bg-danger/15 px-1.5 text-danger">{code}</span>
        </div>
      ))}
    </div>
  )
}

function Nonsense() {
  return (
    <div className="w-full max-w-[15rem] space-y-2 text-[11px]">
      {[['Quantity', '−3'], ['VAT number', 'GB12'], ['Due date', 'before issue date']].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded-md border border-white/[0.06] bg-background/60 px-2.5 py-1.5">
          <span className="text-muted-foreground">{k}</span><span className="font-mono text-foreground">{v}</span><span className="text-danger">✓ saved</span>
        </div>
      ))}
    </div>
  )
}

function RawErrors() {
  return (
    <div className="relative h-28 w-52">
      <div className="absolute left-0 top-6 w-40 rounded-md bg-danger/15 px-2 py-1 font-mono text-[10px] text-danger">taxCode: Not a valid PAYE tax code</div>
      <div className="absolute right-0 top-0 h-28 w-40 rounded-lg border border-white/10 bg-surface-2 p-2.5 shadow-2xl">
        <div className="mb-2 h-2.5 w-20 rounded bg-white/15" />
        <div className="mb-1.5 h-5 rounded border border-white/10" />
        <div className="mb-2 h-5 rounded border border-white/10" />
        <div className="ml-auto h-5 w-12 rounded bg-primary" />
      </div>
    </div>
  )
}

function RolesAndPhone() {
  const roles = ['OWNER', 'ADMIN', 'MANAGER', 'REVIEWER', 'STAFF', 'CONTRACTOR', 'AUDITOR', 'CLIENT']
  return (
    <div className="flex w-full items-center justify-center gap-6">
      <div className="flex max-w-[16rem] flex-wrap gap-1.5">
        {roles.map((r, i) => (
          <motion.span
            key={r}
            className="rounded-full border border-white/10 bg-background/60 px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
            animate={{ borderColor: ['rgba(255,255,255,0.1)', 'rgba(96,165,250,0.7)', 'rgba(255,255,255,0.1)'], color: ['#94a3b8', '#eef2ff', '#94a3b8'] }}
            transition={{ duration: 1.2, delay: i * 0.6, repeat: Infinity, repeatDelay: roles.length * 0.6 - 1.2 }}
          >{r}</motion.span>
        ))}
      </div>
      <div className="hidden h-28 w-14 shrink-0 rounded-xl border-2 border-white/15 bg-background/60 p-1.5 sm:block">
        <div className="mb-1 h-1 w-5 rounded bg-white/20" />
        {[0, 1, 2].map((i) => <div key={i} className="mb-1 h-2 rounded bg-white/[0.07]" />)}
        <div className="mt-2 text-center font-mono text-[8px] text-muted-foreground">390×844</div>
      </div>
    </div>
  )
}

export function Finds() {
  return (
    <section id="finds" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-24">
      <SectionHeading eyebrow="What it finds" title={<>The bugs your users hit — <span className="text-muted-foreground">and DOM tests don’t</span></>}>
        A test can pass while a person sees nothing. blindqa checks what a person can actually see, reach and use —
        for every role, at desktop and phone width.
      </SectionHeading>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <BentoCard className="md:col-span-4" icon={<EyeOff className="size-5 text-primary" />} title="Controls a person can’t use" visual={<UnusableControls />}>
          Buttons in the page but invisible, covered by a toast or a sticky header, cut off by their container, or pushed off-screen.
        </BentoCard>
        <BentoCard className="md:col-span-2" icon={<Lock className="size-5 text-primary" />} title="Scroll-locked pages" visual={<ScrollLock />}>
          A dialog closes but the page stays locked, so the rest of the form can’t be reached.
        </BentoCard>
        <BentoCard className="md:col-span-2" icon={<Ban className="size-5 text-primary" />} title="Buttons the server refuses" visual={<ServerRefuses />}>
          A role sees a button the API rejects — and every role’s forbidden actions are sent straight to the server too.
        </BentoCard>
        <BentoCard className="md:col-span-2" icon={<FileWarning className="size-5 text-primary" />} title="Forms that accept nonsense" visual={<Nonsense />}>
          Negative quantities, invalid tax numbers, a due date before the issue date — saved without a word.
        </BentoCard>
        <BentoCard className="md:col-span-2" icon={<Layers className="size-5 text-primary" />} title="Errors nobody can read" visual={<RawErrors />}>
          Developer-speak shown to users, or the error rendered behind the dialog that caused it.
        </BentoCard>
        <BentoCard className="md:col-span-6" icon={<Smartphone className="size-5 text-primary" />} title="Every role, desktop and phone" visual={<RolesAndPhone />}>
          Signs in as each role (password, authenticator or emailed codes, magic links) and crawls every screen it can reach — then again at 390 px through the ☰ menu.
        </BentoCard>
      </div>
    </section>
  )
}
