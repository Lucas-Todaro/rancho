import { NextRequest, NextResponse } from "next/server";
import { TABLES } from "@/lib/tables";
import { invitationError, requireInvitationAdmin } from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const permission = await requireInvitationAdmin(request);
    if (!permission.ok) return permission.response;

    const { id } = await request.json();
    const inviteId = String(id || "").trim();
    if (!inviteId) return invitationError("Convite inválido.", 400);

    const { data: invite, error: inviteError } = await permission.supabase
      .from(TABLES.convites)
      .select("id,funcionario_id,status")
      .eq("id", inviteId)
      .eq("fazenda_id", permission.profile.fazenda_id)
      .maybeSingle();

    if (inviteError) throw new Error(inviteError.message);
    if (!invite) return invitationError("Convite não encontrado.", 404);
    if (invite.status !== "pendente") return invitationError("Este convite não está pendente.", 400);

    const { error } = await permission.supabase
      .from(TABLES.convites)
      .update({ status: "cancelado" })
      .eq("id", invite.id);

    if (error) throw new Error(error.message);

    if (invite.funcionario_id) {
      await permission.supabase
        .from(TABLES.funcionarios)
        .update({ convite_status: "cancelado" })
        .eq("id", invite.funcionario_id)
        .eq("fazenda_id", permission.profile.fazenda_id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Invitation cancel]", error);
    return invitationError("Não foi possível cancelar o convite.", 500);
  }
}
