const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

process.env.RANCHO_BOT_TEST = "1";
process.env.GEMINI_MODE = "mock";
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
  geminiRuntimeStats,
  resetGeminiRuntimeStats
} = require("../src/lib/whatsapp/gemini/runtime.ts");

resetGeminiRuntimeStats();
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
    .map((file) => ({
      name: file.replace(/\.json$/, ""),
      ...JSON.parse(fs.readFileSync(path.join(fixtureDir, file), "utf8"))
    }));
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
