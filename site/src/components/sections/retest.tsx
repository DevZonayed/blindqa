// "Re-test only what changed" — the animated Terminal of 21st.dev component #28360 (dillionverma),
// replaying real `blindqa changes` / `blindqa retest` output from a demo app, next to how it works.
import { GitCommitHorizontal, FileSearch, Route, ListChecks } from 'lucide-react'
import { AnimatedSpan, Terminal, TypingAnimation } from '@/components/ui/terminal'
import { BorderBeam } from '@/components/ui/border-beam'
import { SectionHeading } from '@/components/sections/section-heading'

const steps = [
  { icon: <FileSearch className="size-4" />, title: 'Index once', text: 'A script reads every file: pages, visible labels, API routes and their permission checks, API calls, imports. 3,312 files in about half a second.' },
  { icon: <GitCommitHorizontal className="size-4" />, title: 'See what changed', text: 'Against the indexed commit or any git ref — which labels, pages and endpoints changed, file by file.' },
  { icon: <Route className="size-4" />, title: 'Follow the impact', text: 'Through imports to the pages that render a change, and from a server change to the screens that call its endpoints. Global files mean a full re-test.' },
  { icon: <ListChecks className="size-4" />, title: 'Re-run just that', text: 'Only the affected crawls and journeys, compared with the last run on the screens they re-visited: NEW, FIXED, STILL.' },
]

export function Retest() {
  return (
    <section id="retest" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-20 md:px-8 md:py-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="min-w-0">
          <SectionHeading eyebrow="Re-test only what changed" size="md" title={<>Change a file. <span className="text-muted-foreground">Re‑test one screen, not the whole app.</span></>} className="mb-8">
            The first full run is paid once. After that, a change costs minutes of machine time and one short report.
          </SectionHeading>
          <ol className="space-y-5">
            {steps.map((s, i) => (
              <li key={s.title} className="reveal flex gap-4">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-surface text-primary">{s.icon}</span>
                <div>
                  <h3 className="font-medium"><span className="mr-2 font-mono text-xs text-muted-foreground">0{i + 1}</span>{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="reveal relative min-w-0">
          <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,rgb(167_139_250/0.14),transparent)] blur-2xl" aria-hidden="true" />
          <div className="relative rounded-xl">
            <Terminal className="max-h-none max-w-none border-border bg-surface/90 font-mono shadow-2xl [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_code]:text-[12px] sm:[&_code]:text-sm">
              <TypingAnimation className="text-foreground">$ blindqa changes</TypingAnimation>
              <AnimatedSpan className="text-muted-foreground">Commits since: 1 — Board: new empty text, hide add button</AnimatedSpan>
              <AnimatedSpan><span>  <span className="text-warning">modified</span> src/components/Board.tsx — labels +1/-1</span></AnimatedSpan>
              <AnimatedSpan className="text-muted-foreground">Affected page routes: 1 — /</AnimatedSpan>
              <TypingAnimation className="text-foreground">$ blindqa retest --run-tests --headless</TypingAnimation>
              <AnimatedSpan className="text-primary">▶ crawl USER — landing page</AnimatedSpan>
              <AnimatedSpan><span>  <span className="text-success">✔</span> 7 new, 0 fixed, 1 still</span></AnimatedSpan>
              <AnimatedSpan className="text-primary">▶ journey taskflow-smoke — passes /</AnimatedSpan>
              <AnimatedSpan><span>  <span className="text-success">✔</span> 0 new, 0 fixed, 1 still</span></AnimatedSpan>
              <AnimatedSpan className="whitespace-normal text-danger">NEW high not-humanly-visible: “Add task to Backlog” can’t be used by a person — effectively transparent (opacity 0.00)</AnimatedSpan>
              <TypingAnimation className="text-muted-foreground">report: .blindqa/reports/retest-….md</TypingAnimation>
            </Terminal>
            <BorderBeam size={180} duration={9} colorFrom="#60a5fa" colorTo="#a78bfa" />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Real output from a demo app: one component edit, one re-crawled screen, the new bug found.</p>
        </div>
      </div>
    </section>
  )
}
