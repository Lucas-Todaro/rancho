import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { getRanchTodayISO } from "@/lib/dates/ranch-time";
import { normalizeWhatsappNumber, whatsappNumbersMatch } from "@/lib/phone";
import { applyReproductionImportChildComplement } from "@/lib/whatsapp/action-plan/reproduction-import-child";
import {
  isOversizedText,
  isUnsafeOperationalMessage,
  safeErrorText,
  sanitizeFreeText,
  sanitizeWhatsappMessageText,
  sanitizePayloadValue,
  SAFE_OPERATION_BLOCKED_MESSAGE
} from "@/lib/security";
import { animalBlockedMessage, animalDeathDate, animalStatusValue, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import { normalizeCatalogText, resolveAnimalIdentifier, resolveStockItem } from "@/lib/whatsapp/catalog";
import { resolveWhatsAppOwner, type WhatsAppOwner } from "@/services/whatsapp/identity";
import { getSession, pendingFromSession, saveSession as persistSession, type BotSession } from "@/services/whatsapp/session-service";
import {
  helpText,
  NO_PENDING_ACTION_MESSAGE,
  ownerBlockedMessage,
  PENDING_ACTION_CANCELLED_MESSAGE,
  unknownText
} from "@/services/whatsapp/messages";
import {
  canFinishMissingFields,
  composeGeneralConversationText,
  composeMissingDataText,
  composeOptionalFieldsFinishedText,
  finishMissingFieldsForConfirmation,
  isFinishOptionalFieldsCommand
} from "@/services/whatsapp/bot-response-composer";
import { interpretPendingActionMessageSmart } from "@/services/whatsapp/pending-action-interpreter";
import { handleConsultation as runConsultation } from "@/services/whatsapp/consultation/index";
import type { ConsultationDependencies } from "@/services/whatsapp/consultation/types";
import { saveConfirmedRecordByDomain } from "@/services/whatsapp/save-record/index";
import type { SaveRecordDependencies } from "@/services/whatsapp/save-record/types";
import { detectConversationAct, logConversationAct, type ConversationAct } from "@/services/whatsapp/conversation-act";
import { isGeminiPrimaryMode, parseWithConfiguredInterpreter } from "@/services/whatsapp/interpreter/gemini-primary";
import { buildRanchReport, type OperationalReportKind, type OperationalReportMode } from "@/services/whatsapp/operational-report";
import {
  formatStockUnit,
  mergeRanchoMessageData,
  normalizeRanchoText,
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
import { finalize } from "@/lib/whatsapp/nlp-core/result";
import { domainFromUserChoice, manualDomainChoiceOptionsText, tabularDomainLabel } from "@/lib/whatsapp/nlp-core/tabular-domain-router";
import { detectStructuredInput, parseRanchoMessage, parseTabularAnimalEventsMessageAs } from "@/services/whatsapp/local-parser-gate";
import { polishBotResponse, userFacingCodeLabel } from "@/lib/whatsapp/user-facing-text";
import { dateFromReference, dateOnlyFromReference, isoFromReference } from "@/services/whatsapp/date-utils";
import { formatMoney, formatNumber } from "@/services/whatsapp/message-format";
import { buildAnimalIndividualReport as buildAnimalIndividualReportFromModule } from "@/services/whatsapp/animal-report";
import { collectDescendantIds, genealogyPayloadFromData, relationBlockMessage } from "@/services/whatsapp/genealogy-helpers";
import { enrichWithCatalog, type CatalogEnrichmentDependencies } from "@/services/whatsapp/catalog-enrichment";
import {
  enrichTabularAnimalEventImport,
  enrichTabularAnimalImport,
  enrichTabularStockImport,
  existingAnimalEventKeysForImport,
  importedTableEventDescription,
  importedTableEventKey
} from "@/services/whatsapp/table-import-enrichment";
import {
  milkStockAfterSaveText,
  milkStockDebug,
  milkStockDecisionQuestion,
  milkStockNeedsDecision,
  normalizePhysicalSalePending,
  physicalSaleNeedsStockDecision,
  physicalSaleStockDecisionQuestion,
  resolveMilkStockItem,
  saleFinanceDataFromStockSale,
  shouldResolveMilkStockForProduction,
  stockDecisionReason,
  stockResolutionDebug,
  withMilkStockMovementDecision,
  withPhysicalSaleStockDecision,
  withoutChildMilkStockMetadata
} from "@/services/whatsapp/milk-stock-service";
import {
  animalLabel,
  animalSexKind,
  bestMatch,
  exactAnimalImportCodeKey,
  findAnimal,
  findLot,
  findStockItem,
  listAnimals,
  listLots,
  listStockItems,
  lotLabel,
  type StockLookupResult
} from "@/services/whatsapp/catalog-service";
import { confirmationText, dryRunConfirmationText, isDestructiveBulkParsed } from "@/services/whatsapp/confirmation-message";
import { sendOutboundWhatsAppText } from "@/services/whatsapp/outbound";
import { composeBotResponseWithAI } from "@/services/whatsapp/ai-response-composer";
import {
  applyPendingPatchToSession,
  interpretPendingPatchWithGemini,
  shouldUsePendingPatchForText
} from "@/lib/whatsapp/gemini/pending-patch";
import {
  ambiguousTableQuestion,
  animalImportIssueDetails,
  animalImportPendingFromMissingEventAnimals,
  animalImportRows,
  animalImportSummary,
  domainDateOnly,
  domainDateTime,
  domainImportCriticalRows,
  domainImportReadyRows,
  domainImportResultMessage,
  domainImportRows,
  domainLine,
  domainParsedDate,
  domainRowValues,
  domainStatusActive,
  domainTableSummary,
  domainText,
  domainTime,
  importKey,
  normalizeDomainEventType,
  normalizeDomainFinanceType,
  stockImportIssueDetails,
  stockImportRows,
  stockImportSummary,
  tabularImportIssueDetails,
  tabularImportRows,
  tabularImportSummary,
  type DomainImportSaveStats,
  validCpf,
  validDomainAnimalCategory,
  validDomainSex,
  validDomainStatus
} from "@/services/whatsapp/table-import-preview";

import type { ProcessWhatsappMessageInput, ProcessWhatsappMessageResult } from "@/services/whatsapp/types";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;




type SaveResult = {
  response: string;
  nextSession?: BotSession;
  sessionData?: AnyRecord;
  savedReal?: boolean;
  savedTables?: string[];
};

const CONFIRM_WORDS = new Set(["sim", "s", "ss", "confirmar", "confirma", "confirmado", "correto", "ok", "okay", "blz", "beleza", "pode", "pode salvar", "pode registrar", "pode lancar", "salvar", "salva", "registrar", "registra", "lancar", "lanca", "isso", "isso mesmo", "certo", "ta certo", "fechou", "show", "joia", "manda", "vai", "pode sim", "e isso", "importar", "importar validas", "importar linhas validas", "importar encontrados", "importar so encontrados", "salvar validas", "salvar linhas validas", "importa validas", "pode importar", "cadastrar", "cadastrar validos", "cadastrar animais", "so as validas", "so validas", "somente validas", "apenas validas", "1"]);
const REJECT_WORDS = new Set(["nao", "n", "errado", "corrigir", "corrige", "nao e isso", "refazer", "refaz", "incorreto", "negativo", "na verdade", "2"]);
const CANCEL_WORDS = new Set(["cancelar", "cancela", "cancele", "sair", "para", "parar", "pare", "aborta", "abortar", "deixa", "esquece", "desfaz", "desfazer", "nao salva", "nao salve", "nao salvar", "nao registrar", "apaga isso"]);
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
const DOMAIN_TABLE_IMPORT_ADMIN_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "IMPORTACAO_TABELA_DOMINIO"
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
function dateOnly(date = new Date()) {
  return getRanchTodayISO(date);
}
function monthStartFromPaymentPeriod(period?: string) {
  const [year, month] = getRanchTodayISO().split("-").map(Number);
  if (period !== "mes_anterior") return `${year}-${String(month).padStart(2, "0")}-01`;
  const previous = new Date(Date.UTC(year, month - 2, 1, 12));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthKeyFromDate(value: unknown) {
  return String(value || "").slice(0, 7);
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
  if (DOMAIN_TABLE_IMPORT_ADMIN_INTENTS.has(parsed.tipo)) {
    return "Voce nao tem permissao para importar tabelas desse dominio pelo bot. Peca para um administrador fazer essa importacao.";
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

async function saveSession(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession) {
  await persistSession(supabase, owner, session, botLog);
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

function botPartoSaveLog(event: string, owner: WhatsAppOwner, details: AnyRecord = {}) {
  console.log("[BOT PARTO SAVE]", {
    event,
    phone: maskPhone(owner.telefone_e164),
    fazenda_id: owner.fazenda_id,
    ...details
  });
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
function normalizedReproductiveEventKind(dados: AnyRecord, description: string): NlpReproductiveEventKind | undefined {
  const explicitKind = String(dados.evento_reprodutivo_tipo || "");
  if (explicitKind === "em_protocolo") return "protocolo";
  if (explicitKind === "em_reteste") return "reteste";
  if (["inseminacao", "prenhez", "pre_parto", "parto", "cio", "aborto", "protocolo", "reteste", "observacao"].includes(explicitKind)) {
    return explicitKind as NlpReproductiveEventKind;
  }
  if (dados.evento_tipo === "reprodutivo") return detectReproductiveEventKind(description) || "observacao";
  return undefined;
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

const PROCESSING_NOTICE_TEXT = "Recebi sua mensagem. Estou conferindo os dados do rancho e já te respondo.";
const DEFAULT_PROCESSING_NOTICE_DELAY_MS = 2700;

function processingNoticeDelayMs() {
  const value = Number(process.env.BOT_PROCESSING_NOTICE_DELAY_MS || "");
  if (!Number.isFinite(value)) return DEFAULT_PROCESSING_NOTICE_DELAY_MS;
  return Math.min(Math.max(value, 500), 8000);
}

function processingNoticeEnabled(input: ProcessWhatsappMessageInput) {
  if (input.modoTeste) return false;
  if (!["twilio", "meta", "whatsapp"].includes(input.provider)) return false;

  const raw = String(process.env.BOT_PROCESSING_NOTICE_ENABLED || "").trim().toLowerCase();
  if (["0", "false", "off", "nao", "não"].includes(raw)) return false;
  if (["1", "true", "on", "sim"].includes(raw)) return true;
  return process.env.NODE_ENV === "production";
}

function startProcessingNotice(input: ProcessWhatsappMessageInput, supabase: SupabaseAdmin, owner: WhatsAppOwner, phone: string, reason: string) {
  if (!processingNoticeEnabled(input)) return { cancel: () => undefined };

  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    void (async () => {
      try {
        await sendOutboundWhatsAppText(phone, PROCESSING_NOTICE_TEXT);
        await saveWhatsAppMessage(supabase, {
          owner,
          phone,
          messageSid: `${input.messageSid || "processing"}-${reason}`,
          direction: "saida",
          body: PROCESSING_NOTICE_TEXT,
          raw: {
            provider: input.provider,
            processing_notice: true,
            reason
          }
        });
        console.log("[BOT FLOW]", {
          event: "processing_notice_sent",
          provider: input.provider,
          phone: maskPhone(phone),
          reason
        });
      } catch (error) {
        console.warn("[BOT FLOW]", {
          event: "processing_notice_failed",
          provider: input.provider,
          phone: maskPhone(phone),
          reason,
          message: safeErrorText(error) || "erro desconhecido"
        });
      }
    })();
  }, processingNoticeDelayMs());

  return {
    cancel: () => {
      cancelled = true;
      clearTimeout(timer);
    }
  };
}

async function withProcessingNotice<T>(
  input: ProcessWhatsappMessageInput,
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  phone: string,
  reason: string,
  run: () => Promise<T>
) {
  const notice = startProcessingNotice(input, supabase, owner, phone, reason);
  try {
    return await run();
  } finally {
    notice.cancel();
  }
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
  if (pending.tipo === "IMPORTACAO_TABELA_DOMINIO" && domainImportCriticalRows(pending).length > 0) return "Corrija os erros criticos da tabela antes de salvar. Nada foi salvo.";
  if (pending.tipo === "IMPORTACAO_TABELA_DOMINIO" && domainTableSummary(pending).ready <= 0 && domainTableSummary(pending).domain !== "AGENDA_TAREFAS") return "Nao encontrei linhas validas nesse dominio para salvar. Nada foi salvo.";
  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA" && tabularImportSummary(pending).ready <= 0) return "Não encontrei linhas válidas para importar. Nada foi salvo.";
  if (pending.tipo === "IMPORTACAO_ANIMAIS_TABELA" && animalImportSummary(pending).ready <= 0) return "Não encontrei animais válidos para cadastrar. Nada foi salvo.";
  if (pending.tipo === "IMPORTACAO_ESTOQUE_TABELA" && stockImportSummary(pending).ready <= 0) return "Não encontrei linhas válidas de estoque para importar. Nada foi salvo.";
  if (pending.tipo === "PRODUCAO_LEITE" && invalidPositiveNumber(dados.litros)) return "Informe uma quantidade de litros válida antes de salvar.";
  if (pending.tipo === "PARTO" && partoWithChild(dados) && !normalizeCalfSex(dados.cria_sexo)) return "Informe se a cria nasceu macho ou femea antes de salvar.";
  if (pending.tipo === "PARTO" && partoWithChild(dados) && !dados.cria_codigo && !dados.gerar_cria_codigo_temporario) return "Informe o codigo/brinco da cria antes de salvar.";
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
  if (error) {
    const err = new Error(error.message || "Erro ao salvar registro no Supabase.") as Error & {
      supabaseErrorCode?: string | null;
      supabaseErrorMessage?: string | null;
    };
    err.supabaseErrorCode = error.code || null;
    err.supabaseErrorMessage = error.message || null;
    throw err;
  }
  await logAudit(supabase, owner, table, "insert", data || safePayload);
  await createBotNotificationForInsert(supabase, owner, table, (data || safePayload) as AnyRecord);
  return data;
}

async function updateMotherPhaseAfterParto(supabase: SupabaseAdmin, owner: WhatsAppOwner, mother: AnyRecord) {
  if (!mother?.id || !animalPhaseIsPregnant(mother)) return false;

  const { data, error } = await supabase
    .from(TABLES.animais)
    .update({ fase: "lactacao" })
    .eq("id", mother.id)
    .eq("fazenda_id", owner.fazenda_id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, owner, TABLES.animais, "update", data || { ...mother, fase: "lactacao" });
  mother.fase = "lactacao";
  return true;
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
  const sexCategory = calfCategoryForSex(sex);
  const childCategory = sexCategory || "bezerro";
  return {
    fazenda_id: owner.fazenda_id,
    brinco: calfCodeFromParto(dados, mother),
    nome: dados.cria_nome || null,
    categoria: childCategory,
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

function isSamePartoChild(child: AnyRecord, dados: AnyRecord, mother: AnyRecord) {
  const expectedSex = normalizeCalfSex(dados.cria_sexo);
  const childSex = normalizeCalfSex(child.sexo);
  const expectedDate = dateOnlyFromReference(String(dados.data_referencia || "hoje"));
  return String(child.mae_id || "") === String(mother.id || "")
    && (!expectedSex || childSex === expectedSex)
    && (!child.data_nascimento || String(child.data_nascimento).slice(0, 10) === expectedDate);
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
type ReproductiveEventKind = "inseminacao" | "prenhez" | "pre_parto" | "parto" | "protocolo" | "reteste";

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
  if (/\b(?:reteste)\b/.test(text)) return "reteste";
  if (/\b(?:protocolo|nao passou)\b/.test(text)) return "protocolo";
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

function hasActiveInsemination(events: AnyRecord[]) {
  const latestInsemination = events.find((event) => reproductiveEventKind(event) === "inseminacao");
  if (!latestInsemination) return false;
  const reference = eventDateMs(latestInsemination);
  return !events.some((event) => {
    if (eventDateMs(event) <= reference) return false;
    return ["prenhez", "pre_parto", "parto"].includes(String(reproductiveEventKind(event) || ""));
  });
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
  if (filter === "inseminada") return hasActiveInsemination(events);
  if (filter === "prenhe") {
    if (latestKind === "parto") return false;
    if (latestKind === "inseminacao" || latestKind === "protocolo" || latestKind === "reteste") return false;
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
async function existingFinanceImportKeys(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.transacoesFinanceiras)
    .select("id,tipo,data_transacao,valor,descricao,categoria")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (error) throw new Error(error.message);
  return new Set(((data || []) as AnyRecord[]).map((row) => [
    row.tipo,
    domainDateOnly(row.data_transacao),
    Number(row.valor || 0),
    normalizeCatalogText(`${row.descricao || ""}|${row.categoria || ""}`)
  ].join("|")));
}

async function existingPointImportKeys(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.registrosPonto)
    .select("id,funcionario_id,tipo,registrado_em")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (error) throw new Error(error.message);
  return new Set(((data || []) as AnyRecord[]).map((row) => [
    row.funcionario_id,
    row.tipo,
    String(row.registrado_em || "")
  ].join("|")));
}

async function existingEventImportKeys(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,data_evento,descricao,medicamento")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (error) throw new Error(error.message);
  return new Set(((data || []) as AnyRecord[]).map((row) => [
    row.animal_id || "",
    row.tipo || "",
    String(row.data_evento || "").slice(0, 10),
    normalizeCatalogText(`${row.descricao || ""}|${row.medicamento || ""}`)
  ].join("|")));
}

async function enrichDomainTableImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const domain = String(dados.dominio_tabela || "DESCONHECIDO");
  const rows = domainImportRows(parsed);
  const animals = ["GENEALOGIA", "SAUDE_SANITARIO", "OBSERVACOES"].includes(domain) ?await listAnimals(supabase, owner) : [];
  const lots = domain === "LOTES" ?await listLots(supabase, owner) : [];
  const financeKeys = domain === "FINANCEIRO" ?await existingFinanceImportKeys(supabase, owner) : new Set<string>();
  const pointKeys = domain === "PONTO_FUNCIONARIO" ?await existingPointImportKeys(supabase, owner) : new Set<string>();
  const eventKeys = ["SAUDE_SANITARIO", "OBSERVACOES"].includes(domain) ?await existingEventImportKeys(supabase, owner) : new Set<string>();
  const employeeRows = ["FUNCIONARIOS", "PONTO_FUNCIONARIO", "AGENDA_TAREFAS"].includes(domain)
    ?((await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,cpf,contato_whatsapp,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(5000)).data || []) as AnyRecord[]
    : [];
  const activeEmployees = employeeRows.filter((row) => row.ativo !== false && !row.deleted_at);
  const whatsappRows = domain === "FUNCIONARIOS"
    ?((await supabase
      .from(TABLES.whatsappUsuarios)
      .select("id,telefone_e164,funcionario_id,nome_exibicao,ativo")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(5000)).data || []) as AnyRecord[]
    : [];

  const tableKeys = new Set<string>();
  const lotNames = new Set(lots.map((lot) => normalizeCatalogText(lot.nome)));
  const nextRows = [];

  for (const row of rows) {
    const next = { ...row };
    const values = domainRowValues(row);
    const errors = new Set<string>(Array.isArray(row.problemas) ?row.problemas.map(String) : []);
    const warnings = new Set<string>(Array.isArray(row.avisos) ?row.avisos.map(String) : []);
    const line = domainLine(row);

    if (domain === "LOTES") {
      const name = domainText(values.nome);
      const key = normalizeCatalogText(name);
      if (!name) errors.add("nome_lote_obrigatorio");
      if (values.status && !validDomainStatus(values.status)) errors.add("status_invalido");
      if (key && tableKeys.has(key)) warnings.add("lote_repetido_na_tabela");
      if (key && lotNames.has(key)) warnings.add("lote_duplicado_no_rancho");
      if (key) tableKeys.add(key);
    } else if (domain === "GENEALOGIA") {
      const animalRef = domainText(values.animal_ref || values.filho_ref || values.cria_codigo || values.cria_nome);
      const animal = animalRef ?resolveAnimalIdentifier(animalRef, animals) : null;
      if (!animalRef) errors.add("animal_principal_obrigatorio");
      else if (animal?.status === "ambiguous") errors.add("animal_principal_ambiguo");
      else if (!animal?.row) errors.add("animal_principal_nao_encontrado");

      for (const parent of [
        { label: "pai", ref: domainText(values.pai_ref) },
        { label: "mae", ref: domainText(values.mae_ref) }
      ]) {
        if (!parent.ref) continue;
        const found = resolveAnimalIdentifier(parent.ref, animals);
        if (found.status === "ambiguous") errors.add(`${parent.label}_ambiguo`);
        else if (!found.row) errors.add(`${parent.label}_nao_encontrado`);
        else if (animal?.row && String(found.row.id) === String(animal.row.id)) errors.add(`${parent.label}_igual_ao_animal`);
        else if (animal?.row && collectDescendantIds(String(animal.row.id || ""), animals).has(String(found.row.id || ""))) errors.add("ciclo_genealogico");
      }
      if (!values.pai_ref && !values.mae_ref) errors.add("pai_ou_mae_obrigatorio");
    } else if (domain === "FINANCEIRO") {
      const type = normalizeDomainFinanceType(values.tipo);
      const value = Number(values.valor || 0);
      const description = domainText(values.descricao || values.pessoa || values.observacoes);
      const date = domainParsedDate(row, "data");
      const key = [type, date, value, normalizeCatalogText(`${description || "Lancamento importado via WhatsApp"}|${values.categoria || ""}`)].join("|");
      if (!type) errors.add("tipo_financeiro_invalido");
      if (!Number.isFinite(value) || value <= 0) errors.add("valor_financeiro_invalido");
      if (values.data && !date) errors.add("data_invalida");
      if (!description) warnings.add("descricao_padrao_segura");
      if (key && financeKeys.has(key)) warnings.add("transacao_duplicada_no_rancho");
      if (key && tableKeys.has(key)) warnings.add("transacao_repetida_na_tabela");
      if (key) tableKeys.add(key);
    } else if (domain === "FUNCIONARIOS") {
      const name = domainText(values.nome);
      const phone = normalizeWhatsappNumber(values.telefone);
      const cpf = domainText((values as AnyRecord).cpf);
      if (!name) errors.add("nome_funcionario_obrigatorio");
      if (!isValidBotPhone(phone)) errors.add("whatsapp_invalido");
      if (cpf && !validCpf(cpf)) errors.add("cpf_invalido");
      if (values.salario !== null && values.salario !== undefined && values.salario !== "" && (!Number.isFinite(Number(values.salario)) || Number(values.salario) < 0)) errors.add("salario_invalido");
      if (values.status && !validDomainStatus(values.status)) errors.add("status_invalido");
      if (phone && activeEmployees.some((employee) => whatsappNumbersMatch(phone, employee.contato_whatsapp))) warnings.add("whatsapp_duplicado_no_rancho");
      if (phone && whatsappRows.some((item) => item.ativo !== false && whatsappNumbersMatch(phone, item.telefone_e164))) warnings.add("whatsapp_ja_vinculado");
      if (cpf && activeEmployees.some((employee) => domainText(employee.cpf).replace(/\D/g, "") === cpf.replace(/\D/g, ""))) warnings.add("cpf_duplicado_no_rancho");
    } else if (domain === "PONTO_FUNCIONARIO") {
      const employeeRef = domainText(values.funcionario_ref);
      const employee = employeeRef ?bestMatch(activeEmployees, employeeRef, (item) => [item.nome]) : null;
      const entry = domainTime(values.entrada);
      const exit = domainTime(values.saida);
      const date = domainParsedDate(row, "data");
      if (!employeeRef) errors.add("funcionario_obrigatorio");
      else if (!employee?.row || (!employee.exact && employee.score < 0.86)) errors.add("funcionario_nao_encontrado");
      if (values.data && !date) errors.add("data_invalida");
      if (values.entrada && !entry) errors.add("entrada_invalida");
      if (values.saida && !exit) errors.add("saida_invalida");
      if (!entry && !exit) errors.add("entrada_ou_saida_obrigatoria");
      if (entry && exit && exit <= entry) errors.add("saida_antes_da_entrada");
      if (employee?.row) {
        for (const item of [{ type: "entrada", time: entry }, { type: "saida", time: exit }].filter((item) => item.time)) {
          const key = [employee.row.id, item.type, domainDateTime(date || values.data, item.time)].join("|");
          if (pointKeys.has(key)) warnings.add("ponto_duplicado_no_rancho");
          if (tableKeys.has(key)) warnings.add("ponto_repetido_na_tabela");
          tableKeys.add(key);
        }
      }
    } else if (domain === "SAUDE_SANITARIO") {
      const animalRef = domainText(values.animal_ref);
      const animal = animalRef ?resolveAnimalIdentifier(animalRef, animals) : null;
      const event = domainText(values.evento || values.produto);
      const date = domainParsedDate(row, "data");
      if (!animalRef) errors.add("animal_obrigatorio");
      else if (animal?.status === "ambiguous") errors.add("animal_ambiguo");
      else if (!animal?.row) errors.add("animal_nao_encontrado");
      if (!event) errors.add("evento_ou_produto_obrigatorio");
      if (values.data && !date) errors.add("data_invalida");
      if (values.dose && !/\d/.test(domainText(values.dose))) warnings.add("dose_sem_numero");
      if (animal?.row) {
        const key = [animal.row.id, normalizeDomainEventType(values.evento, values.produto), date, normalizeCatalogText(`${event}|${values.dose || ""}`)].join("|");
        if (eventKeys.has(key)) warnings.add("evento_duplicado_no_rancho");
        if (tableKeys.has(key)) warnings.add("evento_repetido_na_tabela");
        tableKeys.add(key);
      }
    } else if (domain === "OBSERVACOES") {
      const observation = domainText(values.observacao);
      const entityRef = domainText(values.entidade_ref);
      const animal = entityRef ?resolveAnimalIdentifier(entityRef, animals) : null;
      const date = domainParsedDate(row, "data");
      if (!observation) errors.add("observacao_obrigatoria");
      if (entityRef && animal?.status === "ambiguous") errors.add("animal_ambiguo");
      else if (entityRef && !animal?.row) errors.add("animal_nao_encontrado");
      if (values.data && !date) errors.add("data_invalida");
      const key = [animal?.row?.id || "", "observacao", date, normalizeCatalogText(observation)].join("|");
      if (eventKeys.has(key)) warnings.add("observacao_duplicada_no_rancho");
      if (tableKeys.has(key)) warnings.add("observacao_repetida_na_tabela");
      tableKeys.add(key);
    } else if (domain === "AGENDA_TAREFAS") {
      const task = domainText(values.titulo || values.tarefa);
      const date = domainParsedDate(row, "data");
      const responsible = domainText(values.responsavel);
      if (!task) errors.add("tarefa_obrigatoria");
      if (values.data && !date) errors.add("data_invalida");
      if (date && date < dateOnly()) warnings.add("tarefa_com_data_passada");
      if (responsible) {
        const employee = bestMatch(activeEmployees, responsible, (item) => [item.nome]);
        if (!employee?.row || (!employee.exact && employee.score < 0.86)) warnings.add("responsavel_nao_encontrado");
      }
      if (values.status && !validDomainStatus(values.status)) errors.add("status_invalido");
    } else if (domain === "REBANHO_ANIMAIS") {
      if (!domainText(values.codigo)) errors.add("codigo_obrigatorio");
      if (values.categoria && !validDomainAnimalCategory(values.categoria)) errors.add("categoria_invalida");
      if (values.sexo && !validDomainSex(values.sexo)) errors.add("sexo_invalido");
      if (values.status && !validDomainStatus(values.status)) errors.add("status_invalido");
      if (values.peso !== null && values.peso !== undefined && values.peso !== "" && (!Number.isFinite(Number(values.peso)) || Number(values.peso) < 0)) errors.add("peso_invalido");
    }

    const criticalErrors = Array.from(errors);
    const warningList = Array.from(warnings);
    next.problemas_validacao_dominio = criticalErrors;
    next.avisos_validacao_dominio = warningList;
    next.status_validacao_dominio = criticalErrors.length || row.status_linha === "invalido" ? "erro" : warningList.length ? "aviso" : "pronto";
    next.resumo_validacao_dominio = {
      linha: line,
      dominio: domain,
      erros: criticalErrors,
      avisos: warningList
    };
    nextRows.push(next);
  }

  const criticalRows = nextRows.filter((row) => row.status_validacao_dominio === "erro");
  const warningRows = nextRows.filter((row) => row.status_validacao_dominio === "aviso");
  const readyRows = nextRows.filter((row) => row.status_validacao_dominio !== "erro" && row.status_linha === "pronto");
  dados.linhas = nextRows;
  dados.linhas_validacao_dominio_erros = criticalRows;
  dados.linhas_validacao_dominio_avisos = warningRows;
  dados.resumo_validacao_dominio = {
    total: nextRows.length,
    prontas: readyRows.length,
    erros_criticos: criticalRows.length,
    avisos: warningRows.length,
    invalidas: criticalRows.length,
    revisao: warningRows.length,
    metricas: (dados.resumo_validacao as AnyRecord | undefined)?.metricas || {}
  };

  return refreshRanchoMessage(parsed, dados);
}

async function saveLotesImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "LOTES", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const existingNames = new Set((await listLots(supabase, owner)).map((lot) => normalizeCatalogText(lot.nome)));

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const name = domainText(values.nome || values.lote);
    if (!name) {
      stats.failed.push({ line: domainLine(row), reason: "nome do lote ausente" });
      continue;
    }
    const key = normalizeCatalogText(name);
    if (existingNames.has(key)) {
      stats.skipped += 1;
      continue;
    }

    const details = [
      values.tipo ?`tipo: ${values.tipo}` : "",
      values.capacidade ?`capacidade: ${values.capacidade}` : "",
      values.area ?`area: ${values.area}${values.unidade_area ?` ${values.unidade_area}` : ""}` : "",
      values.descricao ?domainText(values.descricao) : "",
      values.observacoes && values.observacoes !== values.descricao ?domainText(values.observacoes) : ""
    ].filter(Boolean).join(" | ");

    await insertRealRecord(supabase, owner, TABLES.lotes, {
      fazenda_id: owner.fazenda_id,
      nome: name,
      descricao: details || "Criado via importacao tabular do WhatsApp",
      ativo: domainStatusActive(values.ativo ?? values.status)
    });
    existingNames.add(key);
    stats.saved += 1;
    stats.savedTables.add(TABLES.lotes);
  }

  return realSaveResult(domainImportResultMessage("lotes", stats, "lote"), Array.from(stats.savedTables));
}

async function saveGenealogiaImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "GENEALOGIA", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const animals = await listAnimals(supabase, owner);

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const animalRef = domainText(values.animal_ref || values.filho_ref || values.cria_codigo || values.cria_nome);
    if (!animalRef) {
      stats.failed.push({ line: domainLine(row), reason: "animal ausente" });
      continue;
    }

    const animal = await findAnimal(supabase, owner, animalRef);
    if (!animal?.row || (!animal.exact && animal.score < 0.86) || animal.ambiguousRows?.length) {
      stats.failed.push({ line: domainLine(row), reason: `animal ${animalRef} nao encontrado com seguranca` });
      continue;
    }

    const payload: AnyRecord = {};
    const parents = [
      { field: "pai_id", ref: domainText(values.pai_ref), label: "pai" },
      { field: "mae_id", ref: domainText(values.mae_ref), label: "mae" }
    ];
    let failedParent = "";

    for (const parent of parents) {
      if (!parent.ref) continue;
      const found = await findAnimal(supabase, owner, parent.ref);
      if (!found?.row || (!found.exact && found.score < 0.86) || found.ambiguousRows?.length) {
        failedParent = `${parent.label} ${parent.ref} nao encontrado com seguranca`;
        break;
      }
      const parentId = String(found.row.id || "");
      const animalId = String(animal.row.id || "");
      const descendants = collectDescendantIds(animalId, animals);
      if (parentId === animalId || descendants.has(parentId)) {
        failedParent = `${parent.label} geraria autoparentesco ou ciclo`;
        break;
      }
      payload[parent.field] = parentId;
    }

    if (failedParent) {
      stats.failed.push({ line: domainLine(row), reason: failedParent });
      continue;
    }
    if (values.observacoes) payload.genealogia_observacoes = domainText(values.observacoes);
    if (!Object.keys(payload).length) {
      stats.failed.push({ line: domainLine(row), reason: "pai ou mae ausente" });
      continue;
    }

    const { data, error } = await supabase
      .from(TABLES.animais)
      .update(sanitizePayloadValue(payload) as AnyRecord)
      .eq("id", animal.row.id)
      .eq("fazenda_id", owner.fazenda_id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, owner, TABLES.animais, "update", data || { ...animal.row, ...payload });
    stats.saved += 1;
    stats.savedTables.add(TABLES.animais);
  }

  return realSaveResult(domainImportResultMessage("genealogia", stats, "vinculo"), Array.from(stats.savedTables));
}

async function saveFinanceiroImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "FINANCEIRO", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const existingKeys = await existingFinanceImportKeys(supabase, owner);

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const type = normalizeDomainFinanceType(values.tipo);
    const value = Number(values.valor || 0);
    if (!type) {
      stats.failed.push({ line: domainLine(row), reason: "tipo financeiro invalido" });
      continue;
    }
    if (!Number.isFinite(value) || value <= 0) {
      stats.failed.push({ line: domainLine(row), reason: "valor invalido" });
      continue;
    }

    const description = domainText(values.descricao || values.pessoa || values.observacoes || "Lancamento importado via WhatsApp");
    const category = domainText(values.categoria || (type === "entrada" ?"Receita" : "Despesa"));
    const date = domainDateOnly(values.data);
    const key = [type, date, value, normalizeCatalogText(`${description}|${category}`)].join("|");
    if (existingKeys.has(key)) {
      stats.skipped += 1;
      continue;
    }

    await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
      fazenda_id: owner.fazenda_id,
      tipo: type,
      data_transacao: date,
      valor: value,
      categoria: category,
      descricao: description,
      metodo_pagamento: domainText(values.forma_pagamento || "whatsapp"),
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    existingKeys.add(key);
    stats.saved += 1;
    stats.savedTables.add(TABLES.transacoesFinanceiras);
  }

  return realSaveResult(domainImportResultMessage("financeiro", stats, "transacao"), Array.from(stats.savedTables));
}

async function saveFuncionariosImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "FUNCIONARIOS", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const { data: employees, error: employeeError } = await supabase
    .from(TABLES.funcionarios)
    .select("id,nome,contato_whatsapp,ativo,deleted_at")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (employeeError) throw new Error(employeeError.message);
  const activeEmployees = ((employees || []) as AnyRecord[]).filter((item) => item.ativo !== false && !item.deleted_at);

  const { data: whatsappRows, error: whatsappError } = await supabase
    .from(TABLES.whatsappUsuarios)
    .select("id,telefone_e164,funcionario_id,nome_exibicao,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (whatsappError) throw new Error(whatsappError.message);
  const whatsappUsers = (whatsappRows || []) as AnyRecord[];

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const name = domainText(values.nome);
    const phone = normalizeWhatsappNumber(values.telefone || values.contato_whatsapp || values.whatsapp);
    const role = domainText(values.cargo || values.funcao || "Funcionario");
    const salary = Number(values.salario ?? values.salario_base ?? 0);
    if (!name) {
      stats.failed.push({ line: domainLine(row), reason: "nome ausente" });
      continue;
    }
    if (!isValidBotPhone(phone)) {
      stats.failed.push({ line: domainLine(row), reason: "WhatsApp invalido" });
      continue;
    }
    const duplicateEmployee = activeEmployees.find((item) => whatsappNumbersMatch(phone, String(item.contato_whatsapp || "")));
    const duplicateWhatsapp = whatsappUsers.find((item) => item.ativo !== false && whatsappNumbersMatch(phone, String(item.telefone_e164 || "")));
    if (duplicateEmployee || duplicateWhatsapp) {
      stats.skipped += 1;
      continue;
    }

    const employee = await insertRealRecord(supabase, owner, TABLES.funcionarios, {
      fazenda_id: owner.fazenda_id,
      nome: name,
      funcao: role || "Funcionario",
      contato_whatsapp: phone,
      salario_base: Number.isFinite(salary) ? salary : 0,
      data_admissao: domainDateOnly(values.data_admissao),
      carga_horaria_mensal: 220,
      valor_hora_extra: 0,
      ativo: domainStatusActive(values.status),
      tipo_acesso: "bot_only",
      papel_sistema: "bot_only"
    }) as AnyRecord;

    const whatsappPayload = {
      fazenda_id: owner.fazenda_id,
      telefone_e164: phone,
      funcionario_id: employee.id,
      usuario_id: null,
      nome_exibicao: name,
      ativo: domainStatusActive(values.status),
      papel: "funcionario",
      papel_bot: "funcionario"
    };
    await insertRealRecord(supabase, owner, TABLES.whatsappUsuarios, whatsappPayload);
    activeEmployees.push(employee);
    whatsappUsers.push(whatsappPayload);
    stats.saved += 1;
    stats.savedTables.add(TABLES.funcionarios);
    stats.savedTables.add(TABLES.whatsappUsuarios);
  }

  return realSaveResult(domainImportResultMessage("funcionarios", stats, "funcionario"), Array.from(stats.savedTables));
}

async function savePontoFuncionarioImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "PONTO_FUNCIONARIO", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const existingKeys = await existingPointImportKeys(supabase, owner);

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const employeeRef = domainText(values.funcionario_ref);
    const employee = await findEmployee(supabase, owner, employeeRef);
    if (!employeeRef || !employee?.row || (!employee.exact && employee.score < 0.86) || employee.ambiguousRows?.length) {
      stats.failed.push({ line: domainLine(row), reason: `funcionario ${employeeRef || "nao informado"} nao encontrado com seguranca` });
      continue;
    }

    const entries = [
      { type: "entrada", time: values.entrada },
      { type: "saida", time: values.saida }
    ].filter((item) => domainTime(item.time));

    if (!entries.length) {
      stats.failed.push({ line: domainLine(row), reason: "entrada ou saida ausente" });
      continue;
    }

    for (const entry of entries) {
      const timestamp = domainDateTime(values.data, entry.time);
      const key = [employee.row.id, entry.type, timestamp].join("|");
      if (existingKeys.has(key)) {
        stats.skipped += 1;
        continue;
      }
      await insertRealRecord(supabase, owner, TABLES.registrosPonto, {
        fazenda_id: owner.fazenda_id,
        funcionario_id: employee.row.id,
        tipo: entry.type,
        registrado_em: timestamp,
        observacao: domainText(values.observacoes || "Importado por tabela via WhatsApp"),
        origem: "whatsapp",
        created_by: owner.usuario_id || null
      });
      existingKeys.add(key);
      stats.saved += 1;
      stats.savedTables.add(TABLES.registrosPonto);
    }
  }

  return realSaveResult(domainImportResultMessage("ponto de funcionarios", stats, "registro"), Array.from(stats.savedTables));
}

