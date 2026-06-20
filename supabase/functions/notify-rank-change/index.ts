import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { resolveAthleteExternalId } from '../_shared/athleteLookup.ts';
import { authenticateNotifyRequest, createServiceRoleClient, notifyCorsHeaders, notifyJson } from '../_shared/pushAuth.ts';
import { getOneSignalCredentials, outcomeFromOneSignal, sanitizePushText, sendOneSignalPush } from '../_shared/onesignalSend.ts';

const UNRANKED = 999999;

function normalizeCategory(leagueType: string): string {
  const s = leagueType.trim().toLowerCase();
  return s === 'run' ? 'run' : 'engine';
}

function parseRank(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n >= UNRANKED) return null;
  return n;
}

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

function isAhead(rankA: number | null, rankB: number | null): boolean | null {
  if (rankA == null || rankB == null) return null;
  return rankA < rankB;
}

function friendDisplayName(row: { display_name?: string | null; username?: string | null } | null): string {
  const d = row?.display_name != null ? String(row.display_name).trim() : '';
  if (d) return sanitizePushText(d, 60);
  const u = row?.username != null ? String(row.username).trim() : '';
  if (u) return sanitizePushText(u, 60);
  return 'A friend';
}

async function fetchAcceptedFriendIds(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  athleteId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('athlete_id, friend_id')
    .eq('status', 'accepted')
    .or(`athlete_id.eq.${athleteId},friend_id.eq.${athleteId}`);

  if (error) {
    console.error('[notify-rank-change] friendships', error);
    return [];
  }

  return [
    ...new Set(
      (data ?? []).map((row) =>
        String(row.athlete_id) === athleteId ? String(row.friend_id) : String(row.athlete_id)
      ),
    ),
  ].filter(Boolean);
}

