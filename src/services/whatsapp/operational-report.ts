import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { formatStockUnit, normalizeRanchoText, parseRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type OperationalReportKind =
  | "geral"
  | "financeiro"
  | "producao"
  | "estoque"
  | "eventos"
  | "funcionarios"
  | "alertas";

export type OperationalReportMode = "resumo" | "rapido" | "detalhado" | "analise";

export type OperationalReportInput = {
  supabase: SupabaseAdmin;
  owner: WhatsAppOwner;
  period?: string;
  kind?: OperationalReportKind;
  mode?: OperationalReportMode;
  eventType?: string;
};

export type OperationalReportResult = {
  text: string;
  executedAs: string;
  period: string;
  modules: string[];
  counts: Record<string, number>;
  data: AnyRecord;
};

type PeriodRange = {
  start: string;
  end: string;
};

const CONSULT_INTENTS = new Set([
  "CONSULTA_PRODUCAO",
  "CONSULTA_PRODUCAO_HOJE",
  "CONSULTA_PRODUCAO_ANIMAL",
  "CONSULTA_FINANCEIRO",
  "CONSULTA_ESTOQUE",
  "CONSULTA_ESTOQUE_ITEM",
  "CONSULTA_ESTOQUE_GERAL",
  "CONSULTA_FUNCIONARIO",
  "CONSULTA_PONTO",
  "CONSULTA_ANIMAL",
  "CONSULTA_GENEALOGIA",
  "CONSULTA_REBANHO",
  "CONSULTA_LOTES",
  "CONSULTA_REGISTROS_HOJE",
  "AJUDA",
  "DESCONHECIDO"
]);

function isBotAdmin(owner: WhatsAppOwner) {
  return owner.papel_bot === "admin";
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dateFromReference(reference?: string) {
  const date = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(reference || ""))) {
    const parsed = new Date(`${reference}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (reference === "anteontem") date.setDate(date.getDate() - 2);
  if (reference === "ontem") date.setDate(date.getDate() - 1);
  if (reference === "amanha") date.setDate(date.getDate() + 1);
  return date;
}

function dayRange(reference?: string): PeriodRange {
  const date = dateFromReference(reference);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function currentMonthRange(): PeriodRange {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString()
  };
}

function previousMonthRange(): PeriodRange {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(),
    end: new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  };
}

function currentYearRange(): PeriodRange {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), 0, 1).toISOString(),
    end: new Date(now.getFullYear() + 1, 0, 1).toISOString()
  };
}

function monthRange(period: string): PeriodRange {
  const [year, month] = period.split("-").map(Number);
  return {
    start: new Date(year, month - 1, 1).toISOString(),
    end: new Date(year, month, 1).toISOString()
  };
}

function lastDaysRange(days: number): PeriodRange {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function currentWeekRange(): PeriodRange {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function previousWeekRange(): PeriodRange {
  const current = currentWeekRange();
  const end = new Date(current.start);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function normalizeOperationalReportPeriod(period?: string) {
  const value = normalizeRanchoText(period || "hoje").replace(/\s+/g, "_");
  if (["ultimos_30", "ultimos_30_dias", "ultimas_30", "ultimas_30_dias"].includes(value)) return "ultimos_30";
  if (["ultimos_7", "ultimos_7_dias", "ultimas_7", "ultimas_7_dias"].includes(value)) return "ultimos_7";
  if (["semana_passada", "ultima_semana"].includes(value)) return "semana_passada";
  if (["mes_passado", "ultimo_mes"].includes(value)) return "mes_passado";
  if (["ano", "este_ano", "esse_ano", "ano_atual"].includes(value)) return "ano";
  return value || "hoje";
}

export function operationalReportPeriodRange(period?: string): PeriodRange {
  const normalized = normalizeOperationalReportPeriod(period);
  if (normalized === "ultimos_30") return lastDaysRange(30);
  if (normalized === "ultimos_7") return lastDaysRange(7);
  if (normalized === "semana_passada") return previousWeekRange();
  if (normalized === "mes_passado") return previousMonthRange();
  if (normalized === "semana") return currentWeekRange();
  if (normalized === "mes") return currentMonthRange();
  if (normalized === "ano") return currentYearRange();
  if (/^\d{4}-\d{2}$/.test(normalized)) return monthRange(normalized);
  return dayRange(normalized);
}

export function operationalReportPeriodLabel(period?: string) {
  const normalized = normalizeOperationalReportPeriod(period);
  if (normalized === "ultimos_30") return "nos últimos 30 dias";
  if (normalized === "ultimos_7") return "nos últimos 7 dias";
  if (normalized === "semana_passada") return "na semana passada";
  if (normalized === "mes_passado") return "no mês passado";
  if (normalized === "semana") return "esta semana";
  if (normalized === "mes") return "este mês";
  if (normalized === "ano") return "este ano";
  if (/^\d{4}-\d{2}$/.test(normalized)) return `o mês ${normalized}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `o dia ${normalized}`;
  if (normalized === "anteontem") return "anteontem";
  if (normalized === "ontem") return "ontem";
  return "hoje";
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatNumber(value: number | string | null | undefined, suffix = "") {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value || 0))}${suffix}`;
}

function formatStockAmount(quantity: number | string | null | undefined, unit: string | null | undefined) {
  return `${formatNumber(quantity)} ${formatStockUnit(quantity, unit)}`.trim();
}

function rowDate(row: AnyRecord, keys: string[]) {
  for (const key of keys) {
    if (row[key]) return String(row[key]);
  }
  return "";
}

function animalLabel(row?: AnyRecord | null) {
  if (!row) return "Animal";
  return row.brinco && row.nome && row.nome !== row.brinco ? `${row.nome} (${row.brinco})` : row.brinco || row.nome || "Animal";
}

function financeRowType(row: AnyRecord) {
  return String(row.tipo || "").toLowerCase() === "saida" ? "saida" : "entrada";
}

function financeTotals(rows: AnyRecord[]) {
  const entrada = rows.filter((row) => financeRowType(row) === "entrada").reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const saida = rows.filter((row) => financeRowType(row) === "saida").reduce((sum, row) => sum + Number(row.valor || 0), 0);
  return { entrada, saida, resultado: entrada - saida };
}

function topCategories(rows: AnyRecord[], type: "entrada" | "saida") {
  const totals = new Map<string, number>();
  for (const row of rows.filter((item) => financeRowType(item) === type)) {
    const label = String(row.categoria || row.descricao || "sem categoria").trim() || "sem categoria";
    totals.set(label, (totals.get(label) || 0) + Number(row.valor || 0));
  }
  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label, total]) => `${label}: ${formatMoney(total)}`);
}

function eventTypeMatches(row: AnyRecord, requested?: string) {
  if (!requested) return true;
  const text = normalizeRanchoText([row.tipo, row.descricao, row.medicamento].filter(Boolean).join(" "));
  if (requested === "clinico") return /\b(?:doenca|doente|observacao|clinico|clinica|apetite|mastite|problema)\b/.test(text);
  if (requested === "reprodutivo") return /\b(?:cio|prenhez|inseminacao|cobertura|reprodutivo)\b/.test(text);
  return text.includes(requested);
}

function eventLabel(row: AnyRecord) {
  const tipo = normalizeRanchoText(row.tipo || "");
  if (tipo === "vacina") return `Vacina${row.medicamento ? ` ${row.medicamento}` : ""}`;
  if (tipo === "tratamento") return `Tratamento${row.medicamento ? ` ${row.medicamento}` : ""}`;
  if (tipo === "parto") return "Parto registrado";
  if (tipo === "observacao") return "Observação";
  if (tipo === "doenca") return "Ocorrência clínica";
  if (tipo === "cio") return "Cio registrado";
  if (tipo === "inseminacao") return "Inseminação";
  return row.tipo || "Evento";
}

function eventCounts(rows: AnyRecord[]) {
  return {
    vacina: rows.filter((row) => eventTypeMatches(row, "vacina")).length,
    tratamento: rows.filter((row) => eventTypeMatches(row, "tratamento")).length,
    clinico: rows.filter((row) => eventTypeMatches(row, "clinico")).length,
    parto: rows.filter((row) => eventTypeMatches(row, "parto")).length,
    reprodutivo: rows.filter((row) => eventTypeMatches(row, "reprodutivo")).length
  };
}

async function listAnimals(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,nome,categoria,sexo,status,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(3000);
  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

async function listStockItems(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(3000);
  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
}

async function queryProduction(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string, animalsById: Map<string, AnyRecord>) {
  const range = operationalReportPeriodRange(period);
  const { data, error } = await supabase
    .from(TABLES.ordenhas)
    .select("id,animal_id,litros,ordenhado_em")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("ordenhado_em", range.start)
    .lt("ordenhado_em", range.end)
    .limit(3000);
  if (error) throw new Error(error.message);

  const rows = (data || []) as AnyRecord[];
  const total = rows.reduce((sum, row) => sum + Number(row.litros || 0), 0);
  const days = new Set(rows.map((row) => String(row.ordenhado_em || "").slice(0, 10)).filter(Boolean));
  const byAnimal = new Map<string, number>();
  for (const row of rows) {
    const animalId = String(row.animal_id || "");
    byAnimal.set(animalId, (byAnimal.get(animalId) || 0) + Number(row.litros || 0));
  }
  const ranking = Array.from(byAnimal.entries())
    .map(([animalId, litros]) => ({ animal_id: animalId, animal: animalLabel(animalsById.get(animalId)), litros }))
    .sort((left, right) => right.litros - left.litros);

  return {
    rows,
    total,
    count: rows.length,
    days: days.size,
    animals: ranking.length,
    ranking,
    averageByDay: days.size ? total / days.size : 0
  };
}

async function queryFinance(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string) {
  if (!isBotAdmin(owner)) return { rows: [] as AnyRecord[], allowed: false, totals: { entrada: 0, saida: 0, resultado: 0 }, entradaCategorias: [] as string[], saidaCategorias: [] as string[] };
  const range = operationalReportPeriodRange(period);
  const { data, error } = await supabase
    .from(TABLES.transacoesFinanceiras)
    .select("id,tipo,valor,descricao,categoria,data_transacao,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("data_transacao", dateOnly(new Date(range.start)))
    .lt("data_transacao", dateOnly(new Date(range.end)))
    .order("data_transacao", { ascending: false })
    .limit(3000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AnyRecord[];
  return {
    rows,
    allowed: true,
    totals: financeTotals(rows),
    entradaCategorias: topCategories(rows, "entrada"),
    saidaCategorias: topCategories(rows, "saida")
  };
}

async function queryStockMovements(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string, stockById: Map<string, AnyRecord>) {
  const range = operationalReportPeriodRange(period);
  const { data, error } = await supabase
    .from(TABLES.estoqueMovimentacoes)
    .select("id,item_id,tipo,quantidade,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .limit(3000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AnyRecord[];
  const entradas = rows.filter((row) => normalizeRanchoText(row.tipo || "") === "entrada");
  const saidas = rows.filter((row) => ["saida", "baixa"].includes(normalizeRanchoText(row.tipo || "")));
  const itemNames = Array.from(new Set(rows.map((row) => {
    const item = stockById.get(String(row.item_id || ""));
    return String(item?.nome || row.item_nome || "").trim();
  }).filter(Boolean))).slice(0, 5);

  return { rows, entradas, saidas, itemNames };
}

async function queryEvents(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string, eventType?: string) {
  const range = operationalReportPeriodRange(period);
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,descricao,medicamento,data_evento,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("data_evento", range.start)
    .lt("data_evento", range.end)
    .order("data_evento", { ascending: false })
    .limit(3000);
  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => eventTypeMatches(row, eventType));
}

async function queryPoint(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string) {
  if (!isBotAdmin(owner)) return { rows: [] as AnyRecord[], allowed: false, entradas: 0, funcionarios: 0 };
  const range = operationalReportPeriodRange(period);
  const { data, error } = await supabase
    .from(TABLES.registrosPonto)
    .select("funcionario_id,tipo,registrado_em")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("registrado_em", range.start)
    .lt("registrado_em", range.end)
    .limit(3000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AnyRecord[];
  return {
    rows,
    allowed: true,
    entradas: rows.filter((row) => row.tipo === "entrada").length,
    funcionarios: new Set(rows.map((row) => String(row.funcionario_id || "")).filter(Boolean)).size
  };
}

async function queryEmployees(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  if (!isBotAdmin(owner)) return { rows: [] as AnyRecord[], allowed: false, active: 0 };
  const { data, error } = await supabase
    .from(TABLES.funcionarios)
    .select("id,nome,funcao,ativo,deleted_at")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(3000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AnyRecord[];
  return { rows, allowed: true, active: rows.filter((row) => row.ativo !== false && !row.deleted_at).length };
}

async function queryWhatsappRegistrations(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string) {
  const range = operationalReportPeriodRange(period);
  const { data, error } = await supabase
    .from(TABLES.whatsappMensagens)
    .select("payload,telefone_e164,direcao,created_at,processada_em")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("direcao", "entrada")
    .gte("processada_em", range.start)
    .lt("processada_em", range.end)
    .limit(3000);
  if (error) throw new Error(error.message);

  const rows = (data || []) as AnyRecord[];
  const visibleRows = isBotAdmin(owner)
    ? rows
    : rows.filter((row) => String(row.telefone_e164 || "") === owner.telefone_e164);
  const registrations = visibleRows.filter((row) => {
    const body = String(((row.payload || {}) as AnyRecord).body || row.body || "").trim();
    if (!body) return false;
    const parsed = parseRanchoMessage(body);
    return !CONSULT_INTENTS.has(parsed.tipo);
  });

  return { rows: visibleRows, registrations };
}

function buildEventsText(rows: AnyRecord[], animalsById: Map<string, AnyRecord>, period: string, eventType?: string) {
  const label = eventType ? `${eventType} ` : "";
  if (!rows.length) return `Não encontrei eventos ${label}registrados no rebanho ${operationalReportPeriodLabel(period)}.`;
  const lines = rows.slice(0, 8).map((row, index) => {
    const animal = animalLabel(animalsById.get(String(row.animal_id || "")));
    const description = row.descricao ? `: ${row.descricao}` : "";
    return `${index + 1}. ${animal} - ${eventLabel(row)}${description}`;
  });
  const extra = rows.length > 8 ? `\n...e mais ${rows.length - 8} evento(s).` : "";
  return `Eventos ${operationalReportPeriodLabel(period)} no rebanho:\n${lines.join("\n")}${extra}`;
}

function buildAlertsText(input: {
  stockLow: AnyRecord[];
  stockZero: AnyRecord[];
  events: AnyRecord[];
  animalsById: Map<string, AnyRecord>;
  productionCount: number;
  financeResult: number | null;
  period: string;
}) {
  const alerts = [
    ...input.stockLow.map((row) => `${row.nome} abaixo do mínimo`),
    ...input.stockZero.map((row) => `${row.nome} zerado`),
    ...input.events.filter((row) => eventTypeMatches(row, "clinico")).slice(0, 3).map((row) => `${animalLabel(input.animalsById.get(String(row.animal_id || "")))} com ocorrência clínica`),
    !input.productionCount ? "produção ainda não registrada" : "",
    input.financeResult !== null && input.financeResult < 0 ? "resultado financeiro negativo" : ""
  ].filter(Boolean);

  if (!alerts.length) return `Não encontrei alertas críticos ${operationalReportPeriodLabel(input.period)}.`;
  return `Alertas ${operationalReportPeriodLabel(input.period)}:\n${alerts.slice(0, 6).map((line, index) => `${index + 1}. ${line}`).join("\n")}`;
}

function reportConclusion(input: {
  productionTotal: number;
  productionCount: number;
  financeAllowed: boolean;
  financeResult: number;
  stockLow: number;
  stockZero: number;
  eventClinical: number;
  mode: OperationalReportMode;
}) {
  const alerts: string[] = [];
  if (!input.productionCount) alerts.push("não há produção registrada");
  if (input.financeAllowed && input.financeResult < 0) alerts.push("o saldo financeiro ficou negativo");
  if (input.stockLow) alerts.push(`${input.stockLow} item(ns) estão abaixo do mínimo`);
  if (input.stockZero) alerts.push(`${input.stockZero} item(ns) estão zerados`);
  if (input.eventClinical) alerts.push("houve ocorrência clínica no rebanho");

  if (input.mode === "analise") {
    if (!alerts.length && input.productionCount) return "Análise: o rancho foi bem com os dados disponíveis; não encontrei alerta crítico no período.";
    if (alerts.length) return `Análise: o período pede atenção porque ${alerts.slice(0, 3).join(", ")}.`;
    return "Análise: ainda há poucos dados para dizer se o rancho foi bem ou mal.";
  }

  if (!alerts.length && input.productionCount) return "Conclusão: o período parece positivo nos dados disponíveis.";
  if (alerts.length) return `Conclusão: vale olhar ${alerts.slice(0, 2).join(" e ")}.`;
  return "Conclusão: faltam registros operacionais para uma leitura mais firme.";
}

function buildStockSection(stock: AnyRecord[], stockMovements: Awaited<ReturnType<typeof queryStockMovements>>, kind: OperationalReportKind) {
  const low = stock.filter((row) => Number(row.quantidade_minima || 0) > 0 && Number(row.quantidade_atual || 0) < Number(row.quantidade_minima || 0));
  const zero = stock.filter((row) => Number(row.quantidade_atual || 0) <= 0);
  const mainBalances = stock.slice(0, 4).map((row) => `${row.nome}: ${formatStockAmount(row.quantidade_atual, row.unidade_medida)}`);
  const movementText = stockMovements.rows.length
    ? `${stockMovements.rows.length} movimentação(ões): ${stockMovements.entradas.length} entrada(s) e ${stockMovements.saidas.length} saída(s).`
    : "Não houve movimentação de estoque no período.";
  const movedItems = stockMovements.itemNames.length ? ` Itens movimentados: ${stockMovements.itemNames.join(", ")}.` : "";
  const lowText = low.length ? ` Atenção: ${low.slice(0, 4).map((row) => row.nome).join(", ")} abaixo do mínimo.` : "";
  const balanceText = kind === "estoque" && mainBalances.length ? `\nSaldos atuais: ${mainBalances.join("; ")}.` : "";
  return {
    low,
    zero,
    movementCount: stockMovements.rows.length,
    entradas: stockMovements.entradas.length,
    saidas: stockMovements.saidas.length,
    itemNames: stockMovements.itemNames,
    text: `Estoque: ${movementText}${movedItems}${lowText}${balanceText}`
  };
}

function buildGeneralText(input: {
  kind: OperationalReportKind;
  mode: OperationalReportMode;
  period: string;
  animals: AnyRecord[];
  animalsCreated: AnyRecord[];
  production: Awaited<ReturnType<typeof queryProduction>>;
  finance: Awaited<ReturnType<typeof queryFinance>>;
  stock: AnyRecord[];
  stockSection: ReturnType<typeof buildStockSection>;
  events: AnyRecord[];
  employees: Awaited<ReturnType<typeof queryEmployees>>;
  point: Awaited<ReturnType<typeof queryPoint>>;
  whatsapp: Awaited<ReturnType<typeof queryWhatsappRegistrations>>;
}) {
  const periodLabel = operationalReportPeriodLabel(input.period);
  const counts = eventCounts(input.events);
  const top = input.production.ranking[0];
  const financeLine = input.finance.allowed
    ? input.finance.rows.length
      ? `Financeiro: receitas ${formatMoney(input.finance.totals.entrada)}, despesas ${formatMoney(input.finance.totals.saida)}, saldo ${formatMoney(input.finance.totals.resultado)}.${input.finance.entradaCategorias.length || input.finance.saidaCategorias.length ? ` Principais categorias: ${[...input.finance.entradaCategorias, ...input.finance.saidaCategorias].slice(0, 3).join("; ")}.` : ""}`
      : `Financeiro: não encontrei transações ${periodLabel}.`
    : "Financeiro: você não tem permissão para visualizar esses dados.";
  const productionLine = input.production.count
    ? `Produção: ${formatNumber(input.production.total)} litros em ${input.production.count} registro(s), média de ${formatNumber(input.production.averageByDay)} L/dia.${top ? ` Maior produção: ${top.animal} com ${formatNumber(top.litros)} L.` : ""}`
    : `Produção: não encontrei produção registrada ${periodLabel}.`;
  const employeeLine = input.employees.allowed
    ? `Funcionários: ${input.employees.active} ativo(s). Ponto: ${input.point.rows.length} registro(s), ${input.point.funcionarios} funcionário(s) com entrada.`
    : "Funcionários: você não tem permissão para visualizar dados de equipe.";
  const conclusion = reportConclusion({
    productionTotal: input.production.total,
    productionCount: input.production.count,
    financeAllowed: input.finance.allowed,
    financeResult: input.finance.totals.resultado,
    stockLow: input.stockSection.low.length,
    stockZero: input.stockSection.zero.length,
    eventClinical: counts.clinico,
    mode: input.mode
  });

  if (input.kind === "financeiro") return `${input.mode === "analise" ? "Análise financeira" : "Relatório financeiro"} de ${periodLabel}:\n${financeLine}\n${conclusion}`;
  if (input.kind === "producao") return `Relatório de produção de ${periodLabel}:\n${productionLine}\n${conclusion}`;
  if (input.kind === "estoque") return `Relatório de estoque de ${periodLabel}:\n${input.stockSection.text}\n${conclusion}`;
  if (input.kind === "funcionarios") return `Relatório de funcionários de ${periodLabel}:\n${employeeLine}\n${financeLine}\n${conclusion}`;

  const title = input.mode === "rapido" ? `Resumo rápido de ${periodLabel}:` : `Relatório de ${periodLabel}:`;
  const executiveLines = [
    "Resumo:",
    `- Produção: ${input.production.count ? `${formatNumber(input.production.total)} L de leite` : "sem produção registrada"}`,
    `- Financeiro: ${input.finance.allowed ? `saldo ${formatMoney(input.finance.totals.resultado)}` : "restrito"}`,
    `- Estoque: ${input.stockSection.low.length} item(ns) abaixo do mínimo`,
    `- Eventos: ${input.events.length} evento(s)`
  ];
  const financeCategoryLines = input.finance.allowed && (input.finance.entradaCategorias.length || input.finance.saidaCategorias.length)
    ? ["- Principais categorias:", ...[...input.finance.entradaCategorias, ...input.finance.saidaCategorias].slice(0, 3).map((row, index) => `  ${index + 1}. ${row}`)]
    : [];
  const financeLines = input.finance.allowed
    ? input.finance.rows.length
      ? [
          "Financeiro:",
          `- Receitas: ${formatMoney(input.finance.totals.entrada)}`,
          `- Despesas: ${formatMoney(input.finance.totals.saida)}`,
          `- Saldo: ${formatMoney(input.finance.totals.resultado)}`,
          ...financeCategoryLines
        ]
      : ["Financeiro:", `- Não encontrei transações ${periodLabel}.`]
    : ["Financeiro:", "- Você não tem permissão para visualizar esses dados."];
  const productionLines = input.production.count
    ? [
        "Produção:",
        `- Total: ${formatNumber(input.production.total)} litros`,
        `- Registros: ${input.production.count}`,
        `- Média: ${formatNumber(input.production.averageByDay)} L/dia`,
        ...(top ? [`- Maior produção: ${top.animal}, ${formatNumber(top.litros)} L`] : [])
      ]
    : ["Produção:", `- Não encontrei produção registrada ${periodLabel}.`];
  const stockMovementText = input.stockSection.movementCount === 1
    ? "1 movimentação"
    : `${input.stockSection.movementCount} movimentações`;
  const stockLines = [
    "Estoque:",
    `- Movimentações: ${stockMovementText}`,
    `- Entradas: ${input.stockSection.entradas}`,
    `- Saídas: ${input.stockSection.saidas}`,
    ...(input.stockSection.itemNames.length ? [`- Itens movimentados: ${input.stockSection.itemNames.join(", ")}`] : []),
    ...(input.stockSection.low.length ? [`- Atenção: ${input.stockSection.low.slice(0, 4).map((row) => row.nome).join(", ")} abaixo do mínimo`] : [])
  ];
  const activeAnimals = input.animals.filter((row) => row.status !== "morto" && row.status !== "inativo").length;
  const herdLines = [
    "Rebanho:",
    `- Animais cadastrados ${periodLabel}: ${input.animalsCreated.length}`,
    `- Total ativo conhecido: ${activeAnimals}`
  ];
  const eventLines = input.events.length
    ? [
        "Eventos:",
        `- Total: ${input.events.length}`,
        `- Vacinas: ${counts.vacina}`,
        `- Clínicos: ${counts.clinico}`,
        `- Partos: ${counts.parto}`,
        `- Reprodutivos: ${counts.reprodutivo}`
      ]
    : ["Eventos:", `- Não encontrei eventos registrados ${periodLabel}.`];
  const employeeLines = input.employees.allowed
    ? [
        "Funcionários:",
        `- Ativos: ${input.employees.active}`,
        `- Ponto: ${input.point.rows.length} registro(s)`,
        `- WhatsApp: ${input.whatsapp.registrations.length} registro(s) operacionais no período`
      ]
    : ["Funcionários:", "- Você não tem permissão para visualizar dados de equipe."];
  const lines = [
    title,
    "",
    ...executiveLines,
    "",
    ...financeLines,
    "",
    ...productionLines,
    "",
    ...stockLines,
    "",
    ...herdLines,
    "",
    ...eventLines,
    "",
    ...employeeLines,
    "",
    conclusion
  ];

  if (input.mode === "detalhado" && input.events.length) {
    lines.splice(lines.length - 1, 0, "", buildEventsText(input.events.slice(0, 5), new Map(input.animals.map((row) => [String(row.id), row])), input.period));
  }

  return lines.join("\n");
}

export async function buildRanchReport(input: OperationalReportInput): Promise<OperationalReportResult> {
  const kind = input.kind || "geral";
  const mode = input.mode || "resumo";
  const period = normalizeOperationalReportPeriod(input.period);
  const supabase = input.supabase;
  const owner = input.owner;

  const animals = await listAnimals(supabase, owner);
  const animalsById = new Map(animals.map((row) => [String(row.id), row]));
  const stock = await listStockItems(supabase, owner);
  const stockById = new Map(stock.map((row) => [String(row.id), row]));

  const [production, finance, stockMovements, events, employees, point, whatsapp] = await Promise.all([
    queryProduction(supabase, owner, period, animalsById),
    queryFinance(supabase, owner, period),
    queryStockMovements(supabase, owner, period, stockById),
    queryEvents(supabase, owner, period, input.eventType),
    queryEmployees(supabase, owner),
    queryPoint(supabase, owner, period),
    queryWhatsappRegistrations(supabase, owner, period)
  ]);

  const range = operationalReportPeriodRange(period);
  const animalsCreated = animals.filter((row) => {
    const created = rowDate(row, ["created_at"]);
    return created && created >= range.start && created < range.end;
  });
  const stockSection = buildStockSection(stock, stockMovements, kind);

  const modules = [
    "producao",
    finance.allowed ? "financeiro" : "financeiro_restrito",
    "estoque",
    "rebanho",
    "eventos",
    employees.allowed ? "funcionarios" : "funcionarios_restrito",
    "whatsapp"
  ];
  const counts = {
    producao: production.rows.length,
    financeiro: finance.rows.length,
    estoque_movimentacoes: stockMovements.rows.length,
    estoque_itens: stock.length,
    estoque_baixo: stockSection.low.length,
    animais: animals.length,
    animais_cadastrados: animalsCreated.length,
    eventos: events.length,
    funcionarios: employees.rows.length,
    ponto: point.rows.length,
    whatsapp: whatsapp.registrations.length
  };

  console.log("[BOT REPORT]", {
    period,
    kind,
    mode,
    modules,
    counts
  });

  const text = kind === "eventos"
    ? buildEventsText(events, animalsById, period, input.eventType)
    : kind === "alertas"
      ? buildAlertsText({
        stockLow: stockSection.low,
        stockZero: stockSection.zero,
        events,
        animalsById,
        productionCount: production.count,
        financeResult: finance.allowed ? finance.totals.resultado : null,
        period
      })
      : buildGeneralText({
        kind,
        mode,
        period,
        animals,
        animalsCreated,
        production,
        finance,
        stock,
        stockSection,
        events,
        employees,
        point,
        whatsapp
      });

  return {
    text,
    executedAs: kind === "geral" ? "relatorio_operacional" : `relatorio_${kind}`,
    period,
    modules,
    counts,
    data: {
      periodo: period,
      tipo: kind,
      modo: mode,
      ...counts,
      producao_litros: production.total,
      financeiro_entradas: finance.allowed ? finance.totals.entrada : null,
      financeiro_saidas: finance.allowed ? finance.totals.saida : null,
      financeiro_resultado: finance.allowed ? finance.totals.resultado : null
    }
  };
}
