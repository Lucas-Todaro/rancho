# Performance Lazy Loading And Module Cache Report

Data: 2026-06-05

Escopo: otimizacao incremental de carregamento sob demanda e cache leve por modulo no app Rancho, sem alterar schema, RLS, autenticacao, permissoes ou regras de negocio.

## Auditoria

Arquivos auditados:

- `src/lib/auth-context.tsx`
- `src/services/crud.ts`
- `src/services/dashboard.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/relatorios/page.tsx`
- `src/components/modules/ModuleScreen.tsx`
- `src/components/modules/StockScreen.tsx`
- `src/components/modules/GenealogyScreen.tsx`
- `src/components/modules/AnimalDetailModal.tsx`
- `src/components/modules/employees/EmployeeScreen.tsx`
- `src/components/modules/employees/EmployeeDetails.tsx`
- `src/app/(app)/whatsapp/page.tsx`
- `src/components/layout/NotificationsMenu.tsx`

## Dados globais encontrados

O login/auth nao carregava listas completas de modulos. O `AuthProvider` busca apenas sessao, perfil, fazenda atual e observa alteracoes do perfil autenticado.

Fetches globais mantidos:

- sessao do usuario;
- perfil do usuario;
- fazenda atual;
- permissao/papel derivado do perfil;
- notificacoes globais no menu, com subscription propria.

## Dados sob demanda

As telas de modulo ja montavam sob demanda por rota. A melhoria aplicada foi impedir refetch desnecessario ao voltar para o modulo em curto prazo:

- Rebanho, Producao, Eventos, Financeiro, Lotes, Ponto e Folha via `ModuleScreen`;
- Estoque via `StockScreen`;
- Funcionarios, ponto e folha da equipe via `EmployeeScreen` e `EmployeeDetails`;
- Genealogia via `GenealogyScreen`;
- Ficha do animal via `AnimalDetailModal`;
- Numeros autorizados do WhatsApp via pagina de WhatsApp.

## Dashboard leve

Antes, `loadDashboardData` buscava listas completas com `select("*")` para animais, producao, estoque, financeiro, funcionarios, folha e alertas.

Depois, o Dashboard:

- busca apenas colunas necessarias para cards/graficos;
- limita producao ao mes atual;
- limita financeiro aos ultimos 6 meses;
- limita folha ao mes atual;
- mantem animais com campos minimos para contadores e ranking;
- usa cache curto de 30s para evitar repeticao imediata;
- continua renderizando skeleton enquanto carrega, sem mostrar zero como dado real.

## Cache por modulo

Implementado em `src/services/crud.ts`:

- cache opt-in por chamada (`cache: true`);
- chave inclui tabela, fazenda, usuario, ordenacao, select e filtros;
- TTL padrao de modulo: 60s;
- TTL do Dashboard: 30s;
- `forceRefresh` ignora cache para botao Atualizar, realtime e eventos de mudanca.

O cache e separado por `fazendaId` e `usuarioId`, evitando mistura entre ranchos.

## Invalidacao

Invalidacao automatica em:

- `createRecord`;
- `updateRecord`;
- `deleteRecord`;
- `deleteRecords`.

Invalidacao manual adicionada onde a mutacao passa por rota server-side ou por atualizacao indireta:

- exclusao de producao via `/api/production/delete`;
- exclusao de animal via `/api/animals/delete`;
- movimentacao de estoque que tambem afeta o saldo do item;
- updates que disparam `notifyDashboardUpdated`.

## Logout e troca de rancho

O cache e limpo em `AuthProvider`:

- no logout;
- quando a sessao some;
- quando o usuario/fazenda do escopo atual muda;
- quando o perfil e bloqueado e a sessao e encerrada.

## Subscriptions

Nao foram abertas subscriptions novas.

Subscriptions existentes continuam montadas apenas quando a tela esta montada:

- `ModuleScreen` assina a tabela do modulo aberto;
- `GenealogyScreen` assina animais apenas quando a genealogia esta aberta;
- `EmployeeScreen` assina funcionarios/ponto/folha apenas quando a tela esta aberta;
- `NotificationsMenu` permanece global por ser parte do layout.

As callbacks de realtime agora forcam refresh real (`forceRefresh`) em telas cacheadas.

## Fetches duplicados removidos/reduzidos

- Voltar rapidamente para modulos principais nao dispara refetch se o cache ainda esta valido.
- Relacoes usadas em formularios agora usam cache leve via `loadRelationOptions`.
- Dashboard deixou de baixar payload completo de varias tabelas.
- Botao Atualizar e mutacoes continuam buscando dados reais, sem depender do cache.

## Loading e erro

Os estados existentes de skeleton/erro foram preservados.

O Dashboard ja evitava tratar zero como dado real antes do primeiro carregamento; a otimizacao manteve esse comportamento.

## Testes executados

- `npm run typecheck`
- `npm run lint`
- `npm run build`

`npm run test:bot` nao foi necessario porque o bot/WhatsApp server-side nao foi alterado nesta otimizacao.

## Riscos e pendencias

- O Dashboard ainda calcula alguns agregados no client; uma proxima etapa pode criar endpoints/RPCs de resumo se quiser reduzir ainda mais volume.
- Nao foi feita virtualizacao de listas grandes.
- Nao foram criados indices ou alteracoes no banco.
- Relatorios ainda reutilizam a mesma fonte resumida do Dashboard; relatorios analiticos pesados podem ganhar filtros por periodo em um prompt futuro.
