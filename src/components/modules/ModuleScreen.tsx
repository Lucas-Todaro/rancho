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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DataTable } from "@/components/ui/DataTable";
import { AnimalCards } from "@/components/modules/AnimalCards";
import { ModuleForm } from "@/components/modules/ModuleForm";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRecord, deleteRecord, deleteRecords, listRecords, loadRelationOptions, subscribeTable, updateRecord } from "@/services/crud";
import { syncAnimalPhaseAfterEvent } from "@/services/animal-lifecycle";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { removeEventCostFromFinance, syncEventCostToFinance } from "@/services/event-finance";
import { removeProductionStockMovement, syncProductionStockMovement, validateProductionStockDestination } from "@/services/production-stock";
import { useAuth } from "@/lib/auth-context";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, ModuleConfig, RelationOption } from "@/lib/types";
import { financialAmount, isFinancialExpense, isFinancialIncome } from "@/lib/finance";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { animalBlockedMessage, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import { canManageData, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";

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

function persistedFormValues(config: ModuleConfig, values: AnyRecord) {
  return config.fields.reduce<AnyRecord>((acc, field) => {
    if (!field.formOnly) acc[field.name] = values[field.name];
    return acc;
  }, {});
}

export function ModuleScreen({ config }: { config: ModuleConfig }) {
  const { dataContext, profile, session } = useAuth();
  const farmId = dataContext.fazendaId;
  const userId = dataContext.usuarioId;
  const queryContext = useMemo(() => ({ fazendaId: farmId, usuarioId: userId }), [farmId, userId]);
  const [rows, setRows] = useState<AnyRecord[]>([]);
  const [relationOptions, setRelationOptions] = useState<Record<string, RelationOption[]>>({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [selectedAnimal, setSelectedAnimal] = useState<AnyRecord | null>(null);
  const [animalDeleteTarget, setAnimalDeleteTarget] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement | null>(null);

  const Icon = moduleIcons[config.icon] || Database;
  const showPlaceholders = loading || Boolean(error && !rows.length);
  const canManage = canManageData(profile);

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
      setSelectedAnimal((current) => current ? data.find((row) => String(row.id) === String(current.id)) || current : current);
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

  async function assertAnimalCanReceiveRecord(values: AnyRecord) {
    const isAnimalRecord = config.tableName === TABLES.ordenhas || config.tableName === TABLES.eventosAnimal;
    if (!isAnimalRecord || !values.animal_id) return;
    const [animal] = await listRecords(TABLES.animais, {
      fazendaId: dataContext.fazendaId,
      usuarioId: dataContext.usuarioId,
      filters: [{ column: "id", value: values.animal_id }]
    });

    if (animal && isAnimalInactiveForBot(animal)) {
      throw new Error(animalBlockedMessage(animal, config.tableName === TABLES.ordenhas ? "PRODUCAO_LEITE" : "novas movimentações"));
    }
  }

  const openEditor = useCallback((row: AnyRecord) => {
    setEditing(row);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  async function submit(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);
      await assertAnimalCanReceiveRecord(values);
      if (config.tableName === TABLES.ordenhas) {
        await validateProductionStockDestination(values, dataContext);
      }

      const payload = persistedFormValues(config, values);
      if (config.tableName === TABLES.ordenhas) {
        delete payload.estoque_item_id;
        if (values.adicionar_ao_estoque) {
          payload.estoque_item_id = values.estoque_item_id || null;
        } else if (editing?.estoque_item_id) {
          payload.estoque_item_id = null;
        }
      }

      if (editing?.id) {
        const updated = await updateRecord(config.tableName, editing.id, payload);
        if (config.tableName === TABLES.eventosAnimal) {
          const eventRecord = updated || { ...editing, ...payload };
          await syncEventCostToFinance(eventRecord, dataContext, relationOptions.animal_id);
          await syncAnimalPhaseAfterEvent(eventRecord, dataContext);
        }
        if (config.tableName === TABLES.ordenhas) {
          await syncProductionStockMovement(updated || { ...editing, ...payload, id: editing.id }, dataContext);
        }
        setEditing(null);
      } else {
        const created = await createRecord(config.tableName, payload, dataContext);
        if (config.tableName === TABLES.eventosAnimal) {
          const eventRecord = created || payload;
          await syncEventCostToFinance(eventRecord, dataContext, relationOptions.animal_id);
          await syncAnimalPhaseAfterEvent(eventRecord, dataContext);
        }
        if (config.tableName === TABLES.ordenhas) {
          await syncProductionStockMovement(created || payload, dataContext);
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
    if (config.tableName === TABLES.animais) {
      const animal = rows.find((row) => String(row.id) === String(id));
      if (animal) {
        setAnimalDeleteTarget(animal);
        return;
      }
    }

    const ok = window.confirm("Tem certeza que deseja excluir este registro?");
    if (!ok) return;
    setBusy(true);
    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);
      const deletedRow = rows.find((row) => String(row.id) === String(id));
      if (config.tableName === TABLES.ordenhas) {
        await removeProductionStockMovement(id, dataContext);
      }
      await deleteRecord(config.tableName, id);
      if (config.tableName === TABLES.eventosAnimal && deletedRow) {
        await removeEventCostFromFinance(id, dataContext);
      }
      notifyDashboardUpdated();
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível excluir o registro agora."));
    } finally {
      setBusy(false);
    }
  }

  async function inactivateAnimal() {
    if (!animalDeleteTarget?.id) return;
    setBusy(true);
    setError("");
    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);
      await updateRecord(TABLES.animais, animalDeleteTarget.id, { status: "inativo" });
      setAnimalDeleteTarget(null);
      notifyDashboardUpdated();
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível inativar o animal agora."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAnimalAndLinks() {
    if (!animalDeleteTarget?.id) return;
    const animalId = String(animalDeleteTarget.id);
    setBusy(true);
    setError("");

    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);

      if (session?.access_token) {
        const response = await fetch("/api/animals/delete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ animalId })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok === false) {
          throw new Error(result?.error || "Não foi possível excluir o animal agora.");
        }
      } else {
        const [animalEvents, childrenByMother, childrenByFather] = await Promise.all([
          listRecords(TABLES.eventosAnimal, {
            fazendaId: dataContext.fazendaId,
            usuarioId: dataContext.usuarioId,
            filters: [{ column: "animal_id", value: animalId }]
          }),
          listRecords(TABLES.animais, {
            fazendaId: dataContext.fazendaId,
            usuarioId: dataContext.usuarioId,
            filters: [{ column: "mae_id", value: animalId }]
          }),
          listRecords(TABLES.animais, {
            fazendaId: dataContext.fazendaId,
            usuarioId: dataContext.usuarioId,
            filters: [{ column: "pai_id", value: animalId }]
          })
        ]);

        await Promise.all(animalEvents.map((event) => event.id ? removeEventCostFromFinance(String(event.id), dataContext) : Promise.resolve()));
        await deleteRecords(TABLES.ordenhas, [{ column: "animal_id", value: animalId }]);
        await deleteRecords(TABLES.eventosAnimal, [{ column: "animal_id", value: animalId }]);

        const children = Array.from(new Map([...childrenByMother, ...childrenByFather].map((child) => [String(child.id), child])).values());
        await Promise.all(children.map((child) => updateRecord(TABLES.animais, child.id, {
          ...(String(child.mae_id || "") === animalId ? { mae_id: null } : {}),
          ...(String(child.pai_id || "") === animalId ? { pai_id: null } : {})
        })));

        await deleteRecord(TABLES.animais, animalId);
      }

      setAnimalDeleteTarget(null);
      if (selectedAnimal?.id === animalId) setSelectedAnimal(null);
      notifyDashboardUpdated();
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível excluir o animal agora."));
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
        {canManage ? (
          <div ref={formRef} className="scroll-mt-24">
            <ModuleForm config={config} editing={editing} onSubmit={submit} onCancel={() => setEditing(null)} busy={busy} relationOptions={relationOptions} />
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Seu perfil pode consultar esta área, mas não pode criar, editar ou excluir registros.
          </div>
        )}
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
              onEdit={canManage ? openEditor : () => setError(PERMISSION_DENIED_MESSAGE)}
              onView={setSelectedAnimal}
              onExport={(animals) => exportCsv(config.key, animals, config.fields)}
              canManage={canManage}
            />
          ) : (
            <DataTable
              rows={filteredRows}
              fields={config.fields}
              search={search}
              setSearch={setSearch}
              onDelete={remove}
              onEdit={canManage ? openEditor : () => setError(PERMISSION_DENIED_MESSAGE)}
              onExport={() => exportCsv(config.key, filteredRows, config.fields)}
              relationOptions={relationOptions}
              loading={showPlaceholders}
              canManage={canManage}
            />
          )}
        </div>
      </div>

      {selectedAnimal && typeof document !== "undefined" ? createPortal(
        <AnimalDetailModal
          animal={selectedAnimal}
          context={dataContext}
          relationOptions={relationOptions}
          onClose={() => setSelectedAnimal(null)}
          onChanged={load}
        />,
        document.body
      ) : null}

      {animalDeleteTarget && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <h2 className="text-xl font-black">Excluir animal?</h2>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Ao confirmar, {animalDeleteTarget.nome || animalDeleteTarget.brinco || "este animal"} será excluído do rebanho e os vínculos de produção, eventos e genealogia relacionados também serão removidos ou atualizados.
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Se quiser preservar o histórico sem usar mais esse animal nos lançamentos, escolha apenas inativar.
            </p>

            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="btn btn-secondary" type="button" onClick={() => setAnimalDeleteTarget(null)} disabled={busy}>
                Cancelar
              </button>
              <button className="btn btn-secondary" type="button" onClick={inactivateAnimal} disabled={busy}>
                Só inativar
              </button>
              <button className="btn bg-red-600 text-white hover:bg-red-700" type="button" onClick={deleteAnimalAndLinks} disabled={busy}>
                {busy ? "Processando..." : "Excluir animal e vínculos"}
              </button>
            </div>
          </section>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
