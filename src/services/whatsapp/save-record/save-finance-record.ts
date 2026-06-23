// @ts-nocheck
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { normalizeCatalogText } from "@/lib/whatsapp/catalog";
import { calfCategoryForSex, normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp";
import { DESTRUCTIVE_BULK_ACTION_MESSAGE } from "@/lib/whatsapp/nlp-core/safety-guards";
import { whatsappNumbersMatch } from "@/lib/phone";
import type { SaveRecordHandlerContext, SaveResult } from "@/services/whatsapp/save-record/types";
import { createSaveRecordScope, prepareAnimalRecord } from "@/services/whatsapp/save-record/helpers";

export async function saveFinanceRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
  const { supabase, owner, pending } = ctx;
  const {
    dados,
    validatePendingForSave,
    saveDomainTableImport,
    logDestructiveBulkBlock,
    tabularImportRows,
    existingAnimalEventKeysForImport,
    importedTableEventKey,
    insertRealRecord,
    isoFromReference,
    importedTableEventDescription,
    realSaveResult,
    animalImportRows,
    listAnimals,
    exactAnimalImportCodeKey,
    findLot,
    enrichTabularAnimalEventImport,
    confirmationText,
    stockImportRows,
    findStockItem,
    stockCategoryFromName,
    validateBatchRecordReady,
    saveMilkStockMovementIfNeeded,
    milkStockAfterSaveText,
    findAnimal,
    pendingWithData,
    botAnimalCheckLog,
    partoWithChild,
    botPartoSaveLog,
    animalSexKind,
    animalLabel,
    calfCodeFromParto,
    isSamePartoChild,
    existingPartoSameDay,
    partoDuplicateConfirmationMessage,
    animalOptionsText,
    calfPayloadFromParto,
    partoChildEventDescription,
    updateMotherPhaseAfterParto,
    safeErrorText,
    genealogyPayloadFromData,
    collectDescendantIds,
    logAudit,
    reproductiveEventDbType,
    reproductiveEventDescription,
    findEmployee,
    formatWhatsappForBot,
    monthStartFromPaymentPeriod,
    dateOnlyFromReference,
    monthRange,
    monthKeyFromDate,
    safeBotPayload,
    nowIso,
    unknownText,
    formatNumber,
    formatMoney,
    formatStockAmount,
    isBotAdmin,
    dateOnly,
    hasBotValue,
    normalizedReproductiveEventKind,
    reproductiveEventLabel,
    botLog,
    stockResolutionDebug,
    stockDecisionReason,
    physicalSaleStockDecisionQuestion,
    refreshRanchoMessage,
    normalizeWhatsappNumber,
    isValidBotPhone,
    saveConfirmedRecord
  } = createSaveRecordScope(ctx);
  if (pending.tipo === "DESPESA" || pending.tipo === "RECEITA_VENDA") {
    const tipo = pending.tipo === "DESPESA" ?"saida" : "entrada";
    if (pending.tipo === "DESPESA" && dados.item_extraido) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "salvar_financeiro",
        stockResolution: {
          item_extraido: dados.item_extraido,
          item_normalizado: dados.item_normalizado,
          item_resolvido: dados.item_resolvido || null,
          item_estoque_encontrado: Boolean(dados.item_estoque_encontrado),
          item_id: dados.item_id || null
        },
        decision: dados.motivo_processamento || "item_nao_encontrado: financeiro_apenas"
      });
    }

    await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
      fazenda_id: owner.fazenda_id,
      tipo,
      data_transacao: dateOnlyFromReference(dados.data_referencia),
      valor: Number(dados.valor),
      categoria: dados.descricao || (tipo === "saida" ?"Despesa via WhatsApp" : "Receita via WhatsApp"),
      descricao: dados.descricao || pending.resumo,
      metodo_pagamento: "whatsapp",
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    return realSaveResult(`Pronto, registro salvo com sucesso.\n${tipo === "saida" ?"Saída" : "Entrada"}: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
  }
}
