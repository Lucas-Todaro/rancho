import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { finalize, refreshRanchoMessage } from "./result";
import type { ParsedRanchoMessage } from "./types";

export const DESTRUCTIVE_BULK_ACTION_MESSAGE = "Por segurança, não faço exclusão em massa pelo WhatsApp. Essa ação poderia apagar muitos dados do rebanho. Se você precisa remover animais, faça isso manualmente pelo painel administrativo ou peça uma ação específica por animal.";

const DESTRUCTIVE_BULK_INTENT = "ACAO_DESTRUTIVA_EM_MASSA";

function normalizeText(text: string) {
  return normalizeRanchoText(text)
    .replace(/\s+/g, " ")
    .trim();
}

function hasDestructiveVerb(text: string) {
  return /\b(?:exclui|excluir|exclua|deleta|deletar|delete|apaga|apagar|apague|remove|remover|remova|limpa|limpar|zera|zerar)\b/.test(text);
}

function hasSpecificIndividualAnimalTarget(text: string) {
  return /\b(?:vaca|animal|boi|touro|bezerro|bezerra|novilha)\s+[a-z0-9][a-z0-9-]*\b/.test(text)
    || /\b(?:brinco|codigo|cod|numero|n)\s+[a-z0-9][a-z0-9-]*\b/.test(text)
    || /\b[a-z]+-\d[a-z0-9-]*\b/.test(text);
}

export function detectDestructiveBulkAction(originalText: string) {
  const text = normalizeText(originalText);
  if (!hasDestructiveVerb(text)) return false;

  const directWholeTarget = /\b(?:exclui|excluir|exclua|deleta|deletar|delete|apaga|apagar|apague|remove|remover|remova|limpa|limpar|zera|zerar)\s+(?:o|a|os|as|meu|minha|meus|minhas)?\s*(?:rebanho|gado|boiada|fazenda|base|dados)\b/.test(text);
  const quantifiedGroupTarget = /\b(?:todo|toda|todos|todas|inteiro|inteira|completo|completa|tudo)\b.*\b(?:rebanho|animais|animal|vacas?|gado|bois?|touros?|bezerr[oa]s?|novilhas?|boiada|fazenda|dados)\b/.test(text);
  const possessiveGroupTarget = /\b(?:minhas?\s+vacas|minhas?\s+bezerras|meus\s+animais|meu\s+gado|minha\s+fazenda)\b/.test(text);
  const dataWipeTarget = /\b(?:todos?\s+os\s+dados|todas?\s+as\s+informacoes|limpar\s+tudo|zerar\s+tudo|apagar\s+tudo|deletar\s+tudo|excluir\s+tudo)\b/.test(text);

  if (hasSpecificIndividualAnimalTarget(text) && !quantifiedGroupTarget && !possessiveGroupTarget && !dataWipeTarget) {
    return false;
  }

  return directWholeTarget || quantifiedGroupTarget || possessiveGroupTarget || dataWipeTarget;
}

export function destructiveBulkActionParsed(originalText: string): ParsedRanchoMessage {
  const dados = {
    blocked: true,
    bloqueado: true,
    alvo: "massa",
    canal_bloqueado: "whatsapp",
    texto_original: originalText,
    response: DESTRUCTIVE_BULK_ACTION_MESSAGE,
    should_confirm: false
  };
  return {
    ...finalize(DESTRUCTIVE_BULK_INTENT, dados, [], 0.99),
    decision: "blocked",
    flags: ["destructive_action", "sensitive_action"],
    riskScore: 1,
    reason: "Ação destrutiva em massa bloqueada localmente."
  };
}

function explicitRecentBirthPeriod(text: string) {
  const daysMatch = text.match(/\b(?:ultimos|ultimas)\s+(\d{1,3})\s+dias\b/);
  if (daysMatch) {
    const days = Math.max(1, Math.min(365, Number(daysMatch[1])));
    return { periodo: `ultimos_${days}`, data_referencia: `ultimos_${days}`, dias: days };
  }
  if (/\b(?:hoje|hj)\b/.test(text)) return { periodo: "hoje", data_referencia: "hoje" };
  if (/\b(?:essa|esta|esse|este)\s+semana\b|\bsemana\b/.test(text)) return { periodo: "semana", data_referencia: "semana" };
  if (/\b(?:esse|este|desse|deste)\s+mes\b|\bmes\b/.test(text)) return { periodo: "mes", data_referencia: "mes" };
  return { periodo: "recentes", data_referencia: "recentes", dias: 90 };
}

