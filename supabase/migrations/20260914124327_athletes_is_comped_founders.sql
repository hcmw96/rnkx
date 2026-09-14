-- Comp flag: Founders-season signups stay premium even when RevenueCat has no entitlement.

alter table public.athletes
  add column if not exists is_comped boolean not null default false;

comment on column public.athletes.is_comped is
  'When true, check-entitlement must not set is_premium false. Founders 2026 signups are auto-comped.';

create or replace function public.athletes_ensure_founders_comp_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.seasons
    where is_active
      and name = 'Season 1 - Founders 2026'
  ) then
    update public.athletes
    set is_comped = true,
        is_premium = true
    where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists athletes_ensure_founders_comp on public.athletes;
create trigger athletes_ensure_founders_comp
  after insert on public.athletes
  for each row
  execute function public.athletes_ensure_founders_comp_trg();
