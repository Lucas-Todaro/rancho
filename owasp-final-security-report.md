# Relatorio final OWASP - Design seguro, logs e monitoramento

Data: 2026-06-05

## Escopo

Bloco 4 de seguranca OWASP no Rancho, focado em Insecure Design, Security Logging and Monitoring Failures e revisao final dos blocos anteriores.

Nao foram alterados RLS, policies, schema do banco, migrations, autenticacao de base, deploy, dados reais, commit ou push.

## Fluxos criticos mapeados

- Login, logout e reset de senha: usam Supabase Auth; erros passam por mensagens amigaveis.
- Convites e criacao de usuario: rotas server-side revalidam permissao e fazenda.
- Troca/contexto de rancho: bot e APIs usam `fazenda_id`/`rancho_id` nas consultas e sessoes.
- Rebanho: cadastro, edicao, exclusao, morte/venda e bloqueio de animal morto/inativo.
- Producao de leite: exige confirmacao no bot antes de salvar; exclusao usa API com permissao.
- Estoque: criacao de item, entrada, baixa, compra e estoque negativo validam dados e permissao.
- Financeiro: receita/despesa e correcoes exigem confirmacao no bot; calculos aceitam formatos antigos e novos.
- Funcionarios, desligamento, exclusao e salario: acoes sensiveis exigem permissao de admin/dono e confirmacao.
- Ponto e folha: ponto pode ser registrado pelo bot conforme permissao; folha/salario sao tratados como sensiveis.
- Eventos, vacinas, medicamentos, genealogia e lotes: alteracoes exigem confirmacao; consultas nao salvam.
- Configuracoes e WhatsApp autorizado: areas protegidas; simulador exige usuario interno autorizado.
- Bot WhatsApp: confirma, cancela, corrige, bloqueia comandos perigosos, isola por telefone + fazenda e expira sessoes.
- Relatorios/consultas sensiveis: consultas filtram por fazenda e permissao.

## Riscos encontrados e correcoes

### Logs com telefone completo

Risco: logs de autenticacao do bot e webhook Twilio exibiam telefone bruto/normalizado.

Correcao:

- `src/services/whatsapp/identity.ts` agora mascara `fromRaw` e `normalized`.
- `src/app/api/twilio/webhook/route.ts` agora mascara `From` e `To` no console.
- `src/lib/security.ts` ganhou mascaramento reutilizavel para telefone.

### Redacao incompleta de dados sensiveis em erros tecnicos

Risco: `safeErrorText` ja redigia secrets/tokens, mas nao mascarava CPF, telefone e e-mail.

Correcao:

- `redactSensitiveText` agora mascara CPF, e-mail e telefone.
- Testes cobrem telefone, CPF, e-mail, token e senha em texto tecnico.

### Sessao expirada do bot sem teste explicito

Risco: o bot ja ignorava `expira_em` vencido, mas nao havia teste explicito para confirmacao antiga.

Correcao:

- `scripts/test-bot.cjs` agora permite mockar `expira_em`.
- Novo teste garante que `sim` em sessao expirada nao salva.

## Barreiras validadas

- Acoes criticas pelo bot exigem confirmacao antes de salvar.
- `cancelar` limpa fluxo pendente e nao salva.
- `corrigir` substitui dados pendentes e exige nova confirmacao.
- Confirmacao duplicada nao gera salvamento duplicado.
- Permissao e fazenda sao revalidadas antes do salvamento.
- Numero nao autorizado, inativo, sem fazenda ou em mais de um rancho e bloqueado.
- Mensagem longa e comando operacional perigoso sao bloqueados antes do parser principal.
- Dry-run/test mode nao envia WhatsApp real e nao grava dados de negocio quando `salvarReal=false`.

## Defesas do bot contra abuso

- Tamanho maximo de mensagem em `MAX_WHATSAPP_MESSAGE_LENGTH`.
- Sanitizacao de texto livre antes do processamento.
- Bloqueio de comandos como SQL, service role, token, bypass de permissao/RLS e auto-promocao para admin.
- Sessao isolada por telefone normalizado e `fazenda_id`.
- Sessao pendente salva com `expira_em`.
- Confirmacao sem contexto nao salva.
- Acoes bloqueadas nao criam confirmacao valida.

## Logs auditados

Pontos revisados:

- `console.log`, `console.error` e `console.warn` em rotas API, servicos WhatsApp, bot, Gemini e scripts.
- Logs do bot: auth, fluxo, parser, animal check, webhook e outbound.
- `whatsapp_mensagens`, `notificacoes` e `auditoria_logs` como trilhas operacionais.
- Catch blocks em rotas serverless/API.

Dados sensiveis tratados:

- Tokens/JWT/secrets: redigidos como `[redacted]`.
- Telefone: mascarado como `+55******9999` ou `******9999`.
- CPF: mascarado como `***.***.***-09`.
- E-mail: mascarado como `he***@dominio.com`.
- Senha/password em mensagens tecnicas: redigido.

