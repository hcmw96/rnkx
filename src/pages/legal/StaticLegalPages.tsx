import { LegalDocLayout, LegalSections } from '@/pages/legal/LegalDocLayout';
import {
  COOKIES_POLICY_SECTIONS,
  LEGAL_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  TERMS_SECTIONS,
  WAIVER_SECTIONS,
} from '@/pages/legal/legalContent';

export function PrivacyPolicyPageRoute() {
  return (
    <LegalDocLayout
      title="Privacy Policy"
      lastUpdated={LEGAL_LAST_UPDATED}
      intro="This policy describes how RNKX handles your personal and workout-related data."
    >
      <LegalSections sections={PRIVACY_POLICY_SECTIONS} />
    </LegalDocLayout>
  );
}

export function TermsPageRoute() {
  return (
    <LegalDocLayout
      title="Terms & Conditions"
      lastUpdated={LEGAL_LAST_UPDATED}
      intro="Please read these terms carefully before using RNKX."
    >
      <LegalSections sections={TERMS_SECTIONS} />
    </LegalDocLayout>
  );
}

export function WaiverPageRoute() {
  return (
    <LegalDocLayout
      title="User Waiver"
      lastUpdated={LEGAL_LAST_UPDATED}
      intro="Assumption of risk and release of liability for physical activity and competition features."
    >
      <LegalSections sections={WAIVER_SECTIONS} />
    </LegalDocLayout>
  );
}

export function CookiesPageRoute() {
  return (
    <LegalDocLayout
      title="Cookies Policy"
      lastUpdated={LEGAL_LAST_UPDATED}
      intro="How RNKX uses cookies, local storage, and related technologies."
    >
      <LegalSections sections={COOKIES_POLICY_SECTIONS} />
    </LegalDocLayout>
  );
}
