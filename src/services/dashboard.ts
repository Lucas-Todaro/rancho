"use client";

import { TABLES } from "@/lib/tables";
import { listRecords } from "@/services/crud";
import type { DataContext } from "@/lib/types";
import { financialAmount, financialMonthKey, isFinancialExpense, isFinancialIncome } from "@/lib/finance";
import { toDateOnlyString } from "@/lib/utils";

const DASHBOARD_UPDATED_EVENT = "rancho:dashboard-updated";

export function notifyDashboardUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DASHBOARD_UPDATED_EVENT));
}

export function onDashboardUpdated(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DASHBOARD_UPDATED_EVENT, callback);
  return () => window.removeEventListener(DASHBOARD_UPDATED_EVENT, callback);
}

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

  const today = toDateOnlyString(new Date());
  const month = today.slice(0, 7);

  const animalMap = Object.fromEntries(animals.map((animal) => [animal.id, animal.brinco || animal.id]));

  const productionToday = productions
    .filter((item) => toDateOnlyString(item.ordenhado_em) === today)
    .reduce((sum, item) => sum + Number(item.litros || 0), 0);

  const productionMonth = productions
    .filter((item) => toDateOnlyString(item.ordenhado_em).slice(0, 7) === month)
    .reduce((sum, item) => sum + Number(item.litros || 0), 0);

  const monthFinance = finance.filter((item) => financialMonthKey(item) === month);
  const income = monthFinance.filter(isFinancialIncome).reduce((sum, item) => sum + financialAmount(item), 0);
  const expenses = monthFinance.filter(isFinancialExpense).reduce((sum, item) => sum + financialAmount(item), 0);

  const criticalStock = stock.filter((item) => Number(item.quantidade_atual || 0) <= Number(item.quantidade_minima || 0));
  const activeEmployees = employees.filter((item) => item.ativo !== false && !item.deleted_at);
  const payrollByEmployee = new Map(
    payrolls
      .filter((item) => String(item.competencia || "").slice(0, 7) === month)
      .map((item) => [item.funcionario_id, Number(item.total_liquido ?? item.salario_base ?? 0)])
  );
  const payrollExpense = activeEmployees.reduce((sum, employee) => {
    return sum + Number(payrollByEmployee.get(employee.id) ?? employee.salario_base ?? 0);
  }, 0);
  const activeAlerts = alerts.filter((item) => item.resolvido !== true);

  const dailyMap = productions.reduce<Record<string, number>>((acc, item) => {
    const key = item.ordenhado_em ? toDateOnlyString(item.ordenhado_em).slice(5, 10) : "sem data";
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
      expenses: expenses + payrollExpense,
      profit: income - expenses - payrollExpense,
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
