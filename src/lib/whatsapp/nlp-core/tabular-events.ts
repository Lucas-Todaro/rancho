import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { inferAnimalSexFromCategory } from "./extractors";
import { finalize } from "./result";
import type { ParsedRanchoMessage } from "./types";

export type ParsedTabularAnimalEventRow = {
  lineNumber: number;
  rawText: string;
  animal_codigo_original: string;
  animal_codigo: string;
  status_original: string;
  evento_tipo: "inseminacao" | "parto" | "protocolo" | null;
  evento_label: string | null;
  db_tipo: "observacao" | "parto" | "inseminacao" | null;
  data_original: string;
  data_referencia: string | null;
  observacoes: string;
  problemas: string[];
};

export type ParsedTabularAnimalImportRow = {
  lineNumber: number;
  rawText: string;
  animal_codigo_original: string;
  animal_codigo: string;
  nome: string | null;
  categoria_original: string;
  categoria: "vaca" | "boi" | "bezerro" | "novilha" | "touro" | "outro" | null;
  sexo_original: string;
  sexo: "macho" | "femea" | "nao_informado" | null;
  sexo_inferido_categoria?: string | null;
  sexo_origem?: "informado" | "inferido_categoria" | "nao_informado";
  raca: string | null;
  lote_nome: string | null;
  status_original: string;
  status: "ativo" | "inativo" | "morto" | "vendido" | null;
  peso: number | null;
  data_nascimento: string | null;
  observacoes: string;
  problemas: string[];
};

export type ParsedTabularStockImportRow = {
  lineNumber: number;
  rawText: string;
  item_original: string;
  item_nome: string;
  quantidade_original: string;
  quantidade: number | null;
  unidade_original: string;
  unidade: string | null;
  tipo_original: string;
  tipo_movimento: "entrada" | "saida" | null;
  data_original: string;
  data_referencia: string | null;
  valor_original: string;
  valor: number | null;
  observacoes: string;
  problemas: string[];
};

type EventTypeResolution = {
  evento_tipo: ParsedTabularAnimalEventRow["evento_tipo"];
  evento_label: string;
  db_tipo: ParsedTabularAnimalEventRow["db_tipo"];
};

type TableKind = "animal_events" | "animals_import" | "stock_import" | "ambiguous" | null;

type ParsedLine = {
  text: string;
  lineNumber: number;
};

type HeaderMap = Record<string, number | undefined>;

