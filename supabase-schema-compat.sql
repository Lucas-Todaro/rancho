-- Rancho Pro espera o schema em portugues enviado pelo usuario.
-- Este arquivo nao recria as tabelas; ele deixa lembretes uteis para projetos
-- que ja aplicaram o schema principal no Supabase.

-- Realtime opcional para as telas atualizarem automaticamente.
alter publication supabase_realtime add table public.lotes;
alter publication supabase_realtime add table public.animais;
alter publication supabase_realtime add table public.eventos_animal;
alter publication supabase_realtime add table public.ordenhas;
alter publication supabase_realtime add table public.estoque_itens;
alter publication supabase_realtime add table public.transacoes_financeiras;
alter publication supabase_realtime add table public.funcionarios;
alter publication supabase_realtime add table public.registros_ponto;
alter publication supabase_realtime add table public.folha_pagamento;
alter publication supabase_realtime add table public.alertas;

-- Permite excluir um item de estoque junto com seu historico de movimentacoes.
-- Se o schema principal criou a FK sem cascade, a exclusao do item falha com:
-- estoque_movimentacoes_item_id_fkey.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'estoque_movimentacoes'
      and constraint_name = 'estoque_movimentacoes_item_id_fkey'
  ) then
    alter table public.estoque_movimentacoes
      drop constraint estoque_movimentacoes_item_id_fkey;
  end if;

  alter table public.estoque_movimentacoes
    add constraint estoque_movimentacoes_item_id_fkey
    foreign key (item_id)
    references public.estoque_itens(id)
    on delete cascade;
end $$;
--o
-- Para o login funcionar com RLS, cada auth.users.id precisa ter uma linha em public.usuarios.
-- Exemplo, ajuste os IDs antes de executar:
--
-- insert into public.usuarios (id, fazenda_id, nome, telefone, papel, ativo)
-- values (
--   'AUTH_USER_ID_AQUI',
--   'FAZENDA_ID_AQUI',
--   'Administrador',
--   '5585999990000',
--   'admin',
--   true
-- );

-- Para o WhatsApp descobrir a fazenda pelo telefone:
--
-- insert into public.whatsapp_usuarios (fazenda_id, telefone_e164, usuario_id, nome_exibicao, papel_bot, ativo)
-- values (
--   'FAZENDA_ID_AQUI',
--   '5585999990000',
--   'AUTH_USER_ID_AQUI',
--   'Administrador',
--   'admin',
--   true
-- );
