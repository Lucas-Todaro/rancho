const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

process.env.RANCHO_BOT_TEST = "1";
process.env.BOT_INTERPRETER = "gemini";
process.env.BOT_ALLOW_LEGACY_ROLLBACK = "false";
process.env.GEMINI_MODE = "mock";
process.env.GEMINI_ACTION_PLAN_ENABLED = "true";
process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED = "true";
delete process.env.GEMINI_API_KEY;
delete process.env.BOT_GEMINI_MOCK;

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const base = path.join(root, "src", request.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filename
  });
  module._compile(output.outputText, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

const {
  RANCHO_DOMAIN_MANIFEST,
  RANCHO_ACTION_PLAN_DOMAINS
} = require("../src/lib/whatsapp/gemini/domain-manifest.ts");
const {
  validateActionPlan,
  validateImportTableActionPlan
} = require("../src/lib/whatsapp/gemini/action-plan-validator.ts");
const { buildActionPlanPromptFragment } = require("../src/lib/whatsapp/gemini/action-plan-prompt.ts");
const {
  findGeminiMockFixture,
  geminiRuntimeStats,
  resetGeminiRuntimeStats
} = require("../src/lib/whatsapp/gemini/runtime.ts");
const {
  actionPlanRuntimeReportLines,
  actionPlanRuntimeStats,
  resetActionPlanRuntimeStats
} = require("../src/lib/whatsapp/action-plan/runtime.ts");
const { executeActionPlan } = require("../src/lib/whatsapp/action-plan/execute-action-plan.ts");
const { executeQueryActionPlan } = require("../src/lib/whatsapp/action-plan/execute-query-action-plan.ts");
const {
  executeImportTableActionPlan,
  parseStructuredTableForActionPlan
} = require("../src/lib/whatsapp/action-plan/execute-import-table-action-plan.ts");
const {
  normalizeDate,
  normalizeReproductionEvent,
  normalizeSex
} = require("../src/lib/whatsapp/nlp-core/reproduction-normalizers.ts");
const { mergeRanchoMessageData, parseRanchoMessage } = require("../src/lib/whatsapp/nlp.ts");
const { parseWithConfiguredInterpreter } = require("../src/services/whatsapp/interpreter/gemini-primary.ts");
const { TABLES } = require("../src/lib/tables.ts");
const { animalReproductionStatus } = require("../src/components/modules/ReproductionScreen.tsx");
const {
  polishBotResponse,
  userFacingCodeLabel
} = require("../src/lib/whatsapp/user-facing-text.ts");

resetGeminiRuntimeStats();
resetActionPlanRuntimeStats();
global.fetch = async () => {
  throw new Error("test-action-plan nao deve chamar Gemini real");
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const VISIBLE_TECHNICAL_TERMS = /ActionPlan|action_plan|route|domain|legacy|fallback|fixture|mock/i;

function assertCleanVisibleText(text, label) {
  const value = String(text || "");
  assert(!VISIBLE_TECHNICAL_TERMS.test(value), `${label}: texto visivel contem termo tecnico: ${value}`);
}

function assertValid(name, plan, parsedTable) {
  const result = validateActionPlan(clone(plan), { parsedTable });
  assert(result.ok, `${name}: esperado valido, recebido ${result.reason}`);
  return result;
}

function assertInvalid(name, plan, expectedReasonPart, parsedTable) {
  const result = validateActionPlan(clone(plan), { parsedTable });
  assert(!result.ok, `${name}: esperado invalido`);
  if (expectedReasonPart) {
    assert(
      result.reason.includes(expectedReasonPart),
      `${name}: motivo esperado conter "${expectedReasonPart}", recebido "${result.reason}"`
    );
  }
  return result;
}

function loadFixtures() {
  const fixtureDir = path.join(root, "scripts", "bot-test", "gemini-mocks", "action-plan");
  return fs.readdirSync(fixtureDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const parsed = JSON.parse(fs.readFileSync(path.join(fixtureDir, file), "utf8"));
      return {
        name: file.replace(/\.json$/, ""),
        ...parsed,
        plan: parsed.plan || parsed.response
      };
    });
}

function fixtureByName(name) {
  const fixture = loadFixtures().find((item) => item.name === name);
  assert(fixture, `fixture ausente: ${name}`);
  return fixture;
}

function actionStatsSnapshot() {
  return { ...actionPlanRuntimeStats() };
}

function finalParsed(result) {
  if (result.kind === "parsed") return result.parsed;
  if (result.kind === "local") return result.parsed;
  if (result.kind === "consultations") return result.consultations[0] || null;
  if (result.kind === "compound") return result.pending;
  return null;
}

async function withActionPlanFlags(actionEnabled, tableEnabled, fn) {
  const previousAction = process.env.GEMINI_ACTION_PLAN_ENABLED;
  const previousTable = process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED;
  process.env.GEMINI_ACTION_PLAN_ENABLED = actionEnabled ? "true" : "false";
  process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED = tableEnabled ? "true" : "false";
  try {
    return await fn();
  } finally {
    if (previousAction === undefined) delete process.env.GEMINI_ACTION_PLAN_ENABLED;
    else process.env.GEMINI_ACTION_PLAN_ENABLED = previousAction;
    if (previousTable === undefined) delete process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED;
    else process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED = previousTable;
  }
}

async function withGeminiMock(responseFactory, fn) {
  const previous = global.__RANCHO_GEMINI_INTERPRETER_MOCK__;
  global.__RANCHO_GEMINI_INTERPRETER_MOCK__ = responseFactory;
  try {
    return await fn();
  } finally {
    if (previous) global.__RANCHO_GEMINI_INTERPRETER_MOCK__ = previous;
    else delete global.__RANCHO_GEMINI_INTERPRETER_MOCK__;
  }
}

function legacyMilkWithActionPlan(plan) {
  return {
    intent: "PRODUCAO_LEITE",
    confidence: 0.9,
    riskScore: 0.1,
    fields: { animal_ref: "1", litros: 15, data: "hoje" },
    actions: [],
    missing_fields: [],
    warnings: [],
    should_confirm: true,
    response_hint: null,
    action_plan: plan
  };
}

const ADMIN_OWNER = {
  papel_bot: "admin",
  telefone_e164: "5583999999999",
  fazenda_id: "mock-fazenda-1",
  usuario_id: "user-admin",
  whatsapp_usuario_id: "wa-admin",
  nome_exibicao: "Dono"
};

class ActionPlanQueryBuilder {
  constructor(rows) {
    this.rows = rows;
    this.filters = [];
    this.limitCount = null;
    this.orderField = null;
    this.orderAscending = true;
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => String(row[field] ?? "") === String(value ?? ""));
    return this;
  }

  gte(field, value) {
    this.filters.push((row) => String(row[field] ?? "") >= String(value ?? ""));
    return this;
  }

  lt(field, value) {
    this.filters.push((row) => String(row[field] ?? "") < String(value ?? ""));
    return this;
  }

  lte(field, value) {
    this.filters.push((row) => String(row[field] ?? "") <= String(value ?? ""));
    return this;
  }

  limit(count) {
    this.limitCount = Number(count);
    return this;
  }

  order(field, options = {}) {
    this.orderField = field;
    this.orderAscending = options.ascending !== false;
    return this;
  }

  execute() {
    let data = this.rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.orderField) {
      data = [...data].sort((left, right) => {
        const comparison = String(left[this.orderField] ?? "").localeCompare(String(right[this.orderField] ?? ""));
        return this.orderAscending ? comparison : -comparison;
      });
    }
    if (Number.isFinite(this.limitCount)) data = data.slice(0, this.limitCount);
    return { data, error: null };
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }
}

