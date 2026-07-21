-- Push reliability: vault secret fallbacks (message push trigger managed in 20260615142000).

create or replace function public.invoke_push_notification(
  p_edge_function text,
  p_body jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base text;
  v_key text;
  v_name text;
begin
  v_base := null;
  foreach v_name in array array['supabase_url', 'SUPABASE_URL', 'project_url'] loop
  begin
    select decrypted_secret into v_base
    from vault.decrypted_secrets
    where name = v_name
    limit 1;
  exception
    when others then
      null;
  end;
    exit when v_base is not null and v_base <> '';
  end loop;

  if v_base is null or v_base = '' then
    v_base := 'https://vuhnmlixouvghvyjwrdv.supabase.co';
  end if;

  v_key := null;
  foreach v_name in array array['service_role_key', 'supabase_service_role_key', 'SUPABASE_SERVICE_ROLE_KEY'] loop
  begin
    select decrypted_secret into v_key
    from vault.decrypted_secrets
    where name = v_name
    limit 1;
  exception
    when others then
      null;
  end;
    exit when v_key is not null and v_key <> '';
  end loop;

  if v_key is null or v_key = '' then
    raise warning 'invoke_push_notification: no vault service role secret (tried service_role_key, supabase_service_role_key, SUPABASE_SERVICE_ROLE_KEY) — skipping %', p_edge_function;
    return;
  end if;

  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/' || p_edge_function,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := p_body
  );
exception
  when others then
    raise warning 'invoke_push_notification(%) failed: %', p_edge_function, sqlerrm;
end;
$$;

grant execute on function public.category_leaderboard_rank(uuid, uuid, text) to service_role;
