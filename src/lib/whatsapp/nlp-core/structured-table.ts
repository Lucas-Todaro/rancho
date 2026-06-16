import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

export type StructuredTableDomain =
  | "REPRODUCAO_EVENTOS"
  | "PRODUCAO_LEITE"
  | "ESTOQUE_MOVIMENTACAO"
  | "FINANCEIRO"
  | "CADASTRO_ANIMAL"
  | "CADASTRO_FUNCIONARIO"
  | "SAUDE_ANIMAL"
  | "OBSERVACAO_ANIMAL"
  | "PONTO_FUNCIONARIO"
  | "DESCONHECIDO";

export type StructuredRowStatus = "valid" | "invalid" | "needs_review";

export type StructuredColumnMapping = Record<string, number>;

export type StructuredInputDetection = {
  detected: boolean;
  structureType: "table_with_header" | "separator_list" | "key_value_list" | "unknown_structured";
  separator: ";" | "," | "\t" | "|" | ":" | "whitespace" | null;
  hasHeader: boolean;
  rowCount: number;
  usefulLineCount: number;
  confidence: number;
};

export type StructuredParsedRow = {
  lineNumber: number;
  rawText: string;
  cells: string[];
};

export type StructuredParsedTable = {
  detection: StructuredInputDetection;
  headers: string[];
  rows: StructuredParsedRow[];
};

export type StructuredTablePlan = {
  tableType: StructuredTableDomain;
  confidence: number;
  columnMapping: StructuredColumnMapping;
  headerAliases?: Record<string, string>;
  warnings?: string[];
  needsUserClarification?: boolean;
  source?: "local" | "gemini" | "manual";
};

export type StructuredMappedRecord = {
  lineNumber: number;
  rawText: string;
  status: StructuredRowStatus;
  problemas: string[];
  intent: string;
  fields: Record<string, unknown>;
  rawFields: Record<string, string>;
};

export type StructuredMappedBatch = {
  records: StructuredMappedRecord[];
  validRecords: StructuredMappedRecord[];
  invalidRecords: StructuredMappedRecord[];
  needsReview: StructuredMappedRecord[];
  summary: {
    totalRows: number;
    validRecords: number;
    invalidRecords: number;
    needsReview: number;
  };
};

type HeaderField =
  | "animal_ref"
  | "event_type"
  | "date"
  | "observations"
  | "name"
  | "category"
  | "sex"
  | "breed"
  | "lot"
  | "status"
  | "weight"
  | "birth_date"
  | "item"
  | "quantity"
  | "unit"
  | "movement_type"
  | "value"
  | "description"
  | "employee";

const SEPARATORS: Array<StructuredInputDetection["separator"]> = [";", ",", "\t", "|", ":", "whitespace"];

const HEADER_ALIASES: Record<HeaderField, RegExp[]> = {
  animal_ref: [/^(?:codigo|cod|brinco|animal|codigo animal|animal codigo|identificacao)$/],
  event_type: [/^(?:status tipo|tipo|evento|ocorrencia)$/],
  date: [/^(?:data|quando|dia|data evento|data referencia)$/],
  observations: [/^(?:observacoes|observacao|obs|nota|notas|comentario|comentarios)$/],
  name: [/^(?:nome|apelido)$/],
  category: [/^(?:categoria|classe|tipo animal)$/],
  sex: [/^(?:sexo)$/],
  breed: [/^(?:raca|raça)$/],
  lot: [/^(?:lote|piquete|pasto)$/],
  status: [/^(?:situacao|situação|status)$/],
  weight: [/^(?:peso|kg)$/],
  birth_date: [/^(?:nascimento|data nascimento|data de nascimento)$/],
  item: [/^(?:item|produto|insumo|material)$/],
  quantity: [/^(?:quantidade|qtd|qtde|litros|litro|volume)$/],
  unit: [/^(?:unidade|un|medida)$/],
  movement_type: [/^(?:movimento|tipo movimento|entrada saida|operacao|operação)$/],
  value: [/^(?:valor|preco|preço|total|custo)$/],
  description: [/^(?:descricao|descrição|motivo|categoria financeira)$/],
  employee: [/^(?:funcionario|funcionário|colaborador|empregado)$/]
};

