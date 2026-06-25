export const RANCH_TIMEZONE = "America/Sao_Paulo";

const RANCH_OFFSET = "-03:00";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function datePartsInRanchTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RANCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day"))
  };
}

function dateTimePartsInRanchTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RANCH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    hour12: false
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute"))
  };
}

function normalizeReferenceDate(referenceDate?: string | Date) {
  if (referenceDate instanceof Date) return formatRanchDateISO(referenceDate);
  const text = String(referenceDate || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : getRanchTodayISO();
}

export function getRanchNow(now = new Date()) {
  return new Date(now);
}

export function formatRanchDateISO(date: Date | string | number = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const { year, month, day } = datePartsInRanchTime(safeDate);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function getRanchTodayISO(now = new Date()) {
  return formatRanchDateISO(now);
}

export function getRanchDatetimeLocalInput(now = new Date()) {
  const { year, month, day, hour, minute } = dateTimePartsInRanchTime(now);
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function addRanchDays(dateISO: string, days: number) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return formatRanchDateISO(date);
}

export function parseUserDateToRanchDate(input?: unknown, referenceDate?: string | Date) {
  const text = String(input || "").trim().toLowerCase();
  const reference = normalizeReferenceDate(referenceDate);
  if (!text || text === "hoje" || text === "hj" || text === "agora") return reference;
  if (text === "ontem") return addRanchDays(reference, -1);
  if (text === "anteontem") return addRanchDays(reference, -2);
  if (text === "amanha" || text === "amanhã") return addRanchDays(reference, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
    if (year > 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : formatRanchDateISO(parsed);
  }

  return null;
}

export function resolveDefaultEventDate(inputDate?: unknown, referenceDate?: string | Date) {
  return parseUserDateToRanchDate(inputDate, referenceDate) || normalizeReferenceDate(referenceDate);
}

export function ranchDateToInstant(dateInput?: unknown, time?: string) {
  const date = resolveDefaultEventDate(dateInput);
  const match = String(time || "").trim().match(/^(\d{1,2})(?::(\d{1,2}))?/);
  const hour = match ? Math.min(23, Math.max(0, Number(match[1] || 0))) : 12;
  const minute = match ? Math.min(59, Math.max(0, Number(match[2] || 0))) : 0;
  return new Date(`${date}T${pad(hour)}:${pad(minute)}:00.000${RANCH_OFFSET}`);
}

export function getRanchDayRange(dateInput?: unknown) {
  const date = resolveDefaultEventDate(dateInput);
  const start = new Date(`${date}T00:00:00.000${RANCH_OFFSET}`);
  const end = new Date(`${addRanchDays(date, 1)}T00:00:00.000${RANCH_OFFSET}`);
  return { date, start, end };
}
