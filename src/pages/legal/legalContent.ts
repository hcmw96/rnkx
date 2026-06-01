import type { LegalSection } from '@/pages/legal/LegalDocLayout';

export const LEGAL_LAST_UPDATED = '28 May 2026';

const CONTACT =
  'Contact us through the RNKX app: Settings → Contact support. We will respond as soon as we reasonably can.';

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Who we are',
    paragraphs: [
      'RNKX (“RNKX”, “we”, “us”, or “our”) operates a fitness competition platform that lets athletes connect wearables, sync workouts, earn scores, and compete in Engine and Run leagues.',
      `This Privacy Policy explains how we collect, use, store, and share personal data when you use the RNKX website, mobile experience, and related services (collectively, the “Service”). ${CONTACT}`,
    ],
  },
  {
    heading: '2. Data we collect',
    paragraphs: ['We may collect the following categories of information:'],
    list: [
      'Account data: email address, authentication identifiers, and credentials managed through our auth provider.',
      'Profile data: display name, username, country, avatar, league selections, privacy preferences, and subscription status.',
      'Workout and performance data: activity type, duration, timestamps, distance, pace, heart rate, scores, league assignments, and related metrics used for rankings and fair-play checks.',
      'Device and wearable data: connected device types (e.g. Apple Watch, WHOOP, Garmin, Coros, Polar, Fitbit, Oura, Samsung, Strava integrations via our partners), sync timestamps, and data you authorise us to receive from third-party health or fitness APIs.',
      'Social and communications data: friend connections, club memberships, direct and group messages you send in the app, and support messages you submit.',
      'Technical data: app version, device type, IP address, log data, and similar information needed to operate and secure the Service.',
      'Purchase data: subscription status and transaction identifiers from Apple App Store or other platforms (we do not receive your full payment card details).',
      'Notifications: push notification tokens and delivery metadata if you enable alerts.',
    ],
  },
  {
    heading: '3. How we use your data',
    paragraphs: ['We use personal data to:'],
    list: [
      'Provide the Service, including account creation, workout sync, scoring, leaderboards, seasons, and social features.',
      'Apply fair-play and integrity rules (for example minimum duration, daily scoring limits, and anomaly checks).',
      'Process Premium subscriptions and restore purchases through platform billing.',
      'Send service-related notifications you opt into (e.g. messages, invites, score alerts).',
      'Respond to support requests and improve reliability, security, and user experience.',
      'Comply with legal obligations and enforce our Terms, Waiver, and community standards.',
    ],
  },
  {
    heading: '4. Legal bases (EEA/UK users)',
    paragraphs: [
      'Where applicable law requires a legal basis, we rely on: performance of our contract with you; legitimate interests in operating, securing, and improving the Service; compliance with legal obligations; and your consent where required (for example optional marketing or certain device permissions). You may withdraw consent without affecting lawfulness of processing before withdrawal.',
    ],
  },
  {
    heading: '5. How we share data',
    paragraphs: [
      'We do not sell your personal data. We may share data with:',
    ],
    list: [
      'Infrastructure and hosting providers that process data on our behalf under contractual safeguards.',
      'Wearable and integration partners (such as Apple HealthKit, WHOOP, and Terra-connected devices) only when you connect them and authorise data flow.',
      'Payment and subscription platforms (e.g. Apple) to manage Premium status.',
      'Push notification services to deliver alerts you enable.',
      'Other RNKX users according to your settings (for example public profile, leaderboard placement, club visibility, and messages you send).',
      'Authorities or third parties when required by law or to protect rights, safety, and integrity of the Service.',
    ],
  },
  {
    heading: '6. International transfers',
    paragraphs: [
      'Your data may be processed in countries other than where you live. Where required, we use appropriate safeguards (such as standard contractual clauses) for transfers from the EEA, UK, or Switzerland.',
    ],
  },
  {
    heading: '7. Retention',
    paragraphs: [
      'We keep personal data for as long as your account is active and as needed to provide the Service, resolve disputes, enforce agreements, and meet legal requirements. When you delete your account, we delete or anonymise personal data within a reasonable period, except where retention is required by law or for legitimate backup, security, or fraud-prevention purposes.',
    ],
  },
  {
    heading: '8. Your rights and choices',
    paragraphs: ['Depending on your location, you may have the right to:'],
    list: [
      'Access, correct, or delete your personal data.',
      'Object to or restrict certain processing.',
      'Data portability.',
      'Withdraw consent where processing is consent-based.',
      'Lodge a complaint with your local data protection authority.',
    ],
  },
  {
    heading: '9. Account controls',
    paragraphs: [
      'You can update profile and privacy settings in the app, disconnect wearables, and delete your account from Settings. Account deletion is intended to be permanent and removes your associated app data subject to the retention limits above.',
    ],
  },
  {
    heading: '10. Health and fitness data',
    paragraphs: [
      'Workout and heart-rate data may qualify as health-related information in some jurisdictions. RNKX uses this data only to power scoring, rankings, recovery insights (where available), and features you request. RNKX is not a medical device and does not provide medical advice. Do not use the Service as a substitute for professional healthcare.',
    ],
  },
  {
    heading: '11. Children',
    paragraphs: [
      'The Service is not directed to anyone under 18. We do not knowingly collect personal data from children. If you believe a child has provided data, contact us and we will take appropriate steps to delete it.',
    ],
  },
  {
    heading: '12. Security',
    paragraphs: [
      'We implement technical and organisational measures designed to protect personal data. No method of transmission or storage is completely secure; you use the Service at your own risk and should protect your login credentials.',
    ],
  },
  {
    heading: '13. Changes',
    paragraphs: [
      'We may update this Privacy Policy from time to time. We will post the revised version with a new “Last updated” date. Material changes may be communicated in-app or by email where appropriate. Continued use after changes take effect constitutes acceptance of the updated policy.',
    ],
  },
  {
    heading: '14. Contact',
    paragraphs: [CONTACT],
  },
];

