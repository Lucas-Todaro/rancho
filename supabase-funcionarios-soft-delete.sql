-- Permite excluir funcionario da lista sem apagar historico de ponto/folha.
-- Seguro para rodar mais de uma vez no SQL Editor do Supabase.

alter table public.funcionarios
  add column if not exists deleted_at timestamptz;

create index if not exists funcionarios_fazenda_deleted_at_idx
  on public.funcionarios (fazenda_id, deleted_at);
