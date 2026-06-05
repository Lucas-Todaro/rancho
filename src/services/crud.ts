"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import { mockData } from "@/lib/mock-data";
import { getFriendlyErrorMessage, logTechnicalError } from "@/lib/errors";
import { CREATED_BY_FIELDS, FARM_SCOPED_TABLES, TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext, ModuleField, RelationOption } from "@/lib/types";

type ListOptions = DataContext & {
  orderBy?: string;
  ascending?: boolean;
  select?: string;
  limit?: number;
  offset?: number;
  filters?: Array<{
    column: string;
    value: string | number | boolean | null | undefined;
    operator?: "eq" | "gte" | "lte" | "gt" | "lt";
  }>;
  cache?: boolean;
  cacheTtlMs?: number;
  forceRefresh?: boolean;
};

const MODULE_CACHE_TTL_MS = 60 * 1000;

type RecordCacheEntry = {
  rows: AnyRecord[];
  expiresAt: number;
};

const recordCache = new Map<string, RecordCacheEntry>();

function normalizedFilters(filters: ListOptions["filters"] = []) {
  return filters
    .filter((filter) => filter.value !== undefined)
    .map((filter) => ({
      column: filter.column,
      operator: filter.operator || "eq",
      value: filter.value
    }))
    .sort((left, right) => `${left.column}:${left.operator}`.localeCompare(`${right.column}:${right.operator}`));
}

function recordCacheKey(tableName: string, options: ListOptions) {
  return [
    tableName,
    `farm:${options.fazendaId || ""}`,
    `user:${options.usuarioId || ""}`,
    `order:${options.orderBy || "created_at"}`,
    `asc:${options.ascending === true}`,
    `select:${options.select || "*"}`,
    `limit:${options.limit || ""}`,
    `offset:${options.offset || ""}`,
    `filters:${JSON.stringify(normalizedFilters(options.filters))}`
  ].join("|");
}

function readRecordCache(key: string) {
  const entry = recordCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    recordCache.delete(key);
    return null;
  }
  return entry.rows;
}

function writeRecordCache(key: string, rows: AnyRecord[], ttlMs?: number) {
  recordCache.set(key, {
    rows,
    expiresAt: Date.now() + (ttlMs || MODULE_CACHE_TTL_MS)
  });
}

export function invalidateRecordsCache(tableName?: string, context?: DataContext) {
  const farmNeedle = context?.fazendaId ? `|farm:${context.fazendaId}|` : "";
  for (const key of Array.from(recordCache.keys())) {
    if (tableName && !key.startsWith(`${tableName}|`)) continue;
    if (farmNeedle && !key.includes(farmNeedle)) continue;
    recordCache.delete(key);
  }
}

export function clearRecordsCache() {
  recordCache.clear();
}

function withId(tableName: string, record: AnyRecord, context?: DataContext): AnyRecord {
  return {
    id: record.id || crypto.randomUUID(),
    created_at: record.created_at || new Date().toISOString(),
    ...(context?.fazendaId && FARM_SCOPED_TABLES.has(tableName) ? { fazenda_id: context.fazendaId } : {}),
    ...record
  };
}

function normalizePayload(values: AnyRecord) {
  return Object.entries(values).reduce<AnyRecord>((acc, [key, value]) => {
    if (value === "") {
      acc[key] = null;
      return acc;
    }

    acc[key] = value;
    return acc;
  }, {});
}

function preparePayload(tableName: string, values: AnyRecord, context?: DataContext) {
  const payload = normalizePayload(values);

  if (FARM_SCOPED_TABLES.has(tableName) && context?.fazendaId && !payload.fazenda_id) {
    payload.fazenda_id = context.fazendaId;
  }

  const userField = CREATED_BY_FIELDS[tableName];
  if (userField && context?.usuarioId && !payload[userField]) {
    payload[userField] = context.usuarioId;
  }

  if (tableName === TABLES.ordenhas && !payload.origem) payload.origem = "web";
  if (tableName === TABLES.registrosPonto && !payload.origem) payload.origem = "web";
  if (tableName === TABLES.transacoesFinanceiras && !payload.origem) payload.origem = "web";
  if (tableName === TABLES.estoqueMovimentacoes && !payload.origem) payload.origem = "web";

  return payload;
}

