const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const REPORT_JSON = path.join(root, "bot-heavy-report.json");

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
  mergeRanchoMessageData,
  parseRanchoMessage,
  refreshRanchoMessage
} = require("../src/lib/whatsapp/nlp.ts");
const {
  normalizeCatalogText,
  resolveAnimalIdentifier,
  resolveStockItem
} = require("../src/lib/whatsapp/catalog.ts");

const mockAnimals = [
  { id: "animal-b-001", brinco: "B-001", nome: "Mimosa" },
  { id: "animal-b-002", brinco: "B-002", nome: "Estrela" },
  { id: "animal-a12", brinco: "A12", nome: "Estrela A12" },
  { id: "animal-1", brinco: "1", nome: "Um" },
  { id: "animal-2", brinco: "2", nome: "Dois" },
  { id: "animal-15", brinco: "15", nome: "Lua" },
  { id: "animal-malhada", brinco: "MALHADA", nome: "Malhada" },
  { id: "animal-preta", brinco: "PRETA", nome: "Preta" }
];

const mockStock = [
  { id: "item-racao-boi", nome: "Ração de boi" },
  { id: "item-racao", nome: "Ração" },
  { id: "item-milho", nome: "Milho" },
  { id: "item-feno", nome: "Feno" },
  { id: "item-sal-mineral", nome: "Sal mineral" },
  { id: "item-aftosa", nome: "Aftosa" },
  { id: "item-terramicina", nome: "Terramicina" },
  { id: "item-remedio", nome: "Remédio" },
  { id: "item-leite-cru", nome: "Leite Cru" }
];

const users = {
  admin: { nome: "Dono", papel: "admin", telefone: "5583999999999" },
  funcionario: { nome: "Joao", papel: "funcionario", telefone: "5583888888888" }
};

function normalize(value) {
  return normalizeCatalogText(String(value ?? ""));
}

function cycle(array, index) {
  return array[index % array.length];
}

function makeCase(id, dominio, mensagem, esperado, extras = {}) {
  return {
    id,
    dominio,
    mensagem,
    usuarioSimulado: extras.usuarioSimulado || users.admin,
    contexto: extras.contexto || null,
    mocks: extras.mocks || { animais: mockAnimals.length, estoque: mockStock.length },
    esperado
  };
}

function resolveParsed(parsed) {
  const dados = { ...(parsed.dados || {}) };

  if (parsed.tipo === "LOTE_REGISTROS" && Array.isArray(dados.registros)) {
    dados.registros = dados.registros.map((registro) => resolveParsed(registro));
    return refreshRanchoMessage(parsed, dados);
  }

  if (["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL", "ATUALIZACAO_GENEALOGIA", "CONSULTA_GENEALOGIA"].includes(parsed.tipo) && dados.animal_codigo) {
    const resolved = resolveAnimalIdentifier(dados.animal_codigo, mockAnimals);
    if (resolved.row && resolved.status !== "ambiguous") {
      dados.animal_codigo = resolved.row.brinco;
      dados.animal_id = resolved.row.id;
    }
  }

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM"].includes(parsed.tipo) && dados.item_nome) {
    const originalItem = dados.item_nome;
    const resolved = resolveStockItem(originalItem, mockStock);
    dados.item_extraido = originalItem;
    dados.item_normalizado = normalizeCatalogText(originalItem);
    dados.item_estoque_encontrado = Boolean(resolved.row && resolved.status !== "ambiguous" && resolved.score >= 0.86);
    dados.motivo_processamento = parsed.tipo === "ESTOQUE_ENTRADA" && dados.compra
      ? dados.item_estoque_encontrado ? "item_encontrado: estoque+financeiro" : "item_nao_encontrado: fluxo_criar_item_ou_financeiro"
      : parsed.tipo === "ESTOQUE_SAIDA" && dados.venda
        ? dados.item_estoque_encontrado ? "item_encontrado: estoque+receita" : "item_nao_encontrado: financeiro_apenas"
        : dados.item_estoque_encontrado ? "item_encontrado" : "item_nao_encontrado";

    if (resolved.row && resolved.status !== "ambiguous" && resolved.score >= 0.86) {
      dados.item_nome = resolved.row.nome;
      dados.item_id = resolved.row.id;
      dados.item_resolvido = resolved.row.nome;
    } else {
      dados.item_id = null;
      dados.item_resolvido = null;
    }
  }

  return refreshRanchoMessage(parsed, dados);
}

