/** Demo athletes with real profile photos (Supabase storage). Used in welcome + preview UI. */
export type MockAthlete = {
  username: string;
  displayName: string;
  avatarUrl: string;
};

export const MOCK_ATHLETES = {
  alexMontgomery: {
    username: 'alexmontgomery',
    displayName: 'Alex Montgomery',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/51066d6b-143d-4148-ac9c-3b0789598216/avatar.jpg?v=1781184597',
  },
  ameliaLong: {
    username: 'amelialong',
    displayName: 'Amelia Long',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/46bd7b73-e952-4b82-aabd-9754efc1601b/avatar.jpg?v=1781104866',
  },
  benjaminThorne: {
    username: 'benjamiNthorne',
    displayName: 'Benjamin Thorne',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/b351e8de-5acb-4b73-b67d-50b05a769142/avatar.jpg?v=1781184612',
  },
  chloeBarrett: {
    username: 'chloebarrett',
    displayName: 'Chloe Barrett',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/d34b0c9c-5165-43d3-be6c-ca85ea5398fb/avatar.jpg?v=1781328294',
  },
  connorOShea: {
    username: 'connoroshea',
    displayName: "Connor O'Shea",
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/89a66521-9803-4c1a-8eb5-78cda96bcb78/avatar.jpg?v=1781328417',
  },
  finnHarper: {
    username: 'finnharper',
    displayName: 'Finn Harper',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/2f20d92e-73f0-4247-81e3-bdbc358169f8/avatar.jpg?v=1781518073',
  },
  hannahBright: {
    username: 'hannahbright',
    displayName: 'Hannah Bright',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/f2c28fa4-220b-40cf-99d5-fe4350d874b0/avatar.jpg?v=1781184642',
  },
  islaDavies: {
    username: 'isladavies',
    displayName: 'Isla Davies',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/6d64aca3-ef36-43db-a972-dfeb39575592/avatar.jpg?v=1781518489',
  },
  jessicaHolland: {
    username: 'jessicaholland',
    displayName: 'Jessica Holland',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/56dd4a18-3284-453f-a5f8-6d0f5349308d/avatar.jpg?v=1781184652',
  },
  lauraMcAllister: {
    username: 'lauramcallister',
    displayName: 'Laura McAllister',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/f163a342-995e-40e3-a6f5-0a73a4a2dad2/avatar.jpg?v=1781184664',
  },
  matthewVance: {
    username: 'matthewvance',
    displayName: 'Matthew Vance',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/c4256d75-ad7a-4be0-9ee1-c4eeee346843/avatar.jpg?v=1781516973',
  },
  natalieKirk: {
    username: 'nataliekirk',
    displayName: 'Natalie Kirk',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/d75e9738-9bd4-4403-9a4b-f616a251606e/avatar.jpg?v=1781184684',
  },
  priyaPatel: {
    username: 'priyapatel',
    displayName: 'Priya Patel',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/3ee3a850-9346-4d94-ba9b-01b46a2f2203/avatar.jpg?v=1781105080',
  },
  rubyKane: {
    username: 'rubykane',
    displayName: 'Ruby Kane',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/fd90c0a9-5319-4616-82da-ca22528a66f1/avatar.jpg?v=1781518627',
  },
  ryanFletcher: {
    username: 'ryanfletcher',
    displayName: 'Ryan Fletcher',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/5396ee3a-bddc-4fff-a511-68466e9c1304/avatar.jpg?v=1781184696',
  },
  samuelWright: {
    username: 'samuelwright',
    displayName: 'Samuel Wright',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/e947bc2b-7fd3-411f-9526-f7fe904e22ac/avatar.jpg?v=1781518577',
  },
  shaunSmith: {
    username: 'shaunsmith',
    displayName: 'Shaun Smith',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/5173cdff-d349-4ce0-92ba-a3e82d8b21b9/avatar.jpg',
  },
  sophieChen: {
    username: 'sophiechen',
    displayName: 'Sophie Chen',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/b352667e-fb93-4893-bbb0-d19676d894a5/avatar.jpg?v=20260610',
  },
  tomAshbury: {
    username: 'tomashbury',
    displayName: 'Tom Ashbury',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/0152972d-21eb-4233-8e25-0f622b16b2ca/avatar.jpg?v=20260610',
  },
  zoeWatkins: {
    username: 'zoewatkins',
    displayName: 'Zoe Watkins',
    avatarUrl:
      'https://vuhnmlixouvghvyjwrdv.supabase.co/storage/v1/object/public/avatars/3f072e98-c702-4202-8e88-410aeae3b24c/avatar.jpg?v=1781328362',
  },
} as const satisfies Record<string, MockAthlete>;

