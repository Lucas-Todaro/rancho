const fs = require("fs");
const path = require("path");
const Module = require("module");
const nodeCrypto = require("crypto");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
if (!process.env.BOT_INTERPRETER) process.env.BOT_INTERPRETER = "legacy_parser";
if (process.env.BOT_INTERPRETER === "gemini" && !process.env.BOT_GEMINI_MOCK && !process.env.GEMINI_API_KEY) {
  process.env.BOT_GEMINI_MOCK = "legacy_parser";
}
const BOT_TEST_REPORT_JSON = path.join(root, "bot-test-report.json");
const BOT_TEST_REPORT_MD = path.join(root, "bot-test-report.md");
const BOT_EVALUATION_REPORT_JSON = path.join(root, "bot-evaluation-report.json");
const BOT_FINAL_REGRESSION_REPORT_MD = path.join(root, "bot-final-regression-report.md");
const BOT_TEST_VERBOSE = process.env.BOT_TEST_VERBOSE === "1";
let activeBotTestSupabase = null;

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

const originalLoad = Module._load;
Module._load = function loadWithBotMocks(request, parent, isMain) {
  if (request === "@/lib/supabase/admin") {
    return {
      getSupabaseAdmin: () => activeBotTestSupabase
    };
  }

  return originalLoad.call(this, request, parent, isMain);
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
  mergeRanchoMessageData,
  parseRanchoMessage,
  refreshRanchoMessage
} = require("../src/lib/whatsapp/nlp.ts");
const {
  normalizeCatalogText,
  resolveAnimalIdentifier,
  resolveStockItem
} = require("../src/lib/whatsapp/catalog.ts");
const { normalizeWhatsappNumber } = require("../src/lib/phone.ts");
const {
  animalBlockedMessage,
  isAnimalInactiveForBot
} = require("../src/lib/whatsapp/animal-status.ts");
const {
  maskSensitivePhone,
  redactSensitiveText,
  safeErrorText,
  sanitizeWhatsappMessageText
} = require("../src/lib/security.ts");
const { processWhatsappMessage } = require("../src/services/whatsapp/twilio.ts");

const context = {
  fs,
  path,
  nodeCrypto,
  root,
  BOT_TEST_REPORT_JSON,
  BOT_TEST_REPORT_MD,
  BOT_EVALUATION_REPORT_JSON,
  BOT_FINAL_REGRESSION_REPORT_MD,
  BOT_TEST_VERBOSE,
  mergeRanchoMessageData,
  parseRanchoMessage,
  refreshRanchoMessage,
  normalizeCatalogText,
  resolveAnimalIdentifier,
  resolveStockItem,
  normalizeWhatsappNumber,
  animalBlockedMessage,
  isAnimalInactiveForBot,
  maskSensitivePhone,
  redactSensitiveText,
  safeErrorText,
  sanitizeWhatsappMessageText,
  processWhatsappMessage
};

Object.defineProperty(context, "activeBotTestSupabase", {
  get() {
    return activeBotTestSupabase;
  },
  set(value) {
    activeBotTestSupabase = value;
  },
  enumerable: true
});

function loadBotTestSection(name) {
  Object.assign(context, require("./bot-test/" + name + ".cjs")(context));
}

[
  "mocks",
  "assertions",
  "cases-production",
  "cases-finance",
  "cases-stock",
  "cases-queries",
  "cases-health",
  "cases-genealogy",
  "cases-employee",
  "cases-session",
  "cases-animal-register",
  "cases-herd-lot",
  "cases-health-framework",
  "cases-stock-framework",
  "cases-finance-framework",
  "cases-employee-framework",
  "cases-genealogy-framework",
  "cases-tabular-import",
  "cases-regressions",
  "runner",
  "report"
].forEach(loadBotTestSection);