async function saveSaudeSanitarioImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "SAUDE_SANITARIO", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const existingKeys = await existingEventImportKeys(supabase, owner);

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const animalRef = domainText(values.animal_ref);
    const animal = await findAnimal(supabase, owner, animalRef);
    if (!animalRef || !animal?.row || (!animal.exact && animal.score < 0.86) || animal.ambiguousRows?.length) {
      stats.failed.push({ line: domainLine(row), reason: `animal ${animalRef || "nao informado"} nao encontrado com seguranca` });
      continue;
    }
    const type = normalizeDomainEventType(values.evento, values.produto);
    const description = [
      domainText(values.evento || "Evento sanitario importado via WhatsApp"),
      values.sintomas ?`sintomas: ${values.sintomas}` : "",
      values.observacoes ?domainText(values.observacoes) : ""
    ].filter(Boolean).join(" | ");
    const date = domainDateOnly(values.data);
    const key = [animal.row.id, type, date, normalizeCatalogText(`${description}|${values.produto || ""}`)].join("|");
    if (existingKeys.has(key)) {
      stats.skipped += 1;
      continue;
    }

    await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
      fazenda_id: owner.fazenda_id,
      animal_id: animal.row.id,
      tipo: type,
      data_evento: domainDateTime(date),
      descricao: description,
      medicamento: domainText(values.produto) || null,
      dose: domainText(values.dose) || null,
      custo: 0,
      responsavel_usuario_id: owner.usuario_id || null
    });
    existingKeys.add(key);
    stats.saved += 1;
    stats.savedTables.add(TABLES.eventosAnimal);
  }

  return realSaveResult(domainImportResultMessage("saude/sanitario", stats, "evento"), Array.from(stats.savedTables));
}

