/** Shared helpers for competition / season lifecycle notify-* edge functions. */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendOneSignalPush } from './onesignalSend.ts';

export type AthleteDivisionRow = {
  id: string;
  engine_division: string | null;
  run_division: string | null;
};

export function leagueLabel(league: string): string {
  return league === 'run' ? 'Run' : 'Engine';
}

export function formatDivisionsLine(engine: string | null, run: string | null): string {
  const e = engine?.trim() || 'Open';
  const r = run?.trim() || 'Open';
  return `Engine: ${e} · Run: ${r}`;
}

export async function loadAthletesWithDivisions(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<AthleteDivisionRow[]> {
  const { data: athletes, error: aErr } = await supabase.from('athletes').select('id');
  if (aErr) throw new Error(aErr.message);

  const { data: divisions, error: dErr } = await supabase
    .from('athlete_divisions')
    .select('athlete_id, league, division')
    .eq('season_id', seasonId);
  if (dErr) throw new Error(dErr.message);

  const byAthlete = new Map<string, { engine: string | null; run: string | null }>();
  for (const row of divisions ?? []) {
    const id = String((row as { athlete_id: string }).athlete_id);
    const cur = byAthlete.get(id) ?? { engine: null, run: null };
    const league = String((row as { league: string }).league);
    const division = String((row as { division: string }).division);
    if (league === 'run') cur.run = division;
    else cur.engine = division;
    byAthlete.set(id, cur);
  }

  return (athletes ?? []).map((a) => {
    const id = String((a as { id: string }).id);
    const d = byAthlete.get(id);
    return {
      id,
      engine_division: d?.engine ?? 'Open',
      run_division: d?.run ?? 'Open',
    };
  });
}

export async function loadSeasonName(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('seasons')
    .select('name')
    .eq('id', seasonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.name as string | undefined)?.trim() || 'the next season';
}

export async function fanOutSeasonPush(opts: {
  supabase: SupabaseClient;
  seasonId: string;
  title: string;
  messageFor: (athlete: AthleteDivisionRow, seasonName: string) => string;
  path: string;
  logTag: string;
}): Promise<{ sent: number; skipped: number; season_name: string }> {
  const seasonName = await loadSeasonName(opts.supabase, opts.seasonId);
  const athletes = await loadAthletesWithDivisions(opts.supabase, opts.seasonId);

  let sent = 0;
  let skipped = 0;

  for (const athlete of athletes) {
    const osResult = await sendOneSignalPush({
      appId: '',
      externalUserIds: [athlete.id],
      title: opts.title,
      message: opts.messageFor(athlete, seasonName),
      path: opts.path,
    });
    if (osResult.httpOk && !osResult.errors) {
      sent += 1;
    } else {
      skipped += 1;
      console.warn(`[${opts.logTag}] skip`, {
        athlete_id: athlete.id,
        status: osResult.status,
        errors: osResult.errors,
      });
    }
  }

  console.log(`[${opts.logTag}] summary`, { sent, skipped, season_name: seasonName });
  return { sent, skipped, season_name: seasonName };
}
