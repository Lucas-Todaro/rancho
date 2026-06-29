const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
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
delete process.env.BOT_AI_PROVIDER;
delete process.env.BOT_AI_MODEL;
delete process.env.OPENROUTER_API_KEY;

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
const { buildGeminiSystemPrompt } = require("../src/lib/whatsapp/gemini/system-prompt.ts");
const { validateInterpretedAction } = require("../src/lib/whatsapp/gemini/validator.ts");
const {
  configuredAIModel,
  configuredAIProviderName,
  generateStructuredAI,
  parseJsonObjectText
} = require("../src/lib/whatsapp/ai-provider.ts");
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
  applyReproductionImportChildComplement
} = require("../src/lib/whatsapp/action-plan/reproduction-import-child.ts");
const {
  applyPendingActionSemanticPlan,
  interpretPendingActionMessage,
  interpretPendingActionMessageSmart
} = require("../src/services/whatsapp/pending-action-interpreter.ts");
const { confirmationText } = require("../src/services/whatsapp/confirmation-message.ts");
const {
  normalizeDate,
  normalizeReproductionEvent,
  normalizeSex
} = require("../src/lib/whatsapp/nlp-core/reproduction-normalizers.ts");
const {
  applyPendingPatchToSession,
  interpretPendingPatchWithGemini,
  shouldUsePendingPatchForText,
  validatePendingPatch
} = require("../src/lib/whatsapp/gemini/pending-patch.ts");
const { mergeRanchoMessageData, parseRanchoMessage } = require("../src/lib/whatsapp/nlp.ts");
const { parseWithConfiguredInterpreter } = require("../src/services/whatsapp/interpreter/gemini-primary.ts");
const { TABLES } = require("../src/lib/tables.ts");
const { animalReproductionStatus } = require("../src/components/modules/ReproductionScreen.tsx");
const { realSex } = require("../src/components/modules/GenealogyScreen.tsx");
const {
  getRanchDayRange,
  getRanchTodayISO
} = require("../src/lib/dates/ranch-time.ts");
const {
  polishBotResponse,
  userFacingCodeLabel
} = require("../src/lib/whatsapp/user-facing-text.ts");
const {
  validateComposedBotResponse
} = require("../src/services/whatsapp/ai-response-composer.ts");

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

async function withInterpreterEnv(env, fn) {
  const previous = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
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

async function withFetchMock(fetchMock, fn) {
  const previousFetch = global.fetch;
  global.fetch = fetchMock;
  try {
    return await fn();
  } finally {
    global.fetch = previousFetch;
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

test("AI provider usa Gemini como padrao e respeita env explicito", async () => {
  await withInterpreterEnv({ BOT_AI_PROVIDER: undefined, BOT_AI_MODEL: undefined, OPENROUTER_API_KEY: undefined, OPENROUTER_MODEL: undefined, GEMINI_MODEL: undefined }, async () => {
    assert(configuredAIProviderName() === "gemini", "provider padrao deveria ser Gemini");
    assert(configuredAIModel() === "gemini-2.5-flash", "modelo Gemini padrao incorreto");
  });

  await withInterpreterEnv({ BOT_AI_PROVIDER: "gemini", GEMINI_MODEL: "gemini-test-model" }, async () => {
    assert(configuredAIProviderName() === "gemini", "BOT_AI_PROVIDER=gemini deveria selecionar Gemini");
    assert(configuredAIModel() === "gemini-test-model", "Gemini deveria continuar usando GEMINI_MODEL");
  });

  await withInterpreterEnv({ BOT_AI_PROVIDER: "openrouter", BOT_AI_MODEL: "qwen/test-model" }, async () => {
    assert(configuredAIProviderName() === "openrouter", "BOT_AI_PROVIDER=openrouter deveria selecionar OpenRouter");
    assert(configuredAIModel() === "qwen/test-model", "OpenRouter deveria usar BOT_AI_MODEL");
  });

  await withInterpreterEnv({ BOT_AI_PROVIDER: undefined, BOT_AI_MODEL: undefined, OPENROUTER_API_KEY: "or-test-key", OPENROUTER_MODEL: "qwen/alias-model" }, async () => {
    assert(configuredAIProviderName() === "openrouter", "OPENROUTER_API_KEY deveria selecionar OpenRouter quando BOT_AI_PROVIDER nao vier");
    assert(configuredAIModel() === "qwen/alias-model", "OpenRouter deveria aceitar OPENROUTER_MODEL como alias");
  });
});

test("OpenRouter extrai choices message content e remove cercas markdown", async () => {
  let seenUrl = "";
  let seenInit = null;
  await withInterpreterEnv({
    BOT_AI_PROVIDER: "openrouter",
    BOT_AI_MODEL: "qwen/test-model",
    OPENROUTER_API_KEY: "or-test-key",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_SITE_URL: "https://rancho.test",
    OPENROUTER_APP_NAME: "Rancho Test",
    ALLOW_LIVE_AI_TESTS: "true"
  }, async () => {
    await withFetchMock(async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(JSON.stringify({
        choices: [{ message: { content: "```json\n{\"ok\":true,\"value\":7}\n```" } }],
        usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 }
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const result = await generateStructuredAI({
        purpose: "action_plan",
        userPrompt: "retorne json",
        temperature: 0
      });
      assert(result.ok, `OpenRouter deveria retornar sucesso: ${result.ok ? "" : result.reason}`);
      assert(result.provider === "openrouter", "provider retornado deveria ser OpenRouter");
      assert(result.model === "qwen/test-model", "modelo OpenRouter incorreto");
      assert(result.usage?.totalTokens === 16, "usage OpenRouter nao foi mapeado");
      const parsed = parseJsonObjectText(result.rawText);
      assert(parsed.ok === true && parsed.value === 7, "JSON cercado nao foi parseado corretamente");
    });
  });

  assert(seenUrl === "https://openrouter.ai/api/v1/chat/completions", "endpoint OpenRouter incorreto");
  assert(seenInit?.headers?.Authorization === "Bearer or-test-key", "Authorization Bearer nao foi enviado ao OpenRouter");
  assert(seenInit?.headers?.["HTTP-Referer"] === "https://rancho.test", "HTTP-Referer nao foi enviado");
  assert(seenInit?.headers?.["X-Title"] === "Rancho Test", "X-Title nao foi enviado");
  const body = JSON.parse(String(seenInit?.body || "{}"));
  assert(body.model === "qwen/test-model", "modelo nao foi enviado no payload OpenRouter");
  assert(body.response_format?.type === "json_object", "response_format json_object deveria ser enviado");
});

test("OpenRouter classifica 401 503 timeout e JSON invalido", async () => {
  await withInterpreterEnv({
    BOT_AI_PROVIDER: "openrouter",
    BOT_AI_MODEL: "qwen/test-model",
    OPENROUTER_API_KEY: "or-test-key",
    ALLOW_LIVE_AI_TESTS: "true"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      error: { message: "invalid key" }
    }), { status: 401, headers: { "Content-Type": "application/json" } }), async () => {
      const result = await generateStructuredAI({ purpose: "action_plan", userPrompt: "json" });
      assert(!result.ok && result.reason === "configuration_error", `401 deveria ser configuracao, recebido ${result.ok ? "ok" : result.reason}`);
    });

    await withFetchMock(async () => new Response(JSON.stringify({
      error: { message: "unavailable" }
    }), { status: 503, headers: { "Content-Type": "application/json" } }), async () => {
      const result = await generateStructuredAI({ purpose: "action_plan", userPrompt: "json" });
      assert(!result.ok && result.status === 503, "503 deveria preservar status");
    });

    await withFetchMock(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "texto livre" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }), async () => {
      const result = await generateStructuredAI({ purpose: "action_plan", userPrompt: "json" });
      assert(!result.ok && result.reason === "invalid_json", `JSON invalido deveria ser contrato, recebido ${result.ok ? "ok" : result.reason}`);
    });

    await withFetchMock(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }, async () => {
      const result = await generateStructuredAI({ purpose: "action_plan", userPrompt: "json" });
      assert(!result.ok && result.reason === "timeout", `timeout deveria ser classificado, recebido ${result.ok ? "ok" : result.reason}`);
    });
  });
});

test("OpenRouter tenta novamente sem response_format quando conteudo vem vazio", async () => {
  const bodies = [];
  await withInterpreterEnv({
    BOT_AI_PROVIDER: "openrouter",
    BOT_AI_MODEL: "qwen/test-model",
    OPENROUTER_API_KEY: "or-test-key",
    ALLOW_LIVE_AI_TESTS: "true"
  }, async () => {
    await withFetchMock(async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body || "{}")));
      if (bodies.length === 1) {
        return new Response(JSON.stringify({
          choices: [{ finish_reason: "stop", message: { content: "" } }]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "{\"ok\":true}" } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const result = await generateStructuredAI({ purpose: "action_plan", userPrompt: "json" });
      assert(result.ok, `OpenRouter deveria recuperar resposta vazia: ${result.ok ? "" : result.reason}`);
      assert(result.rawText === "{\"ok\":true}", "retry sem response_format nao retornou o JSON esperado");
    });
  });

  assert(bodies.length === 2, `esperava duas chamadas OpenRouter, recebeu ${bodies.length}`);
  assert(bodies[0].response_format?.type === "json_object", "primeira chamada deveria usar response_format");
  assert(!Object.prototype.hasOwnProperty.call(bodies[1], "response_format"), "retry nao deveria enviar response_format");
});

test("OpenRouter ActionPlan usa validator e executor atuais", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    BOT_AI_PROVIDER: "openrouter",
    BOT_AI_MODEL: "qwen/test-model",
    GEMINI_MODE: "live",
    OPENROUTER_API_KEY: "or-test-key",
    ALLOW_LIVE_AI_TESTS: "true"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(legacyMilkWithActionPlan({
        action: "create",
        domain: "reproducao",
        operation: "parto",
        confidence: 0.93,
        requiresConfirmation: true,
        data: { animal_ref: "090", evento: "parto" }
      })) } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      const parsed = finalParsed(result);
      assert(parsed?.tipo === "PARTO", `ActionPlan OpenRouter deveria virar PARTO, recebido ${parsed?.tipo}`);
      assert(parsed.dados?.action_plan_used === true, "OpenRouter deveria passar pelo ActionPlan atual");
      assert(parsed.dados?.origem_parser === "gemini_action_plan", "origem compatível do ActionPlan deveria ser preservada");
    });
  });
});

test("OpenRouter PendingPatch usa validator atual", async () => {
  const pending = parseRanchoMessage("090 pariu");
  await withInterpreterEnv({
    BOT_AI_PROVIDER: "openrouter",
    BOT_AI_MODEL: "qwen/test-model",
    GEMINI_MODE: "live",
    OPENROUTER_API_KEY: "or-test-key",
    ALLOW_LIVE_AI_TESTS: "true"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "```json\n" + JSON.stringify({
        type: "pending_patch",
        targetIntent: "PARTO",
        confidence: 0.94,
        data: { confirm_child: true, child_sex: "femea", child_code: "C-OPEN" },
        requiresConfirmation: true
      }) + "\n```" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }), async () => {
      const result = await interpretPendingPatchWithGemini({
        text: "femea codigo C-OPEN",
        pending,
        status: "aguardando_dado",
        currentDate: "2026-06-24"
      });
      assert(result.ok, `PendingPatch OpenRouter deveria validar: ${result.ok ? "" : result.reason}`);
      const patched = applyPendingPatchToSession(pending, result.patch);
      assert(patched.dados?.cria_sexo === "femea", "PendingPatch OpenRouter nao preservou sexo");
      assert(patched.dados?.cria_codigo === "C-OPEN", "PendingPatch OpenRouter nao preservou codigo");
    });
  });
});

test("prompt Gemini-first inclui contrato, manifest e seguranca", () => {
  const prompt = buildActionPlanPromptFragment({ currentDate: "2026-06-18" });
  assert(prompt.includes("ActionPlan prompt version"), "prompt sem versao");
  assert(prompt.includes("Data atual do rancho: 2026-06-18"), "prompt sem data local do rancho");
  assert(prompt.includes("Timezone: America/Sao_Paulo"), "prompt sem timezone oficial");
  assert(prompt.includes("Domain manifest"), "prompt sem manifest");
  assert(prompt.includes("delete ou update em massa"), "prompt sem regra de delete");
  assert(prompt.includes("columnMapping"), "prompt sem regra de tabela");
  assert(prompt.includes("semantic") && prompt.includes("Memoria de melhoria continua"), "prompt sem bloco semantico ou memoria");
  assert(prompt.includes("melhorar o contrato semantico geral antes de criar regra pontual"), "prompt sem memoria anti-regra-pontual");
  assert(prompt.includes("Nao retorne markdown") && prompt.includes("intent legado") && prompt.includes("SQL"), "prompt ainda permite formato legado");

  const systemPrompt = buildGeminiSystemPrompt({
    text: "relatorio financeiro dos ultimos 6 meses",
    currentDate: "2026-06-18",
    timezone: "America/Fortaleza"
  });
  assert(systemPrompt.includes("Retorne somente um objeto JSON ActionPlan"), "prompt principal nao exige ActionPlan");
  assert(!systemPrompt.includes("ACTION_DESCRIPTIONS"), "prompt principal vazou ACTION_DESCRIPTIONS");
  assert(!systemPrompt.includes("LEGACY_ACTION_DESCRIPTIONS"), "prompt principal vazou LEGACY_ACTION_DESCRIPTIONS");
  assert(!systemPrompt.includes("Acoes suportadas:"), "prompt principal parece usar contrato legado");
});

test("artefatos gerados de bot ficam ignorados e fora do indice", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  for (const pattern of [
    "bot-test-report.json",
    "bot-test-report.md",
    "bot-final-report.md",
    "bot-evaluation-report.json",
    "reports/",
    "*.log",
    ".codex-test-bot.log",
    "testbot-*.log"
  ]) {
    assert(gitignore.includes(pattern), `.gitignore sem ${pattern}`);
  }

  const tracked = childProcess.execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
  const forbidden = tracked.filter((file) => (
    file === "bot-test-report.json"
    || file === "bot-test-report.md"
    || file === "bot-final-report.md"
    || file === "bot-evaluation-report.json"
    || file.startsWith("reports/")
    || file === ".codex-test-bot.log"
    || /^testbot-.*\.log$/.test(file)
  ));
  assert(!forbidden.length, `artefatos gerados ainda versionados: ${forbidden.join(", ")}`);
});

