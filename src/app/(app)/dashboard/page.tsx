"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, AlertTriangle, Banknote, Droplets, PackageOpen, PawPrint, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/AsyncState";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { formatStockQuantity } from "@/lib/stock-format";
import { loadDashboardData, onDashboardUpdated } from "@/services/dashboard";
import { useAuth } from "@/lib/auth-context";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { withAsyncTimeout } from "@/lib/async";
import type { AnyRecord } from "@/lib/types";

type ChartDatum = { label: string; value: number };

type DashboardViewData = {
  cards: {
    totalAnimals: number;
    activeAnimals: number;
    productionToday: number;
    productionMonth: number;
    income: number;
    expenses: number;
    profit: number;
    criticalStock: number;
    activeEmployees: number;
    activeAlerts: number;
  };
  charts: {
    productionByDay: ChartDatum[];
    animalRanking: ChartDatum[];
  };
  criticalStock: AnyRecord[];
  finance: AnyRecord[];
  productions: AnyRecord[];
};

const emptyDashboard: DashboardViewData = {
  cards: {
    totalAnimals: 0,
    activeAnimals: 0,
    productionToday: 0,
    productionMonth: 0,
    income: 0,
    expenses: 0,
    profit: 0,
    criticalStock: 0,
    activeEmployees: 0,
    activeAlerts: 0
  },
  charts: { productionByDay: [], animalRanking: [] },
  criticalStock: [],
  finance: [],
  productions: []
};

function ChartSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`chart-skeleton-${index}`} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-full rounded-full" />
          <Skeleton className="h-4 w-14 justify-self-end" />
        </div>
      ))}
    </div>
  );
}

const BarChart = dynamic(
  () => import("@/components/ui/BarChart").then((module) => module.BarChart),
  { ssr: false, loading: () => <ChartSkeleton /> }
);

