import type { AnyRecord } from "@/lib/types";
import { generateStructuredAI, parseJsonObjectText, providerApiKeyConfigured } from "@/lib/whatsapp/ai-provider";
import { polishBotResponse } from "@/lib/whatsapp/user-facing-text";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { BotSession } from "@/services/whatsapp/session-service";

export type ComposeBotResponseInput = {
  response: string;
  userMessage: string;
  parsed?: ParsedRanchoMessage | null;
  previousSession?: BotSession | null;
  nextSession?: BotSession | null;
  eventConfirmed?: boolean;
  modoTeste?: boolean;
};

export type ComposeBotResponseResult = {
  response: string;
  usedAI: boolean;
  reason?: string;
};

type BotResponseComposition = {
  type: "bot_response_composition";
  confidence: number;
  message: string;
};

const MAX_RESPONSE_TO_COMPOSE = 6000;
const MIN_RESPONSE_TO_COMPOSE = 35;
const TECHNICAL_TERMS = /\b(?:action_plan|ActionPlan|route|legacy|fallback|fixture|mock|parser|gemini|openrouter|debug)\b/i;
const CONFIRMED_SAVE_RE = /\b(?:salv[eo]i?|registrei|cadastrei|importei|movimentei|dei baixa|lancei|lan[çc]ei)\b/i;
const NOT_SAVED_RE = /\b(?:n[ãa]o foi salvo|nenhum(?:a)? .*salvo|nada foi salvo|nenhum registro real foi salvo|sem salvar|antes de salvar|pr[eé]-valida[çc][ãa]o|preview|pr[eé]via|est[aá] correto|confirmar)\b/i;

function automatedTestBlocksComposer() {
  return process.env.NODE_ENV === "test" || process.env.RANCHO_BOT_TEST === "1";
}

function responseComposerEnabled() {
  const raw = String(process.env.BOT_RESPONSE_COMPOSER_ENABLED || "").trim().toLowerCase();
  if (["0", "false", "off", "nao", "não"].includes(raw)) return false;
  if (["1", "true", "on", "sim"].includes(raw)) return true;
  return true;
}

function mandatoryLines(response: string) {
  return response
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\s*-\s+\S+/.test(line));
}

