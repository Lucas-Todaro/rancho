import type { AnyRecord } from "@/lib/types";
import { normalizeWhatsappNumber } from "@/lib/phone";

export type RanchoIntent =
  | "PRODUCAO_LEITE"
  | "PARTO"
  | "VACINA_MEDICAMENTO"
  | "MORTE"
  | "DESPESA"
  | "RECEITA_VENDA"
  | "CRIAR_ITEM_ESTOQUE"
  | "ESTOQUE_CADASTRO"
  | "ESTOQUE_ENTRADA"
  | "ESTOQUE_SAIDA"
  | "CRIAR_FUNCIONARIO"
  | "PONTO_FUNCIONARIO"
  | "CADASTRO_ANIMAL"
  | "CONSULTA_PRODUCAO"
  | "CONSULTA_FINANCEIRO"
  | "CONSULTA_ESTOQUE"
  | "CONSULTA_FUNCIONARIO"
  | "ORDEM_SERVICO"
  | "AJUDA"
  | "DESCONHECIDO";

export type ParsedRanchoMessage = {
  tipo: RanchoIntent;
  confianca: number;
  dados: AnyRecord;
  resumo: string;
  perguntas_faltantes: string[];
};

export const BOT_EXAMPLES = [
  "- Mimosa deu 15 litros hoje",
  "- Vendi leite por 900 reais",
  "- Comprei ração por 300",
  "- Adiciona 10 sacos de ração no estoque",
  "- João entrou às 7:30"
];

const questionByField: Record<string, string> = {
  animal_codigo: "Qual é o brinco ou código do animal?",
  litros: "Quantos litros foram produzidos?",
  produto: "Qual medicamento, vacina ou manejo foi feito?",
  valor: "Qual foi o valor?",
  descricao: "Qual é a descrição do registro?",
  item_nome: "Qual item do estoque?",
  quantidade: "Qual quantidade?",
  unidade: "Qual unidade deseja usar? Exemplo: saco, kg ou unidade.",
  funcionario_nome: "Qual funcionário?",
  telefone: "Qual é o WhatsApp do funcionário? Envie com DDD.",
  ponto_tipo: "Foi entrada ou saída?",
  categoria_animal: "Qual é a categoria do animal? Ex: vaca, bezerro ou touro."
};

const numberWords: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900
};

const animalWords = "(?:vaca|animal|gado|boi|touro|bezerro|bezerra|novilha|brinco)";
const animalCategories = new Set(["vaca", "boi", "bezerro", "bezerra", "novilha", "touro", "animal"]);
const animalCodePattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const stockUnitWords = "(?:sacos?|kg|quilos?|gramas?|g|litros?|l|caixas?|doses?|fardos?|unidades?)";
const decimalNumberPattern = "\\d+(?:[.,]\\d+)*";
const stockUnitAfterQuantityPattern = new RegExp(`\\b(${decimalNumberPattern})\\s*(${stockUnitWords})\\b`, "i");
const stockItemHintPattern = /\b(?:racao|ração|milho|feno|sal|mineral|aftosa|remedio|remédio|medicamento|insumo|silagem|suplemento)\b/;
const forbiddenAnimalCodes = new Set([
  "vaca",
  "animal",
  "boi",
  "bois",
  "bezerro",
  "bezerra",
  "novilha",
  "pariu",
  "morreu",
  "fundo",
  "curral",
  "pasto",
  "piquete",
  "hoje",
  "ontem",
  "vacina",
  "medicamento",
  "remedio",
  "terramicina",
  "aftosa",
  "racao",
  "milho",
  "feno",
  "sal",
  "mineral",
  "estoque",
  "litros",
  "kg",
  "saco",
  "sacos",
  "dose",
  "doses",
  "fardo",
  "fardos"
]);

function compactKey(value: string | number | null | undefined) {
  return normalizeRanchoText(String(value ?? "")).replace(/[^a-z0-9]/g, "");
}

function isForbiddenAnimalCode(value: string | number | null | undefined) {
  return forbiddenAnimalCodes.has(compactKey(value));
}

function normalizeAnimalCandidate(value: string | number | null | undefined) {
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

  const compact = normalized.replace(/\s*-\s*/g, "-");
  if (animalCodePattern.test(compact)) return compact;

  const animalWithNumber = normalized.match(/\b(?:VACA|ANIMAL|BOI|TOURO|BEZERRO|BEZERRA|NOVILHA)\s+(\d+[A-Z0-9-]*)\b/);
  if (animalWithNumber?.[1]) return animalWithNumber[1];

  return undefined;
}

export function normalizeRanchoText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAnswer(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}

export function formatStockUnit(quantity: unknown, unit: string | null | undefined) {
  const normalized = normalizeRanchoText(String(unit || "")).trim();
  const amount = Number(quantity);
  const plural = Number.isFinite(amount) && Math.abs(amount) !== 1;
  const singularByUnit: Record<string, string> = {
    saco: "saco",
    sacos: "saco",
    dose: "dose",
    doses: "dose",
    fardo: "fardo",
    fardos: "fardo",
    unidade: "unidade",
    unidades: "unidade",
    litro: "litro",
    litros: "litro",
    l: "litro",
    kg: "kg",
    quilo: "kg",
    quilos: "kg",
    g: "g",
    grama: "g",
    gramas: "g",
    caixa: "caixa",
    caixas: "caixa"
  };
  const pluralByUnit: Record<string, string> = {
    saco: "sacos",
    dose: "doses",
    fardo: "fardos",
    unidade: "unidades",
    litro: "litros",
    caixa: "caixas",
    kg: "kg",
    g: "g"
  };
  const singular = singularByUnit[normalized] || normalized || "";
  return plural ? (pluralByUnit[singular] || singular) : singular;
}

function formatStockQuantity(quantity: unknown, unit: string | null | undefined, fallback = "?") {
  if (!hasValue(quantity)) return fallback;
  return `${formatBotNumber(quantity)} ${formatStockUnit(quantity, unit)}`.trim();
}

function formatBotNumber(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value || "");
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(numeric);
}

function normalizeBotPhone(value: string | number | null | undefined) {
  return normalizeWhatsappNumber(value);
}

function isValidBotPhone(value: string | number | null | undefined) {
  const phone = normalizeBotPhone(value);
  if (phone.length !== 13 || !phone.startsWith("55")) return false;
  const national = phone.slice(2);
  const ddd = Number(national.slice(0, 2));
  return ddd >= 11 && ddd <= 99 && national[2] === "9" && !/^(\d)\1+$/.test(national);
}

