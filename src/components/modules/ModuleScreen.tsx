"use client";

import * as Icons from "lucide-react";
import { Plus, RefreshCw, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { ModuleForm } from "@/components/modules/ModuleForm";
import { StatCard } from "@/components/ui/StatCard";
import { createRecord, deleteRecord, listRecords, loadRelationOptions, subscribeTable, updateRecord } from "@/services/crud";
import { useAuth } from "@/lib/auth-context";
import type { AnyRecord, ModuleConfig, RelationOption } from "@/lib/types";
import { formatCurrency, formatNumber } from "@/lib/utils";

function calcStat(rows: AnyRecord[], stat: NonNullable<ModuleConfig["quickStats"]>[number]) {
  if (stat.mode === "count") return rows.length;
  if (stat.mode === "active") return rows.filter((row) => row[stat.field] === true || row[stat.field] === "ativo").length;
  if (stat.mode === "critical") return rows.filter((row) => Number(row[stat.field] || 0) <= Number(row[stat.compareField || "quantidade_minima"] || 0)).length;
  if (stat.mode === "moneyIn") return formatCurrency(rows.filter((row) => row.tipo === "entrada").reduce((sum, row) => sum + Number(row[stat.field] || 0), 0));
  if (stat.mode === "moneyOut") return formatCurrency(rows.filter((row) => row.tipo === "saida").reduce((sum, row) => sum + Number(row[stat.field] || 0), 0));

  const sum = rows.reduce((total, row) => total + Number(row[stat.field] || 0), 0);
  if (stat.mode === "avg") return formatNumber(rows.length ? sum / rows.length : 0, stat.suffix || "");
  if (["salario_base", "valor", "total_liquido", "custo"].includes(stat.field)) return formatCurrency(sum);
  return formatNumber(sum, stat.suffix || "");
}

function exportCsv(filename: string, rows: AnyRecord[], fields: ModuleConfig["fields"]) {
  const visible = fields.filter((field) => field.tableVisible !== false);
  const header = visible.map((field) => `"${field.label}"`).join(",");
  const body = rows.map((row) => visible.map((field) => `"${String(row[field.name] ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ModuleScreen({ config }: { config: ModuleConfig }) {
  const { dataContext } = useAuth();
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const Icon = ((Icons as any)[config.icon] || Icons.Database) as LucideIcon;

  async function load() {
    setLoading(true);
    setError("");
    try {
      const relationFields = config.fields.filter((field) => field.type === "relation" && field.relation);
      const [data, relationPairs] = await Promise.all([
        listRecords(config.tableName, { orderBy: config.orderBy, fazendaId: dataContext.fazendaId, usuarioId: dataContext.usuarioId }),
        Promise.all(relationFields.map(async (field) => [field.name, await loadRelationOptions(field, dataContext)] as const))
      ]);
      setRows(data);
      setRelationOptions(Object.fromEntries(relationPairs));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    return subscribeTable(config.tableName, load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.tableName, dataContext.fazendaId]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }, [rows, search]);

  async function submit(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      if (editing?.id) {
        await updateRecord(config.tableName, editing.id, values);
        setEditing(null);
      } else {
        await createRecord(config.tableName, values, dataContext);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("Tem certeza que deseja excluir este registro?");
    if (!ok) return;
    setBusy(true);
    try {
      await deleteRecord(config.tableName, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <Icon className="h-4 w-4" /> {config.title}
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">{config.title}</h1>
          <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">{config.subtitle}</p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={load}>
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(config.quickStats || []).map((stat, index) => (
          <StatCard key={stat.label} title={stat.label} value={calcStat(rows, stat)} hint="Atualiza com o Realtime" icon={index % 2 ? Icons.Activity : Icon} tone={index % 2 ? "blue" : "green"} />
        ))}
        <StatCard title="Tabela" value={config.tableName} hint="Mapeada no Supabase" icon={Icons.Database} tone="slate" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <ModuleForm config={config} editing={editing} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy} relationOptions={relationOptions} />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">Registros</h2>
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Plus className="h-4 w-4" /> {loading ? "Carregando..." : `${filteredRows.length} itens`}
            </div>
          </div>
          <DataTable rows={filteredRows} fields={config.fields} search={search} setSearch={setSearch} onDelete={remove} onEdit={setEditing} onExport={() => exportCsv(config.key, filteredRows, config.fields)} relationOptions={relationOptions} />
        </div>
      </div>
    </div>
  );
}
