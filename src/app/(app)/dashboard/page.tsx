"use client";

import { Activity, AlertTriangle, Banknote, Droplets, PackageOpen, PawPrint, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { StatCard } from "@/components/ui/StatCard";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { loadDashboardData } from "@/services/dashboard";
import { useAuth } from "@/lib/auth-context";
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

export default function DashboardPage() {
  const { dataContext, profile } = useAuth();
  const [data, setData] = useState(emptyDashboard);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const dashboard = await loadDashboardData(dataContext);
      setData(dashboard);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [dataContext.fazendaId]);

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
              Acompanhe rebanho, leite, estoque, financeiro, equipe e pagamentos em uma visao simples para o dia a dia.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={load} className="btn bg-white text-emerald-950" type="button">{loading ? "Atualizando..." : "Atualizar painel"}</button>
              <a href="/whatsapp" className="btn border border-white/25 bg-white/10 text-white">Abrir WhatsApp</a>
            </div>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-emerald-100">Resultado do mes</p>
                <h2 className="mt-2 text-4xl font-black">{formatCurrency(data.cards.profit)}</h2>
              </div>
              <Activity className="h-10 w-10 text-lime-200" />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-white/10 p-4"><p className="text-emerald-100">Entradas</p><strong>{formatCurrency(data.cards.income)}</strong></div>
              <div className="rounded-lg bg-white/10 p-4"><p className="text-emerald-100">Saidas</p><strong>{formatCurrency(data.cards.expenses)}</strong></div>
              <div className="rounded-lg bg-white/10 p-4"><p className="text-emerald-100">Hoje</p><strong>{formatNumber(data.cards.productionToday, " L")}</strong></div>
              <div className="rounded-lg bg-white/10 p-4"><p className="text-emerald-100">Mes</p><strong>{formatNumber(data.cards.productionMonth, " L")}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total de animais" value={data.cards.totalAnimals} hint="Rebanho cadastrado" icon={PawPrint} tone="green" />
        <StatCard title="Animais ativos" value={data.cards.activeAnimals} hint="Status ativo" icon={PawPrint} tone="green" />
        <StatCard title="Producao diaria" value={formatNumber(data.cards.productionToday, " L")} hint="Litros registrados hoje" icon={Droplets} tone="blue" />
        <StatCard title="Entrada do mes" value={formatCurrency(data.cards.income)} hint="Transacoes de entrada" icon={TrendingUp} tone="green" />
        <StatCard title="Saida do mes" value={formatCurrency(data.cards.expenses)} hint="Transacoes de saida" icon={TrendingDown} tone="red" />
        <StatCard title="Resultado do mes" value={formatCurrency(data.cards.profit)} hint="Entradas menos saidas" icon={Banknote} tone="amber" />
        <StatCard title="Estoque critico" value={data.cards.criticalStock} hint="Itens abaixo do minimo" icon={PackageOpen} tone="red" />
        <StatCard title="Funcionarios ativos" value={data.cards.activeEmployees} hint="Equipe operacional" icon={Users} tone="blue" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-lg p-5 shadow-soft">
          <h2 className="text-xl font-black">Producao por dia</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Evolucao recente da producao leiteira.</p>
          <BarChart data={data.charts.productionByDay} suffix=" L" />
        </div>
        <div className="glass rounded-lg p-5 shadow-soft">
          <h2 className="text-xl font-black">Ranking por animal</h2>
          <p className="mb-6 mt-1 text-sm text-slate-500 dark:text-slate-400">Top brincos por volume registrado.</p>
          <BarChart data={data.charts.animalRanking} suffix=" L" />
        </div>
      </section>

      <section className="glass rounded-lg p-5 shadow-soft">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-xl font-black">Alertas de estoque</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {data.criticalStock.length ? data.criticalStock.map((item) => (
            <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
              <p className="font-black">{item.nome}</p>
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                Atual: {item.quantidade_atual} {item.unidade_medida} | Minimo: {item.quantidade_minima}
              </p>
            </div>
          )) : <p className="text-sm text-slate-500">Nenhum item critico no momento.</p>}
        </div>
      </section>
    </div>
  );
}
