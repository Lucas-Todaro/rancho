import type { AnyRecord } from "@/lib/types";
import { executeActionPlan, type ExecuteActionPlanResult } from "@/lib/whatsapp/action-plan/execute-action-plan";
import { recordActionPlanRuntime } from "@/lib/whatsapp/action-plan/runtime";
import type { ActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import type { ActionPlanSupabaseLike } from "@/lib/whatsapp/action-plan/execute-query-action-plan";
import { botAllowsLegacyRollback, botInterpreterMode, geminiActionPlanEnabled, geminiTableActionPlanEnabled, GEMINI_SAFE_FAILURE_MESSAGE } from "@/lib/whatsapp/gemini/config";
import { GEMINI_CONSULT_INTENTS, mapGeminiIntentToRancho, normalizeGeminiIntent } from "@/lib/whatsapp/gemini/allowed-intents";
import { interpretWithGemini } from "@/lib/whatsapp/gemini/interpreter";
import type { GeminiStructuredAction, GeminiStructuredResult } from "@/lib/whatsapp/gemini/types";
import { buildMissing, finalize } from "@/lib/whatsapp/nlp-core/result";
import type { ParsedRanchoMessage, RanchoIntent } from "@/lib/whatsapp/nlp";
import { normalizeRanchoText, parseRanchoMessage } from "@/lib/whatsapp/nlp";
import { calfCategoryForSex, normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { detectStructuredInput, parseTabularAnimalEventsMessageAs } from "@/lib/whatsapp/nlp-core/tabular-events";
import { domainFromGeminiTableDomain } from "@/lib/whatsapp/nlp-core/tabular-domain-router";
import { detectDestructiveBulkAction, destructiveBulkActionParsed } from "@/lib/whatsapp/nlp-core/safety-guards";
import { parseWithGeminiFallback, type GeminiFallbackParseResult } from "@/services/whatsapp/gemini-fallback";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";

type ParseWithInterpreterInput = {
  text: string;
  localParsed: ParsedRanchoMessage;
  owner: WhatsAppOwner;
  geminiMockId?: string | null;
  supabase?: ActionPlanSupabaseLike | null;
};

const REPRODUCTION_EVENT_BY_INTENT: Record<string, string> = {
  INSEMINACAO: "inseminacao",
  PRENHEZ: "prenhez",
  PRE_PARTO: "pre_parto",
  CIO: "cio",
  ABORTO: "aborto"
};

const CONSULT_RANCHO_INTENTS = new Set<RanchoIntent>([
  "CONSULTA_PRODUCAO",
  "CONSULTA_PRODUCAO_HOJE",
  "CONSULTA_PRODUCAO_ANIMAL",
  "CONSULTA_FINANCEIRO",
  "CONSULTA_ESTOQUE",
  "CONSULTA_ESTOQUE_ITEM",
  "CONSULTA_ESTOQUE_GERAL",
  "CONSULTA_FUNCIONARIO",
  "CONSULTA_FOLHA",
  "CONSULTA_PONTO",
  "CONSULTA_ANIMAL",
  "CONSULTA_GENEALOGIA",
  "CONSULTA_REBANHO",
  "CONSULTA_LOTES",
  "CONSULTA_REGISTROS_HOJE",
  "AJUDA"
]);

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function cleanText(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number(value.replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dateReference(fields: AnyRecord) {
  return cleanText(fields.data_parto || fields.data || fields.periodo) || undefined;
}

function animalRef(fields: AnyRecord) {
  return cleanText(fields.animal_ref || fields.mae_ref || fields.animal_codigo || fields.codigo || fields.animal);
}

function herdCategoryFromText(text: string) {
  if (/\b(?:vacas?|vaca)\b/.test(text)) return "vaca";
  if (/\b(?:bois?|boi)\b/.test(text)) return "boi";
  if (/\b(?:touros?|touro)\b/.test(text)) return "touro";
  if (/\b(?:bezerras?|bezerra)\b/.test(text)) return "bezerra";
  if (/\b(?:bezerros?|bezerro)\b/.test(text)) return "bezerro";
  if (/\b(?:novilhas?|novilha)\b/.test(text)) return "novilha";
  return undefined;
}

function herdReproductionFromText(text: string) {
  if (/\b(?:prenhas?|prenhes|prenhe|prenhez|gestantes?|gestacao|gestando|gravidas?)\b/.test(text)) return "prenhe";
  if (/\b(?:pre\s*parto|pre-parto|preparto|quase\s+parindo|perto\s+de\s+parir)\b/.test(text)) return "pre_parto";
  if (/\b(?:inseminad[ao]s?|inseminacao|inseminacoes|cobert[ao]s?|cobertura|cobertas?|cobertos?)\b/.test(text)) return "inseminada";
  if (/\b(?:sem\s+(?:evento|eventos|historico|registro|registros))\b/.test(text)) return "sem_evento";
  return undefined;
}

function herdModeFromText(text: string) {
  if (/\b(?:quantos|quantas|total|contagem|numero)\b/.test(text)) return "contagem";
  if (/\b(?:resumo|relatorio|dados|informacoes|info)\b/.test(text)) return "resumo";
  return "lista";
}

function hasCollectiveHerdCue(text: string) {
  const directCollective = /\b(?:minhas?\s+vacas|minhas?\s+bezerras|meus\s+animais|dados\s+das|dados\s+dos|vacas|bois|touros|bezerros|bezerras|novilhas|animais|rebanho|gado|cadastrados?|cadastradas?)\b/.test(text);
  const listCue = /\b(?:lista|listar|liste|mostra|mostrar|mostre|relatorio|resumo|quais|quantos|quantas)\b/.test(text);
  const groupCue = /\b(?:vacas|bois|touros|bezerros|bezerras|novilhas|animais|rebanho|gado|cadastrados?|cadastradas?)\b/.test(text);
  return directCollective || (listCue && groupCue);
}

function hasSpecificAnimalCue(fields: AnyRecord, text: string) {
  const ref = animalRef(fields);
  if (ref && !/\b(?:vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?|animais|rebanho|gado|minhas?|meus|cadastrados?|cadastradas?)\b/.test(normalizeRanchoText(ref))) {
    return true;
  }
  return /\b(?:brinco|codigo|cod|numero|n)\s+[a-z]*\d[a-z0-9-]*\b/.test(text)
    || /\b(?:vaca|animal|boi|touro|bezerro|bezerra|novilha)\s+\d[a-z0-9-]*\b/.test(text)
    || /\b[a-z]+-\d[a-z0-9-]*\b/.test(text)
    || /\b[a-z]+\d[a-z0-9-]*\b/.test(text);
}

function normalizeHerdConsultationIntent(intent: string, fields: AnyRecord, rawText: string) {
  const text = normalizeRanchoText(rawText);
  const shouldRouteToHerd = hasCollectiveHerdCue(text) && !hasSpecificAnimalCue(fields, text);
  if (!shouldRouteToHerd) return { intent, fields };
  if (intent !== "CONSULTA_ANIMAL" && intent !== "DESCONHECIDO" && intent !== "CONSULTA_REBANHO") return { intent, fields };

  return {
    intent: "CONSULTA_REBANHO",
    fields: {
      ...fields,
      animal_ref: undefined,
      animal_codigo: undefined,
      animal: undefined,
      categoria: cleanText(fields.categoria) || herdCategoryFromText(text),
      reproducao: cleanText(fields.reproducao) || herdReproductionFromText(text),
      modo: cleanText(fields.modo) || herdModeFromText(text)
    }
  };
}

function itemName(fields: AnyRecord) {
  return cleanText(fields.item || fields.item_nome || fields.produto);
}

function employeeName(fields: AnyRecord) {
  return cleanText(fields.funcionario || fields.funcionario_nome || fields.nome);
}

function descriptionFrom(fields: AnyRecord, fallback?: string) {
  return cleanText(fields.descricao || fields.observacoes || fields.motivo || fields.categoria || fallback);
}

function inferAnimalSex(category: unknown) {
  const text = String(category || "").trim().toLowerCase();
  if (["vaca", "novilha", "bezerra"].includes(text)) return "femea";
  if (["boi", "touro", "bezerro"].includes(text)) return "macho";
  return undefined;
}

function withGeminiMetadata(
  intent: string,
  result: GeminiStructuredResult | GeminiStructuredAction,
  dados: AnyRecord
) {
  return {
    ...dados,
    origem_parser: "gemini",
    gemini_intent: intent,
    gemini_confidence: result.confidence,
    gemini_risk_score: result.riskScore,
    gemini_warnings: result.warnings || [],
    gemini_should_confirm: result.should_confirm,
    gemini_requires_confirmation: result.should_confirm
  };
}

function buildParsedFromData(
  tipo: RanchoIntent,
  intent: string,
  dados: AnyRecord,
  result: GeminiStructuredResult | GeminiStructuredAction,
  forcedMissing: string[] = []
): ParsedRanchoMessage {
  const missing = Array.from(new Set([...buildMissing(tipo, dados), ...forcedMissing]));
  const parsed = finalize(tipo, withGeminiMetadata(intent, result, dados), missing, result.confidence || 0.8);
  return {
    ...parsed,
    riskScore: result.riskScore || 0,
    reason: "Interpretado pelo Gemini e normalizado pelo backend local."
  };
}

function mapMissingFields(intent: string, fields: AnyRecord, missingFields: string[]) {
  const mapped = new Set<string>();
  const sourceMissingFields = intent === "CONSULTA_REBANHO"
    ? missingFields.filter((field) => !["animal_ref", "animal_codigo", "codigo", "animal"].includes(field))
    : missingFields;
  const add = (field?: string) => {
    if (field) mapped.add(field);
  };

  for (const field of sourceMissingFields) {
    if (field === "animal_ref") add("animal_codigo");
    else if (field === "item") add("item_nome");
    else if (field === "valor_total") add("valor");
    else if (field === "funcionario") add("funcionario_nome");
    else if (field === "codigo") add("animal_codigo");
    else if (field === "categoria") add("categoria_animal");
    else add(field);
  }

  if (intent === "COMPRA_ESTOQUE_FINANCEIRO" && !hasValue(fields.valor_total)) add("valor");
  if (intent === "VENDA" && !hasValue(fields.valor_total)) add("valor");
  return Array.from(mapped);
}

function mapGeminiFieldsToRancho(intent: string, fields: AnyRecord, rawText: string): { tipo: RanchoIntent; dados: AnyRecord } | null {
  const tipo = mapGeminiIntentToRancho(intent);
  if (!tipo) return null;

  switch (intent) {
    case "PRODUCAO_LEITE":
      return {
        tipo,
        dados: {
          animal_codigo: animalRef(fields),
          litros: numberValue(fields.litros),
          data_referencia: dateReference(fields) || "hoje",
          horario: cleanText(fields.horario),
          observacoes: cleanText(fields.observacoes),
          estoque_leite_detectado: fields.adicionar_ao_estoque === true || undefined,
          estoque_leite_movimentar: fields.adicionar_ao_estoque === true || undefined
        }
      };

    case "ESTOQUE_ENTRADA":
    case "COMPRA_ESTOQUE_FINANCEIRO":
      return {
        tipo,
        dados: {
          item_nome: itemName(fields),
          quantidade: numberValue(fields.quantidade),
          unidade: cleanText(fields.unidade),
          valor: numberValue(fields.valor_total),
          fornecedor: cleanText(fields.fornecedor),
          data_referencia: dateReference(fields) || "hoje",
          compra: intent === "COMPRA_ESTOQUE_FINANCEIRO" || hasValue(fields.valor_total) || /\bcomprei|compra|paguei\b/i.test(rawText),
          observacoes: cleanText(fields.observacoes)
        }
      };

    case "ESTOQUE_SAIDA":
    case "VENDA":
      return {
        tipo,
        dados: {
          item_nome: itemName(fields),
          quantidade: numberValue(fields.quantidade),
          unidade: cleanText(fields.unidade),
          valor: numberValue(fields.valor_total),
          data_referencia: dateReference(fields) || "hoje",
          motivo: cleanText(fields.motivo || fields.observacoes),
          venda: intent === "VENDA" || /\bvendi|venda\b/i.test(rawText)
        }
      };

    case "CRIAR_ITEM_ESTOQUE":
    case "ESTOQUE_CADASTRO":
      return {
        tipo,
        dados: {
          item_nome: itemName(fields),
          unidade: cleanText(fields.unidade),
          quantidade: numberValue(fields.quantidade),
          quantidade_minima: numberValue(fields.quantidade_minima),
          valor_unitario: numberValue(fields.valor_unitario),
          categoria: cleanText(fields.categoria),
          fornecedor: cleanText(fields.fornecedor)
        }
      };

    case "FINANCEIRO_DESPESA":
    case "DESPESA":
      return {
        tipo,
        dados: {
          valor: numberValue(fields.valor),
          descricao: descriptionFrom(fields, rawText),
          categoria: cleanText(fields.categoria),
          data_referencia: dateReference(fields) || "hoje",
          metodo_pagamento: cleanText(fields.forma_pagamento)
        }
      };

    case "FINANCEIRO_RECEITA":
    case "RECEITA_VENDA":
      return {
        tipo,
        dados: {
          valor: numberValue(fields.valor),
          descricao: descriptionFrom(fields, rawText),
          categoria: cleanText(fields.categoria),
          data_referencia: dateReference(fields) || "hoje",
          metodo_pagamento: cleanText(fields.forma_pagamento)
        }
      };

    case "CONSULTA_FINANCEIRO":
    case "CONSULTA_FINANCEIRO_DESPESAS":
      return {
        tipo,
        dados: {
          consulta: true,
          data_referencia: dateReference(fields) || "mes",
          periodo: cleanText(fields.periodo || fields.data) || "mes",
          financeiro_tipo: intent === "CONSULTA_FINANCEIRO_DESPESAS" ? "saida" : cleanText(fields.tipo),
          filtro_texto: cleanText(fields.categoria || fields.descricao)
        }
      };

    case "CONSULTA_ESTOQUE":
    case "CONSULTA_ESTOQUE_ITEM":
      return {
        tipo,
        dados: {
          consulta: true,
          item_nome: itemName(fields),
          categoria: cleanText(fields.categoria),
          consulta_estoque: cleanText(fields.modo)
        }
      };

    case "CONSULTA_ESTOQUE_GERAL":
      return {
        tipo,
        dados: {
          consulta: true,
          categoria: cleanText(fields.categoria),
          consulta_estoque: cleanText(fields.modo)
        }
      };

    case "CONSULTA_PRODUCAO":
    case "CONSULTA_PRODUCAO_HOJE":
      return {
        tipo,
        dados: {
          consulta: true,
          animal_codigo: animalRef(fields),
          data_referencia: dateReference(fields) || "hoje",
          periodo: cleanText(fields.periodo || fields.data) || "hoje",
          consulta_producao: cleanText(fields.modo)
        }
      };

    case "CONSULTA_PRODUCAO_ANIMAL":
      return {
        tipo,
        dados: {
          consulta: true,
          animal_codigo: animalRef(fields),
          data_referencia: dateReference(fields) || "hoje",
          periodo: cleanText(fields.periodo || fields.data) || "hoje",
          consulta_producao: cleanText(fields.modo)
        }
      };

    case "CONSULTA_REBANHO":
      return {
        tipo,
        dados: {
          consulta: true,
          modo: cleanText(fields.modo) || "lista",
          categoria: cleanText(fields.categoria),
          sexo: cleanText(fields.sexo),
          status: cleanText(fields.status),
          reproducao: cleanText(fields.reproducao),
          lote_nome: cleanText(fields.lote_nome || fields.lote),
          sem_lote: fields.sem_lote === true || undefined,
          pagina: numberValue(fields.pagina)
        }
      };

    case "CONSULTA_REGISTROS_HOJE":
    case "RELATORIO_DIA":
      return {
        tipo,
        dados: {
          consulta: true,
          data_referencia: dateReference(fields) || "hoje",
          periodo: cleanText(fields.periodo || fields.data) || "hoje",
          consulta_registros: cleanText(fields.tipo || "relatorio"),
          evento: cleanText(fields.evento),
          evento_tipo: cleanText(fields.evento_tipo),
          dias: numberValue(fields.dias),
          should_confirm: false
        }
      };

    case "ACAO_DESTRUTIVA_EM_MASSA":
      return {
        tipo,
        dados: {
          blocked: true,
          bloqueado: true,
          alvo: cleanText(fields.alvo) || "massa",
          motivo: cleanText(fields.motivo) || "destructive_bulk_action_blocked",
          should_confirm: false,
          observacoes: cleanText(fields.observacoes || rawText)
        }
      };

    case "CADASTRO_ANIMAL": {
      const categoria = cleanText(fields.categoria);
      const sex = cleanText(fields.sexo) || inferAnimalSex(categoria);
      return {
        tipo,
        dados: {
          animal_codigo: cleanText(fields.codigo),
          nome: cleanText(fields.nome),
          categoria,
          sexo: sex,
          sexo_origem: !fields.sexo && sex ? "inferido_categoria" : undefined,
          sexo_inferido_categoria: !fields.sexo && sex ? categoria : undefined,
          peso: numberValue(fields.peso),
          raca: cleanText(fields.raca),
          lote_nome: cleanText(fields.lote),
          data_nascimento: cleanText(fields.nascimento),
          fase: cleanText(fields.fase),
          observacoes: cleanText(fields.observacoes),
          pai_nome: cleanText(fields.pai),
          mae_nome: cleanText(fields.mae)
        }
      };
    }

    case "CADASTRO_ANIMAL_EM_MASSA":
    case "IMPORTACAO_ANIMAIS_TABELA": {
      const linhas = Array.isArray(fields.linhas) ? fields.linhas : [];
      return {
        tipo,
        dados: {
          importacao_tabela_animais: true,
          tabela_destino: "animais",
          texto_tabela_original: rawText,
          total_linhas: linhas.length,
          total_linhas_parse_validas: linhas.length,
          total_linhas_parse_invalidas: 0,
          linhas,
          linhas_parse_invalidas: []
        }
      };
    }

    case "CADASTRO_FUNCIONARIO":
    case "CRIAR_FUNCIONARIO":
      return {
        tipo,
        dados: {
          funcionario_nome: employeeName(fields),
          funcao: cleanText(fields.funcao),
          telefone: cleanText(fields.telefone),
          cpf: cleanText(fields.cpf),
          salario_base: numberValue(fields.salario_base),
          data_admissao: cleanText(fields.data_admissao)
        }
      };

    case "PAGAMENTO_FUNCIONARIO":
      return {
        tipo,
        dados: {
          funcionario_nome: employeeName(fields),
          valor: numberValue(fields.valor),
          data_referencia: dateReference(fields) || "hoje",
          periodo_pagamento: cleanText(fields.periodo_pagamento),
          pagamento_tipo: cleanText(fields.pagamento_tipo || "salario")
        }
      };

    case "PONTO_FUNCIONARIO":
      return {
        tipo,
        dados: {
          funcionario_nome: employeeName(fields),
          ponto_tipo: cleanText(fields.tipo) || "entrada",
          horario: cleanText(fields.horario),
          data_referencia: dateReference(fields) || "hoje",
          agora: fields.agora === true || !hasValue(fields.horario)
        }
      };

    case "EVENTO_SANITARIO":
    case "OBSERVACAO_ANIMAL":
      return {
        tipo,
        dados: {
          animal_codigo: animalRef(fields),
          campo_alterado: "observacoes",
          novo_valor: descriptionFrom(fields, rawText),
          registro_evento_animal: true,
          evento_tipo: "observacao",
          descricao: descriptionFrom(fields, rawText),
          data_referencia: dateReference(fields) || "hoje",
          gravidade: cleanText(fields.gravidade)
        }
      };

    case "MEDICACAO":
    case "VACINA":
    case "VACINA_MEDICAMENTO":
      return {
        tipo,
        dados: {
          animal_codigo: animalRef(fields),
          produto: cleanText(fields.produto),
          dose: cleanText(fields.dose),
          evento_tipo: intent === "VACINA" ? "vacina" : "tratamento",
          data_referencia: dateReference(fields) || "hoje",
          observacoes: cleanText(fields.observacoes),
          custo: numberValue(fields.custo)
        }
      };

    case "PARTO":
      {
        const childSex = normalizeCalfSex(fields.cria_sexo || fields.sexo_cria);
        const childCode = cleanText(fields.cria_codigo || fields.codigo_cria || fields.brinco_cria);
        const childCategory = cleanText(fields.cria_categoria) || calfCategoryForSex(childSex);
        const fatherRef = cleanText(fields.pai_ref || fields.pai || fields.touro_ref);
        const childName = cleanText(fields.cria_nome || fields.nome_cria);
        const childRegistration = Boolean(childSex || childCode || childCategory || fatherRef || childName || fields.cria);
        return {
          tipo,
          dados: {
            animal_codigo: animalRef(fields),
            data_referencia: dateReference(fields) || "hoje",
            observacoes: cleanText(fields.observacoes),
            cria: cleanText(fields.cria),
            sexo_cria: cleanText(fields.sexo_cria),
            parto_cria_cadastro: childRegistration || undefined,
            cria_sexo: childSex,
            cria_categoria: childCategory,
            cria_codigo: childCode,
            cria_nome: childName,
            pai_ref: fatherRef,
            pai_nome: fatherRef,
            pai_nao_informado: childRegistration && !fatherRef ? true : undefined
          }
        };
      }

    case "INSEMINACAO":
    case "PRENHEZ":
    case "PRE_PARTO":
    case "CIO":
    case "ABORTO":
      return {
        tipo,
        dados: {
          animal_codigo: animalRef(fields),
          campo_alterado: "evento_reprodutivo",
          novo_valor: descriptionFrom(fields, intent.toLowerCase()),
          registro_evento_animal: true,
          evento_tipo: "reprodutivo",
          evento_reprodutivo_tipo: REPRODUCTION_EVENT_BY_INTENT[intent],
          data_referencia: dateReference(fields) || "hoje",
          observacoes: cleanText(fields.observacoes),
          resultado: cleanText(fields.resultado),
          cria: cleanText(fields.cria),
          sexo_cria: cleanText(fields.sexo_cria)
        }
      };

    case "CONSULTA_ANIMAL":
      return {
        tipo,
        dados: {
          consulta: true,
          animal_codigo: animalRef(fields),
          data_referencia: dateReference(fields),
          filtro_texto: cleanText(fields.tipo)
        }
      };

    case "AJUDA":
    case "DESCONHECIDO":
    case "CORRECAO":
    case "CANCELAMENTO":
      return {
        tipo,
        dados: {
          consulta: intent === "AJUDA" || undefined,
          texto_original: rawText,
          motivo: cleanText(fields.motivo || fields.observacoes)
        }
      };

    default:
      return null;
  }
}

export function geminiResultToParsed(result: GeminiStructuredResult, rawText: string): ParsedRanchoMessage | null {
  const normalized = normalizeHerdConsultationIntent(normalizeGeminiIntent(result.intent), result.fields || {}, rawText);
  const mapping = mapGeminiFieldsToRancho(normalized.intent, normalized.fields, rawText);
  if (!mapping) return null;
  return buildParsedFromData(
    mapping.tipo,
    normalized.intent,
    mapping.dados,
    {
      ...result,
      should_confirm: GEMINI_CONSULT_INTENTS.has(normalized.intent) ? false : result.should_confirm
    },
    mapMissingFields(normalized.intent, normalized.fields, result.missing_fields || [])
  );
}

function geminiActionToParsed(action: GeminiStructuredAction, parent: GeminiStructuredResult, rawText: string): ParsedRanchoMessage | null {
  const normalized = normalizeHerdConsultationIntent(normalizeGeminiIntent(action.intent), action.fields || {}, rawText);
  const mapping = mapGeminiFieldsToRancho(normalized.intent, normalized.fields, rawText);
  if (!mapping) return null;
  return buildParsedFromData(
    mapping.tipo,
    normalized.intent,
    mapping.dados,
    {
      ...action,
      confidence: action.confidence ?? parent.confidence,
      riskScore: action.riskScore ?? parent.riskScore,
      warnings: [...(parent.warnings || []), ...(action.warnings || [])],
      should_confirm: GEMINI_CONSULT_INTENTS.has(normalized.intent) ? false : action.should_confirm ?? parent.should_confirm
    },
    mapMissingFields(normalized.intent, normalized.fields, action.missing_fields || [])
  );
}

function makeBatchParsed(registros: ParsedRanchoMessage[], interpretation: GeminiStructuredResult) {
  return finalize("LOTE_REGISTROS", {
    registros,
    total_registros: registros.length,
    origem_parser: "gemini",
    gemini_intent: interpretation.intent,
    gemini_confidence: interpretation.confidence,
    gemini_risk_score: interpretation.riskScore,
    gemini_requires_confirmation: true,
    gemini_should_confirm: true
  }, [], interpretation.confidence);
}

function attachPostConfirmationConsultations(pending: ParsedRanchoMessage, consultations: ParsedRanchoMessage[]) {
  if (!consultations.length) return pending;
  return {
    ...pending,
    dados: {
      ...pending.dados,
      gemini_consultas_apos_confirmacao: consultations
    }
  };
}

function hasUnsupportedInterleaving(parsedActions: ParsedRanchoMessage[]) {
  let sawMutation = false;
  let sawConsultAfterMutation = false;
  for (const parsed of parsedActions) {
    if (CONSULT_RANCHO_INTENTS.has(parsed.tipo)) {
      if (sawMutation) sawConsultAfterMutation = true;
      continue;
    }
    if (sawConsultAfterMutation) return true;
    sawMutation = true;
  }
  return false;
}

function convertPrimaryInterpretation(interpretation: GeminiStructuredResult, rawText: string): GeminiFallbackParseResult {
  if (interpretation.intent === "DESCONHECIDO" && interpretation.confidence < 0.7) {
    return {
      kind: "clarify",
      threshold: 0.7,
      reason: "gemini_unknown_intent",
      message: interpretation.response_hint || GEMINI_SAFE_FAILURE_MESSAGE
    };
  }

  const parsedActions = (interpretation.actions.length
    ? interpretation.actions.map((action) => geminiActionToParsed(action, interpretation, rawText))
    : [geminiResultToParsed(interpretation, rawText)]
  );

  if (parsedActions.some((parsed) => !parsed)) {
    return {
      kind: "clarify",
      threshold: 0.7,
      reason: "gemini_action_not_mapped",
      message: GEMINI_SAFE_FAILURE_MESSAGE
    };
  }

  const parsed = parsedActions as ParsedRanchoMessage[];
  const consultations = parsed.filter((item) => CONSULT_RANCHO_INTENTS.has(item.tipo));
  const mutations = parsed.filter((item) => !CONSULT_RANCHO_INTENTS.has(item.tipo));

  if (parsed.length === 1) {
    return {
      kind: "parsed",
      threshold: 0.7,
      parsed: parsed[0],
      gemini: {
        confidence: interpretation.confidence,
        requiresConfirmation: interpretation.should_confirm,
        reason: "primary_gemini_interpreter",
        risk_flags: interpretation.warnings,
        actions: [],
        userResponse: interpretation.response_hint || ""
      }
    };
  }

  if (!mutations.length) {
    return {
      kind: "consultations",
      threshold: 0.7,
      consultations,
      gemini: {
        confidence: interpretation.confidence,
        requiresConfirmation: false,
        reason: "primary_gemini_interpreter",
        risk_flags: interpretation.warnings,
        actions: [],
        userResponse: interpretation.response_hint || ""
      }
    };
  }

  if (!consultations.length) {
    return {
      kind: "parsed",
      threshold: 0.7,
      parsed: makeBatchParsed(mutations, interpretation),
      gemini: {
        confidence: interpretation.confidence,
        requiresConfirmation: true,
        reason: "primary_gemini_interpreter",
        risk_flags: interpretation.warnings,
        actions: [],
        userResponse: interpretation.response_hint || ""
      }
    };
  }

  if (hasUnsupportedInterleaving(parsed)) {
    return {
      kind: "clarify",
      threshold: 0.7,
      reason: "compound_order_not_supported",
      message: "Entendi mais de uma acao, mas a ordem ficou ambigua. Pode mandar uma acao por vez?"
    };
  }

  const firstMutationIndex = parsed.findIndex((item) => !CONSULT_RANCHO_INTENTS.has(item.tipo));
  const immediateConsultations = parsed.slice(0, firstMutationIndex).filter((item) => CONSULT_RANCHO_INTENTS.has(item.tipo));
  const postConfirmationConsultations = parsed.slice(firstMutationIndex + 1).filter((item) => CONSULT_RANCHO_INTENTS.has(item.tipo));
  const pending = attachPostConfirmationConsultations(
    mutations.length === 1 ? mutations[0] : makeBatchParsed(mutations, interpretation),
    postConfirmationConsultations
  );

  return {
    kind: "compound",
    threshold: 0.7,
    immediateConsultations,
    pending,
    postConfirmationConsultations,
    gemini: {
      confidence: interpretation.confidence,
      requiresConfirmation: true,
      reason: "primary_gemini_interpreter",
      risk_flags: interpretation.warnings,
      actions: [],
      userResponse: interpretation.response_hint || ""
    }
  };
}

function legacyRollbackResult(localParsed: ParsedRanchoMessage, reason: string): GeminiFallbackParseResult {
  return {
    kind: "local",
    threshold: 0.7,
    parsed: {
      ...localParsed,
      dados: {
        ...(localParsed.dados || {}),
        usedLegacyRollback: true,
        gemini_failure_reason: reason
      }
    }
  };
}

function localFallbackResult(
  input: ParseWithInterpreterInput,
  reason: string,
  route: "normal_message" | "structured_input",
  structuredDetection: ReturnType<typeof detectStructuredInput>
): GeminiFallbackParseResult {
  return {
    kind: "local",
    threshold: 0.7,
    parsed: {
      ...input.localParsed,
      dados: {
        ...(input.localParsed.dados || {}),
        origem_parser: input.localParsed.dados?.origem_parser || "local",
        route,
        structuredDetection,
        interpreter_final_usado: "local_parser_after_gemini_failure",
        gemini_failure_reason: reason
      }
    }
  };
}

function mockFixtureMissingResult(): GeminiFallbackParseResult {
  return {
    kind: "clarify",
    threshold: 0.7,
    reason: "mock_fixture_missing",
    message: "mock_fixture_missing: nao encontrei fixture Gemini mock para esta mensagem. Crie uma fixture em scripts/bot-test/gemini-mocks ou use GEMINI_MODE=live fora dos testes."
  };
}

function actionPlanEnabledFor(plan: ActionPlan | null | undefined) {
  if (!plan) return false;
  if (plan.action === "import_table") return geminiTableActionPlanEnabled();
  if (plan.action === "block") return geminiActionPlanEnabled() || geminiTableActionPlanEnabled();
  return geminiActionPlanEnabled();
}

function anyActionPlanFlagEnabled() {
  return geminiActionPlanEnabled() || geminiTableActionPlanEnabled();
}

function logActionPlan(event: string, details: AnyRecord) {
  console.log("[BOT ACTION PLAN]", {
    event,
    ...details
  });
}

function actionPlanGeminiMeta(interpretation: GeminiStructuredResult, result: ExecuteActionPlanResult) {
  return {
    confidence: interpretation.action_plan?.action === "block" ? 1 : interpretation.confidence,
    requiresConfirmation: result.ok
      ? result.logEvent === "action_plan_blocked" ? false : !CONSULT_RANCHO_INTENTS.has(result.parsed.tipo)
      : false,
    reason: result.ok ? result.logEvent : result.reason,
    risk_flags: interpretation.warnings || [],
    actions: [],
    userResponse: result.ok ? result.response || "" : result.message
  };
}

async function convertActionPlanInterpretation(
  input: ParseWithInterpreterInput,
  interpretation: GeminiStructuredResult,
  route: "normal_message" | "structured_input",
  structuredDetection: ReturnType<typeof detectStructuredInput>
): Promise<GeminiFallbackParseResult | null> {
  const plan = interpretation.action_plan || null;
  const error = interpretation.action_plan_error || null;

  if (!plan && !error) {
    if (anyActionPlanFlagEnabled()) {
      recordActionPlanRuntime("legacyFallback");
      logActionPlan(route === "structured_input" ? "table_action_plan_fallback_legacy" : "action_plan_fallback_legacy", {
        reason: "action_plan_absent",
        route,
        legacyIntent: input.localParsed.tipo
      });
    }
    return null;
  }

  if (error) {
    if (!anyActionPlanFlagEnabled()) {
      recordActionPlanRuntime("legacyFallback");
      logActionPlan("action_plan_fallback_legacy", {
        reason: "feature_flag_disabled",
        action: plan?.action || null,
        legacyIntent: input.localParsed.tipo
      });
      return null;
    }

    recordActionPlanRuntime(error.status === "blocked" ? "blocked" : "invalid");
    logActionPlan(error.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid", {
      reason: error.reason,
      action: plan?.action || null,
      route
    });
    return {
      kind: "clarify",
      threshold: 0.7,
      reason: error.reason,
      message: error.status === "blocked"
        ? "Nao posso executar esse pedido com seguranca."
        : "Preciso revisar esse plano antes de executar. Pode reformular?"
    };
  }

  if (!actionPlanEnabledFor(plan)) {
    recordActionPlanRuntime("legacyFallback");
    logActionPlan(plan?.action === "import_table" ? "table_action_plan_fallback_legacy" : "action_plan_fallback_legacy", {
      reason: "feature_flag_disabled",
      action: plan?.action || null,
      legacyIntent: input.localParsed.tipo
    });
    return null;
  }

  if (!plan) return null;

  const result = await executeActionPlan({
    plan,
    text: input.text,
    owner: {
      fazenda_id: input.owner.fazenda_id,
      usuario_id: input.owner.usuario_id
    },
    supabase: input.supabase || null,
    currentDate: new Date().toISOString().slice(0, 10)
  });

  if (!result.ok) {
    recordActionPlanRuntime(result.status === "blocked" ? "blocked" : "invalid");
    logActionPlan(result.logEvent, {
      reason: result.reason,
      action: plan.action,
      domain: "domain" in plan ? plan.domain : null,
      route
    });
    return {
      kind: "clarify",
      threshold: 0.7,
      reason: result.reason,
      message: result.message
    };
  }

  recordActionPlanRuntime(result.logEvent === "table_action_plan_used" ? "tableActionPlanUsed" : result.logEvent === "action_plan_blocked" ? "blocked" : "actionPlanUsed");
  logActionPlan(result.logEvent, {
    action: plan.action,
    domain: "domain" in plan ? plan.domain : null,
    route,
    finalIntent: result.parsed.tipo
  });

  return {
    kind: "parsed",
    threshold: 0.7,
    parsed: {
      ...result.parsed,
      dados: {
        ...(result.parsed.dados || {}),
        route,
        structuredDetection
      }
    },
    gemini: actionPlanGeminiMeta(interpretation, result)
  };
}

function geminiTableNeedsManualChoice(
  input: ParseWithInterpreterInput,
  interpretation: GeminiStructuredResult,
  route: "normal_message" | "structured_input",
  structuredDetection: ReturnType<typeof detectStructuredInput>
): GeminiFallbackParseResult {
  const table = interpretation.table_import;
  const parsed = finalize("IMPORTACAO_TABELA_AMBIGUA", {
    texto_tabela_original: input.text,
    dominio_tabela: "DESCONHECIDO",
    total_linhas: structuredDetection.usefulLineCount || 0,
    origem_parser: "gemini_table_guard",
    route,
    structuredDetection,
    interpreter_final_usado: "gemini_table_manual_choice",
    gemini_intent: interpretation.intent,
    gemini_confidence: interpretation.confidence,
    gemini_table_import: table,
    classificacao_tabela: {
      domain: table?.domain || "DESCONHECIDO",
      confidence: table?.confidence || 0,
      needsUserClarification: true,
      warnings: table?.warnings || [],
      candidateDomains: table?.ambiguous_domains || []
    }
  }, [], Math.min(interpretation.confidence || 0.7, table?.confidence || 0.7));

  return {
    kind: "parsed",
    threshold: 0.7,
    parsed,
    gemini: {
      confidence: table?.confidence || interpretation.confidence,
      requiresConfirmation: false,
      reason: "gemini_table_low_confidence_manual_choice",
      risk_flags: [...(interpretation.warnings || []), ...(table?.warnings || [])],
      actions: [],
      userResponse: interpretation.response_hint || ""
    }
  };
}

function convertGeminiTableImport(
  input: ParseWithInterpreterInput,
  interpretation: GeminiStructuredResult,
  route: "normal_message" | "structured_input",
  structuredDetection: ReturnType<typeof detectStructuredInput>
): GeminiFallbackParseResult | null {
  const table = interpretation.table_import;
  if (!structuredDetection.isStructured || !table) return null;

  if (table.needs_manual_choice || table.confidence < 0.7) {
    return geminiTableNeedsManualChoice(input, interpretation, route, structuredDetection);
  }

  const domain = domainFromGeminiTableDomain(table.domain);
  if (!domain) return localFallbackResult(input, "gemini_table_domain_invalid", route, structuredDetection);

  const parsedTable = parseTabularAnimalEventsMessageAs(input.text, domain);
  if (!parsedTable) return localFallbackResult(input, "gemini_table_local_reprocess_failed", route, structuredDetection);

  return {
    kind: "parsed",
    threshold: 0.7,
    parsed: {
      ...parsedTable,
      dados: {
        ...(parsedTable.dados || {}),
        origem_parser: parsedTable.dados?.origem_parser || "tabela_local",
        route,
        structuredDetection,
        interpreter_final_usado: "gemini_table_domain_then_local_parser",
        gemini_intent: interpretation.intent,
        gemini_confidence: interpretation.confidence,
        gemini_table_import: table,
        gemini_table_domain: table.domain,
        gemini_column_mapping: table.column_mapping
      }
    },
    gemini: {
      confidence: table.confidence,
      requiresConfirmation: true,
      reason: "gemini_table_domain_then_local_parser",
      risk_flags: [...(interpretation.warnings || []), ...(table.warnings || [])],
      actions: [],
      userResponse: interpretation.response_hint || ""
    }
  };
}

async function parseWithGeminiPrimary(input: ParseWithInterpreterInput): Promise<GeminiFallbackParseResult> {
  const structuredDetection = detectStructuredInput(input.text);
  const route = structuredDetection.isStructured ? "structured_input" : "normal_message";

  if (detectDestructiveBulkAction(input.text)) {
    const guarded = destructiveBulkActionParsed(input.text);
    return {
      kind: "parsed",
      threshold: 0.7,
      parsed: {
        ...guarded,
        dados: {
          ...guarded.dados,
          origem_parser: "local_guard",
          route,
          structuredDetection,
          interpreter_final_usado: "local_destructive_bulk_guard"
        }
      },
      gemini: {
        confidence: 1,
        requiresConfirmation: false,
        reason: "destructive_bulk_action_blocked",
        risk_flags: ["destructive_bulk_action_blocked"],
        actions: [],
        userResponse: ""
      }
    };
  }

  if (process.env.BOT_GEMINI_MOCK === "legacy_parser") {
    return {
      kind: "parsed",
      threshold: 0.7,
      parsed: {
        ...input.localParsed,
        dados: {
          ...(input.localParsed.dados || {}),
          origem_parser: "gemini",
          gemini_mock: "legacy_parser",
          route,
          structuredDetection,
          interpreter_final_usado: "legacy_parser_mock_for_gemini_tests"
        }
      },
      gemini: {
        confidence: input.localParsed.confianca,
        requiresConfirmation: !CONSULT_RANCHO_INTENTS.has(input.localParsed.tipo),
        reason: "legacy_parser_mock_for_gemini_tests",
        actions: [],
        userResponse: ""
      }
    };
  }

  const gemini = await interpretWithGemini({
    text: input.text,
    user: {
      papel_bot: input.owner.papel_bot,
      nome: input.owner.nome_exibicao || null
    },
    rancho: {
      fazenda_id: input.owner.fazenda_id
    },
    currentDate: new Date().toISOString().slice(0, 10),
    timezone: process.env.TZ || "America/Fortaleza",
    geminiMockId: input.geminiMockId || null
  });

  if (!gemini.ok) {
    console.log("[BOT GEMINI INTERPRETER]", {
      event: "failure",
      interpreter: "gemini",
      reason: gemini.reason,
      rollbackAllowed: botAllowsLegacyRollback()
    });

    if (botAllowsLegacyRollback()) {
      return legacyRollbackResult(input.localParsed, gemini.reason);
    }

    const hasUsableLocalInterpretation = input.localParsed.tipo !== "DESCONHECIDO";
    if (hasUsableLocalInterpretation) {
      return localFallbackResult(input, gemini.reason, route, structuredDetection);
    }

    return {
      kind: "clarify",
      threshold: 0.7,
      reason: gemini.reason,
      message: GEMINI_SAFE_FAILURE_MESSAGE
    };
  }

  const geminiMockFixtureMissing = (gemini.interpretation.warnings || []).includes("gemini_mock_fixture_not_found");
  if (geminiMockFixtureMissing && anyActionPlanFlagEnabled() && !botAllowsLegacyRollback()) {
    return mockFixtureMissingResult();
  }

  if (geminiMockFixtureMissing && input.localParsed.tipo !== "DESCONHECIDO") {
    return localFallbackResult(input, "gemini_mock_fixture_not_found", route, structuredDetection);
  }

  const actionPlanResult = await convertActionPlanInterpretation(input, gemini.interpretation, route, structuredDetection);
  if (actionPlanResult) return actionPlanResult;

  const tableImportResult = convertGeminiTableImport(input, gemini.interpretation, route, structuredDetection);
  if (tableImportResult) return tableImportResult;

  return convertPrimaryInterpretation(gemini.interpretation, input.text);
}

function logShadowComparison(input: ParseWithInterpreterInput, result: GeminiFallbackParseResult) {
  const finalIntent = result.kind === "parsed"
    ? result.parsed.tipo
    : result.kind === "consultations"
      ? result.consultations[0]?.tipo
      : result.kind === "compound"
        ? result.pending.tipo
        : null;

  console.log("[BOT INTERPRETER SHADOW]", {
    originalText: input.text.slice(0, 180),
    interpreter: "gemini",
    legacyIntent: input.localParsed.tipo,
    legacyConfidence: input.localParsed.confianca,
    finalIntent,
    finalDecision: result.kind
  });
}

export async function parseWithConfiguredInterpreter(input: ParseWithInterpreterInput): Promise<GeminiFallbackParseResult> {
  const mode = botInterpreterMode();

  if (mode === "legacy_parser") {
    return parseWithGeminiFallback(input);
  }

  const result = await parseWithGeminiPrimary(input);
  if (mode === "shadow") logShadowComparison(input, result);
  return result;
}

export function parseLocalPreviewForInterpreter(text: string) {
  return parseRanchoMessage(text);
}

export function isGeminiPrimaryMode() {
  return botInterpreterMode() !== "legacy_parser";
}

export function isGeminiConsultIntent(intent: string) {
  return GEMINI_CONSULT_INTENTS.has(intent);
}
