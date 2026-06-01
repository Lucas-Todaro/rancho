const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");

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
const { normalizeWhatsappNumber } = require("../src/lib/phone.ts");
const {
  animalBlockedMessage,
  isAnimalInactiveForBot
} = require("../src/lib/whatsapp/animal-status.ts");

const mockAnimals = [
  { id: "animal-b-002", brinco: "B-002" },
  { id: "animal-002", brinco: "002" },
  { id: "animal-2", brinco: "2" },
  { id: "animal-15", brinco: "15" },
  { id: "animal-a12", brinco: "A12" },
  { id: "animal-malhada", brinco: "MALHADA" },
  { id: "animal-preta", brinco: "PRETA" }
];

const mockStock = [
  { id: "item-racao-boi", nome: "Ração de boi" },
  { id: "item-racao", nome: "Ração" },
  { id: "item-milho", nome: "Milho" },
  { id: "item-feno", nome: "Feno" },
  { id: "item-sal-mineral", nome: "Sal mineral" },
  { id: "item-racao-especial", nome: "Ração especial" },
  { id: "item-mistura-lactacao", nome: "Mistura lactação" },
  { id: "item-nucleo-mineral", nome: "Núcleo mineral" },
  { id: "item-aftosa", nome: "Aftosa" },
  { id: "item-terramicina", nome: "Terramicina" },
  { id: "item-remedio", nome: "Remédio" },
  { id: "item-suplemento", nome: "Suplemento" }
];

const mockUsers = [
  { nome: "Dono", telefone: "5583999999999", admin: true, fazenda_id: "mock-fazenda-1" },
  { nome: "João", telefone: "5583888888888", admin: false, fazenda_id: "mock-fazenda-1" }
];

const animalStatusTests = [
  { name: "bloqueia producao para animal morto", animal: { id: "animal-morto", brinco: "M-001", status: "morto" }, intent: "PRODUCAO_LEITE", responseIncludes: "morto/inativo" },
  { name: "bloqueia vacina para animal inativo", animal: { id: "animal-inativo", brinco: "I-001", status: "inativo" }, intent: "VACINA_MEDICAMENTO", responseIncludes: "vacina ou medicamento" },
  { name: "permite registro para animal ativo", animal: { id: "animal-ativo", brinco: "A-001", status: "ativo" }, intent: "PRODUCAO_LEITE", allowed: true }
];

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function normalize(value) {
  return normalizeCatalogText(String(value ?? ""));
}

function parseResolved(phrase) {
  return resolveParsed(parseRanchoMessage(phrase));
}

function resolveParsed(parsed) {
  const dados = { ...(parsed.dados || {}) };

  if (["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(parsed.tipo) && dados.animal_codigo) {
    const resolved = resolveAnimalIdentifier(dados.animal_codigo, mockAnimals);
    if (resolved.row && resolved.status !== "ambiguous") {
      dados.animal_codigo = resolved.row.brinco;
      dados.animal_id = resolved.row.id;
    }
  }

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE"].includes(parsed.tipo) && dados.item_nome) {
    const itemExtraido = dados.item_nome;
    const resolved = resolveStockItem(itemExtraido, mockStock);
    dados.item_extraido = itemExtraido;
    dados.item_normalizado = normalizeCatalogText(itemExtraido);
    dados.origem_catalogo = "mock";
    dados.quantidade_itens_catalogo = mockStock.length;
    dados.candidatos_catalogo = (resolved.rows?.length ? resolved.rows : resolved.row ? [resolved.row] : mockStock.slice(0, 8)).map((row) => row.nome);
    dados.status_resolucao = resolved.status;
    dados.score_resolucao = Number(resolved.score.toFixed(3));
    dados.item_estoque_encontrado = Boolean(resolved.row && resolved.status !== "ambiguous" && resolved.score >= 0.86);
    dados.motivo_processamento = parsed.tipo === "ESTOQUE_ENTRADA" && dados.compra
      ? dados.item_estoque_encontrado ? "item_encontrado: estoque+financeiro" : "item_nao_encontrado: fluxo_criar_item_ou_financeiro"
      : dados.item_estoque_encontrado ? "item_encontrado" : "item_nao_encontrado";

    if (resolved.row && resolved.status !== "ambiguous" && resolved.score >= 0.86) {
      dados.item_nome = resolved.row.nome;
      dados.item_id = resolved.row.id;
      dados.item_resolvido = resolved.row.nome;
    } else {
      dados.item_resolvido = null;
      dados.item_id = null;
    }
  }

  return refreshRanchoMessage(parsed, dados);
}

