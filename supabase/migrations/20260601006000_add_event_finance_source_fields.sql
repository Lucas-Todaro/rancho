alter table public.transacoes_financeiras
  add column if not exists source_type text null,
  add column if not exists source_id uuid null;

create index if not exists transacoes_financeiras_source_idx
  on public.transacoes_financeiras (fazenda_id, source_type, source_id);

create unique index if not exists transacoes_financeiras_evento_animal_source_unique
  on public.transacoes_financeiras (fazenda_id, source_type, source_id)
  where source_type = 'evento_animal'
    and source_id is not null;
