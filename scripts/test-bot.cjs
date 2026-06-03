const fs = require("fs");
const path = require("path");
const Module = require("module");
const nodeCrypto = require("crypto");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const BOT_TEST_REPORT_JSON = path.join(root, "bot-test-report.json");
const BOT_TEST_REPORT_MD = path.join(root, "bot-test-report.md");
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
const { processWhatsappMessage } = require("../src/services/whatsapp/twilio.ts");

const mockAnimals = [
  { id: "animal-b-001", brinco: "B-001", nome: "Mimosa", sexo: "femea", categoria: "vaca", fase: "lactacao" },
  { id: "animal-b-002", brinco: "B-002", nome: "Estrela", sexo: "femea", categoria: "vaca", fase: "gestante", mae_id: "animal-b-001", pai_id: "animal-t-001" },
  { id: "animal-b-003", brinco: "B-003", nome: "Princesa", sexo: "femea", categoria: "novilha", fase: "lactacao", mae_id: "animal-b-002", pai_id: "animal-t-002" },
  { id: "animal-t-001", brinco: "T-001", nome: "Touro Rei", sexo: "macho", categoria: "touro", fase: "nao_aplicavel" },
  { id: "animal-t-002", brinco: "T-002", nome: "Touro Forte", sexo: "macho", categoria: "touro", fase: "nao_aplicavel" },
  { id: "animal-a12", brinco: "A12", nome: "Bezerro A12", sexo: "macho", categoria: "bezerro", fase: "crescimento" },
  { id: "animal-vaca-15", brinco: "VACA-15", nome: "Lua", sexo: "femea", categoria: "vaca", fase: "lactacao" },
  { id: "animal-n-033", brinco: "N-033", nome: "Novilha N-033", sexo: "femea", categoria: "novilha", fase: "crescimento" },
  { id: "animal-1", brinco: "1" },
  { id: "animal-002", brinco: "002" },
  { id: "animal-2", brinco: "2" },
  { id: "animal-3", brinco: "3" },
  { id: "animal-15", brinco: "15" },
  { id: "animal-n-01", brinco: "N-01" },
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
  { id: "item-vermifugo", nome: "Vermifugo" },
  { id: "item-antibiotico", nome: "Antibiotico" },
  { id: "item-carrapaticida", nome: "Carrapaticida" },
  { id: "item-suplemento", nome: "Suplemento" },
  { id: "item-leite-cru", nome: "Leite Cru" }
];

const mockUsers = [
  { nome: "Dono", telefone: "5583999999999", admin: true, fazenda_id: "mock-fazenda-1" },
  { nome: "João", telefone: "5583888888888", admin: false, fazenda_id: "mock-fazenda-1" }
];

const BOT_TEST_TABLES = {
  fazendas: "fazendas",
  usuarios: "usuarios",
  lotes: "lotes",
  animais: "animais",
  eventosAnimal: "eventos_animal",
  ordenhas: "ordenhas",
  estoqueItens: "estoque_itens",
  estoqueMovimentacoes: "estoque_movimentacoes",
  transacoesFinanceiras: "transacoes_financeiras",
  funcionarios: "funcionarios",
  registrosPonto: "registros_ponto",
  whatsappUsuarios: "whatsapp_usuarios",
  whatsappSessoes: "whatsapp_sessoes",
  whatsappMensagens: "whatsapp_mensagens",
  notificacoes: "notificacoes",
  auditoriaLogs: "auditoria_logs"
};

const BOT_TEST_BUSINESS_TABLES = new Set([
  BOT_TEST_TABLES.animais,
  BOT_TEST_TABLES.eventosAnimal,
  BOT_TEST_TABLES.ordenhas,
  BOT_TEST_TABLES.estoqueItens,
  BOT_TEST_TABLES.estoqueMovimentacoes,
  BOT_TEST_TABLES.transacoesFinanceiras,
  BOT_TEST_TABLES.funcionarios,
  BOT_TEST_TABLES.registrosPonto
]);

const BOT_TEST_FARM_ID = "mock-fazenda-1";
const BOT_TEST_FARM_ID_B = "mock-fazenda-2";
const BOT_TEST_ADMIN_PHONE = "5583999999999";
const BOT_TEST_ADMIN_PHONE_B = "5583777777777";
const BOT_TEST_WORKER_PHONE = "5583888888888";

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stockUnitFor(name) {
  const normalizedName = normalize(name);
  if (/leite/.test(normalizedName)) return "litro";
  if (/aftosa|terramicina|vacina|vermifugo|antibiotico|carrapaticida/.test(normalizedName)) return "dose";
  if (/feno/.test(normalizedName)) return "fardo";
  if (/remedio|suplemento/.test(normalizedName)) return "unidade";
  return "kg";
}

function createBotTestTables() {
  const now = new Date().toISOString();

  return {
    [BOT_TEST_TABLES.fazendas]: [
      { id: BOT_TEST_FARM_ID, ativa: true, nome: "Fazenda de teste" },
      { id: BOT_TEST_FARM_ID_B, ativa: true, nome: "Fazenda de teste B" }
    ],
    [BOT_TEST_TABLES.whatsappUsuarios]: [
      {
        id: "wa-admin",
        fazenda_id: BOT_TEST_FARM_ID,
        usuario_id: "user-admin",
        funcionario_id: null,
        telefone_e164: BOT_TEST_ADMIN_PHONE,
        nome_exibicao: "Dono",
        papel_bot: "admin",
        ativo: true
      },
      {
        id: "wa-worker",
        fazenda_id: BOT_TEST_FARM_ID,
        usuario_id: null,
        funcionario_id: "func-joao",
        telefone_e164: BOT_TEST_WORKER_PHONE,
        nome_exibicao: "Joao",
        papel_bot: "funcionario",
        ativo: true
      },
      {
        id: "wa-admin-b",
        fazenda_id: BOT_TEST_FARM_ID_B,
        usuario_id: "user-admin-b",
        funcionario_id: null,
        telefone_e164: BOT_TEST_ADMIN_PHONE_B,
        nome_exibicao: "Dono B",
        papel_bot: "admin",
        ativo: true
      }
    ],
    [BOT_TEST_TABLES.whatsappSessoes]: [],
    [BOT_TEST_TABLES.whatsappMensagens]: [],
    [BOT_TEST_TABLES.usuarios]: [
      {
        id: "user-admin",
        fazenda_id: BOT_TEST_FARM_ID,
        nome: "Dono",
        telefone: BOT_TEST_ADMIN_PHONE.slice(2),
        papel: "dono",
        ativo: true
      },
      {
        id: "user-worker",
        fazenda_id: BOT_TEST_FARM_ID,
        nome: "Usuario comum",
        telefone: "5583777777777",
        papel: "funcionario",
        ativo: true
      },
      {
        id: "user-admin-b",
        fazenda_id: BOT_TEST_FARM_ID_B,
        nome: "Dono B",
        telefone: BOT_TEST_ADMIN_PHONE_B.slice(2),
        papel: "dono",
        ativo: true
      }
    ],
    [BOT_TEST_TABLES.lotes]: [
      {
        id: "lote-lactacao-1",
        fazenda_id: BOT_TEST_FARM_ID,
        nome: "Lactacao 1",
        descricao: "Lote principal",
        ativo: true
      },
      {
        id: "lote-piquete-2",
        fazenda_id: BOT_TEST_FARM_ID,
        nome: "Piquete 2",
        descricao: "Piquete de teste",
        ativo: true
      }
    ],
    [BOT_TEST_TABLES.animais]: mockAnimals.map((animal, index) => ({
      ...animal,
      fazenda_id: BOT_TEST_FARM_ID,
      nome: animal.nome || animal.brinco,
      categoria: animal.categoria || (index % 2 === 0 ? "vaca" : "boi"),
      sexo: animal.sexo || (index % 2 === 0 ? "femea" : "macho"),
      fase: animal.fase || (animal.brinco === "B-002" ? "gestante" : "lactacao"),
      status: "ativo",
      raca: "Girolando",
      lote_id: "lote-lactacao-1",
      data_nascimento: animal.brinco === "B-002" ? "2021-05-10" : null,
      peso: animal.brinco === "B-002" ? 450 : null,
      observacoes: "",
      mae_id: animal.mae_id || null,
      pai_id: animal.pai_id || null,
      genealogia_observacoes: animal.genealogia_observacoes || null
    })).concat([
      {
        id: "animal-b2-b-001",
        fazenda_id: BOT_TEST_FARM_ID_B,
        brinco: "B-001",
        nome: "Mimosa",
        categoria: "vaca",
        sexo: "femea",
        fase: "lactacao",
        status: "ativo",
        raca: "Girolando",
        lote_id: null,
        data_nascimento: null,
        peso: null,
        observacoes: "",
        mae_id: null,
        pai_id: null,
        genealogia_observacoes: null
      },
      {
        id: "animal-b2-t-001",
        fazenda_id: BOT_TEST_FARM_ID_B,
        brinco: "T-001",
        nome: "Touro Rei",
        categoria: "touro",
        sexo: "macho",
        fase: "nao_aplicavel",
        status: "ativo",
        raca: "Girolando",
        lote_id: null,
        data_nascimento: null,
        peso: null,
        observacoes: "",
        mae_id: null,
        pai_id: null,
        genealogia_observacoes: null
      }
    ]),
    [BOT_TEST_TABLES.estoqueItens]: mockStock.map((item, index) => ({
      ...item,
      fazenda_id: BOT_TEST_FARM_ID,
      descricao: item.nome,
      categoria: "racao",
      quantidade_atual: index === 3 ? 4 : 100,
      quantidade_minima: 5,
      unidade_medida: stockUnitFor(item.nome),
      valor_unitario: index + 1,
      ativo: true
    })),
    [BOT_TEST_TABLES.funcionarios]: [
      {
        id: "func-joao",
        fazenda_id: BOT_TEST_FARM_ID,
        nome: "Joao",
        funcao: "Ordenhador",
        cpf: "11122233344",
        contato_whatsapp: BOT_TEST_WORKER_PHONE,
        salario_base: 1800,
        tipo_acesso: "bot_only",
        ativo: true,
        deleted_at: null
      }
    ],
    [BOT_TEST_TABLES.ordenhas]: [
      {
        id: "ordenha-seed",
        fazenda_id: BOT_TEST_FARM_ID,
        animal_id: "animal-b-002",
        litros: 12,
        ordenhado_em: now
      }
    ],
    [BOT_TEST_TABLES.transacoesFinanceiras]: [
      {
        id: "financeiro-seed-entrada",
        fazenda_id: BOT_TEST_FARM_ID,
        tipo: "entrada",
        valor: 800,
        data_transacao: now.slice(0, 10)
      },
      {
        id: "financeiro-seed-saida",
        fazenda_id: BOT_TEST_FARM_ID,
        tipo: "saida",
        valor: 100,
        data_transacao: now.slice(0, 10)
      }
    ],
    [BOT_TEST_TABLES.eventosAnimal]: [],
    [BOT_TEST_TABLES.estoqueMovimentacoes]: [],
    [BOT_TEST_TABLES.registrosPonto]: [],
    [BOT_TEST_TABLES.notificacoes]: [],
    [BOT_TEST_TABLES.auditoriaLogs]: []
  };
}

class BotTestQueryBuilder {
  constructor(db, tableName) {
    this.db = db;
    this.tableName = tableName;
    this.filters = [];
    this.rangeFilters = [];
    this.limitCount = null;
    this.orderConfig = null;
    this.operation = "select";
    this.payload = null;
    this.conflictColumns = [];
  }

  select() {
    return this;
  }

  eq(field, value) {
    this.filters.push((row) => row?.[field] === value || String(row?.[field]) === String(value));
    return this;
  }

  neq(field, value) {
    this.filters.push((row) => row?.[field] !== value && String(row?.[field]) !== String(value));
    return this;
  }

  is(field, value) {
    this.filters.push((row) => row?.[field] === value);
    return this;
  }

  gte(field, value) {
    this.rangeFilters.push((row) => String(row?.[field] || "") >= String(value));
    return this;
  }

  lt(field, value) {
    this.rangeFilters.push((row) => String(row?.[field] || "") < String(value));
    return this;
  }

  lte(field, value) {
    this.rangeFilters.push((row) => String(row?.[field] || "") <= String(value));
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  order(field, options = {}) {
    this.orderConfig = { field, ascending: options.ascending !== false };
    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  upsert(payload, options = {}) {
    this.operation = "upsert";
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.conflictColumns = String(options.onConflict || "id")
      .split(",")
      .map((field) => field.trim())
      .filter(Boolean);
    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload || {};
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.execute("maybeSingle"));
  }

  single() {
    return Promise.resolve(this.execute("single"));
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  catch(reject) {
    return Promise.resolve(this.execute()).catch(reject);
  }

  tableRows() {
    if (!this.db.tables[this.tableName]) this.db.tables[this.tableName] = [];
    return this.db.tables[this.tableName];
  }

  matches(row) {
    return this.filters.every((filter) => filter(row)) && this.rangeFilters.every((filter) => filter(row));
  }

  selectedRows() {
    let rows = this.tableRows().filter((row) => this.matches(row));

    if (this.orderConfig) {
      const { field, ascending } = this.orderConfig;
      rows = [...rows].sort((left, right) => {
        const leftValue = String(left?.[field] || "");
        const rightValue = String(right?.[field] || "");
        return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
      });
    }

    if (typeof this.limitCount === "number") rows = rows.slice(0, this.limitCount);
    return rows;
  }

  withId(row) {
    return {
      id: row.id || `${this.tableName}-${nodeCrypto.randomUUID()}`,
      created_at: row.created_at || new Date().toISOString(),
      ...clone(row)
    };
  }

  executeInsert() {
    const rows = this.payload.map((row) => this.withId(row));
    this.tableRows().push(...rows);
    this.db.recordWrite(this.tableName, "insert", rows);
    return rows;
  }

  executeUpsert() {
    const rows = this.payload.map((row) => this.withId(row));
    const table = this.tableRows();
    const changed = [];

    for (const row of rows) {
      const existingIndex = table.findIndex((current) => this.conflictColumns.every((field) => (
        current?.[field] === row?.[field] || String(current?.[field]) === String(row?.[field])
      )));

      if (existingIndex >= 0) {
        table[existingIndex] = { ...table[existingIndex], ...clone(row) };
        changed.push(table[existingIndex]);
      } else {
        table.push(row);
        changed.push(row);
      }
    }

    this.db.recordWrite(this.tableName, "upsert", changed);
    return changed;
  }

  executeUpdate() {
    const changed = [];
    const table = this.tableRows();

    for (let index = 0; index < table.length; index += 1) {
      if (this.matches(table[index])) {
        table[index] = { ...table[index], ...clone(this.payload) };
        changed.push(table[index]);
      }
    }

    this.db.recordWrite(this.tableName, "update", changed);
    return changed;
  }

  executeDelete() {
    const table = this.tableRows();
    const removed = [];
    this.db.tables[this.tableName] = table.filter((row) => {
      if (!this.matches(row)) return true;
      removed.push(row);
      return false;
    });
    this.db.recordWrite(this.tableName, "delete", removed);
    return removed;
  }

  execute(singleMode) {
    let rows;
    if (this.operation === "insert") rows = this.executeInsert();
    else if (this.operation === "upsert") rows = this.executeUpsert();
    else if (this.operation === "update") rows = this.executeUpdate();
    else if (this.operation === "delete") rows = this.executeDelete();
    else rows = this.selectedRows();

    const data = clone(rows);
    if (singleMode === "single") {
      if (!data.length) return { data: null, error: { message: `Nenhum registro em ${this.tableName}` } };
      return { data: data[0], error: null };
    }

    if (singleMode === "maybeSingle") {
      return { data: data[0] || null, error: null };
    }

    return { data, error: null };
  }
}

class BotTestSupabase {
  constructor() {
    this.reset();
  }

  reset() {
    this.tables = createBotTestTables();
    this.writes = [];
  }

  from(tableName) {
    return new BotTestQueryBuilder(this, tableName);
  }

  recordWrite(tableName, action, rows) {
    if (!rows.length) return;
    this.writes.push({
      tableName,
      action,
      count: rows.length,
      rows: clone(rows),
      business: BOT_TEST_BUSINESS_TABLES.has(tableName)
    });
  }

  businessWrites() {
    return this.writes.filter((write) => write.business);
  }
}

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

  if (parsed.tipo === "ATUALIZACAO_GENEALOGIA") {
    for (const field of ["mae", "pai"]) {
      const valueKey = `${field}_nome`;
      const idKey = `${field}_id`;
      if (!dados[valueKey]) continue;
      const resolved = resolveAnimalIdentifier(dados[valueKey], mockAnimals);
      if (resolved.row && resolved.status !== "ambiguous") {
        dados[idKey] = resolved.row.id;
        dados[valueKey] = resolved.row.nome && resolved.row.nome !== resolved.row.brinco
          ? `${resolved.row.nome} (${resolved.row.brinco})`
          : resolved.row.brinco;
      }
    }
  }

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM"].includes(parsed.tipo) && dados.item_nome) {
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
  if (tipo === "CONSULTA_ESTOQUE_GERAL") return "CONSULTA_ESTOQUE";
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
    produto: /medicamento|vacina|manejo|produto/.test(text),
    valor: /valor|custou/.test(text),
    descricao: /descri|descricao|registro/.test(text),
    telefone: /whatsapp|ddd/.test(text),
    funcionario_nome: /funcionario|funcion/.test(text),
    item_nome: /item|estoque/.test(text),
    sexo: /sexo|femea|macho/.test(text),
    fase: /fase|lactacao|gestante|seca|vazia|crescimento|engorda/.test(text),
    raca: /raca/.test(text),
    lote_animal: /lote/.test(text),
    data_nascimento: /nascimento|data/.test(text),
    campo_alterado: /dado|atualizar/.test(text),
    novo_valor: /valor|cadastro/.test(text),
    horario: /horario|horario|7:30|17:00/.test(text),
    mae_nome: /mae|mãe/.test(text),
    pai_nome: /pai/.test(text),
    genealogia_campo: /mae|mãe|pai|genealogia/.test(text)
  };
  return Boolean(checks[field]);
}

