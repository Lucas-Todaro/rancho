"use client";

import { Download, Plus, RefreshCw, Search, Users, Wallet, X, Clock3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRecord, listRecords, subscribeTable, updateRecord } from "@/services/crud";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { TABLES } from "@/lib/tables";
import { useAuth } from "@/lib/auth-context";
import type { AnyRecord } from "@/lib/types";
import { formatBrazilianPhone } from "@/lib/input-format";
import { formatCurrency } from "@/lib/utils";
import { EmployeeCard, EmployeeCardSkeleton } from "@/components/modules/employees/EmployeeCard";
import { EmployeeDetails } from "@/components/modules/employees/EmployeeDetails";
import { EmployeeForm } from "@/components/modules/employees/EmployeeForm";

function monthKey(value: unknown) {
  return String(value || "").slice(0, 7);
}

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function exportEmployeesCsv(rows: AnyRecord[]) {
  const header = ["Nome", "Função", "Salário", "WhatsApp", "Ativo"];
  const body = rows.map((row) => [
    row.nome,
    row.funcao,
    formatCurrency(row.salario_base),
    formatBrazilianPhone(row.contato_whatsapp),
    row.ativo !== false ? "Ativo" : "Inativo"
  ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([`${header.map((item) => `"${item}"`).join(",")}\n${body.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "funcionarios.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function EmployeeScreen() {
  const { dataContext } = useAuth();
  const farmId = dataContext.fazendaId;
  const userId = dataContext.usuarioId;
  const [employees, setEmployees] = useState<AnyRecord[]>([]);
  const [timeEntries, setTimeEntries] = useState<AnyRecord[]>([]);
  const [payrolls, setPayrolls] = useState<AnyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextEmployees, nextTimeEntries, nextPayrolls] = await Promise.all([
        listRecords(TABLES.funcionarios, { orderBy: "created_at", fazendaId: farmId, usuarioId: userId }),
        listRecords(TABLES.registrosPonto, { orderBy: "registrado_em", fazendaId: farmId, usuarioId: userId }),
        listRecords(TABLES.folhaPagamento, { orderBy: "competencia", fazendaId: farmId, usuarioId: userId })
      ]);
      setEmployees(nextEmployees);
      setTimeEntries(nextTimeEntries);
      setPayrolls(nextPayrolls);
      setSelected((current) => current ? nextEmployees.find((employee) => employee.id === current.id) || null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar funcionários.");
    } finally {
      setLoading(false);
    }
  }, [farmId, userId]);

  useEffect(() => {
    load();
    const unsubscribeEmployees = subscribeTable(TABLES.funcionarios, load);
    const unsubscribePoints = subscribeTable(TABLES.registrosPonto, load);
    const unsubscribePayrolls = subscribeTable(TABLES.folhaPagamento, load);
    return () => {
      unsubscribeEmployees();
      unsubscribePoints();
      unsubscribePayrolls();
    };
  }, [load]);

  const lastPointByEmployee = useMemo(() => {
    const entries = new Map<string, AnyRecord>();
    timeEntries.forEach((entry) => {
      if (entry.funcionario_id && !entries.has(entry.funcionario_id)) entries.set(entry.funcionario_id, entry);
    });
    return entries;
  }, [timeEntries]);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) => [
      employee.nome,
      employee.funcao,
      employee.contato_whatsapp,
      employee.ativo !== false ? "ativo" : "inativo"
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [employees, search]);

  const month = currentMonthKey();
  const activeEmployees = employees.filter((employee) => employee.ativo !== false);
  const monthlyPayroll = activeEmployees.reduce((sum, employee) => {
    const payroll = payrolls.find((row) => row.funcionario_id === employee.id && monthKey(row.competencia) === month);
    return sum + Number(payroll?.total_liquido ?? employee.salario_base ?? 0);
  }, 0);
  const pointsThisMonth = timeEntries.filter((entry) => monthKey(entry.registrado_em) === month).length;
  const showPlaceholders = loading || Boolean(error && !employees.length);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  async function submitEmployee(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      if (editing?.id) {
        await updateRecord(TABLES.funcionarios, editing.id, values);
      } else {
        await createRecord(TABLES.funcionarios, values, dataContext);
      }
      notifyDashboardUpdated();
      closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar funcionário.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(employee: AnyRecord) {
    const active = employee.ativo !== false;
    const ok = window.confirm(`${active ? "Desativar" : "Ativar"} ${employee.nome}?`);
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await updateRecord(TABLES.funcionarios, employee.id, { ativo: !active });
      notifyDashboardUpdated();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <Users className="h-4 w-4" /> Funcionários
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Funcionários</h1>
          <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            Cadastre a equipe, acompanhe ponto e gerencie folha a partir da ficha de cada funcionário.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-secondary" type="button" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
          <button className="btn btn-primary" type="button" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Novo funcionário
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Funcionários" value={employees.length} hint="Total cadastrado" icon={Users} tone="green" loading={showPlaceholders} />
        <StatCard title="Ativos" value={activeEmployees.length} hint="Equipe operacional" icon={Users} tone="blue" loading={showPlaceholders} />
        <StatCard title="Folha estimada" value={formatCurrency(monthlyPayroll)} hint="Mês atual" icon={Wallet} tone="amber" loading={showPlaceholders} />
        <StatCard title="Pontos no mês" value={pointsThisMonth} hint="Entradas e saídas" icon={Clock3} tone="blue" loading={showPlaceholders} />
      </div>

      <section className="space-y-5">
        <div className="rounded-lg border border-slate-200/70 bg-white/88 p-4 shadow-soft dark:border-slate-800 dark:bg-slate-950/70 md:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input input-with-icon"
                placeholder="Buscar por nome, função, WhatsApp ou status..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search ? (
                <button
                  className="absolute right-3 top-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  type="button"
                  onClick={() => setSearch("")}
                  title="Limpar busca"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            <button className="btn btn-secondary" type="button" onClick={() => exportEmployeesCsv(filteredEmployees)}>
              <Download className="h-4 w-4" /> Exportar
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            {showPlaceholders ? <Skeleton className="h-5 w-32" /> : <strong className="text-slate-800 dark:text-slate-100">{`${filteredEmployees.length} funcionários`}</strong>}
            <span>encontrados na visão atual.</span>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {showPlaceholders ? Array.from({ length: 6 }).map((_, index) => <EmployeeCardSkeleton key={`employee-skeleton-${index}`} />) : filteredEmployees.length ? filteredEmployees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              lastPoint={lastPointByEmployee.get(employee.id)}
              onView={setSelected}
              onEdit={(row) => { setEditing(row); setShowForm(true); }}
              onToggleActive={toggleActive}
            />
          )) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700 md:col-span-2 2xl:col-span-3">
              Nenhum funcionário cadastrado.
            </div>
          )}
        </div>
      </section>

      {showForm ? (
        <EmployeeForm
          employee={editing}
          busy={busy}
          onClose={closeForm}
          onSubmit={submitEmployee}
        />
      ) : null}

      {selected ? (
        <EmployeeDetails
          employee={selected}
          context={dataContext}
          onClose={() => setSelected(null)}
          onChanged={load}
        />
      ) : null}
    </div>
  );
}
