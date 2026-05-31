"use client";

import { Download, Eye, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AnyRecord, ModuleField, RelationOption } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

function renderCell(value: any, field: ModuleField, lookups?: Record<string, Record<string, string>>) {
  if (field.type === "currency") return formatCurrency(value);
  if (field.type === "date" || field.type === "datetime-local" || field.type === "month") return formatDate(value);
  if (field.type === "number") return String(value ?? 0);
  if (field.type === "checkbox") return value ? <Badge tone="success">Sim</Badge> : <Badge tone="default">Não</Badge>;
  if (field.type === "relation") return lookups?.[field.name]?.[String(value)] || String(value ?? "-");
  if (field.type === "select") {
    const label = field.options?.find((option) => option.value === value)?.label || value || "-";
    const tone = ["ativo", "pago", "boa", "entrada", "ok", "manha"].includes(String(value))
      ? "success"
      : ["pendente", "ferias", "vacinacao_pendente", "aberta", "rascunho"].includes(String(value))
        ? "warning"
        : ["saida", "atrasado", "morto", "tratamento", "descartar", "cancelada"].includes(String(value))
          ? "danger"
          : "default";
    return <Badge tone={tone as any}>{label}</Badge>;
  }
  return String(value ?? "-");
}

export function DataTable({
  rows,
  fields,
  search,
  setSearch,
  onDelete,
  onEdit,
  onView,
  onExport,
  relationOptions = {}
}: {
  rows: AnyRecord[];
  fields: ModuleField[];
  search: string;
  setSearch: (value: string) => void;
  onDelete: (id: string) => void;
  onEdit: (row: AnyRecord) => void;
  onView?: (row: AnyRecord) => void;
  onExport: () => void;
  relationOptions?: Record<string, RelationOption[]>;
}) {
  const visibleFields = useMemo(() => fields.filter((field) => field.tableVisible !== false).slice(0, 8), [fields]);
  const lookups = useMemo(() => Object.entries(relationOptions).reduce<Record<string, Record<string, string>>>((acc, [field, options]) => {
    acc[field] = Object.fromEntries(options.map((option) => [option.value, option.label]));
    return acc;
  }, {}), [relationOptions]);

  return (
    <div className="glass rounded-lg p-4 shadow-soft md:p-5">
      <div className="mb-4 rounded-lg border border-slate-200/70 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/45">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <label className="relative flex-1 md:max-w-xl">
            <span className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Filtro rápido</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input className="input input-with-icon input-with-clear" placeholder="Pesquisar por nome, código ou descrição..." value={search} onChange={(event) => setSearch(event.target.value)} />
              {search ? (
                <button className="absolute right-2 top-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100" onClick={() => setSearch("")} type="button" title="Limpar busca">
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </label>
          <button className="btn btn-secondary md:mb-0" onClick={onExport} type="button">
            <Download className="h-4 w-4" /> Baixar planilha
          </button>
        </div>
      </div>
      <div className="table-wrap rounded-lg border border-slate-200/70 dark:border-slate-800">
        <table>
          <thead className="bg-slate-50/80 dark:bg-slate-900/70">
            <tr>
              {visibleFields.map((field) => <th key={field.name}>{field.label}</th>)}
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className={`${onView ? "cursor-pointer" : ""} hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10`} onClick={onView ? () => onView(row) : undefined}>
                {visibleFields.map((field) => <td key={field.name}>{renderCell(row[field.name], field, lookups)}</td>)}
                <td>
                  <div className="flex gap-2">
                    {onView ? (
                      <button className="rounded-lg border border-emerald-200 p-2 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-200 dark:hover:bg-emerald-950" onClick={(event) => { event.stopPropagation(); onView(row); }} title="Ver detalhes" type="button">
                        <Eye className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={(event) => { event.stopPropagation(); onEdit(row); }} title="Editar" type="button">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" onClick={(event) => { event.stopPropagation(); onDelete(row.id); }} title="Excluir" type="button">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={visibleFields.length + 1} className="py-12 text-center text-slate-500">Nenhum registro encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
