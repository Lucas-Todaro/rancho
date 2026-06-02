"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth-context";

export function RootProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLandingPage = pathname === "/landing" || pathname?.startsWith("/landing/");

  if (isLandingPage) return <>{children}</>;

  return <AuthProvider>{children}</AuthProvider>;
}
