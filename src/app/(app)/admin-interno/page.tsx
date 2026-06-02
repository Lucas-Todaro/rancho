"use client";

import { Building2, Copy, Loader2, Plus, RefreshCw, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { PLATFORM_ADMIN_FORBIDDEN_MESSAGE, canAccessPlatformAdmin } from "@/lib/platform-admin";
import { formatDate } from "@/lib/utils";

type OwnerInvite = {
  id: string;
  email: string;
  nome: string;
  status: string;
  expires_at: string;
  accepted_at?: string | null;
  created_at?: string | null;
};

type RanchoRow = {
  id: string;
  nome: string;
  plano: string;
  status: string;
  ativa: boolean;
  cidade?: string;
  estado?: string;
  created_at?: string;
  users_count: number;
  owner: {
    nome?: string;
    email?: string;
    usuario_id?: string | null;
  };
  owner_invite?: OwnerInvite | null;
};

type ApiResult = {
  ok?: boolean;
  error?: string;
  message?: string;
  ranchos?: RanchoRow[];
  inviteLink?: string;
  deletedUsers?: number;
};

const initialDraft = {
  nome: "",
  donoNome: "",
  donoEmail: "",
  donoTelefone: "",
  cidade: "",
  estado: "",
  plano: "mvp",
  status: "pendente"
};

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  ativo: "Ativo",
  suspenso: "Suspenso",
  cancelado: "Cancelado",
  aceito: "Aceito"
};

function statusTone(status: string): "success" | "danger" | "warning" {
  if (status === "ativo" || status === "aceito") return "success";
  if (status === "suspenso" || status === "cancelado") return "danger";
  return "warning";
}

