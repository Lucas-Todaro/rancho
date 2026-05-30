"use client";

import { TABLES } from "@/lib/tables";
import { listRecords } from "@/services/crud";
import type { DataContext } from "@/lib/types";

export async function loadDashboardData(context?: DataContext) {
  const [animals, productions, stock, finance, employees, payrolls, alerts] = await Promise.all([
    listRecords(TABLES.animais, { ...context, orderBy: "created_at" }),
    listRecords(TABLES.ordenhas, { ...context, orderBy: "ordenhado_em" }),
    listRecords(TABLES.estoqueItens, { ...context, orderBy: "created_at" }),
    listRecords(TABLES.transacoesFinanceiras, { ...context, orderBy: "data_transacao" }),
    listRecords(TABLES.funcionarios, { ...context, orderBy: "created_at" }),
    listRecords(TABLES.folhaPagamento, { ...context, orderBy: "competencia" }),
    listRecords(TABLES.alertas, { ...context, orderBy: "created_at" })
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const animalMap = Object.fromEntries(animals.map((animal) => [animal.id, animal.brinco || animal.id]));

  const productionToday = productions
    .filter((item) => String(item.ordenhado_em || "").slice(0, 10) === today)
    .reduce((sum, item) => sum + Number(item.litros || 0), 0);

  const productionMonth = productions
    .filter((item) => String(item.ordenhado_em || "").slice(0, 7) === month)
    .reduce((sum, item) => sum + Number(item.litros || 0), 0);

  const monthFinance = finance.filter((item) => String(item.data_transacao || "").slice(0, 7) === month);
  const income = monthFinance.filter((item) => item.tipo === "entrada").reduce((sum, item) => sum + Number(item.valor || 0), 0);
  const expenses = monthFinance.filter((item) => item.tipo === "saida").reduce((sum, item) => sum + Number(item.valor || 0), 0);

  const criticalStock = stock.filter((item) => Number(item.quantidade_atual || 0) <= Number(item.quantidade_minima || 0));
  const activeEmployees = employees.filter((item) => item.ativo !== false);
  const activeAlerts = alerts.filter((item) => item.resolvido !== true);

  const dailyMap = productions.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.ordenhado_em || "sem data").slice(5, 10);
    acc[key] = (acc[key] || 0) + Number(item.litros || 0);
    return acc;
  }, {});

  const animalRanking = Object.entries(
    productions.reduce<Record<string, number>>((acc, item) => {
      const key = animalMap[item.animal_id] || "Sem brinco";
      acc[key] = (acc[key] || 0) + Number(item.litros || 0);
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return {
    animals,
    productions,
    stock,
    finance,
    employees,
    payrolls,
    alerts,
    cards: {
      totalAnimals: animals.length,
      activeAnimals: animals.filter((animal) => animal.status === "ativo").length,
      productionToday,
      productionMonth,
      income,
      expenses,
      profit: income - expenses,
      criticalStock: criticalStock.length,
      activeEmployees: activeEmployees.length,
      activeAlerts: activeAlerts.length
    },
    charts: {
      productionByDay: Object.entries(dailyMap).map(([label, value]) => ({ label, value })).slice(-8),
      animalRanking
    },
    criticalStock,
    activeAlerts
  };
}
