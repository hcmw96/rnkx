# RNKX — Scoring Systems Audit: Tie-Break, HR Logic, Promotion/Relegation, Season Reset

## Objective
Investigate and fix (where safe) three areas Shaun has flagged as untested/unclear. Produce a report with clear findings — confirmed bugs fixed, confirmed working, or "not built, needs Shaun's input" — not guesses. Use the Supabase CLI / SQL access available in this environment to read actual function definitions and query real data rather than assuming.

Project ref: `vuhnmlixouvghvyjwrdv`. Do NOT modify `src/services/despia.ts` or `src/services/supabase.ts`. Do NOT modify `process_activity` or `on_activity_inserted` in ways that reintroduce push-notification calls inside scoring transactions (this was deliberately removed after causing an athlete_stats rollback bug — see git history / prior migrations for context if useful).

Known context: earlier today, a bug was found and fixed where `award_weekly_consistency_bonus` only counted the `workouts` table (Apple Watch) and silently excluded `activities` (Terra/WHOOP/Garmin) users from ever qualifying. The fix unioned both tables. This pattern — "two scoring/data paths, only one wired up" — has recurred multiple times across this codebase (notifications, athlete_stats updates, run-league scoring). When investigating each item below, actively check whether the same class of bug exists again.

---

## PART 1 — Tie-break logic

Check the leaderboard ranking function:

```sql
select routine_definition from information_schema.routines
where routine_name = 'category_leaderboard_rank' and routine_schema = 'public';
```

- If the `ORDER BY` only sorts by `score DESC` with no secondary/tertiary sort key, two athletes with identical scores get an unstable or arbitrary rank (Postgres window functions like `rank()`/`dense_rank()` don't guarantee consistent ordering for ties without an explicit tiebreaker).
- Check where else leaderboard ordering happens (e.g. any client-side sort in Dashboard.tsx, LeaguePage.tsx, or a separate leaderboard RPC/view) — the tie-break needs to be consistent everywhere the leaderboard is rendered, not just in this one function.
- If missing, propose and implement a deterministic secondary sort. Reasonable default: whoever reached the current score first wins the tie (earlier `athlete_stats.recorded_at`, or earliest qualifying workout timestamp) — but confirm this makes sense given the schema before implementing, and flag the choice in the report since it's a product decision Shaun may want to weigh in on.
- Test: find or construct two athletes with identical scores in the same season/category and confirm the fix produces a stable, sensible order across multiple calls.

## PART 2 — HR logic (Shaun's max HR "never updates")

Shaun's athlete_id: `5173cdff-d349-4ce0-92ba-a3e82d8b21b9`

Start here:
```sql
select max_hr, max_hr_source, age from athletes where id = '5173cdff-d349-4ce0-92ba-a3e82d8b21b9';
```

Then trace the actual logic end to end:
1. Find every place `max_hr` is read or written — `process_activity`, `calculate_activity_score`, `sync_apple_workouts`, any client code (`ProfilePage.tsx`/`SettingsPage.tsx`, `runAppleWorkoutSync.ts`, `syncActivitiesApple.ts`) that sets `athlete.max_hr` from a device-reported value.
2. Confirm the intended behaviour: is it supposed to be `220 - age` until a device reports a real max HR, and then switch to and continue updating from the device value? Or does it only set it once and never update again? Read the code — don't assume; state clearly what the CURRENT logic actually does.
3. Find `shouldApplyAppleMaxHrToProfile` (referenced in earlier SettingsPage work) — this gates whether a synced max HR overwrites the profile. Check its exact condition. This is a strong candidate for why Shaun's isn't updating — if the condition requires `max_hr_source` to be a specific value before it'll overwrite, and his current source doesn't match, updates get silently skipped.
4. Check Shaun's actual HealthKit-reported max HR across his real (non-demo, i.e. NOT `source_id LIKE 'demo_%'`) workouts:
```sql
select source_id, peak_hr, avg_hr, started_at from workouts
where athlete_id = '5173cdff-d349-4ce0-92ba-a3e82d8b21b9'
and source_id not like 'demo_%'
order by started_at desc limit 10;
```
Compare `peak_hr` values against his stored `athletes.max_hr` — if HealthKit has reported higher values that were never applied, that confirms the bug.
5. Fix the update logic if a genuine bug is found (e.g. the gate condition is wrong, or updates only happen on first sync and never again). Do not guess-fix — trace to the actual root cause first.
6. Report clearly: what the correct intended logic SHOULD be (confirm/propose: `220-age` as fallback until first device reading, then always keep the highest-ever device-reported value OR always use the most recent device-reported value — these are different and worth stating which makes more sense before implementing), what it currently does, what was wrong, and what was fixed.

## PART 3 — Promotion/relegation and season reset: honest scoping (NOT full build)

A prior check found NO functions matching `promot`, `relegat`, `season_reset`, or `reset_season` in the schema, and every athlete currently sits in `engine_division = 'Open'` / `run_division = 'Open'` — i.e. there is only one division right now, so there is structurally nothing to promote/relegate between.

Do NOT attempt to design and build a full promotion/relegation system in this session — it requires product decisions only Shaun can make (how many divisions, how many people move per division per reset, timing). Instead:

1. Confirm the above finding is still accurate (re-run the search for any promotion/relegation/division functions, including partial name matches you think might be relevant).
2. Check the `athlete_stats` columns that already exist for this (`engine_division`, `run_division`, `engine_places_to_promotion`, `run_places_to_promotion`, `engine_places_to_relegation`, `run_places_to_relegation`) — are any of these ever calculated/updated anywhere, or are they static/manually-set (we know at least one was manually set via SQL earlier for a demo screenshot)? Trace whether ANY code path updates these based on real leaderboard position, or if they're currently decorative.
3. Check for any existing `seasons` table structure that would support multiple seasons (start/end dates, is_active flag) — confirm whether "starting a new season" (creating a new season row, resetting athlete_stats to 0 for the new season while preserving history for the old one) is even a supported operation today, or would itself need building.
4. Produce a clear scoping report (not code) covering:
   - What already exists (columns, partial infrastructure)
   - What's completely missing (division assignment logic, promotion/relegation calculation, the actual "move someone between divisions" operation, season transition/reset logic)
   - The specific product questions that block building this, e.g.: How many divisions? How many athletes promote/relegate per division at each reset? Does this happen weekly or only at season end? What happens to a division with too few members? Is a new "Season 2" created as a new row, or does the same season row get reset?
   - A rough honest effort estimate for building the minimum viable version once those questions are answered (distinguish "trivial once we know the rules" vs "significant new subsystem")

## Deliverable
Produce `SCORING_AUDIT_REPORT.md` with three clearly separated sections matching Parts 1-3 above. For Parts 1 and 2, state clearly: bug confirmed or not, root cause, fix applied, and how it was verified (show the actual before/after query results, not just "should be fixed now"). For Part 3, no code — a scoping document with the specific questions Shaun needs to answer.

## Guardrails
- Do not modify `src/services/despia.ts` or `src/services/supabase.ts`.
- Do not add push notification calls inside any SQL scoring transaction.
- Do not attempt to build promotion/relegation or season reset logic — scope only.
- For any fix involving `max_hr` update logic, make sure the change applies consistently to BOTH the Apple Watch path and the Terra/WHOOP/Garmin path if device-reported max HR comes from both — check whether Terra/WHOOP webhooks also report a max HR value that should feed the same field.
- Redeploy any edge functions you change and note the deploy command run.
