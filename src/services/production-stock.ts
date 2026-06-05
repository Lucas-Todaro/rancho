"use client";

import { deleteRecords, listRecords } from "@/services/crud";
import { recordStockMovement } from "@/services/stock";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext } from "@/lib/types";

const PRODUCTION_STOCK_SOURCE_TYPE = "ordenha";
const PRODUCTION_STOCK_REASON = "Entrada automática por produção de leite";

function normalizeUnit(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isMilkUnit(unit: unknown) {
  return ["l", "litro", "litros"].includes(normalizeUnit(unit));
}

function isMissingSourceColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
  return /source_type|source_id|column|schema cache/i.test(message);
}

function scopedSourceFilters(productionId: string, context: DataContext) {
  return [
    ...(context.fazendaId ? [{ column: "fazenda_id", value: context.fazendaId }] : []),
    { column: "source_type", value: PRODUCTION_STOCK_SOURCE_TYPE },
    { column: "source_id", value: productionId }
  ];
}

async function findStockItem(itemId: string, context: DataContext) {
  const [item] = await listRecords(TABLES.estoqueItens, {
    fazendaId: context.fazendaId,
    usuarioId: context.usuarioId,
    filters: [{ column: "id", value: itemId }]
  });

  return item;
}

export async function validateProductionStockDestination(values: AnyRecord, context: DataContext) {
  if (!values.adicionar_ao_estoque) return;

  const itemId = String(values.estoque_item_id || "").trim();
  if (!itemId) throw new Error("Selecione um item de estoque para receber o leite.");

  const item = await findStockItem(itemId, context);
  if (!item?.id) throw new Error("Item de estoque não encontrado.");
  if (!isMilkUnit(item.unidade_medida)) {
    throw new Error("Escolha um item de estoque cadastrado em litros para receber produção de leite.");
  }
}

export async function removeProductionStockMovement(productionId: string, context: DataContext) {
  if (!productionId) return;

  if (supabaseBrowser) {
    let query = supabaseBrowser
      .from(TABLES.estoqueMovimentacoes)
      .delete()
      .eq("source_type", PRODUCTION_STOCK_SOURCE_TYPE)
      .eq("source_id", productionId);

    if (context.fazendaId) query = query.eq("fazenda_id", context.fazendaId);

    const { error } = await query;
    if (error && !isMissingSourceColumn(error)) throw new Error(error.message);
    return;
  }

  try {
    await deleteRecords(TABLES.estoqueMovimentacoes, scopedSourceFilters(productionId, context), context);
  } catch (error) {
    if (!isMissingSourceColumn(error)) throw error;
  }
}

export async function syncProductionStockMovement(production: AnyRecord, context: DataContext) {
  const productionId = String(production.id || "").trim();
  if (!productionId) return;

  await removeProductionStockMovement(productionId, context);

  const itemId = String(production.estoque_item_id || "").trim();
  const liters = Number(production.litros || 0);
  if (!itemId) return;
  if (!liters || liters <= 0) throw new Error("Informe litros maior que zero para adicionar a produção ao estoque.");

  const item = await findStockItem(itemId, context);
  if (!item?.id) throw new Error("Item de estoque não encontrado.");
  if (!isMilkUnit(item.unidade_medida)) {
    throw new Error("Escolha um item de estoque cadastrado em litros para receber produção de leite.");
  }

  await recordStockMovement({
    item,
    type: "entrada",
    quantity: liters,
    unitValue: item.valor_unitario ? Number(item.valor_unitario) : undefined,
    reason: PRODUCTION_STOCK_REASON,
    context,
    sourceType: PRODUCTION_STOCK_SOURCE_TYPE,
    sourceId: productionId
  });
}
