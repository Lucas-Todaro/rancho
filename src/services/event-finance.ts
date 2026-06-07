"use client";

import { createRecord, deleteRecord, deleteRecords, listRecords, updateRecord } from "@/services/crud";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext, RelationOption } from "@/lib/types";
import { toDateOnlyString } from "@/lib/utils";

const EVENT_FINANCE_SOURCE_TYPE = "evento_animal";
const EVENT_FINANCE_LEGACY_ORIGIN_PREFIX = "evento_animal:";

const eventTypeLabels: Record<string, string> = {
  parto: "Parto",
  vacina: "Vacina",
  doenca: "Doença",
  tratamento: "Tratamento",
  inseminacao: "Inseminação",
  pesagem: "Pesagem",
  observacao: "Observação",
  outro: "Outro"
};

function legacyEventFinanceOrigin(eventId: string) {
  return `${EVENT_FINANCE_LEGACY_ORIGIN_PREFIX}${eventId}`;
}

function eventCost(eventRecord: AnyRecord) {
  const raw = eventRecord.custo;
  const cost = typeof raw === "number"
    ? raw
    : Number(String(raw ?? "0").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(cost) ? cost : 0;
}

function animalLabel(eventRecord: AnyRecord, animalOptions?: RelationOption[]) {
  const option = animalOptions?.find((item) => item.value === String(eventRecord.animal_id || ""));
  return option?.label || String(eventRecord.animal_id || "sem animal");
}

function financePayload(eventRecord: AnyRecord, animalOptions?: RelationOption[]) {
  const eventId = String(eventRecord.id || "");
  const typeLabel = eventTypeLabels[String(eventRecord.tipo || "")] || String(eventRecord.tipo || "Evento");

  return {
    tipo: "saida",
    data_transacao: toDateOnlyString(eventRecord.data_evento),
    valor: eventCost(eventRecord),
    categoria: "Evento do animal",
    descricao: [
      `Custo do evento: ${typeLabel} do animal ${animalLabel(eventRecord, animalOptions)}`,
      eventRecord.descricao,
      eventRecord.medicamento ? `Medicamento: ${eventRecord.medicamento}` : null
    ].filter(Boolean).join(" - "),
    metodo_pagamento: "Lançamento de evento",
    origem: "web",
    source_type: EVENT_FINANCE_SOURCE_TYPE,
    source_id: eventId
  };
}

function legacyFinancePayload(eventRecord: AnyRecord, animalOptions?: RelationOption[]) {
  const payload = financePayload(eventRecord, animalOptions);
  const eventId = String(eventRecord.id || "");
  const { source_type, source_id, ...legacyPayload } = payload;
  void source_type;
  void source_id;
  return {
    ...legacyPayload,
    origem: legacyEventFinanceOrigin(eventId)
  };
}

function isMissingSourceColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
  return /source_type|source_id|schema cache|column|atualiza[cç][aã]o no banco de dados/i.test(message);
}

function sourceFilters(eventId: string) {
  return [
    { column: "source_type", value: EVENT_FINANCE_SOURCE_TYPE },
    { column: "source_id", value: eventId }
  ];
}

function scopedFilters(filters: Array<{ column: string; value: string }>, context?: DataContext) {
  return context?.fazendaId ? [...filters, { column: "fazenda_id", value: context.fazendaId }] : filters;
}

async function findEventFinanceRecords(eventId: string, context: DataContext) {
  let sourceRows: AnyRecord[] = [];
  try {
    sourceRows = await listRecords(TABLES.transacoesFinanceiras, {
      fazendaId: context.fazendaId,
      usuarioId: context.usuarioId,
      select: "id",
      filters: sourceFilters(eventId)
    });
  } catch (error) {
    if (!isMissingSourceColumn(error)) throw error;
  }

  const legacyRows = await listRecords(TABLES.transacoesFinanceiras, {
    fazendaId: context.fazendaId,
    usuarioId: context.usuarioId,
    select: "id",
    filters: [{ column: "origem", value: legacyEventFinanceOrigin(eventId) }]
  });

  const seen = new Set<string>();
  return [...sourceRows, ...legacyRows].filter((record) => {
    const id = String(record.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function syncEventCostToFinance(eventRecord: AnyRecord, context: DataContext, animalOptions?: RelationOption[]) {
  const eventId = String(eventRecord.id || "");
  if (!eventId) return;

  const existing = await findEventFinanceRecords(eventId, context);

  if (eventCost(eventRecord) <= 0) {
    await removeEventCostFromFinance(eventId, context);
    return;
  }

  const payload = financePayload(eventRecord, animalOptions);
  if (existing[0]?.id) {
    try {
      await updateRecord(TABLES.transacoesFinanceiras, existing[0].id, payload, context);
    } catch (error) {
      if (!isMissingSourceColumn(error)) throw error;
      await updateRecord(TABLES.transacoesFinanceiras, existing[0].id, legacyFinancePayload(eventRecord, animalOptions), context);
    }
    await Promise.all(existing.slice(1).map((record) => deleteRecord(TABLES.transacoesFinanceiras, record.id, context)));
    return;
  }

  try {
    await createRecord(TABLES.transacoesFinanceiras, payload, context);
  } catch (error) {
    if (!isMissingSourceColumn(error)) throw error;
    await createRecord(TABLES.transacoesFinanceiras, legacyFinancePayload(eventRecord, animalOptions), context);
  }
}

export async function removeEventCostFromFinance(eventId: string, context?: DataContext) {
  if (!eventId) return;
  try {
    await deleteRecords(TABLES.transacoesFinanceiras, scopedFilters(sourceFilters(eventId), context), context);
  } catch (error) {
    if (!isMissingSourceColumn(error)) throw error;
  }
  await deleteRecords(TABLES.transacoesFinanceiras, scopedFilters([{ column: "origem", value: legacyEventFinanceOrigin(eventId) }], context), context);
}
