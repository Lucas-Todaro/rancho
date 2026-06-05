"use client";

import { Download, MailPlus, MessageCircle, RefreshCw, Search, Users, Wallet, X, Clock3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRecord, deleteRecord, listRecords, subscribeTable, updateRecord } from "@/services/crud";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { syncEmployeePanelAccess } from "@/services/employee-access";
import { assertUniqueActiveEmployeeWhatsApp, deactivateEmployeeWhatsAppUser, syncEmployeeWhatsAppUser } from "@/services/whatsapp-users";
import { TABLES } from "@/lib/tables";
import { useAuth } from "@/lib/auth-context";
import type { AnyRecord } from "@/lib/types";
import { formatBrazilianPhone } from "@/lib/input-format";
import { currentMonth, formatCurrency } from "@/lib/utils";
import { canManageData, PERMISSION_DENIED_MESSAGE } from "@/lib/permissions";
import { EmployeeCard, EmployeeCardSkeleton } from "@/components/modules/employees/EmployeeCard";
import { EmployeeDetails } from "@/components/modules/employees/EmployeeDetails";
import { EmployeeForm } from "@/components/modules/employees/EmployeeForm";
import { InviteEmployeeForm } from "@/components/modules/employees/InviteEmployeeForm";

function monthKey(value: unknown) {
  return String(value || "").slice(0, 7);
}

function currentMonthKey() {
  return currentMonth();
}

const EMPLOYEE_LIST_SELECT = [
  "id",
  "fazenda_id",
  "nome",
  "funcao",
  "cpf",
  "salario_base",
  "data_admissao",
  "contato_whatsapp",
  "carga_horaria_mensal",
  "valor_hora_extra",
  "email",
  "tipo_acesso",
  "papel_sistema",
  "convite_status",
  "usuario_id",
  "ativo",
  "deleted_at",
  "created_at"
].join(",");

const EMPLOYEE_POINT_SELECT = "id,funcionario_id,tipo,registrado_em,observacao,created_at";
const EMPLOYEE_PAYROLL_SELECT = "id,funcionario_id,competencia,salario_base,total_liquido,status,pago_em,created_at";

