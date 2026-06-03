import { normalizeRanchoText, hasValue } from "@/lib/whatsapp/nlp-text";

export function formatStockUnit(quantity: unknown, unit: string | null | undefined) {
  const normalized = normalizeRanchoText(String(unit || "")).trim();
  const amount = Number(quantity);
  const plural = Number.isFinite(amount) && Math.abs(amount) !== 1;
  const singularByUnit: Record<string, string> = {
    saco: "saco",
    sacos: "saco",
    dose: "dose",
    doses: "dose",
    fardo: "fardo",
    fardos: "fardo",
    unidade: "unidade",
    unidades: "unidade",
    litro: "litro",
    litros: "litro",
    l: "litro",
    kg: "kg",
    quilo: "kg",
    quilos: "kg",
    g: "grama",
    grama: "grama",
    gramas: "grama",
    ml: "mililitro",
    mililitro: "mililitro",
    mililitros: "mililitro",
    caixa: "caixa",
    caixas: "caixa",
    cx: "caixa",
    galao: "galao",
    galoes: "galao",
    frasco: "frasco",
    frascos: "frasco",
    rolo: "rolo",
    rolos: "rolo"
  };
  const pluralByUnit: Record<string, string> = {
    saco: "sacos",
    dose: "doses",
    fardo: "fardos",
    unidade: "unidades",
    litro: "litros",
    caixa: "caixas",
    kg: "kg",
    grama: "gramas",
    mililitro: "mililitros",
    galao: "galoes",
    frasco: "frascos",
    rolo: "rolos"
  };
  const singular = singularByUnit[normalized] || normalized || "";
  return plural ? (pluralByUnit[singular] || singular) : singular;
}

export function formatBotNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || "");
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(numeric);
}

export function formatStockQuantity(quantity: unknown, unit: string | null | undefined, fallback = "?") {
  if (!hasValue(quantity)) return fallback;
  return `${formatBotNumber(quantity)} ${formatStockUnit(quantity, unit)}`.trim();
}

export function moneyText(value: unknown) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}
