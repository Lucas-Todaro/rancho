import type { UsuarioProfile } from "@/lib/types";

export const PLATFORM_ADMIN_FORBIDDEN_MESSAGE = "Você não tem permissão para acessar esta área.";

const platformRoles = new Set(["super_admin", "platform_admin"]);

export function canAccessPlatformAdmin(profile: UsuarioProfile | null | undefined) {
  if (!profile?.ativo) return false;
  return profile.is_platform_admin === true || platformRoles.has(String(profile.papel || ""));
}
