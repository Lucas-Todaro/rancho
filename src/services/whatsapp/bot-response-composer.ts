import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import { BOT_EXAMPLES, normalizeRanchoText, refreshRanchoMessage } from "@/lib/whatsapp/nlp";
import { animalOptionalFields } from "@/lib/whatsapp/nlp-core/constants";
import { buildMissing } from "@/lib/whatsapp/nlp-core/result";
import { markAnimalOptionalFieldSkipped } from "@/lib/whatsapp/nlp-core/extractors";
import type { BotSession } from "@/services/whatsapp/session-service";
import { confirmationText } from "@/services/whatsapp/confirmation-message";
import { intentLabel } from "@/services/whatsapp/messages";

const ANIMAL_OPTIONAL_LABELS: Record<string, string> = {
  sexo: "sexo",
  nome: "nome ou apelido",
  peso: "peso",
  fase: "fase",
  raca: "raca",
  lote_animal: "lote",
  data_nascimento: "data de nascimento",
  observacoes: "observacoes"
};

function missingFields(parsed: ParsedRanchoMessage) {
  return buildMissing(parsed.tipo, parsed.dados || {});
}

function isOptionalField(parsed: ParsedRanchoMessage, field: string) {
  return parsed.tipo === "CADASTRO_ANIMAL" && animalOptionalFields.includes(field);
}

function cleanQuestion(question: string | undefined) {
  return String(question || "Qual dado faltou?")
    .replace(/\?([A-ZÀ-Ý])/g, "? $1")
    .replace(/\.([A-ZÀ-Ý])/g, ". $1")
    .replace(/\bQual e\b/g, "Qual é")
    .replace(/\bqual e\b/g, "qual é")
    .replace(/\bsera\b/g, "será")
    .replace(/\bfuncao\b/g, "função")
    .replace(/\badmissao\b/g, "admissão")
    .replace(/\bcodigo\b/g, "código")
    .replace(/\bhistorico\b/g, "histórico")
    .trim();
}

function questionForField(parsed: ParsedRanchoMessage, field: string) {
  const fields = missingFields(parsed);
  const index = fields.indexOf(field);
  return cleanQuestion(parsed.perguntas_faltantes?.[index] || parsed.perguntas_faltantes?.[0]);
}

function optionalLabels(fields: string[]) {
  return fields.map((field) => ANIMAL_OPTIONAL_LABELS[field] || field.replace(/_/g, " "));
}

export function canFinishMissingFields(parsed: ParsedRanchoMessage) {
  const fields = missingFields(parsed);
  return Boolean(fields.length) && fields.every((field) => isOptionalField(parsed, field));
}

export function finishMissingFieldsForConfirmation(parsed: ParsedRanchoMessage) {
  if (!canFinishMissingFields(parsed)) return null;

  let dados = { ...(parsed.dados || {}) };
  for (const field of missingFields(parsed)) {
    if (isOptionalField(parsed, field)) dados = markAnimalOptionalFieldSkipped(dados, field);
  }

  const next = refreshRanchoMessage(parsed, dados);
  return next.perguntas_faltantes.length ? null : next;
}

export function isFinishOptionalFieldsCommand(commandOrText: string) {
  const command = normalizeRanchoText(commandOrText);
  const exact = new Set(["nao", "não", "n", "nao quero", "não quero", "nao tenho", "não tenho", "concluir", "conclui", "finalizar", "finaliza", "pronto", "so isso", "só isso", "sem mais", "pular", "pula"]);
  return exact.has(command)
    || /^(?:pode concluir|pode finalizar|pode seguir|seguir|nao quero mais|não quero mais|nao informar|não informar|sem informar|pular todos|deixa sem|deixa em branco)\b/.test(command)
    || /\bnao quero\b.*\binformar\b/.test(command)
    || /\bnão quero\b.*\binformar\b/.test(command);
}

