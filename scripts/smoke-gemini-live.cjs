const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

function loadDotEnvLocal() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnvLocal();
process.env.BOT_INTERPRETER = process.env.BOT_INTERPRETER || "gemini";
process.env.GEMINI_MODE = "live";
process.env.GEMINI_ACTION_PLAN_ENABLED = "true";
process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED = "true";
process.env.ALLOW_LIVE_GEMINI_TESTS = "true";

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

const { interpretWithGemini } = require("../src/lib/whatsapp/gemini/interpreter.ts");
const { executeActionPlan } = require("../src/lib/whatsapp/action-plan/execute-action-plan.ts");
const {
  geminiRuntimeReportLines,
  resetGeminiRuntimeStats
} = require("../src/lib/whatsapp/gemini/runtime.ts");

const messages = [
  "090 pariu",
  "quais vacas tao prenhas?",
  "relatório financeiro dos últimos 6 meses",
  "comprei 10 sacos de ração por 500 reais",
  "177:PROTOCOLO\n094:PROTOCOLO\n053:INSEMINACAO\n249:PROTOCOLO\n205:RETESTE"
];

function compactParsed(parsed) {
  return {
    intent: parsed?.tipo || null,
    action_plan_used: parsed?.dados?.action_plan_used || false,
    action_plan_domain: parsed?.dados?.action_plan_domain || null,
    interpreter_final_usado: parsed?.dados?.interpreter_final_usado || null,
    origem_parser: parsed?.dados?.origem_parser || null,
    total_linhas: parsed?.dados?.total_linhas || null,
    dados: {
      animal_codigo: parsed?.dados?.animal_codigo || null,
      evento_reprodutivo_tipo: parsed?.dados?.evento_reprodutivo_tipo || null,
      item_nome: parsed?.dados?.item_nome || null,
      quantidade: parsed?.dados?.quantidade || null,
      unidade: parsed?.dados?.unidade || null,
      valor: parsed?.dados?.valor || null
    },
    camposFaltantes: parsed?.perguntas_faltantes || []
  };
}

(async () => {
  resetGeminiRuntimeStats();
  console.log("Smoke Gemini live Rancho");
  console.log(`GEMINI_MODE=${process.env.GEMINI_MODE}`);
  console.log(`GEMINI_MODEL=${process.env.GEMINI_MODEL || "default"}`);
  console.log(`GEMINI_API_KEY presente=${Boolean(process.env.GEMINI_API_KEY)} tamanho=${(process.env.GEMINI_API_KEY || "").length}`);

  let failed = false;
  for (const text of messages) {
    const result = await interpretWithGemini({
      text,
      currentDate: new Date().toISOString().slice(0, 10),
      timezone: "America/Sao_Paulo"
    });
    console.log("\nMensagem:", text);
    console.log("Interpretacao:", result.ok ? "ok" : result.reason);
    if (!result.ok) {
      failed = true;
      console.log("Erro:", result.message);
      continue;
    }
    const plan = result.interpretation.action_plan;
    console.log("ActionPlan:", JSON.stringify({
      action: plan?.action || null,
      domain: plan && "domain" in plan ? plan.domain : null,
      confidence: result.interpretation.confidence,
      requiresConfirmation: plan?.requiresConfirmation ?? result.interpretation.should_confirm,
      data: plan?.data || null,
      filters: plan?.filters || null
    }, null, 2));

    if (!plan) {
      failed = true;
      console.log("Falha: resposta sem ActionPlan.");
      continue;
    }

    const execution = await executeActionPlan({
      plan,
      text,
      owner: { fazenda_id: "smoke-fazenda", usuario_id: "smoke-user" },
      supabase: null,
      currentDate: new Date().toISOString().slice(0, 10)
    });
    console.log("Executor:", execution.ok ? "ok" : execution.reason);
    if (execution.ok) console.log("Parsed:", JSON.stringify(compactParsed(execution.parsed), null, 2));
    else console.log("Mensagem executor:", execution.message);
  }

  console.log("");
  for (const line of geminiRuntimeReportLines()) console.log(line);
  if (failed) process.exitCode = 1;
})().catch((error) => {
  console.error("Falha no smoke Gemini live", {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error)
  });
  process.exitCode = 1;
});