async function saveObservacoesImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const stats: DomainImportSaveStats = { domain: "OBSERVACOES", saved: 0, skipped: 0, failed: [], savedTables: new Set() };
  const existingKeys = await existingEventImportKeys(supabase, owner);

  for (const row of domainImportReadyRows(parsed)) {
    const values = domainRowValues(row);
    const observation = domainText(values.observacao);
    if (!observation) {
      stats.failed.push({ line: domainLine(row), reason: "observacao ausente" });
      continue;
    }

    let animalId: string | null = null;
    const entityRef = domainText(values.entidade_ref);
    if (entityRef) {
      const animal = await findAnimal(supabase, owner, entityRef);
      if (!animal?.row || (!animal.exact && animal.score < 0.86) || animal.ambiguousRows?.length) {
        stats.failed.push({ line: domainLine(row), reason: `animal ${entityRef} nao encontrado com seguranca` });
        continue;
      }
      animalId = String(animal.row.id || "");
    }

    const date = domainDateOnly(values.data);
    const key = [animalId || "", "observacao", date, normalizeCatalogText(observation)].join("|");
    if (existingKeys.has(key)) {
      stats.skipped += 1;
      continue;
    }

    await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
      fazenda_id: owner.fazenda_id,
      animal_id: animalId,
      tipo: "observacao",
      data_evento: domainDateTime(date),
      descricao: observation,
      medicamento: null,
      dose: null,
      custo: 0,
      responsavel_usuario_id: owner.usuario_id || null
    });
    existingKeys.add(key);
    stats.saved += 1;
    stats.savedTables.add(TABLES.eventosAnimal);
  }

  return realSaveResult(domainImportResultMessage("observacoes", stats, "observacao"), Array.from(stats.savedTables));
}

