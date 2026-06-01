"use client";

import dynamic from "next/dynamic";
import {
  Activity,
  ClipboardList,
  Clock3,
  Database,
  Droplets,
  Layers3,
  PackageOpen,
  PawPrint,
  Plus,
  Receipt,
  RefreshCw,
  Users,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { AnimalCards } from "@/components/modules/AnimalCards";
import { ModuleForm } from "@/components/modules/ModuleForm";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRecord, deleteRecord, listRecords, loadRelationOptions, subscribeTable, updateRecord } from "@/services/crud";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { useAuth } from "@/lib/auth-context";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, ModuleConfig, RelationOption } from "@/lib/types";
import { financialAmount, isFinancialExpense, isFinancialIncome } from "@/lib/finance";
import { formatCurrency, formatNumber, toDateOnlyString } from "@/lib/utils";

const AnimalDetailModal = dynamic(
  () => import("@/components/modules/AnimalDetailModal").then((module) => module.AnimalDetailModal),
  { ssr: false }
);

const moduleIcons: Record<string, LucideIcon> = {
  Layers3,
  PawPrint,
  ClipboardList,
  Droplets,
  PackageOpen,
  Wallet,
  Users,
  Clock3,
  Receipt
};

function calcStat(rows: AnyRecord[], stat: NonNullable<ModuleConfig["quickStats"]>[number]) {
  if (stat.mode === "count") return rows.length;
  if (stat.mode === "active") return rows.filter((row) => row[stat.field] === true || row[stat.field] === "ativo").length;
  if (stat.mode === "critical") return rows.filter((row) => Number(row[stat.field] || 0) <= Number(row[stat.compareField || "quantidade_minima"] || 0)).length;
  if (stat.mode === "moneyIn") return formatCurrency(rows.filter(isFinancialIncome).reduce((sum, row) => sum + financialAmount(row, stat.field), 0));
  if (stat.mode === "moneyOut") return formatCurrency(rows.filter(isFinancialExpense).reduce((sum, row) => sum + financialAmount(row, stat.field), 0));

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

function dateOnly(value: unknown) {
  return toDateOnlyString(String(value || ""));
}

export function ModuleScreen({ config }: { config: ModuleConfig }) {
  const { dataContext } = useAuth();
  const farmId = dataContext.fazendaId;
  const userId = dataContext.usuarioId;
  const queryContext = useMemo(() => ({ fazendaId: farmId, usuarioId: userId }), [farmId, userId]);
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const Icon = moduleIcons[config.icon] || Database;
  const showPlaceholders = loading || Boolean(error && !rows.length);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const relationFields = config.fields.filter((field) => field.type === "relation" && field.relation);
      const [data, relationPairs] = await Promise.all([
        listRecords(config.tableName, { orderBy: config.orderBy, fazendaId: queryContext.fazendaId, usuarioId: queryContext.usuarioId }),
        Promise.all(relationFields.map(async (field) => [field.name, await loadRelationOptions(field, queryContext)] as const))
      ]);
      setRows(data);
      setRelationOptions(Object.fromEntries(relationPairs));
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível carregar os dados agora."));
    } finally {
      setLoading(false);
    }
  }, [config.fields, config.orderBy, config.tableName, queryContext]);

  useEffect(() => {
    load();
    return subscribeTable(config.tableName, load);
  }, [config.tableName, load]);

  const searchableRows = useMemo(
    () => rows.map((row) => ({ row, text: JSON.stringify(row).toLowerCase() })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return searchableRows.filter((item) => item.text.includes(term)).map((item) => item.row);
  }, [rows, search, searchableRows]);

  async function submit(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      if (editing?.id) {
        await updateRecord(config.tableName, editing.id, values);
        setEditing(null);
      } else {
        await createRecord(config.tableName, values, dataContext);
        if (config.tableName === TABLES.eventosAnimal && Number(values.custo || 0) > 0) {
          await createRecord(TABLES.transacoesFinanceiras, {
            tipo: "saida",
            data_transacao: dateOnly(values.data_evento),
            valor: Number(values.custo || 0),
            categoria: "Saúde do rebanho",
            descricao: values.descricao || `Evento do animal ${values.animal_id || ""}`.trim(),
            metodo_pagamento: "Lançamento de evento"
          }, dataContext);
        }
      }
      notifyDashboardUpdated();
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível salvar o registro agora."));
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
      notifyDashboardUpdated();
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível excluir o registro agora."));
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
          <StatCard key={stat.label} title={stat.label} value={calcStat(rows, stat)} hint="Resumo da tela" icon={index % 2 ? Activity : Icon} tone={index % 2 ? "blue" : "green"} loading={showPlaceholders} />
        ))}
      </div>

      <div className="space-y-6">
        <ModuleForm config={config} editing={editing} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy} relationOptions={relationOptions} />
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black">{config.key === "rebanho" ? "Animais do rebanho" : "Registros"}</h2>
            <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Plus className="h-4 w-4" /> {showPlaceholders ? <Skeleton className="h-4 w-20" /> : config.key === "rebanho" ? `${rows.length} animais` : `${filteredRows.length} itens`}
            </div>
          </div>
          {config.key === "rebanho" ? (
            <AnimalCards
              rows={rows}
              search={search}
              setSearch={setSearch}
              relationOptions={relationOptions}
              loading={showPlaceholders}
              onDelete={remove}
              onEdit={setEditing}
              onView={setSelectedAnimal}
              onExport={(animals) => exportCsv(config.key, animals, config.fields)}
            />
          ) : (
            <DataTable
              rows={filteredRows}
              fields={config.fields}
              search={search}
              setSearch={setSearch}
              onDelete={remove}
              onEdit={setEditing}
              onExport={() => exportCsv(config.key, filteredRows, config.fields)}
              relationOptions={relationOptions}
              loading={showPlaceholders}
            />
          )}
        </div>
      </div>

      {selectedAnimal ? (
        <AnimalDetailModal
          animal={selectedAnimal}
          context={dataContext}
          relationOptions={relationOptions}
          onClose={() => setSelectedAnimal(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
