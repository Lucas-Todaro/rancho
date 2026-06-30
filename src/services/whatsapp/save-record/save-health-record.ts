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

export async function saveHealthRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  const preparedAnimalRecord = await prepareAnimalRecord(ctx);

  if (preparedAnimalRecord.result) return preparedAnimalRecord.result;

  const animal = preparedAnimalRecord.animal;

    if (pending.tipo === "VACINA_MEDICAMENTO") {
      const tipo = dados.evento_tipo === "vacina" ?"vacina" : "tratamento";
      const custo = hasBotValue(dados.custo ?? dados.valor) ?Number(dados.custo ?? dados.valor) : 0;
      const produto = dados.produto || (tipo === "vacina" ? "vacina" : "tratamento");
      const savedTables = [TABLES.eventosAnimal];
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo,
        data_evento: isoFromReference(dados.data_referencia),
        descricao: `${tipo === "vacina" ?"Vacina" : "Tratamento"} registrado via WhatsApp`,
        medicamento: produto,
        dose: dados.dose || null,
        custo,
        responsavel_usuario_id: owner.usuario_id || null
      });

      let financeText = "";
      if (custo > 0 && isBotAdmin(owner)) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "saida",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: custo,
          categoria: "Sa\u00fade animal",
          descricao: `${tipo === "vacina" ? "Vacina" : "Tratamento"} de ${animal.brinco}: ${produto}`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });
        savedTables.push(TABLES.transacoesFinanceiras);
        financeText = `\nSa\u00edda financeira: ${formatMoney(custo)}.`;
      } else if (custo > 0) {
        financeText = "\nO custo informado n\u00e3o foi lan\u00e7ado no financeiro porque seu usu\u00e1rio n\u00e3o tem permiss\u00e3o para financeiro.";
      }

      return realSaveResult(`Pronto, registro salvo com sucesso.\n${tipo === "vacina" ?"Vacina" : "Tratamento"} em ${animal.brinco}: ${produto}.${financeText}`, savedTables);
    }

    if (pending.tipo === "MORTE") {
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: "observacao",
        data_evento: isoFromReference(dados.data_referencia),
        descricao: `Morte registrada via WhatsApp para o animal ${animal.brinco}`,
        medicamento: null,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });

      const { error } = await supabase
        .from(TABLES.animais)
        .update({ status: "morto" })
        .eq("id", animal.id)
        .eq("fazenda_id", owner.fazenda_id);
      if (error) throw new Error(error.message);

      return realSaveResult(`Pronto, registro salvo com sucesso.\nAnimal ${animal.brinco} marcado como morto.`, [TABLES.eventosAnimal, TABLES.animais]);
    }
}
