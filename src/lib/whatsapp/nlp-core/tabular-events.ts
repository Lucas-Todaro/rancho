import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
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
  db_tipo: "observacao" | "parto" | null;
  data_original: string;
  data_referencia: string | null;
  observacoes: string;
  problemas: string[];
};

type EventTypeResolution = {
  evento_tipo: ParsedTabularAnimalEventRow["evento_tipo"];
  evento_label: string;
  db_tipo: ParsedTabularAnimalEventRow["db_tipo"];
};

function normalizeAnimalTableCode(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function isHeaderLine(line: string) {
  if (!line.includes(";")) return false;
  const normalized = normalizeRanchoText(line);
  return /\b(?:codigo|brinco|animal)\b/.test(normalized)
    && /\b(?:status|tipo|evento)\b/.test(normalized)
    && /\bdata\b/.test(normalized);
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
      db_tipo: "observacao"
    };
  }

  return null;
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

function eventCounts(rows: ParsedTabularAnimalEventRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const key = row.evento_tipo || "desconhecido";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

export function parseTabularAnimalEventsMessage(text: string): ParsedRanchoMessage | null {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line, index) => ({ text: line.trim(), lineNumber: index + 1 }))
    .filter((line) => line.text);

  const headerIndex = lines.findIndex((line) => isHeaderLine(line.text));
  if (headerIndex < 0) return null;

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
