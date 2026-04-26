import { useEffect, useState } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { supabase } from '../services/supabase';
import type { LeagueFilter } from '../lib/scoring';

interface Season {
  id: string;
  name: string;
  ends_at: string;
}

export default function Leaderboard() {
  const [filter, setFilter] = useState<LeagueFilter>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const { entries, loading, error } = useLeaderboard(filter);

  useEffect(() => {
    const hydrate = async () => {
      const [{ data: auth }, { data: activeSeason }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('seasons').select('id,name,ends_at').eq('is_active', true).maybeSingle(),
      ]);
      setCurrentUserId(auth.user?.id ?? null);
      setSeason((activeSeason as Season | null) ?? null);
    };

    void hydrate();
  }, []);

  const daysRemaining = season
    ? Math.max(0, Math.ceil((new Date(season.ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        <p className="text-sm text-slate-300">
          {season ? `${season.name} • ${daysRemaining} day(s) remaining` : 'No active season'}
        </p>
      </header>

      <div className="flex gap-2">
        {(['all', 'engine', 'run'] as LeagueFilter[]).map((value) => (
          <button
            key={value}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filter === value ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-slate-200'
            }`}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All' : value === 'engine' ? 'Engine League' : 'Run League'}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-300">Loading leaderboard...</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`grid grid-cols-[60px_1fr_120px] items-center gap-3 rounded-lg border p-3 ${
              entry.id === currentUserId
                ? 'border-cyan-400 bg-cyan-500/10'
                : 'border-slate-700 bg-slate-900'
            }`}
          >
            <span className="text-sm font-semibold text-slate-300">#{entry.rank}</span>
            <span className="text-sm text-slate-100">{entry.display_name}</span>
            <span className="text-right text-sm font-semibold text-slate-200">
              {Number(entry.total_score).toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
