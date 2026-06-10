-- Engine League PPM lookup (avg HR % of max → points per minute)
create table if not exists public.engine_ppm_lookup (
  hr_percent_tenths integer primary key,
  ppm numeric(4, 2) not null
);

insert into public.engine_ppm_lookup (hr_percent_tenths, ppm) values
  (500, 0.00),
  (501, 0.00),
  (502, 0.00),
  (503, 0.00),
  (504, 0.00),
  (505, 0.00),
  (506, 0.00),
  (507, 0.00),
  (508, 0.00),
  (509, 0.00),
  (510, 0.00),
  (511, 0.00),
  (512, 0.00),
  (513, 0.00),
  (514, 0.00),
  (515, 0.00),
  (516, 0.00),
  (517, 0.00),
  (518, 0.00),
  (519, 0.00),
  (520, 0.00),
  (521, 0.00),
  (522, 0.00),
  (523, 0.00),
  (524, 0.00),
  (525, 0.00),
  (526, 0.00),
  (527, 0.00),
  (528, 0.00),
  (529, 0.00),
  (530, 0.00),
  (531, 0.00),
  (532, 0.00),
  (533, 0.00),
  (534, 0.00),
  (535, 0.00),
  (536, 0.00),
  (537, 0.00),
  (538, 0.00),
  (539, 0.00),
  (540, 0.00),
  (541, 0.00),
  (542, 0.00),
  (543, 0.00),
  (544, 0.00),
  (545, 0.00),
  (546, 0.00),
  (547, 0.00),
  (548, 0.00),
  (549, 0.00),
  (550, 0.00),
  (551, 0.00),
  (552, 0.00),
  (553, 0.00),
  (554, 0.00),
  (555, 0.00),
  (556, 0.00),
  (557, 0.00),
  (558, 0.00),
  (559, 0.00),
  (560, 0.00),
  (561, 0.00),
  (562, 0.00),
  (563, 0.00),
  (564, 0.00),
  (565, 0.00),
  (566, 0.00),
  (567, 0.00),
  (568, 0.00),
  (569, 0.00),
  (570, 0.00),
  (571, 0.00),
  (572, 0.00),
  (573, 0.00),
  (574, 0.00),
  (575, 0.00),
  (576, 0.00),
  (577, 0.00),
  (578, 0.00),
  (579, 0.00),
  (580, 0.00),
  (581, 0.00),
  (582, 0.00),
  (583, 0.00),
  (584, 0.00),
  (585, 0.00),
  (586, 0.00),
  (587, 0.00),
  (588, 0.00),
  (589, 0.00),
  (590, 0.00),
  (591, 0.00),
  (592, 0.00),
  (593, 0.00),
  (594, 0.00),
  (595, 0.00),
  (596, 0.00),
  (597, 0.00),
  (598, 0.00),
  (599, 0.00),
  (600, 0.00),
  (601, 0.00),
  (602, 0.00),
  (603, 0.00),
  (604, 0.00),
  (605, 0.00),
  (606, 0.00),
  (607, 0.00),
  (608, 0.00),
  (609, 0.00),
  (610, 0.00),
  (611, 0.00),
  (612, 0.00),
  (613, 0.00),
  (614, 0.00),
  (615, 0.00),
  (616, 0.00),
  (617, 0.00),
  (618, 0.00),
  (619, 0.00),
  (620, 0.00),
  (621, 0.00),
  (622, 0.00),
  (623, 0.00),
  (624, 0.00),
  (625, 0.00),
  (626, 0.00),
  (627, 0.00),
  (628, 0.00),
  (629, 0.00),
  (630, 0.00),
  (631, 0.00),
  (632, 0.00),
  (633, 0.00),
  (634, 0.00),
  (635, 0.00),
  (636, 0.00),
  (637, 0.00),
  (638, 0.00),
  (639, 0.00),
  (640, 0.00),
  (641, 0.00),
  (642, 0.00),
  (643, 0.00),
  (644, 0.00),
  (645, 0.00),
  (646, 0.00),
  (647, 0.00),
  (648, 0.00),
  (649, 0.00),
  (650, 0.50),
  (651, 0.53),
  (652, 0.55),
  (653, 0.58),
  (654, 0.60),
  (655, 0.63),
  (656, 0.66),
  (657, 0.68),
  (658, 0.71),
  (659, 0.73),
  (660, 0.76),
  (661, 0.79),
  (662, 0.81),
  (663, 0.84),
  (664, 0.86),
  (665, 0.89),
  (666, 0.92),
  (667, 0.94),
  (668, 0.97),
  (669, 0.99),
  (670, 1.02),
  (671, 1.05),
  (672, 1.07),
  (673, 1.10),
  (674, 1.12),
  (675, 1.15),
  (676, 1.18),
  (677, 1.20),
  (678, 1.23),
  (679, 1.25),
  (680, 1.28),
  (681, 1.31),
  (682, 1.33),
  (683, 1.36),
  (684, 1.38),
  (685, 1.41),
  (686, 1.44),
  (687, 1.46),
  (688, 1.49),
  (689, 1.51),
  (690, 1.54),
  (691, 1.57),
  (692, 1.59),
  (693, 1.62),
  (694, 1.64),
  (695, 1.67),
  (696, 1.70),
  (697, 1.72),
  (698, 1.75),
  (699, 1.77),
  (700, 1.80),
  (701, 1.82),
  (702, 1.84),
  (703, 1.86),
  (704, 1.88),
  (705, 1.90),
  (706, 1.92),
  (707, 1.94),
  (708, 1.96),
  (709, 1.98),
  (710, 2.00),
  (711, 2.02),
  (712, 2.04),
  (713, 2.06),
  (714, 2.08),
  (715, 2.10),
  (716, 2.12),
  (717, 2.14),
  (718, 2.16),
  (719, 2.18),
  (720, 2.20),
  (721, 2.22),
  (722, 2.24),
  (723, 2.26),
  (724, 2.28),
  (725, 2.30),
  (726, 2.32),
  (727, 2.34),
  (728, 2.36),
  (729, 2.38),
  (730, 2.40),
  (731, 2.42),
  (732, 2.44),
  (733, 2.46),
  (734, 2.48),
  (735, 2.50),
  (736, 2.52),
  (737, 2.54),
  (738, 2.56),
  (739, 2.58),
  (740, 2.60),
  (741, 2.62),
  (742, 2.64),
  (743, 2.66),
  (744, 2.68),
  (745, 2.70),
  (746, 2.72),
  (747, 2.74),
  (748, 2.76),
  (749, 2.78),
  (750, 2.80),
  (751, 2.82),
  (752, 2.84),
  (753, 2.85),
  (754, 2.87),
  (755, 2.89),
  (756, 2.91),
  (757, 2.93),
  (758, 2.94),
  (759, 2.96),
  (760, 2.98),
  (761, 3.00),
  (762, 3.02),
  (763, 3.03),
  (764, 3.05),
  (765, 3.07),
  (766, 3.09),
  (767, 3.11),
  (768, 3.12),
  (769, 3.14),
  (770, 3.16),
  (771, 3.18),
  (772, 3.20),
  (773, 3.21),
  (774, 3.23),
  (775, 3.25),
  (776, 3.27),
  (777, 3.29),
  (778, 3.30),
  (779, 3.32),
  (780, 3.34),
  (781, 3.36),
  (782, 3.38),
  (783, 3.39),
  (784, 3.41),
  (785, 3.43),
  (786, 3.45),
  (787, 3.47),
  (788, 3.48),
  (789, 3.50),
  (790, 3.52),
  (791, 3.54),
  (792, 3.56),
  (793, 3.57),
  (794, 3.59),
  (795, 3.61),
  (796, 3.63),
  (797, 3.65),
  (798, 3.66),
  (799, 3.68),
  (800, 3.70),
  (801, 3.71),
  (802, 3.72),
  (803, 3.73),
  (804, 3.74),
  (805, 3.75),
  (806, 3.76),
  (807, 3.77),
  (808, 3.78),
  (809, 3.79),
  (810, 3.80),
  (811, 3.81),
  (812, 3.82),
  (813, 3.83),
  (814, 3.84),
  (815, 3.85),
  (816, 3.86),
  (817, 3.87),
  (818, 3.88),
  (819, 3.89),
  (820, 3.90),
  (821, 3.91),
  (822, 3.92),
  (823, 3.93),
  (824, 3.94),
  (825, 3.95),
  (826, 3.96),
  (827, 3.97),
  (828, 3.98),
  (829, 3.99),
  (830, 4.00),
  (831, 4.01),
  (832, 4.02),
  (833, 4.03),
  (834, 4.04),
  (835, 4.05),
  (836, 4.06),
  (837, 4.07),
  (838, 4.08),
  (839, 4.09),
  (840, 4.10),
  (841, 4.11),
  (842, 4.12),
  (843, 4.13),
  (844, 4.14),
  (845, 4.15),
  (846, 4.16),
  (847, 4.17),
  (848, 4.18),
  (849, 4.19),
  (850, 4.20),
  (851, 4.21),
  (852, 4.22),
  (853, 4.22),
  (854, 4.23),
  (855, 4.24),
  (856, 4.25),
  (857, 4.26),
  (858, 4.26),
  (859, 4.27),
  (860, 4.28),
  (861, 4.29),
  (862, 4.30),
  (863, 4.30),
  (864, 4.31),
  (865, 4.32),
  (866, 4.33),
  (867, 4.34),
  (868, 4.34),
  (869, 4.35),
  (870, 4.36),
  (871, 4.37),
  (872, 4.38),
  (873, 4.38),
  (874, 4.39),
  (875, 4.40),
  (876, 4.41),
  (877, 4.42),
  (878, 4.42),
  (879, 4.43),
  (880, 4.44),
  (881, 4.45),
  (882, 4.46),
  (883, 4.46),
  (884, 4.47),
  (885, 4.48),
  (886, 4.49),
  (887, 4.50),
  (888, 4.50),
  (889, 4.51),
  (890, 4.52),
  (891, 4.53),
  (892, 4.54),
  (893, 4.54),
  (894, 4.55),
  (895, 4.56),
  (896, 4.57),
  (897, 4.58),
  (898, 4.58),
  (899, 4.59),
  (900, 4.60),
  (901, 4.61),
  (902, 4.61),
  (903, 4.62),
  (904, 4.62),
  (905, 4.63),
  (906, 4.64),
  (907, 4.64),
  (908, 4.65),
  (909, 4.65),
  (910, 4.66),
  (911, 4.67),
  (912, 4.67),
  (913, 4.68),
  (914, 4.68),
  (915, 4.69),
  (916, 4.70),
  (917, 4.70),
  (918, 4.71),
  (919, 4.71),
  (920, 4.72),
  (921, 4.73),
  (922, 4.73),
  (923, 4.74),
  (924, 4.74),
  (925, 4.75),
  (926, 4.76),
  (927, 4.76),
  (928, 4.77),
  (929, 4.77),
  (930, 4.78),
  (931, 4.79),
  (932, 4.79),
  (933, 4.80),
  (934, 4.80),
  (935, 4.81),
  (936, 4.82),
  (937, 4.82),
  (938, 4.83),
  (939, 4.83),
  (940, 4.84),
  (941, 4.85),
  (942, 4.85),
  (943, 4.86),
  (944, 4.86),
  (945, 4.87),
  (946, 4.88),
  (947, 4.88),
  (948, 4.89),
  (949, 4.89),
  (950, 4.90),
  (951, 4.90),
  (952, 4.90),
  (953, 4.90),
  (954, 4.90),
  (955, 4.90),
  (956, 4.90),
  (957, 4.90),
  (958, 4.90),
  (959, 4.90),
  (960, 4.90),
  (961, 4.90),
  (962, 4.90),
  (963, 4.90),
  (964, 4.90),
  (965, 4.90),
  (966, 4.90),
  (967, 4.90),
  (968, 4.90),
  (969, 4.90),
  (970, 4.90),
  (971, 4.90),
  (972, 4.90),
  (973, 4.90),
  (974, 4.90),
  (975, 4.90),
  (976, 4.90),
  (977, 4.90),
  (978, 4.90),
  (979, 4.90),
  (980, 4.90),
  (981, 4.90),
  (982, 4.90),
  (983, 4.90),
  (984, 4.90),
  (985, 4.90),
  (986, 4.90),
  (987, 4.90),
  (988, 4.90),
  (989, 4.90),
  (990, 4.90),
  (991, 4.90),
  (992, 4.90),
  (993, 4.90),
  (994, 4.90),
  (995, 4.90),
  (996, 4.90),
  (997, 4.90),
  (998, 4.90),
  (999, 4.90),
  (1000, 4.90)