function assertExpected(test, parsed) {
  const failures = [];
  const dados = parsed.dados || {};
  const expected = test.expected || {};

  if (expected.exactTipo && expected.tipo && parsed.tipo !== expected.tipo) {
    failures.push(`tipo exato esperado ${expected.tipo}, recebido ${parsed.tipo}`);
  } else if (expected.tipo && canonicalIntent(parsed.tipo, dados) !== canonicalIntent(expected.tipo, expected)) {
    failures.push(`tipo esperado ${expected.tipo}, recebido ${parsed.tipo}`);
  }

  if (expected.compra && !dados.compra) failures.push("esperava compra=true");
  if (expected.evento_tipo && normalize(dados.evento_tipo) !== normalize(expected.evento_tipo)) failures.push(`evento_tipo esperado ${expected.evento_tipo}, recebido ${dados.evento_tipo}`);
  if (expected.animal && normalize(dados.animal_codigo) !== normalize(expected.animal)) failures.push(`animal esperado ${expected.animal}, recebido ${dados.animal_codigo}`);
  if (expected.animalAny && !expected.animalAny.map(normalize).includes(normalize(dados.animal_codigo))) failures.push(`animal esperado um de ${expected.animalAny.join(", ")}, recebido ${dados.animal_codigo}`);
  if (expected.animalId && dados.animal_id !== expected.animalId) failures.push(`animal_id esperado ${expected.animalId}, recebido ${dados.animal_id}`);
  if (expected.categoria && normalize(dados.categoria) !== normalize(expected.categoria)) failures.push(`categoria esperada ${expected.categoria}, recebida ${dados.categoria}`);
  if (expected.nome && normalize(dados.nome) !== normalize(expected.nome)) failures.push(`nome esperado ${expected.nome}, recebido ${dados.nome}`);
  if (expected.sexo && normalize(dados.sexo) !== normalize(expected.sexo)) failures.push(`sexo esperado ${expected.sexo}, recebido ${dados.sexo}`);
  if (expected.fase && normalize(dados.fase) !== normalize(expected.fase)) failures.push(`fase esperada ${expected.fase}, recebida ${dados.fase}`);
  if (expected.raca && normalize(dados.raca) !== normalize(expected.raca)) failures.push(`raca esperada ${expected.raca}, recebida ${dados.raca}`);
  if (expected.lote && normalize(dados.lote_nome) !== normalize(expected.lote)) failures.push(`lote esperado ${expected.lote}, recebido ${dados.lote_nome}`);
  if (expected.loteId && dados.lote_id !== expected.loteId) failures.push(`lote_id esperado ${expected.loteId}, recebido ${dados.lote_id}`);
  if (expected.data_nascimento && dados.data_nascimento !== expected.data_nascimento) failures.push(`data_nascimento esperada ${expected.data_nascimento}, recebida ${dados.data_nascimento}`);
  if (expected.data_referencia && dados.data_referencia !== expected.data_referencia) failures.push(`data_referencia esperada ${expected.data_referencia}, recebida ${dados.data_referencia}`);
  if (expected.turno && normalize(dados.turno) !== normalize(expected.turno)) failures.push(`turno esperado ${expected.turno}, recebido ${dados.turno}`);
  if (expected.campo_alterado && normalize(dados.campo_alterado) !== normalize(expected.campo_alterado)) failures.push(`campo_alterado esperado ${expected.campo_alterado}, recebido ${dados.campo_alterado}`);
  if ("novo_valor" in expected && normalize(dados.novo_valor) !== normalize(expected.novo_valor)) failures.push(`novo_valor esperado ${expected.novo_valor}, recebido ${dados.novo_valor}`);
  if ("consulta" in expected && Boolean(dados.consulta) !== Boolean(expected.consulta)) failures.push(`consulta esperada ${expected.consulta}, recebida ${dados.consulta}`);
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
  if ("salario_base" in expected && Number(dados.salario_base) !== Number(expected.salario_base)) failures.push(`salario_base esperado ${expected.salario_base}, recebido ${dados.salario_base}`);
  if (expected.cpf && String(dados.cpf || "").replace(/\D/g, "") !== String(expected.cpf).replace(/\D/g, "")) failures.push(`cpf esperado ${expected.cpf}, recebido ${dados.cpf}`);
  if (expected.tipo_acesso && normalize(dados.tipo_acesso) !== normalize(expected.tipo_acesso)) failures.push(`tipo_acesso esperado ${expected.tipo_acesso}, recebido ${dados.tipo_acesso}`);
  if (expected.consulta_campo && normalize(dados.consulta_campo) !== normalize(expected.consulta_campo)) failures.push(`consulta_campo esperado ${expected.consulta_campo}, recebido ${dados.consulta_campo}`);
  if (expected.consulta_genealogia && normalize(dados.consulta_genealogia) !== normalize(expected.consulta_genealogia)) failures.push(`consulta_genealogia esperado ${expected.consulta_genealogia}, recebido ${dados.consulta_genealogia}`);
  if (expected.genealogia_campo && normalize(dados.genealogia_campo) !== normalize(expected.genealogia_campo)) failures.push(`genealogia_campo esperado ${expected.genealogia_campo}, recebido ${dados.genealogia_campo}`);
  if (expected.mae_nome && !normalize(dados.mae_nome).includes(normalize(expected.mae_nome))) failures.push(`mae_nome esperado ${expected.mae_nome}, recebido ${dados.mae_nome}`);
  if (expected.pai_nome && !normalize(dados.pai_nome).includes(normalize(expected.pai_nome))) failures.push(`pai_nome esperado ${expected.pai_nome}, recebido ${dados.pai_nome}`);
  if (expected.maeId && dados.mae_id !== expected.maeId) failures.push(`mae_id esperado ${expected.maeId}, recebido ${dados.mae_id}`);
  if (expected.paiId && dados.pai_id !== expected.paiId) failures.push(`pai_id esperado ${expected.paiId}, recebido ${dados.pai_id}`);
  if ("remover_mae" in expected && Boolean(dados.remover_mae) !== Boolean(expected.remover_mae)) failures.push(`remover_mae esperado ${expected.remover_mae}, recebido ${dados.remover_mae}`);
  if ("remover_pai" in expected && Boolean(dados.remover_pai) !== Boolean(expected.remover_pai)) failures.push(`remover_pai esperado ${expected.remover_pai}, recebido ${dados.remover_pai}`);
  if ("agora" in expected && Boolean(dados.agora) !== Boolean(expected.agora)) failures.push(`agora esperado ${expected.agora}, recebido ${dados.agora}`);
  if (expected.ponto_tipo && dados.ponto_tipo !== expected.ponto_tipo) failures.push(`ponto_tipo esperado ${expected.ponto_tipo}, recebido ${dados.ponto_tipo}`);
  if (expected.horario && dados.horario !== expected.horario) failures.push(`horário esperado ${expected.horario}, recebido ${dados.horario}`);
  if (expected.destino && normalize(dados.destino) !== normalize(expected.destino)) failures.push(`destino esperado ${expected.destino}, recebido ${dados.destino}`);
  if (expected.local && normalize(dados.local) !== normalize(expected.local)) failures.push(`local esperado ${expected.local}, recebido ${dados.local}`);
  if (expected.itemUnresolved && dados.item_id) failures.push(`item deveria ficar sem resolução oficial, recebeu item_id ${dados.item_id}`);
  if (expected.resumoIncludes && !normalize(parsed.resumo).includes(normalize(expected.resumoIncludes))) failures.push(`resumo deveria conter "${expected.resumoIncludes}", recebeu "${parsed.resumo}"`);
  if ("registros" in expected) {
    const registros = Array.isArray(dados.registros) ? dados.registros : [];
    if (registros.length !== expected.registros) failures.push(`registros esperados ${expected.registros}, recebidos ${registros.length}`);
  }
  if ("total_litros" in expected && Number(dados.total_litros) !== Number(expected.total_litros)) failures.push(`total_litros esperado ${expected.total_litros}, recebido ${dados.total_litros}`);
  if (expected.registroTipos) {
    const tipos = Array.isArray(dados.registros) ? dados.registros.map((registro) => registro.tipo) : [];
    const missingTipos = expected.registroTipos.filter((tipo) => !tipos.includes(tipo));
    if (missingTipos.length) failures.push(`tipos de lote faltando: ${missingTipos.join(", ")}`);
  }
  if (expected.registroDetalhes) {
    const registros = Array.isArray(dados.registros) ? dados.registros : [];
    expected.registroDetalhes.forEach((detail, index) => {
      const registro = registros[index];
      const registroDados = registro?.dados || {};
      if (!registro) {
        failures.push(`registro ${index + 1} ausente`);
        return;
      }
      if (detail.tipo && canonicalIntent(registro.tipo, registroDados) !== canonicalIntent(detail.tipo, detail)) failures.push(`registro ${index + 1}: tipo esperado ${detail.tipo}, recebido ${registro.tipo}`);
      if (detail.animal && normalize(registroDados.animal_codigo) !== normalize(detail.animal)) failures.push(`registro ${index + 1}: animal esperado ${detail.animal}, recebido ${registroDados.animal_codigo}`);
      if (detail.animalAny && !detail.animalAny.map(normalize).includes(normalize(registroDados.animal_codigo))) failures.push(`registro ${index + 1}: animal esperado um de ${detail.animalAny.join(", ")}, recebido ${registroDados.animal_codigo}`);
      if ("litros" in detail && Number(registroDados.litros) !== Number(detail.litros)) failures.push(`registro ${index + 1}: litros esperado ${detail.litros}, recebido ${registroDados.litros}`);
      if (detail.produto && normalize(registroDados.produto) !== normalize(detail.produto)) failures.push(`registro ${index + 1}: produto esperado ${detail.produto}, recebido ${registroDados.produto}`);
      if (detail.item && normalize(registroDados.item_nome) !== normalize(detail.item)) failures.push(`registro ${index + 1}: item esperado ${detail.item}, recebido ${registroDados.item_nome}`);
      if ("quantidade" in detail && Number(registroDados.quantidade) !== Number(detail.quantidade)) failures.push(`registro ${index + 1}: quantidade esperada ${detail.quantidade}, recebida ${registroDados.quantidade}`);
      if (detail.unidade && normalize(registroDados.unidade) !== normalize(detail.unidade)) failures.push(`registro ${index + 1}: unidade esperada ${detail.unidade}, recebida ${registroDados.unidade}`);
      if ("valor" in detail && Number(registroDados.valor) !== Number(detail.valor)) failures.push(`registro ${index + 1}: valor esperado ${detail.valor}, recebido ${registroDados.valor}`);
      if (detail.descricao && !normalize(registroDados.descricao).includes(normalize(detail.descricao))) failures.push(`registro ${index + 1}: descriÃ§Ã£o esperada ${detail.descricao}, recebida ${registroDados.descricao}`);
    });
  }

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
  if (["CRIAR_ITEM_ESTOQUE", "CRIAR_FUNCIONARIO", "ATUALIZAR_FUNCIONARIO", "DESLIGAR_FUNCIONARIO", "EXCLUIR_FUNCIONARIO", "ATUALIZACAO_GENEALOGIA"].includes(parsed.tipo)) {
    if (parsed.tipo === "ATUALIZACAO_GENEALOGIA") {
      return "VocÃª nÃ£o tem permissÃ£o para alterar genealogia pelo bot. PeÃ§a para um administrador fazer essa alteraÃ§Ã£o.";
    }
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
  { phrase: "adicionar vaca", expected: { tipo: "CADASTRO_ANIMAL", categoria: "vaca", missing: ["animal_codigo"] } },
  { phrase: "adicionar touro", expected: { tipo: "CADASTRO_ANIMAL", categoria: "touro", missing: ["animal_codigo"] } },
  { phrase: "adicionar vaca com nome Mimosa", expected: { tipo: "CADASTRO_ANIMAL", categoria: "vaca", nome: "Mimosa", missing: ["animal_codigo"] } },
  { phrase: "cadastrar touro T-01", expected: { tipo: "CADASTRO_ANIMAL", categoria: "touro", animal: "T-01", missing: ["sexo"] } },
  { phrase: "registrar bezerro brinco B-123", expected: { tipo: "CADASTRO_ANIMAL", categoria: "bezerro", animal: "B-123", missing: ["sexo"] } },
  { phrase: "adicionar vaca Mimosa brinco B-043 femea gestante raca Girolando lote Lactacao 1 nascimento 01/02/2024", expected: { tipo: "CADASTRO_ANIMAL", categoria: "vaca", animal: "B-043", nome: "Mimosa", sexo: "femea", fase: "gestante", raca: "Girolando", lote: "Lactacao 1", data_nascimento: "2024-02-01", noMissing: true } },
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
  { phrase: "cria um item chamado ração no estoque", expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração", missing: ["unidade"] } },
  { phrase: "estoque baixo", expected: { tipo: "CONSULTA_ESTOQUE" } },
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
  { phrase: "cadastrar funcionário Pedro", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Pedro", noMissing: true } },
  { phrase: "cria funcionário Maria 83911112222", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Maria", telefone: "5583911112222", noMissing: true } },
  { phrase: "adicionar funcionário Ana WhatsApp +55 (83) 98888-7777", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Ana", telefone: "5583988887777", noMissing: true } },
  { phrase: "cadastrar vaqueiro José 83922223333", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "José", telefone: "5583922223333", noMissing: true } },
  { phrase: "83996732761", pending: () => pendingFrom("cadastrar funcionário João"), expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "João", telefone: "5583996732761", noMissing: true } },
  { phrase: "kg", pending: () => pendingFrom("criar estoque de ração de bezerro"), expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração de bezerro", unidade: "kg", missing: ["quantidade"] } },
  { phrase: "0", pending: () => pendingFrom("criar estoque de ração de bezerro", ["kg"]), expected: { tipo: "CRIAR_ITEM_ESTOQUE", item: "ração de bezerro", unidade: "kg", quantidade: 0, noMissing: true } },
  { phrase: "32", pending: () => pendingFrom("vaca 2 deu leite"), expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 32, noMissing: true } },
  { phrase: "vaca B-002 deu 32 litros e vaca 15 deu 20 litros", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"] } },
  { phrase: "usei 2 kg de milho e tirei 1 fardo de feno", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["ESTOQUE_SAIDA"] } },
  { phrase: "vaca 2 deu 15 litros e a 1 20", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 35, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }, { tipo: "PRODUCAO_LEITE", animal: "1", litros: 20 }] } },
  { phrase: "vaca 2 deu 15 litros e vaca 1 20", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 35, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }, { tipo: "PRODUCAO_LEITE", animal: "1", litros: 20 }] } },
  { phrase: "vaca 2 deu 15 litros e a vaca 1 tambem", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 30, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }, { tipo: "PRODUCAO_LEITE", animal: "1", litros: 15 }] } },
  { phrase: "vaca 2 15 litros, 1 20, B-002 18", expected: { tipo: "LOTE_REGISTROS", registros: 3, registroTipos: ["PRODUCAO_LEITE"], total_litros: 53, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }, { tipo: "PRODUCAO_LEITE", animal: "1", litros: 20 }, { tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 18 }] } },
  { phrase: "ordenha: vaca 2 15, vaca 1 20", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 35, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }, { tipo: "PRODUCAO_LEITE", animal: "1", litros: 20 }] } },
  { phrase: "vaca 1 deu 15 litros evaca 3 tomou vacina da raiva", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE", "VACINA_MEDICAMENTO"], registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "1", litros: 15 }, { tipo: "VACINA_MEDICAMENTO", animal: "3", produto: "raiva" }] } },
  { phrase: "vaca 1 deu 15 litros e vaca 3 tomou vacina da raiva", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE", "VACINA_MEDICAMENTO"], registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "1", litros: 15 }, { tipo: "VACINA_MEDICAMENTO", animal: "3", produto: "raiva" }] } },
  { phrase: "vaca 1 deu 14 litros e vaca 2 15", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 29, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "1", litros: 14 }, { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }] } },
  { phrase: "vaca 1 deu 15 litros e vaca 2 tambÃ©m", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 30, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "1", litros: 15 }, { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }] } },
  { phrase: "B-002 deu 30 litros, A12 18", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 48, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 30 }, { tipo: "PRODUCAO_LEITE", animal: "A12", litros: 18 }] } },
  { phrase: "ordenha: B-002 30, A12 18", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 48, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 30 }, { tipo: "PRODUCAO_LEITE", animal: "A12", litros: 18 }] } },
  { phrase: "vaca 2 pariu e B-002 deu 20 litros", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PARTO", "PRODUCAO_LEITE"], registroDetalhes: [{ tipo: "PARTO", animalAny: ["2", "002"] }, { tipo: "PRODUCAO_LEITE", animal: "B-002", litros: 20 }] } },
  { phrase: "bota 20kg de racao de boi e 10kg de milho no estoque", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["ESTOQUE_ENTRADA"], registroDetalhes: [{ tipo: "ESTOQUE_ENTRADA", item: "Racao de boi", quantidade: 20, unidade: "kg" }, { tipo: "ESTOQUE_ENTRADA", item: "Milho", quantidade: 10, unidade: "kg" }] } },
  { phrase: "tira 10kg de milho e 5kg de sal", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["ESTOQUE_SAIDA"], registroDetalhes: [{ tipo: "ESTOQUE_SAIDA", item: "Milho", quantidade: 10, unidade: "kg" }, { tipo: "ESTOQUE_SAIDA", item: "Sal mineral", quantidade: 5, unidade: "kg" }] } },
  { phrase: "paguei 300 de racao e 120 de remedio", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["DESPESA"], registroDetalhes: [{ tipo: "DESPESA", valor: 300, descricao: "racao" }, { tipo: "DESPESA", valor: 120, descricao: "remedio" }] } },
  { phrase: "recebi 500 do leite e 1200 do bezerro", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["RECEITA_VENDA"], registroDetalhes: [{ tipo: "RECEITA_VENDA", valor: 500, descricao: "leite" }, { tipo: "RECEITA_VENDA", valor: 1200, descricao: "bezerro" }] } },
  { phrase: "vendi boi por 15 mil e leite por 500", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["RECEITA_VENDA"], registroDetalhes: [{ tipo: "RECEITA_VENDA", valor: 15000, descricao: "boi" }, { tipo: "RECEITA_VENDA", valor: 500, descricao: "leite" }] } },
  { phrase: "usei 20kg de raÃ§Ã£o e 2 doses de aftosa", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["ESTOQUE_SAIDA"], registroDetalhes: [{ tipo: "ESTOQUE_SAIDA", item: "Ração", quantidade: 20, unidade: "kg" }, { tipo: "ESTOQUE_SAIDA", item: "Aftosa", quantidade: 2, unidade: "dose" }] } },
  { phrase: "chegou 10 sacos de raÃ§Ã£o e 5 fardos de feno", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["ESTOQUE_ENTRADA"], registroDetalhes: [{ tipo: "ESTOQUE_ENTRADA", item: "Ração", quantidade: 10, unidade: "saco" }, { tipo: "ESTOQUE_ENTRADA", item: "Feno", quantidade: 5, unidade: "fardo" }] } },
  { phrase: "B-002 morreu e paguei 300 de remÃ©dio", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["MORTE", "DESPESA"], registroDetalhes: [{ tipo: "MORTE", animal: "B-002" }, { tipo: "DESPESA", valor: 300 }] } },
  { phrase: "vaca 1 deu 14 litros e vaca 2 15 no tanque", expected: { tipo: "LOTE_REGISTROS", registros: 2, registroTipos: ["PRODUCAO_LEITE"], total_litros: 29, registroDetalhes: [{ tipo: "PRODUCAO_LEITE", animal: "1", litros: 14 }, { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 }] } },
  { phrase: "vaca 2 deu 15 litros", expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 15 } },
  { phrase: "vaca 1 deu 15 litros", expected: { tipo: "PRODUCAO_LEITE", animal: "1", litros: 15 } },
  { phrase: "vaca 3 tomou vacina da raiva", expected: { tipo: "VACINA_MEDICAMENTO", animal: "3", produto: "raiva" } },
  { phrase: "racao de boi", expected: { tipo: "DESCONHECIDO" } },
  { phrase: "raÃ§Ã£o de boi", expected: { tipo: "DESCONHECIDO" } },
  { phrase: "vacina da raiva", expected: { tipo: "VACINA_MEDICAMENTO", produto: "raiva", missing: ["animal_codigo"] } }
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