function normalizeAnimalTableCode(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function compactHeader(value: string) {
  return normalizeRanchoText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function splitHeaderCells(line: string) {
  return line.split(";").map((cell) => compactHeader(cell));
}

function hasAnyHeader(cells: string[], patterns: RegExp[]) {
  return cells.some((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function headerIndex(cells: string[], patterns: RegExp[]) {
  const index = cells.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
  return index >= 0 ? index : undefined;
}

function buildHeaderMap(headerLine: string): HeaderMap {
  const cells = splitHeaderCells(headerLine);
  return {
    code: headerIndex(cells, [/^(?:codigo|cod|brinco|animal)(?:\s+animal)?$/, /^codigo\s+animal$/]),
    eventType: headerIndex(cells, [/^(?:status\s+tipo|status|tipo|evento)$/]),
    date: headerIndex(cells, [/^data$/, /^data\s+evento$/]),
    notes: headerIndex(cells, [/^(?:observacoes|observacao|obs|nota|notas)$/]),
    name: headerIndex(cells, [/^nome$/]),
    category: headerIndex(cells, [/^(?:categoria|tipo|classe)$/]),
    sex: headerIndex(cells, [/^sexo$/]),
    breed: headerIndex(cells, [/^raca$/]),
    lot: headerIndex(cells, [/^(?:lote|piquete|pasto)$/]),
    status: headerIndex(cells, [/^(?:status|situacao)$/]),
    weight: headerIndex(cells, [/^(?:peso|kg)$/]),
    birthDate: headerIndex(cells, [/^(?:nascimento|data\s+nascimento|data\s+de\s+nascimento)$/]),
    item: headerIndex(cells, [/^(?:item|produto|insumo|material)$/]),
    quantity: headerIndex(cells, [/^(?:quantidade|qtd|qtde)$/]),
    unit: headerIndex(cells, [/^(?:unidade|un|medida)$/]),
    value: headerIndex(cells, [/^(?:valor|preco|preco\s+unitario|valor\s+unitario|custo)$/])
  };
}

function detectTableKindFromHeader(headerLine: string): TableKind {
  if (!headerLine.includes(";")) return null;

  const cells = splitHeaderCells(headerLine);
  const hasCode = hasAnyHeader(cells, [/^(?:codigo|cod|brinco|animal)(?:\s+animal)?$/, /^codigo\s+animal$/]);
  const hasDate = hasAnyHeader(cells, [/^data$/, /^data\s+evento$/]);
  const hasEvent = hasAnyHeader(cells, [/^(?:status\s+tipo|evento)$/]);
  const hasTypeOrStatus = hasAnyHeader(cells, [/^(?:status|tipo)$/]);
  const hasAnimalField = hasAnyHeader(cells, [/^nome$/, /^categoria$/, /^sexo$/, /^raca$/, /^lote$/, /^piquete$/, /^pasto$/, /^peso$/, /^(?:nascimento|data\s+nascimento|data\s+de\s+nascimento)$/]);
  const hasStockField = hasAnyHeader(cells, [/^(?:item|produto|insumo|material)$/, /^(?:quantidade|qtd|qtde)$/, /^(?:unidade|un|medida)$/]);

  const eventScore = (hasDate ? 2 : 0) + (hasEvent ? 2 : 0) + (hasTypeOrStatus ? 1 : 0);
  const animalScore = (hasAnimalField ? 2 : 0)
    + (hasAnyHeader(cells, [/^nome$/]) ? 2 : 0)
    + (hasAnyHeader(cells, [/^categoria$/, /^sexo$/, /^raca$/, /^lote$/]) ? 1 : 0);
  const stockScore = (hasStockField ? 3 : 0)
    + (hasAnyHeader(cells, [/^(?:item|produto|insumo|material)$/]) ? 2 : 0)
    + (hasAnyHeader(cells, [/^(?:quantidade|qtd|qtde)$/]) ? 2 : 0)
    + (hasAnyHeader(cells, [/^(?:unidade|un|medida)$/]) ? 1 : 0);

  if (stockScore >= 5 && stockScore > eventScore && stockScore > animalScore) return "stock_import";
  if (!hasCode) return null;
  if (eventScore >= 3 && eventScore > animalScore) return "animal_events";
  if (animalScore >= 3 && animalScore > eventScore) return "animals_import";
  if (eventScore >= 3 && animalScore >= 3) return "ambiguous";
  if (hasDate && hasTypeOrStatus) return "animal_events";
  if (hasAnimalField) return "animals_import";
  return null;
}

function isHeaderLine(line: string) {
  if (!line.includes(";")) return false;
  return detectTableKindFromHeader(line) === "animal_events";
}

function splitTableRow(line: string) {
  const cells = line.split(";").map((cell) => cell.trim());
  if (cells.length < 3) return null;
  return {
    animal: cells[0] || "",
    status: cells[1] || "",
    date: cells[2] || "",
    notes: cells.slice(3).join(";").trim()
  };
}

function validDateParts(day: number, month: number, year: number) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseTableDate(value: string) {
  const text = value.trim();
  if (!text) return null;

  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = match[3].length === 2 ?(rawYear >= 70 ?1900 + rawYear : 2000 + rawYear) : rawYear;
  if (!validDateParts(day, month, year)) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function resolveEventType(value: string): EventTypeResolution | null {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return null;

  if (/\b(?:pariu|parto|parida|nascimento)\b/.test(normalized)) {
    return {
      evento_tipo: "parto",
      evento_label: "Parto",
      db_tipo: "parto"
    };
  }

  if (/\b(?:ultimo\s+protocolo|protocolo|protocolada|protocolado|iatf|implante)\b/.test(normalized)) {
    return {
      evento_tipo: "protocolo",
      evento_label: "Protocolo",
      db_tipo: "observacao"
    };
  }

  if (/\b(?:inseminacao|inseminada|inseminado|inseminar|ia|cobertura|coberta|coberto)\b/.test(normalized)) {
    return {
      evento_tipo: "inseminacao",
      evento_label: "Inseminacao",
      db_tipo: "inseminacao"
    };
  }

  return null;
}

function normalizeAnimalCategory(value: string): ParsedTabularAnimalImportRow["categoria"] {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return null;
  if (/\b(?:vaca|matriz|matrizes)\b/.test(normalized)) return "vaca";
  if (/\b(?:touro|reprodutor|reprodutores)\b/.test(normalized)) return "touro";
  if (/\b(?:boi|garrote)\b/.test(normalized)) return "boi";
  if (/\b(?:bezerro|bezerra|terneiro|terneira)\b/.test(normalized)) return "bezerro";
  if (/\b(?:novilha|novilho)\b/.test(normalized)) return "novilha";
  if (/\b(?:animal|animais|bovino|bovinos|gado|cria|indefinido|indefinida|outro|outros|outra|outras|nao informado|sem categoria)\b/.test(normalized)) return "outro";
  return null;
}

function normalizeAnimalSex(value: string): ParsedTabularAnimalImportRow["sexo"] {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return "nao_informado";
  if (/^(?:m|macho|masculino)$/.test(normalized)) return "macho";
  if (/^(?:f|femea|feminino)$/.test(normalized)) return "femea";
  if (/\b(?:nao informado|sem sexo|desconhecido|ignorado)\b/.test(normalized)) return "nao_informado";
  return null;
}

function normalizeAnimalStatus(value: string): ParsedTabularAnimalImportRow["status"] {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return "ativo";
  if (/^(?:ativo|ativa|em atividade)$/.test(normalized)) return "ativo";
  if (/^(?:inativo|inativa)$/.test(normalized)) return "inativo";
  if (/^(?:morto|morta|obito|obito registrado)$/.test(normalized)) return "morto";
  if (/^(?:vendido|vendida)$/.test(normalized)) return "vendido";
  return null;
}

function parseAnimalWeight(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function parsePositiveTableNumber(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ?number : null;
}

function parseOptionalMoney(value: string) {
  const text = value.trim();
  if (!text) return null;
  const normalized = text
    .replace(/r\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ?number : null;
}

function normalizeStockUnit(value: string) {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return null;
  if (/^(?:kg|quilo|quilos|kilograma|kilogramas)$/.test(normalized)) return "kg";
  if (/^(?:saco|sacos)$/.test(normalized)) return "saco";
  if (/^(?:dose|doses)$/.test(normalized)) return "dose";
  if (/^(?:unidade|unidades|un|und)$/.test(normalized)) return "unidade";
  if (/^(?:litro|litros|l)$/.test(normalized)) return "litro";
  if (/^(?:caixa|caixas)$/.test(normalized)) return "caixa";
  if (/^(?:fardo|fardos)$/.test(normalized)) return "fardo";
  return null;
}

function normalizeStockMovementType(value: string): ParsedTabularStockImportRow["tipo_movimento"] {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return null;
  if (/^(?:entrada|compra|comprado|adicao|adicionar|recebido|recebimento)$/.test(normalized)) return "entrada";
  if (/^(?:saida|saída|uso|usado|baixa|retirada|consumo|venda|vendido)$/.test(normalized)) return "saida";
  return null;
}

function parseStockImportLine(line: string, lineNumber: number, header: HeaderMap): ParsedTabularStockImportRow | null {
  const cells = line.split(";").map((cell) => cell.trim());
  if (cells.length < 3) return null;
  if (cells.every((cell) => !cell)) return null;

  const itemOriginal = cellAt(cells, header.item ?? 0);
  const quantityOriginal = cellAt(cells, header.quantity);
  const unitOriginal = cellAt(cells, header.unit);
  const typeOriginal = cellAt(cells, header.eventType ?? header.status);
  const dateOriginal = cellAt(cells, header.date);
  const valueOriginal = cellAt(cells, header.value);
  const quantity = parsePositiveTableNumber(quantityOriginal);
  const unit = normalizeStockUnit(unitOriginal);
  const movementType = normalizeStockMovementType(typeOriginal);
  const parsedDate = dateOriginal ?parseTableDate(dateOriginal) : null;
  const value = parseOptionalMoney(valueOriginal);
  const problemas: string[] = [];

  if (!itemOriginal.trim()) problemas.push("item_ausente");
  if (!quantityOriginal.trim()) problemas.push("quantidade_ausente");
  else if (quantity === null) problemas.push("quantidade_invalida");
  if (!unitOriginal.trim()) problemas.push("unidade_ausente");
  else if (!unit) problemas.push("unidade_invalida");
  if (!typeOriginal.trim()) problemas.push("tipo_movimento_ausente");
  else if (!movementType) problemas.push("tipo_movimento_desconhecido");
  if (dateOriginal.trim() && !parsedDate) problemas.push("data_invalida");
  if (valueOriginal.trim() && value === null) problemas.push("valor_invalido");

  return {
    lineNumber,
    rawText: line,
    item_original: itemOriginal,
    item_nome: itemOriginal.trim(),
    quantidade_original: quantityOriginal,
    quantidade: quantity,
    unidade_original: unitOriginal,
    unidade: unit,
    tipo_original: typeOriginal,
    tipo_movimento: movementType,
    data_original: dateOriginal,
    data_referencia: parsedDate,
    valor_original: valueOriginal,
    valor: value,
    observacoes: cellAt(cells, header.notes),
    problemas
  };
}

function parseOptionalDate(value: string) {
  return parseTableDate(value);
}

function cellAt(cells: string[], index?: number) {
  return index === undefined ? "" : (cells[index] || "").trim();
}

function parseDataLine(line: string, lineNumber: number): ParsedTabularAnimalEventRow | null {
  const cells = splitTableRow(line);
  if (!cells) return null;
  if (!cells.animal && !cells.status && !cells.date && !cells.notes) return null;

  const problemas: string[] = [];
  const animalCode = normalizeAnimalTableCode(cells.animal);
  const eventType = resolveEventType(cells.status);
  const parsedDate = parseTableDate(cells.date);

  if (!animalCode) problemas.push("animal_sem_codigo");
  if (!eventType) problemas.push("tipo_evento_desconhecido");
  if (!cells.date.trim()) problemas.push("data_ausente");
  else if (!parsedDate) problemas.push("data_invalida");

  return {
    lineNumber,
    rawText: line,
    animal_codigo_original: cells.animal,
    animal_codigo: animalCode,
    status_original: cells.status,
    evento_tipo: eventType?.evento_tipo || null,
    evento_label: eventType?.evento_label || null,
    db_tipo: eventType?.db_tipo || null,
    data_original: cells.date,
    data_referencia: parsedDate,
    observacoes: cells.notes,
    problemas
  };
}

function parseAnimalImportLine(line: string, lineNumber: number, header: HeaderMap): ParsedTabularAnimalImportRow | null {
  const cells = line.split(";").map((cell) => cell.trim());
  if (cells.length < 2) return null;
  if (cells.every((cell) => !cell)) return null;

  const codeOriginal = cellAt(cells, header.code ?? 0);
  const categoryOriginal = cellAt(cells, header.category);
  const sexOriginal = cellAt(cells, header.sex);
  const statusOriginal = cellAt(cells, header.status);
  const birthDateOriginal = cellAt(cells, header.birthDate);
  const category = normalizeAnimalCategory(categoryOriginal);
  const explicitSex = sexOriginal.trim() ?normalizeAnimalSex(sexOriginal) : null;
  const inferredSex = !sexOriginal.trim() ?inferAnimalSexFromCategory(categoryOriginal || category) : undefined;
  const sex = explicitSex || inferredSex || "nao_informado";
  const sexOrigin: ParsedTabularAnimalImportRow["sexo_origem"] = explicitSex
    ?"informado"
    : inferredSex
      ?"inferido_categoria"
      : "nao_informado";
  const status = normalizeAnimalStatus(statusOriginal);
  const birthDate = birthDateOriginal ?parseOptionalDate(birthDateOriginal) : null;
  const weightText = cellAt(cells, header.weight);
  const weight = weightText ?parseAnimalWeight(weightText) : null;
  const problemas: string[] = [];
  const animalCode = normalizeAnimalTableCode(codeOriginal);

  if (!animalCode) problemas.push("animal_sem_codigo");
  if (!categoryOriginal.trim()) problemas.push("categoria_ausente");
  else if (!category) problemas.push("categoria_invalida");
  if (sexOriginal.trim() && !explicitSex) problemas.push("sexo_invalido");
  if (statusOriginal.trim() && !status) problemas.push("status_invalido");
  if (birthDateOriginal.trim() && !birthDate) problemas.push("data_nascimento_invalida");
  if (weightText.trim() && weight === null) problemas.push("peso_invalido");

  return {
    lineNumber,
    rawText: line,
    animal_codigo_original: codeOriginal,
    animal_codigo: animalCode,
    nome: cellAt(cells, header.name) || null,
    categoria_original: categoryOriginal,
    categoria: category,
    sexo_original: sexOriginal,
    sexo: sex,
    sexo_inferido_categoria: inferredSex ?categoryOriginal || category : null,
    sexo_origem: sexOrigin,
    raca: cellAt(cells, header.breed) || null,
    lote_nome: cellAt(cells, header.lot) || null,
    status_original: statusOriginal,
    status,
    peso: weight,
    data_nascimento: birthDate,
    observacoes: cellAt(cells, header.notes),
    problemas
  };
}

function eventCounts(rows: ParsedTabularAnimalEventRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = row.evento_tipo || "desconhecido";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function animalImportCounts(rows: ParsedTabularAnimalImportRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = row.categoria || "desconhecido";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function stockImportCounts(rows: ParsedTabularStockImportRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = row.tipo_movimento || "desconhecido";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function normalizeTabularAnimalEventsText(text: string) {
  let normalized = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  if (!normalized.includes("\n") && normalized.includes(";")) {
    normalized = normalized
      .replace(/\\r\\n/g, "\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/%0D%0A|%0A|%0D/gi, "\n")
      .replace(/&#10;|&#x0a;/gi, "\n");
  }

  return normalized;
}

function parsedTableLines(text: string): ParsedLine[] {
  return normalizeTabularAnimalEventsText(text)
    .split("\n")
    .map((line, index) => ({ text: line.trim(), lineNumber: index + 1 }))
    .filter((line) => line.text);
}

function parseAnimalEventsTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const rows: ParsedTabularAnimalEventRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (isHeaderLine(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseDataLine(line.text, line.lineNumber);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_EVENTOS_TABELA", {
    origem_parser: "tabela_local",
    tipo_tabela: "animal_events",
    importacao_tabela_eventos: true,
    tabela_destino: "eventos_animal",
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    contagem_eventos_parse: eventCounts(rows),
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows,
    instrucoes_confirmacao: "confirmar_para_importar_linhas_validas"
  }, [], 0.96);
}

function parseAnimalsImportTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const header = buildHeaderMap(lines[headerIndex].text);
  const rows: ParsedTabularAnimalImportRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (detectTableKindFromHeader(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseAnimalImportLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_ANIMAIS_TABELA", {
    origem_parser: "tabela_local",
    tipo_tabela: "animals_import",
    importacao_tabela_animais: true,
    tabela_destino: "animais",
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    contagem_animais_parse: animalImportCounts(rows),
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows,
    instrucoes_confirmacao: "confirmar_para_cadastrar_animais_validos"
  }, [], 0.96);
}

function parseHeaderlessAnimalsImportTable(text: string, lines: ParsedLine[]): ParsedRanchoMessage | null {
  const candidateLines = lines.filter((line) => {
    if (!line.text.includes(";")) return false;
    if (detectTableKindFromHeader(line.text)) return false;
    const cells = line.text.split(";").map((cell) => cell.trim());
    if (cells.length < 2 || cells.length > 3) return false;
    if (!cells[0] || !cells[1]) return false;
    const category = normalizeAnimalCategory(cells[1]);
    const sex = cells[2] ?normalizeAnimalSex(cells[2]) : "nao_informado";
    return Boolean(category && sex);
  });
  if (candidateLines.length < 2) return null;

  const header: HeaderMap = { code: 0, category: 1, sex: 2 };
  const rows = candidateLines
    .map((line) => parseAnimalImportLine(line.text, line.lineNumber, header))
    .filter(Boolean) as ParsedTabularAnimalImportRow[];
  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_ANIMAIS_TABELA", {
    origem_parser: "tabela_local",
    tipo_tabela: "animals_import",
    importacao_tabela_animais: true,
    tabela_destino: "animais",
    cabecalho_inferido: "Codigo;Categoria;Sexo",
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    contagem_animais_parse: animalImportCounts(rows),
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows,
    instrucoes_confirmacao: "confirmar_para_cadastrar_animais_validos"
  }, [], 0.92);
}

function parseStockImportTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const header = buildHeaderMap(lines[headerIndex].text);
  const rows: ParsedTabularStockImportRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (detectTableKindFromHeader(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseStockImportLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_ESTOQUE_TABELA", {
    origem_parser: "tabela_local",
    tipo_tabela: "stock_import",
    importacao_tabela_estoque: true,
    tabela_destino: "estoque_movimentacoes",
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    contagem_estoque_parse: stockImportCounts(rows),
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows,
    instrucoes_confirmacao: "confirmar_para_importar_estoque_valido"
  }, [], 0.96);
}

function parseAmbiguousTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const dataLines = lines.slice(headerIndex + 1).filter((line) => line.text.includes(";"));
  if (!dataLines.length) return null;

  return finalize("IMPORTACAO_TABELA_AMBIGUA", {
    origem_parser: "tabela_local",
    tipo_tabela: "ambiguous",
    texto_tabela_original: normalizeTabularAnimalEventsText(text),
    cabecalho: lines[headerIndex].text,
    total_linhas: dataLines.length,
    instrucoes_confirmacao: "perguntar_tipo_tabela"
  }, [], 0.74);
}

export function parseTabularAnimalEventsMessage(text: string): ParsedRanchoMessage | null {
  const lines = parsedTableLines(text);
  const headerIndex = lines.findIndex((line) => detectTableKindFromHeader(line.text));
  if (headerIndex < 0) return parseHeaderlessAnimalsImportTable(text, lines);

  const kind = detectTableKindFromHeader(lines[headerIndex].text);
  if (kind === "animal_events") return parseAnimalEventsTable(text, lines, headerIndex);
  if (kind === "animals_import") return parseAnimalsImportTable(text, lines, headerIndex);
  if (kind === "stock_import") return parseStockImportTable(text, lines, headerIndex);
  if (kind === "ambiguous") return parseAmbiguousTable(text, lines, headerIndex);
  return null;
}

export function parseTabularAnimalEventsMessageAs(text: string, kind: "animal_events" | "animals_import" | "stock_import"): ParsedRanchoMessage | null {
  const lines = parsedTableLines(text);
  const headerIndex = lines.findIndex((line) => detectTableKindFromHeader(line.text));
  if (headerIndex < 0 && kind === "animals_import") return parseHeaderlessAnimalsImportTable(text, lines);
  if (headerIndex < 0) return null;
  if (kind === "animal_events") return parseAnimalEventsTable(text, lines, headerIndex);
  if (kind === "animals_import") return parseAnimalsImportTable(text, lines, headerIndex);
  return parseStockImportTable(text, lines, headerIndex);
}
