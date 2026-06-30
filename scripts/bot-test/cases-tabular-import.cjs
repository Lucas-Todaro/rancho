module.exports = function loadBotTestSection(context) {
  with (context) {
    const realTabularAnimalEventsMessage = [
      "Código / Animal;Status / Tipo;Data;Observações",
      "001;Inseminação;01.01.26;",
      "204;Pariu;10.01.26;",
      "143;Inseminação;10.02.26;",
      "177;Inseminação;18.02.26;Reteste",
      "397;Inseminação;13.03.26;",
      "387;Inseminação;13.03.26;",
      "249;Inseminação;20.03.26;",
      "062;Pariu;21.03.26;",
      "195;Pariu;21.03.26;",
      "398;Pariu;26.03.26;",
      "06;Pariu;03.04.26;",
      "159;Pariu;04.04.26;",
      "094;Inseminação;13.04.26;",
      "145;Pariu;18.04.26;",
      "395;Pariu;22.04.26;",
      "305;Inseminação;29.04.26;",
      "080;Inseminação;04.05.26;",
      "5714 CF;Inseminação;06.05.26;Não passou",
      "064;Pariu;07.05.26;",
      "396;Inseminação;07.05.26;",
      "306;Pariu;11.05.26;",
      "057;Pariu;11.05.26;",
      "003;Inseminação;13.05.26;",
      "394;Inseminação;14.05.26;",
      "318;Pariu;14.05.26;",
      "316;Inseminação;16.05.26;",
      "053;Inseminação;23.05.26;",
      "5202;Inseminação;31.05.26;",
      "244;Inseminação;02.06.26;",
      "391;Inseminação;11.11.26;",
      "090;Último Protocolo;;Não passou"
    ].join("\n");
    const escapedTabularAnimalEventsMessage = realTabularAnimalEventsMessage.replace(/\n/g, "\\n");
    const routeSanitizedTabularAnimalEventsMessage = sanitizeWhatsappMessageText(realTabularAnimalEventsMessage);
    const crlfTabularAnimalEventsMessage = realTabularAnimalEventsMessage.replace(/\n/g, "\r\n");
    const flatSingleLineTabularAnimalEventsMessage = realTabularAnimalEventsMessage.replace(/\n/g, " ");
    const pipeAnimalEventsMessage = [
      "Animal|Evento|Data|Obs",
      "318|Inseminacao|05/05/2026|",
      "320|Pariu|06/05/2026|normal",
      "321|Pre-parto|07/05/2026|observar"
    ].join("\n");
    const colonAnimalEventsMessage = [
      "318:Inseminacao",
      "320:Pariu",
      "321:Pre-parto",
      "322:CIO"
    ].join("\n");
    const dashAnimalEventsMessage = [
      "318 - Inseminacao",
      "320 - Pariu",
      "321 - Pre-parto",
      "322 - CIO"
    ].join("\n");
    const animalRegistrationTableMessage = [
      "Codigo;Nome;Categoria;Sexo;Raca;Lote;Nascimento;Peso;Status;Observacoes",
      "IMP-101;Aurora;vaca;femea;Girolando;Lactacao 1;10/03/2022;480;ativo;linha completa",
      "IMP-102;;bezerro;macho;;;15/01/2026;;ativo;",
      "B-002;Duplicada;vaca;femea;;;;;ativo;",
      "IMP-103;Lua;novilha;femea;Jersey;Lote Novo;01/02/2025;300;ativo;"
    ].join("\n");
    const minimalAnimalRegistrationTableMessage = [
      "Codigo;Categoria;Sexo",
      "IMP-201;boi;macho",
      "IMP-202;vaca;"
    ].join("\n");
    const inferredSexAnimalRegistrationTableMessage = [
      "INF-001;vaca",
      "INF-002;boi",
      "INF-003;novilha",
      "INF-004;touro",
      "INF-005;bezerra",
      "INF-006;bezerro"
    ].join("\n");
    const manualSexAnimalRegistrationTableMessage = [
      "007;animal;macho",
      "008;bovino;femea"
    ].join("\n");
    const ambiguousSexAnimalRegistrationTableMessage = [
      "009;animal",
      "010;bovino"
    ].join("\n");
    const exactCodeAnimalRegistrationTableMessage = [
      "Codigo;Categoria;Sexo",
      "001;vaca;femea"
    ].join("\n");
    const ambiguousTabularMessage = [
      "Codigo;Tipo;Data;Sexo",
      "AMB-1;Parto;01/06/2026;femea"
    ].join("\n");
    const missingAnimalEventsMessage = [
      "Animal;Tipo;Data;Obs",
      "B-002;Parto;01/06/26;animal encontrado",
      "MISSING-777;Inseminacao;02/06/26;animal faltante",
      "MISSING-778;Protocolo;03/06/26;animal faltante"
    ].join("\n");
    const prePartoSimpleEventsMessage = [
      "Codigo / Animal;Status / Tipo;Data;Observacoes",
      "001;Inseminacao;01.01.26;",
      "001;Emprenhou;08.02.26;Prenhez confirmada",
      "001;Pré-parto;20.09.26;Previsao de parto proxima",
      "001;Pariu;10.10.26;"
    ].join("\n");
    const mixedBirthPendingEventsMessage = [
      "Codigo / Animal;Status / Tipo;Data;Observacoes",
      "316;PROTOCOLO;01/06/26;",
      "387;PROTOCOLO;01/06/26;",
      "395;RETESTE;01/06/26;",
      "5202;PARIU;01/06/26;",
      "397;PRE PARTO;01/06/26;",
      "396;PRE PARTO;01/06/26;",
      "080;PARIU;01/06/26;"
    ].join("\n");
    const prePartoVariationsEventsMessage = [
      "Codigo / Animal;Status / Tipo;Data;Observacoes",
      "002;Pre-parto;20.09.26;",
      "003;pre parto;21.09.26;",
      "004;Pré parto;22.09.26;",
      "005;PRE-PARTO;23.09.26;",
      "006;preparto;24.09.26;",
      "007;pre_parto;25.09.26;"
    ].join("\n");
    const bigPrePartoEventsMessage = [
      "Codigo / Animal;Status / Tipo;Data;Observacoes",
      ...Array.from({ length: 16 }, (_, index) => {
        const code = String(index + 1).padStart(3, "0");
        const day = String(index + 1).padStart(2, "0");
        return [
          `${code};Inseminacao;${day}.01.26;`,
          `${code};Emprenhou;${day}.02.26;Prenhez confirmada`,
          `${code};Pré-parto;${day}.09.26;`,
          `${code};Pariu;${day}.10.26;`
        ];
      }).flat()
    ].join("\n");
    const partoOnlyEventsMessage = [
      "Codigo / Animal;Status / Tipo;Data;Observacoes",
      "010;Pariu;10.10.26;",
      "011;Parto;11.10.26;",
      "012;Nasceu;12.10.26;"
    ].join("\n");
    const prePartoAndPartoEventsMessage = [
      "Codigo / Animal;Status / Tipo;Data;Observacoes",
      "020;Pré-parto;20.09.26;",
      "020;Pariu;10.10.26;"
    ].join("\n");
    const stockImportTableMessage = [
      "Item;Quantidade;Unidade;Tipo;Data;Observacoes",
      "Racao de boi;10;kg;Entrada;01.06.26;",
      "Aftosa;5;doses;Entrada;02.06.26;",
      "Sal Mineral;;kg;Entrada;03.06.26;Quantidade ausente",
      "Arroz;7;kg;Saida;32.06.26;Item faltante e data invalida"
    ].join("\n");
    const cleanStockImportTableMessage = [
      "Item;Quantidade;Unidade;Tipo;Data;Observacoes",
      "Racao de boi;10;kg;Entrada;01.06.26;",
      "Aftosa;5;doses;Entrada;02.06.26;"
    ].join("\n");
    const missingStockItemTableMessage = [
      "Item;Quantidade;Unidade;Tipo;Data;Observacoes",
      "Racao de boi;10;kg;Entrada;01.06.26;",
      "Arroz;7;kg;Entrada;02.06.26;Item novo"
    ].join("\n");
    const mixedStockImportWithInsufficientExitMessage = [
      "Unidade;Produto;Movimento;Quantidade",
      "sacos;Ração;entrada;10",
      "kg;Sal mineral;saída;20",
      "litros;Diesel;entrada;30"
    ].join("\n");
    const initialStockItemsTableMessage = [
      "Produto;Categoria;Unidade;Quantidade atual;Quantidade mínima;Valor unitário",
      "Milho;ração;saco;20;5;80",
      "Ração lactação;ração;saco;15;6;120",
      "Sal mineral;insumo;kg;100;30;4",
      "Vacina clostridial;medicamento;dose;30;10;18",
      "Diesel;insumo;litro;80;20;6"
    ].join("\n");
    const shuffledAnimalEventsMessage = [
      "Data;Observacoes;Animal;Evento",
      "2026-03-01;;A-10;Inseminacao",
      "2026-03-02;parto normal;B-20;Pariu",
      "2026-03-03;atencao;C-30;Pre-parto",
      "2026-03-04;;D-40;Cio"
    ].join("\n");
    const alternateHeadersAnimalEventsMessage = [
      "bicho;tipo;quando;obs",
      "A-701;Inseminacao;15/07/2026;",
      "B-702;Pariu;2026-07-15;normal",
      "C-703;Pre-parto;15.07.26;observar"
    ].join("\n");
    const commaAnimalEventsMessage = [
      "bicho,quando,tipo,obs",
      "A-711,15/07/2026,Inseminacao,",
      "B-712,2026-07-15,Pariu,normal",
      "C-713,15.07.26,Pre-parto,observar"
    ].join("\n");
    const alternateDashAnimalEventsMessage = [
      "A-777 - CIO",
      "B-888 - INSEMINACAO"
    ].join("\n");
    const productionTableMessage = [
      "animal;litros;data;observacoes",
      "001;15;01/06/2026;ordenha manha",
      "002;20;01/06/2026;ordenha manha",
      "003;18,5;01/06/2026;ordenha tarde"
    ].join("\n");
    const shuffledProductionTableMessage = [
      "data;animal;observacoes;litros",
      "01/06/2026;001;ordenha manha;15",
      "01/06/2026;002;ordenha manha;20",
      "01/06/2026;003;ordenha tarde;18,5"
    ].join("\n");
    const pipeProductionTableMessage = [
      "animal|litros|data|observacoes",
      "001|15|01/06/2026|ordenha manha",
      "002|20|01/06/2026|ordenha manha",
      "003|18,5|01/06/2026|ordenha tarde"
    ].join("\n");
    const dataFirstProductionTableMessage = [
      "Data;Animal;Litros",
      "2026-06-01;A-410;15",
      "2026-06-01;B-411;20"
    ].join("\n");
    const unitProductionTableMessage = [
      "codigo;producao;quando;obs",
      "A-510;15L;01.06.26;manha",
      "B-511;20 l;01.06.26;tarde"
    ].join("\n");
    const tabProductionTableMessage = [
      "animal\tlitros\tdata",
      "A-610\t12\t01/06/2026",
      "B-611\t15\t01/06/2026"
    ].join("\n");
    const namedProductionTableMessage = [
      "vaca|leite|data",
      "Mimosa|18|hoje",
      "Estrela|22|hoje"
    ].join("\n");
    const invalidMiddleProductionTableMessage = [
      "animal;litros;data;observacoes",
      "A-710;10;01/06/2026;ok",
      "B-711;;01/06/2026;sem litros",
      "C-712;11,5;01/06/2026;ok"
    ].join("\n");
    const alternateAnimalRegistrationHeaderMessage = [
      "brinco;animal;tipo",
      "143;Princesa;vaca",
      "062;Lua;vaca",
      "090;Touro E;touro"
    ].join("\n");
    const shuffledAnimalRegistrationMessage = [
      "categoria;nome;codigo",
      "vaca;Princesa;143",
      "vaca;Lua;062",
      "touro;Touro E;090"
    ].join("\n");
    const headerlessNamedAnimalRegistrationMessage = [
      "143;Princesa;vaca",
      "062;Lua;vaca",
      "090;Malhada;vaca"
    ].join("\n");
    const birthChildTableMessage = [
      "mae;data_parto;sexo_cria;codigo_cria;pai;observacoes",
      "001;16/06/2026;femea;B-123;050;parto normal",
      "002;17/06/2026;macho;B-124;;pai nao informado"
    ].join("\n");
    const shuffledBirthChildTableMessage = [
      "codigo_cria;sexo_cria;mae;data_parto;pai",
      "B-200;femea;001;2026-06-16;050"
    ].join("\n");
    const alternateStockEntryHeadersMessage = [
      "produto;qtd entrada;un;preco;obs",
      "racao;10;kg;300;compra semanal",
      "sal mineral;3;saco;180;",
      "feno;5;fardo;;sem preco informado"
    ].join("\n");
    const alternateStockExitHeadersMessage = [
      "produto;saida;unidade;motivo",
      "racao;2;kg;consumo diario",
      "feno;1;fardo;uso no curral"
    ].join("\n");
    const lotsTableMessage = [
      "lote;capacidade;area;status",
      "Piquete 1;30;5ha;ativo",
      "Lactacao;50;10ha;ativo"
    ].join("\n");
    const genealogyTableMessage = [
      "animal;pai;mae",
      "B-123;T-01;M-09",
      "B-124;;M-10"
    ].join("\n");
    const financeTableMessage = [
      "descricao;tipo;valor;data",
      "energia;despesa;350;01/06/2026",
      "venda leite;receita;1200;02/06/2026"
    ].join("\n");
    const invalidFinanceTableMessage = [
      "descricao;tipo;valor;data",
      "energia;despesa;abc;32/06/2026"
    ].join("\n");
    const financePipeShuffledTableMessage = [
      "data|valor|descricao|tipo|categoria",
      "2026-06-01|350|energia|despesa|energia",
      "02.06.26|1200|venda leite|receita|leite"
    ].join("\n");
    const employeesTableMessage = [
      "nome;cargo;telefone;salario",
      "Joao;vaqueiro;83999999999;2500",
      "Maria;ordenha;83888888888;2200"
    ].join("\n");
    const newEmployeesTableMessage = [
      "Nome;Funcao;WhatsApp;Data admissao;Salario",
      "Ana;Vaqueira;+55 83 99999-0001;2026-06-01;2500",
      "Carlos;Ordenhador;+55 83 99999-0002;2026-06-01;2200"
    ].join("\n");
    const invalidEmployeePhoneTableMessage = [
      "nome;cargo;telefone;salario",
      "Ana;vaqueira;123;2500"
    ].join("\n");
    const timeClockTableMessage = [
      "funcionario;data;entrada;saida",
      "Joao;01/06/2026;07:00;17:00",
      "Bruno;01/06/2026;06:00;15:00"
    ].join("\n");
    const healthTableMessage = [
      "animal;procedimento;produto;dose;data",
      "B-001;vacina;Brucelose;5ml;01/06/2026",
      "B-002;medicacao;Antibiotico;10ml;02/06/2026"
    ].join("\n");
    const observationsTableMessage = [
      "animal;observacao;data",
      "B-001;nao comeu bem;01/06/2026",
      "B-002;mancando;02/06/2026"
    ].join("\n");
    const agendaTableMessage = [
      "tarefa;data;responsavel;categoria",
      "vacinar lote 1;10/06/2026;Joao;sanitario",
      "comprar racao;12/06/2026;Maria;estoque"
    ].join("\n");
    const invalidGenealogyParentTableMessage = [
      "animal;pai;mae",
      "B-900;T-999;M-999"
    ].join("\n");
    const invalidPointTimeTableMessage = [
      "funcionario;data;entrada;saida",
      "Joao;01/06/2026;17:00;07:00"
    ].join("\n");
    const unknownDomainTableMessage = [
      "abc;def;ghi",
      "x;y;z"
    ].join("\n");
    const ambiguousProtocolTableMessage = [
      "animal;tipo;data",
      "001;protocolo;01/01/2026"
    ].join("\n");
    const thirtyLineAgendaTableMessage = [
      "tarefa;data;responsavel;categoria",
      ...Array.from({ length: 30 }, (_, index) => {
        const day = String((index % 28) + 1).padStart(2, "0");
        return `tarefa ${index + 1};${day}/06/2026;Equipe ${index + 1};rotina`;
      })
    ].join("\n");

    const tabularAnimalCodes = [
      "001", "204", "143", "177", "397", "387", "249", "062", "195", "398",
      "06", "159", "094", "145", "395", "305", "080", "5714 CF", "064", "396",
      "306", "057", "003", "394", "318", "316", "053", "5202", "244", "391", "090"
    ];

    const tabularExtraAnimals = tabularAnimalCodes.map((brinco) => ({
      id: `animal-tab-${brinco.replace(/\W+/g, "-").toLowerCase()}`,
      brinco,
      nome: `Animal ${brinco}`
    }));

    const tabularImportParserTests = [
      {
        name: "tabela real de eventos detecta 31 linhas",
        module: "tabela-eventos",
        phrase: realTabularAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 31,
          total_linhas_parse_validas: 30,
          total_linhas_parse_invalidas: 1,
          noMissing: true,
          tableRow: { lineNumber: 2, animal: "001", evento_tipo: "inseminacao", data_referencia: "2026-01-01" }
        }
      },
      {
        name: "tabela real preserva codigo com espaco e observacao",
        module: "tabela-eventos",
        phrase: realTabularAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 31,
          tableRow: { lineNumber: 19, animal: "5714 CF", evento_tipo: "inseminacao", data_referencia: "2026-05-06", observacoes: "passou" }
        }
      },
      {
        name: "tabela real com quebras escapadas nao cai no parser comum",
        module: "tabela-eventos",
        phrase: escapedTabularAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 31,
          total_linhas_parse_validas: 30,
          total_linhas_parse_invalidas: 1,
          tableRow: { lineNumber: 2, animal: "001", evento_tipo: "inseminacao", data_referencia: "2026-01-01" }
        }
      },
      {
        name: "tabela real colada em uma linha nao entra como structured input",
        module: "tabela-eventos",
        phrase: flatSingleLineTabularAnimalEventsMessage,
        expected: {
          tipo: "DESCONHECIDO"
        }
      },
      {
        name: "tabela real sanitizada pela rota preserva linhas",
        module: "tabela-eventos",
        phrase: routeSanitizedTabularAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 31,
          total_linhas_parse_validas: 30,
          total_linhas_parse_invalidas: 1,
          tableRow: { lineNumber: 32, animal: "090", evento_tipo: "protocolo", observacoes: "passou", problem: "data_ausente" }
        }
      },
      {
        name: "tabela real com crlf preserva numeracao e linhas",
        module: "tabela-eventos",
        phrase: crlfTabularAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 31,
          total_linhas_parse_validas: 30,
          total_linhas_parse_invalidas: 1,
          tableRow: { lineNumber: 19, animal: "5714 CF", evento_tipo: "inseminacao", data_referencia: "2026-05-06", observacoes: "passou" }
        }
      },
      {
        name: "tabela real marca protocolo sem data",
        module: "tabela-eventos",
        phrase: realTabularAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          tableRow: { lineNumber: 32, animal: "090", evento_tipo: "protocolo", observacoes: "passou", problem: "data_ausente" }
        }
      },
      {
        name: "tabela aceita cabecalho simples e datas variadas",
        module: "tabela-eventos",
        phrase: [
          "Animal;Tipo;Data;Obs",
          " b-002 ; Inseminacao ; 01/01/26 ; Reteste confirmado",
          "",
          "A12;Parto;10-02-26;",
          "5714 cf;Protocolo;03.04.2026;Não passou;segunda tentativa"
        ].join("\n"),
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          tableRow: { lineNumber: 5, animal: "5714 CF", evento_tipo: "protocolo", data_referencia: "2026-04-03", observacoes: "Não passou;segunda tentativa" }
        }
      },
      {
        name: "tabela com pipe funciona como eventos reprodutivos",
        module: "tabela-eventos",
        phrase: pipeAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          route: "structured_input",
          structuredInput: true,
          structuredReason: "multiple_lines_consistent_separator",
          tableRow: { lineNumber: 4, animal: "321", evento_tipo: "pre_parto", data_referencia: "2026-05-07", observacoes: "observar" }
        }
      },
      {
        name: "lista com dois pontos reconhece cio sem hardcode",
        module: "tabela-eventos",
        phrase: colonAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 4,
          total_linhas_parse_invalidas: 4,
          route: "structured_input",
          structuredInput: true,
          structuredReason: "multiple_lines_consistent_pair_list",
          eventCounts: { inseminacao: 1, parto: 1, pre_parto: 1, cio: 1 },
          tableRow: { lineNumber: 5, animal: "322", evento_tipo: "cio", problem: "data_ausente" }
        }
      },
      {
        name: "lista com hifen reconhece cio sem capturar mensagem simples",
        module: "tabela-eventos",
        phrase: dashAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 4,
          total_linhas_parse_invalidas: 4,
          route: "structured_input",
          structuredInput: true,
          structuredReason: "multiple_lines_consistent_pair_list",
          eventCounts: { inseminacao: 1, parto: 1, pre_parto: 1, cio: 1 },
          tableRow: { lineNumber: 5, animal: "322", evento_tipo: "cio", problem: "data_ausente" }
        }
      },
      {
        name: "eventos com colunas embaralhadas usam column mapping e nao posicao fixa",
        module: "tabela-eventos",
        phrase: shuffledAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 4,
          total_linhas_parse_validas: 4,
          columnMapping: { date: 0, observations: 1, animal_ref: 2, event_type: 3 },
          eventCounts: { inseminacao: 1, parto: 1, pre_parto: 1, cio: 1 },
          tableRow: { lineNumber: 5, animal: "D-40", evento_tipo: "cio", data_referencia: "2026-03-04" }
        }
      },
      {
        name: "eventos com aliases genericos aceitam bicho tipo quando obs",
        module: "tabela-eventos",
        phrase: alternateHeadersAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          columnMapping: { animal_ref: 0, event_type: 1, date: 2, observations: 3 },
          tableRow: { lineNumber: 4, animal: "C-703", evento_tipo: "pre_parto", data_referencia: "2026-07-15", observacoes: "observar" }
        }
      },
      {
        name: "eventos com csv mantem mapping mesmo com separador virgula",
        module: "tabela-eventos",
        phrase: commaAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          columnMapping: { animal_ref: 0, date: 1, event_type: 2, observations: 3 },
          tableRow: { lineNumber: 4, animal: "C-713", evento_tipo: "pre_parto", data_referencia: "2026-07-15", observacoes: "observar" }
        }
      },
      {
        name: "lista com hifen usa codigos diferentes sem hardcode",
        module: "tabela-eventos",
        phrase: alternateDashAnimalEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 2,
          total_linhas_parse_invalidas: 2,
          route: "structured_input",
          structuredInput: true,
          structuredReason: "multiple_lines_consistent_pair_list",
          eventCounts: { cio: 1, inseminacao: 1 },
          tableRow: { lineNumber: 3, animal: "B-888", evento_tipo: "inseminacao", problem: "data_ausente" }
        }
      },
      {
        name: "producao tabular soma apenas a coluna de litros",
        module: "tabela-producao",
        phrase: productionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          total_litros: 53.5,
          registros: 3,
          route: "structured_input",
          structuredInput: true,
          structuredReason: "multiple_lines_consistent_separator",
          columnMapping: { animal_ref: 0, litros: 1, date: 2, observations: 3 },
          registroTipos: ["PRODUCAO_LEITE"],
          registroDetalhes: [
            { animal: "001", litros: 15 },
            { animal: "002", litros: 20 },
            { animal: "003", litros: 18.5 }
          ],
          tableRow: { lineNumber: 4, animal: "003", litros: 18.5, data_referencia: "2026-06-01", observacoes: "ordenha tarde" }
        }
      },
      {
        name: "producao tabular com colunas em outra ordem continua correta",
        module: "tabela-producao",
        phrase: shuffledProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          total_litros: 53.5,
          registros: 3,
          columnMapping: { date: 0, animal_ref: 1, observations: 2, litros: 3 },
          registroDetalhes: [
            { animal: "001", litros: 15 },
            { animal: "002", litros: 20 },
            { animal: "003", litros: 18.5 }
          ]
        }
      },
      {
        name: "producao tabular com pipe preserva litros e data separados",
        module: "tabela-producao",
        phrase: pipeProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          total_litros: 53.5,
          registros: 3,
          route: "structured_input",
          structuredInput: true,
          structuredReason: "multiple_lines_consistent_separator",
          columnMapping: { animal_ref: 0, litros: 1, date: 2, observations: 3 }
        }
      },
      {
        name: "producao tabular data primeiro nao usa ano como litros",
        module: "tabela-producao",
        phrase: dataFirstProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          total_litros: 35,
          registros: 2,
          columnMapping: { date: 0, animal_ref: 1, litros: 2 },
          registroDetalhes: [
            { animal: "A-410", litros: 15 },
            { animal: "B-411", litros: 20 }
          ]
        }
      },
      {
        name: "producao tabular aceita unidade grudada e turno generico",
        module: "tabela-producao",
        phrase: unitProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          total_litros: 35,
          columnMapping: { animal_ref: 0, litros: 1, date: 2, observations: 3 },
          tableRow: { lineNumber: 3, animal: "B-511", litros: 20, data_referencia: "2026-06-01", turno: "tarde" }
        }
      },
      {
        name: "producao tabular com tab usa aliases de colunas",
        module: "tabela-producao",
        phrase: tabProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          total_litros: 27,
          columnMapping: { animal_ref: 0, litros: 1, date: 2 }
        }
      },
      {
        name: "producao tabular por nome de vaca usa coluna leite",
        module: "tabela-producao",
        phrase: namedProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          total_litros: 40,
          columnMapping: { animal_ref: 0, litros: 1, date: 2 },
          tableRow: { lineNumber: 2, animal: "MIMOSA", litros: 18, data_referencia: "hoje" }
        }
      },
      {
        name: "producao tabular mantem linha invalida sem perder validas",
        module: "tabela-producao",
        phrase: invalidMiddleProductionTableMessage,
        expected: {
          exactTipo: true,
          tipo: "LOTE_REGISTROS",
          total_linhas: 3,
          total_linhas_parse_validas: 2,
          total_linhas_parse_invalidas: 1,
          total_litros: 21.5,
          registros: 2,
          tableRow: { lineNumber: 3, animal: "B-711", problem: "litros_ausentes" }
        }
      },
      {
        name: "mensagem comum nao ativa parser tabular",
        module: "tabela-eventos",
        phrase: "B-002 deu 32 litros",
        expected: {
          tipo: "PRODUCAO_LEITE",
          animal: "B-002",
          litros: 32,
          route: "normal_message",
          structuredInput: false,
          structuredReason: "single_line_message"
        }
      },
      {
        name: "mensagem simples com codigo numerico nao cai na leitura estruturada",
        module: "tabela-eventos",
        phrase: "090 deu 15 litros hoje",
        expected: {
          tipo: "PRODUCAO_LEITE",
          animal: "090",
          litros: 15,
          route: "normal_message",
          structuredInput: false,
          structuredReason: "single_line_message"
        }
      },
      {
        name: "mensagem simples de inseminacao continua no fluxo normal",
        module: "tabela-eventos",
        phrase: "Mimosa foi inseminada",
        expected: {
          tipo: "ATUALIZACAO_ANIMAL",
          animal: "B-001",
          route: "normal_message",
          structuredInput: false,
          structuredReason: "single_line_message"
        }
      },
      {
        name: "mensagem simples de compra nao cai na leitura estruturada",
        module: "tabela-eventos",
        phrase: "comprei 10kg de racao",
        expected: {
          tipo: "ESTOQUE_ENTRADA",
          route: "normal_message",
          structuredInput: false,
          structuredReason: "single_line_message"
        }
      },
      {
        name: "mensagem simples de uso nao cai na leitura estruturada",
        module: "tabela-eventos",
        phrase: "usei 5kg de racao",
        expected: {
          tipo: "ESTOQUE_SAIDA",
          route: "normal_message",
          structuredInput: false,
          structuredReason: "single_line_message"
        }
      },
      {
        name: "tabela de eventos reconhece pre-parto simples",
        module: "tabela-eventos",
        phrase: prePartoSimpleEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 4,
          total_linhas_parse_validas: 4,
          eventCounts: { inseminacao: 1, prenhez: 1, pre_parto: 1, parto: 1 },
          tableRow: { lineNumber: 4, animal: "001", evento_tipo: "pre_parto", data_referencia: "2026-09-20", observacoes: "Previsao" }
        }
      },
      {
        name: "tabela de eventos reconhece variacoes de pre-parto",
        module: "tabela-eventos",
        phrase: prePartoVariationsEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 6,
          total_linhas_parse_validas: 6,
          eventCounts: { pre_parto: 6 },
          tableRow: { lineNumber: 7, animal: "007", evento_tipo: "pre_parto", data_referencia: "2026-09-25" }
        }
      },
      {
        name: "tabela grande de eventos reconhece todos pre-partos",
        module: "tabela-eventos",
        phrase: bigPrePartoEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 64,
          total_linhas_parse_validas: 64,
          eventCounts: { inseminacao: 16, prenhez: 16, pre_parto: 16, parto: 16 },
          tableRow: { lineNumber: 64, animal: "016", evento_tipo: "pre_parto", data_referencia: "2026-09-16" }
        }
      },
      {
        name: "tabela de eventos continua reconhecendo parto",
        module: "tabela-eventos",
        phrase: partoOnlyEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          eventCounts: { parto: 3 },
          tableRow: { lineNumber: 4, animal: "012", evento_tipo: "parto", data_referencia: "2026-10-12" }
        }
      },
      {
        name: "tabela de eventos nao confunde pre-parto com parto",
        module: "tabela-eventos",
        phrase: prePartoAndPartoEventsMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          eventCounts: { pre_parto: 1, parto: 1 },
          tableRow: { lineNumber: 2, animal: "020", evento_tipo: "pre_parto", data_referencia: "2026-09-20" }
        }
      },
      {
        name: "tabela de parto com cria mapeia mae cria pai e data",
        module: "tabela-genealogia",
        phrase: birthChildTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          tipo_tabela: "birth_child_events",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { mae_ref: 0, date: 1, sexo_cria: 2, codigo_cria: 3, pai_ref: 4, observations: 5 },
          eventCounts: { parto: 2 },
          tableRow: {
            lineNumber: 2,
            animal: "001",
            mae_ref: "001",
            evento_tipo: "parto",
            data_referencia: "2026-06-16",
            cria_sexo: "femea",
            cria_codigo: "B-123",
            pai_ref: "050",
            parto_cria_cadastro: true,
            observacoes: "parto normal"
          }
        }
      },
      {
        name: "tabela de parto com cria embaralhada usa column mapping",
        module: "tabela-genealogia",
        phrase: shuffledBirthChildTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_EVENTOS_TABELA",
          tipo_tabela: "birth_child_events",
          total_linhas: 1,
          total_linhas_parse_validas: 1,
          columnMapping: { codigo_cria: 0, sexo_cria: 1, mae_ref: 2, date: 3, pai_ref: 4 },
          tableRow: {
            lineNumber: 2,
            animal: "001",
            mae_ref: "001",
            evento_tipo: "parto",
            data_referencia: "2026-06-16",
            cria_sexo: "femea",
            cria_codigo: "B-200",
            pai_ref: "050",
            parto_cria_cadastro: true
          }
        }
      },
      {
        name: "tabela de cadastro de animais detecta linhas e campos",
        module: "tabela-animais",
        phrase: animalRegistrationTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 4,
          total_linhas_parse_validas: 4,
          tableRow: { lineNumber: 2, animal: "IMP-101", nome: "Aurora", categoria: "vaca", sexo: "femea", raca: "Girolando", lote_nome: "Lactacao 1", status: "ativo" }
        }
      },
      {
        name: "tabela de animais usa animal como nome quando ha brinco separado",
        module: "tabela-animais",
        phrase: alternateAnimalRegistrationHeaderMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          columnMapping: { animal_ref: 0, name: 1, category: 2 },
          tableRow: { lineNumber: 2, animal: "143", nome: "Princesa", categoria: "vaca", sexo: "femea" }
        }
      },
      {
        name: "tabela de animais com colunas embaralhadas preserva nome",
        module: "tabela-animais",
        phrase: shuffledAnimalRegistrationMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          columnMapping: { animal_ref: 2, name: 1, category: 0 },
          tableRow: { lineNumber: 4, animal: "090", nome: "Touro E", categoria: "touro", sexo: "macho" }
        }
      },
      {
        name: "tabela minima de animais infere sexo pela categoria",
        module: "tabela-animais",
        phrase: minimalAnimalRegistrationTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          tableRow: { lineNumber: 3, animal: "IMP-202", categoria: "vaca", sexo: "femea" }
        }
      },
      {
        name: "tabela de animais sem cabecalho com nome no meio preserva nome",
        module: "tabela-animais",
        phrase: headerlessNamedAnimalRegistrationMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          columnMapping: { animal_ref: 0, name: 1, category: 2 },
          tableRow: { lineNumber: 1, animal: "143", nome: "Princesa", categoria: "vaca", sexo: "femea" }
        }
      },
      {
        name: "tabela de animais sem cabecalho infere sexo por categoria",
        module: "tabela-animais",
        phrase: inferredSexAnimalRegistrationTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 6,
          total_linhas_parse_validas: 6,
          tableRow: { lineNumber: 4, animal: "INF-004", categoria: "touro", sexo: "macho" }
        }
      },
      {
        name: "tabela de animais respeita sexo manual em categoria ambigua",
        module: "tabela-animais",
        phrase: manualSexAnimalRegistrationTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          tableRow: { lineNumber: 2, animal: "008", categoria: "outro", sexo: "femea" }
        }
      },
      {
        name: "tabela de animais nao infere sexo para categorias ambiguas",
        module: "tabela-animais",
        phrase: ambiguousSexAnimalRegistrationTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ANIMAIS_TABELA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          tableRow: { lineNumber: 1, animal: "009", categoria: "outro", sexo: "nao_informado" }
        }
      },
      {
        name: "tabela ambigua pergunta tipo antes de importar",
        module: "tabela-animais",
        phrase: ambiguousTabularMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_AMBIGUA",
          total_linhas: 1
        }
      },
      {
        name: "tabela de estoque detecta item quantidade unidade e tipo",
        module: "tabela-estoque",
        phrase: cleanStockImportTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ESTOQUE_TABELA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          tableRow: { lineNumber: 2, item_nome: "Racao de boi", quantidade: 10, unidade: "kg", tipo_movimento: "entrada" }
        }
      },
      {
        name: "tabela de estoque cadastra itens iniciais sem movimento",
        module: "tabela-estoque",
        phrase: initialStockItemsTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ESTOQUE_TABELA",
          total_linhas: 5,
          total_linhas_parse_validas: 5,
          tableRow: { lineNumber: 2, item_nome: "Milho", tipo_linha_estoque: "cadastro_item", quantidade_atual: 20, quantidade_minima: 5, valor_unitario: 80 }
        }
      },
      {
        name: "tabela de estoque marca quantidade ausente e data invalida",
        module: "tabela-estoque",
        phrase: stockImportTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ESTOQUE_TABELA",
          total_linhas: 4,
          total_linhas_parse_validas: 2,
          total_linhas_parse_invalidas: 2,
          tableRow: { lineNumber: 4, item_nome: "Sal Mineral", problem: "quantidade_ausente" }
        }
      },
      {
        name: "estoque com aliases de entrada mapeia quantidade e movimento padrao",
        module: "tabela-estoque",
        phrase: alternateStockEntryHeadersMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ESTOQUE_TABELA",
          total_linhas: 3,
          total_linhas_parse_validas: 3,
          columnMapping: { item: 0, quantity: 1, unit: 2, value: 3, observations: 4, default_movement_type: "entrada" },
          tableRow: { lineNumber: 3, item_nome: "sal mineral", quantidade: 3, unidade: "saco", tipo_movimento: "entrada" }
        }
      },
      {
        name: "estoque com alias de saida define movimento sem coluna tipo separada",
        module: "tabela-estoque",
        phrase: alternateStockExitHeadersMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_ESTOQUE_TABELA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { item: 0, quantity: 1, unit: 2, observations: 3, default_movement_type: "saida" },
          tableRow: { lineNumber: 2, item_nome: "racao", quantidade: 2, unidade: "kg", tipo_movimento: "saida" }
        }
      },
      {
        name: "roteador universal classifica lotes sem virar animal",
        module: "tabela-dominio",
        phrase: lotsTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "LOTES",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { nome: 0, capacidade: 1, area: 2, status: 3 }
        }
      },
      {
        name: "roteador universal diferencia genealogia de reproducao",
        module: "tabela-dominio",
        phrase: genealogyTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "GENEALOGIA",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { animal_ref: 0, pai_ref: 1, mae_ref: 2 }
        }
      },
      {
        name: "roteador universal classifica financeiro sem virar evento",
        module: "tabela-dominio",
        phrase: financeTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "FINANCEIRO",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { descricao: 0, tipo: 1, valor: 2, data: 3 }
        }
      },
      {
        name: "financeiro com pipe e colunas embaralhadas usa mapping universal",
        module: "tabela-dominio",
        phrase: financePipeShuffledTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "FINANCEIRO",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { data: 0, valor: 1, descricao: 2, tipo: 3, categoria: 4 }
        }
      },
      {
        name: "roteador universal classifica funcionarios",
        module: "tabela-dominio",
        phrase: employeesTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "FUNCIONARIOS",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { nome: 0, cargo: 1, telefone: 2, salario: 3 }
        }
      },
      {
        name: "roteador universal classifica ponto funcionario",
        module: "tabela-dominio",
        phrase: timeClockTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "PONTO_FUNCIONARIO",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { funcionario_ref: 0, data: 1, entrada: 2, saida: 3 }
        }
      },
      {
        name: "roteador universal classifica saude sanitario",
        module: "tabela-dominio",
        phrase: healthTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "SAUDE_SANITARIO",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { animal_ref: 0, evento: 1, produto: 2, dose: 3, data: 4 }
        }
      },
      {
        name: "roteador universal classifica observacoes sem forcar saude",
        module: "tabela-dominio",
        phrase: observationsTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "OBSERVACOES",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { entidade_ref: 0, observacao: 1, data: 2 }
        }
      },
      {
        name: "roteador universal classifica agenda tarefas",
        module: "tabela-dominio",
        phrase: agendaTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "AGENDA_TAREFAS",
          total_linhas: 2,
          total_linhas_parse_validas: 2,
          columnMapping: { titulo: 0, data: 1, responsavel: 2, categoria: 3 }
        }
      },
      {
        name: "roteador universal nao forca tabela desconhecida",
        module: "tabela-dominio",
        phrase: unknownDomainTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_AMBIGUA",
          dominio_tabela: "DESCONHECIDO",
          total_linhas: 1,
          needsUserClarification: true
        }
      },
      {
        name: "protocolo tabular ambiguo pede dominio em vez de inventar",
        module: "tabela-dominio",
        phrase: ambiguousProtocolTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_AMBIGUA",
          dominio_tabela: "DESCONHECIDO",
          total_linhas: 1,
          needsUserClarification: true
        }
      },
      {
        name: "agenda com 30 linhas preserva total sem hardcode",
        module: "tabela-dominio",
        phrase: thirtyLineAgendaTableMessage,
        expected: {
          exactTipo: true,
          tipo: "IMPORTACAO_TABELA_DOMINIO",
          dominio_tabela: "AGENDA_TAREFAS",
          total_linhas: 30,
          total_linhas_parse_validas: 30
        }
      }
    ];

    const tabularImportFrameworkCases = [
      {
        name: "tabela real pede confirmacao e nao salva antes",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [realTabularAnimalEventsMessage],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "Prontas para importar: 30",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela real pelo sanitizador da rota pede confirmacao",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [routeSanitizedTabularAnimalEventsMessage],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "Prontas para importar: 30",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela com pre-parto mostra contador no resumo",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-tab-pre-001", brinco: "001", nome: "Animal 001" }],
        messages: [prePartoSimpleEventsMessage],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "pre-parto: 1",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de reproducao pendente aceita complemento de cria antes de importar",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [mixedBirthPendingEventsMessage, "080;C-080;femea;T-137"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "Com cria completa: 1",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true,
          tableRow: { index: 6, animal: "080", cria_codigo: "C-080", cria_sexo: "femea", parto_cria_cadastro: true }
        }
      },
      {
        name: "tabela financeira pede confirmacao sem virar animal ou evento",
        module: "tabela-dominio",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [financeTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "financeiro",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "validacao dominio financeiro bloqueia valor e data ruins",
        module: "tabela-dominio-validacao",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [invalidFinanceTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Corrija os erros criticos",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "validacao dominio lotes mostra duplicado como aviso",
        module: "tabela-dominio-validacao",
        phone: BOT_TEST_ADMIN_PHONE,
        extraLots: [{ id: "lote-piquete-preview", nome: "Piquete 1" }],
        messages: [lotsTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "lote já cadastrado no rancho",
          allResponsesNotInclude: "lote_duplicado_no_rancho",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "acao pendente permite remover lote da importacao por conversa",
        module: "tabela-dominio",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [lotsTableMessage, "cancela a importacao do lote Piquete 1"],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Removi 1 linha",
          responseNotIncludes: "Piquete 1",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "validacao dominio genealogia bloqueia pais inexistentes",
        module: "tabela-dominio-validacao",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-gene-b900", brinco: "B-900", nome: "Cria 900" }],
        messages: [invalidGenealogyParentTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Corrija os erros criticos",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "validacao dominio funcionario bloqueia whatsapp invalido",
        module: "tabela-dominio-validacao",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [invalidEmployeePhoneTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Corrija os erros criticos",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "validacao dominio ponto bloqueia saida antes da entrada",
        module: "tabela-dominio-validacao",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [invalidPointTimeTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Corrija os erros criticos",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "validacao dominio agenda mostra data passada como aviso",
        module: "tabela-dominio-validacao",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [agendaTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "tarefa com data no passado",
          allResponsesNotInclude: "tarefa_com_data_passada",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "importacao por dominio salva lotes reais e ignora duplicados",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        extraLots: [{ id: "lote-piquete-1", nome: "Piquete 1" }],
        messages: [lotsTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.lotes],
          shouldSaveValues: { nome: "Lactacao" },
          shouldNotSaveValues: { nome: "Piquete 1" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "importacao por dominio salva genealogia real",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [
          { id: "animal-gene-b123", brinco: "B-123", nome: "Cria 123" },
          { id: "animal-gene-b124", brinco: "B-124", nome: "Cria 124" },
          { id: "animal-gene-t01", brinco: "T-01", nome: "Touro 01", sexo: "macho", categoria: "touro" },
          { id: "animal-gene-m09", brinco: "M-09", nome: "Mae 09", sexo: "femea", categoria: "vaca" },
          { id: "animal-gene-m10", brinco: "M-10", nome: "Mae 10", sexo: "femea", categoria: "vaca" }
        ],
        messages: [genealogyTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { pai_id: "animal-gene-t01" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "importacao por dominio salva financeiro real",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [financeTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { descricao: "venda leite", valor: 1200 },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "importacao por dominio salva funcionarios e vinculo whatsapp",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [newEmployeesTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.funcionarios, BOT_TEST_TABLES.whatsappUsuarios],
          shouldSaveValues: { nome: "Ana", telefone_e164: "5583999990001" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "nova tabela substitui importacao pendente sem virar correcao de linhas",
        module: "tabela-dominio",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [mixedBirthPendingEventsMessage, newEmployeesTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          entities: { dominio_tabela: "FUNCIONARIOS" },
          responseNotIncludes: "mae/linha",
          allResponsesNotInclude: "dados corretos de cada cria",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "importacao por dominio salva ponto real",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [timeClockTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.registrosPonto],
          shouldSaveValues: { funcionario_id: "func-joao", tipo: "entrada" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "importacao por dominio salva saude sanitario real",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [healthTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { medicamento: "Brucelose", tipo: "vacina" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "importacao por dominio salva observacoes reais",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [observationsTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { descricao: "nao comeu bem", tipo: "observacao" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "importacao por dominio agenda fica preview only sem tabela real",
        module: "tabela-dominio-save",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [agendaTableMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "ainda nao possui tabela real segura",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela desconhecida pergunta dominio e nao salva",
        module: "tabela-dominio",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [unknownDomainTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_AMBIGUA",
          responseIncludes: "1. Animais",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela real importa apenas linhas validas em dry-run",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [realTabularAnimalEventsMessage, "importar validas"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "30 evento",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 30,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "5714 CF", data_evento: "2026-05-06" },
          shouldNotSaveValues: { animal_codigo: "090" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tabela com quebras escapadas importa com so as validas",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [escapedTabularAnimalEventsMessage, "so as validas"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "30 evento",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 30,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "5714 CF", data_evento: "2026-05-06" },
          shouldNotSaveValues: { animal_codigo: "090" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tabela mostra erros mantendo confirmacao pendente",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [realTabularAnimalEventsMessage, "mostrar erros"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "linha 32",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela ver erros mantendo confirmacao pendente",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [routeSanitizedTabularAnimalEventsMessage, "ver erros"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "linha 32",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela cancela importacao sem salvar",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [routeSanitizedTabularAnimalEventsMessage, "cancelar"],
        expected: {
          responseIncludes: "cancelei",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "producao em tabela confirma total correto sem ler ano como litros",
        module: "tabela-producao",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [
          { id: "animal-prod-001", brinco: "001", nome: "Animal 001" },
          { id: "animal-prod-002", brinco: "002", nome: "Animal 002" },
          { id: "animal-prod-003", brinco: "003", nome: "Animal 003" }
        ],
        messages: [productionTableMessage],
        expected: {
          finalIntent: "LOTE_REGISTROS",
          entities: { total_litros: 53.5 },
          responseIncludes: "53,5",
          responseNotIncludes: "2.026",
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "producao em tabela data primeiro nao salva e nao soma ano",
        module: "tabela-producao",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [
          { id: "animal-prod-a410", brinco: "A-410", nome: "Animal A-410" },
          { id: "animal-prod-b411", brinco: "B-411", nome: "Animal B-411" }
        ],
        messages: [dataFirstProductionTableMessage],
        expected: {
          finalIntent: "LOTE_REGISTROS",
          entities: { total_litros: 35 },
          responseIncludes: "35",
          responseNotIncludes: "2.026",
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "producao em tabela cancela lote inteiro sem salvar",
        module: "tabela-producao",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [
          { id: "animal-prod-a410-cancel", brinco: "A-410", nome: "Animal A-410" },
          { id: "animal-prod-b411-cancel", brinco: "B-411", nome: "Animal B-411" }
        ],
        messages: [dataFirstProductionTableMessage, "cancelar"],
        expected: {
          finalIntent: "LOTE_REGISTROS",
          responseIncludes: "cancelei",
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao importa tabela",
        module: "tabela-eventos",
        phone: BOT_TEST_WORKER_PHONE,
        extraAnimals: tabularExtraAnimals,
        messages: [realTabularAnimalEventsMessage],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "importar eventos do rebanho",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela ignora duplicidade ja existente",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: tabularExtraAnimals,
        animalEvents: [
          {
            animal_id: "animal-tab-001",
            tipo: "inseminacao",
            data_evento: "2026-01-01T12:00:00.000Z",
            descricao: "Inseminacao importado via WhatsApp para o animal 001"
          }
        ],
        messages: [realTabularAnimalEventsMessage, "importar validas"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "29 evento",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 29,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotSaveValues: { animal_codigo: "001" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tabela respeita fazenda do telefone B",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE_B,
        extraAnimals: [
          { id: "animal-b-tab-001", fazenda_id: BOT_TEST_FARM_ID_B, brinco: "001", nome: "Animal 001 B" }
        ],
        messages: [
          ["Animal;Tipo;Data;Obs", "001;Pariu;10.01.26;"].join("\n"),
          "sim"
        ],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "1 evento",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_id: "animal-b-tab-001" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID_B
        }
      },
      {
        name: "tabela de animais pede confirmacao e nao salva antes",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [animalRegistrationTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "Prontos para cadastrar: 2",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de animais com animal como nome preserva nome em dry-run",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [alternateAnimalRegistrationHeaderMessage, "sim"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "3 animal",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 3,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "143", nome: "Princesa", categoria: "vaca" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tabela de animais cadastra apenas validos em dry-run",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [animalRegistrationTableMessage, "1"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "2 animal",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "IMP-101", categoria: "vaca" },
          shouldNotSaveValues: { brinco: "B-002" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tabela de animais cria lote faltante quando solicitado",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [animalRegistrationTableMessage, "2"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "3 animal",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 4,
          savedTables: [BOT_TEST_TABLES.animais, BOT_TEST_TABLES.lotes],
          shouldSaveValues: { brinco: "IMP-103", nome: "Lote Novo" },
          shouldNotSaveValues: { brinco: "B-002" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tabela minima de animais cadastra sem nome",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [minimalAnimalRegistrationTableMessage, "sim"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "2 animal",
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "IMP-202", sexo: "femea" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela sem cabecalho cadastra animais com sexo inferido",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [inferredSexAnimalRegistrationTableMessage, "sim"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "6 animal",
          savedAfterConfirmation: true,
          simulatedSaveCount: 6,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "INF-005", sexo: "femea" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro tabular usa codigo exato e permite 001 mesmo existindo 1",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [exactCodeAnimalRegistrationTableMessage, "sim"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "1 animal",
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "001" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao importa cadastro de animais",
        module: "tabela-animais",
        phone: BOT_TEST_WORKER_PHONE,
        messages: [minimalAnimalRegistrationTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "cadastrar animais",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "eventos com animais faltantes oferecem cadastro em massa",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [missingAnimalEventsMessage],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "Cadastrar animais faltantes",
          shouldAskConfirmation: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "eventos com faltantes importam apenas encontrados quando solicitado",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [missingAnimalEventsMessage, "2"],
        expected: {
          finalIntent: "IMPORTACAO_EVENTOS_TABELA",
          responseIncludes: "1 evento",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-002" },
          shouldNotSaveValues: { animal_codigo: "MISSING-777" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "eventos com faltantes geram cadastro tabular de animais",
        module: "tabela-eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [missingAnimalEventsMessage, "1", "sim"],
        expected: {
          finalIntent: "IMPORTACAO_ANIMAIS_TABELA",
          responseIncludes: "2 animal",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "MISSING-777", categoria: "outro" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela ambigua aceita escolha de cadastro de animais",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [ambiguousTabularMessage, "1"],
        expected: {
          responseIncludes: "tabela de cadastro de animais",
          shouldAskConfirmation: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela ambigua aceita escolha manual de financeiro como opcao 5",
        module: "tabela-dominio",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [ambiguousTabularMessage, "5"],
        expected: {
          finalIntent: "IMPORTACAO_TABELA_DOMINIO",
          responseIncludes: "financeiro",
          shouldAskConfirmation: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "modelo de tabela retorna exemplos sem salvar",
        module: "tabela-animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["modelo de tabela de animais"],
        expected: {
          responseIncludes: "Codigo;Nome;Categoria;Sexo",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque sem erros pede confirmacao",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [cleanStockImportTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "Pre-validacao",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque importa apenas linhas validas",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [stockImportTableMessage, "2"],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "2 movimentacao",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { item_nome: "Aftosa", quantidade: 5 },
          shouldNotSaveValues: { item_nome: "Arroz" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "modo teste nao vaza debug tecnico na resposta final",
        module: "tabela-producao",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 deu 20 litros para venda", "sim"],
        expected: {
          finalIntent: "PRODUCAO_LEITE",
          allResponsesNotInclude: "Debug estoque leite",
          savedAfterConfirmation: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque com item faltante oferece criacao",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [missingStockItemTableMessage],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "Itens de estoque nao cadastrados",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque cadastra itens iniciais ao confirmar",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: [],
        messages: [initialStockItemsTableMessage, "1"],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 5,
          savedTables: [BOT_TEST_TABLES.estoqueItens],
          shouldSaveValues: { nome: "Milho", quantidade_atual: 20, valor_unitario: 80 },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque cria item faltante quando solicitado",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [missingStockItemTableMessage, "1"],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "2 movimentacao",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 3,
          savedTables: [BOT_TEST_TABLES.estoqueItens, BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { nome: "Arroz" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque ignora saida sem saldo e salva demais linhas",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: [
          { id: "stock-racao-tabela", nome: "Ração", categoria: "racao", quantidade_atual: 0, unidade_medida: "sacos" },
          { id: "stock-sal-baixo", nome: "Sal mineral", categoria: "racao", quantidade_atual: 5, unidade_medida: "kg" },
          { id: "stock-diesel-tabela", nome: "Diesel", categoria: "insumo", quantidade_atual: 0, unidade_medida: "litros" }
        ],
        messages: [mixedStockImportWithInsufficientExitMessage, { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "Baixas ignoradas por saldo insuficiente: 1",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { item_id: "stock-diesel-tabela", quantidade: 30, tipo: "entrada" },
          shouldNotWriteBusiness: false
        }
      },
      {
        name: "tabela de estoque mostra pendencias mantendo sessao",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [stockImportTableMessage, "ver pendencias"],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "linha 4",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "acao pendente permite remover linha de estoque por conversa",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [cleanStockImportTableMessage, "nao importa Aftosa"],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "Removi 1 linha",
          responseNotIncludes: "Aftosa: entrada",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "acao pendente responde pergunta sobre linha sem alterar importacao",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [cleanStockImportTableMessage, "mostra a segunda linha"],
        expected: {
          finalIntent: "IMPORTACAO_ESTOQUE_TABELA",
          responseIncludes: "Aftosa",
          responseNotIncludes: "Removi",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tabela de estoque cancela sem salvar",
        module: "tabela-estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [missingStockItemTableMessage, "4"],
        expected: {
          responseIncludes: "Nada foi salvo",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      }
    ];

    return { realTabularAnimalEventsMessage, tabularExtraAnimals, tabularImportParserTests, tabularImportFrameworkCases };
  }
};
