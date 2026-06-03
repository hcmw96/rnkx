import type { LegalSection } from '@/pages/legal/LegalDocLayout';
import {
  COOKIES_POLICY_SECTIONS,
  LEGAL_LAST_UPDATED,
  PRIVACY_POLICY_SECTIONS,
  TERMS_SECTIONS,
  WAIVER_SECTIONS,
} from '@/pages/legal/legalContent';
import { COMPETITION_GUIDE, COMPETITION_RULES } from '@/lib/competitionDocs';

export type AppDocument = {
  id: string;
  title: string;
  lastUpdated: string;
  intro?: string;
  sections: LegalSection[];
};

export const APP_DOCUMENTS = {
  guide: COMPETITION_GUIDE,
  rules: COMPETITION_RULES,
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    lastUpdated: LEGAL_LAST_UPDATED,
    intro: 'This policy describes how RNKX handles your personal and workout-related data.',
    sections: PRIVACY_POLICY_SECTIONS,
  },
  terms: {
    id: 'terms',
    title: 'Terms & Conditions',
    lastUpdated: LEGAL_LAST_UPDATED,
    intro: 'Please read these terms carefully before using RNKX.',
    sections: TERMS_SECTIONS,
  },
  waiver: {
    id: 'waiver',
    title: 'User Waiver',
    lastUpdated: LEGAL_LAST_UPDATED,
    intro: 'Assumption of risk and release of liability for physical activity and competition features.',
    sections: WAIVER_SECTIONS,
  },
  cookies: {
    id: 'cookies',
    title: 'Cookies Policy',
    lastUpdated: LEGAL_LAST_UPDATED,
    intro: 'How RNKX uses cookies, local storage, and related technologies.',
    sections: COOKIES_POLICY_SECTIONS,
  },
} as const satisfies Record<string, AppDocument>;

export type AppDocumentId = keyof typeof APP_DOCUMENTS;
