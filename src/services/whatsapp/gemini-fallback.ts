import type { AnyRecord } from "@/lib/types";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { buildMissing, finalize } from "@/lib/whatsapp/nlp-core/result";
import { detectDestructiveBulkAction, destructiveBulkActionParsed, detectRecentBirthsQuery, recentBirthsQueryData } from "@/lib/whatsapp/nlp-core/safety-guards";
import { parserDecisionForParsed, shouldUseGeminiFallback, type ParsedRanchoMessage, type RanchoIntent } from "@/lib/whatsapp/nlp";
import {
  GEMINI_ACTION_TYPES,
  geminiFallbackConfidence,
  interpretRanchoMessageWithGemini,
  type GeminiAction,
  type GeminiInterpretation
} from "@/services/ai/gemini";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";

export type GeminiFallbackParseResult =
  | {
      kind: "local";
      parsed: ParsedRanchoMessage;
      threshold: number;
    }
  | {
      kind: "parsed";
      parsed: ParsedRanchoMessage;
      threshold: number;
      gemini: GeminiInterpretation;
    }
  | {
      kind: "consultations";
      consultations: ParsedRanchoMessage[];
      threshold: number;
      gemini: GeminiInterpretation;
    }
  | {
      kind: "compound";
      immediateConsultations: ParsedRanchoMessage[];
      pending: ParsedRanchoMessage;
      postConfirmationConsultations: ParsedRanchoMessage[];
      threshold: number;
      gemini: GeminiInterpretation;
    }
  | {
      kind: "clarify";
      message: string;
      threshold: number;
      reason: string;
    };

const GEMINI_CLARIFICATION_TEXT = "Não consegui entender com segurança. Pode reformular com mais detalhes? Ex: \"dei baixa de 30 kg de ração\" ou \"resumo do dia\".";

const CONSULT_INTENTS = new Set<RanchoIntent>([
  "CONSULTA_PRODUCAO",
  "CONSULTA_PRODUCAO_HOJE",
  "CONSULTA_PRODUCAO_ANIMAL",
  "CONSULTA_FINANCEIRO",
  "CONSULTA_ESTOQUE",
  "CONSULTA_ESTOQUE_ITEM",
  "CONSULTA_ESTOQUE_GERAL",
  "CONSULTA_FUNCIONARIO",
  "CONSULTA_PONTO",
  "CONSULTA_ANIMAL",
  "CONSULTA_GENEALOGIA",
  "CONSULTA_REBANHO",
  "CONSULTA_LOTES",
  "CONSULTA_REGISTROS_HOJE",
  "AJUDA"
]);

function isRanchoIntent(value: string): value is RanchoIntent {
  return (GEMINI_ACTION_TYPES as readonly string[]).includes(value);
}

function isConsultIntent(tipo: RanchoIntent) {
  return CONSULT_INTENTS.has(tipo);
}

function consultationRequiresConfirmation(tipo: RanchoIntent, interpretation: GeminiInterpretation) {
  return !isConsultIntent(tipo) && interpretation.requiresConfirmation;
}

function cleanString(value: string | null | undefined) {
  const text = String(value || "").trim();
  return text || undefined;
}

function actionText(action: GeminiAction) {
  return normalizeRanchoText([action.rawText, action.notes, action.entity, action.operation].filter(Boolean).join(" "));
}

function periodFromAction(action: GeminiAction, fallback?: string) {
  if (action.date) return action.date;
  const text = actionText(action);
  if (/\bhoje\b/.test(text)) return "hoje";
  if (/\bontem\b/.test(text)) return "ontem";
  if (/\bsemana\b/.test(text)) return "semana";
  if (/\bmes|m[eê]s\b/.test(text)) return "mes";
  return fallback;
}

function reportEventTypeFromAction(action: GeminiAction) {
  const text = actionText(action);
  return cleanString(text.match(/\bevento_tipo:([a-z_]+)\b/)?.[1])
    || (/\b(?:parto|partos|pariram|deu cria|deram cria)\b/.test(text) ? "parto" : undefined);
}

