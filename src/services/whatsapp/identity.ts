import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import { normalizeWhatsappNumber, whatsappNumberCandidates, whatsappNumbersMatch } from "@/lib/phone";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export type WhatsAppOwner = {
  fazenda_id: string;
  whatsapp_usuario_id: string | null;
  funcionario_id: string | null;
  usuario_id: string | null;
  telefone_e164: string;
  nome_exibicao?: string | null;
  source: "whatsapp_usuarios";
};

export type ResolveWhatsAppOwnerResult = {
  owner: WhatsAppOwner | null;
  reason?: "not_registered" | "no_farm" | "farm_inactive" | "user_inactive";
};

function matchesIncomingPhone(value: unknown, incomingCandidates: Set<string>) {
  return whatsappNumberCandidates(String(value || "")).some((candidate) => incomingCandidates.has(candidate));
}

async function assertActiveFarm(supabase: SupabaseAdmin, fazendaId?: string | null) {
  if (!fazendaId) return "no_farm" as const;

  const { data, error } = await supabase
    .from(TABLES.fazendas)
    .select("id,ativa")
    .eq("id", fazendaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return "no_farm" as const;
  if (data.ativa === false) return "farm_inactive" as const;
  return null;
}

async function findWhatsAppUsers(supabase: SupabaseAdmin, incomingCandidates: Set<string>) {
  const { data, error } = await supabase
    .from(TABLES.whatsappUsuarios)
    .select("id,fazenda_id,usuario_id,funcionario_id,telefone_e164,nome_exibicao,ativo")
    .limit(2000);

  if (error) throw new Error(error.message);
  return (data || []).filter((row) => matchesIncomingPhone(row.telefone_e164, incomingCandidates));
}

export async function resolveWhatsAppOwner(supabase: SupabaseAdmin, from: string): Promise<ResolveWhatsAppOwnerResult> {
  const normalizedPhone = normalizeWhatsappNumber(from);
  const incomingCandidates = new Set(whatsappNumberCandidates(from));

  const whatsappUsers = await findWhatsAppUsers(supabase, incomingCandidates);
  if (whatsappUsers.length > 0) {
    let blockedReason: ResolveWhatsAppOwnerResult["reason"] = "user_inactive";

    for (const whatsappUser of whatsappUsers) {
      if (whatsappUser.ativo === false) continue;

      const farmError = await assertActiveFarm(supabase, whatsappUser.fazenda_id as string | null);
      if (farmError) {
        blockedReason = farmError;
        continue;
      }

      const owner = {
        fazenda_id: whatsappUser.fazenda_id as string,
        whatsapp_usuario_id: whatsappUser.id as string,
        funcionario_id: (whatsappUser.funcionario_id as string | null) || null,
        usuario_id: (whatsappUser.usuario_id as string | null) || null,
        telefone_e164: normalizeWhatsappNumber(whatsappUser.telefone_e164 as string) || normalizedPhone,
        nome_exibicao: whatsappUser.nome_exibicao as string | null,
        source: "whatsapp_usuarios" as const
      };

      console.log("[BOT AUTH]", {
        fromRaw: from,
        normalized: normalizedPhone,
        source: "whatsapp_usuarios",
        userFound: true,
        ranchoFound: Boolean(owner.fazenda_id),
        reason: "ok"
      });

      return { owner };
    }

    console.log("[BOT AUTH]", {
      fromRaw: from,
      normalized: normalizedPhone,
      source: "whatsapp_usuarios",
      userFound: true,
      ranchoFound: whatsappUsers.some((row) => Boolean(row.fazenda_id)),
      reason: blockedReason
    });

    return { owner: null, reason: blockedReason };
  }

  console.log("[BOT AUTH]", {
    fromRaw: from,
    normalized: normalizedPhone,
    source: "none",
    userFound: false,
    ranchoFound: false,
    reason: "not_registered"
  });

  return { owner: null, reason: "not_registered" };
}

export function phoneMatchesRegisteredWhatsapp(incoming: string, registered: string) {
  return whatsappNumbersMatch(incoming, registered);
}
