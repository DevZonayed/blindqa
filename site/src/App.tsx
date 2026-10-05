import { FloatingHeader } from '@/components/ui/floating-header'
import { MinimalFooter } from '@/components/ui/minimal-footer'
import { Hero } from '@/components/sections/hero'
import { Finds } from '@/components/sections/finds'
import { How } from '@/components/sections/how'
import { Retest } from '@/components/sections/retest'
import { Browsers } from '@/components/sections/browsers'
import { Guard } from '@/components/sections/guard'
import { Faq } from '@/components/sections/faq'
import { Cta } from '@/components/sections/cta'

export function App() {
  return (
    <>
      <a href="#finds" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">Skip to content</a>
      <FloatingHeader />
      <main>
        <Hero />
        <Finds />
        <How />
        <Retest />
        <Browsers />
        <Guard />
        <Faq />
        <Cta />
      </main>
      <MinimalFooter />
    </>
  )
}
