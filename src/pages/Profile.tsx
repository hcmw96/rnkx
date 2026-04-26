import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAthleteProfile } from '../hooks/useAthleteProfile';
import { fetchRecentWorkouts, requestHealthKitPermissions } from '../services/despia';
import { supabase } from '../services/supabase';

interface ProfileProps {
  userId: string;
}

export default function Profile({ userId }: ProfileProps) {
  const navigate = useNavigate();
  const { profile, rank, workouts, loading, error, refresh } = useAthleteProfile(userId);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);

    const granted = await requestHealthKitPermissions();
    if (!granted) {
      setSyncMessage('Health permissions were not granted.');
      setSyncing(false);
      return;
    }

    const syncData = await fetchRecentWorkouts();
    if (syncData.error) {
      setSyncMessage(syncData.error);
      setSyncing(false);
      return;
    }

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    if (!token) {
      setSyncMessage('Missing auth session.');
      setSyncing(false);
      return;
    }

    const { data, error: invokeError } = await supabase.functions.invoke('sync-activities', {
      body: { workouts: syncData.workouts },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (invokeError) {
      setSyncMessage(invokeError.message);
    } else {
      setSyncMessage(`Synced ${data?.processed ?? 0} workouts`);
      await refresh();
    }

    setSyncing(false);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-sm text-slate-300">Athlete dashboard</p>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            navigate('/auth');
          }}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm text-slate-100"
        >
          Sign out
        </button>
      </header>

      {loading && <p className="text-sm text-slate-300">Loading profile...</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}

      {profile && (
        <section className="grid gap-4 rounded-xl border border-slate-700 bg-slate-900 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Name</p>
            <p className="text-sm text-slate-100">{profile.display_name}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Rank</p>
            <p className="text-sm text-slate-100">{rank ? `#${rank}` : '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Total score</p>
            <p className="text-sm text-slate-100">{Number(profile.total_score).toFixed(1)}</p>
          </div>
          <div className="sm:col-span-3">
            <p className="text-xs uppercase tracking-wide text-slate-400">Last synced</p>
            <p className="text-sm text-slate-100">
              {profile.last_synced ? new Date(profile.last_synced).toLocaleString() : 'Never'}
            </p>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <button
          onClick={() => void handleSync()}
          disabled={syncing}
          className="rounded-md bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"
        >
          {syncing ? 'Syncing...' : 'Sync Workouts'}
        </button>
        {syncMessage && <p className="text-sm text-slate-200">{syncMessage}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-white">Recent workouts</h2>
        <div className="space-y-2">
          {workouts.map((workout) => (
            <article key={workout.id} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-100">
                  {workout.activity_type ?? 'Unknown activity'}
                </h3>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    workout.status === 'scored'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : workout.status === 'rejected'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-slate-500/20 text-slate-300'
                  }`}
                >
                  {workout.status}
                  {workout.status === 'rejected' && workout.reject_reason
                    ? ` (${workout.reject_reason})`
                    : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400">{new Date(workout.started_at).toLocaleString()}</p>
              <div className="mt-2 flex gap-4 text-sm text-slate-300">
                <span>Engine: {Number(workout.engine_score).toFixed(1)}</span>
                <span>Run: {Number(workout.run_score).toFixed(1)}</span>
              </div>
            </article>
          ))}
          {!workouts.length && <p className="text-sm text-slate-400">No workouts yet.</p>}
        </div>
      </section>
    </main>
  );
}