function hasBirthQueryCue(text: string, originalText: string) {
  const birthText = text.replace(/\b(?:pre\s*-?\s*partos?|prepartos?)\b/g, "preparto");
  const birthCue = /\b(?:partos?|pariram|pariu|tiveram\s+parto|teve\s+parto|deu\s+cria|deram\s+cria|nascimentos?)\b/.test(birthText);
  if (!birthCue) return false;

  const shortPlural = /^(?:partos|ultimos\s+partos|ultimas\s+paridas|partos\s+recentes|relatorio\s+(?:dos|de)\s+partos|partos\s+(?:das\s+vacas|do\s+rebanho|dos\s+animais))$/.test(text);
  const queryCue = /\b(?:quais|qual|quem|quantas|quantos|lista|listar|liste|listagem|relatorio|relatorios|resumo|consulta|consultar|mostrar|mostra|ver|ultimos|ultimas|recentes|recentemente)\b/.test(text)
    || /\?/.test(originalText);
  const collectiveBirthCue = /\b(?:vacas?|animais|rebanho|gado)\b.*\b(?:pariram|tiveram\s+parto|deram\s+cria)\b/.test(text)
    || /\bpartos?\s+(?:das|dos|do|da|de)\s+(?:vacas?|animais|rebanho|gado)\b/.test(text);
  const periodBirthCue = /\bpartos?\b.*\b(?:ultimos|ultimas|hoje|semana|mes|recentes|recentemente)\b/.test(text);
  const individualStatement = /^(?:[a-z][a-z0-9-]*|vaca\s+[a-z0-9-]+|animal\s+[a-z0-9-]+)\s+(?:pariu|deu\s+cria|teve\s+cria|teve\s+parto)\b/.test(text)
    && !/\b(?:quais|qual|quem|lista|listar|relatorio|partos?)\b/.test(text)
    && !/\?/.test(originalText);

  return !individualStatement && (shortPlural || queryCue || collectiveBirthCue || periodBirthCue);
}

export function detectRecentBirthsQuery(originalText: string) {
  return hasBirthQueryCue(normalizeText(originalText), originalText);
}

export function recentBirthsQueryData(originalText: string) {
  const period = explicitRecentBirthPeriod(normalizeText(originalText));
  return {
    consulta: true,
    consulta_registros: "eventos",
    relatorio_modo: "resumo",
    evento: "PARTO",
    evento_tipo: "parto",
    should_confirm: false,
    ...period
  };
}

export function recentBirthsQueryParsed(originalText: string): ParsedRanchoMessage {
  return finalize("CONSULTA_REGISTROS_HOJE", recentBirthsQueryData(originalText), [], 0.92);
}

export function normalizeReproductionQueries(originalText: string, parsed: ParsedRanchoMessage): ParsedRanchoMessage {
  if (!detectRecentBirthsQuery(originalText)) return parsed;
  const shouldRemap = ["DESCONHECIDO", "CONSULTA_ANIMAL", "CONSULTA_REBANHO"].includes(parsed.tipo)
    || (
      parsed.tipo === "CONSULTA_REGISTROS_HOJE"
      && (!parsed.dados?.evento_tipo || parsed.dados.evento_tipo === "parto")
    );
  if (!shouldRemap) return parsed;
  const currentPeriod = String(parsed.dados?.periodo || parsed.dados?.data_referencia || "");
  const normalizedData = recentBirthsQueryData(originalText);
  const shouldPreserveCurrentPeriod = normalizedData.periodo === "recentes" && currentPeriod && currentPeriod !== "recentes";
  const periodData = shouldPreserveCurrentPeriod
    ? {
      ...normalizedData,
      periodo: currentPeriod,
      data_referencia: currentPeriod,
      dias: undefined
    }
    : normalizedData;
  const dados = {
    ...(parsed.dados || {}),
    ...periodData
  };
  return refreshRanchoMessage({ ...parsed, tipo: "CONSULTA_REGISTROS_HOJE", confianca: Math.max(parsed.confianca || 0, 0.92), dados }, dados);
}
