"use client";

import { FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { Skeleton } from "@/components/ui/Skeleton";
import { loadDashboardData } from "@/services/dashboard";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

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
      </div>
    </div>
  );
}