async function saveDomainTableImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage): Promise<SaveResult> {
  const summary = domainTableSummary(parsed);
  const rows = domainImportRows(parsed);
  const ready = domainImportReadyRows(parsed);
  const label = tabularDomainLabel(summary.domain as Parameters<typeof tabularDomainLabel>[0]);

  if (summary.domain === "AGENDA_TAREFAS") {
    return {
      response: `Preview confirmado: tabela de ${label} com ${rows.length} linha(s). Esse dominio ainda nao possui tabela real segura no Rancho, entao nenhum registro foi salvo.`,
      savedReal: false,
      savedTables: []
    };
  }

  if (!ready.length) {
    return {
      response: `Nao encontrei linhas prontas para salvar em ${label}. Nada foi salvo.`,
      savedReal: false,
      savedTables: []
    };
  }

  console.log("[BOT DOMAIN IMPORT SAVE]", {
    domain: summary.domain,
    total: rows.length,
    ready: ready.length,
    review: summary.review,
    invalid: summary.invalid,
    fazenda_id: owner.fazenda_id,
    service: "saveDomainTableImport"
  });

  if (summary.domain === "LOTES") return saveLotesImport(supabase, owner, parsed);
  if (summary.domain === "GENEALOGIA") return saveGenealogiaImport(supabase, owner, parsed);
  if (summary.domain === "FINANCEIRO") return saveFinanceiroImport(supabase, owner, parsed);
  if (summary.domain === "FUNCIONARIOS") return saveFuncionariosImport(supabase, owner, parsed);
  if (summary.domain === "PONTO_FUNCIONARIO") return savePontoFuncionarioImport(supabase, owner, parsed);
  if (summary.domain === "SAUDE_SANITARIO") return saveSaudeSanitarioImport(supabase, owner, parsed);
  if (summary.domain === "OBSERVACOES") return saveObservacoesImport(supabase, owner, parsed);

  return {
    response: `Preview confirmado: tabela de ${label} com ${rows.length} linha(s). Esse dominio ainda nao tem persistencia real especifica no Rancho. Nenhum registro foi salvo.`,
    savedReal: false,
    savedTables: []
  };
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

function catalogEnrichmentDependencies(): CatalogEnrichmentDependencies {
  return {
    botAnimalCheckLog,
    botLog,
    calfCodeFromParto,
    enrichDomainTableImport,
    partoWithChild
  };
}

function saveRecordDependencies(): SaveRecordDependencies {
  return {
    validatePendingForSave,
    saveDomainTableImport,
    logDestructiveBulkBlock,
    tabularImportRows,
    existingAnimalEventKeysForImport,
    importedTableEventKey,
    insertRealRecord,
    isoFromReference,
    importedTableEventDescription,
    realSaveResult,
    animalImportRows,
    listAnimals,
    exactAnimalImportCodeKey,
    findLot,
    enrichTabularAnimalEventImport,
    confirmationText,
    stockImportRows,
    findStockItem,
    stockCategoryFromName,
    validateBatchRecordReady,
    saveMilkStockMovementIfNeeded,
    milkStockAfterSaveText,
    findAnimal,
    pendingWithData,
    botAnimalCheckLog,
    partoWithChild,
    botPartoSaveLog,
    animalSexKind,
    animalLabel,
    calfCodeFromParto,
    isSamePartoChild,
    existingPartoSameDay,
    partoDuplicateConfirmationMessage,
    animalOptionsText,
    calfPayloadFromParto,
    partoChildEventDescription,
    updateMotherPhaseAfterParto,
    safeErrorText,
    genealogyPayloadFromData,
    collectDescendantIds,
    logAudit,
    reproductiveEventDbType,
    reproductiveEventDescription,
    findEmployee,
    formatWhatsappForBot,
    monthStartFromPaymentPeriod,
    dateOnlyFromReference,
    monthRange,
    monthKeyFromDate,
    safeBotPayload,
    nowIso,
    unknownText,
    formatNumber,
    formatMoney,
    formatStockAmount,
    isBotAdmin,
    dateOnly,
    hasBotValue,
    normalizedReproductiveEventKind,
    reproductiveEventLabel,
    botLog,
    stockResolutionDebug,
    stockDecisionReason,
    physicalSaleStockDecisionQuestion,
    refreshRanchoMessage,
    normalizeWhatsappNumber,
    isValidBotPhone
  };
}

async function saveConfirmedRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage): Promise<SaveResult> {
  return saveConfirmedRecordByDomain(saveRecordDependencies(), supabase, owner, pending);
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
    const activeCount = filtered.filter((animal) => !["morto", "vendido", "inativo"].includes(normalizeRanchoText(String(animal.status || "ativo")))).length;
    return [
      `Resumo do rebanho (${label}):`,
      `Total encontrado: ${filtered.length} animal(is).`,
      `Ativos: ${activeCount}.`,
      `Categorias: ${categories || "sem dados"}.`,
      `Status: ${statuses || "sem dados"}.`
    ].join("\n");
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

async function buildAnimalIndividualReport(supabase: SupabaseAdmin, owner: WhatsAppOwner, animal: AnyRecord, reference: string, lot?: AnyRecord | null) {
  return buildAnimalIndividualReportFromModule({ listAnimals }, supabase, owner, animal, reference, lot);
}

function consultationDependencies(): ConsultationDependencies {
  return {
    helpText,
    unknownText,
    saveSession,
    handleHerdConsultation,
    handleLotConsultation,
    handleProductionRankingConsultation,
    handleFinanceConsultation,
    handleStockListConsultation,
    handleEventsReportConsultation,
    handleTodayRecordsConsultation,
    findAnimal,
    findStockItem,
    findEmployee,
    listAnimals,
    listLots,
    buildAnimalIndividualReport,
    collectDescendantIds,
    animalOptionsText,
    animalLabel,
    animalMap,
    animalShortLabel,
    periodRange,
    periodLabel,
    formatNumber,
    formatMoney,
    formatStockAmount,
    formatWhatsappForBot,
    isBotAdmin,
    monthStartFromPaymentPeriod,
    monthRange,
    monthKeyFromDate
  };
}

async function handleConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  return runConsultation(consultationDependencies(), supabase, owner, parsed);
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
    const enriched = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, consultation);
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

