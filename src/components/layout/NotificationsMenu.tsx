"use client";

import { Bell, Check, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { listRecords, subscribeTable, updateRecord } from "@/services/crud";

const routeByEntity: Record<string, string> = {
  [TABLES.ordenhas]: "/producao",
  [TABLES.eventosAnimal]: "/eventos",
  [TABLES.transacoesFinanceiras]: "/financeiro",
  [TABLES.estoqueItens]: "/estoque",
  [TABLES.estoqueMovimentacoes]: "/estoque",
  [TABLES.registrosPonto]: "/funcionarios",
  [TABLES.funcionarios]: "/funcionarios",
  [TABLES.animais]: "/rebanho"
};

function detailsHref(notification: AnyRecord) {
  return routeByEntity[String(notification.entidade_tipo || "")] || "/dashboard";
}

export function NotificationsMenu() {
  const router = useRouter();
  const { dataContext } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!dataContext.fazendaId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await listRecords(TABLES.notificacoes, {
        fazendaId: dataContext.fazendaId,
        usuarioId: dataContext.usuarioId,
        orderBy: "created_at"
      });
      setRows(data.slice(0, 20));
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível carregar as notificações."));
    } finally {
      setLoading(false);
    }
  }, [dataContext.fazendaId, dataContext.usuarioId]);

  useEffect(() => {
    load();
    return subscribeTable(TABLES.notificacoes, load);
  }, [load]);

  const unreadCount = useMemo(() => rows.filter((row) => !row.lida_em).length, [rows]);

  async function markAsRead(notification: AnyRecord) {
    if (notification.lida_em) return;

    try {
      const readAt = new Date().toISOString();
      setRows((current) => current.map((row) => row.id === notification.id ? { ...row, lida_em: readAt } : row));
      await updateRecord(TABLES.notificacoes, notification.id, { lida_em: readAt });
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível marcar a notificação como lida."));
      await load();
    }
  }

  async function openDetails(notification: AnyRecord) {
    await markAsRead(notification);
    setOpen(false);
    router.push(detailsHref(notification));
  }

  return (
    <div className="relative">
      <button
        className="relative rounded-lg border border-slate-200 bg-white/70 p-2 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900/70 dark:hover:bg-slate-800"
        type="button"
        onClick={() => setOpen((value) => !value)}
        title="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-emerald-600 px-1.5 py-0.5 text-center text-[0.65rem] font-black text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
        <button className="fixed inset-0 z-40 cursor-default bg-transparent md:hidden" type="button" aria-label="Fechar notificações" onClick={() => setOpen(false)} />
        <div className="fixed left-4 right-4 top-20 z-50 max-h-[calc(100vh-6rem)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-900 md:absolute md:left-auto md:right-0 md:top-12 md:w-96">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-sm font-black">Notificações</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Registros feitos pelo WhatsApp e avisos internos.</p>
            </div>
            {unreadCount ? <span className="shrink-0"><Badge tone="success">{unreadCount} nova(s)</Badge></span> : null}
          </div>

          <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-2 md:max-h-[26rem]">
            {loading ? Array.from({ length: 4 }).map((_, index) => (
              <div key={`notification-skeleton-${index}`} className="rounded-lg p-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-64 max-w-full" />
              </div>
            )) : error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                {error}
              </div>
            ) : rows.length ? rows.map((notification) => (
              <article
                key={notification.id}
                className={cn(
                  "rounded-lg border p-3 transition",
                  notification.lida_em
                    ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60"
                    : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/25"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words text-sm font-black">{notification.titulo}</h3>
                    <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{notification.mensagem}</p>
                    <p className="mt-2 text-xs text-slate-400">{formatDate(notification.created_at)}</p>
                  </div>
                  {!notification.lida_em ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-600" /> : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-secondary px-3 py-2 text-xs" type="button" onClick={() => openDetails(notification)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Ver detalhes
                  </button>
                  {!notification.lida_em ? (
                    <button className="btn px-3 py-2 text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/40" type="button" onClick={() => markAsRead(notification)}>
                      <Check className="h-3.5 w-3.5" /> Marcar como lida
                    </button>
                  ) : null}
                </div>
              </article>
            )) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
                Nenhuma notificação por enquanto.
              </div>
            )}
          </div>
        </div>
        </>
      ) : null}
    </div>
  );
}
