import { NextRequest, NextResponse } from "next/server";
import { INTERNAL_TOOLS_FORBIDDEN_MESSAGE } from "@/lib/internal-access";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";

export type InternalAccessResult =
  | { ok: true; profile: AnyRecord }
  | { ok: false; response: NextResponse };

export function internalToolError(message: string, status = 403) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function requireInternalWhatsappTester(request: NextRequest): Promise<InternalAccessResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false, response: internalToolError("Supabase server-side não configurado.", 503) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false, response: internalToolError(INTERNAL_TOOLS_FORBIDDEN_MESSAGE, 403) };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user?.id) {
    return { ok: false, response: internalToolError(INTERNAL_TOOLS_FORBIDDEN_MESSAGE, 403) };
  }

  const { data: profile, error: profileError } = await supabase
    .from(TABLES.usuarios)
    .select("id,fazenda_id,ativo,is_internal_tester")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    if (/is_internal_tester|schema cache|column/i.test(profileError.message)) {
      return { ok: false, response: internalToolError(INTERNAL_TOOLS_FORBIDDEN_MESSAGE, 403) };
    }

    throw new Error(profileError.message);
  }

  if (!profile?.ativo || profile.is_internal_tester !== true) {
    return { ok: false, response: internalToolError(INTERNAL_TOOLS_FORBIDDEN_MESSAGE, 403) };
  }

  return { ok: true, profile };
}