export default function AdminInternoPage() {
  const { profile, session } = useAuth();
  const canAccess = canAccessPlatformAdmin(profile);
  const [rows, setRows] = useState<RanchoRow[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState<RanchoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const headers = useMemo(() => ({
    "Content-Type": "application/json",
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
  }), [session?.access_token]);

  const load = useCallback(async () => {
    if (!canAccess || !session?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/platform/ranchos", { headers });
      const data = await response.json().catch(() => ({})) as ApiResult;
      if (!response.ok) throw new Error(data.error || "Não foi possível carregar os ranchos.");
      setRows(data.ranchos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os ranchos.");
    } finally {
      setLoading(false);
    }
  }, [canAccess, headers, session?.access_token]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateDraft(name: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function startEdit(row: RanchoRow) {
    setEditing(row);
    setDraft({
      nome: row.nome || "",
      donoNome: row.owner?.nome || "",
      donoEmail: row.owner?.email || row.owner_invite?.email || "",
      donoTelefone: "",
      cidade: row.cidade || "",
      estado: row.estado || "",
      plano: row.plano || "mvp",
      status: row.status || "ativo"
    });
    setError("");
    setSuccess("");
    setInviteLink("");
  }

  function resetForm() {
    setEditing(null);
    setDraft(initialDraft);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAccess) return;

    setBusy(true);
    setError("");
    setSuccess("");
    setInviteLink("");

    try {
      const response = await fetch("/api/platform/ranchos", {
        method: editing ? "PATCH" : "POST",
        headers,
        body: JSON.stringify(editing ? { ...draft, action: "edit", ranchoId: editing.id } : draft)
      });
      const data = await response.json().catch(() => ({})) as ApiResult;
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar.");

      setSuccess(data.message || (editing ? "Rancho atualizado." : "Rancho criado com sucesso."));
      if (data.inviteLink) setInviteLink(data.inviteLink);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(row: RanchoRow, action: "suspend" | "reactivate" | "regenerate_owner_invite") {
    setBusy(true);
    setError("");
    setSuccess("");
    setInviteLink("");

    try {
      const response = await fetch("/api/platform/ranchos", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          action,
          ranchoId: row.id,
          donoNome: row.owner?.nome || row.owner_invite?.nome,
          donoEmail: row.owner?.email || row.owner_invite?.email
        })
      });
      const data = await response.json().catch(() => ({})) as ApiResult;
      if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação.");

      setSuccess(data.message || "Ação concluída.");
      if (data.inviteLink) setInviteLink(data.inviteLink);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível concluir a ação.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteRancho(row: RanchoRow) {
    const confirmation = window.prompt(`Digite EXCLUIR para apagar completamente o rancho "${row.nome}" e todos os dados vinculados.`);
    if (confirmation !== "EXCLUIR") return;

    setBusy(true);
    setError("");
    setSuccess("");
    setInviteLink("");

    try {
      const response = await fetch("/api/platform/ranchos", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ ranchoId: row.id })
      });
      const data = await response.json().catch(() => ({})) as ApiResult;
      if (!response.ok) throw new Error(data.error || "NÃ£o foi possÃ­vel excluir o rancho.");

      setSuccess(data.message || "Rancho excluÃ­do completamente.");
      if (editing?.id === row.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "NÃ£o foi possÃ­vel excluir o rancho.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setSuccess("Link de convite copiado.");
  }

  if (!canAccess) {
    return (
      <div className="mx-auto max-w-2xl animate-fade-in rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900 shadow-sm dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="text-xl font-black">Admin Interno</h1>
        </div>
        <p className="mt-3 text-sm font-bold">{PLATFORM_ADMIN_FORBIDDEN_MESSAGE}</p>
        <a className="btn btn-secondary mt-5" href="/dashboard">Voltar ao dashboard</a>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <section className="rounded-lg bg-slate-950 p-6 text-white shadow-soft md:p-8">
        <Badge tone="success">Área interna</Badge>
        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Admin Interno</h1>
            <p className="mt-3 max-w-2xl text-slate-300">Crie ranchos, acompanhe clientes e gere convites para donos criarem a própria senha.</p>
          </div>
          <button className="btn bg-white text-slate-950" type="button" onClick={() => void load()} disabled={loading || busy}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
        <form onSubmit={submitForm} className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            {editing ? <Building2 className="h-6 w-6 text-emerald-600" /> : <Plus className="h-6 w-6 text-emerald-600" />}
            <div>
              <h2 className="text-xl font-black">{editing ? "Editar rancho" : "Novo rancho"}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{editing ? "Atualize informações básicas do cliente." : "O dono receberá apenas um link para criar a própria senha."}</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-bold">Nome do rancho</span>
              <input className="input" value={draft.nome} onChange={(event) => updateDraft("nome", event.target.value)} required />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-bold">Nome do dono</span>
              <input className="input" value={draft.donoNome} onChange={(event) => updateDraft("donoNome", event.target.value)} required />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold">E-mail do dono</span>
              <input className="input" type="email" value={draft.donoEmail} onChange={(event) => updateDraft("donoEmail", event.target.value)} required />
            </label>
            {!editing ? (
              <label className="block space-y-2">
                <span className="text-sm font-bold">WhatsApp do dono</span>
                <input className="input" value={draft.donoTelefone} onChange={(event) => updateDraft("donoTelefone", event.target.value)} placeholder="Opcional" />
              </label>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-bold">Cidade</span>
                <input className="input" value={draft.cidade} onChange={(event) => updateDraft("cidade", event.target.value)} />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-bold">Estado</span>
                <input className="input" value={draft.estado} onChange={(event) => updateDraft("estado", event.target.value.toUpperCase().slice(0, 2))} placeholder="UF" />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-bold">Plano</span>
                <input className="input" value={draft.plano} onChange={(event) => updateDraft("plano", event.target.value)} />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-bold">Status</span>
                <select className="input" value={draft.status} onChange={(event) => updateDraft("status", event.target.value)}>
                  <option value="pendente">Pendente</option>
                  <option value="ativo">Ativo</option>
                  {editing ? <option value="suspenso">Suspenso</option> : null}
                  {editing ? <option value="cancelado">Cancelado</option> : null}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              <UserPlus className="h-4 w-4" /> {busy ? "Salvando..." : editing ? "Salvar edição" : "Criar rancho"}
            </button>
            {editing ? <button className="btn btn-secondary" type="button" onClick={resetForm} disabled={busy}>Cancelar edição</button> : null}
          </div>

          {error ? <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          {success ? <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{success}</p> : null}
          {inviteLink ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
              <p className="font-bold">Link de convite do dono</p>
              <p className="mt-2 break-all rounded-md bg-slate-100 p-3 font-mono text-xs dark:bg-slate-950">{inviteLink}</p>
              <button className="btn btn-secondary mt-3" type="button" onClick={copyInvite}>
                <Copy className="h-4 w-4" /> Copiar link
              </button>
            </div>
          ) : null}
        </form>

        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Ranchos cadastrados</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Clientes, donos e convites ativos.</p>
            </div>
            <Badge tone="default">{rows.length} cliente(s)</Badge>
          </div>

          <div className="space-y-3">
            {loading ? Array.from({ length: 4 }).map((_, index) => (
              <div key={`rancho-skeleton-${index}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-3 h-4 w-72 max-w-full" />
                <Skeleton className="mt-4 h-9 w-full" />
              </div>
            )) : rows.length ? rows.map((row) => (
              <article key={row.id} className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black">{row.nome}</h3>
                      <Badge tone={statusTone(row.status)}>{statusLabels[row.status] || row.status}</Badge>
                    </div>
                    <div className="mt-2 grid gap-1 text-sm text-slate-600 dark:text-slate-300">
                      <span>Dono: <strong>{row.owner?.nome || row.owner_invite?.nome || "pendente"}</strong></span>
                      <span>E-mail: <strong>{row.owner?.email || row.owner_invite?.email || "não informado"}</strong></span>
                      <span>Plano: <strong>{row.plano || "mvp"}</strong> · Usuários: <strong>{row.users_count}</strong> · Criado em {formatDate(row.created_at)}</span>
                      <span>Convite do dono: <strong>{row.owner_invite ? statusLabels[row.owner_invite.status] || row.owner_invite.status : "sem convite pendente"}</strong></span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn btn-secondary px-3 py-2 text-sm" type="button" onClick={() => startEdit(row)} disabled={busy}>Editar</button>
                    <button className="btn btn-secondary px-3 py-2 text-sm" type="button" onClick={() => void runAction(row, "regenerate_owner_invite")} disabled={busy || Boolean(row.owner?.usuario_id)}>
                      Gerar link
                    </button>
                    {row.ativa ? (
                      <button className="btn border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" type="button" onClick={() => void runAction(row, "suspend")} disabled={busy}>Suspender</button>
                    ) : (
                      <button className="btn btn-primary px-3 py-2 text-sm" type="button" onClick={() => void runAction(row, "reactivate")} disabled={busy}>Reativar</button>
                    )}
                    <button className="btn border border-red-300 bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 dark:border-red-800 dark:bg-red-700 dark:hover:bg-red-800" type="button" onClick={() => void deleteRancho(row)} disabled={busy}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Nenhum rancho cadastrado ainda.
              </div>
            )}
          </div>
        </div>
      </section>

      {busy ? (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Processando...
        </div>
      ) : null}
    </div>
  );
}
