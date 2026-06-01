import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";

const ADMIN_ROLES = new Set(["dono", "admin", "gerente"]);
const INVITE_ROLES = new Set(["admin", "gerente", "funcionario"]);

export function normalizeInviteEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export function isValidInviteEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createInvitationToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function invitationExpiresAt(days = 7) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function normalizeInviteRole(value: unknown) {
  const role = String(value || "funcionario").trim().toLowerCase();
  return INVITE_ROLES.has(role) ? role : "funcionario";
}

export function canInviteRole(currentRole: unknown, targetRole: string) {
  const role = String(currentRole || "");
  if (role === "dono") return true;
  if (role === "admin") return targetRole !== "dono";
  if (role === "gerente") return targetRole === "funcionario";
  return false;
}

export function invitationLink(request: NextRequest, token: string) {
  const origin = request.headers.get("origin") || request.nextUrl.origin;
  return `${origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
}

export function invitationError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function requireInvitationAdmin(request: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { ok: false as const, response: invitationError("Supabase server-side não configurado.", 503) };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { ok: false as const, response: invitationError("Você não tem permissão para acessar esta área.", 403) };
  }

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user?.id) {
    return { ok: false as const, response: invitationError("Você não tem permissão para acessar esta área.", 403) };
  }

  const { data: profile, error: profileError } = await supabase
    .from(TABLES.usuarios)
    .select("id,fazenda_id,nome,papel,ativo")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile?.ativo || !ADMIN_ROLES.has(String(profile.papel))) {
    return { ok: false as const, response: invitationError("Você não tem permissão para convidar funcionários.", 403) };
  }

  const { data: farm, error: farmError } = await supabase
    .from(TABLES.fazendas)
    .select("id,nome,ativa")
    .eq("id", profile.fazenda_id)
    .maybeSingle();

  if (farmError) throw new Error(farmError.message);
  if (!farm || farm.ativa === false) {
    return { ok: false as const, response: invitationError("Este rancho não está ativo.", 403) };
  }

  return {
    ok: true as const,
    supabase,
    user: authData.user,
    profile: profile as AnyRecord,
    farm: farm as AnyRecord
  };
}

export async function findAuthUserByEmail(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, email: string) {
  const target = normalizeInviteEmail(email);
  const perPage = 1000;

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);

    const found = data.users.find((user) => normalizeInviteEmail(user.email) === target);
    if (found) return found;
    if (data.users.length < perPage) return null;
  }

  return null;
}