function extractWhatsappPhone(original: string) {
  const matches = original.match(/(?:whatsapp:)?\+?\d[\d\s().-]{8,}\d/gi) || [];
  const phones = matches
    .map((match) => normalizeBotPhone(match))
    .filter((phone) => phone.length >= 12);

  return phones.find(isValidBotPhone) || phones[0];
}

function removeWhatsappPhone(original: string) {
  return original
    .replace(/(?:whatsapp:)?\+?\d[\d\s().-]{8,}\d/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSingleDecimalSeparator(value: string, separator: "." | ",") {
  const parts = value.split(separator);
  if (parts.length === 1) return value;

  const last = parts[parts.length - 1];
  const first = parts[0];
  const allThousandsGroups = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);

  if (parts.length === 2 && last.length === 3 && first !== "0") return `${first}${last}`;
  if (parts.length > 2 && allThousandsGroups) return parts.join("");

  return `${parts.slice(0, -1).join("")}.${last}`;
}

export function parseDecimalNumber(input: string | number | null | undefined) {
  if (input === undefined || input === null || input === "") return undefined;

  const raw = String(input).replace(/\s+/g, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(raw)) return undefined;

  const sign = raw.startsWith("-") ? -1 : 1;
  const value = raw.replace(/^-/, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  let normalized = value;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = value
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = normalizeSingleDecimalSeparator(value, ",");
  } else if (lastDot >= 0) {
    normalized = normalizeSingleDecimalSeparator(value, ".");
  }

  const parsed = Number(normalized) * sign;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumber(value: string | undefined) {
  return parseDecimalNumber(value);
}

function parseNumberWordSequence(words: string[], start: number) {
  let total = 0;
  let current = 0;
  let used = 0;

  for (let index = start; index < words.length; index += 1) {
    const word = words[index];
    if (word === "e") {
      used += 1;
      continue;
    }

    if (word === "mil") {
      total += (current || 1) * 1000;
      current = 0;
      used += 1;
      continue;
    }

    const value = numberWords[word];
    if (value === undefined) break;

    current += value;
    used += 1;
  }

  if (!used) return null;
  return { value: total + current, used };
}

function numberMatches(text: string) {
  const matches: Array<{ raw: string; value: number; index: number }> = [];
  const digitPattern = new RegExp(`\\b${decimalNumberPattern}\\b`, "g");
  let digitMatch = digitPattern.exec(text);

  while (digitMatch) {
    const value = toNumber(digitMatch[0]);
    const index = digitMatch.index || 0;
    const before = text[index - 1] || "";
    const after = text[index + digitMatch[0].length] || "";
    const isCodePart = /[a-z-]/i.test(before) || /[a-z-]/i.test(after);
    if (value !== undefined && !isCodePart) matches.push({ raw: digitMatch[0], value, index });
    digitMatch = digitPattern.exec(text);
  }

  const words = text.split(/\s+/).filter(Boolean);
  let searchFrom = 0;
  for (let index = 0; index < words.length; index += 1) {
    const parsed = parseNumberWordSequence(words, index);
    if (!parsed) continue;

    const raw = words.slice(index, index + parsed.used).join(" ");
    const rawIndex = text.indexOf(raw, searchFrom);
    matches.push({ raw, value: parsed.value, index: rawIndex >= 0 ? rawIndex : index });
    searchFrom = rawIndex >= 0 ? rawIndex + raw.length : searchFrom;
    index += parsed.used - 1;
  }

  return matches.sort((left, right) => left.index - right.index);
}

function firstNumber(text: string) {
  return numberMatches(text)[0]?.value;
}

function lastNumber(text: string) {
  const numbers = numberMatches(text);
  return numbers[numbers.length - 1]?.value;
}

function extractTurno(text: string) {
  if (/\bmanha\b/.test(text)) return "manha";
  if (/\btarde\b/.test(text)) return "tarde";
  if (/\bnoite\b/.test(text)) return "noite";
  return undefined;
}

function extractDateReference(text: string) {
  if (/\bontem\b/.test(text)) return "ontem";
  if (/\bamanha\b/.test(text)) return "amanha";
  if (/\bhoje\b/.test(text)) return "hoje";
  if (/\bmes\b|\bmensal\b|\bdo mes\b/.test(text)) return "mes";
  return undefined;
}

function extractPointTime(text: string) {
  const match = text.match(/\b(?:as|às|a)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|horas)?\b/);
  if (!match?.[1]) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return undefined;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function candidateFromMatch(value?: string | null) {
  if (!value) return undefined;
  const code = normalizeAnimalCandidate(value);
  if (code) return code;

  const cleaned = normalizeRanchoText(value)
    .replace(new RegExp(`\\b${animalWords}\\b`, "g"), "")
    .replace(/\b(?:da|do|de|na|no|a|o|uma|um|para|pra|producao|ordenha)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || isForbiddenAnimalCode(cleaned)) return undefined;
  return cleaned;
}

function extractAnimalCode(text: string, intent?: RanchoIntent) {
  const standalone = normalizeAnimalCandidate(text);
  if (standalone && !/\s/.test(text.trim())) return standalone;

  const explicitPatterns = [
    /\b(?:vaca|animal|gado|boi|touro|bezerro|bezerra|novilha|brinco)\s+(?:da|do|de|a|o)?\s*([a-z]*\d[a-z0-9-]*|[a-z]+-[a-z0-9]+)\b/g,
    /\b(?:da|do|de|na|no|em|a|o)\s+([a-z]+-\d[a-z0-9-]*|[a-z]*\d[a-z0-9-]*)\b/g,
    /\b([a-z]+-\d[a-z0-9-]*|[a-z]+\d[a-z0-9-]*)\b/g
  ];

  for (const pattern of explicitPatterns) {
    let match = pattern.exec(text);
    while (match) {
      const raw = match[1];
      const index = match.index + match[0].lastIndexOf(raw);
      const candidate = normalizeAnimalCandidate(raw);
      if (candidate && !numberHasUnitOrMoneyContext(text, index, raw)) return candidate;
      match = pattern.exec(text);
    }
  }

  const direct = text.match(new RegExp(`\\b${animalWords}\\s+(?:da|do|de|a|o)?\\s*([a-z0-9][a-z0-9-]*)\\b`));
  const directCandidate = candidateFromMatch(direct?.[1]);
  if (directCandidate) return normalizeAnimalCandidate(directCandidate) || directCandidate.toUpperCase();

  const productionNamed = text.match(/\b(?:producao|ordenha)\s+(?:da|do|de)?\s*([a-z0-9][a-z0-9-]*)\b/);
  const productionCandidate = candidateFromMatch(productionNamed?.[1]);
  if (productionCandidate) return normalizeAnimalCandidate(productionCandidate) || productionCandidate.toUpperCase();

  const beforeVerb = text.match(/^(.+?)\s+(?:deu|produziu|fez|pariu|tomou|morreu)\b/);
  const beforeVerbCandidate = candidateFromMatch(beforeVerb?.[1]);
  if (beforeVerbCandidate && !/^(registra|registrar|lanca|lancar|anota|anotar)$/.test(beforeVerbCandidate)) {
    return normalizeAnimalCandidate(beforeVerbCandidate) || beforeVerbCandidate.toUpperCase();
  }

  const beforeLiters = text.match(new RegExp(`^([a-z][a-z0-9-]*)\\s+${decimalNumberPattern}\\s*(?:l|lt|lts|litro|litros)?\\b`));
  if (beforeLiters?.[1] && intent === "PRODUCAO_LEITE") return normalizeAnimalCandidate(beforeLiters[1]) || beforeLiters[1].toUpperCase();

  const numbers = numberMatches(text);
  if (intent === "PRODUCAO_LEITE" && numbers.length >= 2 && !numberHasUnitOrMoneyContext(text, numbers[0].index, numbers[0].raw)) return numbers[0].raw.toUpperCase();

  return undefined;
}

function extractLiters(text: string) {
  const withUnit = text.match(new RegExp(`\\b(${decimalNumberPattern})\\s*(?:l|lt|lts|litro|litros)\\b`));
  if (withUnit?.[1]) return toNumber(withUnit[1]);

  const afterProductionVerb = text.match(new RegExp(`\\b(?:deu|produziu|fez|ordenhou|tirei|tirou)\\s+(${decimalNumberPattern})\\b`));
  if (afterProductionVerb?.[1]) return toNumber(afterProductionVerb[1]);

  return undefined;
}

function extractMoneyValue(text: string) {
  return lastNumber(text);
}

function removeValueAndCommonWords(value: string) {
  return cleanAnswer(value)
    .replace(new RegExp(`r\\$\\s*${decimalNumberPattern}`, "gi"), "")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)?\\b`, "gi"), "")
    .replace(/\b(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|reais|real)\b/gi, "")
    .replace(/^\s*(?:por|de|do|da|com|no|na|o|a|um|uma|pra|para)\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFinanceDescription(original: string, normalized: string, tipo: "DESPESA" | "RECEITA_VENDA") {
  const sale = original.match(/\b(?:vendi|vendeu|venda)\s+(?:uma|um|o|a)?\s*(.+?)(?:\s+por|\s+de\s+r\$?|\s+\d|$)/i)?.[1];
  if (tipo === "RECEITA_VENDA" && sale) {
    const item = removeValueAndCommonWords(sale);
    if (item) return `venda de ${item}`;
  }

  const purchase = original.match(/\b(?:comprei|compra|paguei|gastei|despesa)\s+(?:com|de|do|da|o|a)?\s*(.+?)(?:\s+por|\s+de\s+r\$?|\s+\d|$)/i)?.[1];
  if (tipo === "DESPESA" && purchase) {
    const item = removeValueAndCommonWords(purchase);
    if (item) return item;
  }

  const cleanedOriginal = removeValueAndCommonWords(original.replace(/\b(?:gastei|despesa|paguei|comprei|recebi|vendi|venda|receita|entrada|saida)\b/gi, ""));
  if (cleanedOriginal) return cleanedOriginal;

  const cleanedNormalized = removeValueAndCommonWords(normalized.replace(/\b(?:gastei|despesa|paguei|comprei|recebi|vendi|venda|receita|entrada|saida)\b/g, ""));
  if (cleanedNormalized) return cleanedNormalized;

  return tipo === "RECEITA_VENDA" ? "receita via WhatsApp" : undefined;
}

function stripAnimalReferences(value: string) {
  return value
    .replace(new RegExp(`\\b${animalWords}\\s+(?:da|do|de|a|o)?\\s*[a-z0-9][a-z0-9-]*\\b`, "gi"), "")
    .replace(/\b(?:na|no|em|a|o|da|do|de)\s+[a-z]+-\d[a-z0-9-]*\b/gi, "")
    .replace(/\b(?:na|no|em|a|o|da|do|de)\s+[a-z]*\d[a-z0-9-]*\b/gi, "")
    .replace(/\b(?:os|as|nos|nas|aos|pros|pras|para os|para as)?\s*(?:bois|vacas|gado|bezerros|bezerra|bezerro|novilhas)\b/gi, "")
    .replace(/\b(?:hoje|ontem|amanha|amanhã)\b/gi, "")
    .replace(/\b(?:recebeu|tomou|vacinei|apliquei|aplicado|aplicou|mediquei|medicou|tratei|tratou|tratar|manejo|com)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMedicineProduct(value: string | undefined) {
  const cleaned = stripAnimalReferences(value || "")
    .replace(/^(?:(?:vacina|medicamento|rem[eé]dio|tratamento|manejo)\s+)+/i, "")
    .replace(/^(?:(?:da|de|do|contra|pra|para)\s+)+/i, "")
    .replace(/\s+(?:da|de|do|contra|pra|para|na|no|em|a|o)$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || undefined;
}

function extractProduct(original: string, normalized: string) {
  const knownProduct = normalized.match(/\b(?:aftosa|brucelose|terramicina|remedio|medicamento)\b/)?.[0];
  const afterCom = original.match(/\bcom\s+(.+)$/i)?.[1];
  const afterAction = original.match(/\b(?:vacina|vacinei|apliquei|aplicou|tomou|mediquei|medicou|tratei|tratou)\s+(.+)$/i)?.[1];
  const product = cleanMedicineProduct(afterCom || afterAction || original);
  const generic = normalizeRanchoText(product || "");

  if (product && !["vacina", "tomou", "tratei", "tratamento", "manejo", "bois", "gado"].includes(generic)) return product;
  if (knownProduct) return knownProduct;

  const fallback = cleanMedicineProduct(normalized);
  return fallback && !["vacina", "tomou", "tratei", "tratamento", "manejo", "bois", "gado"].includes(fallback) ? fallback : undefined;
}

function extractStockItem(original: string) {
  const called = original.match(/\b(?:chamado|chamada|nomeado|nomeada)\s+(.+?)(?:\s+no estoque|\s+na estoque|\s+para estoque|$)/i)?.[1];
  if (called) return cleanAnswer(called);

  const stockQueryItem = original.match(/\b(?:me\s+mostre\s+o\s+estoque\s+de|mostre\s+o\s+estoque\s+de|mostrar\s+estoque\s+de|ver\s+estoque\s+de|estoque\s+de|quanto\s+tem\s+de)\s+(.+)$/i)?.[1];
  if (stockQueryItem) return cleanAnswer(stockQueryItem);

  const quantityItem = original.match(new RegExp(`\\b${decimalNumberPattern}\\s*${stockUnitWords}\\s+(?:de|do|da)?\\s+(.+?)(?:\\s+(?:no|na|do|da)\\s+estoque\\b|\\s+(?:ao|aos|para|pra|pro|pros|pras|por)\\b|$)`, "i"))?.[1];
  if (quantityItem) return cleanAnswer(quantityItem);

  const purchaseQuantityItem = original.match(/\b(?:comprei|compramos|comprar|compra)\s+\d+(?:[,.]\d+)?\s*(?:de|do|da)?\s+(.+?)(?:\s+por|\s+de\s+r\$?|\s+r\$|\s+\d+(?:[,.]\d+)?\s*(?:reais|real)\b|$)/i)?.[1];
  if (purchaseQuantityItem) return cleanAnswer(purchaseQuantityItem);

  const cleaned = cleanAnswer(original)
    .replace(/\bpor\b.*$/gi, " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*${stockUnitWords}\\b`, "gi"), " ")
    .replace(new RegExp(`r\\$\\s*${decimalNumberPattern}`, "gi"), " ")
    .replace(new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)\\b`, "gi"), " ")
    .replace(new RegExp(`\\b(?:por)\\s+${decimalNumberPattern}(?:\\s*(?:reais|real))?\\b`, "gi"), " ")
    .replace(/\b(?:no|na|do|da)\s+estoque\b/gi, " ")
    .replace(/\b(?:pros?|pras?|para os|para as|aos?|às?)\s+(?:bois|vacas|bezerros|gado|animais)\b/gi, " ")
    .replace(/\b(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|item|registrar|consultar|consulta|ver|quanto|saldo|tem|baixo|minimo|mínimo|critico|crítico|me|mostre|mostrar|comprei|compramos|comprar|compra|paguei|adiciona|adicionar|adicionei|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|recebemos|estoque|baixa|baixar|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|saiu|dei|deu|sacos|saco|kg|quilo|quilos|grama|gramas|litro|litros|unidade|unidades|caixa|caixas|dose|doses|fardo|fardos)\b/gi, " ")
    .replace(/^(?:de|do|da|com|no|na|o|a|um|uma|pra|para)\s+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function extractStockUnit(text: string) {
  const quantityUnit = normalizeRanchoText(text).match(stockUnitAfterQuantityPattern)?.[2];
  if (quantityUnit) return extractStockUnit(quantityUnit);
  if (/\bsacos?\b/.test(text)) return "saco";
  if (/\bkg\b|\bquilos?\b/.test(text)) return "kg";
  if (/\bgramas?\b|\bg\b/.test(text)) return "g";
  if (/\blitros?\b|\bl\b/.test(text)) return "L";
  if (/\bcaixas?\b/.test(text)) return "caixa";
  if (/\bdoses?\b/.test(text)) return "dose";
  if (/\bfardos?\b/.test(text)) return "fardo";
  if (/\bunidades?\b/.test(text)) return "unidade";
  return undefined;
}

function hasPhysicalQuantity(text: string) {
  return stockUnitAfterQuantityPattern.test(normalizeRanchoText(text));
}

function hasLooseStockQuantity(text: string) {
  return new RegExp(`\\b${decimalNumberPattern}\\s*(?:saco|sacos|kg|quilo|quilos|grama|gramas|g|litro|litros|l|caixa|caixas|dose|doses|fardo|fardos|unidade|unidades)\\b`).test(normalizeRanchoText(text));
}

function hasExplicitMoney(text: string) {
  const normalized = normalizeRanchoText(text);
  return new RegExp(`r\\$\\s*${decimalNumberPattern}`, "i").test(text)
    || new RegExp(`\\b${decimalNumberPattern}\\s*(?:reais|real)\\b`).test(normalized)
    || new RegExp(`\\bpor\\s+${decimalNumberPattern}(?:\\s*(?:reais|real))?\\b`).test(normalized);
}

function isPurchaseText(text: string) {
  return /\b(?:comprei|compramos|comprar|compra)\b/.test(normalizeRanchoText(text));
}

function numberHasUnitOrMoneyContext(text: string, index: number, raw: string) {
  const before = text.slice(Math.max(0, index - 8), index);
  const after = text.slice(index + raw.length, index + raw.length + 18);
  const unitAfter = new RegExp(`^\\s*${stockUnitWords}\\b`).test(after);
  const moneyAfter = /^\s*(?:reais|real)\b/.test(after);
  const moneyBefore = /r\$\s*$/.test(before);
  return unitAfter || moneyAfter || moneyBefore;
}

function extractStockQuantity(original: string) {
  const normalized = normalizeRanchoText(original);
  const quantityWithUnit = normalized.match(stockUnitAfterQuantityPattern);
  if (quantityWithUnit?.[1]) return toNumber(quantityWithUnit[1]);

  const numbers = numberMatches(normalized);
  const unitPattern = new RegExp(`^\\s*${stockUnitWords}\\b`);

  const withUnit = numbers.find((match) => unitPattern.test(normalized.slice(match.index + match.raw.length)));
  if (withUnit) return withUnit.value;

  const generic = numbers.find((match) => {
    const tail = normalized.slice(match.index + match.raw.length);
    const articleBeforeItem = /^(?:1|um|uma)$/.test(match.raw) && /^\s*item\b/.test(tail);
    return !articleBeforeItem && !numberHasUnitOrMoneyContext(normalized, match.index, match.raw);
  });

  return generic?.value;
}

function extractStockDestination(original: string) {
  const match = original.match(/\b(?:pros?|pras?|para os|para as|aos?|às?)\s+(bois|vacas|bezerros|gado|animais)\b/i);
  return match?.[1] ? cleanAnswer(match[1]) : undefined;
}

function extractEmployeeName(original: string, normalized: string) {
  const afterEmployee = original.match(/\b(?:funcionario|funcionário|colaborador)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+as|\s+às|\s+\d|$)/i)?.[1];
  if (afterEmployee) return cleanAnswer(afterEmployee);

  const afterConnector = original.match(/\b(?:do|da|de)\s+([a-zA-ZÀ-ÿ\s]+?)(?:\s+as|\s+às|\s+\d|$)/i)?.[1];
  if (afterConnector) return cleanAnswer(afterConnector);

  const beforeVerb = normalized.match(/^([a-z][a-z\s]+?)\s+(?:entrou|saiu|bateu|registrou)\b/)?.[1];
  if (beforeVerb) return cleanAnswer(beforeVerb);

  return undefined;
}

function extractEmployeeRole(normalized: string) {
  const role = normalized.match(/\b(?:vaqueiro|ordenhador|tratador|tratadora|gerente|funcionario|colaborador)\b/)?.[0];
  if (!role || ["funcionario", "colaborador"].includes(role)) return undefined;
  return role;
}

function extractEmployeeCreationName(original: string) {
  const withoutPhone = removeWhatsappPhone(original)
    .replace(/\b(?:whatsapp|telefone|zap|celular)\b\s*:?\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const afterAction = withoutPhone.match(/\b(?:cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar)\s+(?:funcion[aá]rio|colaborador|vaqueiro|ordenhador|tratador|tratadora|gerente)?\s*([a-zA-ZÀ-ÿ\s]+?)\s*$/i)?.[1];
  const cleaned = cleanAnswer(afterAction || "")
    .replace(/\b(?:com|de|do|da|no|na|para|pra|zap|whatsapp|telefone|celular)\b.*$/i, "")
    .replace(/\b(?:funcion[aá]rio|colaborador|vaqueiro|ordenhador|tratador|tratadora|gerente)\b/gi, "")
    .trim();

  return cleaned || undefined;
}

function extractPointType(text: string) {
  if (/\b(?:saida|saiu|sair|encerrou)\b/.test(text)) return "saida";
  if (/\b(?:entrada|entrou|entrar|chegou|bate ponto|ponto)\b/.test(text)) return "entrada";
  return undefined;
}

function extractAnimalCategory(text: string) {
  const category = Array.from(animalCategories).find((item) => new RegExp(`\\b${item}\\b`).test(text));
  if (!category || category === "animal" || category === "gado") return undefined;
  if (category === "bezerra") return "bezerro";
  return category;
}

function extractAnimalLocal(text: string) {
  const location = text.match(/\b(?:do|da|no|na|em)\s+(fundo|curral|pasto|piquete)\b/)?.[1];
  return location;
}

function extractAnimalBirthTag(text: string) {
  const direct = text.match(/\b(?:brinco|numero|número)\s+([a-z0-9-]+)\b/)?.[1];
  if (direct) return direct.toUpperCase();
  return extractAnimalCode(text, "CADASTRO_ANIMAL");
}

function extractServiceLocal(original: string) {
  const match = original.match(/\b(?:no|na|do|da)\s+(.+)$/i);
  return cleanAnswer(match?.[1] || "");
}

function missingQuestions(fields: string[], tipo: RanchoIntent, dados: AnyRecord) {
  return fields.map((field) => {
    if (field === "animal_codigo" && dados.animal_referencia_nao_encontrada) {
      if (Array.isArray(dados.animal_opcoes) && dados.animal_opcoes.length) {
        return `Encontrei mais de um animal parecido com ${dados.animal_referencia_nao_encontrada}. Qual é o brinco correto? ${dados.animal_opcoes.slice(0, 5).join(", ")}`;
      }
      return `Não encontrei um animal cadastrado como ${dados.animal_referencia_nao_encontrada}. Qual é o brinco ou código do animal?`;
    }
    if (field === "unidade" && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) {
      return "Qual unidade padrão? Exemplos: kg, saco, unidade, dose, fardo.";
    }
    if (field === "quantidade" && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) {
      return "Qual quantidade inicial? Se não tiver, responda 0.";
    }
    if (field === "quantidade" && ["ESTOQUE_CADASTRO", "ESTOQUE_ENTRADA"].includes(tipo) && dados.item_nome) {
      return `Qual quantidade de ${dados.item_nome} entrou no estoque?`;
    }
    if (field === "valor" && tipo === "ESTOQUE_ENTRADA" && dados.compra) {
      return "Quanto custou essa compra?";
    }
    if (field === "quantidade" && tipo === "ESTOQUE_SAIDA" && dados.item_nome) {
      return `Qual quantidade de ${dados.item_nome} saiu do estoque?`;
    }
    if (field === "telefone" && tipo === "CRIAR_FUNCIONARIO" && dados.funcionario_nome) {
      return `Qual é o WhatsApp do funcionário ${dados.funcionario_nome}? Envie com DDD.`;
    }
    return questionByField[field];
  }).filter(Boolean);
}

function moneyText(value: unknown) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

function buildResumo(tipo: RanchoIntent, dados: AnyRecord) {
  if (tipo === "PRODUCAO_LEITE") {
    return `registrar produção de leite${dados.animal_codigo ? ` do animal ${dados.animal_codigo}` : ""}${hasValue(dados.litros) ? ` com ${formatBotNumber(dados.litros)} litros` : ""}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;
  }

  if (tipo === "PARTO") return `registrar parto${dados.animal_codigo ? ` do animal ${dados.animal_codigo}` : ""}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;

  if (tipo === "VACINA_MEDICAMENTO") {
    const evento = dados.evento_tipo === "vacina" ? "vacina" : "tratamento";
    const produto = dados.produto ? `${evento === "vacina" ? " de" : " com"} ${dados.produto}` : "";
    return `registrar ${evento}${produto}${dados.animal_codigo ? ` no animal ${dados.animal_codigo}` : ""}`;
  }

  if (tipo === "MORTE") return `registrar morte do animal ${dados.animal_codigo || "informado"}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;

  if (tipo === "DESPESA") return `registrar saída financeira${dados.valor ? ` de ${moneyText(dados.valor)}` : ""}${dados.descricao ? ` (${dados.descricao})` : ""}`;

  if (tipo === "RECEITA_VENDA") return `registrar entrada financeira${dados.valor ? ` de ${moneyText(dados.valor)}` : ""}${dados.descricao ? ` (${dados.descricao})` : ""}`;

  if (["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) return `criar novo item de estoque${dados.item_nome ? ` chamado ${dados.item_nome}` : ""}${dados.unidade ? `, unidade ${dados.unidade}` : ""}${hasValue(dados.quantidade) ? `, quantidade inicial ${formatBotNumber(dados.quantidade)}` : ""}`;

  if (tipo === "ESTOQUE_ENTRADA" && dados.compra && hasValue(dados.valor)) {
    return `adicionar ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} ao estoque e registrar despesa de ${moneyText(dados.valor)}${dados.item_nome ? ` com ${dados.item_nome}` : ""}`;
  }

  if (tipo === "ESTOQUE_ENTRADA") return `adicionar ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} ao estoque`;

  if (tipo === "ESTOQUE_SAIDA") return `dar baixa de ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} no estoque`;

  if (tipo === "PONTO_FUNCIONARIO") return `registrar ${dados.ponto_tipo || "ponto"} de ${dados.funcionario_nome || "funcionário"}${dados.horario ? ` às ${dados.horario}` : ""}`;

  if (tipo === "CRIAR_FUNCIONARIO") return `cadastrar funcionário${dados.funcionario_nome ? ` ${dados.funcionario_nome}` : ""}${dados.telefone ? ` com WhatsApp ${dados.telefone}` : ""}`;

  if (tipo === "CADASTRO_ANIMAL") return `cadastrar ${dados.categoria || "animal"}${dados.animal_codigo ? ` com brinco ${dados.animal_codigo}` : ""}`;

  if (tipo === "CONSULTA_PRODUCAO") return "consultar produção de leite";
  if (tipo === "CONSULTA_FINANCEIRO") return "consultar financeiro";
  if (tipo === "CONSULTA_ESTOQUE") return dados.item_nome ? `consultar estoque de ${dados.item_nome}` : "consultar estoque";
  if (tipo === "CONSULTA_FUNCIONARIO") return dados.funcionario_nome ? `consultar funcionário ${dados.funcionario_nome}` : "consultar funcionários";
  if (tipo === "ORDEM_SERVICO") return `registrar ordem de serviço: ${dados.descricao || "serviço informado"}`;
  if (tipo === "AJUDA") return "mostrar ajuda do bot";

  return `Não consegui entender certinho. Você pode tentar assim:\n${BOT_EXAMPLES.join("\n")}`;
}

function finalize(tipo: RanchoIntent, dados: AnyRecord, missingFields: string[], confidence?: number): ParsedRanchoMessage {
  if (tipo === "DESCONHECIDO") {
    return {
      tipo,
      confianca: 0.2,
      dados: {},
      resumo: buildResumo(tipo, {}),
      perguntas_faltantes: []
    };
  }

  const complete = missingFields.length === 0;
  return {
    tipo,
    confianca: confidence ?? (complete ? 0.9 : 0.65),
    dados,
    resumo: buildResumo(tipo, dados),
    perguntas_faltantes: missingQuestions(missingFields, tipo, dados)
  };
}

function buildMissing(tipo: RanchoIntent, dados: AnyRecord) {
  const missing: string[] = [];
  const stockCreateIntent = ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo);
  const stockMovementIntent = ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(tipo);
  if (["PRODUCAO_LEITE", "PARTO", "MORTE"].includes(tipo) && !dados.animal_codigo) missing.push("animal_codigo");
  if (tipo === "PRODUCAO_LEITE" && !hasValue(dados.litros)) missing.push("litros");
  if (tipo === "VACINA_MEDICAMENTO" && !dados.produto) missing.push("produto");
  if (tipo === "VACINA_MEDICAMENTO" && !dados.animal_codigo) missing.push("animal_codigo");
  if (["DESPESA", "RECEITA_VENDA"].includes(tipo) && !hasValue(dados.valor)) missing.push("valor");
  if (["DESPESA", "RECEITA_VENDA"].includes(tipo) && !dados.descricao) missing.push("descricao");
  if ((stockCreateIntent || stockMovementIntent) && !dados.item_nome) missing.push("item_nome");
  if (stockCreateIntent && !dados.unidade) missing.push("unidade");
  if (stockCreateIntent && !hasValue(dados.quantidade)) missing.push("quantidade");
  if (stockMovementIntent && !hasValue(dados.quantidade)) missing.push("quantidade");
  if (stockMovementIntent && !dados.unidade) missing.push("unidade");
  if (tipo === "ESTOQUE_ENTRADA" && dados.compra && !hasValue(dados.valor)) missing.push("valor");
  if (tipo === "CRIAR_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "CRIAR_FUNCIONARIO" && !isValidBotPhone(dados.telefone)) missing.push("telefone");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.ponto_tipo) missing.push("ponto_tipo");
  if (tipo === "CADASTRO_ANIMAL" && !dados.animal_codigo) missing.push("animal_codigo");
  if (tipo === "CADASTRO_ANIMAL" && !dados.categoria) missing.push("categoria_animal");
  return missing;
}

export function refreshRanchoMessage(parsed: ParsedRanchoMessage, dados: AnyRecord = parsed.dados): ParsedRanchoMessage {
  return finalize(parsed.tipo, dados, buildMissing(parsed.tipo, dados), parsed.confianca);
}

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  const original = cleanAnswer(text);
  const normalized = normalizeRanchoText(original);
  if (!normalized) return finalize("DESCONHECIDO", {}, []);

  const isHelp = /\b(?:ajuda|suporte|exemplos|como usar|o que voce faz|o que você faz)\b/.test(normalized);
  if (isHelp) return finalize("AJUDA", {}, [], 0.95);

  const isProductionQuery = /\b(?:quanto|total|media|média|consulta|consultar|ver)\b/.test(normalized) && /\b(?:produziu|producao|produção|leite|ordenha)\b/.test(normalized);
  if (isProductionQuery) return finalize("CONSULTA_PRODUCAO", { data_referencia: extractDateReference(normalized) || "hoje" }, [], 0.9);

  const isFinanceQuery = /\b(?:como ta|como está|saldo|resultado|financeiro|caixa|entradas|saidas|saídas|lucro)\b/.test(normalized) && /\b(?:financeiro|mes|mês|caixa|entradas|saidas|saídas|lucro)\b/.test(normalized);
  if (isFinanceQuery) return finalize("CONSULTA_FINANCEIRO", { data_referencia: extractDateReference(normalized) || "mes" }, [], 0.9);

  const isEmployeeCreate = /\b(?:cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar)\b/.test(normalized)
    && /\b(?:funcionario|funcionário|colaborador|vaqueiro|ordenhador|tratador|tratadora|gerente)\b/.test(normalized);
  if (isEmployeeCreate) {
    const phone = extractWhatsappPhone(original);
    const dados = {
      funcionario_nome: extractEmployeeCreationName(original),
      telefone: phone,
      funcao: extractEmployeeRole(normalized)
    };
    return finalize("CRIAR_FUNCIONARIO", dados, buildMissing("CRIAR_FUNCIONARIO", dados), 0.88);
  }

  const stockQuantity = extractStockQuantity(original);
  const physicalQuantity = hasPhysicalQuantity(original) || hasLooseStockQuantity(original);
  const explicitMoney = hasExplicitMoney(original);
  const isPurchase = isPurchaseText(original);
  const stockItemName = extractStockItem(original);
  const hasPurchaseQuantity = isPurchase && hasValue(stockQuantity) && Boolean(stockItemName);
  const hasStockVocabulary = stockItemHintPattern.test(normalized) || /\bestoque\b/.test(normalized);
  const hasStockItemHint = Boolean(stockItemName) && hasStockVocabulary;

  const hasStockCreate = /\b(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|registrar)\b/.test(normalized)
    && /\b(?:item|estoque|racao|ração|medicamento|remedio|remédio|insumo)\b/.test(normalized);
  if (hasStockCreate) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized)
    };
    return finalize("CRIAR_ITEM_ESTOQUE", dados, buildMissing("CRIAR_ITEM_ESTOQUE", dados), 0.86);
  }

  const hasStockAction = /\b(?:comprei|compramos|comprar|compra|paguei|adiciona|adicionar|adicionei|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|recebemos|repor|reposicao|reposição|baixa|baixar|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|dei|deu para|saiu|saida|saída|consumi|consumiu|descartei)\b/.test(normalized);
  const isStockQuery = !hasStockAction && /\b(?:consultar|ver|quanto|saldo|tem|estoque)\b/.test(normalized) && /\b(?:estoque|racao|ração|medicamento|insumo|sacos?)\b/.test(normalized);
  if (isStockQuery) return finalize("CONSULTA_ESTOQUE", { item_nome: stockItemName }, [], 0.85);

  const isEmployeeQuery = /\b(?:consultar|ver|funcionario|funcionário|equipe|colaborador)\b/.test(normalized) && !/\b(?:entrou|saiu|ponto|entrada|saida|saída)\b/.test(normalized);
  if (isEmployeeQuery) return finalize("CONSULTA_FUNCIONARIO", { funcionario_nome: extractEmployeeName(original, normalized) }, [], 0.8);

  const hasFinanceOperation = /\b(?:venda|vendi|recebi|receita|despesa|paguei|financeiro|caixa|lucro)\b/.test(normalized);
  const isPoint = /\b(?:ponto|entrou|entrada|saiu|saida|saída|bateu|bater ponto|registrar ponto)\b/.test(normalized)
    && !physicalQuantity
    && !hasFinanceOperation;
  if (isPoint) {
    const dados = {
      funcionario_nome: extractEmployeeName(original, normalized),
      ponto_tipo: extractPointType(normalized),
      horario: extractPointTime(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados));
  }

  const stockOutVerb = /\b(?:baixa|baixar|dar baixa|da baixa|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|dei|deu para|saiu|saida|saída|consumi|consumiu|descartei)\b/.test(normalized);
  const isStockOut = (physicalQuantity || hasStockItemHint) && stockOutVerb;
  if (isStockOut) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized),
      destino: extractStockDestination(original)
    };
    return finalize("ESTOQUE_SAIDA", dados, buildMissing("ESTOQUE_SAIDA", dados));
  }

  const stockInVerb = /\b(?:comprei|compramos|comprar|compra|adiciona|adicionar|adicionei|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|recebemos|repor|reposicao|reposição)\b/.test(normalized);
  const paidPhysicalStock = physicalQuantity && /\bpaguei\b/.test(normalized);
  const isStockIn = ((physicalQuantity || hasStockItemHint) && stockInVerb)
    || paidPhysicalStock
    || (isPurchase && (hasStockItemHint || hasPurchaseQuantity));
  if (isStockIn) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized),
      valor: explicitMoney ? extractMoneyValue(normalized) : undefined,
      compra: isPurchase || undefined
    };
    return finalize("ESTOQUE_ENTRADA", dados, buildMissing("ESTOQUE_ENTRADA", dados));
  }

  const isExpense = /\b(?:gastei|despesa|paguei|comprei|custo|saida|saída|pagamento)\b/.test(normalized);
  const isRevenue = /\b(?:vendi|venda|recebi|receita|entrada|entrou|faturou)\b/.test(normalized);

  if (isRevenue && !isExpense) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "RECEITA_VENDA"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("RECEITA_VENDA", dados, buildMissing("RECEITA_VENDA", dados));
  }

  if (isExpense && (!physicalQuantity || explicitMoney)) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "DESPESA"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("DESPESA", dados, buildMissing("DESPESA", dados));
  }

  const isParto = /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra|deu cria)\b/.test(normalized);
  if (isParto) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PARTO"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("PARTO", dados, buildMissing("PARTO", dados));
  }

  const isMedicine = /\b(?:vacina|vacinei|apliquei|aplicou|aftosa|brucelose|mediquei|medicou|tratei|tratou|tratamento|manejo|remedio|remédio|medicamento|terramicina|tomou)\b/.test(normalized);
  if (isMedicine) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "VACINA_MEDICAMENTO"),
      produto: extractProduct(original, normalized),
      evento_tipo: /\b(?:vacina|vacinei|aftosa|brucelose)\b/.test(normalized) ? "vacina" : "tratamento"
    };
    return finalize("VACINA_MEDICAMENTO", dados, buildMissing("VACINA_MEDICAMENTO", dados));
  }

  const isDeath = /\b(?:morreu|morta|morto|obito|óbito)\b/.test(normalized);
  if (isDeath) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "MORTE"),
      data_referencia: extractDateReference(normalized),
      local: extractAnimalLocal(normalized)
    };
    return finalize("MORTE", dados, buildMissing("MORTE", dados));
  }

  const isAnimalCreation = /\b(?:cadastrar|cadastro|nasceu|novo|nova)\b/.test(normalized) && new RegExp(`\\b${animalWords}\\b`).test(normalized);
  if (isAnimalCreation) {
    const dados = {
      animal_codigo: extractAnimalBirthTag(normalized),
      categoria: extractAnimalCategory(normalized),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("CADASTRO_ANIMAL", dados, buildMissing("CADASTRO_ANIMAL", dados));
  }

  const isProduction = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|produção|tirei|deu|fez)\b/.test(normalized)
    && !/\b(?:baixa|cria|parto)\b/.test(normalized);
  if (isProduction) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PRODUCAO_LEITE"),
      litros: extractLiters(normalized),
      turno: extractTurno(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PRODUCAO_LEITE", dados, buildMissing("PRODUCAO_LEITE", dados));
  }

  const isService = /\b(?:cerca quebrada|arrumar|consertar|manutencao|manutenção|precisa|bebedouro|porteira|curral)\b/.test(normalized);
  if (isService) {
    const dados = {
      descricao: original,
      local: extractServiceLocal(original)
    };
    return finalize("ORDEM_SERVICO", dados, []);
  }

  return finalize("DESCONHECIDO", {}, []);
}

