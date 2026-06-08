# Relatorio tecnico - importacao tabular pelo WhatsApp

## Escopo

- Parser local para mensagens coladas em formato de tabela com separador `;`.
- Fluxo seguro no WhatsApp: parse, validacao por fazenda, resumo, confirmacao e salvamento apenas das linhas validas.
- Suporte a tabelas de eventos do rebanho e cadastro de animais.
- Suporte a tabela ambigua com pergunta antes de continuar.
- Sem alteracao de schema, RLS, autenticacao, dashboard, landing page ou Twilio.
- Sem envio real de WhatsApp nos testes.
- Sem escrita real de dados nos testes destrutivos: `modoTeste=true` e `salvarReal=false`.

## Tipos de tabela suportados

### Eventos do rebanho

Modelo aceito:

```text
Codigo / Animal;Status / Tipo;Data;Observacoes
B-101;Inseminacao;01/06/2026;IA com touro Nelore
B-102;Protocolo;02/06/2026;Inicio IATF
```

Tambem aceita cabecalho simples:

```text
Animal;Tipo;Data;Obs
B-002;Parto;01/06/2026;animal encontrado
```

Tipos reconhecidos:

- `Inseminacao`.
- `Parto`.
- `Protocolo`.

### Cadastro de animais

Modelo completo aceito:

```text
Codigo;Nome;Categoria;Sexo;Raca;Lote;Nascimento;Peso;Status;Observacoes
B-101;Estrela;vaca;femea;Girolando;Lactacao 1;10/03/2022;480;ativo;
B-102;;bezerro;macho;;;15/01/2026;;ativo;
```

Modelo minimo aceito:

```text
Codigo;Categoria;Sexo
B-201;boi;macho
B-202;vaca;
```

Campos aceitos:

- Codigo/brinco.
- Nome opcional.
- Categoria: `vaca`, `boi`, `bezerro`, `novilha`, `touro`, `outro`.
- Sexo: `macho`, `femea`, `nao_informado`.
- Raca, lote, nascimento, peso, status e observacoes.

## Deteccao

- Cabecalhos com `Data` e `Tipo/Evento/Status` sao tratados como eventos.
- Cabecalhos com `Nome`, `Categoria`, `Sexo`, `Raca`, `Lote`, `Nascimento` ou `Peso` sao tratados como cadastro de animais.
- Cabecalho que pode ser dos dois tipos vira `IMPORTACAO_TABELA_AMBIGUA`; o bot pergunta se e cadastro de animais ou eventos antes de continuar.
- O parser normaliza CRLF, LF, CR, `\n` literal e quebras URL/HTML escapadas.

## Fluxo com animais faltantes

- Em tabela de eventos, animais nao encontrados ficam fora da importacao imediata.
- O bot mostra os codigos faltantes e oferece:
  - cadastrar animais faltantes;
  - importar somente eventos dos animais encontrados;
  - ver pendencias;
  - cancelar.
- Ao cadastrar faltantes, o bot cria uma tabela interna de cadastro de animais com:
  - codigo preservado;
  - categoria `outro`;
  - sexo `nao_informado`;
  - status `ativo`;
  - observacao indicando origem da tabela de eventos.
- Depois do cadastro real, o bot volta a oferecer a importacao dos eventos originais.

## Duplicados e lotes

- Cadastro tabular de animais usa comparacao exata de brinco dentro da fazenda.
- `001` e `1` sao tratados como codigos diferentes no cadastro de animais.
- Codigos repetidos na propria tabela sao ignorados.
- Animais ja existentes no mesmo rancho sao ignorados.
- Lote existente e resolvido pelo nome.
- Lote nao encontrado bloqueia aquela linha, a menos que o dono escolha `criar lotes e cadastrar`.
- Criacao de lote por tabela continua exigindo usuario admin.

## Permissoes e seguranca

- Funcionario comum nao pode importar eventos do rebanho nem cadastrar animais em massa.
- Admin pode importar eventos e cadastrar animais.
- Nenhuma tabela salva antes da confirmacao.
- Consultas/modelos de tabela nao salvam dados.
- Testes usam Supabase mockado e nao enviam WhatsApp real.

## Testes adicionados nesta etapa

- Parser de cadastro de animais completo.
- Parser de cadastro minimo sem nome.
- Parser de tabela ambigua.
- Confirmacao de cadastro tabular sem salvar antes.
- Cadastro tabular apenas de linhas validas.
- Criacao opcional de lote faltante.
- Cadastro com codigo `001` mesmo existindo `1`.
- Bloqueio de funcionario comum.
- Eventos com animais faltantes oferecendo cadastro em massa.
- Eventos com faltantes importando somente encontrados.
- Cadastro em massa dos animais faltantes.
- Escolha de tipo para tabela ambigua.
- Pedido de modelo de tabela sem salvar.

## Validacao executada

- `npm run test:bot`: aprovado, 1188/1188.
- `npm run lint`: aprovado, sem warnings ou erros.
- `npm run build`: aprovado.

## Artefatos

- Relatorio principal do bot: `bot-test-report.md`.
- Relatorio final de regressao: `bot-final-regression-report.md`.
- Este relatorio: `bot-tabular-import-report.md`.