function createActionPlanSupabase(seed) {
  return {
    from(tableName) {
      return new ActionPlanQueryBuilder(seed[tableName] || []);
    }
  };
}

const requiredDomains = [
  "animais",
  "lotes",
  "genealogia",
  "reproducao",
  "producao_leite",
  "estoque",
  "financeiro",
  "funcionarios",
  "ponto_funcionario",
  "saude_sanitario",
  "observacoes",
  "agenda_tarefas"
];

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("manifest carrega dominios minimos", () => {
  for (const domain of requiredDomains) {
    assert(RANCHO_DOMAIN_MANIFEST[domain], `manifest sem dominio ${domain}`);
  }
  assert(RANCHO_ACTION_PLAN_DOMAINS.length >= requiredDomains.length, "lista de dominios incompleta");
});

test("manifest nao expoe campos de escopo interno", () => {
  const forbidden = new Set(["fazenda_id", "rancho_id", "ranch_id", "client_id"]);
  for (const [domain, entry] of Object.entries(RANCHO_DOMAIN_MANIFEST)) {
    for (const field of Object.keys(entry.fields)) {
      assert(!forbidden.has(field), `${domain} expoe ${field}`);
    }
  }
});

test("prompt Gemini-first inclui contrato, manifest e seguranca", () => {
  const prompt = buildActionPlanPromptFragment({ currentDate: "2026-06-18" });
  assert(prompt.includes("ActionPlan prompt version"), "prompt sem versao");
  assert(prompt.includes("Domain manifest"), "prompt sem manifest");
  assert(prompt.includes("delete ou update em massa"), "prompt sem regra de delete");
  assert(prompt.includes("columnMapping"), "prompt sem regra de tabela");
  assert(prompt.includes("Nao retorne markdown, texto livre, intent legado ou SQL"), "prompt ainda permite formato legado");
});

test("fixtures ActionPlan obrigatorias validam ou bloqueiam corretamente", () => {
  const fixtures = loadFixtures();
  assert(fixtures.length >= 11, `fixtures insuficientes: ${fixtures.length}`);
  for (const fixture of fixtures) {
    const parsedTable = fixture.parsedTable || (fixture.plan.action === "import_table" && fixture.input
      ? parseStructuredTableForActionPlan(fixture.input, fixture.plan.table?.separator, fixture.plan.table?.hasHeader)
      : undefined);
    const result = assertValid(fixture.name, fixture.plan, parsedTable);
    if (fixture.plan.action === "clarify" || fixture.plan.action === "block") {
      assert(result.executable === false, `${fixture.name}: clarify/block nao deve ser executavel`);
    }
    if (fixture.plan.action === "import_table") {
      const importResult = validateImportTableActionPlan(clone(fixture.plan), parsedTable);
      assert(importResult.ok, `${fixture.name}: validateImportTableActionPlan falhou`);
    }
  }
});

test("campo inexistente falha", () => {
  assertInvalid("campo inexistente", {
    action: "query",
    domain: "financeiro",
    confidence: 0.9,
    filters: [{ field: "campo_fake", op: "eq", value: "x" }],
    requiresConfirmation: false
  }, "nao existe");
});

test("aggregation em campo nao numerico falha", () => {
  assertInvalid("aggregation nao numerica", {
    action: "query",
    domain: "financeiro",
    confidence: 0.9,
    filters: [],
    aggregations: [{ field: "descricao", op: "sum" }],
    requiresConfirmation: false
  }, "aggregatable");
});

test("query sem domain falha", () => {
  assertInvalid("query sem domain", {
    action: "query",
    domain: "",
    confidence: 0.9,
    filters: [],
    requiresConfirmation: false
  }, "domain obrigatorio");
});

test("import_table com coluna inexistente falha", () => {
  const fixture = loadFixtures().find((item) => item.name === "import-table-financeiro");
  const plan = clone(fixture.plan);
  plan.table.columnMapping.valor = "valor_inexistente";
  assertInvalid("import coluna inexistente", plan, "coluna inexistente", fixture.parsedTable);
});

test("delete nao e suportado e block nao e executavel", () => {
  assertInvalid("delete", {
    action: "delete",
    domain: "animais",
    confidence: 0.95,
    filters: [],
    requiresConfirmation: true
  }, "delete nao e suportado");

  const result = assertValid("block", {
    action: "block",
    reason: "destructive_bulk_action",
    userMessage: "Nao posso apagar dados em massa."
  });
  assert(result.status === "blocked" && result.executable === false, "block deveria ser bloqueado e nao executavel");
});

test("query nunca exige confirmacao", () => {
  assertInvalid("query com confirmacao", {
    action: "query",
    domain: "financeiro",
    confidence: 0.9,
    filters: [],
    requiresConfirmation: true
  }, "requiresConfirmation=false");
});

test("create update e import_table exigem confirmacao", () => {
  assertInvalid("create sem confirmacao", {
    action: "create",
    domain: "financeiro",
    confidence: 0.9,
    data: { tipo: "despesa", valor: 100, categoria: "energia" },
    requiresConfirmation: false
  }, "requiresConfirmation=true");

  assertInvalid("update sem confirmacao", {
    action: "update",
    domain: "animais",
    confidence: 0.9,
    data: { animal_ref: "001", status: "ativo" },
    filters: [{ field: "animal_ref", op: "eq", value: "001" }],
    requiresConfirmation: false
  }, "requiresConfirmation=true");

  const fixture = loadFixtures().find((item) => item.name === "import-table-producao");
  const plan = clone(fixture.plan);
  plan.requiresConfirmation = false;
  assertInvalid("import sem confirmacao", plan, "requiresConfirmation=true", fixture.parsedTable);
});