test("data operacional do Rancho usa America/Sao_Paulo em vez de UTC puro", async () => {
  const utcLateNight = new Date("2026-06-25T01:30:00.000Z");
  const ranchToday = getRanchTodayISO(utcLateNight);
  assert(ranchToday === "2026-06-24", `hoje do rancho esperado 2026-06-24, recebido ${ranchToday}`);

  const range = getRanchDayRange("2026-06-24");
  assert(range.start.toISOString() === "2026-06-24T03:00:00.000Z", `inicio GMT-3 incorreto: ${range.start.toISOString()}`);
  assert(range.end.toISOString() === "2026-06-25T03:00:00.000Z", `fim GMT-3 incorreto: ${range.end.toISOString()}`);

  const milk = await executeActionPlan({
    plan: {
      action: "create",
      domain: "producao_leite",
      confidence: 0.9,
      data: { animal_ref: "Mimosa", litros: 12 },
      requiresConfirmation: true
    },
    text: "Mimosa deu 12 litros",
    owner: ADMIN_OWNER,
    currentDate: ranchToday
  });
  assert(milk.ok, `producao sem data deveria executar: ${milk.reason}`);
  assert(milk.parsed.dados?.data_referencia === "2026-06-24", `producao sem data deveria usar hoje local, recebeu ${milk.parsed.dados?.data_referencia}`);

  const finance = await executeActionPlan({
    plan: {
      action: "create",
      domain: "financeiro",
      confidence: 0.9,
      data: { tipo: "despesa", categoria: "racao", valor: 500 },
      requiresConfirmation: true
    },
    text: "comprei racao por 500 reais",
    owner: ADMIN_OWNER,
    currentDate: ranchToday
  });
  assert(finance.ok, `financeiro sem data deveria executar: ${finance.reason}`);
  assert(finance.parsed.dados?.data_referencia === "2026-06-24", `financeiro sem data deveria usar hoje local, recebeu ${finance.parsed.dados?.data_referencia}`);
});

test("ActionPlan compra e venda fisica geram estoque com reflexo financeiro", async () => {
  const sale = await executeActionPlan({
    plan: {
      action: "create",
      domain: "financeiro",
      confidence: 0.9,
      data: { tipo: "receita", categoria: "milho", descricao: "venda de milho", valor: 320 },
      requiresConfirmation: true
    },
    text: "vendi 4 sacos de milho por 320 reais",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(sale.ok, `venda fisica deveria executar: ${sale.reason}`);
  assert(sale.parsed.tipo === "ESTOQUE_SAIDA", `venda fisica deveria virar ESTOQUE_SAIDA, recebeu ${sale.parsed.tipo}`);
  assert(sale.parsed.dados?.item_nome === "milho", "venda deveria preservar item do texto");
  assert(Number(sale.parsed.dados?.quantidade) === 4, "venda deveria preservar quantidade");
  assert(sale.parsed.dados?.unidade === "sacos", "venda deveria preservar unidade");
  assert(Number(sale.parsed.dados?.valor) === 320, "venda deveria preservar valor");
  assert(sale.parsed.dados?.venda === true, "venda deveria marcar reflexo financeiro");

  const purchase = await executeActionPlan({
    plan: {
      action: "create",
      domain: "estoque",
      confidence: 0.9,
      data: { tipo_movimento: "entrada", item_ref: "racao", quantidade: 12, unidade: "sacos", valor_total: 960 },
      requiresConfirmation: true
    },
    text: "comprei 12 sacos de racao por 960 reais",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(purchase.ok, `compra fisica deveria executar: ${purchase.reason}`);
  assert(purchase.parsed.tipo === "ESTOQUE_ENTRADA", `compra fisica deveria virar ESTOQUE_ENTRADA, recebeu ${purchase.parsed.tipo}`);
  assert(purchase.parsed.dados?.item_nome === "racao", "compra deveria preservar item");
  assert(Number(purchase.parsed.dados?.quantidade) === 12, "compra deveria preservar quantidade");
  assert(Number(purchase.parsed.dados?.valor) === 960, "compra deveria preservar valor");
  assert(purchase.parsed.dados?.compra === true, "compra deveria marcar reflexo financeiro");

  const use = await executeActionPlan({
    plan: {
      action: "create",
      domain: "estoque",
      confidence: 0.9,
      data: { tipo_movimento: "saida", item_ref: "sal mineral", quantidade: 20, unidade: "kg", motivo: "consumo" },
      requiresConfirmation: true
    },
    text: "dei 20 kg de sal mineral no cocho",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(use.ok, `saida comum de estoque deveria executar: ${use.reason}`);
  assert(use.parsed.tipo === "ESTOQUE_SAIDA", `saida comum deveria virar ESTOQUE_SAIDA, recebeu ${use.parsed.tipo}`);
  assert(use.parsed.dados?.venda !== true, "saida comum nao deveria marcar venda");
  assert(use.parsed.dados?.compra !== true, "saida comum nao deveria marcar compra");
});

test("ActionPlan de morte vira MORTE e nao cadastro generico", async () => {
  const healthDeath = await executeActionPlan({
    plan: {
      action: "create",
      domain: "saude_sanitario",
      operation: "registro_morte",
      confidence: 0.94,
      data: { animal_ref: "B-002", evento: "morte", data: "hoje" },
      requiresConfirmation: true
    },
    text: "a vaca B-002 morreu hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(healthDeath.ok, `morte sanitaria deveria executar: ${healthDeath.reason}`);
  assert(healthDeath.parsed.tipo === "MORTE", `morte sanitaria deveria virar MORTE, recebeu ${healthDeath.parsed.tipo}`);
  assert(healthDeath.parsed.dados?.animal_codigo === "B-002", "morte sanitaria deveria preservar animal_ref");
  assert(healthDeath.parsed.dados?.data_referencia === "2026-06-24", "morte sanitaria deveria usar data local");

  const animalDeath = await executeActionPlan({
    plan: {
      action: "update",
      domain: "animais",
      operation: "alterar_status",
      confidence: 0.92,
      data: { animal_ref: "B-003", status: "morto", data: "hoje" },
      requiresConfirmation: true
    },
    text: "B-003 morreu hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(animalDeath.ok, `status morto deveria executar: ${animalDeath.reason}`);
  assert(animalDeath.parsed.tipo === "MORTE", `status morto deveria virar MORTE, recebeu ${animalDeath.parsed.tipo}`);
  assert(animalDeath.parsed.dados?.animal_codigo === "B-003", "status morto deveria preservar animal_ref");
});

test("ActionPlan execute valida capacidades genericas com confirmacao correta", () => {
  const mutation = validateActionPlan({
    action: "execute",
    capability: "registrar_evento_animal",
    confidence: 0.9,
    data: { animal_ref: "B-002", tipo_evento: "morte" },
    requiresConfirmation: true
  });
  assert(mutation.ok, `execute mutacional deveria validar: ${mutation.reason}`);

  const query = validateActionPlan({
    action: "execute",
    capability: "consultar_dados",
    confidence: 0.9,
    data: { domain: "financeiro", periodo: "mes" },
    requiresConfirmation: false
  });
  assert(query.ok, `execute consulta deveria validar: ${query.reason}`);

  const invalid = validateActionPlan({
    action: "execute",
    capability: "registrar_financeiro",
    confidence: 0.9,
    data: { valor: 100 },
    requiresConfirmation: false
  });
  assert(!invalid.ok, "execute mutacional sem confirmacao deveria ser invalido");
  assert(invalid.reason.includes("requiresConfirmation=true"), `motivo inesperado: ${invalid.reason}`);
});

test("ActionPlan execute cobre capacidades genericas principais", async () => {
  const death = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "registrar_evento_animal",
      operation: "registro_morte",
      confidence: 0.94,
      data: { animal_ref: "B-002", tipo_evento: "morte", data: "hoje" },
      requiresConfirmation: true
    },
    text: "a vaca B-002 morreu hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(death.ok, `execute morte deveria executar: ${death.reason}`);
  assert(death.parsed.tipo === "MORTE", `execute morte deveria virar MORTE, recebeu ${death.parsed.tipo}`);
  assert(death.parsed.dados?.action_plan_capability === "registrar_evento_animal", "capability de morte ausente");

  const sale = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "registrar_movimento_estoque",
      operation: "venda_estoque",
      confidence: 0.92,
      data: { tipo_movimento: "saida", item: "milho", quantidade: 4, unidade: "sacos", valor_total: 320 },
      requiresConfirmation: true
    },
    text: "vendi 4 sacos de milho por 320 reais",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(sale.ok, `execute venda estoque deveria executar: ${sale.reason}`);
  assert(sale.parsed.tipo === "ESTOQUE_SAIDA", `execute venda deveria virar ESTOQUE_SAIDA, recebeu ${sale.parsed.tipo}`);
  assert(Number(sale.parsed.dados?.quantidade) === 4, "execute venda deveria preservar quantidade");
  assert(Number(sale.parsed.dados?.valor) === 320, "execute venda deveria preservar valor");
  assert(sale.parsed.dados?.venda === true, "execute venda deveria marcar venda");

  const animal = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "cadastrar_animal",
      confidence: 0.92,
      data: { brinco: "B-120", categoria: "vaca", nome: "Estrela" },
      requiresConfirmation: true
    },
    text: "cadastrar vaca B-120 chamada Estrela",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(animal.ok, `execute cadastro animal deveria executar: ${animal.reason}`);
  assert(animal.parsed.tipo === "CADASTRO_ANIMAL", `execute cadastro animal deveria virar CADASTRO_ANIMAL, recebeu ${animal.parsed.tipo}`);
  assert(animal.parsed.dados?.animal_codigo === "B-120", "execute cadastro animal deveria preservar brinco");
  assert(animal.parsed.perguntas_faltantes?.length > 0, "execute cadastro animal deve manter opcionais para o usuario revisar ou concluir");

  const ambiguousAnimal = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "cadastrar_animal",
      confidence: 0.92,
      data: { brinco: "felipe", codigo: "felipe", categoria: "vaca", nome: "felipe" },
      requiresConfirmation: true
    },
    text: "cria uma vaca felipe",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(ambiguousAnimal.ok, `execute cadastro animal ambiguo deveria executar: ${ambiguousAnimal.reason}`);
  assert(ambiguousAnimal.parsed.tipo === "CADASTRO_ANIMAL", `cadastro ambiguo deveria virar CADASTRO_ANIMAL, recebeu ${ambiguousAnimal.parsed.tipo}`);
  assert(!ambiguousAnimal.parsed.dados?.animal_codigo, "cadastro ambiguo nao deve usar nome como brinco/codigo");
  assert(ambiguousAnimal.parsed.dados?.nome === "felipe", "cadastro ambiguo deve preservar a palavra solta como nome");
  assert(
    ambiguousAnimal.parsed.perguntas_faltantes?.some((question) => /brinco|codigo|código/i.test(String(question))),
    "cadastro ambiguo deve pedir brinco/codigo"
  );

  const payroll = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "registrar_pagamento_funcionario",
      confidence: 0.92,
      data: { funcionario_ref: "Joao", valor: 1500, pagamento_tipo: "salario", data: "hoje" },
      requiresConfirmation: true
    },
    text: "paguei 1500 de salario para Joao",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(payroll.ok, `execute pagamento funcionario deveria executar: ${payroll.reason}`);
  assert(payroll.parsed.tipo === "PAGAMENTO_FUNCIONARIO", `execute pagamento deveria virar PAGAMENTO_FUNCIONARIO, recebeu ${payroll.parsed.tipo}`);
  assert(payroll.parsed.dados?.funcionario_nome === "Joao", "execute pagamento deveria preservar funcionario");

  const genealogy = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "atualizar_genealogia",
      confidence: 0.9,
      data: { animal_ref: "A12", mae_ref: "Estrela" },
      requiresConfirmation: true
    },
    text: "mae do animal A12 e Estrela",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });
  assert(genealogy.ok, `execute genealogia deveria executar: ${genealogy.reason}`);
  assert(genealogy.parsed.tipo === "ATUALIZACAO_GENEALOGIA", `execute genealogia deveria virar ATUALIZACAO_GENEALOGIA, recebeu ${genealogy.parsed.tipo}`);
  assert(genealogy.parsed.dados?.mae_nome === "Estrela", "execute genealogia deveria preservar mae");
});

test("ActionPlan semantic normaliza venda fisica com efeitos cruzados", async () => {
  const result = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "registrar_movimento_estoque",
      operation: "venda_estoque",
      confidence: 0.94,
      semantic: {
        intent: "venda_item_fisico",
        scope: "estoque",
        entities: { item: "milho" },
        quantity: { value: 4, unit: "sacos" },
        money: { value: 320, type: "receita", category: "milho" },
        date: "hoje",
        effects: [
          { domain: "estoque", type: "saida" },
          { domain: "financeiro", type: "receita" }
        ]
      },
      data: {},
      requiresConfirmation: true
    },
    text: "vendi 4 sacos de milho por 320 reais",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });

  assert(result.ok, `semantic venda deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "ESTOQUE_SAIDA", `semantic venda deveria virar ESTOQUE_SAIDA, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.item_nome === "milho", "semantic venda deveria preencher item");
  assert(Number(result.parsed.dados?.quantidade) === 4, "semantic venda deveria preencher quantidade");
  assert(result.parsed.dados?.unidade === "sacos", "semantic venda deveria preencher unidade");
  assert(Number(result.parsed.dados?.valor) === 320, "semantic venda deveria preencher valor");
  assert(result.parsed.dados?.venda === true, "semantic venda deveria marcar venda");
  assert(result.parsed.dados?.action_plan_semantic?.scope === "estoque", "semantic deveria ficar auditavel no parsed");
});

test("ActionPlan semantic normaliza parto com cria sem regra por frase", async () => {
  const result = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "registrar_evento_animal",
      confidence: 0.94,
      semantic: {
        intent: "registrar_parto_com_cria",
        scope: "reproducao",
        entities: { mae: "B-5", cria: { codigo: "B-941", sexo: "femea" }, pai: null },
        date: "hoje",
        effects: [
          { domain: "reproducao", type: "registrar_parto" },
          { domain: "animais", type: "cadastrar_cria" },
          { domain: "genealogia", type: "vincular_mae_cria" },
          { domain: "animais", type: "atualizar_status_mae" }
        ]
      },
      data: {},
      requiresConfirmation: true
    },
    text: "a vaca B-5 pariu uma bezerra hoje, codigo B-941",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });

  assert(result.ok, `semantic parto deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "PARTO", `semantic parto deveria virar PARTO, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.animal_codigo === "B-5", "semantic parto deveria preencher mae");
  assert(result.parsed.dados?.cria_codigo === "B-941", "semantic parto deveria preencher codigo da cria");
  assert(result.parsed.dados?.cria_sexo === "femea", "semantic parto deveria preencher sexo da cria");
  assert(result.parsed.dados?.parto_cria_cadastro === true, "semantic parto deveria ativar cadastro da cria");
});

