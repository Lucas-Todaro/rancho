# Rancho Pro

Aplicacao web para gestao agropecuaria integrada ao schema Supabase enviado.

## O que vem pronto

- Next.js, React, TypeScript e Tailwind CSS
- Login com Supabase Auth
- Contexto de fazenda pela tabela `usuarios`
- Dashboard com indicadores reais
- CRUD de lotes, rebanho, eventos, ordenhas, estoque, financeiro, funcionarios, ponto e folha
- Relatorios imprimiveis
- Central WhatsApp com webhook Meta Cloud API
- Modo demo quando o Supabase nao esta configurado

## Tabelas usadas

O app esta mapeado para as tabelas:

`fazendas`, `usuarios`, `lotes`, `animais`, `eventos_animal`, `ordenhas`, `estoque_itens`, `estoque_movimentacoes`, `transacoes_financeiras`, `funcionarios`, `registros_ponto`, `folha_pagamento`, `whatsapp_usuarios`, `whatsapp_sessoes`, `whatsapp_mensagens`, `alertas` e `auditoria_logs`.

O mapa central fica em `src/lib/tables.ts`.

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`.

## Variaveis principais

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DEFAULT_FAZENDA_ID=
WHATSAPP_VERIFY_TOKEN=
META_WHATSAPP_TOKEN=
META_PHONE_NUMBER_ID=
```

`SUPABASE_DEFAULT_FAZENDA_ID` e opcional, mas ajuda o webhook do WhatsApp quando um telefone ainda nao esta cadastrado em `whatsapp_usuarios`.

## WhatsApp

Depois do deploy, configure na Meta:

```txt
https://SEU-PROJETO.vercel.app/api/whatsapp/webhook
```

O fluxo atual registra:

- ordenhas em `ordenhas`
- animais em `animais`
- entradas/saidas em `transacoes_financeiras`
- estado da conversa em `whatsapp_sessoes`
- auditoria em `auditoria_logs`

## Observacao de seguranca

Use `NEXT_PUBLIC_SUPABASE_ANON_KEY` no frontend. A `SUPABASE_SERVICE_ROLE_KEY` fica somente em rotas de backend e nunca deve ser exposta no navegador.
