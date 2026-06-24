-- Allow allowlisted admins to claim an orphaned profile even when already linked to another athlete row.

create or replace function public.link_allowlisted_athlete_for_caller()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_id uuid;
begin
  if auth.uid() is null then
    return false;
  end if;

  if coalesce(public.admin_is_caller_allowed(), false) then
    return true;
  end if;

  select a.id
  into v_target_id
  from public.athletes a
  where a.user_id is null
    and lower(trim(coalesce(a.username, ''))) = any (array['sds8', 'henry', 'henryw']::text[])
  order by a.id
  limit 1;

  if v_target_id is null then
    return false;
  end if;

  update public.athletes
  set user_id = auth.uid()
  where id = v_target_id
    and user_id is null;

  return found;
end;
$$;
