import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { normalizeWhatsappNumber, whatsappNumbersMatch } from "@/lib/phone";
import {
  isOversizedText,
  isUnsafeOperationalMessage,
  safeErrorText,
  sanitizeFreeText,
  sanitizePayloadValue,
  SAFE_OPERATION_BLOCKED_MESSAGE
} from "@/lib/security";
import { animalBlockedMessage, animalDeathDate, animalStatusValue, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import { normalizeCatalogText, resolveAnimalIdentifier, resolveStockItem } from "@/lib/whatsapp/catalog";
import { resolveWhatsAppOwner, type WhatsAppOwner } from "@/services/whatsapp/identity";
import { detectConversationAct, logConversationAct, type ConversationAct } from "@/services/whatsapp/conversation-act";
import { isGeminiPrimaryMode, parseWithConfiguredInterpreter } from "@/services/whatsapp/interpreter/gemini-primary";
import { buildRanchReport, type OperationalReportKind, type OperationalReportMode } from "@/services/whatsapp/operational-report";
import {
  BOT_EXAMPLES,
  formatStockUnit,
  mergeRanchoMessageData,
  normalizeRanchoText,
  parseRanchoMessage,
  parseTabularAnimalEventsMessageAs,
  detectReproductiveEventKind,
  refreshRanchoMessage,
  reproductiveEventDbType,
  reproductiveEventDescription,
  reproductiveEventLabel,
  type ReproductiveEventKind as NlpReproductiveEventKind,
  type ParsedRanchoMessage
} from "@/lib/whatsapp/nlp";
import {
  DESTRUCTIVE_BULK_ACTION_MESSAGE,
  detectDestructiveBulkAction,
  destructiveBulkActionParsed
} from "@/lib/whatsapp/nlp-core/safety-guards";
import { calfCategoryForSex, hasBirthChildData, normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { domainFromUserChoice, tabularDomainLabel } from "@/lib/whatsapp/nlp-core/tabular-domain-router";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type TwilioMessageInput = {
  Body: string;
  From: string;
  To: string;
  MessageSid: string;
};

export type ProcessWhatsappMessageInput = {
  telefone: string;
  mensagem: string;
  provider: "twilio" | "simulador" | "meta" | "whatsapp";
  modoTeste?: boolean;
  salvarReal?: boolean;
  messageSid?: string;
  to?: string;
  raw?: AnyRecord;
};

export type ProcessWhatsappMessageResult = {
  respostaTexto: string;
  intencaoDetectada: ParsedRanchoMessage["tipo"] | null;
  confianca: number | null;
  dadosExtraidos: AnyRecord | null;
  estadoAnterior: BotSession["etapa"] | null;
  estadoNovo: BotSession["etapa"] | null;
  camposFaltantes: string[];
  eventoConfirmado: boolean;
  erro: string | null;
};

type BotSession = {
  etapa: "livre" | "aguardando_dado" | "aguardando_confirmacao";
  dados: AnyRecord;
};

type SaveResult = {
  response: string;
  nextSession?: BotSession;
  sessionData?: AnyRecord;
  savedReal?: boolean;
  savedTables?: string[];
};

type MatchResult<T extends AnyRecord> = {
  row: T;
  exact: boolean;
  score: number;
  ambiguousRows?: T[];
  resolutionStatus?: string;
};

type StockLookupResult = {
  row?: AnyRecord;
  exact: boolean;
  score: number;
  ambiguousRows?: AnyRecord[];
  resolutionStatus: string;
  catalogSource: "banco_real";
  catalogCount: number;
  candidateNames: string[];
  reason: string;
};

type MilkStockResolution = {
  status: "matched" | "ambiguous" | "not_found";
  row?: AnyRecord;
  options: AnyRecord[];
  catalogSource: "banco_real";
  catalogCount: number;
  reason: string;
};

const CONFIRM_WORDS = new Set(["sim", "s", "ss", "confirmar", "confirma", "confirmado", "correto", "ok", "okay", "blz", "beleza", "pode", "pode salvar", "pode registrar", "pode lancar", "salvar", "salva", "registrar", "registra", "lancar", "lanca", "isso", "isso mesmo", "certo", "ta certo", "fechou", "show", "joia", "manda", "vai", "pode sim", "e isso", "importar", "importar validas", "importar linhas validas", "importar encontrados", "importar so encontrados", "salvar validas", "salvar linhas validas", "importa validas", "pode importar", "cadastrar", "cadastrar validos", "cadastrar animais", "so as validas", "so validas", "somente validas", "apenas validas", "1"]);
const REJECT_WORDS = new Set(["nao", "n", "errado", "corrigir", "corrige", "nao e isso", "refazer", "refaz", "incorreto", "negativo", "na verdade", "2"]);
const CANCEL_WORDS = new Set(["cancelar", "cancela", "cancele", "sair", "para", "parar", "pare", "aborta", "abortar", "deixa", "esquece", "desfaz", "desfazer", "nao salva", "nao salve", "nao salvar", "nao registrar", "apaga isso"]);
const PENDING_ACTION_CANCELLED_MESSAGE = "Beleza, cancelei essa acao. Nada foi salvo.";
const NO_PENDING_ACTION_MESSAGE = "Nao ha acao pendente para cancelar.";
const MENU_WORDS = new Set(["menu", "inicio", "ajuda", "voltar"]);
const REPEAT_WORDS = new Set(["repete", "repetir", "repita", "mostra de novo", "mostrar de novo", "resumo", "resumir"]);
const STOCK_PAGINATION_WORDS = new Set(["mais", "ver mais", "proximos", "proximo", "continuar", "continua"]);
const STOCK_PAGE_SIZE = 8;
const FINANCE_PAGE_SIZE = 5;
const HERD_PAGE_SIZE = 8;
const LOT_PAGE_SIZE = 10;
const EVENT_PAGE_SIZE = 10;
const BOT_TABULAR_IMPORT_DEBUG = process.env.RANCHO_BOT_DEBUG_TABULAR === "1";
const CONSULT_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "CONSULTA_PRODUCAO",
  "CONSULTA_PRODUCAO_HOJE",
  "CONSULTA_PRODUCAO_ANIMAL",
  "CONSULTA_FINANCEIRO",
  "CONSULTA_ESTOQUE",
  "CONSULTA_ESTOQUE_ITEM",
  "CONSULTA_ESTOQUE_GERAL",
  "CONSULTA_FUNCIONARIO",
  "CONSULTA_FOLHA",
  "CONSULTA_PONTO",
  "CONSULTA_ANIMAL",
  "CONSULTA_GENEALOGIA",
  "CONSULTA_REBANHO",
  "CONSULTA_LOTES",
  "CONSULTA_REGISTROS_HOJE",
  "AJUDA"
]);
const ANIMAL_RECORD_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE"]);
const ANIMAL_LOOKUP_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  ...Array.from(ANIMAL_RECORD_INTENTS),
  "ATUALIZACAO_ANIMAL",
  "CONSULTA_ANIMAL",
  "ATUALIZACAO_GENEALOGIA",
  "CONSULTA_GENEALOGIA"
]);
const EMPLOYEE_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "CRIAR_FUNCIONARIO",
  "ATUALIZAR_FUNCIONARIO",
  "DESLIGAR_FUNCIONARIO",
  "EXCLUIR_FUNCIONARIO",
  "PAGAMENTO_FUNCIONARIO"
]);
const GENEALOGY_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "ATUALIZACAO_GENEALOGIA"
]);
const FINANCE_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "DESPESA",
  "RECEITA_VENDA"
]);
const LOT_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "CRIAR_LOTE"
]);
const ANIMAL_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "CADASTRO_ANIMAL",
  "EXCLUIR_REBANHO",
  "IMPORTACAO_ANIMAIS_TABELA"
]);
const ANIMAL_EVENT_IMPORT_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "IMPORTACAO_EVENTOS_TABELA"
]);
const STOCK_IMPORT_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "IMPORTACAO_ESTOQUE_TABELA"
]);

const BOT_INSERT_COLUMNS: Record<string, Set<string>> = {
  [TABLES.ordenhas]: new Set(["fazenda_id", "animal_id", "litros", "ordenhado_em", "turno", "destino", "origem", "registrado_por", "observacoes"]),
  [TABLES.eventosAnimal]: new Set(["fazenda_id", "animal_id", "tipo", "data_evento", "descricao", "medicamento", "dose", "custo", "responsavel_usuario_id"]),
  [TABLES.animais]: new Set(["fazenda_id", "brinco", "nome", "categoria", "sexo", "fase", "raca", "peso", "lote_id", "data_nascimento", "status", "created_by", "observacoes", "mae_id", "pai_id", "genealogia_observacoes"]),
  [TABLES.lotes]: new Set(["fazenda_id", "nome", "descricao", "ativo"]),
  [TABLES.transacoesFinanceiras]: new Set(["fazenda_id", "tipo", "data_transacao", "valor", "categoria", "descricao", "metodo_pagamento", "origem", "created_by"]),
  [TABLES.estoqueItens]: new Set(["fazenda_id", "nome", "categoria", "unidade_medida", "quantidade_atual", "quantidade_minima", "valor_unitario", "fornecedor", "ativo", "created_by"]),
  [TABLES.estoqueMovimentacoes]: new Set(["fazenda_id", "item_id", "tipo", "quantidade", "valor_unitario", "motivo", "responsavel_usuario_id", "origem", "source_type", "source_id", "producao_id"]),
  [TABLES.funcionarios]: new Set(["fazenda_id", "nome", "funcao", "cpf", "contato_whatsapp", "salario_base", "data_admissao", "carga_horaria_mensal", "valor_hora_extra", "ativo", "tipo_acesso", "papel_sistema"]),
  [TABLES.folhaPagamento]: new Set(["fazenda_id", "funcionario_id", "competencia", "salario_base", "horas_extras", "valor_horas_extras", "descontos", "adiantamentos", "total_liquido", "status", "pago_em"]),
  [TABLES.whatsappUsuarios]: new Set(["fazenda_id", "telefone_e164", "funcionario_id", "usuario_id", "nome_exibicao", "ativo", "papel", "papel_bot"]),
  [TABLES.registrosPonto]: new Set(["fazenda_id", "funcionario_id", "tipo", "registrado_em", "observacao", "origem", "created_by"])
};

function nowIso() {
  return new Date().toISOString();
}

function expirationIso() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function dateFromReference(reference?: string) {
  const date = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(reference || ""))) {
    const parsed = new Date(`${reference}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (reference === "anteontem") date.setDate(date.getDate() - 2);
  if (reference === "ontem") date.setDate(date.getDate() - 1);
  if (reference === "amanha") date.setDate(date.getDate() + 1);
  return date;
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dateOnlyFromReference(reference?: string) {
  return dateOnly(dateFromReference(reference));
}

function monthStartFromPaymentPeriod(period?: string) {
  const date = new Date();
  if (period === "mes_anterior") date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthKeyFromDate(value: unknown) {
  return String(value || "").slice(0, 7);
}

function isoFromReference(reference?: string, time?: string) {
  const date = dateFromReference(reference);
  if (time) {
    const [hour, minute] = time.split(":").map(Number);
    date.setHours(hour || 0, minute || 0, 0, 0);
  }
  return date.toISOString();
}

function dayRange(reference?: string) {
  const date = dateFromReference(reference);
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function monthRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function previousMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function lastDaysRange(days: number) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function currentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const offset = day === 0 ?-6 : 1 - day;
  start.setDate(start.getDate() + offset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function previousWeekRange() {
  const current = currentWeekRange();
  const end = new Date(current.start);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function currentYearRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function periodRange(period?: string) {
  if (period === "ultimos_30") return lastDaysRange(30);
  if (period === "ultimos_7") return lastDaysRange(7);
  if (period === "semana_passada") return previousWeekRange();
  if (period === "mes_passado") return previousMonthRange();
  if (period === "semana") return currentWeekRange();
  if (period === "mes") return currentMonthRange();
  if (period === "ano") return currentYearRange();
  if (/^\d{4}-\d{2}$/.test(String(period || ""))) return monthRange(String(period));
  return dayRange(period);
}

function periodLabel(period?: string) {
  if (period === "ultimos_30") return "nos últimos 30 dias";
  if (period === "ultimos_7") return "nos últimos 7 dias";
  if (period === "semana_passada") return "na semana passada";
  if (period === "mes_passado") return "no mês passado";
  if (period === "semana") return "esta semana";
  if (period === "mes") return "este mês";
  if (period === "ano") return "este ano";
  if (/^\d{4}-\d{2}$/.test(String(period || ""))) return `o mês ${String(period)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(period || ""))) return `o dia ${String(period)}`;
  if (period === "anteontem") return "anteontem";
  if (period === "ontem") return "ontem";
  return "hoje";
}

function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function formatNumber(value: number | string | null | undefined, suffix = "") {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(value || 0))}${suffix}`;
}

function hasBotValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatStockAmount(quantity: number | string | null | undefined, unit: string | null | undefined) {
  return `${formatNumber(quantity)} ${formatStockUnit(quantity, unit)}`.trim();
}

function maskPhone(value: string) {
  return value.length > 4 ?`***${value.slice(-4)}` : "***";
}

function isBotAdmin(owner: WhatsAppOwner) {
  return owner.papel_bot === "admin";
}

function isDestructiveBulkParsed(parsed?: ParsedRanchoMessage | null) {
  return parsed?.tipo === "ACAO_DESTRUTIVA_EM_MASSA" || parsed?.tipo === "EXCLUIR_REBANHO";
}

function logDestructiveBulkBlock(owner: WhatsAppOwner | null | undefined, details: AnyRecord = {}) {
  console.warn("[BOT SECURITY]", {
    event: "destructive_bulk_action_blocked",
    phone: owner?.telefone_e164 ?maskPhone(owner.telefone_e164) : null,
    fazenda_id: owner?.fazenda_id || null,
    ...details
  });
}

function isValidBotPhone(value: string | number | null | undefined) {
  const phone = normalizeWhatsappNumber(value);
  if (phone.length !== 13 || !phone.startsWith("55")) return false;
  const national = phone.slice(2);
  const ddd = Number(national.slice(0, 2));
  return ddd >= 11 && ddd <= 99 && national[2] === "9" && !/^(\d)\1+$/.test(national);
}

function permissionDeniedMessage(owner: WhatsAppOwner, parsed?: ParsedRanchoMessage | null) {
  if (!parsed?.tipo || isBotAdmin(owner)) return null;
  if (parsed.tipo === "CRIAR_ITEM_ESTOQUE") {
    return "Você não tem permissão para criar itens de estoque. Peça para um administrador cadastrar esse item.";
  }
  if (EMPLOYEE_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para cadastrar ou alterar funcionários pelo bot. Peça para um administrador fazer esse cadastro.";
  }
  if (GENEALOGY_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para alterar genealogia pelo bot. Peça para um administrador fazer essa alteração.";
  }
  if (FINANCE_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para acessar o financeiro.";
  }
  if (LOT_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para criar lotes pelo bot. Peça para um administrador fazer esse cadastro.";
  }
  if (ANIMAL_EVENT_IMPORT_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para importar eventos do rebanho.";
  }
  if (STOCK_IMPORT_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para importar movimentações de estoque.";
  }
  if (ANIMAL_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Você não tem permissão para cadastrar animais.";
  }
  return null;
}

function formatWhatsappForBot(value: string | number | null | undefined) {
  const phone = normalizeWhatsappNumber(value);
  if (phone.length !== 13 || !phone.startsWith("55")) return phone || "";
  const national = phone.slice(2);
  return `+55 (${national.slice(0, 2)}) ${national.slice(2, 7)}-${national.slice(7)}`;
}

function botLog(event: string, owner: WhatsAppOwner, details: AnyRecord) {
  const pending = details.pending as ParsedRanchoMessage | undefined;
  console.log("[BOT FLOW]", {
    event,
    phone: maskPhone(owner.telefone_e164),
    currentIntent: pending?.tipo || details.currentIntent,
    status: details.status,
    missingFields: pending?.perguntas_faltantes || details.missingFields,
    nextStep: details.nextStep,
    parser: details.parser,
    stockResolution: details.stockResolution,
    decision: details.decision
  });
}

function botTabularImportLog(event: string, owner: WhatsAppOwner, details: AnyRecord) {
  if (!BOT_TABULAR_IMPORT_DEBUG) return;
  console.log("[BOT TABULAR IMPORT]", {
    event,
    phone: maskPhone(owner.telefone_e164),
    fazenda_id: owner.fazenda_id,
    ...details
  });
}

function stockResolutionDebug(input: unknown, found?: StockLookupResult) {
  return {
    item_extraido: String(input || ""),
    item_normalizado: normalizeCatalogText(String(input || "")),
    origem_catalogo: found?.catalogSource || "banco_real",
    quantidade_itens_catalogo: found?.catalogCount ?? 0,
    candidatos_catalogo: found?.candidateNames || [],
    item_resolvido: found?.row?.nome || null,
    item_estoque_encontrado: Boolean(found?.row && !found.ambiguousRows?.length && found.score >= 0.86),
    item_id: found?.row?.id || null,
    status_resolucao: found?.resolutionStatus || "not_found",
    score: typeof found?.score === "number" ?Number(found.score.toFixed(3)) : 0,
    motivo_nao_resolvido: found?.row ?null : found?.reason || "item_nao_encontrado"
  };
}

function stockDecisionReason(parsed: ParsedRanchoMessage, found?: StockLookupResult, owner?: WhatsAppOwner) {
  if (parsed.tipo === "ESTOQUE_SAIDA" && parsed.dados?.venda && found?.row && !found.ambiguousRows?.length && found.score >= 0.86) {
    return parsed.dados?.deve_baixar_estoque === true
      ? "item_encontrado: estoque+receita"
      : "item_encontrado: perguntar_baixa_estoque_ou_financeiro";
  }
  if (parsed.tipo === "ESTOQUE_SAIDA" && parsed.dados?.venda && !found?.row) {
    return "item_nao_encontrado: financeiro_apenas";
  }
  if (parsed.tipo === "ESTOQUE_ENTRADA" && parsed.dados?.compra && found?.row && !found.ambiguousRows?.length && found.score >= 0.86) {
    return "item_encontrado: estoque+financeiro";
  }
  if (parsed.tipo === "ESTOQUE_ENTRADA" && parsed.dados?.compra && !found?.row && owner && isBotAdmin(owner)) {
    return "item_nao_encontrado: perguntar_criar_item_ou_financeiro";
  }
  if (parsed.tipo === "ESTOQUE_ENTRADA" && parsed.dados?.compra && !found?.row) {
    return "item_nao_encontrado: financeiro_apenas";
  }
  if (found?.ambiguousRows?.length) return "item_ambiguo: pedir_confirmacao";
  if (found?.row && found.score >= 0.86) return "item_encontrado";
  return "item_nao_encontrado";
}

function botAnimalCheckLog(owner: WhatsAppOwner, parsed: ParsedRanchoMessage, animal: AnyRecord, canRegister: boolean) {
  console.log("[BOT ANIMAL CHECK]", {
    animal: animal.brinco || animal.nome || animal.id || null,
    animal_id: animal.id || null,
    status: animalStatusValue(animal) || null,
    died_at: animalDeathDate(animal) || null,
    canRegister,
    intent: parsed.tipo,
    motivo_bloqueio: canRegister ?null : "animal_morto_ou_inativo"
  });
}

function animalBlockFromParsed(parsed: ParsedRanchoMessage) {
  const animal = parsed.dados?.animal_resolvido as AnyRecord | undefined;
  if (!animal || !isAnimalInactiveForBot(animal)) return null;
  return animalBlockedMessage(animal, parsed.tipo);
}

function isConfirmCommand(command: string) {
  return CONFIRM_WORDS.has(command) || /\b(?:sim|ss|confirma(?:r|do)?|correto|pode salvar|pode registrar|pode lancar|pode importar|importar validas|importar linhas validas|importar encontrados|importar so encontrados|salvar validas|cadastrar validos|cadastrar animais|so as validas|so validas|somente validas|apenas validas|pode|salvar|salva|registrar|registra|lancar|lanca|importar|cadastrar|ok|okay|blz|beleza|certo|ta certo|isso|isso mesmo|fechou|show|joia|manda|vai)\b/.test(command);
}

function isHerdDeleteConfirmationCommand(pending: ParsedRanchoMessage | undefined, command: string) {
  if (pending?.tipo !== "EXCLUIR_REBANHO") return false;
  return /\b(?:sim|ss|confirmo|confirma|confirmado|pode|quero|autorizo|manda|vai)\b/.test(command)
    && /\b(?:exclui|excluir|apaga|apagar|remove|remover|deleta|deletar|limpa|limpar|zera|zerar)\b/.test(command)
    && /\b(?:rebanho|animais|animal|gado|vacas?|bois?)\b/.test(command);
}

function isRejectCommand(command: string) {
  return REJECT_WORDS.has(command) || /^(?:nao|n|errado|corrigir|corrige|quero corrigir|refazer|refaz|incorreto|negativo|na verdade|foi|era)\b/.test(command) || /\berrad[ao]\b/.test(command);
}

function isCancelCommand(command: string) {
  return CANCEL_WORDS.has(command) || /^(?:cancelar|cancela|cancele|cancela essa|esquece|deixa(?: pra la| para la)?|desfaz|desfazer|aborta|abortar|pare|para|parar|apaga isso|nao salva|nao salve|nao salvar|nao registrar)\b/.test(command);
}

function isClearPendingCommand(command: string) {
  return isCancelCommand(command) || /^(?:nao|n|negativo|errei)$/.test(command);
}

function isMenuCommand(command: string) {
  return MENU_WORDS.has(command);
}

function isRepeatCommand(command: string) {
  return REPEAT_WORDS.has(command) || /^(?:repete|repetir|repita|mostra(?:r)? de novo|resumir)\b/.test(command);
}

function isTabularImportIssueCommand(command: string) {
  return /^(?:mostrar?|ver|lista|listar|quais?)\s+(?:erros?|alertas?|problemas?|invalidas?|pendencias?|linhas invalidas?|faltam|animais nao existem|animais faltantes)\b/.test(command)
    || /^(?:erros?|alertas?|problemas?|invalidas?|pendencias?|quais faltam)$/.test(command);
}

function isTabularMissingAnimalRegisterCommand(command: string) {
  return /^(?:1|cadastrar faltantes|cadastrar animais faltantes|cria(?:r)? esses animais|cadastrar todos|cadastrar em massa|cadastra(?:r)? eles|pode cadastrar)\b/.test(command);
}

function isTabularImportFoundOnlyCommand(command: string) {
  return /^(?:2|importar encontrados|importar so encontrados|importar somente encontrados|importar apenas encontrados|importar validas|so as validas|so validas|somente validas|apenas validas)\b/.test(command);
}

function isTabularCreateLotsAndRegisterCommand(command: string) {
  return /^(?:2)\b/.test(command)
    || /\b(?:criar lotes e cadastrar|criar lotes|cria os lotes|cadastrar com lotes|pode criar os lotes)\b/.test(command);
}

function isTabularCreateStockItemsCommand(command: string) {
  return /^(?:1|criar itens?|criar item|criar estoque|criar faltantes|criar itens faltantes|cadastrar itens?|cadastrar faltantes)\b/.test(command)
    || /\b(?:criar itens?|criar item|criar estoque|criar faltantes|criar itens faltantes|cadastrar itens?|cadastrar faltantes)\b/.test(command);
}

function isTableTypeAnimalsCommand(command: string) {
  return /^(?:animais|cadastro de animais|cadastrar animais|importar animais|modelo animais|tabela de animais)\b/.test(command);
}

function isTableTypeEventsCommand(command: string) {
  return /^(?:eventos|reproducao|reprodução|eventos reprodutivos|registrar eventos|importar eventos|tabela de eventos)\b/.test(command);
}

function isStockPaginationCommand(command: string) {
  return STOCK_PAGINATION_WORDS.has(command) || /^(?:mais|ver mais|proximos?|continuar|continua)\b/.test(command);
}

function pageNumberFromCommand(command: string) {
  const match = command.match(/\b(?:pagina|pg)\s*(\d+)\b/);
  const page = Number(match?.[1]);
  return Number.isFinite(page) && page > 0 ?page : undefined;
}

function isHerdPaginationCommand(command: string) {
  return isStockPaginationCommand(command)
    || /\b(?:pagina|pg)\s*\d+\s+(?:do|da|de|dos|das)?\s*(?:rebanho|gado|animais|animal|vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?|lotes?|piquetes?|pastos?)\b/.test(command);
}

function milkStockStatusText(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const stock = dados.estoque_leite as AnyRecord | undefined;
  if (!stock || !dados.estoque_leite_detectado) return "";

  const total = formatNumber(Number(stock.total_litros || dados.total_litros || 0), " L");
  const destino = stock.destino_detectado ?`\nDestino detectado: ${stock.destino_detectado}.` : "";

  if (stock.status_resolucao === "matched") {
    if (stock.estoque_movimentar) {
      return `\n\nTambém vou adicionar ${total} ao estoque de ${stock.item_leite_resolvido}.`;
    }
    if (stock.pedir_decisao) return "";
    return `\n\nItem de leite encontrado (${stock.item_leite_resolvido}), mas não vou movimentar estoque automaticamente.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    const options = Array.isArray(stock.opcoes) ?stock.opcoes as AnyRecord[] : [];
    const lines = options.slice(0, 5).map((option, index) => `${index + 1}. ${option.nome} (${option.unidade || "unidade não informada"})`).join("\n");
    return `\n\nEncontrei mais de um item de estoque compatível com leite (${total}).${destino}\n${lines}\nNão vou movimentar estoque automaticamente; vou registrar apenas a produção.`;
  }

  return `\n\nNão encontrei item de estoque compatível com leite (${total}).${destino}\nVou registrar apenas a produção.`;
}

function milkStockAfterSaveText(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  if (!stock) return "";

  if (stock.status_resolucao === "matched") {
    return stock.estoque_movimentar
      ?`\nEstoque de ${stock.item_leite_resolvido} atualizado com ${formatNumber(Number(stock.total_litros || parsed.dados?.total_litros || 0), " L")}.`
      :`\nEstoque de leite: item compatível identificado (${stock.item_leite_resolvido}), mas não foi movimentado.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    return "\nEstoque de leite: encontrei múltiplos itens compatíveis e não movimentei estoque automaticamente.";
  }

  return "\nNão encontrei item de estoque compatível com leite. Registrei apenas a produção.";
}

function postConfirmationConsultationNote(parsed: ParsedRanchoMessage) {
  const consultations = parsed.dados?.gemini_consultas_apos_confirmacao;
  const total = Array.isArray(consultations) ?consultations.length : 0;
  if (!total) return "";
  return `\nDepois de confirmar, também vou responder ${total === 1 ?"a consulta pedida" : "as consultas pedidas"}.`;
}

function tabularImportRows(parsed: ParsedRanchoMessage) {
  const rows = parsed.dados?.linhas_validadas || parsed.dados?.linhas || [];
  return Array.isArray(rows) ?rows as AnyRecord[] : [];
}

function tabularImportSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  const rows = tabularImportRows(parsed);
  const ready = rows.filter((row) => row.status_validacao === "pronto");
  const invalid = rows.filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  return {
    total: Number(summary.total || dados.total_linhas || rows.length || 0),
    ready: Number(summary.prontas ?? ready.length ?? 0),
    invalid: Number(summary.invalidas ?? invalid.length ?? 0),
    duplicates: Number(summary.duplicadas || 0),
    notFound: Number(summary.animais_nao_encontrados || 0),
    missingDate: Number(summary.datas_ausentes || 0),
    invalidDate: Number(summary.datas_invalidas || 0),
    unknownType: Number(summary.tipos_desconhecidos || 0),
    eventCounts: (summary.por_tipo || dados.contagem_eventos_parse || {}) as Record<string, number>
  };
}

function tabularEventTypeLabel(type: string) {
  if (type === "inseminacao") return "inseminacao";
  if (type === "prenhez") return "prenhez";
  if (type === "pre_parto") return "pre-parto";
  if (type === "parto") return "parto";
  if (type === "protocolo") return "protocolo";
  return type || "desconhecido";
}

function tabularImportCountText(eventCounts: Record<string, number>) {
  return Object.entries(eventCounts)
    .filter(([, total]) => Number(total) > 0)
    .map(([type, total]) => `${tabularEventTypeLabel(type)}: ${total}`)
    .join(", ");
}

function tabularImportIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    animal_sem_codigo: "sem codigo do animal",
    tipo_evento_desconhecido: "tipo nao reconhecido",
    data_ausente: "sem data",
    data_invalida: "data invalida",
    animal_nao_encontrado: "animal nao encontrado neste rancho",
    animal_ambiguo: "animal ambiguo",
    animal_inativo: "animal inativo",
    duplicado: "possivel duplicado"
  };
  return labels[issue] || issue;
}

function tabularImportIssueDetails(parsed: ParsedRanchoMessage, maxRows = 8) {
  const issueRows = tabularImportRows(parsed).filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  const rows = issueRows.slice(0, maxRows);
  if (!rows.length) return "";

  const lines = rows.map((row) => {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    return `- linha ${row.lineNumber || "?"} (${row.animal_codigo || row.animal_codigo_original || "sem codigo"}): ${issues.map((issue) => tabularImportIssueLabel(String(issue))).join(", ") || "nao importavel"}`;
  });

  const extra = issueRows.length > rows.length ?`\n...e mais ${issueRows.length - rows.length} linha(s) com alerta.` : "";
  return `${lines.join("\n")}${extra}`;
}

function normalizedReproductiveEventKind(dados: AnyRecord, description: string): NlpReproductiveEventKind | undefined {
  const explicitKind = String(dados.evento_reprodutivo_tipo || "");
  if (["inseminacao", "prenhez", "pre_parto", "parto", "protocolo", "reteste", "observacao"].includes(explicitKind)) {
    return explicitKind as NlpReproductiveEventKind;
  }
  if (dados.evento_tipo === "reprodutivo") return detectReproductiveEventKind(description) || "observacao";
  return undefined;
}

function tabularMissingAnimalCodes(parsed: ParsedRanchoMessage, maxRows = 8) {
  const codes = new Set<string>();
  for (const row of tabularImportRows(parsed)) {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    if (issues.includes("animal_nao_encontrado")) {
      const code = String(row.animal_codigo_original || row.animal_codigo || "").trim();
      if (code) codes.add(code);
    }
  }
  return Array.from(codes).slice(0, maxRows);
}

function tabularImportConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = tabularImportSummary(parsed);
  const counts = tabularImportCountText(summary.eventCounts);
  const issueText = tabularImportIssueDetails(parsed, 6);
  const issueBlock = issueText ?`\n\nLinhas que nao vou importar agora:\n${issueText}` : "";
  const duplicateText = summary.duplicates ?`Duplicadas ignoradas: ${summary.duplicates}.` : "";
  const notFoundText = summary.notFound ?`Animais nao encontrados: ${summary.notFound}.` : "";
  const missingCodes = summary.notFound ?tabularMissingAnimalCodes(parsed, 8) : [];
  const missingCodesText = missingCodes.length ?`Codigos faltantes: ${missingCodes.join(", ")}.` : "";
  const dateText = summary.missingDate || summary.invalidDate ?`Datas com problema: ${summary.missingDate + summary.invalidDate}.` : "";
  const typeText = summary.unknownType ?`Tipos nao reconhecidos: ${summary.unknownType}.` : "";

  if (summary.notFound) {
    return [
      "Li a tabela de eventos do rebanho.",
      `Linhas lidas: ${summary.total}.`,
      `Prontas para importar agora: ${summary.ready}.`,
      counts ?`Tipos: ${counts}.` : "",
      duplicateText,
      notFoundText,
      missingCodesText,
      dateText,
      typeText,
      issueBlock,
      "",
      "O que deseja fazer?",
      "1 - Cadastrar animais faltantes",
      summary.ready ? "2 - Importar somente eventos dos animais encontrados" : "2 - Ver pendencias",
      summary.ready ? "3 - Ver pendencias" : "3 - Cancelar",
      summary.ready ? "4 - Cancelar" : ""
    ].filter((line) => line !== "").join("\n");
  }

  if (!summary.ready) {
    return `Li a tabela, mas nenhuma linha esta pronta para importar.\nLinhas lidas: ${summary.total}.${issueBlock}\n\nNada foi salvo. Envie a tabela corrigida.`;
  }

  return [
    "Li a tabela de eventos do rebanho.",
    `Linhas lidas: ${summary.total}.`,
    `Prontas para importar: ${summary.ready}.`,
    counts ?`Tipos: ${counts}.` : "",
    duplicateText,
    notFoundText,
    dateText,
    typeText,
    issueBlock,
    "",
    summary.invalid || summary.duplicates ? "Quer importar apenas as linhas validas?" : "Esta correto?",
    "1 - Importar",
    "2 - Cancelar"
  ].filter((line) => line !== "").join("\n");
}

function animalImportRows(parsed: ParsedRanchoMessage) {
  const rows = parsed.dados?.linhas_validadas || parsed.dados?.linhas || [];
  return Array.isArray(rows) ?rows as AnyRecord[] : [];
}

function animalImportSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  const rows = animalImportRows(parsed);
  const ready = rows.filter((row) => row.status_validacao === "pronto");
  const invalid = rows.filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  return {
    total: Number(summary.total || dados.total_linhas || rows.length || 0),
    ready: Number(summary.prontas ?? ready.length ?? 0),
    invalid: Number(summary.invalidas ?? invalid.length ?? 0),
    duplicates: Number(summary.duplicadas || 0),
    missingLots: Number(summary.lotes_nao_encontrados || 0),
    lotsFound: Number(summary.lotes_encontrados || 0),
    parseInvalid: Number(summary.parse_invalidas || dados.total_linhas_parse_invalidas || 0),
    missingCategory: Number(summary.categorias_ausentes || 0),
    invalidCategory: Number(summary.categorias_invalidas || 0),
    createMissingLots: Boolean(dados.criar_lotes_faltantes),
    missingLotNames: Array.isArray(summary.nomes_lotes_nao_encontrados) ?summary.nomes_lotes_nao_encontrados as string[] : []
  };
}

function animalImportIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    animal_sem_codigo: "sem codigo",
    categoria_ausente: "sem categoria",
    categoria_invalida: "categoria invalida",
    sexo_invalido: "sexo invalido",
    status_invalido: "status invalido",
    peso_invalido: "peso invalido",
    data_nascimento_invalida: "nascimento invalido",
    animal_duplicado: "animal ja existe",
    duplicado_na_tabela: "codigo repetido na tabela",
    lote_nao_encontrado: "lote nao encontrado"
  };
  return labels[issue] || issue;
}

function animalImportIssueDetails(parsed: ParsedRanchoMessage, maxRows = 8) {
  const issueRows = animalImportRows(parsed).filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  const rows = issueRows.slice(0, maxRows);
  if (!rows.length) return "";

  const lines = rows.map((row) => {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    return `- linha ${row.lineNumber || "?"} (${row.animal_codigo || row.animal_codigo_original || "sem codigo"}): ${issues.map((issue) => animalImportIssueLabel(String(issue))).join(", ") || "nao cadastravel"}`;
  });

  const extra = issueRows.length > rows.length ?`\n...e mais ${issueRows.length - rows.length} linha(s) com pendencia.` : "";
  return `${lines.join("\n")}${extra}`;
}

function animalImportConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = animalImportSummary(parsed);
  const issueText = animalImportIssueDetails(parsed, 6);
  const issueBlock = issueText ?`\n\nLinhas que nao vou cadastrar agora:\n${issueText}` : "";
  const duplicateText = summary.duplicates ?`Ja existem no rebanho ou repetidos: ${summary.duplicates}.` : "";
  const lotText = summary.missingLots ?`Lotes nao encontrados: ${summary.missingLotNames.slice(0, 5).join(", ")}.` : "";
  const lotFoundText = summary.lotsFound ?`Lotes encontrados: ${summary.lotsFound}.` : "";
  const categoryText = summary.missingCategory || summary.invalidCategory ?`Categorias com problema: ${summary.missingCategory + summary.invalidCategory}.` : "";

  if (!summary.ready && !summary.missingLots) {
    return `Li a tabela de cadastro de animais, mas nenhuma linha esta pronta para cadastrar.\nLinhas lidas: ${summary.total}.${issueBlock}\n\nNada foi salvo. Envie a tabela corrigida.`;
  }

  return [
    "Recebi uma tabela de cadastro de animais.",
    `Animais lidos: ${summary.total}.`,
    `Prontos para cadastrar: ${summary.ready}.`,
    duplicateText,
    lotFoundText,
    lotText,
    categoryText,
    issueBlock,
    "",
    summary.missingLots ? "O que deseja fazer?" : "Deseja cadastrar os animais validos?",
    summary.missingLots ? "1 - Cadastrar apenas os validos" : "1 - Cadastrar",
    summary.missingLots ? "2 - Criar lotes e cadastrar" : "",
    summary.missingLots ? "3 - Ver pendencias" : "2 - Ver pendencias",
    summary.missingLots ? "4 - Cancelar" : "3 - Cancelar"
  ].filter((line) => line !== "").join("\n");
}

function stockImportRows(parsed: ParsedRanchoMessage) {
  const rows = parsed.dados?.linhas_validadas || parsed.dados?.linhas || [];
  return Array.isArray(rows) ?rows as AnyRecord[] : [];
}

function stockImportSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  const rows = stockImportRows(parsed);
  const ready = rows.filter((row) => row.status_validacao === "pronto");
  const invalid = rows.filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  return {
    total: Number(summary.total || dados.total_linhas || rows.length || 0),
    ready: Number(summary.prontas ?? ready.length ?? 0),
    invalid: Number(summary.invalidas ?? invalid.length ?? 0),
    missingItems: Number(summary.itens_nao_encontrados || 0),
    duplicates: Number(summary.duplicadas || 0),
    invalidDates: Number(summary.datas_invalidas || 0),
    invalidQuantities: Number(summary.quantidades_invalidas || 0),
    invalidUnits: Number(summary.unidades_invalidas || 0),
    unknownTypes: Number(summary.tipos_desconhecidos || 0),
    createMissingItems: Boolean(dados.criar_itens_faltantes),
    missingItemNames: Array.isArray(summary.nomes_itens_nao_encontrados) ?summary.nomes_itens_nao_encontrados as string[] : [],
    movementCounts: (summary.por_tipo || dados.contagem_estoque_parse || {}) as Record<string, number>
  };
}

function stockImportIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    item_ausente: "item não informado",
    item_nao_encontrado: "item de estoque não cadastrado",
    quantidade_ausente: "quantidade ausente",
    quantidade_invalida: "quantidade inválida",
    unidade_ausente: "unidade ausente",
    unidade_invalida: "unidade inválida",
    tipo_movimento_ausente: "tipo de movimento ausente",
    tipo_movimento_desconhecido: "tipo de movimento desconhecido",
    data_invalida: "data inválida",
    valor_invalido: "valor inválido",
    duplicado_na_tabela: "linha repetida na tabela"
  };
  return labels[issue] || issue;
}

function stockImportIssueDetails(parsed: ParsedRanchoMessage, maxRows = 8) {
  const issueRows = stockImportRows(parsed).filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  const rows = issueRows.slice(0, maxRows);
  if (!rows.length) return "";

  const lines = rows.map((row) => {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    return `- linha ${row.lineNumber || "?"} (${row.item_nome || row.item_original || "sem item"}): ${issues.map((issue) => stockImportIssueLabel(String(issue))).join(", ") || "não importável"}`;
  });

  const extra = issueRows.length > rows.length ?`\n...e mais ${issueRows.length - rows.length} linha(s) com pendência.` : "";
  return `${lines.join("\n")}${extra}`;
}

function stockImportConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = stockImportSummary(parsed);
  const issueText = stockImportIssueDetails(parsed, 6);
  const issueBlock = issueText ?`\n\nPendências:\n${issueText}` : "";
  const missingText = summary.missingItems ?`Itens de estoque não cadastrados: ${summary.missingItemNames.slice(0, 5).join(", ")}.` : "";
  const invalidText = summary.invalidDates || summary.invalidQuantities || summary.invalidUnits || summary.unknownTypes
    ?`Problemas de formato: ${summary.invalidDates + summary.invalidQuantities + summary.invalidUnits + summary.unknownTypes}.`
    : "";
  const duplicateText = summary.duplicates ?`Possíveis duplicidades: ${summary.duplicates}.` : "";
  const options = summary.missingItems
    ?[
      "O que deseja fazer?",
      "1 - Criar itens faltantes",
      summary.ready ? "2 - Importar somente linhas válidas" : "",
      "3 - Ver pendências",
      "4 - Cancelar importação"
    ]
    : [
      summary.invalid || summary.duplicates ? "O que deseja fazer?" : "Deseja importar as linhas válidas?",
      "1 - Importar linhas válidas",
      summary.invalid || summary.duplicates ? "2 - Ver pendências" : "",
      summary.invalid || summary.duplicates ? "3 - Cancelar importação" : "2 - Cancelar importação"
    ];

  return [
    "Recebi uma tabela de estoque.",
    "Pré-validação concluída. Nenhum dado foi salvo ainda.",
    `Linhas lidas: ${summary.total}.`,
    `Linhas prontas: ${summary.ready}.`,
    missingText,
    invalidText,
    duplicateText,
    issueBlock,
    "",
    ...options
  ].filter((line) => line !== "").join("\n");
}

function domainTableSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  return {
    domain: String(dados.dominio_tabela || "DESCONHECIDO"),
    total: Number(summary.total || dados.total_linhas || 0),
    ready: Number(summary.prontas || dados.total_linhas_parse_validas || 0),
    invalid: Number(summary.invalidas || dados.total_linhas_parse_invalidas || 0),
    review: Number(summary.revisao || dados.total_linhas_needs_review || 0),
    metrics: (summary.metricas || {}) as AnyRecord
  };
}

function domainTableConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = domainTableSummary(parsed);
  const label = tabularDomainLabel(summary.domain as Parameters<typeof tabularDomainLabel>[0]);
  const metricLines: string[] = [];

  if (summary.domain === "FINANCEIRO") {
    if (summary.metrics.receitas_linhas) metricLines.push(`Receitas: ${formatMoney(summary.metrics.receitas || 0)}`);
    if (summary.metrics.despesas_linhas) metricLines.push(`Despesas: ${formatMoney(summary.metrics.despesas || 0)}`);
    if (summary.metrics.tipo_indefinido) metricLines.push(`Linhas sem tipo financeiro claro: ${summary.metrics.tipo_indefinido}.`);
  } else if (summary.domain === "LOTES") {
    metricLines.push(`Lotes lidos: ${summary.metrics.lotes || summary.total}.`);
  } else if (summary.domain === "GENEALOGIA") {
    metricLines.push(`Vinculos familiares lidos: ${summary.metrics.vinculos || summary.total}.`);
  } else if (summary.domain === "FUNCIONARIOS") {
    metricLines.push(`Funcionarios lidos: ${summary.metrics.funcionarios || summary.total}.`);
  } else if (summary.domain === "PONTO_FUNCIONARIO") {
    metricLines.push(`Registros de ponto lidos: ${summary.metrics.registros_ponto || summary.total}.`);
  } else if (summary.domain === "SAUDE_SANITARIO") {
    metricLines.push(`Eventos de saude/sanitario lidos: ${summary.metrics.eventos_sanitarios || summary.total}.`);
  } else if (summary.domain === "OBSERVACOES") {
    metricLines.push(`Observacoes lidas: ${summary.metrics.observacoes || summary.total}.`);
  } else if (summary.domain === "AGENDA_TAREFAS") {
    metricLines.push(`Tarefas lidas: ${summary.metrics.tarefas || summary.total}.`);
  }

  return [
    `Li uma tabela de ${label}.`,
    `Linhas lidas: ${summary.total}.`,
    `Prontas: ${summary.ready}.`,
    summary.review ?`Precisam de revisao: ${summary.review}.` : "",
    summary.invalid ?`Invalidas: ${summary.invalid}.` : "",
    ...metricLines,
    "",
    "Nenhum dado foi salvo ainda.",
    "Deseja confirmar esse preview para continuar a importacao desse dominio?",
    "1 - Confirmar",
    "2 - Cancelar"
  ].filter(Boolean).join("\n");
}

function ambiguousTableQuestion(parsed: ParsedRanchoMessage) {
  const question = String(parsed.dados?.clarificationQuestion || parsed.dados?.classificacao_tabela?.clarificationQuestion || "").trim();
  return question || [
    "Li a tabela, mas nao consegui identificar com seguranca a qual area ela pertence. Ela e sobre:",
    "1 - Rebanho/animais",
    "2 - Lotes",
    "3 - Genealogia",
    "4 - Reproducao",
    "5 - Producao de leite",
    "6 - Estoque",
    "7 - Financeiro/transacoes",
    "8 - Funcionarios",
    "9 - Ponto/folha",
    "10 - Saude/sanitario",
    "11 - Observacoes",
    "12 - Agenda/tarefas"
  ].join("\n");
}

function animalImportPendingFromMissingEventAnimals(parsed: ParsedRanchoMessage) {
  const unique = new Map<string, AnyRecord>();
  for (const row of tabularImportRows(parsed)) {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    if (!issues.includes("animal_nao_encontrado")) continue;
    const code = exactAnimalImportCodeKey(row.animal_codigo || row.animal_codigo_original);
    if (!code || unique.has(code)) continue;
    unique.set(code, {
      lineNumber: row.lineNumber,
      rawText: row.rawText || String(row.animal_codigo_original || row.animal_codigo || ""),
      animal_codigo_original: row.animal_codigo_original || row.animal_codigo || code,
      animal_codigo: code,
      nome: null,
      categoria_original: "outro",
      categoria: "outro",
      sexo_original: "",
      sexo: "nao_informado",
      raca: null,
      lote_nome: null,
      status_original: "ativo",
      status: "ativo",
      peso: null,
      data_nascimento: null,
      observacoes: "Cadastrado a partir de tabela de eventos enviada pelo WhatsApp",
      problemas: []
    });
  }

  const rows = Array.from(unique.values());
  const dados = {
    origem_parser: "tabela_local",
    tipo_tabela: "animals_import",
    importacao_tabela_animais: true,
    tabela_destino: "animais",
    total_linhas: rows.length,
    total_linhas_parse_validas: rows.length,
    total_linhas_parse_invalidas: 0,
    contagem_animais_parse: { outro: rows.length },
    linhas: rows,
    linhas_parse_invalidas: [],
    instrucoes_confirmacao: "confirmar_para_cadastrar_animais_faltantes",
    origem_animais_faltantes_eventos: true,
    eventos_apos_cadastro: parsed
  };

  return refreshRanchoMessage({
    tipo: "IMPORTACAO_ANIMAIS_TABELA",
    confianca: 0.94,
    dados,
    resumo: "",
    perguntas_faltantes: []
  }, dados);
}

function confirmationText(parsed: ParsedRanchoMessage) {
  if (isDestructiveBulkParsed(parsed)) {
    return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  }

  if (parsed.tipo === "EXCLUIR_REBANHO") {
    return [
      "Entendi que você quer excluir todos os animais do rebanho.",
      "Essa ação também remove os vínculos dos animais no bot e não pode ser desfeita.",
      "",
      "Está correto?",
      "1 - Confirmar",
      "2 - Corrigir"
    ].join("\n");
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") return tabularImportConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") return animalImportConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") return stockImportConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") return domainTableConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_TABELA_AMBIGUA") return ambiguousTableQuestion(parsed);

  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(parsed.dados?.registros) ?parsed.dados.registros as ParsedRanchoMessage[] : [];
    const lines = registros
      .slice(0, 6)
      .map((registro, index) => `${index + 1}. ${registro.resumo}`)
      .join("\n");
    const extra = registros.length > 6 ?`\n...e mais ${registros.length - 6} registro(s).` : "";
    const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
    if (stock?.status_resolucao === "matched" && stock.estoque_movimentar) {
      return `Entendi ${registros.length} registros de produção, totalizando ${formatNumber(Number(stock.total_litros || parsed.dados?.total_litros || 0), " L")}, e entrada de ${formatNumber(Number(stock.total_litros || parsed.dados?.total_litros || 0), " L")} no estoque de ${stock.item_leite_resolvido}.\n${lines}${extra}${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
    }
    return `Entendi ${registros.length} registros:\n${lines}${extra}${milkStockStatusText(parsed)}${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
  }

  if (parsed.tipo === "PRODUCAO_LEITE") {
    const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
    if (stock?.status_resolucao === "matched" && stock.estoque_movimentar) {
      return `Entendi: registrar produção de leite do animal ${parsed.dados?.animal_codigo || "informado"} com ${formatNumber(Number(parsed.dados?.litros || 0), " L")} e adicionar ${formatNumber(Number(stock.total_litros || parsed.dados?.litros || 0), " L")} ao estoque de ${stock.item_leite_resolvido}.${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
    }
  }

  if (parsed.tipo === "PARTO" && partoWithChild(parsed.dados || {})) {
    return `${partoChildConfirmationText(parsed)}${postConfirmationConsultationNote(parsed)}`;
  }

  return `Entendi que você quer ${parsed.resumo}.${milkStockStatusText(parsed)}${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
}

function dryRunConfirmationText(parsed?: ParsedRanchoMessage) {
  if (!parsed) return "Confirmação recebida no modo teste. Nenhum registro real foi salvo.";

  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;

  if (isDestructiveBulkParsed(parsed)) {
    return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  }

  if (parsed.tipo === "LOTE_REGISTROS") {
    const total = Number(parsed.dados?.total_registros || (Array.isArray(parsed.dados?.registros) ?parsed.dados.registros.length : 0));
    return `Simulação concluída: ${total} registros seriam salvos${stock?.estoque_movimentar ? " e a entrada consolidada de leite seria lançada no estoque" : ""}. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const summary = tabularImportSummary(parsed);
    return `Simulacao concluida: ${summary.ready} evento(s) do rebanho seriam importados. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const summary = animalImportSummary(parsed);
    const lotText = summary.createMissingLots && summary.missingLots ?` e ${summary.missingLots} lote(s) seriam criados` : "";
    return `Simulacao concluida: ${summary.ready} animal(is) seriam cadastrados${lotText}. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const summary = stockImportSummary(parsed);
    const itemText = summary.createMissingItems && summary.missingItems ?` e ${summary.missingItems} item(ns) seriam criados` : "";
    return `Simulacao concluida: ${summary.ready} movimentacao(oes) de estoque seriam importadas${itemText}. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    const summary = domainTableSummary(parsed);
    return `Simulacao concluida: tabela de ${tabularDomainLabel(summary.domain as Parameters<typeof tabularDomainLabel>[0])} classificada com ${summary.total} linha(s). Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "EXCLUIR_REBANHO") {
    return "Simulação concluída: todos os animais do rebanho seriam excluídos. Nenhum registro real foi salvo.";
  }

  if (parsed.tipo === "PARTO" && partoWithChild(parsed.dados || {})) {
    const dados = parsed.dados || {};
    return `Simulacao concluida: o parto seria registrado e a cria ${dados.cria_codigo || "informada"} seria cadastrada/vinculada como descendente direto. Nenhum registro real foi salvo.`;
  }

  return `Confirmação recebida no modo teste. Nenhum registro real foi salvo.\nResumo: ${parsed.resumo}.`;
}

