import type { AnyRecord } from "@/lib/types";
import { normalizeWhatsappNumber } from "@/lib/phone";
import { cleanAnswer, hasValue, normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { decimalNumberPattern, lastFinancialNumber, numberMatches, parseDecimalNumber } from "@/lib/whatsapp/nlp-numbers";
import type { RanchoIntent } from "./types";
import {
  animalCategories,
  animalCategoryMap,
  animalCodePattern,
  animalOptionalFields,
  animalPhaseMap,
  animalWords,
  forbiddenAnimalCodes,
  stockUnitAfterQuantityPattern,
  stockUnitWords
} from "./constants";

export function compactKey(value: string | number | null | undefined) {
  return normalizeRanchoText(String(value ?? "")).replace(/[^a-z0-9]/g, "");
}

export function isForbiddenAnimalCode(value: string | number | null | undefined) {
  return forbiddenAnimalCodes.has(compactKey(value));
}

export function normalizeAnimalCandidate(value: string | number | null | undefined) {
  const code = normalizeAnimalCode(value);
  if (!code || isForbiddenAnimalCode(code)) return undefined;
  return code;
}

export function normalizeAnimalCode(value: string | number | null | undefined) {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  if (!normalized) return undefined;

  const labeled = normalized.match(/\b(?:VACA|ANIMAL|GADO|BOI|TOURO|BEZERRO|BEZERRA|NOVILHA|BRINCO|NUMERO|N)\s+([A-Z]*\d[A-Z0-9-]*|[A-Z]+-[A-Z0-9]+)\b/);
  if (labeled?.[1]) return labeled[1];

  const spacedCode = normalized.match(/^([A-Z]+)\s+(\d[A-Z0-9-]*)$/);
  if (spacedCode) return `${spacedCode[1]}-${spacedCode[2]}`;

  const compact = normalized.replace(/\s*-\s*/g, "-");
  if (animalCodePattern.test(compact)) return compact;

  const animalWithNumber = normalized.match(/\b(?:VACA|ANIMAL|BOI|TOURO|BEZERRO|BEZERRA|NOVILHA)\s+(\d+[A-Z0-9-]*)\b/);
  if (animalWithNumber?.[1]) return animalWithNumber[1];

  return undefined;
}

export function normalizeBotPhone(value: string | number | null | undefined) {
  return normalizeWhatsappNumber(value);
}

export function isValidBotPhone(value: string | number | null | undefined) {
  const phone = normalizeBotPhone(value);
  if (phone.length !== 13 || !phone.startsWith("55")) return false;
  const national = phone.slice(2);
  const ddd = Number(national.slice(0, 2));
  return ddd >= 11 && ddd <= 99 && national[2] === "9" && !/^(\d)\1+$/.test(national);
}

export function extractWhatsappPhone(original: string) {
  const matches = original.match(/(?:whatsapp:)?\+?\d[\d\s().-]{8,}\d/gi) || [];
  const phones = matches
    .map((match) => normalizeBotPhone(match))
    .filter((phone) => phone.length >= 12);

  return phones.find(isValidBotPhone);
}

export function removeWhatsappPhone(original: string) {
  return original
    .replace(/(?:whatsapp:)?\+?\d[\d\s().-]{8,}\d/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const monthNumbers: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  marcoo: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

function stripDateFragments(text: string) {
  return normalizeRanchoText(text)
    .replace(/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-](?:19|20)?\d{2})?\b/g, " ")
    .replace(/\b(?:dia|em|no dia)?\s*\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(?:19|20)\d{2})?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractTurno(text: string) {
  if (/\b(?:manha|primeira ordenha)\b/.test(text)) return "manha";
  if (/\b(?:tarde|segunda ordenha)\b/.test(text)) return "tarde";
  if (/\b(?:noite|terceira ordenha)\b/.test(text)) return "noite";
  return undefined;
}

export function extractDateReference(text: string) {
  const normalized = normalizeRanchoText(text);
  const isoDate = normalized.match(/\b((?:19|20)\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  if (isoDate) return validDateParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));

  const brDate = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-]((?:19|20)?\d{2}))?\b/);
  if (brDate) {
    const rawYear = brDate[3] ? Number(brDate[3]) : new Date().getFullYear();
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    return validDateParts(year, Number(brDate[2]), Number(brDate[1]));
  }

  const namedDate = normalized.match(/\b(?:dia|em|no dia)?\s*(\d{1,2})\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:19|20)\d{2}))?\b/);
  if (namedDate) {
    const year = namedDate[3] ? Number(namedDate[3]) : new Date().getFullYear();
    return validDateParts(year, monthNumbers[namedDate[2]], Number(namedDate[1]));
  }

  if (/\banteontem\b/.test(normalized)) return "anteontem";
  if (/\bontem+\b/.test(normalized)) return "ontem";
  if (/\bamanha\b/.test(normalized)) return "amanha";
  if (/\b(?:hoje|hj|agora)\b/.test(normalized)) return "hoje";
  if (/\b(?:ultimos|ultimas)\s+30\s+dias\b/.test(normalized)) return "ultimos_30";
  if (/\b(?:ultimos|ultimas)\s+7\s+dias\b/.test(normalized)) return "ultimos_7";
  if (/\b(?:semana passada|ultima semana)\b/.test(normalized)) return "semana_passada";
  if (/\b(?:este ano|esse ano|deste ano|desse ano|ano atual)\b/.test(normalized)) return "ano";
  if (/\bsemana\b|\bsemanal\b|\bessa semana\b|\bnesta semana\b/.test(normalized)) return "semana";
  if (/\bmes\b|\bmensal\b|\bdo mes\b/.test(normalized)) return "mes";
  return undefined;
}

export function extractConsultationPeriod(text: string) {
  return extractDateReference(text) || "hoje";
}

