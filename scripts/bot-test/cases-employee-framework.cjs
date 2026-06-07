module.exports = function loadBotTestSection(context) {
  with (context) {
    const employeePointPayrollFrameworkCases = [
      {
        name: "admin cadastra funcionario pergunta dados obrigatorios antes de salvar",
        module: "funcionarios",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastra funcionario Bruno", "31977776666", "vaqueiro", "2", "sim"],
        expected: {
          finalIntent: "CRIAR_FUNCIONARIO",
          entities: { funcionario_nome: "Bruno", telefone: "5531977776666", funcao: "vaqueiro" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.funcionarios, BOT_TEST_TABLES.whatsappUsuarios],
          shouldSaveValues: { nome: "Bruno", contato_whatsapp: "5531977776666" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin cadastra funcionario com whatsapp e simula acesso bot",
        module: "funcionarios",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastra funcionario Ana WhatsApp 31999999999", "ordenhadora", "2", "sim"],
        expected: {
          finalIntent: "CRIAR_FUNCIONARIO",
          entities: { funcionario_nome: "Ana", telefone: "5531999999999", funcao: "ordenhadora" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.funcionarios, BOT_TEST_TABLES.whatsappUsuarios],
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro bot only pergunta whatsapp antes de confirmar",
        module: "funcionarios",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["cadastra Bruno so no WhatsApp", "31999999999", "vaqueiro", "2", "sim"],
        expected: {
          finalIntent: "CRIAR_FUNCIONARIO",
          entities: { funcionario_nome: "Bruno", telefone: "5531999999999", tipo_acesso: "bot_only", funcao: "vaqueiro" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.funcionarios, BOT_TEST_TABLES.whatsappUsuarios],
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao cadastra funcionario",
        module: "funcionarios",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["cadastra funcionario Bruno"],
        expected: {
          finalIntent: "CRIAR_FUNCIONARIO",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin atualiza salario de funcionario",
        module: "funcionarios",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["muda salario do Joao para 2000", "sim"],
        expected: {
          finalIntent: "ATUALIZAR_FUNCIONARIO",
          entities: { funcionario_nome: "Joao", campo_alterado: "salario_base", novo_valor: 2000 },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.funcionarios],
          shouldSaveValues: { campo_alterado: "salario_base" },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao altera salario",
        module: "funcionarios",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["muda salario do Joao para 2000"],
        expected: {
          finalIntent: "ATUALIZAR_FUNCIONARIO",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin desliga funcionario",
        module: "funcionarios",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["desliga funcionario Joao", "sim"],
        expected: {
          finalIntent: "DESLIGAR_FUNCIONARIO",
          entities: { funcionario_nome: "Joao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.funcionarios],
          shouldSaveValues: { ativo: false },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin exclui funcionario como acao logica",
        module: "funcionarios",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["exclui funcionario Joao", "sim"],
        expected: {
          finalIntent: "EXCLUIR_FUNCIONARIO",
          entities: { funcionario_nome: "Joao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.funcionarios],
          shouldSaveValues: { ativo: false },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "ponto completo salva apenas apos confirmacao",
        module: "ponto",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Joao entrou as 7", "sim"],
        expected: {
          finalIntent: "PONTO_FUNCIONARIO",
          entities: { funcionario_nome: "Joao", ponto_tipo: "entrada", horario: "07:00" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.registrosPonto],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "ponto em etapas pergunta horario",
        module: "ponto",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["entrada do Joao", "7:30", "sim"],
        expected: {
          finalIntent: "PONTO_FUNCIONARIO",
          entities: { funcionario_nome: "Joao", ponto_tipo: "entrada", horario: "07:30" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.registrosPonto],
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario registra proprio ponto sem nome quando whatsapp vinculado",
        module: "ponto",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["registrar ponto agora", "sim"],
        expected: {
          finalIntent: "PONTO_FUNCIONARIO",
          entities: { funcionario_nome: "Joao", ponto_tipo: "entrada", agora: true },
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.registrosPonto],
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin consulta ponto sem confirmacao",
        module: "ponto",
        phone: BOT_TEST_ADMIN_PHONE,
        pointRecords: [{ funcionario_id: "func-joao", tipo: "entrada" }, { funcionario_id: "func-joao", tipo: "saida" }],
        messages: ["ponto do Joao hoje"],
        expected: {
          finalIntent: "CONSULTA_PONTO",
          entities: { funcionario_nome: "Joao" },
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao consulta ponto",
        module: "ponto",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["ponto do Joao hoje"],
        expected: {
          finalIntent: "CONSULTA_PONTO",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta salario de funcionario nao salva",
        module: "folha",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["salario do Joao"],
        expected: {
          finalIntent: "CONSULTA_FUNCIONARIO",
          entities: { funcionario_nome: "Joao", consulta_campo: "salario_base" },
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "pagamento de salario salva folha e despesa apos confirmacao",
        module: "folha",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei salario do Joao 1500", "sim"],
        expected: {
          finalIntent: "PAGAMENTO_FUNCIONARIO",
          entities: { funcionario_nome: "Joao", valor: 1500, pagamento_tipo: "salario" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.folhaPagamento, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { tipo: "saida", valor: 1500 },
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao consulta folha financeira",
        module: "folha",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["folha do mes"],
        expected: {
          finalIntent: "CONSULTA_FOLHA",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      }
    ];


    return { employeePointPayrollFrameworkCases };
  }
};