function missingText(parsed: ParsedRanchoMessage) {
  return `Entendi que é ${intentLabel(parsed.tipo)}.\n${parsed.perguntas_faltantes[0] || "Qual dado faltou?"}`;
}

function unknownText() {
  return `Não consegui entender certinho. Você quer registrar produção, financeiro, estoque, funcionário ou ponto?\n\nExemplos:\n${BOT_EXAMPLES.join("\n")}`;
}

function helpText() {
  return `Pode mandar do seu jeito. Eu entendo frases como:\n${BOT_EXAMPLES.join("\n")}\n\nAntes de salvar qualquer coisa, eu sempre vou pedir confirmação.`;
}

function tabularTableExamplesText(text: string) {
  const command = normalizeRanchoText(text);
  const asksTableModel = /\b(?:modelo|exemplo|formato|tabela)\b/.test(command)
    && /\b(?:tabela|planilha|colunas|importar|cadastro|eventos?|animais?|reproducao)\b/.test(command);
  if (!asksTableModel) return "";

  const animalModel = [
    "Cadastro de animais:",
    "Codigo;Nome;Categoria;Sexo;Raca;Lote;Nascimento;Peso;Status;Observacoes",
    "B-101;Estrela;vaca;femea;Girolando;Lactacao 1;10/03/2022;480;ativo;",
    "B-102;;bezerro;macho;;;15/01/2026;;ativo;"
  ].join("\n");

  const eventModel = [
    "Eventos do rebanho:",
    "Codigo / Animal;Status / Tipo;Data;Observacoes",
    "B-101;Inseminacao;01/06/2026;IA com touro Nelore",
    "B-102;Protocolo;02/06/2026;Inicio IATF"
  ].join("\n");

  if (/\b(?:animal|animais|cadastro)\b/.test(command) && !/\b(?:evento|eventos|reproducao)\b/.test(command)) return animalModel;
  if (/\b(?:evento|eventos|reproducao|reprodutivo)\b/.test(command) && !/\b(?:animal|animais|cadastro)\b/.test(command)) return eventModel;
  return `${animalModel}\n\n${eventModel}`;
}

function intentLabel(tipo: ParsedRanchoMessage["tipo"]) {
  const labels: Record<ParsedRanchoMessage["tipo"], string> = {
    PRODUCAO_LEITE: "produção de leite",
    PARTO: "parto",
    VACINA_MEDICAMENTO: "vacina ou medicamento",
    MORTE: "morte de animal",
    DESPESA: "saída financeira",
    RECEITA_VENDA: "entrada financeira",
    CRIAR_ITEM_ESTOQUE: "criação de item no estoque",
    ESTOQUE_CADASTRO: "cadastro de item no estoque",
    ESTOQUE_ENTRADA: "entrada de estoque",
    ESTOQUE_SAIDA: "baixa de estoque",
    CRIAR_FUNCIONARIO: "cadastro de funcionário",
    ATUALIZAR_FUNCIONARIO: "atualização de funcionário",
    DESLIGAR_FUNCIONARIO: "desligamento de funcionário",
    EXCLUIR_FUNCIONARIO: "exclusão de funcionário",
    PAGAMENTO_FUNCIONARIO: "pagamento de funcionário",
    PONTO_FUNCIONARIO: "registro de ponto",
    CADASTRO_ANIMAL: "cadastro de animal",
    EXCLUIR_REBANHO: "exclusão do rebanho",
    ACAO_DESTRUTIVA_EM_MASSA: "ação destrutiva em massa bloqueada",
    ATUALIZACAO_ANIMAL: "atualização de animal",
    CONSULTA_ANIMAL: "consulta de animal",
    CRIAR_LOTE: "cadastro de lote",
    CONSULTA_REBANHO: "consulta de rebanho",
    CONSULTA_LOTES: "consulta de lotes",
    ATUALIZACAO_GENEALOGIA: "atualização de genealogia",
    CONSULTA_GENEALOGIA: "consulta de genealogia",
    CONSULTA_PRODUCAO: "consulta de produção",
    CONSULTA_PRODUCAO_HOJE: "consulta de produção",
    CONSULTA_PRODUCAO_ANIMAL: "consulta de produção por animal",
    CONSULTA_FINANCEIRO: "consulta financeira",
    CONSULTA_ESTOQUE: "consulta de estoque",
    CONSULTA_ESTOQUE_ITEM: "consulta de estoque",
    CONSULTA_ESTOQUE_GERAL: "consulta de estoque",
    CONSULTA_FUNCIONARIO: "consulta de funcionário",
    CONSULTA_FOLHA: "consulta de folha",
    CONSULTA_PONTO: "consulta de ponto",
    CONSULTA_REGISTROS_HOJE: "consulta de registros",
    ORDEM_SERVICO: "ordem de serviço",
    LOTE_REGISTROS: "registros em lote",
    IMPORTACAO_EVENTOS_TABELA: "importação de eventos por tabela",
    IMPORTACAO_ANIMAIS_TABELA: "cadastro de animais por tabela",
    IMPORTACAO_ESTOQUE_TABELA: "importação de estoque por tabela",
    IMPORTACAO_TABELA_DOMINIO: "importação tabular por domínio",
    IMPORTACAO_TABELA_AMBIGUA: "tabela enviada",
    AJUDA: "ajuda",
    DESCONHECIDO: "uma mensagem"
  };
  return labels[tipo];
}

async function saveWhatsAppMessage(
  supabase: SupabaseAdmin,
  input: {
    owner?: WhatsAppOwner | null;
    phone: string;
    messageSid?: string;
    direction: "entrada" | "saida";
    body: string;
    raw?: AnyRecord;
  }
) {
  const waMessageId = input.direction === "entrada"
    ?input.messageSid || `in-${crypto.randomUUID()}`
    : `out-${input.messageSid || crypto.randomUUID()}-${Date.now()}`;

  try {
    const { error } = await supabase.from(TABLES.whatsappMensagens).insert({
      fazenda_id: input.owner?.fazenda_id || null,
      telefone_e164: input.owner?.telefone_e164 || input.phone,
      wa_message_id: waMessageId,
      direcao: input.direction,
      tipo: "text",
      payload: {
        body: input.body,
        ...(input.raw || {})
      },
      processada_em: nowIso()
    });

    if (error) {
      console.error("[Twilio webhook] Falha ao salvar mensagem", {
        code: (error as AnyRecord).code || null,
        message: safeErrorText(error)
      });
    }
  } catch (error) {
    console.error("[Twilio webhook] Falha inesperada ao salvar mensagem", {
      message: safeErrorText(error) || "erro desconhecido"
    });
  }
}

async function getSession(supabase: SupabaseAdmin, owner: WhatsAppOwner): Promise<BotSession> {
  const { data, error } = await supabase
    .from(TABLES.whatsappSessoes)
    .select("etapa,dados,status,expira_em")
    .eq("telefone_e164", owner.telefone_e164)
    .eq("fazenda_id", owner.fazenda_id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const expired = data?.expira_em ?new Date(data.expira_em as string).getTime() < Date.now() : false;
  if (!data || expired) return { etapa: "livre", dados: {} };

  const etapa = ["aguardando_dado", "aguardando_confirmacao"].includes(String(data.etapa))
    ?String(data.etapa) as BotSession["etapa"]
    : "livre";

  return {
    etapa,
    dados: (data.dados || {}) as AnyRecord
  };
}

async function saveSession(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession) {
  const { error } = await supabase.from(TABLES.whatsappSessoes).upsert({
    fazenda_id: owner.fazenda_id,
    whatsapp_usuario_id: owner.whatsapp_usuario_id,
    telefone_e164: owner.telefone_e164,
    fluxo: session.etapa === "livre" ?null : "nlp_local",
    etapa: session.etapa,
    dados: session.dados || {},
    status: "ativa",
    ultimo_interacao_em: nowIso(),
    expira_em: expirationIso()
  }, { onConflict: "telefone_e164" });

  if (error) throw new Error(error.message);
  botLog("session_update", owner, {
    status: session.etapa,
    pending: session.dados?.pending,
    nextStep: session.etapa
  });
}

async function logAudit(supabase: SupabaseAdmin, owner: WhatsAppOwner, entidade: string, acao: string, depois: AnyRecord) {
  await supabase.from(TABLES.auditoriaLogs).insert({
    fazenda_id: owner.fazenda_id,
    usuario_id: owner.usuario_id || null,
    entidade,
    acao,
    depois,
    origem: "whatsapp"
  });
}

function notificationActor(owner: WhatsAppOwner) {
  return owner.nome_exibicao || "Usuário do WhatsApp";
}

function botNotificationFor(table: string, record: AnyRecord, owner: WhatsAppOwner) {
  const actor = notificationActor(owner);

  if (table === TABLES.ordenhas) {
    return {
      tipo: "producao_bot",
      titulo: "Produção de leite cadastrada",
      mensagem: `${actor} cadastrou produção de leite${record.litros ?` de ${formatNumber(record.litros, " L")}` : ""}.`
    };
  }

  if (table === TABLES.eventosAnimal) {
    return {
      tipo: "evento_animal_bot",
      titulo: "Evento do rebanho cadastrado",
      mensagem: `${actor} registrou ${record.tipo || "um evento"} no rebanho.`
    };
  }

  if (table === TABLES.transacoesFinanceiras) {
    const type = record.tipo === "saida" ?"saída" : "entrada";
    return {
      tipo: record.tipo === "saida" ?"financeiro_saida_bot" : "financeiro_entrada_bot",
      titulo: `${type === "saída" ?"Saída" : "Entrada"} financeira cadastrada`,
      mensagem: `${actor} registrou uma ${type} financeira de ${formatMoney(record.valor)}.`
    };
  }

  if (table === TABLES.estoqueItens) {
    return {
      tipo: "estoque_item_bot",
      titulo: "Item criado no estoque",
      mensagem: `${actor} criou o item ${record.nome || "informado"} no estoque.`
    };
  }

  if (table === TABLES.estoqueMovimentacoes) {
    return {
      tipo: record.tipo === "saida" ?"estoque_baixa_bot" : "estoque_entrada_bot",
      titulo: record.tipo === "saida" ?"Baixa de estoque registrada" : "Entrada de estoque registrada",
      mensagem: `${actor} ${record.tipo === "saida" ?"deu baixa em item do estoque" : "adicionou item ao estoque"}.`
    };
  }

  if (table === TABLES.registrosPonto) {
    return {
      tipo: "ponto_bot",
      titulo: "Ponto registrado pelo WhatsApp",
      mensagem: `${actor} registrou ponto pelo WhatsApp.`
    };
  }

  if (table === TABLES.funcionarios) {
    return {
      tipo: "funcionario_bot",
      titulo: "Funcionário cadastrado pelo WhatsApp",
      mensagem: `${actor} cadastrou o funcionário ${record.nome || "informado"}.`
    };
  }

  if (table === TABLES.animais) {
    return {
      tipo: "animal_bot",
      titulo: "Animal cadastrado pelo WhatsApp",
      mensagem: `${actor} cadastrou o animal ${record.brinco || record.nome || "informado"}.`
    };
  }

  return null;
}

async function createBotNotificationForInsert(supabase: SupabaseAdmin, owner: WhatsAppOwner, table: string, record: AnyRecord) {
  const notification = botNotificationFor(table, record, owner);
  if (!notification || !record?.id) return;

  const { error } = await supabase.from(TABLES.notificacoes).insert({
    fazenda_id: owner.fazenda_id,
    usuario_id: owner.usuario_id || null,
    ator_nome: owner.nome_exibicao || null,
    ator_telefone: owner.telefone_e164,
    tipo: notification.tipo,
    titulo: notification.titulo,
    mensagem: notification.mensagem,
    entidade_tipo: table,
    entidade_id: record.id,
    origem: "bot",
    dedupe_key: `bot:${table}:${record.id}`
  });

  if (error && !/duplicate|23505/i.test(`${error.message} ${error.code || ""}`)) {
    console.warn("[BOT FLOW] Falha ao criar notificação interna", {
      table,
      code: error.code,
      message: safeErrorText(error)
    });
  }
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ?number : null;
}

function invalidPositiveNumber(value: unknown) {
  const number = finiteNumber(value);
  return number === null || number <= 0;
}

function invalidNonNegativeNumber(value: unknown) {
  const number = finiteNumber(value);
  return number === null || number < 0;
}

function safeBotPayload(table: string, payload: AnyRecord) {
  const allowed = BOT_INSERT_COLUMNS[table];
  if (!allowed) throw new Error("Tabela não permitida para inserção via bot.");

  const cleaned = Object.fromEntries(
    Object.entries(payload)
      .filter(([key, value]) => allowed.has(key) && value !== undefined)
      .map(([key, value]) => [key, sanitizePayloadValue(value)])
      .filter(([, value]) => value !== undefined)
  ) as AnyRecord;

  if (!cleaned.fazenda_id) throw new Error("Payload do bot sem fazenda vinculada.");
  return cleaned;
}

function validatePendingForSave(pending: ParsedRanchoMessage) {
  if (pending.tipo === "IMPORTACAO_TABELA_AMBIGUA") return "Preciso que voce escolha o dominio da tabela antes de continuar.";
  const dados = pending.dados || {};
  if (isDestructiveBulkParsed(pending)) return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA" && tabularImportSummary(pending).ready <= 0) return "Não encontrei linhas válidas para importar. Nada foi salvo.";
  if (pending.tipo === "IMPORTACAO_ANIMAIS_TABELA" && animalImportSummary(pending).ready <= 0) return "Não encontrei animais válidos para cadastrar. Nada foi salvo.";
  if (pending.tipo === "IMPORTACAO_ESTOQUE_TABELA" && stockImportSummary(pending).ready <= 0) return "Não encontrei linhas válidas de estoque para importar. Nada foi salvo.";
  if (pending.tipo === "PRODUCAO_LEITE" && invalidPositiveNumber(dados.litros)) return "Informe uma quantidade de litros válida antes de salvar.";
  if ((pending.tipo === "DESPESA" || pending.tipo === "RECEITA_VENDA") && invalidPositiveNumber(dados.valor)) return "Informe um valor financeiro válido antes de salvar.";
  if (pending.tipo === "PAGAMENTO_FUNCIONARIO" && invalidPositiveNumber(dados.valor)) return "Informe um valor de pagamento válido antes de salvar.";
  if ((pending.tipo === "ESTOQUE_ENTRADA" || pending.tipo === "ESTOQUE_SAIDA") && invalidPositiveNumber(dados.quantidade)) return "Informe uma quantidade de estoque válida antes de salvar.";
  if ((pending.tipo === "ESTOQUE_ENTRADA" || pending.tipo === "ESTOQUE_SAIDA") && dados.valor !== undefined && dados.valor !== null && dados.valor !== "" && invalidPositiveNumber(dados.valor)) return "Informe um valor financeiro válido antes de salvar.";
  if ((pending.tipo === "ESTOQUE_CADASTRO" || pending.tipo === "CRIAR_ITEM_ESTOQUE") && invalidNonNegativeNumber(dados.quantidade || 0)) return "Informe uma quantidade inicial válida antes de salvar.";
  if (pending.tipo === "CADASTRO_ANIMAL" && dados.peso !== undefined && dados.peso !== null && dados.peso !== "" && invalidNonNegativeNumber(dados.peso)) return "Informe um peso válido antes de salvar.";
  if (pending.tipo === "ATUALIZACAO_ANIMAL" && dados.campo_alterado === "peso" && invalidNonNegativeNumber(dados.novo_valor)) return "Informe um peso válido antes de salvar.";
  if (pending.tipo === "ATUALIZACAO_ANIMAL" && dados.campo_alterado === "status" && !["ativo", "vendido", "morto", "inativo"].includes(String(dados.novo_valor || ""))) return "Informe um status válido para o animal.";
  if (pending.tipo === "CADASTRO_ANIMAL" && dados.categoria && !["vaca", "boi", "bezerro", "bezerra", "novilha", "touro", "outro"].includes(String(dados.categoria))) return "Informe uma categoria válida para o animal.";
  return null;
}

async function insertRealRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, table: string, payload: AnyRecord) {
  const safePayload = safeBotPayload(table, payload);
  const { data, error } = await supabase.from(table).insert(safePayload).select("*").single();
  if (error) throw new Error(error.message);
  await logAudit(supabase, owner, table, "insert", data || safePayload);
  await createBotNotificationForInsert(supabase, owner, table, (data || safePayload) as AnyRecord);
  return data;
}

function realSaveResult(response: string, savedTables: string[]): SaveResult {
  return { response, savedReal: true, savedTables };
}

async function deleteFarmRows(supabase: SupabaseAdmin, table: string, farmId: string) {
  const { error } = await supabase.from(table).delete().eq("fazenda_id", farmId);
  if (error) throw new Error(error.message);
}

async function deleteFarmRowsByIds(supabase: SupabaseAdmin, table: string, column: string, ids: string[], farmId: string) {
  if (!ids.length) return;
  const { error } = await supabase.from(table).delete().eq("fazenda_id", farmId).in(column, ids);
  if (error) throw new Error(error.message);
}

async function deleteFarmRowsByValues(supabase: SupabaseAdmin, table: string, column: string, values: string[], farmId: string) {
  const safeValues = values.filter(Boolean);
  if (!safeValues.length) return;
  const { error } = await supabase.from(table).delete().eq("fazenda_id", farmId).in(column, safeValues);
  if (error) throw new Error(error.message);
}

function isOptionalRelationColumnError(error: unknown) {
  const message = safeErrorText(error);
  return /42703|22P02|schema cache|column|does not exist|nao existe|não existe|invalid input syntax|invalid input value|source_id|source_type|producao_id|animal_id|entidade_id|registro_id|referencia_id|mae_id|pai_id|origem_tabela|origem_id/i.test(message);
}

async function tryDeleteFarmRowsByIds(supabase: SupabaseAdmin, table: string, column: string, ids: string[], farmId: string) {
  try {
    await deleteFarmRowsByIds(supabase, table, column, ids, farmId);
  } catch (error) {
    if (!isOptionalRelationColumnError(error)) throw error;
    console.warn("[BOT DELETE HERD] vínculo opcional ignorado", {
      table,
      column,
      fazenda_id: farmId,
      message: safeErrorText(error)
    });
  }
}

async function tryDeleteFarmRowsByValues(supabase: SupabaseAdmin, table: string, column: string, values: string[], farmId: string) {
  try {
    await deleteFarmRowsByValues(supabase, table, column, values, farmId);
  } catch (error) {
    if (!isOptionalRelationColumnError(error)) throw error;
    console.warn("[BOT DELETE HERD] vínculo opcional ignorado", {
      table,
      column,
      fazenda_id: farmId,
      message: safeErrorText(error)
    });
  }
}

async function tryDeleteEventFinanceOriginLinks(supabase: SupabaseAdmin, eventIds: string[], farmId: string) {
  if (!eventIds.length) return;

  try {
    const { error } = await supabase
      .from(TABLES.transacoesFinanceiras)
      .delete()
      .eq("fazenda_id", farmId)
      .eq("origem_tabela", TABLES.eventosAnimal)
      .in("origem_id", eventIds);
    if (error) throw new Error(error.message);
  } catch (error) {
    if (!isOptionalRelationColumnError(error)) throw error;
    console.warn("[BOT DELETE HERD] vínculo opcional ignorado", {
      table: TABLES.transacoesFinanceiras,
      column: "origem_tabela/origem_id",
      fazenda_id: farmId,
      message: safeErrorText(error)
    });
  }
}

async function tryClearAnimalSelfReferences(supabase: SupabaseAdmin, animalIds: string[], farmId: string) {
  if (!animalIds.length) return;

  for (const column of ["mae_id", "pai_id"]) {
    try {
      const { error } = await supabase
        .from(TABLES.animais)
        .update({ [column]: null })
        .eq("fazenda_id", farmId)
        .in(column, animalIds);
      if (error) throw new Error(error.message);
    } catch (error) {
      if (!isOptionalRelationColumnError(error)) throw error;
      console.warn("[BOT DELETE HERD] genealogia opcional ignorada", {
        column,
        fazenda_id: farmId,
        message: safeErrorText(error)
      });
    }
  }
}

async function farmRowIds(supabase: SupabaseAdmin, table: string, farmId: string) {
  const { data, error } = await supabase.from(table).select("id").eq("fazenda_id", farmId);
  if (error) throw new Error(error.message);
  return (data || []).map((row: AnyRecord) => String(row.id || "")).filter(Boolean);
}

function matchKey(value: unknown) {
  return normalizeRanchoText(String(value || "")).replace(/[^a-z0-9]/g, "");
}

function numericKey(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ?digits.replace(/^0+/, "") || "0" : "";
}

function exactAnimalImportCodeKey(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

function levenshtein(left: string, right: string) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = left[i - 1] === right[j - 1]
        ?costs[j - 1]
        : Math.min(costs[j - 1], previous, costs[j]) + 1;
      costs[j - 1] = previous;
      previous = next;
    }
    costs[right.length] = previous;
  }
  return costs[right.length];
}

function scoreCandidate(term: string, candidate: string) {
  const target = matchKey(term);
  const option = matchKey(candidate);
  if (!target || !option) return 0;
  if (target === option) return 1;
  const targetNumeric = numericKey(term);
  const optionNumeric = numericKey(candidate);
  if (targetNumeric && optionNumeric && targetNumeric === optionNumeric) return 1;
  if (option.includes(target)) return 0.92;
  if (target.includes(option)) return 0.82;
  const distance = levenshtein(target, option);
  return 1 - distance / Math.max(target.length, option.length);
}

function bestMatch<T extends AnyRecord>(rows: T[], term: string, labels: (row: T) => Array<unknown>) {
  const scored = rows
    .map((row) => {
      const rowScores = labels(row).map((label) => scoreCandidate(term, String(label || "")));
      return { row, score: Math.max(...rowScores), exact: rowScores.some((score) => score === 1) };
    })
    .filter((item) => item.score >= 0.72)
    .sort((left, right) => right.score - left.score);

  return scored[0] as MatchResult<T> | undefined;
}

async function findAnimal(supabase: SupabaseAdmin, owner: WhatsAppOwner, code: string) {
  const { data, error } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,nome,categoria,sexo,fase,status,raca,lote_id,data_nascimento,peso,observacoes,mae_id,pai_id,genealogia_observacoes")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const resolved = resolveAnimalIdentifier(code, (data || []) as AnyRecord[]);
  if (!resolved.row) return undefined;
  return {
    row: resolved.row,
    exact: resolved.status === "matched" && resolved.exact,
    score: resolved.score,
    ambiguousRows: resolved.status === "ambiguous" ?resolved.rows : undefined,
    resolutionStatus: resolved.status
  };
}

async function listAnimals(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,nome,categoria,sexo,fase,status,raca,lote_id,data_nascimento,peso,observacoes,mae_id,pai_id,genealogia_observacoes")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(2000);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => row.status !== "excluido");
}

function animalLabel(animal?: AnyRecord | null) {
  if (!animal) return "Não informado";
  const brinco = String(animal.brinco || "").trim();
  const nome = String(animal.nome || "").trim();
  if (brinco && nome && normalizeRanchoText(brinco) !== normalizeRanchoText(nome)) return `${nome} (${brinco})`;
  return brinco || nome || String(animal.id || "Animal");
}

function animalSexKind(animal?: AnyRecord | null) {
  const values = [animal?.sexo, animal?.categoria].map((value) => normalizeRanchoText(String(value || "")));
  if (values.some((value) => ["femea", "feminino", "vaca", "novilha", "bezerra"].includes(value))) return "femea";
  if (values.some((value) => ["macho", "masculino", "boi", "touro", "bezerro"].includes(value))) return "macho";
  return "";
}

function partoWithChild(dados: AnyRecord) {
  return hasBirthChildData(dados);
}

function calfCodeFromParto(dados: AnyRecord, mother: AnyRecord) {
  const informed = String(dados.cria_codigo || "").trim();
  if (informed) return informed;
  if (!dados.gerar_cria_codigo_temporario) return "";
  const date = dateOnlyFromReference(String(dados.data_referencia || "hoje")).replace(/-/g, "");
  const motherCode = String(mother.brinco || mother.nome || mother.id || "MAE").replace(/[^A-Za-z0-9-]/g, "").toUpperCase() || "MAE";
  return `CRIA-${date}-${motherCode}-1`;
}

function calfPayloadFromParto(owner: WhatsAppOwner, dados: AnyRecord, mother: AnyRecord, father?: AnyRecord | null) {
  const sex = normalizeCalfSex(dados.cria_sexo) || "nao_informado";
  return {
    fazenda_id: owner.fazenda_id,
    brinco: calfCodeFromParto(dados, mother),
    nome: dados.cria_nome || null,
    categoria: dados.cria_categoria || calfCategoryForSex(sex) || "bezerro",
    sexo: sex,
    fase: "crescimento",
    raca: null,
    peso: null,
    lote_id: null,
    data_nascimento: dateOnlyFromReference(String(dados.data_referencia || "hoje")),
    status: "ativo",
    created_by: owner.usuario_id || null,
    mae_id: mother.id,
    pai_id: father?.id || null,
    genealogia_observacoes: `Cadastrado automaticamente a partir de parto da vaca ${mother.brinco || mother.nome || mother.id}`,
    observacoes: [
      `Cadastrado automaticamente a partir de parto da vaca ${mother.brinco || mother.nome || mother.id}`,
      dados.gerar_cria_codigo_temporario ? "Código temporário gerado pelo parto via WhatsApp" : "",
      dados.cria_observacoes || ""
    ].filter(Boolean).join(". ")
  };
}

function partoChildConfirmationText(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const mother = String(dados.animal_codigo || "informada").trim();
  const childSex = normalizeCalfSex(dados.cria_sexo) || String(dados.cria_sexo || "nao informado");
  const childCategory = String(dados.cria_categoria || calfCategoryForSex(childSex) || "cria");
  const childCode = String(dados.cria_codigo || (dados.gerar_cria_codigo_temporario ? "codigo temporario" : "a informar")).trim();
  const father = String(dados.pai_nome || dados.pai_ref || (dados.pai_nao_informado ? "nao informado" : "nao informado")).trim();
  const date = String(dados.data_referencia || "hoje").trim();
  return [
    "Entendi:",
    `- Evento: parto`,
    `- Mae: ${mother}`,
    `- Cria: ${childCategory} ${childSex}`,
    `- Codigo da cria: ${childCode}`,
    `- Pai: ${father}`,
    `- Data do parto/nascimento: ${date}`,
    "",
    "Isso vai registrar o parto, cadastrar a cria ativa e vincular a cria como descendente direto da mae.",
    "A categoria e a fase produtiva da mae nao serao trocadas por \"parida\".",
    "",
    "Esta correto?",
    "1 - Confirmar",
    "2 - Corrigir"
  ].join("\n");
}

function partoChildEventDescription(dados: AnyRecord, mother: AnyRecord, childCode: string, father?: AnyRecord | null) {
  return [
    `Parto registrado via WhatsApp para o animal ${mother.brinco || mother.nome || mother.id}`,
    `Cria cadastrada: ${childCode}`,
    dados.cria_sexo ?`Sexo da cria: ${normalizeCalfSex(dados.cria_sexo) || dados.cria_sexo}` : "",
    father ?`Pai: ${father.brinco || father.nome || father.id}` : "Pai nao informado",
    dados.observacoes ?`Observacoes: ${dados.observacoes}` : ""
  ].filter(Boolean).join(". ");
}

function partoDuplicateConfirmationMessage(animal: AnyRecord, reference: string) {
  return [
    `Ja existe um parto registrado para ${animalLabel(animal)} nesse mesmo dia (${dateOnlyFromReference(reference)}).`,
    "Isso pode ser duplicidade.",
    "",
    "Quer registrar mesmo assim?",
    "1 - Confirmar",
    "2 - Corrigir"
  ].join("\n");
}

