"use client";

import { useAuth } from "@/lib/auth-context";
import { canAccessInternalWhatsappTools } from "@/lib/internal-access";

export function useInternalTester() {
  const { profile } = useAuth();
  return canAccessInternalWhatsappTools(profile);
}
