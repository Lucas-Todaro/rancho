import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import { hashInvitationToken, invitationError } from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token")?.trim() || "";
    if (!token) return invitationError("Convite inválido.", 400);

    const supabase = getSupabaseAdmin();
    if (!supabase) return invitationError("Supabase server-side não configurado.", 503);

    const { data: invite, error } = await supabase
      .from(TABLES.convites)
      .select("id,fazenda_id,email,nome,cargo,papel,status,expires_at,accepted_at")
      .eq("token_hash", hashInvitationToken(token))
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!invite) return invitationError("Convite inválido.", 404);

    if (invite.status === "aceito") return invitationError("Este convite já foi utilizado.", 409);
    if (invite.status === "cancelado") return invitationError("Convite inválido.", 410);

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await supabase.from(TABLES.convites).update({ status: "expirado" }).eq("id", invite.id);
      return invitationError("Este convite expirou. Peça um novo convite ao administrador.", 410);
    }

    if (invite.status !== "pendente") return invitationError("Convite inválido.", 400);

    const { data: farm, error: farmError } = await supabase
      .from(TABLES.fazendas)
      .select("id,nome,ativa")
      .eq("id", invite.fazenda_id)
      .maybeSingle();

    if (farmError) throw new Error(farmError.message);
    if (!farm || farm.ativa === false) return invitationError("Este rancho não está ativo.", 403);

    return NextResponse.json({
      ok: true,
      convite: {
        email: invite.email,
        nome: invite.nome,
        cargo: invite.cargo,
        papel: invite.papel,
        expires_at: invite.expires_at,
        fazenda_nome: farm.nome
      }
    });
  } catch (error) {
    console.error("[Invitation validate]", error);
    return invitationError("Não foi possível validar o convite. Tente novamente.", 500);
  }
}
