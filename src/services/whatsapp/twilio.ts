import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { normalizeWhatsappNumber, whatsappNumbersMatch } from "@/lib/phone";
import { animalBlockedMessage, animalDeathDate, animalStatusValue, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import { normalizeCatalogText, resolveAnimalIdentifier, resolveStockItem } from "@/lib/whatsapp/catalog";
import { resolveWhatsAppOwner, type WhatsAppOwner } from "@/services/whatsapp/identity";
import {
  BOT_EXAMPLES,
  formatStockUnit,
  mergeRanchoMessageData,
  normalizeRanchoText,
  parseRanchoMessage,
  refreshRanchoMessage,
  type ParsedRanchoMessage
} from "@/lib/whatsapp/nlp";

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

const CONFIRM_WORDS = new Set(["sim", "s", "ss", "confirmar", "confirma", "confirmado", "correto", "ok", "okay", "blz", "beleza", "pode", "pode salvar", "pode registrar", "pode lancar", "salvar", "salva", "registrar", "registra", "lancar", "lanca", "isso", "isso mesmo", "certo", "ta certo", "fechou", "show", "joia", "manda", "vai", "pode sim", "e isso", "1"]);
const REJECT_WORDS = new Set(["nao", "n", "errado", "corrigir", "corrige", "nao e isso", "refazer", "refaz", "incorreto", "negativo", "na verdade", "2"]);
const CANCEL_WORDS = new Set(["cancelar", "cancela", "sair", "para", "parar", "pare", "deixa", "esquece", "nao salva", "nao salvar", "nao registrar", "apaga isso"]);
const MENU_WORDS = new Set(["menu", "inicio", "ajuda", "voltar"]);
const REPEAT_WORDS = new Set(["repete", "repetir", "repita", "mostra de novo", "mostrar de novo", "resumo", "resumir"]);
const STOCK_PAGINATION_WORDS = new Set(["mais", "ver mais", "proximos", "proximo", "continuar", "continua"]);
const STOCK_PAGE_SIZE = 8;
const FINANCE_PAGE_SIZE = 5;
const CONSULT_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
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
  "EXCLUIR_FUNCIONARIO"
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

function periodRange(period?: string) {
  if (period === "semana") return currentWeekRange();
  if (period === "mes") return currentMonthRange();
  if (/^\d{4}-\d{2}$/.test(String(period || ""))) return monthRange(String(period));
  return dayRange(period);
}

function periodLabel(period?: string) {
  if (period === "semana") return "esta semana";
  if (period === "mes") return "este mês";
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

function formatStockAmount(quantity: number | string | null | undefined, unit: string | null | undefined) {
  return `${formatNumber(quantity)} ${formatStockUnit(quantity, unit)}`.trim();
}

function maskPhone(value: string) {
  return value.length > 4 ?`***${value.slice(-4)}` : "***";
}

function isBotAdmin(owner: WhatsAppOwner) {
  return owner.papel_bot === "admin";
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
  return CONFIRM_WORDS.has(command) || /\b(?:sim|ss|confirma(?:r|do)?|correto|pode salvar|pode registrar|pode lancar|pode|salvar|salva|registrar|registra|lancar|lanca|ok|okay|blz|beleza|certo|ta certo|isso|isso mesmo|fechou|show|joia|manda|vai)\b/.test(command);
}

function isRejectCommand(command: string) {
  return REJECT_WORDS.has(command) || /^(?:nao|n|errado|corrigir|corrige|quero corrigir|refazer|refaz|incorreto|negativo|na verdade|foi|era)\b/.test(command) || /\berrad[ao]\b/.test(command);
}

function isCancelCommand(command: string) {
  return CANCEL_WORDS.has(command) || /^(?:cancelar|cancela|cancela essa|esquece|deixa(?: pra la| para la)?|pare|para|apaga isso|nao salva|nao salvar|nao registrar)\b/.test(command);
}

function isMenuCommand(command: string) {
  return MENU_WORDS.has(command);
}

function isRepeatCommand(command: string) {
  return REPEAT_WORDS.has(command) || /^(?:repete|repetir|repita|mostra(?:r)? de novo|resumo|resumir)\b/.test(command);
}

function isStockPaginationCommand(command: string) {
  return STOCK_PAGINATION_WORDS.has(command) || /^(?:mais|ver mais|proximos?|continuar|continua)\b/.test(command);
}

function milkStockStatusText(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const stock = dados.estoque_leite as AnyRecord | undefined;
  if (!stock || !dados.estoque_leite_detectado) return "";

  const total = formatNumber(Number(stock.total_litros || dados.total_litros || 0), " L");
  const destino = stock.destino_detectado ?`\nDestino detectado: ${stock.destino_detectado}.` : "";

  if (stock.status_resolucao === "matched") {
    return `\n\nEstoque de leite detectado: ${total}.${destino}\nItem compatível: ${stock.item_leite_resolvido} (${stock.unidade || "unidade não informada"}).\nA entrada no estoque ficará pendente; vou registrar apenas a produção.`;
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
    return `\nEstoque de leite: item compatível identificado (${stock.item_leite_resolvido}), mas nenhuma entrada de estoque foi movimentada automaticamente.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    return "\nEstoque de leite: encontrei múltiplos itens compatíveis e não movimentei estoque automaticamente.";
  }

  return "\nNão encontrei item de estoque compatível com leite. Registrei apenas a produção.";
}

function confirmationText(parsed: ParsedRanchoMessage) {
  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(parsed.dados?.registros) ?parsed.dados.registros as ParsedRanchoMessage[] : [];
    const lines = registros
      .slice(0, 6)
      .map((registro, index) => `${index + 1}. ${registro.resumo}`)
      .join("\n");
    const extra = registros.length > 6 ?`\n...e mais ${registros.length - 6} registro(s).` : "";
    return `Entendi ${registros.length} registros:\n${lines}${extra}${milkStockStatusText(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
  }

  return `Entendi que você quer ${parsed.resumo}.\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
}

function dryRunConfirmationText(parsed?: ParsedRanchoMessage) {
  if (!parsed) return "Confirmação recebida no modo teste. Nenhum registro real foi salvo.";

  if (parsed.tipo === "LOTE_REGISTROS") {
    const total = Number(parsed.dados?.total_registros || (Array.isArray(parsed.dados?.registros) ?parsed.dados.registros.length : 0));
    const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
    const stockDebug = stock
      ? `\nDebug estoque leite:\n- total_litros: ${stock.total_litros ?? parsed.dados?.total_litros ?? null}\n- destino_detectado: ${stock.destino_detectado || "nenhum"}\n- item_leite_resolvido: ${stock.item_leite_resolvido || "nenhum"}\n- item_id: ${stock.item_id || "nenhum"}\n- origem: ${stock.origem || "desconhecida"}\n- estoque_movimentar: ${stock.estoque_movimentar ? "sim" : "nao"}`
      : "";
    return `Simulação concluída: ${total} registros seriam salvos. Nenhum registro real foi salvo.${stockDebug}`;
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
    PONTO_FUNCIONARIO: "registro de ponto",
    CADASTRO_ANIMAL: "cadastro de animal",
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
    CONSULTA_PONTO: "consulta de ponto",
    CONSULTA_REGISTROS_HOJE: "consulta de registros",
    ORDEM_SERVICO: "ordem de serviço",
    LOTE_REGISTROS: "registros em lote",
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

  if (error) console.error("[Twilio webhook] Falha ao salvar mensagem", error.message);
}

async function getSession(supabase: SupabaseAdmin, owner: WhatsAppOwner): Promise<BotSession> {
  const { data, error } = await supabase
    .from(TABLES.whatsappSessoes)
    .select("etapa,dados,status,expira_em")
    .eq("telefone_e164", owner.telefone_e164)
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
      message: error.message
    });
  }
}

async function insertRealRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, table: string, payload: AnyRecord) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  await logAudit(supabase, owner, table, "insert", data || payload);
  await createBotNotificationForInsert(supabase, owner, table, (data || payload) as AnyRecord);
  return data;
}

function realSaveResult(response: string, savedTables: string[]): SaveResult {
  return { response, savedReal: true, savedTables };
}

function matchKey(value: unknown) {
  return normalizeRanchoText(String(value || "")).replace(/[^a-z0-9]/g, "");
}

function numericKey(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ?digits.replace(/^0+/, "") || "0" : "";
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

function lotLabel(lot?: AnyRecord | null) {
  if (!lot) return "Sem lote";
  return String(lot.nome || lot.descricao || lot.id || "Lote");
}

function animalStatusLabel(animal: AnyRecord) {
  return animalStatusValue(animal) || String(animal.status || "ativo");
}

function animalListLine(animal: AnyRecord, lotById: Map<string, AnyRecord>, index: number) {
  const lot = animal.lote_id ?lotById.get(String(animal.lote_id)) : null;
  const details = [
    animal.categoria || "animal",
    animal.sexo || "",
    animalStatusLabel(animal),
    lotLabel(lot)
  ].filter(Boolean).join(" | ");
  return `${index + 1}. ${animalLabel(animal)} - ${details}`;
}

function filterLabel(dados: AnyRecord, lotName?: string) {
  const labels = [
    dados.categoria ?String(dados.categoria) : "animais",
    dados.sexo && dados.sexo !== "nao_informado" ?`sexo ${dados.sexo}` : "",
    dados.sexo === "nao_informado" ?"sem sexo informado" : "",
    dados.status ?`status ${dados.status}` : "",
    dados.sem_lote ?"sem lote" : "",
    lotName ?`no lote ${lotName}` : ""
  ].filter(Boolean);
  return labels.join(", ");
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
  const options = (rows || []).slice(0, 5).map((row) => `- ${animalLabel(row)}`).join("\n");
  return options || "- Nenhuma opção segura encontrada";
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
  return String(parsed.dados?.genealogia_bloqueio || "").trim() || null;
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

async function resolveMilkStockItem(supabase: SupabaseAdmin, owner: WhatsAppOwner): Promise<MilkStockResolution> {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);

  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  const compatibleRows = activeRows.filter((row) => isMilkStockName(row.nome) && isMilkStockUnit(row.unidade_medida));

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
    estoque_movimentar: false,
    acao_pendente_estoque: resolution.status === "matched",
    todo_salvar_estoque: resolution.status === "matched"
      ?"TODO: salvar entrada consolidada de leite usando service server-side seguro de estoque."
      : null
  };
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

async function enrichWithCatalog(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  let changed = false;

  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros as ParsedRanchoMessage[] : [];
    const enrichedRegistros: ParsedRanchoMessage[] = [];

    for (const registro of registros) {
      enrichedRegistros.push(await enrichWithCatalog(supabase, owner, registro));
    }

    const productionRecords = enrichedRegistros.filter((registro) => registro.tipo === "PRODUCAO_LEITE");
    const totalLitros = productionRecords.reduce((sum, registro) => sum + Number(registro.dados?.litros || 0), 0);

    dados.registros = enrichedRegistros;
    dados.total_registros = enrichedRegistros.length;
    dados.tipos = Array.from(new Set(enrichedRegistros.map((registro) => registro.tipo)));

    if (productionRecords.length > 1 && totalLitros > 0) {
      const resolution = await resolveMilkStockItem(supabase, owner);
      const destinoDetectado = dados.tanque ?"tanque" : "producao_leite";
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
      dados.estoque_leite_movimentar = false;
    }

    return refreshRanchoMessage(parsed, dados);
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
  }

  return changed ?refreshRanchoMessage(parsed, dados) : parsed;
}

async function saveConfirmedRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage): Promise<SaveResult> {
  const dados = pending.dados || {};

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

    return realSaveResult(`Pronto, ${registros.length} registros salvos com sucesso.\n${summaries.join("\n")}${milkStockAfterSaveText(pending)}`, Array.from(savedTables));
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
      await insertRealRecord(supabase, owner, TABLES.ordenhas, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        litros: Number(dados.litros),
        ordenhado_em: isoFromReference(dados.data_referencia),
        turno: dados.turno || "manha",
        destino: "tanque",
        origem: "whatsapp",
        registrado_por: owner.usuario_id || null,
        observacoes: `Registrado via WhatsApp (${owner.telefone_e164})`
      });
      return realSaveResult(`Pronto, registro salvo com sucesso.\nProdução: ${animal.brinco}, ${formatNumber(dados.litros, " L")}.`, [TABLES.ordenhas]);
    }

    if (pending.tipo === "PARTO") {
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
    await insertRealRecord(supabase, owner, TABLES.animais, {
      fazenda_id: owner.fazenda_id,
      brinco: dados.animal_codigo,
      nome: dados.nome || null,
      categoria: dados.categoria || "outro",
      sexo: dados.sexo || "nao_informado",
      fase: dados.fase || "nao_aplicavel",
      raca: dados.raca || null,
      lote_id: dados.lote_id || null,
      data_nascimento: dados.data_nascimento || null,
      status: "ativo",
      created_by: owner.usuario_id || null,
      observacoes: "Cadastrado via WhatsApp"
    });
    const details = [
      dados.nome ?`Nome: ${dados.nome}.` : "",
      `Brinco: ${dados.animal_codigo}.`,
      dados.sexo ?`Sexo: ${dados.sexo}.` : "",
      dados.fase ?`Fase: ${dados.fase}.` : "",
      dados.raca ?`Raça: ${dados.raca}.` : "",
      dados.lote_nome ?`Lote: ${dados.lote_nome}.` : "",
      dados.data_nascimento ?`Nascimento: ${dados.data_nascimento}.` : ""
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
      ativo: true,
      created_by: owner.usuario_id || null
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
    const requiresPhone = Boolean(dados.telefone_obrigatorio || dados.tipo_acesso === "bot_only");
    if (requiresPhone && !isValidBotPhone(phone)) {
      return {
        response: "Informe um WhatsApp válido para o funcionário.",
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { telefone: undefined }) } }
      };
    }

    const { data: employees, error: employeesError } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,contato_whatsapp,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (employeesError) throw new Error(employeesError.message);

    if (phone) {
      const duplicateEmployee = ((employees || []) as AnyRecord[]).find((row) => (
        row.ativo !== false && !row.deleted_at && whatsappNumbersMatch(phone, String(row.contato_whatsapp || ""))
      ));
      if (duplicateEmployee) {
        return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está vinculado ao funcionário ${duplicateEmployee.nome}.` };
      }
    }

    let whatsappRows: AnyRecord[] = [];
    if (phone) {
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
      cpf: dados.cpf || null,
      contato_whatsapp: phone || null,
      salario_base: Number(dados.salario_base || 0),
      data_admissao: dateOnly(),
      carga_horaria_mensal: 220,
      valor_hora_extra: 0,
      tipo_acesso: dados.tipo_acesso || "bot_only",
      papel_sistema: "bot_only",
      ativo: true
    });

    const savedTables: string[] = [TABLES.funcionarios];
    if (phone) {
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

    const phoneText = phone ?formatWhatsappForBot(phone) : "sem WhatsApp vinculado";
    return realSaveResult(`Pronto, funcionário cadastrado com sucesso.\n${dados.funcionario_nome}: ${phoneText}.`, savedTables);
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
    if (!foundLot?.row) return `Não encontrei o lote "${dados.lote_nome}".`;
    lotFilter = foundLot.row;
  }

  const animals = await listAnimals(supabase, owner);
  const filtered = animals.filter((animal) => {
    if (dados.categoria && normalizeRanchoText(animal.categoria || "") !== normalizeRanchoText(String(dados.categoria))) return false;
    if (dados.sexo && normalizeRanchoText(animal.sexo || "nao_informado") !== normalizeRanchoText(String(dados.sexo))) return false;
    if (dados.status && normalizeRanchoText(animalStatusLabel(animal)) !== normalizeRanchoText(String(dados.status))) return false;
    if (dados.sem_lote && animal.lote_id) return false;
    if (lotFilter && String(animal.lote_id || "") !== String(lotFilter.id || "")) return false;
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
      lote_id: lotFilter?.id || null,
      lote_nome: lotFilter ?lotLabel(lotFilter) : null,
      sem_lote: Boolean(dados.sem_lote)
    },
    status: statusCounts,
    categorias: categoryCounts
  };

  if (!filtered.length) return `Não encontrei ${label} cadastrados.`;

  const mode = String(dados.modo || "lista");
  if (mode === "contagem") {
    return `Encontrei ${filtered.length} ${label} cadastrados.`;
  }

  if (mode === "resumo") {
    const categories = Object.entries(categoryCounts).map(([key, value]) => `${key}: ${value}`).join(", ");
    const statuses = Object.entries(statusCounts).map(([key, value]) => `${key}: ${value}`).join(", ");
    return `Resumo do rebanho (${label}): ${filtered.length} animais.\nCategorias: ${categories || "sem dados"}.\nStatus: ${statuses || "sem dados"}.`;
  }

  const page = paginateRows(filtered, dados.pagina);
  const lines = page.rows.map((animal, index) => animalListLine(animal, lotById, page.start + index)).join("\n");
  const pageText = page.end < filtered.length
    ?`\nMostrando ${page.start + 1}-${page.end} de ${filtered.length}. Para continuar, peça "pagina ${Math.min(page.currentPage + 1, page.totalPages)} do rebanho".`
    : "";
  return `Encontrei ${filtered.length} ${label} cadastrados:\n${lines}${pageText}`;
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

  if (!lots.length) return "Não há lotes cadastrados nesse rancho.";

  const page = paginateRows(lots, dados.pagina, 10);
  const lines = page.rows.map((lot) => `- ${lotLabel(lot)}: ${countsByLot[String(lot.id)] || 0} animais`).join("\n");
  const semLoteText = countsByLot[""] ?`\nSem lote: ${countsByLot[""]} animais.` : "";
  const pageText = page.end < lots.length
    ?`\nMostrando ${page.start + 1}-${page.end} de ${lots.length}. Para continuar, peça "pagina ${Math.min(page.currentPage + 1, page.totalPages)} dos lotes".`
    : "";
  return `Você tem ${lots.length} lotes cadastrados:\n${lines}${semLoteText}${pageText}`;
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
  if (type === "entrada") return `${header}\nTotal: ${formatMoney(totals.entrada)}\nRegistros: ${rows.length}`;
  if (type === "saida") return `${header}\nTotal: ${formatMoney(totals.saida)}\nRegistros: ${rows.length}`;
  return `${header}\nEntradas: ${formatMoney(totals.entrada)}\nSaídas: ${formatMoney(totals.saida)}\nResultado: ${formatMoney(totals.resultado)}\nRegistros: ${rows.length}`;
}

