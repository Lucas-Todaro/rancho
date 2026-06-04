# WhatsApp schema audit

Data: 2026-06-04

## Escopo

Auditoria focada nos erros de schema vistos no fluxo do bot de WhatsApp:

- `lotes.created_by` ao confirmar criacao de lote.
- `estoque_movimentacoes.unidade` em consultas/relatorios de estoque.
- `whatsapp_mensagens.body` em consultas de registros via WhatsApp.

Nao houve alteracao em RLS, autenticacao, schema Supabase, dashboard, landing page, login ou deploy.

## Como o schema foi conferido

- Contrato local em `src/lib/tables.ts`.
- Migrations em `supabase/migrations`.
- Payloads e selects usados pelos servicos do bot.
- Erros reais informados no prompt.
- Tentativa segura de consultar `information_schema.columns` via Supabase REST retornou 404 porque o endpoint nao expoe `information_schema` no cache REST. Nenhuma chave foi impressa no relatorio.

## Achados e correcoes

### lotes.created_by

Achado: `saveConfirmedRecord` enviava `created_by` ao inserir em `lotes`, mas `src/lib/tables.ts` nao mapeia campo de autoria para `lotes`.

Correcao: o insert de lote agora envia apenas:

- `fazenda_id`
- `nome`
- `descricao`
- `ativo`

### estoque_movimentacoes.unidade

Achado: o relatorio operacional selecionava `unidade` e `unidade_medida` diretamente de `estoque_movimentacoes`.

Correcao: a consulta de movimentacoes agora seleciona apenas colunas da movimentacao (`id,item_id,tipo,quantidade,created_at`). A unidade exibida continua vindo do item de estoque relacionado, por `estoque_itens.unidade_medida`.

### whatsapp_mensagens.body

Achado: consultas de registros via WhatsApp selecionavam `body` como coluna top-level de `whatsapp_mensagens`.

Correcao: os selects agora usam `payload,telefone_e164,direcao,created_at,processada_em`. O texto da mensagem continua sendo lido de `payload.body`, que ja era o formato usado pelo logger.

### Logger de mensagens

Achado: o logger ja nao gravava `body` top-level, mas uma falha inesperada no log poderia atrapalhar o fluxo.

Correcao: `saveWhatsAppMessage` ficou resiliente a erro de log e registra apenas codigo/mensagem do erro, sem payload, corpo de mensagem ou chaves.

## Testes adicionados

O mock do `test:bot` agora falha se o codigo tentar:

- selecionar `whatsapp_mensagens.body`;
- selecionar ou gravar `estoque_movimentacoes.unidade`;
- gravar `lotes.created_by`;
- gravar `whatsapp_mensagens.body` top-level.

Novos casos cobrem:

- criacao real de lote no Supabase mockado sem `created_by`;
- movimentacao real de estoque no Supabase mockado sem `unidade`;
- logger real do WhatsApp no mock sem `body` top-level;
- fallback de registros do WhatsApp sem selecionar `body`;
- resumo do dia sem selecionar `estoque_movimentacoes.unidade`.

## Validacao

- `npm run test:bot` passou.
- `npm run lint` passou.
- `npm run typecheck` passou.
- `npm run build` passou.
