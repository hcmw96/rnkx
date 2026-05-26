-- Link athlete row to auth user (bypasses athletes UPDATE policy when id = auth.uid() but user_id was null).

create or replace function public.ensure_athlete_user_id(p_athlete_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.athletes
  set user_id = auth.uid()
  where id = p_athlete_id
    and user_id is distinct from auth.uid()
    and (id = auth.uid() or user_id = auth.uid());
end;
$$;

revoke all on function public.ensure_athlete_user_id(uuid) from public;
grant execute on function public.ensure_athlete_user_id(uuid) to authenticated;