function buildFinanceListText(rows: AnyRecord[], period: string, offset: number, pageSize: number, type?: string, filter?: string) {
  const total = rows.length;
  if (!total) {
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

async function handleConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (parsed.tipo === "AJUDA") return helpText();

  if (parsed.tipo === "CONSULTA_REBANHO") {
    return handleHerdConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_LOTES") {
    return handleLotConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_ANIMAL") {
    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return `Não encontrei o animal "${animalReference || "informado"}" no cadastro.`;
    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row) => row.brinco || row.nome).filter(Boolean).join(", ");
      return `Encontrei mais de um animal parecido. Tente pelo brinco cadastrado. Opções: ${options}.`;
    }

    const animal = found.row;
    const lots = await listLots(supabase, owner);
    const lot = animal.lote_id ?lots.find((row) => String(row.id || "") === String(animal.lote_id)) : null;
    const details = [
      `Animal ${animal.brinco || animal.nome || animalReference}`,
      animal.nome && animal.nome !== animal.brinco ?`Nome: ${animal.nome}` : "",
      animal.categoria ?`Categoria: ${animal.categoria}` : "",
      animal.fase ?`Fase: ${animal.fase}` : "",
      animal.status ?`Status: ${animal.status}` : "",
      animal.raca ?`Raça: ${animal.raca}` : "",
      `Lote: ${lotLabel(lot)}`,
      animal.data_nascimento ?`Nascimento: ${animal.data_nascimento}` : "",
      animal.peso !== undefined && animal.peso !== null && animal.peso !== "" ?`Peso: ${formatNumber(animal.peso, " kg")}` : ""
    ].filter(Boolean);
    return details.join("\n");
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
    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const range = periodRange(period);
    const { data, error } = await supabase
      .from(TABLES.ordenhas)
      .select("litros")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("ordenhado_em", range.start)
      .lt("ordenhado_em", range.end);
    if (error) throw new Error(error.message);
    const total = (data || []).reduce((sum, row) => sum + Number(row.litros || 0), 0);
    const count = (data || []).length;
    parsed.dados.consulta_executada = "producao";
    parsed.dados.resultado = { total_litros: total, registros: count, periodo: period };
    if (!count) return `Ainda não há produção de leite registrada ${periodLabel(period)}.`;
    return `${period === "hoje" ?"Hoje" : periodLabel(period)} foram registrados ${formatNumber(total)} litros de leite em ${count} ${count === 1 ?"registro" : "registros"}.`;
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
    const range = dayRange("hoje");
    const { data, error } = await supabase
      .from(TABLES.auditoriaLogs)
      .select("entidade,acao,depois,created_at")
      .eq("fazenda_id", owner.fazenda_id)
      .eq("usuario_id", owner.usuario_id || "")
      .gte("created_at", range.start)
      .lt("created_at", range.end)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) throw new Error(error.message);
    const logs = (data || []) as AnyRecord[];
    parsed.dados.consulta_executada = "registros_hoje";
    parsed.dados.resultado = { registros: logs.length };
    if (!logs.length) return "Você ainda não registrou nada hoje pelo WhatsApp.";

    const lines = logs.map((log, index) => {
      const payload = (log.depois || {}) as AnyRecord;
      if (log.entidade === TABLES.ordenhas) return `${index + 1}. Produção: ${payload.animal_codigo || payload.animal_id || "animal"}, ${formatNumber(payload.litros)} litros`;
      if (log.entidade === TABLES.estoqueMovimentacoes) return `${index + 1}. Estoque: ${payload.tipo || log.acao} de ${formatStockAmount(payload.quantidade, payload.unidade_medida || payload.unidade)} ${payload.item_nome || ""}`.trim();
      if (log.entidade === TABLES.transacoesFinanceiras) return `${index + 1}. Financeiro: ${payload.tipo || "lançamento"} de ${formatMoney(payload.valor)}${payload.descricao ?` com ${payload.descricao}` : ""}`;
      return `${index + 1}. ${log.entidade || "Registro"}: ${log.acao || "salvo"}`;
    }).join("\n");

    return `Hoje você registrou ${logs.length} ${logs.length === 1 ?"lançamento" : "lançamentos"} pelo WhatsApp:\n${lines}`;
  }

  return unknownText();
}
async function handleFreeText(supabase: SupabaseAdmin, owner: WhatsAppOwner, text: string, parsedMessage?: ParsedRanchoMessage) {
  const parsed = await enrichWithCatalog(supabase, owner, parsedMessage || parseRanchoMessage(text));
  botLog("nlp_general", owner, {
    currentIntent: parsed.tipo,
    status: "livre",
    missingFields: parsed.perguntas_faltantes,
    parser: "nlp_geral"
  });

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

  const lotPreflight = await lotCreationPreflight(supabase, owner, parsed);
  if (lotPreflight) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return lotPreflight;
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
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: parsed } });
    return missingText(parsed);
  }

  await saveSession(supabase, owner, { etapa: "livre", dados: {} });
  return unknownText();
}

