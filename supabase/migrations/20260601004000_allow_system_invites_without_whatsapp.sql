alter table if exists public.funcionarios
  alter column contato_whatsapp drop not null;

comment on column public.funcionarios.contato_whatsapp is
  'WhatsApp do funcionario. Pode ficar vazio em convites de acesso ao sistema, porque o funcionario pode usar apenas login no painel.';