const consultationParserTests = [
  { phrase: "Quantos litros foram ordenhados hoje?", expected: { tipo: "CONSULTA_PRODUCAO_HOJE", exactTipo: true } },
  { phrase: "Total de leite hoje", expected: { tipo: "CONSULTA_PRODUCAO_HOJE", exactTipo: true } },
  { phrase: "Quanto leite tirou hoje?", expected: { tipo: "CONSULTA_PRODUCAO_HOJE", exactTipo: true } },
  { phrase: "A vaca B-002 deu quantos litros?", expected: { tipo: "CONSULTA_PRODUCAO_ANIMAL", exactTipo: true, animal: "B-002" } },
  { phrase: "Quanto a B-002 produziu hoje?", expected: { tipo: "CONSULTA_PRODUCAO_ANIMAL", exactTipo: true, animal: "B-002" } },
  { phrase: "Producao da vaca 2 hoje", expected: { tipo: "CONSULTA_PRODUCAO_ANIMAL", exactTipo: true, animalAny: ["2", "002"] } },
  { phrase: "Como está o estoque de ração de boi?", expected: { tipo: "CONSULTA_ESTOQUE_ITEM", exactTipo: true, item: "Ração de boi", itemId: "item-racao-boi", itemFound: true } },
  { phrase: "Quanto tem de ração de boi?", expected: { tipo: "CONSULTA_ESTOQUE_ITEM", exactTipo: true, item: "Ração de boi", itemId: "item-racao-boi", itemFound: true } },
  { phrase: "Tem quanto de leite cru?", expected: { tipo: "CONSULTA_ESTOQUE_ITEM", exactTipo: true, item: "Leite Cru", itemId: "item-leite-cru", itemFound: true } },
  { phrase: "Ainda tem aftosa?", expected: { tipo: "CONSULTA_ESTOQUE_ITEM", exactTipo: true, item: "Aftosa", itemId: "item-aftosa", itemFound: true } },
  { phrase: "Como está o estoque?", expected: { tipo: "CONSULTA_ESTOQUE_GERAL", exactTipo: true } },
  { phrase: "O que está acabando?", expected: { tipo: "CONSULTA_ESTOQUE_GERAL", exactTipo: true } },
  { phrase: "O que eu registrei hoje?", expected: { tipo: "CONSULTA_REGISTROS_HOJE", exactTipo: true } },
  { phrase: "Meus registros de hoje", expected: { tipo: "CONSULTA_REGISTROS_HOJE", exactTipo: true } },
  { phrase: "vaca B-002 deu 30 litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 30 } },
  { phrase: "usei 20kg de ração de boi", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Ração de boi", quantidade: 20, unidade: "kg" } },
  { phrase: "comprei 10 sacos de ração por 300 reais", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, compra: true, item: "Ração", quantidade: 10, unidade: "saco", valor: 300 } }
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
  { phrase: "comprei racao por 20 mil", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Ração", valor: 20000, missing: ["quantidade"] } },
  { phrase: "paguei 20 mil em racao", expected: { tipo: "DESPESA", valor: 20000, descricao: "racao" } },
  { phrase: "vendi boi por 15 mil", expected: { tipo: "RECEITA_VENDA", valor: 15000, descricao: "venda de boi" } },
  { phrase: "comprei 10 sacos de racao por 2,5 mil", expected: { tipo: "ESTOQUE_ENTRADA", compra: true, quantidade: 10, unidade: "saco", item: "Ração", valor: 2500 } },
  { phrase: "gastei mil reais com remedio", expected: { tipo: "DESPESA", valor: 1000, descricao: "remedio" } },
  { phrase: "recebi 1 mil do leite", expected: { tipo: "RECEITA_VENDA", valor: 1000, descricao: "leite" } },
  { phrase: "20 mil litros de leite", expected: { tipo: "PRODUCAO_LEITE", litros: 20000, missing: ["animal_codigo"] } },
  { phrase: "50.5", pending: () => pendingFrom("vaca 2 deu leite"), expected: { tipo: "PRODUCAO_LEITE", animalAny: ["2", "002"], litros: 50.5, noMissing: true } },
  { phrase: "300,50", pending: () => pendingFrom("comprei 2 sacos de milho"), expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Milho", quantidade: 2, unidade: "saco", valor: 300.5, noMissing: true } },
  { phrase: "2,5 sacos", pending: () => pendingFrom("comprei milho por 300 reais"), expected: { tipo: "ESTOQUE_ENTRADA", compra: true, item: "Milho", quantidade: 2.5, unidade: "saco", valor: 300, noMissing: true } }
];

function financeParser(phrase, expected) {
  return { module: "financeiro", phrase, expected };
}

function eventParser(phrase, expected, extra = {}) {
  return { module: "eventos", phrase, expected, ...extra };
}

const financeHumanParserTests = [
  financeParser("vendi leite por 900 reais", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 900, descricao: "leite", data_referencia: "hoje" }),
  financeParser("venda de leite 900", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 900, descricao: "leite" }),
  financeParser("recebi 800 da venda de leite", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 800, descricao: "leite" }),
  financeParser("entrada 500 venda de queijo", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 500, descricao: "queijo" }),
  financeParser("vendi uma vaca por 5000", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 5000, descricao: "vaca" }),
  financeParser("recebemos 1200", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1200 }),
  financeParser("entrou 300 no caixa", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 300 }),
  financeParser("ganhei 750 com leite", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 750, descricao: "leite" }),
  financeParser("venda animal B-002 por 4500", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 4500, descricao: "animal" }),
  financeParser("cliente pagou 650", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 650 }),
  financeParser("recebi 1.200 reais", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1200 }),
  financeParser("recebi R$ 1.200,50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1200.5 }),
  financeParser("vendi leite 1200,50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1200.5, descricao: "leite" }),
  financeParser("venda de bezerro 800", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 800, descricao: "bezerro" }),
  financeParser("vendi bezerro por 800", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 800, descricao: "bezerro" }),
  financeParser("vendi vaca por cinco mil", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 5000, descricao: "vaca" }),
  financeParser("entrou dinheiro da venda de leite 900", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 900, descricao: "leite" }),
  financeParser("pagamento recebido 450", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 450 }),
  financeParser("recebemos do comprador 3000", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 3000 }),
  financeParser("venda de gado 7000", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 7000, descricao: "gado" }),
  financeParser("vendi esterco por 150", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 150, descricao: "esterco" }),
  financeParser("receita de leite 2500", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 2500, descricao: "leite" }),
  financeParser("receita 1200 leite", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1200, descricao: "leite" }),
  financeParser("entrada leite 1300", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1300, descricao: "leite" }),
  financeParser("paguei salario do Joao 1500", { tipo: "DESPESA", exactTipo: true, valor: 1500, descricao: "salario" }),
  financeParser("gastei 360 com vacina", { tipo: "DESPESA", exactTipo: true, valor: 360, descricao: "vacina" }),
  financeParser("saida 250 veterinario", { tipo: "DESPESA", exactTipo: true, valor: 250, descricao: "veterinario" }),
  financeParser("paguei energia 400", { tipo: "DESPESA", exactTipo: true, valor: 400, descricao: "energia" }),
  financeParser("despesa veterinario 600", { tipo: "DESPESA", exactTipo: true, valor: 600, descricao: "veterinario" }),
  financeParser("paguei 80 de combustivel", { tipo: "DESPESA", exactTipo: true, valor: 80, descricao: "combustivel" }),
  financeParser("gasto com manutencao 900", { tipo: "DESPESA", exactTipo: true, valor: 900, descricao: "manutencao" }),
  financeParser("paguei conta de luz 500", { tipo: "DESPESA", exactTipo: true, valor: 500, descricao: "luz" }),
  financeParser("paguei agua 120", { tipo: "DESPESA", exactTipo: true, valor: 120, descricao: "agua" }),
  financeParser("paguei vacina aftosa por 450", { tipo: "DESPESA", exactTipo: true, valor: 450, descricao: "aftosa" }),
  financeParser("paguei o veterinario 700", { tipo: "DESPESA", exactTipo: true, valor: 700, descricao: "veterinario" }),
  financeParser("gastei 1000 em manutencao", { tipo: "DESPESA", exactTipo: true, valor: 1000, descricao: "manutencao" }),
  financeParser("despesa com funcionario 1500", { tipo: "DESPESA", exactTipo: true, valor: 1500, descricao: "funcionario" }),
  financeParser("paguei frete 350", { tipo: "DESPESA", exactTipo: true, valor: 350, descricao: "frete" }),
  financeParser("paguei diesel 600", { tipo: "DESPESA", exactTipo: true, valor: 600, descricao: "diesel" }),
  financeParser("paguei aluguel 2000", { tipo: "DESPESA", exactTipo: true, valor: 2000, descricao: "aluguel" }),
  financeParser("gasto racao 300", { tipo: "DESPESA", exactTipo: true, valor: 300, descricao: "racao" }),
  financeParser("despesa racao 300", { tipo: "DESPESA", exactTipo: true, valor: 300, descricao: "racao" }),
  financeParser("paguei 300 na racao", { tipo: "DESPESA", exactTipo: true, valor: 300, descricao: "racao" }),
  financeParser("pagamento funcionario Joao 1500", { tipo: "DESPESA", exactTipo: true, valor: 1500, descricao: "funcionario" }),
  financeParser("diaria do vaqueiro 120", { tipo: "DESPESA", exactTipo: true, valor: 120, descricao: "vaqueiro" }),
  financeParser("folha de pagamento 3200", { tipo: "DESPESA", exactTipo: true, valor: 3200, descricao: "folha" }),
  financeParser("recebi 300", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 300 }),
  financeParser("recebi 300,50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 300.5 }),
  financeParser("recebi 300.50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 300.5 }),
  financeParser("recebi R$ 300,50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 300.5 }),
  financeParser("recebi 1.300,50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1300.5 }),
  financeParser("recebi 1300,50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1300.5 }),
  financeParser("recebi 1,300.50", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 1300.5 }),
  financeParser("paguei 1500", { tipo: "DESPESA", exactTipo: true, valor: 1500 }),
  financeParser("paguei 1.500", { tipo: "DESPESA", exactTipo: true, valor: 1500 }),
  financeParser("paguei 1.500,00", { tipo: "DESPESA", exactTipo: true, valor: 1500 }),
  financeParser("paguei R$1500", { tipo: "DESPESA", exactTipo: true, valor: 1500 }),
  financeParser("paguei R$ 1.500,00", { tipo: "DESPESA", exactTipo: true, valor: 1500 }),
  financeParser("comprei por abc", { tipo: "DESPESA", exactTipo: true, missing: ["valor"] }),
  financeParser("registrar entrada", { tipo: "RECEITA_VENDA", exactTipo: true, missing: ["valor"] }),
  financeParser("registrar saida", { tipo: "DESPESA", exactTipo: true, missing: ["valor", "descricao"] }),
  financeParser("recebi dinheiro", { tipo: "RECEITA_VENDA", exactTipo: true, missing: ["valor"] }),
  financeParser("paguei uma conta", { tipo: "DESPESA", exactTipo: true, missing: ["valor"] }),
  financeParser("saida 300", { tipo: "DESPESA", exactTipo: true, valor: 300, missing: ["descricao"] }),
  financeParser("vendi leite", { tipo: "RECEITA_VENDA", exactTipo: true, descricao: "leite", missing: ["valor"] }),
  financeParser("paguei salario", { tipo: "DESPESA", exactTipo: true, descricao: "salario", missing: ["valor"] }),
  { module: "financeiro", phrase: "900", pending: () => pendingFrom("vendi leite"), expected: { tipo: "RECEITA_VENDA", exactTipo: true, valor: 900, descricao: "leite", noMissing: true } },
  { module: "financeiro", phrase: "300", pending: () => pendingFrom("paguei energia"), expected: { tipo: "DESPESA", exactTipo: true, valor: 300, descricao: "energia", noMissing: true } },
  { module: "financeiro", phrase: "1.500,50", pending: () => pendingFrom("paguei salario do Joao"), expected: { tipo: "DESPESA", exactTipo: true, valor: 1500.5, descricao: "salario", noMissing: true } },
  { module: "financeiro", phrase: "racao", pending: () => pendingFrom("saida 300"), expected: { tipo: "DESPESA", exactTipo: true, valor: 300, descricao: "racao", noMissing: true } },
  financeParser("vendii leite por 900", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 900, descricao: "leite" }),
  financeParser("vendi leiti por 900", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 900, descricao: "leite" }),
  financeParser("recebi dinhero 800", { tipo: "RECEITA_VENDA", exactTipo: true, valor: 800 }),
  financeParser("despeza veterinario 600", { tipo: "DESPESA", exactTipo: true, valor: 600, descricao: "veterinario" }),
  financeParser("gastei con racao 400", { tipo: "DESPESA", exactTipo: true, valor: 400, descricao: "racao" }),
  financeParser("finaceiro do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("quanto entro esse mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("quanto saiu ese mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("resutado do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("como ta o financeiro do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("financeiro do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("resultado do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("quanto entrou esse mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("quanto saiu esse mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("saldo financeiro", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("mostrar transacoes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("entradas de hoje", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("saidas de hoje", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("financeiro de ontem", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("relatorio financeiro", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("me mostra o caixa", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("quanto vendemos esse mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("quanto gastamos esse mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("lucro do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("resultado de hoje", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("transacoes da semana", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("despesas do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("receitas do mes", { tipo: "CONSULTA_FINANCEIRO", exactTipo: true }),
  financeParser("Joao entrou as 7:30", { tipo: "PONTO_FUNCIONARIO", exactTipo: true, funcionario_nome: "joao", ponto_tipo: "entrada", horario: "07:30" }),
  financeParser("comprei 10 sacos de racao por 300 reais", { tipo: "ESTOQUE_ENTRADA", exactTipo: true, compra: true, item: "Racao", quantidade: 10, unidade: "saco", valor: 300 })
];

const inventoryHumanParserTests = [
  { phrase: "chegou 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "entrou 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "adicionar 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "registrar entrada de 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "chegaram 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "chegou racao 10 sacos", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "racao entrou 10 sacos", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "entrada racao 10 sacos", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "botar 10 sacos de racao no estoque", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "colocar 10 sacos de racao no estoque", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "recebi 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "chegou 1 saco de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 1, unidade: "saco", resumoIncludes: "1 saco" } },
  { phrase: "chegou 10,5 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10.5, unidade: "saco" } },
  { phrase: "chegou dez sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "chegou 20 kg de sal mineral", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Sal mineral", quantidade: 20, unidade: "kg" } },
  { phrase: "entrou 5 sacos de sal mineral", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Sal mineral", quantidade: 5, unidade: "saco" } },
  { phrase: "chegou 2 litros de carrapaticida", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "carrapaticida", quantidade: 2, unidade: "L" } },
  { phrase: "entrou 100 doses de vacina", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "vacina", quantidade: 100, unidade: "dose" } },
  { phrase: "comprei 50 seringas", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, compra: true, item: "seringas", quantidade: 50, missing: ["unidade", "valor"] } },
  { phrase: "chegou 200 kg de milho", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Milho", quantidade: 200, unidade: "kg" } },
  { phrase: "entrou 30 sacos de milho", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Milho", quantidade: 30, unidade: "saco" } },
  { phrase: "chegou 12 fardos de feno", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Feno", quantidade: 12, unidade: "fardo" } },
  { phrase: "comprei 8 rolos de arame", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, compra: true, item: "arame", quantidade: 8, unidade: "rolo", missing: ["valor"] } },
  { phrase: "chegou 4 postes", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "postes", quantidade: 4, missing: ["unidade"] } },
  { phrase: "entrou 6 sacos de ureia", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "ureia", quantidade: 6, unidade: "saco" } },
  { phrase: "comprei 15 litros de diesel", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, compra: true, item: "diesel", quantidade: 15, unidade: "L", missing: ["valor"] } },
  { phrase: "chegou 10 caixas de medicamento", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "medicamento", quantidade: 10, unidade: "caixa" } },
  { phrase: "chegou 5 frascos de antibiotico", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "antibiotico", quantidade: 5, unidade: "frasco" } },
  { phrase: "chegou 20 brincos de identificacao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "identificacao", quantidade: 20, missing: ["unidade"] } },
  { phrase: "chegou 10 sacos de racao hoje", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco", data_referencia: "hoje" } },
  { phrase: "ontem chegou 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco", data_referencia: "ontem" } },
  { phrase: "chegou 10 sacos de racao 2026-06-01", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco", data_referencia: "2026-06-01" } },
  { phrase: "entrada de racao 10 sacos 01/06/2026", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco", data_referencia: "2026-06-01" } },
  { phrase: "sal mineral 20kg ontem", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Sal mineral", quantidade: 20, unidade: "kg", data_referencia: "ontem" } },
  { phrase: "chegou 10 saco de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "chego 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "xegou 10 sacos de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "entrou 10 sako de racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "racao 10 sc entrada", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", quantidade: 10, unidade: "saco" } },
  { phrase: "sal minaral 20kg", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Sal mineral", itemId: "item-sal-mineral", itemFound: true, quantidade: 20, unidade: "kg" } },
  { phrase: "usei 2 sacos de racao", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Racao", quantidade: 2, unidade: "saco" } },
  { phrase: "saiu 2 sacos de racao", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Racao", quantidade: 2, unidade: "saco" } },
  { phrase: "baixar 2 sacos de racao", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Racao", quantidade: 2, unidade: "saco" } },
  { phrase: "dar baixa em 2 sacos de racao", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Racao", quantidade: 2, unidade: "saco" } },
  { phrase: "retirei 2 sacos de racao", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Racao", quantidade: 2, unidade: "saco" } },
  { phrase: "gastei 5 litros de diesel no trator", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "diesel", quantidade: 5, unidade: "L" } },
  { phrase: "usei 4 postes no piquete 2", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "postes", quantidade: 4, missing: ["unidade"] } },
  { phrase: "descartei 1 frasco vencido", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, quantidade: 1, unidade: "frasco", missing: ["item_nome"] } },
  { phrase: "chegou racao", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "Racao", missing: ["quantidade"] } },
  { phrase: "chegou 10 sacos", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, quantidade: 10, unidade: "saco", missing: ["item_nome"] } },
  { phrase: "usei racao", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, item: "Racao", missing: ["quantidade"] } },
  { phrase: "baixa 2 sacos", expected: { tipo: "ESTOQUE_SAIDA", exactTipo: true, quantidade: 2, unidade: "saco", missing: ["item_nome"] } },
  { phrase: "quanto tem de racao?", expected: { tipo: "CONSULTA_ESTOQUE_ITEM", exactTipo: true, item: "Racao", consulta: true } },
  { phrase: "estoque baixo", expected: { tipo: "CONSULTA_ESTOQUE_GERAL", exactTipo: true, consulta: true } },
  { phrase: "o que esta acabando?", expected: { tipo: "CONSULTA_ESTOQUE_GERAL", exactTipo: true, consulta: true } },
  { phrase: "chegou 10 sacos de item X-999", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "item X-999", quantidade: 10, unidade: "saco", itemUnresolved: true, itemFound: false } },
  { phrase: "apliquei vacina na B-002", expected: { tipo: "VACINA_MEDICAMENTO", exactTipo: true, animal: "B-002", missing: ["produto"] } },
  { phrase: "chegou vacina 100 doses", expected: { tipo: "ESTOQUE_ENTRADA", exactTipo: true, item: "vacina", quantidade: 100, unidade: "dose" } },
  { phrase: "paguei 1000 na racao", expected: { tipo: "DESPESA", exactTipo: true, valor: 1000, descricao: "racao" } },
  { phrase: "B-002 deu 32 litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32 } },
  { phrase: "oi", expected: { tipo: "DESCONHECIDO", exactTipo: true } },
  { phrase: "menu", expected: { tipo: "DESCONHECIDO", exactTipo: true } }
];

const productionRobustnessTests = [
  { phrase: "B-002 deu 32l", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, data_referencia: "hoje" } },
  { phrase: "B-002 deu 32lt ontem", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, data_referencia: "ontem" } },
  { phrase: "B-002 deu 32lts anteontem", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, data_referencia: "anteontem" } },
  { phrase: "B-002 deu 32 litros 2026-06-01", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, data_referencia: "2026-06-01" } },
  { phrase: "B-002 deu 32 litros 01/06/2026", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, data_referencia: "2026-06-01" } },
  { phrase: "B-002 deu 32 litros primeira ordenha", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, turno: "manha" } },
  { phrase: "B-002 deu 32 litros segunda ordenha", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, turno: "tarde" } },
  { phrase: "B-002 deu 32 litros terceira ordenha", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32, turno: "noite" } },
  { phrase: "B-002 deu 32 e meio litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32.5 } },
  { phrase: "B-002 deu meio litro", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 0.5 } },
  { phrase: "B-002 deu -5 litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", missing: ["litros"] } },
  { phrase: "B-002 deu 32 kg", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", missing: ["litros"] } },
  { phrase: "B-002 deu 300 reais", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", missing: ["litros"] } },
  { phrase: "B 002 deu 32 litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32 } },
  { phrase: "malhada 32 litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "MALHADA", litros: 32 } },
  { phrase: "vaca B-002 deu 32 lito", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32 } },
  { phrase: "B-002 32 litros", expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32 } },
  { phrase: "era 32,5", pending: () => pendingFrom("B-002 deu 31 litros ontem"), expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 32.5, data_referencia: "ontem", noMissing: true } },
  { phrase: "corrigir 20 litros", pending: () => pendingFrom("B-002 deu 18 litros"), expected: { tipo: "PRODUCAO_LEITE", exactTipo: true, animal: "B-002", litros: 20, noMissing: true } }
];

const animalConsultationAndUpdateTests = [
  { phrase: "B-002 esta prenha?", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
  { phrase: "status da B-002?", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
  { phrase: "ver ficha da B-002", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
  { phrase: "dados do animal B-002", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
  { phrase: "mudar B-002 para lote Piquete 2", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "lote_id", novo_valor: "Piquete 2" } },
  { phrase: "B-002 450kg", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "peso", novo_valor: 450 } },
  { phrase: "B-002 ficou prenha", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "gestante" } },
  { phrase: "B-002 ficou seca", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "seca" } },
  { phrase: "B-002 vendida", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "status", novo_valor: "vendido" } },
  { phrase: "trocar nome da B-002 para Mimosa Nova", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "nome", novo_valor: "Mimosa Nova" } },
  { phrase: "mudar raca da B-002 para Jersey", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "raca", novo_valor: "Jersey" } },
  { phrase: "corrigir nascimento da B-002 para 10/05/2024", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "data_nascimento", novo_valor: "2024-05-10" } },
  { phrase: "B-002 observacao: mancando da pata", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes", novo_valor: "mancando da pata" } },
  { phrase: "nasceu bezerro da vaca B-002", expected: { tipo: "PARTO", exactTipo: true, animal: "B-002" } },
  { phrase: "adicionar vaca com nome Mimosa", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "vaca", nome: "Mimosa", missing: ["animal_codigo"] } }
];

const eventHumanParserTests = [
  eventParser("apliquei aftosa na B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("vacina aftosa na vaca 15", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "15" }),
  eventParser("B001 recebeu vacina aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-001" }),
  eventParser("aplicar brucelose na novilha N-01", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "brucelose", animal: "N-01" }),
  eventParser("vacinei mimosa com aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-001" }),
  eventParser("vacinei a B-002 hoje", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", animal: "B-002", data_referencia: "hoje", missing: ["produto"] }),
  eventParser("vacina da B-002 foi aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("a B-002 tomou aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("apliquei vacina contra aftosa na mimosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-001" }),
  eventParser("vacina brucelose na A12", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "brucelose", animal: "A12" }),
  eventParser("B-002 vacinada com aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("registrar vacina aftosa animal B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("apliquei vacina na vaca estrela", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", animal: "B-002", missing: ["produto"] }),
  eventParser("vacinei o rebanho com aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", missing: ["animal_codigo"] }),
  eventParser("vacina clostridial na B001", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "clostridial", animal: "B-001" }),
  eventParser("aplicar raiva na vaca 002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "raiva", animal: "002" }),
  eventParser("a mimosa recebeu vacina de raiva", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "raiva", animal: "B-001" }),
  eventParser("dose de aftosa na B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("aftosa B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("vacina B-002 aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("apliquei aftoza na B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("vacina aftoza B002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-002" }),
  eventParser("vacinei mimosaa com aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", produto: "aftosa", animal: "B-001" }),
  eventParser("registrar vacina", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "vacina", missing: ["animal_codigo", "produto"] }),

  eventParser("mediquei a mimosa com vermifugo", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-001" }),
  eventParser("apliquei remedio na B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "remedio", animal: "B-002" }),
  eventParser("B001 tomou antibiotico", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "antibiotico", animal: "B-001" }),
  eventParser("tratamento da estrela com vermifugo", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-002" }),
  eventParser("dei medicamento para vaca 15", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "medicamento", animal: "15" }),
  eventParser("apliquei terramicina na B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "terramicina", animal: "B-002" }),
  eventParser("dei vermifugo na mimosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-001" }),
  eventParser("remedio para B001 foi antibiotico", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "antibiotico", animal: "B-001" }),
  eventParser("B-002 recebeu medicamento", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "medicamento", animal: "B-002" }),
  eventParser("medicar animal A12 com vermifugo", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "A12" }),
  eventParser("tratamento com antibiotico na vaca estrela", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "antibiotico", animal: "B-002" }),
  eventParser("dei dipirona na vaca B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "dipirona", animal: "B-002" }),
  eventParser("apliquei anti-inflamatorio na B001", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "anti-inflamatorio", animal: "B-001" }),
  eventParser("vermifugo B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-002" }),
  eventParser("B-002 vermifugo", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-002" }),
  eventParser("tratamento B-002 carrapaticida", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "carrapaticida", animal: "B-002" }),
  eventParser("passei carrapaticida no animal A12", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "carrapaticida", animal: "A12" }),
  eventParser("apliquei pour-on na B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "pour-on", animal: "B-002" }),
  eventParser("dei suplemento na Mimosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "suplemento", animal: "B-001" }),
  eventParser("registrar tratamento", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", missing: ["animal_codigo", "produto"] }),
  eventParser("mediquei mimosa com vermifugo", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-001" }),
  eventParser("vermifugo b002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "vermifugo", animal: "B-002" }),
  eventParser("apliquei remedio na b002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "remedio", animal: "B-002" }),
  eventParser("tratameto da estrela com antibiotico", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, evento_tipo: "tratamento", produto: "antibiotico", animal: "B-002" }),

  eventParser("B-002 ficou doente", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes", novo_valor: "B-002 ficou doente" }),
  eventParser("a mimosa esta doente", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("vaca estrela esta mancando", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("B001 com febre", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("animal A12 com diarreia", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "A12", campo_alterado: "observacoes" }),
  eventParser("a vaca B-002 esta sem comer", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("mimosa com mastite", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("B-002 com carrapato", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("a novilha N-01 esta triste", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "N-01", campo_alterado: "observacoes" }),
  eventParser("animal 15 esta fraco", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "15", campo_alterado: "observacoes" }),
  eventParser("B001 esta tossindo", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("vaca estrela com ferida na pata", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("registrar doenca na Mimosa", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("observacao clinica B-002 febre", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("Mimosa precisa de veterinario", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("B-002 teve queda de producao e esta doente", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("animal A12 com problema no casco", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "A12", campo_alterado: "observacoes" }),
  eventParser("animal doente", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, campo_alterado: "observacoes", missing: ["animal_codigo"] }),
  eventParser("b002 fico doente", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("mimosa esta duente", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("vaca mancandoo", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, campo_alterado: "observacoes", missing: ["animal_codigo"] }),

  eventParser("mimosa pariu hoje", { tipo: "PARTO", exactTipo: true, animal: "B-001", data_referencia: "hoje" }),
  eventParser("B-002 teve parto", { tipo: "PARTO", exactTipo: true, animal: "B-002" }),
  eventParser("vaca estrela pariu um bezerro", { tipo: "PARTO", exactTipo: true, animal: "B-002" }),
  eventParser("a Mimosa teve bezerro macho", { tipo: "PARTO", exactTipo: true, animal: "B-001" }),
  eventParser("B001 teve cria femea", { tipo: "PARTO", exactTipo: true, animal: "B-001" }),
  eventParser("nasceu bezerro da Mimosa", { tipo: "PARTO", exactTipo: true, animal: "B-001" }),
  eventParser("parto da vaca B-002", { tipo: "PARTO", exactTipo: true, animal: "B-002" }),
  eventParser("Mimosa pariu ontem", { tipo: "PARTO", exactTipo: true, animal: "B-001", data_referencia: "ontem" }),
  eventParser("B-002 teve parto dia 01/06/2026", { tipo: "PARTO", exactTipo: true, animal: "B-002", data_referencia: "2026-06-01" }),
  eventParser("nasceu uma bezerra da estrela", { tipo: "PARTO", exactTipo: true, animal: "B-002" }),
  eventParser("a vaca 15 deu cria", { tipo: "PARTO", exactTipo: true, animal: "15" }),
  eventParser("registrar nascimento de bezerro da B-002", { tipo: "PARTO", exactTipo: true, animal: "B-002" }),
  eventParser("parto complicado da B001", { tipo: "PARTO", exactTipo: true, animal: "B-001" }),
  eventParser("partu da mimosa", { tipo: "PARTO", exactTipo: true, animal: "B-001" }),
  eventParser("mimosa pariuu ontem", { tipo: "PARTO", exactTipo: true, animal: "B-001", data_referencia: "ontem" }),
  eventParser("parto", { tipo: "PARTO", exactTipo: true, missing: ["animal_codigo"] }),
  eventParser("aborto da vaca B-002", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),

  eventParser("Mimosa entrou no cio", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("B-002 esta no cio", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("registrar cio da estrela", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("vaca 15 em cio", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "15", campo_alterado: "observacoes" }),
  eventParser("cio B001 hoje", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("a novilha N-01 apresentou cio", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "N-01", campo_alterado: "observacoes" }),
  eventParser("Mimosa esta prenha", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "fase", novo_valor: "gestante" }),
  eventParser("B-002 esta gestante", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "gestante" }),
  eventParser("confirmar prenhez da estrela", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "gestante" }),
  eventParser("diagnostico positivo de prenhez na B001", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "fase", novo_valor: "gestante" }),
  eventParser("vaca 15 vazia", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "15", campo_alterado: "fase", novo_valor: "vazia" }),
  eventParser("Mimosa nao esta prenha", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "fase", novo_valor: "vazia" }),
  eventParser("prenhez negativa na B-002", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "vazia" }),
  eventParser("inseminar Mimosa hoje", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("Mimosa foi inseminada", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("B-002 inseminada com semen do touro T-01", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("cobertura da estrela com touro T-01", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("B001 coberta pelo touro", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("inseminacao da vaca 15 ontem", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "15", campo_alterado: "observacoes", data_referencia: "ontem" }),
  eventParser("registrar cobertura da Mimosa", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes" }),
  eventParser("IA da B-002 com touro Holandes", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("cioo da estrela", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("inseminacao da b002", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes" }),
  eventParser("prenhez da mimosaa", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "fase", novo_valor: "gestante" }),

  eventParser("historico da Mimosa", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-001", consulta: true }),
  eventParser("eventos da B-002", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true }),
  eventParser("vacinas da B001", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-001", consulta: true }),
  eventParser("medicamentos da estrela", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true }),
  eventParser("tratamentos da vaca 15", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "15", consulta: true }),
  eventParser("quando a Mimosa foi vacinada?", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-001", consulta: true }),
  eventParser("qual foi a ultima vacina da B-002?", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true }),
  eventParser("historico clinico da estrela", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true }),
  eventParser("partos da Mimosa", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-001", consulta: true }),
  eventParser("historico reprodutivo da B-002", { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true }),
  eventParser("eventos de hoje", { tipo: "CONSULTA_REGISTROS_HOJE", exactTipo: true, data_referencia: "hoje" }),

  eventParser("B-002", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, animal: "B-002", missing: ["produto"] }, { pending: () => pendingFrom("registrar vacina") }),
  eventParser("Aftosa", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, animal: "B-002", produto: "Aftosa", noMissing: true }, { pending: () => pendingFrom("registrar vacina", ["B-002"]) }),
  eventParser("Vermifugo", { tipo: "VACINA_MEDICAMENTO", exactTipo: true, animal: "B-002", produto: "Vermifugo", noMissing: true }, { pending: () => pendingFrom("registrar tratamento", ["B-002"]) }),
  eventParser("febre", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-001", campo_alterado: "observacoes", noMissing: true }, { pending: () => pendingFrom("animal doente", ["B001"]) }),
  eventParser("nao foi ontem", { tipo: "PARTO", exactTipo: true, animal: "B-001", data_referencia: "ontem", noMissing: true }, { pending: () => pendingFrom("Mimosa pariu hoje") }),
  eventParser("B-002", { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes", noMissing: true }, { pending: () => pendingFrom("registrar cio") }),

  eventParser("Mimosa ontem", { tipo: "DESCONHECIDO", exactTipo: true }),
  eventParser("B-002 5 ml", { tipo: "DESCONHECIDO", exactTipo: true }),
  eventParser("geneologia clinica", { tipo: "DESCONHECIDO", exactTipo: true })
];

const genealogyParserTests = [
  { module: "genealogia", phrase: "ver genealogia da Mimosa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "genealogia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "arvore genealogica da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "árvore genealógica da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "linhagem da vaca Estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "linhagem do animal A12", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "A12", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "historico familiar da Mimosa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "familia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "ver arvore da Estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "mostrar árvore da vaca Lua", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "VACA-15", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "quem sao os pais da Estrela?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "quem é a mãe da B-002?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "mae", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "quem e o pai da B-002?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "pai", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "quais os filhos da Mimosa?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "descendentes", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "descendentes da Mimosa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "descendentes", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "filhos da Estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "descendentes", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "avós da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "avos", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "avo materna da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "avos", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "avô paterno da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "avos", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "genelogia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "geneologia da estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "arvori genealogica da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "arvore", consulta: true, noMissing: true } },

  { module: "genealogia", phrase: "mãe da B-002 é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "a mãe da Estrela é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "define Mimosa como mãe da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "coloca Mimosa como mãe da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "B-002 é filha da Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "Estrela é filha de Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "a vaca Estrela tem mãe Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "mãe do animal A12 é Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "coloca a Estrela como mãe do A12", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "registrar mãe da Lua como Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "VACA-15", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "a novilha N-033 é filha da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "N-033", mae_nome: "Estrela", maeId: "animal-b-002", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "mãe de VACA-15 é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "VACA-15", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },

  { module: "genealogia", phrase: "pai da B-002 é Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "define Touro Rei como pai da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "coloca T-001 como pai da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "B-002 é filha do Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "Touro Rei é pai da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "pai do A12 é T-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", pai_nome: "Touro Forte", paiId: "animal-t-002", genealogia_campo: "pai", noMissing: true } },

  { module: "genealogia", phrase: "mãe da A12 é Estrela e pai é Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "ambos", noMissing: true } },
  { module: "genealogia", phrase: "A12 tem mãe Estrela e pai Touro Forte", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Forte", paiId: "animal-t-002", genealogia_campo: "ambos", noMissing: true } },
  { module: "genealogia", phrase: "A12 é filho da Estrela e do Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "ambos", noMissing: true } },
  { module: "genealogia", phrase: "Novilha N-033 é filha de Estrela com Touro Forte", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "N-033", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Forte", paiId: "animal-t-002", genealogia_campo: "ambos", noMissing: true } },

  { module: "genealogia", phrase: "remove mãe da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_mae: true, genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "tirar pai da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_pai: true, genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "limpa genealogia da A12", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", remover_mae: true, remover_pai: true, genealogia_campo: "ambos", noMissing: true } },
  { module: "genealogia", phrase: "pai da B-002 não informado", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_pai: true, genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "mãe da B-002 não informada", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_mae: true, genealogia_campo: "mae", noMissing: true } },

  { module: "genealogia", phrase: "definir genealogia da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", missing: ["genealogia_campo"] } },
  { module: "genealogia", phrase: "definir mãe da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", genealogia_campo: "mae", missing: ["mae_nome"] } },
  { module: "genealogia", phrase: "definir pai da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", genealogia_campo: "pai", missing: ["pai_nome"] } },
  { module: "genealogia", phrase: "mae", pending: () => pendingFrom("definir genealogia da B-002"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", genealogia_campo: "mae", missing: ["mae_nome"] } },
  { module: "genealogia", phrase: "Mimosa", pending: () => pendingFrom("definir mãe da B-002"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", noMissing: true } },
  { module: "genealogia", phrase: "Touro Rei", pending: () => pendingFrom("definir pai da B-002"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", noMissing: true } },
  { module: "genealogia", phrase: "os dois", pending: () => pendingFrom("definir genealogia da A12"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", genealogia_campo: "ambos", missing: ["mae_nome", "pai_nome"] } },
  { module: "genealogia", phrase: "genelogia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta: true, noMissing: true } },
  { module: "genealogia", phrase: "mai da B-002 é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
  { module: "genealogia", phrase: "paii da B-002 é Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
  { module: "genealogia", phrase: "funcionario Joao é filho da Maria", expected: { tipo: "DESCONHECIDO", exactTipo: true } }
];

const employeePointPayrollParserTests = [
  { module: "funcionarios", phrase: "cadastra funcionario Bruno", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", noMissing: true } },
  { module: "funcionarios", phrase: "cadastra Bruno salario 1500", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", salario_base: 1500, noMissing: true } },
  { module: "funcionarios", phrase: "cadastra funcionario Ana WhatsApp 31999999999", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Ana", telefone: "5531999999999", noMissing: true } },
  { module: "funcionarios", phrase: "cadastra Bruno so no WhatsApp", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", tipo_acesso: "bot_only", missing: ["telefone"] } },
  { module: "funcionarios", phrase: "Bruno trabalha como vaqueiro", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", noMissing: true } },
  { module: "funcionarios", phrase: "adicionar colaboradora Ana telefone 31999999999", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Ana", telefone: "5531999999999", noMissing: true } },
  { module: "funcionarios", phrase: "criar funcionario Pedro cpf 12345678901 salario 2200 cargo vaqueiro", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Pedro", cpf: "12345678901", salario_base: 2200, noMissing: true } },
  { module: "funcionarios", phrase: "novo funcionario Carlos", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Carlos", noMissing: true } },
  { module: "funcionarios", phrase: "contratei Maria", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Maria", noMissing: true } },
  { module: "funcionarios", phrase: "cadastrar funcionario Rafael salario 1900", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Rafael", salario_base: 1900, noMissing: true } },
  { module: "funcionarios", phrase: "muda salario do Bruno para 1800", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Bruno", campo_alterado: "salario_base", novo_valor: 1800, noMissing: true } },
  { module: "funcionarios", phrase: "Bruno agora ganha 2000", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Bruno", campo_alterado: "salario_base", novo_valor: 2000, noMissing: true } },
  { module: "funcionarios", phrase: "altera cargo da Ana para gerente", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Ana", campo_alterado: "funcao", novo_valor: "gerente", noMissing: true } },
  { module: "funcionarios", phrase: "trocar WhatsApp do Joao para 31988887777", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Joao", campo_alterado: "contato_whatsapp", novo_valor: "5531988887777", noMissing: true } },
  { module: "funcionarios", phrase: "alterar cpf do Joao para 12345678901", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Joao", campo_alterado: "cpf", novo_valor: "12345678901", noMissing: true } },
  { module: "funcionarios", phrase: "reativar funcionario Joao", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Joao", campo_alterado: "ativo", novo_valor: true, noMissing: true } },
  { module: "funcionarios", phrase: "desliga funcionario Bruno", expected: { tipo: "DESLIGAR_FUNCIONARIO", funcionario_nome: "Bruno", noMissing: true } },
  { module: "funcionarios", phrase: "exclui funcionario Pedro", expected: { tipo: "EXCLUIR_FUNCIONARIO", funcionario_nome: "Pedro", noMissing: true } },
  { module: "funcionarios", phrase: "apagar colaborador Ana", expected: { tipo: "EXCLUIR_FUNCIONARIO", funcionario_nome: "Ana", noMissing: true } },
  { module: "funcionarios", phrase: "Bruno nao trabalha mais", expected: { tipo: "DESLIGAR_FUNCIONARIO", funcionario_nome: "Bruno", noMissing: true } },
  { module: "funcionarios", phrase: "salario do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "salario_base", noMissing: true } },
  { module: "funcionarios", phrase: "cpf do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "cpf", noMissing: true } },
  { module: "funcionarios", phrase: "WhatsApp do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "contato_whatsapp", noMissing: true } },
  { module: "funcionarios", phrase: "cargo do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "funcao", noMissing: true } },
  { module: "funcionarios", phrase: "listar funcionarios", expected: { tipo: "CONSULTA_FUNCIONARIO", noMissing: true } },
  { module: "funcionarios", phrase: "quantos funcionarios ativos", expected: { tipo: "CONSULTA_FUNCIONARIO", noMissing: true } },
  { module: "ponto", phrase: "Joao entrou as 7", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "joao", ponto_tipo: "entrada", horario: "07:00", noMissing: true } },
  { module: "ponto", phrase: "Joao saiu as 17", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "joao", ponto_tipo: "saida", horario: "17:00", noMissing: true } },
  { module: "ponto", phrase: "Bruno terminou agora", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "Bruno", ponto_tipo: "saida", agora: true, noMissing: true } },
  { module: "ponto", phrase: "registrar ponto", expected: { tipo: "PONTO_FUNCIONARIO", missing: ["funcionario_nome", "horario"] } },
  { module: "ponto", phrase: "entrada do Joao", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "Joao", ponto_tipo: "entrada", missing: ["horario"] } },
  { module: "ponto", phrase: "ponto do Joao hoje", expected: { tipo: "CONSULTA_PONTO", funcionario_nome: "Joao", consulta: true, noMissing: true } },
  { module: "ponto", phrase: "relatorio de ponto do Joao hoje", expected: { tipo: "CONSULTA_PONTO", funcionario_nome: "Joao", consulta: true, noMissing: true } },
  { module: "ponto", phrase: "ponto do mes", expected: { tipo: "CONSULTA_PONTO", consulta: true, noMissing: true } },
  { module: "ponto", phrase: "quem bateu ponto hoje", expected: { tipo: "CONSULTA_PONTO", consulta: true, noMissing: true } },
  { module: "ponto", phrase: "horas do Joao hoje", expected: { tipo: "CONSULTA_PONTO", funcionario_nome: "Joao", consulta: true, noMissing: true } },
  { module: "folha", phrase: "folha do mes", expected: { tipo: "CONSULTA_FINANCEIRO", noMissing: true } },
  { module: "folha", phrase: "paguei salario do Joao 1500", expected: { tipo: "DESPESA", valor: 1500, descricao: "salario do Joao", noMissing: true } },
  { module: "folha", phrase: "pagamento funcionario Bruno 800", expected: { tipo: "DESPESA", valor: 800, descricao: "funcionario Bruno", noMissing: true } },
  { module: "folha", phrase: "paguei diaria da Ana 120", expected: { tipo: "DESPESA", valor: 120, descricao: "diaria da Ana", noMissing: true } },
  { module: "folha", phrase: "salario pago Joao 1800", expected: { tipo: "DESPESA", valor: 1800, descricao: "salario pago Joao", noMissing: true } }
];

const botConversationTests = [
  {
    name: "producao com dado faltante, sessao e confirmacao em dry-run",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "vaca B-002 deu leite",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "aguardando_dado",
          missing: ["litros"],
          responseIncludes: "litro"
        }
      },
      {
        text: "32",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoAnterior: "aguardando_dado",
          estadoNovo: "aguardando_confirmacao",
          dados: { litros: 32, animal_codigo: "B-002" },
          responseIncludes: "correto"
        }
      },
      {
        text: "sim",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoAnterior: "aguardando_confirmacao",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo",
          responseRawIncludes: "Confirmação",
          responseRawNotIncludes: ["ConfirmaÃ", "produÃ"]
        }
      }
    ]
  },
  {
    name: "correcao antes de confirmar nao salva e atualiza entidades",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "vaca B-002 deu 18 litros",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "aguardando_confirmacao",
          dados: { litros: 18 }
        }
      },
      {
        text: "corrigir 20 litros",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoAnterior: "aguardando_confirmacao",
          estadoNovo: "aguardando_confirmacao",
          dados: { litros: 20 },
          responseIncludes: "Agora entendi"
        }
      },
      {
        text: "sim",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo"
        }
      }
    ]
  },
  {
    name: "cancelamento limpa a sessao sem salvar",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "vaca B-002 deu leite",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "aguardando_dado",
          missing: ["litros"]
        }
      },
      {
        text: "cancelar",
        expected: {
          estadoAnterior: "aguardando_dado",
          estadoNovo: "livre",
          responseIncludes: "Nada foi salvo"
        }
      }
    ]
  },
  {
    name: "compra de estoque passa por catalogo e confirmacao sem gravar",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "comprei 3 sacos de sal mineral por 180 reais",
        expected: {
          intent: "ESTOQUE_ENTRADA",
          estadoNovo: "aguardando_confirmacao",
          dados: {
            item_nome: "Sal mineral",
            quantidade: 3,
            valor: 180
          }
        }
      },
      {
        text: "sim",
        expected: {
          intent: "ESTOQUE_ENTRADA",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo"
        }
      }
    ]
  },
  {
    name: "cadastro de animal pergunta opcionais e permite pular",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "adicionar vaca",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "aguardando_dado",
          missing: ["brinco"],
          responseIncludes: "brinco"
        }
      },
      {
        text: "B-777",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoAnterior: "aguardando_dado",
          estadoNovo: "aguardando_dado",
          dados: { animal_codigo: "B-777" },
          missing: ["sexo"],
          responseIncludes: "sexo"
        }
      },
      {
        text: "femea",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "aguardando_dado",
          dados: { sexo: "femea" },
          missing: ["fase"],
          responseIncludes: "fase"
        }
      },
      {
        text: "gestante",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "aguardando_dado",
          dados: { fase: "gestante" },
          missing: ["raca"],
          responseIncludes: "ra"
        }
      },
      {
        text: "Girolando",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "aguardando_dado",
          dados: { raca: "Girolando" },
          missing: ["lote"],
          responseIncludes: "lote"
        }
      },
      {
        text: "Lactacao 1",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "aguardando_dado",
          dados: { lote_id: "lote-lactacao-1" },
          missing: ["nascimento"],
          responseIncludes: "nascimento"
        }
      },
      {
        text: "2",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "aguardando_confirmacao",
          dados: { animal_codigo: "B-777", sexo: "femea", fase: "gestante", raca: "Girolando", lote_id: "lote-lactacao-1" },
          responseIncludes: "correto"
        }
      },
      {
        text: "sim",
        expected: {
          intent: "CADASTRO_ANIMAL",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo"
        }
      }
    ]
  },
  {
    name: "funcionario comum nao pode criar item de estoque",
    phone: BOT_TEST_WORKER_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "criar estoque de racao nova",
        expected: {
          intent: "CRIAR_ITEM_ESTOQUE",
          estadoNovo: "livre",
          responseIncludes: "permiss"
        }
      }
    ]
  },
  {
    name: "telefone nao autorizado recebe bloqueio amigavel",
    phone: "5583000000000",
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "menu",
        expected: {
          estadoNovo: null,
          responseIncludes: "autorizado"
        }
      }
    ]
  },
  {
    name: "dono com telefone no perfil pode usar bot mesmo sem whatsapp_usuarios",
    phone: BOT_TEST_ADMIN_PHONE,
    whatsappUsers: [],
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "quanto leite hoje",
        expected: {
          intent: "CONSULTA_PRODUCAO_HOJE",
          estadoNovo: "livre",
          responseIncludes: "12"
        }
      }
    ]
  },
  {
    name: "consulta usa base mockada sem abrir confirmacao",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "quanto leite hoje",
        expected: {
          intent: "CONSULTA_PRODUCAO_HOJE",
          estadoNovo: "livre",
          responseIncludes: "12"
        }
      }
    ]
  },
  {
    name: "consulta de producao geral nao abre confirmacao",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "Quantos litros foram ordenhados hoje?",
        expected: {
          intent: "CONSULTA_PRODUCAO_HOJE",
          estadoNovo: "livre",
          responseIncludes: "Hoje foram registrados 12"
        }
      }
    ]
  },
  {
    name: "consulta de producao por animal usa ordenhas reais",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "A vaca B-002 deu quantos litros?",
        expected: {
          intent: "CONSULTA_PRODUCAO_ANIMAL",
          estadoNovo: "livre",
          responseIncludes: "B-002 produziu 12"
        }
      }
    ]
  },
  {
    name: "consulta de animal usa cadastro sem abrir confirmacao",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "B-002 esta prenha?",
        expected: {
          intent: "CONSULTA_ANIMAL",
          estadoNovo: "livre",
          dados: { animal_codigo: "B-002" },
          responseIncludes: "Fase: gestante"
        }
      }
    ]
  },
  {
    name: "atualizacao de animal pede confirmacao e nao grava no dry-run",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "mudar B-002 para lote Piquete 2",
        expected: {
          intent: "ATUALIZACAO_ANIMAL",
          estadoNovo: "aguardando_confirmacao",
          dados: {
            animal_codigo: "B-002",
            campo_alterado: "lote_id",
            novo_valor: "Piquete 2"
          },
          responseIncludes: "atualizar lote_id"
        }
      },
      {
        text: "sim",
        expected: {
          intent: "ATUALIZACAO_ANIMAL",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo"
        }
      }
    ]
  },
  {
    name: "cancelamento explicito durante confirmacao limpa sem salvar",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "B-002 deu 30 litros",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "aguardando_confirmacao",
          dados: { animal_codigo: "B-002", litros: 30 }
        }
      },
      {
        text: "nao salvar",
        expected: {
          estadoAnterior: "aguardando_confirmacao",
          estadoNovo: "livre",
          responseIncludes: "Cancelado"
        }
      }
    ]
  },
  {
    name: "rejeicao simples durante confirmacao limpa sem salvar",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "B-002 deu 30 litros",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "aguardando_confirmacao",
          dados: { animal_codigo: "B-002", litros: 30 }
        }
      },
      {
        text: "negativo",
        expected: {
          estadoAnterior: "aguardando_confirmacao",
          estadoNovo: "livre",
          responseIncludes: "Nada foi salvo"
        }
      }
    ]
  },
  {
    name: "nova operacao substitui pendente antes de confirmar",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "B-002 deu 30 litros",
        expected: {
          intent: "PRODUCAO_LEITE",
          estadoNovo: "aguardando_confirmacao",
          dados: { animal_codigo: "B-002", litros: 30 }
        }
      },
      {
        text: "comprei 3 sacos de milho por 120 reais",
        expected: {
          intent: "ESTOQUE_ENTRADA",
          estadoAnterior: "aguardando_confirmacao",
          estadoNovo: "aguardando_confirmacao",
          dados: { item_nome: "Milho", quantidade: 3, unidade: "saco", valor: 120 },
          responseIncludes: "Troquei"
        }
      },
      {
        text: "sim",
        expected: {
          intent: "ESTOQUE_ENTRADA",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo"
        }
      }
    ]
  },
  {
    name: "consulta de item de estoque usa item real",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "Como está o estoque de ração de boi?",
        expected: {
          intent: "CONSULTA_ESTOQUE_ITEM",
          estadoNovo: "livre",
          responseIncludes: "Estoque de Ração de boi"
        }
      }
    ]
  },
  {
    name: "consulta de item inexistente nao salva nem cria item",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "Ainda tem item inexistente?",
        expected: {
          intent: "CONSULTA_ESTOQUE_ITEM",
          estadoNovo: "livre",
          responseIncludes: "Não encontrei esse item"
        }
      }
    ]
  },
  {
    name: "consulta de registros de hoje nao abre confirmacao",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "O que eu registrei hoje?",
        expected: {
          intent: "CONSULTA_REGISTROS_HOJE",
          estadoNovo: "livre",
          responseIncludes: "Você ainda não registrou nada hoje"
        }
      }
    ]
  },
  {
    name: "ponto de funcionario pede confirmacao e nao grava no dry-run",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "Joao entrou as 7:30",
        expected: {
          intent: "PONTO_FUNCIONARIO",
          estadoNovo: "aguardando_confirmacao",
          dados: {
            funcionario_nome: "Joao",
            ponto_tipo: "entrada",
            horario: "07:30"
          }
        }
      },
      {
        text: "sim",
        expected: {
          intent: "PONTO_FUNCIONARIO",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "Nenhum registro real foi salvo"
        }
      }
    ]
  },
  {
    name: "lote de producao resolve item unico de estoque de leite sem movimentar no dry-run",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    messages: [
      {
        text: "vaca 1 deu 14 litros e vaca 2 15 no tanque",
        expected: {
          intent: "LOTE_REGISTROS",
          estadoNovo: "aguardando_confirmacao",
          dados: {
            total_litros: 29,
            estoque_leite_status: "matched",
            estoque_leite_item_nome: "Leite Cru",
            estoque_leite_item_id: "item-leite-cru",
            estoque_leite_movimentar: false
          },
          responseIncludes: "entrada no estoque",
          responseRawIncludes: ["ficará", "produção"],
          responseRawNotIncludes: ["ficarÃ", "produÃ"]
        }
      },
      {
        text: "sim",
        expected: {
          intent: "LOTE_REGISTROS",
          estadoNovo: "livre",
          eventoConfirmado: true,
          responseIncludes: "estoque_movimentar: nao",
          responseRawIncludes: "Simulação",
          responseRawNotIncludes: ["SimulaÃ", "produÃ"]
        }
      }
    ]
  },
  {
    name: "lote de producao lista multiplos itens compativeis de leite sem movimentar",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    extraStockItems: [
      { id: "item-leite-in-natura", nome: "Leite in natura", unidade_medida: "litro" }
    ],
    messages: [
      {
        text: "vaca 1 deu 14 litros e vaca 2 15",
        expected: {
          intent: "LOTE_REGISTROS",
          estadoNovo: "aguardando_confirmacao",
          dados: {
            total_litros: 29,
            estoque_leite_status: "ambiguous",
            estoque_leite_movimentar: false
          },
          responseIncludes: "mais de um item"
        }
      }
    ]
  },
  {
    name: "lote de producao sem item de leite registra apenas producao",
    phone: BOT_TEST_ADMIN_PHONE,
    expectNoBusinessWrites: true,
    stockItems: mockStock.filter((item) => !/leite/i.test(item.nome)),
    messages: [
      {
        text: "vaca 1 deu 14 litros e vaca 2 15",
        expected: {
          intent: "LOTE_REGISTROS",
          estadoNovo: "aguardando_confirmacao",
          dados: {
            total_litros: 29,
            estoque_leite_status: "not_found",
            estoque_leite_movimentar: false
          },
          responseIncludes: "item de estoque"
        }
      }
    ]
  }
];

