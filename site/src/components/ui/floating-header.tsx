// Adapted from 21st.dev component #8137 ("Floating Header" by efferd): the sticky rounded glass bar with
// a mobile menu. The shadcn Sheet is replaced by a small disclosure panel (one less dependency).
import { useEffect, useState } from 'react'
import { MenuIcon, XIcon } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { GithubIcon } from '@/components/ui/github-icon'
import { Logo } from '@/components/ui/logo'
import { cn, REPO } from '@/lib/utils'

const links = [
  { label: 'What it finds', href: '#finds' },
  { label: 'How it works', href: '#how' },
  { label: 'Re-test', href: '#retest' },
  { label: 'Browsers', href: '#browsers' },
  { label: 'Docs', href: '/blindqa/INSTALL.html' },
]

export function FloatingHeader() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-4 z-50 mx-auto w-[calc(100%-2rem)] max-w-5xl rounded-xl border transition-[background-color,border-color,box-shadow] duration-300',
        scrolled
          ? 'border-border bg-background/80 shadow-[0_8px_40px_-12px_rgb(0_0_0/0.8)] backdrop-blur-lg supports-[backdrop-filter]:bg-background/60'
          : 'border-transparent bg-transparent',
      )}
    >
      <nav className="flex items-center justify-between p-1.5" aria-label="Main">
        <a href="#top" className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/[0.05]" aria-label="blindqa home">
          <Logo className="size-6" />
          <span className="font-mono text-[15px] font-semibold tracking-tight">blind<span className="text-primary">qa</span></span>
        </a>
        <div className="hidden items-center gap-0.5 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>{l.label}</a>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <a href={REPO} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'hidden sm:inline-flex' })}>
            <GithubIcon className="size-4" /> GitHub
          </a>
          <a href="#install" className={buttonVariants({ variant: 'primary', size: 'sm' })}>Install</a>
          <button
            className={buttonVariants({ variant: 'outline', size: 'icon', className: 'lg:hidden' })}
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <XIcon className="size-4" /> : <MenuIcon className="size-4" />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="grid gap-1 border-t border-border p-2 lg:hidden">
          {[...links, { label: 'GitHub', href: REPO }].map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className={buttonVariants({ variant: 'ghost', className: 'justify-start' })}>{l.label}</a>
          ))}
        </div>
      )}
    </header>
  )
}
