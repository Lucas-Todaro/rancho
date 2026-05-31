"use client";

import { Activity, CalendarDays, ClipboardList, Heart, Plus, Stethoscope, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRecord, listRecords } from "@/services/crud";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext, RelationOption } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber, nowLocalDatetime } from "@/lib/utils";

type Tab = "resumo" | "reproducao" | "timeline";

const eventTypes = [
  { label: "Observação", value: "observacao" },
  { label: "Vacina", value: "vacina" },
  { label: "Tratamento", value: "tratamento" },
  { label: "Pesagem", value: "pesagem" },
  { label: "Inseminação", value: "inseminacao" },
  { label: "Parto", value: "parto" },
  { label: "Doença", value: "doenca" },
  { label: "Outro", value: "outro" }
];

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

function labelFromOptions(options: RelationOption[] | undefined, value: unknown) {
  return options?.find((option) => option.value === String(value))?.label || "";
}

function labelFromMap(map: Record<string, string>, value: unknown, fallback = "-") {
  return map[String(value || "")] || String(value || fallback);
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function toDateOnly(value: string) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function AnimalDetailModal({
  animal,
  context,
  relationOptions,
  onClose,
  onChanged
}: {
  animal: AnyRecord;
  context: DataContext;
  relationOptions: Record<string, RelationOption[]>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("resumo");
  const [events, setEvents] = useState<AnyRecord[]>([]);
  const [productions, setProductions] = useState<AnyRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    tipo: "observacao",
    data_evento: nowLocalDatetime(),
    descricao: "",
    medicamento: "",
    dose: "",
    custo: ""
  });

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true);
    try {
      const [animalEvents, animalProductions] = await Promise.all([
        listRecords(TABLES.eventosAnimal, {
          orderBy: "data_evento",
          fazendaId: context.fazendaId,
          usuarioId: context.usuarioId,
          filters: [{ column: "animal_id", value: animal.id }]
        }),
        listRecords(TABLES.ordenhas, {
          orderBy: "ordenhado_em",
          fazendaId: context.fazendaId,
          usuarioId: context.usuarioId,
          filters: [{ column: "animal_id", value: animal.id }]
        })
      ]);

      setEvents(animalEvents);
      setProductions(animalProductions);
    } finally {
      setDetailsLoading(false);
    }
  }, [animal.id, context.fazendaId, context.usuarioId]);

  useEffect(() => {
    loadDetails().catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar a ficha."));
  }, [loadDetails]);

  const metrics = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const monthStart = startOfCurrentMonth();

    const last7 = productions.filter((production) => new Date(production.ordenhado_em).getTime() >= sevenDaysAgo.getTime());
    const last30 = productions.filter((production) => new Date(production.ordenhado_em).getTime() >= thirtyDaysAgo.getTime());
    const monthEvents = events.filter((event) => new Date(event.data_evento).getTime() >= monthStart.getTime());

    return {
      dailyAverage: last7.reduce((sum, row) => sum + Number(row.litros || 0), 0) / 7,
      production30: last30.reduce((sum, row) => sum + Number(row.litros || 0), 0),
      monthCost: monthEvents.reduce((sum, row) => sum + Number(row.custo || 0), 0),
      eventCount: events.length
    };
  }, [events, productions]);

  const timeline = useMemo(() => {
    const eventEntries = events.map((event) => ({
      id: `event-${event.id}`,
      date: event.data_evento,
      title: eventTypes.find((type) => type.value === event.tipo)?.label || event.tipo,
      text: event.descricao || event.medicamento || "Registro de manejo",
      tone: "manejo"
    }));

    const productionEntries = productions.map((production) => ({
      id: `production-${production.id}`,
      date: production.ordenhado_em,
      title: "Ordenha",
      text: `${formatNumber(production.litros, " L")} - ${production.turno || "turno não informado"}`,
      tone: "producao"
    }));

    return [...eventEntries, ...productionEntries]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 20);
  }, [events, productions]);

  function openEventForm(tipo = "observacao", descricao = "") {
    setDraft({
      tipo,
      data_evento: nowLocalDatetime(),
      descricao,
      medicamento: "",
      dose: "",
      custo: ""
    });
    setShowForm(true);
  }

  async function submitEvent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const eventDate = draft.data_evento ? new Date(draft.data_evento).toISOString() : new Date().toISOString();
      const cost = Number(draft.custo || 0);

      await createRecord(TABLES.eventosAnimal, {
        animal_id: animal.id,
        tipo: draft.tipo,
        data_evento: eventDate,
        descricao: draft.descricao,
        medicamento: draft.medicamento,
        dose: draft.dose,
        custo: cost
      }, context);

      if (cost > 0) {
        await createRecord(TABLES.transacoesFinanceiras, {
          tipo: "saida",
          data_transacao: toDateOnly(eventDate),
          valor: cost,
          categoria: "Saúde do rebanho",
          descricao: [
            `Manejo do animal ${animal.brinco || "sem brinco"}`,
            eventTypes.find((type) => type.value === draft.tipo)?.label,
            draft.descricao,
            draft.medicamento ? `Medicamento: ${draft.medicamento}` : null
          ].filter(Boolean).join(" - "),
          metodo_pagamento: "Lançamento da ficha"
        }, context);
      }

      notifyDashboardUpdated();
      setShowForm(false);
      await loadDetails();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível registrar o manejo.");
    } finally {
      setBusy(false);
    }
  }

  const lote = labelFromOptions(relationOptions.lote_id, animal.lote_id) || "Sem lote";
  const categoria = labelFromMap(categoryLabels, animal.categoria, "Animal");
  const fase = labelFromMap(phaseLabels, animal.fase);
  const status = labelFromMap(statusLabels, animal.status, "Ativo");
  const reproductiveStatus = animal.fase === "gestante" ? "Gestante" : animal.fase === "lactacao" ? "Em lactação" : animal.fase === "vazia" ? "Vazia" : "Acompanhar";

  const showDetailPlaceholders = detailsLoading || Boolean(error && !events.length && !productions.length);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm md:p-6">
      <section className="flex max-h-[96vh] w-full max-w-6xl animate-fade-in flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950 md:rounded-lg">
        <header className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-lime-50 p-5 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-950 dark:to-lime-950/20 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">Ficha 360</p>
              <h2 className="mt-2 text-4xl font-black tracking-tight">{animal.brinco || "Animal"}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {categoria} • {fase || "Fase não informada"} • {lote}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" type="button" onClick={() => openEventForm()}>
                <Plus className="h-4 w-4" /> Novo registro de manejo
              </button>
              <button className="rounded-lg border border-slate-200 p-3 hover:bg-white dark:border-slate-800 dark:hover:bg-slate-900" type="button" onClick={onClose} title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200 px-5 dark:border-slate-800 md:px-6">
          <nav className="flex gap-6 overflow-auto">
            {[
              ["resumo", "Resumo"],
              ["reproducao", "Reprodução"],
              ["timeline", "Timeline"]
            ].map(([value, label]) => (
              <button
                key={value}
                className={`border-b-2 px-1 py-4 text-sm font-black transition ${tab === value ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"}`}
                type="button"
                onClick={() => setTab(value as Tab)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="overflow-y-auto p-5 md:p-6">
          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          {tab === "resumo" ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30">
                  <TrendingUp className="h-6 w-6 text-blue-700" />
                  <p className="mt-4 text-sm font-black">Média leite/dia</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Últimos 7 dias</p>
                  {showDetailPlaceholders ? <Skeleton className="mt-4 h-9 w-28" /> : <h3 className="mt-4 text-3xl font-black">{formatNumber(metrics.dailyAverage, " L")}</h3>}
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <Activity className="h-6 w-6 text-emerald-700" />
                  <p className="mt-4 text-sm font-black">Produção recente</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Últimos 30 dias</p>
                  {showDetailPlaceholders ? <Skeleton className="mt-4 h-9 w-28" /> : <h3 className="mt-4 text-3xl font-black">{formatNumber(metrics.production30, " L")}</h3>}
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
                  <Stethoscope className="h-6 w-6 text-amber-700" />
                  <p className="mt-4 text-sm font-black">Custo de saúde</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mês atual</p>
                  {showDetailPlaceholders ? <Skeleton className="mt-4 h-9 w-32" /> : <h3 className="mt-4 text-3xl font-black">{formatCurrency(metrics.monthCost)}</h3>}
                </div>
                <div className="rounded-lg border border-purple-200 bg-purple-50 p-5 dark:border-purple-900 dark:bg-purple-950/30">
                  <Heart className="h-6 w-6 text-purple-700" />
                  <p className="mt-4 text-sm font-black">Status reprodutivo</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Snapshot atual</p>
                  <h3 className="mt-4 text-3xl font-black">{reproductiveStatus}</h3>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Caderno de manejo</p>
                      <h3 className="mt-2 text-xl font-black">Saúde e histórico do animal</h3>
                    </div>
                    <button className="btn btn-secondary" type="button" onClick={() => openEventForm()}>
                      <Plus className="h-4 w-4" /> Registrar agora
                    </button>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg bg-slate-100 p-4 dark:bg-slate-900"><p className="text-sm text-slate-500">Manejos</p>{showDetailPlaceholders ? <Skeleton className="mt-2 h-5 w-12" /> : <strong>{metrics.eventCount}</strong>}</div>
                    <div className="rounded-lg bg-slate-100 p-4 dark:bg-slate-900"><p className="text-sm text-slate-500">Peso atual</p><strong>{formatNumber(animal.peso, " kg")}</strong></div>
                    <div className="rounded-lg bg-slate-100 p-4 dark:bg-slate-900"><p className="text-sm text-slate-500">Status</p><strong>{status}</strong></div>
                  </div>
                </section>

                <section className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-5 dark:border-emerald-900 dark:bg-emerald-950/20">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-300">Dados do animal</p>
                  <div className="mt-4 space-y-3 text-sm">
                    {[
                      ["Categoria", categoria],
                      ["Fase", fase],
                      ["Raça", animal.raca || "-"],
                      ["Lote", lote],
                      ["Nascimento", formatDate(animal.data_nascimento)],
                      ["Observações", animal.observacoes || "-"]
                    ].map(([label, value]) => (
                      <div className="flex items-start justify-between gap-4 border-b border-emerald-200/70 pb-2 last:border-0 dark:border-emerald-900" key={label}>
                        <span className="text-slate-500 dark:text-slate-400">{label}</span>
                        <strong className="text-right">{value}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : null}

          {tab === "reproducao" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-5 dark:border-purple-900 dark:bg-purple-950/30">
                <div className="flex items-center gap-2 text-purple-800 dark:text-purple-200">
                  <Heart className="h-5 w-5" />
                  <strong>Status reprodutivo atual</strong>
                </div>
                <h3 className="mt-4 text-3xl font-black">{reproductiveStatus}</h3>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Baseado na fase atual do cadastro do animal.</p>
              </div>

              <button className="btn w-full bg-purple-600 text-white" type="button" onClick={() => openEventForm("inseminacao", "Cobertura / inseminação registrada.")}>
                Registrar cobertura / inseminação
              </button>
              <button className="btn w-full bg-blue-600 text-white" type="button" onClick={() => openEventForm("observacao", "Diagnóstico reprodutivo: ")}>
                Registrar diagnóstico
              </button>
            </div>
          ) : null}

          {tab === "timeline" ? (
            <div className="space-y-3">
              {showDetailPlaceholders ? Array.from({ length: 4 }).map((_, index) => (
                <div key={`timeline-skeleton-${index}`} className="flex gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <Skeleton className="mt-1 h-3 w-3 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Skeleton className="h-5 w-28" />
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </div>
                    <Skeleton className="mt-3 h-4 w-64 max-w-full" />
                  </div>
                </div>
              )) : timeline.length ? timeline.map((entry) => (
                <div key={entry.id} className="flex gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <div className={`mt-1 h-3 w-3 rounded-full ${entry.tone === "producao" ? "bg-blue-500" : "bg-emerald-500"}`} />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong>{entry.title}</strong>
                      <Badge tone={entry.tone === "producao" ? "info" : "success"}>{formatDate(entry.date)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{entry.text}</p>
                  </div>
                </div>
              )) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
                  Nenhum registro no histórico ainda.
                </div>
              )}
            </div>
          ) : null}

          {showForm ? (
            <form onSubmit={submitEvent} className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/55">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black">Novo registro de manejo</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Esse registro fica vinculado ao animal {animal.brinco}.</p>
                </div>
                <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" type="button" onClick={() => setShowForm(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm font-bold">Tipo</span>
                  <select className="input" value={draft.tipo} onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value }))}>
                    {eventTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Data e hora</span>
                  <input className="input" type="datetime-local" value={draft.data_evento} onChange={(event) => setDraft((current) => ({ ...current, data_evento: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Custo</span>
                  <input className="input" type="number" step="0.01" value={draft.custo} onChange={(event) => setDraft((current) => ({ ...current, custo: event.target.value }))} />
                </label>
              </div>

              <label className="mt-4 block space-y-2">
                <span className="text-sm font-bold">Descrição</span>
                <textarea className="input min-h-24 resize-y" value={draft.descricao} onChange={(event) => setDraft((current) => ({ ...current, descricao: event.target.value }))} />
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-bold">Medicamento</span>
                  <input className="input" value={draft.medicamento} onChange={(event) => setDraft((current) => ({ ...current, medicamento: event.target.value }))} />
                </label>
                <label className="space-y-2">
                  <span className="text-sm font-bold">Dose</span>
                  <input className="input" value={draft.dose} onChange={(event) => setDraft((current) => ({ ...current, dose: event.target.value }))} />
                </label>
              </div>

              <button className="btn btn-primary mt-4" type="submit" disabled={busy}>
                <ClipboardList className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar manejo"}
              </button>
            </form>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <button className="btn btn-secondary w-full" type="button" onClick={onClose}>
            <CalendarDays className="h-4 w-4" /> Fechar ficha
          </button>
        </footer>
      </section>
    </div>
  );
}
