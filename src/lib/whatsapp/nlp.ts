import type { AnyRecord } from "@/lib/types";

export type RanchoIntent =
  | "PRODUCAO_LEITE"
  | "PARTO"
  | "VACINA_MEDICAMENTO"
  | "MORTE"
  | "DESPESA"
  | "RECEITA_VENDA"
  | "ORDEM_SERVICO"
  | "DESCONHECIDO";

export type ParsedRanchoMessage = {
  tipo: RanchoIntent;
  confianca: number;
  dados: AnyRecord;
  resumo: string;
  perguntas_faltantes: string[];
};

const EXAMPLES = [
  "- vaca 12 pariu",
  "- vaca 15 deu 20 litros",
  "- apliquei aftosa na vaca 8",
  "- gastei 300 reais com ração"
];

const questionByField: Record<string, string> = {
  animal_codigo: "Qual foi o número do animal?",
  litros: "Quantos litros?",
  produto: "Qual vacina ou medicamento?",
  valor: "Qual foi o valor?",
  descricao: "Com o que foi o registro?"
};

export function normalizeRanchoText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAnswer(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function toNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberMatches(text: string) {
  const matches: Array<{ raw: string; value: number; index: number }> = [];
  const pattern = /\b\d+(?:[,.]\d+)?\b/g;
  let match = pattern.exec(text);

  while (match) {
    const value = toNumber(match[0]);
    if (value !== undefined) {
      matches.push({ raw: match[0], value, index: match.index || 0 });
    }
    match = pattern.exec(text);
  }

  return matches;
}

function extractTurno(text: string) {
  if (/\bmanha\b/.test(text)) return "manha";
  if (/\btarde\b/.test(text)) return "tarde";
  if (/\bnoite\b/.test(text)) return "noite";
  return undefined;
}

function extractDateReference(text: string) {
  if (/\bontem\b/.test(text)) return "ontem";
  if (/\bhoje\b/.test(text)) return "hoje";
  return undefined;
}

function extractAnimalCode(text: string, intent?: RanchoIntent) {
  const direct = text.match(/\b(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco|da|do|na|no|a)\s+([a-z]{0,3}-?\d+[a-z0-9-]*)\b/);
  if (direct?.[1]) return direct[1].toUpperCase();

  const numbers = numberMatches(text);
  if (!numbers.length) return undefined;

  if (intent === "PRODUCAO_LEITE" && numbers.length >= 2) {
    return numbers[0].raw.toUpperCase();
  }

  if (["PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(intent || "")) {
    return numbers[0].raw.toUpperCase();
  }

  return undefined;
}

function extractLiters(text: string) {
  const withUnit = text.match(/\b(\d+(?:[,.]\d+)?)\s*(?:l|lt|lts|litro|litros)\b/);
  if (withUnit?.[1]) return toNumber(withUnit[1]);

  const numbers = numberMatches(text);
  if (numbers.length >= 2) return numbers[numbers.length - 1].value;
  return undefined;
}

function extractMoneyValue(text: string) {
  const money = text.match(/(?:r\$\s*)?(\d+(?:[,.]\d+)?)\s*(?:reais|real)?\b/);
  if (!money?.[1]) return undefined;
  const numbers = numberMatches(text);
  return numbers.length ? numbers[numbers.length - 1].value : toNumber(money[1]);
}

function stripValueWords(value: string) {
  return value
    .replace(/r\$\s*\d+(?:[,.]\d+)?/gi, "")
    .replace(/\b\d+(?:[,.]\d+)?\s*(?:reais|real)?\b/gi, "")
    .replace(/\b(?:gastei|despesa|paguei|comprei|recebi|vendi|venda|receita|por|de|com|no|na)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFinanceDescription(original: string, normalized: string, tipo: "DESPESA" | "RECEITA_VENDA") {
  const afterConnector = original.match(/\b(?:com|no|na|de|por)\s+(.+)$/i)?.[1];
  const base = afterConnector || original;
  const cleaned = stripValueWords(base);
  if (cleaned) return cleaned;

  const normalizedCleaned = stripValueWords(normalized);
  if (normalizedCleaned) return normalizedCleaned;

  return tipo === "DESPESA" ? undefined : "Venda";
}

function stripAnimalReferences(value: string) {
  return value
    .replace(/\b(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco|da|do|na|no|a)\s+[a-z]{0,3}-?\d+[a-z0-9-]*\b/gi, "")
    .replace(/\b(?:tomou|vacina|vacinei|apliquei|aplicado|mediquei|medicou|remedio|remédio|medicamento|com)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractProduct(original: string, normalized: string) {
  const afterCom = original.match(/\bcom\s+(.+)$/i)?.[1];
  const afterAction = original.match(/\b(?:vacina|vacinei|apliquei|aplicou|tomou|mediquei|medicou)\s+(.+)$/i)?.[1];
  const product = stripAnimalReferences(afterCom || afterAction || original);
  const generic = normalizeRanchoText(product);

  if (product && !["vacina", "remedio", "medicamento", "tomou"].includes(generic)) return product;

  const fallback = stripAnimalReferences(normalized);
  return fallback && !["vacina", "remedio", "medicamento", "tomou"].includes(fallback) ? fallback : undefined;
}

function extractServiceLocal(original: string) {
  const match = original.match(/\b(?:no|na|do|da)\s+(.+)$/i);
  return cleanAnswer(match?.[1] || "");
}

function missingQuestions(fields: string[]) {
  return fields.map((field) => questionByField[field]).filter(Boolean);
}

function buildResumo(tipo: RanchoIntent, dados: AnyRecord) {
  if (tipo === "PRODUCAO_LEITE") {
    return `registrar produção da vaca ${dados.animal_codigo || "?"} com ${dados.litros ?? "?"} litros${dados.turno ? ` no turno ${dados.turno}` : ""}`;
  }

  if (tipo === "PARTO") {
    return `registrar parto da vaca ${dados.animal_codigo || "?"}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;
  }

  if (tipo === "VACINA_MEDICAMENTO") {
    return `registrar ${dados.evento_tipo === "vacina" ? "vacina" : "medicamento"} ${dados.produto || "?"} no animal ${dados.animal_codigo || "?"}`;
  }

  if (tipo === "MORTE") {
    return `registrar morte do animal ${dados.animal_codigo || "?"}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;
  }

  if (tipo === "DESPESA") {
    return `registrar despesa de R$ ${dados.valor ?? "?"}${dados.descricao ? ` com ${dados.descricao}` : ""}`;
  }

  if (tipo === "RECEITA_VENDA") {
    return `registrar receita de R$ ${dados.valor ?? "?"}${dados.descricao ? ` referente a ${dados.descricao}` : ""}`;
  }

  if (tipo === "ORDEM_SERVICO") {
    return `registrar ordem de serviço: ${dados.descricao || "serviço informado"}`;
  }

  return `Não entendi com segurança. Tente assim:\n${EXAMPLES.join("\n")}`;
}

function finalize(tipo: RanchoIntent, dados: AnyRecord, missingFields: string[]): ParsedRanchoMessage {
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
    confianca: complete ? 0.9 : 0.65,
    dados,
    resumo: buildResumo(tipo, dados),
    perguntas_faltantes: missingQuestions(missingFields)
  };
}

export function parseRanchoMessage(text: string): ParsedRanchoMessage {
  const original = cleanAnswer(text);
  const normalized = normalizeRanchoText(original);
  if (!normalized) return finalize("DESCONHECIDO", {}, []);

  const isProduction = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|tirei|deu|fez)\b/.test(normalized);
  const isParto = /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra)\b/.test(normalized);
  const isMedicine = /\b(?:vacina|vacinei|apliquei|aplicou|aftosa|brucelose|mediquei|medicou|remedio|medicamento|terramicina|tomou)\b/.test(normalized);
  const isDeath = /\b(?:morreu|morta|morto|obito|óbito)\b/.test(normalized);
  const isExpense = /\b(?:gastei|despesa|paguei|comprei|custo)\b/.test(normalized);
  const isRevenue = /\b(?:vendi|venda|recebi|receita)\b/.test(normalized);
  const isService = /\b(?:cerca quebrada|arrumar|consertar|manutencao|precisa|bebedouro|porteira|curral)\b/.test(normalized);

  if (isProduction) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PRODUCAO_LEITE"),
      litros: extractLiters(normalized),
      turno: extractTurno(normalized)
    };
    return finalize("PRODUCAO_LEITE", dados, [
      ...(!dados.animal_codigo ? ["animal_codigo"] : []),
      ...(!dados.litros ? ["litros"] : [])
    ]);
  }

  if (isParto) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PARTO"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("PARTO", dados, !dados.animal_codigo ? ["animal_codigo"] : []);
  }

  if (isMedicine) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "VACINA_MEDICAMENTO"),
      produto: extractProduct(original, normalized),
      evento_tipo: /\b(?:vacina|vacinei|aftosa|brucelose)\b/.test(normalized) ? "vacina" : "tratamento"
    };
    return finalize("VACINA_MEDICAMENTO", dados, [
      ...(!dados.animal_codigo ? ["animal_codigo"] : []),
      ...(!dados.produto ? ["produto"] : [])
    ]);
  }

  if (isDeath) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "MORTE"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("MORTE", dados, !dados.animal_codigo ? ["animal_codigo"] : []);
  }

  if (isExpense) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "DESPESA")
    };
    return finalize("DESPESA", dados, [
      ...(!dados.valor ? ["valor"] : []),
      ...(!dados.descricao ? ["descricao"] : [])
    ]);
  }

  if (isRevenue) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "RECEITA_VENDA")
    };
    return finalize("RECEITA_VENDA", dados, !dados.valor ? ["valor"] : []);
  }

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
  const normalized = normalizeRanchoText(answer);
  const parsedAnswer = parseRanchoMessage(answer);
  const dados = { ...current.dados };

  if (parsedAnswer.tipo === current.tipo) {
    Object.assign(dados, parsedAnswer.dados);
  }

  if (!dados.animal_codigo) dados.animal_codigo = extractAnimalCode(normalized, current.tipo);
  if (!dados.litros) dados.litros = extractLiters(normalized);
  if (!dados.valor) dados.valor = extractMoneyValue(normalized);
  if (!dados.turno) dados.turno = extractTurno(normalized);
  if (!dados.data_referencia) dados.data_referencia = extractDateReference(normalized);

  if (!dados.produto && current.tipo === "VACINA_MEDICAMENTO") {
    dados.produto = extractProduct(answer, normalized);
  }

  if (!dados.descricao && ["DESPESA", "RECEITA_VENDA", "ORDEM_SERVICO"].includes(current.tipo)) {
    dados.descricao = cleanAnswer(answer);
  }

  const missing: string[] = [];
  if (["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(current.tipo) && !dados.animal_codigo) missing.push("animal_codigo");
  if (current.tipo === "PRODUCAO_LEITE" && !dados.litros) missing.push("litros");
  if (current.tipo === "VACINA_MEDICAMENTO" && !dados.produto) missing.push("produto");
  if (["DESPESA", "RECEITA_VENDA"].includes(current.tipo) && !dados.valor) missing.push("valor");
  if (current.tipo === "DESPESA" && !dados.descricao) missing.push("descricao");

  return finalize(current.tipo, dados, missing);
}
