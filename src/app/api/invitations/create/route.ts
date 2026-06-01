import { NextRequest, NextResponse } from "next/server";
import { TABLES } from "@/lib/tables";
import {
  canInviteRole,
  createInvitationToken,
  hashInvitationToken,
  invitationError,
  invitationExpiresAt,
  invitationLink,
  isValidInviteEmail,
  normalizeInviteEmail,
  normalizeInviteRole,
  requireInvitationAdmin
} from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createInviteErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || "");

  if (/contato_whatsapp|null value|not-null constraint/i.test(message)) {
    return "A tabela de funcionários ainda exige WhatsApp para convites do sistema. Execute a migration 20260601004000_allow_system_invites_without_whatsapp.sql no Supabase e tente novamente.";
  }

  if (/convites|tipo_acesso|papel_sistema|convite_status|schema cache|column|relation/i.test(message)) {
    return "A estrutura de convites ainda não está completa no Supabase. Execute as migrations de convites e tente novamente.";
  }

  if (/duplicate key|unique constraint|23505/i.test(message)) {
    return "Já existe um convite pendente ou cadastro com esses dados. Atualize a lista e tente novamente.";
  }

  return "Não foi possível criar o convite agora. Tente novamente.";
}

export async function POST(request: NextRequest) {
  let createdEmployeeId: string | null = null;

  try {
    const permission = await requireInvitationAdmin(request);
    if (!permission.ok) return permission.response;

    const body = await request.json();
    const nome = asText(body.nome || body.name);
    const email = normalizeInviteEmail(body.email);
    const cargo = asText(body.cargo || body.funcao) || "Funcionário";
    const papel = normalizeInviteRole(body.role || body.papel);

    if (!nome) return invitationError("Informe o nome do funcionário.");
    if (!isValidInviteEmail(email)) return invitationError("Informe um e-mail válido.");
    if (!canInviteRole(permission.profile.papel, papel)) {
      return invitationError("Você não tem permissão para convidar este tipo de usuário.", 403);
    }

    await permission.supabase
      .from(TABLES.convites)
      .update({ status: "cancelado" })
      .eq("fazenda_id", permission.profile.fazenda_id)
      .eq("email", email)
      .eq("status", "pendente");

    const employeePayload = {
      fazenda_id: permission.profile.fazenda_id,
      nome,
      funcao: cargo,
      email,
      tipo_acesso: "sistema",
      papel_sistema: papel,
      convite_status: "pendente",
      ativo: true
    };

    const { data: employee, error: employeeError } = await permission.supabase
      .from(TABLES.funcionarios)
      .insert(employeePayload)
      .select("id")
      .single();

    if (employeeError) throw new Error(employeeError.message);
    createdEmployeeId = employee.id;

    const token = createInvitationToken();
    const tokenHash = hashInvitationToken(token);
    const expiresAt = invitationExpiresAt();

    const { data: invite, error: inviteError } = await permission.supabase
      .from(TABLES.convites)
      .insert({
        fazenda_id: permission.profile.fazenda_id,
        funcionario_id: employee.id,
        email,
        nome,
        cargo,
        papel,
        status: "pendente",
        token_hash: tokenHash,
        invited_by: permission.user.id,
        expires_at: expiresAt
      })
      .select("id,email,nome,cargo,papel,status,expires_at,funcionario_id")
      .single();

    if (inviteError) throw new Error(inviteError.message);

    return NextResponse.json({
      ok: true,
      invite,
      inviteLink: invitationLink(request, token),
      emailSent: false,
      message: "Convite criado com sucesso. Copie o link abaixo e envie para o funcionário."
    });
  } catch (error) {
    console.error("[Invitation create]", error);
    if (createdEmployeeId) {
      const permission = await requireInvitationAdmin(request).catch(() => null);
      if (permission?.ok) {
        await permission.supabase.from(TABLES.funcionarios).delete().eq("id", createdEmployeeId);
      }
    }

    return invitationError(createInviteErrorMessage(error), 500);
  }
}
