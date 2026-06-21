"use client";

import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  HeartPulse,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState } from "@/components/ui/AsyncState";
import { Skeleton } from "@/components/ui/Skeleton";
import { getAnimalSexInfo } from "@/lib/animal-sex";
import { useAuth } from "@/lib/auth-context";
import { withAsyncTimeout } from "@/lib/async";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { canManageData, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, RelationOption } from "@/lib/types";
import { cn, formatCurrency, formatDate, nowLocalDatetime, parseLocalDate } from "@/lib/utils";
import { syncAnimalPhaseAfterEvent } from "@/services/animal-lifecycle";
import { createRecord, deleteRecord, listRecords, subscribeTable, updateRecord } from "@/services/crud";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { removeEventCostFromFinance, syncEventCostToFinance } from "@/services/event-finance";

type ReproductionKind = "inseminacao" | "prenhez" | "pre_parto" | "parto" | "protocolo" | "observacao";
type ReproductionFilter = "todos" | "prenhe" | "inseminada" | "pre_parto" | "parto" | "sem_info";
type BirthPeriodFilter = "todos" | "recentes" | "antigos" | "hoje" | "semana" | "mes" | "ultimos_30" | "ultimos_90";

type Draft = {
  type: ReproductionKind;
  date: string;
  origin: string;
  cost: string;
  notes: string;
};

function eventDateForPayload(value: string) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

const ANIMAL_SELECT = [
  "id",
  "fazenda_id",
  "nome",
  "brinco",
  "categoria",
  "sexo",
  "fase",
  "status",
  "lote_id",
  "raca",
  "data_nascimento",
  "mae_id",
  "pai_id",
  "created_at"
].join(",");

const EVENT_SELECT = [
  "id",
  "fazenda_id",
  "animal_id",
  "tipo",
  "data_evento",
  "descricao",
  "medicamento",
  "dose",
  "custo",
  "created_at"
].join(",");

const LOT_SELECT = "id,nome,ativo";

const reproductiveKeywords = [
  "reprodução",
  "reproducao",
  "reprodutivo",
  "inseminação",
  "inseminacao",
  "cobertura",
  "sêmen",
  "semen",
  "gestação",
  "prenhez",
  "prenhe",
  "gestacao",
  "gestante",
  "pre parto",
  "pre-parto",
  "parto",
  "protocolo",
  "cio"
];

const kindOptions: Array<{ value: ReproductionKind; label: string; helper: string }> = [
  { value: "inseminacao", label: "Inseminação", helper: "Sêmen, touro ou cobertura" },
  { value: "prenhez", label: "Prenhez", helper: "Confirmação positiva" },
  { value: "pre_parto", label: "Pre-parto", helper: "Acompanhamento final" },
  { value: "parto", label: "Parto", helper: "Nascimento registrado" },
  { value: "protocolo", label: "Protocolo", helper: "Hormonal ou manejo" },
  { value: "observacao", label: "Observação", helper: "Nota reprodutiva" }
];

const statusFilters: Array<{ value: ReproductionFilter; label: string }> = [
  { value: "todos", label: "Todos" },
  { value: "prenhe", label: "Prenhas" },
  { value: "inseminada", label: "Inseminadas" },
  { value: "pre_parto", label: "Pre-parto" },
  { value: "parto", label: "Paridas" },
  { value: "sem_info", label: "Sem info" }
];

const birthPeriodOptions: Array<{ value: BirthPeriodFilter; label: string }> = [
  { value: "todos", label: "Todos os partos" },
  { value: "recentes", label: "Partos recentes" },
  { value: "antigos", label: "Partos antigos" },
  { value: "hoje", label: "Hoje" },
  { value: "semana", label: "Esta semana" },
  { value: "mes", label: "Este mês" },
  { value: "ultimos_30", label: "Últimos 30 dias" },
  { value: "ultimos_90", label: "Últimos 90 dias" }
];

const RECENT_BIRTH_DAYS = 90;

const kindLabels: Record<ReproductionKind, string> = {
  inseminacao: "Inseminação",
  prenhez: "Prenhez",
  pre_parto: "Pre-parto",
  parto: "Parto",
  protocolo: "Protocolo",
  observacao: "Observação"
};

const categoryLabels: Record<string, string> = {
  vaca: "Vaca",
  boi: "Boi",
  bezerro: "Bezerro",
  bezerra: "Bezerra",
  novilha: "Novilha",
  touro: "Touro",
  outro: "Outro"
};

