"use client";

import { GitBranch, PawPrint, Save, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAnimalSexInfo } from "@/lib/animal-sex";
import { useAuth } from "@/lib/auth-context";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listRecords, subscribeTable, updateRecord } from "@/services/crud";

const categoryLabels: Record<string, string> = {
  vaca: "Vaca",
  boi: "Boi",
  bezerro: "Bezerro",
  novilha: "Novilha",
  touro: "Touro",
  outro: "Outro"
};

function animalLabel(animal?: AnyRecord | null) {
  if (!animal) return "Não informado";
  return animal.nome ? `${animal.nome} (${animal.brinco || "sem brinco"})` : animal.brinco || "Sem brinco";
}

function categoryLabel(value: unknown) {
  return categoryLabels[String(value || "")] || String(value || "Animal");
}

function collectDescendantIds(animalId: string, animals: AnyRecord[]) {
  const descendants = new Set<string>();
  const visit = (id: string) => {
    animals
      .filter((item) => String(item.mae_id || "") === id || String(item.pai_id || "") === id)
      .forEach((child) => {
        const childId = String(child.id || "");
        if (!childId || descendants.has(childId)) return;
        descendants.add(childId);
        visit(childId);
      });
  };

  visit(animalId);
  return descendants;
}

function TreeCard({ label, animal, active = false }: { label: string; animal?: AnyRecord | null; active?: boolean }) {
  const sex = getAnimalSexInfo(animal);

  return (
    <div className={cn(
      "relative min-w-0 overflow-hidden rounded-lg border p-2.5 pl-3 text-left shadow-sm",
      active
        ? "border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40"
        : animal
          ? sex.accentClassName
          : "border-dashed border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/50"
    )}>
      {animal ? <span className={`absolute inset-y-0 left-0 w-1 ${sex.stripeClassName}`} aria-hidden="true" /> : null}
      <p className="truncate text-[0.68rem] font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <strong className="mt-1 block truncate text-sm text-slate-950 dark:text-slate-100" title={animalLabel(animal)}>{animalLabel(animal)}</strong>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {animal?.categoria ? <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.68rem] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">{categoryLabel(animal.categoria)}</span> : null}
        {animal ? <span className={`inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-bold ${sex.className}`}>{sex.label}</span> : null}
      </div>
    </div>
  );
}

function AnimalSkeleton() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>
      </div>
      <Skeleton className="mt-4 h-10 rounded-lg" />
    </article>
  );
}