function stockQueryMode(action: GeminiAction) {
  const text = actionText(action);
  if (/\b(?:baixo|baixa|acabando|minimo|m[ií]nimo)\b/.test(text)) return "baixo";
  if (/\b(?:zerado|zerada|zerados|zeradas|sem estoque)\b/.test(text)) return "zerado";
  if (/\b(?:historico|hist[oó]rico|movimenta[cç][aã]o|entradas?|saidas?)\b/.test(text)) return "historico";
  if (/\b(?:lista|todos|itens|produtos)\b/.test(text)) return "lista";
  return undefined;
}

function productionQueryMode(action: GeminiAction) {
  const text = actionText(action);
  if (/\b(?:mais|maior|melhor)\b/.test(text)) return "maior_produtor";
  if (/\b(?:menos|menor|pior)\b/.test(text)) return "menor_produtor";
  return undefined;
}

function financeType(action: GeminiAction) {
  const text = actionText(action);
  if (/\b(?:gastei|gasto|gastos|despesa|despesas|paguei|compra|comprei|saida|sa[ií]da)\b/.test(text)) return "saida";
  if (/\b(?:entrou|entrada|receita|recebi|venda|vendi|ganhei)\b/.test(text)) return "entrada";
  return undefined;
}

function pointType(action: GeminiAction) {
  if (action.operation === "clock_out") return "saida";
  if (action.operation === "clock_in") return "entrada";
  const text = actionText(action);
  if (/\b(?:saida|sa[ií]da|saiu|fim)\b/.test(text)) return "saida";
  return "entrada";
}

function medicineType(action: GeminiAction) {
  return /\bvacina|vacin/i.test(actionText(action)) ?"vacina" : "tratamento";
}

function herdCategoryFromGeminiText(text: string) {
  if (/\b(?:vacas?|vaca)\b/.test(text)) return "vaca";
  if (/\b(?:bois?|boi)\b/.test(text)) return "boi";
  if (/\b(?:touros?|touro)\b/.test(text)) return "touro";
  if (/\b(?:bezerras?|bezerra)\b/.test(text)) return "bezerra";
  if (/\b(?:bezerros?|bezerro)\b/.test(text)) return "bezerro";
  if (/\b(?:novilhas?|novilha)\b/.test(text)) return "novilha";
  return undefined;
}

function herdReproductionFromGeminiText(text: string) {
  if (/\b(?:prenhas?|prenhes|prenhe|prenhez|gestantes?|gestacao|gestando|gravidas?)\b/.test(text)) return "prenhe";
  if (/\b(?:pre\s*parto|pre-parto|preparto|quase\s+parindo|perto\s+de\s+parir)\b/.test(text)) return "pre_parto";
  if (/\b(?:inseminad[ao]s?|inseminacao|inseminacoes|cobert[ao]s?|cobertura|cobertas?|cobertos?)\b/.test(text)) return "inseminada";
  if (/\b(?:sem\s+(?:evento|eventos|historico|registro|registros))\b/.test(text)) return "sem_evento";
  return undefined;
}

function herdModeFromGeminiText(text: string) {
  if (/\b(?:quantos|quantas|total|contagem|numero)\b/.test(text)) return "contagem";
  if (/\b(?:resumo|relatorio|relatorio|dados)\b/.test(text)) return "resumo";
  return "lista";
}

function hasCollectiveHerdCue(text: string) {
  const directCollective = /\b(?:minhas?\s+vacas|minhas?\s+bezerras|meus\s+animais|vacas|bois|touros|bezerros|bezerras|novilhas|animais|rebanho|gado|cadastrados?|cadastradas?|dados\s+das|dados\s+dos)\b/.test(text);
  const listCue = /\b(?:lista|listar|liste|mostra|mostrar|mostre|relatorio|resumo|quais|quantos|quantas)\b/.test(text);
  const groupCue = /\b(?:vacas|bois|touros|bezerros|bezerras|novilhas|animais|rebanho|gado|cadastrados?|cadastradas?)\b/.test(text);
  return directCollective || (listCue && groupCue);
}

