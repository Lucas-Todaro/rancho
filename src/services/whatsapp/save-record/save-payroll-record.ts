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

export async function savePayrollRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "PAGAMENTO_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para registrar pagamento de funcionários pelo bot. Peça para um administrador fazer esse lançamento." };
    }

    const found = await findEmployee(supabase, owner, String(dados.funcionario_nome || ""));
    if (!found) {
      return {
        response: `Não encontrei o funcionário "${dados.funcionario_nome || ""}". Qual é o nome correto ou WhatsApp?`,
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

    const paymentType = String(dados.pagamento_tipo || "salario");
    const value = Number(dados.valor || 0);
    const competencia = monthStartFromPaymentPeriod(String(dados.periodo_pagamento || "mes_atual"));
    const paidAt = dateOnlyFromReference(dados.data_referencia);

    const { data: existingPayroll, error: payrollLookupError } = await supabase
      .from(TABLES.folhaPagamento)
      .select("id,funcionario_id,competencia,salario_base,horas_extras,valor_horas_extras,descontos,adiantamentos,total_liquido,status,pago_em")
      .eq("fazenda_id", owner.fazenda_id)
      .eq("funcionario_id", found.row.id)
      .gte("competencia", competencia)
      .lt("competencia", monthRange(monthKeyFromDate(competencia)).end.slice(0, 10))
      .maybeSingle();
    if (payrollLookupError) throw new Error(payrollLookupError.message);

    if (existingPayroll?.status === "paga" && paymentType === "salario" && !dados.confirmar_pagamento_duplicado) {
      const nextPending = pendingWithData(pending, { confirmar_pagamento_duplicado: true, funcionario_nome: found.row.nome });
      return {
        response: `Já existe pagamento registrado para ${found.row.nome} neste período. Deseja registrar outro pagamento mesmo assim?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const base = Number(existingPayroll?.salario_base ?? found.row.salario_base ?? 0);
    const currentExtra = Number(existingPayroll?.valor_horas_extras ?? 0);
    const currentDiscounts = Number(existingPayroll?.descontos ?? 0);
    const currentAdvance = Number(existingPayroll?.adiantamentos ?? 0);
    const payrollPayload = {
      fazenda_id: owner.fazenda_id,
      funcionario_id: found.row.id,
      competencia,
      salario_base: paymentType === "salario" ? value : base,
      horas_extras: Number(existingPayroll?.horas_extras ?? 0),
      valor_horas_extras: paymentType === "bonus" || paymentType === "diaria" ? currentExtra + value : currentExtra,
      descontos: currentDiscounts,
      adiantamentos: paymentType === "adiantamento" ? currentAdvance + value : currentAdvance,
      total_liquido: paymentType === "adiantamento"
        ? Math.max(0, base + currentExtra - currentDiscounts - (currentAdvance + value))
        : paymentType === "salario" ? value : base + currentExtra + value - currentDiscounts - currentAdvance,
      status: paymentType === "salario" ? "paga" : String(existingPayroll?.status || "rascunho"),
      pago_em: paymentType === "salario" ? paidAt : existingPayroll?.pago_em || null
    };

    let payrollRecord: AnyRecord;
    if (existingPayroll?.id) {
      const { data, error } = await supabase
        .from(TABLES.folhaPagamento)
        .update(safeBotPayload(TABLES.folhaPagamento, payrollPayload))
        .eq("id", existingPayroll.id)
        .eq("fazenda_id", owner.fazenda_id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      payrollRecord = data || { ...existingPayroll, ...payrollPayload };
      await logAudit(supabase, owner, TABLES.folhaPagamento, "update", payrollRecord);
    } else {
      payrollRecord = await insertRealRecord(supabase, owner, TABLES.folhaPagamento, payrollPayload);
    }

    await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
      fazenda_id: owner.fazenda_id,
      tipo: "saida",
      data_transacao: paidAt,
      valor: value,
      categoria: "Folha de pagamento",
      descricao: `Pagamento de ${paymentType} - ${found.row.nome}`,
      metodo_pagamento: "whatsapp",
      origem: `folha_pagamento:${payrollRecord.id || found.row.id}`,
      created_by: owner.usuario_id || null
    });

    return realSaveResult(
      `Pronto, pagamento salvo com sucesso.\n${found.row.nome}: ${formatMoney(value)} (${paymentType}). Folha e financeiro atualizados.`,
      [TABLES.folhaPagamento, TABLES.transacoesFinanceiras]
    );
  }
}