async function main() {
  const conversationResults = [];
  for (let index = 0; index < context.botConversationTests.length; index += 1) {
    conversationResults.push(await context.runConversationTest(context.botConversationTests[index], context.parserResults.length + context.animalResults.length + context.securityUtilityResults.length + index + 1));
  }

  const evaluationResults = [];
  const evaluationBaseIndex = context.parserResults.length + context.animalResults.length + context.securityUtilityResults.length + conversationResults.length;
  for (let index = 0; index < context.structuredBotEvaluationCases.length; index += 1) {
    evaluationResults.push(await context.runStructuredEvaluationCase(context.structuredBotEvaluationCases[index], evaluationBaseIndex + index + 1));
  }

  const results = [...context.parserResults, ...context.animalResults, ...context.securityUtilityResults, ...conversationResults, ...evaluationResults];
  const failed = results.filter((result) => !result.ok);
  const passed = results.length - failed.length;
  const successRate = results.length ? Number(((passed / results.length) * 100).toFixed(2)) : 0;
  const failuresByModule = context.failureSummaryByModule(failed);

  context.writeBotTestReports({
    results,
    failed,
    passed,
    successRate,
    parserAndStatus: context.parserResults.length + context.animalResults.length,
    conversations: conversationResults.length,
    frameworkCases: evaluationResults.length,
    evaluationResults
  });

  console.log("Bot test offline Rancho");
  console.log(`Usuarios mockados: ${context.mockUsers.length}`);
  console.log(`Parser/status: ${context.parserResults.length + context.animalResults.length}`);
  console.log(`Seguranca/logs: ${context.securityUtilityResults.length}`);
  console.log(`Conversas reais simuladas: ${conversationResults.length}`);
  console.log(`Casos estruturados de framework: ${evaluationResults.length}`);
  console.log("Motor real: processWhatsappMessage em modoTeste=true, salvarReal=false");
  console.log("WhatsApp real: nao envia mensagens");
  console.log("Persistencia: Supabase mockado local; dry-run bloqueia escritas de negocio");
  console.log(`Total: ${results.length}`);
  console.log(`Aprovados: ${passed}`);
  console.log(`Falhos: ${failed.length}`);
  console.log(`Taxa de sucesso: ${successRate}%`);
  console.log(`Falhas por modulo: ${Object.keys(failuresByModule).length ? JSON.stringify(failuresByModule) : "nenhuma"}`);
  console.log(`Relatorio JSON: ${BOT_TEST_REPORT_JSON}`);
  console.log(`Relatorio Markdown: ${BOT_TEST_REPORT_MD}`);
  console.log(`Relatorio final JSON: ${BOT_EVALUATION_REPORT_JSON}`);
  console.log(`Relatorio final Markdown: ${BOT_FINAL_REGRESSION_REPORT_MD}`);

  for (const result of failed) {
    console.log("\n--- Falha", result.index, "---");
    console.log("Frase:", result.test.phrase || result.test.name);
    console.log("Esperado:", JSON.stringify(result.test.expected || result.test.messages?.map((step) => step.expected)));
    if (result.steps) {
      console.log("Recebido:", JSON.stringify(result.steps.map((step) => ({
        mensagem: step.text,
        resposta: step.result.respostaTexto,
        intent: step.result.intencaoDetectada,
        estadoAnterior: step.result.estadoAnterior,
        estadoNovo: step.result.estadoNovo,
        camposFaltantes: step.result.camposFaltantes,
        dados: step.result.dadosExtraidos,
        confirmado: step.result.eventoConfirmado,
        erro: step.result.erro
      })), null, 2));
      console.log("Escritas de negocio:", JSON.stringify(result.businessWrites || []));
      console.log("Motivos:", result.failures.join("; "));
      continue;
    }
    console.log("Recebido:", result.parsed ? JSON.stringify({
      tipo: result.parsed.tipo,
      dados: result.parsed.dados,
      perguntas_faltantes: result.parsed.perguntas_faltantes,
      resumo: result.parsed.resumo,
      response: result.response
    }) : "sem parser");
    console.log("Motivos:", result.failures.join("; "));
  }

  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error("Falha ao rodar test:bot", error);
  process.exit(1);
});
