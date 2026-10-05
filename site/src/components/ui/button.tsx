// A small stand-in for shadcn's Button: the variants the 21st header/footer use, no extra deps.
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'outline' | 'ghost'
type Size = 'sm' | 'md' | 'lg' | 'icon'

const base = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50'
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-[0_0_0_1px_rgb(96_165_250/0.4),0_8px_30px_-8px_rgb(96_165_250/0.6)]',
  outline: 'border border-border bg-white/[0.02] text-foreground hover:bg-white/[0.06]',
  ghost: 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]',
}
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-sm', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-base', icon: 'size-9' }

export const buttonVariants = ({ variant = 'primary', size = 'md', className }: { variant?: Variant; size?: Size; className?: string } = {}) =>
  cn(base, variants[variant], sizes[size], className)

export function Button({ variant, size, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />
}

export function ButtonLink({ variant, size, className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a className={buttonVariants({ variant, size, className })} {...props} />
}