export function normalizeStructuredInputText(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/%0D%0A|%0A|%0D/gi, "\n")
    .replace(/&#10;|&#x0a;/gi, "\n");
}

function compactHeader(value: string) {
  return normalizeRanchoText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function nonEmptyLines(text: string) {
  return normalizeStructuredInputText(text)
    .split("\n")
    .map((line, index) => ({ text: line.trim(), lineNumber: index + 1 }))
    .filter((line) => line.text);
}

function splitCells(line: string, separator: StructuredInputDetection["separator"]) {
  if (separator === "whitespace") return line.trim().split(/\s+/).map((cell) => cell.trim());
  if (separator === ":") {
    const index = line.indexOf(":");
    if (index < 0) return [line.trim()];
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }
  if (!separator) return [line.trim()];
  return line.split(separator).map((cell) => cell.trim());
}

function separatorScore(lines: string[], separator: StructuredInputDetection["separator"]) {
  const counts = lines.map((line) => splitCells(line, separator).length);
  const usefulCounts = counts.filter((count) => count >= 2);
  if (usefulCounts.length < Math.min(2, lines.length)) return 0;
  const frequencies = usefulCounts.reduce<Record<number, number>>((acc, count) => {
    acc[count] = (acc[count] || 0) + 1;
    return acc;
  }, {});
  const repeated = Math.max(...Object.values(frequencies));
  const coverage = usefulCounts.length / Math.max(lines.length, 1);
  const consistency = repeated / Math.max(usefulCounts.length, 1);
  const widthBonus = Math.min(Math.max(...usefulCounts) / 4, 1);
  return coverage * 0.45 + consistency * 0.4 + widthBonus * 0.15;
}

function chooseSeparator(lines: string[]) {
  let best: { separator: StructuredInputDetection["separator"]; score: number } = { separator: null, score: 0 };
  for (const separator of SEPARATORS) {
    const score = separatorScore(lines, separator);
    if (score > best.score) best = { separator, score };
  }
  return best;
}

function headerFieldFor(cell: string): HeaderField | null {
  const compact = compactHeader(cell);
  if (!compact) return null;
  for (const [field, patterns] of Object.entries(HEADER_ALIASES) as Array<[HeaderField, RegExp[]]>) {
    if (patterns.some((pattern) => pattern.test(compact))) return field;
  }
  return null;
}

function headerScore(cells: string[]) {
  return cells.reduce((score, cell) => score + (headerFieldFor(cell) ? 1 : 0), 0);
}

function looksLikeHeader(cells: string[], nextRows: string[][]) {
  const score = headerScore(cells);
  if (score >= 2) return true;
  if (score === 1 && nextRows.some((row) => row.length === cells.length)) return true;
  return false;
}

export function detectStructuredInput(text: string): StructuredInputDetection {
  const lines = nonEmptyLines(text);
  if (lines.length < 2) {
    return {
      detected: false,
      structureType: "unknown_structured",
      separator: null,
      hasHeader: false,
      rowCount: 0,
      usefulLineCount: lines.length,
      confidence: 0
    };
  }

  const chosen = chooseSeparator(lines.map((line) => line.text));
  if (!chosen.separator || chosen.score < 0.45) {
    return {
      detected: false,
      structureType: "unknown_structured",
      separator: null,
      hasHeader: false,
      rowCount: 0,
      usefulLineCount: lines.length,
      confidence: chosen.score
    };
  }

  const cellRows = lines.map((line) => splitCells(line.text, chosen.separator));
  const hasHeader = looksLikeHeader(cellRows[0] || [], cellRows.slice(1));
  const rowCount = Math.max(lines.length - (hasHeader ? 1 : 0), 0);
  const structureType = hasHeader
    ? "table_with_header"
    : chosen.separator === ":" && cellRows.every((row) => row.length === 2)
      ? "key_value_list"
      : "separator_list";

  return {
    detected: rowCount > 0,
    structureType,
    separator: chosen.separator,
    hasHeader,
    rowCount,
    usefulLineCount: lines.length,
    confidence: Math.min(0.99, chosen.score)
  };
}

export function parseStructuredInput(text: string, detection = detectStructuredInput(text)): StructuredParsedTable | null {
  if (!detection.detected || !detection.separator) return null;
  const lines = nonEmptyLines(text);
  const allRows = lines.map((line) => ({ ...line, cells: splitCells(line.text, detection.separator) }));
  const headers = detection.hasHeader ? (allRows[0]?.cells || []) : [];
  const rows = allRows.slice(detection.hasHeader ? 1 : 0).map((line) => ({
    lineNumber: line.lineNumber,
    rawText: line.text,
    cells: headers.length && line.cells.length > headers.length
      ? [...line.cells.slice(0, headers.length - 1), line.cells.slice(headers.length - 1).join(String(detection.separator === "whitespace" ? " " : detection.separator || ";")).trim()]
      : line.cells
  }));
  return { detection, headers, rows };
}

function columnMappingFromHeaders(headers: string[]) {
  const mapping: StructuredColumnMapping = {};
  headers.forEach((header, index) => {
    const field = headerFieldFor(header);
    if (field && mapping[field] === undefined) mapping[field] = index;
  });
  return mapping;
}

function fieldAt(row: StructuredParsedRow, mapping: StructuredColumnMapping, field: string) {
  const index = mapping[field];
  return typeof index === "number" ? (row.cells[index] || "").trim() : "";
}

function hasMapped(mapping: StructuredColumnMapping, fields: string[]) {
  return fields.every((field) => typeof mapping[field] === "number");
}

function normalizedEvent(value: string) {
  const text = normalizeRanchoText(value);
  if (!text) return null;
  if (/\b(?:inseminacao|inseminada|inseminou|cobertura|cobriu)\b/.test(text)) return "inseminacao";
  if (/\b(?:pre[\s_-]*parto|pre natal|proxima do parto)\b/.test(text)) return "pre_parto";
  if (/\b(?:pariu|parto|nasceu|nascimento)\b/.test(text)) return "parto";
  if (/\b(?:prenhez|prenhe|emprenhou|prenhez confirmada|gestante)\b/.test(text)) return "prenhez";
  if (/\b(?:cio|cruzando|cio detectado)\b/.test(text)) return "cio";
  if (/\b(?:aborto|abortou)\b/.test(text)) return "aborto";
  return null;
}

function isAmbiguousEvent(value: string) {
  const text = normalizeRanchoText(value);
  return /\b(?:protocolo|protocolada|protocolado|tratamento|manejo|ocorrencia|ocorrência)\b/.test(text);
}

function looksLikeDate(value: string) {
  return Boolean(parseStructuredDate(value));
}

export function parseStructuredDate(value: string) {
  const text = String(value || "").trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (iso) return validDate(Number(iso[3]), Number(iso[2]), Number(iso[1]));

  const dayFirst = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!dayFirst) return null;
  const rawYear = Number(dayFirst[3]);
  const year = dayFirst[3].length === 2 ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  return validDate(Number(dayFirst[1]), Number(dayFirst[2]), year);
}

