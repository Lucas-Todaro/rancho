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

const DEFAULT_GEMINI_FALLBACK_CONFIDENCE = 0.7;

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
  "negation_message",
  "suspicious_animal_ref",
  "suspicious_item_name",
  "intent_keyword_conflict",
  "physical_sale_without_price",
  "command_word_as_name",
  "parsed_number_may_be_time",
  "possible_multi_domain_message",
  "missing_domain_in_parse_result",
  "delete_or_cancel_keyword_conflict"
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
const ANIMAL_NAME_COMMAND_WORDS = new Set(["novo", "nova", "cadastrar", "cadastra", "cadastro", "animal", "adicionar", "adiciona", "registrar", "registra", "criar", "cria"]);
const STOCK_WORD_PATTERN = /\b(?:racao|ração|sal|milho|feno|leite|suplemento|saco|sacos|kg|quilo|quilos|litro|litros|l)\b/;
const SALE_WORD_PATTERN = /\b(?:vendi|vendeu|vendemos|vender|venda|vendido)\b/;
const PURCHASE_WORD_PATTERN = /\b(?:comprei|comprou|compramos|comprar|compra|comprado)\b/;
const STOCK_OUT_WORD_PATTERN = /\b(?:usei|usou|usamos|usar|baixa|baixar|retirei|retirar|tirei|saida|saída)\b/;
const HEALTH_WORD_PATTERN = /\b(?:nao comeu|não comeu|mancando|doente|doenca|doença|machucado|febre|tratar|tratamento|vacina|vacinou|apliquei)\b/;
const MILK_PRODUCTION_PATTERN = /\b(?:deu|produziu|ordenhei|tirou)\s+\d+(?:[.,]\d+)?\s*(?:l|litro|litros)\b/;
const QUERY_WORD_PATTERN = /\b(?:relatorio|relatório|lista|listar|resumo|quanto tem|quantos|consulta|consultar|mostrar|mostra)\b/;
const TIME_TOKEN_PATTERN = /\b\d{1,2}h(?:\d{2})?\b|\b\d{1,2}:\d{2}\b/;
const DELETE_OR_CANCEL_PATTERN = /\b(?:apaga|apagar|apague|cancela|cancelar|cancele|remove|remover|remova|exclui|excluir|exclua|deleta|deletar|delete)\b/;

type OperationalDomain =
  | "PRODUCAO_LEITE"
  | "ESTOQUE_ENTRADA"
  | "ESTOQUE_SAIDA"
  | "FINANCEIRO"
  | "CADASTRO_ANIMAL"
  | "SAUDE"
  | "REPRODUCAO"
  | "CORRECAO_CANCELAMENTO_EXCLUSAO";

type MultiDomainDetection = {
  domains: OperationalDomain[];
  hasConnector: boolean;
  multipleReproductiveEvents: boolean;
};

function unique<T>(values: Array<T | undefined | null | "">): T[] {
  return Array.from(new Set(values.filter((value): value is T => value !== undefined && value !== null && value !== "")));
}

function addDomain(domains: Set<OperationalDomain>, domain: OperationalDomain, active: boolean) {
  if (active) domains.add(domain);
}