const animalStatusLabels: Record<string, string> = {
  ativo: "Ativo",
  vendido: "Vendido",
  morto: "Morto",
  inativo: "Inativo"
};

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function animalLabel(animal?: AnyRecord | null) {
  if (!animal) return "Animal";
  return animal.nome ? `${animal.nome} (${animal.brinco || "sem brinco"})` : animal.brinco || "Sem brinco";
}

function categoryLabel(value: unknown) {
  const key = String(value || "");
  return categoryLabels[key] || key || "Categoria";
}

function animalStatusLabel(value: unknown) {
  const key = String(value || "");
  return animalStatusLabels[key] || key || "Sem status";
}

function dateFromEvent(event?: AnyRecord | null) {
  return parseLocalDate(event?.data_evento || event?.created_at);
}

function sortEventsDescending(events: AnyRecord[]) {
  return [...events].sort((left, right) => {
    const leftTime = dateFromEvent(left)?.getTime() || 0;
    const rightTime = dateFromEvent(right)?.getTime() || 0;
    return rightTime - leftTime;
  });
}

function eventText(event: AnyRecord) {
  return normalize([event.tipo, event.descricao, event.medicamento, event.dose].filter(Boolean).join(" "));
}

function isReproductiveEvent(event: AnyRecord) {
  const type = normalize(event.tipo);
  if (type === "parto" || type === "inseminacao") return true;
  const text = eventText(event);
  return reproductiveKeywords.some((keyword) => text.includes(keyword));
}

function eventKind(event: AnyRecord): ReproductionKind {
  const type = normalize(event.tipo);
  const text = eventText(event);
  if (type === "parto") return "parto";
  if (type === "inseminacao" || text.includes("inseminacao") || text.includes("cobertura") || text.includes("semen")) return "inseminacao";
  if (text.includes("pre parto") || text.includes("pre-parto")) return "pre_parto";
  if (text.includes("prenhez") || text.includes("prenhe") || text.includes("gestacao") || text.includes("gestante")) return "prenhez";
  if (text.includes("protocolo")) return "protocolo";
  return "observacao";
}

function kindBadgeTone(kind: ReproductionKind): "default" | "success" | "warning" | "danger" | "info" {
  if (kind === "prenhez") return "success";
  if (kind === "pre_parto") return "warning";
  if (kind === "parto") return "info";
  if (kind === "inseminacao") return "info";
  return "default";
}

