export type LeagueFilter = 'all' | 'engine' | 'run';

// Frontend does not score workouts; this is a UI helper only.
export function leagueLabel(filter: LeagueFilter): string {
  if (filter === 'engine') return 'Engine League';
  if (filter === 'run') return 'Run League';
  return 'All Leagues';
}