function pendingFrom(phrase, replies = []) {
  return replies.reduce((current, reply) => resolveParsed(mergeRanchoMessageData(current, reply)), parseResolved(phrase));
}

function canonicalIntent(tipo, dados) {
  if (tipo === "VACINA" || tipo === "TRATAMENTO") return "VACINA_MEDICAMENTO";
  if (tipo === "ENTRADA_ESTOQUE" || tipo === "COMPRA_ESTOQUE") return "ESTOQUE_ENTRADA";
  if (tipo === "SAIDA_ESTOQUE") return "ESTOQUE_SAIDA";
  if (tipo === "CONSULTA_ESTOQUE_ITEM") return "CONSULTA_ESTOQUE";
  if (tipo === "CRIAR_ITEM_ESTOQUE") return "CRIAR_ITEM_ESTOQUE";
  if (tipo === "ESTOQUE_CADASTRO") return "CRIAR_ITEM_ESTOQUE";
  return tipo;
}

function missingContains(parsed, field) {
  const text = normalize(parsed.perguntas_faltantes.join(" "));
  const checks = {
    animal_codigo: /animal|brinco/.test(text),
    litros: /litro/.test(text),
    quantidade: /quantidade/.test(text),
    unidade: /unidade/.test(text),
    valor: /valor|custou/.test(text),
    telefone: /whatsapp|ddd/.test(text),
    item_nome: /item|estoque/.test(text)
  };
  return Boolean(checks[field]);
}

