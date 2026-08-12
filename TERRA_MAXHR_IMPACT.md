# Terra/WHOOP/Garmin `observed_max_hr` Scoring Bug — Impact Assessment

**Date:** 2026-07-03
**Status:** Assessment only — **no code changed.** Data read live via service_role (`vuhnmlixouvghvyjwrdv`, active season "Season 1 - Spring 2026").
**Question being answered:** before approving the `observed_max_hr → max_hr` fix (report item 3.3), what is the real-world impact?

---

## 1. Where the bug is, in the actual scoring path

The HR% used for engine scoring of Terra/WHOOP/Garmin activities is computed **once, in the webhook, at insert time**, and stored on the activity row. The DB scoring trigger then scores off that stored value — it never recomputes from `max_hr`.

**Step 1 — `supabase/functions/terra-webhook/index.ts:86-90`** (runs for WHOOP + Garmin + all Terra providers):
```ts
const maxHrAge = athlete.date_of_birth
  ? 220 - Math.floor((Date.now() - new Date(athlete.date_of_birth).getTime()) / (365.25*24*60*60*1000))
  : 190;
const effectiveMaxHr = Math.max(maxHrAge, athlete.observed_max_hr ?? 0);   // ← BUG
const avgHrPercent = avgHrBpm ? Math.round((avgHrBpm / effectiveMaxHr) * 100) : null;
```
`observed_max_hr` is **read here and written nowhere** in the entire codebase (verified live: all four affected athletes have `observed_max_hr = null`). So `effectiveMaxHr` always collapses to **`220 − age`**, and the athlete's real `max_hr` is ignored.

**Step 2 — the value is persisted** (`terra-webhook/index.ts:149`): `avg_hr_percent: avgHrPercent` on the `activities` row.

**Step 3 — the trigger scores off the stored value** (`on_activity_inserted`, `migration 20260520140000:152-158`):
```sql
v_score := public.calculate_activity_score(
  new.league_type, new.duration_minutes, new.avg_hr_percent, new.avg_pace_seconds);
```
→ `calculate_activity_score` (`20260610170000:559-575`) → `engine_league_session_score(avg_hr_percent, duration)` → `engine_ppm_from_hr_percent(avg_hr_percent)` × duration.

**Contrast — the Apple/RPC path is correct.** `process_activity` (`20260610170000:628-649`) reads `coalesce(max_hr, 220-age)` and computes HR% in SQL from the real device max. So **Apple users are scored on their true max HR; Terra/WHOOP/Garmin users are scored on `220 − age`.** Same field (`avg_hr_percent`/engine PPM), two different bases — the exact "two paths, one wired" pattern.

Only **engine** scoring is affected. Run scoring uses pace, not HR.

---

## 2. Who is affected (every athlete with scored Terra/WHOOP/Garmin engine activities)

102 scored engine activities across **4 athletes** (29 WHOOP + 73 Garmin; the 93 Garmin *run* activities are unaffected). All four have a real `max_hr` set and `observed_max_hr = null`:

| Athlete | `max_hr` | `max_hr_source` | `observed_max_hr` | `220 − age` (buggy denom) | Engine acts | max_hr vs 220−age |
|---|---|---|---|---|---|---|
| Eliza R | 190 | terra_live | null | ~188 | 59 | ≈ equal |
| Brad | 194 | whoop_live | null | ~190 | 27 | max_hr **higher** |
| Lucas Tong | 190 | terra_live | null | ~196 | 14 | max_hr **lower** |
| Shaun Smith | 173 | whoop_historic | null | ~184 | 2 | max_hr **lower** |

The **sign of the error depends on `max_hr` vs `220 − age`:**
- `max_hr` **below** `220 − age` (Lucas, Shaun) → buggy denominator too big → HR% **understated** → **under-scored**. Fix raises their scores.
- `max_hr` **above** `220 − age` (Brad) → buggy denominator too small → HR% **overstated** → **over-scored**. Fix lowers their scores.
- `max_hr` **≈** `220 − age` (Eliza) → per-activity error is tiny (<1%), dominated by integer rounding.

---

## 3. Before/after per activity (5 most recent engine activities each)

`hr%_now` = stored value (scored with `220−age`). `hr%_correct` = recomputed with real `max_hr`. `pts` = `engine_ppm_from_hr_percent(hr%) × min(duration,120)`.

