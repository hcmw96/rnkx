type AssistantEntry = {
  keywords: string[];
  answer: string;
};

const ENTRIES: AssistantEntry[] = [
  {
    keywords: ['engine', 'heart', 'hr', 'cardio', 'effort', 'zone'],
    answer:
      'Engine League scores from average heart rate as a % of your max HR. Higher effort earns more points per minute (for example, ~85% max HR is about 4.2 pts/min). Sessions under 15 minutes do not score.',
  },
  {
    keywords: ['run', 'pace', 'running', 'km', 'speed', 'marathon'],
    answer:
      'Run League scores from average pace (seconds per km) using a points-per-minute lookup table (faster pace = more points per minute). The activity must be a run type and longer than 15 minutes. Session points round up to a whole number.',
  },
  {
    keywords: ['league', 'leagues', 'both', 'engine and run', 'compete'],
    answer:
      'You can compete in Engine League, Run League, or both. Each workout is scored for the leagues you have selected. Run League only counts run activities; Engine uses heart-rate effort on qualifying sessions.',
  },
  {
    keywords: ['15', 'minute', 'minutes', 'short', 'duration', 'long enough'],
    answer:
      'Activities must be longer than 15 minutes to qualify for scoring. A session of exactly 15 minutes does not count.',
  },
  {
    keywords: ['2', 'two', 'daily', 'cap', 'limit', 'per day', 'max activities'],
    answer:
      'You can have at most 2 scored activities per calendar day. If more than 2 qualify, only your two highest-scoring sessions that day count.',
  },
  {
    keywords: ['season', 'seasons', 'reset', 'weekly', 'ranking', 'standings'],
    answer:
      'Leagues run in 6–8 week seasons. Standings update weekly and reset when a new season starts.',
  },
  {
    keywords: ['reject', 'rejected', 'not counted', 'no score', 'why zero', '0 points', 'disallowed'],
    answer:
      'A session may not count if it is under 15 minutes, fails fair-play checks (e.g. implausible pace vs heart rate), is a duplicate, does not match the league, or hits the 2-per-day cap. Rejected Apple workouts store a reason in the app backend.',
  },
  {
    keywords: ['fair', 'cheat', 'cheating', 'plausible', 'duplicate', 'gps'],
    answer:
      'Fair play checks include minimum duration, duplicate detection, and implausible pace/heart-rate combinations. Play fair — data should come from your real workouts on connected devices.',
  },
  {
    keywords: ['wearable', 'whoop', 'garmin', 'apple', 'watch', 'terra', 'sync', 'connect'],
    answer:
      'Scores use data synced from your connected wearable (Apple Health on iPhone, WHOOP, Garmin, Coros, etc.). Connect a device in Settings → Devices and sync regularly so workouts appear.',
  },
  {
    keywords: ['max hr', 'maxhr', 'maximum heart', 'heart rate max'],
    answer:
      'Your max HR is used for Engine scoring and is detected from your connected wearable (e.g. Apple Watch or WHOOP). It cannot be changed manually in the app.',
  },
  {
    keywords: ['bonus', 'consistent', 'streak', 'weekly bonus'],
    answer:
      'Train consistently (Mon–Sun week) to earn a weekly bonus: 3–4 qualifying workouts = +10 pts, 5–6 = +25 pts, 7+ = +50 pts. Only sessions that scored more than 0 points count. The bonus is awarded automatically at the start of the following week.',
  },
  {
    keywords: ['premium', 'pay', 'subscription'],
    answer:
      'Premium unlocks extra app features (such as chat). Scoring rules are the same for free and premium athletes.',
  },
  {
    keywords: ['support', 'help', 'contact', 'bug', 'human'],
    answer: 'For account or technical issues, use Settings → Contact support. For full written rules, open How it works.',
  },
];

export const SCORING_ASSISTANT_SUGGESTIONS = [
  'How does Engine scoring work?',
  'Why was my workout not counted?',
  'What is the daily cap?',
  'How do seasons work?',
] as const;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function scoreEntry(entry: AssistantEntry, tokens: string[], rawQuery: string): number {
  let score = 0;
  const q = rawQuery.toLowerCase();
  for (const keyword of entry.keywords) {
    const kw = keyword.toLowerCase();
    if (q.includes(kw)) score += 3;
    for (const token of tokens) {
      if (token === kw || token.includes(kw) || kw.includes(token)) score += 1;
    }
  }
  return score;
}

export function getScoringAssistantReply(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    return 'Type a question above, or tap a suggestion. I can help with scoring, leagues, seasons, and fair play.';
  }

  const tokens = tokenize(trimmed);
  let best: AssistantEntry | null = null;
  let bestScore = 0;

  for (const entry of ENTRIES) {
    const s = scoreEntry(entry, tokens, trimmed);
    if (s > bestScore) {
      bestScore = s;
      best = entry;
    }
  }

  if (!best || bestScore < 2) {
    return 'I do not have a specific answer for that. Open How it works for the full scoring guide, or contact support if you need help with your account.';
  }

  return best.answer;
}