function parseCase(testCase) {
  if (testCase.contexto?.pending) {
    const pending = resolveParsed(parseRanchoMessage(testCase.contexto.pending));
    return resolveParsed(mergeRanchoMessageData(pending, testCase.mensagem));
  }
  return resolveParsed(parseRanchoMessage(testCase.mensagem));
}

function missingText(parsed) {
  return normalize((parsed.perguntas_faltantes || []).join(" "));
}

function hasMissing(parsed, field) {
  const text = missingText(parsed);
  const checks = {
    animal_codigo: /animal|brinco|codigo/.test(text),
    litros: /litro/.test(text),
    quantidade: /quantidade/.test(text),
    unidade: /unidade/.test(text),
    valor: /valor|custou|venda/.test(text),
    nome: /nome do animal|qual e o nome|chamado/.test(text),
    peso: /peso/.test(text),
    categoria: /categoria/.test(text),
    produto: /medicamento|vacina|produto/.test(text)
  };
  return Boolean(checks[field]);
}

function readPath(value, pathExpression) {
  return pathExpression.split(".").reduce((current, key) => {
    if (current === undefined || current === null) return undefined;
    return current[key];
  }, value);
}

function assertCase(testCase, parsed) {
  const failures = [];
  const esperado = testCase.esperado || {};
  const dados = parsed.dados || {};

  if (esperado.tipo && parsed.tipo !== esperado.tipo) failures.push(`tipo esperado ${esperado.tipo}, recebido ${parsed.tipo}`);
  if (esperado.tipoUmDe && !esperado.tipoUmDe.includes(parsed.tipo)) failures.push(`tipo esperado um de ${esperado.tipoUmDe.join(", ")}, recebido ${parsed.tipo}`);
  if (esperado.naoTipo && esperado.naoTipo.includes(parsed.tipo)) failures.push(`não deveria ser ${parsed.tipo}`);

  for (const [field, expectedValue] of Object.entries(esperado.dados || {})) {
    const received = readPath(dados, field);
    if (Array.isArray(expectedValue)) {
      if (!expectedValue.map(normalize).includes(normalize(received))) failures.push(`${field} esperado um de ${expectedValue.join(", ")}, recebido ${received}`);
    } else if (typeof expectedValue === "number") {
      if (Number(received) !== expectedValue) failures.push(`${field} esperado ${expectedValue}, recebido ${received}`);
    } else if (expectedValue === true || expectedValue === false) {
      if (Boolean(received) !== expectedValue) failures.push(`${field} esperado ${expectedValue}, recebido ${received}`);
    } else if (normalize(received) !== normalize(expectedValue)) {
      failures.push(`${field} esperado ${expectedValue}, recebido ${received}`);
    }
  }

  for (const field of esperado.camposFaltantes || []) {
    if (!hasMissing(parsed, field)) failures.push(`deveria perguntar ${field}`);
  }

  for (const field of esperado.naoDevePerguntar || []) {
    if (hasMissing(parsed, field)) failures.push(`não deveria perguntar ${field}`);
  }

  if (esperado.deveConsultar === true && !parsed.tipo.startsWith("CONSULTA_")) failures.push("deveria ser consulta");
  if (esperado.deveConsultar === false && parsed.tipo.startsWith("CONSULTA_")) failures.push("não deveria ser consulta");
  if (esperado.devePedirConfirmacao === true && parsed.perguntas_faltantes.length) failures.push("deveria estar pronto para confirmação");
  if (esperado.naoUsarIaFallback && parsed.decision === "gemini_fallback") failures.push("não deveria usar IA fallback");
  if (esperado.deveUsarIaFallback === true && parsed.decision !== "gemini_fallback") failures.push("deveria usar IA fallback");

  return failures;
}

function classifyFailure(testCase, parsed, failures) {
  const text = failures.join(" | ").toLowerCase();
  if (/não deveria ser estoque_entrada|valor esperado|litros esperado|quantidade esperada|venda.*entrada|tipo esperado lote_registros.*cadastro_animal/.test(text)) return "critica";
  if (testCase.esperado?.critica) return "critica";
  if (/não deveria perguntar|deveria perguntar|tipo esperado|deveria ser consulta/.test(text)) return "importante";
  return "aceitavel";
}

