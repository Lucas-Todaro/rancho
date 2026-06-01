"use client";

import { Clock3, Eye, Pencil, Power, Trash2, UserRound } from "lucide-react";
import type { AnyRecord } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import { formatBrazilianPhone } from "@/lib/input-format";

export function EmployeeCardSkeleton() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="mt-2 h-4 w-24" />
        </div>
        <Skeleton className="h-7 w-16 rounded-full" />
      </div>
      <div className="my-8 flex justify-center">
        <Skeleton className="h-24 w-24 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-lg" />
        <Skeleton className="h-11 w-11 rounded-lg" />
        <Skeleton className="h-11 w-11 rounded-lg" />
      </div>
    </article>
  );
}

export function EmployeeCard({
  employee,
  lastPoint,
  onView,
  onEdit,
  onToggleActive,
  onDelete
}: {
  employee: AnyRecord;
  lastPoint?: AnyRecord;
  onView: (employee: AnyRecord) => void;
  onEdit: (employee: AnyRecord) => void;
  onToggleActive: (employee: AnyRecord) => void;
  onDelete: (employee: AnyRecord) => void;
}) {
  const active = employee.ativo !== false;
  const hasSystemAccess = ["sistema", "sistema_whatsapp"].includes(String(employee.tipo_acesso || "")) || Boolean(employee.usuario_id || employee.email);
  const hasWhatsApp = Boolean(employee.contato_whatsapp);
  const accessLabel = hasSystemAccess && hasWhatsApp ? "Sistema + WhatsApp" : hasSystemAccess ? "Sistema" : "WhatsApp";
  const lastPointLabel = lastPoint
    ? `${lastPoint.tipo === "saida" ? "Saída" : "Entrada"} em ${formatDate(lastPoint.registrado_em)}`
    : "Sem ponto registrado";

  return (
    <article
      className="group min-w-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-soft dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-emerald-800"
      onClick={() => onView(employee)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-2xl font-black tracking-tight">{employee.nome || "Sem nome"}</h3>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{employee.funcao || "Sem função"}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700 dark:bg-blue-950 dark:text-blue-200">{accessLabel}</span>
            {employee.convite_status ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 dark:bg-amber-950 dark:text-amber-200">Convite {employee.convite_status}</span> : null}
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
          {active ? "Ativo" : "Inativo"}
        </span>
      </div>

      <div className="my-8 flex justify-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition group-hover:bg-emerald-50 group-hover:text-emerald-600 dark:bg-slate-900 dark:group-hover:bg-emerald-950/40 dark:group-hover:text-emerald-200">
          <UserRound className="h-11 w-11" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-4 text-center text-sm dark:border-slate-800">
        <div className="min-w-0">
          <p className="text-slate-500 dark:text-slate-400">Salário</p>
          <strong className="mt-1 block truncate">{formatCurrency(employee.salario_base)}</strong>
        </div>
        <div className="min-w-0">
          <p className="text-slate-500 dark:text-slate-400">Carga</p>
          <strong className="mt-1 block truncate">{employee.carga_horaria_mensal || 0}h</strong>
        </div>
        <div className="min-w-0">
          <p className="text-slate-500 dark:text-slate-400">Admissão</p>
          <strong className="mt-1 block truncate">{formatDate(employee.data_admissao)}</strong>
        </div>
      </div>

      <div className="mt-4 flex min-w-0 items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Clock3 className="h-4 w-4 shrink-0" />
        <span className="truncate">{lastPointLabel}</span>
      </div>

      <div className="mt-3 space-y-1 text-sm text-slate-500 dark:text-slate-400">
        {employee.email ? <p className="truncate">E-mail: <strong className="text-slate-700 dark:text-slate-200">{employee.email}</strong></p> : null}
        {employee.contato_whatsapp ? <p className="truncate">WhatsApp: <strong className="text-slate-700 dark:text-slate-200">{formatBrazilianPhone(employee.contato_whatsapp)}</strong></p> : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn flex-1 bg-emerald-600 text-white" type="button" onClick={(event) => { event.stopPropagation(); onView(employee); }}>
          <Eye className="h-4 w-4" /> Ver ficha
        </button>
        <button className="rounded-lg border border-slate-200 p-3 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={(event) => { event.stopPropagation(); onEdit(employee); }} title="Editar funcionário">
          <Pencil className="h-4 w-4" />
        </button>
        <button className="rounded-lg border border-amber-200 p-3 text-amber-700 transition hover:bg-amber-50 dark:border-amber-900 dark:hover:bg-amber-950" type="button" onClick={(event) => { event.stopPropagation(); onToggleActive(employee); }} title={active ? "Desativar funcionário" : "Ativar funcionário"}>
          <Power className="h-4 w-4" />
        </button>
        <button className="rounded-lg border border-red-200 p-3 text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" type="button" onClick={(event) => { event.stopPropagation(); onDelete(employee); }} title="Excluir funcionário">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );
}
