import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { inferAnimalSexFromCategory } from "./extractors";
import { finalize } from "./result";
import type { ParsedRanchoMessage } from "./types";
import { normalizeCalfSex } from "./birth-child";
import { normalizeReproductiveEventType, reproductiveEventDbType, reproductiveEventLabel, type ReproductiveEventKind } from "./reproductive-events";
import {
  TABULAR_DOMAIN_SCHEMAS,
  classifyStructuredTableDomain,
  mapColumnsForDomain,
  tabularDomainLabel,
  type KnownTabularTableDomain,
  type StructuredTableDomainClassification,
  type TabularTableDomain
} from "./tabular-domain-router";

export type ParsedTabularAnimalEventRow = {
  lineNumber: number;
  rawText: string;
  animal_codigo_original: string;
  animal_codigo: string;
  status_original: string;
  evento_tipo: ReproductiveEventKind | null;
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

export type ParsedTabularMilkProductionRow = {
  lineNumber: number;
  rawText: string;
  animal_codigo_original: string;
  animal_codigo: string;
  litros_original: string;
  litros: number | null;
  data_original: string;
  data_referencia: string | null;
  turno_original: string;
  turno: "manha" | "tarde" | "noite" | null;
  observacoes: string;
  problemas: string[];
};

export type ParsedTabularBirthChildRow = {
  lineNumber: number;
  rawText: string;
  animal_codigo_original: string;
  animal_codigo: string;
  mae_ref_original: string;
  mae_ref: string;
  data_parto_original: string;
  data_referencia: string | null;
  cria_sexo_original: string;
  cria_sexo: "macho" | "femea" | null;
  cria_codigo_original: string;
  cria_codigo: string;
  cria_nome: string | null;
  pai_ref_original: string;
  pai_ref: string | null;
  evento_tipo: "parto";
  evento_label: string;
  db_tipo: "parto";
  parto_cria_cadastro: true;
  observacoes: string;
  problemas: string[];
};

export type ParsedGenericTabularDomainRow = {
  lineNumber: number;
  rawText: string;
  values: Record<string, string>;
  parsedValues: Record<string, string | number | null>;
  status_linha: "pronto" | "revisao" | "invalido";
  problemas: string[];
  avisos: string[];
};

type EventTypeResolution = {
  evento_tipo: ParsedTabularAnimalEventRow["evento_tipo"];
  evento_label: string;
  db_tipo: ParsedTabularAnimalEventRow["db_tipo"];
};

type TableKind = "animal_events" | "animals_import" | "stock_import" | "milk_production" | "birth_child_events" | "domain_preview" | "ambiguous" | null;

type ParsedLine = {
  text: string;
  lineNumber: number;
};

type HeaderMap = {
  code?: number;
  mother?: number;
  father?: number;
  childCode?: number;
  childSex?: number;
  childName?: number;
  eventType?: number;
  date?: number;
  time?: number;
  notes?: number;
  name?: number;
  category?: number;
  sex?: number;
  breed?: number;
  lot?: number;
  status?: number;
  weight?: number;
  birthDate?: number;
  item?: number;
  quantity?: number;
  unit?: number;
  value?: number;
  liters?: number;
  movementType?: number;
  movementTypeDefault?: "entrada" | "saida" | null;
};

export type StructuredInputDetection = {
  isStructured: boolean;
  reason: "single_line_message" | "multiple_lines_consistent_separator" | "multiple_lines_consistent_pair_list" | "no_consistent_structure";
  separator: ";" | "|" | "\t" | "," | ":" | " - " | null;
  usefulLineCount: number;
};

function normalizeAnimalTableCode(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function compactHeader(value: string) {
  return normalizeRanchoText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function splitDelimitedLine(line: string, separator: ";" | "|" | "\t" | ",") {
  if (separator !== ",") return line.split(separator);

  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (inQuotes && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

function splitHeaderCells(line: string) {
  return line.split(";").map((cell) => compactHeader(cell));
}

function usefulLinesFromText(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function countDelimitedCells(line: string, separator: ";" | "|" | "\t" | ",") {
  return splitDelimitedLine(line, separator).length;
}

function hasConsistentDelimitedRows(lines: string[], separator: ";" | "|" | "\t" | ",") {
  const matching = lines.filter((line) => line.includes(separator));
  if (matching.length < 2) return false;
  const counts = matching.map((line) => countDelimitedCells(line, separator));
  const minimum = Math.min(...counts);
  const maximum = Math.max(...counts);
  return minimum >= 2 && maximum - minimum <= 1;
}

function hasConsistentPairList(lines: string[], separator: ":" | " - ") {
  if (lines.length < 2) return false;
  const parts = lines.map((line) => {
    if (separator === ":") {
      const index = line.indexOf(":");
      if (index <= 0) return null;
      return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
    }
    const match = line.match(/^(.+?)\s-\s(.+)$/);
    return match ? [match[1].trim(), match[2].trim()] : null;
  });
  return parts.every((pair) => pair && pair[0] && pair[1]);
}

export function detectStructuredInput(text: string): StructuredInputDetection {
  const lines = usefulLinesFromText(normalizeTabularAnimalEventsText(text, { preserveSingleLine: true }));
  if (lines.length <= 1) {
    return {
      isStructured: false,
      reason: "single_line_message",
      separator: null,
      usefulLineCount: lines.length
    };
  }

  if (hasConsistentDelimitedRows(lines, ";")) {
    return { isStructured: true, reason: "multiple_lines_consistent_separator", separator: ";", usefulLineCount: lines.length };
  }
  if (hasConsistentDelimitedRows(lines, "|")) {
    return { isStructured: true, reason: "multiple_lines_consistent_separator", separator: "|", usefulLineCount: lines.length };
  }
  if (hasConsistentDelimitedRows(lines, "\t")) {
    return { isStructured: true, reason: "multiple_lines_consistent_separator", separator: "\t", usefulLineCount: lines.length };
  }
  if (hasConsistentDelimitedRows(lines, ",")) {
    return { isStructured: true, reason: "multiple_lines_consistent_separator", separator: ",", usefulLineCount: lines.length };
  }
  if (hasConsistentPairList(lines, ":")) {
    return { isStructured: true, reason: "multiple_lines_consistent_pair_list", separator: ":", usefulLineCount: lines.length };
  }
  if (hasConsistentPairList(lines, " - ")) {
    return { isStructured: true, reason: "multiple_lines_consistent_pair_list", separator: " - ", usefulLineCount: lines.length };
  }

  return {
    isStructured: false,
    reason: "no_consistent_structure",
    separator: null,
    usefulLineCount: lines.length
  };
}

export function looksLikeCollapsedStructuredInput(text: string) {
  const lines = usefulLinesFromText(normalizeTabularAnimalEventsText(text, { preserveSingleLine: true }));
  if (lines.length !== 1) return false;

  const line = lines[0];
  const semicolonCount = (line.match(/;/g) || []).length;
  if (semicolonCount < 6) return false;

  const normalized = normalizeRanchoText(line);
  const hasHeaderTokens = /\b(?:codigo|animal|nome|categoria|sexo|raca|lote|nascimento|peso|status|tipo|evento|data|observacoes|observacao|obs|item|produto|quantidade|unidade|valor)\b/.test(normalized);
  if (!hasHeaderTokens) return false;

  const repeatedCellStarts = (line.match(/(?:^|;)\s*[A-Za-z0-9][A-Za-z0-9\s/-]{0,16}\s*;/g) || []).length;
  const hasDate = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b/.test(line);
  return repeatedCellStarts >= 3 && (hasDate || semicolonCount >= 10);
}

function normalizedStructuredTableText(text: string) {
  const normalizedBase = normalizeTabularAnimalEventsText(text, { preserveSingleLine: true });
  const detection = detectStructuredInput(normalizedBase);
  if (!detection.isStructured || !detection.separator || detection.separator === ";") return normalizedBase;

  const lines = normalizedBase
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (detection.separator === "|" || detection.separator === "\t" || detection.separator === ",") {
    return lines
      .map((line) => splitDelimitedLine(line, detection.separator as "|" | "\t" | ",").map((cell) => cell.trim()).join(";"))
      .join("\n");
  }

  const normalizedLines = lines.map((line) => {
    if (detection.separator === ":") {
      const index = line.indexOf(":");
      const left = index >= 0 ? line.slice(0, index).trim() : line.trim();
      const right = index >= 0 ? line.slice(index + 1).trim() : "";
      return [left, right, "", ""].join(";");
    }

    const match = line.match(/^(.+?)\s-\s(.+)$/);
    const left = match?.[1]?.trim() || line.trim();
    const right = match?.[2]?.trim() || "";
    return [left, right, "", ""].join(";");
  });

  return ["Codigo;Tipo;Data;Observacoes", ...normalizedLines].join("\n");
}

function hasAnyHeader(cells: string[], patterns: RegExp[]) {
  return cells.some((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function headerIndex(cells: string[], patterns: RegExp[]) {
  const index = cells.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
  return index >= 0 ? index : undefined;
}

function stockMovementDefaultFromHeader(cells: string[]) {
  const entryIndex = headerIndex(cells, [
    /^(?:entrada|qtd\s+entrada|qtde\s+entrada|quantidade\s+entrada)$/ ,
    /^(?:comprado|comprada|recebido|recebida)$/
  ]);
  if (entryIndex !== undefined) return { index: entryIndex, movementTypeDefault: "entrada" as const };

  const exitIndex = headerIndex(cells, [
    /^(?:saida|uso|usado|consumo|baixa)$/ ,
    /^(?:qtd\s+saida|qtde\s+saida|quantidade\s+saida)$/ 
  ]);
  if (exitIndex !== undefined) return { index: exitIndex, movementTypeDefault: "saida" as const };

  return { index: undefined, movementTypeDefault: null };
}

function columnMappingFromHeader(header: HeaderMap) {
  const mapping: Record<string, number | string> = {};
  if (header.code !== undefined) mapping.animal_ref = header.code;
  if (header.mother !== undefined) mapping.mae_ref = header.mother;
  if (header.father !== undefined) mapping.pai_ref = header.father;
  if (header.childCode !== undefined) mapping.codigo_cria = header.childCode;
  if (header.childSex !== undefined) mapping.sexo_cria = header.childSex;
  if (header.childName !== undefined) mapping.nome_cria = header.childName;
  if (header.eventType !== undefined) mapping.event_type = header.eventType;
  if (header.date !== undefined) mapping.date = header.date;
  if (header.time !== undefined) mapping.turno = header.time;
  if (header.notes !== undefined) mapping.observations = header.notes;
  if (header.name !== undefined) mapping.name = header.name;
  if (header.category !== undefined) mapping.category = header.category;
  if (header.sex !== undefined) mapping.sex = header.sex;
  if (header.breed !== undefined) mapping.breed = header.breed;
  if (header.lot !== undefined) mapping.lot = header.lot;
  if (header.status !== undefined) mapping.status = header.status;
  if (header.weight !== undefined) mapping.weight = header.weight;
  if (header.birthDate !== undefined) mapping.birth_date = header.birthDate;
  if (header.item !== undefined) mapping.item = header.item;
  if (header.quantity !== undefined) mapping.quantity = header.quantity;
  if (header.unit !== undefined) mapping.unit = header.unit;
  if (header.value !== undefined) mapping.value = header.value;
  if (header.liters !== undefined) mapping.litros = header.liters;
  if (header.movementType !== undefined) mapping.movement_type = header.movementType;
  if (header.movementTypeDefault) mapping.default_movement_type = header.movementTypeDefault;
  return mapping;
}

function buildHeaderMap(headerLine: string): HeaderMap {
  const cells = splitHeaderCells(headerLine);
  const stockMovement = stockMovementDefaultFromHeader(cells);
  const explicitCode = headerIndex(cells, [
    /^(?:codigo|cod|brinco|id|animal\s+id|animal_id)(?:\s+animal)?$/,
    /^(?:codigo|cod)\s+animal$/,
    /^animal\s+ref$/
  ]);
  const genericCode = headerIndex(cells, [/^(?:animal|bicho|vaca|nome)$/]);
  const code = explicitCode ?? genericCode;
  const name = headerIndex(cells, [/^(?:nome|animal|apelido|identificacao|identificacao\s+animal)$/]);
  return {
    code,
    mother: headerIndex(cells, [/^(?:mae|mae\s+ref|mae\s+animal|matriz|vaca\s+mae|codigo\s+mae|cod\s+mae|brinco\s+mae)$/]),
    father: headerIndex(cells, [/^(?:pai|pai\s+ref|touro|reprodutor|codigo\s+pai|cod\s+pai|brinco\s+pai)$/]),
    childCode: headerIndex(cells, [/^(?:codigo\s+cria|cod\s+cria|brinco\s+cria|cria\s+codigo|cria\s+brinco|codigo\s+bezerro|brinco\s+bezerro)$/]),
    childSex: headerIndex(cells, [/^(?:sexo\s+cria|cria\s+sexo|sexo\s+bezerro|sexo\s+bezerra|sexo\s+filho|sexo\s+filha)$/]),
    childName: headerIndex(cells, [/^(?:nome\s+cria|cria\s+nome|nome\s+bezerro|nome\s+bezerra)$/]),
    eventType: headerIndex(cells, [/^(?:status\s+tipo|tipo|evento|ocorrencia)$/]),
    date: headerIndex(cells, [/^data$/, /^data\s+evento$/, /^data\s+parto$/, /^data\s+do\s+parto$/, /^dia$/, /^quando$/, /^ordenha\s+data$/]),
    time: headerIndex(cells, [/^(?:horario|hora|turno|ordenha)$/]),
    notes: headerIndex(cells, [/^(?:observacoes|observacao|obs|nota|notas|motivo|comentario|comentarios)$/]),
    name: name !== code ? name : undefined,
    category: headerIndex(cells, [/^(?:categoria|tipo|classe)$/]),
    sex: headerIndex(cells, [/^(?:sexo|genero)$/]),
    breed: headerIndex(cells, [/^raca$/]),
    lot: headerIndex(cells, [/^(?:lote|piquete|pasto|grupo)$/]),
    status: headerIndex(cells, [/^(?:status|situacao)$/]),
    weight: headerIndex(cells, [/^(?:peso|kg)$/]),
    birthDate: headerIndex(cells, [/^(?:nascimento|data\s+nascimento|data\s+de\s+nascimento|nasc)$/]),
    item: headerIndex(cells, [/^(?:item|produto|insumo|material)$/]),
    quantity: headerIndex(cells, [/^(?:quantidade|qtd|qtde)$/]) ?? stockMovement.index,
    unit: headerIndex(cells, [/^(?:unidade|un|medida)$/]),
    value: headerIndex(cells, [/^(?:valor|preco|preco\s+unitario|valor\s+unitario|valor\s+total|valor_total|custo|total)$/]),
    liters: headerIndex(cells, [/^(?:litro|litros|leite|producao|producao\s+litros|qtd|qtde|quantidade|quantidade\s+litros|volume|total\s+litros)$/]),
    movementType: headerIndex(cells, [/^(?:movimento|tipo\s+movimento|entrada\s+ou\s+saida)$/]),
    movementTypeDefault: stockMovement.movementTypeDefault
  };
}

function headerCellsForDomain(headerLine: string) {
  return headerLine.split(";").map((cell) => cell.trim());
}

function sampleRowsForDomain(lines: ParsedLine[], headerIndex: number, sampleSize = 5) {
  return lines
    .slice(headerIndex + 1)
    .filter((line) => line.text.includes(";"))
    .slice(0, sampleSize)
    .map((line) => line.text.split(";").map((cell) => cell.trim()));
}

function classifyHeaderDomain(headerLine: string, lines?: ParsedLine[], headerIndex = 0, forcedDomain?: KnownTabularTableDomain): StructuredTableDomainClassification {
  return classifyStructuredTableDomain({
    headers: headerCellsForDomain(headerLine),
    sampleRows: lines ? sampleRowsForDomain(lines, headerIndex) : [],
    rowCount: lines ? Math.max(0, lines.length - headerIndex - 1) : undefined,
    allowedDomains: forcedDomain ? [forcedDomain] : undefined
  });
}

function hasBirthChildHeaderShape(header: HeaderMap) {
  return header.mother !== undefined
    && header.date !== undefined
    && (header.childCode !== undefined || header.childSex !== undefined || header.father !== undefined);
}

function tableKindFromDomain(domain: TabularTableDomain): TableKind {
  if (domain === "REBANHO_ANIMAIS") return "animals_import";
  if (domain === "REPRODUCAO") return "animal_events";
  if (domain === "PRODUCAO_LEITE") return "milk_production";
  if (domain === "ESTOQUE") return "stock_import";
  if (["LOTES", "GENEALOGIA", "FINANCEIRO", "FUNCIONARIOS", "PONTO_FUNCIONARIO", "SAUDE_SANITARIO", "OBSERVACOES", "AGENDA_TAREFAS"].includes(domain)) return "domain_preview";
  return null;
}

function detectTableKindFromHeader(headerLine: string): TableKind {
  if (!headerLine.includes(";")) return null;

  const header = buildHeaderMap(headerLine);
  if (hasBirthChildHeaderShape(header)) return "birth_child_events";

  const classified = classifyHeaderDomain(headerLine);
  if (classified.domain === "DESCONHECIDO" && classified.needsUserClarification) {
    return classified.warnings.includes("ambiguous_table_domain") ? "ambiguous" : null;
  }

  return tableKindFromDomain(classified.domain);
}

function hasStockHeaderShape(line: string) {
  if (!line.includes(";")) return false;
  const header = buildHeaderMap(line);
  return header.item !== undefined && header.quantity !== undefined;
}

function tableKindFromStructuredLine(line: string): TableKind {
  return detectTableKindFromHeader(line) || (hasStockHeaderShape(line) ? "stock_import" : null);
}

function looksLikeStructuredHeaderLine(line: string) {
  if (!line.includes(";")) return false;
  const cells = splitHeaderCells(line);
  const headerTokens = cells.filter((cell) => /^(?:codigo|cod|brinco|id|animal|animal id|animal ref|nome|apelido|identificacao|categoria|tipo|classe|sexo|genero|raca|lote|piquete|grupo|pasto|nascimento|data nascimento|peso|kg|status|situacao|fase|estagio|pai|pai ref|mae|mae ref|matriz|touro|reprodutor|filho|cria|bezerro|bezerra|codigo cria|brinco cria|sexo cria|nome cria|evento|status tipo|ocorrencia|procedimento|data|dia|quando|horario|hora|turno|ordenha|observacoes|observacao|obs|nota|item|produto|insumo|material|estoque|quantidade|qtd|qtde|entrada|saida|uso|unidade|un|medida|valor|preco|total|fornecedor|destino|descricao|motivo|historico|forma|pagamento|pessoa|cliente|funcionario|colaborador|cargo|funcao|telefone|celular|whatsapp|salario|admissao|intervalo|pausa|almoco|horas|vacina|medicamento|remedio|dose|sintomas|problema|doenca|responsavel|aplicador|tarefa|titulo|atividade|compromisso|recorrencia)$/ .test(cell));
  return headerTokens.length >= Math.max(2, Math.ceil(cells.length * 0.6));
}

function isConcreteStructuredHeaderLine(line: string) {
  if (!looksLikeStructuredHeaderLine(line)) return false;
  const kind = tableKindFromStructuredLine(line);
  return Boolean(kind && kind !== "ambiguous");
}

function isHeaderLine(line: string) {
  if (!line.includes(";")) return false;
  return looksLikeStructuredHeaderLine(line) && tableKindFromStructuredLine(line) === "animal_events";
}

function mappedCellCount(header: HeaderMap) {
  const indexes = Object.values(header).filter((value) => typeof value === "number") as number[];
  return indexes.length ? Math.max(...indexes) + 1 : 0;
}

function rowCellsForHeader(line: string, header: HeaderMap) {
  const cells = line.split(";").map((cell) => cell.trim());
  const expectedCount = mappedCellCount(header);
  if (header.notes !== undefined && header.notes === expectedCount - 1 && cells.length > expectedCount) {
    const prefix = cells.slice(0, header.notes);
    const notes = cells.slice(header.notes).join(";").trim();
    return [...prefix, notes];
  }
  return cells;
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

  const relative = normalizeRanchoText(text);
  if (["hoje", "ontem", "anteontem", "amanha"].includes(relative)) return relative;

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!validDateParts(day, month, year)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

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
  const kind = normalizeReproductiveEventType(value);
  if (!kind) return null;

  return {
    evento_tipo: kind,
    evento_label: reproductiveEventLabel(kind),
    db_tipo: reproductiveEventDbType(kind)
  };
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
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text) || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(text)) return null;
  const normalized = text.replace(/\s+/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)(?:[a-zA-ZÀ-ÿ]+)?$/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ?number : null;
}

function normalizeProductionTurno(value: string) {
  const normalized = normalizeRanchoText(value);
  if (!normalized) return null;
  if (/\b(?:manha|primeira)\b/.test(normalized)) return "manha" as const;
  if (/\b(?:tarde|segunda)\b/.test(normalized)) return "tarde" as const;
  if (/\b(?:noite|terceira)\b/.test(normalized)) return "noite" as const;
  return null;
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
  const cells = rowCellsForHeader(line, header);
  if (cells.length < 3) return null;
  if (cells.every((cell) => !cell)) return null;

  const itemOriginal = cellAt(cells, header.item ?? 0);
  const quantityOriginal = cellAt(cells, header.quantity);
  const unitOriginal = cellAt(cells, header.unit);
  const typeOriginal = cellAt(cells, header.movementType ?? header.eventType ?? header.status);
  const dateOriginal = cellAt(cells, header.date);
  const valueOriginal = cellAt(cells, header.value);
  const quantity = parsePositiveTableNumber(quantityOriginal);
  const unit = normalizeStockUnit(unitOriginal);
  const movementType = normalizeStockMovementType(typeOriginal) || header.movementTypeDefault || null;
  const parsedDate = dateOriginal ?parseTableDate(dateOriginal) : null;
  const value = parseOptionalMoney(valueOriginal);
  const problemas: string[] = [];

  if (!itemOriginal.trim()) problemas.push("item_ausente");
  if (!quantityOriginal.trim()) problemas.push("quantidade_ausente");
  else if (quantity === null) problemas.push("quantidade_invalida");
  if (!unitOriginal.trim()) problemas.push("unidade_ausente");
  else if (!unit) problemas.push("unidade_invalida");
  if (!typeOriginal.trim() && !header.movementTypeDefault) problemas.push("tipo_movimento_ausente");
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

function parseDataLine(line: string, lineNumber: number, header: HeaderMap): ParsedTabularAnimalEventRow | null {
  const cells = rowCellsForHeader(line, header);
  if (cells.length < 2) return null;
  const animalOriginal = cellAt(cells, header.code ?? 0);
  const statusOriginal = cellAt(cells, header.eventType);
  const dateOriginal = cellAt(cells, header.date);
  const notes = cellAt(cells, header.notes);
  if (!animalOriginal && !statusOriginal && !dateOriginal && !notes) return null;

  const problemas: string[] = [];
  const animalCode = normalizeAnimalTableCode(animalOriginal);
  const eventType = resolveEventType(statusOriginal);
  const parsedDate = parseTableDate(dateOriginal);

  if (!animalCode) problemas.push("animal_sem_codigo");
  if (!eventType) problemas.push("tipo_evento_desconhecido");
  if (!dateOriginal.trim()) problemas.push("data_ausente");
  else if (!parsedDate) problemas.push("data_invalida");

  return {
    lineNumber,
    rawText: line,
    animal_codigo_original: animalOriginal,
    animal_codigo: animalCode,
    status_original: statusOriginal,
    evento_tipo: eventType?.evento_tipo || null,
    evento_label: eventType?.evento_label || null,
    db_tipo: eventType?.db_tipo || null,
    data_original: dateOriginal,
    data_referencia: parsedDate,
    observacoes: notes,
    problemas
  };
}

function parseAnimalImportLine(line: string, lineNumber: number, header: HeaderMap): ParsedTabularAnimalImportRow | null {
  const cells = rowCellsForHeader(line, header);
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

function parseMilkProductionLine(line: string, lineNumber: number, header: HeaderMap): ParsedTabularMilkProductionRow | null {
  const cells = rowCellsForHeader(line, header);
  if (cells.length < 2) return null;
  if (cells.every((cell) => !cell)) return null;

  const animalOriginal = cellAt(cells, header.code ?? 0);
  const litrosOriginal = cellAt(cells, header.liters);
  const dateOriginal = cellAt(cells, header.date);
  const turnoOriginal = cellAt(cells, header.time);
  const notes = cellAt(cells, header.notes);
  const litros = parsePositiveTableNumber(litrosOriginal);
  const parsedDate = dateOriginal ? parseTableDate(dateOriginal) : null;
  const turno = normalizeProductionTurno(turnoOriginal || notes);
  const problemas: string[] = [];
  const animalCode = normalizeAnimalTableCode(animalOriginal);

  if (!animalCode) problemas.push("animal_sem_codigo");
  if (!litrosOriginal.trim()) problemas.push("litros_ausentes");
  else if (litros === null) problemas.push("litros_invalidos");
  if (dateOriginal.trim() && !parsedDate) problemas.push("data_invalida");

  return {
    lineNumber,
    rawText: line,
    animal_codigo_original: animalOriginal,
    animal_codigo: animalCode,
    litros_original: litrosOriginal,
    litros,
    data_original: dateOriginal,
    data_referencia: parsedDate,
    turno_original: turnoOriginal,
    turno,
    observacoes: notes,
    problemas
  };
}

function parseBirthChildLine(line: string, lineNumber: number, header: HeaderMap): ParsedTabularBirthChildRow | null {
  const cells = rowCellsForHeader(line, header);
  if (cells.length < 3) return null;
  if (cells.every((cell) => !cell)) return null;

  const motherOriginal = cellAt(cells, header.mother ?? header.code ?? 0);
  const dateOriginal = cellAt(cells, header.date);
  const childSexOriginal = cellAt(cells, header.childSex);
  const childCodeOriginal = cellAt(cells, header.childCode);
  const childName = cellAt(cells, header.childName) || null;
  const fatherOriginal = cellAt(cells, header.father);
  const notes = cellAt(cells, header.notes);
  const parsedDate = parseTableDate(dateOriginal);
  const childSex = normalizeCalfSex(childSexOriginal) || null;
  const motherRef = normalizeAnimalTableCode(motherOriginal);
  const childCode = normalizeAnimalTableCode(childCodeOriginal);
  const fatherRef = fatherOriginal.trim() ? normalizeAnimalTableCode(fatherOriginal) : null;
  const problemas: string[] = [];

  if (!motherRef) problemas.push("mae_sem_codigo");
  if (!dateOriginal.trim()) problemas.push("data_ausente");
  else if (!parsedDate) problemas.push("data_invalida");
  if (!childSexOriginal.trim()) problemas.push("sexo_cria_ausente");
  else if (!childSex) problemas.push("sexo_cria_invalido");
  if (!childCode) problemas.push("codigo_cria_ausente");

  const childDetails = [
    childSex ? `cria ${childSex}` : "",
    childCode ? `codigo ${childCode}` : "",
    fatherRef ? `pai ${fatherRef}` : "pai nao informado"
  ].filter(Boolean).join(", ");

  return {
    lineNumber,
    rawText: line,
    animal_codigo_original: motherOriginal,
    animal_codigo: motherRef,
    mae_ref_original: motherOriginal,
    mae_ref: motherRef,
    data_parto_original: dateOriginal,
    data_referencia: parsedDate,
    cria_sexo_original: childSexOriginal,
    cria_sexo: childSex,
    cria_codigo_original: childCodeOriginal,
    cria_codigo: childCode,
    cria_nome: childName,
    pai_ref_original: fatherOriginal,
    pai_ref: fatherRef,
    evento_tipo: "parto",
    evento_label: "Parto",
    db_tipo: "parto",
    parto_cria_cadastro: true,
    observacoes: [notes, childDetails].filter(Boolean).join(". "),
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

function productionRowsToBatchRecords(rows: ParsedTabularMilkProductionRow[], routeMeta: ReturnType<typeof structuredRouteMeta>, columnMapping: Record<string, number | string>) {
  return rows
    .filter((row) => row.problemas.length === 0)
    .map((row) => finalize("PRODUCAO_LEITE", {
      animal_codigo: row.animal_codigo,
      litros: row.litros,
      data_referencia: row.data_referencia || "hoje",
      turno: row.turno || undefined,
      observacoes: row.observacoes || undefined,
      column_mapping: columnMapping,
      ...routeMeta
    }, [], 0.95));
}

function splitNotesHeaderAndFirstCode(value: string) {
  const text = value.trim();
  if (!text) return { notesHeader: "Observacoes", firstCode: "" };

  const parts = text.split(/\s+/);
  const firstWord = normalizeRanchoText(parts[0] || "");
  if (/^(?:observacoes|observacao|obs|nota|notas)$/.test(firstWord) && parts.length > 1) {
    return {
      notesHeader: parts[0],
      firstCode: parts.slice(1).join(" ").trim()
    };
  }

  return { notesHeader: text, firstCode: "" };
}

function looksLikeFlatAnimalCode(value: string) {
  const normalized = normalizeAnimalTableCode(value).replace(/\s+/g, " ");
  if (!normalized) return false;
  if (/\b(?:NAO|NÃO|RET|RETESTE|PASSOU|PROTOCOLO|OBS|OBSERVACAO|OBSERVACOES)\b/.test(normalized)) return false;
  return /^(?:[A-Z]{1,6}[- ]?)?\d+[A-Z0-9-]*(?:\s+[A-Z]{1,6})?$/.test(normalized);
}

function splitObservationAndNextCode(value: string) {
  const text = value.trim();
  if (!text) return { observacoes: "", nextCode: "" };
  if (looksLikeFlatAnimalCode(text)) return { observacoes: "", nextCode: text };

  const match = text.match(/^(.*\S)\s+((?:[A-Za-z]{1,6}[- ]?)?\d+[A-Za-z0-9-]*(?:\s+[A-Za-z]{1,6})?)$/);
  const nextCode = match?.[2]?.trim() || "";
  if (nextCode && looksLikeFlatAnimalCode(nextCode)) {
    return {
      observacoes: (match?.[1] || "").trim(),
      nextCode
    };
  }

  return { observacoes: text, nextCode: "" };
}

function isFlatAnimalEventStart(cells: string[], index: number) {
  if (!cells[index]?.trim()) return false;
  if (!resolveEventType(cells[index + 1] || "")) return false;

  const date = (cells[index + 2] || "").trim();
  return !date || Boolean(parseTableDate(date));
}

function unfoldSingleLineAnimalEventsTable(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes("\n") || !trimmed.includes(";")) return text;

  const cells = trimmed.split(";").map((cell) => cell.trim());
  if (cells.length < 6) return text;

  const headerLine = [cells[0], cells[1], cells[2]].join(";");
  if (detectTableKindFromHeader(headerLine) !== "animal_events") return text;

  const { notesHeader, firstCode } = splitNotesHeaderAndFirstCode(cells[3] || "");
  const lines = [[cells[0], cells[1], cells[2], notesHeader || "Observacoes"].join(";")];
  let index = 4;
  let pendingCode = firstCode;

  while (pendingCode || index < cells.length) {
    const code = pendingCode || cells[index++] || "";
    pendingCode = "";
    if (!code.trim() && index >= cells.length) break;

    const status = cells[index++] || "";
    const date = cells[index++] || "";
    let notes = "";

    if (index < cells.length) {
      if (isFlatAnimalEventStart(cells, index)) {
        const split = splitObservationAndNextCode(cells[index] || "");
        notes = split.observacoes;
        pendingCode = split.nextCode;
        index += 1;
      } else {
        notes = cells.slice(index).join(";").trim();
        index = cells.length;
      }
    }

    lines.push([code, status, date, notes].join(";"));
  }

  return lines.length > 1 ? lines.join("\n") : text;
}

export function normalizeTabularAnimalEventsText(text: string, options?: { preserveSingleLine?: boolean }) {
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

  if (!options?.preserveSingleLine && !normalized.includes("\n") && normalized.includes(";")) {
    normalized = unfoldSingleLineAnimalEventsTable(normalized);
  }

  return normalized;
}

function parsedTableLines(text: string): ParsedLine[] {
  return normalizedStructuredTableText(text)
    .split("\n")
    .map((line, index) => ({ text: line.trim(), lineNumber: index + 1 }))
    .filter((line) => line.text);
}

function structuredRouteMeta(text: string) {
  const structuredDetection = detectStructuredInput(text);
  return {
    route: "structured_input",
    structuredDetection,
    interpreter_final_usado: "local_structured_parser"
  };
}

function fieldValue(cells: string[], columnMapping: Record<string, number>, field: string) {
  const index = columnMapping[field];
  return index === undefined ? "" : (cells[index] || "").trim();
}

function isDateLikeField(field: string) {
  return /(?:^data$|data_|_data$|nascimento|parto|admissao)/.test(field);
}

function isNumberLikeField(field: string) {
  return /^(?:litros|quantidade|capacidade|area|peso|valor|valor_total|salario|horas)$/.test(field);
}

function parseGenericFieldValue(field: string, value: string) {
  if (!value.trim()) return null;
  if (isDateLikeField(field)) return parseTableDate(value);
  if (field === "valor" || field === "valor_total" || field === "salario") return parseOptionalMoney(value);
  if (isNumberLikeField(field)) return parsePositiveTableNumber(value);
  return value.trim();
}

function isInvalidParsedGenericValue(field: string, value: string, parsed: unknown) {
  if (!value.trim()) return false;
  return (isDateLikeField(field) || isNumberLikeField(field)) && parsed === null;
}

function genericRowReviewWarnings(domain: TabularTableDomain, values: Record<string, string>) {
  const warnings: string[] = [];
  const normalizedType = normalizeRanchoText(values.tipo || values.tipo_movimento || values.evento || "");

  if (domain === "FINANCEIRO") {
    if (!normalizedType) warnings.push("tipo_financeiro_precisa_confirmacao");
    else if (!/^(?:receita|despesa|entrada|saida)$/.test(normalizedType)) warnings.push("tipo_financeiro_ambiguo");
  }

  if (domain === "REPRODUCAO" && /\bprotocolo\b/.test(normalizedType)) {
    warnings.push("protocolo_precisa_revisao");
  }

  if (domain === "OBSERVACOES" && !values.observacao) {
    warnings.push("observacao_ausente");
  }

  return warnings;
}

function parseGenericDomainLine(
  line: string,
  lineNumber: number,
  classification: StructuredTableDomainClassification,
  domain: TabularTableDomain
): ParsedGenericTabularDomainRow | null {
  const cells = line.split(";").map((cell) => cell.trim());
  if (!cells.length || cells.every((cell) => !cell)) return null;

  const schema = domain !== "DESCONHECIDO" ? TABULAR_DOMAIN_SCHEMAS[domain as KnownTabularTableDomain] : null;
  const values: Record<string, string> = {};
  const parsedValues: Record<string, string | number | null> = {};
  const problemas: string[] = [];

  for (const field of Object.keys(classification.columnMapping)) {
    const raw = fieldValue(cells, classification.columnMapping, field);
    const parsed = parseGenericFieldValue(field, raw);
    values[field] = raw;
    parsedValues[field] = parsed as string | number | null;
    if (isInvalidParsedGenericValue(field, raw, parsed)) problemas.push(`${field}_invalido`);
  }

  for (const field of schema?.requiredFields || []) {
    if (classification.columnMapping[field] === undefined || !values[field]) problemas.push(`${field}_ausente`);
  }

  const avisos = genericRowReviewWarnings(domain, values);
  return {
    lineNumber,
    rawText: line,
    values,
    parsedValues,
    status_linha: problemas.length ? "invalido" : avisos.length ? "revisao" : "pronto",
    problemas: Array.from(new Set(problemas)),
    avisos: Array.from(new Set(avisos))
  };
}

function genericDomainCounts(rows: ParsedGenericTabularDomainRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status_linha] = (counts[row.status_linha] || 0) + 1;
    return counts;
  }, {});
}

function genericDomainMetrics(domain: TabularTableDomain, rows: ParsedGenericTabularDomainRow[]) {
  if (domain === "FINANCEIRO") {
    return rows.reduce((metrics, row) => {
      const type = normalizeRanchoText(row.values.tipo || "");
      const value = Number(row.parsedValues.valor || 0);
      if (["receita", "entrada"].includes(type)) {
        metrics.receitas += value;
        metrics.receitas_linhas += 1;
      } else if (["despesa", "saida"].includes(type)) {
        metrics.despesas += value;
        metrics.despesas_linhas += 1;
      } else {
        metrics.tipo_indefinido += 1;
      }
      return metrics;
    }, { receitas: 0, despesas: 0, receitas_linhas: 0, despesas_linhas: 0, tipo_indefinido: 0 });
  }

  if (domain === "LOTES") {
    return { lotes: rows.length };
  }

  if (domain === "GENEALOGIA") {
    return { vinculos: rows.length };
  }

  if (domain === "FUNCIONARIOS") {
    return { funcionarios: rows.length };
  }

  if (domain === "PONTO_FUNCIONARIO") {
    return { registros_ponto: rows.length };
  }

  if (domain === "SAUDE_SANITARIO") {
    return { eventos_sanitarios: rows.length };
  }

  if (domain === "OBSERVACOES") {
    return { observacoes: rows.length };
  }

  if (domain === "AGENDA_TAREFAS") {
    return { tarefas: rows.length };
  }

  return {};
}

function forcedDomainClassification(headerLine: string, forcedDomain?: KnownTabularTableDomain): StructuredTableDomainClassification | null {
  if (!forcedDomain) return null;
  const schema = TABULAR_DOMAIN_SCHEMAS[forcedDomain];
  return {
    domain: forcedDomain,
    confidence: 0.72,
    intentPerRow: schema.intentPerRow,
    columnMapping: mapColumnsForDomain(headerCellsForDomain(headerLine), schema),
    defaultFields: {},
    needsUserClarification: false,
    clarificationQuestion: null,
    warnings: ["domain_selected_by_user"],
    candidateDomains: [{ domain: forcedDomain, score: 1 }]
  };
}

function parseGenericDomainTable(text: string, lines: ParsedLine[], headerIndex: number, forcedDomain?: KnownTabularTableDomain): ParsedRanchoMessage | null {
  const classification = forcedDomainClassification(lines[headerIndex].text, forcedDomain)
    || classifyHeaderDomain(lines[headerIndex].text, lines, headerIndex);
  const domain = classification.domain;
  const dataLines = lines.slice(headerIndex + 1).filter((line) => line.text.includes(";"));
  if (!dataLines.length) return null;

  const rows = dataLines
    .map((line) => parseGenericDomainLine(line.text, line.lineNumber, classification, domain))
    .filter(Boolean) as ParsedGenericTabularDomainRow[];
  if (!rows.length) return null;

  const readyRows = rows.filter((row) => row.status_linha === "pronto");
  const invalidRows = rows.filter((row) => row.status_linha === "invalido");
  const reviewRows = rows.filter((row) => row.status_linha === "revisao");
  const commonData = {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: domain === "DESCONHECIDO" ? "unknown_structured_table" : `domain_${domain.toLowerCase()}`,
    dominio_tabela: domain,
    classificacao_tabela: classification,
    column_mapping: classification.columnMapping,
    default_fields: classification.defaultFields,
    texto_tabela_original: normalizeTabularAnimalEventsText(text),
    cabecalho: lines[headerIndex].text,
    total_linhas: rows.length,
    total_linhas_parse_validas: readyRows.length,
    total_linhas_parse_invalidas: invalidRows.length,
    total_linhas_needs_review: reviewRows.length,
    linhas: rows,
    linhas_parse_invalidas: invalidRows,
    linhas_revisao: reviewRows,
    resumo_validacao: {
      total: rows.length,
      prontas: readyRows.length,
      invalidas: invalidRows.length,
      revisao: reviewRows.length,
      por_status: genericDomainCounts(rows),
      metricas: genericDomainMetrics(domain, rows)
    }
  };

  if (domain === "DESCONHECIDO" || classification.needsUserClarification) {
    return finalize("IMPORTACAO_TABELA_AMBIGUA", {
      ...commonData,
      tipo_tabela: "unknown_structured_table",
      needsUserClarification: true,
      clarificationQuestion: classification.clarificationQuestion,
      instrucoes_confirmacao: "perguntar_dominio_tabela"
    }, [], 0.68);
  }

  return finalize("IMPORTACAO_TABELA_DOMINIO", {
    ...commonData,
    importacao_tabela_dominio: true,
    tabela_destino: domain,
    instrucoes_confirmacao: "confirmar_preview_tabela_dominio",
    preview_only: true
  }, [], classification.confidence);
}

function parseAnimalEventsTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const header = buildHeaderMap(lines[headerIndex].text);
  const columnMapping = columnMappingFromHeader(header);
  const rows: ParsedTabularAnimalEventRow[] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (isHeaderLine(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseDataLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_EVENTOS_TABELA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "animal_events",
    column_mapping: columnMapping,
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
  const columnMapping = columnMappingFromHeader(header);
  const rows: ParsedTabularAnimalImportRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (isConcreteStructuredHeaderLine(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseAnimalImportLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_ANIMAIS_TABELA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "animals_import",
    column_mapping: columnMapping,
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
    if (isConcreteStructuredHeaderLine(line.text)) return false;
    const cells = line.text.split(";").map((cell) => cell.trim());
    if (cells.length < 2 || cells.length > 3) return false;
    if (!cells[0] || !cells[1]) return false;
    const categorySecond = normalizeAnimalCategory(cells[1]);
    const sexThird = cells[2] ?normalizeAnimalSex(cells[2]) : "nao_informado";
    const categoryThird = cells[2] ?normalizeAnimalCategory(cells[2]) : null;
    return Boolean((categorySecond && sexThird) || (cells.length === 3 && categoryThird && !categorySecond));
  });
  if (candidateLines.length < 2) return null;

  const nameCategoryCount = candidateLines.filter((line) => {
    const cells = line.text.split(";").map((cell) => cell.trim());
    return cells.length === 3 && Boolean(normalizeAnimalCategory(cells[2])) && !normalizeAnimalCategory(cells[1]);
  }).length;
  const categorySexCount = candidateLines.length - nameCategoryCount;
  const header: HeaderMap = nameCategoryCount >= 2 && nameCategoryCount >= categorySexCount
    ? { code: 0, name: 1, category: 2 }
    : { code: 0, category: 1, sex: 2 };
  const columnMapping = columnMappingFromHeader(header);
  const rows = candidateLines
    .map((line) => parseAnimalImportLine(line.text, line.lineNumber, header))
    .filter(Boolean) as ParsedTabularAnimalImportRow[];
  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_ANIMAIS_TABELA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "animals_import",
    column_mapping: columnMapping,
    importacao_tabela_animais: true,
    tabela_destino: "animais",
    cabecalho_inferido: header.name === 1 ? "Codigo;Nome;Categoria" : "Codigo;Categoria;Sexo",
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    contagem_animais_parse: animalImportCounts(rows),
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows,
    instrucoes_confirmacao: "confirmar_para_cadastrar_animais_validos"
  }, [], 0.92);
}

function parseBirthChildEventsTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const header = buildHeaderMap(lines[headerIndex].text);
  const columnMapping = columnMappingFromHeader(header);
  const rows: ParsedTabularBirthChildRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (isConcreteStructuredHeaderLine(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseBirthChildLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_EVENTOS_TABELA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "birth_child_events",
    column_mapping: columnMapping,
    importacao_tabela_eventos: true,
    importacao_parto_cria_tabela: true,
    tabela_destino: "eventos_animal",
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    contagem_eventos_parse: { parto: rows.length },
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows,
    instrucoes_confirmacao: "confirmar_para_importar_partos_com_cria"
  }, [], 0.96);
}

function parseStockImportTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const header = buildHeaderMap(lines[headerIndex].text);
  const columnMapping = columnMappingFromHeader(header);
  const rows: ParsedTabularStockImportRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (isConcreteStructuredHeaderLine(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseStockImportLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);

  return finalize("IMPORTACAO_ESTOQUE_TABELA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "stock_import",
    column_mapping: columnMapping,
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

function parseMilkProductionTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const header = buildHeaderMap(lines[headerIndex].text);
  const columnMapping = columnMappingFromHeader(header);
  const routeMeta = structuredRouteMeta(text);
  const rows: ParsedTabularMilkProductionRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    if (isConcreteStructuredHeaderLine(line.text)) continue;
    if (!line.text.includes(";")) continue;
    const row = parseMilkProductionLine(line.text, line.lineNumber, header);
    if (row) rows.push(row);
  }

  if (!rows.length) return null;

  const validParseRows = rows.filter((row) => row.problemas.length === 0);
  const invalidParseRows = rows.filter((row) => row.problemas.length > 0);
  const registros = productionRowsToBatchRecords(rows, routeMeta, columnMapping);
  const totalLitros = validParseRows.reduce((sum, row) => sum + Number(row.litros || 0), 0);

  return finalize("LOTE_REGISTROS", {
    origem_parser: "tabela_local",
    ...routeMeta,
    tipo_tabela: "milk_production",
    column_mapping: columnMapping,
    total_linhas: rows.length,
    total_linhas_parse_validas: validParseRows.length,
    total_linhas_parse_invalidas: invalidParseRows.length,
    total_litros: totalLitros,
    registros,
    total_registros: registros.length,
    tipos: ["PRODUCAO_LEITE"],
    linhas: rows,
    linhas_parse_invalidas: invalidParseRows
  }, [], 0.95);
}

function parseAmbiguousTable(text: string, lines: ParsedLine[], headerIndex: number): ParsedRanchoMessage | null {
  const dataLines = lines.slice(headerIndex + 1).filter((line) => line.text.includes(";"));
  if (!dataLines.length) return null;
  const classification = classifyHeaderDomain(lines[headerIndex].text, lines, headerIndex);

  return finalize("IMPORTACAO_TABELA_AMBIGUA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "ambiguous_structured_table",
    dominio_tabela: "DESCONHECIDO",
    classificacao_tabela: classification,
    column_mapping: classification.columnMapping,
    texto_tabela_original: normalizeTabularAnimalEventsText(text),
    cabecalho: lines[headerIndex].text,
    total_linhas: dataLines.length,
    needsUserClarification: true,
    clarificationQuestion: classification.clarificationQuestion,
    instrucoes_confirmacao: "perguntar_dominio_tabela"
  }, [], 0.74);
}

function parseUnknownStructuredTable(text: string, lines: ParsedLine[]): ParsedRanchoMessage | null {
  if (!lines.length || !lines[0].text.includes(";")) return null;
  const parsed = parseGenericDomainTable(text, lines, 0);
  if (parsed) return parsed;

  const dataLines = lines.slice(1).filter((line) => line.text.includes(";"));
  if (!dataLines.length) return null;
  const classification = classifyHeaderDomain(lines[0].text, lines, 0);
  return finalize("IMPORTACAO_TABELA_AMBIGUA", {
    origem_parser: "tabela_local",
    ...structuredRouteMeta(text),
    tipo_tabela: "unknown_structured_table",
    dominio_tabela: "DESCONHECIDO",
    classificacao_tabela: classification,
    column_mapping: classification.columnMapping,
    texto_tabela_original: normalizeTabularAnimalEventsText(text),
    cabecalho: lines[0].text,
    total_linhas: dataLines.length,
    total_linhas_parse_validas: 0,
    total_linhas_parse_invalidas: 0,
    total_linhas_needs_review: dataLines.length,
    needsUserClarification: true,
    clarificationQuestion: classification.clarificationQuestion,
    instrucoes_confirmacao: "perguntar_dominio_tabela"
  }, [], 0.68);
}

export function parseTabularAnimalEventsMessage(text: string): ParsedRanchoMessage | null {
  const structuredDetection = detectStructuredInput(text);
  if (!structuredDetection.isStructured) return null;

  const lines = parsedTableLines(text);
  if (lines[0]?.text?.includes(";")) {
    const firstLineClassification = classifyHeaderDomain(lines[0].text, lines, 0);
    if (firstLineClassification.domain === "DESCONHECIDO" && firstLineClassification.needsUserClarification) {
      const headerlessAnimalImport = parseHeaderlessAnimalsImportTable(text, lines);
      return headerlessAnimalImport || parseUnknownStructuredTable(text, lines);
    }
  }

  const headerIndex = lines.findIndex((line) => tableKindFromStructuredLine(line.text));
  if (headerIndex < 0) return parseHeaderlessAnimalsImportTable(text, lines) || parseUnknownStructuredTable(text, lines);

  const kind = tableKindFromStructuredLine(lines[headerIndex].text);
  if (kind === "animal_events") return parseAnimalEventsTable(text, lines, headerIndex);
  if (kind === "animals_import") return parseAnimalsImportTable(text, lines, headerIndex);
  if (kind === "stock_import") return parseStockImportTable(text, lines, headerIndex);
  if (kind === "milk_production") return parseMilkProductionTable(text, lines, headerIndex);
  if (kind === "birth_child_events") return parseBirthChildEventsTable(text, lines, headerIndex);
  if (kind === "domain_preview") return parseGenericDomainTable(text, lines, headerIndex);
  if (kind === "ambiguous") return parseAmbiguousTable(text, lines, headerIndex);
  return null;
}

export function parseTabularAnimalEventsMessageAs(
  text: string,
  kind: "animal_events" | "animals_import" | "stock_import" | "milk_production" | "birth_child_events" | KnownTabularTableDomain
): ParsedRanchoMessage | null {
  const structuredDetection = detectStructuredInput(text);
  if (!structuredDetection.isStructured) return null;

  const lines = parsedTableLines(text);
  const headerIndex = lines.findIndex((line) => tableKindFromStructuredLine(line.text));
  if (headerIndex < 0 && kind === "animals_import") return parseHeaderlessAnimalsImportTable(text, lines);
  const effectiveHeaderIndex = headerIndex >= 0 ? headerIndex : 0;
  if (!lines[effectiveHeaderIndex]?.text?.includes(";")) return null;

  if (kind === "animal_events" || kind === "REPRODUCAO") return parseAnimalEventsTable(text, lines, effectiveHeaderIndex);
  if (kind === "animals_import" || kind === "REBANHO_ANIMAIS") return parseAnimalsImportTable(text, lines, effectiveHeaderIndex);
  if (kind === "birth_child_events") return parseBirthChildEventsTable(text, lines, effectiveHeaderIndex);
  if (kind === "stock_import" || kind === "ESTOQUE") return parseStockImportTable(text, lines, effectiveHeaderIndex);
  if (kind === "milk_production" || kind === "PRODUCAO_LEITE") return parseMilkProductionTable(text, lines, effectiveHeaderIndex);
  return parseGenericDomainTable(text, lines, effectiveHeaderIndex, kind);
}
