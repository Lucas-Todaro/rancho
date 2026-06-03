import { formatNumber } from "@/lib/utils";

const unitLabels: Record<string, { singular: string; plural: string }> = {
  kg: { singular: "kg", plural: "kg" },
  quilo: { singular: "kg", plural: "kg" },
  quilos: { singular: "kg", plural: "kg" },
  g: { singular: "grama", plural: "gramas" },
  grama: { singular: "grama", plural: "gramas" },
  gramas: { singular: "grama", plural: "gramas" },
  l: { singular: "litro", plural: "litros" },
  litro: { singular: "litro", plural: "litros" },
  litros: { singular: "litro", plural: "litros" },
  ml: { singular: "mililitro", plural: "mililitros" },
  mililitro: { singular: "mililitro", plural: "mililitros" },
  mililitros: { singular: "mililitro", plural: "mililitros" },
  unidade: { singular: "unidade", plural: "unidades" },
  unidades: { singular: "unidade", plural: "unidades" },
  saco: { singular: "saco", plural: "sacos" },
  sacos: { singular: "saco", plural: "sacos" },
  caixa: { singular: "caixa", plural: "caixas" },
  caixas: { singular: "caixa", plural: "caixas" },
  dose: { singular: "dose", plural: "doses" },
  doses: { singular: "dose", plural: "doses" },
  fardo: { singular: "fardo", plural: "fardos" },
  fardos: { singular: "fardo", plural: "fardos" },
  arroba: { singular: "arroba", plural: "arrobas" },
  arrobas: { singular: "arroba", plural: "arrobas" },
  tonelada: { singular: "tonelada", plural: "toneladas" },
  toneladas: { singular: "tonelada", plural: "toneladas" }
};

function normalizeUnit(unit: unknown) {
  return String(unit || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatStockUnit(quantity: unknown, unit: unknown) {
  const raw = String(unit || "").trim();
  if (!raw) return "";

  const amount = Number(quantity);
  const plural = Number.isFinite(amount) && Math.abs(amount) !== 1;
  const normalized = normalizeUnit(raw);
  const known = unitLabels[normalized];
  if (known) return plural ? known.plural : known.singular;
  if (!plural) return raw;
  return raw.endsWith("s") ? raw : `${raw}s`;
}

export function formatStockQuantity(quantity: unknown, unit: unknown) {
  const value = typeof quantity === "number" || typeof quantity === "string" ? quantity : Number(quantity || 0);
  return `${formatNumber(value)} ${formatStockUnit(quantity, unit)}`.trim();
}
