import { NextRequest, NextResponse } from "next/server";
import { PLATFORM_ADMIN_FORBIDDEN_MESSAGE } from "@/lib/platform-admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";

export type PlatformAdminResult =
  | { ok: true; supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>; user: { id: string; email?: string }; profile: AnyRecord }
  | { ok: false; response: NextResponse };

const platformRoles = new Set(["super_admin", "platform_admin"]);

export function platformAdminError(message: string, status = 403) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function requirePlatformAdmin(request: NextRequest): Promise<PlatformAdminResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, response: platformAdminError("Supabase server-side não configurado.", 503) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, response: platformAdminError(PLATFORM_ADMIN_FORBIDDEN_MESSAGE, 403) };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user?.id) {
    return { ok: false, response: platformAdminError(PLATFORM_ADMIN_FORBIDDEN_MESSAGE, 403) };
  }

  const { data: profile, error: profileError } = await supabase
    .from(TABLES.usuarios)
    .select("id,fazenda_id,nome,papel,ativo,is_platform_admin")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    if (/is_platform_admin|schema cache|column/i.test(profileError.message)) {
      return {
        ok: false,
        response: platformAdminError("A estrutura de admin interno ainda não foi aplicada no Supabase.", 503)
      };
    }

    throw new Error(profileError.message);
  }

  const isPlatformAdmin = profile?.is_platform_admin === true || platformRoles.has(String(profile?.papel || ""));
  if (!profile?.ativo || !isPlatformAdmin) {
    return { ok: false, response: platformAdminError(PLATFORM_ADMIN_FORBIDDEN_MESSAGE, 403) };
  }

  return { ok: true, supabase, user: { id: authData.user.id, email: authData.user.email }, profile: profile as AnyRecord };
}
