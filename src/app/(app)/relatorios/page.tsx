"use client";

import { FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { loadDashboardData } from "@/services/dashboard";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export default function RelatoriosPage() {
  const { dataContext, profile } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    loadDashboardData(dataContext).then(setData);
  }, [dataContext.fazendaId]);

  function printReport() {
    window.print();
  }

  if (!data) return <div className="glass rounded-lg p-8">Carregando relatorios...</div>;

  return (
    <div className="animate-fade-in space-y-6" id="report-content">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-blue-100 px-3 py-1 text-xs font-black text-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <FileText className="h-4 w-4" /> Relatorios gerenciais
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Relatorios da fazenda</h1>
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
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Producao mensal</p><h2 className="text-3xl font-black">{formatNumber(data.cards.productionMonth, " L")}</h2></div>
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Resultado</p><h2 className="text-3xl font-black">{formatCurrency(data.cards.profit)}</h2></div>
        <div className="glass rounded-lg p-5"><p className="text-sm text-slate-500">Estoque critico</p><h2 className="text-3xl font-black">{data.cards.criticalStock}</h2></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-lg p-5"><h2 className="mb-6 text-xl font-black">Producao por dia</h2><BarChart data={data.charts.productionByDay} suffix=" L" /></div>
        <div className="glass rounded-lg p-5"><h2 className="mb-6 text-xl font-black">Ranking de produtividade</h2><BarChart data={data.charts.animalRanking} suffix=" L" /></div>
      </div>
    </div>
  );
}
