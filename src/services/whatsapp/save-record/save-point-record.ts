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

export async function savePointRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "PONTO_FUNCIONARIO") {
    const found = await findEmployee(supabase, owner, String(dados.funcionario_nome || ""));
    if (!found) {
      return {
        response: `Não encontrei o funcionário "${dados.funcionario_nome || ""}". Me envie o nome como está cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { funcionario_nome: undefined }) } }
      };
    }

    if (!found.exact) {
      const nextPending = pendingWithData(pending, { funcionario_nome: found.row.nome });
      return {
        response: `Encontrei um funcionário parecido: ${found.row.nome}. Quer usar esse funcionário?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    await insertRealRecord(supabase, owner, TABLES.registrosPonto, {
      fazenda_id: owner.fazenda_id,
      funcionario_id: found.row.id,
      tipo: dados.ponto_tipo || "entrada",
      registrado_em: isoFromReference(dados.data_referencia, dados.horario),
      observacao: `Registrado via WhatsApp (${owner.telefone_e164})`,
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    return realSaveResult(`Pronto, ponto salvo com sucesso.\n${found.row.nome}: ${dados.ponto_tipo || "entrada"}${dados.horario ?` às ${dados.horario}` : ""}.`, [TABLES.registrosPonto]);
  }
}