const positiveConfirmationFrameworkCases = ["s", "ss", "ok", "pode salvar", "salvar", "registrar", "fechou", "show"].map((confirmation) => ({
  name: `confirmacao positiva aceita: ${confirmation}`,
  module: "confirmacao",
  phone: BOT_TEST_ADMIN_PHONE,
  messages: ["B-002 deu 32 litros", confirmation],
  expected: {
    finalIntent: "PRODUCAO_LEITE",
    entities: { animal_codigo: "B-002", litros: 32 },
    shouldAskConfirmation: true,
    shouldSaveBeforeConfirmation: false,
    savedAfterConfirmation: true,
    simulatedSaveCount: 1,
    savedTables: [BOT_TEST_TABLES.ordenhas],
    shouldNotDuplicate: true,
    shouldNotWriteBusiness: true,
    ranchId: BOT_TEST_FARM_ID
  }
}));

const negativeConfirmationFrameworkCases = ["cancelar", "nao salvar", "esquece", "deixa pra la", "negativo", "2"].map((rejection) => ({
  name: `confirmacao negativa limpa: ${rejection}`,
  module: "confirmacao",
  phone: BOT_TEST_ADMIN_PHONE,
  messages: ["B-002 deu 32 litros", rejection],
  expected: {
    finalIntent: "PRODUCAO_LEITE",
    entities: { animal_codigo: "B-002", litros: 32 },
    shouldAskConfirmation: true,
    shouldSaveBeforeConfirmation: false,
    savedAfterConfirmation: false,
    shouldClearSession: true,
    shouldNotWriteBusiness: true
  }
}));

