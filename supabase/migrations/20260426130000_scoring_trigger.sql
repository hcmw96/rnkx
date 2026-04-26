-- Function to calculate score from an activity
create or replace function calculate_activity_score(
  p_league_type text,
  p_duration_minutes numeric,
  p_avg_hr_percent numeric,
  p_avg_pace_seconds numeric
) returns numeric language plpgsql as $$
declare
  v_score numeric := 0;
  v_duration numeric;
begin
  v_duration := least(p_duration_minutes, 120);
  
  if p_league_type = 'engine' and p_avg_hr_percent is not null then
    v_score := case
      when p_avg_hr_percent >= 90 then v_duration * 4.8
      when p_avg_hr_percent >= 80 then v_duration * 3.2
      when p_avg_hr_percent >= 70 then v_duration * 2.0
      when p_avg_hr_percent >= 60 then v_duration * 1.4
      when p_avg_hr_percent >= 45 then v_duration * 0.8
      else 0
    end;
  elsif p_league_type = 'run' and p_avg_pace_seconds is not null then
    v_score := case
      when p_avg_pace_seconds < 210 then v_duration * 5.6
      when p_avg_pace_seconds < 240 then v_duration * 4.8
      when p_avg_pace_seconds < 270 then v_duration * 4.0
      when p_avg_pace_seconds < 300 then v_duration * 3.4
      when p_avg_pace_seconds < 330 then v_duration * 2.8
      when p_avg_pace_seconds < 360 then v_duration * 2.3
      when p_avg_pace_seconds < 420 then v_duration * 1.9
      when p_avg_pace_seconds < 480 then v_duration * 1.5
      when p_avg_pace_seconds < 540 then v_duration * 1.1
      when p_avg_pace_seconds <= 720 then v_duration * 0.4
      else 0
    end;
  end if;
  
  return round(v_score, 1);
end;
$$;

-- Trigger function to update athlete total_score when activity inserted
create or replace function on_activity_inserted()
returns trigger language plpgsql security definer as $$
declare
  v_score numeric;
begin
  v_score := calculate_activity_score(
    NEW.league_type,
    NEW.duration_minutes,
    NEW.avg_hr_percent,
    NEW.avg_pace_seconds
  );

  if v_score > 0 then
    -- Update athlete total score
    update athletes 
    set total_score = coalesce(total_score, 0) + v_score,
        last_synced = now()
    where id = NEW.athlete_id;

    -- Upsert athlete_stats for leaderboard
    insert into athlete_stats (athlete_id, season_id, category, score)
    values (NEW.athlete_id, NEW.season_id, NEW.league_type, v_score)
    on conflict (athlete_id, season_id, category)
    do update set score = athlete_stats.score + v_score;
  end if;

  return NEW;
end;
$$;

-- Create trigger
drop trigger if exists on_activity_inserted on activities;
create trigger on_activity_inserted
  after insert on activities
  for each row execute function on_activity_inserted();
