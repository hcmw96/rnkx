-- Backfill athletes.user_id for rows where id = auth.users.id (early sign-ups before user_id column).
-- Required so all RLS policies that check athletes.user_id = auth.uid() work correctly.
update public.athletes a
set user_id = a.id
where a.user_id is null
  and exists (
    select 1 from auth.users u where u.id = a.id
  );
