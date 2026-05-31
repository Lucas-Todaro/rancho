-- Campos persistentes para a tela de Configuracoes.
-- Seguro para rodar mais de uma vez no SQL Editor do Supabase.

alter table public.fazendas
  add column if not exists responsavel text,
  add column if not exists telefone_contato text,
  add column if not exists cidade text,
  add column if not exists estado text,
  add column if not exists descricao text,
  add column if not exists configuracoes jsonb not null default '{}'::jsonb,
  add column if not exists notificacoes jsonb not null default '{
    "estoque_baixo": true,
    "financeiro": true,
    "producao": true,
    "ponto_funcionarios": true,
    "whatsapp": false
  }'::jsonb,
  add column if not exists whatsapp_config jsonb not null default '{
    "bot_ativo": true,
    "numero_conectado": null,
    "mensagem_boas_vindas": "Bem-vindo ao Rancho. Escolha uma opcao para continuar."
  }'::jsonb;

alter table public.usuarios
  add column if not exists cpf text,
  add column if not exists cargo text,
  add column if not exists preferencias jsonb not null default '{
    "moeda": "BRL",
    "formato_data": "DD/MM/AAAA",
    "unidade_leite": "litros",
    "unidade_peso": "kg",
    "tema": "sistema",
    "tela_inicial": "/dashboard"
  }'::jsonb;

comment on column public.fazendas.configuracoes is 'Preferencias gerais da propriedade usadas pelo Rancho.';
comment on column public.fazendas.notificacoes is 'Preferencias de alertas e notificacoes da propriedade.';
comment on column public.fazendas.whatsapp_config is 'Preferencias do atendimento WhatsApp/chatbot, sem armazenar secrets.';
comment on column public.usuarios.preferencias is 'Preferencias individuais do usuario no Rancho.';
