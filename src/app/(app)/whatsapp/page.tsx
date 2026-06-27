"use client";

import { Bot, CheckCircle2, MessageCircle, Pencil, Send, ShieldCheck, Smartphone, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState } from "@/components/ui/AsyncState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/lib/auth-context";
import { formatBrazilianPhone, isValidBrazilianPhone } from "@/lib/input-format";
import { TABLES } from "@/lib/tables";
import { useInternalTester } from "@/lib/use-internal-tester";
import { formatDate } from "@/lib/utils";
import { normalizeWhatsappNumber, whatsappNumbersMatch } from "@/lib/phone";
import { canManageData } from "@/lib/permissions";
import { isWhatsappSandboxEnvironment, publicWhatsappConfig } from "@/lib/public-env";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { withAsyncTimeout } from "@/lib/async";
import { createRecord, deleteRecord, deleteRecords, listRecords, updateRecord } from "@/services/crud";
import type { AnyRecord } from "@/lib/types";

const roleOptions = [
  { value: "usuario", label: "Usuário" },
  { value: "admin", label: "Administrador" }
];

const initialDraft = {
  nome: "",
  whatsapp: "",
  papel_bot: "usuario",
  ativo: true
};

const defaultOutboundMessage = [
  "Olá! Aqui é o bot do Rancho.",
  "Pode mandar frases como:",
  "- Mimosa deu 15 litros de leite hoje",
  "- Vendi leite por 900 reais",
  "- Comprei ração por 300 reais",
  "- Entrou 10 sacos de ração no estoque",
  "- João entrou às 7:30"
].join("\n");

type BotTestResult = {
  respostaTexto: string;
  intencaoDetectada: string | null;
  confianca: number | null;
  dadosExtraidos: AnyRecord | null;
  estadoAnterior: string | null;
  estadoNovo: string | null;
  camposFaltantes: string[];
  eventoConfirmado: boolean;
  erro: string | null;
};

type BotTestHistoryItem = {
  id: string;
  telefone: string;
  mensagem: string;
  resposta: string;
  horario: string;
};

const defaultBotTestMessage = "vaca B-002 deu 32 litros";
const botProcessingNoticePreview = "Recebi sua mensagem. Estou conferindo os dados do rancho e já te respondo.";

const WHATSAPP_USERS_SELECT = [
  "id",
  "fazenda_id",
  "telefone_e164",
  "nome_exibicao",
  "papel_bot",
  "ativo",
  "usuario_id",
  "funcionario_id",
  "created_at"
].join(",");

function roleLabel(value: unknown) {
  return roleOptions.find((option) => option.value === roleFromDatabase(value))?.label || "Usuário";
}

function roleFromDatabase(value: unknown) {
  return value === "admin" ? "admin" : "usuario";
}

function roleToDatabase(value: string) {
  return value === "admin" ? "admin" : "funcionario";
}