function canRetryWithoutAnimalOptionalFields(tableName: string, payload: AnyRecord, error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
  return tableName === TABLES.animais && "sexo" in payload && /sexo|schema cache|column/i.test(message);
}

function withoutAnimalOptionalFields(payload: AnyRecord) {
  const nextPayload = { ...payload };
  delete nextPayload.sexo;
  return nextPayload;
}

function secondaryOrderBy(tableName: string, orderBy: string) {
  return tableName === TABLES.transacoesFinanceiras && orderBy === "data_transacao" ? "created_at" : null;
}

function compareValues(left: unknown, right: unknown, ascending: boolean) {
  if (left === right) return 0;
  return (String(left ?? "") > String(right ?? "") ? 1 : -1) * (ascending ? 1 : -1);
}

function sortLocal(rows: AnyRecord[], tableName: string, orderBy = "created_at", ascending = false) {
  const secondary = secondaryOrderBy(tableName, orderBy);
  return [...rows].sort((a, b) => {
    const primary = compareValues(a[orderBy], b[orderBy], ascending);
    if (primary || !secondary) return primary;
    return compareValues(a[secondary], b[secondary], ascending);
  });
}

function paginateLocal(rows: AnyRecord[], options: ListOptions) {
  if (!options.limit || options.limit <= 0) return rows;
  const start = Math.max(0, options.offset || 0);
  return rows.slice(start, start + options.limit);
}

function shouldScopeByFarm(tableName: string, context?: DataContext) {
  return Boolean(context?.fazendaId && FARM_SCOPED_TABLES.has(tableName));
}

function matchesFarmScope(tableName: string, row: AnyRecord, context?: DataContext) {
  return !shouldScopeByFarm(tableName, context) || row.fazenda_id === context?.fazendaId;
}

function filterLocalRows(tableName: string, rows: AnyRecord[], options: ListOptions) {
  const scoped = options.fazendaId && FARM_SCOPED_TABLES.has(tableName)
    ? rows.filter((row) => row.fazenda_id === options.fazendaId)
    : rows;

  return (options.filters || []).reduce((current, filter) => {
    if (filter.value === undefined) return current;
    const operator = filter.operator || "eq";
    if (filter.value === null) return current.filter((row) => row[filter.column] == null);
    if (operator === "gte") return current.filter((row) => String(row[filter.column] ?? "") >= String(filter.value));
    if (operator === "lte") return current.filter((row) => String(row[filter.column] ?? "") <= String(filter.value));
    if (operator === "gt") return current.filter((row) => String(row[filter.column] ?? "") > String(filter.value));
    if (operator === "lt") return current.filter((row) => String(row[filter.column] ?? "") < String(filter.value));
    return current.filter((row) => String(row[filter.column]) === String(filter.value));
  }, scoped);
}

