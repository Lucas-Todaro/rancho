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

export async function saveStockRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "ESTOQUE_CADASTRO" || pending.tipo === "CRIAR_ITEM_ESTOQUE") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para criar itens de estoque. Peça para um administrador cadastrar esse item." };
    }

    const found = await findStockItem(supabase, owner, String(dados.item_nome || ""));
    if (found.row && found.exact) {
      return { response: `Não criei um novo item porque "${found.row.nome}" já existe no estoque.` };
    }

    if (found?.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.nome}`).join("\n");
      return {
        response: `Encontrei itens parecidos. Me envie o nome exato do item novo ou use um existente:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { item_nome: undefined }) } }
      };
    }

    if (found.row && found.score >= 0.86) {
      const nextPending = pendingWithData(pending, { item_nome: found.row.nome });
      return {
        response: `Encontrei um item parecido: ${found.row.nome}. Quer usar esse item em vez de criar outro?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    await insertRealRecord(supabase, owner, TABLES.estoqueItens, {
      fazenda_id: owner.fazenda_id,
      nome: dados.item_nome,
      categoria: stockCategoryFromName(String(dados.item_nome || "")),
      unidade_medida: dados.unidade || "unidade",
      quantidade_atual: Number(dados.quantidade || 0),
      quantidade_minima: 0,
      valor_unitario: 0,
      fornecedor: null,
      ativo: true,
      created_by: owner.usuario_id || null
    });

    if (dados.compra && dados.valor) {
      await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
        fazenda_id: owner.fazenda_id,
        tipo: "saida",
        data_transacao: dateOnlyFromReference(dados.data_referencia),
        valor: Number(dados.valor),
        categoria: dados.item_nome,
        descricao: `Compra de ${dados.item_nome} registrada via WhatsApp`,
        metodo_pagamento: "whatsapp",
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });

      return realSaveResult(
        `Pronto, item cadastrado no estoque e despesa registrada.\n${dados.item_nome}: ${formatStockAmount(dados.quantidade, dados.unidade)}.\nDespesa: ${formatMoney(dados.valor)}.`,
        [TABLES.estoqueItens, TABLES.transacoesFinanceiras]
      );
    }

    return realSaveResult(`Pronto, item cadastrado no estoque.\n${dados.item_nome}: ${formatStockAmount(dados.quantidade, dados.unidade)}.`, [TABLES.estoqueItens]);
  }

  if (pending.tipo === "ESTOQUE_ENTRADA" || pending.tipo === "ESTOQUE_SAIDA") {
    const found = await findStockItem(supabase, owner, String(dados.item_nome || ""));
    const stockResolution = stockResolutionDebug(dados.item_nome, found);
    if (!found.row) {
      const decision = stockDecisionReason(pending, found, owner);
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "item_nao_encontrado",
        stockResolution,
        decision
      });

      if (pending.tipo === "ESTOQUE_ENTRADA" && dados.compra && isBotAdmin(owner)) {
        return {
          response: `Não encontrei "${dados.item_nome || ""}" no estoque. Deseja criar o item de estoque ou registrar apenas como despesa?\n1 - Criar item de estoque\n2 - Registrar apenas despesa`,
          nextSession: { etapa: "aguardando_dado", dados: { pending, acao_pendente: "compra_item_nao_encontrado" } }
        };
      }

      if (pending.tipo === "ESTOQUE_SAIDA" && dados.venda && hasBotValue(dados.valor)) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "entrada",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: Number(dados.valor),
          categoria: dados.item_nome || "Venda via WhatsApp",
          descricao: `Venda de ${dados.item_nome || "item"} registrada via WhatsApp`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });

        return realSaveResult(`Pronto, receita salva com sucesso.\nReceita: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
      }

      return {
        response: `Não encontrei "${dados.item_nome || ""}" no estoque. Me envie o nome do item cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { item_nome: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "item_ambiguo",
        stockResolution,
        decision: "item_ambiguo: pedir_item_correto"
      });

      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.nome}`).join("\n");
      return {
        response: `Encontrei mais de um item parecido. Me envie o item correto:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { item_nome: undefined }) } }
      };
    }

    if (!found.exact) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "item_sugerido",
        stockResolution,
        decision: "item_parecido: pedir_confirmacao"
      });

      const nextPending = pendingWithData(pending, { item_nome: found.row.nome });
      return {
        response: `Encontrei um item parecido: ${found.row.nome}. Quer usar esse item?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const type = pending.tipo === "ESTOQUE_ENTRADA" ?"entrada" : "saida";
    const current = Number(found.row.quantidade_atual || 0);
    const quantity = Number(dados.quantidade || 0);

    if (pending.tipo === "ESTOQUE_SAIDA" && dados.venda && hasBotValue(dados.valor) && dados.deve_baixar_estoque !== true) {
      if (dados.deve_baixar_estoque === false) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "entrada",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: Number(dados.valor),
          categoria: dados.item_nome || found.row.nome,
          descricao: `Venda de ${dados.item_nome || found.row.nome} registrada via WhatsApp`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });

        return realSaveResult(`Pronto, receita salva com sucesso.\nReceita: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
      }

      return {
        response: physicalSaleStockDecisionQuestion(refreshRanchoMessage(pending, { ...dados, item_estoque_encontrado: true, item_id: found.row.id, item_resolvido: found.row.nome })),
        nextSession: { etapa: "aguardando_dado", dados: { pending: refreshRanchoMessage(pending, { ...dados, item_estoque_encontrado: true, item_id: found.row.id, item_resolvido: found.row.nome }), acao_pendente: "venda_baixa_estoque_opcional" } }
      };
    }

    if (type === "saida" && quantity > current) {
      return { response: `Não salvei. O saldo de ${found.row.nome} é ${formatStockAmount(current, found.row.unidade_medida)}, menor que a baixa pedida.` };
    }

    await insertRealRecord(supabase, owner, TABLES.estoqueMovimentacoes, {
      fazenda_id: owner.fazenda_id,
      item_id: found.row.id,
      tipo: type,
      quantidade: quantity,
      valor_unitario: found.row.valor_unitario || null,
      motivo: `Registrado via WhatsApp (${owner.telefone_e164})`,
      responsavel_usuario_id: owner.usuario_id || null,
      origem: "whatsapp"
    });

    if (pending.tipo === "ESTOQUE_SAIDA" && dados.venda && dados.valor) {
      botLog("stock_sale_decision", owner, {
        currentIntent: pending.tipo,
        status: "salvar_estoque_receita",
        stockResolution: stockResolutionDebug(dados.item_nome, found),
        decision: "item_encontrado: estoque+receita"
      });

      await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
        fazenda_id: owner.fazenda_id,
        tipo: "entrada",
        data_transacao: dateOnlyFromReference(dados.data_referencia),
        valor: Number(dados.valor),
        categoria: found.row.nome,
        descricao: `Venda de ${found.row.nome} registrada via WhatsApp`,
        metodo_pagamento: "whatsapp",
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });

      return realSaveResult(
        `Pronto, registros salvos com sucesso.\nSaída: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.\nReceita: ${formatMoney(dados.valor)}.`,
        [TABLES.estoqueMovimentacoes, TABLES.transacoesFinanceiras]
      );
    }

    if (pending.tipo === "ESTOQUE_ENTRADA" && dados.compra && dados.valor) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "salvar_estoque_financeiro",
        stockResolution: stockResolutionDebug(dados.item_nome, found),
        decision: "item_encontrado: estoque+financeiro"
      });

      await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
        fazenda_id: owner.fazenda_id,
        tipo: "saida",
        data_transacao: dateOnlyFromReference(dados.data_referencia),
        valor: Number(dados.valor),
        categoria: found.row.nome,
        descricao: `Compra de ${found.row.nome} registrada via WhatsApp`,
        metodo_pagamento: "whatsapp",
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });

      return realSaveResult(
        `Pronto, registros salvos com sucesso.\nEntrada: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.\nDespesa: ${formatMoney(dados.valor)}.`,
        [TABLES.estoqueMovimentacoes, TABLES.transacoesFinanceiras]
      );
    }

    return realSaveResult(`Pronto, movimentação salva com sucesso.\n${type === "entrada" ?"Entrada" : "Baixa"}: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.`, [TABLES.estoqueMovimentacoes]);
  }
}
