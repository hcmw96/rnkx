-- Add @shaunsmith to admin username allowlist (matches client ADMIN_USERNAMES).

create or replace function public.admin_is_caller_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(
      (
        select lower(trim(u.email)) = any (array['shaun@hsmithplc.com']::text[])
        from auth.users u
        where u.id = auth.uid()
      ),
      false
    )
    or exists (
      select 1
      from public.athletes a
      where (a.id = auth.uid() or a.user_id = auth.uid())
        and lower(trim(coalesce(a.username, ''))) = any (
          array['sds8', 'shaunsmith', 'henry', 'henryw']::text[]
        )
    );
$$;

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
    and lower(trim(coalesce(a.username, ''))) = any (
      array['sds8', 'shaunsmith', 'henry', 'henryw']::text[]
    )
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