export default function DashboardPage() {
  const { dataContext, profile } = useAuth();
  const farmId = dataContext.fazendaId;
  const userId = dataContext.usuarioId;
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadRequestRef = useRef(0);

  const load = useCallback(async (options: { forceRefresh?: boolean } = {}) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError("");
    try {
      const dashboard = await withAsyncTimeout(
        loadDashboardData({ fazendaId: farmId, usuarioId: userId }, options),
        "O painel demorou para carregar. Tente novamente."
      );
      if (loadRequestRef.current !== requestId) return;
      setData(dashboard);
    } catch (err) {
      if (loadRequestRef.current === requestId) {
        setError(getFriendlyErrorMessage(err, "Nao foi possivel carregar o painel agora."));
      }
    } finally {
      if (loadRequestRef.current === requestId) setLoading(false);
    }
  }, [farmId, userId]);

  useEffect(() => {
    void load();
    return () => {
      loadRequestRef.current += 1;
    };
  }, [load]);
  useEffect(() => onDashboardUpdated(() => { void load({ forceRefresh: true }); }), [load]);

  const profitLabel = formatCurrency(data.cards.profit);
  const incomeLabel = formatCurrency(data.cards.income);
  const expensesLabel = formatCurrency(data.cards.expenses);
  const productionTodayLabel = formatNumber(data.cards.productionToday, " L");
  const productionMonthLabel = formatNumber(data.cards.productionMonth, " L");
  const hasLoaded = data !== emptyDashboard;
  const initialLoading = loading && !hasLoaded;
  const initialError = Boolean(error && !hasLoaded);
  const showPlaceholders = initialLoading;
  return (
    <div className="animate-fade-in space-y-8">
      <section className="overflow-hidden rounded-lg bg-emerald-900 p-6 text-white shadow-soft md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <Badge tone="success">Painel da fazenda</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-5xl">
              {profile?.fazenda?.nome || "Controle da fazenda"} em tempo real.
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-emerald-100">
              Acompanhe rebanho, leite, estoque, financeiro, equipe e pagamentos em uma visão simples para o dia a dia.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => load({ forceRefresh: true })} className="btn bg-white text-emerald-950 disabled:cursor-not-allowed disabled:opacity-70" type="button" disabled={loading}>{loading ? "Atualizando..." : "Atualizar painel"}</button>
              <a href="/whatsapp" className="btn border border-white/25 bg-white/10 text-white">Abrir WhatsApp</a>
            </div>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
            {initialLoading ? (
              <>
                <Link href="/financeiro" className="flex min-w-0 items-center justify-between gap-4 rounded-lg outline-none transition hover:bg-white/5 focus-visible:ring-4 focus-visible:ring-white/20">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-4 w-32 bg-white/20" />
                    <Skeleton className="mt-3 h-10 w-48 max-w-full bg-white/20" />
                  </div>
                  <Skeleton className="h-10 w-10 rounded-lg bg-white/20" />
                </Link>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, index) => <Skeleton key={`hero-card-${index}`} className="h-20 rounded-lg bg-white/20" />)}
                </div>
              </>
            ) : initialError ? (
              <div className="rounded-lg border border-white/20 bg-white/10 p-4 text-sm font-bold text-white">
                Não foi possível carregar os dados do painel agora.
              </div>
            ) : (
              <>
                <Link href="/financeiro" className="flex min-w-0 items-center justify-between gap-4 rounded-lg outline-none transition hover:bg-white/5 focus-visible:ring-4 focus-visible:ring-white/20">
                  <div className="min-w-0">
                    <p className="text-sm text-emerald-100">Resultado do mês</p>
                    <h2 className="mt-2 max-w-full truncate text-[clamp(1.45rem,3vw,2.25rem)] font-black tabular-nums" title={profitLabel}>{profitLabel}</h2>
                  </div>
                  <Activity className="h-10 w-10 shrink-0 text-lime-200" />
                </Link>
                <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                  <Link href="/financeiro" className="min-w-0 rounded-lg bg-white/10 p-4 outline-none transition hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/20"><p className="text-emerald-100">Entradas</p><strong className="block truncate font-black tabular-nums" title={incomeLabel}>{incomeLabel}</strong></Link>
                  <Link href="/financeiro" className="min-w-0 rounded-lg bg-white/10 p-4 outline-none transition hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/20"><p className="text-emerald-100">Saídas</p><strong className="block truncate font-black tabular-nums" title={expensesLabel}>{expensesLabel}</strong></Link>
                  <Link href="/producao" className="min-w-0 rounded-lg bg-white/10 p-4 outline-none transition hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/20"><p className="text-emerald-100">Hoje</p><strong className="block truncate font-black tabular-nums" title={productionTodayLabel}>{productionTodayLabel}</strong></Link>
                  <Link href="/producao" className="min-w-0 rounded-lg bg-white/10 p-4 outline-none transition hover:bg-white/15 focus-visible:ring-4 focus-visible:ring-white/20"><p className="text-emerald-100">Mês</p><strong className="block truncate font-black tabular-nums" title={productionMonthLabel}>{productionMonthLabel}</strong></Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {error && hasLoaded ? (
        <ErrorState
          title="Nao consegui atualizar o painel agora."
          message="Os ultimos dados carregados continuam visiveis."
          onRetry={() => load({ forceRefresh: true })}
        />
      ) : null}
      {initialError ? (
        <ErrorState
          title="Nao consegui carregar o painel."
          message={error}
          onRetry={() => load({ forceRefresh: true })}
        />
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total de animais" value={initialError ? "-" : data.cards.totalAnimals} hint="Rebanho cadastrado" icon={PawPrint} tone="green" loading={showPlaceholders} href="/rebanho" />
        <StatCard title="Animais ativos" value={initialError ? "-" : data.cards.activeAnimals} hint="Status ativo" icon={PawPrint} tone="green" loading={showPlaceholders} href="/rebanho" />
        <StatCard title="Produção diária" value={initialError ? "-" : formatNumber(data.cards.productionToday, " L")} hint="Litros registrados hoje" icon={Droplets} tone="blue" loading={showPlaceholders} href="/producao" />
        <StatCard title="Entrada do mês" value={initialError ? "-" : formatCurrency(data.cards.income)} hint="Transações de entrada" icon={TrendingUp} tone="green" loading={showPlaceholders} href="/financeiro" />
        <StatCard title="Saída do mês" value={initialError ? "-" : formatCurrency(data.cards.expenses)} hint="Transações de saída" icon={TrendingDown} tone="red" loading={showPlaceholders} href="/financeiro" />
        <StatCard title="Resultado do mês" value={initialError ? "-" : formatCurrency(data.cards.profit)} hint="Entradas menos saídas" icon={Banknote} tone="amber" loading={showPlaceholders} href="/financeiro" />
        <StatCard title="Estoque crítico" value={initialError ? "-" : data.cards.criticalStock} hint="Itens abaixo do mínimo" icon={PackageOpen} tone="red" loading={showPlaceholders} href="/estoque" />
        <StatCard title="Funcionários ativos" value={initialError ? "-" : data.cards.activeEmployees} hint="Equipe operacional" icon={Users} tone="blue" loading={showPlaceholders} href="/funcionarios" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-lg p-5 shadow-soft">
          <h2 className="text-xl font-black">Produção por dia</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Evolução recente da produção leiteira.</p>
          {showPlaceholders ? <ChartSkeleton /> : initialError ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">Não foi possível carregar este gráfico agora.</p> : <BarChart data={data.charts.productionByDay} suffix=" L" />}
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <h2 className="text-xl font-black">Ranking por animal</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Top brincos por volume registrado.</p>
          {showPlaceholders ? <ChartSkeleton /> : initialError ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700">Não foi possível carregar este gráfico agora.</p> : <BarChart data={data.charts.animalRanking} suffix=" L" />}
        </div>
      </section>

      <section className="glass rounded-lg p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-black">Alertas de estoque</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {showPlaceholders ? Array.from({ length: 3 }).map((_, index) => (
            <div key={`stock-alert-skeleton-${index}`} className="rounded-lg border border-slate-200 bg-white/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="mt-3 h-4 w-48 max-w-full" />
            </div>
          )) : initialError ? (
            <p className="text-sm text-slate-500">Não foi possível carregar os alertas de estoque agora.</p>
          ) : data.criticalStock.length ? data.criticalStock.map((item) => (
            <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-black">{item.nome}</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                Atual: {formatStockQuantity(item.quantidade_atual, item.unidade_medida)} | Mínimo: {formatStockQuantity(item.quantidade_minima, item.unidade_medida)}
              </p>
            </div>
          )) : <p className="text-sm text-slate-500">Nenhum item crítico no momento.</p>}
        </div>
      </section>
    </div>
  );
}