// Fix section 8 - I accidentally used paragraphs_after. Let me fix in the file - actually I need to fix that duplicate paragraphs in section 8

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: '1. Agreement',
    paragraphs: [
      'These Terms & Conditions (“Terms”) govern your access to and use of RNKX. By creating an account, connecting a device, or using the Service, you agree to these Terms, our Privacy Policy, Cookies Policy, and User Waiver. If you do not agree, do not use the Service.',
    ],
  },
  {
    heading: '2. Eligibility',
    paragraphs: [
      'You must be at least 18 years old and capable of entering a binding contract. You represent that information you provide is accurate and that you will keep it up to date.',
    ],
  },
  {
    heading: '3. The Service',
    paragraphs: [
      'RNKX provides a platform to sync workouts from supported wearables, calculate competition scores, participate in Engine and/or Run leagues, join clubs, view leaderboards, and use optional Premium features such as social chat and recovery insights.',
      'We may modify, suspend, or discontinue features at any time. We do not guarantee uninterrupted availability, error-free scoring, or compatibility with every device.',
    ],
  },
  {
    heading: '4. Your account',
    paragraphs: [
      'You are responsible for safeguarding your login credentials and all activity under your account. Notify us promptly via Contact support if you suspect unauthorised access. We may suspend or terminate accounts that violate these Terms or threaten the integrity of competitions.',
    ],
  },
  {
    heading: '5. Wearables, sync, and data accuracy',
    paragraphs: [
      'You authorise RNKX to access workout and health metrics you choose to share from connected services (including Apple HealthKit on supported devices). You are responsible for device setup, permissions, and accuracy of source data.',
      'Scores and rankings depend on algorithms, fair-play rules, and data received from third parties. We may recalculate, reject, or adjust scores where rules require (including minimum duration, daily caps, duplicates, or integrity checks).',
    ],
  },
  {
    heading: '6. Leagues, scoring, and fair play',
    paragraphs: [
      'League participation is subject to published scoring rules and season schedules. You agree not to manipulate data, exploit technical loopholes, submit false activities, or interfere with other users’ experience.',
      'We may investigate suspicious activity, remove scores, disqualify entries, or take other action to protect competition integrity. Our decisions regarding scoring and enforcement are exercised in good faith but are generally final for platform purposes.',
    ],
  },
  {
    heading: '7. Premium subscriptions',
    paragraphs: [
      'RNKX Premium and other paid features are billed through Apple App Store or other authorised platforms unless stated otherwise. Prices, renewal terms, and free trials (if offered) are shown at purchase.',
      'Subscriptions renew automatically unless cancelled through your platform account settings before the renewal date. Refunds are handled by the applicable app store under its policies, not directly by RNKX except where law requires otherwise.',
      'You may use “Restore purchases” after reinstalling the app on a supported device tied to the same store account.',
    ],
  },
  {
    heading: '8. Acceptable use',
    paragraphs: ['You agree not to:'],
    list: [
      'Use the Service for unlawful, harassing, defamatory, or discriminatory purposes.',
      'Upload malware, scrape the Service, reverse engineer client software except where law permits, or attempt unauthorised access.',
      'Impersonate others or misrepresent your identity or performance data.',
      'Harvest data about other users without permission.',
      'Circumvent paywalls, fair-play limits, or technical protections.',
    ],
  },
  {
    heading: '9. Intellectual property',
    paragraphs: [
      'RNKX, its branding, software, and content are owned by us or our licensors. You receive a limited, non-exclusive, revocable licence to use the Service for personal, non-commercial purposes. You retain rights in content you submit, but grant us a worldwide licence to host, display, and process it as needed to operate the Service.',
    ],
  },
  {
    heading: '10. Third-party services',
    paragraphs: [
      'Wearable providers, app stores, and other third parties have their own terms and privacy practices. Your use of those services is at your discretion and subject to their agreements.',
    ],
  },
  {
    heading: '11. Disclaimers',
    paragraphs: [
      'THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.',
      'RNKX does not guarantee specific fitness outcomes, rankings, prizes, or health results. Physical activity carries inherent risk; see the User Waiver.',
    ],
  },
  {
    heading: '12. Limitation of liability',
    paragraphs: [
      'TO THE MAXIMUM EXTENT PERMITTED BY LAW, RNKX AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND SUPPLIERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE.',
      'OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF (A) AMOUNTS YOU PAID TO RNKX IN THE TWELVE MONTHS BEFORE THE CLAIM OR (B) ONE HUNDRED US DOLLARS (USD $100), EXCEPT WHERE LIABILITY CANNOT BE EXCLUDED BY LAW.',
    ],
  },
  {
    heading: '13. Indemnity',
    paragraphs: [
      'You agree to indemnify and hold harmless RNKX from claims, damages, and expenses (including reasonable legal fees) arising from your misuse of the Service, violation of these Terms, or infringement of third-party rights.',
    ],
  },
  {
    heading: '14. Termination',
    paragraphs: [
      'You may stop using the Service and delete your account at any time. We may suspend or terminate access for breach of these Terms or for operational, legal, or safety reasons. Provisions that by nature should survive (including liability limits, indemnity, and dispute terms) will survive termination.',
    ],
  },
  {
    heading: '15. Governing law and disputes',
    paragraphs: [
      'These Terms are governed by the laws of England and Wales, without regard to conflict-of-law principles, except where mandatory consumer protections in your country of residence apply.',
      'Courts in England and Wales have exclusive jurisdiction over disputes, unless you are a consumer in the EEA/UK and mandatory law grants you the right to bring proceedings in your home country.',
      'Before formal proceedings, please contact us through Contact support so we can try to resolve the issue informally.',
    ],
  },
  {
    heading: '16. Changes',
    paragraphs: [
      'We may update these Terms. The “Last updated” date will change when we do. Continued use after changes become effective constitutes acceptance. If you do not agree, you must stop using the Service and delete your account.',
    ],
  },
  {
    heading: '17. Contact',
    paragraphs: [CONTACT],
  },
];