test("SQL livre e campos de escopo interno sao bloqueados", () => {
  assertInvalid("sql livre", {
    action: "query",
    domain: "financeiro",
    confidence: 0.9,
    filters: [{ field: "descricao", op: "contains", value: "select * from transacoes_financeiras" }],
    requiresConfirmation: false
  }, "SQL livre");

  assertInvalid("fazenda_id vindo do Gemini", {
    action: "create",
    domain: "financeiro",
    confidence: 0.9,
    data: { tipo: "despesa", valor: 100, categoria: "energia", fazenda_id: "x" },
    requiresConfirmation: true
  }, "nao pode vir do Gemini");
});

test("limit acima do dominio e limitado por maxLimit", () => {
  const result = assertValid("limit cap", {
    action: "query",
    domain: "financeiro",
    confidence: 0.9,
    filters: [],
    limit: 9999,
    requiresConfirmation: false
  });
  assert(result.value.limit === RANCHO_DOMAIN_MANIFEST.financeiro.maxLimit, "limit nao foi limitado");
  assert(result.warnings.some((warning) => warning.includes("limit limitado")), "warning de limit ausente");
});

test("tabela desconhecida vira clarify em vez de dominio default", () => {
  const fixture = loadFixtures().find((item) => item.name === "import-table-desconhecida-clarify");
  const result = assertValid("tabela desconhecida clarify", fixture.plan, fixture.parsedTable);
  assert(result.status === "clarify", "tabela desconhecida deveria ser clarify");
});

test("executor query financeiro ultimos 6 meses usa periodo ActionPlan", async () => {
  const fixture = fixtureByName("query-financeiro-ultimos-6-meses");
  const result = await executeQueryActionPlan({
    plan: clone(fixture.plan),
    owner: ADMIN_OWNER,
    currentDate: "2026-06-18",
    supabase: createActionPlanSupabase({
      [TABLES.transacoesFinanceiras]: [
        { id: "entrada-1", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "entrada", valor: 5000, descricao: "venda leite", categoria: "leite", data_transacao: "2026-06-01" },
        { id: "saida-1", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 1200, descricao: "racao", categoria: "racao", data_transacao: "2026-05-10" },
        { id: "saida-2", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 400, descricao: "energia", categoria: "energia", data_transacao: "2026-02-10" },
        { id: "fora-periodo", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 900, descricao: "racao antiga", categoria: "racao", data_transacao: "2025-10-01" }
      ]
    })
  });
  assert(result.ok, `query financeiro deveria executar: ${result.reason}`);
  assert(result.rows.length === 3, `esperado 3 linhas no periodo, recebido ${result.rows.length}`);
  assert(result.response.includes("Relatório financeiro dos últimos 6 meses:"), "resposta financeira sem titulo limpo esperado");
  assertCleanVisibleText(result.response, "resposta query financeiro");
  assert(result.parsed.dados?.resultado?.metrics?.byMonth, "agrupamento mensal ausente");
});

test("executor query gasto com racao 90 dias nao vira mes atual", async () => {
  const fixture = fixtureByName("query-financeiro-racao-90-dias");
  const result = await executeQueryActionPlan({
    plan: clone(fixture.plan),
    owner: ADMIN_OWNER,
    currentDate: "2026-06-18",
    supabase: createActionPlanSupabase({
      [TABLES.transacoesFinanceiras]: [
        { id: "racao-1", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 1200, descricao: "compra de racao", categoria: "racao", data_transacao: "2026-05-10" },
        { id: "racao-2", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 200, descricao: "racao bezerros", categoria: "racao", data_transacao: "2026-04-01" },
        { id: "receita", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "entrada", valor: 300, descricao: "venda racao", categoria: "outros", data_transacao: "2026-06-02" },
        { id: "fora-periodo", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 999, descricao: "racao antiga", categoria: "racao", data_transacao: "2026-01-05" }
      ]
    })
  });
  assert(result.ok, `query racao deveria executar: ${result.reason}`);
  assert(result.rows.length === 2, `esperado 2 gastos com racao, recebido ${result.rows.length}`);
  assert(Number(result.parsed.dados?.resultado?.metrics?.totals?.total_gasto || 0) === 1400, "total_gasto deveria somar apenas saidas no periodo");
  assertCleanVisibleText(result.response, "resposta query racao");
});

