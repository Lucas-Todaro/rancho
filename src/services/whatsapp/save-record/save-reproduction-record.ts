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

export async function saveReproductionRecord(ctx: SaveRecordHandlerContext): Promise<SaveResult> {
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

    if (pending.tipo === "PARTO") {
      botPartoSaveLog("parto_save_start", owner, {
        mother_ref: dados.animal_codigo || null,
        child_code: dados.cria_codigo || null,
        has_child: partoWithChild(dados)
      });
      botPartoSaveLog("parto_confirm_start", owner, {
        mother_ref: dados.animal_codigo || null,
        child_code: dados.cria_codigo || null,
        has_child: partoWithChild(dados)
      });
      botPartoSaveLog("parto_save_mother_resolved", owner, {
        mother_id: animal.id,
        mother_ref: animal.brinco || animal.nome || null
      });
      botPartoSaveLog("parto_confirm_mother_resolved", owner, {
        mother_id: animal.id,
        mother_ref: animal.brinco || animal.nome || null
      });
      if (partoWithChild(dados)) {
        const hasConcreteChildData = Boolean(
          normalizeCalfSex(dados.cria_sexo)
          || dados.cria_codigo
          || dados.gerar_cria_codigo_temporario
          || dados.cria_nome
          || dados.cria_ref
          || dados.pai_ref
          || dados.pai_nome
          || dados.pai_id
        );
        if (!hasConcreteChildData) {
          botPartoSaveLog("parto_save_child_skipped", owner, {
            reason: "child_data_incomplete",
            mother_id: animal.id,
            mother_ref: animal.brinco || animal.nome || null
          });
          return {
            response: "A cria nasceu macho ou femea? Se tiver codigo ou nome, me envie tambem.",
            nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { cria_sexo: undefined }) } }
          };
        }

        if (animalSexKind(animal) === "macho") {
          return { response: `O animal ${animalLabel(animal)} esta marcado como macho. Para registrar parto com cria, informe uma mae femea. Nada foi salvo.` };
        }

        const childSex = normalizeCalfSex(dados.cria_sexo);
        if (!childSex) {
          return {
            response: "Informe se a cria nasceu macho ou femea antes de salvar.",
            nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { cria_sexo: undefined }) } }
          };
        }

        const childCode = calfCodeFromParto({ ...dados, cria_sexo: childSex }, animal);
        if (!childCode) {
          return {
            response: "Qual e o codigo/brinco da cria? Responda 2 para gerar um codigo temporario.",
            nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { cria_codigo: undefined }) } }
          };
        }

        const duplicateChild = await findAnimal(supabase, owner, childCode);
        const existingChild = duplicateChild?.row && duplicateChild.exact && isSamePartoChild(duplicateChild.row, dados, animal)
          ? duplicateChild.row
          : null;
        if (duplicateChild?.row && duplicateChild.exact && !existingChild) {
          return {
            response: `Ja existe um animal com o codigo/brinco ${childCode}. Me envie outro codigo para a cria ou responda 2 para gerar um codigo temporario.`,
            nextSession: {
              etapa: "aguardando_dado",
              dados: {
                pending: pendingWithData(pending, {
                  cria_codigo: undefined,
                  gerar_cria_codigo_temporario: undefined,
                  cria_codigo_duplicado: childCode
                })
              }
            }
          };
        }

        const duplicatePartos = await existingPartoSameDay(supabase, owner, animal.id, dados.data_referencia);
        if (existingChild && duplicatePartos.some((event) => normalizeRanchoText(String(event.descricao || "")).includes(normalizeRanchoText(childCode)))) {
          botPartoSaveLog("parto_save_child_skipped", owner, {
            child_id: existingChild.id,
            child_code: childCode,
            reason: "already_registered"
          });
          botPartoSaveLog("parto_save_mother_status_updated", owner, {
            mother_id: animal.id,
            status: "recem_parida",
            source: "existing_parto_event"
          });
          return {
            response: `O parto da ${animalLabel(animal)} com a cria ${childCode} ja estava registrado. Nenhum registro foi duplicado.`,
            savedReal: false,
            savedTables: []
          };
        }
        if (duplicatePartos.length && !dados.confirmar_duplicidade_parto) {
          const nextPending = pendingWithData(pending, { confirmar_duplicidade_parto: true, cria_codigo: childCode, cria_sexo: childSex });
          return {
            response: partoDuplicateConfirmationMessage(animal, String(dados.data_referencia || "hoje")),
            nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
          };
        }

        let father: AnyRecord | null = null;
        if (dados.pai_resolvido && typeof dados.pai_resolvido === "object") {
          father = dados.pai_resolvido as AnyRecord;
        } else if (dados.pai_id) {
          const animals = await listAnimals(supabase, owner);
          father = animals.find((row) => String(row.id) === String(dados.pai_id)) || null;
        } else if (dados.pai_ref || dados.pai_nome) {
          const fatherRef = String(dados.pai_ref || dados.pai_nome || "").trim();
          const fatherFound = await findAnimal(supabase, owner, fatherRef);
          if (fatherFound?.ambiguousRows?.length) {
            return {
              response: `Encontrei mais de um pai parecido. Me envie o brinco correto ou responda sem pai:\n${animalOptionsText(fatherFound.ambiguousRows)}`,
              nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { pai_ref: undefined, pai_nome: undefined, pai_id: undefined, precisa_pai_ref: true }) } }
            };
          }
          if (!fatherFound?.row || (!fatherFound.exact && fatherFound.score < 0.86)) {
            return {
              response: `Nao encontrei o pai "${fatherRef}". Me envie o brinco do pai ou responda sem pai.`,
              nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { pai_ref: undefined, pai_nome: undefined, pai_id: undefined, precisa_pai_ref: true }) } }
            };
          }
          father = fatherFound.row;
        }

        if (father && animalSexKind(father) === "femea") {
          return { response: `O pai informado (${animalLabel(father)}) esta marcado como femea. Corrija o pai ou registre o parto sem pai informado. Nada foi salvo.` };
        }

        const normalizedDados = {
          ...dados,
          cria_codigo: childCode,
          cria_sexo: childSex,
          cria_categoria: calfCategoryForSex(childSex) || "bezerro"
        };

        let saveStage = "child";
        let child = existingChild;
        let childCreated = false;
        let birthEvent: AnyRecord | null = null;
        let childPayloadForLog: AnyRecord | null = null;
        let motherPhaseUpdated = false;
        const motherPhaseBeforeParto = animal.fase || null;
        try {
          if (!child) {
            const childPayload = calfPayloadFromParto(owner, normalizedDados, animal, father);
            childPayloadForLog = childPayload;
            botPartoSaveLog("parto_child_payload_final", owner, {
              child_code: childPayload.brinco || null,
              child_sex_raw: dados.cria_sexo || null,
              child_sex_normalized: childPayload.sexo || null,
              child_category: childPayload.categoria || null,
              child_insert_payload: safeBotPayload(TABLES.animais, childPayload)
            });
            botPartoSaveLog("parto_confirm_child_payload", owner, {
              child_code: childPayload.brinco || null,
              child_sex: childPayload.sexo || null,
              child_category: childPayload.categoria || null,
              mother_id: childPayload.mae_id || null,
              father_id: childPayload.pai_id || null
            });
            child = await insertRealRecord(supabase, owner, TABLES.animais, childPayload);
            childCreated = true;
            botPartoSaveLog("parto_save_child_created", owner, {
              child_id: child?.id || null,
              child_code: childCode
            });
            botPartoSaveLog("parto_confirm_child_created", owner, {
              child_id: child?.id || null,
              child_code: childCode
            });
          } else {
            botPartoSaveLog("parto_save_child_skipped", owner, {
              child_id: child.id,
              child_code: childCode,
              reason: "matching_child_already_exists"
            });
          }

          botPartoSaveLog("parto_save_genealogy_created", owner, {
            child_id: child?.id || null,
            mother_id: animal.id,
            father_id: father?.id || null
          });
          botPartoSaveLog("parto_confirm_genealogy_created", owner, {
            child_id: child?.id || null,
            mother_id: animal.id,
            father_id: father?.id || null
          });

          saveStage = "reproduction_event";
          birthEvent = await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
            fazenda_id: owner.fazenda_id,
            animal_id: animal.id,
            tipo: "parto",
            data_evento: isoFromReference(dados.data_referencia),
            descricao: partoChildEventDescription(normalizedDados, animal, childCode, father),
            medicamento: null,
            dose: null,
            custo: 0,
            responsavel_usuario_id: owner.usuario_id || null
          });
          botPartoSaveLog("parto_save_reproduction_event_created", owner, {
            event_id: birthEvent?.id || null,
            mother_id: animal.id
          });
          botPartoSaveLog("parto_confirm_reproduction_created", owner, {
            event_id: birthEvent?.id || null,
            mother_id: animal.id
          });
        } catch (error) {
          const compensationErrors: string[] = [];
          if (birthEvent?.id) {
            const rollbackEvent = await supabase
              .from(TABLES.eventosAnimal)
              .delete()
              .eq("id", birthEvent.id)
              .eq("fazenda_id", owner.fazenda_id);
            if (rollbackEvent.error?.message) compensationErrors.push(rollbackEvent.error.message);
          }
          if (childCreated && child?.id) {
            const rollbackChild = await supabase
              .from(TABLES.animais)
              .delete()
              .eq("id", child.id)
              .eq("fazenda_id", owner.fazenda_id);
            if (rollbackChild.error?.message) compensationErrors.push(rollbackChild.error.message);
          }
          const compensationError = compensationErrors.join(" | ") || null;
          const errorMessage = safeErrorText(error);
          const supabaseError = error as { supabaseErrorCode?: string | null; supabaseErrorMessage?: string | null };
          if (saveStage === "child") {
            botPartoSaveLog("parto_child_save_failed", owner, {
              stage: "child",
              animalRef: animal.brinco || animal.nome || dados.animal_codigo || null,
              childPayload: childPayloadForLog ? safeBotPayload(TABLES.animais, childPayloadForLog) : null,
              supabaseErrorCode: supabaseError.supabaseErrorCode || null,
              supabaseErrorMessage: supabaseError.supabaseErrorMessage || null,
              errorMessage
            });
          }
          botPartoSaveLog("parto_save_error", owner, {
            stage: saveStage,
            mother_id: animal.id,
            child_code: childCode,
            compensation_error: compensationError,
            message: errorMessage
          });
          botPartoSaveLog("parto_confirm_error", owner, {
            stage: saveStage,
            mother_id: animal.id,
            child_code: childCode,
            compensation_error: compensationError,
            message: errorMessage
          });
          if (/duplicate|duplicad|23505|unique/i.test(errorMessage)) {
            return {
              response: `Ja existe um animal com o codigo/brinco ${childCode}. Me envie outro codigo para a cria ou responda 2 para gerar um codigo temporario.`,
              nextSession: {
                etapa: "aguardando_dado",
                dados: {
                  pending: pendingWithData(pending, {
                    cria_codigo: undefined,
                    gerar_cria_codigo_temporario: undefined,
                    cria_codigo_duplicado: childCode
                  })
                }
              }
            };
          }
          return {
            response: `Nao consegui concluir o parto na etapa ${saveStage}. Nenhum novo registro foi mantido. Tente confirmar novamente.`,
            nextSession: { etapa: "aguardando_confirmacao", dados: { pending } }
          };
        }

        // A cria, o vínculo genealógico e o parto formam a operação principal.
        // A fase produtiva da mãe é uma atualização derivada e não pode desfazer
        // esses registros caso o schema da fazenda rejeite essa atualização.
        try {
          motherPhaseUpdated = await updateMotherPhaseAfterParto(supabase, owner, animal);
          botPartoSaveLog("parto_save_mother_status_updated", owner, {
            mother_id: animal.id,
            status: "recem_parida",
            source: "parto_event",
            previous_phase: motherPhaseBeforeParto,
            phase: animal.fase || null,
            phase_updated: motherPhaseUpdated,
            category_preserved: animal.categoria || null,
            lot_preserved: animal.lote_id || null
          });
          botPartoSaveLog("parto_confirm_mother_status_updated", owner, {
            mother_id: animal.id,
            status: "recem_parida",
            source: "parto_event",
            previous_phase: motherPhaseBeforeParto,
            phase: animal.fase || null,
            phase_updated: motherPhaseUpdated,
            category_preserved: animal.categoria || null,
            lot_preserved: animal.lote_id || null
          });
        } catch (error) {
          botPartoSaveLog("parto_save_mother_status_update_error", owner, {
            stage: "mother_phase",
            mother_id: animal.id,
            child_id: child?.id || null,
            child_code: childCode,
            event_id: birthEvent?.id || null,
            message: safeErrorText(error)
          });
        }

        const savedTables: string[] = existingChild ? [TABLES.eventosAnimal] : [TABLES.animais, TABLES.eventosAnimal];
        if (motherPhaseUpdated && !savedTables.includes(TABLES.animais)) savedTables.push(TABLES.animais);

        return realSaveResult([
          `Pronto, parto registrado e cria ${childCode} cadastrada.`,
          `Mae: ${animalLabel(animal)}.`,
          `Pai: ${father ? animalLabel(father) : "nao informado"}.`,
          "A mae agora aparece como recem-parida.",
          motherPhaseUpdated ? "Fase produtiva atualizada para lactacao." : ""
        ].filter(Boolean).join("\n"), savedTables);
      }

      botPartoSaveLog("parto_save_child_skipped", owner, { reason: "parto_without_child_registration" });
      let birthEvent: AnyRecord | null = null;
      let motherPhaseUpdated = false;
      const motherPhaseBeforeParto = animal.fase || null;
      try {
        birthEvent = await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
          fazenda_id: owner.fazenda_id,
          animal_id: animal.id,
          tipo: "parto",
          data_evento: isoFromReference(dados.data_referencia),
          descricao: `Parto registrado via WhatsApp para o animal ${animal.brinco}`,
          medicamento: null,
          dose: null,
          custo: 0,
          responsavel_usuario_id: owner.usuario_id || null
        });
        botPartoSaveLog("parto_save_reproduction_event_created", owner, {
          event_id: birthEvent?.id || null,
          mother_id: animal.id
        });
        motherPhaseUpdated = await updateMotherPhaseAfterParto(supabase, owner, animal);
      } catch (error) {
        if (birthEvent?.id) {
          await supabase
            .from(TABLES.eventosAnimal)
            .delete()
            .eq("id", birthEvent.id)
            .eq("fazenda_id", owner.fazenda_id);
        }
        throw error;
      }
      botPartoSaveLog("parto_save_mother_status_updated", owner, {
        mother_id: animal.id,
        status: "recem_parida",
        source: "parto_event",
        previous_phase: motherPhaseBeforeParto,
        phase: animal.fase || null,
        phase_updated: motherPhaseUpdated,
        category_preserved: animal.categoria || null,
        lot_preserved: animal.lote_id || null
      });
      const savedTables: string[] = [TABLES.eventosAnimal];
      if (motherPhaseUpdated) savedTables.push(TABLES.animais);
      return realSaveResult([
        "Pronto, registro salvo com sucesso.",
        `Parto registrado para ${animal.brinco}.`,
        "A mae agora aparece como recem-parida.",
        motherPhaseUpdated ? "Fase produtiva atualizada para lactacao." : ""
      ].filter(Boolean).join("\n"), savedTables);
    }
}
