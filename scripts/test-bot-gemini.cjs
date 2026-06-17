const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

process.env.BOT_INTERPRETER = "gemini";
process.env.BOT_ALLOW_LEGACY_ROLLBACK = "false";
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
    response_hint: options.response_hint || null
  };
}

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

function finalParsed(result) {
  if (result.kind === "parsed") return result.parsed;
  if (result.kind === "local") return result.parsed;
  if (result.kind === "consultations") return result.consultations[0] || null;
  if (result.kind === "compound") return result.pending;
  return null;
}

const cases = [
  { message: "090 deu 15 litros hoje", intent: "PRODUCAO_LEITE", route: "normal_message", structuredInput: false, localFallback: true },
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
  { message: "boa tarde", clarify: true }
];

(async () => {
  const results = [];

  for (const testCase of cases) {
    try {
      const localParsed = parseRanchoMessage(testCase.message);
      const result = await parseWithConfiguredInterpreter({
        text: testCase.message,
        localParsed,
        owner: ADMIN_OWNER
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
        parsed.dados?.origem_parser === "gemini" || parsed.dados?.origem_parser === "local" || parsed.dados?.origem_parser === "local_guard" || parsed.tipo === "LOTE_REGISTROS" || parsed.tipo === "DESCONHECIDO",
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
      results.push({ ok: true, name: testCase.message });
    } catch (error) {
      results.push({
        ok: false,
        name: testCase.message,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log("Bot Gemini test offline Rancho");
  console.log(`Total: ${results.length}`);
  console.log(`Aprovados: ${results.length - failed.length}`);
  console.log(`Falhos: ${failed.length}`);
  console.log("Gemini: mock estruturado; API real: nao chamada");

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
