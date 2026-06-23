import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type BotSession = {
  etapa: "livre" | "aguardando_dado" | "aguardando_confirmacao";
  dados: AnyRecord;
};

type SessionUpdateLogger = (event: string, owner: WhatsAppOwner, details: AnyRecord) => void;

function nowIso() {
  return new Date().toISOString();
}

function expirationIso() {
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

export async function getSession(supabase: SupabaseAdmin, owner: WhatsAppOwner): Promise<BotSession> {
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

export async function saveSession(
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  session: BotSession,
  logSessionUpdate?: SessionUpdateLogger
) {
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
  logSessionUpdate?.("session_update", owner, {
    status: session.etapa,
    pending: session.dados?.pending,
    nextStep: session.etapa
  });
}

export function pendingFromSession(session?: BotSession | null) {
  return session?.dados?.pending as ParsedRanchoMessage | undefined;
}
