import { env } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, WhatsAppSession } from "@/lib/types";
import { sendWhatsAppButtons, sendWhatsAppText } from "@/services/whatsapp/meta";

const STATES = {
  IDLE: "idle",
  PROD_ANIMAL: "prod_animal",
  PROD_LITERS: "prod_liters",
  ANIMAL_TAG: "animal_tag",
  ANIMAL_CATEGORY: "animal_category",
  ANIMAL_BREED: "animal_breed",
  ANIMAL_BIRTH: "animal_birth",
  FIN_VALUE: "fin_value",
  FIN_CATEGORY: "fin_category",
  FIN_DESCRIPTION: "fin_description"
};

function cleanNumber(value: string) {
  return Number(value.replace(/[^0-9,.-]/g, "").replace(",", "."));
}

async function resolveWhatsAppUser(phone: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      fazenda_id: env.defaultFazendaId || "",
      whatsapp_usuario_id: null,
      usuario_id: null
    };
  }

  const { data: whatsappUser } = await supabase
    .from(TABLES.whatsappUsuarios)
    .select("id,fazenda_id,usuario_id,ativo")
    .eq("telefone_e164", phone)
    .eq("ativo", true)
    .maybeSingle();

  if (whatsappUser?.fazenda_id) {
    return {
      fazenda_id: whatsappUser.fazenda_id as string,
      whatsapp_usuario_id: whatsappUser.id as string,
      usuario_id: whatsappUser.usuario_id as string | null
    };
  }

  if (env.defaultFazendaId) {
    return {
      fazenda_id: env.defaultFazendaId,
      whatsapp_usuario_id: null,
      usuario_id: null
    };
  }

  const { data: firstFarm } = await supabase
    .from(TABLES.fazendas)
    .select("id")
    .eq("ativa", true)
    .limit(1)
    .maybeSingle();

  return {
    fazenda_id: (firstFarm?.id as string) || "",
    whatsapp_usuario_id: null,
    usuario_id: null
  };
}

async function getSession(phone: string): Promise<WhatsAppSession> {
  const supabase = getSupabaseAdmin();
  const owner = await resolveWhatsAppUser(phone);

  if (!supabase || !owner.fazenda_id) {
    return { phone, fazendaId: owner.fazenda_id, whatsappUsuarioId: owner.whatsapp_usuario_id, usuarioId: owner.usuario_id, state: STATES.IDLE, payload: {} };
  }

  const { data } = await supabase
    .from(TABLES.whatsappSessoes)
    .select("*")
    .eq("telefone_e164", phone)
    .maybeSingle();

  if (!data) {
    return { phone, fazendaId: owner.fazenda_id, whatsappUsuarioId: owner.whatsapp_usuario_id, usuarioId: owner.usuario_id, state: STATES.IDLE, payload: {} };
  }

  return {
    phone,
    fazendaId: data.fazenda_id,
    whatsappUsuarioId: data.whatsapp_usuario_id,
    usuarioId: owner.usuario_id,
    state: data.etapa || STATES.IDLE,
    payload: data.dados || {},
    updated_at: data.updated_at
  };
}

async function saveSession(session: WhatsAppSession) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !session.fazendaId) return;

  await supabase.from(TABLES.whatsappSessoes).upsert({
    fazenda_id: session.fazendaId,
    whatsapp_usuario_id: session.whatsappUsuarioId,
    telefone_e164: session.phone,
    fluxo: session.state === STATES.IDLE ? null : "menu_principal",
    etapa: session.state,
    dados: session.payload || {},
    status: "ativa",
    ultimo_interacao_em: new Date().toISOString(),
    expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  }, { onConflict: "telefone_e164" });
}

async function logAudit(fazendaId: string, usuarioId: string | null | undefined, entidade: string, acao: string, depois: AnyRecord) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !fazendaId) return;

  await supabase.from(TABLES.auditoriaLogs).insert({
    fazenda_id: fazendaId,
    usuario_id: usuarioId || null,
    entidade,
    acao,
    depois,
    origem: "whatsapp"
  });
}