export async function listRecords(tableName: string, options: ListOptions = {}): Promise<AnyRecord[]> {
  const { orderBy = "created_at", ascending = false, fazendaId, select = "*", filters = [] } = options;
  const cacheKey = options.cache ? recordCacheKey(tableName, { ...options, orderBy, ascending, select, filters }) : "";
  if (cacheKey && !options.forceRefresh) {
    const cachedRows = readRecordCache(cacheKey);
    if (cachedRows) return cachedRows;
  }

  if (!supabaseBrowser) {
    const rows = mockData[tableName] || [];
    const scoped = filterLocalRows(tableName, rows, options);
    const sorted = sortLocal(scoped, tableName, orderBy, ascending);
    const paginated = paginateLocal(sorted, options);
    if (cacheKey) writeRecordCache(cacheKey, paginated, options.cacheTtlMs);
    return paginated;
  }

  const secondary = secondaryOrderBy(tableName, orderBy);
  let query = supabaseBrowser
    .from(tableName)
    .select(select)
    .order(orderBy, { ascending });
  if (secondary) query = query.order(secondary, { ascending });

  if (fazendaId && FARM_SCOPED_TABLES.has(tableName)) {
    query = query.eq("fazenda_id", fazendaId);
  }

  filters.forEach((filter) => {
    if (filter.value === undefined) return;
    const operator = filter.operator || "eq";
    if (filter.value === null) {
      query = query.is(filter.column, null);
      return;
    }
    if (operator === "gte") query = query.gte(filter.column, filter.value);
    else if (operator === "lte") query = query.lte(filter.column, filter.value);
    else if (operator === "gt") query = query.gt(filter.column, filter.value);
    else if (operator === "lt") query = query.lt(filter.column, filter.value);
    else query = query.eq(filter.column, filter.value);
  });

  if (options.limit && options.limit > 0) {
    const offset = Math.max(0, options.offset || 0);
    query = options.offset !== undefined
      ? query.range(offset, offset + options.limit - 1)
      : query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[Rancho] Falha ao ler ${tableName}. Usando dados locais.`);
    }
    const rows = mockData[tableName] || [];
    const fallbackRows = paginateLocal(sortLocal(filterLocalRows(tableName, rows, options), tableName, orderBy, ascending), options);
    if (cacheKey) writeRecordCache(cacheKey, fallbackRows, options.cacheTtlMs);
    return fallbackRows;
  }

  const rows = (data || []) as AnyRecord[];
  if (cacheKey) writeRecordCache(cacheKey, rows, options.cacheTtlMs);
  return rows;
}

export async function createRecord(tableName: string, values: AnyRecord, context?: DataContext) {
  const payload = preparePayload(tableName, values, context);

  if (!supabaseBrowser) {
    const localPayload = withId(tableName, payload, context);
    mockData[tableName] = [localPayload, ...(mockData[tableName] || [])];
    invalidateRecordsCache(tableName, context);
    return localPayload;
  }

  const { data, error } = await supabaseBrowser
    .from(tableName)
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    if (canRetryWithoutAnimalOptionalFields(tableName, payload, error)) {
      const { data: fallbackData, error: fallbackError } = await supabaseBrowser
        .from(tableName)
        .insert(withoutAnimalOptionalFields(payload))
        .select("*")
        .single();

      if (!fallbackError) {
        invalidateRecordsCache(tableName, context);
        return fallbackData;
      }
    }

    logTechnicalError(`Falha ao criar registro em ${tableName}`, error);
    throw new Error(getFriendlyErrorMessage(error, "Não foi possível salvar o registro agora."));
  }
  invalidateRecordsCache(tableName, context);
  return data;
}

export async function updateRecord(tableName: string, id: string, values: AnyRecord, context?: DataContext) {
  const payload = normalizePayload(values);

  if (!supabaseBrowser) {
    mockData[tableName] = (mockData[tableName] || []).map((item) => (
      item.id === id && matchesFarmScope(tableName, item, context) ? { ...item, ...payload } : item
    ));
    invalidateRecordsCache(tableName, context);
    return mockData[tableName].find((item) => item.id === id && matchesFarmScope(tableName, item, context));
  }

  let query = supabaseBrowser
    .from(tableName)
    .update(payload)
    .eq("id", id);

  if (shouldScopeByFarm(tableName, context)) {
    query = query.eq("fazenda_id", context?.fazendaId as string);
  }

  const { data, error } = await query.select("*").single();

  if (error) {
    if (canRetryWithoutAnimalOptionalFields(tableName, payload, error)) {
      let fallbackQuery = supabaseBrowser
        .from(tableName)
        .update(withoutAnimalOptionalFields(payload))
        .eq("id", id);

      if (shouldScopeByFarm(tableName, context)) {
        fallbackQuery = fallbackQuery.eq("fazenda_id", context?.fazendaId as string);
      }

      const { data: fallbackData, error: fallbackError } = await fallbackQuery.select("*").single();

      if (!fallbackError) {
        invalidateRecordsCache(tableName, context);
        return fallbackData;
      }
    }

    logTechnicalError(`Falha ao atualizar registro em ${tableName}`, error);
    throw new Error(getFriendlyErrorMessage(error, "Não foi possível salvar as alterações agora."));
  }
  invalidateRecordsCache(tableName, context);
  return data;
}

export async function deleteRecord(tableName: string, id: string, context?: DataContext) {
  if (!supabaseBrowser) {
    mockData[tableName] = (mockData[tableName] || []).filter((item) => (
      item.id !== id || !matchesFarmScope(tableName, item, context)
    ));
    invalidateRecordsCache(tableName, context);
    return true;
  }

  let query = supabaseBrowser.from(tableName).delete().eq("id", id);
  if (shouldScopeByFarm(tableName, context)) {
    query = query.eq("fazenda_id", context?.fazendaId as string);
  }

  const { error } = await query;
  if (error) {
    logTechnicalError(`Falha ao excluir registro em ${tableName}`, error);
    throw new Error(getFriendlyErrorMessage(error, "Não foi possível excluir o registro agora."));
  }
  invalidateRecordsCache(tableName, context);
  return true;
}

export async function deleteRecords(tableName: string, filters: ListOptions["filters"] = [], context?: DataContext) {
  if (!supabaseBrowser) {
    const rows = mockData[tableName] || [];
    const rowsToDelete = new Set(filterLocalRows(tableName, rows, {
      filters,
      fazendaId: context?.fazendaId,
      usuarioId: context?.usuarioId
    }).map((item) => item.id));
    mockData[tableName] = rows.filter((item) => !rowsToDelete.has(item.id));
    invalidateRecordsCache(tableName, context);
    return true;
  }

  let query = supabaseBrowser.from(tableName).delete();
  if (shouldScopeByFarm(tableName, context)) {
    query = query.eq("fazenda_id", context?.fazendaId as string);
  }

  filters.forEach((filter) => {
    if (filter.value === undefined) return;
    query = filter.value === null ? query.is(filter.column, null) : query.eq(filter.column, filter.value);
  });

  const { error } = await query;
  if (error) {
    logTechnicalError(`Falha ao excluir registros em ${tableName}`, error);
    throw new Error(getFriendlyErrorMessage(error, "Não foi possível excluir os registros agora."));
  }
  invalidateRecordsCache(tableName, context);
  return true;
}

function relationOptionSelect(field: ModuleField) {
  const relation = field.relation;
  if (!relation) return "id";

  return Array.from(new Set([
    relation.valueColumn || "id",
    relation.labelColumn,
    relation.descriptionColumn
  ].filter(Boolean))).join(",");
}

export async function loadRelationOptions(field: ModuleField, context?: DataContext): Promise<RelationOption[]> {
  if (!field.relation) return [];

  const relation = field.relation;
  const rows = await listRecords(relation.tableName, {
    fazendaId: context?.fazendaId,
    usuarioId: context?.usuarioId,
    orderBy: relation.orderBy || relation.labelColumn,
    ascending: true,
    select: relationOptionSelect(field),
    cache: true
  });

  return rows.map((row) => {
    const value = String(row[relation.valueColumn || "id"]);
    const label = [row[relation.labelColumn], relation.descriptionColumn ? row[relation.descriptionColumn] : null]
      .filter(Boolean)
      .join(" - ");

    return { value, label: label || value };
  });
}

export function subscribeTable(tableName: string, callback: () => void) {
  if (!supabaseBrowser) return () => undefined;
  const client = supabaseBrowser;

  const channel = client
    .channel(`realtime:${tableName}`)
    .on("postgres_changes", { event: "*", schema: "public", table: tableName }, callback)
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}
