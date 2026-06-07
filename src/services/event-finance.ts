"use client";

import { createRecord, deleteRecord, deleteRecords, listRecords, updateRecord } from "@/services/crud";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext, RelationOption } from "@/lib/types";
import { toDateOnlyString } from "@/lib/utils";

const EVENT_FINANCE_SOURCE_TYPE = "evento_animal";

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
    origem_tabela: TABLES.eventosAnimal,
    origem_id: eventId,
    source_type: EVENT_FINANCE_SOURCE_TYPE,
    source_id: eventId
  };
}

function withoutSourceFields(payload: AnyRecord) {
  const { source_type, source_id, ...nextPayload } = payload;
  void source_type;
  void source_id;
  return nextPayload;
}

function withoutOriginLinkFields(payload: AnyRecord) {
  const { origem_tabela, origem_id, ...nextPayload } = payload;
  void origem_tabela;
  void origem_id;
  return nextPayload;
}

function withoutAnyLinkFields(payload: AnyRecord) {
  return withoutOriginLinkFields(withoutSourceFields(payload));
}

function isMissingOptionalLinkColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
  return /source_type|source_id|origem_tabela|origem_id|schema cache|column|atualizacao no banco de dados|atualiza[cç][aã]o no banco de dados/i.test(message);
}

function sourceFilters(eventId: string) {
  return [
    { column: "source_type", value: EVENT_FINANCE_SOURCE_TYPE },
    { column: "source_id", value: eventId }
  ];
}

function originLinkFilters(eventId: string) {
  return [
    { column: "origem_tabela", value: TABLES.eventosAnimal },
    { column: "origem_id", value: eventId }
  ];
}

function scopedFilters(filters: Array<{ column: string; value: string }>, context?: DataContext) {
  return context?.fazendaId ? [...filters, { column: "fazenda_id", value: context.fazendaId }] : filters;
}

async function findRowsByFilters(filters: Array<{ column: string; value: string }>, context: DataContext) {
  try {
    return await listRecords(TABLES.transacoesFinanceiras, {
      fazendaId: context.fazendaId,
      usuarioId: context.usuarioId,
      select: "id",
      filters
    });
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
    return [];
  }
}

async function findEventFinanceRecords(eventId: string, context: DataContext) {
  const [sourceRows, originLinkRows] = await Promise.all([
    findRowsByFilters(sourceFilters(eventId), context),
    findRowsByFilters(originLinkFilters(eventId), context)
  ]);

  const seen = new Set<string>();
  return [...sourceRows, ...originLinkRows].filter((record) => {
    const id = String(record.id || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function createFinanceRecord(payload: AnyRecord, context: DataContext) {
  try {
    return await createRecord(TABLES.transacoesFinanceiras, payload, context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  try {
    return await createRecord(TABLES.transacoesFinanceiras, withoutSourceFields(payload), context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  try {
    return await createRecord(TABLES.transacoesFinanceiras, withoutOriginLinkFields(payload), context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  return createRecord(TABLES.transacoesFinanceiras, withoutAnyLinkFields(payload), context);
}

async function updateFinanceRecord(id: string, payload: AnyRecord, context: DataContext) {
  try {
    return await updateRecord(TABLES.transacoesFinanceiras, id, payload, context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  try {
    return await updateRecord(TABLES.transacoesFinanceiras, id, withoutSourceFields(payload), context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  try {
    return await updateRecord(TABLES.transacoesFinanceiras, id, withoutOriginLinkFields(payload), context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  return updateRecord(TABLES.transacoesFinanceiras, id, withoutAnyLinkFields(payload), context);
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
    await updateFinanceRecord(existing[0].id, payload, context);
    await Promise.all(existing.slice(1).map((record) => deleteRecord(TABLES.transacoesFinanceiras, record.id, context)));
    return;
  }

  await createFinanceRecord(payload, context);
}

export async function removeEventCostFromFinance(eventId: string, context?: DataContext) {
  if (!eventId) return;

  try {
    await deleteRecords(TABLES.transacoesFinanceiras, scopedFilters(sourceFilters(eventId), context), context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }

  try {
    await deleteRecords(TABLES.transacoesFinanceiras, scopedFilters(originLinkFilters(eventId), context), context);
  } catch (error) {
    if (!isMissingOptionalLinkColumn(error)) throw error;
  }
}