export function extractAnimalFromProductionQuery(text: string) {
  const cleaned = text
    .replace(/\b(?:quantos?|quanto|litros?|leite|produziu|producao|ordenha|deu|tirou|foram|foi|hoje|semana|mes|essa|esta|nesta|na|no|da|do|de|a|o)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return extractAnimalCode(text, "PRODUCAO_LEITE") || candidateFromMatch(cleaned);
}

export function cleanStockQueryItem(original: string, normalized: string) {
  const direct = original.match(/\b(?:estoque\s+de|quanto\s+tem\s+de|tem\s+quanto\s+de|ainda\s+tem|como\s+(?:esta|estÃ¡|ta|tÃ¡)\s+o\s+estoque\s+de)\s+(.+)$/i)?.[1];
  const directTenho = original.match(/\bquanto\s+(?:eu\s+)?tenho\s+de\s+(.+)$/i)?.[1];
  const fallback = direct || directTenho || extractStockItem(original);
  const cleaned = cleanAnswer(fallback || normalized)
    .replace(/\b(?:ainda|tem|quanto|estoque|como|esta|estÃ¡|ta|tÃ¡)\b/gi, " ")
    .replace(/^\s*(?:de|do|da|o|a)\s+/i, " ")
    .replace(/\s+(?:no|na)\s+estoque\s*$/i, " ")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

export function extractPointTime(text: string) {
  const match = text.match(/\b(?:as|às|a)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|horas)?\b/);
  if (!match?.[1]) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function extractExplicitTimeReference(text: string) {
  const normalized = normalizeRanchoText(text);
  const match = normalized.match(/\b(?:as|a|de|por volta de)?\s*(\d{1,2})(?::(\d{2})|h(\d{2})?)\b/);
  if (!match?.[1]) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2] || match[3] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function candidateFromMatch(value?: string | null) {
  if (!value) return undefined;
  const code = normalizeAnimalCandidate(value);
  if (code) return code;

  const cleaned = normalizeRanchoText(value)
    .replace(new RegExp(`\\b${animalWords}\\b`, "g"), "")
    .replace(/\b(?:da|do|de|na|no|a|o|uma|um|para|pra|producao|ordenha|hoje|hj|ontem|anteontem|amanha|manha|tarde|noite|dia|semana|mes)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /\s/.test(cleaned) || isForbiddenAnimalCode(cleaned)) return undefined;
  return cleaned;
}

function cleanProductionAnimalReference(value?: string | null) {
  const cleaned = cleanAnswer(value || "")
    .replace(/\b(?:hoje|hj|ontem|anteontem|amanha|manha|tarde|noite|primeira|segunda|terceira|ordenha)\b.*$/i, " ")
    .replace(/\b(?:as|a|de|por volta de)?\s*\d{1,2}(?::\d{2}|h\d{0,2})\b.*$/i, " ")
    .replace(/\b(?:litros?|l|lt|lts|leite)\b/gi, " ")
    .replace(/^(?:da|do|de|na|no|a|o)\s+/i, " ")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return undefined;
  const normalizedCleaned = normalizeRanchoText(cleaned);
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/.test(cleaned)) return undefined;
  if (/^(?:e meio|meio|kg|kgs|quilo|quilos|gramas?|g|sacos?|unidades?|dose|doses|reais?|real|rs|r\$?|lito|litos?)$/.test(normalizedCleaned)) return undefined;
  if (/^(?:para venda|pra venda|venda|tanque|no tanque|na venda|para o tanque|pro tanque)$/.test(normalizedCleaned)) return undefined;
  if (/\b(?:venda|tanque)\b/.test(normalizedCleaned) && !/[0-9-]/.test(normalizedCleaned)) return undefined;
  const candidate = candidateFromMatch(cleaned);
  if (candidate && /[0-9-]/.test(candidate)) return candidate;
  return cleaned;
}

export function extractProductionAnimalReference(original: string, normalized = normalizeRanchoText(original)) {
  const withUnitOriginal = original.match(new RegExp(`\\b${decimalNumberPattern}\\s*(?:l|lt|lts|litro\\w*|lito\\w*|litr\\w*)\\s+(?:da|do|de)\\s+(.+)$`, "i"))?.[1];
  const direct = cleanProductionAnimalReference(withUnitOriginal);
  if (direct) return direct;

  const withUnitNormalized = normalized.match(new RegExp(`\\b${decimalNumberPattern}\\s*(?:l|lt|lts|litro\\w*|lito\\w*|litr\\w*)\\s+(?:da|do|de)\\s+(.+)$`))?.[1];
  const normalizedDirect = cleanProductionAnimalReference(withUnitNormalized);
  if (normalizedDirect) return normalizedDirect;

  const afterProduction = original.match(new RegExp(`\\b(?:produziu|deu|fez|ordenhei|tirei|tirou|ordenhou)\\s+${decimalNumberPattern}\\s*(?:l|lt|lts|litro\\w*|lito\\w*|litr\\w*)?\\s+(.+)$`, "i"))?.[1];
  return cleanProductionAnimalReference(afterProduction);
}

export function extractAnimalCode(text: string, intent?: RanchoIntent) {
  const searchable = stripDateFragments(text);
  const standalone = normalizeAnimalCandidate(searchable);
  if (standalone && !/\s/.test(searchable.trim())) return standalone;

  const leadingSpacedCode = searchable.match(/^\s*(?:a|o)?\s*(\d[a-z0-9-]*(?:\s+[a-z]{1,4})?)\b/);
  const leadingSpacedCodeCandidateRaw = leadingSpacedCode?.[1]?.trim();
  const leadingSpacedParts = leadingSpacedCodeCandidateRaw?.split(/\s+/) || [];
  const leadingSpacedSuffix = leadingSpacedParts[1] || "";
  const leadingSpacedCodeCandidate = leadingSpacedSuffix && /^(?:esta|ta|foi|nao|dia|em|com)$/i.test(leadingSpacedSuffix)
    ? leadingSpacedParts[0]?.toUpperCase()
    : leadingSpacedCodeCandidateRaw?.toUpperCase();
  if (leadingSpacedCodeCandidate && intent && ["PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL"].includes(intent)) {
    return normalizeAnimalCandidate(leadingSpacedCodeCandidate) || leadingSpacedCodeCandidate;
  }

  const leadingCandidateMatch = searchable.match(/^\s*(?:a|o)?\s*([a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*)\b/);
  const leadingCandidate = normalizeAnimalCandidate(leadingCandidateMatch?.[1]);
  if (leadingCandidate && intent && ["PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL"].includes(intent)) return leadingCandidate;

  const earlyNamedReference = searchable.match(/\b(?:da|do|de|na|no|em|para|pra|a|o)\s+(?:(?:a|o)\s+)?([a-z][a-z0-9-]*)\b/);
  const earlyNamedReferenceCandidate = candidateFromMatch(earlyNamedReference?.[1]);
  if (earlyNamedReferenceCandidate && intent && ["PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL"].includes(intent)) {
    return normalizeAnimalCandidate(earlyNamedReferenceCandidate) || earlyNamedReferenceCandidate.toUpperCase();
  }

  const explicitPatterns = [
    /\b(?:vaca|animal|gado|boi|touro|bezerro|bezerra|novilha|brinco)\s+(?:(?:da|do|de|a|o)\s+)?([a-z]*\d[a-z0-9-]*|[a-z]+-[a-z0-9]+)\b/g,
    /\b(?:da|do|de|na|no|em|a|o)\s+([a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*)\b/g,
    /\b([a-z]+-\d[a-z0-9-]*|[a-z]+\d[a-z0-9-]*)\b/g
  ];

  for (const pattern of explicitPatterns) {
    let match = pattern.exec(searchable);
    while (match) {
      const raw = match[1];
      const index = match.index + match[0].lastIndexOf(raw);
      const candidate = normalizeAnimalCandidate(raw);
      if (candidate && !numberHasUnitOrMoneyContext(searchable, index, raw)) return candidate;
      match = pattern.exec(searchable);
    }
  }

  const direct = searchable.match(new RegExp(`\\b${animalWords}\\s+(?:(?:da|do|de|a|o)\\s+)?([a-z0-9][a-z0-9-]*)\\b`));
  const directCandidate = candidateFromMatch(direct?.[1]);
  if (directCandidate) return normalizeAnimalCandidate(directCandidate) || directCandidate.toUpperCase();

  const namedReference = searchable.match(/\b(?:da|do|de|na|no|em|para|pra|a|o)\s+(?:(?:a|o)\s+)?([a-z][a-z0-9-]*)\b/);
  const namedReferenceCandidate = candidateFromMatch(namedReference?.[1]);
  if (namedReferenceCandidate && intent && ["PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL"].includes(intent)) {
    return normalizeAnimalCandidate(namedReferenceCandidate) || namedReferenceCandidate.toUpperCase();
  }

  const afterEventAction = searchable.match(/\b(?:vacinei|mediquei|tratei|apliquei|aplicar|medicar|tratar|registrar|registra|inseminar|cobertura|cio)\s+(?:a|o)?\s*([a-z][a-z0-9-]*)\b/);
  const afterEventActionCandidate = candidateFromMatch(afterEventAction?.[1]);
  if (afterEventActionCandidate && intent && ["PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL"].includes(intent)) {
    return normalizeAnimalCandidate(afterEventActionCandidate) || afterEventActionCandidate.toUpperCase();
  }

  const productionNamed = searchable.match(/\b(?:producao|ordenha)\s+(?:da|do|de)?\s*([a-z0-9][a-z0-9-]*)\b/);
  const productionCandidate = candidateFromMatch(productionNamed?.[1]);
  if (productionCandidate) return normalizeAnimalCandidate(productionCandidate) || productionCandidate.toUpperCase();

  const beforeVerb = searchable.match(/^(.+?)\s+(?:deu|produziu|fez|pariu|tomou|morreu|recebeu|ficou|esta|ta|entrou|apresentou|precisa|teve|foi|com|comeu|quer|passando|levantou|mancou|mancando|adoeceu|machucou|sangrou|sangrando|inchou|inchada|inchado|inseminada|inseminado|coberta|coberto)\b/);
  const beforeVerbCandidate = candidateFromMatch(beforeVerb?.[1]?.replace(/\bnao\b/g, " "));
  if (beforeVerbCandidate && !/^(registra|registrar|lanca|lancar|anota|anotar)$/.test(beforeVerbCandidate)) {
    return normalizeAnimalCandidate(beforeVerbCandidate) || beforeVerbCandidate.toUpperCase();
  }

  const beforeLiters = searchable.match(new RegExp(`^([a-z][a-z0-9-]*)\\s+${decimalNumberPattern}\\s*(?:l|lt|lts|litro|litros)?\\b`));
  const beforeLitersCandidate = candidateFromMatch(beforeLiters?.[1]);
  if (beforeLitersCandidate && intent === "PRODUCAO_LEITE") return normalizeAnimalCandidate(beforeLitersCandidate) || beforeLitersCandidate.toUpperCase();

  const numbers = numberMatches(searchable);
  if (intent === "PRODUCAO_LEITE" && numbers.length >= 2 && !numberHasUnitOrMoneyContext(searchable, numbers[0].index, numbers[0].raw)) return numbers[0].raw.toUpperCase();

  return undefined;
}

function hasMilkUnitAfter(text: string, index: number, raw: string) {
  const after = text.slice(index + raw.length, index + raw.length + 24);
  return /^\s*(?:l|lt|lts|litro\w*|lito\w*|litr\w*)\b/.test(after);
}

function hasNonMilkProductionUnitAfter(text: string, index: number, raw: string) {
  const after = text.slice(index + raw.length, index + raw.length + 24);
  return /^\s*(?:kg|quilos?|gramas?|g|reais|real|r\$)\b/.test(after);
}

export function extractLiters(text: string) {
  if (new RegExp(`-\\s*${decimalNumberPattern}\\s*(?:l|lt|lts|litro|litros)\\b`).test(text)) return undefined;
  if (/\bzero\s+(?:l|lt|lts|litro|litros)\b/.test(text)) return 0;

  const half = text.match(new RegExp(`\\b(${decimalNumberPattern})\\s+e\\s+meio\\b`));
  if (half?.[1] && !hasNonMilkProductionUnitAfter(text, half.index || 0, half[0])) {
    const value = parseDecimalNumber(half[1]);
    if (value !== undefined) return value + 0.5;
  }

  if (/\bmeio\s+(?:l|lt|lts|litro|litros)\b/.test(text)) return 0.5;

  const withMilUnit = text.match(new RegExp(`\\b(${decimalNumberPattern})\\s+mil\\s*(?:l|lt|lts|litro|litros)\\b`));
  if (withMilUnit?.[1]) {
    const value = parseDecimalNumber(withMilUnit[1]);
    return value === undefined ?undefined : value * 1000;
  }

  const withUnit = text.match(new RegExp(`\\b(${decimalNumberPattern})\\s*(?:l|lt|lts|litro\\w*|lito\\w*|litr\\w*)\\b`));
  if (withUnit?.[1]) return parseDecimalNumber(withUnit[1]);

  const wordWithUnit = numberMatches(text).find((match) => hasMilkUnitAfter(text, match.index, match.raw));
  if (wordWithUnit) return wordWithUnit.value;

  const afterProductionVerb = text.match(new RegExp(`\\b(?:deu|produziu|fez|ordenhou|tirei|tirou)\\s+(${decimalNumberPattern})\\b`));
  if (afterProductionVerb?.[1]) {
    const raw = afterProductionVerb[1];
    const index = (afterProductionVerb.index || 0) + afterProductionVerb[0].lastIndexOf(raw);
    if (!hasNonMilkProductionUnitAfter(text, index, raw)) return parseDecimalNumber(raw);
  }

  return undefined;
}

export function extractLooseProductionLiters(text: string) {
  const normalized = normalizeRanchoText(text);
  const animal = extractAnimalCode(normalized, "PRODUCAO_LEITE");
  const animalKey = compactKey(animal);
  const quantity = [...numberMatches(normalized)].reverse().find((match) => {
    if (normalized[match.index - 1] === "-") return false;
    if (compactKey(match.raw) === animalKey) return false;
    return !numberHasUnitOrMoneyContext(normalized, match.index, match.raw);
  });

  return quantity?.value;
}

export function extractMoneyValue(text: string) {
  const normalized = normalizeRanchoText(text);
  const negative = normalized.match(new RegExp(`(?:^|\\s)-\\s*(${decimalNumberPattern})`))?.[1];
  if (negative) {
    const value = parseDecimalNumber(negative);
    return value === undefined ?undefined : -value;
  }
  const value = lastFinancialNumber(text);
  if (value === 1 && /\b(?:um|uma)\s+(?!mil\b|reais?\b)[a-z]/.test(normalized)) return undefined;
  return value;
}

export function removeValueAndCommonWords(value: string) {
  return cleanAnswer(value)
    .replace(new RegExp(`r\\$\\s*${decimalNumberPattern}`, "gi"), "")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)?\\b`, "gi"), "")
    .replace(/\b(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|reais|real)\b/gi, "")
    .replace(/^\s*(?:por|de|do|da|com|no|na|o|a|um|uma|pra|para)\s+/gi, " ")
    .replace(/\b(?:por|de|do|da|com|no|na)\s*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanFinanceDescriptionCandidate(value: string) {
  return removeValueAndCommonWords(value)
    .replace(/\b(?:hoje|hj|ontem|anteontem|amanha|agora)\b.*$/gi, " ")
    .replace(/\b(?:semana passada|semana que vem|essa semana|esta semana|nesta semana|mes passado|este mes|neste mes)\b.*$/gi, " ")
    .replace(/\b(?:dia|em|no dia)?\s*\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(?:19|20)\d{2})?\b.*$/gi, " ")
    .replace(/\b(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b.*$/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-](?:19|20)?\d{2})?\b.*$/g, " ")
    .replace(/(?:^|\s)-\s*/g, " ")
    .replace(/\b(?:conprei)\b/gi, "comprei")
    .replace(/\b(?:vendii)\b/gi, "vendi")
    .replace(/\b(?:leiti)\b/gi, "leite")
    .replace(/\b(?:dinhero)\b/gi, "dinheiro")
    .replace(/\b(?:despeza)\b/gi, "despesa")
    .replace(/\b(?:slario|salaro)\b/gi, "salario")
    .replace(/\b(?:con)\b/gi, "com")
    .replace(/\b(?:cliente|comprador|pagamento|recebido|recebida|dinheiro|caixa)\b/gi, " ")
    .replace(/^\s*(?:foi|era|foram)\s+/gi, " ")
    .replace(/^\s*(?:de|do|da|com|no|na|em|o|a|um|uma|pra|para)\s+/gi, " ")
    .replace(/\s+(?:de|do|da|com|no|na|em|o|a|um|uma|pra|para)$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractFinanceDescription(original: string, normalized: string, tipo: "DESPESA" | "RECEITA_VENDA") {
  const sale = original.match(/\b(?:vendi|vendeu|vendii|venda)\s+(?:(?:uma|um|o|a|de)\b\s*)?(.+?)(?:\s+por|\s+de\s+r\$?|\s+\d|$)/i)?.[1];
  if (tipo === "RECEITA_VENDA" && sale) {
    const item = cleanFinanceDescriptionCandidate(sale);
    if (item) return `venda de ${item}`;
  }

  const purchase = original.match(/\b(?:comprei|conprei|compra|paguei|gastei|gasto|despesa|despeza|saida|saída)\s+(?:(?:com|de|do|da|em|no|na|o|a)\b\s*)?(.+?)(?:\s+por|\s+de\s+r\$?|\s+\d|$)/i)?.[1];
  if (tipo === "DESPESA" && purchase) {
    const item = cleanFinanceDescriptionCandidate(purchase);
    if (item) return item;
  }

  const cleanedOriginal = cleanFinanceDescriptionCandidate(original.replace(/\b(?:registrar|registra|lancar|lanca|lançar|lança|anotar|anota|gastei|gasto|despesa|despeza|paguei|pagamento|comprei|conprei|recebi|recebemos|vendi|vendii|venda|receita|entrada|entrou|ganhei|faturei|faturou|saida|saída)\b/gi, ""));
  if (cleanedOriginal) return cleanedOriginal;

  const cleanedNormalized = cleanFinanceDescriptionCandidate(normalized.replace(/\b(?:registrar|registra|lancar|lanca|anotar|anota|gastei|gasto|despesa|paguei|pagamento|comprei|recebi|recebemos|vendi|venda|receita|entrada|entrou|ganhei|faturei|faturou|saida)\b/g, ""));
  if (cleanedNormalized) return cleanedNormalized;

  return tipo === "RECEITA_VENDA" ?"receita via WhatsApp" : undefined;
}

export function stripAnimalReferences(value: string) {
  return value
    .replace(new RegExp(`\\b${animalWords}\\s+(?:da|do|de|a|o)?\\s*[a-z0-9][a-z0-9-]*\\b`, "gi"), "")
    .replace(/\b(?:na|no|em|a|o|da|do|de)\s+[a-z]+-\d[a-z0-9-]*\b/gi, "")
    .replace(/\b(?:na|no|em|a|o|da|do|de)\s+[a-z]*\d[a-z0-9-]*\b/gi, "")
    .replace(/\b[a-z]+-\d[a-z0-9-]*\b/gi, "")
    .replace(/\b[a-z]*\d[a-z0-9-]*\b/gi, "")
    .replace(/\b(?:os|as|nos|nas|aos|pros|pras|para os|para as)?\s*(?:bois|vacas|gado|bezerros|bezerra|bezerro|novilhas)\b/gi, "")
    .replace(/\b(?:hoje|ontem|amanha|amanhã)\b/gi, "")
    .replace(/\b(?:recebeu|recebi|tomou|vacinei|vacinada|vacinado|apliquei|aplicar|aplicado|aplicou|mediquei|medicar|medicou|tratei|tratamento|tratou|tratar|manejo|com|foi)\b/gi, "")
    .replace(/\b(?:registrar|registra|lancar|lanca|anotar|anota)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanMedicineProduct(value: string | undefined) {
  const cleaned = stripAnimalReferences(value || "")
    .replace(/^(?:(?:nao|não|n|foi|era|na verdade|verdade)\s*,?\s*)+/i, "")
    .replace(/^(?:(?:dose|doses)\s+(?:de|da|do)\s+)+/i, "")
    .replace(/^(?:(?:vacina|medicamento|rem[eé]dio|tratamento|manejo)\s+)+/i, "")
    .replace(/^(?:(?:da|de|do|contra|pra|para)\s+)+/i, "")
    .replace(/\s+(?:na|no|em|para|pra)\s+[a-z][a-z0-9-]*$/i, "")
    .replace(/\s+(?:da|de|do|contra|pra|para|na|no|em|a|o)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || undefined;
}

export function extractProduct(original: string, normalized: string) {
  const knownProduct = normalized.match(/\b(?:aftosa|brucelose|raiva|clostridial|terramicina|vermifugo|antibiotico|dipirona|anti-inflamatorio|antiinflamatorio|carrapaticida|pour-on|pour on|suplemento|remedio|medicamento)\b/)?.[0];
  const afterCom = original.match(/\bcom\s+(.+)$/i)?.[1];
  const afterFoi = original.match(/\b(?:foi|era)\s+(.+)$/i)?.[1];
  const afterAction = original.match(/\b(?:vacina|vacinei|vacinada|vacinado|apliquei|aplicar|aplicou|tomou|recebeu|mediquei|medicar|medicou|tratei|tratamento|tratou|dei|passei|usei)\s+(.+)$/i)?.[1];
  const product = cleanMedicineProduct(afterCom || afterFoi || afterAction || original);
  const generic = normalizeRanchoText(product || "");

  if (product && knownProduct && generic.includes(knownProduct)) return knownProduct;
  if (product && !["a", "o", "um", "uma", "na", "no", "em", "para", "pra", "registrar", "registra", "vacina", "medicamento", "remedio", "tomou", "tratei", "tratamento", "manejo", "dose", "doses", "bois", "gado"].includes(generic)) return product;
  if (knownProduct) return knownProduct;

  const fallback = cleanMedicineProduct(normalized);
  return fallback && !["a", "o", "um", "uma", "na", "no", "em", "para", "pra", "registrar", "registra", "vacina", "medicamento", "remedio", "tomou", "tratei", "tratamento", "manejo", "dose", "doses", "bois", "gado"].includes(fallback) ?fallback : undefined;
}

function stripStockTrailingContext(value: string) {
  return cleanAnswer(value)
    .replace(/\b(?:hoje|hj|ontem|anteontem|amanha|agora)\b.*$/gi, " ")
    .replace(/\b(?:semana passada|semana que vem|essa semana|esta semana|nesta semana|mes passado|este mes|neste mes)\b.*$/gi, " ")
    .replace(/\b(?:dia|em|no dia)?\s*\d{1,2}\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(?:19|20)\d{2})?\b.*$/gi, " ")
    .replace(/\b(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b.*$/g, " ")
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-](?:19|20)?\d{2})?\b.*$/g, " ")
    .replace(/\s+(?:no|na|em|para|pra|pro|pros|pras|ao|aos)\s+(?:lote|piquete|trator|cocho|curral|cerca|alimentacao|bois|vacas|gado|animais)\b.*$/gi, " ")
    .replace(/^(?:vencido|vencida|molhado|molhada|estragado|estragada|perdido|perdida)\b.*$/gi, " ")
    .replace(/\s+(?:vencido|vencida|molhado|molhada|estragado|estragada|perdido|perdida)\b.*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const standaloneStockNumberPattern = new RegExp(`(^|[^\\w-])${decimalNumberPattern}(?=$|[^\\w-])`, "gi");

function cleanStockItemCandidate(value?: string | null) {
  const cleaned = stripStockTrailingContext(value || "")
    .replace(/\bpor\b.*$/gi, " ")
    .replace(new RegExp(`r\\$\\s*${decimalNumberPattern}`, "gi"), " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*${stockUnitWords}\\b`, "gi"), " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)\\b`, "gi"), " ")
    .replace(standaloneStockNumberPattern, "$1 ")
    .replace(/\bbrincos?\s+de\s+/gi, " ")
    .replace(/\b(?:vendi|vendeu|vendemos|vender|venda)\b/gi, " ")
    .replace(/\b(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil)\b/gi, " ")
    .replace(new RegExp(`\\b${stockUnitWords}\\b`, "gi"), " ")
    .replace(/\b(?:no|na|do|da)\s+estoque\b/gi, " ")
    .replace(/\b(?:chegaram|chego|xegou|recebi|inclui|incluir|incluido|usado|forneci|descartei|perdeu|perdi|estragou|sumiu|menos)\b/gi, " ")
    .replace(/\b(?:pros?|pras?|para os|para as|aos?|às?)\s+(?:bois|vacas|bezerros|gado|animais)\b/gi, " ")
    .replace(/\b(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|item|registrar|consulta|consultar|ver|quanto|saldo|tem|baixo|minimo|critico|me|mostre|mostrar|quero|comprei|compramos|comprar|compra|paguei|adiciona|adicionar|adicionei|inclui|incluir|incluido|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|chegaram|chego|xegou|recebi|recebemos|estoque|baixa|baixar|retira|retirar|retirei|retire|tira|tirar|usei|usar|usado|foi usado|forneci|gastei|saiu|saida|saída|dei|deu|perdeu|perdi|estragou|sumiu|descartei|menos)\b/gi, " ")
    .replace(/\b(?:foi|foram|era)\b/gi, " ")
    .replace(/^(?:de|do|da|com|no|na|o|a|um|uma|pra|para)\s+/gi, " ")
    .replace(/\s+(?:de|do|da|com|no|na|o|a|um|uma|pra|para)$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || undefined;
}

export function extractStockItem(original: string) {
  const called = original.match(/\b(?:chamado|chamada|nomeado|nomeada)\s+(.+?)(?:\s+no estoque|\s+na estoque|\s+para estoque|$)/i)?.[1];
  if (called) return cleanStockItemCandidate(called);

  const stockQueryItem = original.match(/\b(?:me\s+mostre\s+o\s+estoque\s+de|mostre\s+o\s+estoque\s+de|mostrar\s+estoque\s+de|ver\s+estoque\s+de|estoque\s+de|quanto\s+tem\s+de)\s+(.+)$/i)?.[1];
  if (stockQueryItem) return cleanStockItemCandidate(stockQueryItem);

  const quantityItem = original.match(new RegExp(`\\b${decimalNumberPattern}\\s*${stockUnitWords}\\s+(?:de|do|da)?\\s+(.+?)(?:\\s+(?:no|na|do|da)\\s+estoque\\b|\\s+(?:ao|aos|para|pra|pro|pros|pras|por)\\b|$)`, "i"))?.[1];
  if (quantityItem && /^\s*item\s+[a-z0-9-]+\s*$/i.test(quantityItem)) return cleanAnswer(quantityItem);
  const cleanedQuantityItem = cleanStockItemCandidate(quantityItem);
  if (cleanedQuantityItem) return cleanedQuantityItem;

  const purchaseQuantityItem = original.match(/\b(?:comprei|compramos|comprar|compra)\s+\d+(?:[,.]\d+)?\s*(?:de|do|da)?\s+(.+?)(?:\s+por|\s+de\s+r\$?|\s+r\$|\s+\d+(?:[,.]\d+)?\s*(?:reais|real)\b|$)/i)?.[1];
  if (purchaseQuantityItem) return cleanStockItemCandidate(purchaseQuantityItem);

  const cleaned = stripStockTrailingContext(original)
    .replace(/\bpor\b.*$/gi, " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*${stockUnitWords}\\b`, "gi"), " ")
    .replace(new RegExp(`r\\$\\s*${decimalNumberPattern}`, "gi"), " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(?:por)\\s+${decimalNumberPattern}(?:\\s*(?:reais|real))?\\b`, "gi"), " ")
    .replace(standaloneStockNumberPattern, "$1 ")
    .replace(/\bbrincos?\s+de\s+/gi, " ")
    .replace(/\b(?:vendi|vendeu|vendemos|vender|venda)\b/gi, " ")
    .replace(/\b(?:no|na|do|da)\s+estoque\b/gi, " ")
    .replace(/\b(?:chegaram|chego|xegou|recebi|inclui|incluir|incluido|usado|forneci|descartei|perdeu|perdi|estragou|sumiu|menos)\b/gi, " ")
    .replace(/\b(?:pros?|pras?|para os|para as|aos?|às?)\s+(?:bois|vacas|bezerros|gado|animais)\b/gi, " ")
    .replace(/\b(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|item|registrar|consultar|consulta|ver|quanto|saldo|tem|baixo|minimo|mínimo|critico|crítico|me|mostre|mostrar|comprei|compramos|comprar|compra|paguei|adiciona|adicionar|adicionei|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|recebemos|estoque|baixa|baixar|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|saiu|dei|deu|sacos|saco|kg|quilo|quilos|grama|gramas|litro|litros|unidade|unidades|caixa|caixas|dose|doses|fardo|fardos)\b/gi, " ")
    .replace(/\b(?:foi|foram|era)\b/gi, " ")
    .replace(/^(?:de|do|da|com|no|na|o|a|um|uma|pra|para)\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

export function extractStockUnit(text: string) {
  const quantityUnit = normalizeRanchoText(text).match(stockUnitAfterQuantityPattern)?.[2];
  if (quantityUnit) return extractStockUnit(quantityUnit);
  const normalized = normalizeRanchoText(text);
  if (/\bsacos?\b|\bsakos?\b|\bsc\b/.test(normalized)) return "saco";
  if (/\bkg\b|\bkilos?\b|\bk\b|\bquilos?\b/.test(normalized)) return "kg";
  if (/\bgramas?\b|\bg\b/.test(normalized)) return "g";
  if (/\blitros?\b|\blitos?\b|\bl\b/.test(normalized)) return "L";
  if (/\bcaixas?\b|\bcx\b/.test(normalized)) return "caixa";
  if (/\bdoses?\b/.test(normalized)) return "dose";
  if (/\bfardos?\b/.test(normalized)) return "fardo";
  if (/\bgaloes?\b|\bgalao\b/.test(normalized)) return "galao";
  if (/\bfrascos?\b/.test(normalized)) return "frasco";
  if (/\brolos?\b/.test(normalized)) return "rolo";
  if (/\bunidades?\b|\bunids?\b|\bund\b|\bun\b/.test(normalized)) return "unidade";
  return undefined;
}

export function hasPhysicalQuantity(text: string) {
  return stockUnitAfterQuantityPattern.test(normalizeRanchoText(text));
}

export function hasLooseStockQuantity(text: string) {
  return new RegExp(`\\b${decimalNumberPattern}\\s*(?:saco|sacos|kg|kilo|kilos|k|quilo|quilos|grama|gramas|g|litro|litros|l|caixa|caixas|dose|doses|fardo|fardos|unidade|unidades)\\b`).test(normalizeRanchoText(text));
}

export function hasExplicitMoney(text: string) {
  const normalized = normalizeRanchoText(text);
  return new RegExp(`r\\$\\s*${decimalNumberPattern}`, "i").test(text)
    || new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)\\b`).test(normalized)
    || new RegExp(`\\bpor\\s+${decimalNumberPattern}(?:\\s*(?:mil|reais|real))?\\b`).test(normalized)
    || /\b(?:paguei|gastei|recebi|vendi|valor|custou)\s+(?:\d+(?:[.,]\d+)?\s+)?mil\b/.test(normalized)
    || /\b(?:mil)\s+(?:reais|real)\b/.test(normalized);
}

export function isPurchaseText(text: string) {
  return /\b(?:comprei|compramos|comprar|compra)\b/.test(normalizeRanchoText(text));
}

export function numberHasUnitOrMoneyContext(text: string, index: number, raw: string) {
  const before = text.slice(Math.max(0, index - 8), index);
  const after = text.slice(index + raw.length, index + raw.length + 18);
  const unitAfter = new RegExp(`^\\s*${stockUnitWords}\\b`).test(after);
  const milUnitAfter = /^\s*mil\s*(?:l|lt|lts|litro|litros|kg|quilos?|gramas?|g|sacos?|caixas?|doses?|fardos?|unidades?)\b/.test(after);
  const milMoneyAfter = /^\s*mil\b/.test(after);
  const moneyAfter = /^\s*(?:reais|real)\b/.test(after);
  const moneyBefore = /r\$\s*$/.test(before);
  return unitAfter || milUnitAfter || milMoneyAfter || moneyAfter || moneyBefore;
}

export function extractStockQuantity(original: string) {
  const normalized = normalizeRanchoText(original);
  const quantityWithUnit = normalized.match(stockUnitAfterQuantityPattern);
  if (quantityWithUnit?.[1]) return parseDecimalNumber(quantityWithUnit[1]);

  const numbers = numberMatches(normalized);
  const unitPattern = new RegExp(`^\\s*${stockUnitWords}\\b`);

  const withUnit = numbers.find((match) => unitPattern.test(normalized.slice(match.index + match.raw.length)));
  if (withUnit) return withUnit.value;

  const generic = numbers.find((match) => {
    const tail = normalized.slice(match.index + match.raw.length);
    const articleBeforeItem = /^(?:1|um|uma)$/.test(match.raw) && /^\s*item\b/.test(tail);
    const moneyMagnitude = /\bmil\b/.test(match.raw) || /^\s*mil\b/.test(tail);
    return !articleBeforeItem && !moneyMagnitude && !numberHasUnitOrMoneyContext(normalized, match.index, match.raw);
  });

  return generic?.value;
}

export function extractStockDestination(original: string) {
  const match = original.match(/\b(?:pros?|pras?|para os|para as|aos?|às?)\s+(bois|vacas|bezerros|gado|animais)\b/i);
  return match?.[1] ?cleanAnswer(match[1]) : undefined;
}

export function extractEmployeeName(original: string, normalized: string) {
  const afterEmployee = original.match(/\b(?:funcionario|funcionário|colaborador)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+as|\s+às|\s+\d|$)/i)?.[1];
  if (afterEmployee) return cleanAnswer(afterEmployee);

  const afterConnector = original.match(/\b(?:do|da|de)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+as|\s+às|\s+\d|$)/i)?.[1];
  if (afterConnector) return cleanAnswer(afterConnector);

  const beforeVerb = normalized.match(/^([a-z][a-z\s]+?)\s+(?:entrou|saiu|bateu|registrou)\b/)?.[1];
  if (beforeVerb) return cleanAnswer(beforeVerb);

  return undefined;
}

export function extractEmployeeRole(normalized: string) {
  const role = normalized.match(/\b(?:vaqueiro|ordenhador|tratador|tratadora|gerente|funcionario|colaborador)\b/)?.[0];
  if (!role || ["funcionario", "colaborador"].includes(role)) return undefined;
  return role;
}

export function extractEmployeeCreationName(original: string) {
  const withoutPhone = removeWhatsappPhone(original)
    .replace(/\b(?:whatsapp|telefone|zap|celular)\b\s*:?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const directCreateName = withoutPhone.match(/\b(?:cadastra|cadastrar|cadastre|cadatra|adicionar|adiciona|novo|nova|cria|criar)\s+(?:funcionario|funcionaria|funcionário|funcionária|colaborador|colaboradora|vaqueiro|ordenhador|tratador|tratadora|gerente)?\s*([a-zA-ZÀ-ÿ\s]+?)(?:\s+(?:cargo|funcao|função|salario|salário|cpf|bot|only|so|só|apenas|whatsapp|telefone|zap)\b|\s+\d|$)/i)?.[1];
  const directCleaned = cleanAnswer(directCreateName || "")
    .replace(/\b(?:com|de|do|da|no|na|para|pra|zap|whatsapp|telefone|celular)\b.*$/i, "")
    .replace(/\b(?:cargo|funcao|função|salario|salário|cpf|bot|only|so|só|apenas)\b.*$/i, "")
    .replace(/\b(?:funcionario|funcionaria|funcionário|funcionária|colaborador|colaboradora|vaqueiro|ordenhador|ordenhadora|tratador|tratadora|gerente)\b/gi, "")
    .replace(/^(?:o|a)\s+/i, "")
    .trim();
  if (directCleaned) return directCleaned;

  const afterAction = withoutPhone.match(/\b(?:cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar)\s+(?:funcion[aá]rio|colaborador|vaqueiro|ordenhador|tratador|tratadora|gerente)?\s*([a-zA-ZÀ-ÿ\s]+?)\s*$/i)?.[1];
  const cleaned = cleanAnswer(afterAction || "")
    .replace(/\b(?:com|de|do|da|no|na|para|pra|zap|whatsapp|telefone|celular)\b.*$/i, "")
    .replace(/\b(?:funcion[aá]rio|colaborador|vaqueiro|ordenhador|tratador|tratadora|gerente)\b/gi, "")
    .trim();

  return cleaned || undefined;
}

function cleanEmployeeName(value?: string | null) {
  return cleanAnswer(value || "")
    .replace(/\b(?:funcionario|funcionaria|funcionário|funcionária|colaborador|colaboradora|vaqueiro|ordenhador|ordenhadora|tratador|tratadora|gerente|cargo|funcao|função|salario|salário|cpf|whatsapp|telefone|zap|celular|bot|only|sistema|acesso|como|com|nome|para|pra|do|da|de|o|a)\b/gi, " ")
    .replace(/\b(?:agora|hoje|ontem|mes|mês|semana)\b/gi, " ")
    .replace(/\b(?:nao|não|mais)\b/gi, " ")
    .replace(/\b(?:quem|ponto|relatorio|relatório|horas|faltas)\b/gi, " ")
    .replace(/\b(?:r\$|reais|real)\b/gi, " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\b`, "gi"), " ")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:o|a)\s+/i, "")
    .trim();
}

export function extractEmployeeLooseName(original: string, normalized: string) {
  const fromCreation = extractEmployeeCreationName(original);
  if (fromCreation) return fromCreation;

  const patterns = [
    /\b(?:funcionario|funcionaria|funcionário|funcionária|colaborador|colaboradora)\s+(?:com\s+nome\s+)?([a-zA-ZÀ-ÿ\s]+?)(?:\s+(?:cargo|funcao|função|salario|salário|cpf|telefone|whatsapp|zap|bot|so|só|apenas|como)\b|\s+\d|$)/i,
    /\b(?:contratei|contratar|desliga|desligar|demite|demitir|inativa|inativar|desativar|reativa|reativar|ativa|ativar|exclui|excluir|apaga|apagar|remove|remover|deleta|deletar)\s+(?:o|a)?\s*([a-zA-ZÀ-ÿ\s]+?)(?:\s|$)/i,
    /^([a-zA-ZÀ-ÿ]+(?:\s+[a-zA-ZÀ-ÿ]+){0,2})\s+(?:trabalha|começou|comecou|iniciou|ganha|recebeu|virou|entrou|saiu|terminou|encerrou|foi embora|bateu)\b/i,
    /\b(?:do|da|de|para|pra|pro)\s+([a-zA-ZÀ-ÿ]+(?:\s+[a-zA-ZÀ-ÿ]+){0,2})\b/i
  ];

  for (const pattern of patterns) {
    const candidate = cleanEmployeeName(original.match(pattern)?.[1]);
    if (candidate) return candidate;
  }

  const normalizedCandidate = normalized.match(/^([a-z][a-z\s]{1,35})\s+(?:ganha|recebeu|trabalha|comecou|começou|virou|entrou|saiu)\b/)?.[1];
  return cleanEmployeeName(normalizedCandidate) || undefined;
}

export function extractEmployeeAccessMode(original: string, normalized: string) {
  if (/\b(?:bot only|so no whatsapp|só no whatsapp|apenas para o bot|so vai usar o bot|só vai usar o bot|sem acesso ao sistema|so whatsapp|só whatsapp)\b/i.test(original)
    || /\b(?:bot_only|so whatsapp|so no whatsapp|apenas bot|apenas para o bot|sem acesso ao sistema)\b/.test(normalized)) {
    return "bot_only";
  }
  return undefined;
}

export function extractEmployeeCpf(original: string) {
  if (!/\bcpf\b/i.test(original)) return undefined;
  const digits = original.replace(/\D/g, "");
  return digits.length >= 11 ?digits.slice(0, 11) : undefined;
}

export function extractEmployeeSalary(original: string, normalized: string) {
  if (!/\b(?:salario|salário|slario|ganha|ganhar|recebe|receber|remuneracao|remuneração)\b/i.test(original)
    && !/\b(?:salario|slario|ganha|recebe|remuneracao)\b/.test(normalized)) {
    return undefined;
  }
  return extractMoneyValue(normalized);
}

export function extractEmployeePaymentType(normalized: string) {
  if (/\b(?:adiantamento|adiantar|adiantado)\b/.test(normalized)) return "adiantamento";
  if (/\b(?:diaria|diarias)\b/.test(normalized)) return "diaria";
  if (/\b(?:bonus|bonificacao|premio)\b/.test(normalized)) return "bonus";
  if (/\b(?:salario|salarial|folha)\b/.test(normalized)) return "salario";
  return "salario";
}

export function extractEmployeePaymentPeriod(normalized: string) {
  if (/\b(?:mes anterior|mês anterior|mes passado|mês passado)\b/.test(normalized)) return "mes_anterior";
  if (/\b(?:este mes|esse mes|neste mes|mês atual|mes atual)\b/.test(normalized)) return "mes_atual";
  if (/\b(?:semana)\b/.test(normalized)) return "semana";
  if (/\b(?:hoje|diaria)\b/.test(normalized)) return "hoje";
  return "mes_atual";
}

export function extractEmployeePaymentName(original: string, normalized: string) {
  const patterns = [
    /\b(?:salario|salário)\s+pago\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+\d|\s+por|\s+referente|$)/i,
    /\b(?:salario|salário|adiantamento|diaria|diária|bonus|bônus)\s+(?:do|da|de|para|pra|pro)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+\d|\s+por|\s+referente|$)/i,
    /\bpaguei\s+(?:o\s+)?(?:salario|salário|adiantamento|diaria|diária)?\s*(?:do|da|de|para|pra|pro)?\s*([a-zA-ZÀ-ÿ\s]+?)(?:\s+\d|\s+por|\s+referente|$)/i,
    /\b(?:para|pra|pro)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+\d|\s+por|\s+referente|$)/i
  ];
  for (const pattern of patterns) {
    const candidate = cleanEmployeeName(original.match(pattern)?.[1]);
    if (candidate && !/^(?:salario|adiantamento|diaria|funcionario)$/.test(normalizeRanchoText(candidate))) return candidate;
  }
  return extractEmployeeName(original, normalized) || extractEmployeeLooseName(original, normalized);
}

