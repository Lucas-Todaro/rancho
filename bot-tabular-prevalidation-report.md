# Relatório de pré-validação tabular do bot WhatsApp

## Escopo implementado

O bot agora tem uma camada mais forte de pré-validação para importações tabulares, reaproveitando o fluxo já existente de sessão pendente e confirmação explícita. Nenhuma linha é salva antes de o usuário confirmar uma opção.

Tipos atendidos nesta rodada:

- Tabela de eventos do rebanho.
- Tabela de cadastro de animais.
- Tabela de movimentação de estoque.

## Como funciona

Ao receber uma tabela, o parser detecta o tipo e separa as linhas. O serviço do bot enriquece essa leitura com validações contra os dados do rancho/fazenda, marcando cada linha como pronta, inválida ou duplicada.

O resumo para o usuário informa:

- Total de linhas lidas.
- Linhas prontas.
- Pendências encontradas.
- Entidades faltantes.
- Possíveis duplicidades.
- Opções de ação antes de salvar.

As sessões pendentes continuam isoladas por WhatsApp e fazenda/rancho. Antes de salvar, o bot revalida permissões, vínculo com fazenda e entidades necessárias.

## Pendências detectadas

Eventos do rebanho:

- Animal não encontrado.
- Animal ambíguo.
- Animal inativo.
- Data inválida.
- Tipo de evento desconhecido.
- Duplicidade.

Cadastro de animais:

- Código ausente.
- Animal duplicado no rebanho.
- Duplicado na própria tabela.
- Categoria ausente ou inválida.
- Lote não encontrado.

Estoque:

- Item de estoque não encontrado.
- Quantidade ausente ou inválida.
- Unidade ausente ou inválida.
- Tipo de movimento ausente ou desconhecido.
- Data inválida.
- Valor inválido.
- Duplicidade na tabela.

## Correção guiada

Animais faltantes em tabela de eventos:

- O bot oferece cadastrar os animais faltantes.
- Se confirmado, cria os animais mínimos e depois volta para a importação dos eventos.
- Não cria animal automaticamente sem confirmação.

Lotes faltantes em cadastro de animais:

- O bot oferece criar os lotes faltantes.
- Se confirmado, cria os lotes e cadastra os animais válidos.
- Não cria lote automaticamente sem confirmação.

Itens de estoque faltantes:

- O bot mostra os itens não cadastrados.
- O usuário pode criar os itens faltantes ou importar somente as linhas válidas.
- Não cria item automaticamente sem confirmação.

Importar somente válidas:

- O usuário pode escolher importar apenas as linhas prontas.
- Linhas inválidas ou pendentes ficam de fora.
- O modo teste simula esse salvamento sem gravar dados reais.

Cancelamento:

- O usuário pode cancelar a importação.
- A sessão é limpa.
- Nada é salvo.

## Limites preservados por segurança

A correção individual de uma linha por conversa, como "corrigir a data da linha 8 para 31/05/2026" ou escolher um tipo válido para uma linha específica, ficou como evolução futura. Nesta rodada, o bot já detecta esses erros, mostra as pendências e permite importar somente as linhas válidas ou cancelar. Não implementei reescrita linha-a-linha para evitar mexer demais no estado conversacional e arriscar regressões no parser comum.

## Testes

Antes desta rodada, o conjunto passava com 1156 testes. Depois da implementação, o conjunto passou com 1196 testes.

Comandos executados:

- `npm run test:bot`
  - Total: 1196
  - Aprovados: 1196
  - Falhos: 0
- `npm run build`
  - Compilou com sucesso.
  - Type check passou.
  - Geração estática passou.

## Segurança dos testes

- Nenhuma mensagem real foi enviada pelo WhatsApp.
- Os testes rodaram com Supabase mockado/local no modo `modoTeste=true`.
- O dry-run bloqueou escritas reais de negócio.
- Nenhum dado real foi apagado, migrado ou sobrescrito.

## Arquivos principais

- `src/lib/whatsapp/nlp-core/tabular-events.ts`: detecção e parsing de tabela de estoque, além das estruturas de linhas.
- `src/lib/whatsapp/nlp-core/types.ts`: nova intenção `IMPORTACAO_ESTOQUE_TABELA`.
- `src/lib/whatsapp/nlp-core/result.ts`: resumo da nova intenção.
- `src/services/whatsapp/twilio.ts`: pré-validação, menus guiados, confirmação, dry-run e salvamento real opcional para tabelas.
- `scripts/bot-test/cases-tabular-import.cjs`: casos de regressão e importação tabular.
- `scripts/bot-test/assertions.cjs`: asserts para linhas de estoque.
- `scripts/bot-test/runner.cjs`: simulação de salvamento de importação de estoque.
