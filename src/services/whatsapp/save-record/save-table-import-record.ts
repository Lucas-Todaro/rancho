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

export async function saveTableImportRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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
  if (pending.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    return saveDomainTableImport(supabase, owner, pending);
  }

  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const rows = tabularImportRows(pending).filter((row) => row.status_validacao === "pronto");
    if (!rows.length) return { response: "Não encontrei linhas válidas para importar. Nada foi salvo." };

    const existingKeys = await existingAnimalEventKeysForImport(supabase, owner);
    let saved = 0;
    let skippedDuplicates = 0;

    for (const row of rows) {
      const key = importedTableEventKey(row);
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
        continue;
      }

      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: row.animal_id,
        tipo: row.db_tipo || "observacao",
        data_evento: isoFromReference(String(row.data_referencia || "hoje")),
        descricao: row.descricao_salvar || importedTableEventDescription(row),
        medicamento: null,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      existingKeys.add(key);
      saved += 1;
    }

    if (!saved) {
      return { response: `Nada novo foi importado. ${skippedDuplicates} linha(s) já estavam registradas como duplicadas.` };
    }

    const duplicateText = skippedDuplicates ?`\nDuplicadas ignoradas no salvamento: ${skippedDuplicates}.` : "";
    return realSaveResult(`Pronto, ${saved} evento(s) do rebanho importados com sucesso.${duplicateText}`, [TABLES.eventosAnimal]);
  }

  if (pending.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const rows = animalImportRows(pending).filter((row) => row.status_validacao === "pronto");
    if (!rows.length) return { response: "Não encontrei animais válidos para cadastrar. Nada foi salvo." };

    const animals = await listAnimals(supabase, owner);
    const existingAnimalCodes = new Set(
      animals
        .map((animal) => exactAnimalImportCodeKey(animal.brinco))
        .filter(Boolean)
    );
    const createMissingLots = Boolean(dados.criar_lotes_faltantes);
    const createdLots = new Map<string, string>();
    const savedTables = new Set<string>();
    let saved = 0;
    let skippedDuplicates = 0;
    let createdLotCount = 0;

    if (createMissingLots) {
      const missingLotNames = Array.from(new Set(
        rows
          .filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("lote_nao_encontrado"))
          .map((row) => String(row.lote_nome || "").trim())
          .filter(Boolean)
      ));

      for (const lotName of missingLotNames) {
        const existingLot = await findLot(supabase, owner, lotName);
        if (existingLot?.row && (existingLot.exact || existingLot.score >= 0.86)) {
          createdLots.set(exactAnimalImportCodeKey(lotName), String(existingLot.row.id || ""));
          continue;
        }

        const lot = await insertRealRecord(supabase, owner, TABLES.lotes, {
          fazenda_id: owner.fazenda_id,
          nome: lotName,
          descricao: "Criado via importacao tabular do WhatsApp",
          ativo: true
        });
        if (lot?.id) createdLots.set(exactAnimalImportCodeKey(lotName), String(lot.id));
        savedTables.add(TABLES.lotes);
        createdLotCount += 1;
      }
    }

    for (const row of rows) {
      const code = exactAnimalImportCodeKey(row.animal_codigo);
      if (!code || existingAnimalCodes.has(code)) {
        skippedDuplicates += 1;
        continue;
      }

      let lotId = row.lote_id || null;
      if (!lotId && createMissingLots && row.lote_nome) {
        lotId = createdLots.get(exactAnimalImportCodeKey(row.lote_nome)) || null;
      }

      await insertRealRecord(supabase, owner, TABLES.animais, {
        fazenda_id: owner.fazenda_id,
        brinco: code,
        nome: row.nome || null,
        categoria: row.categoria || "outro",
        sexo: row.sexo || "nao_informado",
        fase: row.fase || "nao_aplicavel",
        raca: row.raca || null,
        peso: row.peso !== undefined && row.peso !== null && row.peso !== "" ?Number(row.peso) : null,
        lote_id: lotId,
        data_nascimento: row.data_nascimento || null,
        status: row.status || "ativo",
        created_by: owner.usuario_id || null,
        observacoes: row.observacoes || "Cadastrado via importacao tabular do WhatsApp"
      });
      existingAnimalCodes.add(code);
      savedTables.add(TABLES.animais);
      saved += 1;
    }

    if (!saved) {
      return { response: `Nada novo foi cadastrado. ${skippedDuplicates} animal(is) ja existiam no rebanho.` };
    }

    const duplicateText = skippedDuplicates ?`\nDuplicados ignorados no salvamento: ${skippedDuplicates}.` : "";
    const lotText = createdLotCount ?`\nLotes criados: ${createdLotCount}.` : "";
    const baseResponse = `Pronto, ${saved} animal(is) cadastrados com sucesso.${lotText}${duplicateText}`;
    const sourceEvents = dados.eventos_apos_cadastro as ParsedRanchoMessage | undefined;
    if (sourceEvents?.tipo === "IMPORTACAO_EVENTOS_TABELA") {
      const nextEvents = await enrichTabularAnimalEventImport(supabase, owner, sourceEvents);
      return {
        response: `${baseResponse}\n\nAgora posso importar os eventos dessa tabela.\n${confirmationText(nextEvents)}`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextEvents } },
        savedReal: true,
        savedTables: Array.from(savedTables)
      };
    }

    return realSaveResult(baseResponse, Array.from(savedTables));
  }

  if (pending.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const rows = stockImportRows(pending).filter((row) => row.status_validacao === "pronto");
    if (!rows.length) return { response: "Não encontrei linhas válidas de estoque para importar. Nada foi salvo." };

    const createMissingItems = Boolean(dados.criar_itens_faltantes);
    const createdItems = new Map<string, AnyRecord>();
    const savedTables = new Set<string>();
    let saved = 0;
    let createdItemCount = 0;

    if (createMissingItems) {
      const missingItemRows = rows.filter((row) => row.criar_item_estoque);
      const missingItemNames = Array.from(new Set(
        missingItemRows
          .map((row) => String(row.item_nome || row.item_original || "").trim())
          .filter(Boolean)
      ));

      for (const itemName of missingItemNames) {
        const existingItem = await findStockItem(supabase, owner, itemName);
        if (existingItem?.row && (existingItem.exact || existingItem.score >= 0.86)) {
          createdItems.set(normalizeCatalogText(itemName), existingItem.row);
          continue;
        }

        const firstRow = missingItemRows.find((row) => normalizeCatalogText(row.item_nome || row.item_original) === normalizeCatalogText(itemName));
        const item = await insertRealRecord(supabase, owner, TABLES.estoqueItens, {
          fazenda_id: owner.fazenda_id,
          nome: itemName,
          categoria: stockCategoryFromName(itemName),
          unidade_medida: firstRow?.unidade || "unidade",
          quantidade_atual: 0,
          quantidade_minima: 0,
          valor_unitario: firstRow?.valor ?Number(firstRow.valor) / Math.max(1, Number(firstRow.quantidade || 1)) : 0,
          fornecedor: null,
          ativo: true,
          created_by: owner.usuario_id || null
        });
        if (item?.id) createdItems.set(normalizeCatalogText(itemName), item as AnyRecord);
        savedTables.add(TABLES.estoqueItens);
        createdItemCount += 1;
      }
    }

    for (const row of rows) {
      let itemId = row.item_id || null;
      let itemName = row.item_resolvido || row.item_nome || row.item_original || "item";
      let unit = row.unidade_resolvida || row.unidade || "unidade";

      if (!itemId && createMissingItems && row.criar_item_estoque) {
        const createdItem = createdItems.get(normalizeCatalogText(row.item_nome || row.item_original));
        itemId = createdItem?.id || null;
        itemName = createdItem?.nome || itemName;
        unit = createdItem?.unidade_medida || unit;
      }

      if (!itemId) continue;

      await insertRealRecord(supabase, owner, TABLES.estoqueMovimentacoes, {
        fazenda_id: owner.fazenda_id,
        item_id: itemId,
        tipo: row.tipo_movimento === "saida" ?"saida" : "entrada",
        quantidade: Number(row.quantidade),
        valor_unitario: row.valor ?Number(row.valor) / Math.max(1, Number(row.quantidade || 1)) : null,
        motivo: `Importado por tabela via WhatsApp: ${itemName} (${unit})`,
        responsavel_usuario_id: owner.usuario_id || null,
        origem: "whatsapp"
      });
      savedTables.add(TABLES.estoqueMovimentacoes);
      saved += 1;
    }

    if (!saved) return { response: "Nenhuma movimentação de estoque foi importada. Nada foi salvo." };

    const itemText = createdItemCount ?`\nItens criados: ${createdItemCount}.` : "";
    return realSaveResult(`Importação de estoque concluída:\n- ${saved} linha(s) importada(s).${itemText}`, Array.from(savedTables));
  }
}
