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
const { executeImportTableActionPlan } = require("../src/lib/whatsapp/action-plan/execute-import-table-action-plan.ts");
const { parseRanchoMessage } = require("../src/lib/whatsapp/nlp.ts");
const { parseWithConfiguredInterpreter } = require("../src/services/whatsapp/interpreter/gemini-primary.ts");
const { TABLES } = require("../src/lib/tables.ts");

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

test("prompt fragment fica disponivel sem substituir prompt principal", () => {
  const prompt = buildActionPlanPromptFragment({ currentDate: "2026-06-18" });
  assert(prompt.includes("ActionPlan prompt version"), "prompt sem versao");
  assert(prompt.includes("Domain manifest resumido"), "prompt sem manifest");
  assert(prompt.includes("Nunca proponha delete"), "prompt sem regra de delete");
  assert(prompt.includes("columnMapping"), "prompt sem regra de tabela");
});

test("fixtures ActionPlan obrigatorias validam ou bloqueiam corretamente", () => {
  const fixtures = loadFixtures();
  assert(fixtures.length >= 11, `fixtures insuficientes: ${fixtures.length}`);
  for (const fixture of fixtures) {
    const result = assertValid(fixture.name, fixture.plan, fixture.parsedTable);
    if (fixture.plan.action === "clarify" || fixture.plan.action === "block") {
      assert(result.executable === false, `${fixture.name}: clarify/block nao deve ser executavel`);
    }
    if (fixture.plan.action === "import_table") {
      const importResult = validateImportTableActionPlan(clone(fixture.plan), fixture.parsedTable);
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
  assert(result.response.includes("ActionPlan"), "resposta sem marcador ActionPlan");
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
  assert(result.preview.includes("ActionPlan"), "preview deveria indicar ActionPlan");
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
  assert(result.parsed.tipo === "IMPORTACAO_TABELA_DOMINIO", `intent esperado IMPORTACAO_TABELA_DOMINIO, recebido ${result.parsed.tipo}`);
  assert(result.parsed.dados?.resumo_validacao?.metricas?.entradas === 1, "defaultFields deveria marcar entrada");
  assert(result.parsed.dados?.preview_only === true, "import ActionPlan deve ficar em preview");
});

test("parse flags false ignora ActionPlan e usa legado", async () => {
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
      assert(parsed.tipo === "PRODUCAO_LEITE", `flags false deveria manter legado, recebido ${parsed.tipo}`);
      assert(!parsed.dados?.action_plan_used, "flags false nao deveria usar ActionPlan");
    });
  });
  const after = actionStatsSnapshot();
  assert(after.legacyFallback === before.legacyFallback + 1, "fallback legado deveria ser contabilizado");
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
      assert(parsed.dados.action_plan_response.includes("ActionPlan"), "resposta ActionPlan ausente");
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
    });
  });
  const after = actionStatsSnapshot();
  assert(after.tableActionPlanUsed === before.tableActionPlanUsed + 1, "table_action_plan_used deveria ser contabilizado");
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
  assert(result.message.includes("mock_fixture_missing"), "mensagem deveria explicar mock_fixture_missing");
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