test("ActionPlan execute consulta generica passa pelo executor de query", async () => {
  const result = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "consultar_dados",
      confidence: 0.9,
      data: { domain: "financeiro", periodo: "mes" },
      requiresConfirmation: false
    },
    text: "como foi o financeiro desse mes?",
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({ [TABLES.transacoesFinanceiras]: [] }),
    currentDate: "2026-06-24"
  });
  assert(result.ok, `execute consulta generica deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "CONSULTA_FINANCEIRO", `consulta generica deveria virar CONSULTA_FINANCEIRO, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.action_plan_capability === "consultar_dados", "capability de consulta ausente");
});

test("ActionPlan semantic mantem resumo dos eventos no escopo de eventos", async () => {
  const result = await executeQueryActionPlan({
    plan: {
      action: "query",
      domain: "observacoes",
      operation: "eventos_gerais",
      confidence: 0.95,
      semantic: {
        intent: "consultar_eventos",
        scope: "eventos",
        date: "hoje",
        report: { type: "eventos", detailLevel: "resumo", includeDomains: ["observacoes", "reproducao", "saude_sanitario"] }
      },
      filters: [],
      limit: 100,
      requiresConfirmation: false
    },
    originalText: "resumo dos eventos de hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24",
    supabase: createActionPlanSupabase({ [TABLES.eventosAnimal]: [] })
  });

  assert(result.ok, `semantic eventos deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "CONSULTA_REGISTROS_HOJE", `intent esperado CONSULTA_REGISTROS_HOJE, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.consulta_registros === "eventos", "resumo dos eventos nao deveria virar relatorio geral");
  assert(result.parsed.dados?.data_referencia === "hoje", "semantic eventos deveria preservar hoje");
  assert(!result.parsed.dados?.action_plan_response, "semantic eventos nao deve trazer resposta pre-montada estreita");
});

test("ActionPlan semantic bloqueia dominio inventado em efeitos", () => {
  const result = validateActionPlan({
    action: "execute",
    capability: "consultar_dados",
    confidence: 0.9,
    semantic: {
      intent: "consulta_insegura",
      effects: [{ domain: "sql_livre", type: "select" }]
    },
    data: {},
    requiresConfirmation: false
  });
  assert(!result.ok, "semantic com dominio inventado deveria ser invalido");
  assert(result.reason.includes("semantic.effects[0].domain"), `motivo semantic inesperado: ${result.reason}`);
});

test("ActionPlan consulta generica de eventos nao vira relatorio sanitario estreito", async () => {
  const result = await executeQueryActionPlan({
    plan: {
      action: "query",
      domain: "saude_sanitario",
      operation: "eventos_gerais",
      confidence: 0.95,
      filters: [{ field: "data", op: "last_days", value: 1 }],
      limit: 100,
      requiresConfirmation: false
    },
    originalText: "quais eventos teve hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24",
    supabase: createActionPlanSupabase({ [TABLES.eventosAnimal]: [] })
  });

  assert(result.ok, `consulta generica de eventos deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "CONSULTA_REGISTROS_HOJE", `intent esperado CONSULTA_REGISTROS_HOJE, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.consulta_registros === "eventos", "consulta generica deveria manter tipo eventos");
  assert(result.parsed.dados?.data_referencia === "hoje", "consulta generica de hoje deveria preservar periodo");
  assert(result.parsed.dados?.action_plan_domain === "eventos_gerais", "consulta generica deveria ser normalizada para eventos_gerais");
  assert(result.parsed.dados?.action_plan_original_domain === "saude_sanitario", "dominio original deveria ficar auditavel");
  assert(!result.parsed.dados?.action_plan_response, "consulta generica nao deve trazer resposta sanitaria pre-montada");
});

test("ActionPlan execute consultar_eventos usa rota geral quando texto e amplo", async () => {
  const result = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "consultar_eventos",
      operation: "eventos_gerais",
      confidence: 0.94,
      data: { periodo: "hoje" },
      requiresConfirmation: false
    },
    text: "quais eventos teve hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24",
    supabase: createActionPlanSupabase({ [TABLES.eventosAnimal]: [] })
  });

  assert(result.ok, `execute consultar_eventos deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "CONSULTA_REGISTROS_HOJE", `intent esperado CONSULTA_REGISTROS_HOJE, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.action_plan_domain === "eventos_gerais", "execute consultar_eventos deveria cair em eventos_gerais");
  assert(result.parsed.dados?.action_plan_capability === "consultar_eventos", "capability consultar_eventos deveria ser preservada");
  assert(result.parsed.dados?.action_plan_capability_query_domain === "observacoes", "capability generica deveria consultar observacoes");
  assert(!result.parsed.dados?.action_plan_response, "execute consultar_eventos generico nao deve trazer resposta fechada de um dominio especifico");
});

test("ActionPlan execute consulta respeita dominio explicito de saude", async () => {
  const result = await executeActionPlan({
    plan: {
      action: "execute",
      capability: "consultar_dados",
      confidence: 0.92,
      data: { domain: "saude_sanitario", periodo: "hoje" },
      requiresConfirmation: false
    },
    text: "quais registros de saude teve hoje",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24",
    supabase: createActionPlanSupabase({ [TABLES.eventosAnimal]: [] })
  });

  assert(result.ok, `consulta explicita de saude deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "CONSULTA_REGISTROS_HOJE", `intent esperado CONSULTA_REGISTROS_HOJE, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.action_plan_capability_query_domain === "saude_sanitario", "dominio explicito saude_sanitario deveria ser preservado");
  assert(result.parsed.dados?.action_plan_domain === "saude_sanitario", "consulta especifica de saude nao deve virar eventos_gerais");
});

test("Gemini-first usa ActionPlan de morte quando o modelo entende o evento", async () => {
  await withGeminiMock(() => ({
    action: "create",
    domain: "saude_sanitario",
    operation: "registro_morte",
    confidence: 0.94,
    data: { animal_ref: "B-002", evento: "morte", data: "hoje" },
    requiresConfirmation: true
  }), async () => {
    const text = "a vaca B-002 morreu hoje";
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({})
    });
    const parsed = finalParsed(result);
    assert(parsed?.tipo === "MORTE", `Gemini ActionPlan de morte deveria virar MORTE, recebeu ${parsed?.tipo}`);
    assert(parsed.dados?.animal_codigo === "B-002", "ActionPlan deveria preservar animal_ref");
    assert(parsed.dados?.action_plan_used === true, "ActionPlan de morte deveria ser marcado");
    assert(parsed.dados?.action_plan_domain === "saude_sanitario", "domain saude_sanitario ausente");
  });
});

test("Gemini-first usa ActionPlan execute quando o modelo escolhe capacidade generica", async () => {
  await withGeminiMock(() => ({
    action: "execute",
    capability: "registrar_evento_animal",
    operation: "registro_morte",
    confidence: 0.94,
    data: { animal_ref: "B-002", tipo_evento: "morte", data: "hoje" },
    requiresConfirmation: true
  }), async () => {
    const text = "a vaca B-002 morreu hoje";
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({})
    });
    const parsed = finalParsed(result);
    assert(parsed?.tipo === "MORTE", `Gemini execute deveria virar MORTE, recebeu ${parsed?.tipo}`);
    assert(parsed.dados?.action_plan_used === true, "Gemini execute deveria marcar ActionPlan");
    assert(parsed.dados?.action_plan_capability === "registrar_evento_animal", "capability deveria ser preservada");
  });
});

test("Gemini-first normaliza consulta ampla de eventos para relatorio geral", async () => {
  await withGeminiMock(() => ({
    action: "query",
    domain: "saude_sanitario",
    operation: "eventos_gerais",
    confidence: 0.95,
    filters: [{ field: "data", op: "last_days", value: 1 }],
    limit: 100,
    requiresConfirmation: false
  }), async () => {
    const text = "quais eventos teve hoje";
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      currentDate: "2026-06-24",
      supabase: createActionPlanSupabase({ [TABLES.eventosAnimal]: [] })
    });
    const parsed = finalParsed(result);
    assert(parsed?.tipo === "CONSULTA_REGISTROS_HOJE", `consulta ampla deveria virar CONSULTA_REGISTROS_HOJE, recebeu ${parsed?.tipo}`);
    assert(parsed.dados?.action_plan_domain === "eventos_gerais", "consulta ampla deveria ser normalizada para eventos_gerais");
    assert(parsed.dados?.action_plan_original_domain === "saude_sanitario", "dominio original deveria ficar registrado");
    assert(!parsed.dados?.action_plan_response, "consulta ampla nao deve trazer resposta sanitaria pre-montada");
  });
});

