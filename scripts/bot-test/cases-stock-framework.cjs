module.exports = function loadBotTestSection(context) {
  with (context) {
    const stockConsultationItems = [
      { id: "stock-racao-consulta", nome: "Racao", categoria: "racao", quantidade_atual: 10, quantidade_minima: 5, unidade_medida: "saco" },
      { id: "stock-sal-consulta", nome: "Sal mineral", categoria: "racao", quantidade_atual: 25, quantidade_minima: 5, unidade_medida: "kg" },
      { id: "stock-aftosa-consulta", nome: "Aftosa", categoria: "vacina", quantidade_atual: 8, quantidade_minima: 5, unidade_medida: "dose" },
      { id: "stock-vermifugo-consulta", nome: "Vermifugo", categoria: "medicamento", quantidade_atual: 3, quantidade_minima: 1, unidade_medida: "unidade" }
    ];

    function stockPaginationItems(total = 12) {
      return Array.from({ length: total }, (_, index) => ({
        id: `stock-page-${index + 1}`,
        nome: `Item ${String(index + 1).padStart(2, "0")}`,
        categoria: index % 2 === 0 ? "racao" : "insumo",
        quantidade_atual: index + 1,
        quantidade_minima: 0,
        unidade_medida: "saco"
      }));
    }

    const inventoryFrameworkCases = [
      {
        name: "entrada de estoque completa pede confirmacao e nao salva antes",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "entrada de estoque salva uma vez apos confirmacao em dry-run",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao", "sim"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "compra fisica sem valor salva apenas estoque apos confirmacao",
        module: "estoque-compras",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["comprei 10 sacos de racao", "2", "sim"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "compra fisica com valor simula estoque e despesa no dry-run",
        module: "estoque-compras",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["comprei 10 sacos de racao por 300 reais", "sim"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Racao", quantidade: 10, unidade: "saco", valor: 300 },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { quantidade: 10, valor: 300 },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "compra de item inexistente sem valor pede valor antes de criar",
        module: "estoque-compras",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [
          { text: "comprei 70kg de arroz", salvarReal: true }
        ],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          responseIncludes: "Quanto custou essa compra",
          shouldAskConfirmation: false,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "compra de item inexistente cria item com quantidade e registra despesa",
        module: "estoque-compras",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: [
          { text: "comprei 70kg de arroz por 200 reais", salvarReal: true },
          { text: "sim", salvarReal: true },
          { text: "1", salvarReal: true },
          { text: "sim", salvarReal: true }
        ],
        expected: {
          finalIntent: "CRIAR_ITEM_ESTOQUE",
          responseIncludes: "Registro salvo no sistema com sucesso",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.estoqueItens, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { nome: "arroz", quantidade_atual: 70, valor: 200 },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "baixa de estoque salva uma vez apos confirmacao em dry-run",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["usei 2 sacos de racao", "ok"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { item_nome: "Racao", quantidade: 2, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "baixa de estoque Gemini com destino salva saida apos confirmacao",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["usei 2 sacos de racao no lote lactacao", "sim"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { item_nome: "Racao", quantidade: 2, unidade: "saco", destino: "lote lactacao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { quantidade: 2, destino: "lote lactacao" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "baixa de estoque Gemini sem destino salva saida apos confirmacao",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["dei saida de 5 kg de sal mineral", "sim"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { item_nome: "Sal mineral", quantidade: 5, unidade: "kg" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { quantidade: 5 },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "consulta de estoque nao abre confirmacao nem salva",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["quanto tem de racao?"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_ITEM",
          entities: { item_nome: "Racao" },
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta geral lista itens e quantidades do estoque",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockConsultationItems,
        messages: ["o que tem no estoque?"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_GERAL",
          responseIncludes: "Racao - 10 sacos",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta de item especifico responde saldo com plural correto",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockConsultationItems,
        messages: ["quantos sacos de racao tem?"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_ITEM",
          entities: { item_nome: "Racao" },
          responseIncludes: "10 sacos",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "Gemini query de estoque responde saldo sem confirmar",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockConsultationItems,
        messages: ["quanto tem de racao no estoque"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_ITEM",
          responseIncludes: "Estoque de Racao",
          responseRawIncludes: "10 sacos",
          responseNotIncludes: "Esta correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta estoque baixo lista abaixo do minimo",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: [
          { id: "stock-low-racao", nome: "Racao", categoria: "racao", quantidade_atual: 2, quantidade_minima: 5, unidade_medida: "saco" },
          { id: "stock-ok-sal", nome: "Sal mineral", categoria: "racao", quantidade_atual: 25, quantidade_minima: 5, unidade_medida: "kg" }
        ],
        messages: ["estoque baixo"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_GERAL",
          responseIncludes: "Racao - 2 sacos",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta itens zerados lista quantidade zero",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: [
          { id: "stock-zero-aftosa", nome: "Aftosa", categoria: "vacina", quantidade_atual: 0, quantidade_minima: 5, unidade_medida: "dose" },
          { id: "stock-ok-racao", nome: "Racao", categoria: "racao", quantidade_atual: 10, quantidade_minima: 5, unidade_medida: "saco" }
        ],
        messages: ["itens zerados"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_GERAL",
          responseIncludes: "Aftosa - 0 doses",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta por categoria lista apenas vacinas",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockConsultationItems,
        messages: ["quais vacinas tenho?"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_GERAL",
          responseIncludes: "Aftosa - 8 doses",
          responseNotIncludes: "Racao",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta geral paginada continua com ver mais",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockPaginationItems(12),
        messages: ["me mostra o estoque", "ver mais"],
        expected: {
          responseIncludes: "Item 09",
          shouldClearSession: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cancelar limpa paginacao de estoque",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockPaginationItems(12),
        messages: ["me mostra o estoque", "cancelar"],
        expected: {
          responseIncludes: "Nao ha acao pendente",
          shouldClearSession: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta de estoque com erro de digitacao nao salva",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        stockItems: stockConsultationItems,
        messages: ["qnt tem de racao?"],
        expected: {
          finalIntent: "CONSULTA_ESTOQUE_ITEM",
          responseIncludes: "10 sacos",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "entrada incompleta coleta item antes de confirmar",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos", "racao"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "baixa incompleta coleta quantidade antes de confirmar",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["usei racao", "2 sacos"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { item_nome: "Racao", quantidade: 2, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "correcao de quantidade antes de confirmar salva valor corrigido",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao", "na verdade foram 12", "sim"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Racao", quantidade: 12, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { quantidade: 12 },
          shouldNotSaveValues: { quantidade: 10 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "correcao de item antes de confirmar salva item corrigido",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao", "era sal mineral", "ok"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Sal mineral", quantidade: 10, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { item_nome: "Sal mineral" },
          shouldNotSaveValues: { item_nome: "Racao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "cancelamento de estoque limpa sessao e confirmacao antiga nao salva",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao", "cancela", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "confirmacao duplicada de estoque nao duplica salvamento",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao", "sim", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "nova operacao de estoque substitui pendente sem salvar a antiga",
        module: "estoque",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["chegou 10 sacos de racao", "chegou 5 sacos de sal mineral", "sim"],
        expected: {
          finalIntent: "ESTOQUE_ENTRADA",
          entities: { item_nome: "Sal mineral", quantidade: 5, unidade: "saco" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
          shouldSaveValues: { item_nome: "Sal mineral", quantidade: 5 },
          shouldNotSaveValues: { item_nome: "Racao", quantidade: 10 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "telefone nao autorizado nao executa estoque sensivel",
        module: "permissao",
        phone: "5583000000000",
        messages: ["chegou 10 sacos de racao"],
        expected: {
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      }
    ];


    return { stockConsultationItems, stockPaginationItems, inventoryFrameworkCases };
  }
};