function validDate(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseStructuredNumber(value: string) {
  const text = String(value || "").trim();
  if (!text) return null;
  const normalized = text.replace(/r\$/gi, "").replace(/\s+/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function inferHeaderlessMapping(table: StructuredParsedTable) {
  const firstRows = table.rows.slice(0, 5);
  const width = Math.max(...firstRows.map((row) => row.cells.length), 0);
  const mapping: StructuredColumnMapping = {};
  if (width < 2) return mapping;

  const secondColumnEvents = firstRows.filter((row) => normalizedEvent(row.cells[1] || "") || isAmbiguousEvent(row.cells[1] || "")).length;
  const thirdColumnDates = firstRows.filter((row) => looksLikeDate(row.cells[2] || "")).length;
  const secondColumnCategories = firstRows.filter((row) => normalizeAnimalCategory(row.cells[1] || "")).length;
  const secondColumnNumbers = firstRows.filter((row) => parseStructuredNumber(row.cells[1] || "") !== null).length;

  if (secondColumnEvents >= Math.max(1, Math.ceil(firstRows.length * 0.5))) {
    mapping.animal_ref = 0;
    mapping.event_type = 1;
    if (thirdColumnDates > 0) mapping.date = 2;
    if (width > 3) mapping.observations = 3;
    return mapping;
  }

  if (secondColumnCategories >= Math.max(1, Math.ceil(firstRows.length * 0.5))) {
    mapping.animal_ref = 0;
    mapping.category = 1;
    if (width > 2) mapping.sex = 2;
    return mapping;
  }

  if (secondColumnNumbers >= Math.max(1, Math.ceil(firstRows.length * 0.5))) {
    mapping.animal_ref = 0;
    mapping.quantity = 1;
    return mapping;
  }

  return mapping;
}

function normalizeAnimalCategory(value: string) {
  const text = normalizeRanchoText(value);
  if (!text) return null;
  if (/\b(?:vaca|matriz|matrizes)\b/.test(text)) return "vaca";
  if (/\b(?:touro|reprodutor|reprodutores)\b/.test(text)) return "touro";
  if (/\b(?:boi|garrote)\b/.test(text)) return "boi";
  if (/\b(?:bezerro|bezerra|terneiro|terneira)\b/.test(text)) return "bezerro";
  if (/\b(?:novilha|novilho)\b/.test(text)) return "novilha";
  if (/\b(?:animal|animais|bovino|bovinos|gado|outro|outros|outra|outras)\b/.test(text)) return "outro";
  return null;
}

export function classifyStructuredTableLocally(table: StructuredParsedTable, forcedDomain?: StructuredTableDomain): StructuredTablePlan {
  const headerMapping = columnMappingFromHeaders(table.headers);
  const inferredMapping = table.detection.hasHeader ? {} : inferHeaderlessMapping(table);
  const mapping = { ...inferredMapping, ...headerMapping };

  const scores: Record<StructuredTableDomain, number> = {
    REPRODUCAO_EVENTOS: 0,
    PRODUCAO_LEITE: 0,
    ESTOQUE_MOVIMENTACAO: 0,
    FINANCEIRO: 0,
    CADASTRO_ANIMAL: 0,
    CADASTRO_FUNCIONARIO: 0,
    SAUDE_ANIMAL: 0,
    OBSERVACAO_ANIMAL: 0,
    PONTO_FUNCIONARIO: 0,
    DESCONHECIDO: 0
  };

  if (hasMapped(mapping, ["animal_ref", "event_type"])) scores.REPRODUCAO_EVENTOS += 4;
  if (typeof mapping.date === "number") scores.REPRODUCAO_EVENTOS += 1;
  if (hasMapped(mapping, ["animal_ref", "quantity"])) scores.PRODUCAO_LEITE += 3;
  if (hasMapped(mapping, ["item", "quantity"])) scores.ESTOQUE_MOVIMENTACAO += 3;
  if (hasMapped(mapping, ["animal_ref", "category"])) scores.CADASTRO_ANIMAL += 5;
  if (typeof mapping.name === "number") scores.CADASTRO_ANIMAL += 2;
  if (typeof mapping.sex === "number") scores.CADASTRO_ANIMAL += 1;
  if (typeof mapping.breed === "number") scores.CADASTRO_ANIMAL += 1;
  if (typeof mapping.birth_date === "number") scores.CADASTRO_ANIMAL += 1;
  if (hasMapped(mapping, ["value", "description"])) scores.FINANCEIRO += 3;

  if (hasMapped(mapping, ["animal_ref", "event_type", "date"]) && typeof mapping.sex === "number" && !hasMapped(mapping, ["category"])) {
    return {
      tableType: "DESCONHECIDO",
      confidence: 0.68,
      columnMapping: mapping,
      warnings: ["ambiguous_event_or_animal_table"],
      needsUserClarification: true,
      source: "local"
    };
  }

  const sampleRows = table.rows.slice(0, 8);
  for (const row of sampleRows) {
    const eventRaw = fieldAt(row, mapping, "event_type");
    if (normalizedEvent(eventRaw) || isAmbiguousEvent(eventRaw)) scores.REPRODUCAO_EVENTOS += 1;
    const quantityRaw = fieldAt(row, mapping, "quantity");
    if (parseStructuredNumber(quantityRaw) !== null && typeof mapping.animal_ref === "number") scores.PRODUCAO_LEITE += 0.5;
  }

  const tableType = forcedDomain || (Object.entries(scores)
    .filter(([domain]) => domain !== "DESCONHECIDO")
    .sort((a, b) => b[1] - a[1])[0]?.[0] as StructuredTableDomain | undefined) || "DESCONHECIDO";
  const bestScore = scores[tableType] || 0;

  return {
    tableType: bestScore > 0 || forcedDomain ? tableType : "DESCONHECIDO",
    confidence: Math.min(0.95, 0.55 + bestScore / 10),
    columnMapping: mapping,
    warnings: [],
    needsUserClarification: bestScore <= 0 && !forcedDomain,
    source: "local"
  };
}

function makeRecord(row: StructuredParsedRow, intent: string, fields: Record<string, unknown>, rawFields: Record<string, string>, problemas: string[], review = false): StructuredMappedRecord {
  return {
    lineNumber: row.lineNumber,
    rawText: row.rawText,
    status: review ? "needs_review" : problemas.length ? "invalid" : "valid",
    problemas,
    intent,
    fields,
    rawFields
  };
}

export function mapStructuredRows(table: StructuredParsedTable, plan: StructuredTablePlan): StructuredMappedBatch {
  const mapping = plan.columnMapping || {};
  const records = table.rows.map((row) => {
    if (plan.tableType === "REPRODUCAO_EVENTOS") return mapReproductionRow(row, mapping);
    if (plan.tableType === "PRODUCAO_LEITE") return mapMilkProductionRow(row, mapping);
    if (plan.tableType === "CADASTRO_ANIMAL") return mapAnimalImportRow(row, mapping);
    if (plan.tableType === "ESTOQUE_MOVIMENTACAO") return mapStockRow(row, mapping);
    return makeRecord(row, "DESCONHECIDO", {}, {}, ["dominio_desconhecido"], true);
  });

  const validRecords = records.filter((record) => record.status === "valid");
  const invalidRecords = records.filter((record) => record.status === "invalid");
  const needsReview = records.filter((record) => record.status === "needs_review");
  return {
    records,
    validRecords,
    invalidRecords,
    needsReview,
    summary: {
      totalRows: records.length,
      validRecords: validRecords.length,
      invalidRecords: invalidRecords.length,
      needsReview: needsReview.length
    }
  };
}

function mapReproductionRow(row: StructuredParsedRow, mapping: StructuredColumnMapping) {
  const animal = fieldAt(row, mapping, "animal_ref");
  const eventRaw = fieldAt(row, mapping, "event_type");
  const dateRaw = fieldAt(row, mapping, "date");
  const observations = fieldAt(row, mapping, "observations");
  const event = normalizedEvent(eventRaw);
  const date = parseStructuredDate(dateRaw);
  const problemas: string[] = [];
  const review = !event && isAmbiguousEvent(eventRaw);

  if (!animal) problemas.push("animal_sem_codigo");
  if (!eventRaw) problemas.push("tipo_evento_ausente");
  else if (!event && !review) problemas.push("tipo_evento_desconhecido");
  if (!dateRaw) problemas.push("data_ausente");
  else if (!date) problemas.push("data_invalida");
  if (review) problemas.push("tipo_evento_ambiguo");

  return makeRecord(row, event || "DESCONHECIDO", {
    animal_ref: animal,
    event_type: event,
    date,
    observations
  }, {
    animal_ref: animal,
    event_type: eventRaw,
    date: dateRaw,
    observations
  }, problemas, review);
}

function mapMilkProductionRow(row: StructuredParsedRow, mapping: StructuredColumnMapping) {
  const animal = fieldAt(row, mapping, "animal_ref");
  const quantityRaw = fieldAt(row, mapping, "quantity");
  const dateRaw = fieldAt(row, mapping, "date");
  const observations = fieldAt(row, mapping, "observations");
  const quantity = parseStructuredNumber(quantityRaw);
  const date = parseStructuredDate(dateRaw);
  const problemas: string[] = [];
  if (!animal) problemas.push("animal_sem_codigo");
  if (!quantityRaw) problemas.push("litros_ausentes");
  else if (quantity === null || quantity <= 0) problemas.push("litros_invalidos");
  if (dateRaw && !date) problemas.push("data_invalida");
  return makeRecord(row, "PRODUCAO_LEITE", {
    animal_ref: animal,
    quantity,
    date,
    observations
  }, { animal_ref: animal, quantity: quantityRaw, date: dateRaw, observations }, problemas);
}

function mapAnimalImportRow(row: StructuredParsedRow, mapping: StructuredColumnMapping) {
  const animal = fieldAt(row, mapping, "animal_ref");
  const categoryRaw = fieldAt(row, mapping, "category");
  const category = normalizeAnimalCategory(categoryRaw);
  const problemas: string[] = [];
  if (!animal) problemas.push("animal_sem_codigo");
  if (!categoryRaw) problemas.push("categoria_ausente");
  else if (!category) problemas.push("categoria_invalida");
  return makeRecord(row, "CADASTRO_ANIMAL", {
    animal_ref: animal,
    name: fieldAt(row, mapping, "name"),
    category,
    sex: fieldAt(row, mapping, "sex"),
    breed: fieldAt(row, mapping, "breed"),
    lot: fieldAt(row, mapping, "lot"),
    status: fieldAt(row, mapping, "status"),
    weight: parseStructuredNumber(fieldAt(row, mapping, "weight")),
    birth_date: parseStructuredDate(fieldAt(row, mapping, "birth_date")),
    observations: fieldAt(row, mapping, "observations")
  }, {
    animal_ref: animal,
    category: categoryRaw
  }, problemas);
}

function mapStockRow(row: StructuredParsedRow, mapping: StructuredColumnMapping) {
  const item = fieldAt(row, mapping, "item");
  const quantityRaw = fieldAt(row, mapping, "quantity");
  const quantity = parseStructuredNumber(quantityRaw);
  const movementRaw = fieldAt(row, mapping, "movement_type") || fieldAt(row, mapping, "event_type");
  const movementText = normalizeRanchoText(movementRaw);
  const movement = /\b(?:saida|uso|baixa|retirada|consumo|venda|vendido)\b/.test(movementText)
    ? "saida"
    : /\b(?:entrada|compra|adicao|recebido|recebimento)\b/.test(movementText)
      ? "entrada"
      : null;
  const dateRaw = fieldAt(row, mapping, "date");
  const date = parseStructuredDate(dateRaw);
  const problemas: string[] = [];
  if (!item) problemas.push("item_ausente");
  if (!quantityRaw) problemas.push("quantidade_ausente");
  else if (quantity === null || quantity <= 0) problemas.push("quantidade_invalida");
  if (!movementRaw) problemas.push("tipo_movimento_ausente");
  else if (!movement) problemas.push("tipo_movimento_desconhecido");
  if (dateRaw && !date) problemas.push("data_invalida");
  return makeRecord(row, movement === "saida" ? "ESTOQUE_SAIDA" : "ESTOQUE_ENTRADA", {
    item,
    quantity,
    unit: fieldAt(row, mapping, "unit"),
    movement_type: movement,
    date,
    value: parseStructuredNumber(fieldAt(row, mapping, "value")),
    observations: fieldAt(row, mapping, "observations")
  }, { item, quantity: quantityRaw, movement_type: movementRaw, date: dateRaw }, problemas);
}