export function extractPointType(text: string) {
  if (/\b(?:saida|saiu|sair|encerrou|terminou|terminei|fim|fechou|embora)\b/.test(text)) return "saida";
  if (/\b(?:entrada|entrou|entrar|chegou|cheguei|começou|comecou|comecei|iniciou|inicio|início|bate ponto|ponto)\b/.test(text)) return "entrada";
  return undefined;
}

export function extractAnimalCategory(text: string) {
  const category = Array.from(animalCategories).find((item) => new RegExp(`\\b${item}\\b`).test(text));
  if (!category || category === "animal" || category === "animais" || category === "animau" || category === "gado") return undefined;
  return animalCategoryMap[category] || category;
}

export function isAnimalOptionalField(field?: string) {
  return Boolean(field && animalOptionalFields.includes(field));
}

export function skippedAnimalOptionalFields(dados: AnyRecord) {
  return Array.isArray(dados.campos_opcionais_pulados) ?dados.campos_opcionais_pulados.map(String) : [];
}

export function hasSkippedAnimalOptionalField(dados: AnyRecord, field: string) {
  return skippedAnimalOptionalFields(dados).includes(field);
}

export function markAnimalOptionalFieldSkipped(dados: AnyRecord, field: string) {
  const skipped = new Set(skippedAnimalOptionalFields(dados));
  skipped.add(field);
  return {
    ...dados,
    campos_opcionais_pulados: Array.from(skipped),
    ...(field === "lote_animal" ?{ lote_nome: undefined, lote_nao_encontrado: undefined, lote_opcoes: undefined } : {})
  };
}

