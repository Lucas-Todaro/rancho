module.exports = function loadBotTestSection(context) {
  //poooo
  with (context) {
    const genealogyFrameworkCases = [
      {
        name: "consulta genealogia responde sem confirmacao",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["genealogia da B-002"],
        expected: {
          finalIntent: "CONSULTA_GENEALOGIA",
          entities: { animal_codigo: "B-002", consulta_genealogia: "arvore" },
          responseIncludes: "Mãe",
          responseNotIncludes: "Está correto",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta filhos lista descendentes sem salvar",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["filhos da Estrela"],
        expected: {
          finalIntent: "CONSULTA_GENEALOGIA",
          entities: { animal_codigo: "B-002", consulta_genealogia: "descendentes" },
          responseIncludes: "Princesa",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta avos de princesa usa pai e mae",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["avós da Princesa"],
        expected: {
          finalIntent: "CONSULTA_GENEALOGIA",
          entities: { animal_codigo: "B-003", consulta_genealogia: "avos" },
          responseIncludes: "Maternos",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "define mae pede confirmacao e nao salva antes",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Estrela"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "A12", mae_id: "animal-b-002" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "define mae salva apenas apos confirmacao em dry-run",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Estrela", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "A12", mae_id: "animal-b-002" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { mae_id: "animal-b-002" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "define pai salva apenas apos confirmacao em dry-run",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["pai do A12 é T-002", "ok"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "A12", pai_id: "animal-t-002" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { pai_id: "animal-t-002" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "define pai e mae na mesma mensagem",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["A12 tem mãe Estrela e pai Touro Forte", "pode salvar"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "A12", mae_id: "animal-b-002", pai_id: "animal-t-002" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { mae_id: "animal-b-002", pai_id: "animal-t-002" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "remove mae com confirmacao",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["remove mãe da B-002", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "B-002", remover_mae: true },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { mae_id: null },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao antes de salvar troca mae",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Mimosa", "não, foi Estrela", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "A12", mae_id: "animal-b-002" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { mae_id: "animal-b-002" },
          shouldNotSaveValues: { mae_id: "animal-b-001" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "negacao sem correcao cancela e nao salva",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Estrela", "não"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          shouldAskConfirmation: true,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cancelamento limpa genealogia pendente",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Estrela", "cancelar"],
        expected: {
          shouldClearSession: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "repetir mostra confirmacao pendente sem salvar",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Estrela", "repetir"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          responseIncludes: "Está correto",
          shouldAskConfirmation: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "confirmacao duplicada nao duplica acao",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe do animal A12 é Estrela", "sim", "sim"],
        expected: {
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          detectStuck: false
        }
      },
      {
        name: "fluxo em etapas coleta mae",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["definir mãe da B-002", "Mimosa", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "B-002", mae_id: "animal-b-001" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao altera genealogia",
        module: "genealogia",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["mãe do animal A12 é Estrela"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          responseIncludes: "não tem permissão",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "animal nao pode ser mae dele mesmo",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe da B-002 é B-002"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          responseIncludes: "não pode ser pai ou mãe dele mesmo",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "bloqueia ciclo com descendente como mae",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mãe da B-002 é Princesa"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          responseIncludes: "descendente",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "pai inexistente pede dado sem salvar",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["pai da A12 é Touro Fantasma"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          responseIncludes: "Não encontrei",
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "nome duplicado pede esclarecimento",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [
          { id: "animal-dup-1", brinco: "D-001", nome: "Duplicada" },
          { id: "animal-dup-2", brinco: "D-002", nome: "Duplicada" }
        ],
        messages: ["mãe da A12 é Duplicada"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          responseIncludes: "mais de uma opção",
          shouldAskFollowUp: true,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "rancho b consulta arvore isolada",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE_B,
        messages: ["genealogia da B-001"],
        expected: {
          finalIntent: "CONSULTA_GENEALOGIA",
          entities: { animal_codigo: "B-001" },
          responseIncludes: "Não informado",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "rancho b update usa fazenda correta",
        module: "genealogia",
        phone: BOT_TEST_ADMIN_PHONE_B,
        messages: ["pai da B-001 é T-001", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_GENEALOGIA",
          entities: { animal_codigo: "B-001", pai_id: "animal-b2-t-001" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          ranchId: BOT_TEST_FARM_ID_B,
          shouldNotWriteBusiness: true
        }
      }
    ];


    return { genealogyFrameworkCases };
  }
};