function probableCause(failures) {
  const text = failures.join(" ").toLowerCase();
  if (/tipo esperado|não deveria ser/.test(text)) return "prioridade de intenção ou verbo conflitante";
  if (/valor|litros|quantidade|peso/.test(text)) return "extração numérica/unidade";
  if (/perguntar/.test(text)) return "campos obrigatórios ou limpeza de entidade";
  if (/ia fallback/.test(text)) return "classificação de fallback/ambiguidade";
  return "regra não coberta ou frase ambígua";
}

function makeAnimalCases() {
  const verbs = ["cadastrar", "cadastra", "novo", "nova", "adiciona", "registrar"];
  const cats = ["boi", "vaca", "novilha", "bezerro", "bezerra"];
  const names = ["Anderson", "Estrela", "Lua", "Malhada", "Princesa"];
  return Array.from({ length: 150 }, (_, index) => {
    const cat = cycle(cats, index);
    const name = cycle(names, index);
    const weight = 220 + index;
    const variants = [
      `${cycle(verbs, index)} ${cat} ${name} ${weight}kg`,
      `${cycle(verbs, index)} animal ${name} ${cat} peso ${weight} quilos`,
      `${cat} ${name} ${weight}kg novo cadastro`,
      `${cycle(verbs, index)} ${cat} ${name} brinco H${index} peso ${weight}kg`
    ];
    return makeCase(`cadastro-animal-${String(index + 1).padStart(3, "0")}`, "cadastro_animal", cycle(variants, index), {
      tipo: "CADASTRO_ANIMAL",
      dados: { categoria: cat },
      naoDevePerguntar: ["categoria"],
      naoUsarIaFallback: true
    });
  });
}

function makeProductionCases() {
  const animals = ["B-002", "1", "2", "15", "MALHADA", "PRETA"];
  const verbs = ["deu", "produziu", "fez", "ordenha da"];
  return Array.from({ length: 150 }, (_, index) => {
    const animal = cycle(animals, index);
    const liters = Number((8 + (index % 50) + (index % 2 ? 0.5 : 0)).toFixed(1));
    const msg = index % 4 === 0
      ? `${liters} litros da ${animal}`
      : `vaca ${animal} ${cycle(verbs, index)} ${liters} litros`;
    return makeCase(`producao-leite-${String(index + 1).padStart(3, "0")}`, "producao_leite", msg, {
      tipo: "PRODUCAO_LEITE",
      dados: { litros: liters },
      naoUsarIaFallback: true
    });
  });
}

function makeStockCases() {
  const items = ["ração", "milho", "feno", "sal mineral", "ração de boi"];
  const units = ["kg", "sacos", "fardos"];
  const verbs = ["comprei", "usei", "adicionei", "vendi", "tira"];
  return Array.from({ length: 150 }, (_, index) => {
    const verb = cycle(verbs, index);
    const item = cycle(items, index);
    const quantity = 1 + (index % 80);
    const unit = cycle(units, index);
    const withValue = index % 3 === 0;
    const value = 100 + index;
    const msg = `${verb} ${quantity}${unit === "kg" ? "kg" : ` ${unit}`} de ${item}${withValue ? ` por ${value} reais` : ""}`;
    const sale = /^vendi/.test(verb);
    const purchase = /^comprei/.test(verb);
    const expectedTipo = purchase || verb === "adicionei" ? "ESTOQUE_ENTRADA" : "ESTOQUE_SAIDA";
    return makeCase(`estoque-${String(index + 1).padStart(3, "0")}`, "estoque", msg, {
      tipo: expectedTipo,
      dados: {
        quantidade: quantity,
        ...(sale ? { venda: true } : {}),
        ...(purchase ? { compra: true } : {}),
        ...(withValue && (sale || purchase) ? { valor: value } : {})
      },
      camposFaltantes: sale && !withValue ? ["valor"] : purchase && !withValue ? ["valor"] : [],
      naoTipo: sale ? ["ESTOQUE_ENTRADA"] : [],
      naoUsarIaFallback: true,
      critica: sale
    });
  });
}

