import type { AnyRecord } from "@/lib/types";
import { TABLES } from "@/lib/tables";
import type { QueryActionPlan, FilterPlan, AggregationPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import { validateActionPlan } from "@/lib/whatsapp/gemini/action-plan-validator";
import { getDomainManifest, type DomainFieldDefinition, type DomainManifestEntry } from "@/lib/whatsapp/gemini/domain-manifest";
import { finalize } from "@/lib/whatsapp/nlp-core/result";
import type { ParsedRanchoMessage, RanchoIntent } from "@/lib/whatsapp/nlp";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

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
  return value.toISOString().slice(0, 10);
}

function parseDate(value: unknown) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return new Date(`${text.slice(0, 10)}T12:00:00.000Z`);
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(text)) {
    const [day, month, rawYear] = text.split(/[/-]/).map(Number);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return new Date(Date.UTC(year, month - 1, day, 12));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function currentDate(input?: string) {
  const parsed = parseDate(input || "");
  return parsed || new Date();
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

function dateRangeFor(filter: FilterPlan, baseDate: Date) {
  const end = new Date(baseDate);
  end.setUTCHours(23, 59, 59, 999);

  if (filter.op === "last_days") {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - Math.max(1, Number(filter.value || 1)));
    return { start, end };
  }

  if (filter.op === "last_months") {
    const start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - Math.max(1, Number(filter.value || 1)));
    return { start, end };
  }

  if (filter.op === "current_month") {
    const start = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
    const rangeEnd = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 1));
    return { start, end: rangeEnd };
  }

  if (filter.op === "current_year") {
    const start = new Date(Date.UTC(baseDate.getUTCFullYear(), 0, 1));
    const rangeEnd = new Date(Date.UTC(baseDate.getUTCFullYear() + 1, 0, 1));
    return { start, end: rangeEnd };
  }

  if (filter.op === "since") {
    const month = monthIndex(filter.value);
    const start = month >= 0
      ? new Date(Date.UTC(baseDate.getUTCFullYear(), month, 1))
      : parseDate(filter.value) || new Date(Date.UTC(baseDate.getUTCFullYear(), 0, 1));
    return { start, end };
  }

  if (filter.op === "between") {
    const raw = filter.value as AnyRecord | unknown[];
    const from = Array.isArray(raw) ? raw[0] : raw?.from;
    const to = Array.isArray(raw) ? raw[1] : raw?.to;
    const start = parseDate(from);
    const rangeEnd = parseDate(to);
    if (start && rangeEnd) return { start, end: rangeEnd };
  }

  return null;
}

function sourceField(domain: DomainManifestEntry, fieldName: string) {
  return domain.fields[fieldName]?.sourceField || fieldName;
}

function queryTable(domain: DomainManifestEntry) {
  if (domain.tableName) return domain.tableName;
  if (domain.domain === "estoque") return TABLES.estoqueMovimentacoes;
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

function buildResponse(domain: DomainManifestEntry, rows: AnyRecord[], metrics: AnyRecord, plan: QueryActionPlan) {
  if (domain.domain === "financeiro") {
    const entradas = rows.filter((row) => normalizeFinanceType(row.tipo) === "entrada").reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const saidas = rows.filter((row) => normalizeFinanceType(row.tipo) === "saida").reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const total = Number(Object.values(metrics.totals || {})[0] || entradas + saidas);
    const title = plan.filters.some((filter) => filter.op === "contains") ? "Consulta financeira filtrada" : "Relatorio financeiro";
    return [
      `${title} via ActionPlan.`,
      `Registros: ${rows.length}.`,
      `Entradas: ${money(entradas)}.`,
      `Saidas: ${money(saidas)}.`,
      `Saldo: ${money(entradas - saidas)}.`,
      plan.aggregations?.length ? `Agregado principal: ${money(total)}.` : ""
    ].filter(Boolean).join("\n");
  }

  if (domain.domain === "producao_leite") {
    const total = Number(metrics.totals?.total_litros || metrics.totals?.sum_litros || 0);
    const animal = plan.filters.find((filter) => filter.field === "animal_ref")?.value;
    return [
      `Producao de leite via ActionPlan${animal ? ` para ${animal}` : ""}.`,
      `Registros: ${rows.length}.`,
      `Total: ${numberText(total)} litros.`
    ].join("\n");
  }

  return [
    `Consulta de ${domain.label.toLowerCase()} via ActionPlan.`,
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
  const validation = validateActionPlan(input.plan);
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

  const plan = validation.value as QueryActionPlan;
  const domain = getDomainManifest(plan.domain);
  const tableName = domain ? queryTable(domain) : null;
  if (!domain || !tableName || tableName.includes("+")) {
    return {
      ok: false,
      status: "clarify",
      reason: "domain_without_safe_table_mapping",
      message: "Ainda nao tenho um mapeamento seguro para consultar esse dominio por ActionPlan."
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
    const parsed = finalize(QUERY_INTENT_BY_DOMAIN[domain.domain] || "DESCONHECIDO", {
      consulta: true,
      origem_parser: "gemini_action_plan",
      interpreter_final_usado: "action_plan_query_planned",
      action_plan_used: true,
      action_plan_domain: domain.domain,
      action_plan: plan
    }, [], plan.confidence);
    return {
      ok: true,
      parsed,
      response: "ActionPlan de consulta validado, mas sem contexto de dados para executar agora.",
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
  const parsed = finalize(QUERY_INTENT_BY_DOMAIN[domain.domain] || "DESCONHECIDO", {
    consulta: true,
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "action_plan_query",
    action_plan_used: true,
    action_plan_domain: domain.domain,
    action_plan: plan,
    action_plan_response: response,
    resultado: {
      registros: rows.length,
      metrics,
      filters: plan.filters
    }
  }, [], plan.confidence);

  return { ok: true, parsed, response, rows };
}
