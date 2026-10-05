// Adapted from 21st.dev component #6557 ("Star On Github" by socolled): the rainbow-edged button.
// A link to the repo (a star is the visitor's own click on GitHub; no link can star for them), the rainbow
// tuned to the site's blue/violet, and the live star count from GitHub's API, shown once it reaches 10.
import { useEffect, useState } from 'react'
import { GithubIcon } from '@/components/ui/github-icon'
import { cn, REPO } from '@/lib/utils'

const API = 'https://api.github.com/repos/DevZonayed/blindqa'
const SHOW_FROM = 10

function useStars() {
  const [stars, setStars] = useState<number | null>(null)
  useEffect(() => {
    let cached: string | null = null
    try { cached = sessionStorage.getItem('bq-stars') } catch { /* storage blocked */ }
    if (cached) { setStars(Number(cached)); return }
    const ctl = new AbortController()
    fetch(API, { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.stargazers_count !== 'number') return
        setStars(d.stargazers_count)
        try { sessionStorage.setItem('bq-stars', String(d.stargazers_count)) } catch { /* storage blocked */ }
      })
      .catch(() => {})
    return () => ctl.abort()
  }, [])
  return stars
}

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

export function StarOnGithub({ size = 'md', className }: { size?: 'sm' | 'md'; className?: string }) {
  const stars = useStars()
  return (
    <a
      href={REPO}
      aria-label={stars !== null && stars >= SHOW_FROM ? `Star blindqa on GitHub (${stars} stars)` : 'Star blindqa on GitHub'}
      className={cn(
        'group relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium text-foreground transition-transform duration-200 active:scale-[0.98]',
        'animate-rainbow bg-[length:200%] [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:1.5px_solid_transparent]',
        'bg-[linear-gradient(#0b1020,#0b1020),linear-gradient(#0b1020_50%,rgb(11_16_32/0.6)_80%,rgb(11_16_32/0)),linear-gradient(90deg,#60a5fa,#a78bfa,#f472b6,#34d399,#60a5fa)]',
        'before:pointer-events-none before:absolute before:bottom-[-20%] before:left-1/2 before:h-[20%] before:w-[60%] before:-translate-x-1/2 before:animate-rainbow before:bg-[linear-gradient(90deg,#60a5fa,#a78bfa,#f472b6,#34d399,#60a5fa)] before:bg-[length:200%] before:[filter:blur(12px)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        size === 'sm' ? 'h-8 gap-1.5 px-3 text-[13px]' : 'h-12 gap-2 px-6 text-sm',
        className,
      )}
    >
      <GithubIcon className="relative size-4" />
      <span className="relative">Star on GitHub</span>
      <svg className="relative size-4 text-muted-foreground transition-colors duration-200 group-hover:text-warning" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
        <path fillRule="evenodd" clipRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z" />
      </svg>
      {stars !== null && stars >= SHOW_FROM && <span className="relative font-mono tabular-nums">{short(stars)}</span>}
    </a>
  )
}
