# Correcao do bot para eventos reprodutivos

## Causa do erro

A frase "Thais foi inseminada" era interpretada como `ATUALIZACAO_ANIMAL` com `evento_tipo: reprodutivo`, mas no salvamento confirmado o bot gravava todo `registro_evento_animal` como `tipo: observacao`.

A aba Reproducao Animal usa a tabela real `eventos_animal`, mas reconhece inseminacao principalmente por `tipo: inseminacao`. Por isso a informacao podia aparecer como texto/historico em alguns lugares, mas nao virava uma inseminacao real para filtros e status reprodutivo.

## Formato correto adotado

Foi criado um mapeamento central de eventos reprodutivos no parser:

- `inseminacao`
- `prenhez`
- `pre_parto`
- `parto`
- `protocolo`
- `reteste`
- `observacao`

O bot continua usando a tabela real existente `eventos_animal`, sem migration e sem colunas novas.

Formato de salvamento:

- Inseminacao: salva `eventos_animal.tipo = "inseminacao"`.
- Parto: segue usando o fluxo `PARTO` existente com `tipo = "parto"`.
- Prenhez, pre-parto, protocolo e reteste: salvam como `tipo = "observacao"`, mas com descricao padronizada `[Reproducao Animal] ...`, que a aba Reproducao ja reconhece como evento reprodutivo.
- Prenhez positiva tambem atualiza a fase do animal para `gestante`, mantendo o evento reprodutivo real no historico.
- Origem de inseminacao, quando informada, fica em `medicamento` e tambem na descricao.

## Datas e origem

O parser agora preserva datas em formatos como:

- hoje
- ontem
- 01/06/2026
- 01.06.26

Para inseminacao, frases como "com touro T-01", "com semen Holandes" e "origem ABS" preenchem a origem quando presente.

## Integracoes

- Aba Reproducao Animal: le `eventos_animal`, entao passa a enxergar inseminacoes por `tipo: inseminacao` e demais eventos pela descricao reprodutiva padronizada.
- Aba Eventos: continua lendo a mesma tabela `eventos_animal`.
- Ficha/historico do animal: continua usando `animal_id` em `eventos_animal`.
- Consultas/relatorios do bot: o filtro reprodutivo agora reconhece inseminacao, prenhez, pre-parto, protocolo, reteste e "nao passou".
- Importacao tabular: inseminacao importada agora tambem usa `db_tipo: "inseminacao"`.

## Seguranca e permissoes

- Nao houve alteracao em RLS, autenticacao, dashboard, login, deploy ou schema Supabase.
- O bot continua buscando animal somente pelo `fazenda_id` do numero autorizado.
- Animal inexistente nao gera evento solto; o bot pede o brinco/codigo correto antes de salvar.
- O fluxo continua exigindo confirmacao antes de salvar.
- Testes usaram `modoTeste=true`, `salvarReal=false`, Supabase mockado e dry-run.
- Nenhuma mensagem real foi enviada pelo WhatsApp.
- Nenhum dado real foi gravado em teste destrutivo.

## Testes adicionados/reforcados

A bateria passou de 1212 para 1233 casos, totalizando 21 casos/variacoes a mais ou fortalecidos.

Cobertura adicionada/reforcada:

- "Thais foi inseminada" salva `tipo: inseminacao`, nao `observacao`.
- Inseminacao por codigo, por nome, com data e com origem.
- Prenhez positiva cria evento reprodutivo e atualiza fase.
- Pre-parto cria evento reprodutivo visivel para Reproducao.
- Protocolo/reteste/"nao passou" viram evento reprodutivo.
- Codigo com espaco, como `5714 CF`, e preservado.
- Animal nao encontrado nao salva evento solto.
- Cancelamento nao salva.
- Confirmacao duplicada nao duplica.
- Multi-fazenda respeita o rancho do telefone.
- Importacao tabular de inseminacao continua passando e grava tipo real.

## Validacao

- `npm run test:bot`: 1233 aprovados, 0 falhos, 100%.
- `npm run lint`: sem warnings ou erros.
- `npm run build`: compilado com sucesso.

## Arquivos alterados/criados

- `src/lib/whatsapp/nlp-core/reproductive-events.ts`
- `src/lib/whatsapp/nlp-core/intent-detector.ts`
- `src/lib/whatsapp/nlp-core/extractors.ts`
- `src/lib/whatsapp/nlp-core/constants.ts`
- `src/lib/whatsapp/nlp-core/result.ts`
- `src/lib/whatsapp/nlp-core/tabular-events.ts`
- `src/lib/whatsapp/nlp.ts`
- `src/services/whatsapp/twilio.ts`
- `src/services/whatsapp/conversation-act.ts`
- `scripts/bot-test/assertions.cjs`
- `scripts/bot-test/runner.cjs`
- `scripts/bot-test/cases-health.cjs`
- `scripts/bot-test/cases-health-framework.cjs`
- `scripts/bot-test/cases-tabular-import.cjs`
- `bot-reproduction-event-fix-report.md`
- Relatorios gerados por `test:bot`: `bot-evaluation-report.json`, `bot-final-regression-report.md`
