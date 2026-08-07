import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatScore } from '@/lib/formatScore';
import { supabase } from '@/services/supabase';

type SeasonRow = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  is_placeholder?: boolean;
};

type DivisionRule = {
  division: string;
  promote_percent: number | null;
  promote_min_count: number | null;
  relegate_percent: number | null;
  promotes_to: string | null;
  relegates_to: string | null;
};

type ConsistencyTier = {
  league: string;
  min_workouts: number;
  bonus_points: number;
};

type PromoSettings = {
  min_workouts_for_promotion: number;
};

type AthleteJoin = { display_name: string | null; username: string | null };

/**
 * Supabase embedded `athletes(...)` can arrive as a single object or an array
 * depending on relationship inference. Normalize to one row for the UI.
 */
function firstAthleteJoin(
  athletes: AthleteJoin | AthleteJoin[] | null | undefined,
): AthleteJoin | null {
  if (athletes == null) return null;
  return Array.isArray(athletes) ? (athletes[0] ?? null) : athletes;
}

type HistoryRow = {
  id: string;
  athlete_id: string;
  season_id: string;
  league: string;
  from_division: string;
  to_division: string;
  result: string;
  final_rank: number;
  final_points: number;
  created_at: string;
  athletes?: AthleteJoin | null;
};

type SnapshotRow = {
  id: string;
  athlete_id: string;
  season_id: string;
  league: string;
  division: string;
  rank: number;
  points: number;
  created_at: string;
  athletes?: AthleteJoin | null;
};

function mapHistoryRow(row: {
  id: string;
  athlete_id: string;
  season_id: string;
  league: string;
  from_division: string;
  to_division: string;
  result: string;
  final_rank: number;
  final_points: number;
  created_at: string;
  athletes: AthleteJoin | AthleteJoin[] | null;
}): HistoryRow {
  return {
    id: row.id,
    athlete_id: row.athlete_id,
    season_id: row.season_id,
    league: row.league,
    from_division: row.from_division,
    to_division: row.to_division,
    result: row.result,
    final_rank: row.final_rank,
    final_points: row.final_points,
    created_at: row.created_at,
    athletes: firstAthleteJoin(row.athletes),
  };
}

function mapSnapshotRow(row: {
  id: string;
  athlete_id: string;
  season_id: string;
  league: string;
  division: string;
  rank: number;
  points: number;
  created_at: string;
  athletes: AthleteJoin | AthleteJoin[] | null;
}): SnapshotRow {
  return {
    id: row.id,
    athlete_id: row.athlete_id,
    season_id: row.season_id,
    league: row.league,
    division: row.division,
    rank: row.rank,
    points: row.points,
    created_at: row.created_at,
    athletes: firstAthleteJoin(row.athletes),
  };
}

type DryRunPromotion = {
  display_name?: string;
  league: string;
  from_division: string;
  to_division: string;
  result: string;
  final_rank: number;
  final_points: number;
  workout_count?: number;
  eligible?: boolean;
};

