# Rancho Pro Full

Aplicação web completa para gestão agropecuária com painel administrativo, CRUD dos módulos principais e webhook para WhatsApp via Meta Cloud API.

## O que vem pronto

- Next.js + React + TypeScript + Tailwind CSS
- Dashboard responsivo com cards e gráficos CSS
- Gestão de rebanho
- Produção leiteira
- Estoque
- Financeiro
- Funcionários
- Folha de pagamento
- Relatórios
- Central WhatsApp
- Webhook `/api/whatsapp/webhook`
- Modo demo: abre com dados falsos mesmo sem Supabase configurado
- Integração Supabase: ao configurar `.env`, as telas passam a ler/inserir/deletar nas tabelas

## Rodar localmente

```bash
npm install
cp .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`.

## Deploy no Vercel

1. Suba o projeto no GitHub.
2. Importe no Vercel como projeto Next.js.
3. Cadastre as variáveis de ambiente do `.env.example` em Settings > Environment Variables.
4. Faça o deploy.

## Ajustar nomes de tabelas

O arquivo principal é:

```txt
src/lib/tables.ts
```

Se suas tabelas no Supabase tiverem nomes diferentes, altere ali. O sistema usa esse arquivo como mapa central.

## Webhook WhatsApp

Depois do deploy, configure na Meta:

```txt
https://SEU-PROJETO.vercel.app/api/whatsapp/webhook
```

O token de verificação precisa ser o mesmo valor de `WHATSAPP_VERIFY_TOKEN`.

## Observação importante

Este projeto já vem pronto para produção inicial, mas como suas tabelas Supabase já existem, talvez seja necessário ajustar nomes de colunas em `src/lib/tables.ts` e nos módulos. Também incluí o arquivo `supabase-schema-compat.sql` caso você queira criar uma estrutura compatível do zero.
