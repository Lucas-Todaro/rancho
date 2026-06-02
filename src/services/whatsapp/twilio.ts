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

const CONFIRM_WORDS = new Set(["sim", "s", "confirmar", "confirma", "correto", "ok", "pode", "pode salvar", "isso", "certo", "1"]);
const REJECT_WORDS = new Set(["nao", "n", "errado", "corrigir", "nao e isso", "refazer", "2"]);
const CANCEL_WORDS = new Set(["cancelar", "cancela", "sair", "para", "parar", "deixa"]);
const MENU_WORDS = new Set(["menu", "inicio", "ajuda", "voltar"]);
const CONSULT_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["CONSULTA_PRODUCAO", "CONSULTA_FINANCEIRO", "CONSULTA_ESTOQUE", "CONSULTA_FUNCIONARIO", "AJUDA"]);
const ANIMAL_RECORD_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE"]);

function nowIso() {
  return new Date().toISOString();
}

function expirationIso() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function dateFromReference(reference?: string) {
  const date = new Date();
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
  return value.length > 4 ? `***${value.slice(-4)}` : "***";
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
    score: typeof found?.score === "number" ? Number(found.score.toFixed(3)) : 0,
    motivo_nao_resolvido: found?.row ? null : found?.reason || "item_nao_encontrado"
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
    motivo_bloqueio: canRegister ? null : "animal_morto_ou_inativo"
  });
}

function animalBlockFromParsed(parsed: ParsedRanchoMessage) {
  const animal = parsed.dados?.animal_resolvido as AnyRecord | undefined;
  if (!animal || !isAnimalInactiveForBot(animal)) return null;
  return animalBlockedMessage(animal, parsed.tipo);
}

function isConfirmCommand(command: string) {
  return CONFIRM_WORDS.has(command) || /\b(?:sim|confirma|confirmar|correto|pode salvar|pode|ok|certo|isso)\b/.test(command);
}

function isRejectCommand(command: string) {
  return REJECT_WORDS.has(command) || /^(?:nao|n|errado|corrigir|refazer)\b/.test(command);
}

function isCancelCommand(command: string) {
  return CANCEL_WORDS.has(command);
}

function isMenuCommand(command: string) {
  return MENU_WORDS.has(command);
}

function milkStockStatusText(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const stock = dados.estoque_leite as AnyRecord | undefined;
  if (!stock || !dados.estoque_leite_detectado) return "";

  const total = formatNumber(Number(stock.total_litros || dados.total_litros || 0), " L");
  const destino = stock.destino_detectado ? `\nDestino detectado: ${stock.destino_detectado}.` : "";

  if (stock.status_resolucao === "matched") {
    return `\n\nEstoque de leite detectado: ${total}.${destino}\nItem compatÃ­vel: ${stock.item_leite_resolvido} (${stock.unidade || "unidade nÃ£o informada"}).\nA entrada no estoque ficarÃ¡ pendente; vou registrar apenas a produÃ§Ã£o.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    const options = Array.isArray(stock.opcoes) ? stock.opcoes as AnyRecord[] : [];
    const lines = options.slice(0, 5).map((option, index) => `${index + 1}. ${option.nome} (${option.unidade || "unidade nÃ£o informada"})`).join("\n");
    return `\n\nEncontrei mais de um item de estoque compatÃ­vel com leite (${total}).${destino}\n${lines}\nNÃ£o vou movimentar estoque automaticamente; vou registrar apenas a produÃ§Ã£o.`;
  }

  return `\n\nNÃ£o encontrei item de estoque compatÃ­vel com leite (${total}).${destino}\nVou registrar apenas a produÃ§Ã£o.`;
}

function milkStockAfterSaveText(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  if (!stock) return "";

  if (stock.status_resolucao === "matched") {
    return `\nEstoque de leite: item compatÃ­vel identificado (${stock.item_leite_resolvido}), mas nenhuma entrada de estoque foi movimentada automaticamente.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    return "\nEstoque de leite: encontrei mÃºltiplos itens compatÃ­veis e nÃ£o movimentei estoque automaticamente.";
  }

  return "\nNÃ£o encontrei item de estoque compatÃ­vel com leite. Registrei apenas a produÃ§Ã£o.";
}