function assertExpected(test, parsed) {
  const failures = [];
  const dados = parsed.dados || {};
  const expected = test.expected || {};

  if (expected.tipo && canonicalIntent(parsed.tipo, dados) !== canonicalIntent(expected.tipo, expected)) {
    failures.push(`tipo esperado ${expected.tipo}, recebido ${parsed.tipo}`);
  }

  if (expected.compra && !dados.compra) failures.push("esperava compra=true");
  if (expected.evento_tipo && normalize(dados.evento_tipo) !== normalize(expected.evento_tipo)) failures.push(`evento_tipo esperado ${expected.evento_tipo}, recebido ${dados.evento_tipo}`);
  if (expected.animal && normalize(dados.animal_codigo) !== normalize(expected.animal)) failures.push(`animal esperado ${expected.animal}, recebido ${dados.animal_codigo}`);
  if (expected.animalAny && !expected.animalAny.map(normalize).includes(normalize(dados.animal_codigo))) failures.push(`animal esperado um de ${expected.animalAny.join(", ")}, recebido ${dados.animal_codigo}`);
  if ("litros" in expected && Number(dados.litros) !== Number(expected.litros)) failures.push(`litros esperado ${expected.litros}, recebido ${dados.litros}`);
  if (expected.produto && normalize(dados.produto) !== normalize(expected.produto)) failures.push(`produto esperado ${expected.produto}, recebido ${dados.produto}`);
  if (expected.item && normalize(dados.item_nome) !== normalize(expected.item)) failures.push(`item esperado ${expected.item}, recebido ${dados.item_nome}`);
  if (expected.normalizedItem && normalize(dados.item_normalizado) !== normalize(expected.normalizedItem)) failures.push(`item normalizado esperado ${expected.normalizedItem}, recebido ${dados.item_normalizado}`);
  if (expected.itemId && dados.item_id !== expected.itemId) failures.push(`item_id esperado ${expected.itemId}, recebido ${dados.item_id}`);
  if (expected.catalogSource && normalize(dados.origem_catalogo) !== normalize(expected.catalogSource)) failures.push(`origem_catalogo esperado ${expected.catalogSource}, recebido ${dados.origem_catalogo}`);
  if ("itemFound" in expected && Boolean(dados.item_estoque_encontrado) !== Boolean(expected.itemFound)) failures.push(`item_estoque_encontrado esperado ${expected.itemFound}, recebido ${dados.item_estoque_encontrado}`);
  if (expected.motivoIncludes && !normalize(dados.motivo_processamento).includes(normalize(expected.motivoIncludes))) failures.push(`motivo esperado contendo ${expected.motivoIncludes}, recebido ${dados.motivo_processamento}`);
  if ("quantidade" in expected && Number(dados.quantidade) !== Number(expected.quantidade)) failures.push(`quantidade esperada ${expected.quantidade}, recebida ${dados.quantidade}`);
  if (expected.unidade && normalize(dados.unidade) !== normalize(expected.unidade)) failures.push(`unidade esperada ${expected.unidade}, recebida ${dados.unidade}`);
  if ("valor" in expected && Number(dados.valor) !== Number(expected.valor)) failures.push(`valor esperado ${expected.valor}, recebido ${dados.valor}`);
  if (expected.descricao && !normalize(dados.descricao).includes(normalize(expected.descricao))) failures.push(`descrição esperada ${expected.descricao}, recebida ${dados.descricao}`);
  if (expected.funcionario_nome && normalize(dados.funcionario_nome) !== normalize(expected.funcionario_nome)) failures.push(`funcionário esperado ${expected.funcionario_nome}, recebido ${dados.funcionario_nome}`);
  if (expected.telefone && normalizeWhatsappNumber(dados.telefone) !== expected.telefone) failures.push(`telefone esperado ${expected.telefone}, recebido ${dados.telefone}`);
  if (expected.ponto_tipo && dados.ponto_tipo !== expected.ponto_tipo) failures.push(`ponto_tipo esperado ${expected.ponto_tipo}, recebido ${dados.ponto_tipo}`);
  if (expected.horario && dados.horario !== expected.horario) failures.push(`horário esperado ${expected.horario}, recebido ${dados.horario}`);
  if (expected.destino && normalize(dados.destino) !== normalize(expected.destino)) failures.push(`destino esperado ${expected.destino}, recebido ${dados.destino}`);
  if (expected.local && normalize(dados.local) !== normalize(expected.local)) failures.push(`local esperado ${expected.local}, recebido ${dados.local}`);
  if (expected.itemUnresolved && dados.item_id) failures.push(`item deveria ficar sem resolução oficial, recebeu item_id ${dados.item_id}`);
  if (expected.resumoIncludes && !normalize(parsed.resumo).includes(normalize(expected.resumoIncludes))) failures.push(`resumo deveria conter "${expected.resumoIncludes}", recebeu "${parsed.resumo}"`);

  for (const field of expected.missing || []) {
    if (hasValue(dados[field])) failures.push(`campo ${field} deveria estar faltando, recebido ${dados[field]}`);
    if (!missingContains(parsed, field)) failures.push(`pergunta faltante para ${field} não encontrada`);
  }

  if (expected.noMissing && parsed.perguntas_faltantes.length > 0) {
    failures.push(`não esperava pendências, recebeu: ${parsed.perguntas_faltantes.join(" | ")}`);
  }

  return failures;
}

function adminActionDenied(test, parsed) {
  const actor = mockUsers.find((user) => user.nome === test.actor);
  if (!actor || actor.admin) return null;
  if (["CRIAR_ITEM_ESTOQUE", "CRIAR_FUNCIONARIO"].includes(parsed.tipo)) {
    return parsed.tipo === "CRIAR_ITEM_ESTOQUE"
      ? "Você não tem permissão para criar itens de estoque. Peça para um administrador cadastrar esse item."
      : "Você não tem permissão para cadastrar funcionários pelo bot. Peça para um administrador fazer esse cadastro.";
  }
  return null;
}

