import type { AnyRecord } from "@/lib/types";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp";
import type { ParsedRanchoMessage, RanchoIntent } from "@/lib/whatsapp/nlp";
import type { ParserRiskFlag } from "@/lib/whatsapp/nlp-core/types";
import { detectStructuredInput } from "@/lib/whatsapp/nlp-core/tabular-events";

export type ConversationMessageType =
  | "new_action"
  | "confirmation"
  | "negation"
  | "correction"
  | "cancellation"
  | "clarification";

export type ConversationDecision =
  | "new_action"
  | "apply_correction"
  | "ask_confirmation"
  | "ask_clarification"
  | "cancel"
  | "blocked";

export type ConversationCorrection = {
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
};

export type ConversationAct = {
  messageType: ConversationMessageType;
  intent: RanchoIntent | null;
  confidence: number;
  targetPreviousActionId: string | null;
  targetPreviousAction: RanchoIntent | null;
  correction: ConversationCorrection | null;
  flags: ParserRiskFlag[];
  decision: ConversationDecision;
  reason: string;
  normalizedText: string;
  hasPendingAction: boolean;
  negatedIntent?: RanchoIntent | null;
};

type ConversationSession = {
  etapa?: string | null;
  dados?: AnyRecord | null;
} | null | undefined;

type DetectConversationActInput = {
  text: string;
  command?: string;
  session?: ConversationSession;
  pending?: ParsedRanchoMessage | null;
};

const CONFIRM_EXACT = new Set([
  "sim",
  "s",
  "ss",
  "ok",
  "okay",
  "blz",
  "beleza",
  "certo",
  "ta certo",
  "isso",
  "isso mesmo",
  "confirmo",
  "confirma",
  "confirmar",
  "confirmado",
  "correto",
  "pode",
  "pode sim",
  "pode salvar",
  "pode registrar",
  "pode lancar",
  "salvar",
  "salva",
  "registrar",
  "registra",
  "lancar",
  "lanca",
  "fechou",
  "show",
  "joia",
  "manda",
  "vai",
  "1"
]);

const CANCELLATION_PATTERN = /^(?:cancelar|cancela|cancele|cancela essa|desfaz|desfazer|esquece|deixa(?: pra la| para la)?|pare|para|parar|aborta|abortar|sair|apaga isso|nao salva|nao salve|nao salvar|nao registrar)\b/;
const NEGATION_PATTERN = /\b(?:nao|n)\b|\bnao\s+(?:e|foi|era|quis|salva|salvar|registrar)\b/;
const STRONG_NEGATION_PATTERN = /\bnao\s+(?:e|foi|era|quis dizer)\b|\b(?:entendeu errado|ta errado|esta errado|errado|incorreto|negativo)\b/;
const CORRECTION_PATTERN = /\b(?:errei|corrige|corrigir|corrija|quero corrigir|na verdade|quis dizer|nao quis dizer|troca|trocar|ajusta|ajustar|atualiza|atualizar|entendeu errado|ta errado|esta errado|errado|incorreto)\b/;
const REPLACEMENT_PATTERN = /\b(?:nao\s+(?:era|foi|e).+\b(?:era|foi|e)\b|foi\s+(?:na|no|a|o)?\s*\w+|era\s+(?:a|o)?\s*\w+|foram?\s+\d|era\s+\d|uso|saida|baixa|cio)\b/;
const CONTEXT_REFERENCE_PATTERN = /\b(?:isso|essa|esse|dessa|desse|ultimo|ultima|anterior|lancamento|registro|entendeu|quis dizer)\b/;
const HEALTH_OBSERVATION_PATTERN = /\b(?:nao comeu|nao levantou|sem comer|mancando|doente|fraco|fraca|ruim|febre|diarreia|mastite|tossindo|ferida)\b/;
function isReproductiveProtocolResult(normalized: string) {
  return /\bnao passou\b/.test(normalized)
    && /\b(?:protocolo|reteste|\d[a-z0-9]*(?:\s+[a-z]{1,4})?)\b/.test(normalized);
}

