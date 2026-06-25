import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatRanchDateISO, getRanchDatetimeLocalInput, getRanchTodayISO } from "@/lib/dates/ranch-time";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string | null | undefined) {
  const parsed = typeof value === "number"
    ? value
    : Number(String(value ?? "0").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  const numeric = Number.isFinite(parsed) ? parsed : 0;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

export function parseLocalDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value);
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toDateOnlyString(value: string | Date | null | undefined = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatRanchDateISO(value || new Date());
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = parseLocalDate(value);
  if (!date) return String(value);
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export function formatDateBRShort(value: string | Date | null | undefined) {
  if (!value) return "-";

  const raw = String(value);
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}`;

  const monthDay = raw.match(/^(\d{2})-(\d{2})$/);
  if (monthDay) return `${monthDay[2]}/${monthDay[1]}`;

  const date = parseLocalDate(value);
  if (!date) return raw;
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatNumber(value: number | string | null | undefined, suffix = "") {
  const numeric = Number(value || 0);
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(numeric)}${suffix}`;
}

export function slug(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function todayISO() { return getRanchTodayISO(); }

export function nowLocalDatetime() {
  return getRanchDatetimeLocalInput();
}

export function currentMonth() {
  return getRanchTodayISO().slice(0, 7);
}