function makeFinanceCases() {
  const entries = ["vendi bezerro por", "recebi do leite", "venda de queijo", "ganhei com leite"];
  const expenses = ["paguei energia", "gastei com diesel", "despesa veterinario"];
  return Array.from({ length: 120 }, (_, index) => {
    const revenue = index % 2 === 0;
    const value = index % 10 === 0 ? "20 mil" : String(100 + index);
    const msg = revenue ? `${cycle(entries, index)} ${value}` : `${cycle(expenses, index)} ${value}`;
    return makeCase(`financeiro-${String(index + 1).padStart(3, "0")}`, "financeiro", msg, {
      tipo: revenue ? "RECEITA_VENDA" : "DESPESA",
      dados: { valor: value === "20 mil" ? 20000 : Number(value) },
      naoUsarIaFallback: true
    });
  });
}

function makeEventCases() {
  const cases = [
    ["apliquei aftosa na b002", "VACINA_MEDICAMENTO", { produto: "aftosa" }],
    ["vaca 2 recebeu vacina da raiva", "VACINA_MEDICAMENTO", { produto: "raiva" }],
    ["mediquei B-002 com terramicina", "VACINA_MEDICAMENTO", { produto: "terramicina" }],
    ["B-002 pariu hoje", "PARTO", {}],
    ["a vaca do curral morreu", "MORTE", {}],
    ["morreu a PRETA no fundo", "MORTE", {}]
  ];
  return Array.from({ length: 120 }, (_, index) => {
    const [msg, tipo, dados] = cycle(cases, index);
    return makeCase(`evento-${String(index + 1).padStart(3, "0")}`, "eventos", msg, {
      tipo,
      dados,
      ...(msg.includes("curral") ? { camposFaltantes: ["animal_codigo"], naoDevePerguntar: ["local"] } : {}),
      naoUsarIaFallback: true
    });
  });
}

function makeConsultCases() {
  const msgs = [
    ["o que eu registrei hoje?", "CONSULTA_REGISTROS_HOJE"],
    ["quanto deu de leite hoje?", "CONSULTA_PRODUCAO_HOJE"],
    ["estoque de ração", "CONSULTA_ESTOQUE_ITEM"],
    ["financeiro do mês", "CONSULTA_FINANCEIRO"],
    ["quais vacas no lote Lactacao 1", "CONSULTA_REBANHO"],
    ["ver ficha da B-002", "CONSULTA_ANIMAL"]
  ];
  return Array.from({ length: 120 }, (_, index) => {
    const [msg, tipo] = cycle(msgs, index);
    return makeCase(`consulta-${String(index + 1).padStart(3, "0")}`, "consultas_relatorios", msg, {
      tipo,
      deveConsultar: true,
      naoUsarIaFallback: true
    });
  });
}

function makeBatchCases() {
  const msgs = [
    ["vaca 1 deu 15 e a 2 20", "LOTE_REGISTROS", { total_registros: 2 }],
    ["vaca 1 deu 15 litros e a vaca 2 também", "LOTE_REGISTROS", { total_registros: 2 }],
    ["bota 20kg de racao de boi e 10kg de milho no estoque", "LOTE_REGISTROS", { total_registros: 2 }],
    ["tira 10kg de milho e 5kg de sal", "LOTE_REGISTROS", { total_registros: 2 }],
    ["recebi 500 do leite e 1200 do bezerro", "LOTE_REGISTROS", { total_registros: 2 }]
  ];
  return Array.from({ length: 120 }, (_, index) => {
    const [msg, tipo, dados] = cycle(msgs, index);
    return makeCase(`lote-${String(index + 1).padStart(3, "0")}`, "multiplos_registros", msg, {
      tipo,
      dados,
      naoTipo: ["CADASTRO_ANIMAL"],
      naoUsarIaFallback: true,
      critica: msg.includes("vaca 1 deu")
    });
  });
}

