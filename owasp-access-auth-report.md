# OWASP Access/Auth Report

Data: 2026-06-05

Escopo: revisao do bloco OWASP Top 10 ligado a Broken Access Control e Identification and Authentication Failures no projeto Rancho.

## Resumo executivo

Foram revisados os fluxos de autenticacao, autorizacao por papel, isolamento por fazenda, RLS/Supabase, rotas server-side com service role e entrada do bot de WhatsApp. A aplicacao ja tinha boas protecoes principais: login fechado por convite, bloqueio de cadastro publico, `AuthGate` nas telas autenticadas, permissoes por papel e checagem de fazenda ativa/usuario ativo.

As correcoes aplicadas foram minimas e focadas em defesa em profundidade:

- Sessao do bot de WhatsApp agora e carregada por telefone e fazenda.
- Operacoes genericas de atualizar/excluir agora aceitam contexto de fazenda e aplicam `fazenda_id` em tabelas multi-fazenda.
- Telas e servicos principais passaram a enviar esse contexto nas atualizacoes/exclusoes.
- Rotas server-side de exclusao com service role agora tambem escopam limpezas auxiliares por fazenda.
- Teste do bot cobre sessao antiga do mesmo telefone em outro rancho.

## Autenticacao

Arquivos revisados:

- `src/lib/auth-context.tsx`
- `src/components/auth/AuthGate.tsx`
- `src/components/layout/AppShell.tsx`
- `src/app/login/page.tsx`
- `src/app/register/page.tsx`
- `src/app/api/auth/register/route.ts`

Observacoes:

- O usuario autenticado vem do Supabase Auth.
- O perfil em `usuarios` e carregado pelo `id` do usuario autenticado.
- Usuarios inativos, sem perfil, `bot_only` e fazendas inativas sao bloqueados.
- Cadastro publico esta fechado: `/register` redireciona e `/api/auth/register` retorna 403.
- Recuperacao de senha usa URL de redirect centralizada em server/client helper.

Sem alteracao aplicada nesse bloco.

## Permissoes

Arquivos revisados:

- `src/lib/permissions.ts`
- `src/components/auth/AuthGate.tsx`
- telas de modulos, estoque, funcionarios, genealogia, configuracoes e WhatsApp

Observacoes:

- Dono/admin/gerente sao tratados como papeis de gestao.
- Funcionario comum nao ve financeiro, funcionarios, folha, WhatsApp, admin e configuracoes sensiveis.
- `bot_only` nao acessa o painel.
- As telas ja bloqueiam acoes de escrita com `canManageData`.

Correcao aplicada:

- Chamadas de update/delete nas principais telas agora passam `dataContext`, permitindo que o service de CRUD adicione `fazenda_id` nas tabelas multi-fazenda.

## Isolamento por fazenda

Arquivos alterados:

- `src/services/crud.ts`
- `src/components/modules/ModuleScreen.tsx`
- `src/components/modules/StockScreen.tsx`
- `src/components/modules/GenealogyScreen.tsx`
- `src/components/modules/employees/EmployeeScreen.tsx`
- `src/components/modules/employees/EmployeeDetails.tsx`
- `src/components/layout/NotificationsMenu.tsx`
- `src/app/(app)/configuracoes/page.tsx`
- `src/app/(app)/whatsapp/page.tsx`
- `src/services/stock.ts`
- `src/services/event-finance.ts`
- `src/services/production-stock.ts`
- `src/services/animal-lifecycle.ts`
- `src/services/whatsapp-users.ts`

Antes:

- `listRecords` ja filtrava por `fazenda_id` quando recebia contexto.
- `createRecord` ja inseria `fazenda_id` em tabelas multi-fazenda.
- `updateRecord`, `deleteRecord` e `deleteRecords` atuavam por `id`/filtros e dependiam principalmente de RLS.

Depois:

- `updateRecord`, `deleteRecord` e `deleteRecords` recebem `DataContext`.
- Se a tabela esta em `FARM_SCOPED_TABLES` e existe `fazendaId`, o filtro `fazenda_id` e aplicado tambem na operacao.
- O mock local respeita o mesmo escopo.

