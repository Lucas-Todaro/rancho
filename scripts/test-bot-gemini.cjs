const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

process.env.BOT_INTERPRETER = "gemini";
process.env.BOT_ALLOW_LEGACY_ROLLBACK = "false";
process.env.RANCHO_BOT_TEST = "1";
if (!process.env.GEMINI_MODE) process.env.GEMINI_MODE = "mock";
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

const { parseRanchoMessage } = require("../src/lib/whatsapp/nlp.ts");
const { parseWithConfiguredInterpreter } = require("../src/services/whatsapp/interpreter/gemini-primary.ts");
const { interpretWithGemini } = require("../src/lib/whatsapp/gemini/interpreter.ts");
const { buildGeminiSystemPrompt } = require("../src/lib/whatsapp/gemini/system-prompt.ts");
const { validateInterpretedAction } = require("../src/lib/whatsapp/gemini/validator.ts");
const { domainFromUserChoice } = require("../src/lib/whatsapp/nlp-core/tabular-domain-router.ts");
const { detectConversationAct } = require("../src/services/whatsapp/conversation-act.ts");
const {
  geminiRuntimeReportLines,
  geminiRuntimeStats,
  resetGeminiRuntimeStats
} = require("../src/lib/whatsapp/gemini/runtime.ts");
resetGeminiRuntimeStats();

const ADMIN_OWNER = {
  papel_bot: "admin",
  telefone_e164: "5583999999999",
  fazenda_id: "mock-fazenda-1",
  usuario_id: "user-admin",
  whatsapp_usuario_id: "wa-admin",
  nome_exibicao: "Dono"
};

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fixture(intent, fields = {}, options = {}) {
  return {
    intent,
    confidence: options.confidence ?? 0.9,
    riskScore: options.riskScore ?? 0.1,
    fields,
    actions: options.actions || [],
    missing_fields: options.missing_fields || [],
    warnings: options.warnings || [],
    should_confirm: options.should_confirm ?? !intent.startsWith("CONSULTA"),
    response_hint: options.response_hint || null,
    ...(Object.prototype.hasOwnProperty.call(options, "table_import") ? { table_import: options.table_import } : {})
  };
}

const geminiTableFinanceValid = ["descricao;tipo;valor;data", "energia;despesa;350;01/06/2026"].join("\n");
const geminiTableStockInventedField = ["item;entrada;unidade;valor;coluna extra", "Racao de boi;10;kg;100;ignorar"].join("\n");
const geminiTableLowConfidence = ["nome;data;observacao", "Algo;01/06/2026;teste"].join("\n");
const geminiTableInvalidDomain = ["abc;def", "x;y"].join("\n");

