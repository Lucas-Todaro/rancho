"use client";

import { createRecord, deleteRecord, deleteRecords, listRecords, updateRecord } from "@/services/crud";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext, RelationOption } from "@/lib/types";
import { toDateOnlyString } from "@/lib/utils";

const EVENT_FINANCE_ORIGIN_PREFIX = "evento_animal:";

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

function eventFinanceOrigin(eventId: string) {
  return `${EVENT_FINANCE_ORIGIN_PREFIX}${eventId}`;
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
  const typeLabel = eventTypeLabels[String(eventRecord.tipo || "")] || String(eventRecord.tipo || "Evento");

  return {
    tipo: "saida",
    data_transacao: toDateOnlyString(eventRecord.data_evento),
    valor: eventCost(eventRecord),
    categoria: "Saúde do rebanho",
    descricao: [
      `${typeLabel} do animal ${animalLabel(eventRecord, animalOptions)}`,
      eventRecord.descricao,
      eventRecord.medicamento ? `Medicamento: ${eventRecord.medicamento}` : null
    ].filter(Boolean).join(" - "),
    metodo_pagamento: "Lançamento de evento",
    origem: eventFinanceOrigin(String(eventRecord.id))
  };
}

export async function syncEventCostToFinance(eventRecord: AnyRecord, context: DataContext, animalOptions?: RelationOption[]) {
  const eventId = String(eventRecord.id || "");
  if (!eventId) return;

  const origin = eventFinanceOrigin(eventId);
  const existing = await listRecords(TABLES.transacoesFinanceiras, {
    fazendaId: context.fazendaId,
    usuarioId: context.usuarioId,
    filters: [{ column: "origem", value: origin }]
  });

  if (eventCost(eventRecord) <= 0) {
    if (existing.length) await deleteRecords(TABLES.transacoesFinanceiras, [{ column: "origem", value: origin }]);
    return;
  }

  const payload = financePayload(eventRecord, animalOptions);
  if (existing[0]?.id) {
    await updateRecord(TABLES.transacoesFinanceiras, existing[0].id, payload);
    await Promise.all(existing.slice(1).map((record) => deleteRecord(TABLES.transacoesFinanceiras, record.id)));
    return;
  }

  await createRecord(TABLES.transacoesFinanceiras, payload, context);
}

export async function removeEventCostFromFinance(eventId: string) {
  if (!eventId) return;
  await deleteRecords(TABLES.transacoesFinanceiras, [{ column: "origem", value: eventFinanceOrigin(eventId) }]);
}
