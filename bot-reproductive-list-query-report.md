# Relatorio de consultas reprodutivas pelo bot

Data: 2026-06-09

## Implementado

- Consultas coletivas de vacas/animais gestantes, prenhas e gravidas.
- Consultas coletivas de animais em pre-parto.
- Consultas coletivas de vacas/animais inseminados ou cobertos.
- Relatorios de partos recentes, do dia, do mes e por mes nominal.
- Relatorio historico de vacas que pariram ha mais tempo, agrupando pelo animal e usando o ultimo parto de cada um.
- Relatorios de inseminacoes, pre-partos e protocolos/retestes recentes.
- Paginacao mantendo o filtro da consulta original, inclusive para rebanho filtrado e relatorio de eventos ordenado.
- Palavras como "que", "todas", "relatorios", "gestantes", "inseminadas" e termos similares nao sao mais tratadas como animal.
- Registros individuais continuam separados das consultas coletivas, por exemplo "Mimosa pariu ontem", "B-002 esta prenha?" e "pre-parto da Amanda hoje".

## Exemplos cobertos

- "Relatorio das vacas que pariram ha mais tempo"
- "Relatorio das vacas que estao gestantes"
- "Relatorios das vacas que tiveram parto"
- "Lista de todas as vacas inseminadas"
- "Quais vacas estao em prenha"
- "Me mostre os animais gravidos"
- "Lista de pre-parto"
- "Pre partos recentes"
- "Partos do mes"
- "Protocolo nao passou"
- "Quem foi inseminada"

## Comportamento esperado

- Consulta nao salva dados.
- Consulta nao pede confirmacao.
- Consulta usa dados reais/mockados da fazenda conforme o ambiente.
- Registro individual segue pedindo confirmacao quando for acao de escrita.
- Se houver mais resultados, o bot salva a paginacao da consulta e "ver mais" continua no mesmo filtro.

## TODO

- Melhorar sinonimos regionais adicionais quando surgirem dados reais de uso.
- Criar consultas futuras de calendario reprodutivo, como previsao de parto, caso o produto passe a exigir esse tipo de relatorio.
- Transformar periodos muito livres, como "desde a ultima seca", em filtros formais se houver regra de negocio definida.

## Validacao

- `npm run test:bot`: 1303 aprovados, 0 falhos.
- `npm run lint`: passou sem avisos ou erros.
- `npm run build`: passou com sucesso.