function stockCandidateOptionsText(dados: AnyRecord) {
  const candidates = Array.isArray(dados.candidatos_catalogo)
    ? dados.candidatos_catalogo
    : [];
  return candidates
    .map((candidate) => String(candidate || "").trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((candidate) => `- ${candidate}`)
    .join("\n");
}

function stockPendingWithoutResolvedItem(parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  return refreshRanchoMessage(parsed, {
    ...dados,
    item_nome: undefined,
    item_id: null,
    item_resolvido: null,
    item_estoque_encontrado: false
  });
}

async function stockCatalogPreflight(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (!["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(parsed.tipo)) return null;

  const dados = parsed.dados || {};
  const hasItemReference = hasBotValue(dados.item_nome) || hasBotValue(dados.item_extraido);
  if (!hasItemReference) return null;

  const options = stockCandidateOptionsText(dados);
  const isAmbiguous = dados.status_resolucao === "ambiguous";

  if (isAmbiguous && options) {
    const next = stockPendingWithoutResolvedItem(parsed);
    botLog("stock_preflight", owner, {
      currentIntent: parsed.tipo,
      status: "item_ambiguo",
      decision: "pedir_item_correto_antes_da_confirmacao"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return `Encontrei mais de um item parecido no estoque. Me envie o item correto:\n${options}`;
  }

  if (dados.status_resolucao === "suggestion" && dados.item_estoque_encontrado !== true && options) {
    const next = stockPendingWithoutResolvedItem(parsed);
    botLog("stock_preflight", owner, {
      currentIntent: parsed.tipo,
      status: "item_sugerido",
      decision: "pedir_item_correto_antes_da_confirmacao"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return `Encontrei um item parecido no estoque. Me confirme o item correto:\n${options}`;
  }

  if (parsed.tipo === "ESTOQUE_ENTRADA" && dados.compra && !parsed.perguntas_faltantes.length && dados.status_resolucao === "not_found" && isBotAdmin(owner)) {
    botLog("stock_preflight", owner, {
      currentIntent: parsed.tipo,
      status: "item_nao_encontrado",
      decision: "pedir_criar_item_ou_financeiro_antes_da_confirmacao"
    });
    await saveSession(supabase, owner, {
      etapa: "aguardando_dado",
      dados: { pending: parsed, acao_pendente: "compra_item_nao_encontrado" }
    });
    return `Não encontrei "${dados.item_nome || dados.item_extraido || ""}" no estoque. Deseja criar o item de estoque ou registrar apenas como despesa?\n1 - Criar item de estoque\n2 - Registrar apenas despesa`;
  }

  return null;
}

async function handleFreeText(supabase: SupabaseAdmin, owner: WhatsAppOwner, text: string, parsedMessage?: ParsedRanchoMessage) {
  const tableExamples = tabularTableExamplesText(text);
  if (tableExamples) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return tableExamples;
  }

  const baseParsed = parsedMessage || (isGeminiPrimaryMode()
    ? finalize("DESCONHECIDO", {
      origem_parser: "gemini_primary_missing_interpretation",
      interpreter_final_usado: "gemini_primary_missing_interpretation"
    }, [], 0.2)
    : parseRanchoMessage(text));
  const parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, baseParsed);
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
    return composeMissingDataText(parsed);
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
  const stockPreflight = await stockCatalogPreflight(supabase, owner, parsed);
  if (stockPreflight) {
    return stockPreflight;
  }

  if (parsed.perguntas_faltantes.length) {
    botLog("missing_data", owner, {
      pending: parsed,
      status: "aguardando_dado",
      nextStep: "pedir_dado"
    });
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed } });
    return composeMissingDataText(parsed);
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
    return composeMissingDataText(parsed);
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

function correctionIntroForConfirmation(prefix?: string | null) {
  if (!prefix?.trim()) return "Agora entendi:";

  let message = prefix
    .trim()
    .replace(/^(?:agora\s+)?entendi\.?\s*/i, "")
    .replace(/^voce\s+quer\s+/i, "Vou ")
    .replace(/^você\s+quer\s+/i, "Vou ")
    .replace(/^quer\s+corrigir\b/i, "Vou corrigir")
    .replace(/^quer\s+alterar\b/i, "Vou alterar")
    .replace(/^quer\s+trocar\b/i, "Vou trocar")
    .trim();

  if (!message) return "Agora entendi:";
  message = message.replace(/\?+$/g, ".");
  if (!/[.!]$/.test(message)) message += ".";
  return `Agora entendi. ${message}`;
}

async function saveCorrectedPending(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  parsed: ParsedRanchoMessage,
  prefix?: string | null
) {
  const next = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, parsed);
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
  const stockPreflight = await stockCatalogPreflight(supabase, owner, next);
  if (stockPreflight) {
    return { response: [prefix, stockPreflight].filter(Boolean).join("\n"), parsed: next };
  }

  if (next.perguntas_faltantes.length) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return { response: [prefix, composeMissingDataText(next)].filter(Boolean).join("\n"), parsed: next };
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
  const intro = correctionIntroForConfirmation(prefix);
  return { response: [intro, confirmationText(next)].filter(Boolean).join("\n"), parsed: next };
}

async function handleSemanticPendingPatch(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  session: BotSession,
  text: string,
  processingInput?: ProcessWhatsappMessageInput,
  processingPhone?: string
): Promise<ConversationActHandlingResult | null> {
  const pending = pendingFromSession(session);
  if (!pending?.tipo) return null;
  if (!isGeminiPrimaryMode()) return null;
  if (!shouldUsePendingPatchForText(text)) return null;

  const interpretPatch = () => interpretPendingPatchWithGemini({
    text,
    pending,
    status: session.etapa || "livre",
    currentDate: getRanchTodayISO(),
    timezone: "America/Sao_Paulo"
  });
  const patchResult = processingInput
    ? await withProcessingNotice(processingInput, supabase, owner, processingPhone || owner.telefone_e164 || "", "pending_patch_interpreter", interpretPatch)
    : await interpretPatch();

  if (!patchResult.ok) {
    botLog("pending_patch_invalid", owner, {
      reason: patchResult.reason,
      targetIntent: pending.tipo
    });
    return null;
  }

  const patch = patchResult.patch;
  if (patch.confidence < 0.72 || patch.operation === "none") return null;

  botLog("pending_patch_applied", owner, {
    targetIntent: pending.tipo,
    operation: patch.operation || "update",
    status: session.etapa,
    fields: Object.keys(patch.data || {})
  });

  if (patch.operation === "cancel") {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return {
      handled: true,
      parsed: pending,
      suppressPreviousPending: true,
      response: PENDING_ACTION_CANCELLED_MESSAGE
    };
  }

  if (patch.operation === "clarify") {
    return {
      handled: true,
      parsed: pending,
      response: patch.clarificationQuestion || "Entendi que você quer ajustar o registro em aberto, mas preciso de um pouco mais de detalhe."
    };
  }

  if (patch.operation === "finish_optional") {
    const finished = finishMissingFieldsForConfirmation(pending);
    if (finished) {
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: finished } });
      return {
        handled: true,
        parsed: finished,
        response: composeOptionalFieldsFinishedText(finished)
      };
    }
    return {
      handled: true,
      parsed: pending,
      response: composeMissingDataText(pending)
    };
  }

  const patched = applyPendingPatchToSession(pending, patch);
  if (JSON.stringify(patched.dados || {}) === JSON.stringify(pending.dados || {})) return null;
  const result = await saveCorrectedPending(supabase, owner, patched);
  return {
    handled: true,
    parsed: result.parsed,
    response: result.response
  };
}

