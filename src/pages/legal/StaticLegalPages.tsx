import { LegalDocLayout, LegalSections } from '@/pages/legal/LegalDocLayout';
import { APP_DOCUMENTS } from '@/lib/appDocuments';

function LegalPageFromDoc({ docId }: { docId: 'privacy' | 'terms' | 'waiver' | 'cookies' }) {
  const doc = APP_DOCUMENTS[docId];
  return (
    <LegalDocLayout title={doc.title} lastUpdated={doc.lastUpdated} intro={doc.intro}>
      <LegalSections sections={doc.sections} />
    </LegalDocLayout>
  );
}

export function PrivacyPolicyPageRoute() {
  return <LegalPageFromDoc docId="privacy" />;
}

export function TermsPageRoute() {
  return <LegalPageFromDoc docId="terms" />;
}

export function WaiverPageRoute() {
  return <LegalPageFromDoc docId="waiver" />;
}

export function CookiesPageRoute() {
  return <LegalPageFromDoc docId="cookies" />;
}