/** Format timestamptz as Europe/London wall clock for datetime-local input. */
export function toLondonDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** datetime-local value → London wall string for RPC (`YYYY-MM-DD HH:MM:SS`). */
export function datetimeLocalToLondonSql(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const normalized = trimmed.includes('T') ? trimmed.replace('T', ' ') : trimmed;
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

type PushPreviewItem = {
  kind?: string;
  suppressed?: boolean;
  reason?: string;
  fires_from?: string;
  fires_until?: string;
  window_opens_at?: string;
};

function formatLondonInstant(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

function athleteLabel(row: {
  athletes?: AthleteJoin | null;
  athlete_id: string;
  display_name?: string;
}): string {
  return (
    row.display_name ||
    row.athletes?.username ||
    row.athletes?.display_name ||
    row.athlete_id.slice(0, 8)
  );
}

type Props = {
  enabled: boolean;
};

export function AdminCompetitionPanel({ enabled }: Props) {
  const [tab, setTab] = useState<'seasons' | 'rules' | 'finalize' | 'history'>('seasons');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [rules, setRules] = useState<DivisionRule[]>([]);
  const [promoSettings, setPromoSettings] = useState<PromoSettings | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formActive, setFormActive] = useState(false);
  const [savingSeason, setSavingSeason] = useState(false);
  const [pushPreview, setPushPreview] = useState<{
    warnings: PushPreviewItem[];
    fires: PushPreviewItem[];
    season_push_enabled?: boolean;
  } | null>(null);

  const [finalizeSeasonId, setFinalizeSeasonId] = useState<string>('');
  const [dryRun, setDryRun] = useState<{
    summary?: { total?: number; promoted?: number; relegated?: number; held?: number };
    promotions?: DryRunPromotion[];
    next_season_id?: string | null;
    status?: string;
  } | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);

  const [historySeasonId, setHistorySeasonId] = useState<string>('');
  const [historyLeague, setHistoryLeague] = useState<'all' | 'engine' | 'run'>('all');
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<SnapshotRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [minWorkoutsDraft, setMinWorkoutsDraft] = useState('3');
  const [ruleDrafts, setRuleDrafts] = useState<Record<string, DivisionRule>>({});
  const [tierDrafts, setTierDrafts] = useState<ConsistencyTier[]>([]);
  const [newTierLeague, setNewTierLeague] = useState<'engine' | 'run'>('engine');
  const [newTierMin, setNewTierMin] = useState('3');
  const [newTierPts, setNewTierPts] = useState('10');

  const loadMeta = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_list_competition_meta');
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    const payload = data as {
      seasons?: SeasonRow[];
      division_rules?: DivisionRule[];
      promotion_settings?: PromoSettings | null;
      consistency_bonus_tiers?: ConsistencyTier[];
    };
    const seasonList = payload.seasons ?? [];
    setSeasons(seasonList);
    setRules(payload.division_rules ?? []);
    setPromoSettings(payload.promotion_settings ?? null);
    setMinWorkoutsDraft(String(payload.promotion_settings?.min_workouts_for_promotion ?? 3));
    const drafts: Record<string, DivisionRule> = {};
    for (const r of payload.division_rules ?? []) drafts[r.division] = { ...r };
    setRuleDrafts(drafts);
    setTierDrafts([...(payload.consistency_bonus_tiers ?? [])]);

    if (!finalizeSeasonId) {
      const active = seasonList.find((s) => s.is_active);
      if (active) setFinalizeSeasonId(active.id);
    }
    if (!historySeasonId && seasonList[0]) setHistorySeasonId(seasonList[0].id);
  }, [enabled, finalizeSeasonId, historySeasonId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const placeholderSeasons = useMemo(
    () => seasons.filter((s) => s.is_placeholder || /\[PLACEHOLDER\]/i.test(s.name)),
    [seasons],
  );

  function resetSeasonForm() {
    setEditId(null);
    setFormName('');
    setFormStart('');
    setFormEnd('');
    setFormActive(false);
    setPushPreview(null);
  }

  useEffect(() => {
    if (!formStart || !formEnd) {
      setPushPreview(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        const { data, error: err } = await supabase.rpc('admin_preview_season_push', {
          p_starts_london: datetimeLocalToLondonSql(formStart),
          p_ends_london: datetimeLocalToLondonSql(formEnd),
        });
        if (cancelled) return;
        if (err || !data) {
          setPushPreview(null);
          return;
        }
        const payload = data as {
          warnings?: PushPreviewItem[];
          fires?: PushPreviewItem[];
          season_push_enabled?: boolean;
        };
        setPushPreview({
          warnings: payload.warnings ?? [],
          fires: payload.fires ?? [],
          season_push_enabled: payload.season_push_enabled,
        });
      })();
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [formStart, formEnd]);

  function startEdit(season: SeasonRow) {
    setEditId(season.id);
    setFormName(season.name);
    setFormStart(toLondonDatetimeLocal(season.starts_at));
    setFormEnd(toLondonDatetimeLocal(season.ends_at));
    setFormActive(season.is_active);
    setNotice(null);
  }

  async function handleSaveSeason(e: FormEvent) {
    e.preventDefault();
    setSavingSeason(true);
    setError(null);
    setNotice(null);
    const { data, error: err } = await supabase.rpc('admin_upsert_season', {
      p_id: editId,
      p_name: formName,
      p_starts_london: datetimeLocalToLondonSql(formStart),
      p_ends_london: datetimeLocalToLondonSql(formEnd),
      p_is_active: formActive,
    });
    setSavingSeason(false);
    if (err) {
      setError(err.message);
      return;
    }
    const preview = (data as { push_preview?: { warnings?: PushPreviewItem[] } } | null)?.push_preview;
    const suppressed = (preview?.warnings ?? []).filter((w) => w.suppressed);
    setNotice(
      suppressed.length
        ? `${editId ? 'Season updated' : 'Season created'}. ${suppressed.map((w) => w.reason).join(' ')}`
        : editId
          ? 'Season updated.'
          : 'Season created.',
    );
    resetSeasonForm();
    await loadMeta();
  }

  async function handleDeleteSeason(id: string) {
    if (!window.confirm('Delete this season? Membership and stats for it will be removed.')) return;
    setError(null);
    const { error: err } = await supabase.rpc('admin_delete_season', { p_id: id });
    if (err) {
      setError(err.message);
      return;
    }
    setNotice('Season deleted.');
    if (editId === id) resetSeasonForm();
    await loadMeta();
  }

  async function saveRules() {
    setError(null);
    setNotice(null);
    for (const rule of Object.values(ruleDrafts)) {
      const { error: err } = await supabase.rpc('admin_update_division_rule', {
        p_division: rule.division,
        p_promote_percent: rule.promote_percent,
        p_promote_min_count: rule.promote_min_count,
        p_relegate_percent: rule.relegate_percent,
        p_promotes_to: rule.promotes_to,
        p_relegates_to: rule.relegates_to,
      });
      if (err) {
        setError(err.message);
        return;
      }
    }
    const { error: settingsErr } = await supabase.rpc('admin_update_promotion_settings', {
      p_min_workouts: Number(minWorkoutsDraft),
    });
    if (settingsErr) {
      setError(settingsErr.message);
      return;
    }
    for (const tier of tierDrafts) {
      const { error: tierErr } = await supabase.rpc('admin_upsert_consistency_tier', {
        p_league: tier.league,
        p_min_workouts: tier.min_workouts,
        p_bonus_points: tier.bonus_points,
      });
      if (tierErr) {
        setError(tierErr.message);
        return;
      }
    }
    setNotice('Rules saved. Changes apply at the next season reset — not retroactively.');
    await loadMeta();
  }

  async function addTier() {
    const { error: err } = await supabase.rpc('admin_upsert_consistency_tier', {
      p_league: newTierLeague,
      p_min_workouts: Number(newTierMin),
      p_bonus_points: Number(newTierPts),
    });
    if (err) {
      setError(err.message);
      return;
    }
    setNotice('Consistency tier saved (applies at next weekly award / reset).');
    await loadMeta();
  }

  async function deleteTier(league: string, minWorkouts: number) {
    const { error: err } = await supabase.rpc('admin_delete_consistency_tier', {
      p_league: league,
      p_min_workouts: minWorkouts,
    });
    if (err) {
      setError(err.message);
      return;
    }
    await loadMeta();
  }

  async function runDryRun() {
    if (!finalizeSeasonId) return;
    setDryRunLoading(true);
    setError(null);
    setConfirmFinalize(false);
    setDryRun(null);
    const { data, error: err } = await supabase.rpc('admin_finalize_season', {
      p_season_id: finalizeSeasonId,
      p_dry_run: true,
    });
    setDryRunLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDryRun(data as typeof dryRun);
  }

  async function runFinalize() {
    if (!finalizeSeasonId || !confirmFinalize) return;
    setFinalizeBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_finalize_season', {
      p_season_id: finalizeSeasonId,
      p_dry_run: false,
    });
    setFinalizeBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setNotice(`Season finalized: ${JSON.stringify((data as { summary?: unknown })?.summary ?? data)}`);
    setConfirmFinalize(false);
    setDryRun(null);
    await loadMeta();
  }

  async function loadHistory() {
    if (!historySeasonId) return;
    setHistoryLoading(true);
    setError(null);

    let histQ = supabase
      .from('promotion_history')
      .select('id, athlete_id, season_id, league, from_division, to_division, result, final_rank, final_points, created_at, athletes(display_name, username)')
      .eq('season_id', historySeasonId)
      .order('league')
      .order('final_rank');
    if (historyLeague !== 'all') histQ = histQ.eq('league', historyLeague);

    let snapQ = supabase
      .from('season_snapshots')
      .select('id, athlete_id, season_id, league, division, rank, points, created_at, athletes(display_name, username)')
      .eq('season_id', historySeasonId)
      .order('league')
      .order('rank');
    if (historyLeague !== 'all') snapQ = snapQ.eq('league', historyLeague);

    const [histRes, snapRes] = await Promise.all([histQ, snapQ]);
    setHistoryLoading(false);
    if (histRes.error) {
      setError(histRes.error.message);
      return;
    }
    if (snapRes.error) {
      setError(snapRes.error.message);
      return;
    }
    setHistoryRows((histRes.data ?? []).map(mapHistoryRow));
    setSnapshotRows((snapRes.data ?? []).map(mapSnapshotRow));
  }

  useEffect(() => {
    if (tab === 'history' && historySeasonId) void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters change
  }, [tab, historySeasonId, historyLeague]);

  const dryPromotions = dryRun?.promotions ?? [];

  const dryRunByLeagueDivision = useMemo(() => {
    const groups = new Map<
      string,
      { league: string; division: string; rows: DryRunPromotion[] }
    >();
    for (const p of dryPromotions) {
      const key = `${p.league}::${p.from_division}`;
      const g = groups.get(key) ?? { league: p.league, division: p.from_division, rows: [] };
      g.rows.push(p);
      groups.set(key, g);
    }
    return [...groups.values()].sort(
      (a, b) => a.league.localeCompare(b.league) || a.division.localeCompare(b.division),
    );
  }, [dryPromotions]);

  function holdReason(p: DryRunPromotion): string {
    if (p.result !== 'held') return '';
    if (p.eligible === false) return 'ineligible (< min workouts)';
    return 'mid-table';
  }

  function pushScheduleSummary(): string | null {
    if (!pushPreview?.fires.length) return null;
    const enabled = pushPreview.season_push_enabled !== false;
    const lines = pushPreview.fires.map((f) => {
      const label =
        f.kind === 'start_tminus2'
          ? 'T−2 start reminder'
          : f.kind === 'ending_tminus2'
            ? 'T−2 ending reminder'
            : f.kind === 'new_season'
              ? 'New season'
              : f.kind;
      return `${label}: all athletes at ${formatLondonInstant(f.fires_from)} London`;
    });
    if (!enabled) {
      return `When pushes are enabled: ${lines.join('; ')}`;
    }
    return `Saving will schedule pushes — ${lines.join('; ')}`;
  }

  const pushSaveSummary = pushScheduleSummary();

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="type-section-label">Seasons & divisions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            App season name and dates come from here — nothing is hardcoded. Division edits apply at the{' '}
            <span className="text-foreground">next reset</span>, not retroactively.
          </p>
        </div>
        <div className="inline-flex flex-wrap rounded-md border border-border bg-background p-1">
          {(
            [
              ['seasons', 'Seasons'],
              ['rules', 'Rules'],
              ['finalize', 'Finalize'],
              ['history', 'History'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded px-3 py-1 text-xs font-semibold ${
                tab === id ? 'bg-muted text-foreground' : 'text-muted-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {placeholderSeasons.length > 0 ? (
        <div className="rounded-md border border-dashed border-yellow-500/60 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-100">
          <strong className="font-semibold">Placeholder calendar.</strong> Season 2 dates and name are
          provisional until the client confirms — do not treat them as final.
          <ul className="mt-1 list-inside list-disc text-yellow-50/90">
            {placeholderSeasons.map((s) => (
              <li key={s.id}>
                {s.name} · {toLondonDatetimeLocal(s.starts_at).replace('T', ' ')} →{' '}
                {toLondonDatetimeLocal(s.ends_at).replace('T', ' ')} (London)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Loading competition meta…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-neon-lime">{notice}</p> : null}

      {tab === 'seasons' ? (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 pr-2">Name</th>
                  <th className="pb-2 pr-2">Start (London)</th>
                  <th className="pb-2 pr-2">End (London)</th>
                  <th className="pb-2 pr-2">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => {
                  const isPlaceholder = s.is_placeholder || /\[PLACEHOLDER\]/i.test(s.name);
                  return (
                  <tr
                    key={s.id}
                    className={`border-t border-border/60 ${isPlaceholder ? 'bg-yellow-500/5 text-muted-foreground' : ''}`}
                  >
                    <td className="py-2 pr-2">
                      <span className={isPlaceholder ? 'opacity-80' : ''}>{s.name}</span>
                      {isPlaceholder ? (
                        <span className="ml-2 rounded border border-yellow-500/50 bg-yellow-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-200">
                          not confirmed
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{toLondonDatetimeLocal(s.starts_at).replace('T', ' ')}</td>
                    <td className="py-2 pr-2 tabular-nums">{toLondonDatetimeLocal(s.ends_at).replace('T', ' ')}</td>
                    <td className="py-2 pr-2">{s.is_active ? 'Active' : 'Upcoming / past'}</td>
                    <td className="py-2 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(s)}>
                        Edit
                      </Button>
                      {!s.is_active ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => void handleDeleteSeason(s.id)}>
                          Delete
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3" onSubmit={handleSaveSeason}>
            <h3 className="text-sm font-semibold">{editId ? 'Edit season' : 'New season'}</h3>
            <p className="text-xs text-muted-foreground">
              Overlaps are rejected; gaps (e.g. recovery week) are allowed. Times are Europe/London.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="season-name">Name</Label>
                <Input
                  id="season-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Season 2 — Autumn 2026"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="season-start">Start (London)</Label>
                <Input
                  id="season-start"
                  type="datetime-local"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="season-end">End (London)</Label>
                <Input
                  id="season-end"
                  type="datetime-local"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                  required
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="rounded border-border"
              />
              Active season (deactivates any other)
            </label>
            {pushPreview && (pushPreview.warnings.length > 0 || pushPreview.fires.length > 0) ? (
              <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
                <p className="font-semibold text-amber-50">
                  Push impact on save
                  {pushPreview.season_push_enabled === false ? ' (pushes currently disabled globally)' : ''}
                </p>
                {pushSaveSummary ? (
                  <p className="font-medium text-foreground">{pushSaveSummary}</p>
                ) : null}
                {pushPreview.warnings.map((w, i) => (
                  <p key={`w-${i}`} className="text-amber-200">
                    {w.reason ??
                      `${w.kind}: will NOT fire (window opened ${formatLondonInstant(w.window_opens_at)})`}
                  </p>
                ))}
                {pushPreview.fires.map((f, i) => (
                  <p key={`f-${i}`} className="text-muted-foreground">
                    {f.kind === 'start_tminus2' && 'Start reminder (T−2)'}
                    {f.kind === 'ending_tminus2' && 'Ending reminder (T−2)'}
                    {f.kind === 'new_season' && 'New season'}
                    {!['start_tminus2', 'ending_tminus2', 'new_season'].includes(f.kind ?? '') && f.kind}: all
                    athletes · {formatLondonInstant(f.fires_from)} → {formatLondonInstant(f.fires_until)} London
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={savingSeason}>
                {savingSeason ? 'Saving…' : editId ? 'Save season' : 'Create season'}
              </Button>
              {editId ? (
                <Button type="button" variant="outline" onClick={resetSeasonForm}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      {tab === 'rules' ? (
        <div className="space-y-5">
          <p className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            Edits here apply at the <strong className="text-foreground">next season reset / weekly award</strong>.
            They do not rewrite past promotion_history or already-awarded bonuses.
          </p>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Promotion eligibility</h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="min-workouts">Min workouts for promotion</Label>
                <Input
                  id="min-workouts"
                  type="number"
                  min={0}
                  className="w-28"
                  value={minWorkoutsDraft}
                  onChange={(e) => setMinWorkoutsDraft(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Current: {promoSettings?.min_workouts_for_promotion ?? '—'} (below this → held, not promo/releg)
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Division rules</h3>
            {rules.map((r) => {
              const d = ruleDrafts[r.division] ?? r;
              return (
                <div key={r.division} className="grid gap-2 rounded-md border border-border/60 p-3 sm:grid-cols-3">
                  <p className="sm:col-span-3 text-sm font-medium">{r.division}</p>
                  <div className="space-y-1">
                    <Label>Promote %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={d.promote_percent ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [r.division]: {
                            ...d,
                            promote_percent: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Promote min count</Label>
                    <Input
                      type="number"
                      value={d.promote_min_count ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [r.division]: {
                            ...d,
                            promote_min_count: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Relegate %</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={d.relegate_percent ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [r.division]: {
                            ...d,
                            relegate_percent: e.target.value === '' ? null : Number(e.target.value),
                          },
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Promotes to</Label>
                    <Input
                      value={d.promotes_to ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [r.division]: { ...d, promotes_to: e.target.value || null },
                        }))
                      }
                      placeholder="Challenger"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Relegates to</Label>
                    <Input
                      value={d.relegates_to ?? ''}
                      onChange={(e) =>
                        setRuleDrafts((prev) => ({
                          ...prev,
                          [r.division]: { ...d, relegates_to: e.target.value || null },
                        }))
                      }
                      placeholder="Open"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Consistency bonus tiers (per league)</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">League</th>
                    <th className="pb-2">Min workouts</th>
                    <th className="pb-2">Bonus pts</th>
                    <th className="pb-2 text-right"> </th>
                  </tr>
                </thead>
                <tbody>
                  {tierDrafts.map((t) => (
                    <tr key={`${t.league}-${t.min_workouts}`} className="border-t border-border/60">
                      <td className="py-2">{t.league}</td>
                      <td className="py-2">{t.min_workouts}</td>
                      <td className="py-2">
                        <Input
                          type="number"
                          className="w-24"
                          value={t.bonus_points}
                          onChange={(e) =>
                            setTierDrafts((prev) =>
                              prev.map((row) =>
                                row.league === t.league && row.min_workouts === t.min_workouts
                                  ? { ...row, bonus_points: Number(e.target.value) }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void deleteTier(t.league, t.min_workouts)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label>League</Label>
                <select
                  className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={newTierLeague}
                  onChange={(e) => setNewTierLeague(e.target.value as 'engine' | 'run')}
                >
                  <option value="engine">engine</option>
                  <option value="run">run</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Min workouts</Label>
                <Input className="w-24" type="number" value={newTierMin} onChange={(e) => setNewTierMin(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Bonus pts</Label>
                <Input className="w-24" type="number" value={newTierPts} onChange={(e) => setNewTierPts(e.target.value)} />
              </div>
              <Button type="button" variant="outline" onClick={() => void addTier()}>
                Add tier
              </Button>
            </div>
          </div>

          <Button type="button" onClick={() => void saveRules()}>
            Save all rules
          </Button>
        </div>
      ) : null}

      {tab === 'finalize' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="finalize-season">Season to finalize</Label>
              <select
                id="finalize-season"
                className="flex h-10 min-w-[240px] rounded-md border border-input bg-background px-3 text-sm"
                value={finalizeSeasonId}
                onChange={(e) => {
                  setFinalizeSeasonId(e.target.value);
                  setDryRun(null);
                  setConfirmFinalize(false);
                }}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.is_active ? ' (active)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <Button type="button" variant="outline" disabled={dryRunLoading || !finalizeSeasonId} onClick={() => void runDryRun()}>
              {dryRunLoading ? 'Running dry-run…' : 'Dry-run preview'}
            </Button>
          </div>

          {dryRun ? (
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 bg-background/40 p-4 text-sm">
                <p className="type-section-label text-foreground">Finalize preview (dry-run)</p>
                <p className="mt-1 text-muted-foreground">
                  Same maths as commit — nothing written until you confirm below.
                </p>
                <p className="mt-2">
                  Status: <span className="font-semibold text-foreground">{dryRun.status}</span>
                  {dryRun.next_season_id ? (
                    <span className="text-neon-lime"> · next season ready</span>
                  ) : (
                    <span className="text-destructive"> · no next season (create Season 2 first)</span>
                  )}
                </p>
                <p className="mt-1 tabular-nums text-muted-foreground">
                  Promoted {dryRun.summary?.promoted ?? 0} · Relegated {dryRun.summary?.relegated ?? 0} · Held{' '}
                  {dryRun.summary?.held ?? 0} · Total {dryRun.summary?.total ?? 0}
                </p>
              </div>

              {dryRunByLeagueDivision.map((group) => {
                const promoted = group.rows.filter((r) => r.result === 'promoted');
                const relegated = group.rows.filter((r) => r.result === 'relegated');
                const held = group.rows.filter((r) => r.result === 'held');
                return (
                  <div key={`${group.league}-${group.division}`} className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.league} · {group.division}
                      <span className="ml-2 font-normal normal-case tabular-nums">
                        ↑{promoted.length} ↓{relegated.length} —{held.length}
                      </span>
                    </h3>
                    <div className="max-h-64 overflow-auto rounded-md border border-border/60">
                      <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="sticky top-0 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="pb-2 pl-2 pr-2">Athlete</th>
                            <th className="pb-2 pr-2">To</th>
                            <th className="pb-2 pr-2">Result</th>
                            <th className="pb-2 pr-2">Rank</th>
                            <th className="pb-2 pr-2 text-right">Pts</th>
                            <th className="pb-2 pr-2 text-right">Workouts</th>
                            <th className="pb-2 pr-2">Note</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((p, i) => (
                            <tr key={`${p.league}-${p.final_rank}-${i}`} className="border-t border-border/60">
                              <td className="py-1.5 pl-2 pr-2">{p.display_name ?? '—'}</td>
                              <td className="py-1.5 pr-2">{p.to_division}</td>
                              <td className="py-1.5 pr-2">{p.result}</td>
                              <td className="py-1.5 pr-2">{p.final_rank}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{formatScore(p.final_points)}</td>
                              <td className="py-1.5 pr-2 text-right tabular-nums">{p.workout_count ?? '—'}</td>
                              <td className="py-1.5 pr-2 text-xs text-muted-foreground">{holdReason(p)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-md border-2 border-destructive/50 bg-destructive/10 p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Commit (writes for real)</p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmFinalize}
                    onChange={(e) => setConfirmFinalize(e.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I understand this writes promotion_history, season_snapshots, and next-season
                    athlete_divisions. The preview above used the same finalize_season path with dry_run=true.
                  </span>
                </label>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={!confirmFinalize || finalizeBusy || !dryRun.next_season_id}
                  onClick={() => void runFinalize()}
                >
                  {finalizeBusy ? 'Finalizing…' : 'Confirm finalize season'}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Run dry-run preview first. Commit stays locked until you review the plan.
            </p>
          )}
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>Season</Label>
              <select
                className="flex h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
                value={historySeasonId}
                onChange={(e) => setHistorySeasonId(e.target.value)}
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>League</Label>
              <select
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={historyLeague}
                onChange={(e) => setHistoryLeague(e.target.value as 'all' | 'engine' | 'run')}
              >
                <option value="all">All</option>
                <option value="engine">Engine</option>
                <option value="run">Run</option>
              </select>
            </div>
            <Button type="button" variant="outline" onClick={() => void loadHistory()} disabled={historyLoading}>
              Refresh
            </Button>
          </div>

          {historyLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

          <div>
            <h3 className="text-sm font-semibold">Promotion history (read-only)</h3>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">Athlete</th>
                    <th className="pb-2">League</th>
                    <th className="pb-2">From</th>
                    <th className="pb-2">To</th>
                    <th className="pb-2">Result</th>
                    <th className="pb-2">Rank</th>
                    <th className="pb-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-3 text-muted-foreground">
                        No promotion history for this filter.
                      </td>
                    </tr>
                  ) : (
                    historyRows.map((h) => (
                      <tr key={h.id} className="border-t border-border/60">
                        <td className="py-1.5">{athleteLabel(h)}</td>
                        <td className="py-1.5">{h.league}</td>
                        <td className="py-1.5">{h.from_division}</td>
                        <td className="py-1.5">{h.to_division}</td>
                        <td className="py-1.5">{h.result}</td>
                        <td className="py-1.5">{h.final_rank}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatScore(h.final_points)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Season snapshots (read-only)</h3>
            <div className="mt-2 max-h-64 overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-2">Athlete</th>
                    <th className="pb-2">League</th>
                    <th className="pb-2">Division</th>
                    <th className="pb-2">Rank</th>
                    <th className="pb-2 text-right">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-3 text-muted-foreground">
                        No snapshots for this filter.
                      </td>
                    </tr>
                  ) : (
                    snapshotRows.map((s) => (
                      <tr key={s.id} className="border-t border-border/60">
                        <td className="py-1.5">{athleteLabel(s)}</td>
                        <td className="py-1.5">{s.league}</td>
                        <td className="py-1.5">{s.division}</td>
                        <td className="py-1.5">{s.rank}</td>
                        <td className="py-1.5 text-right tabular-nums">{formatScore(s.points)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