function makeSessionCases() {
  const pairs = [
    ["vaca B-002 deu leite", "32", "PRODUCAO_LEITE", { litros: 32 }],
    ["vendi 30kg de ração", "300 reais", "ESTOQUE_SAIDA", { valor: 300, venda: true }],
    ["comprei 2 sacos de milho", "300,50", "ESTOQUE_ENTRADA", { valor: 300.5, compra: true }],
    ["criar estoque de ração de bezerro", "kg", "CRIAR_ITEM_ESTOQUE", { unidade: "kg" }]
  ];
  return Array.from({ length: 100 }, (_, index) => {
    const [pending, reply, tipo, dados] = cycle(pairs, index);
    return makeCase(`sessao-${String(index + 1).padStart(3, "0")}`, "correcao_cancelamento_sessao", reply, {
      tipo,
      dados,
      naoUsarIaFallback: true
    }, { contexto: { pending } });
  });
}

function makeDateCases() {
  const msgs = [
    ["vaca B-002 deu 30 litros no tanque", "PRODUCAO_LEITE", { litros: 30, destino_leite: "tanque" }],
    ["vaca B-002 deu 18 litros ontem de tarde", "PRODUCAO_LEITE", { litros: 18, data_referencia: "ontem" }],
    ["recebi 900 do leite ontem", "RECEITA_VENDA", { valor: 900, data_referencia: "ontem" }],
    ["usei 5kg de milho hoje", "ESTOQUE_SAIDA", { quantidade: 5 }]
  ];
  return Array.from({ length: 100 }, (_, index) => {
    const [msg, tipo, dados] = cycle(msgs, index);
    return makeCase(`datas-${String(index + 1).padStart(3, "0")}`, "datas_periodos_turnos_destinos", msg, {
      tipo,
      dados,
      naoUsarIaFallback: true
    });
  });
}

function makeTypoCases() {
  const msgs = [
    ["vacaa B002 deu 50.5 litros", "PRODUCAO_LEITE", { litros: 50.5 }],
    ["comprei 10 saco de racao por 2,5 mil", "ESTOQUE_ENTRADA", { valor: 2500, compra: true }],
    ["usei 1,5 kg de racao de boi", "ESTOQUE_SAIDA", { quantidade: 1.5 }],
    ["vendi 30kg de racao", "ESTOQUE_SAIDA", { quantidade: 30, venda: true }]
  ];
  return Array.from({ length: 100 }, (_, index) => {
    const [msg, tipo, dados] = cycle(msgs, index);
    return makeCase(`typo-${String(index + 1).padStart(3, "0")}`, "erros_digitacao_acentos_abreviacoes", msg, {
      tipo,
      dados,
      naoUsarIaFallback: true
    });
  });
}

function makePermissionCases() {
  const msgs = [
    ["criar estoque de ração de bezerro", "CRIAR_ITEM_ESTOQUE", users.funcionario],
    ["cadastrar funcionário Pedro 83999999999", "CRIAR_FUNCIONARIO", users.funcionario],
    ["vaca B-002 deu 20 litros", "PRODUCAO_LEITE", users.funcionario],
    ["financeiro do mês", "CONSULTA_FINANCEIRO", users.admin]
  ];
  return Array.from({ length: 100 }, (_, index) => {
    const [msg, tipo, user] = cycle(msgs, index);
    return makeCase(`permissao-${String(index + 1).padStart(3, "0")}`, "permissoes_admin_funcionario", msg, {
      tipo,
      deveSalvar: false,
      naoUsarIaFallback: true
    }, { usuarioSimulado: user });
  });
}

function makeAmbiguousCases() {
  const msgs = [
    ["lançar coisa", "DESCONHECIDO"],
    ["corrige isso", "DESCONHECIDO"],
    ["animal do fundo", "DESCONHECIDO"],
    ["sal", "DESCONHECIDO"],
    ["não", "DESCONHECIDO"]
  ];
  return Array.from({ length: 100 }, (_, index) => {
    const [msg, tipo] = cycle(msgs, index);
    return makeCase(`ambiguidade-${String(index + 1).padStart(3, "0")}`, "ambiguidade_fallback_ia", msg, {
      tipoUmDe: [tipo, "CONSULTA_ESTOQUE_ITEM", "ESTOQUE_SAIDA", "AJUDA"],
      deveSalvar: false
    });
  });
}

