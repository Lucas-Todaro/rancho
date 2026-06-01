"use client";

import { Download, Eye, PawPrint, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAnimalSexInfo } from "@/lib/animal-sex";
import type { AnyRecord, RelationOption } from "@/lib/types";

const categoryLabels: Record<string, string> = {
  vaca: "Vaca",
  boi: "Boi",
  bezerro: "Bezerro",
  novilha: "Novilha",
  touro: "Touro",
  outro: "Outro"
};

const phaseLabels: Record<string, string> = {
  lactacao: "Lactação",
  seca: "Seca",
  gestante: "Gestante",
  vazia: "Vazia",
  crescimento: "Crescimento",
  engorda: "Engorda",
  nao_aplicavel: "Não aplicável"
};

const statusLabels: Record<string, string> = {
  ativo: "Ativo",
  vendido: "Vendido",
  morto: "Morto",
  inativo: "Inativo"
};

function displayLabel(map: Record<string, string>, value: unknown, fallback = "-") {
  return map[String(value || "")] || String(value || fallback);
}

function phaseTone(value: unknown) {
  if (value === "gestante") return "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-200";
  if (value === "lactacao") return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-200";
  if (value === "vazia") return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200";
}

function AnimalCardSkeleton() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-2 h-4 w-16" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
        <Skeleton className="h-8 rounded-lg" />
      </div>
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
    </article>
  );
}

export function AnimalCards({
  rows,
  search,
  setSearch,
  relationOptions,
  loading,
  onView,
  onEdit,
  onDelete,
  onExport,
  canManage = true
}: {
  rows: AnyRecord[];
  search: string;
  setSearch: (value: string) => void;
  relationOptions: Record<string, RelationOption[]>;
  loading?: boolean;
  onView: (row: AnyRecord) => void;
  onEdit: (row: AnyRecord) => void;
  onDelete: (id: string) => void;
  onExport: (rows: AnyRecord[]) => void;
  canManage?: boolean;
}) {
  const [loteFilter, setLoteFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const loteLookup = useMemo(
    () => Object.fromEntries((relationOptions.lote_id || []).map((option) => [option.value, option.label])),
    [relationOptions.lote_id]
  );

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => String(row.status || "")).filter(Boolean)));
    return values.map((value) => ({ value, label: displayLabel(statusLabels, value) }));
  }, [rows]);

  const filteredAnimals = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((animal) => {
      if (loteFilter && animal.lote_id !== loteFilter) return false;
      if (statusFilter && animal.status !== statusFilter) return false;
      if (!term) return true;

      const text = [
        animal.brinco,
        animal.nome,
        displayLabel(categoryLabels, animal.categoria),
        displayLabel(phaseLabels, animal.fase),
        displayLabel(statusLabels, animal.status),
        getAnimalSexInfo(animal).label,
        animal.raca,
        animal.peso,
        loteLookup[String(animal.lote_id || "")]
      ].filter(Boolean).join(" ").toLowerCase();

      return text.includes(term);
    });
  }, [loteFilter, loteLookup, rows, search, statusFilter]);

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input input-with-icon"
              placeholder="Buscar por nome, brinco, raça, fase ou lote..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <button
                className="absolute right-3 top-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                type="button"
                onClick={() => setSearch("")}
                title="Limpar busca"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>

          <div className="grid gap-3 sm:grid-cols-3 lg:w-[34rem]">
            <select className="input" value={loteFilter} onChange={(event) => setLoteFilter(event.target.value)}>
              <option value="">Todos os lotes</option>
              {(relationOptions.lote_id || []).map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Todos os status</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button className="btn btn-secondary" type="button" onClick={() => onExport(filteredAnimals)}>
              <Download className="h-4 w-4" /> Exportar
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          {loading ? <Skeleton className="h-5 w-28" /> : <strong className="text-slate-800 dark:text-slate-100">{`${filteredAnimals.length} animais`}</strong>}
          <span>encontrados na visão atual.</span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {loading ? Array.from({ length: 6 }).map((_, index) => <AnimalCardSkeleton key={`animal-skeleton-${index}`} />) : filteredAnimals.length ? filteredAnimals.map((animal) => {
          const lote = loteLookup[String(animal.lote_id || "")] || "Sem lote";
          const phase = displayLabel(phaseLabels, animal.fase, "Sem fase");
          const category = displayLabel(categoryLabels, animal.categoria, "Animal");
          const status = displayLabel(statusLabels, animal.status, "Ativo");
          const sex = getAnimalSexInfo(animal);

          return (
            <article
              key={animal.id}
              className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border p-3 pl-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-soft dark:hover:border-emerald-800 ${sex.accentClassName}`}
              onClick={() => onView(animal)}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${sex.stripeClassName}`} aria-hidden="true" />
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${sex.iconClassName}`}>
                  <PawPrint className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-black tracking-tight">{animal.nome || animal.brinco || "Sem brinco"}</h3>
                  <p className="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">
                    {animal.nome ? `Código: ${animal.brinco || "Sem brinco"}` : status}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`max-w-28 truncate rounded-full px-2.5 py-1 text-xs font-black ${phaseTone(animal.fase)}`}>
                    {phase}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${sex.className}`}>
                    {sex.label}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-b border-slate-200/70 pb-3 text-xs dark:border-slate-800">
                <div className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Categoria</p>
                  <strong className="mt-1 block truncate">{category}</strong>
                </div>
                <div className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Raça</p>
                  <strong className="mt-1 block truncate">{animal.raca || "-"}</strong>
                </div>
                <div className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Lote</p>
                  <strong className="mt-1 block truncate">{lote}</strong>
                </div>
                <div className="min-w-0 rounded-lg bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800">
                  <p className="text-slate-500 dark:text-slate-400">Status</p>
                  <strong className="mt-1 block truncate">{status}</strong>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn h-10 min-h-10 flex-1 bg-emerald-600 px-3 py-2 text-sm text-white" type="button" onClick={(event) => { event.stopPropagation(); onView(animal); }}>
                  <Eye className="h-4 w-4" /> Ver ficha
                </button>
                {canManage ? (
                  <>
                    <button className="h-10 rounded-lg border border-slate-200 p-2.5 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={(event) => { event.stopPropagation(); onEdit(animal); }} title="Editar animal">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="h-10 rounded-lg border border-red-200 p-2.5 text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" type="button" onClick={(event) => { event.stopPropagation(); onDelete(animal.id); }} title="Excluir animal">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 sm:col-span-2 xl:col-span-3 2xl:col-span-4">
            Nenhum animal encontrado com esses filtros.
          </div>
        )}
      </div>
    </section>
  );
}
