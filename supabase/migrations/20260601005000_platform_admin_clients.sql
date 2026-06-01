alter table if exists public.usuarios
  add column if not exists is_platform_admin boolean not null default false;

comment on column public.usuarios.is_platform_admin is
  'Libera a area Admin Interno da plataforma. Separado de is_internal_tester e nao editavel por clientes.';

alter table if exists public.fazendas
  add column if not exists status text not null default 'ativo',
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists dono_nome text,
  add column if not exists dono_email text,
  add column if not exists dono_telefone text;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'fazendas'
      and constraint_name = 'fazendas_status_check'
  ) then
    alter table public.fazendas
      add constraint fazendas_status_check
      check (status in ('pendente', 'ativo', 'suspenso', 'cancelado')) not valid;
  end if;
end $$;

create or replace function public.prevent_is_platform_admin_client_update()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_platform_admin is true then
      if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
        and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
        raise exception 'Apenas operacoes internas podem alterar is_platform_admin.';
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.is_platform_admin is distinct from new.is_platform_admin then
      if coalesce(current_setting('app.internal_operation', true), '') <> 'true'
        and coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
        raise exception 'Apenas operacoes internas podem alterar is_platform_admin.';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_is_platform_admin_client_update on public.usuarios;

create trigger prevent_is_platform_admin_client_update
before insert or update of is_platform_admin on public.usuarios
for each row
execute function public.prevent_is_platform_admin_client_update();

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = p_user_id
      and u.ativo is true
      and (
        u.is_platform_admin is true
        or u.papel in ('super_admin', 'platform_admin')
      )
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated;

create or replace function public.set_platform_admin_by_email(
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
    raise exception 'Apenas operacoes internas podem alterar is_platform_admin.';
  end if;

  perform set_config('app.internal_operation', 'true', true);

  update public.usuarios as u
  set is_platform_admin = p_enabled
  from auth.users as au
  where u.id = au.id
    and lower(au.email) = lower(p_email);

  get diagnostics affected_rows = row_count;
  return affected_rows;
end;
$$;

revoke all on function public.set_platform_admin_by_email(text, boolean) from public;
revoke all on function public.set_platform_admin_by_email(text, boolean) from anon;
revoke all on function public.set_platform_admin_by_email(text, boolean) from authenticated;

do $$
begin
  if to_regclass('public.fazendas') is not null then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fazendas' and policyname = 'platform_admin_select_fazendas') then
      execute 'create policy platform_admin_select_fazendas on public.fazendas for select to authenticated using (public.is_platform_admin(auth.uid()))';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fazendas' and policyname = 'platform_admin_insert_fazendas') then
      execute 'create policy platform_admin_insert_fazendas on public.fazendas for insert to authenticated with check (public.is_platform_admin(auth.uid()))';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fazendas' and policyname = 'platform_admin_update_fazendas') then
      execute 'create policy platform_admin_update_fazendas on public.fazendas for update to authenticated using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()))';
    end if;
  end if;

  if to_regclass('public.convites') is not null then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'convites' and policyname = 'platform_admin_select_convites') then
      execute 'create policy platform_admin_select_convites on public.convites for select to authenticated using (public.is_platform_admin(auth.uid()))';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'convites' and policyname = 'platform_admin_insert_convites') then
      execute 'create policy platform_admin_insert_convites on public.convites for insert to authenticated with check (public.is_platform_admin(auth.uid()))';
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'convites' and policyname = 'platform_admin_update_convites') then
      execute 'create policy platform_admin_update_convites on public.convites for update to authenticated using (public.is_platform_admin(auth.uid())) with check (public.is_platform_admin(auth.uid()))';
    end if;
  end if;

  if to_regclass('public.usuarios') is not null then
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'usuarios' and policyname = 'platform_admin_select_usuarios') then
      execute 'create policy platform_admin_select_usuarios on public.usuarios for select to authenticated using (public.is_platform_admin(auth.uid()))';
    end if;
  end if;
end $$;

grant select, insert, update on public.fazendas to authenticated;
grant select, insert, update on public.convites to authenticated;
grant select on public.usuarios to authenticated;
