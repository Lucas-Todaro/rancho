alter table if exists public.ordenhas
  add column if not exists estoque_item_id uuid null references public.estoque_itens(id) on delete set null;

alter table if exists public.estoque_movimentacoes
  add column if not exists source_type text null,
  add column if not exists source_id uuid null;

create index if not exists estoque_movimentacoes_source_idx
  on public.estoque_movimentacoes (fazenda_id, source_type, source_id);
