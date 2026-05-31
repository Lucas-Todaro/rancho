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

async function findWhatsAppUser(supabase: SupabaseAdmin, incomingCandidates: Set<string>) {
  const { data, error } = await supabase
    .from(TABLES.whatsappUsuarios)
    .select("id,fazenda_id,usuario_id,funcionario_id,telefone_e164,nome_exibicao,ativo")
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []).find((row) => matchesIncomingPhone(row.telefone_e164, incomingCandidates)) || null;
}

async function linkedEmployeeIsActive(supabase: SupabaseAdmin, employeeId?: string | null, fazendaId?: string | null) {
  if (!employeeId) return true;

  const { data, error } = await supabase
    .from(TABLES.funcionarios)
    .select("id,ativo,deleted_at,fazenda_id")
    .eq("id", employeeId)
    .eq("fazenda_id", fazendaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return Boolean(data && data.ativo !== false && !data.deleted_at);
}

export async function resolveWhatsAppOwner(supabase: SupabaseAdmin, from: string): Promise<ResolveWhatsAppOwnerResult> {
  const normalizedPhone = normalizeWhatsappNumber(from);
  const incomingCandidates = new Set(whatsappNumberCandidates(from));

  const whatsappUser = await findWhatsAppUser(supabase, incomingCandidates);
  if (whatsappUser) {
    if (whatsappUser.ativo === false) {
      console.log("[BOT AUTH]", {
        fromRaw: from,
        normalized: normalizedPhone,
        source: "whatsapp_usuarios",
        userFound: true,
        ranchoFound: Boolean(whatsappUser.fazenda_id),
        reason: "user_inactive"
      });

      return { owner: null, reason: "user_inactive" };
    }

    const farmError = await assertActiveFarm(supabase, whatsappUser.fazenda_id as string | null);
    const inactiveLinkedEmployee = !farmError && !(await linkedEmployeeIsActive(
      supabase,
      whatsappUser.funcionario_id as string | null,
      whatsappUser.fazenda_id as string | null
    ));
    const owner = farmError || inactiveLinkedEmployee ? null : {
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
      ranchoFound: Boolean(owner?.fazenda_id),
      reason: farmError || (inactiveLinkedEmployee ? "user_inactive" : "ok")
    });

    return farmError
      ? { owner: null, reason: farmError }
      : inactiveLinkedEmployee
        ? { owner: null, reason: "user_inactive" }
        : { owner };
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