export function mergeRanchoMessageData(current: ParsedRanchoMessage, answer: string): ParsedRanchoMessage {
  const original = cleanAnswer(answer);
  const normalized = normalizeRanchoText(original);
  const parsedAnswer = parseRanchoMessage(answer);
  const dados = { ...current.dados };
  const expectedFields = buildMissing(current.tipo, dados);
  const expectedField = expectedFields[0];

  if (parsedAnswer.tipo === current.tipo) {
    Object.entries(parsedAnswer.dados).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (!expectedField || key === expectedField || dados[key] === undefined || dados[key] === null || dados[key] === "") {
        dados[key] = value;
      }
    });
  }

  if (expectedField) {
    const contextualNumber = firstNumber(normalized);
    const contextualQuantity = extractStockQuantity(original);
    const contextualPhone = extractWhatsappPhone(original);
    const contextualAnimal = expectedField === "animal_codigo" ? normalizeAnimalCandidate(original) || extractAnimalCode(normalized, current.tipo) : undefined;

    if (expectedField === "animal_codigo" && contextualAnimal) dados.animal_codigo = contextualAnimal;
    if (expectedField === "litros" && contextualNumber) dados.litros = contextualNumber;
    if (expectedField === "valor" && contextualNumber) dados.valor = contextualNumber;
    if (expectedField === "quantidade" && contextualQuantity !== undefined) dados.quantidade = contextualQuantity;
    if (expectedField === "unidade") dados.unidade = extractStockUnit(normalized) || original;
    if (expectedField === "produto" && original) dados.produto = original;
    if (expectedField === "item_nome" && original) dados.item_nome = extractStockItem(original) || original;
    if (expectedField === "descricao" && original) dados.descricao = original;
    if (expectedField === "funcionario_nome" && original) dados.funcionario_nome = extractEmployeeCreationName(original) || original;
    if (expectedField === "telefone" && contextualPhone) dados.telefone = contextualPhone;
    if (expectedField === "ponto_tipo") dados.ponto_tipo = extractPointType(normalized);
    if (expectedField === "categoria_animal") dados.categoria = extractAnimalCategory(normalized) || original.toLowerCase();
  }

  const animalIntent = ["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE", "CADASTRO_ANIMAL"].includes(current.tipo);
  const animalCode = animalIntent && expectedField && expectedField !== "animal_codigo"
    ? undefined
    : animalIntent ? extractAnimalCode(normalized, current.tipo) : undefined;
  const liters = extractLiters(normalized);
  const value = extractMoneyValue(normalized);
  const quantity = extractStockQuantity(original);
  const itemName = extractStockItem(original);
  const employeeName = extractEmployeeName(original, normalized);
  const employeeCreationName = extractEmployeeCreationName(original);
  const phone = extractWhatsappPhone(original);
  const pointType = extractPointType(normalized);
  const pointTime = extractPointTime(normalized);

  if (animalCode && (!dados.animal_codigo || expectedField === "animal_codigo")) dados.animal_codigo = animalCode;
  if (liters && current.tipo === "PRODUCAO_LEITE" && (!dados.litros || expectedField === "litros")) dados.litros = liters;
  if (value && ["DESPESA", "RECEITA_VENDA"].includes(current.tipo) && (!dados.valor || expectedField === "valor")) dados.valor = value;
  if (quantity !== undefined && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo) && (!hasValue(dados.quantidade) || expectedField === "quantidade")) dados.quantidade = quantity;
  if (itemName && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo) && (!dados.item_nome || expectedField === "item_nome")) dados.item_nome = itemName;
  if (employeeName && current.tipo === "PONTO_FUNCIONARIO" && (!dados.funcionario_nome || expectedField === "funcionario_nome")) dados.funcionario_nome = employeeName;
  if (employeeCreationName && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.funcionario_nome || expectedField === "funcionario_nome")) dados.funcionario_nome = employeeCreationName;
  if (phone && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.telefone || expectedField === "telefone")) dados.telefone = phone;
  if (pointType && current.tipo === "PONTO_FUNCIONARIO" && (!dados.ponto_tipo || expectedField === "ponto_tipo")) dados.ponto_tipo = pointType;
  if (pointTime && current.tipo === "PONTO_FUNCIONARIO" && !dados.horario) dados.horario = pointTime;

  if (!dados.turno) dados.turno = extractTurno(normalized);
  if (!dados.data_referencia) dados.data_referencia = extractDateReference(normalized);
  if (!dados.unidade && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo)) dados.unidade = extractStockUnit(normalized);
  if (!dados.produto && current.tipo === "VACINA_MEDICAMENTO") dados.produto = extractProduct(answer, normalized);
  if (!dados.descricao && ["DESPESA", "RECEITA_VENDA", "ORDEM_SERVICO"].includes(current.tipo)) dados.descricao = removeValueAndCommonWords(original) || original;
  if (!dados.categoria && current.tipo === "CADASTRO_ANIMAL") dados.categoria = extractAnimalCategory(normalized);

  const missing = buildMissing(current.tipo, dados);
  return finalize(current.tipo, dados, missing);
}