export function GenealogyScreen() {
  const { dataContext } = useAuth();
  const [animals, setAnimals] = useState<AnyRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [draft, setDraft] = useState({ mae_id: "", pai_id: "", genealogia_observacoes: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listRecords(TABLES.animais, {
        fazendaId: dataContext.fazendaId,
        usuarioId: dataContext.usuarioId,
        orderBy: "brinco",
        ascending: true
      });
      setAnimals(data);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível carregar a genealogia."));
    } finally {
      setLoading(false);
    }
  }, [dataContext.fazendaId, dataContext.usuarioId]);

  useEffect(() => {
    const id = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("animal") : "";
    if (id) setSelectedId(id);
  }, []);

  useEffect(() => {
    load();
    return subscribeTable(TABLES.animais, load);
  }, [load]);

  const animalById = useMemo(() => new Map(animals.map((animal) => [String(animal.id), animal])), [animals]);
  const selected = selectedId ? animalById.get(selectedId) || null : null;

  useEffect(() => {
    if (!selected) return;
    setDraft({
      mae_id: String(selected.mae_id || ""),
      pai_id: String(selected.pai_id || ""),
      genealogia_observacoes: String(selected.genealogia_observacoes || "")
    });
    setSuccess("");
  }, [selected]);

  const filteredAnimals = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return animals;

    return animals.filter((animal) => {
      const mother = animalById.get(String(animal.mae_id || ""));
      const father = animalById.get(String(animal.pai_id || ""));
      const text = [
        animal.nome,
        animal.brinco,
        animal.raca,
        getAnimalSexInfo(animal).label,
        categoryLabel(animal.categoria),
        animalLabel(mother),
        animalLabel(father)
      ].filter(Boolean).join(" ").toLowerCase();
      return text.includes(term);
    });
  }, [animalById, animals, search]);

  const descendantIds = useMemo(() => selected ? collectDescendantIds(String(selected.id), animals) : new Set<string>(), [animals, selected]);
  const parentOptions = useMemo(() => (
    selected
      ? animals.filter((animal) => {
        const id = String(animal.id || "");
        return id && id !== String(selected.id) && !descendantIds.has(id);
      })
      : []
  ), [animals, descendantIds, selected]);

  const tree = useMemo(() => {
    if (!selected) return null;
    const mother = animalById.get(draft.mae_id);
    const father = animalById.get(draft.pai_id);
    return {
      mother,
      father,
      maternalGrandmother: mother ? animalById.get(String(mother.mae_id || "")) : undefined,
      maternalGrandfather: mother ? animalById.get(String(mother.pai_id || "")) : undefined,
      paternalGrandmother: father ? animalById.get(String(father.mae_id || "")) : undefined,
      paternalGrandfather: father ? animalById.get(String(father.pai_id || "")) : undefined,
      children: animals.filter((animal) => String(animal.mae_id || "") === String(selected.id) || String(animal.pai_id || "") === String(selected.id))
    };
  }, [animalById, animals, draft.mae_id, draft.pai_id, selected]);

  function selectAnimal(animal: AnyRecord) {
    setSelectedId(String(animal.id));
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/genealogia?animal=${animal.id}`);
    }
  }

  const closeTree = useCallback(() => {
    setSelectedId("");
    setSuccess("");
    if (typeof window !== "undefined") window.history.replaceState(null, "", "/genealogia");
  }, []);

  useEffect(() => {
    if (!selected) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeTree();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeTree, selected]);

  async function saveGenealogy() {
    if (!selected) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      if (draft.mae_id === selected.id || draft.pai_id === selected.id) {
        throw new Error("O animal não pode ser pai ou mãe dele mesmo.");
      }
      if ((draft.mae_id && descendantIds.has(draft.mae_id)) || (draft.pai_id && descendantIds.has(draft.pai_id))) {
        throw new Error("Não é possível escolher um descendente como pai ou mãe.");
      }

      await updateRecord(TABLES.animais, selected.id, {
        mae_id: draft.mae_id || null,
        pai_id: draft.pai_id || null,
        genealogia_observacoes: draft.genealogia_observacoes || null
      });
      setSuccess("Genealogia salva com sucesso.");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível salvar a genealogia."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <GitBranch className="h-4 w-4" /> Genealogia
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Genealogia</h1>
          <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            Consulte a árvore familiar dos animais, vincule pai e mãe e acompanhe descendentes do rebanho.
          </p>
        </div>

        <label className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="input input-with-icon"
            placeholder="Buscar por nome, brinco, raça, sexo, pai ou mãe..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {loading ? Array.from({ length: 6 }).map((_, index) => <AnimalSkeleton key={`genealogy-skeleton-${index}`} />) : filteredAnimals.length ? filteredAnimals.map((animal) => {
          const mother = animalById.get(String(animal.mae_id || ""));
          const father = animalById.get(String(animal.pai_id || ""));
          const sex = getAnimalSexInfo(animal);
          return (
            <article key={animal.id} className={`relative overflow-hidden rounded-lg border p-3 pl-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-soft ${sex.accentClassName}`}>
              <span className={`absolute inset-y-0 left-0 w-1 ${sex.stripeClassName}`} aria-hidden="true" />
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${sex.iconClassName}`}>
                  <PawPrint className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-black">{animal.nome || animal.brinco || "Sem brinco"}</h2>
                  <p className="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">{animal.nome ? `Código: ${animal.brinco || "Sem brinco"}` : categoryLabel(animal.categoria)}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-black ${sex.className}`}>
                  {sex.label}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-xs">
                <div className="flex justify-between gap-3 rounded-lg bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800"><span className="text-slate-500">Mãe</span><strong className="truncate text-right">{animalLabel(mother)}</strong></div>
                <div className="flex justify-between gap-3 rounded-lg bg-white p-2 ring-1 ring-slate-200/70 dark:bg-slate-900/70 dark:ring-slate-800"><span className="text-slate-500">Pai</span><strong className="truncate text-right">{animalLabel(father)}</strong></div>
              </div>

              <button className="btn btn-primary mt-3 h-10 min-h-10 w-full px-3 py-2 text-sm" type="button" onClick={() => selectAnimal(animal)}>
                Ver árvore
              </button>
            </article>
          );
        }) : (
          <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 sm:col-span-2 xl:col-span-3 2xl:col-span-4">
            Nenhum animal encontrado.
          </div>
        )}
      </section>

      {selected && tree ? (
        <section aria-modal="true" className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-2 backdrop-blur-sm md:p-4" role="dialog">
          <div className="mx-auto flex min-h-full w-full max-w-5xl items-start">
            <div className="my-2 flex max-h-[92vh] w-full animate-fade-in flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950">
              <header className="border-b border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950 md:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Árvore genealógica</p>
                    <h2 className="mt-1 truncate text-xl font-black md:text-2xl">{animalLabel(selected)}</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Visualize a família e edite pai, mãe e observações.</p>
                  </div>
                  <button className="shrink-0 rounded-lg border border-slate-200 bg-white p-2.5 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800" type="button" onClick={closeTree} title="Fechar" aria-label="Fechar genealogia">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {success ? <div className="mt-3"><Badge tone="success">{success}</Badge></div> : null}
              </header>

              <div className="grid min-h-0 gap-4 overflow-y-auto p-3 md:p-4 xl:grid-cols-[1.45fr_0.85fr]">
                <section className="min-w-0 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <div className="grid gap-3">
                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Avós</p>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <TreeCard label="Avó materna" animal={tree.maternalGrandmother} />
                        <TreeCard label="Avô materno" animal={tree.maternalGrandfather} />
                        <TreeCard label="Avó paterna" animal={tree.paternalGrandmother} />
                        <TreeCard label="Avô paterno" animal={tree.paternalGrandfather} />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Pais</p>
                      <div className="grid grid-cols-2 gap-2">
                        <TreeCard label="Mãe" animal={tree.mother} />
                        <TreeCard label="Pai" animal={tree.father} />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Animal</p>
                      <TreeCard label="Selecionado" animal={selected} active />
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-slate-400">Filhos diretos</p>
                      {tree.children.length ? (
                        <div className="grid gap-2 md:grid-cols-2">
                          {tree.children.map((child) => <TreeCard key={child.id} label="Filho(a)" animal={child} />)}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-sm text-slate-500 dark:border-slate-700">
                          Nenhum descendente direto cadastrado.
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <section className="min-w-0 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <h3 className="text-lg font-black">Editar genealogia</h3>
                  <div className="mt-4 grid gap-3">
                    <label className="space-y-2">
                      <span className="text-sm font-bold">Mãe</span>
                      <select className="input" value={draft.mae_id} onChange={(event) => setDraft((current) => ({ ...current, mae_id: event.target.value }))}>
                        <option value="">Não informado</option>
                        {parentOptions.map((option) => <option key={option.id} value={option.id}>{animalLabel(option)}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-bold">Pai</span>
                      <select className="input" value={draft.pai_id} onChange={(event) => setDraft((current) => ({ ...current, pai_id: event.target.value }))}>
                        <option value="">Não informado</option>
                        {parentOptions.map((option) => <option key={option.id} value={option.id}>{animalLabel(option)}</option>)}
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-bold">Observações genealógicas</span>
                      <textarea className="input min-h-24 resize-y" value={draft.genealogia_observacoes} onChange={(event) => setDraft((current) => ({ ...current, genealogia_observacoes: event.target.value }))} placeholder="Ex: linhagem, origem, histórico familiar..." />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end xl:flex-col-reverse">
                    <button className="btn btn-secondary" type="button" onClick={closeTree}>Fechar</button>
                    <button className="btn btn-primary" type="button" onClick={saveGenealogy} disabled={saving}>
                      <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar alterações"}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
