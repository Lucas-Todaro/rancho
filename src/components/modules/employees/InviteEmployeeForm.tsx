"use client";

import { Clipboard, Send, X } from "lucide-react";
import { useState } from "react";
import type { Session } from "@supabase/supabase-js";

type InviteResult = {
  inviteLink: string;
  message: string;
};

const roleDescriptions = {
  funcionario: {
    title: "Funcionário",
    text: "Acessa apenas as rotinas operacionais liberadas, como consultas e registros do dia a dia."
  },
  gerente: {
    title: "Gerente",
    text: "Pode acompanhar a operação da fazenda e gerenciar cadastros do rancho, mas não deve ter controle total administrativo."
  },
  admin: {
    title: "Administrador",
    text: "Tem acesso amplo ao sistema, incluindo gestão de funcionários, convites, WhatsApp e configurações do rancho."
  }
};

export function InviteEmployeeForm({
  busy,
  session,
  onClose,
  onCreated
}: {
  busy?: boolean;
  session: Session | null;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [role, setRole] = useState("funcionario");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!nome.trim() || !email.trim()) {
      setError("Informe nome e e-mail para criar o convite.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/invitations/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({ nome, email, cargo, role })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível criar o convite.");

      setResult({ inviteLink: data.inviteLink, message: data.message || "Convite criado com sucesso." });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar o convite.");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyInviteLink() {
    if (!result?.inviteLink) return;
    await navigator.clipboard.writeText(result.inviteLink);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[calc(100dvh-1.5rem)] w-full max-w-3xl animate-fade-in overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Convidar funcionário</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              O funcionário receberá um link para criar a própria senha. Nenhuma senha é definida pelo administrador.
            </p>
          </div>
          <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" type="button" onClick={onClose} title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold">Nome *</span>
            <input className="input" value={nome} onChange={(event) => setNome(event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">E-mail *</span>
            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Cargo / função</span>
            <input className="input" value={cargo} onChange={(event) => setCargo(event.target.value)} placeholder="Ex: Ordenhador" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Permissão</span>
            <select className="input" value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="funcionario">Funcionário</option>
              <option value="gerente">Gerente</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">O que cada permissão libera</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {Object.entries(roleDescriptions).map(([key, item]) => (
              <button
                key={key}
                className={`rounded-lg border p-3 text-left transition ${role === key ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/35" : "border-slate-200 bg-white/70 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/60"}`}
                type="button"
                onClick={() => setRole(key)}
              >
                <strong className="block text-sm text-slate-950 dark:text-white">{item.title}</strong>
                <span className="mt-2 block text-xs leading-relaxed text-slate-600 dark:text-slate-300">{item.text}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            O funcionário só cria a própria senha pelo link do convite. O administrador nunca define a senha dele.
          </p>
        </div>

        {result ? (
          <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
            <strong>{result.message}</strong>
            <p className="mt-2 break-all rounded-md bg-white/70 p-3 font-mono text-xs dark:bg-slate-950/70">{result.inviteLink}</p>
            <button className="btn btn-secondary mt-3" type="button" onClick={copyInviteLink}>
              <Clipboard className="h-4 w-4" /> Copiar link
            </button>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={busy || submitting}>
            <Send className="h-4 w-4" /> {submitting ? "Criando convite..." : "Criar convite"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Fechar</button>
        </div>
      </form>
    </div>
  );
}
