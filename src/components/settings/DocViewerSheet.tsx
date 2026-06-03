import { createPortal } from 'react-dom';
import type { AppDocument } from '@/lib/appDocuments';
import { LegalDocLayout, LegalSections } from '@/pages/legal/LegalDocLayout';

type DocViewerSheetProps = {
  doc: AppDocument | null;
  onClose: () => void;
};

export function DocViewerSheet({ doc, onClose }: DocViewerSheetProps) {
  if (!doc) return null;

  return createPortal(
    <LegalDocLayout
      title={doc.title}
      lastUpdated={doc.lastUpdated}
      intro={doc.intro}
      onBack={onClose}
    >
      <LegalSections sections={doc.sections} />
    </LegalDocLayout>,
    document.body,
  );
}