function hasSpecificAnimalCue(entity: string | undefined, text: string) {
  if (entity && !/\b(?:vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?|animais|rebanho|gado|minhas?|meus|cadastrados?|cadastradas?)\b/.test(normalizeRanchoText(entity))) return true;
  return /\b(?:brinco|codigo|cod|numero|n)\s+[a-z]*\d[a-z0-9-]*\b/.test(text)
    || /\b(?:vaca|animal|boi|touro|bezerro|bezerra|novilha)\s+\d[a-z0-9-]*\b/.test(text)
    || /\b[a-z]+-\d[a-z0-9-]*\b/.test(text)
    || /\b[a-z]+\d[a-z0-9-]*\b/.test(text);
}

function normalizeGeminiIntentByText(action: GeminiAction): GeminiAction {
  const text = actionText(action);
  const entity = cleanString(action.entity);

  if (action.type !== "CONSULTA_ANIMAL") return action;
  if (hasSpecificAnimalCue(entity, text)) return action;
  if (!hasCollectiveHerdCue(text)) return action;

  return {
    ...action,
    type: "CONSULTA_REBANHO",
    entity: herdCategoryFromGeminiText(text) || null,
    notes: [
      action.notes,
      herdReproductionFromGeminiText(text) ?`reproducao:${herdReproductionFromGeminiText(text)}` : null,
      `modo:${herdModeFromGeminiText(text)}`
    ].filter(Boolean).join(" | ") || null
  };
}

function herdDataFromGeminiAction(action: GeminiAction) {
  const text = actionText(action);
  const notes = cleanString(action.notes) || "";
  const mode = cleanString(notes.match(/\bmodo:([a-z_]+)\b/)?.[1]) || herdModeFromGeminiText(text);
  const reproduction = cleanString(notes.match(/\breproducao:([a-z_]+)\b/)?.[1]) || herdReproductionFromGeminiText(text);
  const category = herdCategoryFromGeminiText(text) || herdCategoryFromGeminiText(normalizeRanchoText(String(action.entity || "")));

  return {
    consulta: true,
    modo: mode,
    categoria: category,
    reproducao: reproduction,
    filtro_texto: cleanString(action.notes || action.entity)
  };
}

function withGeminiMetadata(tipo: RanchoIntent, action: GeminiAction, interpretation: GeminiInterpretation, dados: AnyRecord) {
  return {
    ...dados,
    origem_parser: "gemini",
    gemini_requires_confirmation: consultationRequiresConfirmation(tipo, interpretation),
    gemini_reason: interpretation.reason,
    gemini_raw_text: action.rawText
  };
}

function buildParsed(tipo: RanchoIntent, dados: AnyRecord, confidence: number) {
  return finalize(tipo, dados, buildMissing(tipo, dados), confidence);
}

