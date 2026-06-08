# Relatório individual do animal no WhatsApp

## O que foi ajustado

O relatório individual do animal no bot foi melhorado no fluxo de `CONSULTA_ANIMAL`, em `src/services/whatsapp/twilio.ts`.

Agora pedidos como:

- "como que tá a vaca 19"
- "me fala da vaca 19"
- "relatório da vaca 19"
- "ficha da 19"
- "situação da Amanda"
- "relatório do animal 5714 CF"

são tratados como consulta individual do animal, sem confirmação e sem salvar dados.

## Dados exibidos

O relatório agora monta uma resposta curta e organizada com:

- dados gerais do animal: nome, código, categoria, sexo, status, fase, lote, raça, nascimento e peso quando existirem;
- reprodução: status reprodutivo, última inseminação, origem da inseminação, prenhez, pré-parto, último parto e observações;
- eventos recentes do animal;
- produção recente, quando houver ordenhas vinculadas ao animal;
- alertas úteis;
- genealogia resumida, quando os vínculos já existirem.

## Reprodução

Os dados reprodutivos são buscados em eventos do animal filtrados por `fazenda_id` e `animal_id`.

O status reprodutivo é inferido a partir dos eventos mais recentes:

- pré-parto recente vira "Pré-parto";
- prenhez confirmada sem parto posterior vira "Prenha";
- inseminação sem resultado posterior vira "Inseminada";
- observações com "Reteste" ou "Não passou" aparecem como alerta/status útil;
- parto recente aparece como "Pariu";
- sem dados vira "Sem registro reprodutivo".

O bot não inventa datas ou números: só exibe o que foi encontrado nos dados mockados/reais do fluxo consultado.

## Tradução de valores internos

Foram adicionadas formatações para evitar respostas com valores crus como:

- `nao_aplicavel`
- `nao_informado`
- `outro`
- `null`
- `undefined`

Exemplos de saída amigável:

- "Não se aplica"
- "Não informado"
- "Categoria não informada"
- "Fêmea"
- "Pré-parto"

## Segurança e escopo

- Consultas individuais não salvam dados.
- Nenhuma mensagem real de WhatsApp é enviada nos testes.
- O teste usa `modoTeste=true`, `salvarReal=false` e Supabase mockado.
- As buscas novas respeitam `fazenda_id`/isolamento da fazenda.
- Não houve alteração de schema, RLS, autenticação, dashboard, landing page ou deploy.
- Não foi adicionada dependência nova.

## Testes adicionados

Foram adicionados 25 cenários novos:

- 8 casos de parser para variações de pedidos de ficha/relatório individual;
- 17 casos de framework cobrindo reprodução completa, prenhez, pré-parto, parto, inseminação, Reteste, Não passou, animal sem reprodução, enums traduzidos, animal não encontrado, nome ambíguo, multi-fazenda, usuário sem permissão, consulta sem salvar e regressão de cadastro reprodutivo.

Também foi ajustado o mock de ordenhas para permitir validar produção recente no relatório individual.

## Resultado da validação

- `npm run test:bot`: 1258 aprovados, 0 falhas.
- `npm run build`: sucesso.
- `npm run lint`: sucesso, sem avisos.

## Pendências futuras

- Se o projeto ganhar uma tabela própria de protocolos/reprodução além de `eventos_animal`, o relatório pode incorporar essa fonte.
- Se o histórico do animal crescer muito, pode ser útil criar paginação específica para histórico completo.
- Se houver permissões mais granulares para reprodução/produção, o relatório pode ocultar seções por módulo de forma mais específica.
