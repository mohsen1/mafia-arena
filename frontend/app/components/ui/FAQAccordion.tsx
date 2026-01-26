import * as React from "react"
import DOMPurify from "dompurify"
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "./accordion"
import { Target, Users, Sparkles, Code2, type LucideIcon } from "lucide-react"

interface FAQQuestion {
  q: string
  a: string
}

interface FAQCategory {
  category: string
  icon: "target" | "users" | "sparkles" | "code"
  questions: FAQQuestion[]
}

interface FAQAccordionProps {
  faqs: FAQCategory[]
}

const iconMap: Record<string, LucideIcon> = {
  target: Target,
  users: Users,
  sparkles: Sparkles,
  code: Code2,
}

function FAQAccordion({ faqs }: FAQAccordionProps) {
  return (
    <div className="space-y-8">
      {faqs.map((category) => {
        const Icon = iconMap[category.icon]
        return (
          <section key={category.category} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" />
              <h2 className="text-lg font-semibold">{category.category}</h2>
            </div>
            <Accordion type="single" collapsible defaultValue="item-0" className="space-y-2">
              {category.questions.map((faq, idx) => (
                <AccordionItem key={idx} value={`item-${idx}`}>
                  <AccordionTrigger>{faq.q}</AccordionTrigger>
                  <AccordionContent>
                    <div
                      className="prose prose-sm dark:prose-invert max-w-none [&_strong]:text-foreground [&_strong]:font-semibold [&_p]:mb-3 [&_p:last-child]:mb-0"
                      dangerouslySetInnerHTML={{
                        __html: DOMPurify.sanitize(
                          faq.a
                            .replace(/\n\n/g, '</p><p>')
                            .replace(/^/, '<p>')
                            .replace(/$/, '</p>')
                        )
                      }}
                    />
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )
      })}
    </div>
  )
}

export { FAQAccordion }
export type { FAQCategory, FAQQuestion }
