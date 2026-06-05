"use client";

import dynamic from "next/dynamic";
import { FileText, Printer, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { loadDashboardData } from "@/services/dashboard";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { formatStockQuantity } from "@/lib/stock-format";

function ChartSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={`report-chart-skeleton-${index}`} className="grid grid-cols-[5rem_1fr_5rem] items-center gap-3">
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

export default function RelatoriosPage() {
  const { dataContext, profile } = useAuth();
  const farmId = dataContext.fazendaId;
  const userId = dataContext.usuarioId;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    loadDashboardData({ fazendaId: farmId, usuarioId: userId })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Não foi possível carregar os relatórios."));
  }, [farmId, userId]);

  function printReport() {
    window.print();
  }

  if (!data) {
    return (
      <div className="animate-fade-in space-y-6">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">Não foi possível carregar os relatórios agora.</div> : null}
        <div className="grid gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={`report-card-skeleton-${index}`} className="glass rounded-lg p-5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-9 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="glass rounded-lg p-5"><Skeleton className="h-6 w-40" /><Skeleton className="mt-6 h-48 w-full" /></div>
          <div className="glass rounded-lg p-5"><Skeleton className="h-6 w-40" /><Skeleton className="mt-6 h-48 w-full" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6" id="report-content">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-1 text-xs font-black text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <FileText className="h-4 w-4" /> Relatórios gerenciais
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Relatórios da fazenda</h1>
          <p className="mt-3 text-slate-500 dark:text-slate-400">
            Resumo operacional e financeiro de {profile?.fazenda?.nome || "sua fazenda"}.
          </p>
        </div>
        <div className="no-print flex gap-3">
          <button className="btn btn-primary" onClick={printReport} type="button"><Printer className="h-4 w-4" /> Imprimir ou salvar PDF</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Animais</p><h2 className="text-3xl font-black">{data.cards.totalAnimals}</h2></div>
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Produção mensal</p><h2 className="text-3xl font-black">{formatNumber(data.cards.productionMonth, " L")}</h2></div>
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Resultado</p><h2 className="text-3xl font-black">{formatCurrency(data.cards.profit)}</h2></div>
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Estoque crítico</p><h2 className="text-3xl font-black">{data.cards.criticalStock}</h2></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-lg p-5"><h2 className="mb-6 text-xl font-black">Produção por dia</h2><BarChart data={data.charts.productionByDay} suffix=" L" /></div>
        <div className="glass rounded-lg p-5"><h2 className="mb-6 text-xl font-black">Ranking de produtividade</h2><BarChart data={data.charts.animalRanking} suffix=" L" /></div>
        <div className="glass rounded-lg p-5">
          <div className="mb-6 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            <h2 className="text-xl font-black">Entradas por mês</h2>
          </div>
          <BarChart data={data.charts.incomeByMonth || []} />
        </div>
        <div className="glass rounded-lg p-5">
          <div className="mb-6 flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-red-600" />
            <h2 className="text-xl font-black">Saídas por mês</h2>
          </div>
          <BarChart data={data.charts.expensesByMonth || []} />
        </div>
        <div className="glass rounded-lg p-5"><h2 className="mb-6 text-xl font-black">Resultado financeiro</h2><BarChart data={data.charts.resultByMonth || []} /></div>
        <div className="glass rounded-lg p-5"><h2 className="mb-6 text-xl font-black">Estoque por categoria</h2><BarChart data={data.charts.stockByCategory || []} /></div>
      </div>

      <section className="glass rounded-lg p-5">
        <h2 className="text-xl font-black">Itens abaixo do mínimo</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {data.criticalStock?.length ? data.criticalStock.slice(0, 6).map((item: any) => (
            <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              <strong>{item.nome}</strong>
              <p className="mt-1 text-amber-800 dark:text-amber-200">
                Atual: {formatStockQuantity(item.quantidade_atual, item.unidade_medida)} | Mínimo: {formatStockQuantity(item.quantidade_minima, item.unidade_medida)}
              </p>
            </div>
          )) : (
            <p className="text-sm text-slate-500">Ainda não há dados suficientes para gerar este gráfico.</p>
          )}
        </div>
      </section>
    </div>
  );
}