async function existingPartoSameDay(supabase: SupabaseAdmin, owner: WhatsAppOwner, animalId: unknown, reference?: string) {
  const range = dayRange(reference || "hoje");
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,descricao,data_evento,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("animal_id", animalId)
    .eq("tipo", "parto")
    .gte("data_evento", range.start)
    .lt("data_evento", range.end)
    .limit(5);

  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

function lotLabel(lot?: AnyRecord | null) {
  if (!lot) return "Sem lote";
  return String(lot.nome || lot.descricao || lot.id || "Lote");
}

function animalStatusLabel(animal: AnyRecord) {
  return animalStatusValue(animal) || String(animal.status || "ativo");
}

function formatBotEventDate(event?: AnyRecord | null) {
  const value = String(event?.data_evento || event?.created_at || "");
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function reproductiveEventForFilter(animal: AnyRecord, eventsByAnimal: Map<string, AnyRecord[]>, filter?: HerdReproductionFilter) {
  if (!filter) return null;
  const events = sortedEventsForAnimal(eventsByAnimal, animal);
  if (filter === "prenhe") {
    return events.find((event) => ["prenhez", "pre_parto"].includes(String(reproductiveEventKind(event) || "")))
      || events.find((event) => reproductiveEventKind(event) === "inseminacao")
      || null;
  }
  if (filter === "pre_parto") return events.find((event) => reproductiveEventKind(event) === "pre_parto") || null;
  if (filter === "inseminada") return events.find((event) => reproductiveEventKind(event) === "inseminacao") || null;
  return null;
}

function reproductiveEventLine(animal: AnyRecord, eventsByAnimal: Map<string, AnyRecord[]>, filter?: HerdReproductionFilter) {
  const event = reproductiveEventForFilter(animal, eventsByAnimal, filter);
  const date = formatBotEventDate(event);
  if (filter === "prenhe") {
    if (event && reproductiveEventKind(event) === "inseminacao") return date ?`Última inseminação: ${date}` : "Inseminação registrada";
    if (event) return date ?`Prenhez/gestação registrada em ${date}` : "Prenhez/gestação registrada";
    if (animalPhaseIsPregnant(animal)) return "Marcada como gestante no cadastro";
  }
  if (filter === "pre_parto" && event) return date ?`Pré-parto desde ${date}` : "Pré-parto registrado";
  if (filter === "inseminada" && event) return date ?`Inseminada em ${date}` : "Inseminação registrada";
  return "";
}

function animalListLine(animal: AnyRecord, lotById: Map<string, AnyRecord>, index: number, eventsByAnimal?: Map<string, AnyRecord[]>, reproduction?: HerdReproductionFilter) {
  const lot = animal.lote_id ?lotById.get(String(animal.lote_id)) : null;
  const details = [
    animal.categoria || "animal",
    animal.sexo || "",
    animalStatusLabel(animal),
    lotLabel(lot)
  ].filter(Boolean).join(" | ");
  const reproductionDetail = eventsByAnimal ?reproductiveEventLine(animal, eventsByAnimal, reproduction) : "";
  return `${index + 1}. ${animalLabel(animal)} - ${details}${reproductionDetail ?` - ${reproductionDetail}` : ""}`;
}

type HerdReproductionFilter = "prenhe" | "pre_parto" | "inseminada" | "sem_evento" | "com_evento";
type ReproductiveEventKind = "inseminacao" | "prenhez" | "pre_parto" | "parto" | "protocolo";

function herdReproductionFilter(value: unknown): HerdReproductionFilter | undefined {
  const normalized = normalizeRanchoText(String(value || ""));
  if (["prenhe", "pre_parto", "inseminada", "sem_evento", "com_evento"].includes(normalized)) return normalized as HerdReproductionFilter;
  return undefined;
}

function reproductiveFilterLabel(filter?: HerdReproductionFilter) {
  if (filter === "prenhe") return "gestantes";
  if (filter === "pre_parto") return "em pré-parto";
  if (filter === "inseminada") return "inseminadas";
  if (filter === "sem_evento") return "sem eventos";
  if (filter === "com_evento") return "com eventos";
  return "";
}

function eventDateMs(event: AnyRecord) {
  const value = String(event.data_evento || event.created_at || "");
  const ms = Date.parse(value);
  return Number.isFinite(ms) ?ms : 0;
}

function reproductiveEventKind(event: AnyRecord): ReproductiveEventKind | undefined {
  const type = normalizeRanchoText(String(event.tipo || ""));
  const text = normalizeRanchoText([event.tipo, event.descricao, event.medicamento, event.dose].filter(Boolean).join(" "));
  if (/\b(?:pre\s*parto|pre-parto|preparto|perto de parir|quase parindo)\b/.test(text)) return "pre_parto";
  if (type === "parto" || /\b(?:parto|pariu|nasceu|nascimento|deu cria)\b/.test(text)) return "parto";
  if (type === "inseminacao" || /\b(?:inseminacao|inseminada|inseminado|cobertura|coberta|coberto|semen|ia|iatf)\b/.test(text)) return "inseminacao";
  if (/\b(?:prenhez|prenhe|prenha|gestacao|gestante|gravida|gravido)\b/.test(text)) return "prenhez";
  if (/\b(?:protocolo|reteste|nao passou)\b/.test(text)) return "protocolo";
  return undefined;
}

function sortedEventsForAnimal(eventsByAnimal: Map<string, AnyRecord[]>, animal: AnyRecord) {
  return [...(eventsByAnimal.get(String(animal.id || "")) || [])].sort((left, right) => eventDateMs(right) - eventDateMs(left));
}

function latestReproductiveKind(events: AnyRecord[]) {
  for (const event of events) {
    const kind = reproductiveEventKind(event);
    if (kind) return kind;
  }
  return undefined;
}

function animalPhaseIsPregnant(animal: AnyRecord) {
  return /\b(?:gestante|prenhe|prenha|prenhez|gravida)\b/.test(normalizeRanchoText(String(animal.fase || "")));
}

function animalMatchesReproductiveFilter(animal: AnyRecord, eventsByAnimal: Map<string, AnyRecord[]>, filter?: HerdReproductionFilter) {
  if (!filter) return true;
  const events = sortedEventsForAnimal(eventsByAnimal, animal);
  if (filter === "sem_evento") return events.length === 0;
  if (filter === "com_evento") return events.length > 0;

  const latestKind = latestReproductiveKind(events);
  if (filter === "pre_parto") return latestKind === "pre_parto";
  if (filter === "inseminada") return latestKind === "inseminacao";
  if (filter === "prenhe") {
    if (latestKind === "parto") return false;
    return latestKind === "prenhez" || latestKind === "pre_parto" || animalPhaseIsPregnant(animal);
  }
  return true;
}

async function listAnimalEventsForHerdConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,data_evento,descricao,medicamento,dose,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .order("data_evento", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

function eventsByAnimalId(events: AnyRecord[]) {
  const grouped = new Map<string, AnyRecord[]>();
  for (const event of events) {
    const animalId = String(event.animal_id || "");
    if (!animalId) continue;
    grouped.set(animalId, [...(grouped.get(animalId) || []), event]);
  }
  return grouped;
}

function herdPaginationData(dados: AnyRecord, page?: number) {
  return {
    consulta: true,
    modo: "lista",
    categoria: dados.categoria || undefined,
    sexo: dados.sexo || undefined,
    status: dados.status || undefined,
    reproducao: herdReproductionFilter(dados.reproducao || dados.filtro_reprodutivo) || undefined,
    lote_nome: dados.lote_nome || undefined,
    sem_lote: Boolean(dados.sem_lote) || undefined,
    pagina: page
  };
}

async function saveHerdPagination(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  dados: AnyRecord,
  nextPage: number,
  pageSize: number,
  lotName?: string
) {
  await saveSession(supabase, owner, {
    etapa: "livre",
    dados: {
      rebanho_paginacao: {
        tipo: "rebanho_lista",
        ...herdPaginationData({ ...dados, lote_nome: lotName || dados.lote_nome }),
        nextPage,
        pageSize
      }
    }
  });
}

async function saveLotPagination(supabase: SupabaseAdmin, owner: WhatsAppOwner, nextPage: number, pageSize: number) {
  await saveSession(supabase, owner, {
    etapa: "livre",
    dados: {
      rebanho_paginacao: {
        tipo: "lotes_lista",
        nextPage,
        pageSize
      }
    }
  });
}

function parsedHerdPaginationMessage(pagination: AnyRecord, page: number): ParsedRanchoMessage {
  return refreshRanchoMessage({
    tipo: "CONSULTA_REBANHO",
    confianca: 0.88,
    dados: {},
    resumo: "consultar rebanho",
    perguntas_faltantes: []
  }, herdPaginationData(pagination, page));
}

function parsedLotPaginationMessage(page: number): ParsedRanchoMessage {
  return refreshRanchoMessage({
    tipo: "CONSULTA_LOTES",
    confianca: 0.88,
    dados: {},
    resumo: "consultar lotes",
    perguntas_faltantes: []
  }, {
    consulta: true,
    pagina: page
  });
}

function filterLabel(dados: AnyRecord, lotName?: string) {
  const reproduction = herdReproductionFilter(dados.reproducao || dados.filtro_reprodutivo);
  const category = dados.categoria ?String(dados.categoria) : "animais";
  if (reproduction === "prenhe") return `${category === "vaca" ? "vacas" : category} gestantes${lotName ?` no lote ${lotName}` : ""}`;
  if (reproduction === "inseminada") return `${category === "vaca" ? "vacas" : category} inseminadas${lotName ?` no lote ${lotName}` : ""}`;
  if (reproduction === "pre_parto") return `${category === "vaca" ? "vacas" : category} em pré-parto${lotName ?` no lote ${lotName}` : ""}`;
  const labels = [
    category,
    dados.sexo && dados.sexo !== "nao_informado" ?`sexo ${dados.sexo}` : "",
    dados.sexo === "nao_informado" ?"sem sexo informado" : "",
    dados.status ?`status ${dados.status}` : "",
    reproduction ?reproductiveFilterLabel(reproduction) : "",
    dados.sem_lote ?"sem lote" : "",
    lotName ?`no lote ${lotName}` : ""
  ].filter(Boolean);
  return labels.join(", ");
}

function countAwareHerdLabel(label: string, total: number) {
  if (total !== 1) return label;
  return label
    .replace(/^vacas\b/, "vaca")
    .replace(/^animais\b/, "animal")
    .replace(/\bgestantes\b/, "gestante")
    .replace(/\binseminadas\b/, "inseminada");
}

function paginateRows<T>(rows: T[], page?: unknown, pageSize = 8) {
  const currentPage = Math.max(1, Number(page || 1) || 1);
  const start = (currentPage - 1) * pageSize;
  return {
    currentPage,
    start,
    end: Math.min(start + pageSize, rows.length),
    rows: rows.slice(start, start + pageSize),
    totalPages: Math.max(1, Math.ceil(rows.length / pageSize))
  };
}

function animalOptionsText(rows?: AnyRecord[]) {
  const options = (rows || []).slice(0, 5).map((row, index) => {
    const brinco = String(row.brinco || "").trim();
    const nome = String(row.nome || "").trim();
    const suffix = brinco && nome && normalizeRanchoText(brinco) !== normalizeRanchoText(nome) ?` - ${brinco}` : "";
    return `${index + 1}. ${animalLabel(row)}${suffix}`;
  }).join("\n");
  return options || "- Nenhuma opção segura encontrada";
}

function reportMissingValue(value: unknown) {
  const text = normalizeRanchoText(String(value ?? ""));
  return !text || ["null", "undefined", "nao informado", "nao_informado", "sem informacao", "sem_informacao"].includes(text);
}

function cleanReportText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseReport(value: unknown) {
  const text = cleanReportText(value).replace(/[_-]+/g, " ").toLowerCase();
  if (!text) return "";
  return text.replace(/\b[a-zà-ÿ]/g, (letter) => letter.toUpperCase());
}

function formatAnimalReportCategory(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value) || normalized === "outro") return "Não informada";
  const labels: Record<string, string> = {
    vaca: "Vaca",
    boi: "Boi",
    touro: "Touro",
    bezerro: "Bezerro",
    bezerra: "Bezerra",
    novilha: "Novilha",
    matriz: "Matriz",
    reprodutor: "Reprodutor"
  };
  return labels[normalized] || titleCaseReport(value);
}

function formatAnimalReportSex(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value)) return "Não informado";
  if (["femea", "feminino"].includes(normalized)) return "Fêmea";
  if (["macho", "masculino"].includes(normalized)) return "Macho";
  return titleCaseReport(value);
}

function formatAnimalReportStatus(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value)) return "Não informado";
  const labels: Record<string, string> = {
    ativo: "Ativo",
    ativa: "Ativo",
    inativo: "Inativo",
    inativa: "Inativo",
    morto: "Morto",
    morta: "Morto",
    vendido: "Vendido",
    vendida: "Vendido",
    excluido: "Excluído",
    excluida: "Excluído"
  };
  return labels[normalized] || titleCaseReport(value);
}

function formatAnimalReportPhase(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value)) return "Não informada";
  const labels: Record<string, string> = {
    nao_aplicavel: "Não se aplica",
    naoaplicavel: "Não se aplica",
    outro: "Não informada",
    lactacao: "Lactação",
    lactante: "Lactação",
    gestante: "Prenha",
    prenha: "Prenha",
    prenhe: "Prenha",
    pre_parto: "Pré-parto",
    preparto: "Pré-parto",
    seca: "Seca",
    crescimento: "Crescimento",
    cria: "Cria",
    recria: "Recria"
  };
  return labels[normalized] || titleCaseReport(value);
}

function reportDate(value: unknown) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function animalReportTitle(animal: AnyRecord, reference: string) {
  const category = normalizeRanchoText(String(animal.categoria || ""));
  const noun = category === "vaca" ?"vaca" : category === "touro" ?"touro" : category === "boi" ?"boi" : "animal";
  return `Resumo ${noun === "vaca" ? "da" : "do"} ${noun} ${animal.brinco || animal.nome || reference}:`;
}

function animalReportEventText(row: AnyRecord) {
  return normalizeRanchoText([row.tipo, row.descricao, row.medicamento, row.dose].filter(Boolean).join(" "));
}

type AnimalReportReproductionKind = NlpReproductiveEventKind | "nao_passou";

function animalReportReproductionKind(row: AnyRecord): AnimalReportReproductionKind | undefined {
  const type = normalizeRanchoText(String(row.tipo || ""));
  const text = animalReportEventText(row);
  if (/\b(?:pre\s*parto|pre-parto|preparto|perto de parir|quase parindo|para parir)\b/.test(text)) return "pre_parto";
  if (type === "parto" || /\b(?:parto|pariu|nasceu|nascimento|deu cria)\b/.test(text)) return "parto";
  if (/\bnao passou\b/.test(text)) return "nao_passou";
  if (/\breteste\b/.test(text)) return "reteste";
  if (!/\b(?:nao esta prenha|nao ficou prenha|prenhez negativa|diagnostico negativo)\b/.test(text)
    && /\b(?:prenhez|prenhe|prenha|gestante|gestacao|gravida|confirmar prenhez|diagnostico positivo|pegou cria)\b/.test(text)) {
    return "prenhez";
  }
  if (type === "inseminacao" || /\b(?:inseminacao|inseminada|inseminado|cobertura|coberta|coberto|semen|ia|iatf)\b/.test(text)) return "inseminacao";
  if (/\b(?:protocolo|protocolada|protocolado)\b/.test(text)) return "protocolo";
  return detectReproductiveEventKind(text);
}

function isAnimalReportInsemination(row: AnyRecord) {
  const type = normalizeRanchoText(String(row.tipo || ""));
  const text = animalReportEventText(row);
  return type === "inseminacao" || /\b(?:inseminacao|inseminada|inseminado|cobertura|coberta|coberto|semen|ia|iatf)\b/.test(text);
}

function isAnimalReportReproductiveEvent(row: AnyRecord) {
  return Boolean(animalReportReproductionKind(row)) || eventTypeMatches(row, "reprodutivo");
}

function formatAnimalReportReproductionKind(kind?: AnimalReportReproductionKind) {
  if (kind === "inseminacao") return "Inseminação";
  if (kind === "prenhez") return "Prenhez";
  if (kind === "pre_parto") return "Pré-parto";
  if (kind === "parto") return "Parto";
  if (kind === "protocolo") return "Protocolo";
  if (kind === "reteste") return "Reteste";
  if (kind === "nao_passou") return "Não passou";
  return "Observação reprodutiva";
}

function animalReportEventLabel(row: AnyRecord) {
  const tipo = normalizeRanchoText(String(row.tipo || ""));
  const reproductionKind = animalReportReproductionKind(row);
  if (reproductionKind) return formatAnimalReportReproductionKind(reproductionKind);
  if (tipo === "vacina") return row.medicamento ?`Vacina ${cleanReportText(row.medicamento)}` : "Vacina";
  if (tipo === "tratamento") return row.medicamento ?`Tratamento ${cleanReportText(row.medicamento)}` : "Tratamento";
  if (tipo === "observacao") return "Observação clínica";
  if (tipo === "doenca") return "Ocorrência clínica";
  if (tipo === "cio") return "Cio";
  return titleCaseReport(row.tipo || "Evento");
}

function animalReportEventNote(row: AnyRecord) {
  const text = animalReportEventText(row);
  if (/\bnao passou\b/.test(text)) return "Não passou";
  if (/\breteste\b/.test(text)) return "Reteste";
  if (isAnimalReportInsemination(row) && cleanReportText(row.medicamento)) return `Origem: ${cleanReportText(row.medicamento)}`;
  const raw = cleanReportText(row.descricao)
    .replace(/^\[?reproducao animal\]?\s*/i, "")
    .replace(/\bregistrad[ao]\s+via\s+whatsapp\b/gi, "")
    .replace(/\b(?:inseminacao|prenhez|pre-parto|parto|protocolo|observacao reprodutiva)\s+registrad[ao]\b/gi, "")
    .replace(/\s+-\s+/g, " - ")
    .trim();
  if (!raw || normalizeRanchoText(raw) === normalizeRanchoText(animalReportEventLabel(row))) return "";
  return raw.length > 90 ?`${raw.slice(0, 87)}...` : raw;
}

function animalReportInseminationOrigin(row?: AnyRecord | null) {
  if (!row) return "";
  const direct = cleanReportText(row.medicamento);
  if (direct && !/\b(?:dose|ml|mg)\b/i.test(direct)) return direct;
  const description = cleanReportText(row.descricao);
  const origin = description.match(/\bOrigem:\s*([^.;-]+)/i)?.[1] || description.match(/\bcom\s+(?:s[eê]men\s+)?(?:do|da|de)?\s*([^.;-]+)/i)?.[1];
  return cleanReportText(origin);
}

function hasLaterAnimalReportEvent(reference: AnyRecord | undefined, rows: AnyRecord[], kind: AnimalReportReproductionKind) {
  if (!reference) return false;
  return rows.some((row) => eventDateMs(row) > eventDateMs(reference) && animalReportReproductionKind(row) === kind);
}

function hasLaterAnimalReportOutcome(reference: AnyRecord | undefined, rows: AnyRecord[]) {
  if (!reference) return false;
  return rows.some((row) => {
    if (eventDateMs(row) <= eventDateMs(reference)) return false;
    return ["prenhez", "pre_parto", "parto", "nao_passou", "reteste"].includes(String(animalReportReproductionKind(row) || ""));
  });
}

function animalReportReproductionSummary(animal: AnyRecord, events: AnyRecord[]) {
  const sorted = [...events].sort((left, right) => eventDateMs(right) - eventDateMs(left));
  const reproductiveEvents = sorted.filter(isAnimalReportReproductiveEvent);
  const lastInsemination = sorted.find(isAnimalReportInsemination);
  const lastPrenhez = sorted.find((row) => animalReportReproductionKind(row) === "prenhez");
  const lastPreParto = sorted.find((row) => animalReportReproductionKind(row) === "pre_parto");
  const lastParto = sorted.find((row) => animalReportReproductionKind(row) === "parto");
  const lastNaoPassou = sorted.find((row) => animalReportReproductionKind(row) === "nao_passou");
  const lastReteste = sorted.find((row) => animalReportReproductionKind(row) === "reteste");
  const lastProtocol = sorted.find((row) => animalReportReproductionKind(row) === "protocolo");

  let status = "Sem registro reprodutivo";
  let inferred = false;
  if (lastPreParto && !hasLaterAnimalReportEvent(lastPreParto, sorted, "parto")) {
    status = "Pré-parto";
  } else if (lastPrenhez && !hasLaterAnimalReportEvent(lastPrenhez, sorted, "parto")) {
    status = "Prenha";
  } else if (lastNaoPassou && (!lastInsemination || eventDateMs(lastNaoPassou) >= eventDateMs(lastInsemination))) {
    status = "Não passou";
  } else if (lastReteste && (!lastInsemination || eventDateMs(lastReteste) >= eventDateMs(lastInsemination))) {
    status = "Reteste";
  } else if (animalPhaseIsPregnant(animal) && !lastParto) {
    status = "Provavelmente prenha";
    inferred = true;
  } else if (lastInsemination && !hasLaterAnimalReportOutcome(lastInsemination, sorted)) {
    status = "Inseminada";
  } else if (lastParto) {
    const daysSinceParto = Math.floor((Date.now() - eventDateMs(lastParto)) / (24 * 60 * 60 * 1000));
    status = daysSinceParto >= 0 && daysSinceParto <= 45 ? "Recém-parida" : "Pariu";
  }

  return {
    reproductiveEvents,
    lastInsemination,
    lastPrenhez,
    lastPreParto,
    lastParto,
    lastNaoPassou,
    lastReteste,
    lastProtocol,
    status,
    inferred
  };
}

async function queryAnimalReportEvents(supabase: SupabaseAdmin, owner: WhatsAppOwner, animalId: unknown) {
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,descricao,medicamento,dose,custo,data_evento,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("animal_id", animalId)
    .order("data_evento", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

async function queryAnimalReportProductions(supabase: SupabaseAdmin, owner: WhatsAppOwner, animalId: unknown) {
  const { data, error } = await supabase
    .from(TABLES.ordenhas)
    .select("id,animal_id,litros,ordenhado_em,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("animal_id", animalId)
    .order("ordenhado_em", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

function animalReportBasicLines(animal: AnyRecord, lot?: AnyRecord | null) {
  return [
    "Dados gerais:",
    cleanReportText(animal.nome) ?`- Nome: ${cleanReportText(animal.nome)}` : "",
    cleanReportText(animal.brinco) ?`- Código: ${cleanReportText(animal.brinco)}` : "",
    `- Categoria: ${formatAnimalReportCategory(animal.categoria)}`,
    `- Sexo: ${formatAnimalReportSex(animal.sexo)}`,
    `- Status: ${formatAnimalReportStatus(animalStatusValue(animal) || animal.status || "ativo")}`,
    `- Fase: ${formatAnimalReportPhase(animal.fase)}`,
    `- Lote: ${lotLabel(lot)}`,
    cleanReportText(animal.raca) ?`- Raça: ${cleanReportText(animal.raca)}` : "",
    reportDate(animal.data_nascimento) ?`- Nascimento: ${reportDate(animal.data_nascimento)}` : "",
    animal.peso !== undefined && animal.peso !== null && animal.peso !== "" ?`- Peso: ${formatNumber(animal.peso, " kg")}` : ""
  ].filter(Boolean);
}

function animalReportReproductionLines(summary: ReturnType<typeof animalReportReproductionSummary>) {
  const lines = [
    "Reprodução:",
    `- Status: ${summary.inferred ?`${summary.status}, com base na fase cadastrada` : summary.status}`
  ];

  if (!summary.reproductiveEvents.length) {
    lines.push("- Não encontrei registros reprodutivos para este animal.");
    return lines;
  }

  if (summary.lastInsemination) {
    lines.push(`- Última inseminação: ${reportDate(summary.lastInsemination.data_evento || summary.lastInsemination.created_at) || "sem data"}`);
    lines.push(`- Origem da inseminação: ${animalReportInseminationOrigin(summary.lastInsemination) || "Não informada"}`);
  }
  if (summary.lastPrenhez) lines.push(`- Prenhez confirmada em: ${reportDate(summary.lastPrenhez.data_evento || summary.lastPrenhez.created_at) || "sem data"}`);
  lines.push(`- Pré-parto: ${summary.lastPreParto ? reportDate(summary.lastPreParto.data_evento || summary.lastPreParto.created_at) || "registrado sem data" : "não registrado"}`);
  lines.push(`- Último parto: ${summary.lastParto ? reportDate(summary.lastParto.data_evento || summary.lastParto.created_at) || "registrado sem data" : "não encontrado"}`);

  const observations = [
    summary.lastNaoPassou ? "Não passou" : "",
    summary.lastReteste ? "Reteste" : "",
    summary.lastProtocol && !summary.lastNaoPassou && !summary.lastReteste ? "Protocolo" : ""
  ].filter(Boolean);
  if (observations.length) lines.push(`- Observação: ${observations.slice(0, 2).join(", ")}`);

  return lines;
}

function animalReportEventLines(events: AnyRecord[]) {
  const sorted = [...events].sort((left, right) => eventDateMs(right) - eventDateMs(left)).slice(0, 5);
  if (!sorted.length) return [];
  return [
    "Eventos recentes:",
    ...sorted.map((row, index) => {
      const date = reportDate(row.data_evento || row.created_at) || "sem data";
      const note = animalReportEventNote(row);
      return `${index + 1}. ${date} - ${animalReportEventLabel(row)}${note ?` - ${note}` : ""}`;
    }),
    events.length > 5 ?"Quer ver o histórico completo? Peça os eventos desse animal." : ""
  ].filter(Boolean);
}

function animalReportProductionLines(rows: AnyRecord[]) {
  const sorted = [...rows].sort((left, right) => Date.parse(String(right.ordenhado_em || right.created_at || "")) - Date.parse(String(left.ordenhado_em || left.created_at || "")));
  if (!sorted.length) return [];
  const last = sorted[0];
  const total = sorted.reduce((sum, row) => sum + Number(row.litros || 0), 0);
  const average = sorted.length ?total / sorted.length : 0;
  return [
    "Produção:",
    `- Último registro: ${formatNumber(last.litros)} litros em ${reportDate(last.ordenhado_em || last.created_at) || "data não informada"}`,
    sorted.length > 1 ?`- Média recente: ${formatNumber(average)} litros` : ""
  ].filter(Boolean);
}

function animalReportGenealogyLines(animal: AnyRecord, animals: AnyRecord[]) {
  const byId = new Map(animals.map((row) => [String(row.id), row]));
  const mother = animal.mae_id ?byId.get(String(animal.mae_id)) : null;
  const father = animal.pai_id ?byId.get(String(animal.pai_id)) : null;
  const notes = cleanReportText(animal.genealogia_observacoes);
  const descendants = animals
    .filter((row) => String(row.mae_id || "") === String(animal.id) || String(row.pai_id || "") === String(animal.id))
    .sort((left, right) => {
      const rightDate = Date.parse(String(right.data_nascimento || right.created_at || ""));
      const leftDate = Date.parse(String(left.data_nascimento || left.created_at || ""));
      return (Number.isFinite(rightDate) ?rightDate : 0) - (Number.isFinite(leftDate) ?leftDate : 0);
    });
  const lastChild = descendants[0] || null;
  if (!mother && !father && !notes && !descendants.length) return [];
  return [
    "Genealogia:",
    mother ?`- Mãe: ${animalLabel(mother)}` : "",
    father ?`- Pai: ${animalLabel(father)}` : "",
    `- Descendentes diretos: ${descendants.length}`,
    lastChild ?`- Última cria: ${animalLabel(lastChild)}${lastChild.data_nascimento ?` em ${reportDate(lastChild.data_nascimento)}` : ""}` : "",
    notes ?`- Observação: ${notes}` : ""
  ].filter(Boolean);
}

function animalReportAlertLines(animal: AnyRecord, reproduction: ReturnType<typeof animalReportReproductionSummary>, events: AnyRecord[], productions: AnyRecord[]) {
  const alerts: string[] = [];
  const status = normalizeRanchoText(String(animalStatusValue(animal) || animal.status || ""));
  if (["morto", "morta", "vendido", "vendida", "inativo", "inativa"].includes(status)) alerts.push(`Status do animal: ${formatAnimalReportStatus(status)}.`);
  if (reproduction.lastPreParto && !hasLaterAnimalReportEvent(reproduction.lastPreParto, events, "parto")) {
    alerts.push(`Animal em pré-parto desde ${reportDate(reproduction.lastPreParto.data_evento || reproduction.lastPreParto.created_at) || "data não informada"}.`);
  } else if (reproduction.lastPrenhez && !reproduction.lastPreParto && !hasLaterAnimalReportEvent(reproduction.lastPrenhez, events, "parto")) {
    alerts.push("Prenhez sem pré-parto registrado.");
  }
  if (reproduction.lastNaoPassou) alerts.push("A última observação reprodutiva indica: Não passou.");
  const clinical = events.find((row) => eventTypeMatches(row, "clinico"));
  if (clinical) alerts.push(`Evento clínico recente em ${reportDate(clinical.data_evento || clinical.created_at) || "data não informada"}.`);
  if (!productions.length && normalizeRanchoText(String(animal.categoria || "")) === "vaca") alerts.push("Sem produção recente registrada.");
  if (normalizeRanchoText(String(animal.categoria || "")) === "outro") alerts.push("Categoria não informada no cadastro.");
  if (reportMissingValue(animal.sexo)) alerts.push("Sexo não informado no cadastro.");

  if (!alerts.length) return [];
  return ["Alertas:", ...alerts.slice(0, 4).map((alert) => `- ${alert}`)];
}

async function buildAnimalIndividualReport(supabase: SupabaseAdmin, owner: WhatsAppOwner, animal: AnyRecord, reference: string, lot?: AnyRecord | null) {
  const [events, productions, animals] = await Promise.all([
    queryAnimalReportEvents(supabase, owner, animal.id),
    queryAnimalReportProductions(supabase, owner, animal.id),
    listAnimals(supabase, owner)
  ]);
  const reproduction = animalReportReproductionSummary(animal, events);
  const sections = [
    [animalReportTitle(animal, reference)],
    animalReportBasicLines(animal, lot),
    animalReportReproductionLines(reproduction),
    animalReportEventLines(events),
    animalReportProductionLines(productions),
    animalReportAlertLines(animal, reproduction, events, productions),
    animalReportGenealogyLines(animal, animals)
  ].filter((section) => section.length);

  return {
    text: sections.map((section) => section.join("\n")).join("\n\n"),
    result: {
      animal_id: animal.id,
      animal: animalLabel(animal),
      fazenda_id: owner.fazenda_id,
      eventos: events.length,
      eventos_reprodutivos: reproduction.reproductiveEvents.length,
      producoes_recentes: productions.length,
      status_reprodutivo: reproduction.status
    }
  };
}

function collectDescendantIds(animalId: string, animals: AnyRecord[]) {
  const descendants = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const animal of animals) {
      const id = String(animal.id || "");
      if (!id || descendants.has(id)) continue;
      const mother = String(animal.mae_id || "");
      const father = String(animal.pai_id || "");
      if (mother === animalId || father === animalId || descendants.has(mother) || descendants.has(father)) {
        descendants.add(id);
        changed = true;
      }
    }
  }

  return descendants;
}

function relationBlockMessage(parsed: ParsedRanchoMessage) {
  return String(parsed.dados?.genealogia_bloqueio || parsed.dados?.parto_bloqueio || "").trim() || null;
}

function addGenealogyBlock(dados: AnyRecord, message: string) {
  dados.genealogia_bloqueio = message;
  dados.genealogia_estoque_movimentado = false;
}

function genealogyPayloadFromData(dados: AnyRecord) {
  const payload: AnyRecord = {};
  if (dados.remover_mae) payload.mae_id = null;
  else if (dados.mae_id) payload.mae_id = dados.mae_id;
  if (dados.remover_pai) payload.pai_id = null;
  else if (dados.pai_id) payload.pai_id = dados.pai_id;
  return payload;
}

async function findLot(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string) {
  const { data, error } = await supabase
    .from(TABLES.lotes)
    .select("id,nome,descricao,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  return bestMatch(activeRows, name, (row) => [row.nome, row.descricao]);
}

async function listLots(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.lotes)
    .select("id,nome,descricao,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
}

async function findStockItem(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string): Promise<StockLookupResult> {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  const resolved = resolveStockItem(name, activeRows);

  const candidateRows = (resolved.rows?.length ?resolved.rows : resolved.row ?[resolved.row] : activeRows.slice(0, 8)) as AnyRecord[];
  const candidateNames = candidateRows
    .map((row) => String(row.nome || row.id || ""))
    .filter(Boolean)
    .slice(0, 8);
  const reason = !activeRows.length
    ?"catalogo_vazio"
    : resolved.status === "not_found"
      ?"sem_match_seguro"
      : resolved.status === "ambiguous"
        ?"multiplos_itens_parecidos"
        : resolved.status === "suggestion"
          ?"match_medio_precisa_confirmacao"
          : "match_seguro";

  return {
    row: resolved.row,
    exact: resolved.status === "matched" && resolved.exact,
    score: resolved.score,
    ambiguousRows: resolved.status === "ambiguous" ?resolved.rows : undefined,
    resolutionStatus: resolved.status,
    catalogSource: "banco_real",
    catalogCount: activeRows.length,
    candidateNames,
    reason
  };
}

async function listStockItems(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[])
    .filter((row) => row.ativo !== false)
    .sort((left, right) => String(left.nome || "").localeCompare(String(right.nome || ""), "pt-BR"));
}

function isMilkStockUnit(unit: unknown) {
  const normalized = normalizeRanchoText(String(unit || ""));
  return ["l", "litro", "litros"].includes(normalized);
}

function isMilkStockName(name: unknown) {
  const normalized = normalizeRanchoText(String(name || ""));
  return /\bleite\b/.test(normalized);
}

function milkStockNameScore(name: unknown) {
  const normalized = normalizeRanchoText(String(name || ""));
  if (normalized === "leite cru") return 100;
  if (normalized === "leite in natura") return 95;
  if (normalized === "leite ordenhado") return 90;
  if (normalized === "leite") return 85;
  if (/\bleite\s+cru\b/.test(normalized)) return 80;
  if (/\bleite\b/.test(normalized)) return 60;
  return 0;
}

async function resolveMilkStockItem(supabase: SupabaseAdmin, owner: WhatsAppOwner): Promise<MilkStockResolution> {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);

  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  const compatibleRows = activeRows
    .filter((row) => isMilkStockName(row.nome) && isMilkStockUnit(row.unidade_medida))
    .sort((left, right) => milkStockNameScore(right.nome) - milkStockNameScore(left.nome));

  if (compatibleRows.length === 1) {
    return {
      status: "matched",
      row: compatibleRows[0],
      options: [],
      catalogSource: "banco_real",
      catalogCount: activeRows.length,
      reason: "item_leite_unico_compativel"
    };
  }

  if (compatibleRows.length > 1) {
    const topScore = milkStockNameScore(compatibleRows[0].nome);
    const tiedTop = compatibleRows.filter((row) => milkStockNameScore(row.nome) === topScore);
    if (topScore > 0 && tiedTop.length === 1) {
      return {
        status: "matched",
        row: compatibleRows[0],
        options: [],
        catalogSource: "banco_real",
        catalogCount: activeRows.length,
        reason: "item_leite_melhor_compativel"
      };
    }

    return {
      status: "ambiguous",
      options: compatibleRows.slice(0, 8),
      catalogSource: "banco_real",
      catalogCount: activeRows.length,
      reason: "multiplos_itens_leite_compativeis"
    };
  }

  return {
    status: "not_found",
    options: [],
    catalogSource: "banco_real",
    catalogCount: activeRows.length,
    reason: activeRows.length ?"sem_item_leite_em_litros" : "catalogo_vazio"
  };
}

function milkStockDebug(resolution: MilkStockResolution, totalLitros: number, destinoDetectado?: string | null) {
  const row = resolution.row;
  const options = resolution.options.map((option) => ({
    item_id: option.id || null,
    nome: option.nome || null,
    unidade: option.unidade_medida || null
  }));

  return {
    total_litros: totalLitros,
    destino_detectado: destinoDetectado || null,
    item_leite_resolvido: row?.nome || null,
    item_id: row?.id || null,
    unidade: row?.unidade_medida || null,
    origem: resolution.catalogSource,
    status_resolucao: resolution.status,
    motivo: resolution.reason,
    opcoes: options,
    estoque_movimentar: resolution.status === "matched" && destinoDetectado === "tanque",
    acao_pendente_estoque: resolution.status === "matched" && destinoDetectado === "tanque",
    pedir_decisao: resolution.status === "matched" && !destinoDetectado,
    todo_salvar_estoque: null
  };
}

function shouldResolveMilkStockForProduction(dados: AnyRecord, totalLitros: number) {
  if (!totalLitros || totalLitros <= 0) return false;
  return String(dados.destino_leite || "") !== "venda";
}

function milkStockNeedsDecision(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  return Boolean(stock?.pedir_decisao && stock.status_resolucao === "matched" && !stock.estoque_movimentar);
}

function milkStockDecisionQuestion(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  const total = Number(stock?.total_litros || parsed.dados?.total_litros || parsed.dados?.litros || 0);
  return `Deseja adicionar também ${formatNumber(total, " L")} ao estoque de ${stock?.item_leite_resolvido || "leite"}?\n1 - Sim\n2 - Não`;
}

function withMilkStockMovementDecision(parsed: ParsedRanchoMessage, shouldMove: boolean) {
  const stock = { ...((parsed.dados?.estoque_leite || {}) as AnyRecord) };
  stock.estoque_movimentar = shouldMove && stock.status_resolucao === "matched";
  stock.acao_pendente_estoque = stock.estoque_movimentar;
  stock.pedir_decisao = false;
  const dados = {
    ...(parsed.dados || {}),
    estoque_leite: stock,
    estoque_leite_movimentar: stock.estoque_movimentar
  };
  return refreshRanchoMessage(parsed, dados);
}

function physicalSaleNeedsStockDecision(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  return Boolean(
    parsed.tipo === "ESTOQUE_SAIDA"
    && dados.venda
    && hasBotValue(dados.valor)
    && dados.item_estoque_encontrado
    && dados.item_id
    && dados.deve_baixar_estoque !== true
    && dados.deve_baixar_estoque !== false
  );
}

function physicalSaleStockDecisionQuestion(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const item = dados.item_resolvido || dados.item_nome || "item";
  return `Encontrei ${item} no estoque. Deseja dar baixa de ${formatStockAmount(Number(dados.quantidade || 0), dados.unidade)} desse item?\n1 - Sim\n2 - Não`;
}

function saleFinanceDataFromStockSale(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const item = dados.item_extraido || dados.item_nome || dados.item_resolvido || "item";
  return {
    valor: dados.valor,
    descricao: `venda de ${item}`,
    data_referencia: dados.data_referencia,
    quantidade: dados.quantidade,
    unidade: dados.unidade,
    item_extraido: dados.item_extraido || item,
    item_normalizado: dados.item_normalizado,
    item_resolvido: dados.item_resolvido || null,
    item_estoque_encontrado: Boolean(dados.item_estoque_encontrado),
    item_id: dados.item_id || null,
    deve_baixar_estoque: false,
    motivo_processamento: "usuario_escolheu_financeiro_apenas"
  };
}

function withPhysicalSaleStockDecision(parsed: ParsedRanchoMessage, shouldMove: boolean) {
  if (shouldMove) {
    const dados = {
      ...(parsed.dados || {}),
      deve_baixar_estoque: true,
      motivo_processamento: "usuario_escolheu_estoque+receita"
    };
    return refreshRanchoMessage(parsed, dados);
  }

  const financeData = saleFinanceDataFromStockSale(parsed);
  return refreshRanchoMessage({ ...parsed, tipo: "RECEITA_VENDA", dados: financeData }, financeData);
}

function withoutChildMilkStockMetadata(parsed: ParsedRanchoMessage) {
  if (parsed.tipo !== "PRODUCAO_LEITE") return parsed;
  const dados = { ...(parsed.dados || {}) };
  delete dados.estoque_leite_detectado;
  delete dados.estoque_leite;
  delete dados.estoque_leite_item_id;
  delete dados.estoque_leite_item_nome;
  delete dados.estoque_leite_unidade;
  delete dados.estoque_leite_opcoes;
  delete dados.estoque_leite_status;
  delete dados.estoque_leite_origem;
  delete dados.estoque_leite_movimentar;
  return refreshRanchoMessage(parsed, dados);
}

async function findEmployee(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string) {
  const { data, error } = await supabase
    .from(TABLES.funcionarios)
    .select("id,nome,funcao,cpf,contato_whatsapp,salario_base,tipo_acesso,ativo,deleted_at")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false && !row.deleted_at);
  return bestMatch(activeRows, name, (row) => [row.nome]);
}

function stockCategoryFromName(name: string) {
  const normalized = normalizeRanchoText(name);
  if (/\b(?:vacina|aftosa|brucelose|raiva)\b/.test(normalized)) return "vacina";
  if (/\b(?:racao|silagem|sal|farelo|milho)\b/.test(normalized)) return "racao";
  if (/\b(?:remedio|medicamento|vermifugo|terramicina|antibiotico|carrapaticida)\b/.test(normalized)) return "medicamento";
  if (/\b(?:luva|seringa|insumo)\b/.test(normalized)) return "insumo";
  return "outro";
}

function normalizeStockCategory(value: unknown) {
  const normalized = normalizeRanchoText(String(value || ""));
  if (/\b(?:vacina|vacinas|aftosa|brucelose|raiva)\b/.test(normalized)) return "vacina";
  if (/\b(?:medicamento|medicamentos|remedio|remedios|veterinario|veterinarios|vermifugo|terramicina|antibiotico|antibioticos|carrapaticida)\b/.test(normalized)) return "medicamento";
  if (/\b(?:racao|racoes|silagem|farelo|milho|sal|mineral)\b/.test(normalized)) return "racao";
  if (/\b(?:insumo|insumos)\b/.test(normalized)) return "insumo";
  return normalized || "outro";
}

function stockCategoryLabel(category: unknown) {
  const normalized = normalizeStockCategory(category);
  if (normalized === "vacina") return "vacinas";
  if (normalized === "medicamento") return "medicamentos";
  if (normalized === "racao") return "rações";
  if (normalized === "insumo") return "insumos";
  return "itens";
}

function stockRowMatchesCategory(row: AnyRecord, category: unknown) {
  const requested = normalizeStockCategory(category);
  const rowCategory = normalizeStockCategory(row.categoria);
  const nameCategory = stockCategoryFromName(String(row.nome || ""));
  const name = normalizeRanchoText(String(row.nome || ""));

  if (requested === "vacina") return rowCategory === "vacina" || nameCategory === "vacina" || /\b(?:vacina|aftosa|brucelose|raiva)\b/.test(name);
  if (requested === "medicamento") return rowCategory === "medicamento" || nameCategory === "medicamento" || /\b(?:remedio|medicamento|vermifugo|terramicina|antibiotico|carrapaticida)\b/.test(name);
  if (requested === "racao") return rowCategory === "racao" || nameCategory === "racao" || /\b(?:racao|silagem|farelo|milho|sal|mineral)\b/.test(name);
  if (requested === "insumo") return rowCategory === "insumo" || nameCategory === "insumo" || /\b(?:insumo|luva|seringa)\b/.test(name);
  return rowCategory === requested || nameCategory === requested;
}

function stockQuantity(row: AnyRecord) {
  return Number(row.quantidade_atual || 0);
}

function stockMinimum(row: AnyRecord) {
  return Number(row.quantidade_minima || 0);
}

function formatStockListLine(row: AnyRecord, index: number, options: { showMinimum?: boolean } = {}) {
  const minimumText = options.showMinimum && stockMinimum(row) > 0
    ?` (mínimo ${formatStockAmount(row.quantidade_minima, row.unidade_medida)})`
    : "";
  return `${index}. ${row.nome || "Item"} - ${formatStockAmount(row.quantidade_atual, row.unidade_medida)}${minimumText}`;
}

function stockListRowsForMode(rows: AnyRecord[], mode: string, category?: unknown) {
  if (mode === "baixo") return rows.filter((row) => stockMinimum(row) > 0 && stockQuantity(row) < stockMinimum(row));
  if (mode === "zerado") return rows.filter((row) => stockQuantity(row) <= 0);
  if (mode === "categoria" && category) return rows.filter((row) => stockRowMatchesCategory(row, category));
  return rows;
}

function stockEmptyText(mode: string, category?: unknown) {
  if (mode === "baixo") return "Nenhum item está abaixo do mínimo agora.";
  if (mode === "zerado") return "Nenhum item está zerado no estoque.";
  if (mode === "categoria") return `Não encontrei ${stockCategoryLabel(category)} no estoque deste rancho.`;
  return "Nenhum item cadastrado no estoque deste rancho.";
}

function stockListHeader(mode: string, total: number, pageSize: number, category?: unknown) {
  if (mode === "baixo") return `Encontrei ${total} ${total === 1 ?"item abaixo" : "itens abaixo"} do mínimo no estoque:`;
  if (mode === "zerado") return `Encontrei ${total} ${total === 1 ?"item zerado" : "itens zerados"} no estoque:`;
  if (mode === "categoria") return `Encontrei ${total} ${stockCategoryLabel(category)} no estoque:`;
  if (total > pageSize) return `Você tem ${total} itens no estoque. Aqui estão alguns:`;
  return `Você tem ${total} ${total === 1 ?"item" : "itens"} no estoque:`;
}

function buildStockListText(rows: AnyRecord[], mode: string, offset: number, pageSize: number, category?: unknown) {
  const total = rows.length;
  if (!total) {
    return { text: stockEmptyText(mode, category), nextOffset: offset, hasMore: false, total };
  }

  const pageRows = rows.slice(offset, offset + pageSize);
  const showMinimum = mode === "baixo";
  const lines = pageRows.map((row, index) => formatStockListLine(row, offset + index + 1, { showMinimum })).join("\n");
  const nextOffset = offset + pageRows.length;
  const hasMore = nextOffset < total;
  const header = offset === 0
    ? stockListHeader(mode, total, pageSize, category)
    : `Mostrando mais ${pageRows.length} ${pageRows.length === 1 ?"item" : "itens"} do estoque:`;
  const footer = hasMore ?"\n\nQuer ver mais?" : offset > 0 ?"\n\nFim da lista." : "";
  return { text: `${header}\n${lines}${footer}`, nextOffset, hasMore, total };
}

async function saveStockPagination(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  mode: string,
  nextOffset: number,
  pageSize: number,
  category?: unknown
) {
  await saveSession(supabase, owner, {
    etapa: "livre",
    dados: {
      estoque_paginacao: {
        tipo: "estoque_lista",
        consulta_estoque: mode,
        categoria: category || null,
        offset: nextOffset,
        pageSize
      }
    }
  });
}

async function validateBatchRecordReady(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage) {
  const dados = pending.dados || {};

  if (pending.perguntas_faltantes.length) {
    return `faltam dados: ${pending.perguntas_faltantes[0]}`;
  }

  if (ANIMAL_RECORD_INTENTS.has(pending.tipo)) {
    const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!found) return `não encontrei o animal "${dados.animal_codigo || ""}"`;
    if (found.ambiguousRows?.length) return `o animal "${dados.animal_codigo || ""}" está ambíguo`;
    if (!found.exact) return `preciso confirmar o animal parecido "${found.row.brinco}"`;
    if (isAnimalInactiveForBot(found.row)) return animalBlockedMessage(found.row, pending.tipo);
  }

  if (pending.tipo === "ESTOQUE_ENTRADA" || pending.tipo === "ESTOQUE_SAIDA") {
    const found = await findStockItem(supabase, owner, String(dados.item_nome || ""));
    if (!found.row) return `não encontrei "${dados.item_nome || ""}" no estoque`;
    if (found.ambiguousRows?.length) return `o item "${dados.item_nome || ""}" está ambíguo`;
    if (!found.exact) return `preciso confirmar o item parecido "${found.row.nome}"`;
    if (pending.tipo === "ESTOQUE_SAIDA" && Number(dados.quantidade || 0) > Number(found.row.quantidade_atual || 0)) {
      return `saldo insuficiente de ${found.row.nome}`;
    }
  }

  return null;
}

