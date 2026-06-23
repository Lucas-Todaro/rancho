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

export async function saveProductionRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros as ParsedRanchoMessage[] : [];
    if (!registros.length) return { response: "Não encontrei registros válidos nesse lote. Envie novamente." };

    const savedTables = new Set<string>();
    const summaries: string[] = [];

    for (let index = 0; index < registros.length; index += 1) {
      const reason = await validateBatchRecordReady(supabase, owner, registros[index]);
      if (reason) {
        return { response: `Não salvei o lote. O registro ${index + 1} precisa de ajuste: ${reason}.` };
      }
    }

    for (let index = 0; index < registros.length; index += 1) {
      const registro = registros[index];
      const result = await saveConfirmedRecord(supabase, owner, registro);

      if (result.nextSession) {
        return {
          response: `Preciso revisar o registro ${index + 1} do lote antes de salvar tudo.\n${result.response}`,
          nextSession: result.nextSession
        };
      }

      if (!result.savedReal) {
        return { response: `Não salvei o lote. O registro ${index + 1} precisa de ajuste:\n${result.response}` };
      }

      for (const table of result.savedTables || []) savedTables.add(table);
      summaries.push(`${index + 1}. ${registro.resumo}`);
    }

    const stockMovement = await saveMilkStockMovementIfNeeded(
      supabase,
      owner,
      pending,
      Number(dados.total_litros || 0),
      registros.filter((registro) => registro.tipo === "PRODUCAO_LEITE").map((registro) => String(registro.dados?.animal_codigo || "")).filter(Boolean)
    );
    if (stockMovement) savedTables.add(TABLES.estoqueMovimentacoes);

    const response = stockMovement
      ?`Registro salvo com sucesso: ${registros.length} produções registradas e estoque de ${(pending.dados?.estoque_leite as AnyRecord | undefined)?.item_leite_resolvido || "leite"} atualizado.`
      :`Pronto, ${registros.length} registros salvos com sucesso.\n${summaries.join("\n")}${milkStockAfterSaveText(pending)}`;

    return realSaveResult(response, Array.from(savedTables));
  }

  const preparedAnimalRecord = await prepareAnimalRecord(ctx);

  if (preparedAnimalRecord.result) return preparedAnimalRecord.result;

  const animal = preparedAnimalRecord.animal;

    if (pending.tipo === "PRODUCAO_LEITE") {
      const production = await insertRealRecord(supabase, owner, TABLES.ordenhas, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        litros: Number(dados.litros),
        ordenhado_em: isoFromReference(dados.data_referencia),
        turno: dados.turno || "manha",
        destino: dados.destino_leite || "tanque",
        origem: "whatsapp",
        registrado_por: owner.usuario_id || null,
        observacoes: `Registrado via WhatsApp (${owner.telefone_e164})`
      });
      const savedTables: string[] = [TABLES.ordenhas];
      const stockMovement = await saveMilkStockMovementIfNeeded(supabase, owner, pending, Number(dados.litros || 0), [animal.brinco], String(production?.id || ""));
      if (stockMovement) savedTables.push(TABLES.estoqueMovimentacoes);
      if (stockMovement) {
        return realSaveResult(`Registro salvo com sucesso: produção registrada e estoque de ${(pending.dados?.estoque_leite as AnyRecord | undefined)?.item_leite_resolvido || "leite"} atualizado.`, savedTables);
      }
      return realSaveResult(`Pronto, registro salvo com sucesso.\nProdução: ${animal.brinco}, ${formatNumber(dados.litros, " L")}.${milkStockAfterSaveText(pending)}`, savedTables);
    }
}