async function handleMissingData(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession, text: string) {
  const pending = session.dados?.pending as ParsedRanchoMessage | undefined;
  if (!pending?.tipo) return handleFreeText(supabase, owner, text);

  if (session.dados?.acao_pendente === "compra_item_nao_encontrado") {
    const command = normalizeRanchoText(text);
    if (command === "1" || /\b(?:criar|item|estoque)\b/.test(command)) {
      const createData = {
        item_nome: pending.dados.item_nome,
        unidade: pending.dados.unidade,
        quantidade: 0
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
  if (next.perguntas_faltantes.length) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return missingText(next);
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

  if (isConfirmCommand(command)) {
    const denied = permissionDeniedMessage(owner, pending);
    if (denied) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      return denied;
    }

    botLog("confirmation", owner, {
      pending,
      status: "aguardando_confirmacao",
      nextStep: "salvar"
    });
    const result = await saveConfirmedRecord(supabase, owner, pending);
    await saveSession(supabase, owner, result.nextSession || { etapa: "livre", dados: result.sessionData || {} });

    if (options.modoTesteSalvarReal && result.savedReal) {
      console.log("[BOT TEST REAL SAVE]", {
        tipo_registro: pending.tipo,
        service: "saveConfirmedRecord",
        tabelas: result.savedTables || [],
        fazenda_id: owner.fazenda_id,
        whatsapp_usuario_id: owner.whatsapp_usuario_id,
        funcionario_id: owner.funcionario_id
      });
      return `Registro salvo no sistema com sucesso.\n${result.response}`;
    }

    return result.response;
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

function buildProcessResult(input: {
  response: string;
  parsed?: ParsedRanchoMessage;
  previousSession?: BotSession | null;
  nextSession?: BotSession | null;
  eventConfirmed?: boolean;
  error?: string | null;
}): ProcessWhatsappMessageResult {
  const detected = pendingFromSession(input.nextSession) || input.parsed || pendingFromSession(input.previousSession);
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
  const salvarRealNoTeste = Boolean(input.modoTeste && input.salvarReal);
  let owner: WhatsAppOwner | null = null;
  let previousSession: BotSession | null = null;
  let nextSession: BotSession | null = null;
  let parsed: ParsedRanchoMessage | undefined;
  let response = "";
  let eventConfirmed = false;

  try {
    const resolvedOwner = await resolveWhatsAppOwner(supabase, input.telefone);
    owner = resolvedOwner.owner;

    if (!input.modoTeste) {
      await saveWhatsAppMessage(supabase, {
        owner,
        phone,
        messageSid: input.messageSid,
        direction: "entrada",
        body: input.mensagem,
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

    const command = normalizeRanchoText(input.mensagem);
    previousSession = await getSession(supabase, owner);

    if (isMenuCommand(command)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = helpText();
    } else if (isCancelCommand(command)) {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = "Cancelado. Nada foi salvo. Envie um novo registro quando quiser.";
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
    } else if (previousSession.etapa === "aguardando_confirmacao" && input.modoTeste && !salvarRealNoTeste && isConfirmCommand(command)) {
      parsed = pendingFromSession(previousSession);
      const denied = permissionDeniedMessage(owner, parsed);
      if (denied) {
        eventConfirmed = false;
        await saveSession(supabase, owner, { etapa: "livre", dados: {} });
        response = denied;
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
      }
    } else if (previousSession.etapa === "aguardando_confirmacao") {
      parsed = pendingFromSession(previousSession);
      eventConfirmed = isConfirmCommand(command);
      response = await handleConfirmation(supabase, owner, previousSession, input.mensagem, command, {
        modoTesteSalvarReal: salvarRealNoTeste
      });
    } else if (previousSession.etapa === "aguardando_dado") {
      response = await handleMissingData(supabase, owner, previousSession, input.mensagem);
    } else {
      parsed = await enrichWithCatalog(supabase, owner, parseRanchoMessage(input.mensagem));
      response = await handleFreeText(supabase, owner, input.mensagem, parsed);
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
      eventConfirmed
    });
  } catch (error) {
    const message = error instanceof Error ?error.message : "Erro interno no Rancho.";
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
      error: message
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
