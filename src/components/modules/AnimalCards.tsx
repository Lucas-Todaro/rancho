"use client";

import { Download, Eye, PawPrint, Pencil, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
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

export function AnimalCards({
  rows,
  search,
  setSearch,
  relationOptions,
  loading,
  onView,
  onEdit,
  onDelete,
  onExport
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
        displayLabel(categoryLabels, animal.categoria),
        displayLabel(phaseLabels, animal.fase),
        displayLabel(statusLabels, animal.status),
        animal.raca,
        animal.peso,
        loteLookup[String(animal.lote_id || "")]
      ].filter(Boolean).join(" ").toLowerCase();

      return text.includes(term);
    });
  }, [loteFilter, loteLookup, rows, search, statusFilter]);

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-slate-200/70 bg-white/88 p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950/70 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input input-with-icon"
              placeholder="Buscar por brinco, raça, fase ou lote..."
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
          <strong className="text-slate-800 dark:text-slate-100">{loading ? "Carregando..." : `${filteredAnimals.length} animais`}</strong>
          <span>encontrados na visão atual.</span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {filteredAnimals.length ? filteredAnimals.map((animal) => {
          const lote = loteLookup[String(animal.lote_id || "")] || "Sem lote";
          const phase = displayLabel(phaseLabels, animal.fase, "Sem fase");
          const category = displayLabel(categoryLabels, animal.categoria, "Animal");
          const status = displayLabel(statusLabels, animal.status, "Ativo");

          return (
            <article
              key={animal.id}
              className="group min-w-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-soft dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-emerald-800"
              onClick={() => onView(animal)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-2xl font-black tracking-tight">{animal.brinco || "Sem brinco"}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">{status}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${phaseTone(animal.fase)}`}>
                  {phase}
                </span>
              </div>

              <div className="my-8 flex justify-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-100 text-slate-400 transition group-hover:bg-emerald-50 group-hover:text-emerald-600 dark:bg-slate-900 dark:group-hover:bg-emerald-950/40 dark:group-hover:text-emerald-200">
                  <PawPrint className="h-11 w-11" />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 border-b border-slate-100 pb-4 text-center text-sm dark:border-slate-800">
                <div className="min-w-0">
                  <p className="text-slate-500 dark:text-slate-400">Categoria</p>
                  <strong className="mt-1 block truncate">{category}</strong>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 dark:text-slate-400">Raça</p>
                  <strong className="mt-1 block truncate">{animal.raca || "-"}</strong>
                </div>
                <div className="min-w-0">
                  <p className="text-slate-500 dark:text-slate-400">Lote</p>
                  <strong className="mt-1 block truncate">{lote}</strong>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button className="btn flex-1 bg-emerald-600 text-white" type="button" onClick={(event) => { event.stopPropagation(); onView(animal); }}>
                  <Eye className="h-4 w-4" /> Ver ficha
                </button>
                <button className="rounded-lg border border-slate-200 p-3 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={(event) => { event.stopPropagation(); onEdit(animal); }} title="Editar animal">
                  <Pencil className="h-4 w-4" />
                </button>
                <button className="rounded-lg border border-red-200 p-3 text-red-600 transition hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" type="button" onClick={(event) => { event.stopPropagation(); onDelete(animal.id); }} title="Excluir animal">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 md:col-span-2 2xl:col-span-3">
            {loading ? "Carregando rebanho..." : "Nenhum animal encontrado com esses filtros."}
          </div>
        )}
      </div>
    </section>
  );
}