function exportEmployeesCsv(rows: AnyRecord[]) {
  const header = ["Nome", "Função", "Salário", "E-mail", "WhatsApp", "Tipo de acesso", "Ativo"];
  const body = rows.map((row) => [
    row.nome,
    row.funcao,
    formatCurrency(row.salario_base),
    row.email,
    formatBrazilianPhone(row.contato_whatsapp),
    row.tipo_acesso || "bot_only",
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
  const { dataContext, session, profile } = useAuth();
  const farmId = dataContext.fazendaId;
  const userId = dataContext.usuarioId;
  const [employees, setEmployees] = useState<AnyRecord[]>([]);
  const [timeEntries, setTimeEntries] = useState<AnyRecord[]>([]);
  const [payrolls, setPayrolls] = useState<AnyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [formAccessMode, setFormAccessMode] = useState<"bot_only" | "sistema" | "sistema_whatsapp">("bot_only");
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError("");
    try {
      const [nextEmployees, nextTimeEntries, nextPayrolls] = await Promise.all([
        listRecords(TABLES.funcionarios, {
          orderBy: "created_at",
          fazendaId: farmId,
          usuarioId: userId,
          select: EMPLOYEE_LIST_SELECT,
          cache: true,
          forceRefresh
        }),
        listRecords(TABLES.registrosPonto, {
          orderBy: "registrado_em",
          fazendaId: farmId,
          usuarioId: userId,
          select: EMPLOYEE_POINT_SELECT,
          cache: true,
          forceRefresh
        }),
        listRecords(TABLES.folhaPagamento, {
          orderBy: "competencia",
          fazendaId: farmId,
          usuarioId: userId,
          select: EMPLOYEE_PAYROLL_SELECT,
          cache: true,
          forceRefresh
        })
      ]);
      const visibleEmployees = nextEmployees.filter((employee) => !employee.deleted_at);
      setEmployees(visibleEmployees);
      setTimeEntries(nextTimeEntries);
      setPayrolls(nextPayrolls);
      setSelected((current) => current ? visibleEmployees.find((employee) => employee.id === current.id) || null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar funcionários.");
    } finally {
      setLoading(false);
    }
  }, [farmId, userId]);

  useEffect(() => {
    load();
    const refresh = () => { void load(true); };
    const unsubscribeEmployees = subscribeTable(TABLES.funcionarios, refresh);
    const unsubscribePoints = subscribeTable(TABLES.registrosPonto, refresh);
    const unsubscribePayrolls = subscribeTable(TABLES.folhaPagamento, refresh);
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
      employee.email,
      employee.contato_whatsapp,
      employee.tipo_acesso,
      employee.convite_status,
      employee.ativo !== false ? "ativo" : "inativo"
    ].filter(Boolean).join(" ").toLowerCase().includes(term));
  }, [employees, search]);

  const month = currentMonthKey();
  const visibleEmployeeIds = useMemo(() => new Set(employees.map((employee) => employee.id)), [employees]);
  const activeEmployees = employees.filter((employee) => employee.ativo !== false);
  const monthlyPayroll = activeEmployees.reduce((sum, employee) => {
    const payroll = payrolls.find((row) => row.funcionario_id === employee.id && monthKey(row.competencia) === month);
    return sum + Number(payroll?.total_liquido ?? employee.salario_base ?? 0);
  }, 0);
  const pointsThisMonth = timeEntries.filter((entry) => visibleEmployeeIds.has(entry.funcionario_id) && monthKey(entry.registrado_em) === month).length;
  const showPlaceholders = loading || Boolean(error && !employees.length);
  const canInvite = ["dono", "admin", "gerente"].includes(String(profile?.papel || ""));
  const canManage = canManageData(profile);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
    setFormAccessMode("bot_only");
  }

  function openWhatsAppOnlyForm() {
    setEditing(null);
    setFormAccessMode("bot_only");
    setShowForm(true);
  }

  async function submitEmployee(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      if (!canManage) throw new Error(PERMISSION_DENIED_MESSAGE);
      const accessMode = editing?.tipo_acesso || formAccessMode;
      const hasWhatsApp = Boolean(values.contato_whatsapp);
      const baseEmployee = editing?.id ? { ...editing, ...values } : values;
      const contato_whatsapp = hasWhatsApp ? await assertUniqueActiveEmployeeWhatsApp(baseEmployee, dataContext) : null;
      const payload = {
        ...values,
        contato_whatsapp,
        tipo_acesso: accessMode,
        papel_sistema: accessMode === "bot_only" ? "bot_only" : editing?.papel_sistema || null
      };

      if (editing?.id) {
        const saved = await updateRecord(TABLES.funcionarios, editing.id, payload, dataContext);
        if (contato_whatsapp) {
          await syncEmployeeWhatsAppUser({ ...editing, ...payload, ...saved, id: editing.id }, dataContext);
        } else {
          await deactivateEmployeeWhatsAppUser({ ...editing, ...payload, id: editing.id }, dataContext);
        }
        await syncEmployeePanelAccess(editing.id, session?.access_token);
      } else {
        const saved = await createRecord(TABLES.funcionarios, payload, dataContext);
        if (contato_whatsapp) await syncEmployeeWhatsAppUser(saved, dataContext);
        await syncEmployeePanelAccess(saved.id, session?.access_token);
      }
      notifyDashboardUpdated();
      closeForm();
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar funcionário.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(employee: AnyRecord) {
    if (!canManage) {
      setError(PERMISSION_DENIED_MESSAGE);
      return;
    }
    const active = employee.ativo !== false;
    const ok = window.confirm(`${active ? "Desativar" : "Ativar"} ${employee.nome}?`);
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      const nextEmployee: AnyRecord = { ...employee, ativo: !active };
      if (!active && nextEmployee.contato_whatsapp) await assertUniqueActiveEmployeeWhatsApp(nextEmployee, dataContext);

      const saved = await updateRecord(TABLES.funcionarios, employee.id, { ativo: !active }, dataContext);
      if (nextEmployee.ativo && nextEmployee.contato_whatsapp) {
        await syncEmployeeWhatsAppUser({ ...nextEmployee, ...saved }, dataContext);
      } else {
        await deactivateEmployeeWhatsAppUser(employee, dataContext);
      }
      await syncEmployeePanelAccess(employee.id, session?.access_token);
      notifyDashboardUpdated();
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível alterar o status.");
    } finally {
      setBusy(false);
    }
  }

  async function softDeleteEmployee(employee: AnyRecord) {
    await updateRecord(TABLES.funcionarios, employee.id, {
      ativo: false,
      deleted_at: new Date().toISOString()
    }, dataContext);
    await deactivateEmployeeWhatsAppUser(employee, dataContext);
    await syncEmployeePanelAccess(employee.id, session?.access_token);
  }

  async function removeEmployee(employee: AnyRecord) {
    if (!canManage) {
      setError(PERMISSION_DENIED_MESSAGE);
      return;
    }
    const hasHistory = timeEntries.some((entry) => entry.funcionario_id === employee.id) || payrolls.some((row) => row.funcionario_id === employee.id);
    const ok = window.confirm(
      hasHistory
        ? `Tem certeza que deseja excluir ${employee.nome}? Essa ação não poderá ser desfeita na lista principal, mas o histórico de ponto e folha será preservado.`
        : `Tem certeza que deseja excluir ${employee.nome}? Essa ação não poderá ser desfeita.`
    );
    if (!ok) return;

    setBusy(true);
    setError("");
    try {
      if (hasHistory) {
        await softDeleteEmployee(employee);
      } else {
        try {
          await deactivateEmployeeWhatsAppUser(employee, dataContext, { clearEmployeeLink: true });
          await syncEmployeePanelAccess(employee.id, session?.access_token, { forceDisabled: true });
          await deleteRecord(TABLES.funcionarios, employee.id, dataContext);
        } catch {
          await softDeleteEmployee(employee);
        }
      }

      if (selected?.id === employee.id) setSelected(null);
      notifyDashboardUpdated();
      await load(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        /deleted_at|schema|column|cache|does not exist|não existe/i.test(message)
          ? "Para excluir funcionários com histórico, aplique a SQL de soft delete no Supabase e tente novamente."
          : "Não foi possível excluir o funcionário."
      );
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
          <button className="btn btn-secondary" type="button" onClick={() => load(true)}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
          <button className="btn btn-secondary" type="button" onClick={openWhatsAppOnlyForm}>
            <MessageCircle className="h-4 w-4" /> Cadastrar apenas WhatsApp
          </button>
          <button className="btn btn-primary" type="button" onClick={() => canInvite ? setShowInviteForm(true) : setError("Você não tem permissão para convidar funcionários.")}>
            <MailPlus className="h-4 w-4" /> Convidar funcionário
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
              onEdit={(row) => {
                setEditing(row);
                setFormAccessMode(row.tipo_acesso === "sistema_whatsapp" ? "sistema_whatsapp" : row.tipo_acesso === "sistema" ? "sistema" : "bot_only");
                setShowForm(true);
              }}
              onToggleActive={toggleActive}
              onDelete={removeEmployee}
              canManage={canManage}
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
          accessMode={formAccessMode}
          busy={busy}
          onClose={closeForm}
          onSubmit={submitEmployee}
        />
      ) : null}

      {showInviteForm && typeof document !== "undefined" ? createPortal(
        <InviteEmployeeForm
          busy={busy}
          session={session}
          onClose={() => setShowInviteForm(false)}
          onCreated={() => load(true)}
        />,
        document.body
      ) : null}

      {selected ? (
        <EmployeeDetails
          employee={selected}
          context={dataContext}
          onClose={() => setSelected(null)}
          onChanged={() => load(true)}
        />
      ) : null}
    </div>
  );
}
