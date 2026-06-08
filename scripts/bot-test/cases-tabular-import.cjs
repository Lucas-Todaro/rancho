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
        name: "mensagem comum nao ativa parser tabular",
        module: "tabela-eventos",
        phrase: "B-002 deu 32 litros",
        expected: {
          tipo: "PRODUCAO_LEITE",
          animal: "B-002",
          litros: 32
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
            tipo: "observacao",
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
      }
    ];

    return { realTabularAnimalEventsMessage, tabularExtraAnimals, tabularImportParserTests, tabularImportFrameworkCases };
  }
};
