# Consultas com período inteligente no WhatsApp

## Causa do erro

O parser tratava consultas como "quais foram os partos recentes" como relatório de eventos com período padrão `hoje`.

Com isso, o handler filtrava `eventos_animal.data_evento` somente no dia atual e respondia que não havia partos hoje, mesmo quando o usuário tinha pedido registros recentes.

## Regra nova de período

Agora o bot diferencia:

- `hoje`: busca apenas hoje.
- `ontem`: busca apenas ontem.
- `semana`: busca a semana atual, conforme padrão já existente.
- `mes`: busca o mês atual.
- `mes_passado`: busca o mês anterior.
- mês nominal, como `maio`: busca o mês correspondente do ano atual.
- `recentes`: busca os últimos registros disponíveis do tipo pedido, ordenados por `data_evento` decrescente.

Termos como `recentes`, `recentemente`, `últimos`, `últimas` e `mais recentes` não caem mais em `hoje`.

## Eventos reprodutivos

Foram cobertas consultas de:

- partos recentes;
- inseminações recentes;
- eventos reprodutivos recentes;
- protocolos recentes;
- prenhezes recentes;
- pré-partos recentes;
- eventos da semana;
- partos de hoje;
- partos de mês nominal, como maio.

Para eventos recentes, a resposta lista até 10 registros por vez, com animal, data em formato brasileiro, tipo traduzido e observação quando houver.

## Fallback e paginação

Para `recentes`, a consulta não aplica filtro de hoje. Ela busca os últimos registros do tipo solicitado em ordem decrescente.

Se houver mais de 10 registros, o bot salva uma paginação leve na sessão em `eventos_paginacao`. Mensagens como `ver mais`, `mais`, `continuar` e `próximos` continuam a mesma consulta, com o mesmo período e tipo de evento.

## Segurança e escopo

- Consultas não salvam dados.
- Consultas não pedem confirmação.
- Cadastros como `Thais foi inseminada` continuam no fluxo de confirmação antes de salvar.
- As queries continuam filtrando por `fazenda_id`.
- Não houve alteração em Supabase schema, RLS, autenticação, dashboard, landing page ou deploy.
- Não foi adicionada dependência nova.
- Nenhuma chave ou segredo foi exposto.

## Testes adicionados

Foram adicionados 18 cenários:

- 12 casos de parser para períodos recentes, hoje, mês nominal e regressão de cadastro.
- 6 casos de fluxo real do bot com Supabase mockado, cobrindo partos recentes, hoje, maio, inseminações, eventos reprodutivos, paginação e multi-fazenda.

Também foram executadas regressões existentes de cadastro de eventos reprodutivos, relatório individual de animal, produção, estoque, financeiro, funcionários, genealogia e importação tabular.

## Resultado

- `npm run test:bot`: 1276 aprovados, 0 falhas.
- `npm run build`: sucesso.
- `npm run lint`: sucesso, sem avisos.

## Arquivos alterados

- `src/lib/whatsapp/nlp-core/intent-detector.ts`
- `src/services/whatsapp/operational-report.ts`
- `src/services/whatsapp/twilio.ts`
- `scripts/bot-test/cases-health.cjs`
- `scripts/bot-test/cases-health-framework.cjs`
- `bot-evaluation-report.json`
- `bot-final-regression-report.md`
- `bot-period-query-report.md`

Os relatórios `bot-test-report.json` e `bot-test-report.md` também foram gerados pelo runner local, mas não aparecem como alteração rastreada neste estado do Git.

## Pendências futuras

- Se houver permissão granular específica para reprodução/eventos no WhatsApp, o handler pode ocultar essas consultas para papéis sem acesso.
- Se a fazenda passar a registrar eventos futuros planejados, pode ser útil separar "recentes" de "programados".
