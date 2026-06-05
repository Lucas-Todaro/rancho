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
  const message = errorMessage(error);
  return /column|schema cache|invalid input syntax|invalid input value|22P02/i.test(message);
}

async function deleteByColumn(supabase: SupabaseClient, table: string, column: string, value: string, farmId?: string) {
  let query = supabase.from(table).delete().eq(column, value);
  if (farmId) query = query.eq("fazenda_id", farmId);

  const { error } = await query;
  if (error && !isIgnorableCleanupError(error)) throw new Error(error.message);
}

async function selectIdsByColumn(supabase: SupabaseClient, table: string, column: string, value: string, farmId?: string) {
  let query = supabase.from(table).select("id").eq(column, value);
  if (farmId) query = query.eq("fazenda_id", farmId);

  const { data, error } = await query;
  if (error) {
    if (isIgnorableCleanupError(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((row: { id?: string }) => String(row.id || "")).filter(Boolean);
}

async function deleteNotificationsForId(supabase: SupabaseClient, id: string, farmId?: string) {
  await deleteByColumn(supabase, TABLES.notificacoes, "entidade_id", id, farmId);
  await deleteByColumn(supabase, TABLES.notificacoes, "registro_id", id, farmId);
  await deleteByColumn(supabase, TABLES.notificacoes, "referencia_id", id, farmId);
  await deleteByColumn(supabase, TABLES.alertas, "entidade_id", id, farmId);
  await deleteByColumn(supabase, TABLES.alertas, "registro_id", id, farmId);
  await deleteByColumn(supabase, TABLES.alertas, "referencia_id", id, farmId);
}

async function deleteBotNotificationByDedupeKey(supabase: SupabaseClient, table: string, id: string, farmId?: string) {
  await deleteByColumn(supabase, TABLES.notificacoes, "dedupe_key", `bot:${table}:${id}`, farmId);
}

export async function POST(request: NextRequest) {
  try {
    const permission = await requireInvitationAdmin(request);
    if (!permission.ok) return permission.response;

    const { animalId } = await request.json();
    const id = String(animalId || "").trim();
    if (!id) return invitationError("Animal inválido.", 400);

    const { data: animal, error: animalError } = await permission.supabase
      .from(TABLES.animais)
      .select("id,fazenda_id")
      .eq("id", id)
      .eq("fazenda_id", permission.profile.fazenda_id)
      .maybeSingle();

    if (animalError) throw new Error(animalError.message);
    if (!animal) return invitationError("Animal não encontrado.", 404);

    const { data: events, error: eventsError } = await permission.supabase
      .from(TABLES.eventosAnimal)
      .select("id")
      .eq("fazenda_id", permission.profile.fazenda_id)
      .eq("animal_id", id);

    if (eventsError) throw new Error(eventsError.message);

    const eventIds = (events || []).map((event: { id?: string }) => String(event.id || "")).filter(Boolean);
    const farmId = permission.profile.fazenda_id;
    const milkingIds = await selectIdsByColumn(permission.supabase, TABLES.ordenhas, "animal_id", id, farmId);
    const financeIds = new Set<string>();

    for (const eventId of eventIds) {
      const bySourceId = await selectIdsByColumn(permission.supabase, TABLES.transacoesFinanceiras, "source_id", eventId, farmId);
      const byLegacyOrigin = await selectIdsByColumn(permission.supabase, TABLES.transacoesFinanceiras, "origem", `evento_animal:${eventId}`, farmId);
      [...bySourceId, ...byLegacyOrigin].forEach((financeId) => financeIds.add(financeId));
    }

    for (const linkedId of [id, ...eventIds, ...milkingIds, ...Array.from(financeIds)]) {
      await deleteNotificationsForId(permission.supabase, linkedId, farmId);
    }

    await deleteBotNotificationByDedupeKey(permission.supabase, TABLES.animais, id, farmId);
    for (const eventId of eventIds) {
      await deleteBotNotificationByDedupeKey(permission.supabase, TABLES.eventosAnimal, eventId, farmId);
      await deleteByColumn(permission.supabase, TABLES.transacoesFinanceiras, "source_id", eventId, farmId);
      await deleteByColumn(permission.supabase, TABLES.transacoesFinanceiras, "origem", `evento_animal:${eventId}`, farmId);
    }
    for (const milkingId of milkingIds) {
      await deleteBotNotificationByDedupeKey(permission.supabase, TABLES.ordenhas, milkingId, farmId);
      await deleteByColumn(permission.supabase, TABLES.estoqueMovimentacoes, "source_id", milkingId, farmId);
    }

    await deleteByColumn(permission.supabase, TABLES.ordenhas, "animal_id", id, farmId);
    await deleteByColumn(permission.supabase, TABLES.eventosAnimal, "animal_id", id, farmId);
    await deleteByColumn(permission.supabase, TABLES.alertas, "animal_id", id, farmId);
    await deleteByColumn(permission.supabase, TABLES.notificacoes, "animal_id", id, farmId);

    const { error: motherError } = await permission.supabase
      .from(TABLES.animais)
      .update({ mae_id: null })
      .eq("fazenda_id", permission.profile.fazenda_id)
      .eq("mae_id", id);
    if (motherError) throw new Error(motherError.message);

    const { error: fatherError } = await permission.supabase
      .from(TABLES.animais)
      .update({ pai_id: null })
      .eq("fazenda_id", permission.profile.fazenda_id)
      .eq("pai_id", id);
    if (fatherError) throw new Error(fatherError.message);

    const { error: deleteError } = await permission.supabase
      .from(TABLES.animais)
      .delete()
      .eq("id", id)
      .eq("fazenda_id", permission.profile.fazenda_id);

    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Animal delete]", error);
    return invitationError("Não foi possível excluir o animal e seus vínculos agora.", 500);
  }
}
