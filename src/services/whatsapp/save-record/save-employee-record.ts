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

export async function saveEmployeeRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "CRIAR_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para cadastrar funcionários pelo bot. Peça para um administrador fazer esse cadastro." };
    }

    const phone = normalizeWhatsappNumber(dados.telefone);
    if (!isValidBotPhone(phone)) {
      return {
        response: "Informe um WhatsApp válido para o funcionário.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { telefone: undefined }) } }
      };
    }

    const { data: employees, error: employeesError } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,cpf,contato_whatsapp,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (employeesError) throw new Error(employeesError.message);

    const duplicateEmployee = ((employees || []) as AnyRecord[]).find((row) => (
      row.ativo !== false && !row.deleted_at && whatsappNumbersMatch(phone, String(row.contato_whatsapp || ""))
    ));
    if (duplicateEmployee) {
      return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está vinculado ao funcionário ${duplicateEmployee.nome}.` };
    }

    const cpf = String(dados.cpf || "").replace(/\D/g, "");
    if (cpf && cpf.length !== 11) {
      return { response: "Informe um CPF válido para o funcionário ou responda 2 para deixar sem CPF." };
    }
    if (cpf) {
      const duplicateCpf = ((employees || []) as AnyRecord[]).find((row) => (
        row.ativo !== false && !row.deleted_at && String(row.cpf || "").replace(/\D/g, "") === cpf
      ));
      if (duplicateCpf) return { response: `Não cadastrei. O CPF informado já está vinculado ao funcionário ${duplicateCpf.nome}.` };
    }

    let whatsappRows: AnyRecord[] = [];
    {
      const { data, error } = await supabase
        .from(TABLES.whatsappUsuarios)
        .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (error) throw new Error(error.message);
      whatsappRows = (data || []) as AnyRecord[];

      const activeWhatsapp = whatsappRows.find((row) => (
        row.ativo !== false && whatsappNumbersMatch(phone, String(row.telefone_e164 || ""))
      ));
      if (activeWhatsapp) {
        return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está ativo para ${activeWhatsapp.nome_exibicao || "outro usuário"}.` };
      }
    }

    const employee = await insertRealRecord(supabase, owner, TABLES.funcionarios, {
      fazenda_id: owner.fazenda_id,
      nome: dados.funcionario_nome,
      funcao: dados.funcao || "Funcionário",
      cpf: cpf || null,
      contato_whatsapp: phone,
      salario_base: Number(dados.salario_base || 0),
      data_admissao: String(dados.data_admissao || dateOnly()).slice(0, 10),
      carga_horaria_mensal: 220,
      valor_hora_extra: 0,
      tipo_acesso: dados.tipo_acesso || "bot_only",
      papel_sistema: "bot_only",
      ativo: true
    });

    const savedTables: string[] = [TABLES.funcionarios];
    {
      const reusableWhatsapp = whatsappRows.find((row) => (
        whatsappNumbersMatch(phone, String(row.telefone_e164 || "")) && (row.ativo === false || !row.funcionario_id)
      ));
      const whatsappPayload = {
        fazenda_id: owner.fazenda_id,
        telefone_e164: phone,
        usuario_id: null,
        funcionario_id: employee.id,
        nome_exibicao: dados.funcionario_nome,
        papel_bot: "funcionario",
        ativo: true
      };

      if (reusableWhatsapp?.id) {
        const { error } = await supabase
          .from(TABLES.whatsappUsuarios)
          .update(whatsappPayload)
          .eq("id", reusableWhatsapp.id)
          .eq("fazenda_id", owner.fazenda_id);
        if (error) throw new Error(error.message);
      } else {
        await insertRealRecord(supabase, owner, TABLES.whatsappUsuarios, whatsappPayload);
      }
      savedTables.push(TABLES.whatsappUsuarios);
    }

    return realSaveResult(`Pronto, funcionário cadastrado com sucesso.\n${dados.funcionario_nome}: ${formatWhatsappForBot(phone)}.`, savedTables);
  }

  if (pending.tipo === "ATUALIZAR_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para atualizar funcionários pelo bot. Peça para um administrador fazer essa alteração." };
    }

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

    const field = String(dados.campo_alterado || "");
    const value = dados.novo_valor;
    let payload: AnyRecord = {};
    let label = field;
    const savedTables: string[] = [TABLES.funcionarios];

    if (field === "salario_base") {
      payload = { salario_base: Number(value || 0) };
      label = "salário";
    } else if (field === "contato_whatsapp") {
      const phone = normalizeWhatsappNumber(value);
      if (!isValidBotPhone(phone)) {
        return {
          response: "Informe um WhatsApp válido para o funcionário.",
          nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { novo_valor: undefined }) } }
        };
      }

      const { data: employees, error: employeesError } = await supabase
        .from(TABLES.funcionarios)
        .select("id,nome,contato_whatsapp,ativo,deleted_at")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (employeesError) throw new Error(employeesError.message);
      const duplicateEmployee = ((employees || []) as AnyRecord[]).find((row) => (
        row.id !== found.row.id && row.ativo !== false && !row.deleted_at && whatsappNumbersMatch(phone, String(row.contato_whatsapp || ""))
      ));
      if (duplicateEmployee) {
        return { response: `Não atualizei. O WhatsApp ${formatWhatsappForBot(phone)} já está vinculado ao funcionário ${duplicateEmployee.nome}.` };
      }

      const { data: whatsappRows, error: whatsappError } = await supabase
        .from(TABLES.whatsappUsuarios)
        .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (whatsappError) throw new Error(whatsappError.message);
      const rows = (whatsappRows || []) as AnyRecord[];
      const activeWhatsapp = rows.find((row) => (
        row.funcionario_id !== found.row.id && row.ativo !== false && whatsappNumbersMatch(phone, String(row.telefone_e164 || ""))
      ));
      if (activeWhatsapp) {
        return { response: `Não atualizei. O WhatsApp ${formatWhatsappForBot(phone)} já está ativo para ${activeWhatsapp.nome_exibicao || "outro usuário"}.` };
      }

      payload = { contato_whatsapp: phone };
      label = "WhatsApp";
    } else if (field === "cpf") {
      const cpf = String(value || "").replace(/\D/g, "");
      if (cpf && cpf.length !== 11) {
        return {
          response: "Informe um CPF com 11 dígitos ou envie cancelar.",
          nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { novo_valor: undefined }) } }
        };
      }
      payload = { cpf: cpf || null };
      label = "CPF";
    } else if (field === "nome") {
      payload = { nome: String(value || "").trim() };
      label = "nome";
    } else if (field === "funcao") {
      payload = { funcao: String(value || "").trim() };
      label = "cargo";
    } else if (field === "ativo") {
      payload = { ativo: Boolean(value) };
      label = "status";
    } else {
      return {
        response: "Não reconheci qual dado do funcionário deve ser atualizado. Envie de novo com salário, cargo, WhatsApp, CPF, nome ou status.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { campo_alterado: undefined, novo_valor: undefined }) } }
      };
    }

    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .update(payload)
      .eq("id", found.row.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.funcionarios, "update", data || { ...found.row, ...payload });

    if (field === "contato_whatsapp" && payload.contato_whatsapp) {
      const { data: whatsappRows, error: whatsappError } = await supabase
        .from(TABLES.whatsappUsuarios)
        .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (whatsappError) throw new Error(whatsappError.message);
      const rows = (whatsappRows || []) as AnyRecord[];
      const current = rows.find((row) => row.funcionario_id === found.row.id)
        || rows.find((row) => whatsappNumbersMatch(payload.contato_whatsapp, String(row.telefone_e164 || "")) && (row.ativo === false || !row.funcionario_id));
      const whatsappPayload = {
        fazenda_id: owner.fazenda_id,
        telefone_e164: payload.contato_whatsapp,
        usuario_id: null,
        funcionario_id: found.row.id,
        nome_exibicao: payload.nome || found.row.nome,
        papel_bot: "funcionario",
        ativo: true
      };
      if (current?.id) {
        const { error: updateWhatsappError } = await supabase
          .from(TABLES.whatsappUsuarios)
          .update(whatsappPayload)
          .eq("id", current.id)
          .eq("fazenda_id", owner.fazenda_id);
        if (updateWhatsappError) throw new Error(updateWhatsappError.message);
      } else {
        await insertRealRecord(supabase, owner, TABLES.whatsappUsuarios, whatsappPayload);
      }
      savedTables.push(TABLES.whatsappUsuarios);
    }

    return realSaveResult(`Pronto, funcionário atualizado com sucesso.\n${found.row.nome}: ${label} atualizado.`, savedTables);
  }

  if (pending.tipo === "DESLIGAR_FUNCIONARIO" || pending.tipo === "EXCLUIR_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para desligar ou excluir funcionários pelo bot. Peça para um administrador fazer essa alteração." };
    }

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

    const payload = pending.tipo === "EXCLUIR_FUNCIONARIO"
      ? { ativo: false, deleted_at: nowIso() }
      : { ativo: false };
    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .update(payload)
      .eq("id", found.row.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.funcionarios, "update", data || { ...found.row, ...payload });

    const { error: whatsappError } = await supabase
      .from(TABLES.whatsappUsuarios)
      .update({ ativo: false })
      .eq("funcionario_id", found.row.id)
      .eq("fazenda_id", owner.fazenda_id);
    if (whatsappError) throw new Error(whatsappError.message);

    const action = pending.tipo === "EXCLUIR_FUNCIONARIO" ?"excluído" : "desligado";
    return realSaveResult(`Pronto, funcionário ${action} com sucesso.\n${found.row.nome}.`, [TABLES.funcionarios, TABLES.whatsappUsuarios]);
  }
}