function makeRegressionCases() {
  const required = [
    makeCase("bug-real-001", "regressoes_reais", "vaca 1 deu 15 e a 2 20", { tipo: "LOTE_REGISTROS", naoTipo: ["CADASTRO_ANIMAL"], dados: { total_registros: 2 }, critica: true }),
    makeCase("bug-real-002", "regressoes_reais", "vaca 1 deu 15 litros e a vaca 2 também", { tipo: "LOTE_REGISTROS", dados: { total_registros: 2 }, critica: true }),
    makeCase("bug-real-003", "regressoes_reais", "vendi 30kg de ração", { tipo: "ESTOQUE_SAIDA", naoTipo: ["ESTOQUE_ENTRADA"], dados: { quantidade: 30, venda: true }, camposFaltantes: ["valor"], critica: true }),
    makeCase("bug-real-004", "regressoes_reais", "vendi 30kg de ração por 300 reais", { tipo: "ESTOQUE_SAIDA", dados: { quantidade: 30, valor: 300, venda: true }, critica: true }),
    makeCase("bug-real-005", "regressoes_reais", "cadastrar boi Anderson 320kg", { tipo: "CADASTRO_ANIMAL", dados: { categoria: "boi" }, naoDevePerguntar: ["nome", "peso", "categoria"], critica: true }),
    makeCase("bug-real-006", "regressoes_reais", "nova novilha Estrela brinco A12 peso 280kg", { tipo: "CADASTRO_ANIMAL", dados: { categoria: "novilha", animal_codigo: "A12" }, naoDevePerguntar: ["nome", "peso", "categoria"], critica: true }),
    makeCase("bug-real-007", "regressoes_reais", "20 mil", { tipo: "RECEITA_VENDA", dados: { valor: 20000 }, critica: true }, { contexto: { pending: "recebi dinheiro" } }),
    makeCase("bug-real-008", "regressoes_reais", "50.5 litros", { tipo: "PRODUCAO_LEITE", dados: { litros: 50.5 }, critica: true }, { contexto: { pending: "vaca 2 deu leite" } }),
    makeCase("bug-real-009", "regressoes_reais", "a vaca do curral morreu", { tipo: "MORTE", camposFaltantes: ["animal_codigo"], critica: true }),
    makeCase("bug-real-010", "regressoes_reais", "apliquei aftosa na b002", { tipo: "VACINA_MEDICAMENTO", dados: { animal_codigo: "B-002", produto: "aftosa" }, critica: true }),
    makeCase("bug-real-011", "regressoes_reais", "o que eu registrei hoje?", { tipo: "CONSULTA_REGISTROS_HOJE", deveConsultar: true, critica: true }),
    makeCase("bug-real-012", "regressoes_reais", "vaca B-002 deu 30 litros no tanque", { tipo: "PRODUCAO_LEITE", dados: { litros: 30, destino_leite: "tanque" }, critica: true })
  ];
  const fillers = Array.from({ length: 58 }, (_, index) => cycle([
    makeCase(`regressao-extra-${String(index + 1).padStart(3, "0")}`, "regressoes_reais", "comprei 3 saco de sal mineral por 180 reais", { tipo: "ESTOQUE_ENTRADA", dados: { quantidade: 3, valor: 180, compra: true } }),
    makeCase(`regressao-extra-${String(index + 1).padStart(3, "0")}`, "regressoes_reais", "vendi bezerro por 15 mil", { tipo: "RECEITA_VENDA", dados: { valor: 15000 } }),
    makeCase(`regressao-extra-${String(index + 1).padStart(3, "0")}`, "regressoes_reais", "apliquei vacina contra brucelose na B-002", { tipo: "VACINA_MEDICAMENTO", dados: { animal_codigo: "B-002", produto: "brucelose" } })
  ], index));
  return [...required, ...fillers];
}

function allCases() {
  return [
    ...makeAnimalCases(),
    ...makeProductionCases(),
    ...makeStockCases(),
    ...makeFinanceCases(),
    ...makeEventCases(),
    ...makeConsultCases(),
    ...makeBatchCases(),
    ...makeSessionCases(),
    ...makeDateCases(),
    ...makeTypoCases(),
    ...makePermissionCases(),
    ...makeAmbiguousCases(),
    ...makeRegressionCases()
  ];
}

