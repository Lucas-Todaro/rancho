import { NextRequest, NextResponse } from "next/server";
import { TABLES } from "@/lib/tables";
import { invitationError, requireInvitationAdmin } from "@/lib/server/invitations";

export const dynamic = "force-dynamic";

type SupabaseClient = {
  from: (table: string) => any;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String((error as { message?: string })?.message || "");
}

function isIgnorableCleanupError(error: unknown) {
  return /column|schema cache|invalid input syntax|invalid input value|22P02|42703|42P01/i.test(errorMessage(error));
}

async function deleteByColumn(supabase: SupabaseClient, table: string, column: string, value: string, farmId?: string) {
  let query = supabase.from(table).delete().eq(column, value);
  if (farmId) query = query.eq("fazenda_id", farmId);

  const { error } = await query;
  if (error && !isIgnorableCleanupError(error)) throw new Error(error.message);
}

async function deleteNotificationsForId(supabase: SupabaseClient, id: string, farmId?: string) {
  await deleteByColumn(supabase, TABLES.notificacoes, "entidade_id", id, farmId);
  await deleteByColumn(supabase, TABLES.notificacoes, "registro_id", id, farmId);
  await deleteByColumn(supabase, TABLES.notificacoes, "referencia_id", id, farmId);
  await deleteByColumn(supabase, TABLES.alertas, "entidade_id", id, farmId);
  await deleteByColumn(supabase, TABLES.alertas, "registro_id", id, farmId);
  await deleteByColumn(supabase, TABLES.alertas, "referencia_id", id, farmId);
}

export async function POST(request: NextRequest) {
  try {
    const permission = await requireInvitationAdmin(request);
    if (!permission.ok) return permission.response;

    const { productionId } = await request.json();
    const id = String(productionId || "").trim();
    if (!id) return invitationError("Registro de produção inválido.", 400);

    const { data: production, error: productionError } = await permission.supabase
      .from(TABLES.ordenhas)
      .select("id,fazenda_id")
      .eq("id", id)
      .eq("fazenda_id", permission.profile.fazenda_id)
      .maybeSingle();

    if (productionError) throw new Error(productionError.message);
    if (!production) return invitationError("Registro de produção não encontrado.", 404);

    const farmId = permission.profile.fazenda_id;
    await deleteNotificationsForId(permission.supabase, id, farmId);
    await deleteByColumn(permission.supabase, TABLES.notificacoes, "dedupe_key", `bot:${TABLES.ordenhas}:${id}`, farmId);
    await deleteByColumn(permission.supabase, TABLES.estoqueMovimentacoes, "source_id", id, farmId);

    const { error: deleteError } = await permission.supabase
      .from(TABLES.ordenhas)
      .delete()
      .eq("id", id)
      .eq("fazenda_id", permission.profile.fazenda_id);

    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Production delete]", error);
    return invitationError("Não foi possível excluir o registro de produção agora.", 500);
  }
}
