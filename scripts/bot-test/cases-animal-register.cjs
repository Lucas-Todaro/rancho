module.exports = function loadBotTestSection(context) {
  with (context) {
    const animalFrameworkCases = [
      {
        name: "consulta de animal nao passa por confirmacao",
        module: "animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 esta prenha?"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          entities: { animal_codigo: "B-002" },
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "atualizacao de animal confirma em dry-run sem escrita real",
        module: "animais",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mudar B-002 para lote Piquete 2", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "lote_id", novo_valor: "Piquete 2" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { campo_alterado: "lote_id", novo_valor: "Piquete 2" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "nova operacao substitui producao pendente",
        module: "confirmacao",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 deu 30 litros para venda", "comprei 3 sacos de milho por 120 reais"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Milho", quantidade: 3, unidade: "saco", valor: 120 },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      }
    ];

    function animalRegistrationMessages(messages, optionalCount = 6, confirmation = "sim") {
      return [...messages, ...Array.from({ length: optionalCount }, () => "2"), confirmation];
    }

    const animalRegistrationNaturalCases = [
      {
        name: "cadastro animal por comando inicial nao usa novo como nome",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["novo animal", "021", "vaca"], 7),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { animal_codigo: "021", categoria: "vaca", sexo: "femea" },
          absentEntities: ["nome"],
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "021", categoria: "vaca", sexo: "femea" },
          shouldNotSaveValues: { nome: "novo" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar animal sem nome mantem nome ausente",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar animal"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          absentEntities: ["nome"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "adicionar animal sem nome mantem nome ausente",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["adicionar animal"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          absentEntities: ["nome"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar novo animal nao usa comandos como nome",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar novo animal"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          absentEntities: ["nome"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "novo animal com nome preserva nome real",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["novo animal Anderson"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Anderson" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar novo animal com nome preserva nome real",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar novo animal Anderson"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Anderson" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "nova vaca sem nome mantem nome ausente",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["nova vaca"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "vaca", sexo: "femea" },
          absentEntities: ["nome"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "nova vaca com nome preserva categoria e nome real",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["nova vaca Estrela"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "vaca", nome: "Estrela", sexo: "femea" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "nova novilha infere femea pelo tipo",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["nova novilha Estrela"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "novilha", nome: "Estrela", sexo: "femea" },
          allResponsesNotInclude: ["sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar vaca com nome preserva categoria e nome real",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar vaca Mimosa"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "vaca", nome: "Mimosa", sexo: "femea" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "novo touro infere macho pelo tipo",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["novo touro Brutus"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "touro", nome: "Brutus", sexo: "macho" },
          allResponsesNotInclude: ["sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar boi com nome e peso preserva dados reais",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar boi Anderson 320kg"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "boi", nome: "Anderson", peso: 320, sexo: "macho" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar animal com codigo nao infere sexo",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar animal 021"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { animal_codigo: "021" },
          absentEntities: ["sexo"],
          responseIncludes: "categoria",
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastrar animal generico com peso pergunta sexo",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar animal Anderson 320kg", "A-320", "animal"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Anderson", peso: 320, animal_codigo: "A-320", categoria: "animal" },
          absentEntities: ["sexo"],
          responseIncludes: "sexo",
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "sexo perguntado aceita 1 como macho",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["novo animal", "S-001", "animal", "1"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { animal_codigo: "S-001", categoria: "animal", sexo: "macho" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "sexo perguntado aceita 2 como femea",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["novo animal", "S-002", "animal", "2"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { animal_codigo: "S-002", categoria: "animal", sexo: "femea" },
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "sexo explicito macho nao pergunta sexo de novo",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar animal Anderson macho 320kg"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Anderson", peso: 320, sexo: "macho" },
          allResponsesNotInclude: ["sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "sexo explicito femea nao pergunta sexo de novo",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar animal Estrela femea 400kg"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Estrela", peso: 400, sexo: "femea" },
          allResponsesNotInclude: ["sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "bezerro infere macho",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar bezerro macho 120kg"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "bezerro", peso: 120, sexo: "macho" },
          allResponsesNotInclude: ["sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "bezerra infere femea",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastrar bezerra femea 110kg"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "bezerro", peso: 110, sexo: "femea" },
          allResponsesNotInclude: ["sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro completo nao pergunta novamente dados informados",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["nova vaca Estrela brinco 021 peso 400kg"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { categoria: "vaca", nome: "Estrela", animal_codigo: "021", peso: 400, sexo: "femea" },
          allResponsesNotInclude: ["nome ou apelido", "peso do animal", "sexo do animal"],
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "campo obrigatorio nao pode ser pulado com 2",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["novo animal", "2"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          absentEntities: ["animal_codigo"],
          responseIncludes: "obrigatório",
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro natural com nome pergunta somente brinco",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["criar vaca Amanda", "B-900"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Amanda", categoria: "vaca", animal_codigo: "B-900" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-900", nome: "Amanda", categoria: "vaca" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "cadastro animal sem sexo nao inventa macho nem femea",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar animal Todaro", "TD-01", "vaca"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Todaro", animal_codigo: "TD-01" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "TD-01", nome: "Todaro" },
          shouldNotSaveValues: { sexo: "macho" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro animal com sexo explicito salva sexo informado",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar vaca Aurora B-905 femea"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Aurora", categoria: "vaca", animal_codigo: "B-905", sexo: "femea" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-905", nome: "Aurora", categoria: "vaca", sexo: "femea" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro natural com peso nao pergunta nome nem peso",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar boi Anderson 320kg", "B-901"], 5),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Anderson", categoria: "boi", animal_codigo: "B-901", peso: 320 },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-901", nome: "Anderson", categoria: "boi", peso: 320 },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro com nome e brinco vai direto para confirmacao",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["criar vaca Amanda B-902"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Amanda", categoria: "vaca", animal_codigo: "B-902" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-902", nome: "Amanda", categoria: "vaca" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro com raca preserva raca e pede so brinco",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar novilha Estrela raca Jersey", "N-935"], 5),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Estrela", categoria: "novilha", animal_codigo: "N-935", raca: "Jersey" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "N-935", nome: "Estrela", categoria: "novilha", raca: "Jersey" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao antes de salvar troca nome do animal",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["criar vaca Amanda B-936", "nao, o nome e Amora"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Amora", categoria: "vaca", animal_codigo: "B-936" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-936", nome: "Amora" },
          shouldNotSaveValues: { nome: "Amanda" },
          detectStuck: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao antes de salvar troca categoria para touro",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar boi Brutus A912", "nao, e touro"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Brutus", categoria: "touro", animal_codigo: "A912" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "A912", nome: "Brutus", categoria: "touro" },
          detectStuck: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao antes de salvar troca brinco",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar vaca Amanda B-937", "nao, brinco e B-938"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Amanda", categoria: "vaca", animal_codigo: "B-938" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-938", nome: "Amanda" },
          shouldNotSaveValues: { brinco: "B-937" },
          detectStuck: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao antes de salvar troca peso",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cadastrar boi Anderson 320kg", "B-939", "nao, peso e 350kg"], 5),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Anderson", categoria: "boi", animal_codigo: "B-939", peso: 350 },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-939", nome: "Anderson", peso: 350 },
          shouldNotSaveValues: { peso: 320 },
          detectStuck: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cancelamento de cadastro animal limpa sessao sem salvar",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["criar vaca Amanda", "cancelar"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          savedAfterConfirmation: false,
          shouldClearSession: true,
          responseIncludes: "Cancelado",
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "confirmacao duplicada nao duplica cadastro animal",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [...animalRegistrationMessages(["criar vaca Amanda B-940"], 6), "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-940", nome: "Amanda" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "erro pequeno vca ainda cadastra vaca",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["cria vca Amanda", "B-941"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          entities: { nome: "Amanda", categoria: "vaca", animal_codigo: "B-941" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-941", nome: "Amanda", categoria: "vaca" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta de vacas nao vira cadastro animal",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quais vacas tenho?"],
        expected: {
          finalIntent: "CONSULTA_REBANHO",
          responseNotIncludes: "correto",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "brinco duplicado bloqueia cadastro animal",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["criar vaca Amanda B-002", ...Array.from({ length: 6 }, () => "2")],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          responseIncludes: "existe",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao cadastra animal",
        module: "cadastro-animal",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["criar vaca Amanda B-942"],
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          responseIncludes: "permiss",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro animal no rancho a usa fazenda correta",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: animalRegistrationMessages(["criar vaca Amanda B-950"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-950", nome: "Amanda" },
          ranchId: BOT_TEST_FARM_ID,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro animal no rancho b usa fazenda correta",
        module: "cadastro-animal",
        phone: BOT_TEST_ADMIN_PHONE_B,
        messages: animalRegistrationMessages(["criar vaca Amanda B-950"], 6),
        expected: {
          finalIntent: "CADASTRO_ANIMAL",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "B-950", nome: "Amanda" },
          ranchId: BOT_TEST_FARM_ID_B,
          shouldNotWriteBusiness: true
        }
      }
    ];


    return { animalFrameworkCases, animalRegistrationMessages, animalRegistrationNaturalCases };
  }
};
