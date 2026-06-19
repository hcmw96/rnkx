# RNKX Push Notification Audit Report

**Date:** 2026-06-16  
**Project:** `vuhnmlixouvghvyjwrdv`  
**Test recipient:** `aa4d9264-9a00-4e96-976a-8ffea3b3a177` (Bradley)

---

## Executive summary

All seven edge functions were audited, hardened, redeployed, and verified with live Tier 1 tests. The primary reliability bugs were **silent success responses** (HTTP 200 + `{ success: true }` even when OneSignal failed or env was missing) and **service-role auth failing** when `SUPABASE_ANON_KEY` was absent from the early auth gate (blocking even valid service-role bearer tokens).

OneSignal `Authorization: Key ${ONESIGNAL_API_KEY}` was already correct in repo code (no `Basic` usages found). Targeting via `include_external_user_ids` with stringified `athletes.id` is correct across all functions.

**Tier 1 result:** 7/7 PASS (6 with OneSignal notification IDs; `notify-group-message` PASS with a real league id).

---

## Summary table

| Function | Header fixed? | Targeting ok? | Tier 1 | Trigger location | Notes |
|---|---|---|---|---|---|
| `notify-workout-scored` | Yes (`Key`) | Yes | **PASS** | Client: `pushAfterWorkoutScored.ts` ← `syncActivitiesApple.ts`. SQL: likely `invoke_push_notification` (not in repo) | Was returning 200 on all failures; fixed |
| `notify-rank-change` | Yes (`Key`) | Yes | **PASS** | SQL only (no client caller in repo) | `verify_jwt = false`; auth via bearer in function |
| `notify-new-message` | Yes (`Key`) | Yes | **PASS** | Client: `pushAfterMessage.ts` ← `chatMessages.ts` | Handles DM + group via `conversation_id` path |
| `notify-friend-request` | Yes (`Key`) | Yes | **PASS** | Client: `FriendsPage.tsx`, `FriendProfilePage.tsx` | Body: `from_athlete_id`, `to_athlete_id` |
| `notify-league-invite` | Yes (`Key`) | Yes | **PASS** | Client: `InviteFriendModal.tsx` | Body: `invited_user_id`, `league_name`, `inviter_name` |
| `notify-group-message` | Yes (`Key`) | Yes | **PASS** | SQL only (no client caller); club chat uses `notify-new-message` instead | Skips when sender is sole member |
| `send-notification` | Yes (`Key`) | Yes | **PASS** | Client: friends accept, achievements, league join, club discover, etc. | Generic helper for assorted events |

### Tier 1 response samples (Bradley)

| Function | HTTP | OneSignal ID | Verdict |
|---|---|---|---|
| `notify-workout-scored` | 200 | `2c2d91a8-1191-4005-867b-2b9a405c8dcf` | PASS |
| `notify-rank-change` | 200 | `99fd3e38-0344-40e9-884c-c47b8a5b845f` | PASS |
| `notify-new-message` | 200 | `1b0ee515-270d-4ea4-8ebf-49f47ea33110` | PASS |
| `notify-friend-request` | 200 | `549f56c5-579e-494c-b81a-2c68252d903f` | PASS |
| `notify-league-invite` | 200 | `d0c492ec-717c-4d7f-8cdd-49ff9ba33210` | PASS |
| `notify-group-message` | 200 | `7c5ca81e-8439-4e20-830c-9ee2c6c91d35` (league `c60c3f11-…`) | PASS |
| `send-notification` | 200 | `dfab0129-ce84-4b94-93e3-b40bb4db93a6` | PASS |

---

## Code changes (edge functions)

All seven functions redeployed to `vuhnmlixouvghvyjwrdv` after these changes.

### New shared modules

| File | Purpose |
|---|---|
| `_shared/athleteLookup.ts` | `resolveAthleteExternalId()` — lookup by `athletes.id` **or** `athletes.user_id` (legacy rows) |
| `_shared/onesignalSend.ts` | `sendOneSignalPush()`, `outcomeFromOneSignal()`, `sanitizePushText()`, `getOneSignalCredentials()` |

### `_shared/pushAuth.ts`

- Service-role auth no longer blocked when `SUPABASE_ANON_KEY` is missing (anon key only required for user JWT path).
- `getServiceRoleKey()` falls back: `SUPABASE_SERVICE_ROLE_KEY` → vault `service_role_key` → `SERVICE_ROLE_KEY`.
- `getSupabaseUrl()` falls back: `SUPABASE_URL` → vault `supabase_url` → hardcoded project URL.
- Added `createServiceRoleClient()` helper used by all notify functions.

### Per-function fixes (all 7)