async function fetchRank(
  supabase: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  athleteId: string,
  seasonId: string,
  category: string,
): Promise<number | null> {
  const { data, error } = await supabase.rpc('category_leaderboard_rank', {
    p_athlete_id: athleteId,
    p_season_id: seasonId,
    p_category: category,
  });
  if (error) {
    console.error('[notify-rank-change] rank lookup', { athleteId, category, error });
    return null;
  }
  return parseRank(data);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: notifyCorsHeaders });
  }
  if (req.method !== 'POST') {
    return notifyJson({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = await authenticateNotifyRequest(req);
    if (!auth) {
      return notifyJson({ success: false, error: 'Unauthorized' }, 401);
    }

    const supabase = createServiceRoleClient();
    if (!supabase) {
      console.error('[notify-rank-change] missing service role key');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }
    if (!getOneSignalCredentials()) {
      console.error('[notify-rank-change] missing OneSignal credentials');
      return notifyJson({ success: false, error: 'Server misconfiguration' }, 500);
    }

    let body: {
      athlete_id?: string;
      league_type?: string;
      old_rank?: number;
      new_rank?: number;
    };
    try {
      body = await req.json();
    } catch {
      return notifyJson({ error: 'Invalid JSON' }, 400);
    }

    const scorerId = typeof body.athlete_id === 'string' ? body.athlete_id.trim() : '';
    const category = normalizeCategory(typeof body.league_type === 'string' ? body.league_type : 'engine');

    if (!scorerId) {
      return notifyJson({ error: 'athlete_id is required' }, 400);
    }

    const scorerExternalId = await resolveAthleteExternalId(supabase, scorerId);
    if (!scorerExternalId) {
      return notifyJson({ success: false, error: 'Athlete not found' }, 404);
    }

    const { data: season } = await supabase.from('seasons').select('id').eq('is_active', true).maybeSingle();
    if (!season?.id) {
      return notifyJson({ success: true, skipped: true, reason: 'no active season' });
    }

    const friendIds = await fetchAcceptedFriendIds(supabase, scorerExternalId);
    if (friendIds.length === 0) {
      return notifyJson({ success: true, skipped: true, reason: 'no friends' });
    }

    const scorerRank = await fetchRank(supabase, scorerExternalId, season.id, category);
    const pushes: Array<{ recipientId: string; title: string; message: string }> = [];

    for (const friendId of friendIds) {
      const friendRank = await fetchRank(supabase, friendId, season.id, category);
      if (scorerRank == null || friendRank == null) continue;

      const [lowId, highId] = canonicalPair(scorerExternalId, friendId);
      const lowRank = lowId === scorerExternalId ? scorerRank : friendRank;
      const highRank = highId === scorerExternalId ? scorerRank : friendRank;

      const { data: snapshot, error: snapErr } = await supabase
        .from('athlete_friend_rank_snapshots')
        .select('low_rank, high_rank')
        .eq('athlete_low_id', lowId)
        .eq('athlete_high_id', highId)
        .eq('season_id', season.id)
        .eq('category', category)
        .maybeSingle();

      if (snapErr) {
        console.error('[notify-rank-change] snapshot read', snapErr);
        continue;
      }

      const prevScorerAhead = snapshot
        ? isAhead(
            scorerExternalId === lowId ? parseRank(snapshot.low_rank) : parseRank(snapshot.high_rank),
            scorerExternalId === lowId ? parseRank(snapshot.high_rank) : parseRank(snapshot.low_rank),
          )
        : null;
      const currScorerAhead = isAhead(scorerRank, friendRank);
      const prevFriendAhead = prevScorerAhead == null ? null : !prevScorerAhead;

      if (prevScorerAhead != null && currScorerAhead != null && prevScorerAhead !== currScorerAhead) {
        const { data: friendRow } = await supabase
          .from('athletes')
          .select('display_name, username')
          .eq('id', friendId)
          .maybeSingle();
        const friendName = friendDisplayName(friendRow);

        const { data: scorerRow } = await supabase
          .from('athletes')
          .select('display_name, username')
          .eq('id', scorerExternalId)
          .maybeSingle();
        const scorerName = friendDisplayName(scorerRow);

        if (prevFriendAhead && currScorerAhead) {
          pushes.push({
            recipientId: friendId,
            title: "You've been overtaken 😤",
            message: `${scorerName} just moved ahead of you in the leaderboard.`,
          });
        } else if (!prevScorerAhead && currScorerAhead) {
          pushes.push({
            recipientId: scorerExternalId,
            title: 'Rival passed 🔥',
            message: `You just overtook ${friendName} in the leaderboard.`,
          });
        }
      }

      await supabase.from('athlete_friend_rank_snapshots').upsert(
        {
          athlete_low_id: lowId,
          athlete_high_id: highId,
          season_id: season.id,
          category,
          low_rank: lowRank,
          high_rank: highRank,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'athlete_low_id,athlete_high_id,season_id,category' },
      );
    }

    if (pushes.length === 0) {
      return notifyJson({ success: true, skipped: true, reason: 'no friend order flips' });
    }

    const outcomes: Record<string, unknown>[] = [];
    for (const push of pushes) {
      const externalUserId = await resolveAthleteExternalId(supabase, push.recipientId);
      if (!externalUserId) continue;

      const osResult = await sendOneSignalPush({
        appId: '',
        externalUserIds: [externalUserId],
        title: push.title,
        message: push.message,
        path: '/app/leaderboard',
      });

      const { httpStatus, payload } = outcomeFromOneSignal('notify-rank-change', osResult, {
        recipientId: push.recipientId,
      });
      outcomes.push({ recipientId: push.recipientId, httpStatus, ...payload });
    }

    const anyFail = outcomes.some((o) => o.httpStatus === 502);
    if (anyFail) {
      return notifyJson({ success: false, outcomes }, 502);
    }

    return notifyJson({ success: true, sent: outcomes.length, outcomes });
  } catch (e) {
    console.error('[notify-rank-change]', e);
    return notifyJson({ success: false, error: 'Internal error' }, 500);
  }
});
