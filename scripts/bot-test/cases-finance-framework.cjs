module.exports = function loadBotTestSection(context) {
  with (context) {
    const financeFrameworkCases = [
      {
        name: "venda fisica de leite sem valor pergunta valor",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi 40L de leite"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { quantidade: 40, unidade: "L", item_nome: "Leite Cru" },
          responseIncludes: "valor da venda",
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "venda fisica de leite com valor pergunta baixa e salva estoque mais receita",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi 40L de leite por 200 reais", "1", "sim"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { quantidade: 40, unidade: "L", valor: 200, item_nome: "Leite Cru", deve_baixar_estoque: true },
          responseIncludes: "Nenhum registro real foi salvo",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { valor: 200 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "venda de milho em sacos preserva quantidade ate a confirmacao",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi 4 sacos de milho por 320 reais", "1", "sim"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { quantidade: 4, unidade: "saco", valor: 320, item_nome: "Milho", deve_baixar_estoque: true },
          responseNotIncludes: "quantidade de estoque válida",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { quantidade: 4, valor: 320 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "venda de feno em fardos preserva quantidade ate a confirmacao",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi 2 fardos de feno por 180 reais", "sim", "confirma"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { quantidade: 2, unidade: "fardo", valor: 180, item_nome: "Feno", deve_baixar_estoque: true },
          responseNotIncludes: "quantidade de estoque válida",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { quantidade: 2, valor: 180 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "venda decimal em kg preserva quantidade ate a confirmacao",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi 1,5 kg de sal mineral por 45 reais", "dar baixa", "sim"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { quantidade: 1.5, unidade: "kg", valor: 45, item_nome: "Sal mineral", deve_baixar_estoque: true },
          responseNotIncludes: "quantidade de estoque válida",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { quantidade: 1.5, valor: 45 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "venda Gemini recupera quantidade perdida antes da confirmacao",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        initialSession: () => ({
          etapa: "aguardando_dado",
          dados: {
            acao_pendente: "venda_baixa_estoque_opcional",
            pending: {
              tipo: "ESTOQUE_SAIDA",
              confianca: 0.94,
              dados: {
                item_nome: "Milho",
                unidade: "saco",
                valor: 320,
                venda: true,
                item_estoque_encontrado: true,
                item_resolvido: "Milho",
                item_id: "item-milho",
                action_plan: {
                  action: "create",
                  domain: "estoque",
                  operation: "venda_estoque",
                  data: {
                    item: "milho",
                    quantidade: 4,
                    unidade: "saco",
                    valor_total: 320,
                    tipo_movimento: "saida"
                  }
                }
              },
              perguntas_faltantes: [],
              resumo: "registrar venda com baixa de estoque"
            }
          }
        }),
        messages: ["sim", "confirma"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { quantidade: 4, unidade: "saco", valor: 320, item_nome: "Milho", deve_baixar_estoque: true },
          responseNotIncludes: "quantidade de estoque válida",
          shouldAskConfirmation: true,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { quantidade: 4, valor: 320 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "venda fisica de leite pode registrar apenas receita",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi 40L de leite por 200 reais", "2", "sim"],
        expected: {
          finalIntent: "RECEITA_VENDA",
          entities: { quantidade: 40, unidade: "L", valor: 200, descricao: "venda de Leite Cru" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { valor: 200 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "entrada financeira completa pede confirmacao e nao salva antes",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900"],
        expected: {
          finalIntent: "RECEITA_VENDA",
          entities: { valor: 900, descricao: "venda de leite" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "entrada financeira salva uma vez apos confirmacao em dry-run",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900", "sim"],
        expected: {
          finalIntent: "RECEITA_VENDA",
          entities: { valor: 900, descricao: "venda de leite" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { tipo: "entrada", valor: 900 },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "saida financeira salva uma vez apos confirmacao em dry-run",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei energia 400", "ok"],
        expected: {
          finalIntent: "DESPESA",
          entities: { valor: 400, descricao: "energia" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { tipo: "saida", valor: 400 },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "saida incompleta coleta valor antes de confirmar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei energia", "400"],
        expected: {
          finalIntent: "DESPESA",
          entities: { valor: 400, descricao: "energia" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "saida incompleta coleta descricao antes de confirmar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["saida 300", "racao"],
        expected: {
          finalIntent: "DESPESA",
          entities: { valor: 300, descricao: "racao" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao de valor financeiro antes de salvar usa valor corrigido",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei energia 40", "na verdade foi 400", "sim"],
        expected: {
          finalIntent: "DESPESA",
          entities: { valor: 400, descricao: "energia" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { valor: 400 },
          shouldNotSaveValues: { valor: 40 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "correcao de descricao financeira antes de salvar usa descricao corrigida",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei energia 400", "era racao", "sim"],
        expected: {
          finalIntent: "DESPESA",
          entities: { valor: 400, descricao: "racao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { descricao: "racao" },
          shouldNotSaveValues: { descricao: "energia" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "troca operacao financeira pendente e salva somente a nova",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900", "paguei energia 400", "sim"],
        expected: {
          finalIntent: "DESPESA",
          entities: { valor: 400, descricao: "energia" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { tipo: "saida", valor: 400 },
          shouldNotSaveValues: { valor: 900 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "cancelamento financeiro limpa sessao e confirmacao antiga nao salva",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900", "cancelar", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "rejeicao financeira limpa sessao sem salvar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900", "nao"],
        expected: {
          finalIntent: "RECEITA_VENDA",
          entities: { valor: 900, descricao: "venda de leite" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "repetir resumo financeiro mantem pendencia e salva uma vez",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900", "repete", "sim"],
        expected: {
          finalIntent: "RECEITA_VENDA",
          entities: { valor: 900, descricao: "venda de leite" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "repetir sem pendencia nao salva",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["repete"],
        expected: {
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "confirmacao duplicada financeira nao duplica salvamento",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vendi leite por 900", "sim", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "consulta financeira nao pede confirmacao nem salva",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 1200, descricao: "leite" },
          { tipo: "saida", valor: 300, descricao: "racao" }
        ],
        messages: ["financeiro do mes"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta resumo de entradas de hoje soma sem confirmar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite" },
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quanto entrou hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "hoje", financeiro_tipo: "entrada", financeiro_modo: "resumo" },
          responseIncludes: "Entradas de hoje",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta resumo de saidas de hoje soma sem confirmar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite" },
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quanto saiu hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "hoje", financeiro_tipo: "saida", financeiro_modo: "resumo" },
          responseIncludes: "Saídas de hoje",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "rancho foi bem esse mes gera analise operacional",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["o rancho foi bem esse mes?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", relatorio_modo: "analise", data_referencia: "mes" },
          responseIncludes: "Análise",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin consulta quanto gastei hoje sem salvar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite" },
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quanto gastei hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "hoje", financeiro_tipo: "saida", financeiro_modo: "resumo" },
          responseIncludes: "Saídas de hoje",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin consulta com o que gastou hoje lista despesas",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" },
          { tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite" }
        ],
        messages: ["com o que eu gastei hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          avoidIntents: ["CONSULTA_REGISTROS_HOJE"],
          entities: { data_referencia: "hoje", financeiro_tipo: "saida", financeiro_modo: "detalhado" },
          responseIncludes: "Compra de racao",
          responseNotIncludes: "pelo WhatsApp",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin consulta gastos filtrados sem despesas retorna vazio financeiro",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["gastos de veterinario hoje"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          avoidIntents: ["CONSULTA_REGISTROS_HOJE"],
          entities: { data_referencia: "hoje", financeiro_tipo: "saida", financeiro_modo: "detalhado", filtro_texto: "veterinario" },
          responseIncludes: "Não encontrei despesas registradas hoje",
          responseNotIncludes: "pelo WhatsApp",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "admin consulta quanto eu gastei hoje soma saidas",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quanto eu gastei hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          avoidIntents: ["CONSULTA_REGISTROS_HOJE"],
          entities: { data_referencia: "hoje", financeiro_tipo: "saida", financeiro_modo: "resumo" },
          responseIncludes: "Saídas de hoje",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum nao consulta quanto gastei hoje",
        module: "financeiro",
        phone: BOT_TEST_WORKER_PHONE,
        financeTransactions: [
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quanto gastei hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          responseIncludes: "não tem permissão",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta transacoes de hoje lista entradas e saidas",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite" },
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quais as minhas transacoes de hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "hoje", financeiro_modo: "detalhado" },
          responseIncludes: "Venda de leite",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta entradas de hoje lista somente entradas",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite" },
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" }
        ],
        messages: ["quais entradas de hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "hoje", financeiro_tipo: "entrada", financeiro_modo: "detalhado" },
          responseIncludes: "Entradas de hoje",
          responseNotIncludes: "Compra de racao",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta saidas filtradas por racao nao vira consulta de estoque",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "saida", valor: 250, descricao: "Compra de racao", categoria: "racao" },
          { tipo: "saida", valor: 100, descricao: "Veterinario", categoria: "veterinario" }
        ],
        messages: ["quanto gastei com racao hoje?"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          avoidIntents: ["CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM", "CONSULTA_ESTOQUE_GERAL"],
          entities: { data_referencia: "hoje", financeiro_tipo: "saida", filtro_texto: "racao" },
          responseIncludes: "sobre racao",
          responseNotIncludes: "Veterinario",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta sem transacoes informa vazio sem salvar",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["transacoes de 01/01/2026"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "2026-01-01", financeiro_modo: "detalhado" },
          responseIncludes: "Não encontrei transações",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta financeira pagina transacoes com ver mais",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 101, descricao: "Venda lote 01" },
          { tipo: "entrada", valor: 102, descricao: "Venda lote 02" },
          { tipo: "entrada", valor: 103, descricao: "Venda lote 03" },
          { tipo: "entrada", valor: 104, descricao: "Venda lote 04" },
          { tipo: "entrada", valor: 105, descricao: "Venda lote 05" },
          { tipo: "entrada", valor: 106, descricao: "Venda lote 06" }
        ],
        messages: ["transacoes do mes", "ver mais"],
        expected: {
          responseIncludes: "Venda lote 04",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta transacoes por mes explicito usa intervalo do mes",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        financeTransactions: [
          { tipo: "entrada", valor: 700, descricao: "Venda junho", data_transacao: "2026-06-10" },
          { tipo: "entrada", valor: 300, descricao: "Venda julho", data_transacao: "2026-07-10" }
        ],
        messages: ["transacoes de junho de 2026"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          entities: { data_referencia: "2026-06", financeiro_modo: "detalhado" },
          responseIncludes: "Venda junho",
          responseNotIncludes: "Venda julho",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "valor zero em financeiro fica aguardando dado e nao salva",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei 0 na racao"],
        expected: {
          finalIntent: "DESPESA",
          entities: { descricao: "racao" },
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "valor negativo em financeiro fica aguardando dado e nao salva",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["paguei -300 na racao"],
        expected: {
          finalIntent: "DESPESA",
          entities: { descricao: "racao" },
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "telefone nao autorizado nao executa financeiro sensivel",
        module: "financeiro",
        phone: "5583000000000",
        messages: ["vendi leite por 900"],
        expected: {
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario nao consulta financeiro",
        module: "financeiro",
        phone: BOT_TEST_WORKER_PHONE,
        messages: ["financeiro do mes"],
        expected: {
          finalIntent: "CONSULTA_FINANCEIRO",
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "financeiro respeita fazenda do usuario whatsapp",
        module: "financeiro",
        phone: BOT_TEST_ADMIN_PHONE_B,
        ranches: [{ id: BOT_TEST_FARM_ID_B, nome: "Fazenda B" }],
        whatsappUsers: [
          {
            id: "wa-admin-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            usuario_id: "user-admin-b",
            funcionario_id: null,
            telefone_e164: BOT_TEST_ADMIN_PHONE_B,
            nome_exibicao: "Dono B",
            papel_bot: "admin",
            ativo: true
          }
        ],
        messages: ["vendi leite por 900", "sim"],
        expected: {
          finalIntent: "RECEITA_VENDA",
          entities: { valor: 900, descricao: "venda de leite" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { tipo: "entrada", valor: 900 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID_B
        }
      }
    ];


    return { financeFrameworkCases };
  }
};
