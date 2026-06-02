-- Run League PPM lookup (pace seconds/km → points per minute)
create table if not exists public.run_ppm_lookup (
  pace_seconds integer primary key,
  ppm numeric(4, 2) not null
);

insert into public.run_ppm_lookup (pace_seconds, ppm) values
  (181, 5.59),
  (182, 5.57),
  (183, 5.56),
  (184, 5.55),
  (185, 5.53),
  (186, 5.52),
  (187, 5.51),
  (188, 5.49),
  (189, 5.48),
  (190, 5.47),
  (191, 5.45),
  (192, 5.44),
  (193, 5.43),
  (194, 5.41),
  (195, 5.4),
  (196, 5.39),
  (197, 5.37),
  (198, 5.36),
  (199, 5.35),
  (200, 5.33),
  (201, 5.32),
  (202, 5.31),
  (203, 5.29),
  (204, 5.28),
  (205, 5.27),
  (206, 5.25),
  (207, 5.24),
  (208, 5.23),
  (209, 5.21),
  (210, 5.2),
  (211, 5.18),
  (212, 5.17),
  (213, 5.15),
  (214, 5.13),
  (215, 5.12),
  (216, 5.1),
  (217, 5.08),
  (218, 5.07),
  (219, 5.05),
  (220, 5.03),
  (221, 5.02),
  (222, 5),
  (223, 4.98),
  (224, 4.97),
  (225, 4.95),
  (226, 4.93),
  (227, 4.92),
  (228, 4.9),
  (229, 4.88),
  (230, 4.87),
  (231, 4.85),
  (232, 4.83),
  (233, 4.82),
  (234, 4.8),
  (235, 4.78),
  (236, 4.77),
  (237, 4.75),
  (238, 4.73),
  (239, 4.72),
  (240, 4.7),
  (241, 4.68),
  (242, 4.66),
  (243, 4.64),
  (244, 4.62),
  (245, 4.6),
  (246, 4.58),
  (247, 4.56),
  (248, 4.54),
  (249, 4.52),
  (250, 4.5),
  (251, 4.48),
  (252, 4.46),
  (253, 4.44),
  (254, 4.42),
  (255, 4.4),
  (256, 4.38),
  (257, 4.36),
  (258, 4.34),
  (259, 4.32),
  (260, 4.3),
  (261, 4.28),
  (262, 4.26),
  (263, 4.24),
  (264, 4.22),
  (265, 4.2),
  (266, 4.18),
  (267, 4.16),
  (268, 4.14),
  (269, 4.12),
  (270, 4.1),
  (271, 4.08),
  (272, 4.06),
  (273, 4.04),
  (274, 4.02),
  (275, 4),
  (276, 3.98),
  (277, 3.96),
  (278, 3.94),
  (279, 3.92),
  (280, 3.9),
  (281, 3.88),
  (282, 3.86),
  (283, 3.84),
  (284, 3.82),
  (285, 3.8),
  (286, 3.78),
  (287, 3.76),
  (288, 3.74),
  (289, 3.72),
  (290, 3.7),
  (291, 3.68),
  (292, 3.66),
  (293, 3.64),
  (294, 3.62),
  (295, 3.6),
  (296, 3.58),
  (297, 3.56),
  (298, 3.54),
  (299, 3.52),
  (300, 3.5),
  (301, 3.48),
  (302, 3.47),
  (303, 3.45),
  (304, 3.43),
  (305, 3.42),
  (306, 3.4),
  (307, 3.38),
  (308, 3.37),
  (309, 3.35),
  (310, 3.33),
  (311, 3.32),
  (312, 3.3),
  (313, 3.28),
  (314, 3.27),
  (315, 3.25),
  (316, 3.23),
  (317, 3.22),
  (318, 3.2),
  (319, 3.18),
  (320, 3.17),
  (321, 3.15),
  (322, 3.13),
  (323, 3.12),
  (324, 3.1),
  (325, 3.08),
  (326, 3.07),
  (327, 3.05),
  (328, 3.03),
  (329, 3.02),
  (330, 3),
  (331, 2.99),
  (332, 2.97),
  (333, 2.96),
  (334, 2.95),
  (335, 2.93),
  (336, 2.92),
  (337, 2.91),
  (338, 2.89),
  (339, 2.88),
  (340, 2.87),
  (341, 2.85),
  (342, 2.84),
  (343, 2.83),
  (344, 2.81),
  (345, 2.8),
  (346, 2.79),
  (347, 2.77),
  (348, 2.76),
  (349, 2.75),
  (350, 2.73),
  (351, 2.72),
  (352, 2.71),
  (353, 2.69),
  (354, 2.68),
  (355, 2.67),
  (356, 2.65),
  (357, 2.64),
  (358, 2.63),
  (359, 2.61),
  (360, 2.6),
  (361, 2.59),
  (362, 2.57),
  (363, 2.56),
  (364, 2.55),
  (365, 2.53),
  (366, 2.52),
  (367, 2.51),
  (368, 2.49),
  (369, 2.48),
  (370, 2.47),
  (371, 2.45),
  (372, 2.44),
  (373, 2.43),
  (374, 2.41),
  (375, 2.4),
  (376, 2.39),
  (377, 2.37),
  (378, 2.36),
  (379, 2.35),
  (380, 2.33),
  (381, 2.32),
  (382, 2.31),
  (383, 2.29),
  (384, 2.28),
  (385, 2.27),
  (386, 2.25),
  (387, 2.24),
  (388, 2.23),
  (389, 2.21),
  (390, 2.2),
  (391, 2.18),
  (392, 2.17),
  (393, 2.15),
  (394, 2.13),
  (395, 2.12),
  (396, 2.1),
  (397, 2.08),
  (398, 2.07),
  (399, 2.05),
  (400, 2.03),
  (401, 2.02),
  (402, 2),
  (403, 1.98),
  (404, 1.97),
  (405, 1.95),
  (406, 1.93),
  (407, 1.92),
  (408, 1.9),
  (409, 1.88),
  (410, 1.87),
  (411, 1.85),
  (412, 1.83),
  (413, 1.82),
  (414, 1.8),
  (415, 1.78),
  (416, 1.77),
  (417, 1.75),
  (418, 1.73),
  (419, 1.72),
  (420, 1.7),
  (421, 1.67),
  (422, 1.63),
  (423, 1.6),
  (424, 1.57),
  (425, 1.53),
  (426, 1.5),
  (427, 1.47),
  (428, 1.43),
  (429, 1.4),
  (430, 1.37),
  (431, 1.33),
  (432, 1.3),
  (433, 1.27),
  (434, 1.23),
  (435, 1.2),
  (436, 1.17),
  (437, 1.13),
  (438, 1.1),
  (439, 1.07),
  (440, 1.03),
  (441, 1),
  (442, 0.97),
  (443, 0.93),
  (444, 0.9),
  (445, 0.87),
  (446, 0.83),
  (447, 0.8),
  (448, 0.77),
  (449, 0.73),
  (450, 0.7)