test("ActionPlan create de ponto vira PONTO_FUNCIONARIO", async () => {
  const result = await executeActionPlan({
    plan: {
      action: "create",
      domain: "ponto_funcionario",
      operation: "registrar_ponto",
      confidence: 0.9,
      data: { funcionario_ref: "Joao", tipo: "entrada", data: "hoje" },
      requiresConfirmation: true
    },
    text: "Joao chegou agora",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24"
  });

  assert(result.ok, `ponto_funcionario deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "PONTO_FUNCIONARIO", `intent esperado PONTO_FUNCIONARIO, recebido ${result.parsed.tipo}`);
  assert(result.parsed.dados?.funcionario_nome === "Joao", "funcionario_ref deveria virar funcionario_nome");
  assert(result.parsed.dados?.ponto_tipo === "entrada", "tipo de ponto deveria ser entrada");
  assert(result.parsed.dados?.agora === true, "ponto sem hora explicita deveria marcar agora");
});

test("import_table sem data aplica hoje local do Rancho", async () => {
  const result = await executeImportTableActionPlan({
    text: "177:PROTOCOLO\n094:PROTOCOLO",
    plan: {
      action: "import_table",
      domain: "reproducao",
      confidence: 0.92,
      table: {
        hasHeader: false,
        separator: ":",
        columnMapping: { animal_ref: 0, evento: 1 },
        defaultFields: {},
        ignoredColumns: [],
        ambiguousColumns: []
      },
      requiresConfirmation: true
    }
  });
  assert(result.ok, `import_table sem data deveria executar: ${result.reason}`);
  assert(result.rows.length === 2, `import_table deveria preservar 2 linhas, recebeu ${result.rows.length}`);
  assert(result.rows.every((row) => row.data_referencia === getRanchTodayISO()), "linhas importadas sem data deveriam usar hoje local do Rancho");
});

test("validator marca intent legado como fallback quando ActionPlan esta ligado", async () => {
  await withInterpreterEnv({ BOT_INTERPRETER: "gemini", GEMINI_ACTION_PLAN_ENABLED: "true" }, async () => {
    const validation = validateInterpretedAction({
      intent: "PARTO",
      confidence: 0.9,
      riskScore: 0.1,
      fields: { animal_ref: "090" },
      actions: [],
      missing_fields: [],
      warnings: [],
      should_confirm: true,
      response_hint: null
    }, { originalText: "090 pariu" });
    assert(validation.ok, `intent legado deve virar resultado marcado, nao schema invalido: ${validation.message || validation.reason}`);
    assert(validation.value.legacy_intent_returned === true, "legacy_intent_returned ausente");
    assert(validation.value.action_plan_used === false, "action_plan_used deveria ser false");
    assert(validation.value.interpreter_final_usado === "legacy_intent_after_gemini", "marcador de legado incorreto");
    assert(!validation.value.action_plan, "intent legado nao deve ganhar ActionPlan falso");
  });
});

test("fixtures ActionPlan obrigatorias validam ou bloqueiam corretamente", () => {
  const fixtures = loadFixtures();
  assert(fixtures.length >= 11, `fixtures insuficientes: ${fixtures.length}`);
  for (const fixture of fixtures) {
    const parsedTable = fixture.parsedTable || (fixture.plan.action === "import_table" && fixture.input
      ? parseStructuredTableForActionPlan(fixture.input, fixture.plan.table?.separator, fixture.plan.table?.hasHeader)
      : undefined);
    const result = assertValid(fixture.name, clone(fixture.plan), parsedTable);
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

test("executor query financeiro mes atual repara filtro invalido do ActionPlan", async () => {
  const result = await executeQueryActionPlan({
    plan: {
      action: "query",
      domain: "financeiro",
      confidence: 0.82,
      filters: [{ field: "periodo", op: "eq", value: "mes_atual" }],
      aggregations: [{ field: "valor", op: "sum", as: "total" }],
      requiresConfirmation: false
    },
    owner: ADMIN_OWNER,
    currentDate: "2026-06-18",
    originalText: "como foi o financeiro desse mes?",
    supabase: createActionPlanSupabase({
      [TABLES.transacoesFinanceiras]: [
        { id: "entrada-junho", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "entrada", valor: 1000, descricao: "venda leite", categoria: "leite", data_transacao: "2026-06-02" },
        { id: "saida-junho", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 300, descricao: "racao", categoria: "racao", data_transacao: "2026-06-10" },
        { id: "saida-maio", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 200, descricao: "sal", categoria: "insumo", data_transacao: "2026-05-30" }
      ]
    })
  });
  assert(result.ok, `consulta financeira deveria ser reparada: ${result.reason}`);
  assert(result.rows.length === 2, `esperado somente registros do mes atual, recebido ${result.rows.length}`);
  assert(result.parsed.tipo === "CONSULTA_FINANCEIRO", `consulta reparada deveria manter financeiro, recebeu ${result.parsed.tipo}`);
  assert(result.parsed.dados?.resultado?.filters?.some((filter) => filter.field === "data" && filter.op === "current_month"), "filtro current_month reparado ausente");
  assertCleanVisibleText(result.response, "resposta query financeiro reparada");
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

test("executor query animais trata dados das vagas como resumo coletivo de vacas", async () => {
  const result = await executeQueryActionPlan({
    plan: {
      action: "query",
      domain: "animais",
      confidence: 0.9,
      filters: [{ field: "animal_ref", op: "eq", value: "vagas" }],
      requiresConfirmation: false,
      limit: 20,
      userQuestion: "dados das vagas"
    },
    owner: ADMIN_OWNER,
    originalText: "dados das vagas",
    supabase: createActionPlanSupabase({
      [TABLES.animais]: [
        { id: "animal-1", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "B-001", nome: "Estrela", categoria: "vaca", sexo: "femea", status: "ativo", fase: "lactacao" },
        { id: "animal-2", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "B-002", nome: "Lua", categoria: "vaca", sexo: "femea", status: "ativo", fase: "gestante" },
        { id: "animal-3", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "T-001", nome: "Touro", categoria: "touro", sexo: "macho", status: "ativo" }
      ]
    })
  });

  assert(result.ok, `query animais deveria executar: ${result.reason}`);
  assert(result.rows.length === 2, `esperado 2 vacas, recebido ${result.rows.length}`);
  assert(result.parsed.tipo === "CONSULTA_REBANHO", `intent esperado CONSULTA_REBANHO, recebido ${result.parsed.tipo}`);
  assert(result.response.includes("Dados das vacas:"), "resposta deveria ser resumo coletivo de vacas");
  assert(result.response.includes("Total encontrado: 2."), "resposta deveria trazer total coletivo");
  assert(!result.response.includes("Ficha de"), "consulta coletiva nao deveria virar ficha individual");
  assertCleanVisibleText(result.response, "resposta query animais coletiva");
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

test("executor import_table animais normaliza enums antes de salvar", async () => {
  const plan = {
    action: "import_table",
    domain: "animais",
    confidence: 0.95,
    table: {
      hasHeader: true,
      separator: ";",
      columnMapping: {
        brinco: "Brinco",
        nome: "Nome",
        categoria: "Categoria",
        sexo: "Sexo",
        fase: "Fase",
        raca: "Raça",
        lote_ref: "Lote",
        peso: "Peso"
      },
      defaultFields: {},
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const text = [
    "Brinco;Nome;Categoria;Sexo;Fase;Raça;Lote;Peso",
    "B-101;Mimosa;vaca;fêmea;lactação;Girolando;Lactação;540",
    "T-01;Imperador;touro;macho;não aplicável;Gir;;760"
  ].join("\n");
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `import animais deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA", `intent esperado IMPORTACAO_ANIMAIS_TABELA, recebido ${result.parsed.tipo}`);
  const rows = result.parsed.dados?.linhas || [];
  assert(rows[0]?.fase === "lactacao", `fase lactacao deveria estar normalizada, recebeu ${rows[0]?.fase}`);
  assert(rows[0]?.sexo === "femea", `sexo femea deveria estar normalizado, recebeu ${rows[0]?.sexo}`);
  assert(rows[1]?.fase === "nao_aplicavel", `fase nao_aplicavel deveria estar normalizada, recebeu ${rows[1]?.fase}`);
  assert(rows[1]?.sexo === "macho", `sexo macho deveria estar normalizado, recebeu ${rows[1]?.sexo}`);
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

test("preview import_table estoque mostra produtos e movimento", async () => {
  const plan = {
    action: "import_table",
    domain: "estoque",
    confidence: 0.95,
    table: {
      hasHeader: true,
      separator: ";",
      columnMapping: {
        unidade: "Unidade",
        item: "Produto",
        tipo_movimento: "Movimento",
        quantidade: "Quantidade"
      },
      defaultFields: {},
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({
    plan,
    text: "Unidade;Produto;Movimento;Quantidade\nsacos;Racao;entrada;10\nkg;Sal mineral;saida;20\nlitros;Diesel;entrada;30"
  });
  assert(result.ok, `import estoque deveria executar: ${result.reason}`);
  const preview = confirmationText(result.parsed);
  assert(preview.includes("Sal mineral"), "preview deveria mostrar Sal mineral");
  assert(preview.includes("saída"), "preview deveria mostrar movimento saida com texto amigavel");
  assert(preview.includes("Racao"), "preview deveria mostrar pelo menos uma linha pronta");
});

test("executor import_table reproducao aceita lista codigo evento com data.rows", async () => {
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.93,
    data: {
      rows: [
        { animal_ref: "177", evento: "protocolo" },
        { animal_ref: "094", evento: "PROTOCOLO" },
        { animal_ref: "053", evento: "INSEMINAÇÃO" },
        { animal_ref: "249", evento: "protocolo" },
        { animal_ref: "205", evento: "RETESTE" }
      ]
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({
    plan,
    text: "177:PROTOCOLO\n094:PROTOCOLO\n053:INSEMINAÇÃO\n249:PROTOCOLO\n205:RETESTE"
  });
  assert(result.ok, `lista data.rows de reproducao deveria executar: ${result.reason}`);
  assert(result.parsed.tipo === "IMPORTACAO_EVENTOS_TABELA", `intent incorreto: ${result.parsed.tipo}`);
  assert(result.parsed.dados?.action_plan_used === true, "ActionPlan deveria ser marcado");
  assert(result.parsed.dados?.action_plan_domain === "reproducao", "dominio reproducao ausente");
  assert(result.parsed.dados?.total_linhas === 5, `esperado 5 linhas, recebido ${result.parsed.dados?.total_linhas}`);
  assert(result.parsed.dados?.total_linhas_parse_invalidas === 0, "PROTOCOLO/INSEMINAÇÃO/RETESTE deveriam normalizar sem invalidar");
  assert(result.parsed.dados?.linhas?.[2]?.evento_tipo === "inseminacao", "INSEMINAÇÃO deveria normalizar para inseminacao");
  assert(result.parsed.dados?.linhas?.[4]?.evento_tipo === "reteste", "RETESTE deveria normalizar para reteste");
});

test("BOT_INTERPRETER=gemini chama Gemini mock para lista estruturada com dois pontos", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "mock",
    GEMINI_ACTION_PLAN_ENABLED: "true",
    GEMINI_TABLE_ACTION_PLAN_ENABLED: "true"
  }, async () => {
    resetGeminiRuntimeStats();
    const text = "177:PROTOCOLO\n094:PROTOCOLO\n053:INSEMINACAO\n249:PROTOCOLO\n205:RETESTE";
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      supabase: null
    });
    const stats = geminiRuntimeStats();
    assert(stats.mockCalls === 1, `Gemini mock deveria ser chamado uma vez, recebido ${stats.mockCalls}`);
    assert(result.kind === "parsed", `lista estruturada deveria gerar parsed, recebido ${result.kind}`);
    const parsed = result.parsed;
    assert(parsed.dados?.route === "structured_input", "rota structured_input ausente");
    assert(parsed.dados?.structuredDetection?.isStructured === true, "structuredDetection deveria marcar true");
    assert(parsed.dados?.action_plan_used === true, "ActionPlan deveria vencer o parser local");
    assert(parsed.dados?.table_action_plan_used === true, "table_action_plan_used ausente");
    assert(parsed.dados?.action_plan_domain === "reproducao", "dominio reproducao ausente");
    assert(parsed.dados?.total_linhas === 5, "lista deveria reconhecer 5 linhas");
    assert(result.gemini.requiresConfirmation === true, "import_table deve exigir confirmacao");
    assert(!String(result.gemini.userResponse || "").includes("Preciso revisar esse plano"), "nao deveria retornar erro generico de revisao");
  });
});

test("lista estruturada reproducao valida nao retorna instabilidade e mostra preview", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "mock",
    GEMINI_ACTION_PLAN_ENABLED: "true",
    GEMINI_TABLE_ACTION_PLAN_ENABLED: "true"
  }, async () => {
    const text = "387:PROTOCOLO\n391:RETESTE\n094:PRÉ PARTO\n520:EM PRENHOU";
    const plan = {
      action: "import_table",
      domain: "reproducao",
      confidence: 0.93,
      data: {
        rows: [
          { animal_ref: "387", evento: "protocolo" },
          { animal_ref: "391", evento: "reteste" },
          { animal_ref: "094", evento: "pre_parto" },
          { animal_ref: "520", evento: "EM PRENHOU" }
        ]
      },
      requiresConfirmation: true
    };
    await withGeminiMock(() => clone(plan), async () => {
      resetGeminiRuntimeStats();
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: null
      });
      const stats = geminiRuntimeStats();
      assert(stats.mockCalls === 1, `Gemini mock deveria ser chamado uma vez, recebido ${stats.mockCalls}`);
      assert(result.kind === "parsed", `lista estruturada deveria gerar preview, recebido ${result.kind}`);
      assert(!String(result.gemini?.userResponse || "").includes("Estou com instabilidade"), "lista valida nao deve retornar instabilidade");
      const parsed = result.parsed;
      assert(parsed.dados?.action_plan_used === true, "ActionPlan deveria ser usado");
      assert(parsed.dados?.action_plan_domain === "reproducao", "dominio reproducao ausente");
      assert(parsed.dados?.total_linhas === 4, `esperado 4 linhas, recebido ${parsed.dados?.total_linhas}`);
      assert(parsed.dados?.total_linhas_parse_invalidas === 0, "lista valida nao deveria ter invalidas");
      assert(parsed.dados?.linhas?.[2]?.evento_tipo === "pre_parto", "PRE PARTO deveria normalizar");
      assert(parsed.dados?.linhas?.[3]?.evento_tipo === "prenhez", "EM PRENHOU deveria normalizar para prenhez");
      assert(result.gemini?.requiresConfirmation === true, "lista deve pedir confirmacao");
    });
  });
});

test("import_table invalido nao retorna instabilidade e expõe motivo", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "mock",
    GEMINI_ACTION_PLAN_ENABLED: "true",
    GEMINI_TABLE_ACTION_PLAN_ENABLED: "true"
  }, async () => {
    const text = "387:EVENTO ESTRANHO\n391:RETESTE";
    const invalidPlan = {
      action: "import_table",
      domain: "reproducao",
      confidence: 0.9,
      data: {
        rows: [
          { animal_ref: "387", evento: "EVENTO ESTRANHO" },
          { animal_ref: "391", evento: "reteste" }
        ]
      },
      requiresConfirmation: true
    };
    await withGeminiMock(() => clone(invalidPlan), async () => {
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: null
      });
      assert(result.kind === "clarify", `import_table invalido deveria pedir revisão, recebido ${result.kind}`);
      assert(!String(result.message).includes("Estou com instabilidade"), "import_table invalido nao deve retornar instabilidade");
      assert(String(result.message).includes("validar essa lista"), `mensagem de lista ausente: ${result.message}`);
      assert(result.debug?.error_classification === "import_table", "debug deveria classificar import_table");
      assert(result.debug?.import_table_validation_error, "debug deveria expor import_table_validation_error");
      assert(result.debug?.rows_count === 2, `rows_count esperado 2, recebido ${result.debug?.rows_count}`);
      assert(result.debug?.structured_input_detected === true, "structured_input_detected deveria ser true");
    });
  });
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
  const extra = polishBotResponse("Nao e parto. Voce quer corrigir a movimentacao do ultimo lancamento com seguranca?");
  assert(extra.includes("Não é parto"), "frase nao e deveria virar não é");
  assert(extra.includes("Você"), "voce deveria ter acento");
  assert(extra.includes("movimentação"), "movimentacao deveria ter acento");
  assert(extra.includes("último lançamento"), "ultimo lancamento deveria ter acento");
  assert(extra.includes("segurança"), "seguranca deveria ter acento");
});

test("AI Response Composer aceita texto natural preservando opcoes obrigatorias", () => {
  const original = [
    "Entendi que voce quer registrar producao de leite do animal B-002 com 20 litros.",
    "",
    "Esta correto?",
    "1 - Confirmar",
    "2 - Corrigir"
  ].join("\n");
  const result = validateComposedBotResponse(original, {
    type: "bot_response_composition",
    confidence: 0.9,
    message: [
      "Vou registrar uma producao de leite para o animal B-002 com 20 litros.",
      "",
      "Esta correto?",
      "1 - Confirmar",
      "2 - Corrigir"
    ].join("\n")
  });
  assert(result.usedAI === true, `composer deveria aceitar resposta segura: ${result.reason}`);
  assert(result.response.includes("1 - Confirmar"), "composer deveria preservar opcao 1");
  assert(result.response.includes("2 - Corrigir"), "composer deveria preservar opcao 2");
});

test("AI Response Composer rejeita perda de opcao ou falsa afirmacao de salvamento", () => {
  const original = [
    "Recebi uma tabela de reproducao.",
    "Pre-validacao concluida. Nenhum dado foi salvo ainda.",
    "",
    "1 - Importar",
    "2 - Cancelar"
  ].join("\n");
  const missingOption = validateComposedBotResponse(original, {
    type: "bot_response_composition",
    confidence: 0.9,
    message: "Revisei a tabela. 1 - Importar"
  });
  assert(missingOption.usedAI === false && missingOption.reason === "missing_mandatory_option", "composer deveria rejeitar opcao ausente");

  const unsafeSave = validateComposedBotResponse(original, {
    type: "bot_response_composition",
    confidence: 0.9,
    message: [
      "Importei a tabela com sucesso.",
      "1 - Importar",
      "2 - Cancelar"
    ].join("\n")
  });
  assert(unsafeSave.usedAI === false && unsafeSave.reason === "unsafe_save_claim", "composer deveria rejeitar salvamento falso");
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
  const withPregnancy = animalReproductionStatus(animal, [
    { tipo: "inseminacao", data_evento: "2026-06-10T12:00:00Z", descricao: "Inseminacao registrada" },
    { tipo: "observacao", data_evento: "2026-06-20T12:00:00Z", descricao: "[Reproducao Animal] Prenhez confirmada" }
  ]);
  assert(withPregnancy.key === "prenhe", `status atual esperado prenhe, recebido ${withPregnancy.key}`);
  assert(withPregnancy.keys.includes("prenhe"), "prenhez deveria estar no estado atual");
  assert(!withPregnancy.keys.includes("inseminada"), "prenhez posterior nao pode manter inseminada como estado atual");
  assert(!withPregnancy.keys.includes("protocolo"), "prenhez posterior nao pode manter protocolo como estado atual");
  assert(!withPregnancy.keys.includes("reteste"), "prenhez posterior nao pode manter reteste como estado atual");

  const withProtocol = animalReproductionStatus(animal, [
    { tipo: "inseminacao", data_evento: "2026-06-10T12:00:00Z", descricao: "Inseminacao registrada" },
    { tipo: "observacao", data_evento: "2026-06-20T12:00:00Z", descricao: "[Reproducao Animal] Protocolo IA" }
  ]);
  assert(withProtocol.key === "protocolo", `status atual esperado protocolo, recebido ${withProtocol.key}`);
  assert(withProtocol.keys.includes("inseminada"), "protocolo pode coexistir com inseminada");
  assert(withProtocol.keys.includes("protocolo"), "protocolo deveria estar nos estados complementares");

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
  assert(!afterBirth.keys.includes("inseminada"), "parto nao pode manter inseminada como estado atual");
  assert(animal.categoria === "vaca" && animal.lote_id === "lote-1", "calculo de status nao pode alterar categoria ou lote");
});

