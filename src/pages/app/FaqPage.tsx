import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/app/AppShell';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { FAQ_SECTIONS } from '@/lib/faqContent';
import { cn } from '@/lib/utils';

export default function FaqPage() {
  const navigate = useNavigate();

  return (
    <AppShell>
      <section className="mx-auto max-w-lg space-y-5 pb-8 font-sans">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </Button>

        <header className="space-y-1">
          <h1 className="type-page-title">FAQ</h1>
          <p className="text-sm text-muted-foreground">Answers about scoring, devices, and your account.</p>
        </header>

        <div className="space-y-4">
          {FAQ_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-2">
              <h2 className="type-section-label px-0.5 text-foreground">{section.title}</h2>
              <article className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <Accordion type="single" collapsible className="w-full">
                  {section.items.map((item, index) => (
                    <AccordionItem
                      key={item.question}
                      value={item.question}
                      className={cn('border-border/60', index === 0 ? 'border-t-0' : undefined)}
                    >
                      <AccordionTrigger className="px-4 py-3.5 text-left text-sm font-medium leading-snug text-foreground hover:no-underline [&[data-state=open]]:text-neon-lime">
                        {item.question}
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                        {item.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </article>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