export const WAIVER_SECTIONS: LegalSection[] = [
  {
    heading: 'Important — read carefully',
    paragraphs: [
      'This User Waiver (“Waiver”) is a binding agreement between you and RNKX regarding physical activity and use of competition features. By checking the consent box during onboarding or using league features, you acknowledge that you have read, understood, and agree to this Waiver in addition to the Terms & Conditions and Privacy Policy.',
    ],
  },
  {
    heading: '1. Assumption of risk',
    paragraphs: [
      'Physical exercise—including running, cycling, strength training, and other activities tracked by RNKX—involves inherent risks including muscle strains, cardiovascular events, dehydration, falls, collisions, and in rare cases serious injury or death. You voluntarily assume all risks associated with your participation in training and any RNKX league, club, or challenge.',
    ],
  },
  {
    heading: '2. Not medical advice',
    paragraphs: [
      'RNKX provides scores, rankings, and optional wellness-style insights for entertainment and motivation. RNKX does not diagnose conditions, prescribe treatment, or replace advice from a qualified healthcare professional. Max heart rate and intensity metrics are estimates based on device data and may be inaccurate.',
    ],
  },
  {
    heading: '3. Your health representations',
    paragraphs: [
      'You represent that you are physically able to participate in activities you log, that you have consulted a physician where appropriate (especially if you have cardiovascular, respiratory, musculoskeletal, or metabolic conditions, or are pregnant), and that you will stop exercising and seek medical attention if you experience pain, dizziness, chest discomfort, or other warning signs.',
    ],
  },
  {
    heading: '4. Release of liability',
    paragraphs: [
      'To the fullest extent permitted by applicable law, you release and discharge RNKX, its owners, operators, affiliates, partners, sponsors, and suppliers from any claims, demands, or causes of action arising from your use of the Service or participation in activities related to RNKX—including claims alleging negligence of RNKX, except where such release is prohibited by law.',
    ],
  },
  {
    heading: '5. Indemnity',
    paragraphs: [
      'You agree to indemnify and defend RNKX against claims brought by third parties arising from your conduct, your uploaded content, or your violation of this Waiver or the Terms.',
    ],
  },
  {
    heading: '6. Prizes and external events',
    paragraphs: [
      'Any prizes, sponsorships, or offline events associated with RNKX leagues may have separate rules. RNKX is not responsible for third-party organisers, venues, travel, or equipment unless expressly stated in writing.',
    ],
  },
  {
    heading: '7. Minors',
    paragraphs: ['The Service is for adults 18+. This Waiver does not apply to minors because they are not permitted to use RNKX.'],
  },
  {
    heading: '8. Severability',
    paragraphs: [
      'If any provision of this Waiver is held unenforceable, the remaining provisions remain in effect to the maximum extent permitted.',
    ],
  },
  {
    heading: '9. Acknowledgment',
    paragraphs: [
      'You confirm that you have read this Waiver, understand that you are giving up substantial legal rights, and sign it voluntarily. If you do not agree, do not use league or scoring features and delete your account.',
    ],
  },
];

