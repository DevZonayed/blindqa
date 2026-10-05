import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function SectionHeading({ eyebrow, title, children, className, center = false, size = 'lg' }: { eyebrow: string; title: ReactNode; children?: ReactNode; className?: string; center?: boolean; size?: 'lg' | 'md' }) {
  return (
    <div className={cn('reveal mb-12 max-w-2xl', center && 'mx-auto text-center', className)}>
      <p className="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
      <h2 className={cn('text-balance text-3xl font-semibold tracking-tight text-foreground', size === 'lg' ? 'md:text-5xl' : 'md:text-4xl')}>{title}</h2>
      {children && <p className="mt-4 text-balance text-base leading-relaxed text-muted-foreground md:text-lg">{children}</p>}
    </div>
  )
}
