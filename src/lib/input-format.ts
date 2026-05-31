import { normalizePhoneNumber } from "@/lib/phone";

export function onlyDigits(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function formatCurrencyForInput(value: string | number | null | undefined) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatCurrencyTyping(value: string) {
  const digits = onlyDigits(value);
  const cents = Number(digits || 0);
  return formatCurrencyForInput(cents / 100);
}

export function parseCurrencyInput(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;

  const normalized = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function stripBrazilCountryCode(value: string | number | null | undefined) {
  const digits = onlyDigits(value);
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits.slice(2);
  return digits;
}

export function normalizeBrazilianWhatsApp(value: string | number | null | undefined) {
  const digits = normalizePhoneNumber(value).slice(0, 13);
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatCPF(value: string | number | null | undefined) {
  const digits = onlyDigits(value).slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function isValidCPF(value: string | number | null | undefined) {
  const cpf = onlyDigits(value);
  if (!cpf) return true;
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, factor: number) => {
    const total = base.split("").reduce((sum, digit) => sum + Number(digit) * factor--, 0);
    const rest = (total * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  const first = calcDigit(cpf.slice(0, 9), 10);
  const second = calcDigit(cpf.slice(0, 10), 11);
  return first === Number(cpf[9]) && second === Number(cpf[10]);
}

export function formatBrazilianPhone(value: string | number | null | undefined) {
  const rawDigits = onlyDigits(value).slice(0, 13);
  const digits = rawDigits.startsWith("55") ? rawDigits.slice(2, 13) : rawDigits.slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 2) return `+55 (${digits}`;
  if (digits.length <= 7) return `+55 (${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `+55 (${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidBrazilianPhone(value: string | number | null | undefined) {
  const digits = normalizeBrazilianWhatsApp(value);
  if (digits.length !== 13 || !digits.startsWith("55")) return false;
  const national = digits.slice(2);
  const ddd = Number(national.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (!national.slice(2).startsWith("9")) return false;
  if (/^(\d)\1+$/.test(national)) return false;
  return true;
}
