import type { ReactNode } from 'react';

export type LegalSection = {
  heading?: string;
  paragraphs?: string[];
  list?: string[];
};

export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((section, index) => (
        <section key={section.heading ?? index} className="space-y-2">
          {section.heading ? (
            <h2 className="text-base font-semibold text-foreground">{section.heading}</h2>
          ) : null}
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph.slice(0, 48)}>{paragraph}</p>
          ))}
          {section.list?.length ? (
            <ul className="list-disc space-y-1.5 pl-5">
              {section.list.map((item) => (
                <li key={item.slice(0, 48)}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </>
  );
}

type LegalDocLayoutProps = {
  title: string;
  lastUpdated: string;
  intro?: string;
  children: ReactNode;
};

export function LegalDocLayout({ title, lastUpdated, intro, children }: LegalDocLayoutProps) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-background text-foreground">
      <article className="mx-auto max-w-lg space-y-5 px-4 py-10">
        <header className="space-y-2">
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-block text-sm text-muted-foreground transition hover:text-foreground"
          >
            ← Back
          </button>
          <h1 className="type-page-title text-neon-lime">{title}</h1>
          <p className="text-xs text-muted-foreground">Last updated: {lastUpdated}</p>
          {intro ? <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p> : null}
        </header>
        <div className="space-y-5 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </article>
    </div>
  );
}
