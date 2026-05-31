import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { normalizeWhatsappNumber } from "@/lib/phone";
import { resolveWhatsAppOwner, type WhatsAppOwner } from "@/services/whatsapp/identity";
import {
  mergeRanchoMessageData,
  normalizeRanchoText,
  parseRanchoMessage,
  type ParsedRanchoMessage
} from "@/lib/whatsapp/nlp";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type TwilioMessageInput = {
  Body: string;
  From: string;
  To: string;
  MessageSid: string;
};

type BotSession = {
  etapa: "livre" | "aguardando_dado" | "aguardando_confirmacao";
  dados: AnyRecord;
};

const CONFIRM_WORDS = new Set(["sim", "s", "confirmar", "confirma", "ok", "pode", "isso", "certo", "1"]);
const CANCEL_WORDS = new Set(["nao", "n", "cancelar", "cancela", "errado", "corrigir", "2"]);

function nowIso() {
  return new Date().toISOString();
}

function expirationIso() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function dateFromReference(reference?: string) {
  const date = new Date();
  if (reference === "ontem") date.setDate(date.getDate() - 1);
  return date;
}

function dateOnly(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function confirmationText(parsed: ParsedRanchoMessage) {
  return `Entendi: ${parsed.resumo}. Confirmar?\n1 - Confirmar\n2 - Corrigir`;
}

function missingText(parsed: ParsedRanchoMessage) {
  return `Entendi que é ${intentLabel(parsed.tipo)}. ${parsed.perguntas_faltantes[0] || "Qual dado faltou?"}`;
}

function unknownText() {
  return "Não entendi com segurança. Tente assim:\n- vaca 12 pariu\n- vaca 15 deu 20 litros\n- apliquei aftosa na vaca 8\n- gastei 300 reais com ração";
}

function intentLabel(tipo: ParsedRanchoMessage["tipo"]) {
  const labels: Record<ParsedRanchoMessage["tipo"], string> = {
    PRODUCAO_LEITE: "produção de leite",
    PARTO: "parto",
    VACINA_MEDICAMENTO: "vacina ou medicamento",
    MORTE: "morte de animal",
    DESPESA: "despesa",
    RECEITA_VENDA: "receita ou venda",
    ORDEM_SERVICO: "ordem de serviço",
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

  if (error) {
    console.error("[Twilio webhook] Falha ao salvar mensagem", error.message);
  }
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

async function insertRealRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, table: string, payload: AnyRecord) {
  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  await logAudit(supabase, owner, table, "insert", data || payload);
  return data;
}

async function findAnimal(supabase: SupabaseAdmin, owner: WhatsAppOwner, code: string) {
  const normalizedCode = normalizeRanchoText(code);
  const { data, error } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,categoria,status")
    .eq("fazenda_id", owner.fazenda_id)
    .ilike("brinco", `%${code}%`)
    .limit(5);

  if (error) throw new Error(error.message);
  const rows = data || [];
  if (!rows.length) return null;

  return rows.find((row) => normalizeRanchoText(String(row.brinco || "")) === normalizedCode)
    || rows.find((row) => normalizeRanchoText(String(row.brinco || "")).endsWith(normalizedCode))
    || rows[0];
}

function pendingWithoutAnimal(pending: ParsedRanchoMessage): ParsedRanchoMessage {
  return {
    ...pending,
    confianca: 0.65,
    dados: { ...pending.dados, animal_codigo: undefined },
    perguntas_faltantes: ["Qual foi o número do animal cadastrado?"]
  };
}

async function saveConfirmedRecord(supabase: SupabaseAdmin, owner: WhatsAppOwner, pending: ParsedRanchoMessage) {
  const dados = pending.dados || {};

  if (["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE"].includes(pending.tipo)) {
    const animal = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
    if (!animal) {
      return {
        response: `Não encontrei o animal ${dados.animal_codigo || ""} no rebanho. Qual é o número do animal cadastrado?`,
        nextSession: { etapa: "aguardando_dado" as const, dados: { pending: pendingWithoutAnimal(pending) } }
      };
    }

    if (pending.tipo === "PRODUCAO_LEITE") {
      await insertRealRecord(supabase, owner, TABLES.ordenhas, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        litros: Number(dados.litros),
        ordenhado_em: nowIso(),
        turno: dados.turno || "manha",
        destino: "tanque",
        origem: "whatsapp",
        registrado_por: owner.usuario_id || null,
        observacoes: `Registrado via WhatsApp (${owner.telefone_e164})`
      });
      return { response: `Produção registrada: vaca ${animal.brinco}, ${dados.litros} litros.` };
    }

    if (pending.tipo === "PARTO") {
      const eventDate = dateFromReference(dados.data_referencia);
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: "parto",
        data_evento: eventDate.toISOString(),
        descricao: `Parto registrado via WhatsApp para o animal ${animal.brinco}`,
        medicamento: null,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      return { response: `Parto registrado para a vaca ${animal.brinco}.` };
    }

    if (pending.tipo === "VACINA_MEDICAMENTO") {
      const tipo = dados.evento_tipo === "vacina" ? "vacina" : "tratamento";
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo,
        data_evento: nowIso(),
        descricao: `${tipo === "vacina" ? "Vacina" : "Tratamento"} registrado via WhatsApp`,
        medicamento: dados.produto,
        dose: null,
        custo: 0,
        responsavel_usuario_id: owner.usuario_id || null
      });
      return { response: `${tipo === "vacina" ? "Vacina" : "Tratamento"} registrado para o animal ${animal.brinco}: ${dados.produto}.` };
    }

    if (pending.tipo === "MORTE") {
      const eventDate = dateFromReference(dados.data_referencia);
      await insertRealRecord(supabase, owner, TABLES.eventosAnimal, {
        fazenda_id: owner.fazenda_id,
        animal_id: animal.id,
        tipo: "observacao",
        data_evento: eventDate.toISOString(),
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

      return { response: `Morte registrada e animal ${animal.brinco} marcado como morto.` };
    }
  }

  if (pending.tipo === "DESPESA" || pending.tipo === "RECEITA_VENDA") {
    const tipo = pending.tipo === "DESPESA" ? "saida" : "entrada";
    await insertRealRecord(supabase, owner, TABLES.transacoesFinanceiras, {
      fazenda_id: owner.fazenda_id,
      tipo,
      data_transacao: dateOnly(),
      valor: Number(dados.valor),
      categoria: dados.descricao || (tipo === "saida" ? "Despesa via WhatsApp" : "Receita via WhatsApp"),
      descricao: dados.descricao || pending.resumo,
      metodo_pagamento: "whatsapp",
      origem: "whatsapp",
      created_by: owner.usuario_id || null
    });
    return { response: `${tipo === "saida" ? "Despesa" : "Receita"} registrada: R$ ${dados.valor}.` };
  }

  if (pending.tipo === "ORDEM_SERVICO") {
    // TODO: ligar este fluxo a uma tabela real de ordens de serviço quando ela existir no ERP.
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

async function handleFreeText(supabase: SupabaseAdmin, owner: WhatsAppOwner, text: string) {
  const parsed = parseRanchoMessage(text);

  if (parsed.confianca >= 0.85) {
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

  const next = mergeRanchoMessageData(pending, text);
  if (next.perguntas_faltantes.length) {
    await saveSession(supabase, owner, { etapa: "aguardando_dado", dados: { pending: next } });
    return missingText(next);
  }

  await saveSession(supabase, owner, { etapa: "aguardando_confirmacao", dados: { pending: next } });
  return confirmationText(next);
}

async function handleConfirmation(supabase: SupabaseAdmin, owner: WhatsAppOwner, session: BotSession, command: string) {
  const pending = session.dados?.pending as ParsedRanchoMessage | undefined;
  if (!pending?.tipo) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Não encontrei uma confirmação pendente. Envie um novo registro.";
  }

  if (CONFIRM_WORDS.has(command)) {
    const result = await saveConfirmedRecord(supabase, owner, pending);
    await saveSession(supabase, owner, result.nextSession || { etapa: "livre", dados: result.sessionData || {} });
    return result.response;
  }

  if (CANCEL_WORDS.has(command)) {
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return "Cancelado. Nenhum registro real foi salvo.";
  }

  return "Responda 1 para confirmar ou 2 para corrigir.";
}

export async function handleTwilioRanchoMessage(input: TwilioMessageInput) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return "Não consegui acessar as configurações do Rancho agora. Tente novamente em instantes.";
  }

  const phone = normalizeWhatsappNumber(input.From) || input.From;
  const resolvedOwner = await resolveWhatsAppOwner(supabase, input.From);
  const owner = resolvedOwner.owner;

  await saveWhatsAppMessage(supabase, {
    owner,
    phone,
    messageSid: input.MessageSid,
    direction: "entrada",
    body: input.Body,
    raw: {
      from: input.From,
      to: input.To,
      messageSid: input.MessageSid
    }
  });

  let response: string;
  if (!owner) {
    if (resolvedOwner.reason === "no_farm") {
      response = "Seu WhatsApp está cadastrado, mas não está vinculado a uma fazenda. Fale com o administrador.";
    } else if (resolvedOwner.reason === "farm_inactive") {
      response = "O rancho vinculado a este WhatsApp está inativo. Fale com o administrador.";
    } else if (resolvedOwner.reason === "user_inactive") {
      response = "Este WhatsApp está vinculado a um usuário inativo. Fale com o administrador.";
    } else {
      response = "Não encontrei este WhatsApp cadastrado em nenhum rancho. Verifique se o número está correto nas Configurações ou fale com o suporte.";
    }
  } else {
    const command = normalizeRanchoText(input.Body);
    const session = await getSession(supabase, owner);

    if (CANCEL_WORDS.has(command) && session.etapa !== "aguardando_confirmacao") {
      await saveSession(supabase, owner, { etapa: "livre", dados: {} });
      response = "Cancelado. Envie um novo registro quando quiser.";
    } else if (session.etapa === "aguardando_confirmacao") {
      response = await handleConfirmation(supabase, owner, session, command);
    } else if (session.etapa === "aguardando_dado") {
      response = await handleMissingData(supabase, owner, session, input.Body);
    } else {
      response = await handleFreeText(supabase, owner, input.Body);
    }
  }

  await saveWhatsAppMessage(supabase, {
    owner,
    phone,
    messageSid: input.MessageSid,
    direction: "saida",
    body: response
  });

  return response;
}