export type WelcomeLeaderboardRow = {
  rank: number;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  score: string;
  isYou?: boolean;
  delta?: number;
};

function rowFromAthlete(
  rank: number,
  athlete: MockAthlete,
  score: string,
  extra?: Pick<WelcomeLeaderboardRow, 'isYou' | 'delta'>,
): WelcomeLeaderboardRow {
  return {
    rank,
    username: athlete.username,
    displayName: athlete.displayName,
    avatarUrl: athlete.avatarUrl,
    score,
    ...extra,
  };
}

/** Engine League welcome slide — "You" at #4 with ▲3. */
export const WELCOME_ENGINE_LEADERBOARD_ROWS: WelcomeLeaderboardRow[] = [
  rowFromAthlete(1, MOCK_ATHLETES.samuelWright, '14,220'),
  rowFromAthlete(2, MOCK_ATHLETES.chloeBarrett, '13,890'),
  rowFromAthlete(3, MOCK_ATHLETES.matthewVance, '13,401'),
  {
    rank: 4,
    username: 'you',
    displayName: 'You',
    avatarUrl: null,
    score: '12,940',
    isYou: true,
    delta: 3,
  },
  rowFromAthlete(5, MOCK_ATHLETES.ameliaLong, '12,512'),
];

/** Default welcome carousel leaderboard — Run League, "You" at #4 with ▲3. */
export const WELCOME_LEADERBOARD_ROWS: WelcomeLeaderboardRow[] = [
  rowFromAthlete(1, MOCK_ATHLETES.finnHarper, '12,450'),
  rowFromAthlete(2, MOCK_ATHLETES.islaDavies, '11,892'),
  rowFromAthlete(3, MOCK_ATHLETES.matthewVance, '11,201'),
  {
    rank: 4,
    username: 'you',
    displayName: 'You',
    avatarUrl: null,
    score: '10,840',
    isYou: true,
    delta: 3,
  },
  rowFromAthlete(5, MOCK_ATHLETES.rubyKane, '10,112'),
];

export const WELCOME_LEADERBOARD_CLIMB_ROWS: WelcomeLeaderboardRow[] = [
  rowFromAthlete(1, MOCK_ATHLETES.finnHarper, '12,450'),
  rowFromAthlete(2, MOCK_ATHLETES.islaDavies, '11,892'),
  {
    rank: 3,
    username: 'you',
    displayName: 'You',
    avatarUrl: null,
    score: '11,340',
    isYou: true,
    delta: 5,
  },
  rowFromAthlete(4, MOCK_ATHLETES.samuelWright, '11,201'),
  rowFromAthlete(5, MOCK_ATHLETES.chloeBarrett, '10,112'),
];

export const WELCOME_LEADERBOARD_COMPETE_ROWS: WelcomeLeaderboardRow[] = [
  rowFromAthlete(1, MOCK_ATHLETES.finnHarper, '12,450'),
  {
    rank: 2,
    username: 'you',
    displayName: 'You',
    avatarUrl: null,
    score: '12,401',
    isYou: true,
    delta: 2,
  },
  rowFromAthlete(3, MOCK_ATHLETES.samuelWright, '11,892'),
  rowFromAthlete(4, MOCK_ATHLETES.connorOShea, '11,201'),
  rowFromAthlete(5, MOCK_ATHLETES.ameliaLong, '10,980'),
];

/** @deprecated use MOCK_ATHLETES */
export const mockAthletes = Object.values(MOCK_ATHLETES);
