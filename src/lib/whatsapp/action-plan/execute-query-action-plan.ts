import type { AnyRecord } from "@/lib/types";
import { TABLES } from "@/lib/tables";
import { addRanchDays, getRanchDayRange, getRanchTodayISO } from "@/lib/dates/ranch-time";
import type { QueryActionPlan, FilterPlan, AggregationPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import { validateActionPlan } from "@/lib/whatsapp/gemini/action-plan-validator";
import { getDomainManifest, type DomainFieldDefinition, type DomainManifestEntry } from "@/lib/whatsapp/gemini/domain-manifest";
import type { ParsedRanchoMessage, RanchoIntent } from "@/lib/whatsapp/nlp";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { detectReproductiveEventKind, reproductiveEventLabel } from "@/lib/whatsapp/nlp-core/reproductive-events";
import { finalizeActionPlanParsed } from "@/lib/whatsapp/action-plan/action-plan-to-parsed";

type QueryBuilderLike = AnyRecord;

export type ActionPlanSupabaseLike = {
  from: (tableName: string) => QueryBuilderLike;
};

export type ActionPlanOwnerContext = {
  fazenda_id?: string | null;
  usuario_id?: string | null;
};

export type ExecuteQueryActionPlanInput = {
  plan: QueryActionPlan;
  supabase?: ActionPlanSupabaseLike | null;
  owner: ActionPlanOwnerContext;
  currentDate?: string;
  originalText?: string;
};

export type ExecuteQueryActionPlanResult =
  | {
      ok: true;
      parsed: ParsedRanchoMessage;
      response: string;
      rows: AnyRecord[];
    }
  | {
      ok: false;
      status: "clarify" | "blocked";
      reason: string;
      message: string;
    };

const SAFE_SELECT_FIELDS: Record<string, string[]> = {
  financeiro: ["id", "tipo", "valor", "descricao", "categoria", "data_transacao", "metodo_pagamento", "created_at"],
  producao_leite: ["id", "animal_id", "litros", "ordenhado_em", "turno", "destino", "observacoes", "created_at"],
  reproducao: ["id", "animal_id", "tipo", "data_evento", "descricao", "custo", "created_at"],
  saude_sanitario: ["id", "animal_id", "tipo", "data_evento", "descricao", "medicamento", "dose", "custo", "created_at"],
  animais: ["id", "brinco", "nome", "categoria", "sexo", "fase", "raca", "lote_id", "data_nascimento", "peso", "status", "observacoes"],
  lotes: ["id", "nome", "descricao", "ativo", "created_at"],
  funcionarios: ["id", "nome", "funcao", "cpf", "salario_base", "data_admissao", "contato_whatsapp", "ativo", "created_at"],
  ponto_funcionario: ["id", "funcionario_id", "tipo", "registrado_em", "observacao", "created_at"],
  observacoes: ["id", "animal_id", "tipo", "data_evento", "descricao", "created_at"],
  genealogia: ["id", "brinco", "nome", "pai_id", "mae_id", "data_nascimento", "observacoes"],
  agenda_tarefas: ["id", "titulo", "mensagem", "created_at"]
};

const QUERY_INTENT_BY_DOMAIN: Record<string, RanchoIntent> = {
  financeiro: "CONSULTA_FINANCEIRO",
  producao_leite: "CONSULTA_PRODUCAO",
  reproducao: "CONSULTA_REGISTROS_HOJE",
  saude_sanitario: "CONSULTA_REGISTROS_HOJE",
  estoque: "CONSULTA_ESTOQUE_GERAL",
  animais: "CONSULTA_REBANHO",
  lotes: "CONSULTA_LOTES",
  funcionarios: "CONSULTA_FUNCIONARIO",
  ponto_funcionario: "CONSULTA_PONTO",
  genealogia: "CONSULTA_GENEALOGIA",
  observacoes: "CONSULTA_REGISTROS_HOJE",
  agenda_tarefas: "CONSULTA_REGISTROS_HOJE"
};

function dateOnly(value: Date) {
  return getRanchTodayISO(value);
}

function parseDate(value: unknown) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return getRanchDayRange(text).start;
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) {
    const [day, month, rawYear] = text.split(/[/-]/).map(Number);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return getRanchDayRange(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`).start;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function currentDate(input?: string) {
  const parsed = parseDate(input || "");
  return parsed || getRanchDayRange(getRanchTodayISO()).start;
}

function monthStart(dateISO: string) {
  return `${dateISO.slice(0, 7)}-01`;
}

function addMonths(dateISO: string, months: number) {
  const [year, month] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1, 12));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthIndex(value: unknown) {
  const text = normalizedText(value);
  const months = [
    "janeiro",
    "fevereiro",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro"
  ];
  return months.findIndex((month) => text.includes(month));
}

function normalizedText(value: unknown) {
  return normalizeRanchoText(String(value ?? ""));
}

function isFinanceQueryText(text: unknown) {
  const normalized = normalizedText(text);
  if (!normalized) return false;
  const hasFinanceTopic = /\b(financeiro|financas|financeira|receita|receitas|despesa|despesas|gasto|gastos|gastei|saldo|caixa|resultado|faturamento|vendas?)\b/.test(normalized);
  const hasQueryShape = /\b(como|quanto|qual|quais|relatorio|resumo|consulta|consultar|mostrar|mostra|ver|foi|ficou|mes|semana|ano|hoje|ontem|ultimos?)\b/.test(normalized);
  return hasFinanceTopic && hasQueryShape;
}

function financeQueryDateFilter(text: unknown): FilterPlan {
  const normalized = normalizedText(text);
  const lastDays = normalized.match(/\bultimos?\s+(\d+)\s+dias?\b/);
  if (lastDays) return { field: "data", op: "last_days", value: Number(lastDays[1]) };
  const lastMonths = normalized.match(/\bultimos?\s+(\d+)\s+mes(?:es)?\b/);
  if (lastMonths) return { field: "data", op: "last_months", value: Number(lastMonths[1]) };
  if (/\b(hoje|dia atual)\b/.test(normalized)) return { field: "data", op: "last_days", value: 1 };
  if (/\b(ano|anual)\b/.test(normalized)) return { field: "data", op: "current_year" };
  return { field: "data", op: "current_month" };
}

function financeQueryTypeFilter(text: unknown): FilterPlan | null {
  const normalized = normalizedText(text);
  if (/\b(despesa|despesas|gasto|gastos|gastei|saida|saidas|paguei|pagamento)\b/.test(normalized)) {
    return { field: "tipo", op: "eq", value: "despesa" };
  }
  if (/\b(receita|receitas|entrada|entradas|faturamento|vendas?|recebi)\b/.test(normalized)) {
    return { field: "tipo", op: "eq", value: "receita" };
  }
  return null;
}

function repairedFinanceQueryPlan(originalPlan: QueryActionPlan, originalText?: string): QueryActionPlan | null {
  if (originalPlan.action !== "query" || originalPlan.domain !== "financeiro") return null;
  if (!isFinanceQueryText(originalText || originalPlan.userQuestion || "")) return null;

  const typeFilter = financeQueryTypeFilter(originalText || originalPlan.userQuestion || "");
  return {
    action: "query",
    domain: "financeiro",
    confidence: Math.max(originalPlan.confidence || 0, 0.85),
    filters: [
      ...(typeFilter ? [typeFilter] : []),
      financeQueryDateFilter(originalText || originalPlan.userQuestion || "")
    ],
    aggregations: [{ field: "valor", op: "sum", as: "total" }],
    groupBy: ["tipo"],
    limit: 100,
    requiresConfirmation: false,
    operation: originalPlan.operation,
    userQuestion: originalPlan.userQuestion || originalText || null,
    safety: originalPlan.safety
  };
}

function dateRangeFor(filter: FilterPlan, baseDate: Date) {
  const baseISO = dateOnly(baseDate);
  const end = getRanchDayRange(baseISO).end;

  if (filter.op === "last_days") {
    const startDate = addRanchDays(baseISO, -Math.max(0, Number(filter.value || 1) - 1));
    return { start: getRanchDayRange(startDate).start, end };
  }

  if (filter.op === "last_months") {
    const startDate = addMonths(monthStart(baseISO), -Math.max(0, Number(filter.value || 1) - 1));
    return { start: getRanchDayRange(startDate).start, end };
  }

  if (filter.op === "current_month") {
    const startDate = monthStart(baseISO);
    return { start: getRanchDayRange(startDate).start, end: getRanchDayRange(addMonths(startDate, 1)).start };
  }

  if (filter.op === "current_year") {
    const year = baseISO.slice(0, 4);
    return { start: getRanchDayRange(`${year}-01-01`).start, end: getRanchDayRange(`${Number(year) + 1}-01-01`).start };
  }

  if (filter.op === "since") {
    const month = monthIndex(filter.value);
    const start = month >= 0
      ? getRanchDayRange(`${baseISO.slice(0, 4)}-${String(month + 1).padStart(2, "0")}-01`).start
      : parseDate(filter.value) || getRanchDayRange(`${baseISO.slice(0, 4)}-01-01`).start;
    return { start, end };
  }

  if (filter.op === "between") {
    const raw = filter.value as AnyRecord | unknown[];
    const from = Array.isArray(raw) ? raw[0] : raw?.from;
    const to = Array.isArray(raw) ? raw[1] : raw?.to;
    const start = parseDate(from);
    const rangeEnd = parseDate(to);
    if (start && rangeEnd) return { start, end: getRanchDayRange(dateOnly(rangeEnd)).end };
  }

  return null;
}

function sourceField(domain: DomainManifestEntry, fieldName: string) {
  return domain.fields[fieldName]?.sourceField || fieldName;
}

function queryTable(domain: DomainManifestEntry) {
  if (domain.tableName) return domain.tableName;
  if (domain.domain === "estoque") return TABLES.estoqueMovimentacoes;
  if (domain.domain === "genealogia") return TABLES.animais;
  return null;
}

function normalizeFinanceType(value: unknown) {
  const text = normalizedText(value);
  if (text === "despesa" || text === "saida") return "saida";
  if (text === "receita" || text === "entrada") return "entrada";
  return text;
}

function rowValue(row: AnyRecord, domain: DomainManifestEntry, fieldName: string, relations: AnyRecord) {
  if (fieldName === "animal_ref") {
    if (domain.domain === "genealogia" || domain.domain === "animais") return [row.brinco, row.nome, row.categoria].filter(Boolean).join(" ");
    const animal = relations.animalsById?.get(String(row.animal_id || ""));
    return [animal?.brinco, animal?.nome, animal?.categoria].filter(Boolean).join(" ");
  }
  if (fieldName === "funcionario_ref") {
    const employee = relations.employeesById?.get(String(row.funcionario_id || ""));
    return [employee?.nome, employee?.funcao].filter(Boolean).join(" ");
  }
  const source = sourceField(domain, fieldName);
  if (domain.domain === "financeiro" && fieldName === "tipo") return normalizeFinanceType(row[source]);
  if (domain.domain === "reproducao" && fieldName === "evento") return normalizedText(row[source]);
  return row[source];
}

function compareText(left: unknown, right: unknown) {
  return normalizedText(left) === normalizedText(right);
}

function filterMatches(row: AnyRecord, domain: DomainManifestEntry, filter: FilterPlan, relations: AnyRecord, baseDate: Date) {
  const value = rowValue(row, domain, filter.field, relations);
  const text = normalizedText(value);
  const target = domain.domain === "financeiro" && filter.field === "tipo"
    ? normalizeFinanceType(filter.value)
    : normalizedText(filter.value);

  if (filter.op === "eq") return compareText(value, target);
  if (filter.op === "neq") return !compareText(value, target);
  if (filter.op === "contains") return text.includes(target);

  const definition = domain.fields[filter.field];
  const isDate = definition?.type === "date" || definition?.type === "datetime" || domain.dateFields.includes(filter.field);
  const isNumber = definition?.type === "number";

  if (isDate) {
    const parsed = parseDate(value);
    if (!parsed) return false;
    const range = dateRangeFor(filter, baseDate);
    if (range) return parsed >= range.start && parsed < range.end;
    const filterDate = parseDate(filter.value);
    if (!filterDate) return false;
    if (filter.op === "gte" || filter.op === "since") return parsed >= filterDate;
    if (filter.op === "lte") return parsed <= filterDate;
  }

  if (isNumber) {
    const left = Number(value);
    const right = Number(filter.value);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (filter.op === "gte") return left >= right;
    if (filter.op === "lte") return left <= right;
    if (filter.op === "between" && Array.isArray(filter.value)) {
      return left >= Number(filter.value[0]) && left <= Number(filter.value[1]);
    }
  }

  return true;
}

function fieldNumber(row: AnyRecord, domain: DomainManifestEntry, fieldName: string, relations: AnyRecord) {
  const value = Number(rowValue(row, domain, fieldName, relations));
  return Number.isFinite(value) ? value : 0;
}

function aggregationValue(rows: AnyRecord[], aggregation: AggregationPlan, domain: DomainManifestEntry, relations: AnyRecord) {
  const values = rows.map((row) => fieldNumber(row, domain, aggregation.field, relations));
  if (aggregation.op === "count") return rows.length;
  if (aggregation.op === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (aggregation.op === "avg") return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  if (aggregation.op === "min") return values.length ? Math.min(...values) : 0;
  if (aggregation.op === "max") return values.length ? Math.max(...values) : 0;
  return 0;
}

function monthKey(row: AnyRecord, domain: DomainManifestEntry, plan: QueryActionPlan, relations: AnyRecord) {
  const dateField = plan.filters.find((filter) => domain.dateFields.includes(filter.field))?.field || domain.dateFields[0];
  const parsed = parseDate(rowValue(row, domain, dateField, relations));
  return parsed ? `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}` : "sem_data";
}

function buildAggregations(rows: AnyRecord[], plan: QueryActionPlan, domain: DomainManifestEntry, relations: AnyRecord) {
  const aggregations = plan.aggregations || [];
  const totals = Object.fromEntries(
    aggregations.map((aggregation) => [
      aggregation.as || `${aggregation.op}_${aggregation.field}`,
      aggregationValue(rows, aggregation, domain, relations)
    ])
  );

  if (!plan.groupBy?.includes("month")) return { totals };

  const groups = new Map<string, AnyRecord[]>();
  for (const row of rows) {
    const key = monthKey(row, domain, plan, relations);
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  const byMonth = Object.fromEntries(
    Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([key, groupRows]) => [
      key,
      Object.fromEntries(
        aggregations.map((aggregation) => [
          aggregation.as || `${aggregation.op}_${aggregation.field}`,
          aggregationValue(groupRows, aggregation, domain, relations)
        ])
      )
    ])
  );

  return { totals, byMonth };
}

function money(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function numberText(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function shortDate(value: unknown) {
  const parsed = parseDate(value);
  return parsed ? dateOnly(parsed) : "sem data";
}

function daysSince(value: unknown, baseDate: Date) {
  const parsed = parseDate(value);
  if (!parsed) return null;
  const diff = Math.floor((baseDate.getTime() - parsed.getTime()) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function animalLabel(row?: AnyRecord | null) {
  if (!row) return "Animal";
  const brinco = String(row.brinco || "").trim();
  const nome = String(row.nome || "").trim();
  if (brinco && nome && normalizedText(brinco) !== normalizedText(nome)) return `${nome} (${brinco})`;
  return brinco || nome || String(row.id || "Animal");
}

function animalCategoryFromQueryText(value: unknown) {
  const text = normalizedText(value);
  if (/\b(?:vacas?|vagas?|matrizes?)\b/.test(text)) return "vaca";
  if (/\bbois?\b/.test(text)) return "boi";
  if (/\btouros?\b/.test(text)) return "touro";
  if (/\bbezerras?\b/.test(text)) return "bezerro";
  if (/\bbezerros?\b/.test(text)) return "bezerro";
  if (/\bnovilhas?\b/.test(text)) return "novilha";
  return null;
}

function animalCategoryPlural(category: unknown) {
  const text = normalizedText(category);
  if (text === "vaca") return "vacas";
  if (text === "boi") return "bois";
  if (text === "touro") return "touros";
  if (text === "bezerro") return "bezerros";
  if (text === "novilha") return "novilhas";
  return "animais";
}

function isCollectiveAnimalRef(value: unknown) {
  const text = normalizedText(value);
  return /^(?:vaca|vacas|vaga|vagas|animal|animais|rebanho|gado|boi|bois|touro|touros|bezerro|bezerros|bezerra|bezerras|novilha|novilhas|meus animais|minhas vacas)$/.test(text);
}

function hasSpecificAnimalRefFilter(plan: QueryActionPlan) {
  return plan.filters.some((filter) => filter.field === "animal_ref" && !isCollectiveAnimalRef(filter.value));
}

function normalizeAnimalQueryPlan(plan: QueryActionPlan, originalText?: string): QueryActionPlan {
  if (plan.domain !== "animais") return plan;

  const text = normalizedText([originalText, plan.userQuestion].filter(Boolean).join(" "));
  const collectiveText = /\b(?:dados|lista|listar|relatorio|resumo|rebanho|gado|animais|vacas?|vagas?|bois?|touros?|bezerros?|bezerras?|novilhas?|cadastrados?|cadastradas?)\b/.test(text);
  const cleanedFilters = plan.filters.filter((filter) => !(filter.field === "animal_ref" && isCollectiveAnimalRef(filter.value)));
  const existingCategory = cleanedFilters.find((filter) => filter.field === "categoria")?.value;
  const category = existingCategory || animalCategoryFromQueryText(text || plan.filters.map((filter) => filter.value).join(" "));

  if (collectiveText && category && !cleanedFilters.some((filter) => filter.field === "categoria")) {
    cleanedFilters.push({ field: "categoria", op: "eq", value: category });
  }

  return {
    ...plan,
    filters: cleanedFilters,
    limit: Math.max(plan.limit || 0, collectiveText ? 100 : plan.limit || 20),
    userQuestion: plan.userQuestion || originalText || null
  };
}

function countByText(rows: AnyRecord[], selector: (row: AnyRecord) => unknown) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = String(selector(row) || "sem informação").trim() || "sem informação";
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([label, total]) => `${label}: ${total}`)
    .join(", ");
}

function buildAnimalCollectiveResponse(rows: AnyRecord[], plan: QueryActionPlan) {
  const category = plan.filters.find((filter) => filter.field === "categoria")?.value || animalCategoryFromQueryText(plan.userQuestion);
  const label = animalCategoryPlural(category);
  if (!rows.length) return `Não encontrei ${label} cadastrados no rebanho.`;

  const active = rows.filter((row) => !["morto", "inativo", "vendido"].includes(normalizedText(row.status || "ativo"))).length;
  const categories = countByText(rows, (row) => row.categoria || "sem categoria");
  const statuses = countByText(rows, (row) => row.status || "ativo");
  const sample = rows.slice(0, 8).map((row, index) => {
    const categoryText = row.categoria ? ` - ${row.categoria}` : "";
    const statusText = row.status ? ` - ${row.status}` : "";
    return `${index + 1}. ${animalLabel(row)}${categoryText}${statusText}`;
  });

  return [
    category ? `Dados das ${label}:` : "Resumo do rebanho:",
    `Total encontrado: ${rows.length}.`,
    `Ativos: ${active}.`,
    `Categorias: ${categories || "sem dados"}.`,
    `Status: ${statuses || "sem dados"}.`,
    "",
    "Amostra:",
    ...sample,
    rows.length > sample.length ? `...e mais ${rows.length - sample.length} animal(is).` : ""
  ].filter(Boolean).join("\n");
}

function stockAmount(quantity: unknown, unit: unknown) {
  return `${numberText(Number(quantity || 0))} ${String(unit || "unidade")}`.trim();
}

function queryEventKind(row: AnyRecord) {
  return detectReproductiveEventKind([row.tipo, row.descricao, row.medicamento].filter(Boolean).join(" "))
    || (normalizedText(row.tipo) === "parto" ? "parto" : undefined);
}

function eventTime(row: AnyRecord) {
  const ms = Date.parse(String(row.data_evento || row.created_at || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function latestEventOfKind(events: AnyRecord[], kind: string) {
  return events.find((event) => event.kind === kind) || null;
}

function hasLaterReproductiveOutcome(events: AnyRecord[], reference: AnyRecord | null | undefined, outcomes: string[]) {
  if (!reference) return false;
  const referenceTime = eventTime(reference);
  return events.some((event) => eventTime(event) > referenceTime && outcomes.includes(String(event.kind || "")));
}

function activeReproductionEventForKind(events: AnyRecord[], kind?: string) {
  if (!kind) return null;
  if (kind === "inseminacao") {
    const insemination = latestEventOfKind(events, "inseminacao");
    return insemination && !hasLaterReproductiveOutcome(events, insemination, ["prenhez", "pre_parto", "parto"])
      ? insemination
      : null;
  }
  if (kind === "prenhez") {
    const preBirth = latestEventOfKind(events, "pre_parto");
    if (preBirth && !hasLaterReproductiveOutcome(events, preBirth, ["parto"])) return preBirth;
    const pregnancy = latestEventOfKind(events, "prenhez");
    return pregnancy && !hasLaterReproductiveOutcome(events, pregnancy, ["parto"]) ? pregnancy : null;
  }
  if (kind === "protocolo" || kind === "reteste") return latestEventOfKind(events, kind);
  return latestEventOfKind(events, kind);
}

function targetReproductionKind(plan: QueryActionPlan, originalText?: string) {
  const raw = [
    ...plan.filters.map((filter) => String(filter.value || "")),
    originalText || ""
  ].join(" ");
  const text = normalizedText(raw);
  if (/\b(?:prenhas?|prenhes|prenhe|prenhez|gestantes?|gestacao)\b/.test(text)) return "prenhez";
  if (/\b(?:inseminad[ao]s?|inseminacao|ia|iatf)\b/.test(text)) return "inseminacao";
  if (/\b(?:paridas?|pariram|partos?|pariu|recem parida)\b/.test(text)) return "parto";
  if (/\bprotocolo\b/.test(text) || text.includes("em_protocolo")) return "protocolo";
  if (/\breteste\b/.test(text) || text.includes("em_reteste")) return "reteste";
  return detectReproductiveEventKind(text);
}

function reproductionTitle(kind?: string) {
  if (kind === "prenhez") return "Vacas prenhas";
  if (kind === "inseminacao") return "Vacas inseminadas";
  if (kind === "parto") return "Vacas paridas";
  if (kind === "protocolo") return "Vacas em protocolo";
  if (kind === "reteste") return "Vacas em reteste";
  return "Eventos reprodutivos";
}

function emptyReproductionText(kind?: string) {
  if (kind === "prenhez") return "Não encontrei vacas prenhas registradas no momento.";
  if (kind === "inseminacao") return "Não encontrei vacas inseminadas registradas no momento.";
  if (kind === "parto") return "Não encontrei vacas paridas registradas no momento.";
  if (kind === "protocolo") return "Não encontrei vacas em protocolo registradas no momento.";
  if (kind === "reteste") return "Não encontrei vacas em reteste registradas no momento.";
  return "Não encontrei eventos reprodutivos para esse período.";
}

async function executeReproductionQuery(input: ExecuteQueryActionPlanInput, plan: QueryActionPlan, domain: DomainManifestEntry): Promise<ExecuteQueryActionPlanResult> {
  if (!input.supabase || !input.owner.fazenda_id) {
    return {
      ok: false,
      status: "blocked",
      reason: "missing_query_context",
      message: "Nao posso consultar sem contexto do rancho."
    };
  }

  const baseDate = currentDate(input.currentDate);
  const dateFilter = plan.filters.find((filter) => domain.dateFields.includes(filter.field));
  const range = dateFilter ? dateRangeFor(dateFilter, baseDate) : null;
  const kind = targetReproductionKind(plan, input.originalText);
  const limit = Math.min(plan.limit || domain.maxLimit, domain.maxLimit);

  let query = input.supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,data_evento,descricao,medicamento,custo,created_at")
    .eq("fazenda_id", input.owner.fazenda_id)
    .order("data_evento", { ascending: false })
    .limit(3000);
  if (range) query = query.gte("data_evento", range.start.toISOString()).lt("data_evento", range.end.toISOString());

  const [{ data: eventData, error: eventError }, { data: animalData, error: animalError }] = await Promise.all([
    query,
    input.supabase
      .from(TABLES.animais)
      .select("id,brinco,nome,categoria,sexo,fase,status")
      .eq("fazenda_id", input.owner.fazenda_id)
      .limit(3000)
  ]);
  if (eventError) throw new Error(eventError.message);
  if (animalError) throw new Error(animalError.message);

  const animalsById = new Map(((animalData || []) as AnyRecord[]).map((animal) => [String(animal.id), animal]));
  const allEvents: AnyRecord[] = ((eventData || []) as AnyRecord[])
    .map((event): AnyRecord => ({ ...event, kind: queryEventKind(event) }))
    .filter((event): event is AnyRecord => Boolean(event.kind))
    .sort((left: AnyRecord, right: AnyRecord) => String(right.data_evento || right.created_at || "").localeCompare(String(left.data_evento || left.created_at || "")));

  let rows: AnyRecord[];
  if (kind) {
    const eventsByAnimal = new Map<string, AnyRecord[]>();
    for (const event of allEvents) {
      const animalId = String(event.animal_id || "");
      if (!animalId) continue;
      eventsByAnimal.set(animalId, [...(eventsByAnimal.get(animalId) || []), event]);
    }
    rows = Array.from(eventsByAnimal.values())
      .map((events) => activeReproductionEventForKind(events, kind))
      .filter((event): event is AnyRecord => Boolean(event));
    if (kind === "prenhez") {
      const existing = new Set(rows.map((event) => String(event.animal_id || "")));
      for (const animal of (animalData || []) as AnyRecord[]) {
        if (existing.has(String(animal.id))) continue;
        if (["gestante", "prenhe", "prenha"].includes(normalizedText(animal.fase))) {
          rows.push({ animal_id: animal.id, kind: "prenhez", tipo: "prenhez", data_evento: null, descricao: "Status atual do animal" });
        }
      }
    }
  } else {
    rows = allEvents.filter((event) => !kind || event.kind === kind);
  }

  rows = rows.slice(0, limit);
  const title = reproductionTitle(kind);
  const response = rows.length
    ? [
        `${title}:`,
        ...rows.slice(0, 12).map((row, index) => {
          const animal = animalsById.get(String(row.animal_id || ""));
          const label = reproductiveEventLabel(row.kind).replace("Prenhez", "Prenha");
          const date = row.data_evento ? shortDate(row.data_evento) : "sem data";
          const days = row.data_evento ? daysSince(row.data_evento, baseDate) : null;
          const obs = row.descricao ? ` - ${row.descricao}` : "";
          return `${index + 1}. ${animalLabel(animal)} - ${label} - ${date}${days !== null ? ` (${days} dias)` : ""}${obs}`;
        }),
        rows.length > 12 ? `...e mais ${rows.length - 12} registro(s).` : ""
      ].filter(Boolean).join("\n")
    : emptyReproductionText(kind);

  const parsed = finalizeActionPlanParsed(QUERY_INTENT_BY_DOMAIN[domain.domain] || "CONSULTA_REGISTROS_HOJE", {
    consulta: true,
    action_plan_response: response,
    resultado: { registros: rows.length, tipo_reprodutivo: kind || null }
  }, [], plan.confidence, plan, { interpreterFinal: "action_plan_query" });

  return { ok: true, parsed, response, rows };
}

async function executeStockQuery(input: ExecuteQueryActionPlanInput, plan: QueryActionPlan, domain: DomainManifestEntry): Promise<ExecuteQueryActionPlanResult> {
  if (!input.supabase || !input.owner.fazenda_id) {
    return {
      ok: false,
      status: "blocked",
      reason: "missing_query_context",
      message: "Nao posso consultar sem contexto do rancho."
    };
  }

  const itemFilter = plan.filters.find((filter) => ["item", "nome"].includes(filter.field));
  const movementFilter = plan.filters.some((filter) => ["data", "tipo_movimento", "tipo"].includes(filter.field));
  const itemText = itemFilter ? normalizedText(itemFilter.value) : "";
  const [{ data: itemData, error: itemError }, { data: movementData, error: movementError }] = await Promise.all([
    input.supabase
      .from(TABLES.estoqueItens)
      .select("id,nome,categoria,unidade_medida,quantidade_atual,quantidade_minima,ativo,created_at")
      .eq("fazenda_id", input.owner.fazenda_id)
      .limit(1000),
    input.supabase
      .from(TABLES.estoqueMovimentacoes)
      .select("id,item_id,tipo,quantidade,valor_unitario,motivo,created_at")
      .eq("fazenda_id", input.owner.fazenda_id)
      .order("created_at", { ascending: false })
      .limit(1000)
  ]);
  if (itemError) throw new Error(itemError.message);
  if (movementError) throw new Error(movementError.message);

  const movements = (movementData || []) as AnyRecord[];
  const items = ((itemData || []) as AnyRecord[])
    .filter((item) => item.ativo !== false)
    .filter((item) => !itemText || normalizedText([item.nome, item.categoria].filter(Boolean).join(" ")).includes(itemText));
  const itemById = new Map(items.map((item) => [String(item.id), item]));
  const latestMovementByItem = new Map<string, AnyRecord>();
  for (const movement of movements) {
    const key = String(movement.item_id || "");
    if (key && !latestMovementByItem.has(key)) latestMovementByItem.set(key, movement);
  }

  let rows = items;
  if (movementFilter) {
    const baseDate = currentDate(input.currentDate);
    const filteredMovements = movements.filter((movement) => {
      if (itemText && !itemById.has(String(movement.item_id || ""))) return false;
      return plan.filters.every((filter) => {
        if (["item", "nome"].includes(filter.field)) return true;
        if (filter.field === "tipo_movimento" || filter.field === "tipo") return normalizedText(movement.tipo) === normalizedText(filter.value);
        if (filter.field === "data") {
          const range = dateRangeFor(filter, baseDate);
          const parsed = parseDate(movement.created_at);
          return !range || (parsed ? parsed >= range.start && parsed < range.end : false);
        }
        return true;
      });
    });
    const response = filteredMovements.length
      ? [
          "Movimentações de estoque:",
          ...filteredMovements.slice(0, 12).map((movement, index) => {
            const item = itemById.get(String(movement.item_id || "")) || ((itemData || []) as AnyRecord[]).find((row) => String(row.id) === String(movement.item_id));
            return `${index + 1}. ${shortDate(movement.created_at)} - ${item?.nome || "Item"} - ${movement.tipo || "movimento"} de ${stockAmount(movement.quantidade, item?.unidade_medida)}`;
          })
        ].join("\n")
      : "Não encontrei movimentações de estoque para esse período.";
    const parsed = finalizeActionPlanParsed("CONSULTA_ESTOQUE_GERAL", {
      consulta: true,
      action_plan_response: response,
      resultado: { registros: filteredMovements.length }
    }, [], plan.confidence, plan, { interpreterFinal: "action_plan_query" });
    return { ok: true, parsed, response, rows: filteredMovements };
  }

  rows = rows.slice(0, Math.min(plan.limit || domain.maxLimit, domain.maxLimit));
  const response = rows.length
    ? [
        itemText ? `Estoque de ${rows[0]?.nome || itemFilter?.value}:` : "Estoque atual:",
        ...rows.slice(0, 12).map((item, index) => {
          const latest = latestMovementByItem.get(String(item.id));
          const min = item.quantidade_minima !== undefined && item.quantidade_minima !== null ? `; mínimo ${stockAmount(item.quantidade_minima, item.unidade_medida)}` : "";
          const alert = Number(item.quantidade_minima || 0) > 0 && Number(item.quantidade_atual || 0) <= Number(item.quantidade_minima || 0) ? " Atenção: abaixo do mínimo." : "";
          return `${index + 1}. ${item.nome}: ${stockAmount(item.quantidade_atual, item.unidade_medida)}${min}${latest ? `; última movimentação ${shortDate(latest.created_at)}` : ""}.${alert}`;
        }),
        rows.length > 12 ? `...e mais ${rows.length - 12} item(ns).` : ""
      ].filter(Boolean).join("\n")
    : itemText ? `Não encontrei ${itemFilter?.value || "esse item"} no estoque deste rancho.` : "Não encontrei itens de estoque cadastrados.";
  const parsed = finalizeActionPlanParsed("CONSULTA_ESTOQUE_GERAL", {
    consulta: true,
    action_plan_response: response,
    resultado: { registros: rows.length }
  }, [], plan.confidence, plan, { interpreterFinal: "action_plan_query" });

  return { ok: true, parsed, response, rows };
}

function periodText(plan: QueryActionPlan) {
  const filter = plan.filters.find((item) => ["last_months", "last_days", "current_month", "current_year", "since", "between"].includes(item.op));
  if (!filter) return "";
  if (filter.op === "last_months") return `dos últimos ${filter.value} meses`;
  if (filter.op === "last_days") return `dos últimos ${filter.value} dias`;
  if (filter.op === "current_month") return "do mês atual";
  if (filter.op === "current_year") return "do ano atual";
  if (filter.op === "since") return `desde ${filter.value}`;
  if (filter.op === "between") return "do período informado";
  return "";
}

function buildResponse(domain: DomainManifestEntry, rows: AnyRecord[], metrics: AnyRecord, plan: QueryActionPlan) {
  if (domain.domain === "financeiro") {
    const entradas = rows.filter((row) => normalizeFinanceType(row.tipo) === "entrada").reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const saidas = rows.filter((row) => normalizeFinanceType(row.tipo) === "saida").reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const total = Number(Object.values(metrics.totals || {})[0] || entradas + saidas);
    const period = periodText(plan);
    const aggregateText = plan.aggregations?.length && total !== entradas + saidas ? `Total filtrado: ${money(total)}.` : "";
    const title = plan.filters.some((filter) => filter.op === "contains")
      ? "Resumo financeiro"
      : period ? `Relatório financeiro ${period}` : "Resumo financeiro";
    return [
      `${title}:`,
      `Registros: ${rows.length}.`,
      `Entradas: ${money(entradas)}.`,
      `Saídas: ${money(saidas)}.`,
      `Saldo: ${money(entradas - saidas)}.`,
      aggregateText
    ].filter(Boolean).join("\n");
  }

  if (domain.domain === "producao_leite") {
    const total = Number(metrics.totals?.total_litros || metrics.totals?.sum_litros || 0);
    const average = rows.length ? total / rows.length : 0;
    const animal = plan.filters.find((filter) => filter.field === "animal_ref")?.value;
    return [
      `Produção de leite${animal ? ` da ${animal}` : ""}:`,
      `Registros: ${rows.length}.`,
      `Total: ${numberText(total)} litros.`,
      `Média por registro: ${numberText(average)} litros.`
    ].join("\n");
  }

  if (domain.domain === "animais") {
    const specificAnimal = hasSpecificAnimalRefFilter(plan);
    if (!rows.length) {
      return specificAnimal ? "Não encontrei esse animal no rebanho." : buildAnimalCollectiveResponse(rows, plan);
    }
    if (!specificAnimal || rows.length > 1) return buildAnimalCollectiveResponse(rows, plan);

    const animal = rows[0];
    return [
      `Ficha de ${animalLabel(animal)}:`,
      `Categoria: ${animal.categoria || "sem categoria"}.`,
      `Sexo: ${animal.sexo || "não informado"}.`,
      `Status: ${animal.status || "ativo"}.`,
      `Fase: ${animal.fase || "sem fase"}.`,
      animal.peso ? `Peso: ${numberText(Number(animal.peso))} kg.` : "Peso: sem registro.",
      animal.raca ? `Raça: ${animal.raca}.` : "Raça: sem registro.",
      animal.observacoes ? `Observações: ${animal.observacoes}` : "Observações: sem registros."
    ].join("\n");
  }

  return [
    `Consulta de ${domain.label.toLowerCase()}:`,
    `Registros encontrados: ${rows.length}.`
  ].join("\n");
}

async function loadRelationContext(supabase: ActionPlanSupabaseLike | null | undefined, owner: ActionPlanOwnerContext, plan: QueryActionPlan) {
  const relations: AnyRecord = {};
  if (!supabase || !owner.fazenda_id) return relations;

  if (plan.filters.some((filter) => filter.field === "animal_ref")) {
    const { data } = await supabase
      .from(TABLES.animais)
      .select("id,brinco,nome,categoria")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(1000);
    relations.animalsById = new Map(((data || []) as AnyRecord[]).map((animal) => [String(animal.id), animal]));
  }

  if (plan.filters.some((filter) => filter.field === "funcionario_ref")) {
    const { data } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,funcao")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(1000);
    relations.employeesById = new Map(((data || []) as AnyRecord[]).map((employee) => [String(employee.id), employee]));
  }

  return relations;
}

export async function executeQueryActionPlan(input: ExecuteQueryActionPlanInput): Promise<ExecuteQueryActionPlanResult> {
  let validation = validateActionPlan(input.plan);
  if (!validation.ok) {
    const repairedPlan = repairedFinanceQueryPlan(input.plan, input.originalText);
    if (repairedPlan) validation = validateActionPlan(repairedPlan);
  }

  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status === "blocked" ? "blocked" : "clarify",
      reason: validation.reason,
      message: validation.status === "blocked"
        ? "Nao posso executar esse plano com seguranca."
        : "Preciso revisar essa consulta antes de executar."
    };
  }

  let plan = validation.value as QueryActionPlan;
  if (plan.domain === "animais") {
    plan = normalizeAnimalQueryPlan(plan, input.originalText);
  }
  const domain = getDomainManifest(plan.domain);

  if (domain?.domain === "reproducao") {
    return executeReproductionQuery(input, plan, domain);
  }

  if (domain?.domain === "estoque") {
    return executeStockQuery(input, plan, domain);
  }

  const tableName = domain ? queryTable(domain) : null;
  if (!domain || !tableName || tableName.includes("+")) {
    return {
      ok: false,
      status: "clarify",
      reason: "domain_without_safe_table_mapping",
      message: "Ainda não tenho um mapeamento seguro para consultar esse tipo de informação."
    };
  }

  if (!input.owner.fazenda_id) {
    return {
      ok: false,
      status: "blocked",
      reason: "missing_fazenda_scope",
      message: "Nao posso consultar sem escopo do rancho."
    };
  }

  if (!input.supabase) {
    const parsed = finalizeActionPlanParsed(QUERY_INTENT_BY_DOMAIN[domain.domain] || "DESCONHECIDO", {
      consulta: true,
    }, [], plan.confidence, plan, { interpreterFinal: "action_plan_query_planned" });
    return {
      ok: true,
      parsed,
      response: "Consulta preparada, mas sem contexto de dados para executar agora.",
      rows: []
    };
  }

  const limit = Math.min(plan.limit || domain.maxLimit, domain.maxLimit);
  const fieldDefinitions = Object.values(domain.fields) as DomainFieldDefinition[];
  const selectFields = SAFE_SELECT_FIELDS[domain.domain] || [
    "id",
    ...fieldDefinitions.map((definition) => definition.sourceField).filter(Boolean) as string[]
  ];
  let query = input.supabase
    .from(tableName)
    .select(Array.from(new Set(selectFields)).join(","))
    .eq("fazenda_id", input.owner.fazenda_id)
    .limit(limit);

  const dateField = plan.filters.find((filter) => domain.dateFields.includes(filter.field));
  if (dateField) {
    const range = dateRangeFor(dateField, currentDate(input.currentDate));
    const source = sourceField(domain, dateField.field);
    if (range) query = query.gte(source, dateOnly(range.start)).lt(source, dateOnly(range.end));
  }

  const orderBy = plan.orderBy ? sourceField(domain, plan.orderBy.field) : domain.dateFields[0] ? sourceField(domain, domain.dateFields[0]) : "created_at";
  query = query.order(orderBy, { ascending: plan.orderBy?.direction === "asc" });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const relationContext = await loadRelationContext(input.supabase, input.owner, plan);
  const baseDate = currentDate(input.currentDate);
  const rows = ((data || []) as AnyRecord[])
    .filter((row) => plan.filters.every((filter) => filterMatches(row, domain, filter, relationContext, baseDate)))
    .slice(0, limit);
  const metrics = buildAggregations(rows, plan, domain, relationContext);
  const response = buildResponse(domain, rows, metrics, plan);
  const parsed = finalizeActionPlanParsed(QUERY_INTENT_BY_DOMAIN[domain.domain] || "DESCONHECIDO", {
    consulta: true,
    action_plan_response: response,
    resultado: {
      registros: rows.length,
      metrics,
      filters: plan.filters
    }
  }, [], plan.confidence, plan, { interpreterFinal: "action_plan_query" });

  return { ok: true, parsed, response, rows };
}
