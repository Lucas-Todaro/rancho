-- Campos opcionais de nome e genealogia dos animais.
alter table public.animais
  add column if not exists nome text null,
  add column if not exists mae_id uuid null,
  add column if not exists pai_id uuid null,
  add column if not exists genealogia_observacoes text null;

do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'animais'
      and constraint_name = 'animais_mae_id_fkey'
  ) then
    alter table public.animais
      add constraint animais_mae_id_fkey
      foreign key (mae_id)
      references public.animais(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'animais'
      and constraint_name = 'animais_pai_id_fkey'
  ) then
    alter table public.animais
      add constraint animais_pai_id_fkey
      foreign key (pai_id)
      references public.animais(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'animais'
      and constraint_name = 'animais_mae_nao_self_check'
  ) then
    alter table public.animais
      add constraint animais_mae_nao_self_check
      check (mae_id is null or mae_id <> id);
  end if;

  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'animais'
      and constraint_name = 'animais_pai_nao_self_check'
  ) then
    alter table public.animais
      add constraint animais_pai_nao_self_check
      check (pai_id is null or pai_id <> id);
  end if;
end $$;

create index if not exists animais_fazenda_nome_idx on public.animais (fazenda_id, nome);
create index if not exists animais_mae_id_idx on public.animais (mae_id);
create index if not exists animais_pai_id_idx on public.animais (pai_id);

-- Notificacoes internas criadas quando o bot salva registros reais.
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  fazenda_id uuid not null references public.fazendas(id) on delete cascade,
  usuario_id uuid null references public.usuarios(id) on delete set null,
  ator_nome text null,
  ator_telefone text null,
  tipo text not null,
  titulo text not null,
  mensagem text not null,
  entidade_tipo text null,
  entidade_id uuid null,
  origem text not null default 'bot',
  dedupe_key text null,
  lida_em timestamptz null,
  created_at timestamptz not null default now()
);

create unique index if not exists notificacoes_dedupe_key_idx
  on public.notificacoes (dedupe_key)
  where dedupe_key is not null;

create index if not exists notificacoes_fazenda_created_at_idx
  on public.notificacoes (fazenda_id, created_at desc);

create index if not exists notificacoes_fazenda_lida_idx
  on public.notificacoes (fazenda_id, lida_em);

alter table public.notificacoes enable row level security;

drop policy if exists "notificacoes_select_mesma_fazenda" on public.notificacoes;
create policy "notificacoes_select_mesma_fazenda"
  on public.notificacoes
  for select
  using (
    exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.fazenda_id = notificacoes.fazenda_id
        and u.ativo = true
    )
  );

drop policy if exists "notificacoes_update_mesma_fazenda" on public.notificacoes;
create policy "notificacoes_update_mesma_fazenda"
  on public.notificacoes
  for update
  using (
    exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.fazenda_id = notificacoes.fazenda_id
        and u.ativo = true
    )
  )
  with check (
    exists (
      select 1
      from public.usuarios u
      where u.id = auth.uid()
        and u.fazenda_id = notificacoes.fazenda_id
        and u.ativo = true
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.notificacoes;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
