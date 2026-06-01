create or replace function public.prevent_is_internal_tester_client_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_internal_tester is true then
      if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
        and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
        raise exception 'Apenas operacoes internas podem alterar is_internal_tester.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.is_internal_tester is distinct from new.is_internal_tester then
      if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
        and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
        raise exception 'Apenas operacoes internas podem alterar is_internal_tester.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.set_internal_tester_by_email(
  p_email text,
  p_enabled boolean default true
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  affected_rows integer := 0;
begin
  if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
    and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'Apenas operacoes internas podem alterar is_internal_tester.';
  end if;

  perform set_config('app.internal_operation', 'true', true);

  update public.usuarios as u
  set is_internal_tester = p_enabled
  from auth.users as au
  where u.id = au.id
    and lower(au.email) = lower(p_email);

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.set_internal_tester_by_email(text, boolean) from public;
revoke all on function public.set_internal_tester_by_email(text, boolean) from anon;
revoke all on function public.set_internal_tester_by_email(text, boolean) from authenticated;