on conflict (hr_percent_tenths) do update set ppm = excluded.ppm;

create or replace function public.engine_ppm_from_hr_percent(p_hr_percent numeric)
returns numeric
language plpgsql
stable
as $$
declare
  v_tenths integer;
  v_ppm numeric;
begin
  if p_hr_percent is null or p_hr_percent < 65 then
    return 0;
  end if;

  if p_hr_percent > 100 then
    return 4.90;
  end if;

  v_tenths := round(p_hr_percent * 10)::integer;
  select ppm into v_ppm from public.engine_ppm_lookup where hr_percent_tenths = v_tenths;
  return coalesce(v_ppm, 0);
end;
$$;

create or replace function public.engine_league_session_score(
  p_hr_percent numeric,
  p_duration_minutes numeric
)
returns numeric
language plpgsql
stable
as $$
declare
  v_ppm numeric;
  v_duration numeric;
begin
  if not public.session_duration_qualifies_for_scoring(p_duration_minutes) then
    return 0;
  end if;

  v_duration := least(coalesce(p_duration_minutes, 0), 120);
  v_ppm := public.engine_ppm_from_hr_percent(p_hr_percent);
  if v_ppm <= 0 then
    return 0;
  end if;

  return round(v_ppm * v_duration, 1);
end;
$$;