export function inferAnimalSexFromCategory(category: string | number | null | undefined) {
  const normalized = normalizeRanchoText(String(category || ""));
  if (!normalized || /^(?:animal|animais|bovino|bovinos|gado|cria|bezerro\/a|indefinido|indefinida|outro|outros|outra|outras|nao informado|nao informada)$/.test(normalized)) return undefined;
  if (["f", "femea", "femeas", "feminino", "vaca", "vca", "novilha", "novila", "bezerra", "matriz", "matrizes"].includes(normalized)) return "femea";
  if (["m", "macho", "machos", "masculino", "boi", "boii", "touro", "bezerro", "bezero", "reprodutor", "reprodutores"].includes(normalized)) return "macho";
  return undefined;
}

export function hasAnimalOptionalValue(dados: AnyRecord, field: string) {
  if (field === "lote_animal") return hasValue(dados.lote_id) || hasValue(dados.lote_nome);
  return hasValue(dados[field]);
}

export function isSkipOptionalAnswer(text: string) {
  const normalized = normalizeRanchoText(text);
  return normalized === "2"
    || /^(?:pular|pula|nao|não|nao sei|não sei|depois|sem|deixar sem|deixa sem|deixar em branco|ignorar|nao informar|não informar)$/.test(normalized);
}

export function isSkipAnimalSexOptionalAnswer(text: string) {
  const normalized = normalizeRanchoText(text);
  return normalized === "3"
    || /^(?:pular|pula|nao|não|nao sei|não sei|depois|sem|deixar sem|deixa sem|deixar em branco|ignorar|nao informar|não informar)$/.test(normalized);
}

