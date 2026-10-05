// The perspective grid from 21st.dev component #19 ("Hero Section Dark"), recoloured for this site.
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export function RetroGrid({ angle = 65, cellSize = 56, opacity = 0.5, lineColor = 'rgb(96 165 250 / 0.22)', className }: { angle?: number; cellSize?: number; opacity?: number; lineColor?: string; className?: string }) {
  const style = { '--grid-angle': `${angle}deg`, '--cell-size': `${cellSize}px`, '--opacity': opacity, '--line': lineColor } as CSSProperties
  return (
    <div className={cn('pointer-events-none absolute size-full overflow-hidden [perspective:200px] opacity-[var(--opacity)]', className)} style={style} aria-hidden="true">
      <div className="absolute inset-0 [transform:rotateX(var(--grid-angle))]">
        <div className="animate-grid [background-image:linear-gradient(to_right,var(--line)_1px,transparent_0),linear-gradient(to_bottom,var(--line)_1px,transparent_0)] [background-repeat:repeat] [background-size:var(--cell-size)_var(--cell-size)] [height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent to-90%" />
    </div>
  )
}