test("executor query producao Mimosa desde janeiro usa relacao animal", async () => {
  const fixture = fixtureByName("query-producao-mimosa-desde-janeiro");
  const result = await executeQueryActionPlan({
    plan: clone(fixture.plan),
    owner: ADMIN_OWNER,
    currentDate: "2026-06-18",
    supabase: createActionPlanSupabase({
      [TABLES.animais]: [
        { id: "animal-mimosa", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "001", nome: "Mimosa", categoria: "vaca" },
        { id: "animal-lua", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "002", nome: "Lua", categoria: "vaca" }
      ],
      [TABLES.ordenhas]: [
        { id: "ord-1", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-mimosa", litros: 15, ordenhado_em: "2026-01-10" },
        { id: "ord-2", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-mimosa", litros: 20, ordenhado_em: "2026-06-01" },
        { id: "ord-3", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-lua", litros: 30, ordenhado_em: "2026-06-01" }
      ]
    })
  });
  assert(result.ok, `query producao deveria executar: ${result.reason}`);
  assert(result.rows.length === 2, `esperado 2 registros da Mimosa, recebido ${result.rows.length}`);
  assert(result.response.includes("Mimosa"), "resposta deveria citar Mimosa");
  assert(result.response.includes("Produção de leite da Mimosa:"), "resposta de producao sem titulo limpo esperado");
  assertCleanVisibleText(result.response, "resposta query producao");
  assert(Number(result.parsed.dados?.resultado?.metrics?.totals?.total_litros || 0) === 35, "total_litros deveria ser 35");
});

test("executor import_table producao gera preview sem salvar", async () => {
  const fixture = fixtureByName("import-table-producao");
  const result = await executeImportTableActionPlan({
    plan: clone(fixture.plan),
    text: fixture.input
  });
  assert(result.ok, `import producao deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "LOTE_REGISTROS", `intent esperado LOTE_REGISTROS, recebido ${result.parsed.tipo}`);
  assert(result.parsed.dados?.total_registros === 2, "deveria ter 2 registros");
  assert(result.parsed.dados?.total_litros === 35, "total_litros deveria ser 35");
  assert(result.preview.includes("Li a tabela e preparei a importação"), "preview deveria ser texto final limpo");
  assertCleanVisibleText(result.preview, "preview import producao");
});

test("executor import_table estoque aceita defaultFields seguros", async () => {
  const fixture = fixtureByName("import-table-estoque");
  const plan = clone(fixture.plan);
  plan.table.columnMapping = {
    item: "item",
    quantidade: "quantidade",
    unidade: "unidade",
    valor_total: "valor_total",
    data: "data"
  };
  plan.table.defaultFields = { tipo_movimento: "entrada" };
  const result = await executeImportTableActionPlan({
    plan,
    text: "item;quantidade;unidade;valor_total;data\nRacao;10;kg;1200;01/06/2026"
  });
  assert(result.ok, `import estoque deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA", `intent esperado IMPORTACAO_ESTOQUE_TABELA, recebido ${result.parsed.tipo}`);
  assert(result.rows[0]?.parsedValues?.tipo_movimento === "entrada", "defaultFields deveria marcar entrada");
  assert(result.parsed.dados?.preview_only === true, "import ActionPlan deve ficar em preview");
});

test("mensagens visiveis traduzem codigos internos e corrigem ortografia", () => {
  assert(userFacingCodeLabel("tarefa_com_data_passada") === "tarefa com data no passado", "codigo de tarefa deveria ser traduzido");
  assert(userFacingCodeLabel("novo_codigo_interno") === "novo codigo interno", "codigo desconhecido deveria perder underlines");
  const polished = polishBotResponse("Aviso: lote_duplicado_no_rancho. Corrija os erros criticos. Nao ha linhas validas. Esta correto?");
  assert(polished.includes("lote já cadastrado no rancho"), "aviso de lote deveria ser amigavel");
  assert(polished.includes("erros críticos"), "ortografia de criticos deveria ser corrigida");
  assert(polished.includes("Não"), "ortografia de nao deveria ser corrigida");
  assert(polished.includes("Não há"), "frase nao ha deveria ser corrigida");
  assert(polished.includes("linhas válidas"), "ortografia de validas deveria ser corrigida");
  assert(polished.includes("Está correto?"), "pergunta de confirmacao deveria ter acento");
  assert(polishBotResponse("Animal B_002 preservado.") === "Animal B_002 preservado.", "codigo de animal nao deve ser alterado");
});

test("ActionPlan de estoque entende saida acentuada com colunas embaralhadas", async () => {
  const fixture = fixtureByName("import-table-estoque-movimentos-embaralhados");
  const result = await executeImportTableActionPlan({
    plan: clone(fixture.plan),
    text: fixture.input
  });
  assert(result.ok, `tabela de estoque embaralhada deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA", `intent incorreto: ${result.parsed.tipo}`);
  assert(result.parsed.dados?.table_action_plan_used === true, "tabela deveria usar ActionPlan");
  assert(result.parsed.dados?.total_linhas_parse_validas === 3, "as 3 linhas deveriam ser validas");
  const stockRows = result.parsed.dados?.linhas || [];
  assert(stockRows[1]?.item_nome === "Sal mineral", "produto da segunda linha foi mapeado incorretamente");
  assert(stockRows[1]?.quantidade === 20, "quantidade da saida foi mapeada incorretamente");
  assert(stockRows[1]?.unidade === "kg", "unidade da saida foi mapeada incorretamente");
  assert(stockRows[1]?.tipo_movimento === "saida", "saida acentuada deveria normalizar para saida");
  assert(result.preview.includes("entradas 2, saidas 1"), "resumo deveria contar uma saida");
});

test("ActionPlan de estoque normaliza variacoes gerais de entrada e saida", async () => {
  const text = [
    "Movimento;Quantidade;Produto;Unidade",
    "Reposição;8;Feno;fardos",
    "Retirada;3;Ração;kg",
    "descarte;2;Sal mineral;sacos",
    "recebido;12;Diesel;litros"
  ].join("\n");
  const plan = {
    action: "import_table",
    domain: "estoque",
    confidence: 0.95,
    table: {
      hasHeader: true,
      separator: ";",
      columnMapping: {
        tipo_movimento: "Movimento",
        quantidade: "Quantidade",
        item: "Produto",
        unidade: "Unidade"
      }
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `variacoes de estoque deveriam executar: ${result.reason}`);
  const stockRows = result.parsed.dados?.linhas || [];
  assert(stockRows.every((row) => row.problemas.length === 0), "nenhuma variacao deveria ficar invalida");
  assert(stockRows.map((row) => row.tipo_movimento).join(",") === "entrada,saida,saida,entrada", "movimentos normalizados incorretamente");
});

test("ActionPlan de lotes aceita capacidade descricao e ativo", async () => {
  const fixture = fixtureByName("import-table-lotes-capacidade-ativo");
  const result = await executeImportTableActionPlan({
    plan: clone(fixture.plan),
    text: fixture.input
  });
  assert(result.ok, `tabela de lotes deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "IMPORTACAO_TABELA_DOMINIO", `intent incorreto: ${result.parsed.tipo}`);
  assert(result.parsed.dados?.dominio_tabela === "LOTES", "dominio LOTES ausente");
  assert(result.parsed.dados?.table_action_plan_used === true, "tabela deveria usar ActionPlan");
  assert(result.parsed.dados?.total_linhas_parse_validas === 2, "as 2 linhas deveriam ser validas");
  assert(result.rows[0]?.parsedValues?.capacidade === 30, "capacidade deveria ser numerica");
  assert(result.rows[0]?.parsedValues?.descricao === "Vacas em produção", "descricao deveria ser preservada");
  assert(result.rows[0]?.parsedValues?.ativo === true, "sim deveria normalizar para ativo");
});

test("ActionPlan de lotes aceita area situacao e ordem variada", async () => {
  const text = [
    "Situação;Área;Nome;Descrição;Capacidade",
    "inativo;5 ha;Piquete Descanso;Área em recuperação;15",
    "ativo;8,5 ha;Lactação 2;Vacas em produção;40"
  ].join("\n");
  const plan = {
    action: "import_table",
    domain: "lotes",
    confidence: 0.94,
    table: {
      hasHeader: true,
      separator: ";",
      columnMapping: {
        status: "Situação",
        area: "Área",
        nome: "Nome",
        descricao: "Descrição",
        capacidade: "Capacidade"
      }
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `variacao de lotes deveria executar: ${result.reason}`);
  assert(result.rows.every((row) => row.status_linha === "pronto"), "todas as linhas de lotes deveriam ficar prontas");
  assert(result.rows[0]?.parsedValues?.status === false, "inativo deveria normalizar para false");
  assert(result.rows[1]?.parsedValues?.status === true, "ativo deveria normalizar para true");
  assert(result.rows[1]?.parsedValues?.area === 8.5, "area decimal deveria ser preservada");
});

test("normalizadores de reproducao aceitam aliases, datas curtas e sexo abreviado", () => {
  assert(normalizeReproductionEvent("Pariu") === "PARTO", "Pariu deveria normalizar para PARTO");
  assert(normalizeReproductionEvent("Inseminação") === "INSEMINACAO", "Inseminacao deveria normalizar");
  assert(normalizeReproductionEvent("Emprenhada") === "PRENHEZ", "Emprenhada deveria normalizar");
  assert(normalizeReproductionEvent("pré-parto") === "PRE_PARTO", "Pre-parto deveria normalizar");
  assert(normalizeReproductionEvent("abortou") === "ABORTO", "Abortou deveria normalizar");
  assert(normalizeReproductionEvent("recem-parida") === "PARTO", "Recem-parida deveria normalizar para PARTO");
  assert(normalizeReproductionEvent("protocolo de IA") === "EM_PROTOCOLO", "Protocolo IA deveria normalizar");
  assert(normalizeReproductionEvent("nova tentativa de inseminacao") === "EM_RETESTE", "Nova tentativa deveria normalizar para reteste");
  assert(normalizeDate("20.6.26", "2026-06-20") === "2026-06-20", "data pontuada curta incorreta");
  assert(normalizeDate("ontem", "2026-06-20") === "2026-06-19", "ontem incorreto");
  assert(normalizeSex("f") === "femea", "sexo f deveria normalizar");
  assert(normalizeSex("bezerro") === "macho", "bezerro deveria normalizar para macho");
});

test("ActionPlan de protocolo e reteste preserva evento sem alterar categoria", async () => {
  for (const fixtureName of ["create-reproducao-protocolo", "create-reproducao-reteste"]) {
    const fixture = fixtureByName(fixtureName);
    const result = await executeActionPlan({
      plan: clone(fixture.plan),
      text: fixture.input,
      owner: ADMIN_OWNER,
      currentDate: "2026-06-21"
    });
    assert(result.ok, `${fixtureName} deveria executar: ${result.reason}`);
    assert(result.parsed.tipo === "ATUALIZACAO_ANIMAL", `${fixtureName}: intent incorreta`);
    assert(result.parsed.dados?.registro_evento_animal === true, `${fixtureName}: evento historico ausente`);
    assert(["protocolo", "reteste"].includes(result.parsed.dados?.evento_reprodutivo_tipo), `${fixtureName}: tipo persistivel incorreto`);
    assert(!("categoria" in result.parsed.dados), `${fixtureName}: status nao pode virar categoria`);
    assert(fixture.plan.requiresConfirmation === true, `${fixtureName}: confirmacao obrigatoria ausente`);
  }
});

test("status reprodutivo mantem inseminacao complementar e parto encerra prenhez atual", () => {
  const animal = { id: "animal-1", categoria: "vaca", lote_id: "lote-1", fase: "gestante" };
  const withRetest = animalReproductionStatus(animal, [
    { tipo: "inseminacao", data_evento: "2026-06-10T12:00:00Z", descricao: "Inseminacao registrada" },
    { tipo: "observacao", data_evento: "2026-06-20T12:00:00Z", descricao: "[Reproducao Animal] Reteste de protocolo" }
  ]);
  assert(withRetest.key === "reteste", `status atual esperado reteste, recebido ${withRetest.key}`);
  assert(withRetest.keys.includes("inseminada"), "inseminacao historica deveria continuar filtravel");
  assert(withRetest.keys.includes("reteste"), "reteste deveria estar nos estados complementares");

  const afterBirth = animalReproductionStatus(animal, [
    { tipo: "inseminacao", data_evento: "2025-09-10T12:00:00Z", descricao: "Inseminacao registrada" },
    { tipo: "parto", data_evento: "2026-06-21T12:00:00Z", descricao: "Parto registrado" }
  ]);
  assert(afterBirth.key === "parto", `parto deveria ser o estado atual, recebido ${afterBirth.key}`);
  assert(afterBirth.label === "Recém-parida", `rotulo esperado Recem-parida, recebido ${afterBirth.label}`);
  assert(!afterBirth.keys.includes("prenhe"), "parto nao pode manter prenhez como estado atual");
  assert(animal.categoria === "vaca" && animal.lote_id === "lote-1", "calculo de status nao pode alterar categoria ou lote");
});

test("ActionPlan clarify 777 pariu cria pendencia e pergunta sexo", async () => {
  const fixture = fixtureByName("create-parto-777-sem-cria");
  const validation = assertValid("clarify parto sem cria", fixture.plan);
  assert(validation.value.action === "clarify", "parto sem sexo deveria manter action clarify");
  assert(validation.value.domain === "reproducao", "domain reproducao ausente");
  assert(validation.value.operation === "parto", "operation parto ausente");
  assert(validation.value.data.mae_ref === "777", "mae_ref 777 ausente");
  assert(validation.value.missingFields.includes("cria_sexo"), "missingFields deveria incluir cria_sexo");

  const result = await executeActionPlan({
    plan: clone(fixture.plan),
    text: fixture.input,
    owner: ADMIN_OWNER,
    currentDate: "2026-06-20"
  });
  assert(result.ok, `parto sem cria deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "PARTO", `intent esperado PARTO, recebido ${result.parsed.tipo}`);
  assert(result.parsed.dados?.animal_codigo === "777", "mae 777 ausente");
  assert(result.parsed.dados?.parto_cria_cadastro === true, "fluxo de cadastro da cria deveria estar ativo");
  assert(result.parsed.perguntas_faltantes[0]?.includes("Qual foi o sexo da cria"), "pergunta direta de sexo ausente");

  const withSex = mergeRanchoMessageData(result.parsed, "femea");
  assert(withSex.dados?.cria_sexo === "femea", "resposta femea nao foi acumulada");
  assert(withSex.perguntas_faltantes.some((question) => /c[oó]digo/i.test(question)), "deveria perguntar o codigo depois do sexo");

  const withoutCode = mergeRanchoMessageData(withSex, "sem codigo");
  assert(withoutCode.dados?.gerar_cria_codigo_temporario === true, "sem codigo deveria ativar codigo temporario suportado");
  assert(withoutCode.perguntas_faltantes.length === 0, "fluxo completo deveria seguir para confirmacao");
});

test("ActionPlan create parto com sexo pede codigo e com codigo fica pronto para confirmar", async () => {
  const female = fixtureByName("create-parto-777-femea");
  const femaleResult = await executeActionPlan({
    plan: clone(female.plan),
    text: female.input,
    owner: ADMIN_OWNER,
    currentDate: "2026-06-20"
  });
  assert(femaleResult.ok, `parto com femea deveria executar: ${femaleResult.reason}`);
  assert(femaleResult.parsed.dados?.cria_sexo === "femea", "sexo da cria incorreto");
  assert(femaleResult.parsed.perguntas_faltantes.some((question) => /codigo|código/i.test(question)), "deveria pedir codigo da cria");

  const male = fixtureByName("create-parto-777-macho-codigo");
  const maleResult = await executeActionPlan({
    plan: clone(male.plan),
    text: male.input,
    owner: ADMIN_OWNER,
    currentDate: "2026-06-20"
  });
  assert(maleResult.ok, `parto com codigo deveria executar: ${maleResult.reason}`);
  assert(maleResult.parsed.dados?.cria_sexo === "macho", "sexo macho nao normalizado");
  assert(maleResult.parsed.dados?.cria_codigo === "B-555", "codigo da cria ausente");
  assert(maleResult.parsed.perguntas_faltantes.length === 0, "parto completo deveria ficar pronto para confirmacao");
});

test("ActionPlan import_table reproducao normaliza eventos datas e avisa parto sem cria", async () => {
  const fixture = fixtureByName("import-table-reproducao");
  const result = await executeImportTableActionPlan({
    plan: clone(fixture.plan),
    text: fixture.input
  });
  assert(result.ok, `tabela de reproducao deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "IMPORTACAO_EVENTOS_TABELA", `intent incorreto: ${result.parsed.tipo}`);
  assert(result.rows.length === 3, `esperadas 3 linhas, recebidas ${result.rows.length}`);
  assert(result.rows[0].evento_tipo === "parto" && result.rows[0].data_referencia === "2026-06-20", "parto/data nao normalizados");
  assert(result.rows[0].evento_normalizado === "PARTO", "evento normalizado PARTO ausente");
  assert(result.rows[1].evento_tipo === "inseminacao" && result.rows[1].data_referencia === "2026-06-19", "inseminacao/data nao normalizadas");
  assert(result.rows[1].evento_normalizado === "INSEMINACAO", "evento normalizado INSEMINACAO ausente");
  assert(result.rows[2].evento_tipo === "prenhez" && result.rows[2].data_referencia === "2026-06-18", "prenhez/data nao normalizadas");
  assert(result.rows[2].evento_normalizado === "PRENHEZ", "evento normalizado PRENHEZ ausente");
  assert(result.rows[0].avisos.includes("dados_da_cria_ausentes"), "aviso de cria ausente nao registrado");
  assert(result.rows.every((row) => row.status_linha === "pronto"), "parto sem cria nao deve invalidar a tabela");
  assert(result.parsed.dados?.total_linhas_needs_review === 1, "linha de parto deveria ficar separada para revisao");
  assert(result.preview.includes("3 registro"), "preview sem total de registros");
});

test("runtime mock adapta tabela de reproducao com colunas embaralhadas", async () => {
  const text = "Data;Observações;Animal;Evento\n2026-06-20;;777;Pariu\n2026-06-19;;204;Inseminação\n2026-06-18;Reteste;143;Prenha";
  const fixture = findGeminiMockFixture({ text });
  const mapping = fixture?.response?.table?.columnMapping || {};
  assert(fixture?.id === "import-table-reproducao", `fixture de reproducao nao encontrada: ${fixture?.id || "nenhuma"}`);
  assert(mapping.data === "Data", "mapping de data deveria seguir cabecalho");
  assert(mapping.observacoes === "Observações", "mapping de observacoes deveria seguir cabecalho");
  assert(mapping.animal_ref === "Animal", "mapping de animal deveria seguir cabecalho");
  assert(mapping.evento === "Evento", "mapping de evento deveria seguir cabecalho");

  const result = await executeImportTableActionPlan({ plan: clone(fixture.response), text });
  assert(result.ok, `tabela embaralhada deveria executar: ${result.reason}`);
  assert(result.rows.length === 3, "tabela embaralhada perdeu linhas");
  assert(result.rows[0].animal_codigo === "777" && result.rows[0].evento_tipo === "parto", "linha 777 mapeada por posicao");
  assert(result.rows[2].animal_codigo === "143" && result.rows[2].evento_tipo === "prenhez", "linha 143 mapeada incorretamente");
});

test("BOT_INTERPRETER=gemini usa ActionPlan mesmo com flags antigas false", async () => {
  const fixture = fixtureByName("query-financeiro-ultimos-6-meses");
  const before = actionStatsSnapshot();
  await withActionPlanFlags(false, false, async () => {
    await withGeminiMock(() => legacyMilkWithActionPlan(clone(fixture.plan)), async () => {
      const text = "vaca 1 deu 15 litros";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      const parsed = finalParsed(result);
      assert(parsed, "resultado sem parsed");
      assert(parsed.tipo === "CONSULTA_FINANCEIRO", `modo Gemini deveria usar ActionPlan, recebido ${parsed.tipo}`);
      assert(parsed.dados?.action_plan_used === true, "modo Gemini deveria marcar ActionPlan");
    });
  });
  const after = actionStatsSnapshot();
  assert(after.legacyFallback === before.legacyFallback, "modo Gemini nao deveria contabilizar fallback legado");
  assert(after.actionPlanUsed === before.actionPlanUsed + 1, "ActionPlan deveria ser contabilizado");
});

test("parse flags true usa ActionPlan query com Supabase mockado", async () => {
  const fixture = fixtureByName("query-financeiro-racao-90-dias");
  const before = actionStatsSnapshot();
  await withActionPlanFlags(true, true, async () => {
    await withGeminiMock(() => clone(fixture.plan), async () => {
      const result = await parseWithConfiguredInterpreter({
        text: fixture.input,
        localParsed: parseRanchoMessage(fixture.input),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({
          [TABLES.transacoesFinanceiras]: [
            { id: "racao-1", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 1200, descricao: "compra de racao", categoria: "racao", data_transacao: "2026-05-10" }
          ]
        })
      });
      const parsed = finalParsed(result);
      assert(parsed?.dados?.action_plan_used === true, "ActionPlan query deveria ser usado");
      assert(parsed.dados.action_plan_response.includes("Resumo financeiro"), "resposta financeira ausente");
      assertCleanVisibleText(parsed.dados.action_plan_response, "action_plan_response");
    });
  });
  const after = actionStatsSnapshot();
  assert(after.actionPlanUsed === before.actionPlanUsed + 1, "action_plan_used deveria ser contabilizado");
});

test("parse flags true usa ActionPlan import_table", async () => {
  const fixture = fixtureByName("import-table-producao");
  const before = actionStatsSnapshot();
  await withActionPlanFlags(true, true, async () => {
    await withGeminiMock(() => clone(fixture.plan), async () => {
      const result = await parseWithConfiguredInterpreter({
        text: fixture.input,
        localParsed: parseRanchoMessage(fixture.input),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      const parsed = finalParsed(result);
      assert(parsed?.tipo === "LOTE_REGISTROS", `import ActionPlan deveria gerar LOTE_REGISTROS, recebido ${parsed?.tipo}`);
      assert(parsed.dados?.table_action_plan_used === true, "table_action_plan_used ausente");
      assertCleanVisibleText(parsed.dados?.action_plan_preview, "action_plan_preview");
    });
  });
  const after = actionStatsSnapshot();
  assert(after.tableActionPlanUsed === before.tableActionPlanUsed + 1, "table_action_plan_used deveria ser contabilizado");
});

test("fluxo Gemini-first usa ActionPlan na tabela de estoque com saida acentuada", async () => {
  const fixture = fixtureByName("import-table-estoque-movimentos-embaralhados");
  const result = await parseWithConfiguredInterpreter({
    text: fixture.input,
    localParsed: parseRanchoMessage(fixture.input),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(parsed?.tipo === "IMPORTACAO_ESTOQUE_TABELA", `intent incorreto: ${parsed?.tipo}`);
  assert(parsed.dados?.table_action_plan_used === true, "estoque deveria usar ActionPlan");
  assert(parsed.dados?.action_plan?.domain === "estoque", "domain estoque ausente no plano");
  assert(parsed.dados?.linhas?.[1]?.tipo_movimento === "saida", "saida acentuada nao chegou normalizada ao preview");
});

test("fluxo Gemini-first usa ActionPlan na tabela de lotes", async () => {
  const fixture = fixtureByName("import-table-lotes-capacidade-ativo");
  const result = await parseWithConfiguredInterpreter({
    text: fixture.input,
    localParsed: parseRanchoMessage(fixture.input),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(parsed?.tipo === "IMPORTACAO_TABELA_DOMINIO", `intent incorreto: ${parsed?.tipo}`);
  assert(parsed.dados?.dominio_tabela === "LOTES", "dominio LOTES ausente");
  assert(parsed.dados?.table_action_plan_used === true, "lotes deveria usar ActionPlan");
  assert(parsed.dados?.action_plan?.domain === "lotes", "domain lotes ausente no plano");
  assert(parsed.dados?.linhas?.[0]?.parsedValues?.ativo === true, "ativo nao chegou normalizado ao preview");
});

test("parse flags true usa ActionPlan para 777 pariu sem mensagem de revisao", async () => {
  const text = "777 pariu";
  const fixture = findGeminiMockFixture({ text });
  assert(fixture?.id === "create-parto-777-sem-cria", `fixture de parto incorreta: ${fixture?.id || "nenhuma"}`);

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(result.kind === "parsed", `parto deveria retornar parsed, recebido ${result.kind}`);
  assert(parsed?.tipo === "PARTO", `intent esperado PARTO, recebido ${parsed?.tipo}`);
  assert(parsed.dados?.animal_codigo === "777", "animal 777 ausente");
  assert(parsed.dados?.action_plan_used === true, "ActionPlan deveria ser marcado internamente");
  assert(parsed.dados?.action_plan?.action === "clarify", "ActionPlan original deveria permanecer clarify");
  assert(parsed.perguntas_faltantes[0]?.includes("Qual foi o sexo da cria"), "pergunta direta de sexo ausente");
});

test("ActionPlan invalido com flags true nao faz fallback legado", async () => {
  const invalidPlan = {
    action: "query",
    domain: "financeiro",
    confidence: 0.9,
    filters: [{ field: "campo_fake", op: "eq", value: "x" }],
    requiresConfirmation: false
  };
  const before = actionStatsSnapshot();
  await withActionPlanFlags(true, true, async () => {
    await withGeminiMock(() => clone(invalidPlan), async () => {
      const text = "vaca 1 deu 15 litros";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `ActionPlan invalido deveria pedir revisao, recebido ${result.kind}`);
    });
  });
  const after = actionStatsSnapshot();
  assert(after.invalid === before.invalid + 1, "action_plan_invalid deveria ser contabilizado");
  assert(after.legacyFallback === before.legacyFallback, "ActionPlan invalido nao deveria fazer fallback legado");
});

test("ActionPlan block fica bloqueado e sem confirmacao", async () => {
  const fixture = fixtureByName("block-delete-massa");
  const before = actionStatsSnapshot();
  await withActionPlanFlags(true, true, async () => {
    await withGeminiMock(() => clone(fixture.plan), async () => {
      const text = "pedido operacional sensivel";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      const parsed = finalParsed(result);
      assert(parsed?.tipo === "ACAO_DESTRUTIVA_EM_MASSA", `block deveria gerar ACAO_DESTRUTIVA_EM_MASSA, recebido ${parsed?.tipo}`);
      assert(parsed.dados?.should_confirm === false, "block nao deve pedir confirmacao");
      assert(result.gemini?.requiresConfirmation === false, "Gemini meta nao deve pedir confirmacao em block");
    });
  });
  const after = actionStatsSnapshot();
  assert(after.blocked === before.blocked + 1, "action_plan_blocked deveria ser contabilizado");

  const direct = await executeActionPlan({
    plan: clone(fixture.plan),
    text: fixture.input,
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  assert(direct.ok && direct.parsed.tipo === "ACAO_DESTRUTIVA_EM_MASSA", "executor direto deve bloquear");
});

test("runtime encontra fixture ActionPlan financeiro por inputExamples acentuado", async () => {
  const text = "relatório financeiro dos últimos 6 meses";
  const fixture = findGeminiMockFixture({ text });
  assert(fixture?.id === "query-financeiro-ultimos-6-meses", "fixture errada: " + (fixture?.id || "nenhuma"));

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({ [TABLES.transacoesFinanceiras]: [] })
  });
  const parsed = finalParsed(result);
  assert(parsed?.dados?.action_plan_used === true, "fixture ActionPlan deveria ser usada");
  assert(parsed.dados.action_plan_domain === "financeiro", "domain financeiro ausente");
  assert(parsed.dados.action_plan?.filters?.[0]?.op === "last_months", "filtro last_months ausente");
  assert(parsed.dados.action_plan?.filters?.[0]?.value === 6, "filtro last_months deveria ser 6");
  assert(parsed.dados.periodo !== "mes", "nao deveria cair no periodo mes do legado");
});

test("runtime encontra fixture ActionPlan racao 90 dias por texto normalizado", async () => {
  const text = "quanto gastei com ração nos últimos 90 dias";
  const fixture = findGeminiMockFixture({ text });
  assert(fixture?.id === "query-financeiro-racao-90-dias", "fixture errada: " + (fixture?.id || "nenhuma"));

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({ [TABLES.transacoesFinanceiras]: [] })
  });
  const parsed = finalParsed(result);
  const filters = parsed?.dados?.action_plan?.filters || [];
  assert(parsed?.dados?.action_plan_domain === "financeiro", "domain financeiro ausente");
  assert(filters.some((filter) => filter.field === "descricao" && filter.op === "contains" && /ra[cç]ão|ra[cç]ao/i.test(filter.value)), "filtro contains racao ausente");
  assert(filters.some((filter) => filter.field === "data" && filter.op === "last_days" && filter.value === 90), "filtro last_days 90 ausente");
});

test("runtime encontra fixture ActionPlan producao Mimosa sem animal_codigo LEITE", async () => {
  const text = "produção de leite da Mimosa desde janeiro";
  const fixture = findGeminiMockFixture({ text });
  assert(fixture?.id === "query-producao-mimosa-desde-janeiro", "fixture errada: " + (fixture?.id || "nenhuma"));

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({
      [TABLES.animais]: [{ id: "animal-mimosa", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "001", nome: "Mimosa", categoria: "vaca" }],
      [TABLES.ordenhas]: []
    })
  });
  const parsed = finalParsed(result);
  const filters = parsed?.dados?.action_plan?.filters || [];
  assert(parsed?.dados?.action_plan_domain === "producao_leite", "domain producao_leite ausente");
  assert(filters.some((filter) => filter.field === "animal_ref" && filter.value === "Mimosa"), "filtro Mimosa ausente");
  assert(parsed.dados?.animal_codigo !== "LEITE", "nao deveria interpretar LEITE como animal_codigo");
});

test("runtime encontra fixture ActionPlan partos ultimos 6 meses", async () => {
  const text = "partos dos últimos 6 meses";
  const fixture = findGeminiMockFixture({ text });
  assert(fixture?.id === "query-partos-ultimos-6-meses", "fixture errada: " + (fixture?.id || "nenhuma"));

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({ [TABLES.eventosAnimal]: [] })
  });
  const parsed = finalParsed(result);
  const filters = parsed?.dados?.action_plan?.filters || [];
  assert(parsed?.dados?.action_plan_domain === "reproducao", "domain reproducao ausente");
  assert(filters.some((filter) => filter.field === "evento" && filter.value === "PARTO"), "filtro PARTO ausente");
  assert(filters.some((filter) => filter.field === "data" && filter.op === "last_months" && filter.value === 6), "filtro last_months 6 ausente");
});

test("ActionPlan ligado sem fixture retorna mock_fixture_missing sem fallback legado", async () => {
  const text = "relatorio financeiro dos ultimos 7 meses";
  const fixture = findGeminiMockFixture({ text });
  assert(!fixture, "entrada sem fixture nao deveria casar");

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  assert(result.kind === "clarify", "sem fixture deveria retornar clarify, recebido " + result.kind);
  assert(result.reason === "mock_fixture_missing", "reason esperado mock_fixture_missing, recebido " + result.reason);
  assert(result.message.includes("resposta de teste"), "mensagem deveria orientar ambiente de teste");
  assertCleanVisibleText(result.message, "mensagem sem fixture");
});

test("runtime encontra fixture ActionPlan para tabela de producao com turno e observacoes", async () => {
  const text = "animal;litros;data;turno;observações\nMimosa;18;2026-04-10;manhã;\nMimosa;20;2026-04-11;manhã;";
  const fixture = findGeminiMockFixture({ text });
  const mapping = fixture?.response?.table?.columnMapping || {};
  assert(fixture?.id === "import-table-producao-leite-turno-observacoes", "fixture de producao com turno nao encontrada");
  assert(fixture.response.action === "import_table", "action deveria ser import_table");
  assert(fixture.response.domain === "producao_leite", "domain deveria ser producao_leite");
  assert(mapping.animal_ref === "animal", "mapping animal_ref incorreto");
  assert(mapping.litros === "litros", "mapping litros incorreto");
  assert(mapping.data === "data", "mapping data incorreto");
  assert(mapping.turno === "turno", "mapping turno incorreto");
  assert(mapping.observacoes === "observações", "mapping observacoes incorreto");

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(parsed?.dados?.table_action_plan_used === true, "ActionPlan import_table deveria ser usado");
  assert(parsed.dados?.action_plan?.domain === "producao_leite", "parsed deveria manter domain producao_leite");
});

test("runtime reconhece tabela producao com colunas embaralhadas por cabecalho", async () => {
  const text = "Data;Animal;Litros\n2026-06-01;001;15\n2026-06-01;002;20";
  const fixture = findGeminiMockFixture({ text });
  const mapping = fixture?.response?.table?.columnMapping || {};
  assert(fixture?.response?.domain === "producao_leite", "domain deveria ser producao_leite");
  assert(mapping.data === "Data", "mapping data deveria usar cabecalho Data");
  assert(mapping.animal_ref === "Animal", "mapping animal_ref deveria usar cabecalho Animal");
  assert(mapping.litros === "Litros", "mapping litros deveria usar cabecalho Litros");

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(parsed?.dados?.table_action_plan_used === true, "tabela embaralhada deveria usar ActionPlan");
});

test("runtime reconhece tabela producao com separador pipe", async () => {
  const text = "animal|litros|data\n001|15|01/06/2026\n002|20|01/06/2026";
  const fixture = findGeminiMockFixture({ text });
  assert(fixture?.response?.domain === "producao_leite", "domain deveria ser producao_leite");
  assert(fixture.response.table?.separator === "|", "separator deveria ser pipe");
  assert(fixture.response.table?.columnMapping?.animal_ref === "animal", "mapping animal pipe incorreto");

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage(text),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(parsed?.dados?.table_action_plan_used === true, "tabela pipe deveria usar ActionPlan");
});

test("Gemini live calls permanecem zeradas", () => {
  const stats = geminiRuntimeStats();
  assert(stats.liveCalls === 0, `Gemini live calls esperado 0, recebido ${stats.liveCalls}`);
});

(async () => {
  const results = [];
  for (const item of tests) {
    try {
      await item.fn();
      results.push({ ok: true, name: item.name });
    } catch (error) {
      results.push({ ok: false, name: item.name, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const failed = results.filter((item) => !item.ok);
  console.log("ActionPlan test offline Rancho");
  console.log(`Total: ${results.length}`);
  console.log(`Aprovados: ${results.length - failed.length}`);
  console.log(`Falhos: ${failed.length}`);
  console.log("Gemini: mock; API real: nao chamada");
  console.log(`Gemini live calls: ${geminiRuntimeStats().liveCalls}`);
  for (const line of actionPlanRuntimeReportLines()) console.log(line);

  if (failed.length) {
    for (const failure of failed) {
      console.log(`\n--- Falha: ${failure.name} ---`);
      console.log(failure.error);
    }
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error("Falha ao rodar test-action-plan", error);
  process.exitCode = 1;
});