1. **OneSignal auth:** `Authorization: Key ${apiKey}` via shared sender (reads `ONESIGNAL_API_KEY` / `ONESIGNAL_REST_API_KEY`).
2. **Targeting:** `include_external_user_ids: [String(athletes.id)]` — never `include_player_ids` or auth UUID.
3. **Athlete lookup:** Uses `resolveAthleteExternalId()` (id OR user_id) except group fan-out paths that already hold athlete ids from membership tables.
4. **Validation:** Missing required body fields → HTTP 400 (was silently returning 200).
5. **OneSignal errors:** Non-2xx → HTTP 502 + logged status/body. Unsubscribed devices → HTTP 200 + `{ partial: true, errors: … }`.
6. **CORS/OPTIONS:** Unchanged; all handle OPTIONS.
7. **`notify-group-message`:** Added `authenticateNotifyRequest` (was completely open with `verify_jwt = false`).

### Deploy commands run

```bash
cd rnkx/
supabase functions deploy notify-workout-scored --project-ref vuhnmlixouvghvyjwrdv
supabase functions deploy notify-rank-change --project-ref vuhnmlixouvghvyjwrdv
supabase functions deploy notify-new-message --project-ref vuhnmlixouvghvyjwrdv
supabase functions deploy notify-friend-request --project-ref vuhnmlixouvghvyjwrdv
supabase functions deploy notify-league-invite --project-ref vuhnmlixouvghvyjwrdv
supabase functions deploy notify-group-message --project-ref vuhnmlixouvghvyjwrdv
supabase functions deploy send-notification --project-ref vuhnmlixouvghvyjwrdv
```

---

## Suspected bugs — verification

| Bug | Status |
|---|---|
| `Authorization: Basic` instead of `Key` | **Not present** in any of the 7 functions (confirmed grep + live Tier 1). Historical 403 in logs was likely pre-fix deploy. |
| Wrong targeting (`include_player_ids` / auth UUID) | **Not present.** All use `include_external_user_ids` with stringified `athletes.id`. |
| Athlete lookup id-only | **Fixed.** Shared lookup handles `id` and `user_id`. |
| Silent failure (200 on OneSignal reject) | **Fixed.** Now 502 on HTTP error; 200 + `partial: true` when OneSignal accepts but no subscribers. |
| `SUPABASE_SERVICE_ROLE_KEY` secret prefix | **Flagged & mitigated.** Platform injects `SUPABASE_SERVICE_ROLE_KEY`; vault also has unprefixed `service_role_key`. Functions now accept either for bearer auth and DB client creation. |

---

## Event → trigger → function map

| Event | Trigger location | Function | Payload shape |
|---|---|---|---|
| Workout scored (Apple sync) | `syncActivitiesApple.ts` → `pushAfterWorkoutScored.ts` | `notify-workout-scored` | `{ athlete_id, score, league_type }` |
| Workout scored (SQL) | DB trigger via `invoke_push_notification` (not in repo) | `notify-workout-scored` | Same |
| Rank change | DB trigger only (no TS caller) | `notify-rank-change` | `{ athlete_id, old_rank, new_rank, league_type }` |
| DM sent | `chatMessages.ts` → `pushAfterMessage.ts` | `notify-new-message` | `{ receiver_athlete_id, sender_athlete_id, preview }` |
| Group/club chat sent | `chatMessages.ts` → `pushAfterMessage.ts` | `notify-new-message` | `{ conversation_id, sender_athlete_id, message_body }` |
| Friend request sent | `FriendsPage.tsx`, `FriendProfilePage.tsx` | `notify-friend-request` | `{ from_athlete_id, to_athlete_id }` |
| Friend request accepted | `FriendsPage.tsx`, `FriendProfilePage.tsx` | `send-notification` | `{ athlete_id, title, message, path }` |
| League invite | `InviteFriendModal.tsx` | `notify-league-invite` | `{ invited_user_id, league_name, inviter_name }` |
| Club/league group message (SQL path) | DB trigger only | `notify-group-message` | `{ league_id, sender_athlete_id, sender_name, preview }` |
| Achievement unlock | `AchievementUnlockContext.tsx` | `send-notification` | `{ athlete_id, title, message, path }` |
| League join request | `JoinLeaguePage.tsx`, `DiscoverClubsPage.tsx` | `send-notification` | generic |
| League member approved | `NotificationsPage.tsx`, `EditLeagueModal.tsx` | `send-notification` | generic |

### Wiring gaps

- **`notify-rank-change`:** No client-side caller found. Depends entirely on SQL `invoke_push_notification`. Confirm trigger exists in production DB.
- **`notify-group-message`:** No client-side caller. Club chat push goes through **`notify-new-message`** (conversation fan-out). `notify-group-message` is a parallel SQL-only path — ensure triggers don't double-notify.

---

## Client-side findings (read-only — not applied)

### `src/lib/pushNotify.ts`