function uniqueFlags(values: ParserRiskFlag[]) {
  return Array.from(new Set(values));
}

function pendingFrom(input: DetectConversationActInput) {
  return input.pending || input.session?.dados?.pending as ParsedRanchoMessage | undefined;
}

function pendingId(pending?: ParsedRanchoMessage | null) {
  const dados = pending?.dados || {};
  return String(dados.id || dados.registro_id || dados.movimentacao_id || dados.transacao_id || "").trim() || null;
}

function detectNegatedIntent(normalized: string): RanchoIntent | null {
  if (/\b(?:parto|pariu|parir|nasceu bezerro|nasceu bezerra)\b/.test(normalized)) return "PARTO";
  if (/\b(?:vacina|vacin|medicamento|remedio|tratamento)\b/.test(normalized)) return "VACINA_MEDICAMENTO";
  if (/\b(?:morte|morreu|morre)\b/.test(normalized)) return "MORTE";
  if (/\b(?:leite|litro|ordenha|producao)\b/.test(normalized)) return "PRODUCAO_LEITE";
  if (/\b(?:compra|entrada|estoque)\b/.test(normalized)) return "ESTOQUE_ENTRADA";
  if (/\b(?:uso|saida|baixa)\b/.test(normalized)) return "ESTOQUE_SAIDA";
  if (/\b(?:despesa|gasto|paguei|financeiro)\b/.test(normalized)) return "DESPESA";
  if (/\b(?:receita|entrou|vendi|venda)\b/.test(normalized)) return "RECEITA_VENDA";
  return null;
}

function baseAct(input: DetectConversationActInput): Omit<ConversationAct, "messageType" | "confidence" | "decision" | "reason" | "flags" | "correction"> {
  const pending = pendingFrom(input);
  const normalizedText = input.command || normalizeRanchoText(input.text);
  const hasPendingAction = Boolean(pending?.tipo && input.session?.etapa && input.session.etapa !== "livre");
  return {
    intent: null,
    targetPreviousActionId: pendingId(pending),
    targetPreviousAction: hasPendingAction ?pending?.tipo || null : null,
    normalizedText,
    hasPendingAction,
    negatedIntent: detectNegatedIntent(normalizedText)
  };
}

