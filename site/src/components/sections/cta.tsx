// Closing call to action: install again, star, read the docs.
import { BookOpen } from 'lucide-react'
import { InstallTabs } from '@/components/ui/install-tabs'
import { GithubIcon } from '@/components/ui/github-icon'
import { buttonVariants } from '@/components/ui/button'
import { RetroGrid } from '@/components/ui/retro-grid'
import { installTabs } from '@/content'
import { REPO } from '@/lib/utils'

export function Cta() {
  return (
    <section className="mx-auto max-w-6xl px-4 md:px-8">
      <div className="reveal relative overflow-hidden rounded-3xl border border-border bg-surface/60 px-6 py-16 text-center md:px-16 md:py-20">
        <RetroGrid className="inset-0" opacity={0.3} cellSize={44} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_50%_0%,rgb(96_165_250/0.16),transparent)]" aria-hidden="true" />
        <div className="relative mx-auto max-w-xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">Test your app the way your users use it.</h2>
          <p className="mt-4 text-muted-foreground">Two commands in Claude Code or Codex. MIT licensed, open source.</p>
          <InstallTabs tabs={installTabs} id="cta-install" className="mt-8" />
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <a href={REPO} className={buttonVariants({ variant: 'primary', size: 'lg', className: 'text-sm' })}><GithubIcon className="size-4" /> Star on GitHub</a>
            <a href="/blindqa/INSTALL.html" className={buttonVariants({ variant: 'outline', size: 'lg', className: 'text-sm' })}><BookOpen className="size-4" /> Read the docs</a>
          </div>
        </div>
      </div>
    </section>
  )
}
