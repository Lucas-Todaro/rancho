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

export async function saveAnimalRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "EXCLUIR_REBANHO") {
    logDestructiveBulkBlock(owner, {
      currentIntent: pending.tipo,
      source: "save_confirmed_record_legacy",
      blocked: true
    });
    return { response: DESTRUCTIVE_BULK_ACTION_MESSAGE };
  }

  if (pending.tipo === "ATUALIZACAO_ANIMAL") {
    const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!found) {
      return {
        response: `Não encontrei o animal "${dados.animal_codigo || ""}" no rebanho. Me envie o brinco cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.brinco}`).join("\n");
      return {
        response: `Encontrei mais de um animal parecido. Me envie o brinco correto:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (!found.exact) {
      const nextPending = pendingWithData(pending, { animal_codigo: found.row.brinco });
      return {
        response: `Encontrei um animal parecido: ${found.row.brinco}. Quer usar esse animal?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const animal = found.row;

    if (dados.registro_evento_animal) {
      const custo = hasBotValue(dados.custo ?? dados.valor) ?Number(dados.custo ?? dados.valor) : 0;
      const descricao = String(dados.descricao || dados.novo_valor || pending.resumo || "Ocorrência registrada via WhatsApp");
      const reproductiveKind = normalizedReproductiveEventKind(dados, descricao);
      const eventType = reproductiveKind ?reproductiveEventDbType(reproductiveKind) : "observacao";
      const eventoLabel = reproductiveKind
        ? reproductiveEventLabel(reproductiveKind)
        : dados.evento_tipo === "reprodutivo" ?"Ocorrência reprodutiva" : "Ocorrência clínica";
      const origemInseminacao = String(dados.origem_inseminacao || "").trim();
      const eventDescription = reproductiveKind
        ? reproductiveEventDescription(reproductiveKind, descricao, origemInseminacao)
        : `${eventoLabel} registrada via WhatsApp: ${descricao}`;
      const savedTables: string[] = [TABLES.eventosAnimal];

      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: eventType,
        data_evento: isoFromReference(dados.data_referencia),
        descricao: eventDescription,
        medicamento: reproductiveKind === "inseminacao" && origemInseminacao ?origemInseminacao : null,
        dose: null,
        custo,
        responsavel_usuario_id: owner.usuario_id || null
      });

      if (reproductiveKind === "prenhez" && String(dados.campo_alterado || "") === "fase" && hasBotValue(dados.novo_valor)) {
        const { data, error } = await supabase
          .from(TABLES.animais)
          .update({ fase: String(dados.novo_valor) })
          .eq("id", animal.id)
          .eq("fazenda_id", owner.fazenda_id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        await logAudit(supabase, owner, TABLES.animais, "update", data || { ...animal, fase: String(dados.novo_valor) });
        savedTables.push(TABLES.animais);
      }

      let financeText = "";
      if (custo > 0 && isBotAdmin(owner)) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "saida",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: custo,
          categoria: reproductiveKind ?"Reprodução animal" : "Saúde animal",
          descricao: `${eventoLabel} de ${animal.brinco}: ${descricao}`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });
        savedTables.push(TABLES.transacoesFinanceiras);
        financeText = `\nSaída financeira: ${formatMoney(custo)}.`;
      } else if (custo > 0) {
        financeText = "\nO custo informado não foi lançado no financeiro porque seu usuário não tem permissão para financeiro.";
      }

      return realSaveResult(`Pronto, registro salvo com sucesso.\n${eventoLabel} em ${animal.brinco}.${financeText}`, savedTables);
    }

    const field = String(dados.campo_alterado || "");
    const value = dados.novo_valor;
    let payload: AnyRecord = {};
    let label = field;

    if (field === "lote_id") {
      const lot = await findLot(supabase, owner, String(value || dados.lote_nome || ""));
      if (!lot?.row) {
        return {
          response: `Não encontrei o lote "${value || ""}". Me envie o nome de um lote cadastrado ou envie cancelar.`,
          nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { novo_valor: undefined, lote_nome: undefined }) } }
        };
      }
      if (!lot.exact) {
        const nextPending = pendingWithData(pending, { novo_valor: lot.row.nome, lote_nome: lot.row.nome, lote_id: lot.row.id });
        return {
          response: `Encontrei um lote parecido: ${lot.row.nome}. Quer usar esse lote?\n1 - Confirmar\n2 - Corrigir`,
          nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
        };
      }
      payload = { lote_id: lot.row.id };
      label = "lote";
    } else if (["fase", "status", "nome", "raca", "data_nascimento", "observacoes"].includes(field)) {
      payload = { [field]: String(value || "") };
    } else if (field === "peso") {
      payload = { peso: Number(value) };
    } else {
      return {
        response: "Não reconheci qual dado do animal deve ser atualizado. Envie de novo com lote, fase, status, nome, raça, peso, nascimento ou observação.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { campo_alterado: undefined, novo_valor: undefined }) } }
      };
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

    return realSaveResult(`Pronto, animal atualizado com sucesso.\n${animal.brinco}: ${label} atualizado.`, [TABLES.animais]);
  }

  if (pending.tipo === "CADASTRO_ANIMAL") {
    const duplicate = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (duplicate?.row && duplicate.exact) {
      return { response: `Já existe um animal com o brinco/código ${duplicate.row.brinco || dados.animal_codigo} neste rancho. Nada foi salvo.` };
    }

    await insertRealRecord(supabase, owner, TABLES.animais, {
      fazenda_id: owner.fazenda_id,
      brinco: dados.animal_codigo,
      nome: dados.nome || null,
      categoria: dados.categoria || "outro",
      sexo: dados.sexo || "nao_informado",
      fase: dados.fase || "nao_aplicavel",
      raca: dados.raca || null,
      peso: dados.peso !== undefined && dados.peso !== null && dados.peso !== "" ?Number(dados.peso) : null,
      lote_id: dados.lote_id || null,
      data_nascimento: dados.data_nascimento || null,
      status: "ativo",
      created_by: owner.usuario_id || null,
      observacoes: dados.observacoes || "Cadastrado via WhatsApp"
    });
    const details = [
      dados.nome ?`Nome: ${dados.nome}.` : "",
      `Brinco: ${dados.animal_codigo}.`,
      dados.sexo ?`Sexo: ${dados.sexo}.` : "",
      dados.fase ?`Fase: ${dados.fase}.` : "",
      dados.raca ?`Raça: ${dados.raca}.` : "",
      dados.peso ?`Peso: ${dados.peso} kg.` : "",
      dados.lote_nome ?`Lote: ${dados.lote_nome}.` : "",
      dados.data_nascimento ?`Nascimento: ${dados.data_nascimento}.` : "",
      dados.observacoes ?`Observações: ${dados.observacoes}.` : ""
    ].filter(Boolean).join("\n");
    return realSaveResult(`Pronto, animal cadastrado com sucesso.\n${details}`, [TABLES.animais]);
  }
}
