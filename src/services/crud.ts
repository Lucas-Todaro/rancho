"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import { mockData } from "@/lib/mock-data";
import { CREATED_BY_FIELDS, FARM_SCOPED_TABLES, TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext, ModuleField, RelationOption } from "@/lib/types";

type ListOptions = DataContext & {
  orderBy?: string;
  ascending?: boolean;
  select?: string;
};

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

  return payload;
}

function sortLocal(rows: AnyRecord[], orderBy = "created_at", ascending = false) {
  return [...rows].sort((a, b) => {
    const left = a[orderBy] ?? "";
    const right = b[orderBy] ?? "";
    if (left === right) return 0;
    return (left > right ? 1 : -1) * (ascending ? 1 : -1);
  });
}

export async function listRecords(tableName: string, options: ListOptions = {}): Promise<AnyRecord[]> {
  const { orderBy = "created_at", ascending = false, fazendaId, select = "*" } = options;

  if (!supabaseBrowser) {
    const rows = mockData[tableName] || [];
    const scoped = fazendaId && FARM_SCOPED_TABLES.has(tableName)
      ? rows.filter((row) => row.fazenda_id === fazendaId)
      : rows;
    return sortLocal(scoped, orderBy, ascending);
  }

  let query = supabaseBrowser
    .from(tableName)
    .select(select)
    .order(orderBy, { ascending });

  if (fazendaId && FARM_SCOPED_TABLES.has(tableName)) {
    query = query.eq("fazenda_id", fazendaId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn(`[Rancho] Falha ao ler ${tableName}. Usando demo.`, error.message);
    const rows = mockData[tableName] || [];
    return sortLocal(rows, orderBy, ascending);
  }

  return (data || []) as AnyRecord[];
}

export async function createRecord(tableName: string, values: AnyRecord, context?: DataContext) {
  const payload = preparePayload(tableName, values, context);

  if (!supabaseBrowser) {
    const localPayload = withId(tableName, payload, context);
    mockData[tableName] = [localPayload, ...(mockData[tableName] || [])];
    return localPayload;
  }

  const { data, error } = await supabaseBrowser
    .from(tableName)
    .insert(payload)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateRecord(tableName: string, id: string, values: AnyRecord) {
  const payload = normalizePayload(values);

  if (!supabaseBrowser) {
    mockData[tableName] = (mockData[tableName] || []).map((item) => item.id === id ? { ...item, ...payload } : item);
    return mockData[tableName].find((item) => item.id === id);
  }

  const { data, error } = await supabaseBrowser
    .from(tableName)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteRecord(tableName: string, id: string) {
  if (!supabaseBrowser) {
    mockData[tableName] = (mockData[tableName] || []).filter((item) => item.id !== id);
    return true;
  }

  const { error } = await supabaseBrowser.from(tableName).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export async function loadRelationOptions(field: ModuleField, context?: DataContext): Promise<RelationOption[]> {
  if (!field.relation) return [];

  const relation = field.relation;
  const rows = await listRecords(relation.tableName, {
    fazendaId: context?.fazendaId,
    usuarioId: context?.usuarioId,
    orderBy: relation.orderBy || relation.labelColumn,
    ascending: true
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
