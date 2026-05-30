import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, WhatsAppSession } from "@/lib/types";
import { sendWhatsAppButtons, sendWhatsAppText } from "@/services/whatsapp/meta";

const STATES = {
  IDLE: "idle",
  PROD_ANIMAL: "prod_animal",
  PROD_LITERS: "prod_liters",
  ANIMAL_NAME: "animal_name",
  ANIMAL_TAG: "animal_tag",
  ANIMAL_BREED: "animal_breed",
  ANIMAL_BIRTH: "animal_birth",
  FIN_VALUE: "fin_value",
  FIN_CATEGORY: "fin_category",
  FIN_DESCRIPTION: "fin_description"
};

function cleanNumber(value: string) {
  return Number(value.replace(/[^0-9,.-]/g, "").replace(",", "."));
}

async function getSession(phone: string): Promise<WhatsAppSession> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { phone, state: STATES.IDLE, payload: {} };

  const { data } = await supabase.from(TABLES.whatsappSessions).select("*").eq("phone", phone).maybeSingle();
  return data || { phone, state: STATES.IDLE, payload: {} };
}

async function saveSession(session: WhatsAppSession) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await supabase.from(TABLES.whatsappSessions).upsert({
    phone: session.phone,
    state: session.state,
    payload: session.payload || {},
    updated_at: new Date().toISOString()
  }, { onConflict: "phone" });
}

async function logActivity(action: string, actor: string, description: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase.from(TABLES.activityLogs).insert({ action, actor, description, created_at: new Date().toISOString() });
}

async function insertRecord(table: string, payload: AnyRecord) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.log(`[WhatsApp demo insert] ${table}`, payload);
    return;
  }
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw new Error(error.message);
}

export async function sendMainMenu(phone: string) {
  await saveSession({ phone, state: STATES.IDLE, payload: {} });
  return sendWhatsAppButtons(phone, "Bem-vindo ao sistema da fazenda. Escolha uma opção:", [
    { id: "MENU_PRODUCAO", title: "Cadastrar Produção" },
    { id: "MENU_ANIMAL", title: "Cadastrar Animal" },
    { id: "MENU_FINANCEIRO", title: "Financeiro" }
  ]);
}

