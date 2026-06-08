import type { AnyRecord } from "@/lib/types";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { buildMissing } from "./result";
import type {
  DetectedRanchoEntities,
  ParsedAction,
  ParsedRanchoMessage,
  ParserDecision,
  ParserRiskFlag,
  RanchoIntent
} from "./types";

const DEFAULT_GEMINI_FALLBACK_CONFIDENCE = 0.6;

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

const FALLBACK_FLAGS = new Set<ParserRiskFlag>([
  "multiple_intents_detected",
  "compound_message",
  "conflicting_intents",
  "correction_message",
  "negation_message"
]);

const AMBIGUOUS_VERB_PATTERN = /\b(?:sobe|subir|baixa|baixar|lanca|lança|coloca|colocar|tira|tirar|bota|botar|arruma|arrumar|muda|mudar)\b/;
const COMPOUND_CONNECTOR_PATTERN = /\b(?:tambem|também|mas antes|depois|ai|aí|em seguida|alem disso|além disso|e depois|e ve|e vê|e me|e cria|e criar|e compra|e comprar|,)\b/;
const AMBIGUOUS_REFERENCE_PATTERN = /\b(?:isso|aquele|aquela|essa|esse|ele|ela|mesmo|mesma)\b/;
const CORRECTION_PATTERN = /\b(?:errei|corrige|corrigir|na verdade|nao era|não era|errado|troca|trocar|ajusta|ajustar)\b/;
const NEGATION_PATTERN = /\bnao\s+(?:e|foi|era|quis|salva|salvar|registrar)\b|\b(?:entendeu errado|ta errado|esta errado|negativo|incorreto)\b/;
const CANCELLATION_PATTERN = /\b(?:cancela|cancelar|desfaz|desfazer|esquece|nao salva|nao salvar|nao registrar)\b/;
const CONFIRMATION_PATTERN = /^(?:sim|s|ss|ok|okay|blz|beleza|isso|isso mesmo|correto|confirmo|confirma|confirmar|pode|pode sim|pode salvar|pode registrar|salvar|salva|registrar|registra|1)$/;
const DESTRUCTIVE_PATTERN = /\b(?:apaga tudo|apagar tudo|zera|zerar|excluir tudo|delete tudo|remove tudo|limpa tudo|limpar tudo|muda todos|alterar todos)\b/;
const SENSITIVE_PATTERN = /\b(?:excluir|desligar|apagar|zerar|morte|morreu|alterar|atualizar|muda|mudar|genealogia)\b/;
const GENERIC_COMMAND_PATTERN = /\b(?:faz ai|faz aí|faz qualquer coisa|resolve|arruma isso|mexe ai|mexe aí)\b/;

function unique<T>(values: Array<T | undefined | null | "">): T[] {
  return Array.from(new Set(values.filter((value): value is T => value !== undefined && value !== null && value !== "")));
}

function addFlag(flags: Set<ParserRiskFlag>, flag: ParserRiskFlag, active = true) {
  if (active) flags.add(flag);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function asNumber(value: unknown) {
  const number = typeof value === "number" ?value : Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ?number : undefined;
}

function numbersFromText(normalized: string) {
  const values = Array.from(normalized.matchAll(/\b\d+(?:[.,]\d+)?\b/g))
    .map((match) => Number(match[0].replace(",", ".")))
    .filter(Number.isFinite);
  return unique(values);
}

function moneyFromText(normalized: string) {
  const values = Array.from(normalized.matchAll(/(?:r\$\s*)?(\d+(?:[.,]\d+)?)\s*(?:reais|real|rs|brl)\b/g))
    .map((match) => Number(match[1].replace(",", ".")))
    .filter(Number.isFinite);
  return unique(values);
}

function unitsFromText(normalized: string) {
  return unique(Array.from(normalized.matchAll(/\b(?:kg|quilo|quilos|saco|sacos|litro|litros|l|dose|doses|unidade|unidades|caixa|caixas|fardo|fardos|brl|reais|real)\b/g)).map((match) => match[0]));
}

function datesFromText(normalized: string) {
  return unique([
    ...Array.from(normalized.matchAll(/\b(?:hoje|ontem|anteontem|amanha|amanhã|semana|mes|mês)\b/g)).map((match) => match[0]),
    ...Array.from(normalized.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)).map((match) => match[0]),
    ...Array.from(normalized.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)).map((match) => match[0])
  ]);
}