export function detectPotentialMultiDomainMessage(originalText: string): MultiDomainDetection {
  const normalized = normalizeRanchoText(originalText);
  const domains = new Set<OperationalDomain>();
  const hasConnector = /\s+e\s+|,|\n|\b(?:tambem|mais)\b/.test(normalized);
  const purchaseLike = PURCHASE_WORD_PATTERN.test(normalized);
  const saleLike = SALE_WORD_PATTERN.test(normalized);

  addDomain(domains, "PRODUCAO_LEITE", /\b(?:deu|produziu|ordenhei|tirou)\s+\d+(?:[.,]\d+)?\s*(?:l|litro|litros)\b|\bproducao\b/.test(normalized));
  addDomain(domains, "ESTOQUE_ENTRADA", /\b(?:comprei|comprar|comprou|compramos|chegou|entrou|entrada|adicionei|adicionado|adiciona|adicionar)\b/.test(normalized));
  addDomain(domains, "ESTOQUE_SAIDA", /\b(?:usei|use|gastei|saiu|baixa|baixei|consumi|retirei|retirar|tirei)\b/.test(normalized));
  addDomain(domains, "FINANCEIRO", /\b(?:paguei|pagar|pagou|recebi|receber|recebeu|salario|diaria|frete|energia|despesa|receita)\b/.test(normalized));
  addDomain(domains, "CADASTRO_ANIMAL", /\b(?:cadastrei|cadastrar|cadastro|novo animal|nova vaca|novo boi|registrar animal)\b/.test(normalized));
  addDomain(domains, "SAUDE", /\b(?:nao comeu|mancando|doente|febre|triste|fraco|tossindo|diarreia|machucou|nao levantou|parou de comer)\b/.test(normalized));
  addDomain(domains, "REPRODUCAO", /\b(?:inseminada|inseminado|inseminou|inseminar|pariu|parto|nasceu|prenha|cio|abortou|pre parto)\b/.test(normalized));
  addDomain(domains, "CORRECAO_CANCELAMENTO_EXCLUSAO", CORRECTION_PATTERN.test(normalized) || NEGATION_PATTERN.test(normalized) || CANCELLATION_PATTERN.test(normalized) || DELETE_OR_CANCEL_PATTERN.test(normalized));

  if ((purchaseLike || saleLike) && domains.has("FINANCEIRO") && !/\b(?:paguei|recebi|salario|diaria|frete|energia|despesa|receita)\b/.test(normalized)) {
    domains.delete("FINANCEIRO");
  }

  const reproductiveEvents = Array.from(normalized.matchAll(/\b(?:inseminada|inseminado|inseminou|inseminar|pariu|parto|nasceu|prenha|cio|abortou|pre parto)\b/g)).length;

  return {
    domains: Array.from(domains),
    hasConnector,
    multipleReproductiveEvents: hasConnector && reproductiveEvents >= 2
  };
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

function splitWords(value: unknown) {
  return normalizeRanchoText(String(value || ""))
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function isCommandOnlyName(value: unknown) {
  const words = splitWords(value);
  return words.length > 0 && words.every((word) => ANIMAL_NAME_COMMAND_WORDS.has(word));
}

function hasCommandWordAsName(value: unknown) {
  const words = splitWords(value);
  return words.some((word) => ANIMAL_NAME_COMMAND_WORDS.has(word));
}

function hasSuspiciousAnimalReference(value: unknown) {
  const text = normalizeRanchoText(String(value || "")).trim();
  if (!text) return false;
  if (/^(?:e|tambem|também|mais)\b/.test(text)) return true;
  if (TIME_TOKEN_PATTERN.test(text)) return true;
  if (/\b\d+(?:[.,]\d+)?\s*(?:kg|quilo|quilos|l|litro|litros|reais|real|rs|brl)\b/.test(text)) return true;
  if (/^(?:novo|nova|cadastrar|cadastra|cadastro|animal|adicionar|adiciona|registrar|registra|criar|cria)$/.test(text)) return true;
  return false;
}

function hasSuspiciousItemName(value: unknown) {
  const text = normalizeRanchoText(String(value || "")).trim();
  if (!text) return false;
  return /(?:r\$\s*)?\d+(?:[.,]\d+)?\s*(?:reais|real|rs|brl)\b/.test(text);
}

function hasIntentKeywordConflict(normalized: string, parsed: ParsedRanchoMessage) {
  if (SALE_WORD_PATTERN.test(normalized) && parsed.tipo === "ESTOQUE_ENTRADA") return true;
  if (PURCHASE_WORD_PATTERN.test(normalized) && (parsed.tipo === "RECEITA_VENDA" || parsed.tipo === "ESTOQUE_SAIDA")) return true;
  if (STOCK_OUT_WORD_PATTERN.test(normalized) && parsed.tipo === "ESTOQUE_ENTRADA") return true;
  if (HEALTH_WORD_PATTERN.test(normalized) && parsed.tipo === "CADASTRO_ANIMAL") return true;
  if (MILK_PRODUCTION_PATTERN.test(normalized) && parsed.tipo === "CADASTRO_ANIMAL") return true;
  if (QUERY_WORD_PATTERN.test(normalized) && !CONSULT_INTENTS.has(parsed.tipo) && parsed.tipo !== "AJUDA") return true;
  return false;
}

function hasPhysicalSaleWithoutPrice(normalized: string, parsed: ParsedRanchoMessage, moneyValues: number[]) {
  if (!SALE_WORD_PATTERN.test(normalized) || moneyValues.length > 0) return false;
  if (!STOCK_WORD_PATTERN.test(normalized)) return false;
  return parsed.tipo === "RECEITA_VENDA" || parsed.tipo === "ESTOQUE_SAIDA";
}

function domainsForParsedMessage(parsed: ParsedRanchoMessage): OperationalDomain[] {
  if (parsed.tipo === "LOTE_REGISTROS" && Array.isArray(parsed.dados?.registros)) {
    return unique((parsed.dados.registros as ParsedRanchoMessage[]).flatMap((registro) => domainsForParsedMessage(registro)));
  }

  const dados = parsed.dados || {};
  if (parsed.tipo === "PRODUCAO_LEITE" || parsed.tipo === "CONSULTA_PRODUCAO" || parsed.tipo === "CONSULTA_PRODUCAO_ANIMAL") return ["PRODUCAO_LEITE"];
  if (parsed.tipo === "ESTOQUE_ENTRADA" || parsed.tipo === "CRIAR_ITEM_ESTOQUE" || parsed.tipo === "ESTOQUE_CADASTRO") return ["ESTOQUE_ENTRADA"];
  if (parsed.tipo === "ESTOQUE_SAIDA") return ["ESTOQUE_SAIDA"];
  if (["DESPESA", "RECEITA_VENDA", "PAGAMENTO_FUNCIONARIO", "CONSULTA_FINANCEIRO", "CONSULTA_FOLHA"].includes(parsed.tipo)) return ["FINANCEIRO"];
  if (parsed.tipo === "CADASTRO_ANIMAL") return ["CADASTRO_ANIMAL"];
  if (["PARTO", "MORTE"].includes(parsed.tipo)) return ["REPRODUCAO"];
  if (parsed.tipo === "VACINA_MEDICAMENTO") return ["SAUDE"];
  if (parsed.tipo === "ATUALIZACAO_ANIMAL") return dados.evento_tipo === "reprodutivo" ?["REPRODUCAO"] : ["SAUDE"];
  return [];
}

function parsedActionCount(parsed: ParsedRanchoMessage) {
  if (parsed.tipo === "LOTE_REGISTROS" && Array.isArray(parsed.dados?.registros)) return parsed.dados.registros.length;
  if (Array.isArray(parsed.actions)) return parsed.actions.length;
  return 1;
}

function riskScoreForFlags(flags: Set<ParserRiskFlag>, confidence: number) {
  let score = 0;
  const weights: Partial<Record<ParserRiskFlag, number>> = {
    suspicious_animal_ref: 0.5,
    suspicious_item_name: 0.5,
    intent_keyword_conflict: 0.6,
    physical_sale_without_price: 0.5,
    command_word_as_name: 0.55,
    parsed_number_may_be_time: 0.45,
    possible_multi_domain_message: 0.55,
    missing_domain_in_parse_result: 0.6,
    delete_or_cancel_keyword_conflict: 0.6,
    multiple_intents_detected: 0.35,
    compound_message: 0.35,
    conflicting_intents: 0.55,
    correction_message: 0.35,
    negation_message: 0.35,
    missing_required_entity: 0.22,
    missing_quantity: 0.2,
    missing_unit: 0.16,
    missing_money_value: 0.2,
    unknown_animal: 0.35,
    unknown_stock_item: 0.3,
    unknown_employee: 0.3,
    ambiguous_reference: 0.25,
    ambiguous_verb: 0.18
  };

  for (const flag of Array.from(flags)) score += weights[flag] || 0;
  if (confidence < DEFAULT_GEMINI_FALLBACK_CONFIDENCE) score += 0.25;
  return clamp(Number(score.toFixed(2)), 0, 1);
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
  if (flags.has("suspicious_animal_ref")) parts.push("suspicious animal reference");
  if (flags.has("suspicious_item_name")) parts.push("suspicious item name");
  if (flags.has("intent_keyword_conflict")) parts.push("intent keyword conflict");
  if (flags.has("physical_sale_without_price")) parts.push("physical sale without price");
  if (flags.has("command_word_as_name")) parts.push("command word as name");
  if (flags.has("parsed_number_may_be_time")) parts.push("number may be time");
  if (flags.has("possible_multi_domain_message")) parts.push("possible multi-domain message");
  if (flags.has("missing_domain_in_parse_result")) parts.push("missing domain in parse result");
  if (flags.has("delete_or_cancel_keyword_conflict")) parts.push("delete/cancel keyword conflict");
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
  if (typeof parsed.riskScore === "number" && parsed.riskScore >= 0.45) return true;
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
  const suspiciousAnimalRef = hasSuspiciousAnimalReference(parsed.dados?.animal_codigo)
    || hasSuspiciousAnimalReference(parsed.dados?.animal_referencia_nao_encontrada);
  const suspiciousItemName = hasSuspiciousItemName(parsed.dados?.item_nome) || hasSuspiciousItemName(parsed.dados?.item_extraido);
  const commandWordAsName = parsed.tipo === "CADASTRO_ANIMAL" && (
    isCommandOnlyName(parsed.dados?.nome)
    || (!parsed.dados?.animal_codigo && hasCommandWordAsName(parsed.dados?.nome))
  );
  const parsedNumberMayBeTime = TIME_TOKEN_PATTERN.test(normalized) && (suspiciousAnimalRef || parsed.tipo === "PRODUCAO_LEITE");
  const intentKeywordConflict = hasIntentKeywordConflict(normalized, parsed);
  const physicalSaleWithoutPrice = hasPhysicalSaleWithoutPrice(normalized, parsed, detectedEntities.moneyValues)
    || (parsed.tipo === "ESTOQUE_SAIDA" && Boolean(parsed.dados?.venda) && missing.includes("valor"));
  const multiDomainDetection = detectPotentialMultiDomainMessage(text);
  const parsedDomains = new Set(domainsForParsedMessage(parsed));
  const parsedCoversDetectedDomains = multiDomainDetection.domains.every((domain) => parsedDomains.has(domain));
  const parsedAsMultiAction = parsed.tipo === "LOTE_REGISTROS" && parsedActionCount(parsed) >= 2;
  const possibleMultiDomainMessage = multiDomainDetection.hasConnector
    && (multiDomainDetection.domains.length >= 2 || multiDomainDetection.multipleReproductiveEvents)
    && (!parsedAsMultiAction || !parsedCoversDetectedDomains);
  const missingDomainInParseResult = multiDomainDetection.domains.length >= 2 && !parsedCoversDetectedDomains;
  const deleteOrCancelKeywordConflict = DELETE_OR_CANCEL_PATTERN.test(normalized) && CONSULT_INTENTS.has(parsed.tipo);

  addFlag(flags, "compound_message", isCompound || possibleMultiDomainMessage);
  addFlag(flags, "multiple_intents_detected", isCompound || possibleMultiDomainMessage || (hasCompoundConnector && cues.size > 1));
  addFlag(flags, "conflicting_intents", hasConflictingIntents);
  addFlag(flags, "suspicious_animal_ref", suspiciousAnimalRef);
  addFlag(flags, "suspicious_item_name", suspiciousItemName);
  addFlag(flags, "intent_keyword_conflict", intentKeywordConflict);
  addFlag(flags, "physical_sale_without_price", physicalSaleWithoutPrice);
  addFlag(flags, "command_word_as_name", commandWordAsName);
  addFlag(flags, "parsed_number_may_be_time", parsedNumberMayBeTime);
  addFlag(flags, "possible_multi_domain_message", possibleMultiDomainMessage);
  addFlag(flags, "missing_domain_in_parse_result", missingDomainInParseResult);
  addFlag(flags, "delete_or_cancel_keyword_conflict", deleteOrCancelKeywordConflict);
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
  if (suspiciousAnimalRef || suspiciousItemName || commandWordAsName || parsedNumberMayBeTime) confidence = Math.min(confidence, 0.62);
  if (intentKeywordConflict) confidence = Math.min(confidence, 0.55);
  if (physicalSaleWithoutPrice) confidence = Math.min(confidence, 0.64);
  if (possibleMultiDomainMessage || missingDomainInParseResult || deleteOrCancelKeywordConflict) confidence = Math.min(confidence, 0.55);

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
  const riskScore = riskScoreForFlags(flags, confidence);

  const resultWithoutDecision: ParsedRanchoMessage = {
    ...parsed,
    confianca: clamp(Number(confidence.toFixed(2)), 0, 1),
    flags: Array.from(flags),
    riskScore,
    detectedEntities,
    actions: actionsFromParsed(parsed, text),
    fallbackReason: missingDomainInParseResult || possibleMultiDomainMessage
      ? "multi_domain_message_not_fully_parsed"
      : deleteOrCancelKeywordConflict
        ? "delete_or_cancel_keyword_conflict"
        : parsed.fallbackReason
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