export function extractAnimalSex(text: string) {
  const normalized = normalizeRanchoText(text);
  if (normalized === "2" || /\b(?:femea|femeas|feme|feminino)\b/.test(normalized) || /\bsexo\s+f\b/.test(normalized)) return "femea";
  if (normalized === "1" || /\b(?:macho|machos|maxo|maxos|masculino)\b/.test(normalized) || /\bsexo\s+m\b/.test(normalized)) return "macho";
  const categoryCue = normalized.match(/\b(?:vaca|vca|novilha|novila|bezerra|matriz|matrizes|boi|boii|touro|bezerro|bezero|reprodutor|reprodutores)\b/)?.[0];
  const inferred = inferAnimalSexFromCategory(categoryCue || normalized);
  if (inferred) return inferred;
  return undefined;
}

export function extractAnimalPhase(text: string) {
  const normalized = normalizeRanchoText(text)
    .replace(/\blote\b.*$/g, " ")
    .replace(/\bnao\s+aplicavel\b/g, "nao_aplicavel");
  const word = Object.keys(animalPhaseMap).find((item) => new RegExp(`\\b${item}\\b`).test(normalized));
  return word ?animalPhaseMap[word] : undefined;
}

export function extractAnimalBreed(original: string) {
  const match = original.match(/\b(?:raça|raca)\s+(?:do|da|de)?\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:\s+(?:lote|sexo|fase|nasc(?:imento|eu|ido|ida)?|brinco|codigo|código|cod|número|numero)\b|$)/i)?.[1];
  return cleanAnswer(match || "") || undefined;
}