export function composeMissingDataText(parsed: ParsedRanchoMessage) {
  const fields = missingFields(parsed);
  const optional = fields.filter((field) => isOptionalField(parsed, field));
  const required = fields.filter((field) => !isOptionalField(parsed, field));
  const label = intentLabel(parsed.tipo);

  if (fields.length && !required.length) {
    const labels = optionalLabels(optional);
    return [
      `O cadastro principal já está completo. Faltam apenas dados opcionais.`,
      "",
      `Quer adicionar algum destes dados?`,
      ...labels.map((item) => `- ${item}`),
      "",
      `Pode mandar tudo em uma mensagem, por exemplo: "fêmea, 420 kg, lote Lactação".`,
      `Se quiser seguir sem esses dados, responda "concluir".`
    ].join("\n");
  }

  if (required.length === 1) {
    return [
      `Para continuar com ${label}, preciso de um dado:`,
      questionForField(parsed, required[0]),
      "",
      `Pode responder só com essa informação. Para parar, envie "cancelar".`
    ].join("\n");
  }

  if (required.length > 1) {
    return [
      `Para continuar com ${label}, preciso destes dados:`,
      ...required.map((field) => `- ${questionForField(parsed, field)}`),
      "",
      `Pode mandar todos em uma mensagem. Para parar, envie "cancelar".`
    ].join("\n");
  }

  return cleanQuestion(parsed.perguntas_faltantes?.[0]);
}

export function composeOptionalFieldsFinishedText(parsed: ParsedRanchoMessage) {
  return [
    "Tudo certo, vou seguir sem os dados opcionais que faltavam.",
    "",
    confirmationText(parsed)
  ].join("\n");
}

function hasOperationalCue(command: string) {
  return /\b(?:vaca|boi|bezer|animal|gado|leite|litro|pariu|parto|morreu|morte|vacina|medicamento|tratamento|cio|prenhez|insemin|estoque|racao|ração|milho|sal|diesel|comprei|compra|vendi|venda|recebi|paguei|despesa|receita|financeiro|lote|funcionario|funcionário|ponto|entrada|saida|saída|tabela|relatorio|relatório|resumo)\b/.test(command);
}

function pendingSummary(session?: BotSession | null) {
  const pending = session?.dados?.pending as ParsedRanchoMessage | undefined;
  if (!pending?.tipo || !session?.etapa || session.etapa === "livre") {
    return "Não tenho uma ação pendente nesta conversa. Para ver o que aconteceu hoje, você pode pedir: \"resumo de hoje\".";
  }

  if (session.etapa === "aguardando_confirmacao") {
    return [
      `A ação pendente agora é: ${pending.resumo}.`,
      "",
      `Responda 1 para confirmar, 2 para corrigir ou "cancelar" para sair.`
    ].join("\n");
  }

  if (session.etapa === "aguardando_dado") {
    return [
      `Estou completando esta ação: ${pending.resumo}.`,
      "",
      composeMissingDataText(pending)
    ].join("\n");
  }

  return "Não tenho uma ação pendente nesta conversa.";
}

export function composeGeneralConversationText(commandOrText: string, session?: BotSession | null) {
  const command = normalizeRanchoText(commandOrText);
  if (!command) return null;

  if (/\b(?:acao pendente|ação pendente|ultima acao|última ação|ultimo registro|último registro|o que falta|onde paramos)\b/.test(command)) {
    return pendingSummary(session);
  }

  if (/^(?:oi|ola|olá|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|e ai|e aí)[\s!.?]*$/.test(command)) {
    return [
      "Oi! Eu sou o assistente do Rancho.",
      "Pode me mandar registros ou consultas da fazenda em linguagem normal. Eu organizo a informação e peço confirmação antes de salvar."
    ].join("\n");
  }

  if (/\b(?:qual (?:e |é )?seu nome|qual seu nome|quem (?:e|é) voce|quem (?:e|é) você|voce (?:e|é) quem|você (?:e|é) quem)\b/.test(command)) {
    return "Eu sou o assistente do Rancho, o bot que ajuda a registrar e consultar informações da fazenda pelo WhatsApp.";
  }

  if (!hasOperationalCue(command) && /\b(?:o que voce faz|o que você faz|o que voce pode fazer|o que você pode fazer|o que pode fazer|como funciona|quais mensagens|que mensagens|exemplos|me ajuda|ajuda)\b/.test(command)) {
    return [
      "Você pode falar comigo do jeito natural. Eu ajudo com produção de leite, rebanho, parto, saúde, estoque, financeiro, funcionários, ponto, lotes, genealogia e relatórios.",
      "",
      "Exemplos:",
      ...BOT_EXAMPLES,
      "",
      "Quando uma ação puder alterar dados, eu mostro um resumo e peço confirmação antes de salvar."
    ].join("\n");
  }

  return null;
}
