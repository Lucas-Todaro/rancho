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
          responseIncludes: "Cancelado",
          shouldAskConfirmation: true,
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
