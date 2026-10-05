// Built on 21st.dev component #19 ("Hero Section Dark" by kinfe123): radial glow, retro perspective grid,
// pill title, gradient subtitle and the spinning-border CTA — recoloured, with blindqa's copy, the install
// tabs (21st #1095) and the robot demo inside the Safari frame (21st #1241) as the "bottom image".
import { ArrowRight, ChevronRight } from 'lucide-react'
import { RetroGrid } from '@/components/ui/retro-grid'
import { InstallTabs } from '@/components/ui/install-tabs'
import { GithubIcon } from '@/components/ui/github-icon'
import { buttonVariants } from '@/components/ui/button'
import { RobotDemo } from '@/components/sections/robot-demo'
import { installTabs } from '@/content'
import { REPO } from '@/lib/utils'

export function Hero() {
  return (
    <section id="top" className="relative -mt-20 overflow-hidden pt-20">
      <div className="absolute inset-x-0 top-0 z-0 h-[48rem] bg-[radial-gradient(ellipse_40%_70%_at_50%_-10%,rgb(96_165_250/0.22),transparent)]" aria-hidden="true" />
      <RetroGrid className="top-0 h-[44rem]" opacity={0.45} />

      <div className="relative z-10 mx-auto max-w-screen-xl px-4 pb-10 pt-20 md:px-8 md:pt-28">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <a
            href={`${REPO}/releases`}
            className="group mx-auto flex w-fit items-center rounded-3xl border-2 border-white/5 bg-gradient-to-tr from-zinc-300/5 via-gray-400/5 to-transparent px-5 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <span className="mr-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">v0.2</span>
            Claude Code &amp; Codex plugin · MCP server · CLI
            <ChevronRight className="ml-2 inline size-4 duration-300 group-hover:translate-x-1" />
          </a>

          <h1 className="bg-[linear-gradient(180deg,_#FFF_0%,_rgba(255,_255,_255,_0.55)_120%)] bg-clip-text text-4xl font-semibold tracking-tighter text-transparent sm:text-5xl md:text-7xl">
            QA that tests your app{' '}
            <span className="bg-gradient-to-r from-sky-300 via-primary to-violet-300 bg-clip-text text-transparent">like a person would</span>
          </h1>

          <p className="mx-auto max-w-2xl text-balance text-base leading-relaxed text-muted-foreground md:text-lg">
            blindqa drives your web app in a real browser — scrolling, clicking, signing in as every role — and
            reports the bugs your users would actually hit. After the first run, it re-tests only what your code
            changes touch.
          </p>

          <div className="flex flex-col items-center justify-center gap-3 pt-2 sm:flex-row">
            <span className="relative inline-block overflow-hidden rounded-full p-[1.5px]">
              <span className="absolute inset-[-1000%] animate-[spin_2.5s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#bfdbfe_0%,#1d4ed8_50%,#bfdbfe_100%)]" aria-hidden="true" />
              <a
                href="#install"
                className="relative inline-flex items-center justify-center gap-2 rounded-full bg-background px-8 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-surface"
              >
                Install the plugin <ArrowRight className="size-4" />
              </a>
            </span>
            <a href={REPO} className={buttonVariants({ variant: 'outline', size: 'lg', className: 'rounded-full px-7 text-sm' })}>
              <GithubIcon className="size-4" /> Star on GitHub
            </a>
          </div>

          <div id="install" className="mx-auto max-w-xl scroll-mt-28 pt-6">
            <InstallTabs tabs={installTabs} id="hero-install" />
            <p className="mt-3 text-xs text-muted-foreground">Then ask your agent: <span className="text-foreground/80">“Set up blindqa for this repo.”</span> Node.js 20+ and git required.</p>
          </div>
        </div>

        <div className="relative mx-auto mt-16 max-w-5xl md:mt-24">
          <div className="absolute -inset-x-10 -inset-y-8 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,rgb(96_165_250/0.18),transparent)] blur-2xl" aria-hidden="true" />
          <RobotDemo />
          <p className="mt-4 text-center text-sm text-muted-foreground">
            A crawl flags what a person couldn’t use — even when it’s in the DOM and a DOM test would pass.
          </p>
        </div>
      </div>
    </section>
  )
}
