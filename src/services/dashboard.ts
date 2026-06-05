"use client";

import { TABLES } from "@/lib/tables";
import { listRecords } from "@/services/crud";
import type { DataContext } from "@/lib/types";
import { financialAmount, financialMonthKey, isFinancialExpense, isFinancialIncome } from "@/lib/finance";
import { formatDateBRShort, toDateOnlyString } from "@/lib/utils";

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

type LoadDashboardOptions = {
  forceRefresh?: boolean;
};

const DASHBOARD_CACHE_TTL_MS = 30 * 1000;

function startOfCurrentMonthIso() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

function startOfCurrentMonthDate() {
  return toDateOnlyString(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
}

function startOfNextMonthDate() {
  return toDateOnlyString(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1));
}

function startOfRollingMonthsDate(months: number) {
  const now = new Date();
  return toDateOnlyString(new Date(now.getFullYear(), now.getMonth() - Math.max(0, months - 1), 1));
}

export async function loadDashboardData(context?: DataContext, options: LoadDashboardOptions = {}) {
  const today = toDateOnlyString(new Date());
  const month = today.slice(0, 7);
  const monthStartIso = startOfCurrentMonthIso();
  const monthStartDate = startOfCurrentMonthDate();
  const nextMonthStartDate = startOfNextMonthDate();
  const sixMonthsStartDate = startOfRollingMonthsDate(6);
  const cacheOptions = {
    cache: true,
    cacheTtlMs: DASHBOARD_CACHE_TTL_MS,
    forceRefresh: options.forceRefresh
  };

  const [animals, productions, stock, finance, employees, payrolls, alerts] = await Promise.all([
    listRecords(TABLES.animais, { ...context, ...cacheOptions, select: "id,status,brinco", orderBy: "created_at" }),
    listRecords(TABLES.ordenhas, {
      ...context,
      ...cacheOptions,
      select: "id,animal_id,litros,ordenhado_em",
      orderBy: "ordenhado_em",
      filters: [{ column: "ordenhado_em", operator: "gte", value: monthStartIso }]
    }),
    listRecords(TABLES.estoqueItens, {
      ...context,
      ...cacheOptions,
      select: "id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida",
      orderBy: "created_at"
    }),
    listRecords(TABLES.transacoesFinanceiras, {
      ...context,
      ...cacheOptions,
      select: "id,tipo,valor,data_transacao,categoria,descricao,created_at",
      orderBy: "data_transacao",
      filters: [{ column: "data_transacao", operator: "gte", value: sixMonthsStartDate }]
    }),
    listRecords(TABLES.funcionarios, {
      ...context,
      ...cacheOptions,
      select: "id,ativo,deleted_at,salario_base",
      orderBy: "created_at"
    }),
    listRecords(TABLES.folhaPagamento, {
      ...context,
      ...cacheOptions,
      select: "id,funcionario_id,total_liquido,salario_base,competencia",
      orderBy: "competencia",
      filters: [
        { column: "competencia", operator: "gte", value: monthStartDate },
        { column: "competencia", operator: "lt", value: nextMonthStartDate }
      ]
    }),
    listRecords(TABLES.alertas, { ...context, ...cacheOptions, select: "id,resolvido,created_at", orderBy: "created_at" })
  ]);

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
    const key = item.ordenhado_em ? toDateOnlyString(item.ordenhado_em) : "sem data";
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

  const financeByMonth = Object.entries(
    finance.reduce<Record<string, { income: number; expenses: number }>>((acc, item) => {
      const key = financialMonthKey(item) || "sem data";
      if (!acc[key]) acc[key] = { income: 0, expenses: 0 };
      if (isFinancialIncome(item)) acc[key].income += financialAmount(item);
      if (isFinancialExpense(item)) acc[key].expenses += financialAmount(item);
      return acc;
    }, {})
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6);

  const stockByCategory = Object.entries(
    stock.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.categoria || "Sem categoria");
      acc[key] = (acc[key] || 0) + Number(item.quantidade_atual || 0);
      return acc;
    }, {})
  )
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

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
      productionByDay: Object.entries(dailyMap)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(-8)
        .map(([label, value]) => ({ label: label === "sem data" ? label : formatDateBRShort(label), value })),
      animalRanking,
      incomeByMonth: financeByMonth.map(([label, values]) => ({ label, value: values.income })),
      expensesByMonth: financeByMonth.map(([label, values]) => ({ label, value: values.expenses })),
      resultByMonth: financeByMonth.map(([label, values]) => ({ label, value: values.income - values.expenses })),
      stockByCategory,
      criticalStock: criticalStock.map((item) => ({
        label: String(item.nome || "Item"),
        value: Number(item.quantidade_atual || 0)
      })).slice(0, 6)
    },
    criticalStock,
    activeAlerts
  };
}