function daysBetween(from: Date, to = new Date()) {
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / dayMs);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toDatetimeInput(value: unknown) {
  const date = parseLocalDate(String(value || ""));
  if (!date) return nowLocalDatetime();
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDateTime(value: unknown) {
  const date = parseLocalDate(String(value || ""));
  if (!date) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function costNumber(value: unknown) {
  const parsed = typeof value === "number"
    ? value
    : Number(String(value ?? "0").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCostForPayload(value: string) {
  const parsed = costNumber(value);
  return parsed > 0 ? parsed : 0;
}

function defaultDraft(): Draft {
  return {
    type: "inseminacao",
    date: nowLocalDatetime(),
    origin: "",
    cost: "",
    notes: ""
  };
}

function buildDescription(draft: Draft) {
  const label = kindLabels[draft.type];
  const parts = [`[Reprodução Animal] ${label}`];
  if (draft.origin.trim()) parts.push(`Origem: ${draft.origin.trim()}`);
  if (draft.notes.trim()) parts.push(draft.notes.trim());
  return parts.join(" - ");
}

function buildEventPayload(draft: Draft) {
  return {
    tipo: draft.type === "parto" || draft.type === "inseminacao" ? draft.type : "observacao",
    data_evento: eventDateForPayload(draft.date),
    descricao: buildDescription(draft),
    medicamento: null,
    dose: null,
    custo: parseCostForPayload(draft.cost)
  };
}

function draftFromEvent(event: AnyRecord): Draft {
  return {
    type: eventKind(event),
    date: toDatetimeInput(event.data_evento || event.created_at),
    origin: "",
    cost: event.custo ? String(event.custo) : "",
    notes: String(event.descricao || "")
  };
}

function latestOfKind(events: AnyRecord[], kind: ReproductionKind) {
  return sortEventsDescending(events).find((event) => eventKind(event) === kind) || null;
}

function birthEvents(events: AnyRecord[]) {
  return sortEventsDescending(events).filter((event) => eventKind(event) === "parto");
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date) {
  const next = startOfDay(date);
  const day = next.getDay();
  next.setDate(next.getDate() + (day === 0 ? -6 : 1 - day));
  return next;
}

function birthEventMatchesPeriod(event: AnyRecord, period: BirthPeriodFilter) {
  const date = dateFromEvent(event);
  if (!date) return false;
  if (period === "todos") return true;
  const today = startOfDay(new Date());
  const eventDay = startOfDay(date);
  const days = daysBetween(eventDay, today);
  if (period === "recentes" || period === "ultimos_90") return days >= 0 && days < RECENT_BIRTH_DAYS;
  if (period === "antigos") return days >= RECENT_BIRTH_DAYS;
  if (period === "ultimos_30") return days >= 0 && days < 30;
  if (period === "hoje") return eventDay.getTime() === today.getTime();
  if (period === "semana") return eventDay >= startOfWeek(today) && eventDay <= today;
  if (period === "mes") return eventDay.getFullYear() === today.getFullYear() && eventDay.getMonth() === today.getMonth();
  return true;
}

function hasBirthInPeriod(events: AnyRecord[], period: BirthPeriodFilter) {
  return birthEvents(events).some((event) => birthEventMatchesPeriod(event, period));
}

function isLatestReproductiveStatus(candidateDate: Date | null, dates: Array<Date | null>): candidateDate is Date {
  if (!candidateDate) return false;
  return dates.every((date) => !date || candidateDate.getTime() >= date.getTime());
}

function animalReproductionStatus(animal: AnyRecord, events: AnyRecord[]) {
  const sorted = sortEventsDescending(events);
  const lastParto = latestOfKind(sorted, "parto");
  const lastPreParto = latestOfKind(sorted, "pre_parto");
  const lastPrenhez = latestOfKind(sorted, "prenhez");
  const lastInseminacao = latestOfKind(sorted, "inseminacao");
  const phase = normalize(animal.fase);

  const partoDate = dateFromEvent(lastParto);
  const prePartoDate = dateFromEvent(lastPreParto);
  const prenhezDate = dateFromEvent(lastPrenhez);
  const inseminacaoDate = dateFromEvent(lastInseminacao);

  if (isLatestReproductiveStatus(inseminacaoDate, [partoDate, prePartoDate, prenhezDate])) {
    const estimatedBirth = addDays(inseminacaoDate, 283);
    return {
      key: "inseminada" as ReproductionFilter,
      label: "Inseminada",
      detail: `${daysBetween(inseminacaoDate)} dias desde a inseminação`,
      tone: "info" as const,
      lastEvent: lastInseminacao,
      estimatedBirth
    };
  }

  if (partoDate && daysBetween(partoDate) <= 45) {
    return {
      key: "parto" as ReproductionFilter,
      label: "Recém-parida",
      detail: `Parto em ${formatDate(lastParto?.data_evento)}`,
      tone: "info" as const,
      lastEvent: lastParto,
      estimatedBirth: null as Date | null
    };
  }

  if (prePartoDate) {
    return {
      key: "pre_parto" as ReproductionFilter,
      label: "Pre-parto",
      detail: `Acompanhamento desde ${formatDate(lastPreParto?.data_evento)}`,
      tone: "warning" as const,
      lastEvent: lastPreParto,
      estimatedBirth: null as Date | null
    };
  }

  if (prenhezDate || phase === "gestante") {
    const estimatedBirth = inseminacaoDate ? addDays(inseminacaoDate, 283) : null;
    return {
      key: "prenhe" as ReproductionFilter,
      label: phase === "gestante" && !prenhezDate ? "Gestante" : "Prenhe",
      detail: estimatedBirth ? `Previsão ${formatDate(estimatedBirth.toISOString())}` : "Prenhez confirmada",
      tone: "success" as const,
      lastEvent: lastPrenhez || lastInseminacao || sorted[0] || null,
      estimatedBirth
    };
  }

  if (inseminacaoDate) {
    const estimatedBirth = addDays(inseminacaoDate, 283);
    return {
      key: "inseminada" as ReproductionFilter,
      label: "Inseminada",
      detail: `${daysBetween(inseminacaoDate)} dias desde a inseminação`,
      tone: "info" as const,
      lastEvent: lastInseminacao,
      estimatedBirth
    };
  }

  return {
    key: "sem_info" as ReproductionFilter,
    label: "Sem info",
    detail: "Sem evento reprodutivo",
    tone: "default" as const,
    lastEvent: sorted[0] || null,
    estimatedBirth: null as Date | null
  };
}

function AnimalSkeleton() {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-44" />
        </div>
      </div>
      <Skeleton className="mt-4 h-16 rounded-lg" />
    </article>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  loading
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-4 text-2xl font-black text-slate-950 dark:text-slate-50">
        {loading ? <Skeleton className="h-8 w-20" /> : value}
      </div>
    </div>
  );
}

function ReproductionAnimalCard({
  animal,
  lotName,
  events,
  directChildren,
  selected,
  onOpen
}: {
  animal: AnyRecord;
  lotName: string;
  events: AnyRecord[];
  directChildren: AnyRecord[];
  selected: boolean;
  onOpen: () => void;
}) {
  const status = animalReproductionStatus(animal, events);
  const lastEvent = status.lastEvent;
  const lastParto = latestOfKind(events, "parto");
  const latestChild = [...directChildren].sort((left, right) => {
    const leftTime = parseLocalDate(left.data_nascimento || left.created_at)?.getTime() || 0;
    const rightTime = parseLocalDate(right.data_nascimento || right.created_at)?.getTime() || 0;
    return rightTime - leftTime;
  })[0] || null;
  const sex = getAnimalSexInfo(animal);

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-lg border p-4 pl-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft",
        sex.accentClassName,
        selected && "ring-2 ring-emerald-400/80 dark:ring-emerald-500/70"
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-1", sex.stripeClassName)} aria-hidden="true" />
      <div className="flex items-start gap-3">
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border", sex.iconClassName)}>
          <HeartPulse className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-black text-slate-950 dark:text-slate-50">{animalLabel(animal)}</h2>
          <p className="mt-1 truncate text-sm font-bold text-slate-500 dark:text-slate-400">
            {categoryLabel(animal.categoria)} - {lotName}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className={cn("rounded-full border px-2.5 py-1 text-xs font-black", sex.className)}>
            {sex.label}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-sm">
        <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">Último registro</span>
          <strong className="truncate text-right text-slate-900 dark:text-slate-100">
            {lastEvent ? formatDate(lastEvent.data_evento) : "-"}
          </strong>
        </div>
        <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
          <span className="text-slate-500 dark:text-slate-400">Eventos</span>
          <strong className="text-slate-900 dark:text-slate-100">{events.length}</strong>
        </div>
        {lastParto ? (
          <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <span className="text-slate-500 dark:text-slate-400">Último parto</span>
            <strong className="truncate text-right text-slate-900 dark:text-slate-100">{formatDate(lastParto.data_evento || lastParto.created_at)}</strong>
          </div>
        ) : null}
        {lastParto ? (
          <div className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
            <span className="text-slate-500 dark:text-slate-400">Cria vinculada</span>
            <strong className="truncate text-right text-slate-900 dark:text-slate-100">{latestChild ? animalLabel(latestChild) : "-"}</strong>
          </div>
        ) : null}
        <div className="min-h-10 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-300">
          {lastParto?.descricao ? lastParto.descricao : status.detail}
        </div>
      </div>

      <button className="btn btn-secondary mt-4 h-10 min-h-10 w-full px-3 py-2 text-sm" type="button" onClick={onOpen}>
        <ClipboardList className="h-4 w-4" /> Abrir ficha
      </button>
    </article>
  );
}

function EventTimelineItem({
  event,
  canManage,
  onEdit,
  onDelete
}: {
  event: AnyRecord;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const kind = eventKind(event);
  const cost = costNumber(event.custo);

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={kindBadgeTone(kind)}>{kindLabels[kind]}</Badge>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{formatDateTime(event.data_evento)}</span>
            {cost > 0 ? <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{formatCurrency(cost)}</span> : null}
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-700 dark:text-slate-200">
            {event.descricao || "Sem descrição"}
          </p>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-2">
            <button className="btn btn-secondary h-9 min-h-9 px-3 py-2" type="button" onClick={onEdit} title="Editar evento">
              <Pencil className="h-4 w-4" />
            </button>
            <button className="btn h-9 min-h-9 border border-red-200 bg-red-50 px-3 py-2 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200" type="button" onClick={onDelete} title="Remover evento">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function ReproductionDetailDrawer({
  animal,
  events,
  lotName,
  canManage,
  busy,
  draft,
  editingEvent,
  onDraftChange,
  onClose,
  onSubmit,
  onCancelEdit,
  onEditEvent,
  onDeleteEvent
}: {
  animal: AnyRecord;
  events: AnyRecord[];
  lotName: string;
  canManage: boolean;
  busy: boolean;
  draft: Draft;
  editingEvent: AnyRecord | null;
  onDraftChange: (draft: Draft) => void;
  onClose: () => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  onEditEvent: (event: AnyRecord) => void;
  onDeleteEvent: (event: AnyRecord) => void;
}) {
  const sortedEvents = sortEventsDescending(events);
  const status = animalReproductionStatus(animal, sortedEvents);
  const nextBirth = status.estimatedBirth;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-0 backdrop-blur-sm sm:p-4">
      <section className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950 sm:h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-lg sm:border sm:border-slate-200 sm:dark:border-slate-800">
        <header className="border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                <HeartPulse className="h-4 w-4" /> Ficha reprodutiva
              </div>
              <h2 className="truncate text-2xl font-black text-slate-950 dark:text-slate-50">{animalLabel(animal)}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {categoryLabel(animal.categoria)} - {animalStatusLabel(animal.status)} - {lotName}
              </p>
            </div>
            <button className="btn btn-secondary h-10 min-h-10 px-3 py-2" type="button" onClick={onClose} title="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <section className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={status.tone}>{status.label}</Badge>
                  <span className="text-sm font-bold text-slate-500 dark:text-slate-400">{status.detail}</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Fase</p>
                    <p className="mt-2 font-black text-slate-950 dark:text-slate-50">{String(animal.fase || "Não informado")}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Próximo parto</p>
                    <p className="mt-2 font-black text-slate-950 dark:text-slate-50">{nextBirth ? formatDate(nextBirth.toISOString()) : "-"}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Eventos</p>
                    <p className="mt-2 font-black text-slate-950 dark:text-slate-50">{sortedEvents.length}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Última atualização</p>
                    <p className="mt-2 font-black text-slate-950 dark:text-slate-50">{sortedEvents[0] ? formatDate(sortedEvents[0].data_evento) : "-"}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Novo registro</p>
                    <h3 className="mt-1 text-lg font-black">{editingEvent ? "Editando evento" : "Lançamento reprodutivo"}</h3>
                  </div>
                  {editingEvent ? (
                    <button className="btn btn-secondary h-9 min-h-9 px-3 py-2 text-xs" type="button" onClick={onCancelEdit}>
                      Cancelar
                    </button>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {kindOptions.map((option) => (
                        <button
                          key={option.value}
                          className={cn(
                            "rounded-lg border p-3 text-left transition",
                            draft.type === option.value
                              ? "border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                              : "border-slate-200 bg-white hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-emerald-800"
                          )}
                          type="button"
                          onClick={() => onDraftChange({ ...draft, type: option.value })}
                        >
                          <span className="block text-sm font-black">{option.label}</span>
                          <span className="mt-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">{option.helper}</span>
                        </button>
                      ))}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-bold">Data e hora</span>
                        <input
                          className="input"
                          type="datetime-local"
                          value={draft.date}
                          onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
                        />
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-bold">Custo</span>
                        <input
                          className="input"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={draft.cost}
                          onChange={(event) => onDraftChange({ ...draft, cost: event.target.value })}
                        />
                      </label>
                    </div>

                    <label className="block space-y-2">
                      <span className="text-sm font-bold">Origem / touro / sêmen / protocolo</span>
                      <input
                        className="input"
                        placeholder="Ex: Touro T-003, sêmen Angus, protocolo IATF..."
                        value={draft.origin}
                        onChange={(event) => onDraftChange({ ...draft, origin: event.target.value })}
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-bold">Observações</span>
                      <textarea
                        className="input min-h-28 resize-y"
                        placeholder="Registre sinais, resultado, responsável ou cuidado necessário."
                        value={draft.notes}
                        onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
                      />
                    </label>

                    <button className="btn btn-primary w-full" type="button" onClick={onSubmit} disabled={busy}>
                      <Save className="h-4 w-4" /> {busy ? "Salvando..." : editingEvent ? "Salvar alterações" : "Salvar registro"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                    Seu perfil pode consultar reprodução, mas não pode criar, editar ou remover registros.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Histórico</p>
                  <h3 className="mt-1 text-lg font-black">Linha do tempo</h3>
                </div>
                <Badge tone="default">{sortedEvents.length} eventos</Badge>
              </div>

              {sortedEvents.length ? (
                <ol className="mt-4 space-y-3">
                  {sortedEvents.map((event) => (
                    <EventTimelineItem
                      key={event.id}
                      event={event}
                      canManage={canManage}
                      onEdit={() => onEditEvent(event)}
                      onDelete={() => onDeleteEvent(event)}
                    />
                  ))}
                </ol>
              ) : (
                <EmptyState className="mt-4" title="Nenhum evento reprodutivo." message="Registre inseminação, prenhez, pre-parto, parto ou observação para montar o histórico." />
              )}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ReproductionScreen() {
  const { dataContext, profile } = useAuth();
  const canManage = canManageData(profile);
  const [animals, setAnimals] = useState<AnyRecord[]>([]);
  const [events, setEvents] = useState<AnyRecord[]>([]);
  const [lots, setLots] = useState<AnyRecord[]>([]);
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [search, setSearch] = useState("");
  const [reproductionFilter, setReproductionFilter] = useState<ReproductionFilter>("todos");
  const [birthPeriodFilter, setBirthPeriodFilter] = useState<BirthPeriodFilter>("recentes");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [lotFilter, setLotFilter] = useState("todos");
  const [draft, setDraft] = useState<Draft>(() => defaultDraft());
  const [editingEvent, setEditingEvent] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const loadRequestRef = useRef(0);

  const load = useCallback(async (forceRefresh = false) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const [animalRows, eventRows, lotRows] = await withAsyncTimeout(Promise.all([
        listRecords(TABLES.animais, {
          fazendaId: dataContext.fazendaId,
          usuarioId: dataContext.usuarioId,
          select: ANIMAL_SELECT,
          orderBy: "brinco",
          ascending: true,
          cache: true,
          forceRefresh
        }),
        listRecords(TABLES.eventosAnimal, {
          fazendaId: dataContext.fazendaId,
          usuarioId: dataContext.usuarioId,
          select: EVENT_SELECT,
          orderBy: "data_evento",
          ascending: false,
          limit: 1200,
          cache: true,
          forceRefresh
        }),
        listRecords(TABLES.lotes, {
          fazendaId: dataContext.fazendaId,
          usuarioId: dataContext.usuarioId,
          select: LOT_SELECT,
          orderBy: "nome",
          ascending: true,
          cache: true,
          forceRefresh
        })
      ]), "A aba de reprodução demorou para carregar. Tente novamente.");

      if (loadRequestRef.current !== requestId) return;
      setAnimals(animalRows);
      setEvents(eventRows.filter(isReproductiveEvent));
      setLots(lotRows);
      setSelectedAnimalId((current) => current && !animalRows.some((animal) => String(animal.id) === current) ? "" : current);
    } catch (err) {
      if (loadRequestRef.current === requestId) {
        setError(getFriendlyErrorMessage(err, "Não foi possível carregar a reprodução animal agora."));
      }
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [dataContext.fazendaId, dataContext.usuarioId]);

  useEffect(() => {
    void load();
    const unsubscribeAnimals = subscribeTable(TABLES.animais, () => { void load(true); });
    const unsubscribeEvents = subscribeTable(TABLES.eventosAnimal, () => { void load(true); });
    return () => {
      loadRequestRef.current += 1;
      unsubscribeAnimals();
      unsubscribeEvents();
    };
  }, [load]);

  const lotById = useMemo(() => new Map(lots.map((lot) => [String(lot.id), lot])), [lots]);
  const eventsByAnimal = useMemo(() => {
    const grouped = new Map<string, AnyRecord[]>();
    events.forEach((event) => {
      const animalId = String(event.animal_id || "");
      if (!animalId) return;
      grouped.set(animalId, [...(grouped.get(animalId) || []), event]);
    });
    grouped.forEach((items, animalId) => grouped.set(animalId, sortEventsDescending(items)));
    return grouped;
  }, [events]);

  const directChildrenByParent = useMemo(() => {
    const grouped = new Map<string, AnyRecord[]>();
    animals.forEach((animal) => {
      [animal.mae_id, animal.pai_id].forEach((parentId) => {
        const key = String(parentId || "");
        if (!key) return;
        grouped.set(key, [...(grouped.get(key) || []), animal]);
      });
    });
    return grouped;
  }, [animals]);

  const animalOptions = useMemo<RelationOption[]>(() => (
    animals.map((animal) => ({ value: String(animal.id), label: animalLabel(animal) }))
  ), [animals]);

  const selectedAnimal = useMemo(() => animals.find((animal) => String(animal.id) === selectedAnimalId) || null, [animals, selectedAnimalId]);
  const selectedEvents = selectedAnimal ? eventsByAnimal.get(String(selectedAnimal.id)) || [] : [];

  const categoryOptions = useMemo(() => (
    Array.from(new Set(animals.map((animal) => String(animal.categoria || "")).filter(Boolean))).sort()
  ), [animals]);

  const animalStatusOptions = useMemo(() => (
    Array.from(new Set(animals.map((animal) => String(animal.status || "")).filter(Boolean))).sort()
  ), [animals]);

  const filteredAnimals = useMemo(() => {
    const term = normalize(search);
    return animals.filter((animal) => {
      const animalEvents = eventsByAnimal.get(String(animal.id)) || [];
      const reproStatus = animalReproductionStatus(animal, animalEvents);
      const partos = birthEvents(animalEvents);
      const latestParto = partos[0] || null;
      const directChildren = directChildrenByParent.get(String(animal.id)) || [];
      const lotName = lotById.get(String(animal.lote_id || ""))?.nome || "Sem lote";
      const haystack = normalize([
        animal.nome,
        animal.brinco,
        animal.raca,
        animal.categoria,
        animal.status,
        animal.fase,
        lotName,
        reproStatus.label,
        reproStatus.detail,
        latestParto?.descricao,
        ...directChildren.map(animalLabel)
      ].filter(Boolean).join(" "));

      if (term && !haystack.includes(term)) return false;
      if (reproductionFilter === "parto") {
        if (!partos.length || !hasBirthInPeriod(animalEvents, birthPeriodFilter)) return false;
      } else if (reproductionFilter !== "todos" && reproStatus.key !== reproductionFilter) {
        return false;
      }
      if (statusFilter !== "todos" && String(animal.status || "") !== statusFilter) return false;
      if (categoryFilter !== "todos" && String(animal.categoria || "") !== categoryFilter) return false;
      if (lotFilter !== "todos" && String(animal.lote_id || "") !== lotFilter) return false;
      return true;
    });
  }, [animals, birthPeriodFilter, categoryFilter, directChildrenByParent, eventsByAnimal, lotById, lotFilter, reproductionFilter, search, statusFilter]);

  const stats = useMemo(() => {
    const summaries = animals.map((animal) => animalReproductionStatus(animal, eventsByAnimal.get(String(animal.id)) || []));
    return {
      total: animals.length,
      prenhas: summaries.filter((summary) => summary.key === "prenhe").length,
      preParto: summaries.filter((summary) => summary.key === "pre_parto").length,
      eventos: events.length
    };
  }, [animals, events.length, eventsByAnimal]);

  function lotNameFor(animal: AnyRecord) {
    return lotById.get(String(animal.lote_id || ""))?.nome || "Sem lote";
  }

  function openAnimal(animal: AnyRecord) {
    setSelectedAnimalId(String(animal.id));
    setDraft(defaultDraft());
    setEditingEvent(null);
    setSuccess("");
  }

  function closeDrawer() {
    setSelectedAnimalId("");
    setEditingEvent(null);
    setDraft(defaultDraft());
  }

  function cancelEdit() {
    setEditingEvent(null);
    setDraft(defaultDraft());
  }

  function editEvent(event: AnyRecord) {
    setEditingEvent(event);
    setDraft(draftFromEvent(event));
  }

  async function saveEvent() {
    if (!selectedAnimal) return;
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);
      if (!draft.date) throw new Error("Informe a data do registro.");

      const payload = {
        ...buildEventPayload(draft),
        animal_id: selectedAnimal.id
      };

      const saved = editingEvent?.id
        ? await updateRecord(TABLES.eventosAnimal, editingEvent.id, payload, dataContext)
        : await createRecord(TABLES.eventosAnimal, payload, dataContext);

      const eventRecord = saved || { ...editingEvent, ...payload };
      await syncEventCostToFinance(eventRecord, dataContext, animalOptions);
      await syncAnimalPhaseAfterEvent(eventRecord, dataContext);
      notifyDashboardUpdated();

      setSuccess(editingEvent ? "Registro atualizado." : "Registro reprodutivo salvo.");
      setEditingEvent(null);
      setDraft(defaultDraft());
      await load(true);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível salvar o registro reprodutivo."));
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(event: AnyRecord) {
    if (!event.id) return;
    const ok = window.confirm("Tem certeza que deseja remover este evento reprodutivo?");
    if (!ok) return;

    setBusy(true);
    setError("");
    setSuccess("");

    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);
      await removeEventCostFromFinance(String(event.id), dataContext);
      await deleteRecord(TABLES.eventosAnimal, String(event.id), dataContext);
      notifyDashboardUpdated();
      setSuccess("Registro removido.");
      if (editingEvent?.id === event.id) cancelEdit();
      await load(true);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Não foi possível remover o registro reprodutivo."));
    } finally {
      setBusy(false);
    }
  }

  const showSkeletons = loading && !animals.length;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <HeartPulse className="h-4 w-4" /> Reprodução Animal
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Reprodução Animal</h1>
          <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            Acompanhe inseminações, prenhez, pre-parto, partos e observações reprodutivas usando o histórico real dos animais.
          </p>
        </div>
        <button className="btn btn-secondary" type="button" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {error ? (
        <ErrorState
          title={animals.length ? "Não consegui atualizar a reprodução agora." : "Não consegui carregar a reprodução."}
          message={animals.length ? "Os últimos dados carregados continuam visíveis." : error}
          onRetry={() => load(true)}
        />
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
          <CheckCircle2 className="mr-2 inline h-4 w-4" /> {success}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Animais" value={stats.total} icon={HeartPulse} loading={showSkeletons} />
        <SummaryTile label="Prenhas" value={stats.prenhas} icon={CheckCircle2} loading={showSkeletons} />
        <SummaryTile label="Pre-parto" value={stats.preParto} icon={CalendarClock} loading={showSkeletons} />
        <SummaryTile label="Eventos" value={stats.eventos} icon={ClipboardList} loading={showSkeletons} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input input-with-icon"
                placeholder="Buscar por nome, brinco, categoria, fase ou lote..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3 lg:w-[46rem]">
              <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="todos">Todos os status</option>
                {animalStatusOptions.map((status) => <option key={status} value={status}>{animalStatusLabel(status)}</option>)}
              </select>
              <select className="input" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="todos">Todas as categorias</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
              </select>
              <select className="input" value={lotFilter} onChange={(event) => setLotFilter(event.target.value)}>
                <option value="todos">Todos os lotes</option>
                {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.nome || lot.id}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            {statusFilters.map((option) => (
              <button
                key={option.value}
                className={cn(
                  "shrink-0 rounded-lg border px-3 py-2 text-sm font-black transition",
                  reproductionFilter === option.value
                    ? "border-emerald-400 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                    : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                )}
                type="button"
                onClick={() => {
                  setReproductionFilter(option.value);
                  if (option.value === "parto" && birthPeriodFilter === "todos") setBirthPeriodFilter("recentes");
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {reproductionFilter === "parto" ? (
            <select className="input max-w-xs" value={birthPeriodFilter} onChange={(event) => setBirthPeriodFilter(event.target.value as BirthPeriodFilter)}>
              {birthPeriodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          ) : null}
        </div>

        {!canManage ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            Seu perfil pode consultar reprodução, mas não pode criar, editar ou remover registros.
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-black">Animais</h2>
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Plus className="h-4 w-4" /> {showSkeletons ? <Skeleton className="h-4 w-20" /> : `${filteredAnimals.length} exibidos`}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {showSkeletons ? (
            Array.from({ length: 8 }).map((_, index) => <AnimalSkeleton key={`repro-skeleton-${index}`} />)
          ) : filteredAnimals.length ? (
            filteredAnimals.map((animal) => (
              <ReproductionAnimalCard
                key={animal.id}
                animal={animal}
                lotName={lotNameFor(animal)}
                events={eventsByAnimal.get(String(animal.id)) || []}
                directChildren={directChildrenByParent.get(String(animal.id)) || []}
                selected={String(animal.id) === selectedAnimalId}
                onOpen={() => openAnimal(animal)}
              />
            ))
          ) : (
            <EmptyState
              className="sm:col-span-2 xl:col-span-3 2xl:col-span-4"
              title={search || reproductionFilter !== "todos" || statusFilter !== "todos" || categoryFilter !== "todos" || lotFilter !== "todos" ? "Nenhum animal encontrado." : "Nenhum animal cadastrado."}
              message={search || reproductionFilter !== "todos" || statusFilter !== "todos" || categoryFilter !== "todos" || lotFilter !== "todos" ? "Ajuste os filtros ou pesquise outro termo." : "Cadastre animais no rebanho para acompanhar a reprodução."}
            />
          )}
        </div>
      </section>

      {selectedAnimal && typeof document !== "undefined" ? createPortal(
        <ReproductionDetailDrawer
          animal={selectedAnimal}
          events={selectedEvents}
          lotName={lotNameFor(selectedAnimal)}
          canManage={canManage}
          busy={busy}
          draft={draft}
          editingEvent={editingEvent}
          onDraftChange={setDraft}
          onClose={closeDrawer}
          onSubmit={saveEvent}
          onCancelEdit={cancelEdit}
          onEditEvent={editEvent}
          onDeleteEvent={removeEvent}
        />,
        document.body
      ) : null}
    </div>
  );
}
