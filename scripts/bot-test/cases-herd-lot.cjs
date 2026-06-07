module.exports = function loadBotTestSection(context) {
  with (context) {
    const herdLotFrameworkCases = [
      {
        name: "consulta de rebanho nao pede confirmacao",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quais animais eu tenho cadastrado"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          responseIncludes: "Encontrei",
          responseNotIncludes: "Está correto",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta rebanho por categoria e lote",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quais vacas estao no lote Lactacao 1"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { categoria: "vaca", lote_nome: "Lactacao 1" },
          responseIncludes: "Lactacao 1",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta rebanho sem lote",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE_B,
        messages: ["animais sem lote"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { sem_lote: true },
          responseIncludes: "sem lote",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta detalhe de animal mostra lote",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["dados da B-002"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          entities: { animal_codigo: "B-002" },
          responseIncludes: "Lote:",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta lotes nao salva",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quais lotes existem?"],
        expected: {
          finalIntent: "CONSULTA_LOTES",
          responseIncludes: "Você tem",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta rebanho pagina segunda pagina",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: Array.from({ length: 10 }, (_, index) => ({
          brinco: `PX-${index + 1}`,
          nome: `Pagina ${index + 1}`,
          lote_id: "lote-lactacao-1"
        })),
        messages: ["pagina 2 do rebanho"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { pagina: 2 },
          responseIncludes: "Mostrando",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "criacao de lote pede confirmacao e salva so apos sim",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["criar lote Bezerras", "sim"],
        expected: {
          finalIntent: "CRIAR_LOTE",
          entities: { lote_nome: "Bezerras" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.lotes],
          shouldSaveValues: { nome: "Bezerras" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "criacao de lote em etapas coleta nome antes de confirmar",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["criar lote", "Recria 2026", "sim"],
        expected: {
          finalIntent: "CRIAR_LOTE",
          entities: { lote_nome: "Recria 2026" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.lotes],
          shouldSaveValues: { nome: "Recria 2026" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "criacao de lote duplicado nao salva",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["criar lote Lactacao 1"],
        expected: {
          finalIntent: "CRIAR_LOTE",
          responseIncludes: "Já existe",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao cria lote",
        module: "rebanho-lotes",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["criar lote Bezerras"],
        expected: {
          finalIntent: "CRIAR_LOTE",
          responseIncludes: "não tem permissão",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "criacao de lote no rancho b usa fazenda correta",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE_B,
        messages: ["criar lote Recria B", "sim"],
        expected: {
          finalIntent: "CRIAR_LOTE",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.lotes],
          shouldSaveValues: { nome: "Recria B" },
          ranchId: BOT_TEST_FARM_ID_B,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "rancho b nao lista lotes do rancho a",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE_B,
        messages: ["quais lotes existem?"],
        expected: {
          finalIntent: "CONSULTA_LOTES",
          responseNotIncludes: "Lactacao",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      }
    ];


    return { herdLotFrameworkCases };
  }
};