function convertAction(action: GeminiAction, interpretation: GeminiInterpretation): ParsedRanchoMessage | null {
  action = normalizeGeminiIntentByText(action);
  if (!isRanchoIntent(action.type)) return null;

  let tipo: RanchoIntent = action.type;
  const entity = cleanString(action.entity);
  const notes = cleanString(action.notes);
  const quantity = action.quantity ?? undefined;
  const unit = cleanString(action.unit);
  const period = periodFromAction(action);
  const confidence = interpretation.confidence;
  let dados: AnyRecord = {};

  if (tipo === "CONSULTA_ESTOQUE" && entity) tipo = "CONSULTA_ESTOQUE_ITEM";
  if (tipo === "CONSULTA_PRODUCAO" && entity) tipo = "CONSULTA_PRODUCAO_ANIMAL";

  switch (tipo) {
    case "PRODUCAO_LEITE":
      dados = {
        animal_codigo: entity,
        litros: quantity,
        data_referencia: period || "hoje"
      };
      break;
    case "PARTO":
      dados = {
        animal_codigo: entity,
        data_referencia: period
      };
      break;
    case "VACINA_MEDICAMENTO":
      dados = {
        animal_codigo: entity,
        produto: notes,
        evento_tipo: medicineType(action),
        data_referencia: period
      };
      break;
    case "MORTE":
      dados = {
        animal_codigo: entity,
        data_referencia: period,
        motivo: notes
      };
      break;
    case "DESPESA":
    case "RECEITA_VENDA":
      dados = {
        valor: quantity,
        descricao: notes || entity || action.rawText,
        data_referencia: period || "hoje"
      };
      break;
    case "CRIAR_ITEM_ESTOQUE":
    case "ESTOQUE_CADASTRO":
      dados = {
        item_nome: entity || notes,
        quantidade: quantity,
        unidade: unit
      };
      break;
    case "ESTOQUE_ENTRADA":
    case "ESTOQUE_SAIDA":
      dados = {
        item_nome: entity || notes,
        quantidade: quantity,
        unidade: unit,
        data_referencia: period || "hoje",
        compra: /\b(?:compra|comprei|paguei|custou)\b/.test(actionText(action)) || undefined
      };
      break;
    case "CRIAR_FUNCIONARIO":
      dados = {
        funcionario_nome: entity,
        funcao: notes
      };
      break;
    case "ATUALIZAR_FUNCIONARIO":
      dados = {
        funcionario_nome: entity,
        novo_valor: notes
      };
      break;
    case "DESLIGAR_FUNCIONARIO":
    case "EXCLUIR_FUNCIONARIO":
      dados = {
        funcionario_nome: entity
      };
      break;
    case "PONTO_FUNCIONARIO":
      dados = {
        funcionario_nome: entity,
        ponto_tipo: pointType(action),
        data_referencia: period || "hoje",
        agora: true
      };
      break;
    case "CADASTRO_ANIMAL":
      dados = {
        animal_codigo: entity,
        nome: notes
      };
      break;
    case "EXCLUIR_REBANHO":
      tipo = "ACAO_DESTRUTIVA_EM_MASSA";
      dados = {
        blocked: true,
        bloqueado: true,
        alvo: "rebanho",
        motivo: "destructive_bulk_action_blocked",
        should_confirm: false
      };
      break;
    case "ACAO_DESTRUTIVA_EM_MASSA":
      dados = {
        blocked: true,
        bloqueado: true,
        alvo: entity || "massa",
        motivo: "destructive_bulk_action_blocked",
        should_confirm: false
      };
      break;
    case "ATUALIZACAO_GENEALOGIA":
      dados = {
        animal_codigo: entity,
        novo_valor: notes
      };
      break;
    case "ATUALIZACAO_ANIMAL":
      dados = {
        animal_codigo: entity,
        novo_valor: notes
      };
      break;
    case "CRIAR_LOTE":
      dados = {
        lote_nome: entity || notes
      };
      break;
    case "CONSULTA_REBANHO":
      dados = herdDataFromGeminiAction(action);
      break;
    case "CONSULTA_LOTES":
      dados = {
        consulta: true,
        lote_nome: entity || notes
      };
      break;
    case "CONSULTA_PRODUCAO":
    case "CONSULTA_PRODUCAO_HOJE": {
      const queryMode = productionQueryMode(action);
      dados = {
        consulta: true,
        data_referencia: tipo === "CONSULTA_PRODUCAO_HOJE" ?periodFromAction(action, "hoje") : periodFromAction(action, "hoje"),
        periodo: tipo === "CONSULTA_PRODUCAO_HOJE" ?periodFromAction(action, "hoje") : periodFromAction(action, "hoje"),
        consulta_producao: queryMode
      };
      break;
    }
    case "CONSULTA_PRODUCAO_ANIMAL":
      dados = {
        consulta: true,
        animal_codigo: entity,
        data_referencia: periodFromAction(action, "hoje"),
        periodo: periodFromAction(action, "hoje")
      };
      break;
    case "CONSULTA_FINANCEIRO": {
      const tipoFinanceiro = financeType(action);
      dados = {
        consulta: true,
        data_referencia: periodFromAction(action, "mes"),
        periodo: periodFromAction(action, "mes"),
        financeiro_tipo: tipoFinanceiro,
        filtro_texto: entity || notes,
        financeiro_modo: action.operation === "report" ?"resumo" : undefined
      };
      break;
    }
    case "CONSULTA_ESTOQUE":
    case "CONSULTA_ESTOQUE_ITEM":
      dados = {
        consulta: true,
        item_nome: entity || notes
      };
      break;
    case "CONSULTA_ESTOQUE_GERAL":
      dados = {
        consulta: true,
        consulta_estoque: stockQueryMode(action),
        categoria: entity || notes
      };
      break;
    case "CONSULTA_FUNCIONARIO":
      dados = {
        consulta: true,
        funcionario_nome: entity
      };
      break;
    case "CONSULTA_PONTO":
      dados = {
        consulta: true,
        funcionario_nome: entity,
        data_referencia: periodFromAction(action, "hoje"),
        periodo: periodFromAction(action, "hoje")
      };
      break;
    case "CONSULTA_ANIMAL":
      dados = {
        consulta: true,
        animal_codigo: entity
      };
      break;
    case "CONSULTA_GENEALOGIA":
      dados = {
        consulta: true,
        animal_codigo: entity
      };
      break;
    case "CONSULTA_REGISTROS_HOJE":
      dados = {
        consulta: true,
        data_referencia: periodFromAction(action, "hoje"),
        periodo: periodFromAction(action, "hoje"),
        consulta_registros: action.operation === "report" ?"relatorio" : undefined,
        evento_tipo: reportEventTypeFromAction(action),
        evento: reportEventTypeFromAction(action) === "parto" ? "PARTO" : undefined
      };
      break;
    case "ORDEM_SERVICO":
      dados = {
        descricao: notes || action.rawText,
        data_referencia: period
      };
      break;
    case "AJUDA":
      dados = {};
      break;
    default:
      return null;
  }

  return buildParsed(tipo, withGeminiMetadata(tipo, action, interpretation, dados), confidence);
}

