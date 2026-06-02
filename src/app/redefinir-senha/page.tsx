"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;

    async function checkSession() {
      if (!supabaseBrowser) {
        setError("Supabase Auth não está configurado neste ambiente.");
        setLoading(false);
        return;
      }

      try {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error: exchangeError } = await supabaseBrowser.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          window.history.replaceState(null, "", "/redefinir-senha");
        }

        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");
        if (accessToken && refreshToken && type === "recovery") {
          const { error: sessionError } = await supabaseBrowser.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          if (sessionError) throw sessionError;
          window.history.replaceState(null, "", "/redefinir-senha");
        }
      } catch (err) {
        if (active) {
          setError(getFriendlyErrorMessage(err, "Não foi possível validar o link de redefinição."));
          setLoading(false);
        }
        return;
      }

      const { data } = await supabaseBrowser.auth.getSession();
      if (!active) return;
      if (!data.session) {
        setError("Abra o link de redefinição pelo e-mail para criar uma nova senha.");
      }
      setLoading(false);
    }

    void checkSession();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (!supabaseBrowser) throw new Error("Supabase Auth não está configurado neste ambiente.");
      if (password.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      if (password !== confirmPassword) throw new Error("As senhas não conferem.");

      const { error: updateError } = await supabaseBrowser.auth.updateUser({ password });
      if (updateError) throw updateError;

      await supabaseBrowser.auth.signOut().catch(() => undefined);
      setSuccess("Senha alterada com sucesso. Faça login novamente.");
      window.setTimeout(() => router.replace("/login"), 1600);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível alterar a senha. Tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900 dark:bg-slate-950 dark:text-white">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-sm font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <KeyRound className="h-4 w-4" />
          Redefinir senha
        </div>
        <h1 className="mt-5 text-2xl font-black">Crie uma nova senha</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Use o link enviado por e-mail para definir uma nova senha de acesso ao Rancho.
        </p>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm font-bold text-slate-500 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Validando link...
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <label className="block space-y-2">
              <span className="text-sm font-bold">Nova senha</span>
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold">Confirmar nova senha</span>
              <input className="input" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </label>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                {success}
              </div>
            ) : null}

            <button className="btn btn-primary w-full" type="submit" disabled={busy || Boolean(success)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {busy ? "Salvando..." : "Alterar senha"}
            </button>
          </form>
        )}

        <Link className="btn btn-secondary mt-4 w-full justify-center" href="/login">
          Voltar para login
        </Link>
      </section>
    </main>
  );
}
