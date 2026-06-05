# Relatorio de performance - consultas Supabase

Data: 2026-06-05

## Escopo auditado

- Helper compartilhado de CRUD: `src/services/crud.ts`.
- Dashboard e relatorios: `src/services/dashboard.ts`, `src/app/(app)/relatorios/page.tsx`.
- Modulos de lista: `ModuleScreen`, `StockScreen`, `GenealogyScreen`, `AnimalDetailModal`.
- Funcionarios, ponto e folha: `EmployeeScreen`, `EmployeeDetails`.
- Configuracoes, WhatsApp e notificacoes.
- Servicos auxiliares compartilhados: estoque/producao, ciclo do animal, financeiro de eventos e usuarios WhatsApp.
- Rotas administrativas e bot foram revisadas; so foram alterados pontos claramente seguros.

## Queries pesadas encontradas

- Listas genericas de modulos usavam a leitura compartilhada sem colunas explicitas.
- Estoque carregava itens e movimentacoes com todos os campos.
- Funcionarios carregava funcionarios, ponto e folha com todos os campos.
- Fichas de animal e funcionario carregavam historicos com todos os campos.
- Notificacoes buscavam a lista completa e depois cortavam os 20 primeiros no frontend.
- Opcoes de relacao buscavam linhas completas apenas para montar labels.
- Configuracoes carregava fazenda/usuario completos para editar poucos campos.

## Otimizacoes aplicadas

- `listRecords` agora aceita `limit` e `offset`, aplicando `limit/range` no Supabase e o mesmo comportamento nos mocks.
- A chave de cache agora considera `select`, filtros, `limit` e `offset`.
- Opcoes de relacao agora buscam apenas coluna de valor, label e descricao.
- Modulos de eventos, producao, financeiro, ponto e folha carregam em blocos de 50 registros com botao "Carregar mais registros".
- Listas de modulos passam `select` calculado pelos campos realmente usados pela tela.
- Estoque busca colunas especificas dos itens e limita movimentacoes recentes a 1000 registros.
- Notificacoes buscam apenas `id,titulo,mensagem,entidade_tipo,lida_em,created_at` com `limit: 20` direto no banco.
- Funcionarios, ponto, folha, fichas, genealogia, configuracoes e WhatsApp passaram a usar selects especificos.
- Dashboard ja estava leve nesta frente: colunas minimas, producao do mes atual, financeiro dos ultimos 6 meses e folha do mes atual.

## Selects preservados

- Retornos de `insert/update` com `.select("*")` foram preservados quando o registro salvo pode ser usado por fluxos seguintes.
- Trechos grandes do bot/Twilio e algumas rotas administrativas ficaram como pendencia para uma rodada propria, porque misturam execucao de negocio, confirmacoes e compatibilidade com schemas opcionais.

## Tenant, periodo e seguranca

- Os filtros por `fazenda_id` continuaram centralizados em `listRecords` para tabelas multi-tenant.
- Updates/deletes existentes com escopo de fazenda foram preservados.
- Nenhuma RLS, policy, autenticacao, login, dashboard visual, landing page ou schema Supabase foi alterado.
- Nenhuma migration destrutiva foi criada.

## N+1 e realtime

- Nao foi encontrado N+1 critico nas telas principais alteradas; relacoes continuam carregadas uma vez por campo e viram mapa local.
- Subscriptions existentes mantem unsubscribe ao desmontar.
- O refetch de subscriptions e acoes manuais usa `forceRefresh` para nao servir cache antigo.

## Indices

Nenhum indice novo foi criado neste prompt para evitar migration sem evidencia de plano/EXPLAIN. Recomendacoes para proxima rodada, se as tabelas crescerem:

- `transacoes_financeiras (fazenda_id, data_transacao)`.
- `ordenhas (fazenda_id, ordenhado_em)` e `ordenhas (fazenda_id, animal_id, ordenhado_em)`.
- `eventos_animal (fazenda_id, data_evento)` e `eventos_animal (fazenda_id, animal_id, data_evento)`.
- `estoque_movimentacoes (fazenda_id, item_id, created_at)`.
- `registros_ponto (fazenda_id, funcionario_id, registrado_em)`.
- `notificacoes (fazenda_id, created_at)`.

## Pendencias seguras para proximos prompts

- Paginar com contagem real (`count`) em vez de inferir "tem mais" pelo tamanho do lote.
- Adicionar filtros de periodo visiveis nas telas de financeiro, eventos, producao, ponto e folha.
- Revisar os fluxos grandes do bot/Twilio separadamente para reduzir selects amplos sem alterar execucao.
- Avaliar indices com dados reais e `EXPLAIN` antes de criar migrations.

## Validacao

- `npm run lint`: passou.
- `npm run build`: passou.
- `npm run typecheck`: passou quando executado sozinho apos o build.
- `npm run test:bot`: passou, 1109 aprovados e 0 falhas.
- Uma primeira execucao paralela de `typecheck` falhou porque o build recriava `.next/types` ao mesmo tempo; nao foi erro de codigo.