const mandatoryTests = [
  { phrase: "vaca 2 deu leite", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], missing: ["litros"] } },
  { phrase: "a vaca 15 produziu leite", expected: { tipo: "PRODUCAO_LEITE", animal: "15", missing: ["litros"] } },
  { phrase: "vaca 2 deu 18 litros", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 18 } },
  { phrase: "32 litros da B-002", expected: { tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 32 } },
  { phrase: "apliquei aftosa na b002", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "vacina", produto: "aftosa", animal: "B-002" } },
  { phrase: "mediquei b002 com terramicina", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "tratamento", produto: "terramicina", animal: "B-002" } },
  { phrase: "nasceu bezerro da vaca B-002", expected: { tipo: "PARTO", animal: "B-002" } },
  { phrase: "a vaca do fundo morreu", expected: { tipo: "MORTE", local: "fundo", missing: ["animal_codigo"] } },
  { phrase: "bota 20kg de racao de boi no estoque", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 20, unidade: "kg", item: "Ração de boi" } },
  { phrase: "lança 20kg de ração de boi no estoque", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 20, unidade: "kg", item: "Ração de boi" } },
  { phrase: "chegou 5 fardos de feno", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 5, unidade: "fardo", item: "Feno" } },
  { phrase: "tira 20kg de ração de boi do estoque", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 20, unidade: "kg", item: "Ração de boi" } },
  { phrase: "dei 2 fardos de feno pros bois", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 2, unidade: "fardo", item: "Feno", destino: "bois" } },
  { phrase: "me mostre o estoque de ração de boi", expected: { tipo: "CONSULTA_ESTOQUE", item: "Ração de boi" } },
  { phrase: "comprei 10 sacos de ração", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 10, unidade: "saco", item: "Ração", missing: ["valor"] } },
  { phrase: "comprei 10 sacos de ração por 300 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 10, unidade: "saco", item: "Ração", valor: 300 } },
  { phrase: "comprei ração de boi por 300 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Ração de boi", valor: 300, missing: ["quantidade"] } },
  { phrase: "criar estoque de ração de bezerro", expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração de bezerro", missing: ["unidade"] } },
  { phrase: "cadastrar funcionário João 83996732761", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "João", telefone: "5583996732761", noMissing: true } },
  { phrase: "paguei 120 no remédio", expected: { tipo: "DESPESA", valor: 120, descricao: "remédio" } }
];

