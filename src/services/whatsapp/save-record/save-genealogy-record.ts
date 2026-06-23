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

export async function saveGenealogyRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "ATUALIZACAO_GENEALOGIA") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para alterar genealogia pelo bot. Peça para um administrador fazer essa alteração." };
    }

    const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!found?.row) {
      return {
        response: `Não encontrei o animal "${dados.animal_codigo || ""}" no rebanho. Me envie o brinco cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      return {
        response: `Encontrei mais de um animal parecido. Me envie o brinco correto:\n${animalOptionsText(found.ambiguousRows)}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    const animal = found.row;
    const payload = genealogyPayloadFromData(dados);
    if (!Object.keys(payload).length) {
      return {
        response: "Não reconheci qual relação genealógica deve ser atualizada. Envie mãe, pai ou cancelar.",
        nextSession: { etapa: "aguardando_dado", dados: { pending } }
      };
    }

    const nextMother = payload.mae_id === undefined ?String(animal.mae_id || "") : payload.mae_id ?String(payload.mae_id) : "";
    const nextFather = payload.pai_id === undefined ?String(animal.pai_id || "") : payload.pai_id ?String(payload.pai_id) : "";
    if ((nextMother && nextMother === animal.id) || (nextFather && nextFather === animal.id)) {
      return { response: "O animal não pode ser pai ou mãe dele mesmo. Nada foi salvo." };
    }

    if (nextMother || nextFather) {
      const animals = await listAnimals(supabase, owner);
      const descendants = collectDescendantIds(String(animal.id), animals);
      if ((nextMother && descendants.has(nextMother)) || (nextFather && descendants.has(nextFather))) {
        return { response: "Não é possível escolher um descendente como pai ou mãe. Nada foi salvo." };
      }
    }

    const { data, error } = await supabase
      .from(TABLES.animais)
      .update(payload)
      .eq("id", animal.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.animais, "update", data || { ...animal, ...payload });

    const updated = { ...animal, ...payload };
    const animals = await listAnimals(supabase, owner);
    const byId = new Map(animals.map((row) => [String(row.id), row]));
    return realSaveResult([
      "Pronto, genealogia atualizada com sucesso.",
      `Animal: ${animalLabel(updated)}.`,
      `Mãe: ${updated.mae_id ?animalLabel(byId.get(String(updated.mae_id))) : "Não informado"}.`,
      `Pai: ${updated.pai_id ?animalLabel(byId.get(String(updated.pai_id))) : "Não informado"}.`
    ].join("\n"), [TABLES.animais]);
  }
}
