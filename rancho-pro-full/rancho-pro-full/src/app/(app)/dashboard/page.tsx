"use client";

import { Activity, AlertTriangle, Banknote, PawPrint, Droplets, PackageOpen, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { loadDashboardData } from "@/services/dashboard";
import type { AnyRecord } from "@/lib/types";

type ChartDatum = { label: string; value: number };

type DashboardViewData = {
  cards: {
    totalAnimals: number;
    productionToday: number;
    productionMonth: number;
    income: number;
    expenses: number;
    profit: number;
    criticalStock: number;
    activeEmployees: number;
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
    productionToday: 0,
    productionMonth: 0,
    income: 0,
    expenses: 0,
    profit: 0,
    criticalStock: 0,
    activeEmployees: 0
  },
  charts: { productionByDay: [], animalRanking: [] },
  criticalStock: [] as AnyRecord[],
  finance: [] as AnyRecord[],
  productions: [] as AnyRecord[]
};

export default function DashboardPage() {
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const dashboard = await loadDashboardData();
    setData(dashboard);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="animate-fade-in space-y-8">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-900 via-green-800 to-lime-800 p-6 text-white shadow-soft md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div>
            <Badge tone="success">Sistema em tempo real</Badge>
            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight md:text-6xl">Controle a fazenda inteira em um painel bonito e pelo WhatsApp.</h1>
            <p className="mt-5 max-w-2xl text-lg text-emerald-100">Rebanho, leite, estoque, financeiro, equipe e folha com uma arquitetura pronta para Supabase + Vercel.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={load} className="btn bg-white text-emerald-950" type="button">{loading ? "Atualizando..." : "Atualizar painel"}</button>
              <a href="/whatsapp" className="btn border border-white/25 bg-white/10 text-white">Configurar WhatsApp</a>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-100">Lucro do mês</p>
                <h2 className="mt-2 text-4xl font-black">{formatCurrency(data.cards.profit)}</h2>
              </div>
              <Activity className="h-10 w-10 text-lime-200" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-emerald-100">Receitas</p><strong>{formatCurrency(data.cards.income)}</strong></div>
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-emerald-100">Despesas</p><strong>{formatCurrency(data.cards.expenses)}</strong></div>
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-emerald-100">Hoje</p><strong>{formatNumber(data.cards.productionToday, " L")}</strong></div>
              <div className="rounded-2xl bg-white/10 p-4"><p className="text-emerald-100">Mês</p><strong>{formatNumber(data.cards.productionMonth, " L")}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total de animais" value={data.cards.totalAnimals} hint="Rebanho cadastrado" icon={PawPrint} tone="green" />
        <StatCard title="Produção diária" value={formatNumber(data.cards.productionToday, " L")} hint="Litros registrados hoje" icon={Droplets} tone="blue" />
        <StatCard title="Receita do mês" value={formatCurrency(data.cards.income)} hint="Entradas financeiras" icon={TrendingUp} tone="green" />
        <StatCard title="Despesas do mês" value={formatCurrency(data.cards.expenses)} hint="Saídas financeiras" icon={TrendingDown} tone="red" />
        <StatCard title="Lucro do mês" value={formatCurrency(data.cards.profit)} hint="Receitas menos despesas" icon={Banknote} tone="amber" />
        <StatCard title="Estoque crítico" value={data.cards.criticalStock} hint="Itens abaixo do mínimo" icon={PackageOpen} tone="red" />
        <StatCard title="Funcionários ativos" value={data.cards.activeEmployees} hint="Equipe operacional" icon={Users} tone="blue" />
        <StatCard title="Produção mensal" value={formatNumber(data.cards.productionMonth, " L")} hint="Acumulado no mês" icon={Droplets} tone="brown" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-3xl p-5 shadow-soft">
          <h2 className="text-xl font-black">Produção por dia</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Evolução recente da produção leiteira.</p>
          <BarChart data={data.charts.productionByDay} suffix=" L" />
        </div>
        <div className="glass rounded-3xl p-5 shadow-soft">
          <h2 className="text-xl font-black">Ranking por vaca</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Top animais por volume registrado.</p>
          <BarChart data={data.charts.animalRanking} suffix=" L" />
        </div>
      </section>

      <section className="glass rounded-3xl p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-black">Alertas de estoque</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {data.criticalStock.length ? data.criticalStock.map((item) => (
            <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-black">{item.name}</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">Atual: {item.quantity} {item.unit} · Mínimo: {item.min_quantity}</p>
            </div>
          )) : <p className="text-sm text-slate-500">Nenhum item crítico no momento.</p>}
        </div>
      </section>
    </div>
  );
}
