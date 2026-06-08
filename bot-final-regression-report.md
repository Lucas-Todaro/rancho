# Bot Final Regression Report

Gerado em: 2026-06-08T16:49:19.138Z

## Resumo Geral

- Total geral de testes: 1276
- Aprovados: 1276
- Falhos: 0
- Taxa geral de sucesso: 100%
- Avaliacao final: pronto_para_uso_real_com_monitoramento

## Modulos

| Modulo | Total | Aprovados | Falhos | Taxa |
| --- | ---: | ---: | ---: | ---: |
| Geral/comandos humanos | 18 | 18 | 0 | 100% |
| Producao | 63 | 63 | 0 | 100% |
| Animais | 48 | 48 | 0 | 100% |
| Estoque | 207 | 207 | 0 | 100% |
| Financeiro | 167 | 167 | 0 | 100% |
| Funcionarios | 42 | 42 | 0 | 100% |
| Ponto | 19 | 19 | 0 | 100% |
| Folha/salarios | 8 | 8 | 0 | 100% |
| Eventos/vacinas/medicamentos | 215 | 215 | 0 | 100% |
| Genealogia | 81 | 81 | 0 | 100% |
| Rebanho/lotes | 42 | 42 | 0 | 100% |
| Dashboard/relatorios | 26 | 26 | 0 | 100% |
| Suporte | 8 | 8 | 0 | 100% |
| WhatsApp autorizado | 42 | 42 | 0 | 100% |
| Permissoes | 12 | 12 | 0 | 100% |
| Multi-fazenda | 11 | 11 | 0 | 100% |
| Sessao/contexto | 39 | 39 | 0 | 100% |
| Seguranca/mensagens maliciosas | 24 | 24 | 0 | 100% |

## Estoque - Consultas

- Testes adicionados nesta rodada: 31
- Testes relacionados cobertos: 45
- Aprovados: 45
- Falhos: 0
- Coberturas:
  - lista geral de itens e quantidades
  - item especifico por saldo/quantidade/tem quanto
  - estoque baixo e abaixo do minimo
  - itens zerados
  - categoria/tipo: vacinas, medicamentos, racoes e insumos
  - paginacao por sessao com ver mais e cancelamento
  - plural de unidades na resposta
  - erros de digitacao comuns
  - nao confundir consulta com entrada, baixa ou criacao
  - permissoes e isolamento por fazenda_id

## Cadastro De Animal

- Testes adicionados nesta rodada: 22
- Fluxos estruturados cobertos: 37
- Aprovados: 37
- Falhos: 0
- Coberturas:
  - frases naturais com nome: criar vaca Amanda, cadastrar boi Brutus, nova novilha Estrela
  - extracao de nome, categoria, sexo informado explicitamente, brinco/codigo, peso e raca
  - nome opcional: pergunta somente brinco/codigo quando categoria ja existe
  - confirmacao obrigatoria antes de qualquer salvamento
  - respostas curtas em fluxo guiado preservam codigos como N-935
  - correcoes antes de salvar para nome, categoria, brinco/codigo e peso
  - cancelamento limpa sessao sem salvar
  - confirmacao duplicada nao duplica cadastro
  - erros de digitacao comuns como vca, boii, bezero e cadatra
  - consulta de rebanho nao vira cadastro
  - brinco/codigo duplicado bloqueia antes de salvar
  - permissoes de admin e isolamento por fazenda_id

## Falhas Criticas

- Nenhuma falha critica encontrada.

## Falhas Criticas Corrigidas Nesta Rodada

- suporte, erro e contato agora entram em AJUDA e nao em fluxo de producao
- resumo do dia, dashboard e resumo da fazenda agora entram em consulta sem salvar
- relatorio de producao agora entra em consulta de producao, sem pedir confirmacao
- consultas de rebanho e lotes respondem sem confirmacao e sem acao de salvamento
- criacao de lote exige admin e confirmacao antes de salvar
- consultas de estoque agora listam itens, item especifico, baixo, zerado, categoria e paginacao sem salvar

## Falhas Restantes

- Nenhuma falha restante.

## Validacoes De Seguranca E Fluxo

- Nada salva sem confirmacao: casos estruturados verificam shouldSaveBeforeConfirmation=false e shouldNotWriteBusiness=true antes do sim.
- Permissoes respeitadas: casos de funcionario comum, bot_only, numero sem permissao e revalidacao antes do sim bloqueiam acoes restritas.
- Rancho A nao ve Rancho B: casos Rancho A/Rancho B usam mesmos codigos e nomes e validam sessionFarmId e savedFarmId isolados.
- Sessoes nao se misturam: casos por telefone e usuarios simultaneos validam que contexto pendente nao cruza entre sessoes.
- Confirmacao duplicada nao duplica: casos por modulo confirmam duas vezes e esperam apenas uma acao simulada.
- WhatsApp real: processWhatsappMessage roda em modoTeste=true; Twilio/WhatsApp real nao e chamado.
- Banco real: Supabase e mockado localmente e salvarReal=false bloqueia escrita de negocio real.
- Secrets/tokens: tentativas maliciosas sobre tokens, service role, SQL e RLS nao retornam segredos.

## Comandos

- npm run test:bot: passed
- npm run build: passed na validacao final
- npm run lint: passed na validacao final

## Arquivos Alterados/Criados

- scripts/test-bot.cjs
- src/lib/whatsapp/nlp-core/contextual-parser.ts
- src/lib/whatsapp/nlp-core/intent-detector.ts
- src/lib/whatsapp/nlp-core/result.ts
- src/lib/whatsapp/nlp-core/types.ts
- src/lib/whatsapp/nlp-core/constants.ts
- src/lib/whatsapp/nlp-text.ts
- src/services/whatsapp/twilio.ts
- bot-evaluation-report.json
- bot-final-regression-report.md

## Riscos Restantes

- permissoes personalizadas granulares ainda sao validadas pelas roles atuais, nao por uma matriz persistida dedicada
- consultas de calendario futuro de vacina continuam fora do escopo do bot atual
- o modo de teste valida dry-run e mocks locais; ambiente real ainda exige monitoramento de webhook, Twilio e Supabase

## Relatorios

- JSON consolidado: bot-evaluation-report.json
- Markdown consolidado: bot-final-regression-report.md
- Relatorio bruto ignorado pelo Git: bot-test-report.json / bot-test-report.md
