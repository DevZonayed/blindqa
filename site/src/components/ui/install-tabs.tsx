// Adapted from 21st.dev component #1095 ("Script Copy Button" by dillionverma): the same tab strip with a
// spring underline and an animated copy button. shiki/next-themes are dropped — a plain shell block reads
// better on this dark page and ships no grammar — and each tab carries its own prompt and several lines.
import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

export type InstallTab = { name: string; prompt: string; code: string }

export function InstallTabs({ tabs, className, id = 'install' }: { tabs: InstallTab[]; className?: string; id?: string }) {
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const tab = tabs[active]

  const copy = async () => {
    try { await navigator.clipboard.writeText(tab.code) } catch { /* clipboard blocked: the text stays selectable */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={cn('w-full text-left', className)}>
      <div role="tablist" aria-label="Install blindqa" className="mb-2 inline-flex overflow-hidden rounded-lg border border-border bg-white/[0.02] text-sm">
        {tabs.map((t, i) => (
          <div key={t.name} className="flex items-center">
            {i > 0 && <div className="h-4 w-px bg-border" aria-hidden="true" />}
            <button
              role="tab"
              id={`${id}-tab-${i}`}
              aria-selected={active === i}
              aria-controls={`${id}-panel`}
              onClick={() => setActive(i)}
              className={cn('relative px-3.5 py-1.5 transition-colors', active === i ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {t.name}
              {active === i && (
                <motion.div layoutId={`${id}-underline`} className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 34 }} />
              )}
            </button>
          </div>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${active}`} className="relative rounded-xl border border-border bg-surface/80 shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] backdrop-blur">
        <pre className="overflow-x-auto py-3.5 pl-4 pr-14 font-mono text-[12px] leading-6 max-sm:whitespace-pre-wrap max-sm:break-all sm:text-[13px]">
          {tab.code.split('\n').map((line) => (
            <div key={line}>
              <span className="select-none text-primary/70">{tab.prompt} </span>
              <span className="text-foreground/90">{line}</span>
            </div>
          ))}
        </pre>
        <button
          onClick={copy}
          aria-label={copied ? 'Copied' : `Copy the ${tab.name} commands`}
          className="absolute right-2.5 top-2.5 grid size-8 place-items-center rounded-md border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground"
        >
          <motion.span key={copied ? 'check' : 'copy'} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.15 }}>
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
          </motion.span>
        </button>
      </div>
    </div>
  )
}