export function detectConversationAct(input: DetectConversationActInput): ConversationAct {
  const base = baseAct(input);
  const normalized = base.normalizedText;
  const pending = pendingFrom(input);
  const flags: ParserRiskFlag[] = [];

  if (base.hasPendingAction) {
    flags.push("pending_action_response", "references_previous_context");
  }

  if (detectStructuredInput(input.text).isStructured) {
    return {
      ...base,
      messageType: "new_action",
      intent: null,
      confidence: 0.9,
      correction: null,
      flags: uniqueFlags(flags),
      decision: "new_action",
      reason: "Mensagem estruturada tratada como nova entrada, sem preencher a pendencia anterior."
    };
  }

  if (CANCELLATION_PATTERN.test(normalized)) {
    flags.push("cancellation_message");
    return {
      ...base,
      messageType: "cancellation",
      confidence: base.hasPendingAction ?0.97 : 0.82,
      correction: null,
      flags: uniqueFlags(flags),
      decision: "cancel",
      reason: base.hasPendingAction ? "Usuario cancelou a acao pendente." : "Usuario pediu cancelamento sem acao pendente."
    };
  }

  if (CONFIRM_EXACT.has(normalized)) {
    flags.push("confirmation_response");
    if (!base.hasPendingAction) flags.push("missing_context");
    return {
      ...base,
      messageType: "confirmation",
      intent: pending?.tipo || null,
      confidence: base.hasPendingAction ?0.98 : 0.6,
      correction: null,
      flags: uniqueFlags(flags),
      decision: base.hasPendingAction ? "apply_correction" : "ask_clarification",
      reason: base.hasPendingAction ? "Usuario confirmou a acao pendente." : "Confirmacao sem pergunta pendente."
    };
  }

  const isCorrection = CORRECTION_PATTERN.test(normalized);
  const isNegation = NEGATION_PATTERN.test(normalized) || STRONG_NEGATION_PATTERN.test(normalized);
  const hasReplacement = REPLACEMENT_PATTERN.test(normalized);
  const referencesContext = CONTEXT_REFERENCE_PATTERN.test(normalized);

  if (HEALTH_OBSERVATION_PATTERN.test(normalized) && !isCorrection) {
    return {
      ...base,
      messageType: "new_action",
      confidence: 0.82,
      correction: null,
      flags: uniqueFlags(flags),
      decision: "new_action",
      reason: "Mensagem com observacao sanitaria tratada como nova acao."
    };
  }

  if (!base.hasPendingAction && isReproductiveProtocolResult(normalized)) {
    return {
      ...base,
      messageType: "new_action",
      confidence: 0.82,
      correction: null,
      flags: uniqueFlags(flags),
      decision: "new_action",
      reason: "Resultado de protocolo reprodutivo tratado como nova acao."
    };
  }

  if (isCorrection || (isNegation && hasReplacement)) {
    flags.push("correction_message", "requires_confirmation", "possible_duplicate_risk");
    if (isNegation) flags.push("negation_message");
    if (base.hasPendingAction || referencesContext) flags.push("references_previous_context");
    if (!base.hasPendingAction) flags.push("missing_context", "unsafe_to_apply_correction");
    else flags.push("safe_to_apply_correction");
    if (base.negatedIntent) flags.push("do_not_treat_as_new_action");

    return {
      ...base,
      messageType: "correction",
      intent: pending?.tipo || null,
      confidence: base.hasPendingAction ?0.88 : 0.58,
      correction: {
        field: null,
        oldValue: null,
        newValue: null
      },
      flags: uniqueFlags(flags),
      decision: base.hasPendingAction ? "ask_confirmation" : "ask_clarification",
      reason: base.hasPendingAction
        ? "Usuario informou correcao sobre a acao pendente."
        : "Mensagem de correcao sem contexto suficiente."
    };
  }

  if (isNegation) {
    flags.push("negation_message");
    if (base.negatedIntent) flags.push("do_not_treat_as_new_action");
    if (base.hasPendingAction) flags.push("requires_confirmation", "references_previous_context");
    else flags.push("missing_context");

    return {
      ...base,
      messageType: "negation",
      intent: pending?.tipo || null,
      confidence: base.hasPendingAction ?0.9 : base.negatedIntent ?0.78 : 0.62,
      correction: null,
      flags: uniqueFlags(flags),
      decision: base.hasPendingAction ? "cancel" : "ask_clarification",
      reason: base.negatedIntent
        ? "Usuario negou uma intencao que o parser poderia tratar como acao positiva."
        : "Usuario negou sem contexto suficiente."
    };
  }

  if (input.session?.etapa === "aguardando_dado") {
    return {
      ...base,
      messageType: "clarification",
      intent: pending?.tipo || null,
      confidence: 0.78,
      correction: null,
      flags: uniqueFlags([...flags, "pending_action_response", "references_previous_context"]),
      decision: "apply_correction",
      reason: "Resposta para preencher dado faltante da acao pendente."
    };
  }

  return {
    ...base,
    messageType: "new_action",
    confidence: 0.8,
    correction: null,
    flags: uniqueFlags(flags),
    decision: "new_action",
    reason: "Mensagem tratada como nova acao."
  };
}

function safeMessagePreview(text: string) {
  return String(text || "")
    .replace(/[A-Za-z0-9_=-]{32,}/g, "[redacted]")
    .slice(0, 180);
}

export function logConversationAct(text: string, act: ConversationAct) {
  console.log("[BOT CONVERSATION ACT]", {
    message: safeMessagePreview(text),
    messageType: act.messageType,
    intent: act.intent,
    confidence: act.confidence,
    flags: act.flags,
    hasPendingAction: act.hasPendingAction,
    targetPreviousAction: act.targetPreviousAction,
    decision: act.decision,
    reason: act.reason
  });
}
