export function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}



export function formatNumber(value: number | string | null | undefined, suffix = "") {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value || 0))}${suffix}`;
}