function normalizeComparable(value: string) {
  return polishBotResponse(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function includesComparable(text: string, expected: string) {
  return normalizeComparable(text).includes(normalizeComparable(expected));
}

function compactDataForPrompt(parsed?: ParsedRanchoMessage | null) {
  if (!parsed?.dados) return null;
  const dados = parsed.dados as AnyRecord;
  const keys = [
    "animal_codigo",
    "cria_codigo",
    "cria_sexo",
    "item_nome",
    "quantidade",
    "unidade",
    "valor",
    "data_referencia",
    "lote_nome",
    "funcionario_nome",
    "total_linhas",
    "resumo_partos",
    "resumo_validacao",
    "action_plan_domain",
    "action_plan_capability"
  ];
  const compact: AnyRecord = {};
  for (const key of keys) {
    if (dados[key] !== undefined && dados[key] !== null && dados[key] !== "") compact[key] = dados[key];
  }
  return Object.keys(compact).length ? compact : null;
}

function shouldTryAIComposition(input: ComposeBotResponseInput) {
  const response = String(input.response || "").trim();
  if (!response) return false;
  if (!responseComposerEnabled()) return false;
  if (automatedTestBlocksComposer()) return false;
  if (!providerApiKeyConfigured()) return false;
  if (response.length < MIN_RESPONSE_TO_COMPOSE) return false;
  if (response.length > MAX_RESPONSE_TO_COMPOSE) return false;
  if (/erro interno|instabilidade para interpretar/i.test(response)) return false;
  return Boolean(input.parsed?.tipo || mandatoryLines(response).length || response.length >= 120);
}

function buildResponseComposerPrompt(input: ComposeBotResponseInput) {
  const options = mandatoryLines(input.response);
  const context = {
    userMessage: input.userMessage,
    intent: input.parsed?.tipo || null,
    confidence: input.parsed?.confianca || null,
    previousState: input.previousSession?.etapa || null,
    nextState: input.nextSession?.etapa || null,
    eventConfirmed: Boolean(input.eventConfirmed),
    missingFields: input.parsed?.perguntas_faltantes || [],
    extractedData: compactDataForPrompt(input.parsed),
    mandatoryOptionLines: options,
    originalResponse: polishBotResponse(input.response)
  };

  return [
    "Voce e o compositor de respostas do bot Rancho.",
    "Sua tarefa e reescrever a resposta validada pelo backend em portugues natural, claro e profissional.",
    "Retorne somente JSON. Nao retorne markdown fora do JSON.",
    "",
    "Regras rigidas:",
    "- Use somente os fatos presentes em originalResponse e extractedData.",
    "- Nao invente dados, valores, codigos, animais, datas, permissoes ou salvamentos.",
    "- Nao altere a acao definida pelo backend.",
    "- Nao diga que salvou, registrou, cadastrou ou importou se originalResponse estiver pedindo confirmacao ou dizendo que nada foi salvo.",
    "- Se houver mandatoryOptionLines, copie essas linhas exatamente como estao.",
    "- Mantenha a resposta curta, escaneavel e educada.",
    "- Remova termos tecnicos internos como action_plan, route, parser, mock, fixture, fallback ou debug.",
    "",
    "Contrato JSON:",
    JSON.stringify({
      type: "bot_response_composition",
      confidence: 0.9,
      message: "Texto final para o usuario"
    }, null, 2),
    "",
    "Contexto validado pelo backend:",
    JSON.stringify(context, null, 2)
  ].join("\n");
}

function normalizeComposition(value: unknown): BotResponseComposition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AnyRecord;
  if (record.type !== "bot_response_composition") return null;
  const message = String(record.message || "").trim();
  const confidence = Number(record.confidence || 0);
  if (!message || !Number.isFinite(confidence)) return null;
  return {
    type: "bot_response_composition",
    confidence,
    message
  };
}

export function validateComposedBotResponse(originalResponse: string, composed: unknown): ComposeBotResponseResult {
  const original = polishBotResponse(originalResponse);
  const composition = normalizeComposition(composed);
  if (!composition) return { response: original, usedAI: false, reason: "invalid_contract" };
  if (composition.confidence < 0.72) return { response: original, usedAI: false, reason: "low_confidence" };

  const message = polishBotResponse(composition.message).trim();
  if (!message) return { response: original, usedAI: false, reason: "empty_message" };
  if (message.length > Math.max(900, original.length * 2.2)) {
    return { response: original, usedAI: false, reason: "too_long" };
  }
  if (TECHNICAL_TERMS.test(message) && !TECHNICAL_TERMS.test(original)) {
    return { response: original, usedAI: false, reason: "technical_term_leak" };
  }

  for (const line of mandatoryLines(original)) {
    if (!includesComparable(message, line)) {
      return { response: original, usedAI: false, reason: "missing_mandatory_option" };
    }
  }

  if (NOT_SAVED_RE.test(original) && CONFIRMED_SAVE_RE.test(message) && !NOT_SAVED_RE.test(message)) {
    return { response: original, usedAI: false, reason: "unsafe_save_claim" };
  }

  return { response: message, usedAI: true };
}

export async function composeBotResponseWithAI(input: ComposeBotResponseInput): Promise<ComposeBotResponseResult> {
  const fallback = polishBotResponse(input.response);
  if (!shouldTryAIComposition(input)) return { response: fallback, usedAI: false, reason: "skipped" };

  try {
    const generated = await generateStructuredAI({
      purpose: "response_composer",
      userPrompt: buildResponseComposerPrompt(input),
      temperature: 0.2,
      maxTokens: 900
    });
    if (!generated.ok) return { response: fallback, usedAI: false, reason: generated.reason };
    const validation = validateComposedBotResponse(fallback, parseJsonObjectText(generated.rawText));
    console.log("[BOT RESPONSE COMPOSER]", {
      event: validation.usedAI ? "response_composer_used" : "response_composer_rejected",
      reason: validation.reason || null,
      originalLength: fallback.length,
      finalLength: validation.response.length
    });
    return validation;
  } catch (error) {
    console.warn("[BOT RESPONSE COMPOSER]", {
      event: "response_composer_error",
      message: error instanceof Error ? error.message : "erro desconhecido"
    });
    return { response: fallback, usedAI: false, reason: "exception" };
  }
}
