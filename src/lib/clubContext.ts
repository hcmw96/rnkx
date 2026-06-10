import { supabase } from '@/services/supabase';

export type ClubSummary = {
  id: string;
  name: string;
  image_url: string | null;
  league_type: 'engine' | 'run' | string;
  gender?: string | null;
};

export async function fetchClubByConversationId(
  conversationId: string,
): Promise<{ club: ClubSummary | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_club_by_conversation', {
    p_conversation_id: conversationId,
  });

  if (error) {
    return { club: null, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClubSummary | null | undefined;
  if (!row?.id) {
    return { club: null, error: null };
  }

  return {
    club: {
      id: String(row.id),
      name: String(row.name ?? '').trim() || 'Club',
      image_url: (row.image_url as string | null) ?? null,
      league_type: String(row.league_type ?? 'engine'),
    },
    error: null,
  };
}

export type PrivateLeagueDetail = ClubSummary & {
  created_by: string;
  conversation_id: string | null;
  invite_code: string | null;
  is_public: boolean | null;
  gender: string | null;
};

export async function fetchPrivateLeague(
  leagueId: string,
): Promise<{ league: PrivateLeagueDetail | null; error: string | null }> {
  const { data, error } = await supabase.rpc('get_private_league', {
    p_league_id: leagueId,
  });

  if (error) {
    return { league: null, error: error.message };
  }

  const row = (Array.isArray(data) ? data[0] : data) as PrivateLeagueDetail | null | undefined;
  if (!row?.id) {
    return { league: null, error: null };
  }

  return {
    league: {
      id: String(row.id),
      name: String(row.name ?? '').trim() || 'Club',
      image_url: (row.image_url as string | null) ?? null,
      league_type: String(row.league_type ?? 'engine'),
      created_by: String(row.created_by),
      conversation_id: (row.conversation_id as string | null) ?? null,
      invite_code: (row.invite_code as string | null) ?? null,
      is_public: row.is_public ?? false,
      gender: (row.gender as string | null) ?? 'mixed',
    },
    error: null,
  };
}
