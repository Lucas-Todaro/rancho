"use client";

import { Download, FileText, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { BarChart } from "@/components/ui/BarChart";
import { loadDashboardData } from "@/services/dashboard";
import { formatCurrency, formatNumber } from "@/lib/utils";

export default function RelatoriosPage() {
  const [data, setData] = useState<any>(null);

  useEffect(() => { loadDashboardData().then(setData); }, []);

  function printReport() {
    window.print();
  }

  function exportHtml() {
    const content = document.getElementById("report-content")?.innerHTML || "";
    const blob = new Blob([`<html><body>${content}</body></html>`], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-rancho.html";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!data) return <div className="glass rounded-3xl p-8">Carregando relatórios...</div>;

  return (
    <div className="animate-fade-in space-y-6" id="report-content">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-800 dark:bg-blue-950 dark:text-blue-200"><FileText className="h-4 w-4" /> Relatórios gerenciais</div>
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">Relatórios da fazenda</h1>
          <p className="mt-3 text-slate-500 dark:text-slate-400">Resumo imprimível com indicadores operacionais e financeiros.</p>
        </div>
        <div className="no-print flex gap-3">
          <button className="btn btn-secondary" onClick={exportHtml}><Download className="h-4 w-4" /> Exportar HTML</button>
          <button className="btn btn-primary" onClick={printReport}><Printer className="h-4 w-4" /> Imprimir / PDF</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="glass rounded-3xl p-5"><p className="text-sm text-slate-500">Animais</p><h2 className="text-3xl font-black">{data.cards.totalAnimals}</h2></div>
        <div className="glass rounded-3xl p-5"><p className="text-sm text-slate-500">Produção mensal</p><h2 className="text-3xl font-black">{formatNumber(data.cards.productionMonth, " L")}</h2></div>
        <div className="glass rounded-3xl p-5"><p className="text-sm text-slate-500">Lucro</p><h2 className="text-3xl font-black">{formatCurrency(data.cards.profit)}</h2></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass rounded-3xl p-5"><h2 className="mb-6 text-xl font-black">Produção por dia</h2><BarChart data={data.charts.productionByDay} suffix=" L" /></div>
        <div className="glass rounded-3xl p-5"><h2 className="mb-6 text-xl font-black">Ranking de produtividade</h2><BarChart data={data.charts.animalRanking} suffix=" L" /></div>
      </div>
    </div>
  );
}
