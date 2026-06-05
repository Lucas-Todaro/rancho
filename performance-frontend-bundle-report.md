# Relatorio de performance - frontend, render e mobile

Data: 2026-06-05

## Escopo auditado

- Dashboard e relatorios: graficos, cards e carregamento de dados.
- Modulo generico: `ModuleScreen`, `DataTable`, `AnimalCards`.
- Estoque: busca, renderizacao de cards e modal de movimentacao.
- Funcionarios: cards, busca, ficha, formulario e convite.
- Componentes globais: `BarChart`, `DataTable`, estilos mobile em `globals.css`.

## Componentes pesados encontrados

- `BarChart` era importado diretamente em dashboard e relatorios.
- `EmployeeScreen` carregava ficha, formulario e convite no bundle inicial da tela.
- `AnimalCards`, `EmployeeCard` e `DataTable` renderizam listas repetidas e recebiam trabalho de filtro/render a cada digitacao.
- Estoque e rebanho podiam montar muitos cards de uma vez no navegador.
- Mobile usava `backdrop-filter` e sombras em muitos cards, um efeito caro em aparelhos mais fracos.

## Otimizacoes aplicadas

- `BarChart` passou para `next/dynamic` no dashboard e nos relatorios.
- `EmployeeDetails`, `EmployeeForm` e `InviteEmployeeForm` passaram para carregamento sob demanda.
- `BarChart`, `DataTable`, `AnimalCards` e `EmployeeCard` foram memoizados com `React.memo`.
- Buscas em modulo generico, rebanho, estoque e funcionarios usam `useDeferredValue`.
- Rebanho renderiza inicialmente 72 cards e expande com "Mostrar mais animais".
- Estoque renderiza inicialmente 60 itens e expande com "Mostrar mais itens".
- Funcionarios renderiza inicialmente 60 cards e expande com "Mostrar mais funcionarios".
- Calculos de funcionarios ativos, folha mensal e pontos do mes foram memoizados.
- Handlers enviados para cards de funcionario foram estabilizados com `useCallback`.
- CSS mobile reduz blur/sombras caros e evita overflow horizontal fora das tabelas.

## Bundle e imports

- Graficos sairam do bundle inicial das paginas que os usam.
- Modais/formularios de funcionarios sairam do caminho inicial da tela de funcionarios.
- Nenhuma dependencia nova foi adicionada.
- Imports de icones ja estavam especificos por componente e foram preservados.

## Mobile

- Em telas menores que 768px, `.glass` deixa de usar `backdrop-filter`.
- Hover com transform foi neutralizado em mobile.
- `html` e `body` receberam protecao contra overflow horizontal global, mantendo tabelas com scroll proprio.

## O que nao foi alterado

- Nenhuma regra de negocio foi alterada.
- Nenhum schema, RLS, policy, login, autenticacao, permissao ou bot foi alterado.
- Nao houve redesign visual.
- Nao houve troca de biblioteca de UI.

## Pendencias para proximos prompts

- Medir render com React Profiler em dados reais.
- Avaliar paginacao mais profunda por tela se rebanho/estoque crescerem muito.
- Separar ainda mais a pagina de WhatsApp em secoes lazy, se o bundle dela virar gargalo.
- Revisar landing page e imagens em uma rodada propria, sem misturar com o app interno.

## Validacao

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.

## Saida observada no build

- `/dashboard`: 4.64 kB, First Load JS 181 kB.
- `/relatorios`: 2.17 kB, First Load JS 171 kB.
- `/estoque`: 6.73 kB, First Load JS 184 kB.
- `/funcionarios`: 12.6 kB, First Load JS 185 kB.
- Shared First Load JS: 87.3 kB.