export function extractAnimalLotName(original: string) {
  const match = original.match(/\blote\s+(?:do|da|de)?\s*([a-zA-ZÀ-ÿ0-9\s'-]+?)(?:\s+(?:raça|raca|sexo|fase|nasc(?:imento|eu|ido|ida)?|brinco|codigo|código|cod|número|numero)\b|$)/i)?.[1];
  return cleanAnswer(match || "") || undefined;
}

export function validDateParts(year: number, month: number, day: number) {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function extractAnimalBirthDate(original: string) {
  const normalized = normalizeRanchoText(original);
  const brDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-]((?:19|20)\d{2})\b/);
  if (brDate) return validDateParts(Number(brDate[3]), Number(brDate[2]), Number(brDate[1]));

  const isoDate = normalized.match(/\b((?:19|20)\d{2})[/-](\d{1,2})[/-](\d{1,2})\b/);
  if (isoDate) return validDateParts(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));

  const yearOnly = normalized.match(/\b(?:ano|nasceu em|nascido em|nascimento)\s*((?:19|20)\d{2})\b/);
  if (yearOnly) return validDateParts(Number(yearOnly[1]), 1, 1);

  return undefined;
}

export function extractAnimalLocal(text: string) {
  const location = text.match(/\b(?:do|da|no|na|em)\s+(fundo|curral|pasto|piquete)\b/)?.[1];
  return location;
}

export function explicitRegistrationCode(value?: string | null) {
  const candidate = normalizeAnimalCandidate(value);
  if (!candidate) return undefined;
  return /\d|-/.test(candidate) ?candidate : undefined;
}

export function extractAnimalRegistrationCode(text: string) {
  const directWithFiller = text.match(/\b(?:brinco|codigo|cod|numero|n)\s+(?:e|eh|foi|era|para|pra)?\s*([a-z0-9-]+)\b/)?.[1];
  const explicitDirect = explicitRegistrationCode(directWithFiller);
  if (explicitDirect) return explicitDirect;

  const direct = text.match(/\b(?:brinco|codigo|código|cod|numero|número|n)\s+([a-z0-9-]+)\b/)?.[1];
  if (direct) return normalizeAnimalCandidate(direct);

  const afterCategory = text.match(new RegExp(`\\b${animalWords}\\s+(?:brinco|codigo|cod|numero|n)?\\s*([a-z]*\\d[a-z0-9-]*|[a-z]+-[a-z0-9]+)\\b`))?.[1];
  const categoryCode = explicitRegistrationCode(afterCategory);
  if (categoryCode) return categoryCode;

  const candidates = Array.from(text.matchAll(/\b([a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*)\b/gi))
    .map((match) => ({ raw: match[1], index: match.index === undefined ? 0 : match.index }))
    .filter((match) => !numberHasUnitOrMoneyContext(text, match.index, match.raw));
  return explicitRegistrationCode(candidates[candidates.length - 1]?.raw);
}

export function cleanAnimalRegistrationName(value?: string | null) {
  const cleaned = cleanAnswer(value || "")
    .replace(/\b(?:brinco|codigo|código|cod|numero|número|n)\b.*$/i, "")
    .replace(/\b(?:peso|pesou|com)\s*\d+(?:[,.]\d+)?\s*(?:kg|kgs|quilo|quilos)?\b.*$/i, "")
    .replace(/\b\d+(?:[,.]\d+)?\s*(?:kg|kgs|quilo|quilos)\b.*$/i, "")
    .replace(/\b(?:raca|raÃ§a|lote|nascimento|nasceu)\b.*$/i, "")
    .replace(/\b(?:macho|maxo|femea|fÃªmea|feme|feminino|masculino|gestante|lactante|lactacao|lactaÃ§Ã£o|seca|vazia|crescimento|engorda)\b.*$/i, "")
    .replace(/\b(?:[a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*)\b/gi, "")
    .replace(/\b(?:com|de|do|da|no|na|para|pra)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return undefined;
  if (/^(?:novo|nova|cadastrar|cadastra|cadastro|animal|adicionar|adiciona|registrar|registra|criar|cria)$/i.test(normalizeRanchoText(cleaned))) return undefined;
  if (!/\s/.test(cleaned) && extractAnimalCategory(normalizeRanchoText(cleaned))) return undefined;
  if (explicitRegistrationCode(cleaned)) return undefined;
  return cleaned;
}

export function extractAnimalRegistrationName(original: string) {
  const explicit = original.match(/\b(?:nome|chamad[oa]|apelido)\s+(?:de|da|do)?\s*([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s'-]{0,40}?)(?:\s+(?:com|brinco|codigo|código|cod|numero|número|n)\b|$)/i)?.[1];
  const explicitName = cleanAnimalRegistrationName(explicit);
  if (explicitName) return explicitName;

  const broadExplicit = original.match(/\b(?:nome|chamad[oa]|apelido)\s+(?:de|da|do)?\s*([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF\s'-]{0,40}?)(?=\s+(?:com|brinco|codigo|cod|numero|n|peso|raca|lote|nascimento|[a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*|\d+(?:[,.]\d+)?\s*(?:kg|kgs|quilo|quilos))\b|$)/i)?.[1];
  const broadExplicitName = cleanAnimalRegistrationName(broadExplicit);
  if (broadExplicitName) return broadExplicitName;

  const broadAfterCategory = original.match(/\b(?:vacas?|vca|bois?|boii|touros?|bezerros?|bezero|bezerras?|novilhas?|novila|matriz|matrizes|reprodutor(?:es)?|animal|animais|animau|gado|femeas?|machos?|maxos?)\s+([A-Za-z\u00C0-\u00FF][A-Za-z\u00C0-\u00FF\s'-]{0,40}?)(?=\s+(?:com|brinco|codigo|cod|numero|n|peso|raca|lote|nascimento|[a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*|\d+(?:[,.]\d+)?\s*(?:kg|kgs|quilo|quilos))\b|$)/i)?.[1];
  const broadName = cleanAnimalRegistrationName(broadAfterCategory);
  if (broadName) return broadName;

  const afterCategory = original.match(/\b(?:vaca|boi|touro|bezerro|bezerra|novilha)\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s'-]{0,40}?)(?:\s+(?:com|brinco|codigo|código|cod|numero|número|n)\b|$)/i)?.[1];
  return cleanAnimalRegistrationName(afterCategory);
}

export function extractAnimalWeight(original: string) {
  const normalized = normalizeRanchoText(original);
  const explicit = normalized.match(/\b(?:peso|pesou)\s+(?:de\s+)?(\d+(?:[,.]\d+)?)\s*(?:kg|kgs|quilo|quilos)?\b/)?.[1];
  const byUnit = normalized.match(/\b(\d+(?:[,.]\d+)?)\s*(?:kg|kgs|quilo|quilos)\b/)?.[1];
  const value = parseDecimalNumber(explicit || byUnit || "");
  return value && value > 0 ? value : undefined;
}

export function extractServiceLocal(original: string) {
  const match = original.match(/\b(?:no|na|do|da)\s+(.+)$/i);
  return cleanAnswer(match?.[1] || "");
}
