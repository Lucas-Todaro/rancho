"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { LogIn, PawPrint, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";
type Health = { supabasePublic: boolean; supabaseServer: boolean; meta: boolean };

export default function LoginPage() {
  const router = useRouter();
  const { signIn, profile, loading, isDemo, error: authError } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nome, setNome] = useState("");
  const [fazendaNome, setFazendaNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    if (!loading && (isDemo || profile)) router.replace("/dashboard");
  }, [isDemo, loading, profile, router]);

  useEffect(() => {
    fetch("/api/health").then((response) => response.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (!email.trim() || !password.trim()) {
        throw new Error("Preencha e-mail e senha para entrar.");
      }

      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel entrar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (!nome.trim() || !fazendaNome.trim() || !email.trim() || !password.trim()) {
        throw new Error("Preencha seu nome, nome da fazenda, e-mail e senha.");
      }

      if (password.length < 6) {
        throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      }

      if (health && !health.supabaseServer) {
        throw new Error("Para criar conta automaticamente, preencha uma SUPABASE_SERVICE_ROLE_KEY valida no .env.local e reinicie o servidor.");
      }

      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, fazendaNome, telefone, email, password })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Nao foi possivel criar a conta.");
      }

      setSuccess("Conta criada. Entrando...");
      await signIn(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar a conta.");
    } finally {
      setBusy(false);
    }
  }

  const visibleError = error || (mode === "login" ? authError : "");

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="bg-emerald-900 p-8 text-white">
          <div className="inline-flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2 font-black">
            <PawPrint className="h-5 w-5" />
            Rancho Pro
          </div>
          <h1 className="mt-8 text-4xl font-black tracking-tight">
            {mode === "login" ? "Entre para acessar sua fazenda." : "Crie sua fazenda em poucos passos."}
          </h1>
          <p className="mt-4 text-emerald-100">
            {mode === "login"
              ? "O login usa Supabase Auth e aplica acesso por fazenda automaticamente."
              : "O cadastro cria a fazenda, seu usuario admin e ja deixa tudo vinculado para o primeiro acesso."}
          </p>
        </div>

        <div className="p-8">
          <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-black dark:bg-slate-800">
            <button
              className={cn("rounded-md px-3 py-2", mode === "login" && "bg-white text-emerald-800 shadow-sm dark:bg-slate-950 dark:text-emerald-200")}
              type="button"
              onClick={() => { setMode("login"); setError(""); setSuccess(""); }}
            >
              Entrar
            </button>
            <button
              className={cn("rounded-md px-3 py-2", mode === "register" && "bg-white text-emerald-800 shadow-sm dark:bg-slate-950 dark:text-emerald-200")}
              type="button"
              onClick={() => { setMode("register"); setError(""); setSuccess(""); }}
            >
              Criar conta
            </button>
          </div>

          {mode === "login" ? (
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
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5" noValidate>
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Novo cadastro</p>
                <h2 className="mt-2 text-2xl font-black">Criar conta</h2>
              </div>

              {health && !health.supabaseServer ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Cadastro automatico ainda nao esta liberado. Preencha a SUPABASE_SERVICE_ROLE_KEY no .env.local e reinicie o servidor.
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-bold">Seu nome</span>
                  <input className="input" value={nome} onChange={(event) => setNome(event.target.value)} autoComplete="name" placeholder="Ex: Luiz" />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-bold">Nome da fazenda</span>
                  <input className="input" value={fazendaNome} onChange={(event) => setFazendaNome(event.target.value)} placeholder="Ex: Fazenda Boa Vista" />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-bold">WhatsApp</span>
                <input className="input" value={telefone} onChange={(event) => setTelefone(event.target.value)} placeholder="Ex: 5585999990000" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-bold">E-mail</span>
                <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-bold">Senha</span>
                <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
              </label>

              {visibleError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                  {visibleError}
                </div>
              ) : null}

              {success ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
                  {success}
                </div>
              ) : null}

              <button className="btn btn-primary w-full" type="submit" disabled={busy || loading || Boolean(health && !health.supabaseServer)}>
                <UserPlus className="h-4 w-4" />
                {busy ? "Criando..." : health && !health.supabaseServer ? "Service role pendente" : "Criar conta e entrar"}
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
