# Relatorio tecnico - importacao tabular de eventos do rebanho

## Escopo

- Parser local para mensagens coladas em formato de tabela com separador `;`.
- Fluxo seguro no WhatsApp: parse, validacao por fazenda, resumo, confirmacao e importacao apenas das linhas validas.
- Sem alteracao de schema, RLS, autenticacao, dashboard, landing page ou Twilio.
- Sem envio real de WhatsApp nos testes.
- Sem escrita real de dados nos testes destrutivos: `modoTeste=true` e `salvarReal=false`.

## Tabela real testada

- Linhas de dados: 31.
- Linhas parseadas como validas: 30.
- Linhas com pendencia: 1.
- Pendencia encontrada: linha 31/32 do texto, animal `090`, tipo `protocolo`, data ausente.
- Codigos preservados: zeros a esquerda (`001`, `06`, `062`, `090`) e codigo com espaco (`5714 CF`).
- Observacoes preservadas: `Reteste` e `Nao passou`.

## Tipos reconhecidos

- `Inseminacao`: 18.
- `Parto`: 12.
- `Protocolo`: 1.

## Regras de salvamento

- Nenhum evento e salvo antes da confirmacao.
- Confirmacao positiva em tabela com pendencias importa apenas linhas validas.
- Linhas sem animal, sem data, com data invalida, tipo desconhecido, animal inativo/ambiguo ou duplicidade ficam fora da importacao.
- Duplicidade simples verificada por animal, tipo, data e descricao.
- Importacao em massa exige admin; funcionario comum recebe bloqueio de permissao.
- Validacao de animais usa `fazenda_id` do numero autorizado, evitando cruzamento entre fazendas.

## Reproducao do erro real

- O parser isolado aceitava a tabela com quebras de linha reais.
- O fluxo real do simulador/webhook passava o corpo por `sanitizeFreeText`, que achatava as quebras em espacos antes de chegar ao parser.
- Quando a tabela chegava como `\n` literal, o parser tambem nao separava linhas.
- Nesses dois formatos, a mensagem deixava de ser reconhecida como `IMPORTACAO_EVENTOS_TABELA` e podia cair no parser comum.

## Ajuste aplicado

- O corpo das mensagens do simulador, webhook Twilio e webhook WhatsApp agora usa `sanitizeWhatsappMessageText`, preservando quebras de linha sem liberar caracteres de controle.
- O parser tabular normaliza CRLF, LF, CR, `\n` literal e quebras URL/HTML escapadas antes de procurar cabecalho e linhas.
- A deteccao tabular continua antes do parser comum.
- Confirmacoes humanas como `so as validas`, `somente validas` e `apenas validas` passam a confirmar a importacao parcial.
- Logs opcionais com `RANCHO_BOT_DEBUG_TABULAR=1` mostram etapa, formato de quebra, intent selecionada, totais de linhas e resultado de salvamento sem expor chave ou texto integral.

## Testes adicionados

- Testes diretos do parser: 8.
- Casos estruturados no fluxo real do bot: 10.
- Total adicionado: 18.

## Cobertura nova

- Tabela real completa.
- Cabecalhos com e sem acento.
- Cabecalho simples (`Animal;Tipo;Data;Obs`).
- Espacos ao redor do separador.
- Linhas vazias.
- Datas com ponto, barra, hifen e ano completo.
- Observacao com `;` extra.
- Mensagem sanitizada como a rota do simulador/webhook.
- Quebras reais, CRLF e `\n` literal.
- Mensagem normal nao ativa parser tabular.
- Confirmacao, `so as validas`, cancelamento, `ver erros`, permissao, duplicidade e multi-fazenda.

## Validacao executada

- `npm run test:bot`: aprovado, 1174/1174.
- `npm run lint`: aprovado, sem warnings ou erros.
- `npm run build`: aprovado.

## Artefatos

- Relatorio principal do bot: `bot-test-report.md`.
- Relatorio final de regressao: `bot-final-regression-report.md`.
- Este relatorio: `bot-tabular-import-report.md`.
