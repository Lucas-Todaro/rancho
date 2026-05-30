"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LogIn, PawPrint } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, profile, loading, isDemo, error: authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && (isDemo || profile)) router.replace("/dashboard");
  }, [isDemo, loading, profile, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-emerald-900 p-8 text-white">
          <div className="inline-flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 font-black">
            <PawPrint className="h-5 w-5" />
            Rancho Pro
          </div>
          <h1 className="mt-8 text-4xl font-black tracking-tight">Entre para acessar sua fazenda.</h1>
          <p className="mt-4 text-emerald-100">
            O login usa Supabase Auth. Depois de autenticar, o app consulta a tabela usuarios para descobrir a fazenda e aplicar o RLS corretamente.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Acesso seguro</p>
            <h2 className="mt-2 text-2xl font-black">Login</h2>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-bold">E-mail</span>
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </label>

          <label className="block space-y-2">
            <span className="text-sm font-bold">Senha</span>
            <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" />
          </label>

          {error || authError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
              {error || authError}
            </div>
          ) : null}

          <button className="btn btn-primary w-full" type="submit" disabled={busy || loading}>
            <LogIn className="h-4 w-4" />
            {busy ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