const fixtures = new Map([
  ["vaca 1 deu 15 litros", fixture("PRODUCAO_LEITE", { animal_ref: "1", litros: 15, data: "hoje" })],
  ["vaca 1 deu leite", fixture("PRODUCAO_LEITE", { animal_ref: "1" }, { missing_fields: ["litros"], should_confirm: false })],
  ["vaca 1 deu 15 e a 2 20", fixture("LOTE_ACOES", {}, {
    actions: [
      { intent: "PRODUCAO_LEITE", fields: { animal_ref: "1", litros: 15 }, should_confirm: true },
      { intent: "PRODUCAO_LEITE", fields: { animal_ref: "2", litros: 20 }, should_confirm: true }
    ]
  })],
  ["mimosa nao comeu e vaca 2 deu 15 litros", fixture("LOTE_ACOES", {}, {
    actions: [
      { intent: "OBSERVACAO_ANIMAL", fields: { animal_ref: "Mimosa", observacoes: "nao comeu" }, should_confirm: true },
      { intent: "PRODUCAO_LEITE", fields: { animal_ref: "2", litros: 15 }, should_confirm: true }
    ]
  })],
  ["comprei 10kg de racao por 300 reais", fixture("COMPRA_ESTOQUE_FINANCEIRO", { item: "racao", quantidade: 10, unidade: "kg", valor_total: 300 })],
  ["comprei 10kg de racao", fixture("COMPRA_ESTOQUE_FINANCEIRO", { item: "racao", quantidade: 10, unidade: "kg" }, { missing_fields: ["valor_total"], should_confirm: false })],
  ["usei 20kg de racao", fixture("ESTOQUE_SAIDA", { item: "racao", quantidade: 20, unidade: "kg" })],
  ["vendi 40l de leite", fixture("VENDA", { item: "leite", quantidade: 40, unidade: "L" }, { missing_fields: ["valor_total"], should_confirm: false })],
  ["vendi 40l de leite por 120 reais", fixture("VENDA", { item: "leite", quantidade: 40, unidade: "L", valor_total: 120 })],
  ["paguei 300 de energia", fixture("FINANCEIRO_DESPESA", { valor: 300, descricao: "energia", categoria: "energia" })],
  ["com o que eu gastei hoje?", fixture("CONSULTA_FINANCEIRO_DESPESAS", { data: "hoje" }, { should_confirm: false })],
  ["da o relatorio da producao de hoje", fixture("CONSULTA_PRODUCAO_HOJE", {}, { should_confirm: false })],
  ["dados das vacas", fixture("CONSULTA_ANIMAL", { animal_ref: "vacas" }, { should_confirm: false })],
  ["lista das vacas", fixture("CONSULTA_REBANHO", { categoria: "vaca", modo: "lista" }, { should_confirm: false })],
  ["partos recentes", fixture("DESCONHECIDO", {}, { confidence: 0.4, should_confirm: false })],
  ["relatorio dos partos recentes", fixture("CONSULTA_ANIMAL", { animal_ref: "partos recentes" }, { should_confirm: false })],
  ["quais vacas pariram recentemente?", fixture("CONSULTA_ANIMAL", { animal_ref: "vacas" }, { should_confirm: false })],
  ["partos dos ultimos 30 dias", fixture("DESCONHECIDO", {}, { confidence: 0.4, should_confirm: false })],
  ["excluir todo o rebanho", fixture("DESCONHECIDO", {}, { confidence: 0.4, should_confirm: false })],
  ["deletar todas as vacas", fixture("CONSULTA_REBANHO", { categoria: "vaca" }, { should_confirm: false })],
  ["novo animal", fixture("CADASTRO_ANIMAL", {}, { missing_fields: ["codigo", "categoria"], should_confirm: false })],
  ["cadastrar vaca mimosa brinco 021 peso 400kg", fixture("CADASTRO_ANIMAL", { codigo: "021", categoria: "vaca", nome: "Mimosa", peso: 400 })],
  ["001;vaca 002;boi", fixture("CADASTRO_ANIMAL_EM_MASSA", {
    linhas: [
      { codigo: "001", categoria: "vaca" },
      { codigo: "002", categoria: "boi" }
    ]
  })],
  ["mimosa foi inseminada e lindona pariu", fixture("LOTE_ACOES", {}, {
    actions: [
      { intent: "INSEMINACAO", fields: { animal_ref: "Mimosa", data: "hoje" }, should_confirm: true },
      { intent: "PARTO", fields: { animal_ref: "Lindona", data: "hoje" }, should_confirm: true }
    ]
  })],
  ["001 pariu uma femea hoje", fixture("PARTO", { animal_ref: "001", data: "hoje", cria_sexo: "femea", cria_categoria: "bezerra" }, { missing_fields: ["cria_codigo"], should_confirm: false })],
  ["001 pariu uma femea codigo c-001 hoje", fixture("PARTO", { animal_ref: "001", data: "hoje", cria_sexo: "femea", cria_categoria: "bezerra", cria_codigo: "C-001" })],
  ["001 pariu macho hoje pai t-001", fixture("PARTO", { animal_ref: "001", data: "hoje", cria_sexo: "macho", cria_categoria: "bezerro", pai_ref: "T-001" }, { missing_fields: ["cria_codigo"], should_confirm: false })],
  ["vaca 001 entrou em pre-parto", fixture("PRE_PARTO", { animal_ref: "001", data: "hoje" })],
  ["lindona nao comeu hoje", fixture("OBSERVACAO_ANIMAL", { animal_ref: "Lindona", observacoes: "nao comeu", data: "hoje" })],
  ["paguei salario do bruno 2500", fixture("PAGAMENTO_FUNCIONARIO", { funcionario: "Bruno", valor: 2500, pagamento_tipo: "salario" })],
  ["nao era 15 litros era 18", fixture("CORRECAO", { campo: "litros", valor_correto: 18 }, { should_confirm: false })],
  ["cancela o ultimo registro", fixture("CANCELAMENTO", { referencia: "ultimo registro" }, { should_confirm: false })],
  ["quanto tem de leite cru no estoque?", fixture("CONSULTA_ESTOQUE_ITEM", { item: "Leite Cru" }, { should_confirm: false })],
  ["como esta a vaca 19?", fixture("CONSULTA_ANIMAL", { animal_ref: "19" }, { should_confirm: false })],
  ["codigo animal status tipo data observacoes 001 inseminacao 01.01.26 001 pre-parto 20.09.26 001 pariu 10.10.26", fixture("LOTE_ACOES", {}, {
    actions: [
      { intent: "INSEMINACAO", fields: { animal_ref: "001", data: "2026-01-01" }, should_confirm: true },
      { intent: "PRE_PARTO", fields: { animal_ref: "001", data: "2026-09-20" }, should_confirm: true },
      { intent: "PARTO", fields: { animal_ref: "001", data: "2026-10-10" }, should_confirm: true }
    ]
  })],
  [normalize(geminiTableFinanceValid), fixture("DESCONHECIDO", {}, {
    confidence: 0.82,
    should_confirm: false,
    table_import: {
      domain: "FINANCEIRO",
      confidence: 0.91,
      column_mapping: { descricao: "descricao", tipo: "tipo", valor: "valor", data: "data" },
      normalized_rows: [{ descricao: "energia", tipo: "despesa", valor: 350, data: "2026-06-01" }],
      unknown_columns: [],
      warnings: [],
      errors: [],
      ambiguous_domains: [],
      needs_manual_choice: false
    }
  })],
  [normalize(geminiTableStockInventedField), fixture("DESCONHECIDO", {}, {
    confidence: 0.84,
    should_confirm: false,
    table_import: {
      domain: "ESTOQUE",
      confidence: 0.9,
      column_mapping: { item: "item", entrada: "quantidade", unidade: "unidade", valor: "valor_total", "coluna extra": "campo_inventado" },
      normalized_rows: [{ item: "Racao de boi", quantidade: 10, unidade: "kg", valor_total: 100, campo_inventado: "ignorar" }],
      unknown_columns: [],
      warnings: [],
      errors: [],
      ambiguous_domains: [],
      needs_manual_choice: false
    }
  })],
  [normalize(geminiTableLowConfidence), fixture("DESCONHECIDO", {}, {
    confidence: 0.55,
    should_confirm: false,
    table_import: {
      domain: "OBSERVACOES",
      confidence: 0.42,
      column_mapping: { nome: "entidade_ref", data: "data", observacao: "observacao" },
      normalized_rows: [{ entidade_ref: "Algo", data: "2026-06-01", observacao: "teste" }],
      unknown_columns: [],
      warnings: ["baixa confianca"],
      errors: [],
      ambiguous_domains: ["OBSERVACOES", "AGENDA_TAREFAS"],
      needs_manual_choice: true
    }
  })],
  [normalize(geminiTableInvalidDomain), fixture("DESCONHECIDO", {}, {
    confidence: 0.7,
    should_confirm: false,
    table_import: {
      domain: "TABELA_FAKE",
      confidence: 0.9,
      column_mapping: { abc: "fake" },
      normalized_rows: [],
      unknown_columns: [],
      warnings: [],
      errors: [],
      ambiguous_domains: [],
      needs_manual_choice: false
    }
  })],
  ["boa tarde", fixture("DESCONHECIDO", {}, { confidence: 0.3, should_confirm: false, response_hint: "Pode me dizer o que deseja registrar ou consultar?" })]
]);