function confirmationText(parsed: ParsedRanchoMessage) {
  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(parsed.dados?.registros) ? parsed.dados.registros as ParsedRanchoMessage[] : [];
    const lines = registros
      .slice(0, 6)
      .map((registro, index) => `${index + 1}. ${registro.resumo}`)
      .join("\n");
    const extra = registros.length > 6 ? `\n...e mais ${registros.length - 6} registro(s).` : "";
    return `Entendi ${registros.length} registros:\n${lines}${extra}${milkStockStatusText(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
  }

  return `Entendi que você quer ${parsed.resumo}.\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
}

function dryRunConfirmationText(parsed?: ParsedRanchoMessage) {
  if (!parsed) return "ConfirmaÃ§Ã£o recebida no modo teste. Nenhum registro real foi salvo.";

  if (parsed.tipo === "LOTE_REGISTROS") {
    const total = Number(parsed.dados?.total_registros || (Array.isArray(parsed.dados?.registros) ? parsed.dados.registros.length : 0));
    const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
    const stockDebug = stock
      ? `\nDebug estoque leite:\n- total_litros: ${stock.total_litros ?? parsed.dados?.total_litros ?? null}\n- destino_detectado: ${stock.destino_detectado || "nenhum"}\n- item_leite_resolvido: ${stock.item_leite_resolvido || "nenhum"}\n- item_id: ${stock.item_id || "nenhum"}\n- origem: ${stock.origem || "desconhecida"}\n- estoque_movimentar: ${stock.estoque_movimentar ? "sim" : "nao"}`
      : "";
    return `SimulaÃ§Ã£o concluÃ­da: ${total} registros seriam salvos. Nenhum registro real foi salvo.${stockDebug}`;
  }

  return `ConfirmaÃ§Ã£o recebida no modo teste. Nenhum registro real foi salvo.\nResumo: ${parsed.resumo}.`;
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
    PONTO_FUNCIONARIO: "registro de ponto",
    CADASTRO_ANIMAL: "cadastro de animal",
    CONSULTA_PRODUCAO: "consulta de produção",
    CONSULTA_FINANCEIRO: "consulta financeira",
    CONSULTA_ESTOQUE: "consulta de estoque",
    CONSULTA_FUNCIONARIO: "consulta de funcionário",
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
    ? input.messageSid || `in-${crypto.randomUUID()}`
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

  const expired = data?.expira_em ? new Date(data.expira_em as string).getTime() < Date.now() : false;
  if (!data || expired) return { etapa: "livre", dados: {} };

  const etapa = ["aguardando_dado", "aguardando_confirmacao"].includes(String(data.etapa))
    ? String(data.etapa) as BotSession["etapa"]
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
    fluxo: session.etapa === "livre" ? null : "nlp_local",
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
      mensagem: `${actor} cadastrou produção de leite${record.litros ? ` de ${formatNumber(record.litros, " L")}` : ""}.`
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
    const type = record.tipo === "saida" ? "saída" : "entrada";
    return {
      tipo: record.tipo === "saida" ? "financeiro_saida_bot" : "financeiro_entrada_bot",
      titulo: `${type === "saída" ? "Saída" : "Entrada"} financeira cadastrada`,
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
      tipo: record.tipo === "saida" ? "estoque_baixa_bot" : "estoque_entrada_bot",
      titulo: record.tipo === "saida" ? "Baixa de estoque registrada" : "Entrada de estoque registrada",
      mensagem: `${actor} ${record.tipo === "saida" ? "deu baixa em item do estoque" : "adicionou item ao estoque"}.`
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
  return digits ? digits.replace(/^0+/, "") || "0" : "";
}

function levenshtein(left: string, right: string) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = left[i - 1] === right[j - 1]
        ? costs[j - 1]
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
    .select("id,brinco,nome,categoria,fase,status,raca,observacoes")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const resolved = resolveAnimalIdentifier(code, (data || []) as AnyRecord[]);
  if (!resolved.row) return undefined;
  return {
    row: resolved.row,
    exact: resolved.status === "matched" && resolved.exact,
    score: resolved.score,
    ambiguousRows: resolved.status === "ambiguous" ? resolved.rows : undefined,
    resolutionStatus: resolved.status
  };
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

async function findStockItem(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string): Promise<StockLookupResult> {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  const resolved = resolveStockItem(name, activeRows);

  const candidateRows = (resolved.rows?.length ? resolved.rows : resolved.row ? [resolved.row] : activeRows.slice(0, 8)) as AnyRecord[];
  const candidateNames = candidateRows
    .map((row) => String(row.nome || row.id || ""))
    .filter(Boolean)
    .slice(0, 8);
  const reason = !activeRows.length
    ? "catalogo_vazio"
    : resolved.status === "not_found"
      ? "sem_match_seguro"
      : resolved.status === "ambiguous"
        ? "multiplos_itens_parecidos"
        : resolved.status === "suggestion"
          ? "match_medio_precisa_confirmacao"
          : "match_seguro";

  return {
    row: resolved.row,
    exact: resolved.status === "matched" && resolved.exact,
    score: resolved.score,
    ambiguousRows: resolved.status === "ambiguous" ? resolved.rows : undefined,
    resolutionStatus: resolved.status,
    catalogSource: "banco_real",
    catalogCount: activeRows.length,
    candidateNames,
    reason
  };
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
    reason: activeRows.length ? "sem_item_leite_em_litros" : "catalogo_vazio"
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
      ? "TODO: salvar entrada consolidada de leite usando service server-side seguro de estoque."
      : null
  };
}

