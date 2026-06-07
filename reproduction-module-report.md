# Relatório do Módulo de Reprodução

## O que foi adicionado

- Nova rota do site: `/reproducao`.
- Nova tela de frontend: `src/components/modules/ReproductionScreen.tsx`.
- Nova entrada no menu lateral e na busca global: `Reprodução`.
- Permissão de visualização atualizada para usuários comuns abrirem a página em modo somente leitura.

## Estrutura de dados

- Nenhuma migration foi criada.
- Nenhuma tabela foi adicionada.
- O módulo lê animais de `animais`.
- O módulo lê e grava o histórico reprodutivo na tabela existente `eventos_animal`.
- Inseminação e parto são salvos com tipos de evento já existentes:
  - `tipo = "inseminacao"`
  - `tipo = "parto"`
- Prenhez, pre-parto, protocolo e observação são salvos como `tipo = "observacao"` com o prefixo `[Reprodução Animal]` em `descricao`.

## Permissões e segurança

- Consultas e gravações usam os serviços de CRUD existentes com contexto de `fazenda_id`.
- Usuários com perfil de gestão podem criar, editar e remover eventos reprodutivos.
- Usuários comuns podem consultar a página, mas não podem criar, editar ou remover registros.
- Nenhum arquivo de schema do Supabase, autenticação, dashboard, login, deploy, Twilio ou parser do WhatsApp foi alterado.

## Comportamento da tela

- Os cards dos animais mostram status reprodutivo, último evento, quantidade de eventos e lote.
- Os filtros incluem status reprodutivo, status do animal, categoria e lote.
- A ficha centralizada mostra resumo, formulário e linha do tempo do animal selecionado.
- Custos de eventos continuam usando a sincronização financeira existente.
- Eventos de parto continuam usando a sincronização de ciclo de vida do animal.
