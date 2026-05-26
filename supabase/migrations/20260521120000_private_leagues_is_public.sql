-- Club visibility: public clubs are discoverable; private clubs require an invite code.
alter table public.private_leagues
  add column if not exists is_public boolean not null default false;

drop policy if exists "private_leagues_select_public" on public.private_leagues;

create policy "private_leagues_select_public"
  on public.private_leagues for select
  using (is_public = true);
