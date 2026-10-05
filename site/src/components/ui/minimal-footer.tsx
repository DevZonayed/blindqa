// Adapted from 21st.dev component #7264 ("Minimal Footer" by efferd): same grid and link columns, with
// blindqa's real links (no social accounts that don't exist, no Lenis smooth scrolling).
import { Logo } from '@/components/ui/logo'
import { GithubIcon } from '@/components/ui/github-icon'
import { REPO } from '@/lib/utils'

const docs = [
  { title: 'Install', href: '/blindqa/INSTALL.html' },
  { title: 'Browsers per machine', href: '/blindqa/BROWSERS.html' },
  { title: 'Re-test what changed', href: '/blindqa/RETEST.html' },
  { title: 'The .blindqa folder', href: '/blindqa/LAYOUT.html' },
  { title: 'Costs', href: '/blindqa/COSTS.html' },
]
const project = [
  { title: 'GitHub', href: REPO },
  { title: 'Releases', href: `${REPO}/releases` },
  { title: 'Changelog', href: `${REPO}/blob/main/CHANGELOG.md` },
  { title: 'Contributing', href: `${REPO}/blob/main/CONTRIBUTING.md` },
  { title: 'Security', href: `${REPO}/blob/main/SECURITY.md` },
  { title: 'Discussions', href: `${REPO}/discussions` },
]

export function MinimalFooter() {
  return (
    <footer className="relative mt-24">
      <div className="mx-auto max-w-5xl bg-[radial-gradient(35%_80%_at_30%_0%,rgb(96_165_250/0.08),transparent)] md:border-x md:border-border">
        <div className="absolute inset-x-0 h-px w-full bg-border" />
        <div className="grid grid-cols-6 gap-6 p-6">
          <div className="col-span-6 flex flex-col gap-5 md:col-span-3">
            <a href="#top" className="flex w-max items-center gap-2" aria-label="blindqa home">
              <Logo className="size-7" />
              <span className="font-mono text-base font-semibold">blind<span className="text-primary">qa</span></span>
            </a>
            <p className="max-w-sm text-balance font-mono text-sm text-muted-foreground">
              Human-like QA for any web app. A Claude Code &amp; Codex plugin, an MCP server and a CLI.
            </p>
            <a href={REPO} className="flex w-max items-center gap-2 rounded-md border border-border p-1.5 pr-3 text-sm text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground">
              <GithubIcon className="size-4" /> DevZonayed/blindqa
            </a>
          </div>
          <FooterColumn title="Docs" links={docs} />
          <FooterColumn title="Project" links={project} />
        </div>
        <div className="absolute inset-x-0 h-px w-full bg-border" />
        <div className="flex max-w-5xl flex-col justify-between gap-2 px-6 pb-6 pt-4 sm:flex-row">
          <p className="text-center text-xs font-light text-muted-foreground">MIT licensed · © 2026 Jonayed Ahamed</p>
          <p className="text-center text-xs font-light text-muted-foreground">Built with components from 21st.dev</p>
        </div>
      </div>
    </footer>
  )
}

function FooterColumn({ title, links }: { title: string; links: { title: string; href: string }[] }) {
  return (
    <div className="col-span-3 w-full md:col-span-1">
      <span className="mb-1 block text-xs text-muted-foreground">{title}</span>
      <div className="flex flex-col gap-1">
        {links.map(({ href, title: t }) => (
          <a key={t} className="w-max py-1 text-sm duration-200 hover:underline" href={href}>{t}</a>
        ))}
      </div>
    </div>
  )
}