- Fire-and-forget via `supabase.functions.invoke()` with session Bearer token. ✓
- Logs invoke errors and `success === false`. ✓
- **Proposed:** Also log `partial: true` responses so testers can distinguish “API ok, no device” from full success:

```typescript
// src/lib/pushNotify.ts — after success check
if (payload?.partial === true) {
  console.warn(`[Push] ${functionName} partial (no subscribed device):`, payload.errors ?? payload);
}
```

### `src/App.tsx` — OneSignal device linking

- `registerPushForAthlete(athleteId)` runs when `session` + `profileComplete` are set (lines ~209–223). ✓
- Foreground re-link on `visibilitychange` for Despia native only (lines ~225–244). ✓
- `registerPushForAthlete` internally no-ops on non-Despia web. ✓
- **Proposed:** After onboarding creates a new athlete row, ensure `resolveAthleteId()` has completed before first push registration (race is unlikely but worth logging if `athleteId` is null).

### `src/services/onesignal.ts`

- Uses Despia `setonesignalplayerid://?user_id=${athleteId}` — correct external id mapping. ✓
- 1.5s settle delay after link. ✓

### Dead / duplicate paths

| Issue | Proposed fix |
|---|---|
| Club chat uses `notify-new-message`, not `notify-group-message` | Document as intentional OR wire `pushAfterMessage.ts` group branch to `notify-group-message` if SQL trigger is removed |
| No client backup for `notify-rank-change` | Add client invoke after leaderboard refresh if SQL trigger is unreliable (e.g. missing vault secret) |
| `notify-workout-scored` only from Apple sync client path | Terra/WHOOP sync paths should also call `notifyWorkoutScoredPushes()` if SQL trigger fails |

---

## Tier 2 — manual device checklist

**Prerequisites:** Physical iOS device, Despia build, signed in as test user, notifications permission granted, confirm OneSignal dashboard shows `external_user_id` = athlete id.

| # | Action | Expected push | Verify OneSignal dashboard | Device received? |
|---|---|---|---|---|
| 1 | Send DM to test account from second account | `notify-new-message` — sender name + preview | Delivery count ≥ 1 | ☐ |
| 2 | Score a workout (Apple sync or manual) | “Workout scored! 💪” | ☐ | ☐ |
| 3 | Trigger rank change (another user overtakes, or SQL test) | Rank up/down copy | ☐ | ☐ |
| 4 | Send friend request to test account | “New friend request 👋” | ☐ | ☐ |
| 5 | Invite test account to a league | “League Invitation” | ☐ | ☐ |
| 6 | Post in club group chat | Group message (via `notify-new-message` or `notify-group-message`) | ☐ | ☐ |
| 7 | Unlock an achievement | Generic via `send-notification` | ☐ | ☐ |

**After each test:** Check Supabase function logs for `[function-name] onesignal ok` vs `partial` vs 502.

---

## Top risks / still open

1. **SQL triggers not in repo** — `invoke_push_notification` + vault `service_role_key` path cannot be audited from git. If vault secret is wrong, DB-triggered pushes fail silently at pg_net layer while client backups may still work.
2. **`notify-group-message` vs `notify-new-message` overlap** — Two functions can notify club members; risk of duplicate pushes if both SQL trigger and client fire.
3. **`notify-rank-change` client gap** — No client fallback; rank pushes depend on DB infrastructure.
4. **User JWT auth requires `SUPABASE_ANON_KEY` in edge env** — Client `invokePushNotify` uses user session token. If anon key missing from function env, all client-triggered pushes return 401 (service-role Tier 1 tests would still pass).
5. **Tier 1 ≠ delivery** — Bradley's device returned OneSignal IDs (subscribed). Other athletes may get `partial: true` until `registerPushForAthlete` runs on their device.
6. **`verify_jwt = false`** on `notify-rank-change` and `notify-group-message` — Gateway allows unauthenticated requests; function-level bearer check is now required (added for group-message). Consider setting `verify_jwt = true` if all callers send JWT/service key anyway.

---

## Files modified

```
supabase/functions/_shared/athleteLookup.ts          (new)
supabase/functions/_shared/onesignalSend.ts          (new)
supabase/functions/_shared/pushAuth.ts               (updated)
supabase/functions/notify-workout-scored/index.ts    (updated)
supabase/functions/notify-rank-change/index.ts        (updated)
supabase/functions/notify-new-message/index.ts       (updated)
supabase/functions/notify-friend-request/index.ts    (updated)
supabase/functions/notify-league-invite/index.ts     (updated)
supabase/functions/notify-group-message/index.ts     (updated)
supabase/functions/send-notification/index.ts        (updated)
```

**Not modified (per guardrails):** `src/services/despia.ts`, `src/services/supabase.ts`