export async function handleConversation(input: { phone: string; text: string; buttonId?: string }) {
  const phone = input.phone;
  const text = (input.text || "").trim();
  const command = input.buttonId || text.toUpperCase();

  if (["OI", "OLÁ", "OLA", "MENU", "INICIO", "INÍCIO", "CANCELAR"].includes(command)) {
    return sendMainMenu(phone);
  }

  if (command === "MENU_PRODUCAO") {
    await saveSession({ phone, state: STATES.PROD_ANIMAL, payload: {} });
    return sendWhatsAppText(phone, "Qual vaca produziu leite? Envie o nome ou número do brinco.\n\nEx: Estrela ou B-042");
  }

  if (command === "MENU_ANIMAL") {
    await saveSession({ phone, state: STATES.ANIMAL_NAME, payload: {} });
    return sendWhatsAppText(phone, "Vamos cadastrar um animal. Qual é o nome?\n\nEx: Mimosa");
  }

  if (command === "MENU_FINANCEIRO") {
    await saveSession({ phone, state: STATES.IDLE, payload: {} });
    return sendWhatsAppButtons(phone, "O que deseja registrar?", [
      { id: "FIN_RECEITA", title: "Receita" },
      { id: "FIN_DESPESA", title: "Despesa" },
      { id: "CANCELAR", title: "Cancelar" }
    ]);
  }

  if (command === "FIN_RECEITA" || command === "FIN_DESPESA") {
    await saveSession({ phone, state: STATES.FIN_VALUE, payload: { type: command === "FIN_RECEITA" ? "receita" : "despesa" } });
    return sendWhatsAppText(phone, "Qual o valor?\n\nEx: 1500,00");
  }

  const session = await getSession(phone);

  if (session.state === STATES.PROD_ANIMAL) {
    await saveSession({ phone, state: STATES.PROD_LITERS, payload: { animal_name: text } });
    return sendWhatsAppText(phone, `Certo. Quantos litros a vaca ${text} produziu?\n\nEx: 24,5`);
  }

  if (session.state === STATES.PROD_LITERS) {
    const liters = cleanNumber(text);
    if (!Number.isFinite(liters) || liters <= 0) return sendWhatsAppText(phone, "Valor inválido. Envie apenas a quantidade de litros. Ex: 24,5");
    const animalName = session.payload?.animal_name || "Animal não informado";
    await insertRecord(TABLES.milkProductions, {
      animal_name: animalName,
      liters,
      period: "whatsapp",
      produced_at: new Date().toISOString().slice(0, 10),
      quality: "boa",
      notes: `Registrado via WhatsApp por ${phone}`
    });
    await logActivity("Produção registrada", "WhatsApp", `${animalName} - ${liters} L`);
    await sendWhatsAppText(phone, `✅ Produção registrada com sucesso!\n\nAnimal: ${animalName}\nLitros: ${liters} L`);
    return sendMainMenu(phone);
  }

  if (session.state === STATES.ANIMAL_NAME) {
    await saveSession({ phone, state: STATES.ANIMAL_TAG, payload: { name: text } });
    return sendWhatsAppText(phone, "Qual é o número do brinco?\n\nEx: B-042");
  }

  if (session.state === STATES.ANIMAL_TAG) {
    await saveSession({ phone, state: STATES.ANIMAL_BREED, payload: { ...session.payload, tag_number: text } });
    return sendWhatsAppText(phone, "Qual é a raça?\n\nEx: Girolando");
  }

  if (session.state === STATES.ANIMAL_BREED) {
    await saveSession({ phone, state: STATES.ANIMAL_BIRTH, payload: { ...session.payload, breed: text } });
    return sendWhatsAppText(phone, "Qual é a data de nascimento?\n\nUse o formato AAAA-MM-DD. Ex: 2021-04-15");
  }

  if (session.state === STATES.ANIMAL_BIRTH) {
    const payload: AnyRecord = {
      ...session.payload,
      birth_date: text,
      category: "vaca",
      status: "ativo",
      health_status: "ok",
      reproductive_status: "normal",
      notes: `Cadastrado via WhatsApp por ${phone}`
    };
    await insertRecord(TABLES.animals, payload);
    await logActivity("Animal cadastrado", "WhatsApp", `${payload.name} - ${payload.tag_number}`);
    await sendWhatsAppText(phone, `✅ Animal cadastrado!\n\nNome: ${payload.name}\nBrinco: ${payload.tag_number}\nRaça: ${payload.breed}`);
    return sendMainMenu(phone);
  }

  if (session.state === STATES.FIN_VALUE) {
    const amount = cleanNumber(text);
    if (!Number.isFinite(amount) || amount <= 0) return sendWhatsAppText(phone, "Valor inválido. Envie somente o valor. Ex: 1500,00");
    await saveSession({ phone, state: STATES.FIN_CATEGORY, payload: { ...session.payload, amount } });
    return sendWhatsAppText(phone, "Qual categoria?\n\nEx: Venda de leite, ração, veterinário");
  }

  if (session.state === STATES.FIN_CATEGORY) {
    await saveSession({ phone, state: STATES.FIN_DESCRIPTION, payload: { ...session.payload, category: text } });
    return sendWhatsAppText(phone, "Digite uma descrição curta.\n\nEx: Recebimento do laticínio");
  }

  if (session.state === STATES.FIN_DESCRIPTION) {
    const payload: AnyRecord = {
      ...session.payload,
      description: text,
      due_date: new Date().toISOString().slice(0, 10),
      status: "pago",
      payment_method: "whatsapp",
      notes: `Registrado via WhatsApp por ${phone}`
    };
    await insertRecord(TABLES.financialEntries, payload);
    await logActivity("Financeiro registrado", "WhatsApp", `${payload.type} - R$ ${payload.amount}`);
    await sendWhatsAppText(phone, `✅ ${payload.type === "receita" ? "Receita" : "Despesa"} registrada!\n\nValor: R$ ${payload.amount}\nCategoria: ${payload.category}`);
    return sendMainMenu(phone);
  }

  return sendMainMenu(phone);
}
