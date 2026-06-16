import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import RNKXLogo from '@/components/RNKXLogo';
import { Button } from '@/components/ui/button';
import { PremiumGate } from '@/components/PremiumGate';
import { JoinClubPreview } from '@/components/premium/PreviewMocks';
import { invokePushNotify } from '@/lib/pushNotify';
import { supabase } from '@/services/supabase';
import { toast } from 'sonner';
import { PENDING_LEAGUE_INVITE_SESSION_KEY } from '@/lib/shareLeagueInvite';

type LeaguePreview = {
  id: string;
  name: string;
  member_count: number;
  conversation_id: string | null;
};

export default function JoinLeaguePage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [athleteId, setAthleteId] = useState<string | undefined>();
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  const [preview, setPreview] = useState<LeaguePreview | null>(null);
  const [leagueNotFound, setLeagueNotFound] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [joining, setJoining] = useState(false);

  const inviteCode = (code ?? '').trim();

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!inviteCode) {
        if (!cancelled) setSessionChecked(true);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        try {
          sessionStorage.setItem(PENDING_LEAGUE_INVITE_SESSION_KEY, inviteCode);
        } catch {
          /* ignore */
        }
        setLoggedIn(false);
        setAthleteId(undefined);
        setAuthUserId(undefined);
      } else {
        setLoggedIn(true);
        const uid = user.id;
        setAuthUserId(uid);
        const [byUserId, byId] = await Promise.all([
          supabase.from('athletes').select('id').eq('user_id', uid).not('username', 'is', null).maybeSingle(),
          supabase.from('athletes').select('id').eq('id', uid).not('username', 'is', null).maybeSingle(),
        ]);
        const aid = (byUserId.data?.id ?? byId.data?.id) as string | undefined;
        if (!cancelled) setAthleteId(aid);
      }

      if (!cancelled) setSessionChecked(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const loadPreview = useCallback(async () => {
    if (!inviteCode || !loggedIn) return;
    setLookupLoading(true);
    setLeagueNotFound(false);
    setPreview(null);

    const { data, error } = await supabase.rpc('get_private_league_for_join', {
      p_invite_code: inviteCode,
    });

    if (error) {
      console.warn('[JoinLeaguePage] preview rpc', error);
      toast.error(error.message);
      setLeagueNotFound(true);
      setLookupLoading(false);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== 'object' || !('id' in row)) {
      setLeagueNotFound(true);
      setLookupLoading(false);
      return;
    }

    const r = row as {
      id: string;
      name: string;
      member_count: number | string;
      conversation_id: string | null;
    };

    setPreview({
      id: r.id,
      name: r.name,
      member_count: Number(r.member_count ?? 0),
      conversation_id: r.conversation_id ?? null,
    });
    setLookupLoading(false);
  }, [inviteCode, loggedIn]);

  useEffect(() => {
    if (!sessionChecked || !loggedIn) return;
    void loadPreview();
  }, [sessionChecked, loggedIn, loadPreview]);

  const handleJoin = async () => {
    if (!preview || !athleteId) return;
    setJoining(true);
    try {
      const { error: memErr } = await supabase.rpc('add_member_to_club', {
        p_league_id: preview.id,
        p_athlete_id: athleteId,
        p_invite_code: inviteCode,
      });

      if (memErr) {
        toast.error(memErr.message);
        return;
      }

      const { data: leagueMeta } = await supabase
        .from('private_leagues')
        .select('created_by')
        .eq('id', preview.id)
        .maybeSingle();

      const creatorId = (leagueMeta?.created_by as string | undefined) ?? null;
      if (creatorId && creatorId !== athleteId) {
        invokePushNotify('send-notification', {
          athlete_id: creatorId,
          title: 'Club invite accepted',
          message: `Someone accepted your invite to ${preview.name}.`,
          path: `/app/leagues/${preview.id}`,
        });
      }

      try {
        sessionStorage.removeItem(PENDING_LEAGUE_INVITE_SESSION_KEY);
      } catch {
        /* ignore */
      }

      toast.success(`Joined ${preview.name}`);
      navigate(`/app/leagues/${preview.id}`, { replace: true });
    } finally {
      setJoining(false);
    }
  };

  if (!sessionChecked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  if (!inviteCode) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md space-y-4 text-center">
          <RNKXLogo size="sm" />
          <p className="text-muted-foreground">Invalid or expired invite link.</p>
          <Button asChild variant="outline">
            <Link to="/auth">Go home</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!loggedIn) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md space-y-6 text-center">
          <RNKXLogo size="sm" />
          <p className="text-muted-foreground">You need an account to join this club.</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button asChild className="font-semibold">
              <Link to="/auth">Sign Up</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/auth">Log In</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!athleteId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md space-y-4 text-center">
          <RNKXLogo size="sm" />
          <p className="text-muted-foreground">Finish setting up your profile before joining a club.</p>
          <Button asChild>
            <Link to="/onboarding">Complete profile</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (lookupLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Loading club" />
      </div>
    );
  }

  if (leagueNotFound || !preview) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md space-y-4 text-center">
          <RNKXLogo size="sm" />
          <p className="text-muted-foreground">Invalid or expired invite link.</p>
          <Button asChild variant="outline">
            <Link to="/app/social/leagues">My clubs</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="type-page-title">Join club</h1>
        <div className="space-y-1">
          <p className="type-card-title">{preview.name}</p>
          <p className="text-sm text-muted-foreground">
            {preview.member_count} member{preview.member_count !== 1 ? 's' : ''}
          </p>
        </div>
        <PremiumGate
          athleteId={athleteId}
          userId={authUserId}
          compact
          description="Join private clubs and compete with friends on club leaderboards."
          previewContent={<JoinClubPreview />}
        >
          <Button type="button" className="w-full font-semibold" disabled={joining} onClick={() => void handleJoin()}>
            {joining ? 'Joining…' : 'Join Club'}
          </Button>
        </PremiumGate>
      </div>
    </div>
  );
}