## Erros amigaveis

Padrao validado:

- Usuario final recebe mensagem em portugues, sem SQL, stack trace, JWT, schema cache ou payload tecnico.
- Log tecnico fica no servidor usando `safeErrorText`.
- Rotas sensiveis retornam mensagem generica para falha interna.

## Eventos de seguranca registrados

Hoje ficam rastros em logs server-side e/ou tabelas existentes para:

- Numero WhatsApp nao autorizado, inativo, sem rancho ou duplicado.
- Tentativa de comando operacional perigoso no bot.
- Falha de processamento do bot.
- Falha ao salvar mensagem WhatsApp.
- Confirmacao e atualizacao de sessao do bot.
- Acoes salvas pelo bot via `auditoria_logs`.
- Notificacoes internas para registros do bot quando aplicavel.

Pendencia futura: criar tabela dedicada de auditoria de seguranca para eventos como login falho, acesso negado, alteracao de permissao e tentativas suspeitas, com retencao e painel administrativo. Nao foi criada neste bloco para evitar migration e diff grande.

## Notificacoes e monitoramento operacional

Validado no codigo:

- Sucesso do bot cria notificacao por fazenda quando aplicavel.
- Falhas de notificacao sao logadas sem bloquear o fluxo principal.
- Acoes bloqueadas nao geram notificacao de sucesso.
- Notificacoes usam `fazenda_id` e dedupe quando aplicavel.

## Revisao dos blocos anteriores

- Controle de acesso: rotas internas e simulador exigem permissao; bot revalida permissao antes de salvar.
- Autenticacao: login/reset seguem Supabase; fallback demo foi restringido no bloco 3.
- Injection/integridade: entradas do bot sao sanitizadas; comandos perigosos sao bloqueados.
- Config/deps/SSRF: headers e `.env.example` ajustados no bloco 3; SSRF com URL arbitraria nao encontrado.
- Logs: este bloco removeu telefone completo de logs e ampliou redacao.

## Checklist OWASP dos 4 blocos

| Item | Status | Observacao | Area principal |
| --- | --- | --- | --- |
| Broken Access Control | Corrigido | Permissoes e fazenda revalidadas em APIs/bot; RLS nao alterado. | `src/lib/server/*`, `src/services/whatsapp/*` |
| Identification and Authentication Failures | Corrigido | Supabase Auth mantido; simulador protegido; demo restrito em producao. | `src/lib/auth-context.tsx`, `src/lib/supabase/browser.ts` |
| Cryptographic Failures | Ok | Nenhum secret exposto; env server-only preservado. | `src/lib/env.ts`, `.env.example` |
| Injection | Corrigido | Sanitizacao e bloqueio de comandos perigosos no bot. | `src/lib/security.ts`, `src/services/whatsapp/twilio.ts` |
| Software and Data Integrity Failures | Corrigido | Dry-run, confirmacao, validacao de payload e relatorios dos blocos anteriores. | `scripts/test-bot.cjs`, `src/services/whatsapp/twilio.ts` |
| Security Misconfiguration | Corrigido | Headers de seguranca e demo fallback controlado. | `next.config.mjs`, `.env.example` |
| Vulnerable and Outdated Components | Pendente | Updates seguros aplicados; `npm audit` ainda exige Next 16 via `--force`. | `package.json`, `package-lock.json` |
| SSRF | Ok | Nao encontrado fetch server-side para URL arbitraria de usuario. | APIs/servicos externos |
| Insecure Design | Corrigido | Confirmacao, cancelamento, correcao, permissao e sessao expirada cobertos. | `src/services/whatsapp/twilio.ts`, `scripts/test-bot.cjs` |
| Security Logging and Monitoring Failures | Corrigido parcial | Logs mascarados; pendente tabela dedicada de eventos de seguranca. | `src/lib/security.ts`, bot/webhooks |

## Testes executados

```bash
npm run test:bot
```

Resultado: passou, 1108/1108.

```bash
npm run lint
```

Resultado: passou, sem warnings ou erros.

```bash
npm run build
```

Resultado: passou, build de producao gerado com sucesso.

## Falhas restantes

- `npm audit` do bloco 3 permanece com vulnerabilidades residuais ligadas principalmente ao Next 14/transitivas. A correcao automatica exige `npm audit fix --force` para Next 16, uma mudanca major. Deve ser planejada separadamente.
- Monitoramento centralizado/auditoria de seguranca dedicada ainda e recomendacao futura, pois exigiria schema/migration.

## Confirmacoes finais

- RLS nao foi desativado.
- Nenhuma policy permissiva foi criada.
- Service role, tokens, JWTs, cookies e senhas nao foram expostos.
- Logs revisados nao devem expor telefone completo, CPF completo, e-mail completo ou secrets.
- Nenhuma mensagem real foi enviada pelo WhatsApp durante os testes.
- Nenhum dado real de producao foi gravado em teste destrutivo.
- Nao houve commit, push, deploy ou migration.
