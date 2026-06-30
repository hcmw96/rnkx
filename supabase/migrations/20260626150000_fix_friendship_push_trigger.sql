-- Replace hardcoded service-role JWT in on_friendship_inserted with vault-backed invoke_push_notification.

create or replace function public.on_friendship_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.invoke_push_notification(
      'notify-friend-request',
      jsonb_build_object(
        'from_athlete_id', new.athlete_id::text,
        'to_athlete_id', new.friend_id::text
      )
    );
  end if;
  return new;
end;
$$;
