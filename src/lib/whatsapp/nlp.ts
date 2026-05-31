import type { AnyRecord } from "@/lib/types";

export type RanchoIntent =
  | "PRODUCAO_LEITE"
  | "PARTO"
  | "VACINA_MEDICAMENTO"
  | "MORTE"
  | "DESPESA"
  | "RECEITA_VENDA"
  | "ESTOQUE_ENTRADA"
  | "ESTOQUE_SAIDA"
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
  animal_codigo: "Qual é o brinco ou nome do animal?",
  litros: "Quantos litros foram produzidos?",
  produto: "Qual vacina ou medicamento foi usado?",
  valor: "Qual foi o valor?",
  descricao: "Qual é a descrição do registro?",
  item_nome: "Qual item do estoque?",
  quantidade: "Qual quantidade?",
  funcionario_nome: "Qual funcionário?",
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

function toNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const digitPattern = /\b\d+(?:[,.]\d+)?\b/g;
  let digitMatch = digitPattern.exec(text);

  while (digitMatch) {
    const value = toNumber(digitMatch[0]);
    if (value !== undefined) matches.push({ raw: digitMatch[0], value, index: digitMatch.index || 0 });
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
  const cleaned = normalizeRanchoText(value)
    .replace(new RegExp(`\\b${animalWords}\\b`, "g"), "")
    .replace(/\b(?:da|do|de|na|no|a|o|uma|um|para|pra|producao|ordenha)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function extractAnimalCode(text: string, intent?: RanchoIntent) {
  const direct = text.match(new RegExp(`\\b${animalWords}\\s+(?:da|do|de|a|o)?\\s*([a-z0-9][a-z0-9-]*)\\b`));
  const directCandidate = candidateFromMatch(direct?.[1]);
  if (directCandidate) return directCandidate.toUpperCase();

  const productionNamed = text.match(/\b(?:producao|ordenha)\s+(?:da|do|de)?\s*([a-z0-9][a-z0-9-]*)\b/);
  const productionCandidate = candidateFromMatch(productionNamed?.[1]);
  if (productionCandidate) return productionCandidate.toUpperCase();

  const beforeVerb = text.match(/^(.+?)\s+(?:deu|produziu|fez|pariu|tomou|morreu)\b/);
  const beforeVerbCandidate = candidateFromMatch(beforeVerb?.[1]);
  if (beforeVerbCandidate && !/^(registra|registrar|lanca|lancar|anota|anotar)$/.test(beforeVerbCandidate)) {
    return beforeVerbCandidate.toUpperCase();
  }

  const beforeLiters = text.match(/^([a-z][a-z0-9-]*)\s+\d+(?:[,.]\d+)?\s*(?:l|lt|lts|litro|litros)?\b/);
  if (beforeLiters?.[1] && intent === "PRODUCAO_LEITE") return beforeLiters[1].toUpperCase();

  const numbers = numberMatches(text);
  if (intent === "PRODUCAO_LEITE" && numbers.length >= 2) return numbers[0].raw.toUpperCase();
  if (["PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(intent || "") && numbers.length) return numbers[0].raw.toUpperCase();

  return undefined;
}

function extractLiters(text: string) {
  const withUnit = text.match(/\b(\d+(?:[,.]\d+)?)\s*(?:l|lt|lts|litro|litros)\b/);
  if (withUnit?.[1]) return toNumber(withUnit[1]);

  const numbers = numberMatches(text);
  if (numbers.length >= 2) return numbers[numbers.length - 1].value;
  if (/\b(?:deu|produziu|ordenha|producao|fez)\b/.test(text)) return numbers[0]?.value;
  return undefined;
}

function extractMoneyValue(text: string) {
  return lastNumber(text);
}

function removeValueAndCommonWords(value: string) {
  return cleanAnswer(value)
    .replace(/r\$\s*\d+(?:[,.]\d+)?/gi, "")
    .replace(/\b\d+(?:[,.]\d+)?\s*(?:reais|real)?\b/gi, "")
    .replace(/\b(?:zero|um|uma|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|mil|reais|real)\b/gi, "")
    .replace(/\b(?:por|de|do|da|com|no|na|o|a|um|uma|pra|para)\b/gi, " ")
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
    .replace(/\b(?:tomou|vacina|vacinei|apliquei|aplicado|aplicou|mediquei|medicou|remedio|remédio|medicamento|com)\b/gi, "")
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

function extractStockItem(original: string) {
  const cleaned = removeValueAndCommonWords(original)
    .replace(/\b(?:adiciona|adicionar|adicionei|coloca|coloquei|entrada|entrou|estoque|baixa|baixar|retira|retirar|retirei|usei|saiu|sacos|saco|kg|quilo|quilos|unidade|unidades|caixa|caixas|dose|doses|medicamentos|remedios|remédios)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function extractStockUnit(text: string) {
  if (/\bsacos?\b/.test(text)) return "saco";
  if (/\bkg\b|\bquilos?\b/.test(text)) return "kg";
  if (/\bgramas?\b|\bg\b/.test(text)) return "g";
  if (/\blitros?\b|\bl\b/.test(text)) return "L";
  if (/\bcaixas?\b/.test(text)) return "caixa";
  if (/\bdoses?\b/.test(text)) return "dose";
  if (/\bunidades?\b/.test(text)) return "unidade";
  return undefined;
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

function extractAnimalBirthTag(text: string) {
  const direct = text.match(/\b(?:brinco|numero|número)\s+([a-z0-9-]+)\b/)?.[1];
  if (direct) return direct.toUpperCase();
  return extractAnimalCode(text, "CADASTRO_ANIMAL");
}

function extractServiceLocal(original: string) {
  const match = original.match(/\b(?:no|na|do|da)\s+(.+)$/i);
  return cleanAnswer(match?.[1] || "");
}

function missingQuestions(fields: string[]) {
  return fields.map((field) => questionByField[field]).filter(Boolean);
}

function moneyText(value: unknown) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric);
}

function buildResumo(tipo: RanchoIntent, dados: AnyRecord) {
  if (tipo === "PRODUCAO_LEITE") {
    return `registrar produção de leite${dados.animal_codigo ? ` do animal ${dados.animal_codigo}` : ""}${dados.litros ? ` com ${dados.litros} litros` : ""}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;
  }

  if (tipo === "PARTO") return `registrar parto${dados.animal_codigo ? ` do animal ${dados.animal_codigo}` : ""}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;

  if (tipo === "VACINA_MEDICAMENTO") {
    return `registrar ${dados.evento_tipo === "vacina" ? "vacina" : "tratamento"}${dados.produto ? ` com ${dados.produto}` : ""}${dados.animal_codigo ? ` no animal ${dados.animal_codigo}` : ""}`;
  }

  if (tipo === "MORTE") return `registrar morte do animal ${dados.animal_codigo || "informado"}${dados.data_referencia ? ` (${dados.data_referencia})` : ""}`;

  if (tipo === "DESPESA") return `registrar saída financeira${dados.valor ? ` de ${moneyText(dados.valor)}` : ""}${dados.descricao ? ` (${dados.descricao})` : ""}`;

  if (tipo === "RECEITA_VENDA") return `registrar entrada financeira${dados.valor ? ` de ${moneyText(dados.valor)}` : ""}${dados.descricao ? ` (${dados.descricao})` : ""}`;

  if (tipo === "ESTOQUE_ENTRADA") return `adicionar ${dados.quantidade || "?"} ${dados.unidade || ""} de ${dados.item_nome || "item"} ao estoque`;

  if (tipo === "ESTOQUE_SAIDA") return `dar baixa de ${dados.quantidade || "?"} ${dados.unidade || ""} de ${dados.item_nome || "item"} no estoque`;

  if (tipo === "PONTO_FUNCIONARIO") return `registrar ${dados.ponto_tipo || "ponto"} de ${dados.funcionario_nome || "funcionário"}${dados.horario ? ` às ${dados.horario}` : ""}`;

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
    perguntas_faltantes: missingQuestions(missingFields)
  };
}

function buildMissing(tipo: RanchoIntent, dados: AnyRecord) {
  const missing: string[] = [];
  if (["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(tipo) && !dados.animal_codigo) missing.push("animal_codigo");
  if (tipo === "PRODUCAO_LEITE" && !dados.litros) missing.push("litros");
  if (tipo === "VACINA_MEDICAMENTO" && !dados.produto) missing.push("produto");
  if (["DESPESA", "RECEITA_VENDA"].includes(tipo) && !dados.valor) missing.push("valor");
  if (["DESPESA", "RECEITA_VENDA"].includes(tipo) && !dados.descricao) missing.push("descricao");
  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(tipo) && !dados.item_nome) missing.push("item_nome");
  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(tipo) && !dados.quantidade) missing.push("quantidade");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.ponto_tipo) missing.push("ponto_tipo");
  if (tipo === "CADASTRO_ANIMAL" && !dados.animal_codigo) missing.push("animal_codigo");
  if (tipo === "CADASTRO_ANIMAL" && !dados.categoria) missing.push("categoria_animal");
  return missing;
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

  const hasStockAction = /\b(?:adiciona|adicionar|adicionei|coloca|coloquei|entrada|entrou|repor|reposicao|reposição|baixa|baixar|retira|retirar|retirei|usei|saiu|saida|saída|consumi|descartei)\b/.test(normalized);
  const isStockQuery = !hasStockAction && /\b(?:consultar|ver|quanto|saldo|tem|estoque)\b/.test(normalized) && /\b(?:estoque|racao|ração|medicamento|insumo|sacos?)\b/.test(normalized);
  if (isStockQuery) return finalize("CONSULTA_ESTOQUE", { item_nome: extractStockItem(original) }, [], 0.85);

  const isEmployeeQuery = /\b(?:consultar|ver|funcionario|funcionário|equipe|colaborador)\b/.test(normalized) && !/\b(?:entrou|saiu|ponto|entrada|saida|saída)\b/.test(normalized);
  if (isEmployeeQuery) return finalize("CONSULTA_FUNCIONARIO", { funcionario_nome: extractEmployeeName(original, normalized) }, [], 0.8);

  const isPoint = /\b(?:ponto|entrou|entrada|saiu|saida|saída|bateu|bater ponto|registrar ponto)\b/.test(normalized);
  if (isPoint) {
    const dados = {
      funcionario_nome: extractEmployeeName(original, normalized),
      ponto_tipo: extractPointType(normalized),
      horario: extractPointTime(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados));
  }

  const isStockOut = /\b(?:baixa|baixar|retira|retirar|retirei|usei|saiu|saida|saída|consumi|descartei)\b/.test(normalized) && /\b(?:estoque|racao|ração|medicamento|remedio|remédio|insumo|sacos?|kg|unidades?)\b/.test(normalized);
  if (isStockOut) {
    const dados = {
      item_nome: extractStockItem(original),
      quantidade: firstNumber(normalized),
      unidade: extractStockUnit(normalized)
    };
    return finalize("ESTOQUE_SAIDA", dados, buildMissing("ESTOQUE_SAIDA", dados));
  }

  const isStockIn = /\b(?:adiciona|adicionar|adicionei|coloca|coloquei|entrada|entrou|repor|reposicao|reposição)\b/.test(normalized) && /\b(?:estoque|racao|ração|medicamento|remedio|remédio|insumo|sacos?|kg|unidades?)\b/.test(normalized);
  if (isStockIn) {
    const dados = {
      item_nome: extractStockItem(original),
      quantidade: firstNumber(normalized),
      unidade: extractStockUnit(normalized)
    };
    return finalize("ESTOQUE_ENTRADA", dados, buildMissing("ESTOQUE_ENTRADA", dados));
  }

  const isParto = /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra|deu cria)\b/.test(normalized);
  if (isParto) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PARTO"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("PARTO", dados, buildMissing("PARTO", dados));
  }

  const isMedicine = /\b(?:vacina|vacinei|apliquei|aplicou|aftosa|brucelose|mediquei|medicou|remedio|remédio|medicamento|terramicina|tomou)\b/.test(normalized);
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
      data_referencia: extractDateReference(normalized)
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

  if (isExpense) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "DESPESA"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("DESPESA", dados, buildMissing("DESPESA", dados));
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

  if (parsedAnswer.tipo === current.tipo) Object.assign(dados, parsedAnswer.dados);

  const animalCode = extractAnimalCode(normalized, current.tipo);
  const liters = extractLiters(normalized);
  const value = extractMoneyValue(normalized);
  const quantity = firstNumber(normalized);
  const itemName = extractStockItem(original);
  const employeeName = extractEmployeeName(original, normalized);
  const pointType = extractPointType(normalized);
  const pointTime = extractPointTime(normalized);

  if (animalCode) dados.animal_codigo = animalCode;
  if (liters && current.tipo === "PRODUCAO_LEITE") dados.litros = liters;
  if (value && ["DESPESA", "RECEITA_VENDA"].includes(current.tipo)) dados.valor = value;
  if (quantity && ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo)) dados.quantidade = quantity;
  if (itemName && ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo)) dados.item_nome = itemName;
  if (employeeName && current.tipo === "PONTO_FUNCIONARIO") dados.funcionario_nome = employeeName;
  if (pointType && current.tipo === "PONTO_FUNCIONARIO") dados.ponto_tipo = pointType;
  if (pointTime && current.tipo === "PONTO_FUNCIONARIO") dados.horario = pointTime;

  if (!dados.turno) dados.turno = extractTurno(normalized);
  if (!dados.data_referencia) dados.data_referencia = extractDateReference(normalized);
  if (!dados.unidade && ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo)) dados.unidade = extractStockUnit(normalized);
  if (!dados.produto && current.tipo === "VACINA_MEDICAMENTO") dados.produto = extractProduct(answer, normalized);
  if (!dados.descricao && ["DESPESA", "RECEITA_VENDA", "ORDEM_SERVICO"].includes(current.tipo)) dados.descricao = removeValueAndCommonWords(original) || original;
  if (!dados.categoria && current.tipo === "CADASTRO_ANIMAL") dados.categoria = extractAnimalCategory(normalized);

  const missing = buildMissing(current.tipo, dados);
  return finalize(current.tipo, dados, missing);
}
