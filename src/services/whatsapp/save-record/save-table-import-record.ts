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

function normalizeEnumValue(value: unknown, allowedValues: string[], fallback: string) {
  const normalized = normalizeRanchoText(String(value || "")).replace(/\s+/g, "_");
  return allowedValues.find((item) => normalizeRanchoText(item).replace(/\s+/g, "_") === normalized) || fallback;
}

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
    let savedWithChild = 0;
    let skippedChildRows = 0;
    let skippedDuplicates = 0;

    for (const row of rows) {
      if (row.evento_tipo === "parto" && row.parto_cria_cadastro && row.cria_sexo && row.cria_codigo) {
        const partoDados = {
          animal_codigo: row.animal_codigo,
          data_referencia: row.data_referencia || "hoje",
          parto_cria_cadastro: true,
          cria_sexo: row.cria_sexo,
          cria_codigo: row.cria_codigo,
          cria_nome: row.cria_nome || undefined,
          cria_categoria: "bezerro",
          pai_ref: row.pai_ref || undefined
        };
        const partoPending = refreshRanchoMessage({
          tipo: "PARTO",
          confianca: 0.94,
          dados: partoDados,
          resumo: "",
          perguntas_faltantes: []
        }, partoDados);
        const result = await saveConfirmedRecord(supabase, owner, partoPending);
        if (result.savedReal) {
          saved += 1;
          savedWithChild += 1;
        } else {
          skippedChildRows += 1;
        }
        continue;
      }

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

    if (!saved && skippedChildRows) {
      return { response: `Nenhum evento foi salvo porque ${skippedChildRows} parto(s) com cria precisam de revisao antes do cadastro da cria.` };
    }

    if (!saved) {
      return { response: `Nada novo foi importado. ${skippedDuplicates} linha(s) já estavam registradas como duplicadas.` };
    }

    const duplicateText = skippedDuplicates ?`\nDuplicadas ignoradas no salvamento: ${skippedDuplicates}.` : "";
    const childText = savedWithChild ?`\nPartos com cria cadastrada: ${savedWithChild}.` : "";
    const childSkippedText = skippedChildRows ?`\nPartos com cria completa que precisam revisao: ${skippedChildRows}.` : "";
    const savedTables = savedWithChild ?[TABLES.eventosAnimal, TABLES.animais] : [TABLES.eventosAnimal];
    return realSaveResult(`Pronto, ${saved} evento(s) do rebanho importados com sucesso.${childText}${childSkippedText}${duplicateText}`, savedTables);
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
        categoria: normalizeEnumValue(row.categoria, ["vaca", "boi", "bezerro", "bezerra", "novilha", "touro", "outro"], "outro"),
        sexo: normalizeEnumValue(row.sexo, ["femea", "macho", "nao_informado"], "nao_informado"),
        fase: normalizeEnumValue(row.fase, ["lactacao", "seca", "gestante", "vazia", "crescimento", "engorda", "nao_aplicavel"], "nao_aplicavel"),
        raca: row.raca || null,
        peso: row.peso !== undefined && row.peso !== null && row.peso !== "" ?Number(row.peso) : null,
        lote_id: lotId,
        data_nascimento: row.data_nascimento || null,
        status: normalizeEnumValue(row.status, ["ativo", "vendido", "morto", "inativo"], "ativo"),
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
    const resolvedItems = new Map<string, AnyRecord>();
    const balanceByItemId = new Map<string, number>();
    const savedTables = new Set<string>();
    let saved = 0;
    let registeredItemCount = 0;
    let createdItemCount = 0;
    let skippedInsufficientStock = 0;
    const insufficientStockItems: string[] = [];

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
        if (item?.id) balanceByItemId.set(String(item.id), Number(item.quantidade_atual || 0));
        savedTables.add(TABLES.estoqueItens);
        createdItemCount += 1;
      }
    }

    for (const row of rows) {
      if (row.tipo_linha_estoque === "cadastro_item") {
        const itemName = String(row.item_nome || row.item_original || "").trim();
        if (!itemName) continue;

        const existingItem = await findStockItem(supabase, owner, itemName);
        if (existingItem?.row && (existingItem.exact || existingItem.score >= 0.86)) {
          continue;
        }

        await insertRealRecord(supabase, owner, TABLES.estoqueItens, {
          fazenda_id: owner.fazenda_id,
          nome: itemName,
          categoria: normalizeEnumValue(row.categoria || row.categoria_original || stockCategoryFromName(itemName), ["racao", "medicamento", "insumo", "equipamento", "outro"], "outro"),
          unidade_medida: row.unidade || row.unidade_original || "unidade",
          quantidade_atual: Number(row.quantidade_atual ?? row.quantidade ?? 0),
          quantidade_minima: Number(row.quantidade_minima ?? 0),
          valor_unitario: Number(row.valor_unitario ?? 0),
          fornecedor: row.fornecedor || null,
          ativo: row.ativo === false ?false : true,
          created_by: owner.usuario_id || null
        });
        savedTables.add(TABLES.estoqueItens);
        registeredItemCount += 1;
        continue;
      }

      let itemId = row.item_id || null;
      let itemName = row.item_resolvido || row.item_nome || row.item_original || "item";
      let unit = row.unidade_resolvida || row.unidade || "unidade";
      let itemRecord: AnyRecord | null = null;

      if (!itemId && createMissingItems && row.criar_item_estoque) {
        const createdItem = createdItems.get(normalizeCatalogText(row.item_nome || row.item_original));
        itemId = createdItem?.id || null;
        itemName = createdItem?.nome || itemName;
        unit = createdItem?.unidade_medida || unit;
        itemRecord = createdItem || null;
      }

      if (!itemRecord && itemId) {
        itemRecord = resolvedItems.get(String(itemId)) || null;
      }

      if (!itemRecord && itemName) {
        const foundItem = await findStockItem(supabase, owner, String(itemName));
        if (foundItem?.row && !foundItem.ambiguousRows?.length && String(foundItem.row.id || "") === String(itemId || foundItem.row.id || "")) {
          itemRecord = foundItem.row;
          itemId = itemId || foundItem.row.id || null;
          itemName = foundItem.row.nome || itemName;
          unit = foundItem.row.unidade_medida || unit;
          if (itemId) resolvedItems.set(String(itemId), itemRecord);
        }
      }

      if (!itemId) continue;

      const type = row.tipo_movimento === "saida" ?"saida" : "entrada";
      const quantity = Number(row.quantidade || 0);
      const itemKey = String(itemId);
      if (!balanceByItemId.has(itemKey)) {
        balanceByItemId.set(itemKey, Number(itemRecord?.quantidade_atual || 0));
      }

      if (type === "saida") {
        const currentBalance = Number(balanceByItemId.get(itemKey) || 0);
        if (quantity > currentBalance) {
          skippedInsufficientStock += 1;
          insufficientStockItems.push(`${itemName}: ${formatStockAmount(currentBalance, unit)} disponível, baixa de ${formatStockAmount(quantity, unit)}`);
          continue;
        }
      }

      try {
        await insertRealRecord(supabase, owner, TABLES.estoqueMovimentacoes, {
        fazenda_id: owner.fazenda_id,
        item_id: itemId,
        tipo: type,
        quantidade: quantity,
        valor_unitario: row.valor ?Number(row.valor) / Math.max(1, Number(row.quantidade || 1)) : null,
        motivo: `Importado por tabela via WhatsApp: ${itemName} (${unit})`,
        responsavel_usuario_id: owner.usuario_id || null,
        origem: "whatsapp"
      });
      } catch (error) {
        const errorMessage = safeErrorText(error);
        if (type === "saida" && /estoque insuficiente|saldo insuficiente|insufficient stock/i.test(errorMessage)) {
          skippedInsufficientStock += 1;
          insufficientStockItems.push(`${itemName}: baixa de ${formatStockAmount(quantity, unit)}`);
          continue;
        }
        throw error;
      }
      const previousBalance = Number(balanceByItemId.get(itemKey) || 0);
      balanceByItemId.set(itemKey, type === "saida" ?previousBalance - quantity : previousBalance + quantity);
      savedTables.add(TABLES.estoqueMovimentacoes);
      saved += 1;
    }

    if (!saved && !createdItemCount && !registeredItemCount) return { response: "Nenhuma movimentação de estoque foi importada. Nada foi salvo." };

    const registeredText = registeredItemCount ?`\nItens cadastrados: ${registeredItemCount}.` : "";
    const movementText = saved ?`\nMovimentações importadas: ${saved}.` : "";
    const itemText = createdItemCount ?`\nItens criados automaticamente para movimentações: ${createdItemCount}.` : "";
    const skippedText = skippedInsufficientStock
      ?`\nBaixas ignoradas por saldo insuficiente: ${skippedInsufficientStock}.${insufficientStockItems.length ?`\n${insufficientStockItems.slice(0, 5).map((item) => `- ${item}`).join("\n")}` : ""}`
      : "";
    return realSaveResult(`Importação de estoque concluída:${registeredText}${movementText}${itemText}${skippedText}`, Array.from(savedTables));
  }
}
