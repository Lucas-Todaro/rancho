import type { AnyRecord } from "@/lib/types";

export type FinancialType = "entrada" | "saida";

const incomeTypes = new Set([
  "entrada",
  "receita",
  "credito",
  "credit",
  "income",
  "in",
  "recebimento",
  "recebido",
  "venda",
  "+"
]);

const expenseTypes = new Set([
  "saida",
  "despesa",
  "debito",
  "debit",
  "expense",
  "out",
  "pagamento",
  "pago",
  "custo",
  "-"
]);

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeFinancialType(value: unknown): FinancialType | null {
  const normalized = normalizeText(value);
  if (incomeTypes.has(normalized)) return "entrada";
  if (expenseTypes.has(normalized)) return "saida";
  return null;
}

function parseFinancialNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function signedFinancialAmount(row: AnyRecord, field = "valor") {
  return parseFinancialNumber(row[field] ?? row.valor_total ?? row.total ?? row.amount ?? 0);
}

export function financialAmount(row: AnyRecord, field = "valor") {
  return Math.abs(signedFinancialAmount(row, field));
}

function inferFinancialType(row: AnyRecord): FinancialType | null {
  const explicit = normalizeFinancialType(row.tipo ?? row.tipo_registro ?? row.natureza ?? row.categoria_tipo);
  if (explicit) return explicit;

  const text = normalizeText(`${row.categoria || ""} ${row.descricao || ""}`);
  if (/\b(receita|entrada|venda|recebimento|recebido|credito)\b/.test(text)) return "entrada";
  if (/\b(despesa|saida|pagamento|pago|custo|compra|debito)\b/.test(text)) return "saida";

  const signed = signedFinancialAmount(row);
  if (signed > 0) return "entrada";
  if (signed < 0) return "saida";
  return null;
}

export function isFinancialIncome(row: AnyRecord) {
  return inferFinancialType(row) === "entrada";
}

export function isFinancialExpense(row: AnyRecord) {
  return inferFinancialType(row) === "saida";
}

export function financialDateValue(row: AnyRecord) {
  return row.data_transacao || row.data || row.data_lancamento || row.created_at || "";
}

export function financialMonthKey(row: AnyRecord) {
  return String(financialDateValue(row)).slice(0, 7);
}
