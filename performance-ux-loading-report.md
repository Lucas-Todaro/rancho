# Relatorio de UX de carregamento e regressao final de performance

Data: 2026-06-05

## Telas auditadas

- Dashboard.
- Rebanho, lotes, producao, financeiro, ponto, folha e eventos pelo `ModuleScreen`.
- Estoque.
- Funcionarios.
- Genealogia.
- Relatorios.
- WhatsApp.
- Configuracoes.
- Notificacoes.
- Logout no cabecalho e na tela de configuracoes.
- Suporte foi auditado como pagina estatica, sem carga assincrona critica.

## Zeros falsos removidos ou evitados

- Dashboard: cards principais agora exibem skeleton enquanto carregam e `-` se a primeira carga falhar, em vez de valores zerados.
- Modulos genericos: quick stats exibem skeleton na carga inicial e `-` em erro inicial.
- Estoque: cards de quantidade, criticos e valor estimado exibem `-` em erro inicial.
- Funcionarios: totais, ativos, folha estimada e pontos exibem `-` em erro inicial.
- WhatsApp: totais de numeros autorizados exibem `-` se a primeira carga falhar.
- Relatorios: erro inicial deixou de manter skeleton indefinido.

## Skeletons e carregamentos

- Mantidos skeletons existentes em cards, tabelas, graficos, rebanho, estoque, funcionarios, genealogia, notificacoes, relatorios, dashboard e configuracoes.
- O skeleton agora representa apenas carregamento real nas telas ajustadas.
- Em erro inicial, a interface mostra mensagem clara com acao de retry em vez de parecer que ainda esta carregando.

## Loading infinito prevenido

- Criado `withAsyncTimeout` para leituras com limite simples de tempo.
- Aplicado timeout em dashboard, relatorios, modulos genericos, estoque, funcionarios, genealogia, notificacoes, configuracoes e WhatsApp.
- As cargas usam identificador de requisicao para ignorar respostas antigas.
- As telas invalidam requisicoes pendentes ao desmontar, reduzindo risco de estado antigo aparecer apos navegar.
- Mutations nao receberam retry automatico para evitar duplicar registros.

## Mensagens de erro padronizadas

- Criado `ErrorState` com mensagem amigavel e botao de tentar novamente.
- Erros tecnicos continuam tratados por `getFriendlyErrorMessage` ou funcoes equivalentes.
- O usuario passa a ver mensagens como "Nao consegui carregar..." e uma acao clara de retry.
- As mensagens tecnicas continuam sendo mantidas fora da UI final sempre que o fluxo passa pelo tratador amigavel.

## Estados vazios

- Criado `EmptyState` compartilhado.
- Rebanho/genealogia: diferencia animal inexistente de busca/filtro sem resultado.
- Estoque: diferencia estoque ainda nao cadastrado de busca sem resultado.
- Funcionarios: diferencia equipe ainda nao cadastrada de busca sem resultado.
- WhatsApp: lista vazia agora explica que e necessario cadastrar um numero autorizado.
- Tabelas genericas passaram a aceitar mensagem vazia contextual.

## Logout

- O cabecalho ja mostrava "Saindo da conta...", desabilitava o botao e evitava duplo clique.
- O contexto de autenticacao agora usa timeout tambem no sign out.
- Se o cliente Supabase nao estiver disponivel, o estado local e o cache sao limpos.
- O cache de registros continua sendo limpo no logout e na troca de escopo usuario/fazenda.

## Mobile e responsividade

- Os estados novos usam layouts flexiveis e quebram texto com seguranca.
- Skeletons reaproveitam os tamanhos existentes dos cards/listas para reduzir salto de layout.
- Modais e listas existentes foram preservados.
- Nenhum servidor local foi aberto; a checagem foi por codigo e build, conforme o prompt permitiu.

## Multi-fazenda e permissoes

- Nao houve alteracao de schema, RLS, policies ou autenticacao.
- As chamadas continuam usando `fazendaId` e `usuarioId` ja existentes.
- Permissoes de criacao/edicao/exclusao foram preservadas.
- Nenhum filtro de tenant foi removido.

## Regressao de navegacao

- Fluxo auditado por codigo: login/autenticacao inicial, dashboard, rebanho, estoque, financeiro, funcionarios, eventos, genealogia, relatorios, configuracoes, WhatsApp, suporte e logout.
- Estados de carregamento, erro e vazio agora ficam por tela/modulo, sem travar o app inteiro.
- A regressao visual em browser local nao foi executada porque o prompt informou que nao precisava abrir servidor local.

## Pendencias futuras

- Fazer uma rodada visual com navegador em mobile real ou emulacao, se quiser validar pixel a pixel.
- Medir tempos reais antes/depois com dados de producao.
- Criar testes automatizados de UI para timeout, erro e vazio quando houver harness frontend.
- Avaliar timeout/retry em servicos mais especificos caso surjam consultas muito lentas em producao.

## Validacao

- `npm run typecheck`: passou.
- `npm run lint`: passou sem warnings.
- `npm run build`: passou.
- `npm run test:bot`: nao executado porque nenhuma funcao compartilhada do bot foi alterada.

## Saida observada no build

- `/dashboard`: 6.21 kB, First Load JS 182 kB.
- `/estoque`: 9.16 kB, First Load JS 185 kB.
- `/funcionarios`: 10.7 kB, First Load JS 186 kB.
- `/genealogia`: 7.06 kB, First Load JS 172 kB.
- `/relatorios`: 6.88 kB, First Load JS 172 kB.
- `/configuracoes`: 10.8 kB, First Load JS 176 kB.
- `/whatsapp`: 10.3 kB, First Load JS 176 kB.
