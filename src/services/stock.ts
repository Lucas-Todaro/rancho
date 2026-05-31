"use client";

import { createRecord, updateRecord } from "@/services/crud";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext } from "@/lib/types";

export type StockMovementType = "entrada" | "saida" | "ajuste";

export async function recordStockMovement({
  item,
  type,
  quantity,
  unitValue,
  reason,
  context
}: {
  item: AnyRecord;
  type: StockMovementType;
  quantity: number;
  unitValue?: number;
  reason?: string;
  context: DataContext;
}) {
  if (!item?.id) throw new Error("Escolha um item do estoque.");
  if (!quantity || quantity <= 0) throw new Error("Informe uma quantidade maior que zero.");

  const current = Number(item.quantidade_atual || 0);

  if (type === "saida" && quantity > current) {
    throw new Error("Nao ha saldo suficiente para essa retirada.");
  }

  await createRecord(TABLES.estoqueMovimentacoes, {
    item_id: item.id,
    tipo: type,
    quantidade: quantity,
    valor_unitario: unitValue || item.valor_unitario || null,
    motivo: reason || null
  }, context);

  if (!supabaseBrowser) {
    const nextQuantity = type === "entrada"
      ? current + quantity
      : type === "saida"
        ? current - quantity
        : quantity;

    await updateRecord(TABLES.estoqueItens, item.id, {
      quantidade_atual: nextQuantity,
      valor_unitario: unitValue || item.valor_unitario || null
    });
  }
}
