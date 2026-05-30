"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";
import { mockData } from "@/lib/mock-data";
import type { AnyRecord } from "@/lib/types";

function withId(record: AnyRecord) {
  return {
    id: record.id || crypto.randomUUID(),
    created_at: record.created_at || new Date().toISOString(),
    ...record
  };
}

export async function listRecords(tableName: string, orderBy = "created_at") {
  if (!supabaseBrowser) {
    return [...(mockData[tableName] || [])];
  }

  const { data, error } = await supabaseBrowser
    .from(tableName)
    .select("*")
    .order(orderBy, { ascending: false });

  if (error) {
    console.warn(`[Rancho] Falha ao ler ${tableName}. Usando demo.`, error.message);
    return [...(mockData[tableName] || [])];
  }

  return data || [];
}

export async function createRecord(tableName: string, values: AnyRecord) {
  const localPayload = withId(values);

  if (!supabaseBrowser) {
    mockData[tableName] = [localPayload, ...(mockData[tableName] || [])];
    return localPayload;
  }

  const { data, error } = await supabaseBrowser
    .from(tableName)
    .insert(values)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateRecord(tableName: string, id: string, values: AnyRecord) {
  if (!supabaseBrowser) {
    mockData[tableName] = (mockData[tableName] || []).map((item) => item.id === id ? { ...item, ...values } : item);
    return mockData[tableName].find((item) => item.id === id);
  }

  const { data, error } = await supabaseBrowser
    .from(tableName)
    .update(values)
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