test("ActionPlan query reproducao separa prenhas de inseminadas ativas", async () => {
  const animals = [
    { id: "animal-306", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "306", nome: "Vaca 306", categoria: "vaca", fase: "gestante", status: "ativo" },
    { id: "animal-307", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "307", nome: "Vaca 307", categoria: "vaca", fase: "lactacao", status: "ativo" },
    { id: "animal-308", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "308", nome: "Vaca 308", categoria: "vaca", fase: "lactacao", status: "ativo" }
  ];
  const events = [
    { id: "ins-306", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-306", tipo: "inseminacao", data_evento: "2026-06-01T12:00:00Z", descricao: "Inseminacao registrada" },
    { id: "prenhez-306", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-306", tipo: "observacao", data_evento: "2026-06-20T12:00:00Z", descricao: "[Reproducao Animal] Prenhez confirmada" },
    { id: "ins-307", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-307", tipo: "inseminacao", data_evento: "2026-06-01T12:00:00Z", descricao: "Inseminacao registrada" },
    { id: "protocolo-307", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-307", tipo: "observacao", data_evento: "2026-06-21T12:00:00Z", descricao: "[Reproducao Animal] Protocolo IA" },
    { id: "ins-308", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-308", tipo: "inseminacao", data_evento: "2026-06-01T12:00:00Z", descricao: "Inseminacao registrada" },
    { id: "reteste-308", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-308", tipo: "observacao", data_evento: "2026-06-21T12:00:00Z", descricao: "[Reproducao Animal] Reteste de protocolo" }
  ];
  const supabase = createActionPlanSupabase({
    [TABLES.animais]: animals,
    [TABLES.eventosAnimal]: events
  });

  const pregnant = await executeQueryActionPlan({
    plan: {
      action: "query",
      domain: "reproducao",
      confidence: 0.9,
      filters: [{ field: "status_reprodutivo", op: "eq", value: "prenhe" }],
      aggregations: [],
      requiresConfirmation: false
    },
    originalText: "quais vacas tao prenhas?",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24",
    supabase
  });
  assert(pregnant.ok, `consulta prenhas deveria executar: ${pregnant.reason}`);
  assert(pregnant.rows.length === 1, `consulta prenhas deveria retornar 1, recebeu ${pregnant.rows.length}`);
  assert(String(pregnant.rows[0].animal_id) === "animal-306", "consulta prenhas deveria retornar somente animal com prenhez ativa");

  const inseminated = await executeQueryActionPlan({
    plan: {
      action: "query",
      domain: "reproducao",
      confidence: 0.9,
      filters: [{ field: "status_reprodutivo", op: "eq", value: "inseminada" }],
      aggregations: [],
      requiresConfirmation: false
    },
    originalText: "quais vacas estao inseminadas?",
    owner: ADMIN_OWNER,
    currentDate: "2026-06-24",
    supabase
  });
  assert(inseminated.ok, `consulta inseminadas deveria executar: ${inseminated.reason}`);
  const inseminatedIds = new Set(inseminated.rows.map((row) => String(row.animal_id || "")));
  assert(!inseminatedIds.has("animal-306"), "animal prenhe nao pode aparecer como inseminada ativa");
  assert(inseminatedIds.has("animal-307"), "protocolo deve permitir coexistencia com inseminada");
  assert(inseminatedIds.has("animal-308"), "reteste deve permitir coexistencia com inseminada");
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

test("ActionPlan import_table reproducao aceita tabela mista com parto sem cria", async () => {
  const text = "177:PROTOCOLO\n094:PARTO\n053:INSEMINACAO\n249:RETESTE\n520:EMPRENHOU";
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.92,
    data: {
      rows: [
        { animal_ref: "177", evento: "protocolo" },
        { animal_ref: "094", evento: "parto" },
        { animal_ref: "053", evento: "inseminacao" },
        { animal_ref: "249", evento: "reteste" },
        { animal_ref: "520", evento: "prenhez" }
      ]
    },
    table: {
      hasHeader: false,
      columnMapping: { animal_ref: "animal_ref", evento: "evento" },
      defaultFields: { data: "hoje" },
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `tabela mista deveria executar: ${result.reason}`);
  assert(result.parsed.dados?.action_plan_used === true, "ActionPlan deveria ser usado");
  assert(result.parsed.dados?.action_plan_domain === "reproducao", "domain reproducao ausente");
  assert(result.rows.length === 5, `rows_count esperado 5, recebido ${result.rows.length}`);
  const birth = result.rows.find((row) => row.animal_codigo === "094");
  assert(birth?.evento_tipo === "parto", "parto 094 nao reconhecido");
  assert(birth?.child_status === "pending_child_optional", `child_status incorreto: ${birth?.child_status}`);
  assert(birth?.status_linha === "pronto", "parto sem cria deve ficar pronto para evento da mae");
  const preview = confirmationText(result.parsed);
  assert(preview.includes("Partos no lote"), "preview deveria resumir partos em lote");
  assert(preview.includes("Sem cria cadastrada agora: 1"), "preview deveria indicar parto sem cria");
  assert(preview.includes("partos serao salvos nas maes"), "preview deveria explicar confirmacao sem cria");
  assert(preview.includes("codigo_da_mae;codigo_da_cria;sexo_da_cria;pai_opcional"), "preview deveria mostrar formato aceito");
  assert(!/Qual foi o sexo da cria/i.test(preview), "preview nao deve perguntar sexo de cria individualmente");
});

test("ActionPlan import_table reproducao resume varios partos sem pergunta individual", async () => {
  const text = "094:PARTO\n204:PARTO\n398:PARTO";
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.92,
    data: {
      rows: [
        { animal_ref: "094", evento: "parto" },
        { animal_ref: "204", evento: "parto" },
        { animal_ref: "398", evento: "parto" }
      ]
    },
    table: {
      hasHeader: false,
      columnMapping: { animal_ref: "animal_ref", evento: "evento" },
      defaultFields: { data: "hoje" },
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `varios partos deveriam executar: ${result.reason}`);
  assert(result.parsed.dados?.resumo_partos?.total_partos === 3, "deveria contar 3 partos");
  assert(result.parsed.dados?.resumo_partos?.partos_sem_cria_cadastrada === 3, "deveria marcar 3 partos sem cria");
  const preview = confirmationText(result.parsed);
  assert(preview.includes("094;C-094;femea;T-50"), "preview deveria mostrar formato de complemento em lote");
  assert(!/Qual foi o sexo da cria/i.test(preview), "nao deve perguntar parto por parto");
});

test("ActionPlan import_table reproducao aceita parto com cria completa", async () => {
  const text = "094;PARTO;femea;C-094;T-50";
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.92,
    data: { rows: [{ animal_ref: "094", evento: "parto", cria_sexo: "femea", cria_codigo: "C-094", pai_ref: "T-50" }] },
    table: {
      hasHeader: false,
      columnMapping: { animal_ref: "animal_ref", evento: "evento", cria_sexo: "cria_sexo", cria_codigo: "cria_codigo", pai_ref: "pai_ref" },
      defaultFields: { data: "hoje" },
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `parto com cria deveria executar: ${result.reason}`);
  const row = result.rows[0];
  assert(row.child_status === "complete", `child_status esperado complete, recebido ${row.child_status}`);
  assert(row.parto_cria_cadastro === true, "deveria marcar cadastro da cria");
  assert(row.cria_sexo === "femea", "child_sex femea ausente");
  assert(row.cria_codigo === "C-094", "child_code C-094 ausente");
  assert(row.pai_ref === "T-50", "father_ref T-50 ausente");
});

test("ActionPlan import_table reproducao permite parto com cria parcial sem invalidar mae", async () => {
  const text = "094;PARTO;femea";
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.92,
    data: { rows: [{ animal_ref: "094", evento: "parto", cria_sexo: "femea" }] },
    table: {
      hasHeader: false,
      columnMapping: { animal_ref: "animal_ref", evento: "evento", cria_sexo: "cria_sexo" },
      defaultFields: { data: "hoje" },
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `parto parcial deveria executar: ${result.reason}`);
  const row = result.rows[0];
  assert(row.status_linha === "pronto", "evento da mae deve continuar pronto");
  assert(row.classificacao_linha === "pending_child_data", "cria parcial deveria ficar pendente por linha");
  assert(row.child_status === "missing_child_code", `child_status esperado missing_child_code, recebido ${row.child_status}`);
  assert(row.avisos.includes("cria_codigo_ausente"), "aviso de codigo da cria ausente deveria existir");
});

test("ActionPlan import_table reproducao aplica complemento de crias em lote", async () => {
  const text = "094:PARTO\n204:PARTO\n398:PARTO";
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.92,
    data: { rows: [{ animal_ref: "094", evento: "parto" }, { animal_ref: "204", evento: "parto" }, { animal_ref: "398", evento: "parto" }] },
    table: {
      hasHeader: false,
      columnMapping: { animal_ref: "animal_ref", evento: "evento" },
      defaultFields: { data: "hoje" },
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `partos deveriam executar: ${result.reason}`);
  const patched = applyReproductionImportChildComplement(result.parsed, "094;C-094;femea;T-50\n204;macho;C-204\n398;sem cria");
  assert(patched, "complemento em lote deveria aplicar patch");
  const rows = patched.dados?.linhas || [];
  const row094 = rows.find((row) => row.animal_codigo === "094");
  const row204 = rows.find((row) => row.animal_codigo === "204");
  const row398 = rows.find((row) => row.animal_codigo === "398");
  assert(row094?.child_status === "complete" && row094.cria_codigo === "C-094" && row094.pai_ref === "T-50", "linha 094 nao recebeu cria completa");
  assert(row204?.child_status === "complete" && row204.cria_sexo === "macho" && row204.cria_codigo === "C-204", "linha 204 nao recebeu cria completa");
  assert(row398?.child_status === "not_registered", "linha 398 deveria ficar sem cria cadastrada");
  assert(patched.dados?.resumo_partos?.partos_com_cria_completa === 2, "deveria contar 2 crias completas");
});

test("ActionPlan import_table reproducao aceita variacoes de complemento de crias", async () => {
  const text = "080:PARTO\n081:PARTO\n082:PARTO\n083:PARTO\n084:PARTO";
  const plan = {
    action: "import_table",
    domain: "reproducao",
    confidence: 0.92,
    data: { rows: [
      { animal_ref: "080", evento: "parto" },
      { animal_ref: "081", evento: "parto" },
      { animal_ref: "082", evento: "parto" },
      { animal_ref: "083", evento: "parto" },
      { animal_ref: "084", evento: "parto" }
    ] },
    table: {
      hasHeader: false,
      columnMapping: { animal_ref: "animal_ref", evento: "evento" },
      defaultFields: { data: "hoje" },
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  };
  const result = await executeImportTableActionPlan({ plan, text });
  assert(result.ok, `partos deveriam executar: ${result.reason}`);

  const patched = applyReproductionImportChildComplement(result.parsed, [
    "080;C-080;femea;T-137",
    "081;C-081;f\u00eamea",
    "082 sexo:femea codigo:C-082 pai:T-137",
    "083 cria:C-083 sexo:femea pai:T-137",
    "084;sem cria"
  ].join("\n"));
  assert(patched, "variacoes de complemento deveriam aplicar patch");
  const rows = patched.dados?.linhas || [];
  for (const code of ["080", "081", "082", "083"]) {
    const row = rows.find((item) => item.animal_codigo === code);
    assert(row?.child_status === "complete", `linha ${code} deveria ficar completa`);
    assert(row?.cria_codigo === `C-${code}`, `linha ${code} perdeu codigo da cria`);
    assert(row?.cria_sexo === "femea", `linha ${code} perdeu sexo da cria`);
  }
  assert(rows.find((row) => row.animal_codigo === "084")?.child_status === "not_registered", "linha 084 deveria ficar sem cria");
  assert(patched.dados?.resumo_partos?.partos_com_cria_completa === 4, "deveria contar 4 crias completas");
  assert(patched.dados?.resumo_partos?.partos_sem_cria_cadastrada === 1, "deveria contar 1 parto sem cria");
});

test("PendingActionInterpreter remove linha de importacao de estoque por nome", () => {
  const pending = {
    tipo: "IMPORTACAO_ESTOQUE_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas: [
        { lineNumber: 1, rawText: "sacos;Racao;entrada;10", item_nome: "Racao", tipo_movimento: "entrada", quantidade: 10, unidade: "sacos" },
        { lineNumber: 2, rawText: "litros;Diesel;entrada;30", item_nome: "Diesel", tipo_movimento: "entrada", quantidade: 30, unidade: "litros" },
        { lineNumber: 3, rawText: "kg;Sal mineral;saida;20", item_nome: "Sal mineral", tipo_movimento: "saida", quantidade: 20, unidade: "kg" }
      ],
      total_linhas: 3
    }
  };
  const result = interpretPendingActionMessage(pending, "nao importa diesel");
  assert(result?.operation === "remove_rows", `esperado remove_rows, recebido ${result?.operation}`);
  const rows = result.parsed.dados?.linhas || [];
  assert(rows.length === 2, "deveria remover uma linha");
  assert(!rows.some((row) => row.item_nome === "Diesel"), "linha Diesel deveria sair");
  assert(result.parsed.dados?.linhas_removidas_pelo_usuario?.length === 1, "deveria registrar linha removida pelo usuario");
});

test("PendingActionInterpreter corrige movimento de estoque sem salvar", () => {
  const pending = {
    tipo: "IMPORTACAO_ESTOQUE_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas: [
        { lineNumber: 1, rawText: "Sal mineral;entrada;20;kg", item_nome: "Sal mineral", tipo_movimento: "entrada", quantidade: 20, unidade: "kg", status_validacao: "pronto" }
      ],
      total_linhas: 1
    }
  };
  const result = interpretPendingActionMessage(pending, "corrige o movimento do sal mineral para saida");
  assert(result?.operation === "update_rows", `esperado update_rows, recebido ${result?.operation}`);
  const row = result.parsed.dados?.linhas?.[0];
  assert(row?.tipo_movimento === "saida", "movimento deveria virar saida");
  assert(!row.status_validacao, "metadata de validacao antiga deveria ser limpa");
});

test("PendingActionInterpreter remove linha de dominio por contexto de lote", () => {
  const pending = {
    tipo: "IMPORTACAO_TABELA_DOMINIO",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      dominio_tabela: "LOTES",
      linhas: [
        { lineNumber: 1, rawText: "30;Lactacao Teste;Vacas em producao;sim", status_linha: "pronto", values: { nome: "Lactacao Teste", capacidade: 30, descricao: "Vacas em producao", status: "ativo" }, parsedValues: { nome: "Lactacao Teste", capacidade: 30, descricao: "Vacas em producao", status: "ativo" } },
        { lineNumber: 2, rawText: "20;Piquete Teste;Animais em crescimento;sim", status_linha: "pronto", values: { nome: "Piquete Teste", capacidade: 20, descricao: "Animais em crescimento", status: "ativo" }, parsedValues: { nome: "Piquete Teste", capacidade: 20, descricao: "Animais em crescimento", status: "ativo" } }
      ],
      total_linhas: 2
    }
  };
  const result = interpretPendingActionMessage(pending, "cancela a importacao do lote Piquete Teste");
  assert(result?.operation === "remove_rows", `esperado remove_rows, recebido ${result?.operation}`);
  const rows = result.parsed.dados?.linhas || [];
  assert(rows.length === 1, "deveria manter apenas um lote");
  assert(rows[0].values.nome === "Lactacao Teste", "lote errado foi removido");
});

test("PendingActionInterpreter entende ordinal para remover linha", () => {
  const pending = {
    tipo: "IMPORTACAO_ESTOQUE_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas: [
        { lineNumber: 1, item_nome: "Racao", tipo_movimento: "entrada", quantidade: 10, unidade: "sacos" },
        { lineNumber: 2, item_nome: "Diesel", tipo_movimento: "entrada", quantidade: 30, unidade: "litros" },
        { lineNumber: 3, item_nome: "Sal mineral", tipo_movimento: "saida", quantidade: 20, unidade: "kg" }
      ],
      total_linhas: 3
    }
  };
  const result = interpretPendingActionMessage(pending, "remove a segunda linha");
  assert(result?.operation === "remove_rows", `esperado remove_rows, recebido ${result?.operation}`);
  const rows = result.parsed.dados?.linhas || [];
  assert(rows.length === 2, "deveria remover uma linha por ordinal");
  assert(!rows.some((row) => row.item_nome === "Diesel"), "segunda linha deveria sair");
});

test("PendingActionInterpreter responde pergunta sobre preview sem alterar", () => {
  const pending = {
    tipo: "IMPORTACAO_TABELA_DOMINIO",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      dominio_tabela: "LOTES",
      linhas: [
        { lineNumber: 1, status_linha: "pronto", values: { nome: "Lactacao Teste" }, parsedValues: { nome: "Lactacao Teste" } },
        { lineNumber: 2, status_linha: "pronto", values: { nome: "Piquete Teste" }, parsedValues: { nome: "Piquete Teste" } }
      ],
      total_linhas: 2
    }
  };
  const result = interpretPendingActionMessage(pending, "mostra a segunda linha");
  assert(result?.operation === "answer_question", `esperado answer_question, recebido ${result?.operation}`);
  assert(result.message.includes("Piquete Teste"), "resposta deveria citar a segunda linha");
  assert((result.parsed.dados?.linhas || []).length === 2, "pergunta nao deveria alterar linhas");
});

test("PendingActionInterpreter smart nao intercepta confirmacao ou cancelamento puro", async () => {
  const pending = {
    tipo: "IMPORTACAO_ESTOQUE_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas: [
        { lineNumber: 1, item_nome: "Racao", tipo_movimento: "entrada", quantidade: 10, unidade: "sacos" }
      ],
      total_linhas: 1
    }
  };
  for (const text of ["1", "sim", "cancelar", "menu", "repete"]) {
    const result = await interpretPendingActionMessageSmart(pending, text);
    assert(result === null, `mensagem pura nao deveria ser tratada como patch: ${text}`);
  }
});

