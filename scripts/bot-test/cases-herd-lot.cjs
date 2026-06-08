module.exports = function loadBotTestSection(context) {
  with (context) {
    const animalIndividualReportAnimals = [
      {
        id: "animal-report-19",
        brinco: "19",
        nome: "Amanda",
        categoria: "vaca",
        sexo: "femea",
        fase: "nao_aplicavel",
        status: "ativo",
        raca: "Girolando",
        data_nascimento: "2021-02-10",
        peso: 480,
        mae_id: "animal-b-001",
        pai_id: "animal-t-001",
        genealogia_observacoes: "linhagem leiteira"
      },
      {
        id: "animal-report-20",
        brinco: "20",
        nome: "Clara",
        categoria: "outro",
        sexo: "femea",
        fase: "nao_aplicavel",
        status: "ativo"
      },
      {
        id: "animal-report-21",
        brinco: "21",
        nome: "Nina",
        categoria: "vaca",
        sexo: "femea",
        fase: "lactacao",
        status: "ativo"
      },
      {
        id: "animal-report-5714",
        brinco: "5714 CF",
        nome: "CF 5714",
        categoria: "vaca",
        sexo: "femea",
        fase: "lactacao",
        status: "ativo"
      }
    ];

    const animalIndividualReportEvents = [
      { animal_id: "animal-report-19", tipo: "parto", descricao: "Parto registrado", data_evento: "2026-01-10T09:00:00.000Z" },
      { animal_id: "animal-report-19", tipo: "inseminacao", medicamento: "Touro Rei", descricao: "Reteste", data_evento: "2026-02-18T09:00:00.000Z" },
      { animal_id: "animal-report-19", tipo: "observacao", descricao: "Prenhez confirmada", data_evento: "2026-03-15T09:00:00.000Z" },
      { animal_id: "animal-report-19", tipo: "observacao", descricao: "Pre-parto registrado", data_evento: "2026-06-01T09:00:00.000Z" },
      { animal_id: "animal-report-19", tipo: "observacao", descricao: "mastite leve", data_evento: "2026-06-04T09:00:00.000Z" },
      { animal_id: "animal-report-21", tipo: "inseminacao", medicamento: "Semen X", descricao: "Inseminacao registrada", data_evento: "2026-04-01T09:00:00.000Z" },
      { animal_id: "animal-report-21", tipo: "observacao", descricao: "Nao passou no protocolo", data_evento: "2026-04-25T09:00:00.000Z" }
    ];

    const animalIndividualReportProductions = [
      { animal_id: "animal-report-19", litros: 18, ordenhado_em: "2026-06-02T07:00:00.000Z" },
      { animal_id: "animal-report-19", litros: 22, ordenhado_em: "2026-06-03T07:00:00.000Z" }
    ];

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
        name: "consulta animais gravidos lista somente prenhas",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quais animais estao gravidos?"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { reproducao: "prenhe" },
          responseIncludes: "B-002",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta prenhas com frase curta",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["me mostra as prenhas"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { reproducao: "prenhe" },
          responseIncludes: "B-002",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta pre parto usa eventos do animal",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: [
          { animal_id: "animal-b-003", tipo: "observacao", descricao: "Pre-parto registrado" }
        ],
        messages: ["me mostre animais em pre parto"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { reproducao: "pre_parto" },
          responseIncludes: "B-003",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta inseminadas usa eventos de cobertura",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: [
          { animal_id: "animal-b-001", tipo: "inseminacao", descricao: "Cobertura registrada" }
        ],
        messages: ["quais vacas foram inseminadas?"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { categoria: "vaca", reproducao: "inseminada" },
          responseIncludes: "B-001",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "paginacao de rebanho preserva filtro reprodutivo",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: Array.from({ length: 12 }, (_, index) => ({
          id: `animal-ins-${index + 1}`,
          brinco: `INS-${String(index + 1).padStart(2, "0")}`,
          nome: `Inseminada ${index + 1}`,
          categoria: "vaca",
          sexo: "femea",
          lote_id: "lote-lactacao-1"
        })),
        animalEvents: [
          { animal_id: "animal-b-001", tipo: "inseminacao", descricao: "Cobertura registrada" },
          ...Array.from({ length: 12 }, (_, index) => ({
            animal_id: `animal-ins-${index + 1}`,
            tipo: "inseminacao",
            descricao: "Inseminacao registrada"
          }))
        ],
        messages: ["quais animais estao inseminados?", "pagina 2 do rebanho"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { reproducao: "inseminada", pagina: 2 },
          responseIncludes: "INS-08",
          responseNotIncludes: "B-002",
          shouldClearSession: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta animais sem evento nao salva nada",
        module: "rebanho-lotes",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quantos animais sem evento?"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          entities: { reproducao: "sem_evento" },
          responseIncludes: "sem eventos",
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
        name: "relatorio individual por codigo inclui reproducao completa",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["como que ta a vaca 19"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          entities: { animal_codigo: "19" },
          responseIncludes: "Reprodução:",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual por nome resolve animal e mostra dados gerais",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["como esta a Amanda?"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          entities: { animal_codigo: "19" },
          responseIncludes: "Nome: Amanda",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual mostra prenhez e data",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["relatorio da vaca 19"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Prenhez confirmada em: 15/03/2026",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual mostra ultima inseminacao e origem",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["me fala da vaca 19"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Origem da inseminação: Touro Rei",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual mostra pre-parto e parto",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["ficha da 19"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Pré-parto: 01/06/2026",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual mostra observacao reteste sem perder status atual",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["resumo da vaca 19"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Observação: Reteste",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual com nao passou vira alerta reprodutivo",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        messages: ["status da vaca 21"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Status: Não passou",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual sem reproducao informa ausencia",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        messages: ["ficha da vaca 20"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Não encontrei registros reprodutivos",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual traduz enums crus",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        messages: ["dados da vaca 20"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Fase: Não se aplica",
          allResponsesNotInclude: ["nao_aplicavel", "Categoria: outro", "undefined", "null"],
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual mostra producao recente",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        animalEvents: animalIndividualReportEvents,
        animalProductions: animalIndividualReportProductions,
        messages: ["situacao da Amanda"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Último registro: 22 litros em 03/06/2026",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual por codigo composto consulta animal certo",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        messages: ["relatorio do animal 5714 CF"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Nome: CF 5714",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual animal nao encontrado",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["ficha da vaca 99999"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Não encontrei esse animal no rebanho",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual nome ambiguo pede escolha",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [
          ...animalIndividualReportAnimals,
          { id: "animal-report-22", brinco: "22", nome: "Amanda", categoria: "vaca", sexo: "femea" }
        ],
        messages: ["como esta a Amanda?"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Encontrei mais de um animal parecido",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio individual respeita multi fazenda",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE_B,
        extraAnimals: [
          ...animalIndividualReportAnimals,
          { id: "animal-report-19-b", fazenda_id: BOT_TEST_FARM_ID_B, brinco: "19", nome: "Amanda B", categoria: "vaca", sexo: "femea", fase: "lactacao" }
        ],
        animalEvents: animalIndividualReportEvents,
        messages: ["relatorio da vaca 19"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          responseIncludes: "Nome: Amanda B",
          responseNotIncludes: "Touro Rei",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "usuario nao autorizado nao acessa relatorio individual",
        module: "animal-relatorio-individual",
        phone: "5583000000000",
        extraAnimals: animalIndividualReportAnimals,
        messages: ["relatorio da vaca 19"],
        expected: {
          responseIncludes: "autorizado",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta individual nao vira cadastro reprodutivo",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        messages: ["como esta a Amanda?"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          avoidIntents: ["ATUALIZACAO_ANIMAL"],
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "registro reprodutivo nao vira consulta individual",
        module: "animal-relatorio-individual",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: animalIndividualReportAnimals,
        messages: ["Amanda esta prenha"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "19", evento_reprodutivo_tipo: "prenhez" },
          shouldAskConfirmation: true,
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
