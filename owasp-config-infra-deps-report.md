# OWASP bloco 3 - Configuracao, infraestrutura e dependencias

Data: 2026-06-05

## Escopo

Auditoria incremental focada em configuracao segura, dependencias, SSRF, variaveis de ambiente, webhooks/CORS, modo demo/teste, Supabase e compatibilidade com Vercel.

Nao foram feitas alteracoes em RLS, policies, migrations, dados reais, Twilio real, deploy, commits ou push.

## Itens verificados

- Arquivos de configuracao: `.env.example`, `next.config.mjs`, `package.json`, `package-lock.json`.
- Variaveis e clientes Supabase: `src/lib/env.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/admin.ts`.
- Rotas e servicos com comunicacao externa: APIs de WhatsApp/Twilio, Gemini, Meta Graph e envio de teste.
- Uso de CORS: nao foi encontrado `Access-Control-Allow-Origin: *` em rotas sensiveis.
- Uso de Storage/upload: nao foi encontrado fluxo ativo de upload Supabase Storage neste bloco.
- SSRF: chamadas server-side usam URLs fixas de provedores conhecidos; nao foi encontrado `fetch` server-side para URL arbitraria recebida do usuario.

## Correcoes aplicadas

### Headers de seguranca

Foi adicionada configuracao central em `next.config.mjs` para enviar headers basicos:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy` restritiva
- CSP conservadora compativel com o app atual, Supabase, Gemini, Meta Graph e Twilio

A CSP ficou propositalmente conservadora para nao quebrar o frontend atual. Endurecimentos mais agressivos, como remover `unsafe-inline`/`unsafe-eval`, devem ser tratados em uma rodada propria.

### Modo demo

O fallback demo do cliente Supabase agora fica permitido apenas em desenvolvimento/teste ou quando `NEXT_PUBLIC_ENABLE_DEMO=true`.

Em producao, se o Supabase publico nao estiver configurado, o app nao deve entrar silenciosamente em perfil demo.

### Variaveis de ambiente

`.env.example` foi reorganizado para separar variaveis publicas de variaveis server-only e incluir avisos para nao colocar tokens/secrets em variaveis `NEXT_PUBLIC_*`.

Nenhum valor real de `.env.local` foi lido ou exposto.

### Envio de teste WhatsApp

A rota `/api/whatsapp/send-test` recebeu validacoes pequenas:

- aceita apenas `application/json`
- rejeita mensagem excessiva
- sanitiza telefone e mensagem antes do envio
- melhora log de erro sem expor payload sensivel

O servico outbound tambem passou a redigir mensagem de erro vinda da Twilio antes de logar.

### Dependencias

Atualizacoes seguras aplicadas sem `--force`:

- `next`: `14.2.35`
- `eslint-config-next`: `14.2.35`
- `postcss`: `8.5.15`
- `@supabase/supabase-js`: `2.107.0`

## Risco residual

`npm audit --audit-level=moderate` ainda retorna 5 vulnerabilidades, principalmente relacionadas ao ecossistema Next 14 e dependencias transitivas.

O proprio `npm audit` indica correcao apenas com:

```bash
npm audit fix --force
```

Isso instalaria `next@16.2.7` e `eslint-config-next@16.2.7`, uma mudanca major/breaking. Por seguranca, essa atualizacao nao foi aplicada neste bloco.

Recomendacao: planejar uma migracao separada para Next 16, com testes de regressao de telas, rotas API, auth Supabase e deploy Vercel.

## Validacao

Comandos executados:

```bash
npm run test:bot
```

Resultado: passou, 1104/1104 testes aprovados.

```bash
npm run lint
```

Resultado: passou, sem warnings ou erros.

```bash
npm run build
```

Resultado: passou, build de producao gerado com sucesso.

```bash
npm audit --audit-level=moderate
```

Resultado: falhou com vulnerabilidades residuais que exigem upgrade major para Next 16 via `--force`.

## Confirmacoes

- Nao foi desativado RLS.
- Nao foram alteradas policies.
- Nao foram criadas migrations.
- Nao houve alteracao destrutiva.
- Nao foram apagados dados.
- Nao foram expostos secrets.
- Nao foi enviado WhatsApp real durante a validacao.
- Nao foi feito commit ou push.