function pendingWithData(pending: ParsedRanchoMessage, dados: AnyRecord): ParsedRanchoMessage {
  return refreshRanchoMessage(pending, { ...pending.dados, ...dados });
}

function importedTableEventDescription(row: AnyRecord, animal?: AnyRecord | null) {
  const label = String(row.evento_label || row.status_original || "Evento").trim();
  const animalCode = String(animal?.brinco || row.animal_codigo || "").trim();
  const notes = String(row.observacoes || "").trim();
  return [
    `${label} importado via WhatsApp${animalCode ?` para o animal ${animalCode}` : ""}`,
    notes ?`Observacoes: ${notes}` : ""
  ].filter(Boolean).join(". ");
}

function importedTableEventDate(value: unknown) {
  return String(value || "").slice(0, 10);
}

function importedTableEventKey(row: AnyRecord) {
  return [
    String(row.animal_id || ""),
    String(row.db_tipo || ""),
    importedTableEventDate(row.data_referencia || row.data_evento),
    normalizeCatalogText(String(row.descricao_salvar || row.descricao || ""))
  ].join("|");
}

async function existingAnimalEventKeysForImport(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,data_evento,descricao")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (error) throw new Error(error.message);

  return new Set(((data || []) as AnyRecord[]).map((row) => importedTableEventKey({
    animal_id: row.animal_id,
    db_tipo: row.tipo,
    data_evento: row.data_evento,
    descricao: row.descricao
  })));
}

async function enrichTabularAnimalEventImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const rows = Array.isArray(dados.linhas) ?dados.linhas as AnyRecord[] : [];
  const animals = await listAnimals(supabase, owner);
  const existingKeys = await existingAnimalEventKeysForImport(supabase, owner);
  const validatedRows: AnyRecord[] = [];

  for (const row of rows) {
    const problems = Array.isArray(row.problemas) ?row.problemas.map(String) : [];
    const next: AnyRecord = {
      ...row,
      problemas_validacao: [...problems],
      status_validacao: "invalido"
    };

    if (!problems.length) {
      const resolved = resolveAnimalIdentifier(row.animal_codigo, animals);
      if (!resolved.row) {
        next.problemas_validacao.push("animal_nao_encontrado");
      } else if (resolved.status === "ambiguous") {
        next.problemas_validacao.push("animal_ambiguo");
        next.animal_opcoes = (resolved.rows || []).slice(0, 5).map((animal) => animalLabel(animal));
      } else if (isAnimalInactiveForBot(resolved.row)) {
        next.problemas_validacao.push("animal_inativo");
        next.animal_status = animalStatusValue(resolved.row) || null;
      } else {
        next.animal_id = resolved.row.id;
        next.animal_codigo = String(resolved.row.brinco || row.animal_codigo || "").trim();
        next.animal_resolvido = {
          id: resolved.row.id,
          brinco: resolved.row.brinco,
          nome: resolved.row.nome
        };
        next.descricao_salvar = importedTableEventDescription(row, resolved.row);

        const duplicateKey = importedTableEventKey(next);
        if (existingKeys.has(duplicateKey)) {
          next.problemas_validacao.push("duplicado");
          next.status_validacao = "duplicado";
        } else {
          existingKeys.add(duplicateKey);
          next.status_validacao = "pronto";
        }
      }
    }

    if (next.problemas_validacao.length && next.status_validacao === "pronto") {
      next.status_validacao = "invalido";
    }
    validatedRows.push(next);
  }

  const readyRows = validatedRows.filter((row) => row.status_validacao === "pronto");
  const invalidRows = validatedRows.filter((row) => row.status_validacao !== "pronto");
  const countIssue = (issue: string) => validatedRows.filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes(issue)).length;

  dados.linhas_validadas = validatedRows;
  dados.linhas_prontas = readyRows;
  dados.linhas_invalidas = invalidRows;
  dados.resumo_validacao = {
    total: validatedRows.length,
    prontas: readyRows.length,
    invalidas: invalidRows.length,
    duplicadas: countIssue("duplicado"),
    animais_nao_encontrados: countIssue("animal_nao_encontrado"),
    animais_ambiguos: countIssue("animal_ambiguo"),
    animais_inativos: countIssue("animal_inativo"),
    datas_ausentes: countIssue("data_ausente"),
    datas_invalidas: countIssue("data_invalida"),
    tipos_desconhecidos: countIssue("tipo_evento_desconhecido"),
    por_tipo: validatedRows.reduce<Record<string, number>>((counts, row) => {
      const key = String(row.evento_tipo || "desconhecido");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  };

  return refreshRanchoMessage(parsed, dados);
}

async function enrichTabularAnimalImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const rows = Array.isArray(dados.linhas) ?dados.linhas as AnyRecord[] : [];
  const animals = await listAnimals(supabase, owner);
  const lots = await listLots(supabase, owner);
  const existingAnimalCodes = new Set(
    animals
      .map((animal) => exactAnimalImportCodeKey(animal.brinco))
      .filter(Boolean)
  );
  const seenTableCodes = new Set<string>();
  const validatedRows: AnyRecord[] = [];
  const createMissingLots = Boolean(dados.criar_lotes_faltantes);

  for (const row of rows) {
    const problems = Array.isArray(row.problemas) ?row.problemas.map(String) : [];
    const next: AnyRecord = {
      ...row,
      problemas_validacao: [...problems],
      status_validacao: "invalido"
    };
    const codeKey = exactAnimalImportCodeKey(row.animal_codigo);

    if (codeKey) {
      if (seenTableCodes.has(codeKey)) {
        next.problemas_validacao.push("duplicado_na_tabela");
        next.status_validacao = "duplicado";
      } else {
        seenTableCodes.add(codeKey);
      }

      if (existingAnimalCodes.has(codeKey)) {
        next.problemas_validacao.push("animal_duplicado");
        next.status_validacao = "duplicado";
      }
    }

    const lotName = String(row.lote_nome || "").trim();
    if (lotName) {
      const lot = bestMatch(lots, lotName, (item) => [item.nome, item.descricao]);
      if (lot?.row && (lot.exact || lot.score >= 0.86)) {
        next.lote_id = lot.row.id;
        next.lote_nome_resolvido = lot.row.nome;
        next.lote_resolvido = {
          id: lot.row.id,
          nome: lot.row.nome
        };
      } else {
        next.problemas_validacao.push("lote_nao_encontrado");
      }
    }

    const uniqueProblems = Array.from(new Set(next.problemas_validacao.map(String)));
    next.problemas_validacao = uniqueProblems;
    const onlyMissingLot = uniqueProblems.length === 1 && uniqueProblems[0] === "lote_nao_encontrado";
    const noProblems = uniqueProblems.length === 0 || (createMissingLots && onlyMissingLot);
    if (noProblems) next.status_validacao = "pronto";
    else if (uniqueProblems.includes("animal_duplicado") || uniqueProblems.includes("duplicado_na_tabela")) next.status_validacao = "duplicado";
    else next.status_validacao = "invalido";
    validatedRows.push(next);
  }

  const readyRows = validatedRows.filter((row) => row.status_validacao === "pronto");
  const invalidRows = validatedRows.filter((row) => row.status_validacao !== "pronto");
  const countIssue = (issue: string) => validatedRows.filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes(issue)).length;
  const missingLotNames = Array.from(new Set(
    validatedRows
      .filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("lote_nao_encontrado"))
      .map((row) => String(row.lote_nome || "").trim())
      .filter(Boolean)
  ));

  dados.linhas_validadas = validatedRows;
  dados.linhas_prontas = readyRows;
  dados.linhas_invalidas = invalidRows;
  dados.criar_lotes_faltantes = createMissingLots;
  dados.resumo_validacao = {
    total: validatedRows.length,
    prontas: readyRows.length,
    invalidas: invalidRows.length,
    duplicadas: countIssue("animal_duplicado") + countIssue("duplicado_na_tabela"),
    lotes_nao_encontrados: countIssue("lote_nao_encontrado"),
    lotes_encontrados: validatedRows.filter((row) => row.lote_id).length,
    parse_invalidas: Number(dados.total_linhas_parse_invalidas || 0),
    categorias_ausentes: countIssue("categoria_ausente"),
    categorias_invalidas: countIssue("categoria_invalida"),
    nomes_lotes_nao_encontrados: missingLotNames,
    por_categoria: validatedRows.reduce<Record<string, number>>((counts, row) => {
      const key = String(row.categoria || "desconhecido");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  };

  return refreshRanchoMessage(parsed, dados);
}

async function enrichTabularStockImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const rows = Array.isArray(dados.linhas) ?dados.linhas as AnyRecord[] : [];
  const stockItems = await listStockItems(supabase, owner);
  const seenKeys = new Set<string>();
  const validatedRows: AnyRecord[] = [];
  const createMissingItems = Boolean(dados.criar_itens_faltantes);

  for (const row of rows) {
    const problems = Array.isArray(row.problemas) ?row.problemas.map(String) : [];
    const next: AnyRecord = {
      ...row,
      problemas_validacao: [...problems],
      status_validacao: "invalido"
    };
    const itemName = String(row.item_nome || row.item_original || "").trim();
    const duplicateKey = [
      normalizeCatalogText(itemName),
      row.tipo_movimento || "",
      row.quantidade ?? "",
      row.unidade || "",
      row.data_referencia || row.data_original || ""
    ].join("|");

    if (duplicateKey && seenKeys.has(duplicateKey)) {
      next.problemas_validacao.push("duplicado_na_tabela");
      next.status_validacao = "duplicado";
    } else {
      seenKeys.add(duplicateKey);
    }

    if (itemName && !problems.includes("item_ausente")) {
      const resolved = resolveStockItem(itemName, stockItems);
      if (resolved.row && resolved.status === "matched") {
        next.item_id = resolved.row.id;
        next.item_resolvido = resolved.row.nome;
        next.unidade_resolvida = resolved.row.unidade_medida || row.unidade || null;
      } else if (createMissingItems) {
        next.criar_item_estoque = true;
      } else {
        next.problemas_validacao.push("item_nao_encontrado");
        next.itens_parecidos = (resolved.rows || [])
          .slice(0, 5)
          .map((item) => String(item.nome || ""))
          .filter(Boolean);
      }
    }

    const uniqueProblems = Array.from(new Set(next.problemas_validacao.map(String)));
    next.problemas_validacao = uniqueProblems;
    const onlyMissingItem = uniqueProblems.length === 1 && uniqueProblems[0] === "item_nao_encontrado";
    const noProblems = uniqueProblems.length === 0 || (createMissingItems && onlyMissingItem);
    if (noProblems) next.status_validacao = "pronto";
    else if (uniqueProblems.includes("duplicado_na_tabela")) next.status_validacao = "duplicado";
    else next.status_validacao = "invalido";
    validatedRows.push(next);
  }

  const readyRows = validatedRows.filter((row) => row.status_validacao === "pronto");
  const invalidRows = validatedRows.filter((row) => row.status_validacao !== "pronto");
  const countIssue = (issue: string) => validatedRows.filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes(issue)).length;
  const missingItemNames = Array.from(new Set(
    validatedRows
      .filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("item_nao_encontrado"))
      .map((row) => String(row.item_nome || row.item_original || "").trim())
      .filter(Boolean)
  ));

  dados.linhas_validadas = validatedRows;
  dados.linhas_prontas = readyRows;
  dados.linhas_invalidas = invalidRows;
  dados.criar_itens_faltantes = createMissingItems;
  dados.resumo_validacao = {
    total: validatedRows.length,
    prontas: readyRows.length,
    invalidas: invalidRows.length,
    duplicadas: countIssue("duplicado_na_tabela"),
    itens_nao_encontrados: countIssue("item_nao_encontrado"),
    nomes_itens_nao_encontrados: missingItemNames,
    datas_invalidas: countIssue("data_invalida"),
    quantidades_invalidas: countIssue("quantidade_ausente") + countIssue("quantidade_invalida"),
    unidades_invalidas: countIssue("unidade_ausente") + countIssue("unidade_invalida"),
    tipos_desconhecidos: countIssue("tipo_movimento_ausente") + countIssue("tipo_movimento_desconhecido"),
    valores_invalidos: countIssue("valor_invalido"),
    por_tipo: validatedRows.reduce<Record<string, number>>((counts, row) => {
      const key = String(row.tipo_movimento || "desconhecido");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  };

  return refreshRanchoMessage(parsed, dados);
}

async function enrichWithCatalog(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  let changed = false;

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    return enrichTabularAnimalEventImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    return enrichTabularAnimalImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    return enrichTabularStockImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros as ParsedRanchoMessage[] : [];
    const enrichedRegistros: ParsedRanchoMessage[] = [];

    for (const registro of registros) {
      enrichedRegistros.push(withoutChildMilkStockMetadata(await enrichWithCatalog(supabase, owner, registro)));
    }

    const productionRecords = enrichedRegistros.filter((registro) => registro.tipo === "PRODUCAO_LEITE");
    const totalLitros = productionRecords.reduce((sum, registro) => sum + Number(registro.dados?.litros || 0), 0);

    dados.registros = enrichedRegistros;
    dados.total_registros = enrichedRegistros.length;
    dados.tipos = Array.from(new Set(enrichedRegistros.map((registro) => registro.tipo)));

    if (productionRecords.length > 1 && shouldResolveMilkStockForProduction(dados, totalLitros)) {
      const resolution = await resolveMilkStockItem(supabase, owner);
      const destinoDetectado = dados.tanque ?"tanque" : null;
      dados.total_litros = totalLitros;
      dados.estoque_leite_detectado = true;
      dados.estoque_leite = milkStockDebug(resolution, totalLitros, destinoDetectado);
      dados.estoque_leite_item_id = resolution.row?.id || null;
      dados.estoque_leite_item_nome = resolution.row?.nome || null;
      dados.estoque_leite_unidade = resolution.row?.unidade_medida || null;
      dados.estoque_leite_opcoes = resolution.options.map((option) => ({
        item_id: option.id || null,
        nome: option.nome || null,
        unidade: option.unidade_medida || null
      }));
      dados.estoque_leite_status = resolution.status;
      dados.estoque_leite_origem = resolution.catalogSource;
      dados.estoque_leite_movimentar = dados.estoque_leite.estoque_movimentar;
    }

    return refreshRanchoMessage(parsed, dados);
  }

  if (parsed.tipo === "PRODUCAO_LEITE" && shouldResolveMilkStockForProduction(dados, Number(dados.litros || 0))) {
    const resolution = await resolveMilkStockItem(supabase, owner);
    const destinoDetectado = dados.tanque ?"tanque" : null;
    dados.total_litros = Number(dados.litros || 0);
    dados.estoque_leite_detectado = true;
    dados.estoque_leite = milkStockDebug(resolution, Number(dados.litros || 0), destinoDetectado);
    dados.estoque_leite_item_id = resolution.row?.id || null;
    dados.estoque_leite_item_nome = resolution.row?.nome || null;
    dados.estoque_leite_unidade = resolution.row?.unidade_medida || null;
    dados.estoque_leite_opcoes = resolution.options.map((option) => ({
      item_id: option.id || null,
      nome: option.nome || null,
      unidade: option.unidade_medida || null
    }));
    dados.estoque_leite_status = resolution.status;
    dados.estoque_leite_origem = resolution.catalogSource;
    dados.estoque_leite_movimentar = dados.estoque_leite.estoque_movimentar;
    changed = true;
  }

  if (ANIMAL_LOOKUP_INTENTS.has(parsed.tipo) && dados.animal_codigo) {
    const found = await findAnimal(supabase, owner, String(dados.animal_codigo));
    if (found && !found.ambiguousRows?.length && (found.exact || found.score >= 0.9)) {
      dados.animal_codigo = found.row.brinco;
      dados.animal_id = found.row.id;
      dados.animal_status = animalStatusValue(found.row) || null;
      dados.animal_resolvido = found.row;
      botAnimalCheckLog(owner, parsed, found.row, !isAnimalInactiveForBot(found.row));
      changed = true;
    } else if (found?.ambiguousRows?.length) {
      dados.animal_opcoes = found.ambiguousRows.map((row) => row.brinco);
      dados.animal_referencia_nao_encontrada = dados.animal_codigo;
      dados.animal_codigo = undefined;
      changed = true;
    } else if (!found) {
      dados.animal_referencia_nao_encontrada = dados.animal_codigo;
      dados.animal_codigo = undefined;
      changed = true;
    }
  }

  if (parsed.tipo === "PARTO" && partoWithChild(dados)) {
    const mother = dados.animal_resolvido as AnyRecord | undefined;
    if (mother && animalSexKind(mother) === "macho") {
      dados.parto_bloqueio = `O animal ${animalLabel(mother)} está marcado como macho. Para registrar parto com cria, informe uma mãe fêmea. Nada foi salvo.`;
      changed = true;
    }

    const childSex = normalizeCalfSex(dados.cria_sexo);
    if (childSex && childSex !== dados.cria_sexo) {
      dados.cria_sexo = childSex;
      changed = true;
    }
    if (childSex && !dados.cria_categoria) {
      dados.cria_categoria = calfCategoryForSex(childSex);
      changed = true;
    }

    if (mother && dados.gerar_cria_codigo_temporario && !dados.cria_codigo) {
      dados.cria_codigo = calfCodeFromParto(dados, mother);
      changed = true;
    }

    if (dados.cria_codigo) {
      const duplicate = await findAnimal(supabase, owner, String(dados.cria_codigo));
      if (duplicate?.row && duplicate.exact) {
        dados.cria_codigo_duplicado = duplicate.row.brinco || dados.cria_codigo;
        dados.cria_codigo = undefined;
        dados.gerar_cria_codigo_temporario = undefined;
        changed = true;
      }
    }

    const fatherRef = String(dados.pai_ref || dados.pai_nome || "").trim();
    if (fatherRef && !dados.pai_id) {
      const father = await findAnimal(supabase, owner, fatherRef);
      if (father && !father.ambiguousRows?.length && (father.exact || father.score >= 0.86)) {
        if (animalSexKind(father.row) === "femea") {
          dados.parto_bloqueio = `O pai informado (${animalLabel(father.row)}) está marcado como fêmea. Corrija o pai ou registre o parto sem pai informado. Nada foi salvo.`;
        } else {
          dados.pai_id = father.row.id;
          dados.pai_ref = father.row.brinco || fatherRef;
          dados.pai_nome = animalLabel(father.row);
          dados.pai_resolvido = father.row;
          dados.pai_nao_informado = undefined;
          dados.precisa_pai_ref = undefined;
        }
        changed = true;
      } else {
        dados.pai_referencia_nao_encontrada = fatherRef;
        dados.pai_opcoes = father?.ambiguousRows?.map((row) => animalLabel(row)) || [];
        dados.pai_ref = undefined;
        dados.pai_nome = undefined;
        dados.pai_id = undefined;
        dados.precisa_pai_ref = true;
        changed = true;
      }
    } else if (!fatherRef && !dados.pai_id) {
      dados.pai_nao_informado = true;
    }
  }

  if (parsed.tipo === "ATUALIZACAO_GENEALOGIA" && dados.animal_id) {
    const resolveParent = async (field: "mae" | "pai") => {
      const valueKey = `${field}_nome`;
      const idKey = `${field}_id`;
      const notFoundKey = `${field}_referencia_nao_encontrada`;
      const optionsKey = `${field}_opcoes`;
      if (!dados[valueKey] || dados[idKey]) return;

      const found = await findAnimal(supabase, owner, String(dados[valueKey]));
      if (found && !found.ambiguousRows?.length && (found.exact || found.score >= 0.86)) {
        dados[idKey] = found.row.id;
        dados[valueKey] = animalLabel(found.row);
        dados[`${field}_resolvido`] = found.row;
        dados[notFoundKey] = undefined;
        dados[optionsKey] = undefined;
        changed = true;
        return;
      }

      dados[notFoundKey] = dados[valueKey];
      dados[optionsKey] = found?.ambiguousRows?.map((row) => animalLabel(row)) || [];
      dados[valueKey] = undefined;
      dados[idKey] = undefined;
      changed = true;
    };

    await resolveParent("mae");
    await resolveParent("pai");

    const animalId = String(dados.animal_id || "");
    const motherId = dados.remover_mae ?null : dados.mae_id ?String(dados.mae_id) : null;
    const fatherId = dados.remover_pai ?null : dados.pai_id ?String(dados.pai_id) : null;

    if ((motherId && motherId === animalId) || (fatherId && fatherId === animalId)) {
      addGenealogyBlock(dados, "O animal não pode ser pai ou mãe dele mesmo. Nada foi salvo.");
      changed = true;
    } else if (motherId || fatherId) {
      const animals = await listAnimals(supabase, owner);
      const descendants = collectDescendantIds(animalId, animals);
      if ((motherId && descendants.has(motherId)) || (fatherId && descendants.has(fatherId))) {
        addGenealogyBlock(dados, "Não é possível escolher um descendente como pai ou mãe. Nada foi salvo.");
        changed = true;
      }
    }
  }

  if (parsed.tipo === "CADASTRO_ANIMAL" && dados.lote_nome && !dados.lote_id) {
    const found = await findLot(supabase, owner, String(dados.lote_nome));
    if (found && (found.exact || found.score >= 0.86)) {
      dados.lote_id = found.row.id;
      dados.lote_nome = found.row.nome;
      dados.lote_nao_encontrado = undefined;
      dados.lote_opcoes = undefined;
      changed = true;
    } else {
      dados.lote_nao_encontrado = dados.lote_nome;
      dados.lote_nome = undefined;
      dados.lote_id = undefined;
      changed = true;
    }
  }

  if (parsed.tipo === "PONTO_FUNCIONARIO" && !dados.funcionario_nome && owner.funcionario_id) {
    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,ativo,deleted_at")
      .eq("id", owner.funcionario_id)
      .eq("fazenda_id", owner.fazenda_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data && data.ativo !== false && !data.deleted_at) {
      dados.funcionario_nome = data.nome || owner.nome_exibicao || "";
      dados.funcionario_id = data.id;
      changed = true;
    }
  }

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM"].includes(parsed.tipo) && dados.item_nome) {
    const originalItemName = String(dados.item_nome);
    const found = await findStockItem(supabase, owner, originalItemName);
    const stockResolution = stockResolutionDebug(originalItemName, found);
    const decision = stockDecisionReason(parsed, found, owner);

    dados.item_extraido = originalItemName;
    dados.item_normalizado = stockResolution.item_normalizado;
    dados.origem_catalogo = stockResolution.origem_catalogo;
    dados.quantidade_itens_catalogo = stockResolution.quantidade_itens_catalogo;
    dados.candidatos_catalogo = stockResolution.candidatos_catalogo;
    dados.status_resolucao = stockResolution.status_resolucao;
    dados.score_resolucao = stockResolution.score;
    dados.item_estoque_encontrado = stockResolution.item_estoque_encontrado;
    dados.item_resolvido = stockResolution.item_resolvido;
    dados.item_id = stockResolution.item_id;
    dados.motivo_processamento = decision;
    changed = true;

    botLog("stock_resolution", owner, {
      currentIntent: parsed.tipo,
      status: "catalogo",
      stockResolution,
      decision
    });

    if (found.row && !found.ambiguousRows?.length && (found.exact || found.score >= 0.86)) {
      dados.item_nome = found.row.nome;
      dados.item_id = found.row.id;
      dados.item_resolvido = found.row.nome;
      dados.item_estoque_encontrado = true;
      changed = true;
    }

    if (parsed.tipo === "ESTOQUE_ENTRADA" && dados.compra && !found.row && !isBotAdmin(owner)) {
      const financeData = {
        valor: dados.valor,
        descricao: dados.item_nome,
        data_referencia: dados.data_referencia,
        item_extraido: originalItemName,
        item_normalizado: stockResolution.item_normalizado,
        item_resolvido: null,
        item_estoque_encontrado: false,
        item_id: null,
        motivo_processamento: decision
      };
      return refreshRanchoMessage({ ...parsed, tipo: "DESPESA", dados: financeData }, financeData);
    }

    if (parsed.tipo === "ESTOQUE_SAIDA" && dados.venda && !found.row) {
      const financeData = {
        valor: dados.valor,
        descricao: `venda de ${dados.item_nome || originalItemName}`,
        data_referencia: dados.data_referencia,
        quantidade: dados.quantidade,
        unidade: dados.unidade,
        item_extraido: originalItemName,
        item_normalizado: stockResolution.item_normalizado,
        item_resolvido: null,
        item_estoque_encontrado: false,
        item_id: null,
        motivo_processamento: decision
      };
      return refreshRanchoMessage({ ...parsed, tipo: "RECEITA_VENDA", dados: financeData }, financeData);
    }
  }

  return changed ?refreshRanchoMessage(parsed, dados) : parsed;
}

