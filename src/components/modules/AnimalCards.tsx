"use client";

import { Download, Eye, PawPrint, Pencil, Search, Trash2, X } from "lucide-react";
import { memo, useDeferredValue, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/AsyncState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAnimalSexInfo } from "@/lib/animal-sex";
import type { AnyRecord, RelationOption } from "@/lib/types";

const ANIMAL_RENDER_BATCH_SIZE = 72;

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
  if (value === "gestante") return "bg-purple-100 text-purple-700 dark:bg-purple-900/70 dark:text-purple-100";
  if (value === "lactacao") return "bg-blue-100 text-blue-700 dark:bg-blue-900/70 dark:text-blue-100";
  if (value === "vazia") return "bg-amber-100 text-amber-700 dark:bg-amber-900/70 dark:text-amber-100";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/70 dark:text-emerald-100";
}

function normalizeSexValue(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getAnimalSexVisual(animal: AnyRecord) {
  const sex = normalizeSexValue(
    animal.sexo ||
    animal.sex ||
    animal.genero ||
    animal.gender
  );

  const isMale = ["macho", "m", "male", "masculino"].includes(sex);
  const isFemale = ["femea", "f", "female", "feminino"].includes(sex);

  if (isMale) {
    return {
      card: "border-blue-300 bg-blue-50/70 hover:border-blue-400 hover:bg-blue-100/70 dark:border-blue-700/80 dark:bg-blue-950/45 dark:hover:border-blue-500 dark:hover:bg-blue-900/45",
      stripe: "bg-blue-500 dark:bg-blue-400",
      icon: "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-600 dark:bg-blue-900/80 dark:text-blue-100",
      badge: "border-blue-300 bg-blue-100 text-blue-700 dark:border-blue-600 dark:bg-blue-900/80 dark:text-blue-100",
      infoBox: "bg-white/85 ring-blue-200/80 dark:bg-slate-950/60 dark:ring-blue-800/60"
    };
  }

  if (isFemale) {
    return {
      card: "border-pink-300 bg-pink-50/70 hover:border-pink-400 hover:bg-pink-100/70 dark:border-pink-700/80 dark:bg-pink-950/45 dark:hover:border-pink-500 dark:hover:bg-pink-900/45",
      stripe: "bg-pink-500 dark:bg-pink-400",
      icon: "border-pink-300 bg-pink-100 text-pink-700 dark:border-pink-600 dark:bg-pink-900/80 dark:text-pink-100",
      badge: "border-pink-300 bg-pink-100 text-pink-700 dark:border-pink-600 dark:bg-pink-900/80 dark:text-pink-100",
      infoBox: "bg-white/85 ring-pink-200/80 dark:bg-slate-950/60 dark:ring-pink-800/60"
    };
  }

  return {
    card: "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-700",
    stripe: "bg-slate-300 dark:bg-slate-700",
    icon: "border-slate-200 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    badge: "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
    infoBox: "bg-white ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800"
  };
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

export const AnimalCards = memo(function AnimalCards({
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
  const [visibleLimit, setVisibleLimit] = useState(ANIMAL_RENDER_BATCH_SIZE);
  const deferredSearch = useDeferredValue(search);

  const loteLookup = useMemo(
    () => Object.fromEntries((relationOptions.lote_id || []).map((option) => [option.value, option.label])),
    [relationOptions.lote_id]
  );

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((row) => String(row.status || "")).filter(Boolean)));
    return values.map((value) => ({ value, label: displayLabel(statusLabels, value) }));
  }, [rows]);

  const filteredAnimals = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();

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
  }, [deferredSearch, loteFilter, loteLookup, rows, statusFilter]);

  const visibleAnimals = useMemo(
    () => filteredAnimals.slice(0, visibleLimit),
    [filteredAnimals, visibleLimit]
  );
  const hasActiveFilters = Boolean(deferredSearch.trim() || loteFilter || statusFilter);

  useEffect(() => {
    setVisibleLimit(ANIMAL_RENDER_BATCH_SIZE);
  }, [deferredSearch, loteFilter, rows.length, statusFilter]);

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
        {loading ? Array.from({ length: 6 }).map((_, index) => <AnimalCardSkeleton key={`animal-skeleton-${index}`} />) : filteredAnimals.length ? visibleAnimals.map((animal) => {
          const lote = loteLookup[String(animal.lote_id || "")] || "Sem lote";
          const phase = displayLabel(phaseLabels, animal.fase, "Sem fase");
          const category = displayLabel(categoryLabels, animal.categoria, "Animal");
          const status = displayLabel(statusLabels, animal.status, "Ativo");
          const sex = getAnimalSexInfo(animal);
          const sexVisual = getAnimalSexVisual(animal);

          return (
            <article
              key={animal.id}
              className={`group relative min-w-0 cursor-pointer overflow-hidden rounded-lg border p-3 pl-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft ${sexVisual.card}`}
              onClick={() => onView(animal)}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${sexVisual.stripe}`} aria-hidden="true" />

              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${sexVisual.icon}`}>
                  <PawPrint className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-black tracking-tight text-slate-900 dark:text-slate-50">
                    {animal.nome || animal.brinco || "Sem brinco"}
                  </h3>
                  <p className="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">
                    {animal.nome ? `Código: ${animal.brinco || "Sem brinco"}` : status}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`max-w-28 truncate rounded-full px-2.5 py-1 text-xs font-black ${phaseTone(animal.fase)}`}>
                    {phase}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${sexVisual.badge}`}>
                    {sex.label}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-b border-slate-200/70 pb-3 text-xs dark:border-slate-800">
                <div className={`min-w-0 rounded-lg p-2 ring-1 ${sexVisual.infoBox}`}>
                  <p className="text-slate-500 dark:text-slate-400">Categoria</p>
                  <strong className="mt-1 block truncate text-slate-900 dark:text-slate-50">{category}</strong>
                </div>
                <div className={`min-w-0 rounded-lg p-2 ring-1 ${sexVisual.infoBox}`}>
                  <p className="text-slate-500 dark:text-slate-400">Raça</p>
                  <strong className="mt-1 block truncate text-slate-900 dark:text-slate-50">{animal.raca || "-"}</strong>
                </div>
                <div className={`min-w-0 rounded-lg p-2 ring-1 ${sexVisual.infoBox}`}>
                  <p className="text-slate-500 dark:text-slate-400">Lote</p>
                  <strong className="mt-1 block truncate text-slate-900 dark:text-slate-50">{lote}</strong>
                </div>
                <div className={`min-w-0 rounded-lg p-2 ring-1 ${sexVisual.infoBox}`}>
                  <p className="text-slate-500 dark:text-slate-400">Status</p>
                  <strong className="mt-1 block truncate text-slate-900 dark:text-slate-50">{status}</strong>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn h-10 min-h-10 flex-1 bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onView(animal);
                  }}
                >
                  <Eye className="h-4 w-4" /> Ver ficha
                </button>

                {canManage ? (
                  <>
                    <button
                      className="h-10 rounded-lg border border-slate-200 bg-white p-2.5 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(animal);
                      }}
                      title="Editar animal"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      className="h-10 rounded-lg border border-red-200 bg-white p-2.5 text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-300 dark:hover:bg-red-950/60"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDelete(animal.id);
                      }}
                      title="Excluir animal"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <EmptyState
            className="sm:col-span-2 xl:col-span-3 2xl:col-span-4"
            title={hasActiveFilters ? "Nenhum animal encontrado com esses filtros." : "Voce ainda nao cadastrou animais."}
            message={hasActiveFilters ? "Limpe a busca ou ajuste os filtros para ver mais resultados." : "Cadastre o primeiro animal para acompanhar rebanho, producao e eventos."}
          />
        )}
      </div>
      {!loading && filteredAnimals.length > visibleLimit ? (
        <div className="flex justify-center">
          <button className="btn btn-secondary" type="button" onClick={() => setVisibleLimit((current) => current + ANIMAL_RENDER_BATCH_SIZE)}>
            Mostrar mais animais
          </button>
        </div>
      ) : null}
    </section>
  );
});
//o
