const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const nodeCrypto = require("crypto");

const root = path.resolve(__dirname, "..");
const reportsDir = path.join(root, "reports");
const reportJsonPath = path.join(reportsDir, "bot-fallback-audit.json");
const reportMdPath = path.join(reportsDir, "bot-fallback-audit-summary.md");

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
Module._load = function loadWithAuditMocks(request, parent, isMain) {
  if (request === "crypto") return nodeCrypto;
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
  parseRanchoMessage,
  shouldUseGeminiFallback
} = require("../src/lib/whatsapp/nlp.ts");
const { buildFallbackAuditCases, GROUP_COUNTS, GROUPS } = require("./bot-test/fallback-audit-cases.cjs");
const { summarizeFallbackAudit, markdownForFallbackAudit } = require("./bot-test/fallback-audit-report.cjs");

const FALLBACK_THRESHOLD = 0.7;
const CRITICAL_FLAGS = new Set([
  "use_gemini_fallback",
  "suspicious_animal_ref",
  "suspicious_item_name",
  "intent_keyword_conflict",
  "physical_sale_without_price",
  "command_word_as_name",
  "parsed_number_may_be_time",
  "compound_message",
  "multiple_intents_detected",
  "conflicting_intents"
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parsedText(parsed) {
  return normalize(JSON.stringify({
    tipo: parsed.tipo,
    dados: parsed.dados,
    resumo: parsed.resumo,
    perguntas_faltantes: parsed.perguntas_faltantes
  }));
}

function hasPhysicalQuantity(text) {
  return /\b\d+(?:[.,]\d+)?\s*(?:kg|quilo|quilos|l|litro|litros|saco|sacos|dose|doses|frasco|frascos)\b/i.test(text);
}

function physicalQuantityValue(text) {
  const match = String(text || "").match(/\b(\d+(?:[.,]\d+)?)\s*(?:kg|quilo|quilos|l|litro|litros|saco|sacos|dose|doses|frasco|frascos)\b/i);
  return match ? Number(match[1].replace(",", ".")) : null;
}

function detectMustNotHappen(caseItem, parsed) {
  const errors = [];
  const text = normalize(caseItem.mensagem);
  const out = parsedText(parsed);
  const dados = parsed.dados || {};
  const quantity = physicalQuantityValue(caseItem.mensagem);

  if (caseItem.expectedMustNotHappen.includes("finance_value_equals_physical_quantity")) {
    if (parsed.tipo === "RECEITA_VENDA" && quantity !== null && Number(dados.valor) === quantity && hasPhysicalQuantity(caseItem.mensagem)) {
      errors.push("venda fisica virou receita com valor igual a quantidade");
    }
  }

  if (caseItem.expectedMustNotHappen.includes("command_word_as_name")) {
    if (/\b(nome|animal_codigo|animal_referencia_nao_encontrada)\b/.test(out) && /"?(novo|nova|cadastrar|cadastro|animal)"?/.test(out)) {
      errors.push("palavra operacional apareceu como nome/referencia de animal");
    }
  }

  if (caseItem.expectedMustNotHappen.includes("health_as_animal_register") && parsed.tipo === "CADASTRO_ANIMAL") {
    errors.push("evento sanitario virou cadastro de animal");
  }

  if (caseItem.expectedMustNotHappen.includes("correction_or_cancellation") && ["DESCONHECIDO"].includes(parsed.tipo) && /\bnao comeu|mancando|doente|febre\b/.test(text)) {
    errors.push("evento sanitario pareceu correcao/cancelamento/desconhecido");
  }

  if (caseItem.expectedMustNotHappen.includes("compound_single_without_fallback")) {
    const compound = /\s+e\s+|,|;|\n/.test(text);
    if (compound && parsed.tipo !== "LOTE_REGISTROS" && !(parsed.flags || []).includes("use_gemini_fallback")) {
      errors.push("frase composta virou acao unica sem fallback");
    }
  }

  if (caseItem.expectedMustNotHappen.includes("silent_dangerous_parse")) {
    if (/\bvendi\b/.test(text) && parsed.tipo === "ESTOQUE_ENTRADA") errors.push("venda virou entrada de estoque");
    if (/\bcomprei\b/.test(text) && parsed.tipo === "ESTOQUE_SAIDA") errors.push("compra virou saida de estoque");
    if (/\bquanto|resumo|relatorio|lista\b/.test(text) && !parsed.tipo.startsWith("CONSULTA") && parsed.tipo !== "AJUDA") errors.push("consulta virou registro operacional");
    if (/\b10h\b/.test(text) && /"animal_codigo":"?10h/.test(out)) errors.push("horario virou animal");
    if (/\bcurral\b/.test(text) && /"animal_codigo":"?curral/.test(out)) errors.push("local virou animal");
    if (/\bvaca 2 deu leite\b/.test(text) && Number(dados.litros) === 2) errors.push("numero do animal virou litros");
  }

  for (const pattern of caseItem.forbiddenPatterns || []) {
    if (out.includes(normalize(pattern))) errors.push(`padrao proibido encontrado: ${pattern}`);
  }

  return errors;
}

function evaluateCase(caseItem) {
  const parsed = parseRanchoMessage(caseItem.mensagem);
  const fallbackCalled = shouldUseGeminiFallback(parsed, FALLBACK_THRESHOLD);
  const mockGemini = fallbackCalled
    ? { called: true, reason: "mocked_would_call_gemini", saved: false }
    : { called: false, reason: "local_parser_accepted", saved: false };
  const flags = parsed.flags || [];
  const expectedIntentAnyOf = caseItem.expectedIntentAnyOf || [];
  const intentWrong = expectedIntentAnyOf.length > 0 && !expectedIntentAnyOf.includes(parsed.tipo);
  const falseNegativeFallback = caseItem.expectedShouldCallGemini === true && !fallbackCalled;
  const falsePositiveFallback = caseItem.expectedShouldCallGemini === false && fallbackCalled;
  const missingWarnings = (caseItem.expectedCriticalWarnings || []).filter((flag) => !flags.includes(flag));
  const mustNotHappenErrors = detectMustNotHappen(caseItem, parsed);
  const criticalFlags = flags.filter((flag) => CRITICAL_FLAGS.has(flag));
  const errors = [];

  if (intentWrong) errors.push(`intent esperada ${expectedIntentAnyOf.join(" ou ")}, recebida ${parsed.tipo}`);
  if (falseNegativeFallback) errors.push("falso negativo de fallback");
  if (falsePositiveFallback) errors.push("falso positivo de fallback");
  if (missingWarnings.length) errors.push(`warnings ausentes: ${missingWarnings.join(", ")}`);
  errors.push(...mustNotHappenErrors);

  const critical = falseNegativeFallback
    || (intentWrong && !fallbackCalled)
    || mustNotHappenErrors.length > 0
    || (caseItem.expectedShouldCallGemini && !criticalFlags.length);

  return {
    ...caseItem,
    parserIntent: parsed.tipo,
    confidence: parsed.confianca,
    riskScore: parsed.riskScore ?? 0,
    warnings: flags,
    criticalWarnings: criticalFlags,
    fallbackCalled,
    fallbackReason: fallbackCalled
      ? (flags.includes("use_gemini_fallback") ? "use_gemini_fallback" : "threshold_or_risk")
      : "not_called",
    expectedShouldCallGemini: caseItem.expectedShouldCallGemini,
    mockGemini,
    intentWrong,
    falseNegativeFallback,
    falsePositiveFallback,
    missingWarnings,
    critical,
    passed: errors.length === 0,
    errors,
    parserResult: parsed
  };
}

function printSummary(summary) {
  console.log("Fallback Audit - Bot WhatsApp");
  console.log("");
  console.log(`Total de casos: ${summary.total}`);
  console.log(`Passaram: ${summary.passed}`);
  console.log(`Falharam: ${summary.failed}`);
  console.log(`Acuracia: ${summary.accuracy}%`);
  console.log("");
  console.log(`Gemini esperado: ${summary.expectedGemini}`);
  console.log(`Gemini chamado: ${summary.calledGemini}`);
  console.log(`Falsos negativos de fallback: ${summary.falseNegativeFallback}`);
  console.log(`Falsos positivos de fallback: ${summary.falsePositiveFallback}`);
  console.log("");
  console.log("Erros por grupo:");
  const groups = Object.entries(summary.failuresByGroup);
  if (!groups.length) console.log("- nenhum");
  for (const [group, count] of groups) console.log(`- ${group}: ${count}`);
  console.log("");
  console.log("Erros criticos:");
  if (!summary.topCritical.length) console.log("- nenhum");
  summary.topCritical.slice(0, 10).forEach((result, index) => {
    console.log(`${index + 1}. [${result.id}] "${result.mensagem}"`);
    console.log(`   Esperado fallback=${result.expectedShouldCallGemini}; Atual ${result.parserIntent}, confidence=${result.confidence}, riskScore=${result.riskScore}, fallback=${result.fallbackCalled}`);
    console.log(`   Problema: ${result.errors.join("; ")}`);
  });
  console.log("");
  console.log(`Relatorio JSON: ${reportJsonPath}`);
  console.log(`Relatorio Markdown: ${reportMdPath}`);
}

function main() {
  const cases = buildFallbackAuditCases();
  const groupCounts = cases.reduce((acc, item) => {
    acc[`${item.grupo} - ${GROUPS[item.grupo]}`] = (acc[`${item.grupo} - ${GROUPS[item.grupo]}`] || 0) + 1;
    return acc;
  }, {});

  const expectedCounts = Object.values(GROUP_COUNTS).reduce((sum, count) => sum + count, 0);
  if (cases.length !== 500 || expectedCounts !== 500) {
    throw new Error(`Auditoria precisa ter exatamente 500 casos. cases=${cases.length}; counts=${expectedCounts}`);
  }

  const results = cases.map(evaluateCase);
  const summary = summarizeFallbackAudit(results, groupCounts);
  const report = {
    generatedAt: new Date().toISOString(),
    command: "npm run test:bot:fallback-audit",
    notes: [
      "Auditoria offline: Gemini real nao e chamado.",
      "fallbackCalled indica que a regra local chamaria o fallback Gemini.",
      "Os grupos do prompt somavam 625; esta auditoria usa 80% proporcional para fechar exatamente 500."
    ],
    threshold: {
      confidenceMinimum: FALLBACK_THRESHOLD,
      riskMaximum: 0.45
    },
    summary,
    cases: results
  };

  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportMdPath, markdownForFallbackAudit(summary, results));
  printSummary(summary);
}

try {
  main();
} catch (error) {
  console.error("Falha ao rodar fallback audit", error);
  process.exit(1);
}