test("PendingActionInterpreter corrige data e tipo de evento por linha", () => {
  const pending = {
    tipo: "IMPORTACAO_EVENTOS_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas: [
        { lineNumber: 1, animal_codigo: "080", evento_tipo: "parto", db_tipo: "parto", data_referencia: "2026-06-01" }
      ],
      total_linhas: 1
    }
  };
  const result = interpretPendingActionMessage(pending, "corrige a linha 1 para cio em 02/06/2026");
  assert(result?.operation === "update_rows", `esperado update_rows, recebido ${result?.operation}`);
  const row = result.parsed.dados?.linhas?.[0];
  assert(row?.evento_tipo === "cio", "evento deveria virar cio");
  assert(row?.data_referencia === "02/06/2026", "data deveria ser atualizada");
});

test("PendingAction semantic aplica varias crias em uma unica mensagem natural", () => {
  const pending = {
    tipo: "IMPORTACAO_EVENTOS_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas: [
        { lineNumber: 1, animal_codigo: "305", evento_tipo: "protocolo", evento_label: "Protocolo", status_validacao: "pronto" },
        { lineNumber: 2, animal_codigo: "032", evento_tipo: "reteste", evento_label: "Reteste de protocolo", status_validacao: "pronto" },
        { lineNumber: 3, animal_codigo: "398", evento_tipo: "parto", evento_label: "Parto", status_validacao: "pronto", child_status: "pending_child_optional", avisos: ["dados_da_cria_ausentes"] },
        { lineNumber: 4, animal_codigo: "064", evento_tipo: "pre_parto", evento_label: "Pre-parto", status_validacao: "pronto" },
        { lineNumber: 5, animal_codigo: "143", evento_tipo: "parto", evento_label: "Parto", status_validacao: "pronto", child_status: "pending_child_optional", avisos: ["dados_da_cria_ausentes"] }
      ],
      linhas_validadas: [
        { lineNumber: 1, animal_codigo: "305", evento_tipo: "protocolo", evento_label: "Protocolo", status_validacao: "pronto" },
        { lineNumber: 2, animal_codigo: "032", evento_tipo: "reteste", evento_label: "Reteste de protocolo", status_validacao: "pronto" },
        { lineNumber: 3, animal_codigo: "398", evento_tipo: "parto", evento_label: "Parto", status_validacao: "pronto", child_status: "pending_child_optional", avisos: ["dados_da_cria_ausentes"] },
        { lineNumber: 4, animal_codigo: "064", evento_tipo: "pre_parto", evento_label: "Pre-parto", status_validacao: "pronto" },
        { lineNumber: 5, animal_codigo: "143", evento_tipo: "parto", evento_label: "Parto", status_validacao: "pronto", child_status: "pending_child_optional", avisos: ["dados_da_cria_ausentes"] }
      ],
      total_linhas: 5,
      resumo_partos: { total_partos: 2, partos_com_cria_completa: 0, partos_sem_cria_cadastrada: 2, partos_com_cria_pendente: 0 },
      resumo_validacao: { total: 5, prontas: 5, invalidas: 0, partos: { total_partos: 2, partos_com_cria_completa: 0, partos_sem_cria_cadastrada: 2, partos_com_cria_pendente: 0 } }
    }
  };
  const result = applyPendingActionSemanticPlan(pending, {
    type: "pending_action_interpretation",
    operation: "batch_update_rows",
    confidence: 0.94,
    updates: [
      { target: { searchText: "398" }, patch: { cria_sexo: "femea", cria_codigo: "540" } },
      { target: { searchText: "143" }, patch: { cria_sexo: "macho", cria_codigo: "004" } }
    ]
  });
  assert(result?.operation === "batch_update_rows", `esperado batch_update_rows, recebido ${result?.operation}`);
  const rows = result.parsed.dados?.linhas_validadas || [];
  const row398 = rows.find((row) => row.animal_codigo === "398");
  const row143 = rows.find((row) => row.animal_codigo === "143");
  assert(row398?.child_status === "complete", "398 deveria ficar com cria completa");
  assert(row398?.cria_sexo === "femea" && row398?.cria_codigo === "540", "398 perdeu sexo/codigo da cria");
  assert(row143?.child_status === "complete", "143 deveria ficar com cria completa");
  assert(row143?.cria_sexo === "macho" && row143?.cria_codigo === "004", "143 perdeu sexo/codigo da cria");
  assert(result.parsed.dados?.resumo_partos?.partos_com_cria_completa === 2, "resumo deveria contar duas crias completas");
  assert(result.parsed.dados?.resumo_partos?.partos_sem_cria_cadastrada === 0, "resumo nao deveria manter partos sem cria");
  assert(result.parsed.dados?.resumo_validacao?.partos?.partos_com_cria_completa === 2, "resumo_validacao deveria ser recalculado");
});