async function handlePendingActionInterpretation(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  session: BotSession,
  text: string
): Promise<ConversationActHandlingResult | null> {
  if (session.etapa !== "aguardando_confirmacao") return null;
  const pending = pendingFromSession(session);
  if (!pending?.tipo) return null;

  const interpreted = await interpretPendingActionMessageSmart(pending, text);
  if (!interpreted) return null;

  const next = interpreted.operation === "clarify"
    ? interpreted.parsed
    : await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, interpreted.parsed);

  await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
  botLog("pending_action_interpreter_applied", owner, {
    operation: interpreted.operation,
    targetIntent: pending.tipo,
    matchedRows: interpreted.matchedRows,
    rowsAfter: Array.isArray(next.dados?.linhas) ?next.dados.linhas.length : null
  });
  if (next.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    botTabularImportLog("pending_action_interpreter_event_import_updated", owner, {
      ...tabularImportSummary(next),
      partos: next.dados?.resumo_partos || null
    });
  }

  return {
    handled: true,
    parsed: next,
    response: interpreted.operation === "clarify" || interpreted.operation === "answer_question"
      ? interpreted.message
      : `${interpreted.message}\n${confirmationText(next)}`
  };
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

  if (pending && session.etapa === "aguardando_dado" && isFinishOptionalFieldsCommand(command)) {
    const finished = finishMissingFieldsForConfirmation(pending);
    if (finished) {
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: finished } });
      return {
        handled: true,
        parsed: finished,
        response: composeOptionalFieldsFinishedText(finished)
      };
    }

    if (!canFinishMissingFields(pending)) {
      return {
        handled: true,
        parsed: pending,
        response: composeMissingDataText(pending)
      };
    }
  }

  if (pending && session.etapa === "aguardando_confirmacao" && (act.messageType === "new_action" || act.messageType === "clarification")) {
    const semanticPatch = await handleSemanticPendingPatch(supabase, owner, session, text);
    if (semanticPatch?.handled) return semanticPatch;
  }

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
      response: "Não consegui entender essa confirmação porque não tem nenhum registro esperando confirmação. Me envie o registro de novo."
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

  const semanticPatch = await handleSemanticPendingPatch(supabase, owner, session, text);
  if (semanticPatch?.handled) return semanticPatch;

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

