import { cleanAnswer, hasValue, normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import type { ParsedRanchoMessage, RanchoIntent } from "./types";
import { buildMissing, finalize } from "./result";
import { parseSingleRanchoMessage } from "./intent-detector";
import { numberMatches } from "@/lib/whatsapp/nlp-numbers";
import {
  extractAnimalCode,
  extractDateReference,
  extractFinanceDescription,
  extractLiters,
  extractLooseProductionLiters,
  extractMoneyValue,
  extractStockDestination,
  extractStockItem,
  extractStockQuantity,
  extractStockUnit,
  extractTurno,
  hasExplicitMoney,
  numberHasUnitOrMoneyContext
} from "./extractors";

const batchableIntents = new Set<RanchoIntent>([
  "PRODUCAO_LEITE",
  "PARTO",
  "VACINA_MEDICAMENTO",
  "MORTE",
  "DESPESA",
  "RECEITA_VENDA",
  "ESTOQUE_ENTRADA",
  "ESTOQUE_SAIDA"
]);

function splitBatchSegments(text: string) {
  const nextActionStart = "(?:\\d|vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco|[a-z]+-?\\d|[a-z]*\\d[a-z0-9-]*\\s+(?:\\d|deu|produziu|fez|pariu|morreu)|[a-zÃ-ÿ]+(?:\\s+[a-zÃ-ÿ]+){0,3}\\s+por\\s+\\d|comprei|compramos|chegou|entrou|usei|gastei|vendi|recebi|paguei|tira|tirar|tirei|retirei|apliquei|vacinei|mediquei|morreu|pariu)";
  const connectorPattern = new RegExp(`\\s+\\b(?:e|tamb(?:e|é)m|mais)\\b\\s+(?:a\\s+)?(?=${nextActionStart})`, "i");

  return cleanAnswer(String(text || ""))
    .split(/[\n;]+|,(?!\d)(?=\s*\S)/g)
    .flatMap((chunk) => chunk.split(connectorPattern))
    .flatMap((chunk) => chunk.split(/\s+\be\b\s+(?=\d)/i))
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function splitBatchSegmentsForContext(text: string) {
  const freeAnimalWithQuantity = "[a-z\\u00c0-\\u00ff][a-z\\u00c0-\\u00ff0-9'-]*(?:\\s+[a-z\\u00c0-\\u00ff][a-z\\u00c0-\\u00ff0-9'-]*){0,3}\\s+\\d";
  const freeAnimalWithAlso = "[a-z\\u00c0-\\u00ff][a-z\\u00c0-\\u00ff0-9'-]*(?:\\s+[a-z\\u00c0-\\u00ff][a-z\\u00c0-\\u00ff0-9'-]*){0,3}\\s+tamb(?:e|é|em)m?";
  const nextActionStart = `(?:\\d|vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco|[a-z]+-?\\d|[a-z]*\\d[a-z0-9-]*\\s+(?:\\d|deu|produziu|fez|pariu|morreu)|${freeAnimalWithQuantity}|${freeAnimalWithAlso}|[a-z\\u00c0-\\u00ff]+(?:\\s+[a-z\\u00c0-\\u00ff]+){0,3}\\s+por\\s+\\d|comprei|compramos|chegou|entrou|usei|gastei|vendi|recebi|paguei|tira|tirar|tirei|retirei|apliquei|vacinei|mediquei|morreu|pariu)`;
  const connectorPattern = new RegExp(`\\s+\\b(?:e|tamb(?:e|é|em)m?|mais)\\b\\s+(?:a\\s+)?(?=${nextActionStart})`, "i");

  return cleanAnswer(String(text || ""))
    .split(/[\n;]+|,(?!\d)(?=\s*\S)/g)
    .flatMap((chunk) => chunk.split(connectorPattern))
    .flatMap((chunk) => chunk.split(/\s+\be\b\s+(?=\d)/i))
    .map((chunk) => chunk.trim().replace(/^(?:e|mais|tamb[eé]m|tambem)\s+/i, "").trim())
    .filter(Boolean);
}

function cleanBatchProductionAnimalCandidate(value?: string | null) {
  const cleaned = cleanAnswer(value || "")
    .replace(/^(?:e|tamb[eé]m|tambem|mais)\s+/i, "")
    .replace(/^(?:a|o)\s+(?=\d+\b)/i, "")
    .replace(/\b(?:deu|produziu|fez|ordenhou|ordenha|leite|litros?|l|lt|lts)\b/gi, " ")
    .replace(/\b\d+(?:[,.]\d+)?\s*(?:l|lt|lts|litro\w*)?\b/g, " ")
    .replace(/\b(?:tamb[eé]m|tambem)\b.*$/i, " ")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function compactProductionKey(value: unknown) {
  return normalizeRanchoText(String(value || "")).replace(/[^a-z0-9]/g, "");
}

function contextualProductionAnimal(segment: string, normalized: string) {
  const byCode = extractAnimalCode(normalized, "PRODUCAO_LEITE");
  if (byCode) return byCode;

  const beforeNumber = segment.match(/^\s*(?:e|mais|tamb[eé]m|tambem)?\s*(?:a\s+)?(.+?)\s+\d+(?:[,.]\d+)?\s*(?:l|lt|lts|litro\w*)?\b/i)?.[1];
  const beforeAlso = segment.match(/^\s*(?:e|mais)?\s*(?:a\s+)?(.+?)\s+(?:tamb[eé]m|tambem)\b/i)?.[1];
  return cleanBatchProductionAnimalCandidate(beforeNumber || beforeAlso);
}

function contextualProductionLiters(segment: string, normalized: string, previous: ParsedRanchoMessage) {
  const explicit = extractLiters(normalized) ?? extractLooseProductionLiters(normalized);
  if (hasValue(explicit)) return explicit;
  if (/\btamb/.test(normalized)) return previous.dados.litros;

  const animalKey = compactProductionKey(contextualProductionAnimal(segment, normalized));
  const quantity = [...numberMatches(normalized)].reverse().find((match) => {
    if (compactProductionKey(match.raw) === animalKey) return false;
    return !numberHasUnitOrMoneyContext(normalized, match.index, match.raw);
  });
  return quantity?.value;
}

function parseBatchSegmentWithContext(segment: string, previous: ParsedRanchoMessage): ParsedRanchoMessage | null {
  const original = cleanAnswer(segment);
  const normalized = normalizeRanchoText(original);

  if (previous.tipo === "PRODUCAO_LEITE") {
    const animal = contextualProductionAnimal(original, normalized);
    const liters = contextualProductionLiters(original, normalized, previous);
    if (animal && hasValue(liters)) {
      const dados = {
        animal_codigo: animal,
        litros: liters,
        turno: extractTurno(normalized) || previous.dados.turno,
        data_referencia: extractDateReference(normalized) || previous.dados.data_referencia || "hoje"
      };
      return finalize("PRODUCAO_LEITE", dados, buildMissing("PRODUCAO_LEITE", dados), 0.82);
    }
  }

  if (previous.tipo === "ESTOQUE_ENTRADA" || previous.tipo === "ESTOQUE_SAIDA") {
    const dados = {
      item_nome: extractStockItem(original) || previous.dados.item_nome,
      quantidade: extractStockQuantity(original),
      unidade: extractStockUnit(normalized) || previous.dados.unidade,
      valor: hasExplicitMoney(original) ?extractMoneyValue(normalized) : undefined,
      compra: previous.tipo === "ESTOQUE_ENTRADA" ?previous.dados.compra : undefined,
      destino: previous.tipo === "ESTOQUE_SAIDA" ?extractStockDestination(original) || previous.dados.destino : undefined
    };
    if (dados.item_nome && hasValue(dados.quantidade)) {
      return finalize(previous.tipo, dados, buildMissing(previous.tipo, dados), 0.78);
    }
  }

  if (previous.tipo === "DESPESA" || previous.tipo === "RECEITA_VENDA") {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, previous.tipo),
      data_referencia: extractDateReference(normalized) || previous.dados.data_referencia
    };
    if (hasValue(dados.valor) && dados.descricao) {
      return finalize(previous.tipo, dados, buildMissing(previous.tipo, dados), 0.78);
    }
  }

  return null;
}

function hasExplicitStockMovementAction(segment: string) {
  const normalized = normalizeRanchoText(segment);
  return /\b(?:comprei|compramos|comprar|compra|paguei|adiciona|adicionar|adicionei|inclui|incluir|bota|botar|botei|coloca|colocar|coloquei|lanca|lancar|entrada|entrou|chegou|chegaram|chego|xegou|recebi|recebemos|baixa|baixar|dar baixa|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|saiu|saida|consumi|consumiu|descartei)\b/.test(normalized);
}

function milkBatchDestination(text: string) {
  const normalized = normalizeRanchoText(text);
  if (/\b(?:tanque|resfriador|estoque)\b/.test(normalized)) return "tanque";
  if (/\b(?:venda|vender|vendido|laticinio|laticínio|cliente)\b/.test(normalized)) return "venda";
  return undefined;
}

export function parseBatchMessage(text: string): ParsedRanchoMessage | null {
  const segments = splitBatchSegmentsForContext(text);
  if (segments.length < 2) return null;

  const registros: ParsedRanchoMessage[] = [];
  let previous: ParsedRanchoMessage | null = null;

  for (const segment of segments) {
    const parsed = parseSingleRanchoMessage(segment);
    const contextual: ParsedRanchoMessage | null = previous ?parseBatchSegmentWithContext(segment, previous) : null;
    const parsedCanEnterBatch = !parsed.perguntas_faltantes.length
      || (parsed.tipo === "PARTO" && parsed.dados?.parto_cria_decisao_pendente && parsed.perguntas_faltantes.length === 1);
    const directIsReadyAction = parsed.tipo !== "DESCONHECIDO" && parsedCanEnterBatch && batchableIntents.has(parsed.tipo);
    const shouldPreferStockContext: boolean = Boolean(contextual
      && previous
      && ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(previous.tipo)
      && ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(parsed.tipo)
      && !hasExplicitStockMovementAction(segment));
    const shouldPreferFinanceContext: boolean = Boolean(contextual
      && previous
      && ["DESPESA", "RECEITA_VENDA"].includes(previous.tipo)
      && ["DESPESA", "RECEITA_VENDA"].includes(contextual.tipo)
      && parsed.tipo === "VACINA_MEDICAMENTO");
    const next: ParsedRanchoMessage | null = shouldPreferStockContext || shouldPreferFinanceContext ?contextual : directIsReadyAction ?parsed : contextual;
    const nextCanEnterBatch = !next?.perguntas_faltantes.length
      || (next?.tipo === "PARTO" && next.dados?.parto_cria_decisao_pendente && next.perguntas_faltantes.length === 1);
    if (!next || !batchableIntents.has(next.tipo) || !nextCanEnterBatch) return null;
    registros.push(next);
    previous = next;
  }

  if (registros.length < 2) return null;
  const productionRecords = registros.filter((registro) => registro.tipo === "PRODUCAO_LEITE");
  const totalLitros = productionRecords.reduce((sum, registro) => sum + Number(registro.dados?.litros || 0), 0);
  const destinoLeite = milkBatchDestination(text);
  const dados = {
    registros,
    total_registros: registros.length,
    tipos: Array.from(new Set(registros.map((registro) => registro.tipo))),
    ...(productionRecords.length > 1 ?{
      total_litros: totalLitros,
      estoque_leite_detectado: true,
      destino_leite: destinoLeite,
      destino_leite_claro: Boolean(destinoLeite),
      tanque: destinoLeite === "tanque"
    } : {})
  };
  return finalize("LOTE_REGISTROS", dados, [], 0.88);
}
