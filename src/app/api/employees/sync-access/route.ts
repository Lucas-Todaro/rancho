import { NextRequest, NextResponse } from "next/server";
import { TABLES } from "@/lib/tables";
import { invitationError, requireInvitationAdmin } from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const permission = await requireInvitationAdmin(request);
    if (!permission.ok) return permission.response;

    const { employeeId, forceDisabled } = await request.json();
    const id = String(employeeId || "").trim();
    if (!id) return invitationError("Funcionário inválido.", 400);

    const { data: employee, error: employeeError } = await permission.supabase
      .from(TABLES.funcionarios)
      .select("id,fazenda_id,usuario_id,ativo,deleted_at")
      .eq("id", id)
      .eq("fazenda_id", permission.profile.fazenda_id)
      .maybeSingle();

    if (employeeError) throw new Error(employeeError.message);
    if (!employee) return invitationError("Funcionário não encontrado.", 404);

    if (!employee.usuario_id) {
      return NextResponse.json({ ok: true, changed: false, reason: "without_panel_user" });
    }

    const enabled = forceDisabled === true ? false : employee.ativo !== false && !employee.deleted_at;
    if (!enabled && employee.usuario_id === permission.user.id) {
      return invitationError("VocÃª nÃ£o pode desativar seu prÃ³prio acesso por esta tela.", 400);
    }

    console.log("[Employee access sync]", {
      employeeId: employee.id,
      usuarioId: employee.usuario_id,
      fazendaId: employee.fazenda_id,
      enabled
    });

    const { error: userError } = await permission.supabase
      .from(TABLES.usuarios)
      .update({ ativo: enabled })
      .eq("id", employee.usuario_id)
      .eq("fazenda_id", permission.profile.fazenda_id);

    if (userError) throw new Error(userError.message);

    return NextResponse.json({ ok: true, changed: true, enabled });
  } catch (error) {
    console.error("[Employee access sync]", error);
    return invitationError("Não foi possível sincronizar o acesso ao sistema deste funcionário.", 500);
  }
}