function makeBatchParsed(registros: ParsedRanchoMessage[], interpretation: GeminiInterpretation) {
  const dados = {
    registros,
    total_registros: registros.length,
    origem_parser: "gemini",
    gemini_requires_confirmation: true,
    gemini_reason: interpretation.reason
  };
  return finalize("LOTE_REGISTROS", dados, [], interpretation.confidence);
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
    if (isConsultIntent(parsed.tipo)) {
      if (sawMutation) sawConsultAfterMutation = true;
      continue;
    }
    if (sawConsultAfterMutation) return true;
    sawMutation = true;
  }
  return false;
}

function safeClarification(interpretation?: GeminiInterpretation) {
  const response = interpretation?.userResponse?.trim();
  if (response && response.length <= 500) return response;
  return GEMINI_CLARIFICATION_TEXT;
}

function safeMessagePreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function logLocalParserDecision(text: string, parsed: ParsedRanchoMessage, threshold: number) {
  const fallbackCalled = shouldUseGeminiFallback(parsed, threshold);
  console.log("[BOT PARSER DECISION]", {
    originalText: safeMessagePreview(text),
    parserIntent: parsed.tipo,
    parserConfidence: parsed.confianca,
    parserWarnings: parsed.flags || [],
    riskScore: parsed.riskScore ?? 0,
    fallbackCalled,
    fallbackReason: fallbackCalled ? parserDecisionForParsed(parsed, threshold) : "local_parser_coherent",
    missingFields: parsed.perguntas_faltantes || [],
    decision: parserDecisionForParsed(parsed, threshold),
    reason: parsed.reason || parsed.debugReason || ""
  });
}

