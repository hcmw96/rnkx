-- Dry-run finalize against live active season; tabular output.
with active as (
  select id from seasons where is_active limit 1
),
dry as (
  select public.finalize_season((select id from active), true) as payload
),
rows as (
  select
    (p->>'display_name') as athlete,
    (p->>'league') as league,
    (p->>'from_division') as from_div,
    (p->>'to_division') as to_div,
    (p->>'result') as result,
    (p->>'final_rank')::int as rank,
    round((p->>'final_points')::numeric, 1) as points,
    (p->>'workout_count')::int as workouts,
    (p->>'eligible')::boolean as eligible
  from dry, jsonb_array_elements(payload->'promotions') p
)
select athlete, league, from_div, to_div, result, rank, points, workouts, eligible
from rows
order by league, rank;