async function saveConfirmedRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage): Promise<SaveResult> {
  const dados = pending.dados || {};
  const invalidReason = validatePendingForSave(pending);
  if (invalidReason) return { response: invalidReason };

  if (pending.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    const summary = domainTableSummary(pending);
    return {
      response: `Preview confirmado: tabela de ${tabularDomainLabel(summary.domain as Parameters<typeof tabularDomainLabel>[0])} com ${summary.total} linha(s) pre-validadas. Nenhum registro real foi salvo porque esse dominio ainda precisa de persistencia especifica.`,
      savedReal: false,
      savedTables: []
    };
  }

  if (pending.tipo === "EXCLUIR_REBANHO") {
    logDestructiveBulkBlock(owner, {
      currentIntent: pending.tipo,
      source: "save_confirmed_record_legacy",
      blocked: true
    });
    return { response: DESTRUCTIVE_BULK_ACTION_MESSAGE };
  }

  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const rows = tabularImportRows(pending).filter((row) => row.status_validacao === "pronto");
    if (!rows.length) return { response: "Não encontrei linhas válidas para importar. Nada foi salvo." };

    const existingKeys = await existingAnimalEventKeysForImport(supabase, owner);
    let saved = 0;
    let skippedDuplicates = 0;

    for (const row of rows) {
      const key = importedTableEventKey(row);
      if (existingKeys.has(key)) {
        skippedDuplicates += 1;
        continue;
      }

      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: row.animal_id,
        tipo: row.db_tipo || "observacao",
        data_evento: isoFromReference(String(row.data_referencia || "hoje")),
        descricao: row.descricao_salvar || importedTableEventDescription(row),
        medicamento: null,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      existingKeys.add(key);
      saved += 1;
    }

    if (!saved) {
      return { response: `Nada novo foi importado. ${skippedDuplicates} linha(s) já estavam registradas como duplicadas.` };
    }

    const duplicateText = skippedDuplicates ?`\nDuplicadas ignoradas no salvamento: ${skippedDuplicates}.` : "";
    return realSaveResult(`Pronto, ${saved} evento(s) do rebanho importados com sucesso.${duplicateText}`, [TABLES.eventosAnimal]);
  }

  if (pending.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const rows = animalImportRows(pending).filter((row) => row.status_validacao === "pronto");
    if (!rows.length) return { response: "Não encontrei animais válidos para cadastrar. Nada foi salvo." };

    const animals = await listAnimals(supabase, owner);
    const existingAnimalCodes = new Set(
      animals
        .map((animal) => exactAnimalImportCodeKey(animal.brinco))
        .filter(Boolean)
    );
    const createMissingLots = Boolean(dados.criar_lotes_faltantes);
    const createdLots = new Map<string, string>();
    const savedTables = new Set<string>();
    let saved = 0;
    let skippedDuplicates = 0;
    let createdLotCount = 0;

    if (createMissingLots) {
      const missingLotNames = Array.from(new Set(
        rows
          .filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("lote_nao_encontrado"))
          .map((row) => String(row.lote_nome || "").trim())
          .filter(Boolean)
      ));

      for (const lotName of missingLotNames) {
        const existingLot = await findLot(supabase, owner, lotName);
        if (existingLot?.row && (existingLot.exact || existingLot.score >= 0.86)) {
          createdLots.set(exactAnimalImportCodeKey(lotName), String(existingLot.row.id || ""));
          continue;
        }

        const lot = await insertRealRecord(supabase, owner, TABLES.lotes, {
          fazenda_id: owner.fazenda_id,
          nome: lotName,
          descricao: "Criado via importacao tabular do WhatsApp",
          ativo: true
        });
        if (lot?.id) createdLots.set(exactAnimalImportCodeKey(lotName), String(lot.id));
        savedTables.add(TABLES.lotes);
        createdLotCount += 1;
      }
    }

    for (const row of rows) {
      const code = exactAnimalImportCodeKey(row.animal_codigo);
      if (!code || existingAnimalCodes.has(code)) {
        skippedDuplicates += 1;
        continue;
      }

      let lotId = row.lote_id || null;
      if (!lotId && createMissingLots && row.lote_nome) {
        lotId = createdLots.get(exactAnimalImportCodeKey(row.lote_nome)) || null;
      }

      await insertRealRecord(supabase, owner, TABLES.animais, {
        fazenda_id: owner.fazenda_id,
        brinco: code,
        nome: row.nome || null,
        categoria: row.categoria || "outro",
        sexo: row.sexo || "nao_informado",
        fase: row.fase || "nao_aplicavel",
        raca: row.raca || null,
        peso: row.peso !== undefined && row.peso !== null && row.peso !== "" ?Number(row.peso) : null,
        lote_id: lotId,
        data_nascimento: row.data_nascimento || null,
        status: row.status || "ativo",
        created_by: owner.usuario_id || null,
        observacoes: row.observacoes || "Cadastrado via importacao tabular do WhatsApp"
      });
      existingAnimalCodes.add(code);
      savedTables.add(TABLES.animais);
      saved += 1;
    }

    if (!saved) {
      return { response: `Nada novo foi cadastrado. ${skippedDuplicates} animal(is) ja existiam no rebanho.` };
    }

    const duplicateText = skippedDuplicates ?`\nDuplicados ignorados no salvamento: ${skippedDuplicates}.` : "";
    const lotText = createdLotCount ?`\nLotes criados: ${createdLotCount}.` : "";
    const baseResponse = `Pronto, ${saved} animal(is) cadastrados com sucesso.${lotText}${duplicateText}`;
    const sourceEvents = dados.eventos_apos_cadastro as ParsedRanchoMessage | undefined;
    if (sourceEvents?.tipo === "IMPORTACAO_EVENTOS_TABELA") {
      const nextEvents = await enrichTabularAnimalEventImport(supabase, owner, sourceEvents);
      return {
        response: `${baseResponse}\n\nAgora posso importar os eventos dessa tabela.\n${confirmationText(nextEvents)}`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextEvents } },
        savedReal: true,
        savedTables: Array.from(savedTables)
      };
    }

    return realSaveResult(baseResponse, Array.from(savedTables));
  }

  if (pending.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const rows = stockImportRows(pending).filter((row) => row.status_validacao === "pronto");
    if (!rows.length) return { response: "Não encontrei linhas válidas de estoque para importar. Nada foi salvo." };

    const createMissingItems = Boolean(dados.criar_itens_faltantes);
    const createdItems = new Map<string, AnyRecord>();
    const savedTables = new Set<string>();
    let saved = 0;
    let createdItemCount = 0;

    if (createMissingItems) {
      const missingItemRows = rows.filter((row) => row.criar_item_estoque);
      const missingItemNames = Array.from(new Set(
        missingItemRows
          .map((row) => String(row.item_nome || row.item_original || "").trim())
          .filter(Boolean)
      ));

      for (const itemName of missingItemNames) {
        const existingItem = await findStockItem(supabase, owner, itemName);
        if (existingItem?.row && (existingItem.exact || existingItem.score >= 0.86)) {
          createdItems.set(normalizeCatalogText(itemName), existingItem.row);
          continue;
        }

        const firstRow = missingItemRows.find((row) => normalizeCatalogText(row.item_nome || row.item_original) === normalizeCatalogText(itemName));
        const item = await insertRealRecord(supabase, owner, TABLES.estoqueItens, {
          fazenda_id: owner.fazenda_id,
          nome: itemName,
          categoria: stockCategoryFromName(itemName),
          unidade_medida: firstRow?.unidade || "unidade",
          quantidade_atual: 0,
          quantidade_minima: 0,
          valor_unitario: firstRow?.valor ?Number(firstRow.valor) / Math.max(1, Number(firstRow.quantidade || 1)) : 0,
          fornecedor: null,
          ativo: true,
          created_by: owner.usuario_id || null
        });
        if (item?.id) createdItems.set(normalizeCatalogText(itemName), item as AnyRecord);
        savedTables.add(TABLES.estoqueItens);
        createdItemCount += 1;
      }
    }

    for (const row of rows) {
      let itemId = row.item_id || null;
      let itemName = row.item_resolvido || row.item_nome || row.item_original || "item";
      let unit = row.unidade_resolvida || row.unidade || "unidade";

      if (!itemId && createMissingItems && row.criar_item_estoque) {
        const createdItem = createdItems.get(normalizeCatalogText(row.item_nome || row.item_original));
        itemId = createdItem?.id || null;
        itemName = createdItem?.nome || itemName;
        unit = createdItem?.unidade_medida || unit;
      }

      if (!itemId) continue;

      await insertRealRecord(supabase, owner, TABLES.estoqueMovimentacoes, {
        fazenda_id: owner.fazenda_id,
        item_id: itemId,
        tipo: row.tipo_movimento === "saida" ?"saida" : "entrada",
        quantidade: Number(row.quantidade),
        valor_unitario: row.valor ?Number(row.valor) / Math.max(1, Number(row.quantidade || 1)) : null,
        motivo: `Importado por tabela via WhatsApp: ${itemName} (${unit})`,
        responsavel_usuario_id: owner.usuario_id || null,
        origem: "whatsapp"
      });
      savedTables.add(TABLES.estoqueMovimentacoes);
      saved += 1;
    }

    if (!saved) return { response: "Nenhuma movimentação de estoque foi importada. Nada foi salvo." };

    const itemText = createdItemCount ?`\nItens criados: ${createdItemCount}.` : "";
    return realSaveResult(`Importação de estoque concluída:\n- ${saved} linha(s) importada(s).${itemText}`, Array.from(savedTables));
  }

  if (pending.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros as ParsedRanchoMessage[] : [];
    if (!registros.length) return { response: "Não encontrei registros válidos nesse lote. Envie novamente." };

    const savedTables = new Set<string>();
    const summaries: string[] = [];

    for (let index = 0; index < registros.length; index += 1) {
      const reason = await validateBatchRecordReady(supabase, owner, registros[index]);
      if (reason) {
        return { response: `Não salvei o lote. O registro ${index + 1} precisa de ajuste: ${reason}.` };
      }
    }

    for (let index = 0; index < registros.length; index += 1) {
      const registro = registros[index];
      const result = await saveConfirmedRecord(supabase, owner, registro);

      if (result.nextSession) {
        return {
          response: `Preciso revisar o registro ${index + 1} do lote antes de salvar tudo.\n${result.response}`,
          nextSession: result.nextSession
        };
      }

      if (!result.savedReal) {
        return { response: `Não salvei o lote. O registro ${index + 1} precisa de ajuste:\n${result.response}` };
      }

      for (const table of result.savedTables || []) savedTables.add(table);
      summaries.push(`${index + 1}. ${registro.resumo}`);
    }

    const stockMovement = await saveMilkStockMovementIfNeeded(
      supabase,
      owner,
      pending,
      Number(dados.total_litros || 0),
      registros.filter((registro) => registro.tipo === "PRODUCAO_LEITE").map((registro) => String(registro.dados?.animal_codigo || "")).filter(Boolean)
    );
    if (stockMovement) savedTables.add(TABLES.estoqueMovimentacoes);

    const response = stockMovement
      ?`Registro salvo com sucesso: ${registros.length} produções registradas e estoque de ${(pending.dados?.estoque_leite as AnyRecord | undefined)?.item_leite_resolvido || "leite"} atualizado.`
      :`Pronto, ${registros.length} registros salvos com sucesso.\n${summaries.join("\n")}${milkStockAfterSaveText(pending)}`;

    return realSaveResult(response, Array.from(savedTables));
  }

  if (ANIMAL_RECORD_INTENTS.has(pending.tipo)) {
    const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!found) {
      return {
        response: `Não encontrei o animal "${dados.animal_codigo || ""}" no rebanho. Me envie o brinco cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.brinco}`).join("\n");
      return {
        response: `Encontrei mais de um animal parecido. Me envie o brinco correto:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (!found.exact) {
      const nextPending = pendingWithData(pending, { animal_codigo: found.row.brinco });
      return {
        response: `Encontrei um animal parecido: ${found.row.brinco}. Quer usar esse animal?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const animal = found.row;
    botAnimalCheckLog(owner, pending, animal, !isAnimalInactiveForBot(animal));
    if (isAnimalInactiveForBot(animal)) {
      return {
        response: animalBlockedMessage(animal, pending.tipo),
        nextSession: { etapa: "livre", dados: {} }
      };
    }

    if (pending.tipo === "PRODUCAO_LEITE") {
      const production = await insertRealRecord(supabase, owner, TABLES.ordenhas, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        litros: Number(dados.litros),
        ordenhado_em: isoFromReference(dados.data_referencia),
        turno: dados.turno || "manha",
        destino: dados.destino_leite || "tanque",
        origem: "whatsapp",
        registrado_por: owner.usuario_id || null,
        observacoes: `Registrado via WhatsApp (${owner.telefone_e164})`
      });
      const savedTables: string[] = [TABLES.ordenhas];
      const stockMovement = await saveMilkStockMovementIfNeeded(supabase, owner, pending, Number(dados.litros || 0), [animal.brinco], String(production?.id || ""));
      if (stockMovement) savedTables.push(TABLES.estoqueMovimentacoes);
      if (stockMovement) {
        return realSaveResult(`Registro salvo com sucesso: produção registrada e estoque de ${(pending.dados?.estoque_leite as AnyRecord | undefined)?.item_leite_resolvido || "leite"} atualizado.`, savedTables);
      }
      return realSaveResult(`Pronto, registro salvo com sucesso.\nProdução: ${animal.brinco}, ${formatNumber(dados.litros, " L")}.${milkStockAfterSaveText(pending)}`, savedTables);
    }

    if (pending.tipo === "PARTO") {
      if (partoWithChild(dados)) {
        if (animalSexKind(animal) === "macho") {
          return { response: `O animal ${animalLabel(animal)} esta marcado como macho. Para registrar parto com cria, informe uma mae femea. Nada foi salvo.` };
        }

        const childSex = normalizeCalfSex(dados.cria_sexo);
        if (!childSex) {
          return {
            response: "Informe se a cria nasceu macho ou femea antes de salvar.",
            nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { cria_sexo: undefined }) } }
          };
        }

        const childCode = calfCodeFromParto({ ...dados, cria_sexo: childSex }, animal);
        if (!childCode) {
          return {
            response: "Qual e o codigo/brinco da cria? Responda 2 para gerar um codigo temporario.",
            nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { cria_codigo: undefined }) } }
          };
        }

        const duplicateChild = await findAnimal(supabase, owner, childCode);
        if (duplicateChild?.row && duplicateChild.exact) {
          return {
            response: `Ja existe um animal com o codigo/brinco ${childCode}. Me envie outro codigo para a cria ou responda 2 para gerar um codigo temporario.`,
            nextSession: {
              etapa: "aguardando_dado",
              dados: {
                pending: pendingWithData(pending, {
                  cria_codigo: undefined,
                  gerar_cria_codigo_temporario: undefined,
                  cria_codigo_duplicado: childCode
                })
              }
            }
          };
        }

        const duplicatePartos = await existingPartoSameDay(supabase, owner, animal.id, dados.data_referencia);
        if (duplicatePartos.length && !dados.confirmar_duplicidade_parto) {
          const nextPending = pendingWithData(pending, { confirmar_duplicidade_parto: true, cria_codigo: childCode, cria_sexo: childSex });
          return {
            response: partoDuplicateConfirmationMessage(animal, String(dados.data_referencia || "hoje")),
            nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
          };
        }

        let father: AnyRecord | null = null;
        if (dados.pai_resolvido && typeof dados.pai_resolvido === "object") {
          father = dados.pai_resolvido as AnyRecord;
        } else if (dados.pai_id) {
          const animals = await listAnimals(supabase, owner);
          father = animals.find((row) => String(row.id) === String(dados.pai_id)) || null;
        } else if (dados.pai_ref || dados.pai_nome) {
          const fatherRef = String(dados.pai_ref || dados.pai_nome || "").trim();
          const fatherFound = await findAnimal(supabase, owner, fatherRef);
          if (fatherFound?.ambiguousRows?.length) {
            return {
              response: `Encontrei mais de um pai parecido. Me envie o brinco correto ou responda sem pai:\n${animalOptionsText(fatherFound.ambiguousRows)}`,
              nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { pai_ref: undefined, pai_nome: undefined, pai_id: undefined, precisa_pai_ref: true }) } }
            };
          }
          if (!fatherFound?.row || (!fatherFound.exact && fatherFound.score < 0.86)) {
            return {
              response: `Nao encontrei o pai "${fatherRef}". Me envie o brinco do pai ou responda sem pai.`,
              nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { pai_ref: undefined, pai_nome: undefined, pai_id: undefined, precisa_pai_ref: true }) } }
            };
          }
          father = fatherFound.row;
        }

        if (father && animalSexKind(father) === "femea") {
          return { response: `O pai informado (${animalLabel(father)}) esta marcado como femea. Corrija o pai ou registre o parto sem pai informado. Nada foi salvo.` };
        }

        const normalizedDados = {
          ...dados,
          cria_codigo: childCode,
          cria_sexo: childSex,
          cria_categoria: dados.cria_categoria || calfCategoryForSex(childSex)
        };

        await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
          fazenda_id: owner.fazenda_id,
          animal_id: animal.id,
          tipo: "parto",
          data_evento: isoFromReference(dados.data_referencia),
          descricao: partoChildEventDescription(normalizedDados, animal, childCode, father),
          medicamento: null,
          dose: null,
          custo: 0,
          responsavel_usuario_id: owner.usuario_id || null
        });

        await insertRealRecord(supabase, owner, TABLES.animais, calfPayloadFromParto(owner, normalizedDados, animal, father));

        const savedTables: string[] = [TABLES.eventosAnimal, TABLES.animais];
        if (animal.fase === "gestante") {
          const { error } = await supabase
            .from(TABLES.animais)
            .update({ fase: "lactacao" })
            .eq("id", animal.id)
            .eq("fazenda_id", owner.fazenda_id);
          if (error) throw new Error(error.message);
        }

        return realSaveResult([
          `Pronto, parto registrado e cria ${childCode} cadastrada.`,
          `Mae: ${animalLabel(animal)}.`,
          `Pai: ${father ? animalLabel(father) : "nao informado"}.`,
          "A mae continua com a categoria/fase produtiva do cadastro; recem-parida sera exibido pelo ultimo evento de parto."
        ].join("\n"), savedTables);
      }

      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: "parto",
        data_evento: isoFromReference(dados.data_referencia),
        descricao: `Parto registrado via WhatsApp para o animal ${animal.brinco}`,
        medicamento: null,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      const savedTables: string[] = [TABLES.eventosAnimal];
      if (animal.fase === "gestante") {
        const { error } = await supabase
          .from(TABLES.animais)
          .update({ fase: "lactacao" })
          .eq("id", animal.id)
          .eq("fazenda_id", owner.fazenda_id);
        if (error) throw new Error(error.message);
        savedTables.push(TABLES.animais);
      }
      return realSaveResult(`Pronto, registro salvo com sucesso.\nParto registrado para ${animal.brinco}.`, savedTables);
    }

    if (pending.tipo === "VACINA_MEDICAMENTO") {
      const tipo = dados.evento_tipo === "vacina" ?"vacina" : "tratamento";
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo,
        data_evento: isoFromReference(dados.data_referencia),
        descricao: `${tipo === "vacina" ?"Vacina" : "Tratamento"} registrado via WhatsApp`,
        medicamento: dados.produto,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      return realSaveResult(`Pronto, registro salvo com sucesso.\n${tipo === "vacina" ?"Vacina" : "Tratamento"} em ${animal.brinco}: ${dados.produto}.`, [TABLES.eventosAnimal]);
    }

    if (pending.tipo === "MORTE") {
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: "observacao",
        data_evento: isoFromReference(dados.data_referencia),
        descricao: `Morte registrada via WhatsApp para o animal ${animal.brinco}`,
        medicamento: null,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });

      const { error } = await supabase
        .from(TABLES.animais)
        .update({ status: "morto" })
        .eq("id", animal.id)
        .eq("fazenda_id", owner.fazenda_id);
      if (error) throw new Error(error.message);

      return realSaveResult(`Pronto, registro salvo com sucesso.\nAnimal ${animal.brinco} marcado como morto.`, [TABLES.eventosAnimal, TABLES.animais]);
    }
  }

  if (pending.tipo === "ATUALIZACAO_GENEALOGIA") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para alterar genealogia pelo bot. Peça para um administrador fazer essa alteração." };
    }

    const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!found?.row) {
      return {
        response: `Não encontrei o animal "${dados.animal_codigo || ""}" no rebanho. Me envie o brinco cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      return {
        response: `Encontrei mais de um animal parecido. Me envie o brinco correto:\n${animalOptionsText(found.ambiguousRows)}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    const animal = found.row;
    const payload = genealogyPayloadFromData(dados);
    if (!Object.keys(payload).length) {
      return {
        response: "Não reconheci qual relação genealógica deve ser atualizada. Envie mãe, pai ou cancelar.",
        nextSession: { etapa: "aguardando_dado", dados: { pending } }
      };
    }

    const nextMother = payload.mae_id === undefined ?String(animal.mae_id || "") : payload.mae_id ?String(payload.mae_id) : "";
    const nextFather = payload.pai_id === undefined ?String(animal.pai_id || "") : payload.pai_id ?String(payload.pai_id) : "";
    if ((nextMother && nextMother === animal.id) || (nextFather && nextFather === animal.id)) {
      return { response: "O animal não pode ser pai ou mãe dele mesmo. Nada foi salvo." };
    }

    if (nextMother || nextFather) {
      const animals = await listAnimals(supabase, owner);
      const descendants = collectDescendantIds(String(animal.id), animals);
      if ((nextMother && descendants.has(nextMother)) || (nextFather && descendants.has(nextFather))) {
        return { response: "Não é possível escolher um descendente como pai ou mãe. Nada foi salvo." };
      }
    }

    const { data, error } = await supabase
      .from(TABLES.animais)
      .update(payload)
      .eq("id", animal.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.animais, "update", data || { ...animal, ...payload });

    const updated = { ...animal, ...payload };
    const animals = await listAnimals(supabase, owner);
    const byId = new Map(animals.map((row) => [String(row.id), row]));
    return realSaveResult([
      "Pronto, genealogia atualizada com sucesso.",
      `Animal: ${animalLabel(updated)}.`,
      `Mãe: ${updated.mae_id ?animalLabel(byId.get(String(updated.mae_id))) : "Não informado"}.`,
      `Pai: ${updated.pai_id ?animalLabel(byId.get(String(updated.pai_id))) : "Não informado"}.`
    ].join("\n"), [TABLES.animais]);
  }

  if (pending.tipo === "ATUALIZACAO_ANIMAL") {
    const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!found) {
      return {
        response: `Não encontrei o animal "${dados.animal_codigo || ""}" no rebanho. Me envie o brinco cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.brinco}`).join("\n");
      return {
        response: `Encontrei mais de um animal parecido. Me envie o brinco correto:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      };
    }

    if (!found.exact) {
      const nextPending = pendingWithData(pending, { animal_codigo: found.row.brinco });
      return {
        response: `Encontrei um animal parecido: ${found.row.brinco}. Quer usar esse animal?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const animal = found.row;

    if (dados.registro_evento_animal) {
      const custo = hasBotValue(dados.custo ?? dados.valor) ?Number(dados.custo ?? dados.valor) : 0;
      const descricao = String(dados.descricao || dados.novo_valor || pending.resumo || "Ocorrência registrada via WhatsApp");
      const reproductiveKind = normalizedReproductiveEventKind(dados, descricao);
      const eventType = reproductiveKind ?reproductiveEventDbType(reproductiveKind) : "observacao";
      const eventoLabel = reproductiveKind
        ? reproductiveEventLabel(reproductiveKind)
        : dados.evento_tipo === "reprodutivo" ?"Ocorrência reprodutiva" : "Ocorrência clínica";
      const origemInseminacao = String(dados.origem_inseminacao || "").trim();
      const eventDescription = reproductiveKind
        ? reproductiveEventDescription(reproductiveKind, descricao, origemInseminacao)
        : `${eventoLabel} registrada via WhatsApp: ${descricao}`;
      const savedTables: string[] = [TABLES.eventosAnimal];

      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: eventType,
        data_evento: isoFromReference(dados.data_referencia),
        descricao: eventDescription,
        medicamento: reproductiveKind === "inseminacao" && origemInseminacao ?origemInseminacao : null,
        dose: null,
        custo,
        responsavel_usuario_id: owner.usuario_id || null
      });

      if (reproductiveKind === "prenhez" && String(dados.campo_alterado || "") === "fase" && hasBotValue(dados.novo_valor)) {
        const { data, error } = await supabase
          .from(TABLES.animais)
          .update({ fase: String(dados.novo_valor) })
          .eq("id", animal.id)
          .eq("fazenda_id", owner.fazenda_id)
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        await logAudit(supabase, owner, TABLES.animais, "update", data || { ...animal, fase: String(dados.novo_valor) });
        savedTables.push(TABLES.animais);
      }

      let financeText = "";
      if (custo > 0 && isBotAdmin(owner)) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "saida",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: custo,
          categoria: reproductiveKind ?"Reprodução animal" : "Saúde animal",
          descricao: `${eventoLabel} de ${animal.brinco}: ${descricao}`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });
        savedTables.push(TABLES.transacoesFinanceiras);
        financeText = `\nSaída financeira: ${formatMoney(custo)}.`;
      } else if (custo > 0) {
        financeText = "\nO custo informado não foi lançado no financeiro porque seu usuário não tem permissão para financeiro.";
      }

      return realSaveResult(`Pronto, registro salvo com sucesso.\n${eventoLabel} em ${animal.brinco}.${financeText}`, savedTables);
    }

    const field = String(dados.campo_alterado || "");
    const value = dados.novo_valor;
    let payload: AnyRecord = {};
    let label = field;

    if (field === "lote_id") {
      const lot = await findLot(supabase, owner, String(value || dados.lote_nome || ""));
      if (!lot?.row) {
        return {
          response: `Não encontrei o lote "${value || ""}". Me envie o nome de um lote cadastrado ou envie cancelar.`,
          nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { novo_valor: undefined, lote_nome: undefined }) } }
        };
      }
      if (!lot.exact) {
        const nextPending = pendingWithData(pending, { novo_valor: lot.row.nome, lote_nome: lot.row.nome, lote_id: lot.row.id });
        return {
          response: `Encontrei um lote parecido: ${lot.row.nome}. Quer usar esse lote?\n1 - Confirmar\n2 - Corrigir`,
          nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
        };
      }
      payload = { lote_id: lot.row.id };
      label = "lote";
    } else if (["fase", "status", "nome", "raca", "data_nascimento", "observacoes"].includes(field)) {
      payload = { [field]: String(value || "") };
    } else if (field === "peso") {
      payload = { peso: Number(value) };
    } else {
      return {
        response: "Não reconheci qual dado do animal deve ser atualizado. Envie de novo com lote, fase, status, nome, raça, peso, nascimento ou observação.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { campo_alterado: undefined, novo_valor: undefined }) } }
      };
    }

    const { data, error } = await supabase
      .from(TABLES.animais)
      .update(payload)
      .eq("id", animal.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.animais, "update", data || { ...animal, ...payload });

    return realSaveResult(`Pronto, animal atualizado com sucesso.\n${animal.brinco}: ${label} atualizado.`, [TABLES.animais]);
  }

  if (pending.tipo === "CADASTRO_ANIMAL") {
    const duplicate = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (duplicate?.row && duplicate.exact) {
      return { response: `Já existe um animal com o brinco/código ${duplicate.row.brinco || dados.animal_codigo} neste rancho. Nada foi salvo.` };
    }

    await insertRealRecord(supabase, owner, TABLES.animais, {
      fazenda_id: owner.fazenda_id,
      brinco: dados.animal_codigo,
      nome: dados.nome || null,
      categoria: dados.categoria || "outro",
      sexo: dados.sexo || "nao_informado",
      fase: dados.fase || "nao_aplicavel",
      raca: dados.raca || null,
      peso: dados.peso !== undefined && dados.peso !== null && dados.peso !== "" ?Number(dados.peso) : null,
      lote_id: dados.lote_id || null,
      data_nascimento: dados.data_nascimento || null,
      status: "ativo",
      created_by: owner.usuario_id || null,
      observacoes: dados.observacoes || "Cadastrado via WhatsApp"
    });
    const details = [
      dados.nome ?`Nome: ${dados.nome}.` : "",
      `Brinco: ${dados.animal_codigo}.`,
      dados.sexo ?`Sexo: ${dados.sexo}.` : "",
      dados.fase ?`Fase: ${dados.fase}.` : "",
      dados.raca ?`Raça: ${dados.raca}.` : "",
      dados.peso ?`Peso: ${dados.peso} kg.` : "",
      dados.lote_nome ?`Lote: ${dados.lote_nome}.` : "",
      dados.data_nascimento ?`Nascimento: ${dados.data_nascimento}.` : "",
      dados.observacoes ?`Observações: ${dados.observacoes}.` : ""
    ].filter(Boolean).join("\n");
    return realSaveResult(`Pronto, animal cadastrado com sucesso.\n${details}`, [TABLES.animais]);
  }

  if (pending.tipo === "CRIAR_LOTE") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para criar lotes pelo bot. Peça para um administrador fazer esse cadastro." };
    }

    const lotName = String(dados.lote_nome || "").trim();
    if (!lotName) {
      return {
        response: "Qual será o nome do lote?",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { lote_nome: undefined }) } }
      };
    }

    const found = await findLot(supabase, owner, lotName);
    if (found?.row && found.exact) {
      return { response: `Já existe um lote chamado ${found.row.nome}. Nada foi salvo.` };
    }

    await insertRealRecord(supabase, owner, TABLES.lotes, {
      fazenda_id: owner.fazenda_id,
      nome: lotName,
      descricao: null,
      ativo: true
    });

    return realSaveResult(`Pronto, lote ${lotName} criado com sucesso.`, [TABLES.lotes]);
  }

  if (pending.tipo === "DESPESA" || pending.tipo === "RECEITA_VENDA") {
    const tipo = pending.tipo === "DESPESA" ?"saida" : "entrada";
    if (pending.tipo === "DESPESA" && dados.item_extraido) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "salvar_financeiro",
        stockResolution: {
          item_extraido: dados.item_extraido,
          item_normalizado: dados.item_normalizado,
          item_resolvido: dados.item_resolvido || null,
          item_estoque_encontrado: Boolean(dados.item_estoque_encontrado),
          item_id: dados.item_id || null
        },
        decision: dados.motivo_processamento || "item_nao_encontrado: financeiro_apenas"
      });
    }

    await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
      fazenda_id: owner.fazenda_id,
      tipo,
      data_transacao: dateOnlyFromReference(dados.data_referencia),
      valor: Number(dados.valor),
      categoria: dados.descricao || (tipo === "saida" ?"Despesa via WhatsApp" : "Receita via WhatsApp"),
      descricao: dados.descricao || pending.resumo,
      metodo_pagamento: "whatsapp",
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    return realSaveResult(`Pronto, registro salvo com sucesso.\n${tipo === "saida" ?"Saída" : "Entrada"}: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
  }

  if (pending.tipo === "ESTOQUE_CADASTRO" || pending.tipo === "CRIAR_ITEM_ESTOQUE") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para criar itens de estoque. Peça para um administrador cadastrar esse item." };
    }

    const found = await findStockItem(supabase, owner, String(dados.item_nome || ""));
    if (found.row && found.exact) {
      return { response: `Não criei um novo item porque "${found.row.nome}" já existe no estoque.` };
    }

    if (found?.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.nome}`).join("\n");
      return {
        response: `Encontrei itens parecidos. Me envie o nome exato do item novo ou use um existente:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { item_nome: undefined }) } }
      };
    }

    if (found.row && found.score >= 0.86) {
      const nextPending = pendingWithData(pending, { item_nome: found.row.nome });
      return {
        response: `Encontrei um item parecido: ${found.row.nome}. Quer usar esse item em vez de criar outro?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    await insertRealRecord(supabase, owner, TABLES.estoqueItens, {
      fazenda_id: owner.fazenda_id,
      nome: dados.item_nome,
      categoria: stockCategoryFromName(String(dados.item_nome || "")),
      unidade_medida: dados.unidade || "unidade",
      quantidade_atual: Number(dados.quantidade || 0),
      quantidade_minima: 0,
      valor_unitario: 0,
      fornecedor: null,
      ativo: true,
      created_by: owner.usuario_id || null
    });

    if (dados.compra && dados.valor) {
      await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
        fazenda_id: owner.fazenda_id,
        tipo: "saida",
        data_transacao: dateOnlyFromReference(dados.data_referencia),
        valor: Number(dados.valor),
        categoria: dados.item_nome,
        descricao: `Compra de ${dados.item_nome} registrada via WhatsApp`,
        metodo_pagamento: "whatsapp",
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });

      return realSaveResult(
        `Pronto, item cadastrado no estoque e despesa registrada.\n${dados.item_nome}: ${formatStockAmount(dados.quantidade, dados.unidade)}.\nDespesa: ${formatMoney(dados.valor)}.`,
        [TABLES.estoqueItens, TABLES.transacoesFinanceiras]
      );
    }

    return realSaveResult(`Pronto, item cadastrado no estoque.\n${dados.item_nome}: ${formatStockAmount(dados.quantidade, dados.unidade)}.`, [TABLES.estoqueItens]);
  }

  if (pending.tipo === "ESTOQUE_ENTRADA" || pending.tipo === "ESTOQUE_SAIDA") {
    const found = await findStockItem(supabase, owner, String(dados.item_nome || ""));
    const stockResolution = stockResolutionDebug(dados.item_nome, found);
    if (!found.row) {
      const decision = stockDecisionReason(pending, found, owner);
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "item_nao_encontrado",
        stockResolution,
        decision
      });

      if (pending.tipo === "ESTOQUE_ENTRADA" && dados.compra && isBotAdmin(owner)) {
        return {
          response: `Não encontrei "${dados.item_nome || ""}" no estoque. Deseja criar o item de estoque ou registrar apenas como despesa?\n1 - Criar item de estoque\n2 - Registrar apenas despesa`,
          nextSession: { etapa: "aguardando_dado", dados: { pending, acao_pendente: "compra_item_nao_encontrado" } }
        };
      }

      if (pending.tipo === "ESTOQUE_SAIDA" && dados.venda && hasBotValue(dados.valor)) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "entrada",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: Number(dados.valor),
          categoria: dados.item_nome || "Venda via WhatsApp",
          descricao: `Venda de ${dados.item_nome || "item"} registrada via WhatsApp`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });

        return realSaveResult(`Pronto, receita salva com sucesso.\nReceita: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
      }

      return {
        response: `Não encontrei "${dados.item_nome || ""}" no estoque. Me envie o nome do item cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { item_nome: undefined }) } }
      };
    }

    if (found.ambiguousRows?.length) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "item_ambiguo",
        stockResolution,
        decision: "item_ambiguo: pedir_item_correto"
      });

      const options = found.ambiguousRows.slice(0, 5).map((row) => `- ${row.nome}`).join("\n");
      return {
        response: `Encontrei mais de um item parecido. Me envie o item correto:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { item_nome: undefined }) } }
      };
    }

    if (!found.exact) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "item_sugerido",
        stockResolution,
        decision: "item_parecido: pedir_confirmacao"
      });

      const nextPending = pendingWithData(pending, { item_nome: found.row.nome });
      return {
        response: `Encontrei um item parecido: ${found.row.nome}. Quer usar esse item?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const type = pending.tipo === "ESTOQUE_ENTRADA" ?"entrada" : "saida";
    const current = Number(found.row.quantidade_atual || 0);
    const quantity = Number(dados.quantidade || 0);

    if (pending.tipo === "ESTOQUE_SAIDA" && dados.venda && hasBotValue(dados.valor) && dados.deve_baixar_estoque !== true) {
      if (dados.deve_baixar_estoque === false) {
        await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
          fazenda_id: owner.fazenda_id,
          tipo: "entrada",
          data_transacao: dateOnlyFromReference(dados.data_referencia),
          valor: Number(dados.valor),
          categoria: dados.item_nome || found.row.nome,
          descricao: `Venda de ${dados.item_nome || found.row.nome} registrada via WhatsApp`,
          metodo_pagamento: "whatsapp",
          origem: "whatsapp",
          created_by: owner.usuario_id || null
        });

        return realSaveResult(`Pronto, receita salva com sucesso.\nReceita: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
      }

      return {
        response: physicalSaleStockDecisionQuestion(refreshRanchoMessage(pending, { ...dados, item_estoque_encontrado: true, item_id: found.row.id, item_resolvido: found.row.nome })),
        nextSession: { etapa: "aguardando_dado", dados: { pending: refreshRanchoMessage(pending, { ...dados, item_estoque_encontrado: true, item_id: found.row.id, item_resolvido: found.row.nome }), acao_pendente: "venda_baixa_estoque_opcional" } }
      };
    }

    if (type === "saida" && quantity > current) {
      return { response: `Não salvei. O saldo de ${found.row.nome} é ${formatStockAmount(current, found.row.unidade_medida)}, menor que a baixa pedida.` };
    }

    await insertRealRecord(supabase, owner, TABLES.estoqueMovimentacoes, {
      fazenda_id: owner.fazenda_id,
      item_id: found.row.id,
      tipo: type,
      quantidade: quantity,
      valor_unitario: found.row.valor_unitario || null,
      motivo: `Registrado via WhatsApp (${owner.telefone_e164})`,
      responsavel_usuario_id: owner.usuario_id || null,
      origem: "whatsapp"
    });

    if (pending.tipo === "ESTOQUE_SAIDA" && dados.venda && dados.valor) {
      botLog("stock_sale_decision", owner, {
        currentIntent: pending.tipo,
        status: "salvar_estoque_receita",
        stockResolution: stockResolutionDebug(dados.item_nome, found),
        decision: "item_encontrado: estoque+receita"
      });

      await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
        fazenda_id: owner.fazenda_id,
        tipo: "entrada",
        data_transacao: dateOnlyFromReference(dados.data_referencia),
        valor: Number(dados.valor),
        categoria: found.row.nome,
        descricao: `Venda de ${found.row.nome} registrada via WhatsApp`,
        metodo_pagamento: "whatsapp",
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });

      return realSaveResult(
        `Pronto, registros salvos com sucesso.\nSaída: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.\nReceita: ${formatMoney(dados.valor)}.`,
        [TABLES.estoqueMovimentacoes, TABLES.transacoesFinanceiras]
      );
    }

    if (pending.tipo === "ESTOQUE_ENTRADA" && dados.compra && dados.valor) {
      botLog("stock_purchase_decision", owner, {
        currentIntent: pending.tipo,
        status: "salvar_estoque_financeiro",
        stockResolution: stockResolutionDebug(dados.item_nome, found),
        decision: "item_encontrado: estoque+financeiro"
      });

      await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
        fazenda_id: owner.fazenda_id,
        tipo: "saida",
        data_transacao: dateOnlyFromReference(dados.data_referencia),
        valor: Number(dados.valor),
        categoria: found.row.nome,
        descricao: `Compra de ${found.row.nome} registrada via WhatsApp`,
        metodo_pagamento: "whatsapp",
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });

      return realSaveResult(
        `Pronto, registros salvos com sucesso.\nEntrada: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.\nDespesa: ${formatMoney(dados.valor)}.`,
        [TABLES.estoqueMovimentacoes, TABLES.transacoesFinanceiras]
      );
    }

    return realSaveResult(`Pronto, movimentação salva com sucesso.\n${type === "entrada" ?"Entrada" : "Baixa"}: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.`, [TABLES.estoqueMovimentacoes]);
  }

  if (pending.tipo === "CRIAR_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para cadastrar funcionários pelo bot. Peça para um administrador fazer esse cadastro." };
    }

    const phone = normalizeWhatsappNumber(dados.telefone);
    if (!isValidBotPhone(phone)) {
      return {
        response: "Informe um WhatsApp válido para o funcionário.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { telefone: undefined }) } }
      };
    }

    const { data: employees, error: employeesError } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,cpf,contato_whatsapp,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (employeesError) throw new Error(employeesError.message);

    const duplicateEmployee = ((employees || []) as AnyRecord[]).find((row) => (
      row.ativo !== false && !row.deleted_at && whatsappNumbersMatch(phone, String(row.contato_whatsapp || ""))
    ));
    if (duplicateEmployee) {
      return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está vinculado ao funcionário ${duplicateEmployee.nome}.` };
    }

    const cpf = String(dados.cpf || "").replace(/\D/g, "");
    if (cpf && cpf.length !== 11) {
      return { response: "Informe um CPF válido para o funcionário ou responda 2 para deixar sem CPF." };
    }
    if (cpf) {
      const duplicateCpf = ((employees || []) as AnyRecord[]).find((row) => (
        row.ativo !== false && !row.deleted_at && String(row.cpf || "").replace(/\D/g, "") === cpf
      ));
      if (duplicateCpf) return { response: `Não cadastrei. O CPF informado já está vinculado ao funcionário ${duplicateCpf.nome}.` };
    }

    let whatsappRows: AnyRecord[] = [];
    {
      const { data, error } = await supabase
        .from(TABLES.whatsappUsuarios)
        .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (error) throw new Error(error.message);
      whatsappRows = (data || []) as AnyRecord[];

      const activeWhatsapp = whatsappRows.find((row) => (
        row.ativo !== false && whatsappNumbersMatch(phone, String(row.telefone_e164 || ""))
      ));
      if (activeWhatsapp) {
        return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está ativo para ${activeWhatsapp.nome_exibicao || "outro usuário"}.` };
      }
    }

    const employee = await insertRealRecord(supabase, owner, TABLES.funcionarios, {
      fazenda_id: owner.fazenda_id,
      nome: dados.funcionario_nome,
      funcao: dados.funcao || "Funcionário",
      cpf: cpf || null,
      contato_whatsapp: phone,
      salario_base: Number(dados.salario_base || 0),
      data_admissao: String(dados.data_admissao || dateOnly()).slice(0, 10),
      carga_horaria_mensal: 220,
      valor_hora_extra: 0,
      tipo_acesso: dados.tipo_acesso || "bot_only",
      papel_sistema: "bot_only",
      ativo: true
    });

    const savedTables: string[] = [TABLES.funcionarios];
    {
      const reusableWhatsapp = whatsappRows.find((row) => (
        whatsappNumbersMatch(phone, String(row.telefone_e164 || "")) && (row.ativo === false || !row.funcionario_id)
      ));
      const whatsappPayload = {
        fazenda_id: owner.fazenda_id,
        telefone_e164: phone,
        usuario_id: null,
        funcionario_id: employee.id,
        nome_exibicao: dados.funcionario_nome,
        papel_bot: "funcionario",
        ativo: true
      };

      if (reusableWhatsapp?.id) {
        const { error } = await supabase
          .from(TABLES.whatsappUsuarios)
          .update(whatsappPayload)
          .eq("id", reusableWhatsapp.id)
          .eq("fazenda_id", owner.fazenda_id);
        if (error) throw new Error(error.message);
      } else {
        await insertRealRecord(supabase, owner, TABLES.whatsappUsuarios, whatsappPayload);
      }
      savedTables.push(TABLES.whatsappUsuarios);
    }

    return realSaveResult(`Pronto, funcionário cadastrado com sucesso.\n${dados.funcionario_nome}: ${formatWhatsappForBot(phone)}.`, savedTables);
  }

  if (pending.tipo === "ATUALIZAR_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para atualizar funcionários pelo bot. Peça para um administrador fazer essa alteração." };
    }

    const found = await findEmployee(supabase, owner, String(dados.funcionario_nome || ""));
    if (!found) {
      return {
        response: `Não encontrei o funcionário "${dados.funcionario_nome || ""}". Me envie o nome como está cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { funcionario_nome: undefined }) } }
      };
    }
    if (!found.exact) {
      const nextPending = pendingWithData(pending, { funcionario_nome: found.row.nome });
      return {
        response: `Encontrei um funcionário parecido: ${found.row.nome}. Quer usar esse funcionário?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const field = String(dados.campo_alterado || "");
    const value = dados.novo_valor;
    let payload: AnyRecord = {};
    let label = field;
    const savedTables: string[] = [TABLES.funcionarios];

    if (field === "salario_base") {
      payload = { salario_base: Number(value || 0) };
      label = "salário";
    } else if (field === "contato_whatsapp") {
      const phone = normalizeWhatsappNumber(value);
      if (!isValidBotPhone(phone)) {
        return {
          response: "Informe um WhatsApp válido para o funcionário.",
          nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { novo_valor: undefined }) } }
        };
      }

      const { data: employees, error: employeesError } = await supabase
        .from(TABLES.funcionarios)
        .select("id,nome,contato_whatsapp,ativo,deleted_at")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (employeesError) throw new Error(employeesError.message);
      const duplicateEmployee = ((employees || []) as AnyRecord[]).find((row) => (
        row.id !== found.row.id && row.ativo !== false && !row.deleted_at && whatsappNumbersMatch(phone, String(row.contato_whatsapp || ""))
      ));
      if (duplicateEmployee) {
        return { response: `Não atualizei. O WhatsApp ${formatWhatsappForBot(phone)} já está vinculado ao funcionário ${duplicateEmployee.nome}.` };
      }

      const { data: whatsappRows, error: whatsappError } = await supabase
        .from(TABLES.whatsappUsuarios)
        .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (whatsappError) throw new Error(whatsappError.message);
      const rows = (whatsappRows || []) as AnyRecord[];
      const activeWhatsapp = rows.find((row) => (
        row.funcionario_id !== found.row.id && row.ativo !== false && whatsappNumbersMatch(phone, String(row.telefone_e164 || ""))
      ));
      if (activeWhatsapp) {
        return { response: `Não atualizei. O WhatsApp ${formatWhatsappForBot(phone)} já está ativo para ${activeWhatsapp.nome_exibicao || "outro usuário"}.` };
      }

      payload = { contato_whatsapp: phone };
      label = "WhatsApp";
    } else if (field === "cpf") {
      const cpf = String(value || "").replace(/\D/g, "");
      if (cpf && cpf.length !== 11) {
        return {
          response: "Informe um CPF com 11 dígitos ou envie cancelar.",
          nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { novo_valor: undefined }) } }
        };
      }
      payload = { cpf: cpf || null };
      label = "CPF";
    } else if (field === "nome") {
      payload = { nome: String(value || "").trim() };
      label = "nome";
    } else if (field === "funcao") {
      payload = { funcao: String(value || "").trim() };
      label = "cargo";
    } else if (field === "ativo") {
      payload = { ativo: Boolean(value) };
      label = "status";
    } else {
      return {
        response: "Não reconheci qual dado do funcionário deve ser atualizado. Envie de novo com salário, cargo, WhatsApp, CPF, nome ou status.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { campo_alterado: undefined, novo_valor: undefined }) } }
      };
    }

    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .update(payload)
      .eq("id", found.row.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.funcionarios, "update", data || { ...found.row, ...payload });

    if (field === "contato_whatsapp" && payload.contato_whatsapp) {
      const { data: whatsappRows, error: whatsappError } = await supabase
        .from(TABLES.whatsappUsuarios)
        .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
        .eq("fazenda_id", owner.fazenda_id)
        .limit(2000);
      if (whatsappError) throw new Error(whatsappError.message);
      const rows = (whatsappRows || []) as AnyRecord[];
      const current = rows.find((row) => row.funcionario_id === found.row.id)
        || rows.find((row) => whatsappNumbersMatch(payload.contato_whatsapp, String(row.telefone_e164 || "")) && (row.ativo === false || !row.funcionario_id));
      const whatsappPayload = {
        fazenda_id: owner.fazenda_id,
        telefone_e164: payload.contato_whatsapp,
        usuario_id: null,
        funcionario_id: found.row.id,
        nome_exibicao: payload.nome || found.row.nome,
        papel_bot: "funcionario",
        ativo: true
      };
      if (current?.id) {
        const { error: updateWhatsappError } = await supabase
          .from(TABLES.whatsappUsuarios)
          .update(whatsappPayload)
          .eq("id", current.id)
          .eq("fazenda_id", owner.fazenda_id);
        if (updateWhatsappError) throw new Error(updateWhatsappError.message);
      } else {
        await insertRealRecord(supabase, owner, TABLES.whatsappUsuarios, whatsappPayload);
      }
      savedTables.push(TABLES.whatsappUsuarios);
    }

    return realSaveResult(`Pronto, funcionário atualizado com sucesso.\n${found.row.nome}: ${label} atualizado.`, savedTables);
  }

  if (pending.tipo === "DESLIGAR_FUNCIONARIO" || pending.tipo === "EXCLUIR_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para desligar ou excluir funcionários pelo bot. Peça para um administrador fazer essa alteração." };
    }

    const found = await findEmployee(supabase, owner, String(dados.funcionario_nome || ""));
    if (!found) {
      return {
        response: `Não encontrei o funcionário "${dados.funcionario_nome || ""}". Me envie o nome como está cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { funcionario_nome: undefined }) } }
      };
    }
    if (!found.exact) {
      const nextPending = pendingWithData(pending, { funcionario_nome: found.row.nome });
      return {
        response: `Encontrei um funcionário parecido: ${found.row.nome}. Quer usar esse funcionário?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const payload = pending.tipo === "EXCLUIR_FUNCIONARIO"
      ? { ativo: false, deleted_at: nowIso() }
      : { ativo: false };
    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .update(payload)
      .eq("id", found.row.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.funcionarios, "update", data || { ...found.row, ...payload });

    const { error: whatsappError } = await supabase
      .from(TABLES.whatsappUsuarios)
      .update({ ativo: false })
      .eq("funcionario_id", found.row.id)
      .eq("fazenda_id", owner.fazenda_id);
    if (whatsappError) throw new Error(whatsappError.message);

    const action = pending.tipo === "EXCLUIR_FUNCIONARIO" ?"excluído" : "desligado";
    return realSaveResult(`Pronto, funcionário ${action} com sucesso.\n${found.row.nome}.`, [TABLES.funcionarios, TABLES.whatsappUsuarios]);
  }

  if (pending.tipo === "PAGAMENTO_FUNCIONARIO") {
    if (!isBotAdmin(owner)) {
      return { response: "Você não tem permissão para registrar pagamento de funcionários pelo bot. Peça para um administrador fazer esse lançamento." };
    }

    const found = await findEmployee(supabase, owner, String(dados.funcionario_nome || ""));
    if (!found) {
      return {
        response: `Não encontrei o funcionário "${dados.funcionario_nome || ""}". Qual é o nome correto ou WhatsApp?`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { funcionario_nome: undefined }) } }
      };
    }
    if (!found.exact) {
      const nextPending = pendingWithData(pending, { funcionario_nome: found.row.nome });
      return {
        response: `Encontrei um funcionário parecido: ${found.row.nome}. Quer usar esse funcionário?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const paymentType = String(dados.pagamento_tipo || "salario");
    const value = Number(dados.valor || 0);
    const competencia = monthStartFromPaymentPeriod(String(dados.periodo_pagamento || "mes_atual"));
    const paidAt = dateOnlyFromReference(dados.data_referencia);

    const { data: existingPayroll, error: payrollLookupError } = await supabase
      .from(TABLES.folhaPagamento)
      .select("id,funcionario_id,competencia,salario_base,horas_extras,valor_horas_extras,descontos,adiantamentos,total_liquido,status,pago_em")
      .eq("fazenda_id", owner.fazenda_id)
      .eq("funcionario_id", found.row.id)
      .gte("competencia", competencia)
      .lt("competencia", monthRange(monthKeyFromDate(competencia)).end.slice(0, 10))
      .maybeSingle();
    if (payrollLookupError) throw new Error(payrollLookupError.message);

    if (existingPayroll?.status === "paga" && paymentType === "salario" && !dados.confirmar_pagamento_duplicado) {
      const nextPending = pendingWithData(pending, { confirmar_pagamento_duplicado: true, funcionario_nome: found.row.nome });
      return {
        response: `Já existe pagamento registrado para ${found.row.nome} neste período. Deseja registrar outro pagamento mesmo assim?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    const base = Number(existingPayroll?.salario_base ?? found.row.salario_base ?? 0);
    const currentExtra = Number(existingPayroll?.valor_horas_extras ?? 0);
    const currentDiscounts = Number(existingPayroll?.descontos ?? 0);
    const currentAdvance = Number(existingPayroll?.adiantamentos ?? 0);
    const payrollPayload = {
      fazenda_id: owner.fazenda_id,
      funcionario_id: found.row.id,
      competencia,
      salario_base: paymentType === "salario" ? value : base,
      horas_extras: Number(existingPayroll?.horas_extras ?? 0),
      valor_horas_extras: paymentType === "bonus" || paymentType === "diaria" ? currentExtra + value : currentExtra,
      descontos: currentDiscounts,
      adiantamentos: paymentType === "adiantamento" ? currentAdvance + value : currentAdvance,
      total_liquido: paymentType === "adiantamento"
        ? Math.max(0, base + currentExtra - currentDiscounts - (currentAdvance + value))
        : paymentType === "salario" ? value : base + currentExtra + value - currentDiscounts - currentAdvance,
      status: paymentType === "salario" ? "paga" : String(existingPayroll?.status || "rascunho"),
      pago_em: paymentType === "salario" ? paidAt : existingPayroll?.pago_em || null
    };

    let payrollRecord: AnyRecord;
    if (existingPayroll?.id) {
      const { data, error } = await supabase
        .from(TABLES.folhaPagamento)
        .update(safeBotPayload(TABLES.folhaPagamento, payrollPayload))
        .eq("id", existingPayroll.id)
        .eq("fazenda_id", owner.fazenda_id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      payrollRecord = data || { ...existingPayroll, ...payrollPayload };
      await logAudit(supabase, owner, TABLES.folhaPagamento, "update", payrollRecord);
    } else {
      payrollRecord = await insertRealRecord(supabase, owner, TABLES.folhaPagamento, payrollPayload);
    }

    await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
      fazenda_id: owner.fazenda_id,
      tipo: "saida",
      data_transacao: paidAt,
      valor: value,
      categoria: "Folha de pagamento",
      descricao: `Pagamento de ${paymentType} - ${found.row.nome}`,
      metodo_pagamento: "whatsapp",
      origem: `folha_pagamento:${payrollRecord.id || found.row.id}`,
      created_by: owner.usuario_id || null
    });

    return realSaveResult(
      `Pronto, pagamento salvo com sucesso.\n${found.row.nome}: ${formatMoney(value)} (${paymentType}). Folha e financeiro atualizados.`,
      [TABLES.folhaPagamento, TABLES.transacoesFinanceiras]
    );
  }

  if (pending.tipo === "PONTO_FUNCIONARIO") {
    const found = await findEmployee(supabase, owner, String(dados.funcionario_nome || ""));
    if (!found) {
      return {
        response: `Não encontrei o funcionário "${dados.funcionario_nome || ""}". Me envie o nome como está cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { funcionario_nome: undefined }) } }
      };
    }

    if (!found.exact) {
      const nextPending = pendingWithData(pending, { funcionario_nome: found.row.nome });
      return {
        response: `Encontrei um funcionário parecido: ${found.row.nome}. Quer usar esse funcionário?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      };
    }

    await insertRealRecord(supabase, owner, TABLES.registrosPonto, {
      fazenda_id: owner.fazenda_id,
      funcionario_id: found.row.id,
      tipo: dados.ponto_tipo || "entrada",
      registrado_em: isoFromReference(dados.data_referencia, dados.horario),
      observacao: `Registrado via WhatsApp (${owner.telefone_e164})`,
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    return realSaveResult(`Pronto, ponto salvo com sucesso.\n${found.row.nome}: ${dados.ponto_tipo || "entrada"}${dados.horario ?` às ${dados.horario}` : ""}.`, [TABLES.registrosPonto]);
  }

  if (pending.tipo === "ORDEM_SERVICO") {
    return {
      response: "Confirmação recebida. Ainda não existe uma tabela segura de ordens de serviço no Rancho, então não salvei como registro real.",
      sessionData: {
        ultimo_pendente_sem_tabela: pending,
        confirmado_em: nowIso()
      }
    };
  }

  return { response: unknownText() };
}

async function handleHerdConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const lots = await listLots(supabase, owner);
  const lotById = new Map(lots.map((lot) => [String(lot.id), lot]));
  let lotFilter: AnyRecord | null = null;

  if (dados.lote_nome) {
    const foundLot = await findLot(supabase, owner, String(dados.lote_nome));
    if (!foundLot?.row) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return `Não encontrei o lote "${dados.lote_nome}".`;
    }
    lotFilter = foundLot.row;
  }

  const animals = await listAnimals(supabase, owner);
  const reproduction = herdReproductionFilter(dados.reproducao || dados.filtro_reprodutivo);
  const animalEvents = reproduction ?await listAnimalEventsForHerdConsultation(supabase, owner) : [];
  const eventMap = eventsByAnimalId(animalEvents);
  const filtered = animals.filter((animal) => {
    if (dados.categoria && normalizeRanchoText(animal.categoria || "") !== normalizeRanchoText(String(dados.categoria))) return false;
    if (dados.sexo && normalizeRanchoText(animal.sexo || "nao_informado") !== normalizeRanchoText(String(dados.sexo))) return false;
    if (dados.status && normalizeRanchoText(animalStatusLabel(animal)) !== normalizeRanchoText(String(dados.status))) return false;
    if (dados.sem_lote && animal.lote_id) return false;
    if (lotFilter && String(animal.lote_id || "") !== String(lotFilter.id || "")) return false;
    if (!animalMatchesReproductiveFilter(animal, eventMap, reproduction)) return false;
    return true;
  });

  const statusCounts = filtered.reduce((acc, animal) => {
    const key = animalStatusLabel(animal);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categoryCounts = filtered.reduce((acc, animal) => {
    const key = String(animal.categoria || "sem categoria");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const label = filterLabel(dados, lotFilter ?lotLabel(lotFilter) : undefined);

  parsed.dados.consulta_executada = "rebanho";
  parsed.dados.resultado = {
    total: filtered.length,
    filtros: {
      categoria: dados.categoria || null,
      sexo: dados.sexo || null,
      status: dados.status || null,
      reproducao: reproduction || null,
      lote_id: lotFilter?.id || null,
      lote_nome: lotFilter ?lotLabel(lotFilter) : null,
      sem_lote: Boolean(dados.sem_lote)
    },
    status: statusCounts,
    categorias: categoryCounts
  };

  if (!filtered.length) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    if (reproduction === "prenhe") return `Não encontrei ${label} no momento.`;
    if (reproduction === "inseminada") return `Não encontrei ${label} no momento.`;
    if (reproduction === "pre_parto") return `Não encontrei ${label} no momento.`;
    return `Não encontrei ${label} cadastrados.`;
  }

  const mode = String(dados.modo || "lista");
  if (mode === "contagem") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return `Encontrei ${filtered.length} ${countAwareHerdLabel(label, filtered.length)}.`;
  }

  if (mode === "resumo") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    const categories = Object.entries(categoryCounts).map(([key, value]) => `${key}: ${value}`).join(", ");
    const statuses = Object.entries(statusCounts).map(([key, value]) => `${key}: ${value}`).join(", ");
    return `Resumo do rebanho (${label}): ${filtered.length} animais.\nCategorias: ${categories || "sem dados"}.\nStatus: ${statuses || "sem dados"}.`;
  }

  const page = paginateRows(filtered, dados.pagina, HERD_PAGE_SIZE);
  const lines = page.rows.map((animal, index) => animalListLine(animal, lotById, page.start + index, eventMap, reproduction)).join("\n");
  const hasMore = page.end < filtered.length;
  if (hasMore) {
    await saveHerdPagination(supabase, owner, dados, Math.min(page.currentPage + 1, page.totalPages), HERD_PAGE_SIZE, lotFilter ?lotLabel(lotFilter) : undefined);
  } else {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  }
  const pageText = hasMore
    ?`\nMostrando ${page.start + 1}-${page.end} de ${filtered.length}. Para continuar esta consulta, peça "ver mais" ou "pagina ${Math.min(page.currentPage + 1, page.totalPages)} do rebanho".`
    : "";
  return `Encontrei ${filtered.length} ${countAwareHerdLabel(label, filtered.length)}:\n${lines}${pageText}`;
}

async function handleLotConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  if (dados.sem_lote) return handleHerdConsultation(supabase, owner, { ...parsed, tipo: "CONSULTA_REBANHO" });

  const lots = await listLots(supabase, owner);
  const animals = await listAnimals(supabase, owner);
  const countsByLot = animals.reduce((acc, animal) => {
    const key = String(animal.lote_id || "");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  parsed.dados.consulta_executada = "lotes";
  parsed.dados.resultado = {
    total_lotes: lots.length,
    lotes: lots.map((lot) => ({
      id: lot.id,
      nome: lotLabel(lot),
      animais: countsByLot[String(lot.id)] || 0
    })),
    sem_lote: countsByLot[""] || 0
  };

  if (!lots.length) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não há lotes cadastrados nesse rancho.";
  }

  const page = paginateRows(lots, dados.pagina, LOT_PAGE_SIZE);
  const lines = page.rows.map((lot) => `- ${lotLabel(lot)}: ${countsByLot[String(lot.id)] || 0} animais`).join("\n");
  const semLoteText = countsByLot[""] ?`\nSem lote: ${countsByLot[""]} animais.` : "";
  const hasMore = page.end < lots.length;
  if (hasMore) {
    await saveLotPagination(supabase, owner, Math.min(page.currentPage + 1, page.totalPages), LOT_PAGE_SIZE);
  } else {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  }
  const pageText = hasMore
    ?`\nMostrando ${page.start + 1}-${page.end} de ${lots.length}. Para continuar esta consulta, peça "ver mais" ou "pagina ${Math.min(page.currentPage + 1, page.totalPages)} dos lotes".`
    : "";
  return `Você tem ${lots.length} lotes cadastrados:\n${lines}${semLoteText}${pageText}`;
}

async function handleHerdPagination(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession, command: string) {
  const pagination = session.dados?.rebanho_paginacao as AnyRecord | undefined;
  if (!pagination || !["rebanho_lista", "lotes_lista"].includes(String(pagination.tipo || ""))) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return { response: "Não há mais animais para mostrar agora." };
  }

  const page = pageNumberFromCommand(command) || Math.max(1, Number(pagination.nextPage || 1) || 1);
  const parsed = pagination.tipo === "lotes_lista"
    ? parsedLotPaginationMessage(page)
    : parsedHerdPaginationMessage(pagination, page);
  const response = parsed.tipo === "CONSULTA_LOTES"
    ? await handleLotConsultation(supabase, owner, parsed)
    : await handleHerdConsultation(supabase, owner, parsed);

  return { response, parsed };
}

async function lotCreationPreflight(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (parsed.tipo !== "CRIAR_LOTE" || parsed.perguntas_faltantes.length) return null;
  const lotName = String(parsed.dados?.lote_nome || "").trim();
  if (!lotName) return null;
  const found = await findLot(supabase, owner, lotName);
  if (found?.row && found.exact) {
    return `Já existe um lote chamado ${found.row.nome}. Nada foi salvo.`;
  }
  if (found?.row && found.score >= 0.9) {
    return `Encontrei um lote parecido: ${found.row.nome}. Se quiser criar outro lote, envie o nome completo do lote novo.`;
  }
  return null;
}

async function animalCreationPreflight(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (parsed.tipo !== "CADASTRO_ANIMAL" || parsed.perguntas_faltantes.length) return null;
  const code = String(parsed.dados?.animal_codigo || "").trim();
  if (!code) return null;
  const found = await findAnimal(supabase, owner, code);
  if (found?.row && found.exact) {
    return `Já existe um animal com o brinco/código ${found.row.brinco || code} neste rancho. Nada foi salvo.`;
  }
  return null;
}

async function handleStockHistoryConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const itemName = String(parsed.dados.item_nome || "").trim();
  let itemId: string | null = null;
  let itemLabel = itemName;

  if (itemName) {
    const found = await findStockItem(supabase, owner, itemName);
    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => row.nome).filter(Boolean).join(", ");
      return `Encontrei mais de um item parecido no estoque. Tente pelo nome cadastrado. Opções: ${options}.`;
    }
    if (!found.row) return `Não encontrei ${itemName} no estoque deste rancho.`;
    itemId = String(found.row.id);
    itemLabel = String(found.row.nome || itemName);
  }

  let query = supabase
    .from(TABLES.estoqueMovimentacoes)
    .select("*")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (itemId) query = query.eq("item_id", itemId);
  if (parsed.dados.movimento_tipo) query = query.eq("tipo", String(parsed.dados.movimento_tipo));
  if (parsed.dados.data_referencia) {
    const range = periodRange(String(parsed.dados.data_referencia));
    query = query.gte("created_at", range.start).lt("created_at", range.end);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const items = await listStockItems(supabase, owner);
  const itemById = new Map(items.map((row) => [String(row.id), row]));
  const rows = ((data || []) as AnyRecord[])
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))
    .slice(0, 5);

  parsed.dados.consulta_executada = "estoque_historico";
  parsed.dados.resultado = { registros: rows.length, item_id: itemId, tipo: parsed.dados.movimento_tipo || null };

  if (!rows.length) {
    return itemId
      ?`Ainda não encontrei movimentações de estoque para ${itemLabel}.`
      :"Ainda não encontrei movimentações de estoque para esse período.";
  }

  const lines = rows.map((row, index) => {
    const item = itemById.get(String(row.item_id || ""));
    const date = row.created_at ?String(row.created_at).slice(0, 10) : "sem data";
    const unit = item?.unidade_medida || row.unidade_medida || row.unidade;
    const itemText = item?.nome || itemLabel || row.item_nome || "item";
    return `${index + 1}. ${date}: ${row.tipo || "movimentação"} de ${formatStockAmount(row.quantidade, unit)} - ${itemText}`;
  }).join("\n");

  return `Últimas movimentações de estoque:\n${lines}`;
}

async function handleStockListConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const mode = String(parsed.dados.consulta_estoque || "lista");
  if (mode === "historico") return handleStockHistoryConsultation(supabase, owner, parsed);

  const category = parsed.dados.categoria;
  const rows = stockListRowsForMode(await listStockItems(supabase, owner), mode, category);
  const page = buildStockListText(rows, mode, 0, STOCK_PAGE_SIZE, category);

  parsed.dados.consulta_executada = "estoque_geral";
  parsed.dados.resultado = {
    modo: mode,
    categoria: category || null,
    total: rows.length,
    exibidos: Math.min(rows.length, STOCK_PAGE_SIZE),
    tem_mais: page.hasMore
  };

  if (page.hasMore) {
    await saveStockPagination(supabase, owner, mode, page.nextOffset, STOCK_PAGE_SIZE, category);
  }

  return page.text;
}

async function handleStockPagination(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession) {
  const pagination = session.dados?.estoque_paginacao as AnyRecord | undefined;
  if (!pagination || pagination.tipo !== "estoque_lista") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não há mais itens para mostrar agora.";
  }

  const mode = String(pagination.consulta_estoque || "lista");
  const category = pagination.categoria || undefined;
  const offset = Math.max(0, Number(pagination.offset || 0));
  const pageSize = Math.max(1, Math.min(20, Number(pagination.pageSize || STOCK_PAGE_SIZE)));
  const rows = stockListRowsForMode(await listStockItems(supabase, owner), mode, category);

  if (!rows.length || offset >= rows.length) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não há mais itens para mostrar agora.";
  }

  const page = buildStockListText(rows, mode, offset, pageSize, category);
  if (page.hasMore) {
    await saveStockPagination(supabase, owner, mode, page.nextOffset, pageSize, category);
  } else {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  }

  return page.text;
}

function financeRowType(row: AnyRecord) {
  return String(row.tipo || "").toLowerCase() === "saida" ? "saida" : "entrada";
}

function financeRowDate(row: AnyRecord) {
  return String(row.data_transacao || row.created_at || "").slice(0, 10) || "sem data";
}

function financeFilterMatches(row: AnyRecord, filter?: string) {
  const requested = normalizeRanchoText(filter || "");
  if (!requested) return true;
  const haystack = normalizeRanchoText([
    row.descricao,
    row.categoria,
    row.metodo_pagamento,
    row.origem
  ].filter(Boolean).join(" "));
  return haystack.includes(requested);
}

function financeTotals(rows: AnyRecord[]) {
  const entrada = rows.filter((row) => financeRowType(row) === "entrada").reduce((sum, row) => sum + Number(row.valor || 0), 0);
  const saida = rows.filter((row) => financeRowType(row) === "saida").reduce((sum, row) => sum + Number(row.valor || 0), 0);
  return { entrada, saida, resultado: entrada - saida };
}

function financeTypeLabel(type?: string) {
  if (type === "entrada") return "Entradas";
  if (type === "saida") return "Saídas";
  return "Transações";
}

function financeSummaryHeader(type: string | undefined, period: string, filter?: string) {
  const suffix = filter ?` sobre ${filter}` : "";
  if (type === "entrada") return `Entradas de ${periodLabel(period)}${suffix}:`;
  if (type === "saida") return `Saídas de ${periodLabel(period)}${suffix}:`;
  return `Resumo financeiro de ${periodLabel(period)}${suffix}:`;
}

function formatFinanceLine(row: AnyRecord, index: number) {
  const direction = financeRowType(row) === "saida" ? "Saída" : "Entrada";
  const description = row.descricao || row.categoria || "sem descrição";
  return `${index}. ${financeRowDate(row)} - ${direction} - ${description}: ${formatMoney(row.valor)}`;
}

function buildFinanceSummaryText(rows: AnyRecord[], period: string, type?: string, filter?: string) {
  const totals = financeTotals(rows);
  const header = financeSummaryHeader(type, period, filter);
  if (!rows.length && type === "saida") return `Não encontrei despesas registradas ${periodLabel(period)}${filter ?` para ${filter}` : ""}.`;
  if (!rows.length && type === "entrada") return `Não encontrei entradas registradas ${periodLabel(period)}${filter ?` para ${filter}` : ""}.`;
  if (type === "entrada") return `${header}\nTotal: ${formatMoney(totals.entrada)}\nRegistros: ${rows.length}`;
  if (type === "saida") return `${header}\nTotal: ${formatMoney(totals.saida)}\nRegistros: ${rows.length}`;
  return `${header}\nEntradas: ${formatMoney(totals.entrada)}\nSaídas: ${formatMoney(totals.saida)}\nResultado: ${formatMoney(totals.resultado)}\nRegistros: ${rows.length}`;
}

function buildFinanceListText(rows: AnyRecord[], period: string, offset: number, pageSize: number, type?: string, filter?: string) {
  const total = rows.length;
  if (!total) {
    if (type === "saida") {
      return {
        text: `Não encontrei despesas registradas ${periodLabel(period)}${filter ?` para ${filter}` : ""}.`,
        nextOffset: offset,
        hasMore: false,
        total
      };
    }
    if (type === "entrada") {
      return {
        text: `Não encontrei entradas registradas ${periodLabel(period)}${filter ?` para ${filter}` : ""}.`,
        nextOffset: offset,
        hasMore: false,
        total
      };
    }
    return {
      text: `Não encontrei transações registradas em ${periodLabel(period)}${filter ?` para ${filter}` : ""}.`,
      nextOffset: offset,
      hasMore: false,
      total
    };
  }

  const pageRows = rows.slice(offset, offset + pageSize);
  const lines = pageRows.map((row, index) => formatFinanceLine(row, offset + index + 1)).join("\n");
  const nextOffset = offset + pageRows.length;
  const hasMore = nextOffset < total;
  const totals = financeTotals(rows);
  const header = offset === 0
    ? `${financeTypeLabel(type)} de ${periodLabel(period)}${filter ?` sobre ${filter}` : ""}:`
    : `Mostrando mais ${pageRows.length} ${pageRows.length === 1 ?"transação" : "transações"}:`;
  const footer = hasMore ?"\n\nQuer ver mais?" : offset > 0 ?"\n\nFim da lista." : "";
  const summary = type === "entrada"
    ?`\nTotal de entradas: ${formatMoney(totals.entrada)}`
    : type === "saida"
      ?`\nTotal de saídas: ${formatMoney(totals.saida)}`
      :`\nTotais: entradas ${formatMoney(totals.entrada)}, saídas ${formatMoney(totals.saida)}, resultado ${formatMoney(totals.resultado)}`;
  return { text: `${header}\n${lines}${summary}${footer}`, nextOffset, hasMore, total };
}

async function saveFinancePagination(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  period: string,
  type: string | undefined,
  filter: string | undefined,
  nextOffset: number,
  pageSize: number
) {
  await saveSession(supabase, owner, {
    etapa: "livre",
    dados: {
      financeiro_paginacao: {
        tipo: "financeiro_lista",
        periodo: period,
        financeiro_tipo: type || null,
        filtro_texto: filter || null,
        offset: nextOffset,
        pageSize
      }
    }
  });
}

async function queryFinanceRows(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string, type?: string, filter?: string) {
  const range = periodRange(period);
  let query = supabase
    .from(TABLES.transacoesFinanceiras)
    .select("id,tipo,valor,descricao,categoria,data_transacao,created_at,metodo_pagamento,origem")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("data_transacao", dateOnly(new Date(range.start)))
    .lt("data_transacao", dateOnly(new Date(range.end)))
    .order("data_transacao", { ascending: false })
    .limit(1000);

  if (type === "entrada" || type === "saida") query = query.eq("tipo", type);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[])
    .filter((row) => financeFilterMatches(row, filter))
    .sort((left, right) => String(right.data_transacao || right.created_at || "").localeCompare(String(left.data_transacao || left.created_at || "")));
}

async function handleFinancePagination(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession) {
  const pagination = session.dados?.financeiro_paginacao as AnyRecord | undefined;
  if (!pagination || pagination.tipo !== "financeiro_lista") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não há mais transações para mostrar agora.";
  }

  const period = String(pagination.periodo || "mes");
  const type = pagination.financeiro_tipo ?String(pagination.financeiro_tipo) : undefined;
  const filter = pagination.filtro_texto ?String(pagination.filtro_texto) : undefined;
  const offset = Math.max(0, Number(pagination.offset || 0));
  const pageSize = Math.max(1, Math.min(20, Number(pagination.pageSize || FINANCE_PAGE_SIZE)));
  const rows = await queryFinanceRows(supabase, owner, period, type, filter);

  if (!rows.length || offset >= rows.length) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não há mais transações para mostrar agora.";
  }

  const page = buildFinanceListText(rows, period, offset, pageSize, type, filter);
  if (page.hasMore) {
    await saveFinancePagination(supabase, owner, period, type, filter, page.nextOffset, pageSize);
  } else {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  }

  return page.text;
}

async function handleFinanceConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (!isBotAdmin(owner)) return "Você não tem permissão para consultar financeiro pelo WhatsApp.";

  const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "mes");
  const type = parsed.dados.financeiro_tipo ?String(parsed.dados.financeiro_tipo) : undefined;
  const mode = String(parsed.dados.financeiro_modo || "resumo");
  const filter = parsed.dados.filtro_texto ?String(parsed.dados.filtro_texto) : undefined;
  const rows = await queryFinanceRows(supabase, owner, period, type, filter);
  const totals = financeTotals(rows);

  parsed.dados.consulta_executada = "financeiro";
  parsed.dados.resultado = {
    periodo: period,
    modo: mode,
    tipo: type || null,
    filtro: filter || null,
    registros: rows.length,
    entradas: totals.entrada,
    saidas: totals.saida,
    resultado: totals.resultado
  };

  if (mode === "detalhado") {
    const page = buildFinanceListText(rows, period, 0, FINANCE_PAGE_SIZE, type, filter);
    if (page.hasMore) {
      await saveFinancePagination(supabase, owner, period, type, filter, page.nextOffset, FINANCE_PAGE_SIZE);
    } else {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    }
    return page.text;
  }

  await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  return buildFinanceSummaryText(rows, period, type, filter);
}

function eventTypeMatches(row: AnyRecord, requested?: string) {
  if (!requested) return true;
  const text = normalizeRanchoText([row.tipo, row.descricao, row.medicamento].filter(Boolean).join(" "));
  if (requested === "clinico") return /\b(?:doenca|doente|observacao|clinico|clinica|apetite|mastite|problema)\b/.test(text);
  if (requested === "reprodutivo") return Boolean(detectReproductiveEventKind(text)) || /\b(?:cio|prenhez|inseminacao|cobertura|reprodutivo|pre\s*parto|pre-parto|protocolo|reteste|parto)\b/.test(text);
  return text.includes(requested);
}

function eventTypeLabel(row: AnyRecord) {
  const tipo = normalizeRanchoText(row.tipo || "");
  const reproductiveKind = detectReproductiveEventKind([row.tipo, row.descricao, row.medicamento].filter(Boolean).join(" "));
  if (tipo === "vacina") return `Vacina${row.medicamento ?` ${row.medicamento}` : ""}`;
  if (tipo === "tratamento") return `Tratamento${row.medicamento ?` ${row.medicamento}` : ""}`;
  if (tipo === "parto") return "Parto registrado";
  if (reproductiveKind) return `${reproductiveEventLabel(reproductiveKind)} registrado`;
  if (tipo === "observacao") return "Observação clínica";
  if (tipo === "doenca") return "Ocorrência clínica";
  if (tipo === "cio") return "Cio registrado";
  if (tipo === "inseminacao") return "Inseminação registrada";
  return row.tipo || "Evento";
}

function animalMap(rows: AnyRecord[]) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

function animalShortLabel(row?: AnyRecord | null) {
  if (!row) return "Animal";
  return row.brinco && row.nome && row.nome !== row.brinco ?`${row.nome} (${row.brinco})` : row.brinco || row.nome || "Animal";
}

async function queryEventRows(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string, requestedType?: string) {
  const range = periodRange(period);
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,descricao,medicamento,data_evento,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("data_evento", range.start)
    .lt("data_evento", range.end)
    .order("data_evento", { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => eventTypeMatches(row, requestedType));
}

function eventSummaryCounts(rows: AnyRecord[]) {
  return {
    vacina: rows.filter((row) => eventTypeMatches(row, "vacina")).length,
    tratamento: rows.filter((row) => eventTypeMatches(row, "tratamento")).length,
    clinico: rows.filter((row) => eventTypeMatches(row, "clinico")).length,
    parto: rows.filter((row) => eventTypeMatches(row, "parto")).length,
    reprodutivo: rows.filter((row) => eventTypeMatches(row, "reprodutivo")).length
  };
}

function buildEventListText(rows: AnyRecord[], animalsById: Map<string, AnyRecord>, period: string, requestedType?: string) {
  const label = requestedType ?`${requestedType} ` : "";
  if (!rows.length) return `Não encontrei eventos ${label}registrados no rebanho ${periodLabel(period)}.`;
  const lines = rows.slice(0, 8).map((row, index) => {
    const animal = animalShortLabel(animalsById.get(String(row.animal_id || "")));
    const description = row.descricao ?`: ${row.descricao}` : "";
    return `${index + 1}. ${animal} - ${eventTypeLabel(row)}${description}`;
  }).join("\n");
  const extra = rows.length > 8 ?`\n...e mais ${rows.length - 8} evento(s).` : "";
  return `Eventos ${periodLabel(period)} no rebanho:\n${lines}${extra}`;
}

async function productionReportData(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string, animalsById: Map<string, AnyRecord>) {
  const range = periodRange(period);
  const { data, error } = await supabase
    .from(TABLES.ordenhas)
    .select("animal_id,litros,ordenhado_em")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("ordenhado_em", range.start)
    .lt("ordenhado_em", range.end)
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AnyRecord[];
  const total = rows.reduce((sum, row) => sum + Number(row.litros || 0), 0);
  const byAnimal = new Map<string, number>();
  const days = new Set<string>();
  for (const row of rows) {
    byAnimal.set(String(row.animal_id || ""), (byAnimal.get(String(row.animal_id || "")) || 0) + Number(row.litros || 0));
    if (row.ordenhado_em) days.add(String(row.ordenhado_em).slice(0, 10));
  }
  const ranking = Array.from(byAnimal.entries())
    .map(([animalId, litros]) => ({
      animal_id: animalId || null,
      animal: animalShortLabel(animalsById.get(animalId)),
      litros
    }))
    .sort((left, right) => right.litros - left.litros);
  const top = ranking[0];
  const bottom = [...ranking].sort((left, right) => left.litros - right.litros)[0];
  return {
    rows,
    total,
    count: rows.length,
    days: days.size,
    ranking,
    topAnimal: top ? top.animal : null,
    topLiters: top ? top.litros : 0,
    bottomAnimal: bottom ? bottom.animal : null,
    bottomLiters: bottom ? bottom.litros : 0,
    averageByDay: days.size ? total / days.size : 0
  };
}

async function handleProductionRankingConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
  const queryType = String(parsed.dados.consulta_producao || "maior_produtor");
  const animalsById = animalMap(await listAnimals(supabase, owner));
  const production = await productionReportData(supabase, owner, period, animalsById);
  const selected = queryType === "menor_produtor"
    ? [...production.ranking].sort((left, right) => left.litros - right.litros)[0]
    : production.ranking[0];

  parsed.dados.consulta_executada = "producao_ranking";
  parsed.dados.resultado = {
    periodo: period,
    consulta_producao: queryType,
    animal: selected?.animal || null,
    total_litros: selected?.litros || 0,
    registros: production.count
  };

  if (!selected) return `Ainda não há produção de leite registrada ${periodLabel(period)}.`;

  const label = queryType === "menor_produtor" ? "Menor produção" : "Maior produção";
  return `${label} ${periodLabel(period)}: ${selected.animal} com ${formatNumber(selected.litros)} litros.`;
}

async function stockReportData(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const rows = await listStockItems(supabase, owner);
  const low = rows.filter((row) => Number(row.quantidade_minima || 0) > 0 && Number(row.quantidade_atual || 0) < Number(row.quantidade_minima || 0));
  const zero = rows.filter((row) => Number(row.quantidade_atual || 0) <= 0);
  return { rows, low, zero };
}

async function stockMovementReportData(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string) {
  const range = periodRange(period);
  const { data, error } = await supabase
    .from(TABLES.estoqueMovimentacoes)
    .select("id,tipo,quantidade,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("created_at", range.start)
    .lt("created_at", range.end)
    .limit(2000);
  if (error) throw new Error(error.message);

  const rows = (data || []) as AnyRecord[];
  return {
    rows,
    entradas: rows.filter((row) => normalizeRanchoText(row.tipo || "") === "entrada").length,
    saidas: rows.filter((row) => ["saida", "baixa"].includes(normalizeRanchoText(row.tipo || ""))).length
  };
}

async function pointReportData(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string) {
  const range = periodRange(period);
  const { data, error } = await supabase
    .from(TABLES.registrosPonto)
    .select("funcionario_id,tipo,registrado_em")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("registrado_em", range.start)
    .lt("registrado_em", range.end)
    .limit(2000);
  if (error) throw new Error(error.message);
  const rows = (data || []) as AnyRecord[];
  return {
    rows,
    entradas: rows.filter((row) => row.tipo === "entrada").length,
    funcionarios: new Set(rows.map((row) => String(row.funcionario_id || "")).filter(Boolean)).size
  };
}

async function whatsappRegistrationReportData(supabase: SupabaseAdmin, owner: WhatsAppOwner, period: string) {
  const range = periodRange(period);
  const { data, error } = await supabase
    .from(TABLES.whatsappMensagens)
    .select("payload,telefone_e164,direcao,created_at,processada_em")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("direcao", "entrada")
    .gte("processada_em", range.start)
    .lt("processada_em", range.end)
    .limit(2000);
  if (error) throw new Error(error.message);

  const rows = ((data || []) as AnyRecord[])
    .filter((row) => isBotAdmin(owner) || whatsappNumbersMatch(String(row.telefone_e164 || ""), owner.telefone_e164));

  return {
    rows,
    registros: rows.filter((row) => Boolean(registrationLineFromWhatsappMessage(row, 0))).length
  };
}

function reportAnalysis(production: Awaited<ReturnType<typeof productionReportData>>, finance: ReturnType<typeof financeTotals> | null, stock: Awaited<ReturnType<typeof stockReportData>>, events: AnyRecord[]) {
  const alerts: string[] = [];
  if (!production.count) alerts.push("sem produção registrada");
  if (finance && finance.resultado < 0) alerts.push("saídas maiores que entradas");
  if (stock.low.length) alerts.push(`${stock.low.length} item(ns) abaixo do mínimo`);
  if (stock.zero.length) alerts.push(`${stock.zero.length} item(ns) zerado(s)`);
  if (events.some((row) => eventTypeMatches(row, "clinico"))) alerts.push("ocorrência clínica no rebanho");
  const positive = Boolean(production.count) && (!finance || finance.resultado >= 0) && !stock.low.length && !stock.zero.length;
  if (positive) return "Análise: está indo bem com os dados disponíveis.";
  if (alerts.length) return `Análise: exige atenção em ${alerts.slice(0, 3).join(", ")}.`;
  return "Análise: dados ainda insuficientes para dizer se está bom ou ruim.";
}

async function handleEventsReportConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
  if (parsed.dados.precisa_periodo) return "Você quer relatório de hoje, da semana ou do mês?";

  const mode = String(parsed.dados.relatorio_modo || "resumo");
  const kind = String(parsed.dados.consulta_registros || "whatsapp");
  const requestedType = parsed.dados.evento_tipo ?String(parsed.dados.evento_tipo) : undefined;
  const requestedOrder = parsed.dados.evento_ordenacao ?String(parsed.dados.evento_ordenacao) : undefined;
  const reportKind = (kind === "alertas" ? "alertas" : kind === "eventos" ? "eventos" : parsed.dados.relatorio_tipo || "geral") as OperationalReportKind;
  const report = await buildRanchReport({
    supabase,
    owner,
    period,
    kind: reportKind,
    mode: mode as OperationalReportMode,
    eventType: requestedType,
    eventOrder: requestedOrder,
    eventPageSize: EVENT_PAGE_SIZE
  });

  parsed.dados.consulta_executada = report.executedAs;
  parsed.dados.resultado = report.data;
  if (report.pagination) {
    await saveSession(supabase, owner, {
      etapa: "livre",
      dados: {
        eventos_paginacao: report.pagination
      }
    });
  } else if (reportKind === "eventos") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  }
  return report.text;
}

async function handleEventsPagination(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession) {
  const pagination = session.dados?.eventos_paginacao as AnyRecord | undefined;
  if (!pagination || pagination.tipo !== "eventos_lista") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não há mais eventos para mostrar agora.";
  }

  const period = String(pagination.periodo || "recentes");
  const eventType = pagination.evento_tipo ?String(pagination.evento_tipo) : undefined;
  const eventOrder = pagination.evento_ordenacao ?String(pagination.evento_ordenacao) : undefined;
  const offset = Math.max(0, Number(pagination.offset || 0));
  const pageSize = Math.max(1, Math.min(20, Number(pagination.pageSize || EVENT_PAGE_SIZE)));
  const report = await buildRanchReport({
    supabase,
    owner,
    period,
    kind: "eventos",
    mode: "resumo",
    eventType,
    eventOrder,
    eventOffset: offset,
    eventPageSize: pageSize
  });

  if (report.pagination) {
    await saveSession(supabase, owner, {
      etapa: "livre",
      dados: {
        eventos_paginacao: report.pagination
      }
    });
  } else {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  }

  return report.text;
}

function nonEmptyId(value?: string | null) {
  const text = String(value || "").trim();
  return text || null;
}

function formatRegistrationLineFromPayload(payload: AnyRecord, entidade: string, acao: string | undefined, index: number) {
  if (entidade === TABLES.ordenhas || payload.tipo === "PRODUCAO_LEITE") {
    return `${index + 1}. Produção: ${payload.animal_codigo || payload.animal_id || "animal"}, ${formatNumber(payload.litros)} litros`;
  }
  if (entidade === TABLES.estoqueMovimentacoes || payload.tipo === "ESTOQUE_BAIXA" || payload.tipo === "ESTOQUE_ENTRADA") {
    const movement = payload.movimento_tipo || payload.tipo_movimentacao || payload.tipo || acao || "movimento";
    return `${index + 1}. Estoque: ${movement} de ${formatStockAmount(payload.quantidade, payload.unidade_medida || payload.unidade)} ${payload.item_nome || payload.item || ""}`.trim();
  }
  if (entidade === TABLES.transacoesFinanceiras || payload.tipo === "RECEITA_VENDA" || payload.tipo === "DESPESA") {
    return `${index + 1}. Financeiro: ${payload.financeiro_tipo || payload.tipo || "lançamento"} de ${formatMoney(payload.valor)}${payload.descricao ?` com ${payload.descricao}` : ""}`;
  }
  if (entidade === TABLES.eventosAnimal || ["VACINA_MEDICAMENTO", "PARTO", "MORTE"].includes(String(payload.tipo || ""))) {
    return `${index + 1}. Evento: ${payload.animal_codigo || payload.animal_id || "animal"}${payload.produto ?` - ${payload.produto}` : ""}${payload.descricao ?` - ${payload.descricao}` : ""}`;
  }
  return `${index + 1}. ${entidade || "Registro"}: ${acao || "salvo"}`;
}

function auditLogBelongsToOwner(log: AnyRecord, owner: WhatsAppOwner) {
  const payload = (log.depois || {}) as AnyRecord;
  const usuarioId = nonEmptyId(owner.usuario_id);
  const whatsappUsuarioId = nonEmptyId(owner.whatsapp_usuario_id);
  const funcionarioId = nonEmptyId(owner.funcionario_id);
  const phone = owner.telefone_e164;

  if (usuarioId && String(log.usuario_id || "") === usuarioId) return true;
  if (usuarioId && String(payload.usuario_id || payload.created_by || payload.responsavel_usuario_id || "") === usuarioId) return true;
  if (whatsappUsuarioId && String(payload.whatsapp_usuario_id || "") === whatsappUsuarioId) return true;
  if (funcionarioId && String(payload.funcionario_id || "") === funcionarioId) return true;
  if (phone && whatsappNumbersMatch(String(payload.telefone_e164 || payload.telefone || payload.from || ""), phone)) return true;
  return false;
}

function registrationLineFromWhatsappMessage(row: AnyRecord, index: number) {
  const body = String(((row.payload || {}) as AnyRecord).body || row.body || "").trim();
  if (!body) return null;
  const parsed = parseRanchoMessage(body);
  if (CONSULT_INTENTS.has(parsed.tipo) || parsed.tipo === "DESCONHECIDO" || parsed.tipo === "AJUDA") return null;
  return formatRegistrationLineFromPayload({ ...parsed.dados, tipo: parsed.tipo }, parsed.tipo, "mensagem", index);
}

async function queryTodayWhatsappMessageRegistrations(supabase: SupabaseAdmin, owner: WhatsAppOwner, range: { start: string; end: string }) {
  const { data, error } = await supabase
    .from(TABLES.whatsappMensagens)
    .select("payload,telefone_e164,direcao,created_at,processada_em")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("direcao", "entrada")
    .gte("processada_em", range.start)
    .lt("processada_em", range.end)
    .order("processada_em", { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[])
    .filter((row) => whatsappNumbersMatch(String(row.telefone_e164 || ""), owner.telefone_e164))
    .map((row, index) => registrationLineFromWhatsappMessage(row, index))
    .filter(Boolean) as string[];
}

async function handleTodayRecordsConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const range = dayRange("hoje");
  const usuarioId = nonEmptyId(owner.usuario_id);
  const whatsappUsuarioId = nonEmptyId(owner.whatsapp_usuario_id);
  const funcionarioId = nonEmptyId(owner.funcionario_id);
  const filters = [
    "fazenda_id",
    "created_at >= hoje.inicio",
    "created_at < hoje.fim"
  ];

  let query = supabase
    .from(TABLES.auditoriaLogs)
    .select("entidade,acao,depois,created_at,usuario_id,origem")
    .eq("fazenda_id", owner.fazenda_id)
    .gte("created_at", range.start)
    .lt("created_at", range.end);

  if (usuarioId) {
    query = query.eq("usuario_id", usuarioId);
    filters.push("usuario_id");
  } else {
    filters.push("sem_usuario_id_vazio");
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);

  const rawLogs = (data || []) as AnyRecord[];
  const logs = usuarioId ? rawLogs : rawLogs.filter((log) => auditLogBelongsToOwner(log, owner));
  const auditLines = logs.slice(0, 5).map((log, index) => formatRegistrationLineFromPayload((log.depois || {}) as AnyRecord, String(log.entidade || ""), String(log.acao || ""), index));
  const messageLines = auditLines.length ? [] : await queryTodayWhatsappMessageRegistrations(supabase, owner, range);
  const lines = auditLines.length ? auditLines : messageLines.slice(0, 5);

  parsed.dados.consulta_executada = "registros_hoje";
  parsed.dados.resultado = {
    fazenda_id: owner.fazenda_id,
    telefone: owner.telefone_e164,
    funcionario_id: funcionarioId,
    whatsapp_usuario_id: whatsappUsuarioId,
    usuario_id: usuarioId,
    filtros_aplicados: filters,
    registros: lines.length,
    origem: auditLines.length ? "auditoria_logs" : "whatsapp_mensagens"
  };

  botLog("today_records_query", owner, {
    fazenda_id_usado: owner.fazenda_id,
    telefone_usado: owner.telefone_e164,
    funcionario_id_usado: funcionarioId,
    whatsapp_usuario_id_usado: whatsappUsuarioId,
    usuario_id_usado: usuarioId,
    filtros_aplicados: filters,
    quantidade_registros_encontrados: lines.length,
    origem: auditLines.length ? "auditoria_logs" : "whatsapp_mensagens"
  });

  if (!lines.length) return "Você ainda não registrou nada hoje pelo WhatsApp.";
  return `Hoje você registrou:\n${lines.join("\n")}`;
}

async function saveMilkStockMovementIfNeeded(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  parsed: ParsedRanchoMessage,
  totalLitros: number,
  animalCodes: string[],
  sourceId?: string | null
) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  if (!stock?.estoque_movimentar || stock.status_resolucao !== "matched" || !stock.item_id) return null;

  const animalsText = animalCodes.length ?` Animais envolvidos: ${animalCodes.join(", ")}.` : "";
  const movement = await insertRealRecord(supabase, owner, TABLES.estoqueMovimentacoes, {
    fazenda_id: owner.fazenda_id,
    item_id: stock.item_id,
    tipo: "entrada",
    quantidade: Number(totalLitros),
    valor_unitario: null,
    motivo: `Entrada automática por produção de leite via WhatsApp (${owner.telefone_e164}).${animalsText}`,
    responsavel_usuario_id: owner.usuario_id || null,
    origem: "whatsapp",
    source_type: sourceId ?"ordenha" : "ordenha_lote_whatsapp",
    source_id: sourceId || crypto.randomUUID()
  });

  botLog("milk_stock_movement", owner, {
    currentIntent: parsed.tipo,
    status: "salvo",
    stockResolution: {
      total_litros: totalLitros,
      item_id: stock.item_id,
      item_leite_resolvido: stock.item_leite_resolvido,
      origem: stock.origem,
      estoque_movimentar: true
    },
    decision: "producao_leite: estoque_movimentado"
  });

  return movement;
}

async function handleConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (parsed.tipo === "AJUDA") return helpText();

  if (parsed.tipo === "CONSULTA_REBANHO") {
    return handleHerdConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_LOTES") {
    return handleLotConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_ANIMAL") {
    if (parsed.dados.animal_referencia_nao_encontrada && Array.isArray(parsed.dados.animal_opcoes) && parsed.dados.animal_opcoes.length) {
      const options = parsed.dados.animal_opcoes.slice(0, 5).join(", ");
      return `Encontrei mais de um animal parecido com ${parsed.dados.animal_referencia_nao_encontrada}. Qual é o brinco correto?\nOpções: ${options}.`;
    }

    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return "Não encontrei esse animal no rebanho. Confira o nome ou código e tente novamente.";
    if (found.ambiguousRows?.length) {
      return `Encontrei mais de um animal parecido. Qual deles você quer ver?\n${animalOptionsText(found.ambiguousRows)}`;
    }

    const animal = found.row;
    const lots = await listLots(supabase, owner);
    const lot = animal.lote_id ?lots.find((row) => String(row.id || "") === String(animal.lote_id)) : null;
    const report = await buildAnimalIndividualReport(supabase, owner, animal, animalReference, lot);
    parsed.dados.consulta_executada = "animal_individual";
    parsed.dados.resultado = report.result;
    return report.text;
  }

  if (parsed.tipo === "CONSULTA_GENEALOGIA") {
    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return `Não encontrei o animal "${animalReference || "informado"}" no cadastro.`;
    if (found.ambiguousRows?.length) {
      return `Encontrei mais de um animal parecido. Tente pelo brinco cadastrado:\n${animalOptionsText(found.ambiguousRows)}`;
    }

    const animal = found.row;
    const animals = await listAnimals(supabase, owner);
    const byId = new Map(animals.map((row) => [String(row.id), row]));
    const mother = animal.mae_id ?byId.get(String(animal.mae_id)) : null;
    const father = animal.pai_id ?byId.get(String(animal.pai_id)) : null;
    const maternalGrandmother = mother?.mae_id ?byId.get(String(mother.mae_id)) : null;
    const maternalGrandfather = mother?.pai_id ?byId.get(String(mother.pai_id)) : null;
    const paternalGrandmother = father?.mae_id ?byId.get(String(father.mae_id)) : null;
    const paternalGrandfather = father?.pai_id ?byId.get(String(father.pai_id)) : null;
    const directChildren = animals.filter((row) => String(row.mae_id || "") === String(animal.id) || String(row.pai_id || "") === String(animal.id));
    const descendantIds = collectDescendantIds(String(animal.id), animals);
    const descendants = Array.from(descendantIds).map((id) => byId.get(id)).filter(Boolean) as AnyRecord[];
    const query = String(parsed.dados.consulta_genealogia || "arvore");

    parsed.dados.consulta_executada = "genealogia";
    parsed.dados.resultado = {
      animal_id: animal.id,
      animal: animalLabel(animal),
      mae: mother ?animalLabel(mother) : null,
      pai: father ?animalLabel(father) : null,
      filhos: directChildren.map(animalLabel),
      descendentes: descendants.map(animalLabel)
    };

    if (query === "mae") return `${animalLabel(animal)}\nMãe: ${mother ?animalLabel(mother) : "Não informado"}.`;
    if (query === "pai") return `${animalLabel(animal)}\nPai: ${father ?animalLabel(father) : "Não informado"}.`;
    if (query === "descendentes") {
      const childrenText = directChildren.length ?directChildren.map(animalLabel).join(", ") : "Nenhum filho informado";
      const descendantsText = descendants.length > directChildren.length ?`\nDescendentes: ${descendants.map(animalLabel).join(", ")}.` : "";
      return `Filhos de ${animalLabel(animal)}: ${childrenText}.${descendantsText}`;
    }
    if (query === "avos") {
      return [
        `Avós de ${animalLabel(animal)}:`,
        `Maternos: ${maternalGrandmother ?animalLabel(maternalGrandmother) : "Não informado"} / ${maternalGrandfather ?animalLabel(maternalGrandfather) : "Não informado"}.`,
        `Paternos: ${paternalGrandmother ?animalLabel(paternalGrandmother) : "Não informado"} / ${paternalGrandfather ?animalLabel(paternalGrandfather) : "Não informado"}.`
      ].join("\n");
    }

    return [
      `Genealogia de ${animalLabel(animal)}`,
      `Mãe: ${mother ?animalLabel(mother) : "Não informado"}.`,
      `Pai: ${father ?animalLabel(father) : "Não informado"}.`,
      `Avós maternos: ${maternalGrandmother ?animalLabel(maternalGrandmother) : "Não informado"} / ${maternalGrandfather ?animalLabel(maternalGrandfather) : "Não informado"}.`,
      `Avós paternos: ${paternalGrandmother ?animalLabel(paternalGrandmother) : "Não informado"} / ${paternalGrandfather ?animalLabel(paternalGrandfather) : "Não informado"}.`,
      `Filhos: ${directChildren.length ?directChildren.map(animalLabel).join(", ") : "Nenhum filho informado"}.`
    ].join("\n");
  }

  if (parsed.tipo === "CONSULTA_PRODUCAO" || parsed.tipo === "CONSULTA_PRODUCAO_HOJE") {
    if (parsed.dados.consulta_producao === "maior_produtor" || parsed.dados.consulta_producao === "menor_produtor") {
      return handleProductionRankingConsultation(supabase, owner, parsed);
    }

    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const range = periodRange(period);
    const { data, error } = await supabase
      .from(TABLES.ordenhas)
      .select("animal_id,litros,ordenhado_em,created_at")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("ordenhado_em", range.start)
      .lt("ordenhado_em", range.end)
      .order("ordenhado_em", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data || []) as AnyRecord[];
    const total = rows.reduce((sum, row) => sum + Number(row.litros || 0), 0);
    const count = rows.length;
    const animalsById = animalMap(await listAnimals(supabase, owner));
    const formatProductionTime = (row: AnyRecord) => {
      const value = String(row.ordenhado_em || row.created_at || "");
      const match = value.match(/[T\s](\d{2}):(\d{2})/);
      return match ?`${match[1]}:${match[2]}` : "";
    };
    const registros = rows.map((row) => ({
      animal_id: row.animal_id || null,
      animal: animalShortLabel(animalsById.get(String(row.animal_id || ""))),
      litros: Number(row.litros || 0),
      horario: formatProductionTime(row) || null
    }));
    parsed.dados.consulta_executada = "producao";
    parsed.dados.resultado = { total_litros: total, registros: count, periodo: period, detalhes: registros };
    if (!count) return period === "hoje"
      ?"Não encontrei produções de leite registradas hoje."
      :`Não encontrei produções de leite registradas ${periodLabel(period)}.`;
    const detalhes = registros.slice(0, 20).map((row, index) => {
      const horario = row.horario ?` - ${row.horario}` : "";
      return `${index + 1}. ${row.animal} - ${formatNumber(row.litros)} L${horario}`;
    }).join("\n");
    const extra = registros.length > 20 ?`\n...e mais ${registros.length - 20} registro(s).` : "";
    return `Relatório de produção ${periodLabel(period)}:\nTotal: ${formatNumber(total)} litros\nRegistros: ${count}\n\n${detalhes}${extra}`;
  }

  if (parsed.tipo === "CONSULTA_PRODUCAO_ANIMAL") {
    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return `Não encontrei o animal "${animalReference || "informado"}" no cadastro.`;
    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => row.brinco || row.nome).filter(Boolean).join(", ");
      return `Encontrei mais de um animal parecido. Tente pelo brinco cadastrado. Opções: ${options}.`;
    }

    const range = periodRange(period);
    const { data, error } = await supabase
      .from(TABLES.ordenhas)
      .select("litros")
      .eq("fazenda_id", owner.fazenda_id)
      .eq("animal_id", found.row.id)
      .gte("ordenhado_em", range.start)
      .lt("ordenhado_em", range.end);
    if (error) throw new Error(error.message);
    const total = (data || []).reduce((sum, row) => sum + Number(row.litros || 0), 0);
    const count = (data || []).length;
    const label = found.row.brinco || found.row.nome || animalReference;
    parsed.dados.consulta_executada = "producao_animal";
    parsed.dados.resultado = { animal_id: found.row.id, animal: label, total_litros: total, registros: count, periodo: period };
    if (!count) return `Não encontrei produção registrada ${periodLabel(period)} para ${label}.`;
    return `${period === "hoje" ?"Hoje" : periodLabel(period)} a ${label} produziu ${formatNumber(total)} litros${count > 1 ?` no total em ${count} registros` : ""}.`;
  }

  if (parsed.tipo === "CONSULTA_FINANCEIRO") {
    return handleFinanceConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_ESTOQUE" || parsed.tipo === "CONSULTA_ESTOQUE_ITEM") {
    if (parsed.dados.item_nome) {
      const itemLabel = String(parsed.dados.item_nome || "").trim();
      const found = await findStockItem(supabase, owner, itemLabel);
      if (found.ambiguousRows?.length) {
        const options = found.ambiguousRows.slice(0, 5).map((row) => row.nome).filter(Boolean).join(", ");
        return `Encontrei mais de um item parecido no estoque. Tente pelo nome cadastrado. Opções: ${options}.`;
      }
      if (!found.row) return `Não encontrei esse item${itemLabel ?` (${itemLabel})` : ""} no estoque deste rancho.`;

      const current = Number(found.row.quantidade_atual || 0);
      const minimum = Number(found.row.quantidade_minima || 0);
      const hasMinimum = Number.isFinite(minimum) && minimum > 0;
      const status = hasMinimum && current < minimum ?"abaixo do mínimo" : "ok";
      parsed.dados.consulta_executada = "estoque_item";
      parsed.dados.resultado = {
        item_id: found.row.id,
        item: found.row.nome,
        quantidade_atual: current,
        quantidade_minima: hasMinimum ?minimum : null,
        unidade: found.row.unidade_medida,
        status
      };
      return `Estoque de ${found.row.nome}: ${formatStockAmount(found.row.quantidade_atual, found.row.unidade_medida)} disponíveis no estoque.${hasMinimum ?` Mínimo: ${formatStockAmount(found.row.quantidade_minima, found.row.unidade_medida)}. Status: ${status}.` : ""}`;
    }
  }

  if (parsed.tipo === "CONSULTA_ESTOQUE" || parsed.tipo === "CONSULTA_ESTOQUE_GERAL") {
    return handleStockListConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_FUNCIONARIO") {
    if (parsed.dados.funcionario_nome) {
      if (!isBotAdmin(owner)) return "Você não tem permissão para consultar dados de funcionários pelo WhatsApp.";
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (found) {
        const field = String(parsed.dados.consulta_campo || "");
        if (field === "salario_base") return `${found.row.nome}: salário-base ${formatMoney(found.row.salario_base)}.`;
        if (field === "cpf") return `${found.row.nome}: CPF ${found.row.cpf || "não informado"}.`;
        if (field === "contato_whatsapp") return `${found.row.nome}: WhatsApp ${found.row.contato_whatsapp ?formatWhatsappForBot(found.row.contato_whatsapp) : "não informado"}.`;
        if (field === "funcao") return `${found.row.nome}: ${found.row.funcao || "função não informada"}.`;
        return [
          `${found.row.nome}: ${found.row.funcao || "função não informada"} - ${found.row.ativo === false ?"inativo" : "ativo"}.`,
          `Salário-base: ${formatMoney(found.row.salario_base)}.`,
          `WhatsApp: ${found.row.contato_whatsapp ?formatWhatsappForBot(found.row.contato_whatsapp) : "não informado"}.`,
          `Acesso: ${found.row.tipo_acesso || "bot_only"}.`
        ].join("\n");
      }
    }

    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .select("id,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(1000);
    if (error) throw new Error(error.message);
    const active = (data || []).filter((row) => row.ativo !== false && !row.deleted_at).length;
    return `Funcionários ativos: ${active}.`;
  }

  if (parsed.tipo === "CONSULTA_FOLHA") {
    const consultaFolha = String(parsed.dados.consulta_folha || "");
    const isGeneral = ["geral", "faltantes", "resumo"].includes(consultaFolha) || !parsed.dados.funcionario_nome;
    if (isGeneral && !isBotAdmin(owner)) return "Você não tem permissão para consultar folha geral pelo WhatsApp.";

    const competencia = monthStartFromPaymentPeriod(String(parsed.dados.periodo_pagamento || "mes_atual"));

    if (parsed.dados.funcionario_nome) {
      if (!isBotAdmin(owner)) return "Você não tem permissão para consultar folha de funcionários pelo WhatsApp.";
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (!found?.row) return `Não encontrei o funcionário "${parsed.dados.funcionario_nome}".`;

      const { data, error } = await supabase
        .from(TABLES.folhaPagamento)
        .select("id,total_liquido,salario_base,adiantamentos,status,pago_em,competencia")
        .eq("fazenda_id", owner.fazenda_id)
        .eq("funcionario_id", found.row.id)
        .gte("competencia", competencia)
        .lt("competencia", monthRange(monthKeyFromDate(competencia)).end.slice(0, 10))
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return `${found.row.nome} ainda não tem pagamento registrado este mês. Salário-base previsto: ${formatMoney(found.row.salario_base)}.`;
      const total = Number(data.total_liquido ?? data.salario_base ?? 0);
      return `${found.row.nome} já tem folha este mês: ${formatMoney(total)}. Status: ${data.status || "rascunho"}${data.pago_em ?` em ${String(data.pago_em).slice(0, 10)}` : ""}.`;
    }

    const { data: employees, error: employeesError } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,salario_base,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (employeesError) throw new Error(employeesError.message);
    const activeEmployees = ((employees || []) as AnyRecord[]).filter((row) => row.ativo !== false && !row.deleted_at);

    const { data: payrolls, error: payrollError } = await supabase
      .from(TABLES.folhaPagamento)
      .select("funcionario_id,total_liquido,salario_base,status,competencia")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("competencia", competencia)
      .lt("competencia", monthRange(monthKeyFromDate(competencia)).end.slice(0, 10))
      .limit(2000);
    if (payrollError) throw new Error(payrollError.message);

    const paid = new Set(((payrolls || []) as AnyRecord[]).filter((row) => row.status === "paga").map((row) => String(row.funcionario_id)));
    if (consultaFolha === "faltantes") {
      const missing = activeEmployees.filter((row) => !paid.has(String(row.id))).slice(0, 20);
      if (!missing.length) return "Todos os funcionários ativos têm pagamento registrado este mês.";
      return `Funcionários ainda sem pagamento no mês:\n${missing.map((row, index) => `${index + 1}. ${row.nome}`).join("\n")}`;
    }

    const paidTotal = ((payrolls || []) as AnyRecord[]).reduce((sum, row) => sum + Number(row.total_liquido ?? row.salario_base ?? 0), 0);
    const expectedTotal = activeEmployees.reduce((sum, row) => sum + Number(row.salario_base || 0), 0);
    return `Folha do mês: ${formatMoney(paidTotal)} pagos de ${formatMoney(expectedTotal)} previstos.`;
  }

  if (parsed.tipo === "CONSULTA_PONTO") {
    if (!isBotAdmin(owner)) return "Você não tem permissão para consultar ponto pelo WhatsApp.";
    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const range = periodRange(period);
    let employeeId: string | null = null;
    let employeeName = "";

    if (parsed.dados.funcionario_nome) {
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (!found?.row) return `Não encontrei o funcionário "${parsed.dados.funcionario_nome}".`;
      employeeId = String(found.row.id);
      employeeName = String(found.row.nome || parsed.dados.funcionario_nome);
    }

    let query = supabase
      .from(TABLES.registrosPonto)
      .select("funcionario_id,tipo,registrado_em")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("registrado_em", range.start)
      .lt("registrado_em", range.end);
    if (employeeId) query = query.eq("funcionario_id", employeeId);

    const { data, error } = await query.limit(2000);
    if (error) throw new Error(error.message);
    const rows = (data || []) as AnyRecord[];
    parsed.dados.consulta_executada = "ponto";
    parsed.dados.resultado = { registros: rows.length, funcionario_id: employeeId, periodo: period };
    if (!rows.length) {
      return employeeId
        ?`Não encontrei ponto registrado ${periodLabel(period)} para ${employeeName}.`
        :`Não encontrei ponto registrado ${periodLabel(period)}.`;
    }
    const entradas = rows.filter((row) => row.tipo === "entrada").length;
    const saidas = rows.filter((row) => row.tipo === "saida").length;
    return employeeId
      ?`Ponto de ${employeeName} ${periodLabel(period)}: ${rows.length} registro(s), ${entradas} entrada(s) e ${saidas} saída(s).`
      :`Ponto ${periodLabel(period)}: ${rows.length} registro(s), ${entradas} entrada(s) e ${saidas} saída(s).`;
  }

  if (parsed.tipo === "CONSULTA_REGISTROS_HOJE") {
    if (parsed.dados.consulta_registros && parsed.dados.consulta_registros !== "whatsapp") {
      return handleEventsReportConsultation(supabase, owner, parsed);
    }
    if (parsed.dados.precisa_periodo) return handleEventsReportConsultation(supabase, owner, parsed);
    return handleTodayRecordsConsultation(supabase, owner, parsed);
  }

  return unknownText();
}

function isStoredParsedMessage(value: unknown): value is ParsedRanchoMessage {
  const parsed = value as ParsedRanchoMessage | undefined;
  return Boolean(
    parsed
    && typeof parsed.tipo === "string"
    && typeof parsed.confianca === "number"
    && parsed.dados
    && typeof parsed.dados === "object"
    && Array.isArray(parsed.perguntas_faltantes)
  );
}

function postConfirmationConsultationsFromPending(pending: ParsedRanchoMessage) {
  const consultations = pending.dados?.gemini_consultas_apos_confirmacao;
  if (!Array.isArray(consultations)) return [];
  return consultations.filter((consultation) => (
    isStoredParsedMessage(consultation) && CONSULT_INTENTS.has(consultation.tipo)
  ));
}

async function handleGeminiConsultationBatch(supabase: SupabaseAdmin, owner: WhatsAppOwner, consultations: ParsedRanchoMessage[]) {
  const responses: string[] = [];
  for (const consultation of consultations) {
    const enriched = await enrichWithCatalog(supabase, owner, consultation);
    responses.push(await handleConsultation(supabase, owner, enriched));
  }
  return responses.filter(Boolean).join("\n\n");
}

async function handlePostConfirmationConsultations(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage) {
  const consultations = postConfirmationConsultationsFromPending(pending);
  if (!consultations.length) return "";

  try {
    return await handleGeminiConsultationBatch(supabase, owner, consultations);
  } catch (error) {
    console.error("[Gemini fallback]", {
      event: "post_confirmation_consultation_error",
      message: safeErrorText(error) || "Erro ao executar consulta depois da confirmação"
    });
    return "Registro salvo, mas não consegui gerar a consulta depois. Peça a consulta novamente.";
  }
}

async function handleFreeText(supabase: SupabaseAdmin, owner: WhatsAppOwner, text: string, parsedMessage?: ParsedRanchoMessage) {
  const tableExamples = tabularTableExamplesText(text);
  if (tableExamples) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return tableExamples;
  }

  const parsed = await enrichWithCatalog(supabase, owner, parsedMessage || parseRanchoMessage(text));
  botLog("nlp_general", owner, {
    currentIntent: parsed.tipo,
    status: "livre",
    missingFields: parsed.perguntas_faltantes,
    parser: "nlp_geral"
  });
  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    botTabularImportLog("validation_summary", owner, tabularImportSummary(parsed));
  }
  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    botTabularImportLog("animal_import_validation_summary", owner, animalImportSummary(parsed));
  }
  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    botTabularImportLog("stock_import_validation_summary", owner, stockImportSummary(parsed));
  }

  if (isDestructiveBulkParsed(parsed)) {
    logDestructiveBulkBlock(owner, {
      currentIntent: parsed.tipo,
      source: "handle_free_text",
      blocked: true
    });
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  }

  if (parsed.tipo === "IMPORTACAO_TABELA_AMBIGUA") {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed, acao_pendente: "tipo_tabela_ambigua" } });
    return confirmationText(parsed);
  }

  const criticalLocalFallback = parsed.dados?.origem_parser !== "gemini"
    && (parsed.flags || []).some((flag) => ["use_gemini_fallback", "compound_message", "multiple_intents_detected", "conflicting_intents", "correction_message"].includes(flag));
  if (CONSULT_INTENTS.has(parsed.tipo) && parsed.perguntas_faltantes.length && !parsed.dados?.animal_referencia_nao_encontrada) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed } });
    return missingText(parsed);
  }
  if (criticalLocalFallback && CONSULT_INTENTS.has(parsed.tipo)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não consegui entender essa mensagem com segurança. Pode mandar uma ação por vez ou reformular com mais detalhes?";
  }

  if (CONSULT_INTENTS.has(parsed.tipo)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return handleConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "DESCONHECIDO") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return unknownText();
  }

  const animalBlock = animalBlockFromParsed(parsed);
  if (animalBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return animalBlock;
  }
  const genealogyBlock = relationBlockMessage(parsed);
  if (genealogyBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return genealogyBlock;
  }

  const denied = permissionDeniedMessage(owner, parsed);
  if (denied) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return denied;
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA" && tabularImportSummary(parsed).ready <= 0) {
    const summary = tabularImportSummary(parsed);
    if (summary.notFound > 0) {
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: parsed } });
      return confirmationText(parsed);
    }
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return confirmationText(parsed);
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const summary = animalImportSummary(parsed);
    if (summary.ready <= 0 && summary.missingLots <= 0) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return confirmationText(parsed);
    }
  }

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const summary = stockImportSummary(parsed);
    if (summary.ready <= 0 && summary.missingItems <= 0) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return confirmationText(parsed);
    }
  }

  const lotPreflight = await lotCreationPreflight(supabase, owner, parsed);
  if (lotPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return lotPreflight;
  }
  const animalPreflight = await animalCreationPreflight(supabase, owner, parsed);
  if (animalPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return animalPreflight;
  }

  if (parsed.perguntas_faltantes.length) {
    botLog("missing_data", owner, {
      pending: parsed,
      status: "aguardando_dado",
      nextStep: "pedir_dado"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed } });
    return missingText(parsed);
  }

  if (milkStockNeedsDecision(parsed)) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed, acao_pendente: "producao_leite_estoque_opcional" } });
    return milkStockDecisionQuestion(parsed);
  }

  if (physicalSaleNeedsStockDecision(parsed)) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed, acao_pendente: "venda_baixa_estoque_opcional" } });
    return physicalSaleStockDecisionQuestion(parsed);
  }

  if (parsed.dados?.gemini_requires_confirmation) {
    botLog("pending_confirmation", owner, {
      currentIntent: parsed.tipo,
      status: "aguardando_confirmacao",
      missingFields: parsed.perguntas_faltantes,
      nextStep: "confirmar",
      parser: "gemini"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: parsed } });
    return confirmationText(parsed);
  }

  if ((parsed.flags || []).includes("needs_confirmation")) {
    botLog("pending_confirmation", owner, {
      currentIntent: parsed.tipo,
      status: "aguardando_confirmacao",
      missingFields: parsed.perguntas_faltantes,
      nextStep: "confirmar",
      parser: "nlp_geral"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: parsed } });
    return confirmationText(parsed);
  }

  if (parsed.confianca >= 0.85) {
    botLog("pending_confirmation", owner, {
      currentIntent: parsed.tipo,
      status: "aguardando_confirmacao",
      missingFields: parsed.perguntas_faltantes,
      nextStep: "confirmar"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: parsed } });
    return confirmationText(parsed);
  }

  if (parsed.confianca >= 0.55) {
    if (!parsed.perguntas_faltantes.length) {
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: parsed } });
      return confirmationText(parsed);
    }
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed } });
    return missingText(parsed);
  }

  await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  return unknownText();
}

type ConversationActHandlingResult = {
  handled: boolean;
  response?: string;
  parsed?: ParsedRanchoMessage;
  suppressPreviousPending?: boolean;
};

function uniqueParserFlags(values: Array<string | undefined | null>) {
  return Array.from(new Set(values.filter(Boolean))) as ParsedRanchoMessage["flags"];
}

function withConversationFlags(parsed: ParsedRanchoMessage, flags: string[]) {
  return {
    ...parsed,
    flags: uniqueParserFlags([...(parsed.flags || []), ...flags])
  };
}

function parseCorrectionNumber(value: string) {
  const normalized = String(value || "").replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ?number : undefined;
}

function numberMatchesFromText(command: string) {
  return Array.from(command.matchAll(/\b\d+(?:[.,]\d+)?\b/g))
    .map((match) => ({ value: parseCorrectionNumber(match[0]), index: match.index || 0 }))
    .filter((match): match is { value: number; index: number } => Number.isFinite(match.value));
}

function extractCorrectionNumber(command: string) {
  const numbers = numberMatchesFromText(command);
  if (!numbers.length) return null;
  const pair = command.match(/\bnao\s+(?:era|foi)\s+(\d+(?:[.,]\d+)?)\b.*\b(?:era|foi|foram?)\s+(\d+(?:[.,]\d+)?)\b/);
  if (pair) {
    return {
      oldValue: parseCorrectionNumber(pair[1]),
      newValue: parseCorrectionNumber(pair[2])
    };
  }
  return {
    oldValue: null,
    newValue: numbers[numbers.length - 1].value
  };
}

function extractCorrectionUnit(command: string) {
  const match = command.match(/\b(kg|quilo|quilos|saco|sacos|litro|litros|l|dose|doses|unidade|unidades|caixa|caixas|fardo|fardos)\b/);
  if (!match) return undefined;
  const unit = match[1];
  if (unit === "quilo" || unit === "quilos") return "kg";
  if (unit === "sacos") return "saco";
  if (unit === "litros" || unit === "l") return "litro";
  if (unit === "doses") return "dose";
  if (unit === "unidades") return "unidade";
  if (unit === "caixas") return "caixa";
  if (unit === "fardos") return "fardo";
  return unit;
}

function cleanAnimalCorrectionName(value: string | undefined) {
  const cleaned = String(value || "")
    .replace(/\b(?:a|o|as|os|na|no|da|do|era|foi|litro|litros|kg|saco|sacos|parto|cio|compra|uso|saida|baixa)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(?:de|para|por)$/.test(cleaned)) return null;
  return cleaned;
}

function extractAnimalSwap(command: string) {
  if (/\b(?:litro|litros|kg|quilo|quilos|saco|sacos|reais|real|valor|quantidade)\b/.test(command)) return null;
  const match = command.match(/\bnao\s+(?:era|foi)\s+(?:a|o|na|no)?\s*(.+?)\s+(?:era|foi)\s+(?:a|o|na|no)?\s*(.+)$/);
  const oldValue = cleanAnimalCorrectionName(match?.[1]);
  const newValue = cleanAnimalCorrectionName(match?.[2]);
  if (!newValue) return null;
  return { oldValue, newValue };
}

function resetAnimalResolution(dados: AnyRecord) {
  dados.animal_id = undefined;
  dados.animal_resolvido = undefined;
  dados.animal_status = undefined;
  dados.animal_opcoes = undefined;
  dados.animal_referencia_nao_encontrada = undefined;
}

function stockUsageCorrection(command: string, pending: ParsedRanchoMessage) {
  return pending.tipo === "ESTOQUE_ENTRADA"
    && Boolean(pending.dados?.compra)
    && /\bnao\s+foi\s+compra\b/.test(command)
    && /\b(?:uso|usei|saida|baixa|retirada)\b/.test(command);
}

function partoWasNegated(command: string, act: ConversationAct, pending?: ParsedRanchoMessage | null) {
  return (act.negatedIntent === "PARTO" || /\bparto\b/.test(command)) && (!pending || pending.tipo === "PARTO");
}

function hasCioReplacement(command: string) {
  return /\bcio\b/.test(command);
}

function animalDisplayName(parsed?: ParsedRanchoMessage | null) {
  const resolved = parsed?.dados?.animal_resolvido as AnyRecord | undefined;
  return String(resolved?.nome || resolved?.brinco || parsed?.dados?.animal_codigo || "animal anterior");
}

function correctionTextForMerge(text: string, command: string) {
  const cleaned = command
    .replace(/^(?:nao|n|errado|incorreto|corrigir|corrige|quero corrigir|refazer|refaz|na verdade|verdade|animal errado)\b\s*,?\s*/g, "")
    .trim();
  if (!cleaned || cleaned === command) return text;
  if (/^(?:foi|era|foram?|na verdade|troca|trocar|ajusta|ajustar)\b/.test(cleaned)) return cleaned;
  return `foi ${cleaned}`;
}

function buildCioCorrection(pending: ParsedRanchoMessage) {
  const dados = {
    animal_codigo: pending.dados?.animal_codigo,
    animal_id: pending.dados?.animal_id,
    campo_alterado: "observacoes",
    novo_valor: "cio",
    data_referencia: pending.dados?.data_referencia || "hoje"
  };
  return refreshRanchoMessage({ ...pending, tipo: "ATUALIZACAO_ANIMAL", dados }, dados);
}

function buildCorrectedPending(pending: ParsedRanchoMessage, text: string, act: ConversationAct) {
  const command = act.normalizedText;
  const operationCorrection = stockUsageCorrection(command, pending);
  const mergeText = pending.tipo === "CADASTRO_ANIMAL" && !pending.dados?.animal_codigo
    ?text
    : correctionTextForMerge(text, command);
  let next = operationCorrection ?pending : mergeRanchoMessageData(pending, mergeText);
  const dados = { ...(next.dados || {}) };
  let tipo = next.tipo;
  let prefix: string | null = null;

  if (operationCorrection) {
    tipo = "ESTOQUE_SAIDA";
    dados.compra = false;
    dados.valor = undefined;
    prefix = "Entendi. Voce quer alterar a movimentacao anterior de compra para uso/saida de estoque?";
  }

  const numberCorrection = extractCorrectionNumber(command);
  if (numberCorrection?.newValue !== undefined) {
    if (tipo === "PRODUCAO_LEITE") {
      const oldValue = numberCorrection.oldValue ?? pending.dados?.litros;
      dados.litros = numberCorrection.newValue;
      prefix = `Entendi. Quer corrigir a producao de ${formatNumber(oldValue, "L")} para ${formatNumber(numberCorrection.newValue, "L")}?`;
    } else if (tipo === "ESTOQUE_ENTRADA" || tipo === "ESTOQUE_SAIDA") {
      dados.quantidade = numberCorrection.newValue;
      const unit = extractCorrectionUnit(command);
      if (unit) dados.unidade = unit;
      prefix = `Entendi. Quer corrigir a quantidade para ${formatStockAmount(numberCorrection.newValue, dados.unidade)}?`;
    } else if (tipo === "DESPESA" || tipo === "RECEITA_VENDA") {
      const oldValue = numberCorrection.oldValue ?? pending.dados?.valor;
      dados.valor = numberCorrection.newValue;
      prefix = `Entendi. Quer corrigir o valor de ${formatMoney(oldValue)} para ${formatMoney(numberCorrection.newValue)}?`;
    }
  }

  const animalSwap = extractAnimalSwap(command);
  if (animalSwap && ANIMAL_LOOKUP_INTENTS.has(tipo)) {
    dados.animal_codigo = animalSwap.newValue;
    resetAnimalResolution(dados);
    const oldAnimal = animalSwap.oldValue || animalDisplayName(pending);
    prefix = `Entendi. Voce quer trocar o animal do ultimo lancamento de ${oldAnimal} para ${animalSwap.newValue}?`;
  }

  next = refreshRanchoMessage({ ...next, tipo, dados }, dados);
  return {
    parsed: withConversationFlags(next, [
      "correction_message",
      "pending_action_response",
      "references_previous_context",
      "requires_confirmation",
      "possible_duplicate_risk",
      "safe_to_apply_correction"
    ]),
    prefix
  };
}

async function saveCorrectedPending(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  parsed: ParsedRanchoMessage,
  prefix?: string | null
) {
  const next = await enrichWithCatalog(supabase, owner, parsed);
  const animalBlock = animalBlockFromParsed(next);
  if (animalBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return { response: animalBlock, parsed: next };
  }
  const genealogyBlock = relationBlockMessage(next);
  if (genealogyBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return { response: genealogyBlock, parsed: next };
  }
  const denied = permissionDeniedMessage(owner, next);
  if (denied) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return { response: denied, parsed: next };
  }
  const lotPreflight = await lotCreationPreflight(supabase, owner, next);
  if (lotPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return { response: lotPreflight, parsed: next };
  }
  const animalPreflight = await animalCreationPreflight(supabase, owner, next);
  if (animalPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return { response: animalPreflight, parsed: next };
  }

  if (next.perguntas_faltantes.length) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return { response: [prefix, missingText(next)].filter(Boolean).join("\n"), parsed: next };
  }

  if (milkStockNeedsDecision(next)) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next, acao_pendente: "producao_leite_estoque_opcional" } });
    return { response: [prefix, milkStockDecisionQuestion(next)].filter(Boolean).join("\n"), parsed: next };
  }

  if (physicalSaleNeedsStockDecision(next)) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next, acao_pendente: "venda_baixa_estoque_opcional" } });
    return { response: [prefix, physicalSaleStockDecisionQuestion(next)].filter(Boolean).join("\n"), parsed: next };
  }

  await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
  const intro = prefix ?`Agora entendi. ${prefix}` : "Agora entendi:";
  return { response: [intro, confirmationText(next)].filter(Boolean).join("\n"), parsed: next };
}

async function handleConversationActMessage(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  session: BotSession,
  text: string,
  act: ConversationAct
): Promise<ConversationActHandlingResult> {
  const pending = pendingFromSession(session);
  const command = act.normalizedText;

  if (act.messageType === "new_action" || act.messageType === "clarification") {
    return { handled: false };
  }

  if (pending && isClearPendingCommand(command)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return {
      handled: true,
      parsed: pending,
      suppressPreviousPending: true,
      response: PENDING_ACTION_CANCELLED_MESSAGE
    };
  }

  if (act.messageType === "confirmation" && !pending) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return {
      handled: true,
      response: "Nao consegui entender uma confirmacao pendente. Envie um novo registro."
    };
  }

  if (act.messageType === "confirmation") return { handled: false };

  if (act.messageType === "cancellation") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return {
      handled: true,
      parsed: pending,
      response: pending
        ? PENDING_ACTION_CANCELLED_MESSAGE
        : NO_PENDING_ACTION_MESSAGE,
      suppressPreviousPending: true
    };
  }

  if (!pending) {
    await saveSession(supabase, owner, { etapa: "livre", dados: session.dados || {} });
    if (partoWasNegated(command, act, null)) {
      return {
        handled: true,
        suppressPreviousPending: true,
        response: "Beleza, nao vou registrar como parto. Me diga o que aconteceu com o animal para eu lancar corretamente."
      };
    }
    return {
      handled: true,
      response: act.messageType === "correction"
        ? "O que voce quer corrigir? Me diga o animal/item e o valor correto."
        : NO_PENDING_ACTION_MESSAGE
    };
  }

  if (partoWasNegated(command, act, pending)) {
    if (hasCioReplacement(command) && pending.dados?.animal_codigo) {
      const correction = buildCioCorrection(pending);
      const result = await saveCorrectedPending(
        supabase,
        owner,
        withConversationFlags(correction, ["negation_message", "correction_message", "do_not_treat_as_new_action"]),
        "Entendi, nao e parto. Quer registrar como cio/observacao reprodutiva?"
      );
      return { handled: true, parsed: result.parsed, response: result.response, suppressPreviousPending: true };
    }

    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return {
      handled: true,
      parsed: undefined,
      suppressPreviousPending: true,
      response: "Entendi, nao e parto. Como voce quer registrar essa informacao? Pode ser cio, observacao de saude, manejo ou outro evento."
    };
  }

  if (act.messageType === "negation" && /^(?:nao|n|nao e isso|errado|incorreto|negativo)$/.test(command)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return {
      handled: true,
      parsed: pending,
      suppressPreviousPending: true,
      response: PENDING_ACTION_CANCELLED_MESSAGE
    };
  }

  if (act.messageType === "correction" || act.messageType === "negation") {
    const corrected = buildCorrectedPending(pending, text, act);
    const result = await saveCorrectedPending(supabase, owner, corrected.parsed, corrected.prefix);
    return { handled: true, parsed: result.parsed, response: result.response };
  }

  return { handled: false };
}

async function handleMissingData(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession, text: string) {
  const pending = session.dados?.pending as ParsedRanchoMessage | undefined;
  if (!pending?.tipo) return handleFreeText(supabase, owner, text);

  if (session.dados?.acao_pendente === "tipo_tabela_ambigua") {
    const command = normalizeRanchoText(text);
    if (isCancelCommand(command)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return "Cancelado. Nao registrei essa tabela. Nada foi salvo.";
    }

    const selectedDomain = domainFromUserChoice(command);
    const kind = selectedDomain
      || (isTableTypeAnimalsCommand(command) ? "REBANHO_ANIMAIS" : null)
      || (isTableTypeEventsCommand(command) ? "REPRODUCAO" : null);

    if (!kind) {
      await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending, acao_pendente: "tipo_tabela_ambigua" } });
      return ambiguousTableQuestion(pending);
    }

    const originalTable = String(pending.dados?.texto_tabela_original || "");
    const parsedTable = parseTabularAnimalEventsMessageAs(originalTable, kind);
    if (!parsedTable) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return "Nao consegui reler essa tabela com segurança. Envie a tabela novamente no formato correto.";
    }

    const next = await enrichWithCatalog(supabase, owner, parsedTable);
    const denied = permissionDeniedMessage(owner, next);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return denied;
    }

    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
    return confirmationText(next);
  }

  if (session.dados?.acao_pendente === "compra_item_nao_encontrado") {
    const command = normalizeRanchoText(text);
    if (command === "1" || /\b(?:criar|item|estoque)\b/.test(command)) {
      const createData = {
        item_nome: pending.dados.item_nome,
        unidade: pending.dados.unidade,
        quantidade: pending.dados.quantidade,
        compra: pending.dados.compra,
        valor: pending.dados.valor,
        data_referencia: pending.dados.data_referencia
      };
      const next = refreshRanchoMessage({ ...pending, tipo: "CRIAR_ITEM_ESTOQUE", dados: createData }, createData);
      await saveSession(supabase, owner, { etapa: next.perguntas_faltantes.length ?"aguardando_dado" : "aguardando_confirmacao", dados: { pending: next } });
      return next.perguntas_faltantes.length ?missingText(next) : confirmationText(next);
    }

    if (command === "2" || /\b(?:despesa|financeiro)\b/.test(command)) {
      const financeData = {
        valor: pending.dados.valor,
        descricao: pending.dados.item_nome,
        data_referencia: pending.dados.data_referencia
      };
      const next = refreshRanchoMessage({ ...pending, tipo: "DESPESA", dados: financeData }, financeData);
      await saveSession(supabase, owner, { etapa: next.perguntas_faltantes.length ?"aguardando_dado" : "aguardando_confirmacao", dados: { pending: next } });
      return next.perguntas_faltantes.length ?missingText(next) : confirmationText(next);
    }

    return "Responda 1 para criar o item de estoque ou 2 para registrar apenas como despesa.";
  }

  if (session.dados?.acao_pendente === "producao_leite_estoque_opcional") {
    const command = normalizeRanchoText(text);
    if (command === "1" || isConfirmCommand(command)) {
      const next = withMilkStockMovementDecision(pending, true);
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      return confirmationText(next);
    }
    if (command === "2" || isRejectCommand(command)) {
      const next = withMilkStockMovementDecision(pending, false);
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      return confirmationText(next);
    }
    return "Responda 1 para adicionar ao estoque ou 2 para registrar apenas a produção.";
  }

  if (session.dados?.acao_pendente === "venda_baixa_estoque_opcional") {
    const command = normalizeRanchoText(text);
    const wantsStockOut = command === "1" || /\b(?:sim|s|ss|quero|pode|baixa|dar baixa|tira do estoque)\b/.test(command);
    const onlyFinance = command === "2" || /\b(?:nao|n|nn|nao precisa|so financeiro|somente financeiro|apenas receita|nao baixa|sem estoque)\b/.test(command);

    if (wantsStockOut) {
      const next = withPhysicalSaleStockDecision(pending, true);
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      return confirmationText(next);
    }

    if (onlyFinance) {
      const next = withPhysicalSaleStockDecision(pending, false);
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      return confirmationText(next);
    }

    return "Responda 1 para dar baixa no estoque ou 2 para registrar apenas a receita.";
  }

  const next = await enrichWithCatalog(supabase, owner, mergeRanchoMessageData(pending, text));
  botLog("contextual_reply", owner, {
    pending: next,
    status: "aguardando_dado",
    parser: "contextual",
    nextStep: next.perguntas_faltantes.length ?"pedir_dado" : "confirmar"
  });
  const animalBlock = animalBlockFromParsed(next);
  if (animalBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return animalBlock;
  }
  const genealogyBlock = relationBlockMessage(next);
  if (genealogyBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return genealogyBlock;
  }
  const denied = permissionDeniedMessage(owner, next);
  if (denied) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return denied;
  }
  const lotPreflight = await lotCreationPreflight(supabase, owner, next);
  if (lotPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return lotPreflight;
  }
  const animalPreflight = await animalCreationPreflight(supabase, owner, next);
  if (animalPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return animalPreflight;
  }
  if (next.perguntas_faltantes.length) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return missingText(next);
  }

  if (milkStockNeedsDecision(next)) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next, acao_pendente: "producao_leite_estoque_opcional" } });
    return milkStockDecisionQuestion(next);
  }

  if (physicalSaleNeedsStockDecision(next)) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next, acao_pendente: "venda_baixa_estoque_opcional" } });
    return physicalSaleStockDecisionQuestion(next);
  }

  await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
  return confirmationText(next);
}

async function handleConfirmation(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  session: BotSession,
  text: string,
  command: string,
  options: { modoTesteSalvarReal?: boolean } = {}
) {
  const pending = session.dados?.pending as ParsedRanchoMessage | undefined;
  if (!pending?.tipo) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não encontrei uma confirmação pendente. Envie um novo registro.";
  }

  if (isDestructiveBulkParsed(pending)) {
    logDestructiveBulkBlock(owner, {
      currentIntent: pending.tipo,
      source: "handle_confirmation",
      blocked: true
    });
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  }

  const pendingEventSummary = pending.tipo === "IMPORTACAO_EVENTOS_TABELA" ?tabularImportSummary(pending) : null;
  const pendingAnimalSummary = pending.tipo === "IMPORTACAO_ANIMAIS_TABELA" ?animalImportSummary(pending) : null;
  const pendingStockSummary = pending.tipo === "IMPORTACAO_ESTOQUE_TABELA" ?stockImportSummary(pending) : null;
  const eventIssueNumber = pendingEventSummary?.notFound ?(pendingEventSummary.ready ? "3" : "2") : "";
  const eventCancelNumber = pendingEventSummary?.notFound ?(pendingEventSummary.ready ? "4" : "3") : "";
  const animalIssueNumber = pendingAnimalSummary ?(pendingAnimalSummary.missingLots ? "3" : "2") : "";
  const animalCancelNumber = pendingAnimalSummary ?(pendingAnimalSummary.missingLots ? "4" : "3") : "";
  const stockIssueNumber = pendingStockSummary
    ?pendingStockSummary.missingItems
      ?"3"
      : (pendingStockSummary.invalid || pendingStockSummary.duplicates) ? "2" : ""
    : "";
  const stockCancelNumber = pendingStockSummary
    ?pendingStockSummary.missingItems
      ?"4"
      : (pendingStockSummary.invalid || pendingStockSummary.duplicates) ? "3" : "2"
    : "";

  if ((eventCancelNumber && command === eventCancelNumber) || (animalCancelNumber && command === animalCancelNumber) || (stockCancelNumber && command === stockCancelNumber)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Importação cancelada. Nada foi salvo.";
  }

  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA" && pendingEventSummary?.notFound && isTabularMissingAnimalRegisterCommand(command)) {
    const animalPending = await enrichWithCatalog(supabase, owner, animalImportPendingFromMissingEventAnimals(pending));
    const denied = permissionDeniedMessage(owner, animalPending);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return denied;
    }
    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: animalPending } });
    return confirmationText(animalPending);
  }

  const wantsIssueDetails = (pending.tipo === "IMPORTACAO_EVENTOS_TABELA" && (isTabularImportIssueCommand(command) || command === eventIssueNumber))
    || (pending.tipo === "IMPORTACAO_ANIMAIS_TABELA" && (isTabularImportIssueCommand(command) || command === animalIssueNumber))
    || (pending.tipo === "IMPORTACAO_ESTOQUE_TABELA" && (isTabularImportIssueCommand(command) || command === stockIssueNumber));
  if (wantsIssueDetails) {
    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending } });
    const details = pending.tipo === "IMPORTACAO_ANIMAIS_TABELA"
      ?animalImportIssueDetails(pending, 15)
      : pending.tipo === "IMPORTACAO_ESTOQUE_TABELA"
        ?stockImportIssueDetails(pending, 15)
        : tabularImportIssueDetails(pending, 15);
    const label = pending.tipo === "IMPORTACAO_ANIMAIS_TABELA" ?"cadastrar" : "importar";
    return details
      ?`Linhas que nao vou ${label} agora:\n${details}\n\nResponda 1 para continuar com as linhas validas ou cancelar para sair.`
      : `Nao encontrei pendencias nessa tabela. Responda 1 para ${label} ou cancelar para sair.`;
  }

  const shouldCreateMissingLots = pending.tipo === "IMPORTACAO_ANIMAIS_TABELA"
    && Boolean(pendingAnimalSummary?.missingLots)
    && isTabularCreateLotsAndRegisterCommand(command);
  const shouldImportFoundOnly = pending.tipo === "IMPORTACAO_EVENTOS_TABELA"
    && Boolean(pendingEventSummary?.notFound && pendingEventSummary.ready)
    && isTabularImportFoundOnlyCommand(command);
  const shouldCreateMissingStockItems = pending.tipo === "IMPORTACAO_ESTOQUE_TABELA"
    && Boolean(pendingStockSummary?.missingItems)
    && isTabularCreateStockItemsCommand(command);
  const shouldImportValidStockOnly = pending.tipo === "IMPORTACAO_ESTOQUE_TABELA"
    && Boolean(pendingStockSummary?.ready)
    && (isTabularImportFoundOnlyCommand(command) || command === "2")
    && !(command === "2" && !pendingStockSummary?.missingItems && Boolean(pendingStockSummary?.invalid || pendingStockSummary?.duplicates));
  let pendingToSave = pending;

  if (shouldCreateMissingLots) {
    pendingToSave = await enrichWithCatalog(supabase, owner, refreshRanchoMessage(pending, {
      ...(pending.dados || {}),
      criar_lotes_faltantes: true
    }));
  }

  if (shouldCreateMissingStockItems) {
    pendingToSave = await enrichWithCatalog(supabase, owner, refreshRanchoMessage(pending, {
      ...(pending.dados || {}),
      criar_itens_faltantes: true
    }));
  }

  if (isConfirmCommand(command) || isHerdDeleteConfirmationCommand(pendingToSave, command) || shouldCreateMissingLots || shouldImportFoundOnly || shouldCreateMissingStockItems || shouldImportValidStockOnly) {
    const denied = permissionDeniedMessage(owner, pendingToSave);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return denied;
    }

    botLog("confirmation", owner, {
      pending: pendingToSave,
      status: "aguardando_confirmacao",
      nextStep: "salvar"
    });
    if (pendingToSave.tipo === "IMPORTACAO_EVENTOS_TABELA") {
      botTabularImportLog("confirm_command", owner, tabularImportSummary(pendingToSave));
    }
    if (pendingToSave.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
      botTabularImportLog("animal_import_confirm_command", owner, animalImportSummary(pendingToSave));
    }
    if (pendingToSave.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
      botTabularImportLog("stock_import_confirm_command", owner, stockImportSummary(pendingToSave));
    }
    const result = await saveConfirmedRecord(supabase, owner, pendingToSave);
    await saveSession(supabase, owner, result.nextSession || { etapa: "livre", dados: result.sessionData || {} });
    const postConfirmationText = result.savedReal ?await handlePostConfirmationConsultations(supabase, owner, pendingToSave) : "";
    const resultResponse = postConfirmationText ?`${result.response}\n\n${postConfirmationText}` : result.response;
    if (pendingToSave.tipo === "IMPORTACAO_EVENTOS_TABELA") {
      botTabularImportLog("save_result", owner, {
        saved_real: Boolean(result.savedReal),
        saved_tables: result.savedTables || [],
        response_chars: resultResponse.length
      });
    }
    if (pendingToSave.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
      botTabularImportLog("stock_import_save_result", owner, {
        saved_real: Boolean(result.savedReal),
        saved_tables: result.savedTables || [],
        response_chars: resultResponse.length
      });
    }

    if (options.modoTesteSalvarReal && result.savedReal) {
      console.log("[BOT TEST REAL SAVE]", {
        tipo_registro: pendingToSave.tipo,
        service: "saveConfirmedRecord",
        tabelas: result.savedTables || [],
        fazenda_id: owner.fazenda_id,
        whatsapp_usuario_id: owner.whatsapp_usuario_id,
        funcionario_id: owner.funcionario_id
      });
      return `Registro salvo no sistema com sucesso.\n${resultResponse}`;
    }

    return resultResponse;
  }

  if (isRejectCommand(command)) {
    const correction = normalizeRanchoText(text).replace(/^(?:nao|n|errado|incorreto|corrigir|corrige|quero corrigir|refazer|refaz|na verdade|foi|era|animal errado)\b\s*,?\s*/g, "").trim();
    const correctionLooksLikeCancel = /^(?:salvar|salva|registrar|registra|lancar|lanca)$/i.test(correction);
    if (correction && correction !== command && !correctionLooksLikeCancel) {
      const correctionText = /^(?:nao|n|errado|incorreto|corrigir|corrige|na verdade|foi|era|animal errado)\b/.test(correction)
        ?correction
        : `foi ${correction}`;
      const next = await enrichWithCatalog(supabase, owner, mergeRanchoMessageData(pending, correctionText));
      const genealogyBlock = relationBlockMessage(next);
      if (genealogyBlock) {
        await saveSession(supabase, owner, { etapa: "livre", dados: {} });
        return genealogyBlock;
      }
      if (next.perguntas_faltantes.length) {
        await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
        return missingText(next);
      }

      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      return `Agora entendi:\n${confirmationText(next)}`;
    }

    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Tudo bem. Nada foi salvo. Me envie a informação novamente quando quiser.";
  }

  const replacement = await enrichWithCatalog(supabase, owner, parseRanchoMessage(text));
  if (!["DESCONHECIDO", "AJUDA"].includes(replacement.tipo) && replacement.confianca >= 0.55) {
    if (CONSULT_INTENTS.has(replacement.tipo)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return handleConsultation(supabase, owner, replacement);
    }

    const denied = permissionDeniedMessage(owner, replacement);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return denied;
    }

    const genealogyBlock = relationBlockMessage(replacement);
    if (genealogyBlock) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return genealogyBlock;
    }

    const lotPreflight = await lotCreationPreflight(supabase, owner, replacement);
    if (lotPreflight) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return lotPreflight;
    }
    const animalPreflight = await animalCreationPreflight(supabase, owner, replacement);
    if (animalPreflight) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return animalPreflight;
    }

    if (replacement.perguntas_faltantes.length) {
      await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: replacement } });
      return `Troquei a operação pendente.\n${missingText(replacement)}`;
    }

    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: replacement } });
    return `Troquei a operação pendente.\n${confirmationText(replacement)}`;
  }

  return "Responda 1 para confirmar ou 2 para corrigir. Se quiser parar, envie cancelar.";
}

function ownerBlockedMessage(reason: Awaited<ReturnType<typeof resolveWhatsAppOwner>>["reason"]) {
  if (reason === "no_farm") {
    return "Não encontrei um rancho vinculado a este WhatsApp.";
  }
  if (reason === "farm_inactive") {
    return "O acesso deste rancho não está ativo no momento. Fale com o administrador ou suporte.";
  }
  if (reason === "user_inactive") {
    return "Este WhatsApp está cadastrado, mas está inativo para usar o bot. Fale com o administrador do Rancho.";
  }
  if (reason === "multiple_farms") {
    return "Encontrei este WhatsApp em mais de um rancho. Peça ao administrador para definir qual rancho deve usar o bot.";
  }
  return "Este WhatsApp ainda não está autorizado a usar o bot do Rancho. Peça ao administrador para cadastrar seu número na aba WhatsApp do sistema.";
}

function pendingFromSession(session?: BotSession | null) {
  return session?.dados?.pending as ParsedRanchoMessage | undefined;
}

function isDryRunConfirmationCommand(session: BotSession, command: string) {
  const pending = pendingFromSession(session);
  if (!pending) return isConfirmCommand(command);

  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const summary = tabularImportSummary(pending);
    if (summary.notFound && isTabularMissingAnimalRegisterCommand(command)) return false;
    if (summary.notFound && summary.ready && isTabularImportFoundOnlyCommand(command)) return true;
  }

  if (pending.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const summary = animalImportSummary(pending);
    if (summary.missingLots && isTabularCreateLotsAndRegisterCommand(command)) return true;
  }

  if (pending.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const summary = stockImportSummary(pending);
    if (summary.missingItems && isTabularCreateStockItemsCommand(command)) return true;
    if (
      summary.ready
      && (isTabularImportFoundOnlyCommand(command) || command === "2")
      && !(command === "2" && !summary.missingItems && Boolean(summary.invalid || summary.duplicates))
    ) return true;
  }

  return isConfirmCommand(command) || isHerdDeleteConfirmationCommand(pending, command);
}

function buildProcessResult(input: {
  response: string;
  parsed?: ParsedRanchoMessage;
  previousSession?: BotSession | null;
  nextSession?: BotSession | null;
  eventConfirmed?: boolean;
  error?: string | null;
  suppressPreviousPending?: boolean;
}): ProcessWhatsappMessageResult {
  const detected = pendingFromSession(input.nextSession) || input.parsed || (input.suppressPreviousPending ?undefined : pendingFromSession(input.previousSession));
  return {
    respostaTexto: input.response,
    intencaoDetectada: detected?.tipo || null,
    confianca: typeof detected?.confianca === "number" ?detected.confianca : null,
    dadosExtraidos: detected?.dados || null,
    estadoAnterior: input.previousSession?.etapa || null,
    estadoNovo: input.nextSession?.etapa || null,
    camposFaltantes: detected?.perguntas_faltantes || [],
    eventoConfirmado: Boolean(input.eventConfirmed),
    erro: input.error || null
  };
}

export async function processWhatsappMessage(input: ProcessWhatsappMessageInput): Promise<ProcessWhatsappMessageResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return buildProcessResult({
      response: "Não consegui acessar as configurações do Rancho agora. Tente novamente em instantes.",
      error: "Supabase admin não configurado."
    });
  }

  const phone = normalizeWhatsappNumber(input.telefone) || input.telefone;
  const originalMessage = String(input.mensagem || "");
  const message = sanitizeFreeText(originalMessage);
  const messageTooLong = isOversizedText(originalMessage);
  const salvarRealNoTeste = Boolean(input.modoTeste && input.salvarReal);
  let owner: WhatsAppOwner | null = null;
  let previousSession: BotSession | null = null;
  let nextSession: BotSession | null = null;
  let parsed: ParsedRanchoMessage | undefined;
  let response = "";
  let eventConfirmed = false;
  let suppressPreviousPending = false;

  try {
    const resolvedOwner = await resolveWhatsAppOwner(supabase, input.telefone);
    owner = resolvedOwner.owner;

    if (!input.modoTeste) {
      await saveWhatsAppMessage(supabase, {
        owner,
        phone,
        messageSid: input.messageSid,
        direction: "entrada",
        body: message,
        raw: {
          provider: input.provider,
          modoTeste: Boolean(input.modoTeste),
          salvarReal: Boolean(input.salvarReal),
          from: input.telefone,
          to: input.to,
          messageSid: input.messageSid,
          ...(input.raw || {})
        }
      });
    }

    if (!owner) {
      response = ownerBlockedMessage(resolvedOwner.reason);
      if (!input.modoTeste) {
        await saveWhatsAppMessage(supabase, {
          owner,
          phone,
          messageSid: input.messageSid,
          direction: "saida",
          body: response,
          raw: {
            provider: input.provider,
            modoTeste: Boolean(input.modoTeste),
            salvarReal: Boolean(input.salvarReal)
          }
        });
      }
      return buildProcessResult({ response });
    }

    const command = normalizeRanchoText(message);
    previousSession = await getSession(supabase, owner);
    if (!message || messageTooLong) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = messageTooLong ? "Mensagem muito longa para processar com segurança. Envie uma mensagem mais curta." : "Envie uma mensagem para o bot.";
      suppressPreviousPending = true;
    } else if (detectDestructiveBulkAction(message)) {
      parsed = destructiveBulkActionParsed(message);
      logDestructiveBulkBlock(owner, {
        currentIntent: parsed.tipo,
        source: "process_input_guard",
        blocked: true
      });
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = DESTRUCTIVE_BULK_ACTION_MESSAGE;
      suppressPreviousPending = true;
    } else if (isUnsafeOperationalMessage(message)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = SAFE_OPERATION_BLOCKED_MESSAGE;
      suppressPreviousPending = true;
    } else {
    const parserMessage = originalMessage.includes(";") && /[\r\n]/.test(originalMessage) ?originalMessage : message;
    const localParsedPreview = parseRanchoMessage(parserMessage);
    const legacyParserCanDecide = !isGeminiPrimaryMode();
    const tableParsedPreview = legacyParserCanDecide && ["IMPORTACAO_EVENTOS_TABELA", "IMPORTACAO_ANIMAIS_TABELA", "IMPORTACAO_ESTOQUE_TABELA", "IMPORTACAO_TABELA_DOMINIO", "IMPORTACAO_TABELA_AMBIGUA"].includes(localParsedPreview.tipo)
      ?localParsedPreview
      : null;
    if (originalMessage.includes(";")) {
      botTabularImportLog("parser_preview", owner, {
        chars_original: originalMessage.length,
        chars_sanitized: message.length,
        has_real_newline: /[\r\n]/.test(originalMessage),
        has_escaped_newline: /\\[rn]/.test(originalMessage),
        selected_intent: localParsedPreview.tipo,
        confidence: localParsedPreview.confianca,
        table_detected: Boolean(tableParsedPreview),
        total_linhas: tableParsedPreview?.dados?.total_linhas || null,
        parse_validas: tableParsedPreview?.dados?.total_linhas_parse_validas || null,
        parse_invalidas: tableParsedPreview?.dados?.total_linhas_parse_invalidas || null
      });
    }
    const conversationAct: ConversationAct = tableParsedPreview ?{
      messageType: "new_action",
      intent: tableParsedPreview.tipo,
      confidence: tableParsedPreview.confianca,
      targetPreviousActionId: null,
      targetPreviousAction: null,
      correction: null,
      flags: [],
      decision: "new_action",
      reason: "Mensagem tabular tratada como nova importacao controlada.",
      normalizedText: command,
      hasPendingAction: Boolean(pendingFromSession(previousSession))
    } : detectConversationAct({
      text: message,
      command,
      session: previousSession,
      pending: pendingFromSession(previousSession)
    });
    logConversationAct(message, conversationAct);

    if (tableParsedPreview) {
      parsed = await enrichWithCatalog(supabase, owner, tableParsedPreview);
      response = await handleFreeText(supabase, owner, parserMessage, parsed);
    } else if (isMenuCommand(command)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = helpText();
    } else if (conversationAct.messageType === "cancellation") {
      const handled = await handleConversationActMessage(supabase, owner, previousSession, message, conversationAct);
      parsed = handled.parsed;
      suppressPreviousPending = Boolean(handled.suppressPreviousPending);
      response = handled.response || "Cancelado. Nada foi salvo. Envie um novo registro quando quiser.";
    } else if (isHerdPaginationCommand(command) && previousSession.dados?.rebanho_paginacao) {
      const handled = await handleHerdPagination(supabase, owner, previousSession, command);
      parsed = handled.parsed;
      response = handled.response;
    } else if (isStockPaginationCommand(command) && previousSession.dados?.eventos_paginacao) {
      response = await handleEventsPagination(supabase, owner, previousSession);
    } else if (isStockPaginationCommand(command) && previousSession.dados?.estoque_paginacao) {
      response = await handleStockPagination(supabase, owner, previousSession);
    } else if (isStockPaginationCommand(command) && previousSession.dados?.financeiro_paginacao) {
      response = await handleFinancePagination(supabase, owner, previousSession);
    } else if (isRepeatCommand(command)) {
      parsed = pendingFromSession(previousSession);
      if (previousSession.etapa === "aguardando_confirmacao" && parsed) {
        await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: parsed } });
        response = confirmationText(parsed);
      } else {
        await saveSession(supabase, owner, { etapa: "livre", dados: {} });
        response = "Não há operação pendente para repetir. Envie um novo registro.";
      }
    } else if (previousSession.etapa === "aguardando_confirmacao" && input.modoTeste && !salvarRealNoTeste && isDryRunConfirmationCommand(previousSession, command)) {
      parsed = pendingFromSession(previousSession);
      if (parsed?.tipo === "IMPORTACAO_ANIMAIS_TABELA" && animalImportSummary(parsed).missingLots && isTabularCreateLotsAndRegisterCommand(command)) {
        parsed = await enrichWithCatalog(supabase, owner, refreshRanchoMessage(parsed, {
          ...(parsed.dados || {}),
          criar_lotes_faltantes: true
        }));
      }
      if (parsed?.tipo === "IMPORTACAO_ESTOQUE_TABELA" && stockImportSummary(parsed).missingItems && isTabularCreateStockItemsCommand(command)) {
        parsed = await enrichWithCatalog(supabase, owner, refreshRanchoMessage(parsed, {
          ...(parsed.dados || {}),
          criar_itens_faltantes: true
        }));
      }
      const denied = permissionDeniedMessage(owner, parsed);
      const invalidReason = parsed ?validatePendingForSave(parsed) : null;
      if (denied) {
        eventConfirmed = false;
        await saveSession(supabase, owner, { etapa: "livre", dados: {} });
        response = denied;
      } else if (invalidReason) {
        eventConfirmed = false;
        await saveSession(supabase, owner, { etapa: "livre", dados: {} });
        response = invalidReason;
      } else {
      eventConfirmed = true;
      await saveSession(supabase, owner, {
        etapa: "livre",
        dados: {
          ultimo_teste_confirmado: parsed || null,
          confirmado_em: nowIso(),
          modo_teste: true,
          salvar_real: false
        }
      });
      response = dryRunConfirmationText(parsed);
      if (parsed?.tipo === "IMPORTACAO_EVENTOS_TABELA") {
        botTabularImportLog("dry_run_confirmed", owner, {
          ...tabularImportSummary(parsed),
          response_chars: response.length
        });
      }
      if (parsed?.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
        botTabularImportLog("animal_import_dry_run_confirmed", owner, {
          ...animalImportSummary(parsed),
          response_chars: response.length
        });
      }
      if (parsed?.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
        botTabularImportLog("stock_import_dry_run_confirmed", owner, {
          ...stockImportSummary(parsed),
          response_chars: response.length
        });
      }
      }
    } else if (previousSession.etapa === "aguardando_confirmacao") {
      parsed = pendingFromSession(previousSession);
      const handled = await handleConversationActMessage(supabase, owner, previousSession, message, conversationAct);
      if (handled.handled) {
        parsed = handled.parsed;
        suppressPreviousPending = Boolean(handled.suppressPreviousPending);
        eventConfirmed = false;
        response = handled.response || "";
      } else {
        const summary = parsed?.tipo === "IMPORTACAO_EVENTOS_TABELA" ?tabularImportSummary(parsed) : null;
        const isMissingAnimalDecision = Boolean(summary?.notFound && isTabularMissingAnimalRegisterCommand(command));
        const stockSummary = parsed?.tipo === "IMPORTACAO_ESTOQUE_TABELA" ?stockImportSummary(parsed) : null;
        const isStockImportDecision = Boolean(stockSummary && (
          (stockSummary.missingItems && isTabularCreateStockItemsCommand(command))
          || (
            stockSummary.ready
            && (isTabularImportFoundOnlyCommand(command) || command === "2")
            && !(command === "2" && !stockSummary.missingItems && Boolean(stockSummary.invalid || stockSummary.duplicates))
          )
        ));
        eventConfirmed = (isConfirmCommand(command) || isHerdDeleteConfirmationCommand(parsed, command) || isStockImportDecision) && !isMissingAnimalDecision && !isDestructiveBulkParsed(parsed);
        response = await handleConfirmation(supabase, owner, previousSession, message, command, {
          modoTesteSalvarReal: salvarRealNoTeste
        });
      }
    } else if (previousSession.etapa === "aguardando_dado") {
      const handled = await handleConversationActMessage(supabase, owner, previousSession, message, conversationAct);
      if (handled.handled) {
        parsed = handled.parsed;
        suppressPreviousPending = Boolean(handled.suppressPreviousPending);
        response = handled.response || "";
      } else {
        response = await handleMissingData(supabase, owner, previousSession, message);
      }
    } else {
      const handled = await handleConversationActMessage(supabase, owner, previousSession, message, conversationAct);
      if (handled.handled) {
        parsed = handled.parsed;
        suppressPreviousPending = Boolean(handled.suppressPreviousPending);
        response = handled.response || "";
      } else {
        const localParsed = localParsedPreview;
        const fallback = await parseWithConfiguredInterpreter({
          text: parserMessage,
          localParsed,
          owner
        });

        if (fallback.kind === "clarify") {
          await saveSession(supabase, owner, { etapa: "livre", dados: {} });
          response = fallback.message;
        } else if (fallback.kind === "consultations") {
          parsed = fallback.consultations[0];
          await saveSession(supabase, owner, { etapa: "livre", dados: {} });
          response = await handleGeminiConsultationBatch(supabase, owner, fallback.consultations);
        } else if (fallback.kind === "compound") {
          const immediateText = fallback.immediateConsultations.length
            ?await handleGeminiConsultationBatch(supabase, owner, fallback.immediateConsultations)
            : "";
          parsed = await enrichWithCatalog(supabase, owner, fallback.pending);
          const actionText = await handleFreeText(supabase, owner, parserMessage, parsed);
          response = [immediateText, actionText].filter(Boolean).join("\n\n");
        } else {
          parsed = await enrichWithCatalog(supabase, owner, fallback.parsed);
          response = await handleFreeText(supabase, owner, parserMessage, parsed);
        }
      }
    }
    }

    nextSession = await getSession(supabase, owner);

    if (!input.modoTeste) {
      await saveWhatsAppMessage(supabase, {
        owner,
        phone,
        messageSid: input.messageSid,
        direction: "saida",
        body: response,
        raw: {
          provider: input.provider,
          modoTeste: Boolean(input.modoTeste),
          salvarReal: Boolean(input.salvarReal)
        }
      });
    }

    return buildProcessResult({
      response,
      parsed,
      previousSession,
      nextSession,
      eventConfirmed,
      suppressPreviousPending
    });
  } catch (error) {
    const message = safeErrorText(error) || "Erro interno no Rancho.";
    console.error("[BOT FLOW]", {
      event: "process_error",
      provider: input.provider,
      modoTeste: Boolean(input.modoTeste),
      phone: maskPhone(phone),
      message
    });
    response = "Erro interno no Rancho. Tente novamente.";
    if (!input.modoTeste) {
      await saveWhatsAppMessage(supabase, {
        owner,
        phone,
        messageSid: input.messageSid,
        direction: "saida",
        body: response,
        raw: {
          provider: input.provider,
          modoTeste: Boolean(input.modoTeste),
          erro: true
        }
      });
    }
    return buildProcessResult({
      response,
      parsed,
      previousSession,
      nextSession,
      eventConfirmed,
      error: "Erro interno no Rancho."
    });
  }
}

export async function handleTwilioRanchoMessage(input: TwilioMessageInput) {
  const result = await processWhatsappMessage({
    telefone: input.From,
    mensagem: input.Body,
    provider: "twilio",
    modoTeste: false,
    messageSid: input.MessageSid,
    to: input.To,
    raw: {
      from: input.From,
      to: input.To,
      messageSid: input.MessageSid
    }
  });

  return result.respostaTexto;
}