test("PendingAction semantic aceita plano de formato compacto invertido validado por alvo", () => {
  const pending = {
    tipo: "IMPORTACAO_EVENTOS_TABELA",
    confianca: 0.94,
    resumo: "",
    perguntas_faltantes: [],
    dados: {
      linhas_validadas: [
        { lineNumber: 3, animal_codigo: "398", evento_tipo: "parto", evento_label: "Parto", status_validacao: "pronto", child_status: "pending_child_optional", avisos: ["dados_da_cria_ausentes"] },
        { lineNumber: 5, animal_codigo: "143", evento_tipo: "parto", evento_label: "Parto", status_validacao: "pronto", child_status: "pending_child_optional", avisos: ["dados_da_cria_ausentes"] }
      ],
      total_linhas: 2
    }
  };
  const result = applyPendingActionSemanticPlan(pending, {
    type: "pending_action_interpretation",
    operation: "batch_update_rows",
    confidence: 0.92,
    updates: [
      { target: { searchText: "398" }, patch: { cria_codigo: "040", cria_sexo: "femea" } },
      { target: { searchText: "143" }, patch: { cria_codigo: "567", cria_sexo: "macho" } }
    ]
  });
  assert(result?.operation === "batch_update_rows", `esperado batch_update_rows, recebido ${result?.operation}`);
  const rows = result.parsed.dados?.linhas_validadas || [];
  assert(rows.find((row) => row.animal_codigo === "398")?.cria_codigo === "040", "398 deveria receber codigo 040 da cria");
  assert(rows.find((row) => row.animal_codigo === "143")?.cria_codigo === "567", "143 deveria receber codigo 567 da cria");
  assert(result.parsed.dados?.resumo_partos?.partos_com_cria_completa === 2, "formato compacto deveria gerar duas crias completas");
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

test("Gemini mock roteia lista codigo evento para import_table reproducao", async () => {
  const text = "177:PROTOCOLO\n094:PROTOCOLO\n053:INSEMINACAO\n249:PROTOCOLO\n205:RETESTE";
  const before = geminiRuntimeStats().mockCalls;
  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const parsed = finalParsed(result);
  assert(parsed?.tipo === "IMPORTACAO_EVENTOS_TABELA", `lista deveria virar IMPORTACAO_EVENTOS_TABELA, recebido ${parsed?.tipo}`);
  assert(parsed.dados?.table_action_plan_used === true, "lista deveria usar ActionPlan de tabela");
  assert(parsed.dados?.origem_parser === "gemini_action_plan", "lista deveria ser roteada pelo Gemini ActionPlan");
  assert(geminiRuntimeStats().mockCalls === before + 1, "lista deveria chamar Gemini mock");
  assert(parsed.dados?.total_linhas === 5, "lista deveria preservar 5 linhas");
  assert(parsed.dados?.linhas?.some((row) => row.evento_normalizado === "EM_PROTOCOLO"), "EM_PROTOCOLO ausente");
  assert(parsed.dados?.linhas?.some((row) => row.evento_normalizado === "INSEMINACAO"), "INSEMINACAO ausente");
  assert(parsed.dados?.linhas?.some((row) => row.evento_normalizado === "EM_RETESTE"), "EM_RETESTE ausente");
});

test("PendingPatch PARTO aplica resposta livre com sexo codigo e pai", async () => {
  const pending = parseRanchoMessage("090 pariu");
  const result = await interpretPendingPatchWithGemini({
    text: "sim.\nsexo:femea\ncodigo:c-140\npai:t-50",
    pending,
    status: "aguardando_dado",
    currentDate: "2026-06-24"
  });
  assert(result.ok, `PendingPatch deveria interpretar resposta livre: ${result.reason}`);
  const patched = applyPendingPatchToSession(pending, result.patch);
  assert(patched.dados?.parto_cria_cadastro === true, "confirm_child=true deveria cadastrar cria");
  assert(patched.dados?.cria_sexo === "femea", `sexo esperado femea, recebido ${patched.dados?.cria_sexo}`);
  assert(patched.dados?.cria_categoria === "bezerro", `categoria esperada bezerro, recebida ${patched.dados?.cria_categoria}`);
  assert(patched.dados?.cria_codigo === "c-140", `codigo esperado c-140, recebido ${patched.dados?.cria_codigo}`);
  assert(patched.dados?.pai_ref === "t-50", `pai esperado t-50, recebido ${patched.dados?.pai_ref}`);
  assert(!patched.perguntas_faltantes.includes("cria_codigo"), "nao deveria pedir codigo novamente");
  assert(!patched.perguntas_faltantes.includes("cria_sexo"), "nao deveria pedir sexo novamente");
});

test("PendingPatch PARTO extrai sexo e codigo juntos em resposta curta", async () => {
  const pending = applyPendingPatchToSession(parseRanchoMessage("090 pariu"), {
    type: "pending_patch",
    targetIntent: "PARTO",
    confidence: 0.9,
    data: { confirm_child: true }
  });
  const result = await interpretPendingPatchWithGemini({
    text: "femea, codigo C-00691",
    pending,
    status: "aguardando_dado",
    currentDate: "2026-06-24"
  });
  assert(result.ok, `PendingPatch resposta curta falhou: ${result.reason}`);
  const patched = applyPendingPatchToSession(pending, result.patch);
  assert(patched.dados?.cria_sexo === "femea", "resposta curta nao extraiu sexo femea");
  assert(patched.dados?.cria_codigo === "C-00691", "resposta curta nao extraiu codigo");
  assert(!patched.perguntas_faltantes.includes("cria_codigo"), "resposta curta nao deveria pedir codigo novamente");
});

test("PendingPatch PARTO aplica pai separado sem apagar sexo e codigo", async () => {
  const pending = applyPendingPatchToSession(parseRanchoMessage("090 pariu"), {
    type: "pending_patch",
    targetIntent: "PARTO",
    confidence: 0.9,
    data: { confirm_child: true, child_sex: "femea", child_code: "C-00691" }
  });
  const result = await interpretPendingPatchWithGemini({
    text: "pai t-50",
    pending,
    status: "aguardando_dado",
    currentDate: "2026-06-24"
  });
  assert(result.ok, `PendingPatch pai separado falhou: ${result.reason}`);
  const patched = applyPendingPatchToSession(pending, result.patch);
  assert(patched.dados?.cria_sexo === "femea", "pai separado apagou sexo");
  assert(patched.dados?.cria_codigo === "C-00691", "pai separado apagou codigo");
  assert(patched.dados?.pai_ref === "t-50", "pai separado nao aplicou pai");
});

test("PendingPatch PARTO aceita deixar sem pai informado", () => {
  const pending = applyPendingPatchToSession(parseRanchoMessage("090 pariu"), {
    type: "pending_patch",
    targetIntent: "PARTO",
    confidence: 0.9,
    data: { confirm_child: true, child_sex: "femea", child_code: "C-00691", father_ref: "t-50" }
  });
  const patched = applyPendingPatchToSession(pending, {
    type: "pending_patch",
    operation: "update",
    targetIntent: "PARTO",
    confidence: 0.9,
    data: { father_unknown: true }
  });
  assert(patched.dados?.pai_nao_informado === true, "sem pai deveria marcar pai_nao_informado");
  assert(!patched.dados?.pai_ref && !patched.dados?.pai_nome && !patched.dados?.pai_id, "sem pai deveria limpar pai anterior");
});

test("PendingPatch generico corrige quantidade e item de estoque", () => {
  const pending = {
    tipo: "ESTOQUE_SAIDA",
    confianca: 0.9,
    resumo: "dar baixa de ração",
    perguntas_faltantes: [],
    dados: { item_nome: "ração", quantidade: 5, unidade: "saco" }
  };
  const validated = validatePendingPatch({
    type: "pending_patch",
    operation: "update",
    targetIntent: "ESTOQUE_SAIDA",
    confidence: 0.91,
    data: { item_nome: "sal mineral", quantidade: 12 }
  }, pending);
  assert(validated.ok, `patch de estoque deveria validar: ${validated.reason}`);
  const patched = applyPendingPatchToSession(pending, validated.patch);
  assert(patched.dados?.item_nome === "sal mineral", "item deveria ser corrigido para sal mineral");
  assert(patched.dados?.quantidade === 12, "quantidade deveria ser corrigida para 12");
  assert(patched.dados?.unidade === "saco", "unidade existente deveria ser preservada");
});

test("PendingPatch generico transforma lote em atualizacao segura de animal", () => {
  const pending = {
    tipo: "ATUALIZACAO_ANIMAL",
    confianca: 0.9,
    resumo: "atualizar animal B-002",
    perguntas_faltantes: [],
    dados: { animal_codigo: "B-002", campo_alterado: "peso", novo_valor: "420" }
  };
  const validated = validatePendingPatch({
    type: "pending_patch",
    operation: "update",
    targetIntent: "ATUALIZACAO_ANIMAL",
    confidence: 0.9,
    data: { lote_nome: "Lactação" }
  }, pending);
  assert(validated.ok, `patch de lote deveria validar: ${validated.reason}`);
  const patched = applyPendingPatchToSession(pending, validated.patch);
  assert(patched.dados?.campo_alterado === "lote_id", "lote deveria virar campo_alterado lote_id");
  assert(patched.dados?.novo_valor === "Lactação", "novo_valor deveria receber nome do lote");
  assert(patched.dados?.lote_nome === "Lactação", "lote_nome deveria ficar disponivel para enriquecimento");
});

test("PendingPatch reconhece cancelar e concluir opcionais sem salvar direto", () => {
  const cancel = validatePendingPatch({
    type: "pending_patch",
    operation: "cancel",
    targetIntent: "CADASTRO_ANIMAL",
    confidence: 0.93,
    data: { cancel_current: true }
  }, { tipo: "CADASTRO_ANIMAL", confianca: 0.9, resumo: "", perguntas_faltantes: [], dados: {} });
  assert(cancel.ok && cancel.patch.operation === "cancel", "nao cadastra deveria virar cancel");

  const finish = validatePendingPatch({
    type: "pending_patch",
    operation: "finish_optional",
    targetIntent: "CADASTRO_ANIMAL",
    confidence: 0.9,
    data: { skip_optional_fields: true }
  }, { tipo: "CADASTRO_ANIMAL", confianca: 0.9, resumo: "", perguntas_faltantes: ["peso"], dados: {} });
  assert(finish.ok && finish.patch.operation === "finish_optional", "nao quero informar mais nada deveria virar finish_optional");
});

test("PendingPatch PARTO sem cria segue para parto sem cadastro de cria", async () => {
  const pending = parseRanchoMessage("090 pariu");
  const result = await interpretPendingPatchWithGemini({
    text: "nao quero cadastrar cria",
    pending,
    status: "aguardando_dado",
    currentDate: "2026-06-24"
  });
  assert(result.ok, `PendingPatch sem cria falhou: ${result.reason}`);
  const patched = applyPendingPatchToSession(pending, result.patch);
  assert(patched.dados?.parto_sem_cadastro_cria === true, "confirm_child=false deveria marcar parto sem cria");
  assert(!patched.perguntas_faltantes.length, "parto sem cria nao deveria ficar pedindo dados da cria");
});

test("PendingPatch nao captura confirmacao ou cancelamento simples", () => {
  assert(shouldUsePendingPatchForText("1") === false, "confirmacao 1 nao deve chamar PendingPatch");
  assert(shouldUsePendingPatchForText("sim") === false, "sim simples nao deve chamar PendingPatch");
  assert(shouldUsePendingPatchForText("cancelar") === false, "cancelar nao deve chamar PendingPatch");
  assert(shouldUsePendingPatchForText("sexo:femea codigo:c-140 pai:t-50") === true, "dados livres deveriam chamar PendingPatch");
  assert(shouldUsePendingPatchForText("nao quero informar mais nada") === true, "concluir opcionais deveria chamar PendingPatch");
  assert(shouldUsePendingPatchForText("pode deixar sem pai") === true, "sem pai deveria chamar PendingPatch");
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

test("Genealogia prioriza sexo explicito da cria sobre categoria bezerro", () => {
  assert(realSex({ sexo: "femea", categoria: "bezerro" }) === "femea", "cria femea com categoria bezerro nao pode aparecer como macho");
  assert(realSex({ sexo: "macho", categoria: "bezerro" }) === "macho", "cria macho deve continuar macho");
  assert(realSex({ categoria: "vaca" }) === "femea", "categoria adulta vaca deve continuar femea");
  assert(realSex({ categoria: "touro" }) === "macho", "categoria adulta touro deve continuar macho");
});

test("Gemini-first prioriza ActionPlan financeiro 6 meses e ignora consulta legada", async () => {
  const text = "relatório financeiro dos últimos 6 meses";
  const fixture = fixtureByName("query-financeiro-ultimos-6-meses");
  const before = actionStatsSnapshot();
  await withGeminiMock(() => clone(fixture.plan), async () => {
    const legacy = parseRanchoMessage(text);
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: legacy,
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({ [TABLES.transacoesFinanceiras]: [] })
    });
    const parsed = finalParsed(result);
    assert(parsed?.dados?.action_plan_used === true, "ActionPlan deveria vencer");
    assert(parsed.dados?.origem_parser === "gemini_action_plan", "origem_parser deveria ser ActionPlan");
    assert(parsed.dados?.interpreter_final_usado === "action_plan", "interpreter_final_usado deveria ser action_plan");
    assert(parsed.dados?.action_plan_domain === "financeiro", "domain financeiro ausente");
    assert(parsed.dados?.action_plan?.filters?.some((filter) => filter.op === "last_months" && filter.value === 6), "filtro 6 meses ausente");
    assert(parsed.dados?.interpreter_final_usado !== "legacy_local_fallback", "nao deveria cair no legado");
  });
  const after = actionStatsSnapshot();
  assert(after.actionPlanUsed === before.actionPlanUsed + 1, "ActionPlan deveria ser contabilizado");
  assert(after.legacyFallback === before.legacyFallback, "fallback legado nao deveria ser contabilizado");
});

test("Gemini-first bloqueia intent legado como caminho principal quando ActionPlan esta ligado", async () => {
  const before = actionStatsSnapshot();
  await withInterpreterEnv({ BOT_INTERPRETER: "gemini", GEMINI_ACTION_PLAN_ENABLED: "true", BOT_ALLOW_LEGACY_ROLLBACK: "false" }, async () => {
    await withGeminiMock(() => ({
      intent: "PARTO",
      confidence: 0.9,
      riskScore: 0.1,
      fields: { animal_ref: "090" },
      actions: [],
      missing_fields: [],
      warnings: [],
      should_confirm: true,
      response_hint: null
    }), async () => {
      const text = "pedido operacional sensivel sem action plan";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `intent legado com ActionPlan ligado nao deve virar parsed, recebido ${result.kind}`);
      assert(result.reason === "legacy_intent_returned_while_action_plan_enabled", `motivo incorreto: ${result.reason}`);
    });
  });
  const after = actionStatsSnapshot();
  assert(after.legacyFallback === before.legacyFallback + 1, "retorno legado deveria ser contabilizado como fallback legado");
});

test("fallback legado so executa com permissao explicita fora do modo Gemini puro", async () => {
  await withInterpreterEnv({ BOT_INTERPRETER: "shadow", GEMINI_ACTION_PLAN_ENABLED: "true", BOT_ALLOW_LEGACY_ROLLBACK: "true" }, async () => {
    await withGeminiMock(() => ({
      intent: "PARTO",
      confidence: 0.9,
      riskScore: 0.1,
      fields: { animal_ref: "090", data: "hoje" },
      actions: [],
      missing_fields: [],
      warnings: [],
      should_confirm: true,
      response_hint: null
    }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      const parsed = finalParsed(result);
      assert(parsed?.tipo === "PARTO", `fallback explicito deveria preservar legado, recebido ${parsed?.tipo}`);
      assert(parsed.dados?.action_plan_used === false, "fallback legado nao deve marcar ActionPlan usado");
      assert(parsed.dados?.interpreter_final_usado === "legacy_intent_after_gemini", "fallback legado deveria ficar marcado");
    });
  });
});

test("mensagem nova em modo Gemini nao finaliza como local_parser", async () => {
  const text = "venda de leite 900";
  const plan = {
    action: "create",
    domain: "financeiro",
    confidence: 0.91,
    data: {
      tipo: "receita",
      valor: 900,
      categoria: "leite",
      descricao: "venda de leite",
      data: "hoje"
    },
    requiresConfirmation: true
  };

  await withInterpreterEnv({ BOT_INTERPRETER: "gemini", GEMINI_ACTION_PLAN_ENABLED: "true", BOT_ALLOW_LEGACY_ROLLBACK: "false" }, async () => {
    await withGeminiMock(() => clone(plan), async () => {
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({}),
        messageType: "new_action",
        hasPendingAction: false
      });
      const parsed = finalParsed(result);
      assert(parsed, "mensagem nova deveria gerar parsed via ActionPlan");
      assert(parsed.dados?.interpreter_final_usado !== "local_parser", "mensagem nova em modo Gemini nao pode finalizar como local_parser");
      assert(parsed.dados?.origem_parser !== "local_parser", "mensagem nova em modo Gemini nao pode ter origem local_parser");
      assert(parsed.dados?.action_plan_used === true, "ActionPlan deveria ser usado");
      assert(parsed.dados?.interpreter_final_usado === "action_plan", `interpreter final esperado action_plan, recebido ${parsed.dados?.interpreter_final_usado}`);
      assert(parsed.tipo === "RECEITA_VENDA", `venda de leite deveria virar receita, recebido ${parsed.tipo}`);
    });
  });
});

test("mensagem nova desconhecida em modo Gemini retorna clarify sem local_parser semantico", async () => {
  const text = "xablau sem contexto operacional";
  await withInterpreterEnv({ BOT_INTERPRETER: "gemini", GEMINI_ACTION_PLAN_ENABLED: "true", BOT_ALLOW_LEGACY_ROLLBACK: "false" }, async () => {
    await withGeminiMock(() => ({
      action: "clarify",
      confidence: 0.2,
      userQuestion: "Nao entendi esse pedido. Pode explicar com mais detalhes?",
      requiresConfirmation: false
    }), async () => {
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({}),
        messageType: "new_action",
        hasPendingAction: false
      });
      assert(result.kind === "clarify", `mensagem desconhecida deveria pedir esclarecimento, recebido ${result.kind}`);
      assert(result.reason === "action_plan_clarify", `motivo esperado action_plan_clarify, recebido ${result.reason}`);
      assert(result.debug?.interpreter_final_usado !== "local_parser", "clarify Gemini nao pode finalizar como local_parser");
      assert(result.debug?.origem_parser === "gemini_action_plan", "clarify deveria preservar origem ActionPlan");
      assert(!finalParsed(result), "clarify nao deveria retornar parsed legado");
    });
  });
});

test("Gemini-first prioriza ActionPlan financeiro racao 90 dias e nao estoque legado", async () => {
  const text = "quanto gastei com ração nos últimos 90 dias";
  const fixture = fixtureByName("query-financeiro-racao-90-dias");
  const before = actionStatsSnapshot();
  await withGeminiMock(() => clone(fixture.plan), async () => {
    const legacy = parseRanchoMessage(text);
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: legacy,
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({
        [TABLES.transacoesFinanceiras]: [
          { id: "racao-1", fazenda_id: ADMIN_OWNER.fazenda_id, tipo: "saida", valor: 1200, descricao: "compra de racao", categoria: "racao", data_transacao: "2026-05-10" }
        ]
      })
    });
    const parsed = finalParsed(result);
    const filters = parsed?.dados?.action_plan?.filters || [];
    assert(parsed?.dados?.action_plan_used === true, "ActionPlan deveria vencer");
    assert(parsed.dados?.action_plan_domain === "financeiro", "domain financeiro ausente");
    assert(parsed.tipo !== "CONSULTA_ESTOQUE" && parsed.tipo !== "CONSULTA_ESTOQUE_ITEM", `nao deveria virar estoque legado: ${parsed.tipo}`);
    assert(filters.some((filter) => filter.field === "descricao" && filter.op === "contains" && /ra[cç]ão|ra[cç]ao/i.test(filter.value)), "filtro racao ausente");
    assert(filters.some((filter) => filter.field === "data" && filter.op === "last_days" && filter.value === 90), "filtro 90 dias ausente");
    assert(parsed.dados?.interpreter_final_usado === "action_plan", "interpreter final deveria ser ActionPlan");
  });
  const after = actionStatsSnapshot();
  assert(after.actionPlanUsed === before.actionPlanUsed + 1, "ActionPlan deveria ser contabilizado");
  assert(after.legacyFallback === before.legacyFallback, "fallback legado nao deveria ser contabilizado");
});

