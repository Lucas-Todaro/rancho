"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { canViewPath } from "@/lib/permissions";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, profile, error, isDemo, session, reloadProfile } = useAuth();

  useEffect(() => {
    if (!loading && !isDemo && !profile && !error && pathname !== "/login") {
      router.replace("/login");
    }
  }, [error, isDemo, loading, pathname, profile, router]);

  function retry() {
    if (session?.user?.id) {
      void reloadProfile();
      return;
    }

    window.location.reload();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-4 font-bold">Carregando sua fazenda...</p>
        </div>
      </div>
    );
  }

  if (!isDemo && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertCircle className="h-5 w-5" />
            <strong>{error ? "Não consegui carregar agora" : "Acesso pendente"}</strong>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {error || "Entre com um usuário vinculado a uma fazenda para acessar o sistema."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {error ? <button className="btn btn-primary" type="button" onClick={retry}>Tentar novamente</button> : null}
            <Link href="/login" className="btn btn-secondary w-full">Ir para login</Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isDemo && profile && !canViewPath(profile, pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
            <AlertCircle className="h-5 w-5" />
            <strong>Acesso restrito</strong>
          </div>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            Você não tem permissão para acessar esta área.
          </p>
          <Link href="/dashboard" className="btn btn-primary mt-5 w-full">Ir para dashboard</Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
