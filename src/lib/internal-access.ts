import type { UsuarioProfile } from "@/lib/types";

export const INTERNAL_TOOLS_FORBIDDEN_MESSAGE = "Você não tem permissão para acessar esta ferramenta interna.";

export function canAccessInternalWhatsappTools(profile: UsuarioProfile | null | undefined) {
  return profile?.is_internal_tester === true;
}
