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

export async function saveLotRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "CRIAR_LOTE") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para criar lotes pelo bot. Peça para um administrador fazer esse cadastro." };
    }

    const lotName = String(dados.lote_nome || "").trim();
    if (!lotName) {
      return {
        response: "Qual será o nome do lote?",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { lote_nome: undefined }) } }
      };
    }

    const found = await findLot(supabase, owner, lotName);
    if (found?.row && found.exact) {
      return { response: `Já existe um lote chamado ${found.row.nome}. Nada foi salvo.` };
    }

    await insertRealRecord(supabase, owner, TABLES.lotes, {
      fazenda_id: owner.fazenda_id,
      nome: lotName,
      descricao: null,
      ativo: true
    });

    return realSaveResult(`Pronto, lote ${lotName} criado com sucesso.`, [TABLES.lotes]);
  }
}