const extraTests = [
  { phrase: "B-002 deu 21 litros hoje", expected: { tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 21 } },
  { phrase: "002 deu 14 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "002", litros: 14 } },
  { phrase: "vaca MALHADA deu 17 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "MALHADA", litros: 17 } },
  { phrase: "preta produziu 12", expected: { tipo: "PRODUCAO_LEITE", animal: "PRETA", litros: 12 } },
  { phrase: "vaca A12 fez 9 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "A12", litros: 9 } },
  { phrase: "ordenha da B002 19 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 19 } },
  { phrase: "a vaca 15 produziu 20", expected: { tipo: "PRODUCAO_LEITE", animal: "15", litros: 20 } },
  { phrase: "vaca 2 produziu 20", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 20 } },
  { phrase: "vaca 2 fez leite", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], missing: ["litros"] } },
  { phrase: "registra 25 litros da vaca 2", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 25 } },
  { phrase: "vacinei B002 com aftosa", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "vacina", produto: "aftosa", animal: "B-002" } },
  { phrase: "vaca 2 recebeu vacina da raiva", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "vacina", produto: "raiva", animalAny: ["2", "002"], resumoIncludes: "vacina de raiva" } },
  { phrase: "vaca 2 tomou vacina de aftosa", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "vacina", produto: "aftosa", animalAny: ["2", "002"] } },
  { phrase: "apliquei vacina contra brucelose na B-002", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "vacina", produto: "brucelose", animal: "B-002" } },
  { phrase: "terramicina na vaca b-002", expected: { tipo: "VACINA_MEDICAMENTO", produto: "terramicina", animal: "B-002" } },
  { phrase: "remedio na 15", expected: { tipo: "VACINA_MEDICAMENTO", produto: "remedio", animal: "15" } },
  { phrase: "tratei a vaca malhada com remedio", expected: { tipo: "VACINA_MEDICAMENTO", evento_tipo: "tratamento", produto: "remedio", animal: "MALHADA" } },
  { phrase: "B-002 pariu hoje", expected: { tipo: "PARTO", animal: "B-002" } },
  { phrase: "deu cria a vaca 15", expected: { tipo: "PARTO", animal: "15" } },
  { phrase: "morreu a 002", expected: { tipo: "MORTE", animal: "002" } },
  { phrase: "a preta morreu no fundo", expected: { tipo: "MORTE", animal: "PRETA", local: "fundo" } },
  { phrase: "parto da vaca MALHADA", expected: { tipo: "PARTO", animal: "MALHADA" } },
  { phrase: "nasceu bezerra da vaca B002", expected: { tipo: "PARTO", animal: "B-002" } },
  { phrase: "coloca 3 sacos de milho no estoque", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 3, unidade: "saco", item: "Milho" } },
  { phrase: "recebemos 8 sacos de sal mineral", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 8, unidade: "saco", item: "Sal mineral" } },
  { phrase: "entrada 4 doses de aftosa", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 4, unidade: "dose", item: "Aftosa" } },
  { phrase: "adiciona 2 caixas de remedio no estoque", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 2, unidade: "caixa", item: "Remédio" } },
  { phrase: "bota 15 kg de racão de boi", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 15, unidade: "kg", item: "Ração de boi" } },
  { phrase: "lanca 6 fardos de feno", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 6, unidade: "fardo", item: "Feno" } },
  { phrase: "chegou 10 kg de suplemento", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 10, unidade: "kg", item: "Suplemento" } },
  { phrase: "retirei 1 dose de aftosa", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 1, unidade: "dose", item: "Aftosa" } },
  { phrase: "usei 2 doses de terramicina", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 2, unidade: "dose", item: "Terramicina" } },
  { phrase: "da baixa em 3 sacos de milho", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 3, unidade: "saco", item: "Milho" } },
  { phrase: "tirar 5 kg de sal mineral", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 5, unidade: "kg", item: "Sal mineral" } },
  { phrase: "saiu 2 unidades de remedio", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 2, unidade: "unidade", item: "Remédio" } },
  { phrase: "consumiu 20kg de racao", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 20, unidade: "kg", item: "Ração" } },
  { phrase: "dei 1 fardo de feno para os bois", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 1, unidade: "fardo", item: "Feno", destino: "bois" } },
  { phrase: "gastei 2 kg de suplemento", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 2, unidade: "kg", item: "Suplemento" } },
  { phrase: "tira 1 saco de ração", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 1, unidade: "saco", item: "Ração" } },
  { phrase: "quanto tem de milho no estoque", expected: { tipo: "CONSULTA_ESTOQUE", item: "Milho" } },
  { phrase: "estoque de sal mineral", expected: { tipo: "CONSULTA_ESTOQUE", item: "Sal mineral" } },
  { phrase: "ver estoque", expected: { tipo: "CONSULTA_ESTOQUE" } },
  { phrase: "mostrar estoque", expected: { tipo: "CONSULTA_ESTOQUE" } },
  { phrase: "saldo do estoque de feno", expected: { tipo: "CONSULTA_ESTOQUE", item: "Feno" } },
  { phrase: "me mostra quanto tem de racao", expected: { tipo: "CONSULTA_ESTOQUE", item: "Ração" } },
  { phrase: "consulta estoque de terramicina", expected: { tipo: "CONSULTA_ESTOQUE", item: "Terramicina" } },
  { phrase: "tem aftosa no estoque", expected: { tipo: "CONSULTA_ESTOQUE", item: "Aftosa" } },
  { phrase: "comprei milho por 100 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Milho", valor: 100, missing: ["quantidade"] } },
  { phrase: "comprei 2 sacos de milho", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 2, unidade: "saco", item: "Milho", missing: ["valor"] } },
  { phrase: "compra de 5 fardos de feno por 250", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 5, unidade: "fardo", item: "Feno", valor: 250 } },
  { phrase: "comprei 1 dose de aftosa por 50 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 1, unidade: "dose", item: "Aftosa", valor: 50 } },
  { phrase: "comprei suplemento", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Suplemento", missing: ["quantidade", "valor"] } },
  { phrase: "comprei 10 sacos de racbao por 300 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 10, unidade: "saco", item: "Ração", valor: 300 } },
  { phrase: "comprei 10 sacos de ração de boi por R$ 300", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 10, unidade: "saco", item: "Ração de boi", valor: 300 } },
  { phrase: "comprei ração", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Ração", missing: ["quantidade", "valor"] } },
  { phrase: "recebi 900 do leite", expected: { tipo: "RECEITA_VENDA", valor: 900, descricao: "leite" } },
  { phrase: "vendi leite por 800 reais", expected: { tipo: "RECEITA_VENDA", valor: 800, descricao: "leite" } },
  { phrase: "despesa de 45 com energia", expected: { tipo: "DESPESA", valor: 45, descricao: "energia" } },
  { phrase: "paguei 300 de veterinario", expected: { tipo: "DESPESA", valor: 300, descricao: "veterinario" } },
  { phrase: "gastei 80 com diesel", expected: { tipo: "DESPESA", valor: 80, descricao: "diesel" } },
  { phrase: "entrada de 1200 venda de queijo", expected: { tipo: "RECEITA_VENDA", valor: 1200, descricao: "queijo" } },
  { phrase: "João entrou às 7:30", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "joao", ponto_tipo: "entrada", horario: "07:30" } },
  { phrase: "Maria saiu as 17h", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "maria", ponto_tipo: "saida", horario: "17:00" } },
  { phrase: "registrar ponto do João", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "João", ponto_tipo: "entrada" } },
  { phrase: "Maria entrou 8 horas", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "maria", ponto_tipo: "entrada", horario: "08:00" } },
  { phrase: "cadastrar funcionário Pedro", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Pedro", missing: ["telefone"] } },
  { phrase: "cria funcionário Maria 83911112222", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Maria", telefone: "5583911112222", noMissing: true } },
  { phrase: "adicionar funcionário Ana WhatsApp +55 (83) 98888-7777", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Ana", telefone: "5583988887777", noMissing: true } },
  { phrase: "cadastrar vaqueiro José 83922223333", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "José", telefone: "5583922223333", noMissing: true } },
  { phrase: "83996732761", pending: () => pendingFrom("cadastrar funcionário João"), expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "João", telefone: "5583996732761", noMissing: true } },
  { phrase: "kg", pending: () => pendingFrom("criar estoque de ração de bezerro"), expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração de bezerro", unidade: "kg", missing: ["quantidade"] } },
  { phrase: "0", pending: () => pendingFrom("criar estoque de ração de bezerro", ["kg"]), expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração de bezerro", unidade: "kg", quantidade: 0, noMissing: true } },
  { phrase: "32", pending: () => pendingFrom("vaca 2 deu leite"), expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 32, noMissing: true } }
];

const regressionTests = [
  { phrase: "a malhada deu leite", expected: { tipo: "PRODUCAO_LEITE", animal: "MALHADA", missing: ["litros"] } },
  { phrase: "a vaca do curral morreu", expected: { tipo: "MORTE", local: "curral", missing: ["animal_codigo"] } },
  { phrase: "a vaca do fundo morreu", expected: { tipo: "MORTE", local: "fundo", missing: ["animal_codigo"] } },
  { phrase: "a preta pariu", expected: { tipo: "PARTO", animal: "PRETA" } },
  { phrase: "comprei 3 saco de sal mineral por 180 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Sal mineral", itemId: "item-sal-mineral", itemFound: true, motivoIncludes: "estoque+financeiro", quantidade: 3, unidade: "saco", valor: 180, resumoIncludes: "3 sacos" } },
  { phrase: "comprei 5 sacos de ração especial por 200 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Ração especial", itemId: "item-racao-especial", itemFound: true, catalogSource: "mock", motivoIncludes: "estoque+financeiro", quantidade: 5, unidade: "saco", valor: 200 } },
  { phrase: "comprei 10kg de mistura lactação por 150 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Mistura lactação", itemId: "item-mistura-lactacao", itemFound: true, catalogSource: "mock", motivoIncludes: "estoque+financeiro", quantidade: 10, unidade: "kg", valor: 150 } },
  { phrase: "comprei 2 sacos de núcleo mineral por 90 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Núcleo mineral", itemId: "item-nucleo-mineral", itemFound: true, catalogSource: "mock", motivoIncludes: "estoque+financeiro", quantidade: 2, unidade: "saco", valor: 90 } },
  { phrase: "comprei 3 sacos de sal mineral por 180 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Sal mineral", quantidade: 3, unidade: "saco", valor: 180 } },
  { phrase: "comprei sal mineral por 180 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Sal mineral", valor: 180, missing: ["quantidade"] } },
  { phrase: "comprei 3 saco de sal minral por 180 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Sal mineral", itemId: "item-sal-mineral", itemFound: true, motivoIncludes: "estoque+financeiro", quantidade: 3, unidade: "saco", valor: 180 } },
  { phrase: "comprei 3 saco de sal por 180 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Sal mineral", itemId: "item-sal-mineral", itemFound: true, quantidade: 3, unidade: "saco", valor: 180 } },
  { phrase: "estoque de saco de sal mineral", expected: { tipo: "CONSULTA_ESTOQUE", item: "Sal mineral", itemId: "item-sal-mineral", itemFound: true } },
  { phrase: "estoque de sal minral", expected: { tipo: "CONSULTA_ESTOQUE", item: "Sal mineral", itemId: "item-sal-mineral", itemFound: true } },
  { phrase: "comprei 3 sacos de item inexistente por 180 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 3, unidade: "saco", valor: 180, itemUnresolved: true, itemFound: false, motivoIncludes: "item_nao_encontrado" } },
  { phrase: "comprei 5 sacos de coisa aleatória por 200 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "coisa aleatória", quantidade: 5, unidade: "saco", valor: 200, itemUnresolved: true, itemFound: false, motivoIncludes: "item_nao_encontrado" } },
  { phrase: "comprei 5 de ração especial por 200 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Ração especial", itemId: "item-racao-especial", itemFound: true, quantidade: 5, valor: 200, missing: ["unidade"] } },
  { phrase: "chegou racao de boi", expected: { tipo: "ESTOQUE_ENTRADA", item: "Ração de boi", missing: ["quantidade"] } },
  { phrase: "botei 25kg de racao boi", expected: { tipo: "ESTOQUE_ENTRADA", item: "Ração de boi", quantidade: 25, unidade: "kg" } },
  { phrase: "entrou 25kg de racao de boi", expected: { tipo: "ESTOQUE_ENTRADA", item: "Ração de boi", quantidade: 25, unidade: "kg" } },
  { phrase: "chegou 5 fardos de feno", expected: { tipo: "ESTOQUE_ENTRADA", item: "Feno", quantidade: 5, unidade: "fardo" } },
  { phrase: "tira 5 dose de aftosa do estoque", expected: { tipo: "ESTOQUE_SAIDA", item: "Aftosa", quantidade: 5, unidade: "dose", resumoIncludes: "5 doses" } },
  { phrase: "tira 1 dose de aftosa do estoque", expected: { tipo: "ESTOQUE_SAIDA", item: "Aftosa", quantidade: 1, unidade: "dose", resumoIncludes: "1 dose" } },
  { phrase: "criar estoque de ração de bezerro", actor: "Dono", expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração de bezerro", missing: ["unidade"] } },
  { phrase: "criar estoque de ração de bezerro", actor: "João", expected: { responseIncludes: "não tem permissão" } },
  { phrase: "cadastrar funcionário Pedro 83999999999", actor: "Dono", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Pedro", telefone: "5583999999999", noMissing: true } },
  { phrase: "cadastrar funcionário Pedro 83999999999", actor: "João", expected: { responseIncludes: "não tem permissão" } }
];

const decimalRegressionTests = [
  { phrase: "vaca 2 deu 50.5 litros", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 50.5 } },
  { phrase: "B-002 deu 50,5 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 50.5 } },
  { phrase: "vaca 15 produziu 1.5 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "15", litros: 1.5 } },
  { phrase: "vaca 2 deu leite", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], missing: ["litros"] } },
  { phrase: "usei 1,5 kg de ração de boi", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 1.5, unidade: "kg", item: "Ração de boi" } },
  { phrase: "bota 2.5 kg de milho no estoque", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 2.5, unidade: "kg", item: "Milho" } },
  { phrase: "chegou 2,5 sacos de sal mineral", expected: { tipo: "ESTOQUE_ENTRADA", quantidade: 2.5, unidade: "saco", item: "Sal mineral" } },
  { phrase: "tira 0,5 dose de remédio do estoque", expected: { tipo: "ESTOQUE_SAIDA", quantidade: 0.5, unidade: "dose", item: "Remédio" } },
  { phrase: "comprei 10 sacos de ração por 300,50 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 10, unidade: "saco", item: "Ração", valor: 300.5 } },
  { phrase: "comprei 2,5 sacos de ração por 300 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 2.5, unidade: "saco", item: "Ração", valor: 300 } },
  { phrase: "comprei 20kg de ração por R$ 1.200,50", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 20, unidade: "kg", item: "Ração", valor: 1200.5 } },
  { phrase: "comprei 1.5 fardos de feno por 90,50 reais", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 1.5, unidade: "fardo", item: "Feno", valor: 90.5 } },
  { phrase: "50.5", pending: () => pendingFrom("vaca 2 deu leite"), expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 50.5, noMissing: true } },
  { phrase: "300,50", pending: () => pendingFrom("comprei 2 sacos de milho"), expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Milho", quantidade: 2, unidade: "saco", valor: 300.5, noMissing: true } },
  { phrase: "2,5 sacos", pending: () => pendingFrom("comprei milho por 300 reais"), expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Milho", quantidade: 2.5, unidade: "saco", valor: 300, noMissing: true } }
];

const allTests = [...mandatoryTests, ...extraTests, ...regressionTests, ...decimalRegressionTests];

if (allTests.length < 90) {
  console.error(`Erro interno do test:bot: esperado ao menos 90 testes, recebido ${allTests.length}.`);
  process.exit(1);
}

const parserResults = allTests.map((test, index) => {
  try {
    const parsed = test.pending ? resolveParsed(mergeRanchoMessageData(test.pending(), test.phrase)) : parseResolved(test.phrase);
    const denied = adminActionDenied(test, parsed);
    if (test.expected?.responseIncludes) {
      const ok = denied && normalize(denied).includes(normalize(test.expected.responseIncludes));
      return {
        index: index + 1,
        test,
        parsed,
        response: denied,
        ok,
        failures: ok ? [] : [`resposta esperada contendo ${test.expected.responseIncludes}, recebida ${denied || "nenhuma"}`]
      };
    }
    const failures = denied ? [`ação bloqueada para ${test.actor}: ${denied}`] : assertExpected(test, parsed);
    return { index: index + 1, test, parsed, ok: failures.length === 0, failures };
  } catch (error) {
    return { index: index + 1, test, parsed: null, ok: false, failures: [error instanceof Error ? error.message : String(error)] };
  }
});

const animalResults = animalStatusTests.map((test, index) => {
  const blocked = isAnimalInactiveForBot(test.animal);
  const response = blocked ? animalBlockedMessage(test.animal, test.intent) : "";
  const ok = test.allowed ? !blocked : blocked && normalize(response).includes(normalize(test.responseIncludes));
  return {
    index: allTests.length + index + 1,
    test,
    parsed: null,
    response,
    ok,
    failures: ok ? [] : [`status animal falhou: blocked=${blocked}, response=${response}`]
  };
});

const results = [...parserResults, ...animalResults];

const failed = results.filter((result) => !result.ok);
const passed = results.length - failed.length;

console.log("Bot test offline Rancho");
console.log(`Usuários mockados: ${mockUsers.length}`);
console.log(`Total: ${results.length}`);
console.log(`Aprovados: ${passed}`);
console.log(`Falhos: ${failed.length}`);

for (const result of failed) {
  console.log("\n--- Falha", result.index, "---");
  console.log("Frase:", result.test.phrase || result.test.name);
  console.log("Esperado:", JSON.stringify(result.test.expected));
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