**Eliza R** (max_hr 190, buggy denom ~188):
| date | src | dur | hr%_now | hr%_correct | pts_now | pts_correct | Δ |
|---|---|---|---|---|---|---|---|
| 2026-07-02 | GARMIN | 54 | 71 | 70 | 110.7 | 99.9 | −10.8 |
| 2026-07-01 | GARMIN | 54 | 70 | 69 | 99.9 | 91.3 | −8.6 |
| 2026-06-30 | GARMIN | 57 | 68 | 67 | 87.2 | 78.1 | −9.1 |
| 2026-06-27 | GARMIN | 74 | 73 | 72 | 179.8 | 166.5 | −13.3 |
| 2026-06-25 | GARMIN | 46 | 69 | 68 | 77.7 | 70.4 | −7.3 |

**Brad** (max_hr 194, buggy denom ~190):
| date | src | dur | hr%_now | hr%_correct | pts_now | pts_correct | Δ |
|---|---|---|---|---|---|---|---|
| 2026-05-24 | whoop | 41 | 81 | 79 | 155.8 | 144.3 | −11.5 |
| 2026-05-24 | whoop | 50 | 59 | 58 | 0.0 | 0.0 | 0 |
| 2026-05-24 | whoop | 41 | 66 | 65 | 49.6 | 43.1 | −6.5 |
| 2026-05-24 | whoop | 27 | 52 | 51 | 0.0 | 0.0 | 0 |
| 2026-05-21 | whoop | 47 | 48 | 47 | 0.0 | 0.0 | 0 |

**Lucas Tong** (max_hr 190, buggy denom ~196):
| date | src | dur | hr%_now | hr%_correct | pts_now | pts_correct | Δ |
|---|---|---|---|---|---|---|---|
| 2026-06-23 | GARMIN | 26 | 73 | 75 | 63.2 | 72.8 | +9.6 |
| 2026-06-20 | GARMIN | 40 | 66 | 68 | 48.4 | 61.2 | +12.8 |
| 2026-06-18 | GARMIN | 22 | 60 | 62 | 0.0 | 0.0 | 0 |
| **2026-06-17** | GARMIN | 76 | **63** | **65** | **0.0** | **79.8** | **+79.8** ⚠ |
| 2026-06-15 | GARMIN | 60 | 51 | 53 | 0.0 | 0.0 | 0 |

**Shaun Smith** (max_hr 173, buggy denom ~184): both his WHOOP engine activities are below 65% either way → 0 pts before and after. No impact.

### Season totals (all affected activities, not just the 5 shown)
| Athlete | acts | pts now | pts correct | Δ pts | Δ % | 65% cliff flips |
|---|---|---|---|---|---|---|
| Eliza R | 59 | 3853.4 | 3446.9 | −406.5 | −10.5% | 2 |
| Brad | 27 | 673.4 | 600.5 | −72.9 | −10.8% | 0 |
| Lucas Tong | 14 | 195.6 | 313.4 | +117.8 | **+60.2%** | 1 |
| Shaun | 2 | 0 | 0 | 0 | 0 | 0 |

---

## 4. Honest magnitude: rounding, or real?

**Real and systematic — not rounding noise, though not catastrophic tier-jumps either.**