create or replace function public.calculate_activity_score(
  p_league_type text,
  p_duration_minutes numeric,
  p_avg_hr_percent numeric,
  p_avg_pace_seconds numeric
) returns numeric
language plpgsql
stable
as $$
begin
  if not public.session_duration_qualifies_for_scoring(p_duration_minutes) then
    return 0;
  end if;

  if p_league_type = 'engine' and p_avg_hr_percent is not null then
    return public.engine_league_session_score(p_avg_hr_percent, p_duration_minutes);
  elsif p_league_type = 'run' and p_avg_pace_seconds is not null then
    return public.run_league_session_score(p_avg_pace_seconds, p_duration_minutes)::numeric;
  end if;

  return 0;
end;
$$;

create or replace function public.process_activity(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid;
  v_source_id text;
  v_duration_min numeric;
  v_avg_hr numeric;
  v_peak_hr numeric;
  v_distance_m numeric;
  v_pace numeric;
  v_max_hr integer;
  v_age integer;
  v_effective_max_hr numeric;
  v_hr_pct numeric;
  v_engine_score numeric := 0;
  v_run_score numeric := 0;
  v_status text := 'scored';
  v_reject_reason text;
  v_activity_type text;
  v_started_at timestamptz;
  v_season_id uuid;
  v_old_rank integer;
  v_workout_id uuid;
  v_day date;
begin
  v_athlete_id := (payload->>'athlete_id')::uuid;
  v_source_id := payload->>'source_id';
  v_duration_min := (payload->>'duration_min')::numeric;
  v_avg_hr := (payload->>'avg_hr')::numeric;
  v_peak_hr := (payload->>'peak_hr')::numeric;
  v_distance_m := (payload->>'distance_m')::numeric;
  v_pace := (payload->>'avg_pace_per_km')::numeric;
  v_activity_type := payload->>'activity_type';
  v_started_at := (payload->>'started_at')::timestamptz;
  v_day := date_trunc('day', v_started_at)::date;

  if exists (select 1 from workouts where source_id = v_source_id) then
    return jsonb_build_object('status', 'duplicate', 'source_id', v_source_id);
  end if;

  select age, max_hr into v_age, v_max_hr from athletes where id = v_athlete_id;
  v_effective_max_hr := coalesce(v_max_hr, 220 - v_age);

  if not public.session_duration_qualifies_for_scoring(v_duration_min) then
    v_status := 'rejected';
    v_reject_reason := 'duration_too_short';
  end if;

  if v_duration_min > 120 then
    v_duration_min := 120;
  end if;

  -- RUN first; ENGINE only when run_score = 0
  if v_status != 'rejected'
    and v_pace is not null
    and lower(v_activity_type) in ('running', 'run', 'outdoor_run', 'indoor_run', 'trail_run', 'treadmill')
  then
    v_run_score := public.run_league_session_score(v_pace, v_duration_min);
  end if;

  if v_status != 'rejected' and v_run_score = 0 and v_avg_hr is not null then
    v_hr_pct := (v_avg_hr / v_effective_max_hr) * 100;
    v_engine_score := public.engine_league_session_score(v_hr_pct, v_duration_min);

    if v_pace is not null and v_pace < 240 and v_hr_pct < 60 then
      v_status := 'rejected';
      v_reject_reason := 'implausible_pace_hr_combo';
      v_engine_score := 0;
    end if;
  end if;

  if v_engine_score = 0 and v_run_score = 0 and v_status != 'rejected' then
    v_status := 'rejected';
    v_reject_reason := coalesce(v_reject_reason, 'no_qualifying_score');
  end if;

  insert into workouts (
    athlete_id, source_id, started_at, duration_min, activity_type,
    avg_hr, peak_hr, distance_m, avg_pace_per_km,
    engine_score, run_score, status, reject_reason, raw_payload
  )
  values (
    v_athlete_id, v_source_id, v_started_at, v_duration_min, v_activity_type,
    v_avg_hr, v_peak_hr, v_distance_m, v_pace,
    v_engine_score, v_run_score, v_status, v_reject_reason, payload
  )
  returning id into v_workout_id;

  if v_status = 'scored' then
    perform public.reconcile_daily_workout_league_cap(v_athlete_id, v_day, 'run_score');
    perform public.reconcile_daily_workout_league_cap(v_athlete_id, v_day, 'engine_score');

    select run_score, engine_score
    into v_run_score, v_engine_score
    from workouts
    where id = v_workout_id;

    update athletes
    set
      total_score = total_score + v_engine_score + v_run_score,
      last_synced = now()
    where id = v_athlete_id;

    select id into v_season_id from seasons where is_active = true limit 1;

    if v_season_id is not null then
      if v_engine_score > 0 then
        v_old_rank := public.category_leaderboard_rank(v_athlete_id, v_season_id, 'engine');

        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'engine', v_engine_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_engine_score;

        perform public.fire_scoring_push_notifications(
          v_athlete_id,
          v_season_id,
          'engine',
          v_engine_score,
          v_old_rank
        );
      end if;

      if v_run_score > 0 then
        v_old_rank := public.category_leaderboard_rank(v_athlete_id, v_season_id, 'run');

        insert into athlete_stats (athlete_id, season_id, category, score)
        values (v_athlete_id, v_season_id, 'run', v_run_score)
        on conflict (athlete_id, season_id, category)
        do update set score = athlete_stats.score + v_run_score;

        perform public.fire_scoring_push_notifications(
          v_athlete_id,
          v_season_id,
          'run',
          v_run_score,
          v_old_rank
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'engine_score', v_engine_score,
    'run_score', v_run_score,
    'reject_reason', v_reject_reason
  );
end;
$$;