function convertInterpretation(interpretation: GeminiInterpretation, threshold: number): GeminiFallbackParseResult {
  if (interpretation.confidence < threshold) {
    return {
      kind: "clarify",
      threshold,
      reason: "gemini_low_confidence",
      message: safeClarification(interpretation)
    };
  }

  const parsedActions = interpretation.actions.map((action) => convertAction(action, interpretation));
  if (parsedActions.some((parsed) => !parsed)) {
    return {
      kind: "clarify",
      threshold,
      reason: "gemini_action_not_mapped",
      message: GEMINI_CLARIFICATION_TEXT
    };
  }

  const parsed = parsedActions as ParsedRanchoMessage[];
  const consultations = parsed.filter((item) => isConsultIntent(item.tipo));
  const mutations = parsed.filter((item) => !isConsultIntent(item.tipo));

  if (parsed.length === 1) {
    return {
      kind: "parsed",
      threshold,
      parsed: parsed[0],
      gemini: interpretation
    };
  }

  if (!mutations.length) {
    return {
      kind: "consultations",
      threshold,
      consultations: parsed,
      gemini: interpretation
    };
  }

  if (!consultations.length) {
    return {
      kind: "parsed",
      threshold,
      parsed: makeBatchParsed(mutations, interpretation),
      gemini: interpretation
    };
  }

  if (hasUnsupportedInterleaving(parsed)) {
    return {
      kind: "clarify",
      threshold,
      reason: "compound_order_not_supported",
      message: "Entendi mais de uma ação, mas a ordem ficou ambígua. Pode mandar uma ação por vez ou separar em frases mais claras?"
    };
  }

  const firstMutationIndex = parsed.findIndex((item) => !isConsultIntent(item.tipo));
  const immediateConsultations = parsed.slice(0, firstMutationIndex).filter((item) => isConsultIntent(item.tipo));
  const postConfirmationConsultations = parsed.slice(firstMutationIndex + 1).filter((item) => isConsultIntent(item.tipo));
  const pending = attachPostConfirmationConsultations(
    mutations.length === 1 ?mutations[0] : makeBatchParsed(mutations, interpretation),
    postConfirmationConsultations
  );

  return {
    kind: "compound",
    threshold,
    immediateConsultations,
    pending,
    postConfirmationConsultations,
    gemini: interpretation
  };
}

export async function parseWithGeminiFallback(input: {
  text: string;
  localParsed: ParsedRanchoMessage;
  owner: WhatsAppOwner;
}): Promise<GeminiFallbackParseResult> {
  const threshold = geminiFallbackConfidence();
  logLocalParserDecision(input.text, input.localParsed, threshold);

  if (detectDestructiveBulkAction(input.text)) {
    return {
      kind: "parsed",
      threshold,
      parsed: destructiveBulkActionParsed(input.text),
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

  if (detectRecentBirthsQuery(input.text) && ["DESCONHECIDO", "CONSULTA_ANIMAL", "CONSULTA_REBANHO"].includes(input.localParsed.tipo)) {
    return {
      kind: "parsed",
      threshold,
      parsed: finalize("CONSULTA_REGISTROS_HOJE", recentBirthsQueryData(input.text), [], 0.92),
      gemini: {
        confidence: 0.92,
        requiresConfirmation: false,
        reason: "reproduction_birth_query_normalized",
        risk_flags: [],
        actions: [],
        userResponse: ""
      }
    };
  }

  if (!shouldUseGeminiFallback(input.localParsed, threshold)) {
    return {
      kind: "local",
      parsed: input.localParsed,
      threshold
    };
  }

  const gemini = await interpretRanchoMessageWithGemini({
    message: input.text,
    context: {
      channel: "whatsapp",
      userRole: input.owner.papel_bot || "usuario"
    }
  });

  if (!gemini.ok) {
    if (gemini.reason === "missing_api_key") {
      console.log("[BOT FALLBACK DECISION]", {
        originalText: safeMessagePreview(input.text),
        fallbackCalled: true,
        fallbackReason: "missing_api_key",
        parserIntent: input.localParsed.tipo,
        finalIntent: input.localParsed.tipo,
        finalDecisionReason: "Gemini indisponível; seguindo parser local validado pelo backend"
      });
      return {
        kind: "local",
        parsed: input.localParsed,
        threshold
      };
    }

    return {
      kind: "clarify",
      threshold,
      reason: gemini.reason,
      message: GEMINI_CLARIFICATION_TEXT
    };
  }

  const converted = convertInterpretation(gemini.interpretation, threshold);
  console.log("[BOT FALLBACK DECISION]", {
    originalText: safeMessagePreview(input.text),
    fallbackCalled: true,
    fallbackReason: "risk_or_low_confidence",
    parserIntent: input.localParsed.tipo,
    geminiIntent: gemini.interpretation.actions[0]?.type || null,
    geminiConfidence: gemini.interpretation.confidence,
    geminiRiskFlags: gemini.interpretation.risk_flags || [],
    finalIntent: converted.kind === "parsed" ?converted.parsed.tipo
      : converted.kind === "consultations" ?converted.consultations[0]?.tipo
      : converted.kind === "compound" ?converted.pending.tipo
      : input.localParsed.tipo,
    finalDecisionReason: converted.kind
  });
  return converted;
}