- The engine PPM curve is a **fine-grained lookup** (`engine_ppm_lookup`, 0.1% steps) — there are no giant 4.20-vs-2.80 tier cliffs like you worried about. So the error is roughly *proportional*, not a wild tier misclassification.
- **But the curve is steep in the 65–90% working range** (66%→1.21 ppm, 74%→2.62, 88%→4.8 — it roughly doubles over ~8 points). So even a small denominator error (Eliza's max_hr is only ~1% off `220−age`) amplifies to **≈10% on the score**. For athletes whose max_hr diverges more from `220−age`, it's a clear directional bias (Brad over-scored ~11%; Lucas under-scored ~60%).
- **The one genuine cliff is the 65% floor** (below 65% = 0 points). This is where the bug flips activities between "didn't count" and "counted": Lucas's 76-minute Garmin session sits at **63%** under the bug (0 points) but **65%** corrected (**+79.8 points**). That single activity is his whole +60%. Three cliff flips total across the affected athletes.

So: **most activities move ~7–13%; a few flip across the 65% floor and swing by a whole session.** Direction is consistent per athlete (over- or under-scored), not random.

*Caveats on precision:* `activities.avg_hr` (raw bpm) is **not stored** — only the rounded integer `avg_hr_percent` — so `hr%_correct` is back-calculated as `round(hr%_now × (220−age) / max_hr)`, carrying ±0.5% rounding uncertainty (enough to make Eliza's exact −10.5% soft; her direction is reliable, the magnitude is within noise). Age is taken from `date_of_birth` at each activity's date. A code fix would compute from the true stored bpm and be exact.

---

## 5. Does it change leaderboard rank? — **Inconclusive on current data, and here's why (a second problem)**

While assessing this I found the stored totals **do not reconcile** with the scored activities — the scoring pipeline's output has been overwritten downstream (demo/seed edits + the `engine_ppm_spreadsheet_sync` migration that recomputes totals from the *workouts* table, bypassing `activities`):

| Athlete | `athletes.total_score` | `athlete_stats` breakdown | Sum of scored engine activities (computed) | Consistent? |
|---|---|---|---|---|
| Brad | 1268.3 | engine 1045 + run 213.3 + consistency 10 = 1268.3 | 673.4 | total is self-consistent, but engine stat ≠ activity sum |
| Eliza | 1854.2 | engine 477.6 + run **14,628.6** + consistency 10 | 3853.4 | **total ≠ stats (off by ~13k)** |
| Lucas | **0** | engine **0** (recorded 04-29, before the activities) + run 904.3 | 195.6 | **14 scored engine activities, but 0 engine score and 0 total** |

Because current `total_score` values are not the live output of the activity-scoring pipeline (they've been reset/re-synced/hand-edited for demos), **I cannot honestly claim "fixing the denominator moves athlete X from rank N to rank M" on this dataset** — the numbers the leaderboard ranks on don't currently include these activity scores in a clean way.

**What I *can* say:**
- The **top of the board is not sensitive** to this bug: Shaun (4493) and Kirsty (2228, unaffected — Apple) are far clear; even applying the full engine deltas to Eliza (−406) and Brad (−73) leaves the #3/#4 order intact.
- **The bug is rank-relevant near the 65% cliff.** *If* the pipeline totals were clean, Lucas's +117.8 (driven by the 63%→65% flip) would lift him from the large "0 points" cohort (≈rank 11) up to ≈rank 5 — i.e. correcting the bug is the difference between "one activity counted / didn't count," which is exactly the kind of thing that reorders the mid/lower board once real athletes are competing.
- On a **production dataset without demo pollution**, expect: mid-board athletes shifting a few places from the ~10% swings, and occasional larger jumps when a borderline (~63–66%) session flips across the 65% floor.

---

## Bottom line for the approve/don't-approve decision

- The bug is **real, in the live scoring path, and affects real scored data** (102 engine activities, 4 athletes today).
- Magnitude is **material (~10% typical, whole-session swings at the 65% floor), directional per athlete**, but **not** a gross tier misclassification — the PPM curve is fine-grained.
- The fix is **correct and low-ambiguity** (make Terra match `process_activity`'s `coalesce(max_hr, 220-age)`), **but it changes people's engine scores** and is only fully meaningful once the **separate data-integrity problem** (totals overwritten out of band; `athlete_stats` ≠ activities ≠ `total_score`) is understood — otherwise a "corrected" score still won't match what the leaderboard displays.

### Recommended sequencing (no code changed yet — your call)
1. **Approve the code fix** (`terra-webhook`: use `coalesce(max_hr, 220-age)`, drop `observed_max_hr`) so *future* Terra/WHOOP/Garmin activities score correctly. Low risk, clearly correct, matches Apple.
2. **Decide on backfill** of the 102 historical activities separately — this needs the raw bpm (not stored today; would require re-pulling from Terra or storing `avg_hr` going forward) and depends on #3.
3. **Investigate the totals-reconciliation problem** (why `total_score` ≠ `athlete_stats` ≠ Σactivities). This is arguably a bigger issue than the HR denominator and should be resolved before any historical rescore, or the rescore won't stick.

### Follow-ups worth doing regardless
- Start persisting raw `avg_hr` (bpm) on `activities` so HR% can be recomputed/audited without back-calculation.
- Drop or populate the dead `observed_max_hr` column to remove the trap.
