// FAQ — the Accordion of 21st.dev component #31351 (wensity, Base UI), "faq" variant. Panels stay
// mounted, so every answer is in the pre-rendered HTML; the same items feed the FAQPage structured data.
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { SectionHeading } from '@/components/sections/section-heading'
import { faq } from '@/content'

export function Faq() {
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-20 md:px-8 md:py-24">
      <SectionHeading eyebrow="FAQ" title="Questions people ask" center />
      <Accordion variant="faq" defaultValue="q0" className="reveal">
        {faq.map((item, i) => (
          <AccordionItem key={item.q} value={`q${i}`}>
            <AccordionTrigger>{item.q}</AccordionTrigger>
            <AccordionContent>{item.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}