function stringValue(value: unknown) {
  const text = String(value || "").trim();
  return text || undefined;
}

function detectedEntitiesFromParsed(text: string, parsed: ParsedRanchoMessage): DetectedRanchoEntities {
  const normalized = normalizeRanchoText(text);
  const dados = parsed.dados || {};
  const quantities = unique([
    ...numbersFromText(normalized),
    asNumber(dados.quantidade),
    asNumber(dados.litros)
  ]);
  const moneyValues = unique([
    ...moneyFromText(normalized),
    asNumber(dados.valor)
  ]);
  const units = unique([
    ...unitsFromText(normalized),
    stringValue(dados.unidade)
  ]);
  const dates = unique([
    ...datesFromText(normalized),
    stringValue(dados.data_referencia),
    stringValue(dados.periodo)
  ]);

  return {
    animals: unique([stringValue(dados.animal_codigo), stringValue(dados.animal_referencia_nao_encontrada)]),
    stockItems: unique([stringValue(dados.item_nome), stringValue(dados.item_extraido)]),
    employees: unique([stringValue(dados.funcionario_nome)]),
    quantities,
    units,
    dates,
    moneyValues
  };
}

function moduleCues(normalized: string, parsed: ParsedRanchoMessage) {
  const cues = new Set<string>();
  if (/\b(?:litro|litros|leite|ordenha|ordenhado|produziu|producao|produção)\b/.test(normalized) || parsed.tipo.includes("PRODUCAO")) cues.add("producao");
  if (/\b(?:estoque|racao|ração|sal|saco|kg|baixa|sobe|entrada|saida|saída)\b/.test(normalized) || parsed.tipo.includes("ESTOQUE")) cues.add("estoque");
  if (/\b(?:financeiro|despesa|receita|paguei|gastei|entrou|reais|real|r\$|venda|vendi)\b/.test(normalized) || ["DESPESA", "RECEITA_VENDA", "CONSULTA_FINANCEIRO"].includes(parsed.tipo)) cues.add("financeiro");
  if (/\b(?:relatorio|relatório|resumo|fechamento|como foi|o que aconteceu|registros|consulta|quanto tem|quanto ela|me fala|ve como|vê como)\b/.test(normalized) || CONSULT_INTENTS.has(parsed.tipo)) cues.add("consulta");
  if (/\b(?:funcionario|funcionário|joao|joão|ponto)\b/.test(normalized) || parsed.tipo.includes("FUNCIONARIO") || parsed.tipo.includes("PONTO")) cues.add("funcionarios");
  if (/\b(?:tarefa|ordem de servico|ordem de serviço|comprar mais)\b/.test(normalized) || parsed.tipo === "ORDEM_SERVICO") cues.add("tarefas");
  if (/\b(?:animal|vaca|brinco|parto|vacina|morte|genealogia)\b/.test(normalized) || ["CADASTRO_ANIMAL", "CONSULTA_ANIMAL", "PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(parsed.tipo)) cues.add("animais");
  return cues;
}

function actionCueCount(normalized: string) {
  const cues = [
    /\b(?:registra|registrar|cadastro|cadastre|comprei|paguei|sobe|baixa|tira|coloca|bota|lanca|lança|cria|criar|apaga|zera|muda)\b/g,
    /\b(?:me fala|me manda|ve como|vê como|relatorio|relatório|resumo|consulta|quanto tem)\b/g
  ];
  return cues.reduce((total, pattern) => total + Array.from(normalized.matchAll(pattern)).length, 0);
}

function hasConflictingModuleCues(cues: Set<string>, normalized: string, parsed: ParsedRanchoMessage) {
  const actionableCues = new Set(Array.from(cues).filter((cue) => cue !== "consulta" && cue !== "animais"));
  const hasConnector = COMPOUND_CONNECTOR_PATTERN.test(normalized);
  const multipleActionCues = actionCueCount(normalized) > 1;

  if (parsed.tipo === "DESCONHECIDO" && actionableCues.size > 1) return true;
  return hasConnector && multipleActionCues && actionableCues.size > 1;
}

function missingFlags(missing: string[]) {
  const flags = new Set<ParserRiskFlag>();
  addFlag(flags, "missing_required_entity", missing.some((field) => ["animal_codigo", "item_nome", "funcionario_nome", "lote_nome", "mae_nome", "pai_nome"].includes(field)));
  addFlag(flags, "missing_quantity", missing.some((field) => ["litros", "quantidade"].includes(field)));
  addFlag(flags, "missing_unit", missing.includes("unidade"));
  addFlag(flags, "missing_money_value", missing.includes("valor"));
  return flags;
}

function actionFromParsed(parsed: ParsedRanchoMessage, text: string): ParsedAction {
  const dados = parsed.dados || {};
  const quantity = asNumber(dados.quantidade) ?? asNumber(dados.litros) ?? asNumber(dados.valor) ?? null;
  const entity = stringValue(dados.animal_codigo)
    || stringValue(dados.item_nome)
    || stringValue(dados.funcionario_nome)
    || stringValue(dados.lote_nome)
    || null;
  return {
    type: parsed.tipo,
    entity,
    quantity,
    unit: stringValue(dados.unidade) || (parsed.tipo === "PRODUCAO_LEITE" ?"litro" : null),
    date: stringValue(dados.data_referencia) || stringValue(dados.periodo) || null,
    notes: stringValue(dados.descricao) || stringValue(dados.produto) || null,
    rawText: text
  };
}

function actionsFromParsed(parsed: ParsedRanchoMessage, text: string): ParsedAction[] {
  if (parsed.tipo === "LOTE_REGISTROS" && Array.isArray(parsed.dados?.registros)) {
    return (parsed.dados.registros as ParsedRanchoMessage[]).map((registro) => actionFromParsed(registro, text));
  }
  return [actionFromParsed(parsed, text)];
}

function confidenceReason(flags: Set<ParserRiskFlag>, missing: string[], originalConfidence: number, nextConfidence: number) {
  const parts = [`base ${originalConfidence.toFixed(2)} -> ${nextConfidence.toFixed(2)}`];
  if (flags.has("single_clear_intent")) parts.push("single clear intent");
  if (flags.has("compound_message")) parts.push("compound message");
  if (flags.has("multiple_intents_detected")) parts.push("multiple intents");
  if (flags.has("ambiguous_verb")) parts.push("ambiguous verb");
  if (flags.has("correction_message")) parts.push("correction message");
  if (flags.has("negation_message")) parts.push("negation message");
  if (flags.has("cancellation_message")) parts.push("cancellation message");
  if (flags.has("confirmation_response")) parts.push("confirmation response");
  if (flags.has("destructive_action")) parts.push("destructive action");
  if (missing.length) parts.push(`missing: ${missing.join(", ")}`);
  return parts.join("; ");
}

function decisionForParsed(parsed: ParsedRanchoMessage, threshold = DEFAULT_GEMINI_FALLBACK_CONFIDENCE): ParserDecision {
  const flags = new Set(parsed.flags || []);
  if (flags.has("destructive_action")) return parsed.confianca < threshold ?"gemini_fallback" : "blocked";
  if (shouldUseGeminiFallback(parsed, threshold)) return "gemini_fallback";
  if (flags.has("needs_clarification")) return "ask_clarification";
  if (flags.has("needs_confirmation")) return "ask_confirmation";
  return "local_execution";
}

export function shouldUseGeminiFallback(parsed: ParsedRanchoMessage, threshold = DEFAULT_GEMINI_FALLBACK_CONFIDENCE) {
  const flags = new Set(parsed.flags || []);
  if (parsed.confianca < threshold) return true;
  return Array.from(FALLBACK_FLAGS).some((flag) => flags.has(flag));
}

export function parserDecisionForParsed(parsed: ParsedRanchoMessage, threshold = DEFAULT_GEMINI_FALLBACK_CONFIDENCE): ParserDecision {
  return decisionForParsed(parsed, threshold);
}

export function evaluateRanchoParseConfidence(text: string, parsed: ParsedRanchoMessage): ParsedRanchoMessage {
  const normalized = normalizeRanchoText(text);
  const flags = new Set<ParserRiskFlag>(parsed.flags || []);
  const missing = buildMissing(parsed.tipo, parsed.dados || {});
  const detectedEntities = detectedEntitiesFromParsed(text, parsed);
  const cues = moduleCues(normalized, parsed);
  const originalConfidence = Number.isFinite(parsed.confianca) ?parsed.confianca : 0.2;
  let confidence = clamp(originalConfidence, 0, 1);

  const hasCompoundConnector = COMPOUND_CONNECTOR_PATTERN.test(normalized);
  const hasMultipleActionCues = actionCueCount(normalized) > 1;
  const isCompound = parsed.tipo === "LOTE_REGISTROS" || (hasCompoundConnector && (hasMultipleActionCues || cues.size > 1));
  const isCorrection = CORRECTION_PATTERN.test(normalized);
  const isNegation = NEGATION_PATTERN.test(normalized);
  const isCancellation = CANCELLATION_PATTERN.test(normalized);
  const isConfirmationResponse = CONFIRMATION_PATTERN.test(normalized);
  const isHerdDeleteIntent = parsed.tipo === "EXCLUIR_REBANHO";
  const isDestructive = DESTRUCTIVE_PATTERN.test(normalized) && !isHerdDeleteIntent;
  const isSensitive = isHerdDeleteIntent || isDestructive || SENSITIVE_PATTERN.test(normalized) || ["EXCLUIR_FUNCIONARIO", "DESLIGAR_FUNCIONARIO", "MORTE", "ATUALIZACAO_GENEALOGIA", "ATUALIZACAO_ANIMAL"].includes(parsed.tipo);
  const isAmbiguousVerb = AMBIGUOUS_VERB_PATTERN.test(normalized);
  const isGenericCommand = GENERIC_COMMAND_PATTERN.test(normalized);
  const milkWithoutQuantity = /\bleite\b/.test(normalized) && !detectedEntities.quantities.length && ["PRODUCAO_LEITE", "CONSULTA_ANIMAL", "DESCONHECIDO"].includes(parsed.tipo);
  const stockWithoutItem = /\bestoque\b/.test(normalized) && /\b(?:tira|tirar|baixa|baixar|sobe|subir)\b/.test(normalized) && !detectedEntities.stockItems.length;
  const hasConflictingIntents = hasConflictingModuleCues(cues, normalized, parsed);

  addFlag(flags, "compound_message", isCompound);
  addFlag(flags, "multiple_intents_detected", isCompound || (hasCompoundConnector && cues.size > 1));
  addFlag(flags, "conflicting_intents", hasConflictingIntents);
  addFlag(flags, "ambiguous_verb", isAmbiguousVerb);
  addFlag(flags, "ambiguous_reference", AMBIGUOUS_REFERENCE_PATTERN.test(normalized));
  addFlag(flags, "correction_message", isCorrection);
  addFlag(flags, "negation_message", isNegation);
  addFlag(flags, "cancellation_message", isCancellation);
  addFlag(flags, "confirmation_response", isConfirmationResponse);
  addFlag(flags, "references_previous_context", isCorrection || isNegation || isCancellation || isConfirmationResponse);
  addFlag(flags, "possible_duplicate_risk", isCorrection || isNegation);
  addFlag(flags, "do_not_treat_as_new_action", isNegation && parsed.tipo !== "DESCONHECIDO");
  addFlag(flags, "sensitive_action", isSensitive);
  addFlag(flags, "destructive_action", isDestructive);
  addFlag(flags, "unknown_animal", Boolean(parsed.dados?.animal_referencia_nao_encontrada));
  addFlag(flags, "unknown_stock_item", Boolean(parsed.dados?.item_estoque_encontrado === false || parsed.dados?.status_resolucao === "not_found"));
  addFlag(flags, "unknown_employee", Boolean(parsed.dados?.funcionario_nao_encontrado));
  addFlag(flags, "missing_quantity", milkWithoutQuantity);
  addFlag(flags, "missing_required_entity", stockWithoutItem);

  Array.from(missingFlags(missing)).forEach((flag) => flags.add(flag));

  if (parsed.tipo === "DESCONHECIDO") confidence = Math.min(confidence, 0.35);
  if (isGenericCommand) confidence = Math.min(confidence, 0.35);
  if (isDestructive) confidence = Math.min(confidence, 0.35);
  if (isCorrection) confidence = Math.min(confidence, 0.5);
  if (isNegation) confidence = Math.min(confidence, parsed.tipo === "DESCONHECIDO" ?0.42 : 0.35);
  if (isCancellation || isConfirmationResponse) confidence = Math.min(confidence, 0.35);
  if (isCompound || hasConflictingIntents) confidence = Math.min(confidence, 0.55);
  if (milkWithoutQuantity || stockWithoutItem) confidence = Math.min(confidence, 0.56);
  if (isAmbiguousVerb && (missing.length || !detectedEntities.units.length || !detectedEntities.stockItems.length && /\b(?:estoque|racao|ração|sal)\b/.test(normalized))) {
    confidence = Math.min(confidence, 0.58);
  } else if (isAmbiguousVerb) {
    confidence = Math.min(confidence, 0.74);
  }
  if (missing.includes("animal_codigo") || missing.includes("item_nome") || missing.includes("funcionario_nome")) confidence = Math.min(confidence, 0.68);
  if (missing.includes("litros") || missing.includes("quantidade")) confidence = Math.min(confidence, 0.64);
  if (missing.includes("unidade")) confidence = Math.min(confidence, 0.66);
  if (missing.includes("valor")) confidence = Math.min(confidence, 0.64);
  if (flags.has("ambiguous_reference")) confidence = Math.min(confidence, 0.7);
  if (flags.has("unknown_animal") || flags.has("unknown_stock_item") || flags.has("unknown_employee")) confidence = Math.min(confidence, 0.58);

  const hasCriticalFlags = Array.from(FALLBACK_FLAGS).some((flag) => flags.has(flag));
  const needsClarification = missing.length > 0
    || flags.has("ambiguous_reference")
    || flags.has("missing_required_entity")
    || flags.has("missing_quantity")
    || flags.has("missing_unit")
    || flags.has("missing_money_value")
    || flags.has("unknown_animal")
    || flags.has("unknown_stock_item")
    || flags.has("unknown_employee")
    || isNegation
    || isCancellation
    || isConfirmationResponse
    || isGenericCommand;
  const needsConfirmation = !CONSULT_INTENTS.has(parsed.tipo) && parsed.tipo !== "DESCONHECIDO" || flags.has("sensitive_action");
  const safeForLocal = !hasCriticalFlags
    && !needsClarification
    && !flags.has("do_not_treat_as_new_action")
    && !flags.has("destructive_action")
    && (CONSULT_INTENTS.has(parsed.tipo) || confidence >= 0.75)
    && parsed.tipo !== "DESCONHECIDO";

  addFlag(flags, "needs_clarification", needsClarification);
  addFlag(flags, "needs_confirmation", needsConfirmation);
  addFlag(flags, "requires_confirmation", isCorrection || needsConfirmation);
  addFlag(flags, "single_clear_intent", !hasCriticalFlags && cues.size <= 1 && parsed.tipo !== "DESCONHECIDO");
  addFlag(flags, "safe_for_local_execution", safeForLocal);

  const resultWithoutDecision: ParsedRanchoMessage = {
    ...parsed,
    confianca: clamp(Number(confidence.toFixed(2)), 0, 1),
    flags: Array.from(flags),
    detectedEntities,
    actions: actionsFromParsed(parsed, text)
  };

  if (shouldUseGeminiFallback(resultWithoutDecision, DEFAULT_GEMINI_FALLBACK_CONFIDENCE)) {
    resultWithoutDecision.flags = unique([...(resultWithoutDecision.flags || []), "use_gemini_fallback"]);
  }

  const decision = decisionForParsed(resultWithoutDecision, DEFAULT_GEMINI_FALLBACK_CONFIDENCE);
  const reason = confidenceReason(new Set(resultWithoutDecision.flags || []), missing, originalConfidence, resultWithoutDecision.confianca);

  return {
    ...resultWithoutDecision,
    reason,
    debugReason: reason,
    decision
  };
}