## RLS/Supabase

Arquivos revisados:

- `src/lib/supabase/browser.ts`
- `src/lib/supabase/admin.ts`
- `supabase/migrations/20260602002000_allow_owner_manage_farm_data.sql`

Observacoes:

- Client usa apenas anon key publica.
- Service role fica no server-side.
- Nao foi encontrada exposicao de service role no client.
- Migration revisada habilita RLS nas tabelas criticas e usa helpers de membro/gestao de fazenda.
- Nao foi feita alteracao destrutiva de schema.
- Nao foi criada policy permissiva.
- RLS nao foi desativado.

Recomendacao futura:

- Se houver migration propria para sessoes de WhatsApp, considerar indice/constraint por `(fazenda_id, telefone_e164)` para refletir o escopo logico usado no backend.

## Rotas server-side

Arquivos revisados/alterados:

- `src/app/api/animals/delete/route.ts`
- `src/app/api/production/delete/route.ts`
- `src/app/api/invitations/*/route.ts`
- `src/app/api/whatsapp/testar-bot/route.ts`
- `src/app/api/whatsapp/send-test/route.ts`
- `src/app/api/twilio/webhook/route.ts`
- `src/app/api/whatsapp/webhook/route.ts`

Observacoes:

- Rotas de convite validam bearer token, perfil ativo, papel de gestao e fazenda ativa.
- Simulador do WhatsApp exige usuario interno autorizado e numero ativo na mesma fazenda.
- Webhooks do WhatsApp resolvem dono/numero autorizado antes de processar.

Correcao aplicada:

- Limpezas auxiliares nas rotas de excluir animal/producao agora recebem `farmId` e aplicam `fazenda_id` onde possivel.

## Bot WhatsApp

Arquivos revisados/alterados:

- `src/services/whatsapp/identity.ts`
- `src/services/whatsapp/twilio.ts`
- `scripts/test-bot.cjs`

Observacoes:

- O bot resolve o dono/usuario pelo telefone autorizado.
- Numeros nao autorizados, fazenda inativa e usuario sem permissao sao bloqueados.
- Fluxo de teste usa mock/dry-run, sem WhatsApp real.
- Escritas reais continuam bloqueadas em `modoTeste`.

Finding corrigido:

- `getSession` buscava sessao por `telefone_e164` sem `fazenda_id`.
- Agora busca por `telefone_e164` e `fazenda_id`.
- Teste novo: sessao antiga com mesmo telefone em outro rancho nao e reaproveitada.

## Testes

Comandos executados:

- `npm run test:bot`
  - Total: 1093
  - Aprovados: 1093
  - Falhos: 0
- `npm run lint`
  - Sem warnings ou erros.
- `npm run build`
  - Build de producao concluido com sucesso.

## Findings

Corrigidos:

- Sessao do WhatsApp podia ser carregada por telefone sem validar fazenda.
- CRUD generico de update/delete podia depender apenas de RLS quando o chamador ja tinha contexto de fazenda disponivel.
- Limpezas auxiliares server-side com service role em exclusoes podiam ser mais explicitamente escopadas por fazenda.

Sem evidencia de problema no escopo revisado:

- Cadastro publico aberto.
- Service role exposto no client.
- RLS desativado.
- Policies amplamente permissivas no arquivo de RLS revisado.
- Bot escrevendo dados reais em modo de teste.

## Recomendacoes

- Adicionar testes especificos para as rotas `/api/animals/delete` e `/api/production/delete` com dados de duas fazendas.
- Avaliar constraint unica composta para sessoes de WhatsApp por fazenda/telefone em migration futura nao destrutiva.
- Manter qualquer nova rota server-side com service role exigindo: usuario autenticado, perfil ativo, papel permitido e `fazenda_id` em selects/updates/deletes.
- Evitar novas operacoes client-side de update/delete sem `DataContext`.