export const COOKIES_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: '1. Introduction',
    paragraphs: [
      'This Cookies Policy explains how RNKX uses cookies, local storage, and similar technologies when you use our website and app.',
    ],
  },
  {
    heading: '2. What are cookies and local storage?',
    paragraphs: [
      'Cookies are small text files stored on your device. Local storage and session storage let the app remember preferences on your device. Similar technologies (such as SDK identifiers for push notifications) may be used for comparable purposes.',
    ],
  },
  {
    heading: '3. What we use',
    paragraphs: ['RNKX uses the following categories:'],
    list: [
      'Strictly necessary: authentication session tokens, security, and core app functionality. The Service cannot operate properly without these.',
      'Functional: preferences such as sidebar layout, read-message timestamps, notification routing after opening a link, and similar in-app state stored in localStorage or sessionStorage.',
      'Device permissions: on mobile, Apple HealthKit or push notification access is requested through your operating system, not traditional browser cookies.',
      'Third-party: our hosting, database, wearable integration, and push providers may set or process identifiers needed to deliver the Service. Their practices are described in our Privacy Policy.',
    ],
  },
  {
    heading: '4. What we do not use',
    paragraphs: [
      'We do not use third-party advertising cookies on the RNKX app as of the date above. We do not sell cookie data to advertisers.',
    ],
  },
  {
    heading: '5. Managing cookies and storage',
    paragraphs: [
      'You can clear cookies and site data through your browser settings. Clearing storage may log you out or reset in-app preferences. On iOS, you can manage Health and notification permissions in Settings → RNKX.',
      'Most browsers allow you to block cookies; blocking strictly necessary cookies may prevent login or sync.',
    ],
  },
  {
    heading: '6. Retention',
    paragraphs: [
      'Session cookies and tokens expire when you log out or after a security-related timeout. Persistent local storage remains until you clear it or uninstall the app.',
    ],
  },
  {
    heading: '7. Updates',
    paragraphs: [
      'We may update this Cookies Policy. Check the “Last updated” date when you return to this page.',
    ],
  },
  {
    heading: '8. Contact',
    paragraphs: [CONTACT],
  },
];
