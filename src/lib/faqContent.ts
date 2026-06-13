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
          'RNKX turns your everyday training into competition. Connect your wearable, earn points from your workouts, climb the leaderboards, and compete against athletes worldwide.',
      },
      {
        question: 'How do I score points?',
        answer:
          'Complete a workout of at least 15 minutes. The longer and harder you train, the more points you earn.',
      },
      {
        question: 'What are the two leagues?',
        answer:
          'Engine League rewards training intensity using heart rate. Run League rewards running performance using pace.',
      },
    ],
  },
  {
    title: 'Scoring',
    items: [
      {
        question: 'How is my Engine score calculated?',
        answer:
          'Engine points are based on your average heart rate as a percentage of your maximum heart rate. Higher intensity earns more points per minute.',
      },
      {
        question: 'How is my Run score calculated?',
        answer:
          'Run points are based on your average running pace. Faster paces earn more points per minute.',
      },
      {
        question: 'What workouts count?',
        answer:
          'Most running, gym, cycling, cardio and fitness activities can score. Only running activities qualify for Run League scoring.',
      },
      {
        question: 'How do bonus points work?',
        answer:
          'Consistency is rewarded. Complete scoring workouts across multiple days during the week to earn bonus points:\n\n• 3–4 qualifying days: +10 points\n• 5–6 qualifying days: +25 points\n• 7 qualifying days: +50 points\n\nOnly the highest bonus tier earned is awarded.',
      },
      {
        question: "Why didn't my workout score?",
        answer:
          'Workouts must be at least 15 minutes long. A maximum of two scoring workouts per day count towards your score.',
      },
      {
        question: 'Can one workout score in both leagues?',
        answer: 'No. Each workout scores in one league only.',
      },
      {
        question: 'When do leaderboards reset?',
        answer:
          'Leaderboards run weekly and reset every Monday. Workouts completed before Sunday 11:59 PM UTC count towards that week’s standings.',
      },
    ],
  },
  {
    title: 'Devices',
    items: [
      {
        question: 'Which devices work with RNKX?',
        answer:
          'Apple Watch and Garmin support both Engine League and Run League scoring.\n\nWHOOP currently supports Engine League scoring only. Runs tracked with WHOOP still score in Engine League based on heart rate, ensuring no workout is wasted.',
      },
      {
        question: 'Do I need to sync manually?',
        answer:
          'Apple Watch users need to tap Sync Workouts in Settings → Devices & Sync.\n\nGarmin and WHOOP workouts sync automatically.',
      },
      {
        question: 'How is my maximum heart rate set?',
        answer:
          'We use your device’s recorded maximum heart rate where available. Otherwise, we estimate it using 220 minus your age.',
      },
    ],
  },
  {
    title: 'Membership & account',
    items: [
      {
        question: "What's included with Premium?",
        answer:
          'Premium unlocks public and private clubs, friends leaderboards, private and club chats and advanced insights.',
      },
      {
        question: 'How do I cancel?',
        answer:
          'You can manage or cancel your subscription at any time through your App Store account settings.',
      },
      {
        question: 'How do I get support?',
        answer:
          'Contact hello@rnkxglobal.com and our team will get back to you as soon as possible.',
      },
    ],
  },
];