test("Gemini-first responde vacas prenhas via ActionPlan reproducao", async () => {
  const text = "quais vacas tao prenhas?";
  const fixture = fixtureByName("query-vacas-prenhas");
  const before = actionStatsSnapshot();
  await withGeminiMock(() => clone(fixture.plan), async () => {
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({
        [TABLES.animais]: [
          { id: "animal-306", fazenda_id: ADMIN_OWNER.fazenda_id, brinco: "306", nome: "Estrela", categoria: "vaca", fase: "gestante", status: "ativo" }
        ],
        [TABLES.eventosAnimal]: [
          { id: "evt-306", fazenda_id: ADMIN_OWNER.fazenda_id, animal_id: "animal-306", tipo: "prenhez", data_evento: "2026-05-01", descricao: "prenhez confirmada" }
        ]
      })
    });
    const parsed = finalParsed(result);
    assert(parsed?.dados?.action_plan_used === true, "ActionPlan deveria vencer");
    assert(parsed.dados?.action_plan_domain === "reproducao", "domain reproducao ausente");
    assert(parsed.dados?.resultado?.tipo_reprodutivo === "prenhez", "filtro reprodutivo prenhez ausente");
    assert(parsed.dados?.action_plan_response?.includes("Vacas prenhas"), "resposta de prenhas ausente");
    assert(parsed.dados?.interpreter_final_usado === "action_plan", "interpreter final deveria ser ActionPlan");
  });
  const after = actionStatsSnapshot();
  assert(after.actionPlanUsed === before.actionPlanUsed + 1, "ActionPlan deveria ser contabilizado");
  assert(after.legacyFallback === before.legacyFallback, "fallback legado nao deveria ser contabilizado");
});

test("Gemini-first parto 306 com cria usa ActionPlan create sem sobrescrever pelo parser local", async () => {
  const text = "306 pariu fêmea código B-306 hoje";
  const fixture = fixtureByName("create-parto-306-femea-codigo");
  const before = actionStatsSnapshot();
  await withGeminiMock(() => clone(fixture.plan), async () => {
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({})
    });
    const parsed = finalParsed(result);
    assert(parsed?.tipo === "PARTO", `intent esperado PARTO, recebido ${parsed?.tipo}`);
    assert(parsed.dados?.action_plan_used === true, "ActionPlan deveria marcar uso");
    assert(parsed.dados?.origem_parser === "gemini_action_plan", "origem deveria ser ActionPlan");
    assert(parsed.dados?.interpreter_final_usado === "action_plan", "interpreter final deveria ser ActionPlan");
    assert(parsed.dados?.animal_codigo === "306", "animal 306 ausente");
    assert(parsed.dados?.cria_codigo === "B-306", "codigo da cria ausente");
    assert(parsed.dados?.cria_sexo === "femea", "sexo da cria ausente");
  });
  const after = actionStatsSnapshot();
  assert(after.actionPlanUsed === before.actionPlanUsed + 1, "ActionPlan deveria ser contabilizado");
  assert(after.legacyFallback === before.legacyFallback, "fallback legado nao deveria ser contabilizado");
});

test("Gemini-first 090 pariu usa ActionPlan create de reproducao", async () => {
  const text = "090 pariu";
  const plan = {
    action: "create",
    domain: "reproducao",
    confidence: 0.9,
    data: { animal_ref: "090", evento: "parto" },
    requiresConfirmation: true
  };
  await withGeminiMock(() => clone(plan), async () => {
    const result = await parseWithConfiguredInterpreter({
      text,
      localParsed: parseRanchoMessage(text),
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({})
    });
    const parsed = finalParsed(result);
    assert(parsed?.tipo === "PARTO", `090 pariu deveria virar PARTO via ActionPlan, recebido ${parsed?.tipo}`);
    assert(parsed.dados?.action_plan_used === true, "ActionPlan deveria vencer");
    assert(parsed.dados?.action_plan_domain === "reproducao", "domain reproducao ausente");
    assert(parsed.dados?.action_plan?.action === "create", "action create ausente");
    assert(parsed.dados?.evento_reprodutivo_tipo === "parto", "evento parto ausente");
    assert(parsed.dados?.animal_codigo === "090", "animal 090 ausente");
    assert(parsed.dados?.origem_parser === "gemini_action_plan", "nao deve parecer parser local");
  });
});

test("Gemini live JSON invalido nao retorna instabilidade", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "live",
    ALLOW_LIVE_GEMINI_TESTS: "true",
    GEMINI_API_KEY: "fake-test-key"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "{ invalid json" }] } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `JSON invalido deveria pedir clarify, recebido ${result.kind}`);
      assert(!String(result.message).includes("Estou com instabilidade"), "JSON invalido nao deve usar mensagem de instabilidade");
      assert(result.debug?.error_classification === "contract", "JSON invalido deveria ser erro de contrato");
    });
    resetGeminiRuntimeStats();
  });
});

test("Gemini live HTTP 503 retorna instabilidade diagnosticada", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "live",
    ALLOW_LIVE_GEMINI_TESTS: "true",
    GEMINI_API_KEY: "fake-test-key"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      error: { code: 503, message: "service unavailable", status: "UNAVAILABLE" }
    }), { status: 503, headers: { "Content-Type": "application/json" } }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `HTTP 503 deveria retornar clarify, recebido ${result.kind}`);
      assert(String(result.message).includes("Estou com instabilidade"), "HTTP 503 deve usar mensagem de instabilidade");
      assert(result.debug?.error_classification === "external_gemini", "HTTP 503 deveria ser falha externa Gemini");
      assert(result.debug?.responseStatus === 503, "status 503 ausente no debug");
      assert(result.debug?.gemini_status === 503, "gemini_status 503 ausente no debug");
    });
    resetGeminiRuntimeStats();
  });
});

test("Gemini live HTTP 429 retorna instabilidade diagnosticada", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "live",
    ALLOW_LIVE_GEMINI_TESTS: "true",
    GEMINI_API_KEY: "fake-test-key"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      error: { code: 429, message: "quota exceeded", status: "RESOURCE_EXHAUSTED" }
    }), { status: 429, headers: { "Content-Type": "application/json" } }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `HTTP 429 deveria retornar clarify, recebido ${result.kind}`);
      assert(String(result.message).includes("Estou com instabilidade"), "HTTP 429 deve usar mensagem de instabilidade");
      assert(result.debug?.error_classification === "external_gemini", "HTTP 429 deveria ser falha externa Gemini");
      assert(result.debug?.gemini_status === 429, "gemini_status 429 ausente no debug");
    });
    resetGeminiRuntimeStats();
  });
});

test("Gemini live HTTP 401 nao retorna instabilidade", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "live",
    ALLOW_LIVE_GEMINI_TESTS: "true",
    GEMINI_API_KEY: "fake-test-key"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      error: { code: 401, message: "invalid credentials", status: "UNAUTHENTICATED" }
    }), { status: 401, headers: { "Content-Type": "application/json" } }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `HTTP 401 deveria retornar clarify, recebido ${result.kind}`);
      assert(!String(result.message).includes("Estou com instabilidade"), "HTTP 401 nao deve usar mensagem de instabilidade");
      assert(result.debug?.error_classification === "configuration", "HTTP 401 deveria ser configuracao");
    });
    resetGeminiRuntimeStats();
  });
});

test("Gemini live API_KEY_INVALID retorna configuracao sem instabilidade", async () => {
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "live",
    ALLOW_LIVE_GEMINI_TESTS: "true",
    GEMINI_API_KEY: "fake-test-key"
  }, async () => {
    await withFetchMock(async () => new Response(JSON.stringify({
      error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "API_KEY_INVALID" }
    }), { status: 400, headers: { "Content-Type": "application/json" } }), async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `API_KEY_INVALID deveria retornar clarify, recebido ${result.kind}`);
      assert(!String(result.message).includes("Estou com instabilidade"), "API_KEY_INVALID nao deve usar mensagem de instabilidade");
      assert(String(result.message).toLowerCase().includes("interpretador"), "API_KEY_INVALID deveria pedir configuracao");
      assert(result.debug?.error_classification === "configuration", "API_KEY_INVALID deveria ser configuracao");
    });
    resetGeminiRuntimeStats();
  });
});

test("Gemini live usa x-goog-api-key sem Authorization", async () => {
  let seenUrl = "";
  let seenInit = null;
  await withInterpreterEnv({
    BOT_INTERPRETER: "gemini",
    GEMINI_MODE: "live",
    GEMINI_ACTION_PLAN_ENABLED: "true",
    ALLOW_LIVE_GEMINI_TESTS: "true",
    GEMINI_API_KEY: "AQ-fake-test-key"
  }, async () => {
    await withFetchMock(async (url, init) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(legacyMilkWithActionPlan({
          action: "create",
          domain: "reproducao",
          operation: "parto",
          confidence: 0.93,
          requiresConfirmation: true,
          data: { animal_ref: "090", evento: "parto" }
        })) }] } }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }, async () => {
      const text = "090 pariu";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "parsed", `ActionPlan valido deveria retornar parsed, recebido ${result.kind}`);
    });
    resetGeminiRuntimeStats();
  });

  assert(seenUrl.includes("generativelanguage.googleapis.com/v1beta/models/"), "endpoint generateContent incorreto");
  assert(seenUrl.endsWith(":generateContent"), "endpoint deveria usar generateContent");
  assert(seenInit?.headers?.["x-goog-api-key"] === "AQ-fake-test-key", "x-goog-api-key nao foi enviado");
  assert(!Object.prototype.hasOwnProperty.call(seenInit?.headers || {}, "Authorization"), "Authorization nao deve ser enviado para GEMINI_API_KEY");
  const body = JSON.parse(String(seenInit?.body || "{}"));
  assert(body.contents?.[0]?.parts?.[0]?.text?.includes("090 pariu"), "payload deveria enviar texto em contents.parts.text");
  assert(!Object.prototype.hasOwnProperty.call(body.contents?.[0] || {}, "role"), "payload nao deve enviar role no content");
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
        localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
        owner: ADMIN_OWNER,
        supabase: createActionPlanSupabase({})
      });
      assert(result.kind === "clarify", `ActionPlan invalido deveria pedir revisao, recebido ${result.kind}`);
      assert(!String(result.message).includes("Estou com instabilidade"), "ActionPlan invalido nao deve usar instabilidade");
      assert(result.debug?.error_classification === "validation", "ActionPlan invalido deveria retornar classificacao de validacao");
      assert(result.debug?.action_plan_validation_error, "ActionPlan invalido deveria retornar erro de validacao");
      assert(result.debug?.reason === result.debug?.action_plan_validation_error, "ActionPlan invalido deveria retornar motivo diagnostico consistente");
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
  const text = "xablau sem contexto operacional para fixture";
  const fixture = findGeminiMockFixture({ text });
  assert(!fixture, "entrada sem fixture nao deveria casar");

  const result = await parseWithConfiguredInterpreter({
    text,
    localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  assert(result.kind === "clarify", "sem fixture deveria retornar clarify, recebido " + result.kind);
  assert(result.reason === "mock_fixture_missing", "reason esperado mock_fixture_missing, recebido " + result.reason);
  assert(result.message.includes("resposta de teste"), "mensagem deveria orientar ambiente de teste");
  assertCleanVisibleText(result.message, "mensagem sem fixture");
});

test("Gemini-first usa fallback local seguro para mensagens basicas sem fixture", async () => {
  const cases = [
    {
      text: "adicionar entrada de mil reais",
      intent: "RECEITA_VENDA",
      valor: 1000,
      descricao: "receita via WhatsApp"
    },
    {
      text: "adicionar saida de mil reais",
      intent: "DESPESA",
      valor: 1000,
      descricao: "despesa via WhatsApp"
    },
    {
      text: "paguei mil reais de energia",
      intent: "DESPESA",
      valor: 1000,
      descricao: "energia"
    }
  ];

  for (const current of cases) {
    const fixture = findGeminiMockFixture({ text: current.text });
    assert(!fixture, `${current.text}: entrada sem fixture nao deveria casar`);

    const result = await parseWithConfiguredInterpreter({
      text: current.text,
      localParsed: parseRanchoMessage(current.text),
      owner: ADMIN_OWNER,
      supabase: createActionPlanSupabase({})
    });
    const parsed = finalParsed(result);
    assert(result.kind === "local", `${current.text}: esperado fallback local seguro, recebido ${result.kind}`);
    assert(parsed?.tipo === current.intent, `${current.text}: intent esperado ${current.intent}, recebido ${parsed?.tipo}`);
    assert(Number(parsed.dados?.valor) === current.valor, `${current.text}: valor esperado ${current.valor}, recebido ${parsed.dados?.valor}`);
    assert(String(parsed.dados?.descricao || "") === current.descricao, `${current.text}: descricao esperada ${current.descricao}, recebida ${parsed.dados?.descricao}`);
    assert(parsed.dados?.interpreter_final_usado === "legacy_semantic_fallback", `${current.text}: fallback seguro nao marcado`);
    assert(parsed.dados?.action_plan_used === false, `${current.text}: nao deveria marcar ActionPlan usado`);
    assert(parsed.perguntas_faltantes.length === 0, `${current.text}: nao deveria ter pendencias`);
  }

  const deathText = "morreu a 002";
  const deathResult = await parseWithConfiguredInterpreter({
    text: deathText,
    localParsed: parseRanchoMessage(deathText),
    owner: ADMIN_OWNER,
    supabase: createActionPlanSupabase({})
  });
  const deathParsed = finalParsed(deathResult);
  assert(deathResult.kind === "local", `${deathText}: esperado fallback local seguro, recebido ${deathResult.kind}`);
  assert(deathParsed?.tipo === "MORTE", `${deathText}: intent esperado MORTE, recebido ${deathParsed?.tipo}`);
  assert(deathParsed.dados?.animal_codigo === "002", `${deathText}: animal esperado 002, recebido ${deathParsed.dados?.animal_codigo}`);
  assert(deathParsed.dados?.interpreter_final_usado === "legacy_semantic_fallback", `${deathText}: fallback seguro nao marcado`);
  assert(deathParsed.dados?.action_plan_used === false, `${deathText}: nao deveria marcar ActionPlan usado`);
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
