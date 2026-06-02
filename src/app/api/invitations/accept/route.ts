import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import { normalizeWhatsappNumber, whatsappNumbersMatch } from "@/lib/phone";
import { findAuthUserByEmail, hashInvitationToken, invitationError } from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidBotOwnerPhone(value: string | number | null | undefined) {
  const phone = normalizeWhatsappNumber(value);
  if (phone.length !== 13 || !phone.startsWith("55")) return false;
  const national = phone.slice(2);
  const ddd = Number(national.slice(0, 2));
  return ddd >= 11 && ddd <= 99 && national[2] === "9" && !/^(\d)\1+$/.test(national);
}

function acceptInviteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (/usuarios_papel_check|violates check constraint.*papel|papel.*violates check constraint/i.test(message)) {
    return "A estrutura do Supabase ainda não permite cadastrar o dono da fazenda. Execute a migration 20260602001000_allow_owner_role_in_users.sql e tente novamente.";
  }

  return "Não foi possível aceitar o convite. Tente novamente.";
}

async function syncOwnerWhatsAppUser(input: {
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>;
  fazendaId: string;
  usuarioId: string;
  nome: string;
  telefone?: string | null;
}) {
  const phone = normalizeWhatsappNumber(input.telefone);
  if (!isValidBotOwnerPhone(phone)) return;

  const payload = {
    fazenda_id: input.fazendaId,
    telefone_e164: phone,
    usuario_id: input.usuarioId,
    funcionario_id: null,
    nome_exibicao: input.nome || "Dono",
    papel_bot: "admin",
    ativo: true
  };

  const [{ data: byUser, error: byUserError }, { data: byPhone, error: byPhoneError }] = await Promise.all([
    input.supabase
      .from(TABLES.whatsappUsuarios)
      .select("id,usuario_id,telefone_e164")
      .eq("fazenda_id", input.fazendaId)
      .eq("usuario_id", input.usuarioId),
    input.supabase
      .from(TABLES.whatsappUsuarios)
      .select("id,usuario_id,telefone_e164")
      .eq("fazenda_id", input.fazendaId)
      .eq("telefone_e164", phone)
  ]);

  if (byUserError) throw new Error(byUserError.message);
  if (byPhoneError) throw new Error(byPhoneError.message);

  const rows = [...(byUser || []), ...(byPhone || [])].filter((row, index, allRows) => {
    return row.id && allRows.findIndex((item) => item.id === row.id) === index;
  });
  const target = rows.find((row) => row.usuario_id === input.usuarioId) || rows.find((row) => whatsappNumbersMatch(row.telefone_e164, phone));

  if (target?.id) {
    const { error } = await input.supabase.from(TABLES.whatsappUsuarios).update(payload).eq("id", target.id);
    if (error) throw new Error(error.message);
    await Promise.all(rows
      .filter((row) => row.id !== target.id)
      .map((row) => input.supabase.from(TABLES.whatsappUsuarios).update({ ativo: false }).eq("id", row.id)));
    return;
  }

  const { error } = await input.supabase.from(TABLES.whatsappUsuarios).insert(payload);
  if (error) throw new Error(error.message);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return invitationError("Supabase server-side não configurado.", 503);

    const body = await request.json();
    const token = asText(body.token);
    const password = asText(body.password);
    const nome = asText(body.nome || body.name);

    if (!token) return invitationError("Convite inválido.", 400);
    if (password.length < 6) return invitationError("A senha precisa ter pelo menos 6 caracteres.", 400);

    const { data: invite, error: inviteError } = await supabase
      .from(TABLES.convites)
      .select("id,fazenda_id,funcionario_id,email,nome,cargo,papel,status,expires_at")
      .eq("token_hash", hashInvitationToken(token))
      .maybeSingle();

    if (inviteError) throw new Error(inviteError.message);
    if (!invite) return invitationError("Convite inválido.", 404);
    if (invite.status === "aceito") return invitationError("Este convite já foi utilizado.", 409);
    if (invite.status === "cancelado") return invitationError("Convite inválido.", 410);

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabase.from(TABLES.convites).update({ status: "expirado" }).eq("id", invite.id);
      return invitationError("Este convite expirou. Peça um novo convite ao administrador.", 410);
    }

    if (invite.status !== "pendente") return invitationError("Convite inválido.", 400);

    const finalName = nome || invite.nome || invite.email;
    const { data: farm, error: farmError } = await supabase
      .from(TABLES.fazendas)
      .select("id,dono_telefone")
      .eq("id", invite.fazenda_id)
      .maybeSingle();

    if (farmError) throw new Error(farmError.message);

    let authUser = await findAuthUserByEmail(supabase, invite.email);

    if (authUser) {
      const { data: existingProfile, error: existingProfileError } = await supabase
        .from(TABLES.usuarios)
        .select("id,fazenda_id")
        .eq("id", authUser.id)
        .maybeSingle();

      if (existingProfileError) throw new Error(existingProfileError.message);
      if (existingProfile && existingProfile.fazenda_id !== invite.fazenda_id) {
        return invitationError("Este e-mail já está vinculado a outro rancho. Use outro e-mail ou fale com o suporte.", 409);
      }

      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(authUser.id, {
        password,
        email_confirm: true,
        user_metadata: { nome: finalName }
      });
      if (updateAuthError) throw new Error(updateAuthError.message);
    } else {
      const { data: createdAuth, error: createAuthError } = await supabase.auth.admin.createUser({
        email: invite.email,
        password,
        email_confirm: true,
        user_metadata: { nome: finalName }
      });

      if (createAuthError || !createdAuth.user) {
        throw new Error(createAuthError?.message || "Não foi possível criar o usuário.");
      }

      authUser = createdAuth.user;
    }

    const profilePayload = {
      id: authUser.id,
      fazenda_id: invite.fazenda_id,
      nome: finalName,
      telefone: isValidBotOwnerPhone(farm?.dono_telefone) ? normalizeWhatsappNumber(farm?.dono_telefone).slice(2) : "",
      papel: invite.papel,
      ativo: true
    };

    const { error: profileError } = await supabase
      .from(TABLES.usuarios)
      .upsert(profilePayload, { onConflict: "id" });

    if (profileError) throw new Error(profileError.message);

    if (invite.papel === "dono") {
      await syncOwnerWhatsAppUser({
        supabase,
        fazendaId: invite.fazenda_id,
        usuarioId: authUser.id,
        nome: finalName,
        telefone: farm?.dono_telefone as string | null | undefined
      });
    }

    if (invite.funcionario_id) {
      const { error: employeeError } = await supabase
        .from(TABLES.funcionarios)
        .update({
          usuario_id: authUser.id,
          email: invite.email,
          nome: finalName,
          tipo_acesso: "sistema",
          papel_sistema: invite.papel,
          convite_status: "aceito",
          ativo: true
        })
        .eq("id", invite.funcionario_id)
        .eq("fazenda_id", invite.fazenda_id);

      if (employeeError) throw new Error(employeeError.message);
    }

    const { error: acceptError } = await supabase
      .from(TABLES.convites)
      .update({
        status: "aceito",
        accepted_at: new Date().toISOString(),
        accepted_by: authUser.id
      })
      .eq("id", invite.id)
      .eq("status", "pendente");

    if (acceptError) throw new Error(acceptError.message);

    return NextResponse.json({ ok: true, message: "Convite aceito. Entre com seu e-mail e senha." });
  } catch (error) {
    console.error("[Invitation accept]", error);
    return invitationError(acceptInviteErrorMessage(error), 500);
  }
}
