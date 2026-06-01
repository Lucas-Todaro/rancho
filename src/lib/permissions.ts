import type { UsuarioProfile } from "@/lib/types";
import { canAccessPlatformAdmin } from "@/lib/platform-admin";

const MANAGER_ROLES = new Set(["dono", "admin", "gerente"]);
const EMPLOYEE_VIEW_PATHS = new Set([
  "/dashboard",
  "/rebanho",
  "/lotes",
  "/genealogia",
  "/eventos",
  "/producao",
  "/estoque",
  "/relatorios",
  "/suporte",
  "/configuracoes"
]);

export const PERMISSION_DENIED_MESSAGE = "Você não tem permissão para realizar esta ação.";

export function isManager(profile?: UsuarioProfile | null) {
  return MANAGER_ROLES.has(String(profile?.papel || ""));
}

export function canManageData(profile?: UsuarioProfile | null) {
  return isManager(profile) || canAccessPlatformAdmin(profile);
}

export function canViewPath(profile: UsuarioProfile | null | undefined, pathname: string) {
  if (!profile) return false;
  if (canAccessPlatformAdmin(profile)) return true;
  if (String(profile.papel || "") === "bot_only") return false;
  if (isManager(profile)) return pathname !== "/admin-interno";
  return EMPLOYEE_VIEW_PATHS.has(pathname) || Array.from(EMPLOYEE_VIEW_PATHS).some((path) => path !== "/dashboard" && pathname.startsWith(path));
}
