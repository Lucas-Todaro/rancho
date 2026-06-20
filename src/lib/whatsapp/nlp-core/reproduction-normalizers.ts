import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { normalizeCalfSex } from "./birth-child";
import { normalizeReproductiveEventType } from "./reproductive-events";

export type NormalizedReproductionEvent =
  | "PARTO"
  | "INSEMINACAO"
  | "PRENHEZ"
  | "PRE_PARTO"
  | "CIO"
  | "ABORTO";

const EVENT_BY_KIND: Record<string, NormalizedReproductionEvent> = {
  parto: "PARTO",
  inseminacao: "INSEMINACAO",
  prenhez: "PRENHEZ",
  pre_parto: "PRE_PARTO",
  cio: "CIO",
  aborto: "ABORTO"
};

function validDateParts(year: number, month: number, day: number) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateOnly(value?: string | Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : new Date().toISOString().slice(0, 10);
}

function shiftDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function normalizeReproductionEvent(value: unknown): NormalizedReproductionEvent | undefined {
  const kind = normalizeReproductiveEventType(String(value || ""));
  return kind ? EVENT_BY_KIND[kind] : undefined;
}

export function normalizeDate(value: unknown, currentDate?: string | Date) {
  const text = String(value || "").trim();
  if (!text) return undefined;

  const relative = normalizeRanchoText(text);
  const baseDate = dateOnly(currentDate);
  if (relative === "hoje") return baseDate;
  if (relative === "ontem") return shiftDate(baseDate, -1);
  if (relative === "anteontem") return shiftDate(baseDate, -2);
  if (relative === "amanha") return shiftDate(baseDate, 1);

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!validDateParts(year, month, day)) return undefined;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const shortMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (!shortMatch) return undefined;
  const day = Number(shortMatch[1]);
  const month = Number(shortMatch[2]);
  const rawYear = Number(shortMatch[3]);
  const year = shortMatch[3].length === 2 ? (rawYear >= 70 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  if (!validDateParts(year, month, day)) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeSex(value: unknown) {
  return normalizeCalfSex(value);
}
