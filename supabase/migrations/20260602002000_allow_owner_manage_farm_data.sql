create or replace function public.rancho_is_farm_member(
  p_fazenda_id uuid,
  p_user_id uuid default auth.uid()
)
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
      and u.fazenda_id = p_fazenda_id
      and coalesce(u.ativo, true) is true
  );
$$;

create or replace function public.rancho_can_manage_farm(
  p_fazenda_id uuid,
  p_user_id uuid default auth.uid()
)
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
      and u.fazenda_id = p_fazenda_id
      and coalesce(u.ativo, true) is true
      and u.papel::text in ('dono', 'admin', 'gerente')
  );
$$;

revoke all on function public.rancho_is_farm_member(uuid, uuid) from public;
revoke all on function public.rancho_can_manage_farm(uuid, uuid) from public;
grant execute on function public.rancho_is_farm_member(uuid, uuid) to authenticated;
grant execute on function public.rancho_can_manage_farm(uuid, uuid) to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'lotes',
    'animais',
    'eventos_animal',
    'ordenhas',
    'estoque_itens',
    'estoque_movimentacoes',
    'transacoes_financeiras',
    'funcionarios',
    'registros_ponto',
    'folha_pagamento',
    'whatsapp_usuarios',
    'whatsapp_sessoes',
    'whatsapp_mensagens',
    'notificacoes',
    'alertas',
    'auditoria_logs'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = 'fazenda_id'
      ) then
      execute format('alter table public.%I enable row level security', target_table);
      execute format('grant select, insert, update, delete on public.%I to authenticated', target_table);

      execute format('drop policy if exists rancho_farm_select on public.%I', target_table);
      execute format(
        'create policy rancho_farm_select on public.%I for select to authenticated using (public.rancho_is_farm_member(fazenda_id))',
        target_table
      );

      execute format('drop policy if exists rancho_farm_insert on public.%I', target_table);
      execute format(
        'create policy rancho_farm_insert on public.%I for insert to authenticated with check (public.rancho_can_manage_farm(fazenda_id))',
        target_table
      );

      execute format('drop policy if exists rancho_farm_update on public.%I', target_table);
      execute format(
        'create policy rancho_farm_update on public.%I for update to authenticated using (public.rancho_can_manage_farm(fazenda_id)) with check (public.rancho_can_manage_farm(fazenda_id))',
        target_table
      );

      execute format('drop policy if exists rancho_farm_delete on public.%I', target_table);
      execute format(
        'create policy rancho_farm_delete on public.%I for delete to authenticated using (public.rancho_can_manage_farm(fazenda_id))',
        target_table
      );
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.fazendas') is not null then
    alter table public.fazendas enable row level security;
    grant select, update on public.fazendas to authenticated;

    drop policy if exists rancho_farm_select on public.fazendas;
    create policy rancho_farm_select
      on public.fazendas
      for select
      to authenticated
      using (public.rancho_is_farm_member(id));

    drop policy if exists rancho_farm_update on public.fazendas;
    create policy rancho_farm_update
      on public.fazendas
      for update
      to authenticated
      using (public.rancho_can_manage_farm(id))
      with check (public.rancho_can_manage_farm(id));
  end if;
end $$;

create or replace function public.prevent_usuarios_access_client_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('role', true), '') not in ('service_role', 'postgres', 'supabase_admin') then
    if old.fazenda_id is distinct from new.fazenda_id
      or old.papel is distinct from new.papel
      or old.ativo is distinct from new.ativo then
      raise exception 'Campos de acesso do usuario so podem ser alterados por operacoes internas.';
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.usuarios') is not null then
    alter table public.usuarios enable row level security;
    grant select, update on public.usuarios to authenticated;

    drop trigger if exists prevent_usuarios_access_client_update on public.usuarios;
    create trigger prevent_usuarios_access_client_update
      before update of fazenda_id, papel, ativo on public.usuarios
      for each row
      execute function public.prevent_usuarios_access_client_update();

    drop policy if exists rancho_usuarios_select on public.usuarios;
    create policy rancho_usuarios_select
      on public.usuarios
      for select
      to authenticated
      using (id = auth.uid() or public.rancho_is_farm_member(fazenda_id));

    drop policy if exists rancho_usuarios_update on public.usuarios;
    create policy rancho_usuarios_update
      on public.usuarios
      for update
      to authenticated
      using (id = auth.uid() or public.rancho_can_manage_farm(fazenda_id))
      with check (id = auth.uid() or public.rancho_can_manage_farm(fazenda_id));
  end if;
end $$;