function summarizeByDomain(results) {
  const map = {};
  for (const result of results) {
    map[result.dominio] ||= { total: 0, aprovados: 0, falhos: 0, taxa: 0 };
    map[result.dominio].total += 1;
    if (result.ok) map[result.dominio].aprovados += 1;
    else map[result.dominio].falhos += 1;
  }
  for (const item of Object.values(map)) {
    item.taxa = Number(((item.aprovados / item.total) * 100).toFixed(2));
  }
  return map;
}

function topFailurePatterns(failures) {
  const counts = {};
  for (const failure of failures) {
    for (const diff of failure.diferenca) {
      const key = diff.replace(/recebido .+$/i, "recebido ...");
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([pattern, count]) => ({ pattern, count }));
}

function main() {
  const cases = allCases();
  const results = cases.map((testCase) => {
    let parsed;
    let failures;
    try {
      parsed = parseCase(testCase);
      failures = assertCase(testCase, parsed);
    } catch (error) {
      parsed = null;
      failures = [error instanceof Error ? error.message : String(error)];
    }
    const ok = failures.length === 0;
    const classification = ok ? "ok" : classifyFailure(testCase, parsed, failures);
    return {
      ok,
      id: testCase.id,
      dominio: testCase.dominio,
      mensagem: testCase.mensagem,
      usuarioSimulado: testCase.usuarioSimulado,
      esperado: testCase.esperado,
      recebido: parsed ? {
        tipo: parsed.tipo,
        dados: parsed.dados,
        perguntas_faltantes: parsed.perguntas_faltantes,
        resumo: parsed.resumo,
        decision: parsed.decision,
        flags: parsed.flags || []
      } : null,
      diferenca: failures,
      classificacao: classification,
      provavelCausa: ok ? null : probableCause(failures),
      usouIaFallback: parsed?.decision === "gemini_fallback"
    };
  });

  const failures = results.filter((result) => !result.ok);
  const passed = results.length - failures.length;
  const critical = failures.filter((failure) => failure.classificacao === "critica");
  const acceptable = failures.filter((failure) => failure.classificacao === "aceitavel");
  const fallbackUsed = results.filter((result) => result.usouIaFallback);
  const fallbackUnexpected = results.filter((result) => result.usouIaFallback && result.esperado?.naoUsarIaFallback);
  const successRate = Number(((passed / results.length) * 100).toFixed(2));
  const byDomain = summarizeByDomain(results);

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      aprovados: passed,
      falhos: failures.length,
      taxaGeral: successRate,
      porDominio: byDomain,
      falhasCriticas: critical.length,
      falhasAceitaveis: acceptable.length,
      casosComIaFallback: fallbackUsed.length,
      fallbackInesperado: fallbackUnexpected.length
    },
    top20PadroesFalha: topFailurePatterns(failures),
    falhasCriticas: critical,
    falhasAceitaveis: acceptable,
    casosComIaFallback: fallbackUsed.map((item) => item.id),
    fallbackInesperado: fallbackUnexpected,
    falhas: failures,
    resultados: results
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");

  console.log("Bot heavy test offline Rancho");
  console.log("WhatsApp real: nao envia mensagens");
  console.log("Supabase: nao usa banco real");
  console.log(`Total: ${results.length}`);
  console.log(`Aprovados: ${passed}`);
  console.log(`Falhos: ${failures.length}`);
  console.log(`Taxa geral: ${successRate}%`);
  console.log(`Falhas criticas: ${critical.length}`);
  console.log(`Falhas aceitaveis/ambiguas: ${acceptable.length}`);
  console.log(`Casos com IA fallback: ${fallbackUsed.length}`);
  console.log(`Fallback inesperado: ${fallbackUnexpected.length}`);
  console.log("Taxa por dominio:");
  for (const [domain, stats] of Object.entries(byDomain)) {
    console.log(`- ${domain}: ${stats.aprovados}/${stats.total} (${stats.taxa}%)`);
  }
  console.log("Top padroes de falha:");
  for (const item of report.top20PadroesFalha) console.log(`- ${item.count}x ${item.pattern}`);
  console.log(`Relatorio JSON: ${REPORT_JSON}`);

  if (critical.length || fallbackUnexpected.length || successRate < 90) {
    process.exit(1);
  }
}

main();