global.__RANCHO_GEMINI_INTERPRETER_MOCK__ = ({ text }) => {
  const result = fixtures.get(normalize(text));
  if (!result) return undefined;
  return clone(result);
};

global.fetch = async () => {
  throw new Error("test:bot:gemini nao deve chamar API real");
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

function finalParsed(result) {
  if (result.kind === "parsed") return result.parsed;
  if (result.kind === "local") return result.parsed;
  if (result.kind === "consultations") return result.consultations[0] || null;
  if (result.kind === "compound") return result.pending;
  return null;
}

const cases = [
  { message: "090 deu 15 litros hoje", intent: "PRODUCAO_LEITE", geminiMockId: "producao-leite-simples" },
  { message: "vaca 1 deu 15 litros", intent: "PRODUCAO_LEITE" },
  { message: "vaca 1 deu leite", intent: "PRODUCAO_LEITE", missing: true },
  { message: "vaca 1 deu 15 e a 2 20", intent: "LOTE_REGISTROS", registros: 2 },
  { message: "Mimosa nao comeu e vaca 2 deu 15 litros", intent: "LOTE_REGISTROS", registros: 2 },
  { message: "comprei 10kg de racao por 300 reais", intent: "ESTOQUE_ENTRADA" },
  { message: "comprei 10kg de racao", intent: "ESTOQUE_ENTRADA", missing: true },
  { message: "usei 20kg de racao", intent: "ESTOQUE_SAIDA" },
  { message: "vendi 40L de leite", intent: "ESTOQUE_SAIDA", missing: true },
  { message: "vendi 40L de leite por 120 reais", intent: "ESTOQUE_SAIDA" },
  { message: "paguei 300 de energia", intent: "DESPESA" },
  { message: "com o que eu gastei hoje?", intent: "CONSULTA_FINANCEIRO" },
  { message: "da o relatorio da producao de hoje", intent: "CONSULTA_PRODUCAO_HOJE" },
  { message: "dados das vacas", intent: "CONSULTA_REBANHO" },
  { message: "lista das vacas", intent: "CONSULTA_REBANHO" },
  { message: "partos recentes", intent: "CONSULTA_REGISTROS_HOJE", dados: { evento_tipo: "parto", periodo: "recentes", dias: 90, should_confirm: false } },
  { message: "relatorio dos partos recentes", intent: "CONSULTA_REGISTROS_HOJE", dados: { evento_tipo: "parto", periodo: "recentes", dias: 90, should_confirm: false } },
  { message: "quais vacas pariram recentemente?", intent: "CONSULTA_REGISTROS_HOJE", dados: { evento_tipo: "parto", periodo: "recentes", dias: 90, should_confirm: false } },
  { message: "partos dos ultimos 30 dias", intent: "CONSULTA_REGISTROS_HOJE", dados: { evento_tipo: "parto", periodo: "ultimos_30", dias: 30, should_confirm: false } },
  { message: "excluir todo o rebanho", intent: "ACAO_DESTRUTIVA_EM_MASSA", dados: { blocked: true, should_confirm: false } },
  { message: "deletar todas as vacas", intent: "ACAO_DESTRUTIVA_EM_MASSA", dados: { blocked: true, should_confirm: false } },
  { message: "novo animal", intent: "CADASTRO_ANIMAL", missing: true },
  { message: "cadastrar vaca Mimosa brinco 021 peso 400kg", intent: "CADASTRO_ANIMAL" },
  { message: "001;vaca 002;boi", intent: "IMPORTACAO_ANIMAIS_TABELA" },
  { message: "Mimosa foi inseminada e Lindona pariu", intent: "LOTE_REGISTROS", registros: 2 },
  { message: "001 pariu uma femea hoje", intent: "PARTO", missing: true, dados: { animal_codigo: "001", cria_sexo: "femea", cria_categoria: "bezerra" } },
  { message: "001 pariu uma femea codigo C-001 hoje", intent: "PARTO", dados: { animal_codigo: "001", cria_sexo: "femea", cria_categoria: "bezerra", cria_codigo: "C-001" } },
  { message: "001 pariu macho hoje pai T-001", intent: "PARTO", missing: true, dados: { animal_codigo: "001", cria_sexo: "macho", cria_categoria: "bezerro", pai_ref: "T-001" } },
  { message: "vaca 001 entrou em pre-parto", intent: "ATUALIZACAO_ANIMAL" },
  { message: "Lindona nao comeu hoje", intent: "ATUALIZACAO_ANIMAL" },
  { message: "paguei salario do Bruno 2500", intent: "PAGAMENTO_FUNCIONARIO" },
  { message: "nao era 15 litros era 18", intent: "DESCONHECIDO" },
  { message: "cancela o ultimo registro", intent: "DESCONHECIDO" },
  { message: "quanto tem de Leite Cru no estoque?", intent: "CONSULTA_ESTOQUE_ITEM" },
  { message: "como esta a vaca 19?", intent: "CONSULTA_ANIMAL" },
  { message: "Codigo Animal Status Tipo Data Observacoes 001 Inseminacao 01.01.26 001 Pre-parto 20.09.26 001 Pariu 10.10.26", intent: "LOTE_REGISTROS", registros: 3 },
  {
    message: ["Data;Animal;Litros", "2026-06-01;A-410;15", "2026-06-01;B-411;20"].join("\n"),
    intent: "LOTE_REGISTROS",
    registros: 2,
    dados: { total_litros: 35 }
  },
  {
    message: ["brinco;animal;tipo", "143;Princesa;vaca", "062;Lua;vaca"].join("\n"),
    intent: "IMPORTACAO_ANIMAIS_TABELA",
    dados: { tipo_tabela: "animals_import", total_linhas: 2, total_linhas_parse_validas: 2 }
  },
  {
    message: ["mae;data_parto;sexo_cria;codigo_cria;pai;observacoes", "001;16/06/2026;femea;B-123;050;parto normal"].join("\n"),
    intent: "IMPORTACAO_EVENTOS_TABELA",
    dados: { tipo_tabela: "birth_child_events", total_linhas: 1, total_linhas_parse_validas: 1 }
  },
  {
    message: ["descricao;tipo;valor;data", "energia;despesa;350;01/06/2026", "venda leite;receita;1200;02/06/2026"].join("\n"),
    intent: "IMPORTACAO_TABELA_DOMINIO",
    dados: { dominio_tabela: "FINANCEIRO", total_linhas: 2, total_linhas_parse_validas: 2 }
  },
  {
    message: ["funcionario;data;entrada;saida", "Joao;01/06/2026;07:00;17:00", "Maria;01/06/2026;06:00;15:00"].join("\n"),
    intent: "IMPORTACAO_TABELA_DOMINIO",
    dados: { dominio_tabela: "PONTO_FUNCIONARIO", total_linhas: 2, total_linhas_parse_validas: 2 }
  },
  {
    message: ["abc;def;ghi", "x;y;z"].join("\n"),
    intent: "IMPORTACAO_TABELA_AMBIGUA",
    dados: { dominio_tabela: "DESCONHECIDO", total_linhas: 1 }
  },
  {
    message: geminiTableFinanceValid,
    intent: "IMPORTACAO_TABELA_DOMINIO",
    dados: { dominio_tabela: "FINANCEIRO", gemini_table_domain: "FINANCEIRO", interpreter_final_usado: "gemini_table_domain_then_local_parser" }
  },
  {
    message: geminiTableStockInventedField,
    intent: "IMPORTACAO_ESTOQUE_TABELA",
    dados: { gemini_table_domain: "ESTOQUE", interpreter_final_usado: "gemini_table_domain_then_local_parser" },
    notMappingKey: "coluna extra"
  },
  {
    message: geminiTableLowConfidence,
    intent: "IMPORTACAO_TABELA_AMBIGUA",
    dados: { dominio_tabela: "DESCONHECIDO", interpreter_final_usado: "gemini_table_manual_choice" }
  },
  {
    message: geminiTableInvalidDomain,
    clarify: true
  },
  { message: "boa tarde", clarify: true }
];

(async () => {
  const results = [];

  // Mantem as fixtures de contrato legado como regressao de compatibilidade em shadow.
  // O bloco ActionPlan abaixo volta explicitamente ao modo Gemini-first.
  process.env.BOT_INTERPRETER = "shadow";
  for (const testCase of cases) {
    try {
      const localParsed = parseRanchoMessage(testCase.message);
      const result = await parseWithConfiguredInterpreter({
        text: testCase.message,
        localParsed,
        owner: ADMIN_OWNER,
        geminiMockId: testCase.geminiMockId || null
      });

      if (testCase.clarify) {
        assert(result.kind === "clarify", `${testCase.message}: esperado clarify, recebido ${result.kind}`);
        results.push({ ok: true, name: testCase.message });
        continue;
      }

      const parsed = finalParsed(result);
      assert(parsed, `${testCase.message}: resultado sem parsed`);
      assert(parsed.tipo === testCase.intent, `${testCase.message}: intent esperado ${testCase.intent}, recebido ${parsed.tipo}`);
      assert(
        parsed.dados?.origem_parser === "gemini" || parsed.dados?.origem_parser === "local" || parsed.dados?.origem_parser === "local_guard" || parsed.dados?.origem_parser === "tabela_local" || parsed.dados?.origem_parser === "gemini_table_guard" || parsed.tipo === "LOTE_REGISTROS" || parsed.tipo === "DESCONHECIDO",
        `${testCase.message}: origem_parser gemini ausente`
      );
      if (testCase.route) {
        assert(parsed.dados?.route === testCase.route, `${testCase.message}: route esperada ${testCase.route}, recebida ${parsed.dados?.route}`);
      }
      if ("structuredInput" in testCase) {
        assert(Boolean(parsed.dados?.structuredDetection?.isStructured) === Boolean(testCase.structuredInput), `${testCase.message}: structuredDetection.isStructured inesperado`);
      }
      if (testCase.localFallback) {
        assert(result.kind === "local", `${testCase.message}: esperado fallback local, recebido ${result.kind}`);
      }
      if (testCase.missing) {
        assert(parsed.perguntas_faltantes.length > 0, `${testCase.message}: deveria pedir campo faltante`);
      }
      if (testCase.registros) {
        assert(Array.isArray(parsed.dados?.registros), `${testCase.message}: lote sem registros`);
        assert(parsed.dados.registros.length === testCase.registros, `${testCase.message}: registros esperado ${testCase.registros}, recebido ${parsed.dados.registros.length}`);
      }
      for (const [field, expectedValue] of Object.entries(testCase.dados || {})) {
        const receivedValue = parsed.dados?.[field];
        assert(
          String(receivedValue) === String(expectedValue),
          `${testCase.message}: dados.${field} esperado ${expectedValue}, recebido ${receivedValue}`
        );
      }
      if (testCase.notMappingKey) {
        assert(
          !parsed.dados?.gemini_column_mapping?.[testCase.notMappingKey],
          `${testCase.message}: mapeamento inventado nao deveria ser aceito`
        );
      }
      results.push({ ok: true, name: testCase.message });
    } catch (error) {
      results.push({
        ok: false,
        name: testCase.message,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  process.env.BOT_INTERPRETER = "gemini";

  const actionPlanCases = [
    {
      message: "relatório financeiro dos últimos 6 meses",
      domain: "financeiro",
      checks: (parsed) => {
        const filters = parsed.dados?.action_plan?.filters || [];
        assert(filters.some((filter) => filter.field === "data" && filter.op === "last_months" && filter.value === 6), "financeiro 6 meses: filtro last_months 6 ausente");
        assert(parsed.dados?.periodo !== "mes", "financeiro 6 meses: nao deve cair no periodo mes legado");
      }
    },
    {
      message: "quanto gastei com ração nos últimos 90 dias",
      domain: "financeiro",
      notIntent: "CONSULTA_ESTOQUE_ITEM",
      checks: (parsed) => {
        const filters = parsed.dados?.action_plan?.filters || [];
        assert(filters.some((filter) => filter.field === "descricao" && filter.op === "contains" && /ra[cç][aã]o/i.test(String(filter.value || ""))), "racao 90 dias: contains racao ausente");
        assert(filters.some((filter) => filter.field === "data" && filter.op === "last_days" && filter.value === 90), "racao 90 dias: last_days 90 ausente");
      }
    },
    {
      message: "produção de leite da Mimosa desde janeiro",
      domain: "producao_leite",
      checks: (parsed) => {
        const filters = parsed.dados?.action_plan?.filters || [];
        assert(filters.some((filter) => filter.field === "animal_ref" && filter.value === "Mimosa"), "producao Mimosa: animal_ref Mimosa ausente");
        assert(parsed.dados?.animal_codigo !== "LEITE", "producao Mimosa: nao deve interpretar LEITE como animal_codigo");
      }
    },
    {
      message: "partos dos últimos 6 meses",
      domain: "reproducao",
      checks: (parsed) => {
        const filters = parsed.dados?.action_plan?.filters || [];
        assert(filters.some((filter) => filter.field === "evento" && String(filter.value).toUpperCase() === "PARTO"), "partos 6 meses: evento PARTO ausente");
        assert(filters.some((filter) => filter.field === "data" && filter.op === "last_months" && filter.value === 6), "partos 6 meses: last_months 6 ausente");
        assert(parsed.dados?.dias !== 90, "partos 6 meses: nao deve cair em recentes/90 dias");
      }
    }
  ];

  for (const actionPlanCase of actionPlanCases) {
    try {
      await withActionPlanFlags(true, true, async () => {
        const result = await parseWithConfiguredInterpreter({
          text: actionPlanCase.message,
          localParsed: parseRanchoMessage(actionPlanCase.message),
          owner: ADMIN_OWNER
        });
        const parsed = finalParsed(result);
        assert(parsed, `${actionPlanCase.message}: resultado sem parsed`);
        assert(parsed.tipo !== actionPlanCase.notIntent, `${actionPlanCase.message}: caiu na intent legada errada ${parsed.tipo}`);
        assert(parsed.dados?.action_plan_used === true, `${actionPlanCase.message}: action_plan_used ausente`);
        assert(parsed.dados?.consulta_executada === "action_plan", `${actionPlanCase.message}: consulta_executada action_plan ausente`);
        assert(parsed.dados?.action_plan_domain === actionPlanCase.domain, `${actionPlanCase.message}: domain esperado ${actionPlanCase.domain}, recebido ${parsed.dados?.action_plan_domain}`);
        actionPlanCase.checks(parsed);
      });
      results.push({ ok: true, name: `ActionPlan query: ${actionPlanCase.message}` });
    } catch (error) {
      results.push({
        ok: false,
        name: `ActionPlan query: ${actionPlanCase.message}`,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const geminiFirstCases = [
    { name: "create producao", text: "090 deu 15 litros ontem as 18h", fixture: "create-producao-090", intent: "PRODUCAO_LEITE" },
    { name: "create compra estoque", text: "comprei 10kg de racao por 300 reais", fixture: "create-compra-estoque", intent: "ESTOQUE_ENTRADA" },
    { name: "create uso estoque", text: "usei 5kg de racao no lote lactacao", fixture: "create-uso-estoque", intent: "ESTOQUE_SAIDA" },
    { name: "create financeiro", text: "paguei 300 reais de energia", fixture: "create-financeiro", intent: "DESPESA" },
    { name: "create animal", text: "cadastrar touro T-900", fixture: "create-animal", intent: "CADASTRO_ANIMAL" },
    { name: "create saude vacina", text: "usei 1 dose de vacina na vaca 032", fixture: "create-saude-vacina", intent: "VACINA_MEDICAMENTO" },
    { name: "create saude vermifugo", text: "dei 2 doses de vermifugo no bezerro B-10", fixture: "create-saude-vermifugo", intent: "VACINA_MEDICAMENTO" },
    { name: "create reproducao protocolo", text: "091 entrou em protocolo hoje", fixture: "create-reproducao-protocolo", intent: "ATUALIZACAO_ANIMAL" },
    { name: "create reproducao reteste", text: "092 esta em reteste", fixture: "create-reproducao-reteste", intent: "ATUALIZACAO_ANIMAL" },
    { name: "query vacas paridas", text: "vacas paridas", fixture: "query-vacas-paridas", intent: "CONSULTA_REGISTROS_HOJE" },
    { name: "query vacas protocolo", text: "vacas em protocolo", fixture: "query-vacas-protocolo", intent: "CONSULTA_REGISTROS_HOJE" },
    { name: "query vacas reteste", text: "vacas em reteste", fixture: "query-vacas-reteste", intent: "CONSULTA_REGISTROS_HOJE" },
    { name: "query estoque", text: "quanto tem de racao no estoque", fixture: "query-estoque", intent: "CONSULTA_ESTOQUE_GERAL" },
    { name: "query animais", text: "listar vacas ativas", fixture: "query-animais", intent: "CONSULTA_REBANHO" },
    { name: "query genealogia", text: "genealogia da B-123", fixture: "query-genealogia", intent: "CONSULTA_GENEALOGIA" },
    { name: "import animais", text: "codigo;categoria\nT-187;touro\nT-234;touro\nT-419;touro", fixture: "import-table-animais", intent: "IMPORTACAO_ANIMAIS_TABELA" },
    { name: "import estoque saida", text: "item;saida;unidade;destino\nracao;5;kg;lote lactacao", fixture: "import-table-estoque-saida", intent: "IMPORTACAO_ESTOQUE_TABELA" },
    { name: "import genealogia", text: "animal;pai;mae\nB-123;T-01;777\nB-124;;777", fixture: "import-table-genealogia", intent: "IMPORTACAO_TABELA_DOMINIO" },
    { name: "import agenda", text: "tarefa;data;responsavel\nvacinar lote bezerros;25/06/2026;Joao", fixture: "import-table-agenda", intent: "IMPORTACAO_TABELA_DOMINIO" },
    { name: "import reproducao completa", text: "Codigo / Animal;Status / Tipo;Data;Observacoes\n777;Pariu;20.06.26;\n204;Inseminacao;19.06.26;\n143;Emprenhou;18.06.26;Reteste\n091;Em protocolo;20.06.26;Protocolo IA\n092;Em reteste;21.06.26;Nova tentativa", fixture: "import-table-reproducao-completa", intent: "IMPORTACAO_EVENTOS_TABELA" },
    { name: "import reproducao statuses", text: "Codigo / Animal;Status / Tipo;Data;Observacoes\n091;Em protocolo;21.06.26;Protocolo IA\n092;Em reteste;21.06.26;Nova tentativa\n093;Inseminacao;20.06.26;\n094;Pariu;19.06.26;", fixture: "import-table-reproducao-statuses", intent: "IMPORTACAO_EVENTOS_TABELA" },
    { name: "import reproducao embaralhada", text: "Data;Observacoes;Animal;Evento\nontem;primeira inseminacao;B-002;Inseminada\nhoje;;B-003;Prenha\n20.06.26;parto normal;B-004;Pariu", fixture: "import-table-reproducao-embaralhada", intent: "IMPORTACAO_EVENTOS_TABELA" },
    { name: "import lista reproducao", text: "B-002 - inseminada ontem - primeira inseminacao\nB-003 - prenha hoje\nB-004 - pariu hoje", fixture: "import-lista-reproducao", intent: "IMPORTACAO_EVENTOS_TABELA" },
    { name: "parto sem cria", text: "777 pariu", fixture: "create-parto-777-sem-cria", intent: "PARTO" },
    { name: "parto com cria", text: "777 pariu macho codigo B-555 hoje", fixture: "create-parto-777-macho-codigo", intent: "PARTO" }
  ];

  for (const testCase of geminiFirstCases) {
    try {
      const result = await parseWithConfiguredInterpreter({
        text: testCase.text,
        localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
        owner: ADMIN_OWNER,
        geminiMockId: testCase.fixture
      });
      const parsed = finalParsed(result);
      assert(parsed?.tipo === testCase.intent, `${testCase.name}: esperado ${testCase.intent}, recebido ${parsed?.tipo}`);
      assert(
        parsed.dados?.origem_parser === "gemini_action_plan",
        `${testCase.name}: origem deve ser Gemini/ActionPlan, recebida ${parsed.dados?.origem_parser}`
      );
      assert(parsed.dados?.action_plan_used === true || parsed.dados?.table_action_plan_used === true, `${testCase.name}: plano nao marcado`);
      if (testCase.fixture === "create-saude-vacina") {
        assert(parsed.dados?.animal_codigo === "032", "saude vacina: animal 032 ausente");
        assert(parsed.dados?.produto === "vacina", "saude vacina: produto ausente");
        assert(parsed.dados?.dose === "1 dose", `saude vacina: dose esperada 1 dose, recebida ${parsed.dados?.dose}`);
        assert(parsed.perguntas_faltantes.length === 0, "saude vacina: nao deveria faltar campo");
      }
      if (["create-reproducao-protocolo", "create-reproducao-reteste"].includes(testCase.fixture)) {
        const expected = testCase.fixture.endsWith("protocolo") ? "protocolo" : "reteste";
        assert(parsed.dados?.evento_reprodutivo_tipo === expected, `${testCase.name}: evento esperado ${expected}`);
        assert(parsed.dados?.registro_evento_animal === true, `${testCase.name}: registro historico ausente`);
        assert(!("categoria" in parsed.dados), `${testCase.name}: status nao pode virar categoria`);
      }
      if (["import-table-reproducao-completa", "import-table-reproducao-statuses", "import-table-reproducao-embaralhada", "import-lista-reproducao"].includes(testCase.fixture)) {
        const rows = parsed.dados?.linhas || [];
        const total = Number(parsed.dados?.total_linhas || 0);
        const valid = Number(parsed.dados?.total_linhas_parse_validas || 0);
        const invalid = Number(parsed.dados?.total_linhas_parse_invalidas || 0);
        const review = Number(parsed.dados?.total_linhas_needs_review || 0);
        assert(rows.length === total, `${testCase.name}: linhas uteis desapareceram`);
        assert(valid + invalid + review === total, `${testCase.name}: particao de linhas invalida`);
        assert(rows.every((row) => !String(row.observacoes || "").includes("Data;")), `${testCase.name}: tabela inteira virou observacao`);
        assert(rows.some((row) => row.evento_normalizado === "INSEMINACAO"), `${testCase.name}: INSEMINACAO ausente`);
        if (testCase.fixture !== "import-table-reproducao-statuses") {
          assert(rows.some((row) => row.evento_normalizado === "PRENHEZ"), `${testCase.name}: PRENHEZ ausente`);
        }
        assert(rows.some((row) => row.evento_normalizado === "PARTO"), `${testCase.name}: PARTO ausente`);
        if (["import-table-reproducao-completa", "import-table-reproducao-statuses"].includes(testCase.fixture)) {
          assert(rows.some((row) => row.evento_normalizado === "EM_PROTOCOLO"), "reproducao completa: EM_PROTOCOLO ausente");
          assert(rows.some((row) => row.evento_normalizado === "EM_RETESTE"), "reproducao completa: EM_RETESTE ausente");
        }
      }
      results.push({ ok: true, name: `Gemini-first: ${testCase.name}` });
    } catch (error) {
      results.push({ ok: false, name: `Gemini-first: ${testCase.name}`, error: error instanceof Error ? error.message : String(error) });
    }
  }

  try {
    const table = "Data;Observacoes;Animal;Evento\nontem;primeira inseminacao;B-002;Inseminada\nhoje;;B-003;Prenha";
    const act = detectConversationAct({
      text: table,
      session: { etapa: "aguardando_dado", dados: { pending: parseRanchoMessage("atualizar observacao da vaca 032") } },
      pending: parseRanchoMessage("atualizar observacao da vaca 032")
    });
    assert(act.messageType === "new_action", `tabela com pendencia deveria ser nova acao, recebido ${act.messageType}`);
    assert(act.decision === "new_action", `tabela com pendencia deveria ignorar merge contextual, recebido ${act.decision}`);
    results.push({ ok: true, name: "Tabela estruturada substitui resposta de pendencia" });
  } catch (error) {
    results.push({ ok: false, name: "Tabela estruturada substitui resposta de pendencia", error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const result = await parseWithConfiguredInterpreter({
      text: "abc;def;ghi\nx;y;z\n1;2;3",
      localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
      owner: ADMIN_OWNER,
      geminiMockId: "import-table-desconhecida-clarify"
    });
    assert(result.kind === "clarify", `tabela desconhecida deveria esclarecer, recebido ${result.kind}`);
    results.push({ ok: true, name: "Tabela desconhecida pede esclarecimento" });
  } catch (error) {
    results.push({ ok: false, name: "Tabela desconhecida pede esclarecimento", error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const result = await parseWithConfiguredInterpreter({
      text: "vacinei o lote bezerros hoje",
      localParsed: parseRanchoMessage("mensagem propositalmente desconhecida"),
      owner: ADMIN_OWNER,
      geminiMockId: "clarify-saude-lote"
    });
    assert(result.kind === "clarify", `saude por lote deveria pedir dado, recebido ${result.kind}`);
    assert(/qual vacina/i.test(result.message), "saude por lote deveria perguntar qual vacina foi aplicada");
    results.push({ ok: true, name: "Gemini-first: saude por lote pede esclarecimento" });
  } catch (error) {
    results.push({ ok: false, name: "Gemini-first: saude por lote pede esclarecimento", error: error instanceof Error ? error.message : String(error) });
  }

  try {
    await withActionPlanFlags(false, false, async () => {
      const text = "relatÃ³rio financeiro dos Ãºltimos 6 meses";
      const result = await parseWithConfiguredInterpreter({
        text,
        localParsed: parseRanchoMessage(text),
        owner: ADMIN_OWNER,
        geminiMockId: "query-financeiro-ultimos-6-meses"
      });
      const parsed = finalParsed(result);
      assert(parsed?.tipo === "CONSULTA_FINANCEIRO", `modo Gemini deveria usar ActionPlan, recebido ${parsed?.tipo}`);
      assert(parsed.dados?.action_plan_used === true, "modo Gemini deveria marcar action_plan_used");
    });
    results.push({ ok: true, name: "BOT_INTERPRETER=gemini independe de flags antigas" });
  } catch (error) {
    results.push({
      ok: false,
      name: "BOT_INTERPRETER=gemini independe de flags antigas",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    await withActionPlanFlags(true, true, async () => {
      const prompt = buildGeminiSystemPrompt({
        text: "relatório financeiro dos últimos 6 meses",
        currentDate: "2026-06-18",
        timezone: "America/Fortaleza"
      });
      assert(prompt.includes("Retorne somente um objeto JSON ActionPlan"), "prompt nao declara ActionPlan obrigatorio");
      assert(prompt.includes("Nao retorne markdown, texto livre, intent legado ou SQL"), "prompt nao bloqueia intent legado");
      assert(prompt.includes('"action": "query"'), "prompt sem exemplo action=query");
      assert(prompt.includes("relatorio financeiro dos ultimos 6 meses"), "prompt sem exemplo financeiro obrigatorio");
    });
    results.push({ ok: true, name: "Prompt Gemini exige ActionPlan" });
  } catch (error) {
    results.push({
      ok: false,
      name: "Prompt Gemini exige ActionPlan",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const validation = validateInterpretedAction({
      action: "query",
      domain: "financeiro",
      confidence: 0.94,
      filters: [{ field: "data", op: "last_months", value: 6 }],
      aggregations: [{ field: "valor", op: "sum", as: "total" }],
      groupBy: ["month"],
      limit: 100,
      requiresConfirmation: false
    }, { originalText: "relatório financeiro dos últimos 6 meses" });
    assert(validation.ok, `ActionPlan puro deveria validar: ${validation.message || validation.reason}`);
    assert(validation.value.action_plan?.action === "query", "ActionPlan validado nao ficou em value.action_plan");
    assert(validation.value.action_plan?.domain === "financeiro", "ActionPlan validado sem domain financeiro");
    results.push({ ok: true, name: "Validador aceita ActionPlan puro" });
  } catch (error) {
    results.push({
      ok: false,
      name: "Validador aceita ActionPlan puro",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const expectedManualChoices = {
      "1": "REBANHO_ANIMAIS",
      "2": "LOTES",
      "3": "GENEALOGIA",
      "4": "PRODUCAO_LEITE",
      "5": "FINANCEIRO",
      "6": "ESTOQUE",
      "7": "FUNCIONARIOS",
      "8": "PONTO_FUNCIONARIO",
      "9": "SAUDE_SANITARIO",
      "10": "OBSERVACOES",
      "11": "AGENDA_TAREFAS",
      "12": "REPRODUCAO"
    };
    for (const [choice, expectedDomain] of Object.entries(expectedManualChoices)) {
      assert(domainFromUserChoice(choice) === expectedDomain, `escolha manual ${choice}: esperado ${expectedDomain}, recebido ${domainFromUserChoice(choice)}`);
    }
    results.push({ ok: true, name: "Escolha manual 1..12 mapeia dominios corretos" });
  } catch (error) {
    results.push({
      ok: false,
      name: "Escolha manual 1..12 mapeia dominios corretos",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  try {
    const originalMode = process.env.GEMINI_MODE;
    process.env.GEMINI_MODE = "live";
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          { content: { parts: [{ text: "{ json invalido" }] } }
        ]
      })
    });

    const blockedLive = await interpretWithGemini({ text: "teste live bloqueado" });
    assert(!blockedLive.ok && blockedLive.message === "Teste tentou chamar Gemini live. Use GEMINI_MODE=mock.", `Gemini live em teste deveria ser bloqueado, recebido ${blockedLive.ok ? "ok" : blockedLive.message}`);
    results.push({ ok: true, name: "Gemini live bloqueado em teste automatizado" });

    process.env.GEMINI_MODE = originalMode;
  } catch (error) {
    results.push({
      ok: false,
      name: "Gemini live bloqueado em teste automatizado",
      error: error instanceof Error ? error.message : String(error)
    });
  }

  const stats = geminiRuntimeStats();
  if (stats.liveCalls !== 0) {
    results.push({
      ok: false,
      name: "Gemini live calls zeradas",
      error: `Gemini live calls esperado 0, recebido ${stats.liveCalls}`
    });
  } else {
    results.push({ ok: true, name: "Gemini live calls zeradas" });
  }

  const failed = results.filter((result) => !result.ok);
  console.log("Bot Gemini test offline Rancho");
  console.log(`Total: ${results.length}`);
  console.log(`Aprovados: ${results.length - failed.length}`);
  console.log(`Falhos: ${failed.length}`);
  console.log("Gemini: mock estruturado; API real: nao chamada");
  for (const line of geminiRuntimeReportLines()) console.log(line);

  if (failed.length) {
    for (const failure of failed) {
      console.log(`\n--- Falha: ${failure.name} ---`);
      console.log(failure.error);
    }
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error("Falha ao rodar test:bot:gemini", error);
  process.exitCode = 1;
});
