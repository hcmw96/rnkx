import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { CompetitionDoc } from '@/lib/competitionDocs';

type DocViewerSheetProps = {
  doc: CompetitionDoc | null;
  onClose: () => void;
};

export function DocViewerSheet({ doc, onClose }: DocViewerSheetProps) {
  if (!doc) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] overflow-y-auto overflow-x-hidden bg-background text-foreground overscroll-y-contain [-webkit-overflow-scrolling:touch] pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] pr-[var(--safe-area-right)]"
      role="dialog"
      aria-modal="true"
      aria-label={doc.title}
    >
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3.5 backdrop-blur-sm">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-display text-base font-semibold tracking-wide text-foreground">
          {doc.title}
        </h1>
      </div>

      <div className="mx-auto max-w-lg space-y-6 px-5 py-6">
        {doc.sections.map((section, i) => (
          <div key={i} className="space-y-1.5">
            {section.split('\n\n').map((para, j) => {
              const isFirstPara = j === 0;
              const looksLikeHeading =
                isFirstPara &&
                (para.match(/^\d+\./) ||
                  para === para.toUpperCase() ||
                  para.endsWith(':') ||
                  !para.includes(' '));
              return (
                <p
                  key={j}
                  className={
                    looksLikeHeading
                      ? 'text-sm font-semibold text-foreground'
                      : 'text-sm leading-relaxed text-muted-foreground'
                  }
                >
                  {para}
                </p>
              );
            })}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
