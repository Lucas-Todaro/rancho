"use client";

import { Download, Pencil, Search, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AnyRecord, ModuleField } from "@/lib/types";
import { Badge } from "@/components/ui/Badge";

function renderCell(value: any, field: ModuleField) {
  if (field.type === "currency") return formatCurrency(value);
  if (field.type === "date") return formatDate(value);
  if (field.type === "number") return String(value ?? 0);
  if (field.type === "select") {
    const label = field.options?.find((option) => option.value === value)?.label || value || "-";
    const tone = ["ativo", "pago", "boa", "receita", "ok"].includes(String(value))
      ? "success"
      : ["pendente", "ferias", "vacinacao_pendente", "aberta"].includes(String(value))
        ? "warning"
        : ["despesa", "atrasado", "falecido", "tratamento", "descartar"].includes(String(value))
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
  onExport
}: {
  rows: AnyRecord[];
  fields: ModuleField[];
  search: string;
  setSearch: (value: string) => void;
  onDelete: (id: string) => void;
  onEdit: (row: AnyRecord) => void;
  onExport: () => void;
}) {
  const visibleFields = fields.filter((field) => field.tableVisible !== false).slice(0, 8);

  return (
    <div className="glass rounded-3xl p-4 shadow-soft">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar registros..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={onExport} type="button">
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
      </div>
      <div className="table-wrap rounded-2xl border border-slate-200/70 dark:border-slate-800">
        <table>
          <thead className="bg-slate-50/80 dark:bg-slate-900/70">
            <tr>
              {visibleFields.map((field) => <th key={field.name}>{field.label}</th>)}
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row) => (
              <tr key={row.id} className="hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10">
                {visibleFields.map((field) => <td key={field.name}>{renderCell(row[field.name], field)}</td>)}
                <td>
                  <div className="flex gap-2">
                    <button className="rounded-xl border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" onClick={() => onEdit(row)} title="Editar" type="button">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded-xl border border-red-200 p-2 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" onClick={() => onDelete(row.id)} title="Excluir" type="button">
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
