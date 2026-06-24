-- Extend admin allowlist to include auth email (e.g. shaun@hsmithplc.com).

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
          array['sds8', 'henry', 'henryw']::text[]
        )
    );
$$;