async function insertRecord(table: string, payload: AnyRecord) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log(`[WhatsApp demo insert] ${table}`, payload);
    return payload;
  }

  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function findAnimal(fazendaId: string, text: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const term = text.trim();
  const { data } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,categoria")
    .eq("fazenda_id", fazendaId)
    .ilike("brinco", term)
    .limit(1)
    .maybeSingle();

  return data;
}

async function ensureSession(phone: string) {
  const session = await getSession(phone);
  if (!session.fazendaId) {
    await sendWhatsAppText(phone, "Nao encontrei uma fazenda para este telefone. Cadastre o numero em whatsapp_usuarios ou configure SUPABASE_DEFAULT_FAZENDA_ID.");
    return null;
  }
  return session;
}

export async function sendMainMenu(phone: string) {
  const session = await ensureSession(phone);
  if (!session) return;

  await saveSession({ ...session, state: STATES.IDLE, payload: {} });
  return sendWhatsAppButtons(phone, "Bem-vindo ao sistema da fazenda. Escolha uma opcao:", [
    { id: "MENU_PRODUCAO", title: "Ordenha" },
    { id: "MENU_ANIMAL", title: "Animal" },
    { id: "MENU_FINANCEIRO", title: "Financeiro" }
  ]);
}

export async function handleConversation(input: { phone: string; text: string; buttonId?: string }) {
  const phone = input.phone;
  const text = (input.text || "").trim();
  const command = input.buttonId || text.toUpperCase();

  if (["OI", "OLA", "OLÁ", "MENU", "INICIO", "INÍCIO", "CANCELAR"].includes(command)) {
    return sendMainMenu(phone);
  }

  const session = await ensureSession(phone);
  if (!session) return;

  if (command === "MENU_PRODUCAO") {
    await saveSession({ ...session, state: STATES.PROD_ANIMAL, payload: {} });
    return sendWhatsAppText(phone, "Qual animal foi ordenhado? Envie o numero do brinco.\n\nEx: B-042");
  }

  if (command === "MENU_ANIMAL") {
    await saveSession({ ...session, state: STATES.ANIMAL_TAG, payload: {} });
    return sendWhatsAppText(phone, "Vamos cadastrar um animal. Qual e o numero do brinco?\n\nEx: B-042");
  }

  if (command === "MENU_FINANCEIRO") {
    await saveSession({ ...session, state: STATES.IDLE, payload: {} });
    return sendWhatsAppButtons(phone, "O que deseja registrar?", [
      { id: "FIN_ENTRADA", title: "Entrada" },
      { id: "FIN_SAIDA", title: "Saida" },
      { id: "CANCELAR", title: "Cancelar" }
    ]);
  }

  if (command === "FIN_ENTRADA" || command === "FIN_SAIDA") {
    await saveSession({ ...session, state: STATES.FIN_VALUE, payload: { tipo: command === "FIN_ENTRADA" ? "entrada" : "saida" } });
    return sendWhatsAppText(phone, "Qual o valor?\n\nEx: 1500,00");
  }

  if (session.state === STATES.PROD_ANIMAL) {
    const animal = await findAnimal(session.fazendaId!, text);
    if (!animal) {
      return sendWhatsAppText(phone, "Nao encontrei esse brinco no rebanho. Envie um brinco cadastrado ou digite MENU para voltar.");
    }

    await saveSession({ ...session, state: STATES.PROD_LITERS, payload: { animal_id: animal.id, brinco: animal.brinco } });
    return sendWhatsAppText(phone, `Certo. Quantos litros o animal ${animal.brinco} produziu?\n\nEx: 24,5`);
  }

  if (session.state === STATES.PROD_LITERS) {
    const litros = cleanNumber(text);
    if (!Number.isFinite(litros) || litros <= 0) return sendWhatsAppText(phone, "Valor invalido. Envie apenas a quantidade de litros. Ex: 24,5");

    const payload = {
      fazenda_id: session.fazendaId,
      animal_id: session.payload?.animal_id,
      litros,
      turno: "manha",
      destino: "tanque",
      origem: "whatsapp",
      registrado_por: session.usuarioId || null,
      observacoes: `Registrado via WhatsApp por ${phone}`
    };

    const inserted = await insertRecord(TABLES.ordenhas, payload);
    await logAudit(session.fazendaId!, session.usuarioId, TABLES.ordenhas, "insert", inserted || payload);
    await sendWhatsAppText(phone, `OK. Ordenha registrada.\n\nAnimal: ${session.payload?.brinco}\nLitros: ${litros} L`);
    return sendMainMenu(phone);
  }

  if (session.state === STATES.ANIMAL_TAG) {
    await saveSession({ ...session, state: STATES.ANIMAL_CATEGORY, payload: { brinco: text } });
    return sendWhatsAppButtons(phone, "Qual e a categoria?", [
      { id: "CAT_VACA", title: "Vaca" },
      { id: "CAT_BEZERRO", title: "Bezerro" },
      { id: "CAT_TOURO", title: "Touro" }
    ]);
  }

  if (session.state === STATES.ANIMAL_CATEGORY) {
    const categoryMap: Record<string, string> = { CAT_VACA: "vaca", CAT_BEZERRO: "bezerro", CAT_TOURO: "touro" };
    const categoria = categoryMap[command] || text.toLowerCase();
    await saveSession({ ...session, state: STATES.ANIMAL_BREED, payload: { ...session.payload, categoria } });
    return sendWhatsAppText(phone, "Qual e a raca?\n\nEx: Girolando");
  }

  if (session.state === STATES.ANIMAL_BREED) {
    await saveSession({ ...session, state: STATES.ANIMAL_BIRTH, payload: { ...session.payload, raca: text } });
    return sendWhatsAppText(phone, "Qual e a data de nascimento?\n\nUse AAAA-MM-DD. Se nao souber, envie PULAR.");
  }

  if (session.state === STATES.ANIMAL_BIRTH) {
    const birth = text.toUpperCase() === "PULAR" ? null : text;
    const payload: AnyRecord = {
      fazenda_id: session.fazendaId,
      brinco: session.payload?.brinco,
      categoria: session.payload?.categoria || "outro",
      fase: "nao_aplicavel",
      raca: session.payload?.raca || null,
      data_nascimento: birth,
      status: "ativo",
      created_by: session.usuarioId || null,
      observacoes: `Cadastrado via WhatsApp por ${phone}`
    };

    const inserted = await insertRecord(TABLES.animais, payload);
    await logAudit(session.fazendaId!, session.usuarioId, TABLES.animais, "insert", inserted || payload);
    await sendWhatsAppText(phone, `OK. Animal cadastrado.\n\nBrinco: ${payload.brinco}\nCategoria: ${payload.categoria}\nRaca: ${payload.raca || "-"}`);
    return sendMainMenu(phone);
  }

  if (session.state === STATES.FIN_VALUE) {
    const valor = cleanNumber(text);
    if (!Number.isFinite(valor) || valor <= 0) return sendWhatsAppText(phone, "Valor invalido. Envie somente o valor. Ex: 1500,00");
    await saveSession({ ...session, state: STATES.FIN_CATEGORY, payload: { ...session.payload, valor } });
    return sendWhatsAppText(phone, "Qual categoria?\n\nEx: Venda de leite, racao, veterinario");
  }

  if (session.state === STATES.FIN_CATEGORY) {
    await saveSession({ ...session, state: STATES.FIN_DESCRIPTION, payload: { ...session.payload, categoria: text } });
    return sendWhatsAppText(phone, "Digite uma descricao curta.\n\nEx: Recebimento do laticinio");
  }

  if (session.state === STATES.FIN_DESCRIPTION) {
    const payload: AnyRecord = {
      fazenda_id: session.fazendaId,
      tipo: session.payload?.tipo || "entrada",
      valor: session.payload?.valor,
      categoria: session.payload?.categoria,
      descricao: text,
      metodo_pagamento: "whatsapp",
      origem: "whatsapp",
      created_by: session.usuarioId || null
    };

    const inserted = await insertRecord(TABLES.transacoesFinanceiras, payload);
    await logAudit(session.fazendaId!, session.usuarioId, TABLES.transacoesFinanceiras, "insert", inserted || payload);
    await sendWhatsAppText(phone, `OK. ${payload.tipo === "entrada" ? "Entrada" : "Saida"} registrada.\n\nValor: R$ ${payload.valor}\nCategoria: ${payload.categoria}`);
    return sendMainMenu(phone);
  }

  return sendMainMenu(phone);
}