async function handleMissingData(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  session: BotSession,
  text: string,
  processingInput?: ProcessWhatsappMessageInput,
  processingPhone?: string
) {
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

    const next = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, parsedTable);
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
      return next.perguntas_faltantes.length ?composeMissingDataText(next) : confirmationText(next);
    }

    if (command === "2" || /\b(?:despesa|financeiro)\b/.test(command)) {
      const financeData = {
        valor: pending.dados.valor,
        descricao: pending.dados.item_nome,
        data_referencia: pending.dados.data_referencia
      };
      const next = refreshRanchoMessage({ ...pending, tipo: "DESPESA", dados: financeData }, financeData);
      await saveSession(supabase, owner, { etapa: next.perguntas_faltantes.length ?"aguardando_dado" : "aguardando_confirmacao", dados: { pending: next } });
      return next.perguntas_faltantes.length ?composeMissingDataText(next) : confirmationText(next);
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

  const semanticPatch = await handleSemanticPendingPatch(supabase, owner, session, text, processingInput, processingPhone);
  if (semanticPatch?.handled) return semanticPatch.response || "";

  const next = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, mergeRanchoMessageData(pending, text));
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
  const stockPreflight = await stockCatalogPreflight(supabase, owner, next);
  if (stockPreflight) {
    return stockPreflight;
  }
  if (next.perguntas_faltantes.length) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return composeMissingDataText(next);
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
    return "Não consegui entender essa confirmação porque não tem nenhum registro esperando confirmação. Me envie o registro de novo.";
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
    const animalPending = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, animalImportPendingFromMissingEventAnimals(pending));
    const denied = permissionDeniedMessage(owner, animalPending);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return denied;
    }
    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: animalPending } });
    return confirmationText(animalPending);
  }

  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const childPatched = applyReproductionImportChildComplement(pending, text);
    if (childPatched) {
      const next = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, childPatched);
      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      botTabularImportLog("birth_child_batch_patch_applied", owner, {
        ...tabularImportSummary(next),
        partos: next.dados?.resumo_partos || null
      });
      return `Atualizei os dados das crias no lote.\n${confirmationText(next)}`;
    }
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
  let pendingToSave = normalizePhysicalSalePending(pending);

  if (shouldCreateMissingLots) {
    pendingToSave = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, refreshRanchoMessage(pending, {
      ...(pending.dados || {}),
      criar_lotes_faltantes: true
    }));
  }

  if (shouldCreateMissingStockItems) {
    pendingToSave = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, refreshRanchoMessage(pending, {
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
      const next = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, mergeRanchoMessageData(pending, correctionText));
      const genealogyBlock = relationBlockMessage(next);
      if (genealogyBlock) {
        await saveSession(supabase, owner, { etapa: "livre", dados: {} });
        return genealogyBlock;
      }
      if (next.perguntas_faltantes.length) {
        await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
        return composeMissingDataText(next);
      }

      await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
      return `Agora entendi:\n${confirmationText(next)}`;
    }

    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Tudo bem. Nada foi salvo. Me mande de novo quando quiser.";
  }

  let replacementPrefix = "";
  let replacement = await (async () => {
    if (!isGeminiPrimaryMode()) return enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, parseRanchoMessage(text));

    const interpreted = await parseWithConfiguredInterpreter({
      text,
      localParsed: finalize("DESCONHECIDO", {
        origem_parser: "gemini_primary_replacement_no_local_parser",
        interpreter_final_usado: "gemini_primary_replacement_no_local_parser"
      }, [], 0.2),
      owner,
      supabase,
      messageType: "new_action",
      hasPendingAction: false
    });

    if (interpreted.kind === "clarify") {
      return finalize("DESCONHECIDO", {
        ...(interpreted.debug || {}),
        interpreter_final_usado: interpreted.reason,
        origem_parser: "gemini_action_plan",
        action_plan_used: false,
        resposta_substituicao_pendente: interpreted.message
      }, [], 0.2);
    }

    if (interpreted.kind === "consultations") {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      replacementPrefix = await handleGeminiConsultationBatch(supabase, owner, interpreted.consultations);
      return finalize("AJUDA", { consulta_executada: true }, [], 0.95);
    }

    if (interpreted.kind === "compound") {
      replacementPrefix = interpreted.immediateConsultations.length
        ?await handleGeminiConsultationBatch(supabase, owner, interpreted.immediateConsultations)
        : "";
      return enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, interpreted.pending);
    }

    return enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, interpreted.parsed);
  })();

  const withReplacementPrefix = (message: string) => [replacementPrefix, message].filter(Boolean).join("\n\n");

  if (replacement.dados?.resposta_substituicao_pendente) {
    return withReplacementPrefix(`${replacement.dados.resposta_substituicao_pendente}\n\nAinda tenho um registro aguardando confirmacao. Responda 1 para confirmar, 2 para corrigir ou cancelar para sair.`);
  }

  if (replacementPrefix && replacement.tipo === "AJUDA" && replacement.dados?.consulta_executada) {
    return replacementPrefix;
  }

  if (!["DESCONHECIDO", "AJUDA"].includes(replacement.tipo) && replacement.confianca >= 0.55) {
    if (CONSULT_INTENTS.has(replacement.tipo)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return withReplacementPrefix(await handleConsultation(supabase, owner, replacement));
    }

    const denied = permissionDeniedMessage(owner, replacement);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return withReplacementPrefix(denied);
    }

    const genealogyBlock = relationBlockMessage(replacement);
    if (genealogyBlock) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return withReplacementPrefix(genealogyBlock);
    }

    const lotPreflight = await lotCreationPreflight(supabase, owner, replacement);
    if (lotPreflight) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return withReplacementPrefix(lotPreflight);
    }
    const animalPreflight = await animalCreationPreflight(supabase, owner, replacement);
    if (animalPreflight) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return withReplacementPrefix(animalPreflight);
    }

    if (replacement.perguntas_faltantes.length) {
      await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: replacement } });
      return withReplacementPrefix(`Certo, deixei esse novo registro no lugar do anterior.\n${composeMissingDataText(replacement)}`);
    }

    await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: replacement } });
    return withReplacementPrefix(`Certo, deixei esse novo registro no lugar do anterior.\n${confirmationText(replacement)}`);
  }

  return "Responda 1 para confirmar ou 2 para corrigir. Se quiser parar, envie cancelar.";
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
  debug?: AnyRecord | null;
}): ProcessWhatsappMessageResult {
  const detected = pendingFromSession(input.nextSession) || input.parsed || (input.suppressPreviousPending ?undefined : pendingFromSession(input.previousSession));
  return {
    respostaTexto: polishBotResponse(input.response),
    intencaoDetectada: detected?.tipo || null,
    confianca: typeof detected?.confianca === "number" ?detected.confianca : null,
    dadosExtraidos: detected?.dados || null,
    estadoAnterior: input.previousSession?.etapa || null,
    estadoNovo: input.nextSession?.etapa || null,
    camposFaltantes: detected?.perguntas_faltantes || [],
    eventoConfirmado: Boolean(input.eventConfirmed),
    erro: input.error || null,
    debug: input.debug || null
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
          body: polishBotResponse(response),
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
    const structuredMessage = sanitizeWhatsappMessageText(originalMessage);
    const structuredDetection = detectStructuredInput(structuredMessage);
    const parserMessage = structuredDetection.isStructured
      ? structuredMessage
      : originalMessage.includes(";") && /[\r\n]/.test(originalMessage) ?originalMessage : message;
    const legacyParserCanDecide = !isGeminiPrimaryMode();
    const localParsedPreview = legacyParserCanDecide
      ? parseRanchoMessage(parserMessage)
      : finalize("DESCONHECIDO", {
        origem_parser: "gemini_primary_no_local_parser_preview",
        interpreter_final_usado: "gemini_primary_no_local_parser_preview"
      }, [], 0.2);
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
    const conversationAct: ConversationAct = tableParsedPreview || structuredDetection.isStructured ?{
      messageType: "new_action",
      intent: tableParsedPreview?.tipo || null,
      confidence: tableParsedPreview?.confianca || 0.9,
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
    const generalConversationText = !structuredDetection.isStructured && !tableParsedPreview
      ? composeGeneralConversationText(command, previousSession)
      : null;
    const pendingActionInterpretation = previousSession.etapa === "aguardando_confirmacao"
      ? await handlePendingActionInterpretation(supabase, owner, previousSession, message)
      : null;

    if (pendingActionInterpretation?.handled) {
      parsed = pendingActionInterpretation.parsed;
      suppressPreviousPending = Boolean(pendingActionInterpretation.suppressPreviousPending);
      eventConfirmed = false;
      response = pendingActionInterpretation.response || "";
    } else if (generalConversationText) {
      parsed = pendingFromSession(previousSession);
      response = generalConversationText;
    } else if (structuredDetection.isStructured && !tableParsedPreview) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      suppressPreviousPending = true;
      const interpreted = await withProcessingNotice(input, supabase, owner!, phone, "structured_interpreter", () => parseWithConfiguredInterpreter({
        text: parserMessage,
        localParsed: localParsedPreview,
        owner: owner!,
        supabase,
        messageType: conversationAct.messageType,
        hasPendingAction: conversationAct.hasPendingAction
      }));
      if (interpreted.kind === "clarify") {
        parsed = finalize("DESCONHECIDO", {
          ...(interpreted.debug || {}),
          interpreter_final_usado: interpreted.reason,
          origem_parser: "gemini_action_plan",
          action_plan_used: false
        }, [], 0.2);
        response = interpreted.message;
      } else if (interpreted.kind === "consultations") {
        parsed = interpreted.consultations[0];
        response = await handleGeminiConsultationBatch(supabase, owner, interpreted.consultations);
      } else if (interpreted.kind === "compound") {
        const immediateText = interpreted.immediateConsultations.length
          ? await handleGeminiConsultationBatch(supabase, owner, interpreted.immediateConsultations)
          : "";
        parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, interpreted.pending);
        const actionText = await handleFreeText(supabase, owner, parserMessage, parsed);
        response = [immediateText, actionText].filter(Boolean).join("\n\n");
      } else {
        parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, interpreted.parsed);
        response = await handleFreeText(supabase, owner, parserMessage, parsed);
      }
    } else if (tableParsedPreview) {
      parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, tableParsedPreview);
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
        response = "Não tem nenhum registro em aberto para repetir. Me envie um novo registro.";
      }
    } else if (previousSession.etapa === "aguardando_confirmacao" && input.modoTeste && !salvarRealNoTeste && isDryRunConfirmationCommand(previousSession, command)) {
      parsed = pendingFromSession(previousSession);
      if (parsed?.tipo === "IMPORTACAO_ANIMAIS_TABELA" && animalImportSummary(parsed).missingLots && isTabularCreateLotsAndRegisterCommand(command)) {
        parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, refreshRanchoMessage(parsed, {
          ...(parsed.dados || {}),
          criar_lotes_faltantes: true
        }));
      }
      if (parsed?.tipo === "IMPORTACAO_ESTOQUE_TABELA" && stockImportSummary(parsed).missingItems && isTabularCreateStockItemsCommand(command)) {
        parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, refreshRanchoMessage(parsed, {
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
        response = await handleMissingData(supabase, owner, previousSession, message, input, phone);
      }
    } else {
      const handled = await handleConversationActMessage(supabase, owner, previousSession, message, conversationAct);
      if (handled.handled) {
        parsed = handled.parsed;
        suppressPreviousPending = Boolean(handled.suppressPreviousPending);
        response = handled.response || "";
      } else {
        const localParsed = localParsedPreview;
        const fallback = await withProcessingNotice(input, supabase, owner!, phone, "action_plan_interpreter", () => parseWithConfiguredInterpreter({
          text: parserMessage,
          localParsed,
          owner: owner!,
          supabase,
          messageType: conversationAct.messageType,
          hasPendingAction: conversationAct.hasPendingAction
        }));

        if (fallback.kind === "clarify") {
          await saveSession(supabase, owner, { etapa: "livre", dados: {} });
          parsed = finalize("DESCONHECIDO", {
            ...(fallback.debug || {}),
            interpreter_final_usado: fallback.reason,
            origem_parser: "gemini_action_plan",
            action_plan_used: false
          }, [], 0.2);
          response = fallback.message;
        } else if (fallback.kind === "consultations") {
          parsed = fallback.consultations[0];
          await saveSession(supabase, owner, { etapa: "livre", dados: {} });
          response = await handleGeminiConsultationBatch(supabase, owner, fallback.consultations);
        } else if (fallback.kind === "compound") {
          const immediateText = fallback.immediateConsultations.length
            ?await handleGeminiConsultationBatch(supabase, owner, fallback.immediateConsultations)
            : "";
          parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, fallback.pending);
          const actionText = await handleFreeText(supabase, owner, parserMessage, parsed);
          response = [immediateText, actionText].filter(Boolean).join("\n\n");
        } else {
          parsed = await enrichWithCatalog(catalogEnrichmentDependencies(), supabase, owner, fallback.parsed);
          response = await handleFreeText(supabase, owner, parserMessage, parsed);
        }
      }
    }
    }

    nextSession = await getSession(supabase, owner);
    const composedResponse = await composeBotResponseWithAI({
      response,
      userMessage: message,
      parsed,
      previousSession,
      nextSession,
      eventConfirmed,
      modoTeste: input.modoTeste
    });
    response = composedResponse.response;

    if (!input.modoTeste) {
      await saveWhatsAppMessage(supabase, {
        owner,
        phone,
        messageSid: input.messageSid,
        direction: "saida",
        body: polishBotResponse(response),
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
        body: polishBotResponse(response),
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
