"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LogIn, PawPrint, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { getFriendlyErrorMessage } from "@/lib/errors";

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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error("Preencha e-mail e senha para entrar.");
      }

      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível entrar."));
    } finally {
      setBusy(false);
    }
  }

  const visibleError = error || authError;

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
            O acesso ao Rancho é fechado e liberado apenas por convite do administrador da fazenda.
          </p>
          <div className="mt-8 rounded-lg border border-white/15 bg-white/10 p-4 text-sm text-emerald-50">
            <div className="flex items-center gap-2 font-black">
              <ShieldCheck className="h-4 w-4" />
              Cadastro público fechado
            </div>
            <p className="mt-2">
              Se você ainda não tem acesso, peça ao administrador para enviar um convite ou cadastrar seu WhatsApp no bot.
            </p>
          </div>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin} className="space-y-5" noValidate>
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Acesso seguro</p>
              <h2 className="mt-2 text-2xl font-black">Login</h2>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-bold">E-mail</span>
              <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold">Senha</span>
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
            </label>

            {visibleError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {visibleError}
              </div>
            ) : null}

            <button className="btn btn-primary w-full" type="submit" disabled={busy || loading}>
              <LogIn className="h-4 w-4" />
              {busy ? "Entrando..." : "Entrar"}
            </button>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <strong className="block text-slate-900 dark:text-white">Precisa de acesso?</strong>
              <span className="mt-1 block">Solicite um convite ao administrador do Rancho.</span>
              <a className="mt-3 inline-flex font-black text-emerald-700 hover:text-emerald-800 dark:text-emerald-300" href="mailto:suporte@rancho.app">
                Falar com suporte
              </a>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
