"use client";

import { TABLES } from "@/lib/tables";
import { listRecords } from "@/services/crud";

export async function loadDashboardData() {
  const [animals, productions, stock, finance, employees, payrolls] = await Promise.all([
    listRecords(TABLES.animals),
    listRecords(TABLES.milkProductions, "produced_at"),
    listRecords(TABLES.stockItems),
    listRecords(TABLES.financialEntries, "due_date"),
    listRecords(TABLES.employees),
    listRecords(TABLES.payrolls)
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const productionToday = productions
    .filter((item) => String(item.produced_at || "").slice(0, 10) === today)
    .reduce((sum, item) => sum + Number(item.liters || 0), 0);

  const productionMonth = productions
    .filter((item) => String(item.produced_at || "").slice(0, 7) === month)
    .reduce((sum, item) => sum + Number(item.liters || 0), 0);

  const monthFinance = finance.filter((item) => String(item.due_date || "").slice(0, 7) === month);
  const income = monthFinance.filter((item) => item.type === "receita").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = monthFinance.filter((item) => item.type === "despesa").reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const criticalStock = stock.filter((item) => Number(item.quantity || 0) <= Number(item.min_quantity || 0));
  const activeEmployees = employees.filter((item) => item.status !== "desligado");

  const dailyMap = productions.reduce<Record<string, number>>((acc, item) => {
    const key = String(item.produced_at || "sem data").slice(5, 10);
    acc[key] = (acc[key] || 0) + Number(item.liters || 0);
    return acc;
  }, {});

  const animalRanking = Object.entries(
    productions.reduce<Record<string, number>>((acc, item) => {
      const key = item.animal_name || "Sem nome";
      acc[key] = (acc[key] || 0) + Number(item.liters || 0);
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
    cards: {
      totalAnimals: animals.length,
      productionToday,
      productionMonth,
      income,
      expenses,
      profit: income - expenses,
      criticalStock: criticalStock.length,
      activeEmployees: activeEmployees.length
    },
    charts: {
      productionByDay: Object.entries(dailyMap).map(([label, value]) => ({ label, value })).slice(-8),
      animalRanking
    },
    criticalStock
  };
}
