export type FaqItem = {
  question: string;
  answer: string;
};

export type FaqSection = {
  title: string;
  items: FaqItem[];
};

export const FAQ_SECTIONS: FaqSection[] = [
  {
    title: 'Getting started',
    items: [
      {
        question: 'What is RNKX?',
        answer:
          'RNKX turns your real-world training into competitive points. Connect your wearable, train, and climb the leaderboard across two leagues: Engine (heart rate based) and Run (pace based).',
      },
      {
        question: 'How do I score points?',
        answer:
          'Complete a workout of at least 15 minutes. Engine points are based on how hard you push your heart rate; Run points are based on your pace. The harder you train, the more you score.',
      },
      {
        question: 'What are the two leagues?',
        answer:
          'Engine League rewards intensity — points scale with your heart rate as a percentage of your max. Run League rewards speed — faster paces earn more points per minute.',
      },
    ],
  },
  {
    title: 'Scoring',
    items: [
      {
        question: 'How is my Engine score calculated?',
        answer:
          'Points per minute scale with your average heart rate as a percentage of your maximum. Higher intensity zones earn more points per minute.',
      },
      {
        question: 'How is my Run score calculated?',
        answer:
          'Points per minute scale with your pace. The quicker your pace per kilometre, the higher your points per minute.',
      },
      {
        question: "Why didn't my workout score?",
        answer:
          "Workouts under 15 minutes don't score. Only running activities count toward the Run League. A maximum of two workouts per league count each day.",
      },
      {
        question: 'Can one workout score in both leagues?',
        answer:
          'No — each workout scores in either Run or Engine, whichever applies. Runs are scored as runs; everything else is scored on heart rate.',
      },
    ],
  },
  {
    title: 'Devices',
    items: [
      {
        question: 'Which devices work with RNKX?',
        answer: 'Apple Watch, WHOOP, and Garmin are supported, with more coming soon.',
      },
      {
        question: 'Do I need to sync manually?',
        answer:
          'Apple Watch users need to open the app and tap Sync after each workout. WHOOP and Garmin sync automatically.',
      },
      {
        question: 'How is my max heart rate set?',
        answer:
          'We estimate it as 220 minus your age until your device reports a measured maximum, after which we use that.',
      },
    ],
  },
  {
    title: 'Membership & account',
    items: [
      {
        question: "What's included with Premium?",
        answer: 'Premium unlocks clubs, private leagues, advanced insights, and more.',
      },
      {
        question: 'How do I cancel?',
        answer: 'Manage your subscription through your App Store account settings.',
      },
      {
        question: 'How do I get support?',
        answer: "Email hello@rnkxglobal.com and we'll help.",
      },
    ],
  },
];