export default function WhatsAppPage() {
  const { dataContext, profile, session } = useAuth();
  const isInternalTester = useInternalTester();
  const [phone, setPhone] = useState("");
  const [outboundMessage, setOutboundMessage] = useState(defaultOutboundMessage);
  const [status, setStatus] = useState("");
  const [botTestPhone, setBotTestPhone] = useState("");
  const [botTestMessage, setBotTestMessage] = useState(defaultBotTestMessage);
  const [botTestSaveReal, setBotTestSaveReal] = useState(false);
  const [botTestLoading, setBotTestLoading] = useState(false);
  const [botTestProcessingNoticeVisible, setBotTestProcessingNoticeVisible] = useState(false);
  const [botTestResult, setBotTestResult] = useState<BotTestResult | null>(null);
  const [botTestHistory, setBotTestHistory] = useState<BotTestHistoryItem[]>([]);
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [draft, setDraft] = useState(initialDraft);
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const loadRequestRef = useRef(0);

  const canManage = canManageData(profile);
  const isSandbox = isWhatsappSandboxEnvironment();
  const sandboxNumber = publicWhatsappConfig.sandboxNumber;
  const sandboxJoinCode = publicWhatsappConfig.sandboxJoinCode;

  const loadAuthorizedNumbers = useCallback(async (forceRefresh = false) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await withAsyncTimeout(listRecords(TABLES.whatsappUsuarios, {
        fazendaId: dataContext.fazendaId,
        usuarioId: dataContext.usuarioId,
        orderBy: "created_at",
        select: WHATSAPP_USERS_SELECT,
        cache: true,
        forceRefresh
      }), "Os numeros do WhatsApp demoraram para carregar. Tente novamente.");
      if (loadRequestRef.current !== requestId) return;
      setRows(data);
    } catch (err) {
      if (loadRequestRef.current === requestId) {
        setError(getFriendlyErrorMessage(err, "Nao foi possivel carregar os numeros autorizados agora."));
      }
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [dataContext.fazendaId, dataContext.usuarioId]);

  useEffect(() => {
    void loadAuthorizedNumbers();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [loadAuthorizedNumbers]);

  const totals = useMemo(() => ({
    total: rows.length,
    active: rows.filter((row) => row.ativo !== false).length,
    inactive: rows.filter((row) => row.ativo === false).length
  }), [rows]);
  const initialLoadError = Boolean(error && !rows.length && !loading);

  const firstActiveWhatsapp = useMemo(() => (
    rows.find((row) => row.ativo !== false)?.telefone_e164
  ), [rows]);

  const simulatedWhatsappUser = useMemo(() => {
    const normalized = normalizeWhatsappNumber(botTestPhone);
    if (!normalized) return null;
    return rows.find((row) => row.ativo !== false && whatsappNumbersMatch(row.telefone_e164, normalized)) || null;
  }, [botTestPhone, rows]);

  useEffect(() => {
    if (!botTestPhone && firstActiveWhatsapp) {
      setBotTestPhone(formatBrazilianPhone(firstActiveWhatsapp));
    }
  }, [botTestPhone, firstActiveWhatsapp]);

  function updateDraft(name: keyof typeof draft, value: string | boolean) {
    setDraft((current) => ({ ...current, [name]: value }));
  }

  function startEdit(row: AnyRecord) {
    setEditing(row);
    setDraft({
      nome: String(row.nome_exibicao || ""),
      whatsapp: formatBrazilianPhone(row.telefone_e164),
      papel_bot: roleFromDatabase(row.papel_bot),
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
        papel_bot: roleToDatabase(draft.papel_bot),
        ativo: draft.ativo
      };

      if (editing?.id) {
        await updateRecord(TABLES.whatsappUsuarios, editing.id, payload, dataContext);
        setSuccess("Número autorizado atualizado.");
      } else {
        await createRecord(TABLES.whatsappUsuarios, {
          ...payload,
          fazenda_id: dataContext.fazendaId
        }, dataContext);
        setSuccess("Número autorizado cadastrado.");
      }

      resetForm();
      await loadAuthorizedNumbers(true);
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
      await updateRecord(TABLES.whatsappUsuarios, row.id, { ativo: row.ativo === false }, dataContext);
      setSuccess(row.ativo === false ? "Número ativado." : "Número desativado.");
      await loadAuthorizedNumbers(true);
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
      await deleteRecords(TABLES.whatsappSessoes, [{ column: "whatsapp_usuario_id", value: row.id }], dataContext);
      await deleteRecord(TABLES.whatsappUsuarios, row.id, dataContext);
      setSuccess("Número removido da lista.");
      await loadAuthorizedNumbers(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir o número.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!isInternalTester) {
      setStatus("Você não tem permissão para acessar esta ferramenta interna.");
      return;
    }

    if (!isValidBrazilianPhone(phone)) {
      setStatus("Informe um WhatsApp válido com DDD.");
      return;
    }

    setSending(true);
    setStatus("Enviando...");
    try {
      const response = await fetch("/api/whatsapp/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          phone: normalizeWhatsappNumber(phone) || phone,
          message: outboundMessage
        })
      });
      const data = await response.json().catch(() => ({}));
      setStatus(response.ok && data.ok ? "Mensagem enviada. Confira o WhatsApp." : data.error || "Não foi possível enviar agora.");
    } catch {
      setStatus("Não foi possível enviar agora.");
    } finally {
      setSending(false);
    }
  }

  async function simulateBotMessage() {
    if (!isInternalTester) return;
    const normalizedPhone = normalizeWhatsappNumber(botTestPhone);
    const text = botTestMessage.trim();

    if (!normalizedPhone) {
      setBotTestProcessingNoticeVisible(false);
      setBotTestResult({
        respostaTexto: "",
        intencaoDetectada: null,
        confianca: null,
        dadosExtraidos: null,
        estadoAnterior: null,
        estadoNovo: null,
        camposFaltantes: [],
        eventoConfirmado: false,
        erro: "Informe o telefone simulado."
      });
      return;
    }

    if (!text) {
      setBotTestProcessingNoticeVisible(false);
      setBotTestResult({
        respostaTexto: "",
        intencaoDetectada: null,
        confianca: null,
        dadosExtraidos: null,
        estadoAnterior: null,
        estadoNovo: null,
        camposFaltantes: [],
        eventoConfirmado: false,
        erro: "Informe a mensagem para simular."
      });
      return;
    }

    setBotTestLoading(true);
    setBotTestProcessingNoticeVisible(false);
    const processingNoticeTimer = window.setTimeout(() => {
      setBotTestProcessingNoticeVisible(true);
    }, 1500);
    try {
      const response = await fetch("/api/whatsapp/testar-bot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {})
        },
        body: JSON.stringify({
          telefone: normalizedPhone,
          mensagem: text,
          salvarReal: botTestSaveReal
        })
      });
      const data = await response.json().catch(() => ({
        respostaTexto: "",
        erro: "Não foi possível ler a resposta do simulador."
      }));
      const result = data as BotTestResult;
      setBotTestResult(result);
      setBotTestHistory((current) => [{
        id: crypto.randomUUID(),
        telefone: normalizedPhone,
        mensagem: text,
        resposta: result.respostaTexto || result.erro || "Sem resposta.",
        horario: new Date().toISOString()
      }, ...current].slice(0, 8));
    } catch {
      setBotTestResult({
        respostaTexto: "",
        intencaoDetectada: null,
        confianca: null,
        dadosExtraidos: null,
        estadoAnterior: null,
        estadoNovo: null,
        camposFaltantes: [],
        eventoConfirmado: false,
        erro: "Não foi possível simular agora."
      });
    } finally {
      window.clearTimeout(processingNoticeTimer);
      setBotTestLoading(false);
      setBotTestProcessingNoticeVisible(false);
    }
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
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="mt-2 block text-3xl font-black">{initialLoadError ? "-" : totals.total}</strong>}
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Ativos</p>
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="mt-2 block text-3xl font-black text-emerald-700 dark:text-emerald-300">{initialLoadError ? "-" : totals.active}</strong>}
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Inativos</p>
          {loading ? <Skeleton className="mt-3 h-8 w-16" /> : <strong className="mt-2 block text-3xl font-black text-slate-600 dark:text-slate-300">{initialLoadError ? "-" : totals.inactive}</strong>}
        </div>
      </section>

      <section className={isSandbox ? "grid gap-4 lg:grid-cols-[0.9fr_1.1fr]" : "grid gap-4"}>
        <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">Status da integração</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Veja como o WhatsApp do Rancho está configurado agora.
              </p>
            </div>
            <Badge tone={isSandbox ? "warning" : "success"}>{isSandbox ? "Ambiente de testes" : "Integração ativa"}</Badge>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {isSandbox
              ? "O bot está em ambiente de testes. Para usar, o WhatsApp precisa entrar no sandbox da Twilio e também estar autorizado abaixo."
              : "A integração oficial do WhatsApp Business está ativa para os números autorizados do Rancho."}
          </p>
        </div>

        {isSandbox ? (
          <div className="glass rounded-lg p-5 shadow-soft md:p-6">
            <h2 className="text-xl font-black">Como testar o bot agora</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Enquanto estiver em testes, cada telefone precisa ativar o sandbox uma vez antes de conversar com o bot.
            </p>
            <ol className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">1</span>
                <span>Cadastre e deixe o número ativo na lista de números autorizados.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">2</span>
                <span>Envie a mensagem de ativação para o número do sandbox da Twilio.</span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-black text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">3</span>
                <span>Depois da confirmação, mande uma mensagem simples, como &ldquo;menu&rdquo; ou &ldquo;vaca Mimosa deu 15 litros&rdquo;.</span>
              </li>
            </ol>
            {sandboxNumber || sandboxJoinCode ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                {sandboxNumber ? <p><strong>Número do sandbox:</strong> {sandboxNumber}</p> : null}
                {sandboxJoinCode ? <p className="mt-1"><strong>Mensagem de ativação:</strong> join {sandboxJoinCode}</p> : null}
              </div>
            ) : null}
            <p className="mt-4 text-xs font-bold text-slate-500 dark:text-slate-400">
              No WhatsApp oficial, essa ativação manual do sandbox deixa de existir.
            </p>
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <form onSubmit={saveAuthorizedNumber} className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <UserPlus className="h-6 w-6 text-emerald-600" />
              <div>
                <h2 className="text-xl font-black">{editing ? "Editar número autorizado" : "Novo número autorizado"}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">Somente números autorizados e ativos poderão usar o bot do Rancho.</p>
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
            )) : initialLoadError ? (
              <ErrorState title="Nao consegui carregar os numeros autorizados." message={error} onRetry={() => loadAuthorizedNumbers(true)} />
            ) : rows.length ? rows.map((row) => (
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
              <EmptyState
                title="Nenhum numero autorizado cadastrado ainda."
                message="Cadastre ao menos um WhatsApp ativo para liberar o uso do bot nesta fazenda."
              />
            )}
          </div>
        </div>
      </div>

      <div className={isInternalTester ? "grid gap-6 lg:grid-cols-[0.9fr_1.1fr]" : "grid gap-6"}>
        {isInternalTester ? (
          <div className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Send className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black">Enviar mensagem</h2>
          </div>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Envie uma mensagem inicial ou um aviso para um WhatsApp autorizado.
          </p>
          <label className="space-y-2">
            <span className="text-sm font-bold">Telefone</span>
            <input className="input" value={phone} onChange={(event) => setPhone(formatBrazilianPhone(event.target.value))} placeholder="(00) 00000-0000" />
          </label>
          <label className="mt-4 block space-y-2">
            <span className="text-sm font-bold">Mensagem</span>
            <textarea className="input min-h-28 resize-y" value={outboundMessage} onChange={(event) => setOutboundMessage(event.target.value)} />
          </label>
          <button className="btn btn-primary mt-4 w-full" onClick={sendMessage} type="button" disabled={sending || !phone.trim() || !outboundMessage.trim()}>
            <MessageCircle className="h-4 w-4" /> {sending ? "Enviando..." : "Enviar mensagem"}
          </button>
          {status ? <p className="mt-3 rounded-lg bg-slate-100 p-3 text-sm font-bold dark:bg-slate-900">{status}</p> : null}
          </div>
        ) : null}

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
              "O número precisa estar cadastrado e ativo para conversar com o bot.",
              "Cada pessoa usa o próprio WhatsApp autorizado pelo Rancho.",
              "Números inativos são bloqueados com uma mensagem clara.",
              "Os registros entram automaticamente na fazenda correta."
            ].map((item) => (
              <div key={item} className="flex gap-3 rounded-lg border border-slate-200/70 bg-white/65 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isInternalTester ? (
        <section className="glass rounded-lg p-5 shadow-soft md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <Bot className="h-6 w-6 text-emerald-600" />
            <div>
              <h2 className="text-xl font-black">Ferramentas internas de teste</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Área restrita para testar o bot antes de liberar mudanças para clientes.</p>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <label className="block space-y-2">
                <span className="text-sm font-bold">Telefone simulado</span>
                <input className="input" value={botTestPhone} onChange={(event) => setBotTestPhone(formatBrazilianPhone(event.target.value))} placeholder="5583999999999" />
              </label>
              <div className="mt-2 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                {simulatedWhatsappUser ? (
                  <p>
                    Simulando: <strong>{simulatedWhatsappUser.nome_exibicao || formatBrazilianPhone(simulatedWhatsappUser.telefone_e164)}</strong> · {roleLabel(simulatedWhatsappUser.papel_bot)} · {formatBrazilianPhone(simulatedWhatsappUser.telefone_e164)}
                  </p>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">Informe um WhatsApp ativo cadastrado para simular admin ou funcionário.</p>
                )}
              </div>
              <label className="mt-4 block space-y-2">
                <span className="text-sm font-bold">Mensagem</span>
                <textarea className="input min-h-28 resize-y" value={botTestMessage} onChange={(event) => setBotTestMessage(event.target.value)} placeholder="vaca B-002 deu 32 litros" />
              </label>
              <label className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <input
                  className="mt-1"
                  type="checkbox"
                  checked={botTestSaveReal}
                  onChange={(event) => setBotTestSaveReal(event.target.checked)}
                />
                <span>
                  <strong className="block text-amber-900 dark:text-amber-100">Salvar registros reais no sistema</strong>
                  <span className="mt-1 block text-amber-800 dark:text-amber-100">
                    Atenção: com esta opção ativada, os testes vão alterar dados reais da fazenda.
                  </span>
                </span>
              </label>
              <button className="btn btn-primary mt-4 w-full" onClick={simulateBotMessage} type="button" disabled={botTestLoading || !botTestPhone.trim() || !botTestMessage.trim()}>
                <Bot className="h-4 w-4" /> {botTestLoading ? "Simulando..." : "Simular mensagem"}
              </button>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/55">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Resultado</h3>
              {botTestResult || botTestLoading ? (
                <div className="mt-4 space-y-4">
                  {botTestLoading && botTestProcessingNoticeVisible ? (
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Mensagem intermediária</p>
                      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{botProcessingNoticePreview}</p>
                    </div>
                  ) : null}
                  {botTestResult ? (
                    <>
                  {botTestResult.erro ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{botTestResult.erro}</p> : null}
                  {botTestResult.respostaTexto ? (
                    <div>
                      <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Resposta do bot</p>
                      <p className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">{botTestResult.respostaTexto}</p>
                    </div>
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Intenção</p>
                      <p className="mt-1 break-words text-sm font-black">{botTestResult.intencaoDetectada || "-"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Confiança</p>
                      <p className="mt-1 text-sm font-black">{botTestResult.confianca === null ? "-" : `${Math.round(botTestResult.confianca * 100)}%`}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Confirmou</p>
                      <p className="mt-1 text-sm font-black">{botTestResult.eventoConfirmado ? "Sim" : "Não"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Estado anterior</p>
                      <p className="mt-1 break-words text-sm font-black">{botTestResult.estadoAnterior || "-"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Estado novo</p>
                      <p className="mt-1 break-words text-sm font-black">{botTestResult.estadoNovo || "-"}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-950">
                      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Campos faltantes</p>
                      <p className="mt-1 break-words text-sm font-black">{botTestResult.camposFaltantes.length ? botTestResult.camposFaltantes.join(", ") : "-"}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400">Dados extraídos</p>
                    <pre className="mt-1 max-h-44 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(botTestResult.dadosExtraidos || {}, null, 2)}</pre>
                  </div>
                    </>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Nenhuma simulação executada ainda.</p>
              )}
            </div>
          </div>

          <div className="mt-5">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Histórico da simulação</h3>
            <div className="mt-3 space-y-3">
              {botTestHistory.length ? botTestHistory.map((item) => (
                <article key={item.id} className="rounded-lg border border-slate-200 bg-white/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/55">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong>{formatBrazilianPhone(item.telefone)}</strong>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(item.horario).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="mt-2 text-slate-600 dark:text-slate-300">Você: {item.mensagem}</p>
                  <p className="mt-1 whitespace-pre-wrap font-bold text-emerald-700 dark:text-emerald-300">Bot: {item.resposta}</p>
                </article>
              )) : (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">As mensagens simuladas aparecerão aqui nesta sessão.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

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