on conflict (pace_seconds) do update set ppm = excluded.ppm;

create or replace function public.run_ppm_from_pace(p_pace_seconds numeric)
returns numeric
language plpgsql
stable
as $$
declare
  v_pace integer;
  v_ppm numeric;
begin
  if p_pace_seconds is null or p_pace_seconds <= 0 then
    return 0;
  end if;

  v_pace := round(p_pace_seconds)::integer;

  if v_pace <= 180 then
    return 5.60;
  end if;

  if v_pace > 450 then
    return 0;
  end if;

  select ppm into v_ppm from public.run_ppm_lookup where pace_seconds = v_pace;
  return coalesce(v_ppm, 0);
end;
$$;

create or replace function public.run_league_session_score(
  p_pace_seconds numeric,
  p_duration_minutes numeric
)
returns integer
language plpgsql
stable
as $$
declare
  v_ppm numeric;
  v_duration numeric;
begin
  v_duration := least(coalesce(p_duration_minutes, 0), 120);
  if v_duration <= 15 then
    return 0;
  end if;

  v_ppm := public.run_ppm_from_pace(p_pace_seconds);
  if v_ppm <= 0 then
    return 0;
  end if;

  return ceil(v_ppm * v_duration)::integer;
end;
$$;

-- Shared session rules: duration must be strictly greater than 15 minutes.
create or replace function public.session_duration_qualifies_for_scoring(p_duration_minutes numeric)
returns boolean
language sql
stable
as $$
  select coalesce(p_duration_minutes, 0) > 15;
$$;

create or replace function public.session_counts_for_consistency_bonus(p_session_score numeric)
returns boolean
language sql
stable
as $$
  select coalesce(p_session_score, 0) > 0;
$$;

-- Keep only the top 2 scoring workouts per athlete per calendar day for a league column.
create or replace function public.reconcile_daily_workout_league_cap(
  p_athlete_id uuid,
  p_day date,
  p_score_column text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec record;
  v_season_id uuid;
  v_category text;
begin
  if p_score_column not in ('run_score', 'engine_score') then
    raise exception 'invalid score column %', p_score_column;
  end if;

  v_category := case when p_score_column = 'run_score' then 'run' else 'engine' end;
  select id into v_season_id from seasons where is_active = true limit 1;

  for v_rec in
    execute format(
      $q$
      select id, %1$I::numeric as league_score
      from workouts
      where athlete_id = $1
        and status = 'scored'
        and date_trunc('day', started_at)::date = $2
        and coalesce(%1$I, 0) > 0
      order by %1$I desc, started_at desc
      offset 2
      $q$,
      p_score_column
    )
    using p_athlete_id, p_day
  loop
    execute format('update workouts set %I = 0 where id = $1', p_score_column) using v_rec.id;

    update athletes
    set total_score = greatest(0, total_score - v_rec.league_score)
    where id = p_athlete_id;

    if v_season_id is not null then
      update athlete_stats
      set score = greatest(0, score - v_rec.league_score)
      where athlete_id = p_athlete_id
        and season_id = v_season_id
        and category = v_category;
    end if;
  end loop;
end;
$$;
