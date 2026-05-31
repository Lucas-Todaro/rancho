"use client";

import { Bot, CheckCircle2, MessageCircle, Pencil, Send, ShieldCheck, Smartphone, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { formatBrazilianPhone, isValidBrazilianPhone } from "@/lib/input-format";
import { TABLES } from "@/lib/tables";
import { formatDate } from "@/lib/utils";
import { normalizeWhatsappNumber, whatsappNumbersMatch } from "@/lib/phone";
import { createRecord, deleteRecord, deleteRecords, listRecords, updateRecord } from "@/services/crud";
import type { AnyRecord } from "@/lib/types";

const roleOptions = [
  { value: "usuario", label: "Usuário" },
  { value: "funcionario", label: "Funcionário" },
  { value: "admin", label: "Administrador" }
];

const initialDraft = {
  nome: "",
  whatsapp: "",
  papel_bot: "usuario",
  ativo: true
};

function roleLabel(value: unknown) {
  return roleOptions.find((option) => option.value === value)?.label || "Usuário";
}

export default function WhatsAppPage() {
  const { dataContext, profile } = useAuth();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canManage = profile?.papel === "admin" || profile?.papel === "gerente";

  const loadAuthorizedNumbers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listRecords(TABLES.whatsappUsuarios, {
        fazendaId: dataContext.fazendaId,
        usuarioId: dataContext.usuarioId,
        orderBy: "created_at"
      });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os números autorizados.");
    } finally {
      setLoading(false);
    }
  }, [dataContext.fazendaId, dataContext.usuarioId]);

  useEffect(() => {
    loadAuthorizedNumbers();
  }, [loadAuthorizedNumbers]);

  const totals = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => row.ativo !== false).length,
    inactive: rows.filter((row) => row.ativo === false).length
  }), [rows]);

  function updateDraft(name: keyof typeof draft, value: string | boolean) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function startEdit(row: AnyRecord) {
    setEditing(row);
    setDraft({
      nome: String(row.nome_exibicao || ""),
      whatsapp: formatBrazilianPhone(row.telefone_e164),
      papel_bot: String(row.papel_bot || "usuario"),
      ativo: row.ativo !== false
    });
    setSuccess("");
    setError("");
  }

  function resetForm() {
    setEditing(null);
    setDraft(initialDraft);
  }

  async function saveAuthorizedNumber(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return;
    if (!dataContext.fazendaId) {
      setError("Não foi possível identificar o rancho atual.");
      return;
    }
    if (!isValidBrazilianPhone(draft.whatsapp)) {
      setError("Informe um WhatsApp válido com DDD.");
      return;
    }

    const normalized = normalizeWhatsappNumber(draft.whatsapp);
    const duplicated = rows.find((row) => row.id !== editing?.id && whatsappNumbersMatch(row.telefone_e164, normalized));
    if (duplicated) {
      setError("Este WhatsApp já está cadastrado na lista de números autorizados.");
      return;
    }

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        telefone_e164: normalized,
        nome_exibicao: draft.nome.trim() || "Usuário do bot",
        papel_bot: draft.papel_bot,
        ativo: draft.ativo
      };

      if (editing?.id) {
        await updateRecord(TABLES.whatsappUsuarios, editing.id, payload);
        setSuccess("Número autorizado atualizado.");
      } else {
        await createRecord(TABLES.whatsappUsuarios, {
          ...payload,
          fazenda_id: dataContext.fazendaId
        }, dataContext);
        setSuccess("Número autorizado cadastrado.");
      }

      resetForm();
      await loadAuthorizedNumbers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o número.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleNumber(row: AnyRecord) {
    if (!canManage) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await updateRecord(TABLES.whatsappUsuarios, row.id, { ativo: row.ativo === false });
      setSuccess(row.ativo === false ? "Número ativado." : "Número desativado.");
      await loadAuthorizedNumbers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
    }
  }

  async function removeNumber(row: AnyRecord) {
    if (!canManage) return;
    const ok = window.confirm(`Excluir ${row.nome_exibicao || row.telefone_e164} da lista de números autorizados?`);
    if (!ok) return;

    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await deleteRecords(TABLES.whatsappSessoes, [{ column: "whatsapp_usuario_id", value: row.id }]);
      await deleteRecord(TABLES.whatsappUsuarios, row.id);
      setSuccess("Número removido da lista.");
      await loadAuthorizedNumbers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o número.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setStatus("Enviando menu...");
    const response = await fetch("/api/whatsapp/send-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: normalizeWhatsappNumber(phone) || phone })
    });
    const data = await response.json().catch(() => ({}));
    setStatus(data.ok ? "Menu enviado. Confira o WhatsApp." : "Não foi possível enviar agora. Confira se o WhatsApp está ativo e autorizado.");
  }

  return (
    <div className="animate-fade-in space-y-6">
      <section className="overflow-hidden rounded-lg bg-emerald-950 p-6 text-white shadow-soft md:p-8">
        <Badge tone="success">Atendimento rápido</Badge>
        <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-5xl">WhatsApp para a rotina da fazenda.</h1>
        <p className="mt-4 max-w-3xl text-emerald-100">
          Cadastre quem pode usar o bot e registre ordenha, animais e financeiro direto pelo telefone.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-lg p-5 shadow-soft">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Cadastrados</p>
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="mt-2 block text-3xl font-black">{totals.total}</strong>}
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Ativos</p>
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="mt-2 block text-3xl font-black text-emerald-700 dark:text-emerald-300">{totals.active}</strong>}
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Inativos</p>
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="mt-2 block text-3xl font-black text-slate-600 dark:text-slate-300">{totals.inactive}</strong>}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={saveAuthorizedNumber} className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <UserPlus className="h-6 w-6 text-emerald-600" />
              <div>
                <h2 className="text-xl font-black">{editing ? "Editar número autorizado" : "Novo número autorizado"}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Só números ativos nesta lista podem usar o bot.</p>
              </div>
            </div>
            {editing ? (
              <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" type="button" onClick={resetForm}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {!canManage ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
              Apenas administradores ou gerentes podem alterar números autorizados.
            </div>
          ) : null}

          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm font-bold">Nome ou apelido</span>
              <input className="input" value={draft.nome} onChange={(event) => updateDraft("nome", event.target.value)} placeholder="Ex: João do curral" disabled={!canManage || busy} />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold">WhatsApp</span>
              <input className="input" value={draft.whatsapp} onChange={(event) => updateDraft("whatsapp", formatBrazilianPhone(event.target.value))} placeholder="(00) 00000-0000" disabled={!canManage || busy} required />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-bold">Função</span>
                <select className="input" value={draft.papel_bot} onChange={(event) => updateDraft("papel_bot", event.target.value)} disabled={!canManage || busy}>
                  {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-bold">Status</span>
                <select className="input" value={draft.ativo ? "ativo" : "inativo"} onChange={(event) => updateDraft("ativo", event.target.value === "ativo")} disabled={!canManage || busy}>
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            </div>
          </div>

          <button className="btn btn-primary mt-5 w-full" type="submit" disabled={!canManage || busy}>
            <ShieldCheck className="h-4 w-4" /> {busy ? "Salvando..." : editing ? "Salvar alterações" : "Autorizar número"}
          </button>

          {error ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p> : null}
          {success ? <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{success}</p> : null}
        </form>

        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-black">Números autorizados</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Lista oficial usada pelo bot para liberar ou bloquear acesso.</p>
            </div>
          </div>

          <div className="space-y-3">
            {loading ? Array.from({ length: 4 }).map((_, index) => (
              <div key={`wa-skeleton-${index}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="mt-3 h-4 w-56" />
              </div>
            )) : rows.length ? rows.map((row) => (
              <article key={row.id} className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-black">{row.nome_exibicao || "Usuário do bot"}</h3>
                      <Badge tone={row.ativo === false ? "default" : "success"}>{row.ativo === false ? "Inativo" : "Ativo"}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{formatBrazilianPhone(row.telefone_e164)}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {roleLabel(row.papel_bot)} • Cadastrado em {formatDate(row.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => startEdit(row)} disabled={!canManage || busy} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="btn btn-secondary px-3 py-2 text-sm disabled:opacity-50" type="button" onClick={() => toggleNumber(row)} disabled={!canManage || busy}>
                      {row.ativo === false ? "Ativar" : "Desativar"}
                    </button>
                    <button className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950" type="button" onClick={() => removeNumber(row)} disabled={!canManage || busy} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
                Nenhum número autorizado cadastrado ainda.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black">Enviar menu de teste</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Informe um telefone autorizado com DDI e DDD para receber o menu de atendimento.
          </p>
          <label className="space-y-2">
            <span className="text-sm font-bold">Telefone</span>
            <input className="input" value={phone} onChange={(event) => setPhone(formatBrazilianPhone(event.target.value))} placeholder="(00) 00000-0000" />
          </label>
          <button className="btn btn-primary mt-4 w-full" onClick={sendTest} type="button" disabled={!phone.trim()}>
            <MessageCircle className="h-4 w-4" /> Enviar menu
          </button>
          {status ? <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm font-bold dark:bg-slate-900">{status}</p> : null}
        </div>

        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Bot className="h-6 w-6 text-amber-500" />
            <div>
              <h2 className="text-xl font-black">Como o acesso funciona</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">O bot só executa ações de números autorizados e ativos.</p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              "O número é salvo normalizado com DDI 55.",
              "Mensagens da Twilio e da Meta usam a mesma validação.",
              "Números inativos recebem bloqueio amigável.",
              "Registros continuam entrando no rancho correto."
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200/70 bg-white/65 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {[
          { icon: Smartphone, title: "Menu inicial", text: "Opções claras para começar um registro pelo telefone." },
          { icon: Bot, title: "Fluxo guiado", text: "O atendimento pergunta uma coisa por vez até completar o registro." },
          { icon: CheckCircle2, title: "Painel atualizado", text: "As informações aparecem nas áreas certas do sistema." }
        ].map((item) => {
          const Icon = item.icon;
          return <div className="glass card-hover rounded-lg p-5" key={item.title}><Icon className="h-8 w-8 text-emerald-600" /><h3 className="mt-4 text-lg font-black">{item.title}</h3><p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{item.text}</p></div>;
        })}
      </div>
    </div>
  );
}