async function findEmployee(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string) {
  const { data, error } = await supabase
    .from(TABLES.funcionarios)
    .select("id,nome,funcao,ativo,deleted_at")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false && !row.deleted_at);
  return bestMatch(activeRows, name, (row) => [row.nome]);
}

function stockCategoryFromName(name: string) {
  const normalized = normalizeRanchoText(name);
  if (/\b(?:racao|ração|silagem|sal|farelo|milho)\b/.test(normalized)) return "racao";
  if (/\b(?:vacina|remedio|remédio|medicamento|antibiotico|antibiótico)\b/.test(normalized)) return "medicamento";
  if (/\b(?:luva|seringa|insumo)\b/.test(normalized)) return "insumo";
  return "outro";
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
    const registros = Array.isArray(dados.registros) ? dados.registros as ParsedRanchoMessage[] : [];
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
      const destinoDetectado = dados.tanque ? "tanque" : "producao_leite";
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

  if (ANIMAL_RECORD_INTENTS.has(parsed.tipo) && dados.animal_codigo) {
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

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE"].includes(parsed.tipo) && dados.item_nome) {
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

  return changed ? refreshRanchoMessage(parsed, dados) : parsed;
}

async function saveConfirmedRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage): Promise<SaveResult> {
  const dados = pending.dados || {};

  if (pending.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ? dados.registros as ParsedRanchoMessage[] : [];
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
      const tipo = dados.evento_tipo === "vacina" ? "vacina" : "tratamento";
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo,
        data_evento: isoFromReference(dados.data_referencia),
        descricao: `${tipo === "vacina" ? "Vacina" : "Tratamento"} registrado via WhatsApp`,
        medicamento: dados.produto,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      return realSaveResult(`Pronto, registro salvo com sucesso.\n${tipo === "vacina" ? "Vacina" : "Tratamento"} em ${animal.brinco}: ${dados.produto}.`, [TABLES.eventosAnimal]);
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
      dados.nome ? `Nome: ${dados.nome}.` : "",
      `Brinco: ${dados.animal_codigo}.`,
      dados.sexo ? `Sexo: ${dados.sexo}.` : "",
      dados.fase ? `Fase: ${dados.fase}.` : "",
      dados.raca ? `Raça: ${dados.raca}.` : "",
      dados.lote_nome ? `Lote: ${dados.lote_nome}.` : "",
      dados.data_nascimento ? `Nascimento: ${dados.data_nascimento}.` : ""
    ].filter(Boolean).join("\n");
    return realSaveResult(`Pronto, animal cadastrado com sucesso.\n${details}`, [TABLES.animais]);
  }

  if (pending.tipo === "DESPESA" || pending.tipo === "RECEITA_VENDA") {
    const tipo = pending.tipo === "DESPESA" ? "saida" : "entrada";
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
      categoria: dados.descricao || (tipo === "saida" ? "Despesa via WhatsApp" : "Receita via WhatsApp"),
      descricao: dados.descricao || pending.resumo,
      metodo_pagamento: "whatsapp",
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    return realSaveResult(`Pronto, registro salvo com sucesso.\n${tipo === "saida" ? "Saída" : "Entrada"}: ${formatMoney(dados.valor)}.`, [TABLES.transacoesFinanceiras]);
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

    const type = pending.tipo === "ESTOQUE_ENTRADA" ? "entrada" : "saida";
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

    return realSaveResult(`Pronto, movimentação salva com sucesso.\n${type === "entrada" ? "Entrada" : "Baixa"}: ${formatStockAmount(quantity, found.row.unidade_medida)} de ${found.row.nome}.`, [TABLES.estoqueMovimentacoes]);
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
      .select("id,nome,contato_whatsapp,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (employeesError) throw new Error(employeesError.message);

    const duplicateEmployee = ((employees || []) as AnyRecord[]).find((row) => (
      row.ativo !== false && !row.deleted_at && whatsappNumbersMatch(phone, String(row.contato_whatsapp || ""))
    ));
    if (duplicateEmployee) {
      return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está vinculado ao funcionário ${duplicateEmployee.nome}.` };
    }

    const { data: whatsappRows, error: whatsappError } = await supabase
      .from(TABLES.whatsappUsuarios)
      .select("id,telefone_e164,funcionario_id,ativo,nome_exibicao")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (whatsappError) throw new Error(whatsappError.message);

    const activeWhatsapp = ((whatsappRows || []) as AnyRecord[]).find((row) => (
      row.ativo !== false && whatsappNumbersMatch(phone, String(row.telefone_e164 || ""))
    ));
    if (activeWhatsapp) {
      return { response: `Não cadastrei. O WhatsApp ${formatWhatsappForBot(phone)} já está ativo para ${activeWhatsapp.nome_exibicao || "outro usuário"}.` };
    }

    const employee = await insertRealRecord(supabase, owner, TABLES.funcionarios, {
      fazenda_id: owner.fazenda_id,
      nome: dados.funcionario_nome,
      funcao: dados.funcao || "Funcionário",
      contato_whatsapp: phone,
      salario_base: 0,
      data_admissao: dateOnly(),
      carga_horaria_mensal: 220,
      valor_hora_extra: 0,
      ativo: true
    });

    const reusableWhatsapp = ((whatsappRows || []) as AnyRecord[]).find((row) => (
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

    return realSaveResult(`Pronto, funcionário cadastrado com sucesso.\n${dados.funcionario_nome}: ${formatWhatsappForBot(phone)}.`, [TABLES.funcionarios, TABLES.whatsappUsuarios]);
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
    return realSaveResult(`Pronto, ponto salvo com sucesso.\n${found.row.nome}: ${dados.ponto_tipo || "entrada"}${dados.horario ? ` às ${dados.horario}` : ""}.`, [TABLES.registrosPonto]);
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

async function handleConsultation(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  if (parsed.tipo === "AJUDA") return helpText();

  if (parsed.tipo === "CONSULTA_PRODUCAO") {
    const range = parsed.dados.data_referencia === "mes" ? currentMonthRange() : dayRange(parsed.dados.data_referencia);
    const { data, error } = await supabase
      .from(TABLES.ordenhas)
      .select("litros")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("ordenhado_em", range.start)
      .lt("ordenhado_em", range.end);
    if (error) throw new Error(error.message);
    const total = (data || []).reduce((sum, row) => sum + Number(row.litros || 0), 0);
    return `Produção ${parsed.dados.data_referencia === "mes" ? "do mês" : "de hoje"}: ${formatNumber(total, " L")} em ${(data || []).length} registro(s).`;
  }

  if (parsed.tipo === "CONSULTA_FINANCEIRO") {
    const range = currentMonthRange();
    const { data, error } = await supabase
      .from(TABLES.transacoesFinanceiras)
      .select("tipo,valor")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("data_transacao", dateOnly(new Date(range.start)))
      .lt("data_transacao", dateOnly(new Date(range.end)));
    if (error) throw new Error(error.message);
    const entrada = (data || []).filter((row) => row.tipo === "entrada").reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const saida = (data || []).filter((row) => row.tipo === "saida").reduce((sum, row) => sum + Number(row.valor || 0), 0);
    return `Financeiro do mês:\nEntradas: ${formatMoney(entrada)}\nSaídas: ${formatMoney(saida)}\nResultado: ${formatMoney(entrada - saida)}`;
  }

  if (parsed.tipo === "CONSULTA_ESTOQUE") {
    if (parsed.dados.item_nome) {
      const found = await findStockItem(supabase, owner, String(parsed.dados.item_nome));
      if (found.row) return `Estoque de ${found.row.nome}: ${formatStockAmount(found.row.quantidade_atual, found.row.unidade_medida)}.`;
    }

    const { data, error } = await supabase
      .from(TABLES.estoqueItens)
      .select("nome,quantidade_atual,quantidade_minima,unidade_medida")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(1000);
    if (error) throw new Error(error.message);
    const critical = (data || []).filter((row) => Number(row.quantidade_atual || 0) <= Number(row.quantidade_minima || 0));
    const examples = critical.slice(0, 3).map((row) => `- ${row.nome}: ${formatStockAmount(row.quantidade_atual, row.unidade_medida)}`).join("\n");
    return critical.length
      ? `Você tem ${critical.length} item(ns) em atenção no estoque:\n${examples}`
      : "Estoque consultado. Não encontrei itens abaixo do mínimo agora.";
  }

  if (parsed.tipo === "CONSULTA_FUNCIONARIO") {
    if (parsed.dados.funcionario_nome) {
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (found) return `${found.row.nome}: ${found.row.funcao || "função não informada"} - ${found.row.ativo === false ? "inativo" : "ativo"}.`;
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

  if (parsed.tipo === "CRIAR_ITEM_ESTOQUE" && !isBotAdmin(owner)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Você não tem permissão para criar itens de estoque. Peça para um administrador cadastrar esse item.";
  }

  if (parsed.tipo === "CRIAR_FUNCIONARIO" && !isBotAdmin(owner)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Você não tem permissão para cadastrar funcionários pelo bot. Peça para um administrador fazer esse cadastro.";
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
      await saveSession(supabase, owner, { etapa: next.perguntas_faltantes.length ? "aguardando_dado" : "aguardando_confirmacao", dados: { pending: next } });
      return next.perguntas_faltantes.length ? missingText(next) : confirmationText(next);
    }

    if (command === "2" || /\b(?:despesa|financeiro)\b/.test(command)) {
      const financeData = {
        valor: pending.dados.valor,
        descricao: pending.dados.item_nome,
        data_referencia: pending.dados.data_referencia
      };
      const next = refreshRanchoMessage({ ...pending, tipo: "DESPESA", dados: financeData }, financeData);
      await saveSession(supabase, owner, { etapa: next.perguntas_faltantes.length ? "aguardando_dado" : "aguardando_confirmacao", dados: { pending: next } });
      return next.perguntas_faltantes.length ? missingText(next) : confirmationText(next);
    }

    return "Responda 1 para criar o item de estoque ou 2 para registrar apenas como despesa.";
  }

  const next = await enrichWithCatalog(supabase, owner, mergeRanchoMessageData(pending, text));
  botLog("contextual_reply", owner, {
    pending: next,
    status: "aguardando_dado",
    parser: "contextual",
    nextStep: next.perguntas_faltantes.length ? "pedir_dado" : "confirmar"
  });
  const animalBlock = animalBlockFromParsed(next);
  if (animalBlock) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return animalBlock;
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
    const correction = normalizeRanchoText(text).replace(/^(?:nao|n|errado|corrigir|refazer|foi|era)\b\s*,?\s*/g, "").trim();
    if (correction && correction !== command) {
      const next = mergeRanchoMessageData(pending, correction);
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

  return "Responda 1 para confirmar ou 2 para corrigir. Se quiser parar, envie cancelar.";
}

function ownerBlockedMessage(reason: Awaited<ReturnType<typeof resolveWhatsAppOwner>>["reason"]) {
  if (reason === "no_farm") {
    return "Seu WhatsApp está cadastrado, mas não está vinculado a uma fazenda. Fale com o administrador.";
  }
  if (reason === "farm_inactive") {
    return "O rancho vinculado a este WhatsApp está inativo. Fale com o administrador.";
  }
  if (reason === "user_inactive") {
    return "Este WhatsApp está cadastrado, mas está inativo para usar o bot. Fale com o administrador do Rancho.";
  }
  return "Este WhatsApp ainda não está autorizado no Rancho. Peça ao administrador para cadastrar seu número na aba WhatsApp do sistema.";
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
    confianca: typeof detected?.confianca === "number" ? detected.confianca : null,
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
    } else if (previousSession.etapa === "aguardando_confirmacao" && input.modoTeste && !salvarRealNoTeste && isConfirmCommand(command)) {
      parsed = pendingFromSession(previousSession);
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
    } else if (previousSession.etapa === "aguardando_confirmacao") {
      parsed = pendingFromSession(previousSession);
      eventConfirmed = isConfirmCommand(command);
      response = await handleConfirmation(supabase, owner, previousSession, input.mensagem, command, {
        modoTesteSalvarReal: salvarRealNoTeste
      });
    } else if (previousSession.etapa === "aguardando_dado") {
      response = await handleMissingData(supabase, owner, previousSession, input.mensagem);
    } else {
      parsed = parseRanchoMessage(input.mensagem);
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
    const message = error instanceof Error ? error.message : "Erro interno no Rancho.";
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