const animalFrameworkCases = [
  {
    name: "consulta de animal nao passa por confirmacao",
    module: "animais",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["B-002 esta prenha?"],
    expected: {
      finalIntent: "CONSULTA_ANIMAL",
      entities: { animal_codigo: "B-002" },
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "atualizacao de animal confirma em dry-run sem escrita real",
    module: "animais",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mudar B-002 para lote Piquete 2", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_ANIMAL",
      entities: { animal_codigo: "B-002", campo_alterado: "lote_id", novo_valor: "Piquete 2" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { campo_alterado: "lote_id", novo_valor: "Piquete 2" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "nova operacao substitui producao pendente",
    module: "confirmacao",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["B-002 deu 30 litros", "comprei 3 sacos de milho por 120 reais"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Milho", quantidade: 3, unidade: "saco", valor: 120 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  }
];

const eventFrameworkCases = [
  {
    name: "vacina completa pede confirmacao e nao salva antes",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "vacina salva uma vez apos confirmacao em dry-run",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "tratamento salva uma vez apos confirmacao em dry-run",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mediquei Mimosa com vermifugo", "ok"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-001", produto: "vermifugo", evento_tipo: "tratamento" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "B-001", produto: "vermifugo", evento_tipo: "tratamento" },
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "parto salva uma vez apos confirmacao em dry-run",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["Mimosa pariu hoje", "confirma"],
    expected: {
      finalIntent: "PARTO",
      entities: { animal_codigo: "B-001", data_referencia: "hoje" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "B-001", evento_tipo: "PARTO" },
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "doenca vira observacao clinica e salva so apos confirmacao",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["B-002 ficou doente", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_ANIMAL",
      entities: { animal_codigo: "B-002", campo_alterado: "observacoes" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { animal_codigo: "B-002", campo_alterado: "observacoes" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "cio vira observacao reprodutiva e salva so apos confirmacao",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["Mimosa entrou no cio", "pode salvar"],
    expected: {
      finalIntent: "ATUALIZACAO_ANIMAL",
      entities: { animal_codigo: "B-001", campo_alterado: "observacoes" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "prenhez positiva altera fase somente apos confirmar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["confirmar prenhez da estrela", "isso mesmo"],
    expected: {
      finalIntent: "ATUALIZACAO_ANIMAL",
      entities: { animal_codigo: "B-002", campo_alterado: "fase", novo_valor: "gestante" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { animal_codigo: "B-002", campo_alterado: "fase", novo_valor: "gestante" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "inseminacao vira observacao e confirma antes de salvar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["B-002 inseminada com semen do touro T-01", "certo"],
    expected: {
      finalIntent: "ATUALIZACAO_ANIMAL",
      entities: { animal_codigo: "B-002", campo_alterado: "observacoes" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "vacina em etapas coleta animal e produto antes de confirmar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["registrar vacina", "B-002", "aftosa", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "B-002", produto: "aftosa" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "tratamento em etapas coleta animal e produto antes de confirmar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["registrar tratamento", "Mimosa", "vermifugo", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-001", produto: "vermifugo", evento_tipo: "tratamento" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "B-001", produto: "vermifugo" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "doenca em etapas coleta animal antes de confirmar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["animal doente", "B001", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_ANIMAL",
      entities: { animal_codigo: "B-001", campo_alterado: "observacoes" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "parto em etapas coleta mae antes de confirmar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["registrar parto", "Mimosa", "sim"],
    expected: {
      finalIntent: "PARTO",
      entities: { animal_codigo: "B-001" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "correcao de vacina antes de salvar troca produto",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vacinei B-002 com aftosa", "nao, foi brucelose", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "brucelose", evento_tipo: "vacina" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { produto: "brucelose" },
      shouldNotSaveValues: { produto: "aftosa" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "correcao de animal antes de salvar troca animal",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002", "nao, foi na 15", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "15", produto: "aftosa" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "15", produto: "aftosa" },
      shouldNotSaveValues: { animal_codigo: "B-002" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "correcao de data de parto antes de salvar",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["Mimosa pariu hoje", "nao, foi ontem", "sim"],
    expected: {
      finalIntent: "PARTO",
      entities: { animal_codigo: "B-001", data_referencia: "ontem" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "cancelamento de vacina limpa sessao e confirmacao antiga nao salva",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002", "cancelar", "sim"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "confirmacao negativa de vacina nao salva",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002", "nao"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "repetir resumo de vacina antes de confirmar nao duplica",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002", "repete", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "aftosa" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "confirmacao duplicada de vacina nao duplica salvamento",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["apliquei aftosa na B-002", "sim", "sim"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "consulta de historico por animal nao salva",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["historico da Mimosa"],
    expected: {
      finalIntent: "CONSULTA_ANIMAL",
      entities: { animal_codigo: "B-001" },
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "consulta de registros de hoje nao pede confirmacao nem salva",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["eventos de hoje"],
    expected: {
      finalIntent: "CONSULTA_REGISTROS_HOJE",
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "baixa de estoque de dose continua separada de evento e nao salva antes",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["usei 1 dose de aftosa na B-002"],
    expected: {
      finalIntent: "ESTOQUE_SAIDA",
      entities: { item_nome: "Aftosa", quantidade: 1, unidade: "dose" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "telefone nao autorizado nao registra vacina",
    module: "eventos",
    phone: "5583000000000",
    messages: ["apliquei aftosa na B-002", "sim"],
    expected: {
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "vacina usa fazenda do telefone autorizado B",
    module: "eventos",
    phone: BOT_TEST_ADMIN_PHONE_B,
    ranches: [{ id: BOT_TEST_FARM_ID_B, nome: "Fazenda B" }],
    whatsappUsers: [
      {
        id: "wa-admin-b",
        fazenda_id: BOT_TEST_FARM_ID_B,
        usuario_id: "user-admin-b",
        funcionario_id: null,
        telefone_e164: BOT_TEST_ADMIN_PHONE_B,
        nome_exibicao: "Dono B",
        papel_bot: "admin",
        ativo: true
      }
    ],
    extraAnimals: [{ id: "animal-b-b-002", brinco: "B-002", fazenda_id: BOT_TEST_FARM_ID_B, nome: "Mimosa B" }],
    messages: ["apliquei aftosa na B-002", "sim"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "aftosa" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.eventosAnimal],
      shouldSaveValues: { animal_codigo: "B-002", produto: "aftosa" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID_B
    }
  }
];

const inventoryFrameworkCases = [
  {
    name: "entrada de estoque completa pede confirmacao e nao salva antes",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "entrada de estoque salva uma vez apos confirmacao em dry-run",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao", "sim"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "baixa de estoque salva uma vez apos confirmacao em dry-run",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["usei 2 sacos de racao", "ok"],
    expected: {
      finalIntent: "ESTOQUE_SAIDA",
      entities: { item_nome: "Racao", quantidade: 2, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "consulta de estoque nao abre confirmacao nem salva",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["quanto tem de racao?"],
    expected: {
      finalIntent: "CONSULTA_ESTOQUE_ITEM",
      entities: { item_nome: "Racao" },
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "entrada incompleta coleta item antes de confirmar",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos", "racao"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "baixa incompleta coleta quantidade antes de confirmar",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["usei racao", "2 sacos"],
    expected: {
      finalIntent: "ESTOQUE_SAIDA",
      entities: { item_nome: "Racao", quantidade: 2, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "correcao de quantidade antes de confirmar salva valor corrigido",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao", "na verdade foram 12", "sim"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Racao", quantidade: 12, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
      shouldSaveValues: { quantidade: 12 },
      shouldNotSaveValues: { quantidade: 10 },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "correcao de item antes de confirmar salva item corrigido",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao", "era sal mineral", "ok"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Sal mineral", quantidade: 10, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
      shouldSaveValues: { item_nome: "Sal mineral" },
      shouldNotSaveValues: { item_nome: "Racao" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "cancelamento de estoque limpa sessao e confirmacao antiga nao salva",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao", "cancela", "sim"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "confirmacao duplicada de estoque nao duplica salvamento",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao", "sim", "sim"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "nova operacao de estoque substitui pendente sem salvar a antiga",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["chegou 10 sacos de racao", "chegou 5 sacos de sal mineral", "sim"],
    expected: {
      finalIntent: "ESTOQUE_ENTRADA",
      entities: { item_nome: "Sal mineral", quantidade: 5, unidade: "saco" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.estoqueMovimentacoes],
      shouldSaveValues: { item_nome: "Sal mineral", quantidade: 5 },
      shouldNotSaveValues: { item_nome: "Racao", quantidade: 10 },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "telefone nao autorizado nao executa estoque sensivel",
    module: "permissao",
    phone: "5583000000000",
    messages: ["chegou 10 sacos de racao"],
    expected: {
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  }
];

const financeFrameworkCases = [
  {
    name: "entrada financeira completa pede confirmacao e nao salva antes",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 900, descricao: "venda de leite" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "entrada financeira salva uma vez apos confirmacao em dry-run",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900", "sim"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 900, descricao: "venda de leite" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { tipo: "entrada", valor: 900 },
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "saida financeira salva uma vez apos confirmacao em dry-run",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei energia 400", "ok"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 400, descricao: "energia" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { tipo: "saida", valor: 400 },
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "saida incompleta coleta valor antes de confirmar",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei energia", "400"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 400, descricao: "energia" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "saida incompleta coleta descricao antes de confirmar",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["saida 300", "racao"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 300, descricao: "racao" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "correcao de valor financeiro antes de salvar usa valor corrigido",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei energia 40", "na verdade foi 400", "sim"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 400, descricao: "energia" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { valor: 400 },
      shouldNotSaveValues: { valor: 40 },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "correcao de descricao financeira antes de salvar usa descricao corrigida",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei energia 400", "era racao", "sim"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 400, descricao: "racao" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { descricao: "racao" },
      shouldNotSaveValues: { descricao: "energia" },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "troca operacao financeira pendente e salva somente a nova",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900", "paguei energia 400", "sim"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 400, descricao: "energia" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { tipo: "saida", valor: 400 },
      shouldNotSaveValues: { valor: 900 },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "cancelamento financeiro limpa sessao e confirmacao antiga nao salva",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900", "cancelar", "sim"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "rejeicao financeira limpa sessao sem salvar",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900", "nao"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 900, descricao: "venda de leite" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "repetir resumo financeiro mantem pendencia e salva uma vez",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900", "repete", "sim"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 900, descricao: "venda de leite" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "repetir sem pendencia nao salva",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["repete"],
    expected: {
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "confirmacao duplicada financeira nao duplica salvamento",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi leite por 900", "sim", "sim"],
    expected: {
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "consulta financeira nao pede confirmacao nem salva",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    financeTransactions: [
      { tipo: "entrada", valor: 1200, descricao: "leite" },
      { tipo: "saida", valor: 300, descricao: "racao" }
    ],
    messages: ["financeiro do mes"],
    expected: {
      finalIntent: "CONSULTA_FINANCEIRO",
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "valor zero em financeiro fica aguardando dado e nao salva",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei 0 na racao"],
    expected: {
      finalIntent: "DESPESA",
      entities: { descricao: "racao" },
      shouldAskFollowUp: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "valor negativo em financeiro fica aguardando dado e nao salva",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei -300 na racao"],
    expected: {
      finalIntent: "DESPESA",
      entities: { descricao: "racao" },
      shouldAskFollowUp: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "telefone nao autorizado nao executa financeiro sensivel",
    module: "financeiro",
    phone: "5583000000000",
    messages: ["vendi leite por 900"],
    expected: {
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario nao consulta financeiro",
    module: "financeiro",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["financeiro do mes"],
    expected: {
      finalIntent: "CONSULTA_FINANCEIRO",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "financeiro respeita fazenda do usuario whatsapp",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE_B,
    ranches: [{ id: BOT_TEST_FARM_ID_B, nome: "Fazenda B" }],
    whatsappUsers: [
      {
        id: "wa-admin-b",
        fazenda_id: BOT_TEST_FARM_ID_B,
        usuario_id: "user-admin-b",
        funcionario_id: null,
        telefone_e164: BOT_TEST_ADMIN_PHONE_B,
        nome_exibicao: "Dono B",
        papel_bot: "admin",
        ativo: true
      }
    ],
    messages: ["vendi leite por 900", "sim"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 900, descricao: "venda de leite" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { tipo: "entrada", valor: 900 },
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID_B
    }
  }
];

const employeePointPayrollFrameworkCases = [
  {
    name: "admin cadastra funcionario sem whatsapp e nao cria usuario whatsapp",
    module: "funcionarios",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["cadastra funcionario Bruno", "sim"],
    expected: {
      finalIntent: "CRIAR_FUNCIONARIO",
      entities: { funcionario_nome: "Bruno" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.funcionarios],
      shouldSaveValues: { nome: "Bruno" },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "admin cadastra funcionario com whatsapp e simula acesso bot",
    module: "funcionarios",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["cadastra funcionario Ana WhatsApp 31999999999", "sim"],
    expected: {
      finalIntent: "CRIAR_FUNCIONARIO",
      entities: { funcionario_nome: "Ana", telefone: "5531999999999" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 2,
      savedTables: [BOT_TEST_TABLES.funcionarios, BOT_TEST_TABLES.whatsappUsuarios],
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "cadastro bot only pergunta whatsapp antes de confirmar",
    module: "funcionarios",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["cadastra Bruno so no WhatsApp", "31999999999", "sim"],
    expected: {
      finalIntent: "CRIAR_FUNCIONARIO",
      entities: { funcionario_nome: "Bruno", telefone: "5531999999999", tipo_acesso: "bot_only" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 2,
      savedTables: [BOT_TEST_TABLES.funcionarios, BOT_TEST_TABLES.whatsappUsuarios],
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario comum nao cadastra funcionario",
    module: "funcionarios",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["cadastra funcionario Bruno"],
    expected: {
      finalIntent: "CRIAR_FUNCIONARIO",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "admin atualiza salario de funcionario",
    module: "funcionarios",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["muda salario do Joao para 2000", "sim"],
    expected: {
      finalIntent: "ATUALIZAR_FUNCIONARIO",
      entities: { funcionario_nome: "Joao", campo_alterado: "salario_base", novo_valor: 2000 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.funcionarios],
      shouldSaveValues: { campo_alterado: "salario_base" },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario comum nao altera salario",
    module: "funcionarios",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["muda salario do Joao para 2000"],
    expected: {
      finalIntent: "ATUALIZAR_FUNCIONARIO",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "admin desliga funcionario",
    module: "funcionarios",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["desliga funcionario Joao", "sim"],
    expected: {
      finalIntent: "DESLIGAR_FUNCIONARIO",
      entities: { funcionario_nome: "Joao" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.funcionarios],
      shouldSaveValues: { ativo: false },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "admin exclui funcionario como acao logica",
    module: "funcionarios",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["exclui funcionario Joao", "sim"],
    expected: {
      finalIntent: "EXCLUIR_FUNCIONARIO",
      entities: { funcionario_nome: "Joao" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.funcionarios],
      shouldSaveValues: { ativo: false },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "ponto completo salva apenas apos confirmacao",
    module: "ponto",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["Joao entrou as 7", "sim"],
    expected: {
      finalIntent: "PONTO_FUNCIONARIO",
      entities: { funcionario_nome: "Joao", ponto_tipo: "entrada", horario: "07:00" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.registrosPonto],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "ponto em etapas pergunta horario",
    module: "ponto",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["entrada do Joao", "7:30", "sim"],
    expected: {
      finalIntent: "PONTO_FUNCIONARIO",
      entities: { funcionario_nome: "Joao", ponto_tipo: "entrada", horario: "07:30" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.registrosPonto],
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario registra proprio ponto sem nome quando whatsapp vinculado",
    module: "ponto",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["registrar ponto agora", "sim"],
    expected: {
      finalIntent: "PONTO_FUNCIONARIO",
      entities: { funcionario_nome: "Joao", ponto_tipo: "entrada", agora: true },
      shouldAskConfirmation: true,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.registrosPonto],
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "admin consulta ponto sem confirmacao",
    module: "ponto",
    phone: BOT_TEST_ADMIN_PHONE,
    pointRecords: [{ funcionario_id: "func-joao", tipo: "entrada" }, { funcionario_id: "func-joao", tipo: "saida" }],
    messages: ["ponto do Joao hoje"],
    expected: {
      finalIntent: "CONSULTA_PONTO",
      entities: { funcionario_nome: "Joao" },
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario comum nao consulta ponto",
    module: "ponto",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["ponto do Joao hoje"],
    expected: {
      finalIntent: "CONSULTA_PONTO",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "consulta salario de funcionario nao salva",
    module: "folha",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["salario do Joao"],
    expected: {
      finalIntent: "CONSULTA_FUNCIONARIO",
      entities: { funcionario_nome: "Joao", consulta_campo: "salario_base" },
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "pagamento de salario vira despesa apos confirmacao",
    module: "folha",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["paguei salario do Joao 1500", "sim"],
    expected: {
      finalIntent: "DESPESA",
      entities: { valor: 1500 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { tipo: "saida", valor: 1500 },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario comum nao consulta folha financeira",
    module: "folha",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["folha do mes"],
    expected: {
      finalIntent: "CONSULTA_FINANCEIRO",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  }
];

const genealogyFrameworkCases = [
  {
    name: "consulta genealogia responde sem confirmacao",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["genealogia da B-002"],
    expected: {
      finalIntent: "CONSULTA_GENEALOGIA",
      entities: { animal_codigo: "B-002", consulta_genealogia: "arvore" },
      responseIncludes: "Mãe",
      responseNotIncludes: "Está correto",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "consulta filhos lista descendentes sem salvar",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["filhos da Estrela"],
    expected: {
      finalIntent: "CONSULTA_GENEALOGIA",
      entities: { animal_codigo: "B-002", consulta_genealogia: "descendentes" },
      responseIncludes: "Princesa",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "consulta avos de princesa usa pai e mae",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["avós da Princesa"],
    expected: {
      finalIntent: "CONSULTA_GENEALOGIA",
      entities: { animal_codigo: "B-003", consulta_genealogia: "avos" },
      responseIncludes: "Maternos",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "define mae pede confirmacao e nao salva antes",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Estrela"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "A12", mae_id: "animal-b-002" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "define mae salva apenas apos confirmacao em dry-run",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Estrela", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "A12", mae_id: "animal-b-002" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { mae_id: "animal-b-002" },
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "define pai salva apenas apos confirmacao em dry-run",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["pai do A12 é T-002", "ok"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "A12", pai_id: "animal-t-002" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { pai_id: "animal-t-002" },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "define pai e mae na mesma mensagem",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["A12 tem mãe Estrela e pai Touro Forte", "pode salvar"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "A12", mae_id: "animal-b-002", pai_id: "animal-t-002" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { mae_id: "animal-b-002", pai_id: "animal-t-002" },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "remove mae com confirmacao",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["remove mãe da B-002", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "B-002", remover_mae: true },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { mae_id: null },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "correcao antes de salvar troca mae",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Mimosa", "não, foi Estrela", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "A12", mae_id: "animal-b-002" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldSaveValues: { mae_id: "animal-b-002" },
      shouldNotSaveValues: { mae_id: "animal-b-001" },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "negacao sem correcao cancela e nao salva",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Estrela", "não"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      shouldAskConfirmation: true,
      savedAfterConfirmation: false,
      shouldClearSession: true,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "cancelamento limpa genealogia pendente",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Estrela", "cancelar"],
    expected: {
      shouldClearSession: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "repetir mostra confirmacao pendente sem salvar",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Estrela", "repetir"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      responseIncludes: "Está correto",
      shouldAskConfirmation: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "confirmacao duplicada nao duplica acao",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe do animal A12 é Estrela", "sim", "sim"],
    expected: {
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      detectStuck: false
    }
  },
  {
    name: "fluxo em etapas coleta mae",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["definir mãe da B-002", "Mimosa", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "B-002", mae_id: "animal-b-001" },
      shouldAskFollowUp: true,
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "funcionario comum nao altera genealogia",
    module: "genealogia",
    phone: BOT_TEST_WORKER_PHONE,
    messages: ["mãe do animal A12 é Estrela"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      responseIncludes: "não tem permissão",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "animal nao pode ser mae dele mesmo",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe da B-002 é B-002"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      responseIncludes: "não pode ser pai ou mãe dele mesmo",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "bloqueia ciclo com descendente como mae",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["mãe da B-002 é Princesa"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      responseIncludes: "descendente",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "pai inexistente pede dado sem salvar",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["pai da A12 é Touro Fantasma"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      responseIncludes: "Não encontrei",
      shouldAskFollowUp: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "nome duplicado pede esclarecimento",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE,
    extraAnimals: [
      { id: "animal-dup-1", brinco: "D-001", nome: "Duplicada" },
      { id: "animal-dup-2", brinco: "D-002", nome: "Duplicada" }
    ],
    messages: ["mãe da A12 é Duplicada"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      responseIncludes: "mais de uma opção",
      shouldAskFollowUp: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "rancho b consulta arvore isolada",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE_B,
    messages: ["genealogia da B-001"],
    expected: {
      finalIntent: "CONSULTA_GENEALOGIA",
      entities: { animal_codigo: "B-001" },
      responseIncludes: "Não informado",
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "rancho b update usa fazenda correta",
    module: "genealogia",
    phone: BOT_TEST_ADMIN_PHONE_B,
    messages: ["pai da B-001 é T-001", "sim"],
    expected: {
      finalIntent: "ATUALIZACAO_GENEALOGIA",
      entities: { animal_codigo: "B-001", pai_id: "animal-b2-t-001" },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.animais],
      ranchId: BOT_TEST_FARM_ID_B,
      shouldNotWriteBusiness: true
    }
  }
];

const structuredBotEvaluationCases = [
  ...positiveConfirmationFrameworkCases,
  ...negativeConfirmationFrameworkCases,
  ...animalFrameworkCases,
  ...eventFrameworkCases,
  ...inventoryFrameworkCases,
  ...financeFrameworkCases,
  ...employeePointPayrollFrameworkCases,
  ...genealogyFrameworkCases,
  {
    name: "producao completa pede confirmacao e nao salva antes",
    module: "producao",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["B-002 deu 32 litros"],
    expected: {
      finalIntent: "PRODUCAO_LEITE",
      entities: { animal_codigo: "B-002", litros: 32 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "producao completa salva apenas apos sim em dry-run",
    module: "producao",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["B-002 deu 32 litros", "sim"],
    expected: {
      finalIntent: "PRODUCAO_LEITE",
      entities: { animal_codigo: "B-002", litros: 32 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.ordenhas],
      shouldNotDuplicate: true,
      shouldNotWriteBusiness: true,
      ranchId: BOT_TEST_FARM_ID
    }
  },
  {
    name: "producao em etapas acumula contexto sem salvar",
    module: "producao",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["registrar producao", "B-002", "32"],
    expected: {
      finalIntent: "PRODUCAO_LEITE",
      entities: { animal_codigo: "B-002", litros: 32 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "cancelamento limpa sessao sem salvar",
    module: "comandos",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["registrar producao", "B-002", "cancelar"],
    expected: {
      shouldClearSession: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "correcao antes de salvar troca valor antigo",
    module: "financeiro",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["vendi vaca por 5 reais", "nao, foi 5000", "sim"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 5000 },
      shouldAskConfirmation: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: true,
      simulatedSaveCount: 1,
      savedTables: [BOT_TEST_TABLES.transacoesFinanceiras],
      shouldSaveValues: { valor: 5000 },
      shouldNotSaveValues: { valor: 5 },
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "criacao de item de estoque nao vira estoque baixo",
    module: "estoque",
    phone: BOT_TEST_ADMIN_PHONE,
    messages: ["cria um item chamado racao no estoque"],
    expected: {
      finalIntent: "CRIAR_ITEM_ESTOQUE",
      avoidIntents: ["CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM", "CONSULTA_ESTOQUE_GERAL"],
      entities: { item_nome: "racao" },
      shouldAskFollowUp: true,
      shouldSaveBeforeConfirmation: false,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "contexto aguardando valor interpreta numero solto",
    module: "contexto",
    phone: BOT_TEST_ADMIN_PHONE,
    initialSession: () => ({
      etapa: "aguardando_dado",
      dados: { pending: parseResolved("vendi leite") }
    }),
    messages: ["360"],
    expected: {
      finalIntent: "RECEITA_VENDA",
      entities: { valor: 360 },
      shouldAskConfirmation: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  },
  {
    name: "contexto aguardando vacina interpreta produto",
    module: "contexto",
    phone: BOT_TEST_ADMIN_PHONE,
    initialSession: () => ({
      etapa: "aguardando_dado",
      dados: { pending: parseResolved("apliquei vacina na B-002") }
    }),
    messages: ["Aftosa"],
    expected: {
      finalIntent: "VACINA_MEDICAMENTO",
      entities: { animal_codigo: "B-002", produto: "Aftosa" },
      shouldAskConfirmation: true,
      savedAfterConfirmation: false,
      shouldNotWriteBusiness: true
    }
  }
];

function assertProcessResult(expected = {}, result) {
  const failures = [];
  const dados = result.dadosExtraidos || {};

  if ("intent" in expected && result.intencaoDetectada !== expected.intent) {
    failures.push(`intent esperado ${expected.intent}, recebido ${result.intencaoDetectada}`);
  }

  if ("estadoAnterior" in expected && result.estadoAnterior !== expected.estadoAnterior) {
    failures.push(`estadoAnterior esperado ${expected.estadoAnterior}, recebido ${result.estadoAnterior}`);
  }

  if ("estadoNovo" in expected && result.estadoNovo !== expected.estadoNovo) {
    failures.push(`estadoNovo esperado ${expected.estadoNovo}, recebido ${result.estadoNovo}`);
  }

  if ("eventoConfirmado" in expected && Boolean(result.eventoConfirmado) !== Boolean(expected.eventoConfirmado)) {
    failures.push(`eventoConfirmado esperado ${expected.eventoConfirmado}, recebido ${result.eventoConfirmado}`);
  }

  if (expected.responseIncludes && !normalize(result.respostaTexto).includes(normalize(expected.responseIncludes))) {
    failures.push(`resposta deveria conter "${expected.responseIncludes}", recebeu "${result.respostaTexto}"`);
  }

  const rawIncludes = Array.isArray(expected.responseRawIncludes)
    ? expected.responseRawIncludes
    : expected.responseRawIncludes ? [expected.responseRawIncludes] : [];
  for (const text of rawIncludes) {
    if (!String(result.respostaTexto || "").includes(text)) {
      failures.push(`resposta deveria conter exatamente "${text}", recebeu "${result.respostaTexto}"`);
    }
  }

  const rawNotIncludes = Array.isArray(expected.responseRawNotIncludes)
    ? expected.responseRawNotIncludes
    : expected.responseRawNotIncludes ? [expected.responseRawNotIncludes] : [];
  for (const text of rawNotIncludes) {
    if (String(result.respostaTexto || "").includes(text)) {
      failures.push(`resposta não deveria conter exatamente "${text}", recebeu "${result.respostaTexto}"`);
    }
  }

  for (const field of expected.missing || []) {
    if (hasValue(dados[field])) failures.push(`campo ${field} deveria estar faltando, recebeu ${dados[field]}`);
    if (!result.camposFaltantes.some((question) => normalize(question).includes(normalize(field)))) {
      failures.push(`campo faltante ${field} nao apareceu em camposFaltantes`);
    }
  }

  for (const [field, value] of Object.entries(expected.dados || {})) {
    const received = dados[field];
    if (typeof value === "number") {
      if (Number(received) !== value) failures.push(`dados.${field} esperado ${value}, recebido ${received}`);
    } else if (normalize(received) !== normalize(value)) {
      failures.push(`dados.${field} esperado ${value}, recebido ${received}`);
    }
  }

  if (result.erro) failures.push(`handler retornou erro: ${result.erro}`);
  return failures;
}

function createSupabaseForScenario(test = {}) {
  const supabase = new BotTestSupabase();
  if (test.ranches) {
    supabase.tables[BOT_TEST_TABLES.fazendas].push(...test.ranches.map((ranch) => ({
      id: ranch.id,
      ativa: ranch.ativa !== false,
      nome: ranch.nome || ranch.id
    })));
  }
  if (test.whatsappUsers) {
    supabase.tables[BOT_TEST_TABLES.whatsappUsuarios] = clone(test.whatsappUsers);
  }
  if (test.extraAnimals) {
    supabase.tables[BOT_TEST_TABLES.animais].push(...test.extraAnimals.map((animal, index) => ({
      id: animal.id || `animal-extra-${index + 1}`,
      fazenda_id: animal.fazenda_id || BOT_TEST_FARM_ID,
      brinco: animal.brinco,
      nome: animal.nome || animal.brinco,
      categoria: animal.categoria || "vaca",
      sexo: animal.sexo || "femea",
      fase: animal.fase || "lactacao",
      status: animal.status || "ativo",
      raca: animal.raca || "Girolando",
      lote_id: animal.lote_id || "lote-lactacao-1",
      data_nascimento: animal.data_nascimento || null,
      peso: animal.peso || null,
      observacoes: animal.observacoes || "",
      mae_id: animal.mae_id || null,
      pai_id: animal.pai_id || null,
      genealogia_observacoes: animal.genealogia_observacoes || null
    })));
  }
  if (test.financeTransactions) {
    supabase.tables[BOT_TEST_TABLES.transacoesFinanceiras].push(...test.financeTransactions.map((row, index) => ({
      id: row.id || `financeiro-extra-${index + 1}`,
      fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
      tipo: row.tipo || "entrada",
      valor: row.valor,
      descricao: row.descricao || "transacao teste",
      data_transacao: row.data_transacao || new Date().toISOString().slice(0, 10)
    })));
  }
  if (test.employees) {
    supabase.tables[BOT_TEST_TABLES.funcionarios] = test.employees.map((row, index) => ({
      id: row.id || `func-custom-${index + 1}`,
      fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
      nome: row.nome,
      funcao: row.funcao || "Funcionário",
      cpf: row.cpf || null,
      contato_whatsapp: row.contato_whatsapp || null,
      salario_base: row.salario_base ?? 0,
      tipo_acesso: row.tipo_acesso || "bot_only",
      ativo: row.ativo !== false,
      deleted_at: row.deleted_at || null
    }));
  }
  if (test.extraEmployees) {
    supabase.tables[BOT_TEST_TABLES.funcionarios].push(...test.extraEmployees.map((row, index) => ({
      id: row.id || `func-extra-${index + 1}`,
      fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
      nome: row.nome,
      funcao: row.funcao || "Funcionário",
      cpf: row.cpf || null,
      contato_whatsapp: row.contato_whatsapp || null,
      salario_base: row.salario_base ?? 0,
      tipo_acesso: row.tipo_acesso || "bot_only",
      ativo: row.ativo !== false,
      deleted_at: row.deleted_at || null
    })));
  }
  if (test.pointRecords) {
    supabase.tables[BOT_TEST_TABLES.registrosPonto].push(...test.pointRecords.map((row, index) => ({
      id: row.id || `ponto-extra-${index + 1}`,
      fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
      funcionario_id: row.funcionario_id,
      tipo: row.tipo || "entrada",
      registrado_em: row.registrado_em || new Date().toISOString(),
      origem: row.origem || "whatsapp"
    })));
  }
  if (test.stockItems) {
    supabase.tables[BOT_TEST_TABLES.estoqueItens] = test.stockItems.map((item, itemIndex) => ({
      id: item.id || `stock-custom-${itemIndex + 1}`,
      fazenda_id: BOT_TEST_FARM_ID,
      nome: item.nome,
      descricao: item.nome,
      categoria: item.categoria || "outro",
      quantidade_atual: item.quantidade_atual ?? 0,
      quantidade_minima: item.quantidade_minima ?? 0,
      unidade_medida: item.unidade_medida || stockUnitFor(item.nome),
      valor_unitario: item.valor_unitario ?? 0,
      ativo: item.ativo !== false
    }));
  }
  if (test.extraStockItems) {
    supabase.tables[BOT_TEST_TABLES.estoqueItens].push(...test.extraStockItems.map((item, itemIndex) => ({
      id: item.id || `stock-extra-${itemIndex + 1}`,
      fazenda_id: BOT_TEST_FARM_ID,
      nome: item.nome,
      descricao: item.nome,
      categoria: item.categoria || "outro",
      quantidade_atual: item.quantidade_atual ?? 0,
      quantidade_minima: item.quantidade_minima ?? 0,
      unidade_medida: item.unidade_medida || stockUnitFor(item.nome),
      valor_unitario: item.valor_unitario ?? 0,
      ativo: item.ativo !== false
    })));
  }
  seedInitialSession(supabase, test);
  return supabase;
}

function materializeInitialSession(initialSession) {
  if (!initialSession) return null;
  const session = typeof initialSession === "function" ? initialSession() : initialSession;
  if (!session) return null;
  if (session.dados?.pending) return session;
  if (session.pending) {
    return {
      etapa: session.etapa || "aguardando_dado",
      dados: { pending: session.pending }
    };
  }
  return session;
}

function seedInitialSession(supabase, test = {}) {
  const session = materializeInitialSession(test.initialSession);
  if (!session) return;
  const phone = test.phone || BOT_TEST_ADMIN_PHONE;
  const whatsappUser = supabase.tables[BOT_TEST_TABLES.whatsappUsuarios].find((row) => row.telefone_e164 === phone) || {};
  supabase.tables[BOT_TEST_TABLES.whatsappSessoes].push({
    id: `session-${phone}`,
    fazenda_id: test.ranch?.id || whatsappUser.fazenda_id || BOT_TEST_FARM_ID,
    whatsapp_usuario_id: whatsappUser.id || "wa-admin",
    telefone_e164: phone,
    fluxo: session.etapa === "livre" ? null : "nlp_local",
    etapa: session.etapa || "livre",
    dados: clone(session.dados || {}),
    status: "ativa",
    ultimo_interacao_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
}

function simulatedSaveActionsForResult(result, phone) {
  if (!result.eventoConfirmado) return [];
  const tipo = result.intencaoDetectada;
  const dados = result.dadosExtraidos || {};
  const base = {
    type: "create",
    dryRun: true,
    source: "processWhatsappMessage:modoTeste",
    phone: maskPhone(phone)
  };
  const fazendaId = farmIdForPhone(phone);

  if (tipo === "PRODUCAO_LEITE") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.ordenhas,
      payload: {
        fazenda_id: fazendaId,
        animal_id: dados.animal_id || null,
        animal_codigo: dados.animal_codigo,
        litros: Number(dados.litros),
        origem: "whatsapp"
      }
    }];
  }

  if (tipo === "DESPESA" || tipo === "RECEITA_VENDA") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.transacoesFinanceiras,
      payload: {
        fazenda_id: fazendaId,
        tipo: tipo === "DESPESA" ? "saida" : "entrada",
        valor: Number(dados.valor),
        descricao: dados.descricao || null,
        origem: "whatsapp"
      }
    }];
  }

  if (tipo === "VACINA_MEDICAMENTO" || tipo === "PARTO" || tipo === "MORTE") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.eventosAnimal,
      payload: {
        fazenda_id: fazendaId,
        animal_id: dados.animal_id || null,
        animal_codigo: dados.animal_codigo,
        produto: dados.produto || null,
        evento_tipo: dados.evento_tipo || tipo,
        origem: "whatsapp"
      }
    }];
  }

  if (tipo === "CRIAR_ITEM_ESTOQUE" || tipo === "ESTOQUE_CADASTRO") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.estoqueItens,
      payload: {
        fazenda_id: fazendaId,
        nome: dados.item_nome,
        quantidade_atual: Number(dados.quantidade || 0),
        unidade_medida: dados.unidade || "unidade"
      }
    }];
  }

  if (tipo === "ESTOQUE_ENTRADA" || tipo === "ESTOQUE_SAIDA") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.estoqueMovimentacoes,
      payload: {
        fazenda_id: fazendaId,
        item_id: dados.item_id || null,
        item_nome: dados.item_nome,
        tipo: tipo === "ESTOQUE_ENTRADA" ? "entrada" : "saida",
        quantidade: Number(dados.quantidade || 0)
      }
    }];
  }

  if (tipo === "PONTO_FUNCIONARIO") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.registrosPonto,
      payload: {
        fazenda_id: fazendaId,
        funcionario_nome: dados.funcionario_nome,
        tipo: dados.ponto_tipo || "entrada",
        horario: dados.horario || null
      }
    }];
  }

  if (tipo === "CRIAR_FUNCIONARIO") {
    const actions = [{
      ...base,
      table: BOT_TEST_TABLES.funcionarios,
      payload: {
        fazenda_id: fazendaId,
        nome: dados.funcionario_nome,
        funcao: dados.funcao || "Funcionário",
        cpf: dados.cpf || null,
        contato_whatsapp: dados.telefone || null,
        salario_base: Number(dados.salario_base || 0),
        tipo_acesso: dados.tipo_acesso || "bot_only"
      }
    }];
    if (dados.telefone) {
      actions.push({
        ...base,
        table: BOT_TEST_TABLES.whatsappUsuarios,
        payload: {
          fazenda_id: fazendaId,
          telefone_e164: normalizeWhatsappNumber(dados.telefone),
          nome_exibicao: dados.funcionario_nome,
          papel_bot: "funcionario"
        }
      });
    }
    return actions;
  }

  if (tipo === "ATUALIZAR_FUNCIONARIO") {
    return [{
      ...base,
      type: "update",
      table: BOT_TEST_TABLES.funcionarios,
      payload: {
        fazenda_id: fazendaId,
        funcionario_nome: dados.funcionario_nome,
        campo_alterado: dados.campo_alterado,
        novo_valor: dados.novo_valor
      }
    }];
  }

  if (tipo === "DESLIGAR_FUNCIONARIO" || tipo === "EXCLUIR_FUNCIONARIO") {
    return [{
      ...base,
      type: "update",
      table: BOT_TEST_TABLES.funcionarios,
      payload: {
        fazenda_id: fazendaId,
        funcionario_nome: dados.funcionario_nome,
        ativo: false,
        deleted_at: tipo === "EXCLUIR_FUNCIONARIO" ? "simulado" : null
      }
    }];
  }

  if (tipo === "CADASTRO_ANIMAL") {
    return [{
      ...base,
      table: BOT_TEST_TABLES.animais,
      payload: {
        fazenda_id: fazendaId,
        brinco: dados.animal_codigo,
        nome: dados.nome || null,
        categoria: dados.categoria || null
      }
    }];
  }

  if (tipo === "ATUALIZACAO_ANIMAL") {
    return [{
      ...base,
      type: "update",
      table: BOT_TEST_TABLES.animais,
      payload: {
        fazenda_id: fazendaId,
        animal_codigo: dados.animal_codigo,
        campo_alterado: dados.campo_alterado,
        novo_valor: dados.novo_valor
      }
    }];
  }

  if (tipo === "ATUALIZACAO_GENEALOGIA") {
    return [{
      ...base,
      type: "update",
      table: BOT_TEST_TABLES.animais,
      payload: {
        fazenda_id: fazendaId,
        animal_id: dados.animal_id || null,
        animal_codigo: dados.animal_codigo,
        mae_id: dados.remover_mae ? null : dados.mae_id || null,
        pai_id: dados.remover_pai ? null : dados.pai_id || null,
        mae_nome: dados.remover_mae ? null : dados.mae_nome || null,
        pai_nome: dados.remover_pai ? null : dados.pai_nome || null,
        origem: "whatsapp"
      }
    }];
  }

  return [];
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits ? `***${digits.slice(-4)}` : "";
}

function farmIdForPhone(phone) {
  const normalized = normalizeWhatsappNumber(phone) || String(phone || "");
  const whatsappUser = activeBotTestSupabase?.tables?.[BOT_TEST_TABLES.whatsappUsuarios]?.find((row) => row.telefone_e164 === normalized);
  return whatsappUser?.fazenda_id || BOT_TEST_FARM_ID;
}

function hasAskedConfirmation(steps) {
  return steps.some((step) => (
    step.result.estadoNovo === "aguardando_confirmacao"
    || normalize(step.result.respostaTexto).includes("correto")
    || normalize(step.result.respostaTexto).includes("confirmar")
  ));
}

function hasAskedFollowUp(steps) {
  return steps.some((step) => ["aguardando_dado", "aguardando_confirmacao"].includes(step.result.estadoNovo));
}

function firstConfirmationIndex(steps) {
  return steps.findIndex((step) => step.result.eventoConfirmado);
}

function sameValue(received, expected) {
  if (typeof expected === "number") return Number(received) === expected;
  return normalize(received) === normalize(expected);
}

function actionPayloadHas(actions, field, expected) {
  return actions.some((action) => sameValue(action.payload?.[field], expected));
}

function uniqueActionKey(action) {
  return `${action.type}:${action.table}:${JSON.stringify(action.payload || {})}`;
}

function detectStuckFlow(steps) {
  const failures = [];
  for (let index = 1; index < steps.length; index += 1) {
    const previous = steps[index - 1].result;
    const current = steps[index].result;
    if (
      previous.estadoNovo === "aguardando_dado"
      && current.estadoNovo === "aguardando_dado"
      && normalize((previous.camposFaltantes || []).join("|")) === normalize((current.camposFaltantes || []).join("|"))
    ) {
      failures.push(`fluxo possivelmente preso apos mensagem ${index + 1}: ${steps[index].text}`);
    }
  }
  return failures;
}

function evaluateStructuredCase(test, trace) {
  const failures = [];
  const expected = test.expected || {};
  const finalStep = trace.steps[trace.steps.length - 1];
  const finalResult = finalStep?.result || {};
  const finalData = finalResult.dadosExtraidos || {};
  const simulatedActions = trace.simulatedSaveActions || [];
  const confirmIndex = firstConfirmationIndex(trace.steps);

  if (expected.finalIntent && finalResult.intencaoDetectada !== expected.finalIntent) {
    failures.push(`intent final esperado ${expected.finalIntent}, recebido ${finalResult.intencaoDetectada}`);
  }

  for (const forbiddenIntent of expected.avoidIntents || []) {
    if (trace.steps.some((step) => step.result.intencaoDetectada === forbiddenIntent)) {
      failures.push(`intent proibido detectado: ${forbiddenIntent}`);
    }
  }

  for (const [field, value] of Object.entries(expected.entities || {})) {
    const received = finalData[field];
    if (!sameValue(received, value)) failures.push(`entidade ${field} esperada ${value}, recebida ${received}`);
  }

  if (expected.responseIncludes && !normalize(finalResult.respostaTexto).includes(normalize(expected.responseIncludes))) {
    failures.push(`resposta final deveria conter "${expected.responseIncludes}", recebeu "${finalResult.respostaTexto}"`);
  }

  if (expected.responseNotIncludes && normalize(finalResult.respostaTexto).includes(normalize(expected.responseNotIncludes))) {
    failures.push(`resposta final nao deveria conter "${expected.responseNotIncludes}", recebeu "${finalResult.respostaTexto}"`);
  }

  if (expected.shouldAskConfirmation && !hasAskedConfirmation(trace.steps)) {
    failures.push("esperava pedido de confirmacao");
  }

  if (expected.shouldAskFollowUp && !hasAskedFollowUp(trace.steps)) {
    failures.push("esperava pergunta de campo faltante ou confirmacao");
  }

  if (expected.shouldSaveBeforeConfirmation === false) {
    const beforeConfirmSteps = confirmIndex >= 0 ? trace.steps.slice(0, confirmIndex) : trace.steps;
    const wroteBeforeConfirm = beforeConfirmSteps.some((step) => step.businessWritesDelta.length || step.simulatedSaveActions.length);
    if (wroteBeforeConfirm) failures.push("houve tentativa de salvamento antes da confirmacao");
  }

  if (expected.savedAfterConfirmation === true && !simulatedActions.length) {
    failures.push("esperava acao simulada de salvamento apos confirmacao positiva");
  }

  if (expected.savedAfterConfirmation === false && simulatedActions.length) {
    failures.push(`nao esperava salvamento simulado, recebeu ${simulatedActions.length}`);
  }

  if (typeof expected.simulatedSaveCount === "number" && simulatedActions.length !== expected.simulatedSaveCount) {
    failures.push(`acoes simuladas esperadas ${expected.simulatedSaveCount}, recebidas ${simulatedActions.length}`);
  }

  for (const table of expected.savedTables || []) {
    if (!simulatedActions.some((action) => action.table === table)) failures.push(`tabela simulada esperada ${table} nao capturada`);
  }

  if (expected.shouldNotDuplicate) {
    const keys = simulatedActions.map(uniqueActionKey);
    if (new Set(keys).size !== keys.length) failures.push("salvamento simulado duplicado detectado");
  }

  for (const [field, value] of Object.entries(expected.shouldSaveValues || {})) {
    if (!actionPayloadHas(simulatedActions, field, value)) failures.push(`acao simulada deveria salvar ${field}=${value}`);
  }

  for (const [field, value] of Object.entries(expected.shouldNotSaveValues || {})) {
    if (actionPayloadHas(simulatedActions, field, value)) failures.push(`acao simulada nao deveria salvar ${field}=${value}`);
  }

  if (expected.shouldClearSession && finalResult.estadoNovo !== "livre") {
    failures.push(`sessao deveria ficar livre, recebeu ${finalResult.estadoNovo}`);
  }

  if (expected.ranchId) {
    const wrongRanch = simulatedActions.find((action) => action.payload?.fazenda_id && action.payload.fazenda_id !== expected.ranchId);
    if (wrongRanch) failures.push(`acao com fazenda_id incorreto: ${wrongRanch.payload.fazenda_id}`);
  }

  if (expected.shouldNotWriteBusiness !== false && trace.businessWrites.length) {
    failures.push(`dry-run gerou escrita de negocio: ${trace.businessWrites.map((write) => `${write.tableName}:${write.action}`).join(", ")}`);
  }

  if (expected.detectStuck !== false) failures.push(...detectStuckFlow(trace.steps));

  return failures;
}

async function runStructuredEvaluationCase(test, index) {
  const supabase = createSupabaseForScenario(test);
  activeBotTestSupabase = supabase;
  const steps = [];
  const failures = [];

  try {
    for (let messageIndex = 0; messageIndex < test.messages.length; messageIndex += 1) {
      const message = test.messages[messageIndex];
      const text = typeof message === "string" ? message : message.text;
      const beforeBusinessWrites = supabase.businessWrites().length;
      const result = await processWhatsappMessage({
        telefone: test.phone || BOT_TEST_ADMIN_PHONE,
        mensagem: text,
        provider: "simulador",
        modoTeste: true,
        salvarReal: false,
        messageSid: `bot-eval-${index + 1}-${messageIndex + 1}`
      });
      const businessWritesDelta = supabase.businessWrites().slice(beforeBusinessWrites);
      const simulatedSaveActions = simulatedSaveActionsForResult(result, test.phone || BOT_TEST_ADMIN_PHONE);
      steps.push({ text, result, businessWritesDelta, simulatedSaveActions });

      if (BOT_TEST_VERBOSE) {
        console.log("[BOT EVAL STEP]", JSON.stringify({
          test: test.name,
          message: text,
          intent: result.intencaoDetectada,
          estado: result.estadoNovo,
          missing: result.camposFaltantes,
          simulatedSaveActions
        }));
      }
    }

    const trace = {
      steps,
      businessWrites: supabase.businessWrites(),
      simulatedSaveActions: steps.flatMap((step) => step.simulatedSaveActions)
    };
    failures.push(...evaluateStructuredCase(test, trace));

    return {
      index,
      kind: "framework",
      module: test.module || "geral",
      test,
      steps,
      businessWrites: trace.businessWrites,
      simulatedSaveActions: trace.simulatedSaveActions,
      ok: failures.length === 0,
      failures
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    return {
      index,
      kind: "framework",
      module: test.module || "geral",
      test,
      steps,
      businessWrites: supabase.businessWrites(),
      simulatedSaveActions: steps.flatMap((step) => step.simulatedSaveActions),
      ok: false,
      failures
    };
  } finally {
    activeBotTestSupabase = null;
  }
}

async function runConversationTest(test, index) {
  const supabase = createSupabaseForScenario(test);
  activeBotTestSupabase = supabase;
  const steps = [];
  const failures = [];

  for (let messageIndex = 0; messageIndex < test.messages.length; messageIndex += 1) {
    const step = test.messages[messageIndex];
    const result = await processWhatsappMessage({
      telefone: test.phone,
      mensagem: step.text,
      provider: "simulador",
      modoTeste: true,
      salvarReal: false,
      messageSid: `bot-test-${index + 1}-${messageIndex + 1}`
    });
    const stepFailures = assertProcessResult(step.expected, result);
    if (stepFailures.length) {
      failures.push(`mensagem ${messageIndex + 1} (${step.text}): ${stepFailures.join("; ")}`);
    }
    steps.push({ text: step.text, result });
  }

  const businessWrites = supabase.businessWrites();
  if (test.expectNoBusinessWrites && businessWrites.length) {
    failures.push(`dry-run gerou escrita de negocio: ${businessWrites.map((write) => `${write.tableName}:${write.action}`).join(", ")}`);
  }

  activeBotTestSupabase = null;
  return {
    index,
    test,
    steps,
    businessWrites,
    ok: failures.length === 0,
    failures
  };
}

const allTests = [
  ...mandatoryTests,
  ...extraTests,
  ...regressionTests,
  ...consultationParserTests,
  ...decimalRegressionTests,
  ...financeHumanParserTests,
  ...inventoryHumanParserTests,
  ...productionRobustnessTests,
  ...animalConsultationAndUpdateTests,
  ...eventHumanParserTests,
  ...genealogyParserTests,
  ...employeePointPayrollParserTests
];

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

function resultModule(result) {
  if (result.module) return result.module;
  if (result.test?.module) return result.test.module;
  if (result.steps) return "conversas";
  if (result.test?.animal) return "status-animal";
  return "parser";
}

function resultName(result) {
  return result.test?.name || result.test?.phrase || `teste ${result.index}`;
}

function failureSummaryByModule(failed) {
  return failed.reduce((summary, result) => {
    const moduleName = resultModule(result);
    summary[moduleName] = (summary[moduleName] || 0) + 1;
    return summary;
  }, {});
}

function compactStepForReport(step, index) {
  return {
    index: index + 1,
    mensagem: step.text,
    resposta: step.result.respostaTexto,
    intent: step.result.intencaoDetectada,
    estadoAnterior: step.result.estadoAnterior,
    estadoNovo: step.result.estadoNovo,
    camposFaltantes: step.result.camposFaltantes,
    dados: step.result.dadosExtraidos,
    confirmado: step.result.eventoConfirmado,
    erro: step.result.erro,
    acoesSimuladas: step.simulatedSaveActions || [],
    escritasNegocio: step.businessWritesDelta || []
  };
}

function compactResultForReport(result) {
  const base = {
    index: result.index,
    name: resultName(result),
    module: resultModule(result),
    kind: result.kind || (result.steps ? "conversation" : "parser"),
    ok: result.ok,
    failures: result.failures || []
  };

  if (result.steps) {
    return {
      ...base,
      expected: result.test?.expected || result.test?.messages?.map((step) => step.expected),
      steps: result.steps.map(compactStepForReport),
      simulatedSaveActions: result.simulatedSaveActions || [],
      businessWrites: result.businessWrites || []
    };
  }

  return {
    ...base,
    phrase: result.test?.phrase || null,
    expected: result.test?.expected || null,
    received: result.parsed ? {
      tipo: result.parsed.tipo,
      dados: result.parsed.dados,
      perguntas_faltantes: result.parsed.perguntas_faltantes,
      resumo: result.parsed.resumo,
      response: result.response
    } : { response: result.response || null }
  };
}

function writeBotTestReports(summary) {
  const eventResults = summary.results.filter((result) => resultModule(result) === "eventos");
  const eventFailed = eventResults.filter((result) => !result.ok);
  const eventPassed = eventResults.length - eventFailed.length;
  const eventSuccessRate = eventResults.length ? Number(((eventPassed / eventResults.length) * 100).toFixed(2)) : 0;
  const financialResults = summary.results.filter((result) => resultModule(result) === "financeiro");
  const financialFailed = financialResults.filter((result) => !result.ok);
  const financialPassed = financialResults.length - financialFailed.length;
  const financialSuccessRate = financialResults.length ? Number(((financialPassed / financialResults.length) * 100).toFixed(2)) : 0;
  const employeePayrollModules = new Set(["funcionarios", "ponto", "folha"]);
  const employeePayrollResults = summary.results.filter((result) => employeePayrollModules.has(resultModule(result)));
  const employeePayrollFailed = employeePayrollResults.filter((result) => !result.ok);
  const employeePayrollPassed = employeePayrollResults.length - employeePayrollFailed.length;
  const employeePayrollSuccessRate = employeePayrollResults.length ? Number(((employeePayrollPassed / employeePayrollResults.length) * 100).toFixed(2)) : 0;
  const genealogyResults = summary.results.filter((result) => resultModule(result) === "genealogia");
  const genealogyFailed = genealogyResults.filter((result) => !result.ok);
  const genealogyPassed = genealogyResults.length - genealogyFailed.length;
  const genealogySuccessRate = genealogyResults.length ? Number(((genealogyPassed / genealogyResults.length) * 100).toFixed(2)) : 0;
  const report = {
    generatedAt: new Date().toISOString(),
    command: "npm run test:bot",
    safety: {
      modoTeste: true,
      salvarReal: false,
      whatsappReal: false,
      supabase: "mock-local-em-memoria",
      productionWrites: false
    },
    summary: {
      total: summary.results.length,
      passed: summary.passed,
      failed: summary.failed.length,
      successRate: summary.successRate,
      parserAndStatus: summary.parserAndStatus,
      conversations: summary.conversations,
      frameworkCases: summary.frameworkCases,
      failuresByModule: failureSummaryByModule(summary.failed),
      eventos: {
        total: eventResults.length,
        passed: eventPassed,
        failed: eventFailed.length,
        successRate: eventSuccessRate,
        coverage: [
          "registro de vacinas, medicamentos e tratamentos",
          "doencas e observacoes clinicas como atualizacao confirmada",
          "parto, cio, prenhez, inseminacao e cobertura",
          "consultas de historico por animal e registros de hoje",
          "coleta por etapas, correcao, cancelamento, repeticao e confirmacao duplicada",
          "dry-run sem WhatsApp real, sem Supabase real e com isolamento por fazenda"
        ],
        fragileCases: [
          "consultas gerais de calendario/proximas vacinas ainda dependem de uma consulta dedicada no produto",
          "estoque de vacina/medicamento permanece fluxo separado quando o usuario fala em baixar dose"
        ],
        failures: eventFailed.map((result) => resultName(result))
      },
      financeiro: {
        total: financialResults.length,
        passed: financialPassed,
        failed: financialFailed.length,
        successRate: financialSuccessRate,
        failures: financialFailed.map((result) => resultName(result))
      },
      funcionariosPontoFolha: {
        total: employeePayrollResults.length,
        passed: employeePayrollPassed,
        failed: employeePayrollFailed.length,
        successRate: employeePayrollSuccessRate,
        coverage: [
          "cadastro de funcionario com e sem WhatsApp",
          "atualizacao, desligamento e exclusao logica",
          "registro de ponto completo e em etapas",
          "consulta de ponto e dados de funcionario",
          "folha/salario como consulta financeira ou despesa",
          "permissoes de admin versus funcionario comum",
          "dry-run sem WhatsApp real e sem escrita real de negocio"
        ],
        failures: employeePayrollFailed.map((result) => resultName(result))
      },
      genealogia: {
        total: genealogyResults.length,
        passed: genealogyPassed,
        failed: genealogyFailed.length,
        successRate: genealogySuccessRate,
        coverage: [
          "consulta de genealogia, pai, mae, filhos, descendentes e avos",
          "definir mae, definir pai, definir ambos e remover relacoes",
          "confirmacao obrigatoria antes de salvar alteracao genealogica",
          "correcao, cancelamento, repeticao e confirmacao duplicada",
          "bloqueio de ciclo e de animal como pai/mae dele mesmo",
          "nomes duplicados, codigos alfanumericos, permissao e isolamento por fazenda"
        ],
        failures: genealogyFailed.map((result) => resultName(result))
      }
    },
    failed: summary.failed.map(compactResultForReport),
    frameworkCases: summary.evaluationResults.map(compactResultForReport)
  };

  fs.writeFileSync(BOT_TEST_REPORT_JSON, JSON.stringify(report, null, 2), "utf8");

  const failureLines = summary.failed.length
    ? summary.failed.map((result) => (
      `- [${resultModule(result)}] ${resultName(result)}: ${(result.failures || []).join("; ")}`
    )).join("\n")
    : "- Nenhuma falha.";
  const moduleLines = Object.entries(failureSummaryByModule(summary.failed))
    .map(([moduleName, count]) => `- ${moduleName}: ${count}`)
    .join("\n") || "- Nenhuma falha por modulo.";
  const md = [
    "# Bot Test Report",
    "",
    `Gerado em: ${report.generatedAt}`,
    "",
    "## Resumo",
    "",
    `- Total: ${report.summary.total}`,
    `- Aprovados: ${report.summary.passed}`,
    `- Falhos: ${report.summary.failed}`,
    `- Taxa de sucesso: ${report.summary.successRate}%`,
    `- Parser/status: ${report.summary.parserAndStatus}`,
    `- Conversas reais simuladas: ${report.summary.conversations}`,
    `- Casos estruturados de framework: ${report.summary.frameworkCases}`,
    "",
    "## Eventos, Vacinas e Medicamentos",
    "",
    `- Total eventos: ${report.summary.eventos.total}`,
    `- Aprovados eventos: ${report.summary.eventos.passed}`,
    `- Falhos eventos: ${report.summary.eventos.failed}`,
    `- Taxa eventos: ${report.summary.eventos.successRate}%`,
    "- Cobertura: vacinas, medicamentos, tratamentos, doencas/observacoes clinicas, parto, cio, prenhez, inseminacao/cobertura, historico por animal, etapas, correcao, cancelamento, repeticao, confirmacao duplicada, permissao e fazenda_id.",
    "- Correcoes feitas: produto corrigido antes de salvar substitui o antigo, erros comuns de digitacao sao normalizados, observacoes clinicas/reprodutivas entram em fluxo de confirmacao, e consultas/atualizacoes de animal usam catalogo do rancho.",
    "- Casos frageis: consultas gerais de calendario/proximas vacinas ainda precisam de consulta dedicada; baixa de estoque por dose continua fluxo separado e nao movimenta estoque real em teste.",
    "- Observacao: nenhum evento real, WhatsApp real ou baixa real de estoque e executado nesta bateria.",
    "",
    "## Financeiro",
    "",
    `- Total financeiro: ${report.summary.financeiro.total}`,
    `- Aprovados financeiro: ${report.summary.financeiro.passed}`,
    `- Falhos financeiro: ${report.summary.financeiro.failed}`,
    `- Taxa financeiro: ${report.summary.financeiro.successRate}%`,
    "- Cobertura: entradas, saidas, vendas, compras/despesas, salarios, valores em reais, contexto, confirmacao, correcao, cancelamento, repeticao, consultas, permissoes e rancho_id.",
    "- Observacao: testes usam modoTeste=true, salvarReal=false, Supabase mockado e nao enviam WhatsApp real.",
    "- Recomendacao: manter os casos financeiros criticos na bateria completa sempre que o NLP do bot mudar.",
    "",
    "## Funcionarios, Ponto e Folha",
    "",
    `- Total funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.total}`,
    `- Aprovados funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.passed}`,
    `- Falhos funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.failed}`,
    `- Taxa funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.successRate}%`,
    "- Cobertura: cadastro com e sem WhatsApp, bot_only com pergunta de telefone, atualizacao salarial/cargo/CPF/WhatsApp, desligamento, exclusao logica, registro de ponto, ponto em etapas, consulta de ponto, consulta salarial, pagamento de salario como despesa e permissoes.",
    "- Correcoes/fragilidades observadas: a bateria protege contra cadastro virando consulta/financeiro, CPF virando telefone, ponto sem horario sendo confirmado cedo demais e funcionario comum executando acao administrativa.",
    "- Observacao: as acoes salvas no relatorio sao simuladas; o dry-run nao promete gravacao real.",
    "",
    "## Genealogia",
    "",
    `- Total genealogia: ${report.summary.genealogia.total}`,
    `- Aprovados genealogia: ${report.summary.genealogia.passed}`,
    `- Falhos genealogia: ${report.summary.genealogia.failed}`,
    `- Taxa genealogia: ${report.summary.genealogia.successRate}%`,
    "- Cobertura: consulta de arvore, pai/mae, filhos, descendentes, avos, definicao/remocao de pai e mae, correcao, cancelamento, repeticao, confirmacao duplicada, permissao, ciclos, auto-parentesco, nomes duplicados, codigos alfanumericos e isolamento por fazenda.",
    "- Observacao: alteracoes genealogicas seguem entender, coletar campos, resumir, pedir confirmacao e simular salvamento apenas apos confirmacao; nenhuma genealogia real e alterada em test:bot.",
    "",
    "## Seguranca",
    "",
    "- WhatsApp real: nao envia mensagens.",
    "- Supabase: mock local em memoria.",
    "- modoTeste=true e salvarReal=false.",
    "- Escritas de negocio reais: bloqueadas pelo dry-run.",
    "",
    "## Falhas Por Modulo",
    "",
    moduleLines,
    "",
    "## Falhas",
    "",
    failureLines,
    "",
    "## Casos Estruturados",
    "",
    ...summary.evaluationResults.map((result) => (
      `- [${result.ok ? "ok" : "falha"}] ${result.module}: ${resultName(result)}`
    )),
    ""
  ].join("\n");
  fs.writeFileSync(BOT_TEST_REPORT_MD, md, "utf8");
}

async function main() {
  const conversationResults = [];
  for (let index = 0; index < botConversationTests.length; index += 1) {
    conversationResults.push(await runConversationTest(botConversationTests[index], parserResults.length + animalResults.length + index + 1));
  }

  const evaluationResults = [];
  const evaluationBaseIndex = parserResults.length + animalResults.length + conversationResults.length;
  for (let index = 0; index < structuredBotEvaluationCases.length; index += 1) {
    evaluationResults.push(await runStructuredEvaluationCase(structuredBotEvaluationCases[index], evaluationBaseIndex + index + 1));
  }

  const results = [...parserResults, ...animalResults, ...conversationResults, ...evaluationResults];

const failed = results.filter((result) => !result.ok);
const passed = results.length - failed.length;
const successRate = results.length ? Number(((passed / results.length) * 100).toFixed(2)) : 0;
const failuresByModule = failureSummaryByModule(failed);

writeBotTestReports({
  results,
  failed,
  passed,
  successRate,
  parserAndStatus: parserResults.length + animalResults.length,
  conversations: conversationResults.length,
  frameworkCases: evaluationResults.length,
  evaluationResults
});

console.log("Bot test offline Rancho");
console.log(`Usuarios mockados: ${mockUsers.length}`);
console.log(`Parser/status: ${parserResults.length + animalResults.length}`);
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
