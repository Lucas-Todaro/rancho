"use client";

import { CalendarDays, Clock3, DollarSign, FileText, Pencil, Plus, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { createRecord, listRecords, updateRecord } from "@/services/crud";
import { notifyDashboardUpdated } from "@/services/dashboard";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext } from "@/lib/types";
import { currentMonth, formatCurrency, formatDate, nowLocalDatetime } from "@/lib/utils";
import { EmployeeForm } from "@/components/modules/employees/EmployeeForm";

type Tab = "resumo" | "ponto" | "folha";

function monthStart(value = currentMonth()) {
  return value.length === 7 ? `${value}-01` : value;
}

function monthKey(value: unknown) {
  return String(value || "").slice(0, 7);
}

function payrollTotal(row: AnyRecord) {
  return Number(row.salario_base || 0) + Number(row.valor_horas_extras || 0) - Number(row.descontos || 0) - Number(row.adiantamentos || 0);
}

export function EmployeeDetails({
  employee,
  context,
  onClose,
  onChanged
}: {
  employee: AnyRecord;
  context: DataContext;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("resumo");
  const [timeEntries, setTimeEntries] = useState<AnyRecord[]>([]);
  const [payrolls, setPayrolls] = useState<AnyRecord[]>([]);
  const [editingEmployee, setEditingEmployee] = useState(false);
  const [showPointForm, setShowPointForm] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pointDraft, setPointDraft] = useState({
    tipo: "entrada",
    registrado_em: nowLocalDatetime(),
    observacao: ""
  });
  const [payrollDraft, setPayrollDraft] = useState({
    competencia: currentMonth(),
    salario_base: String(employee.salario_base ?? 0),
    horas_extras: "0",
    valor_horas_extras: "0",
    descontos: "0",
    adiantamentos: "0",
    status: "rascunho",
    pago_em: ""
  });

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true);
    setError("");
    try {
      const [nextTimeEntries, nextPayrolls] = await Promise.all([
        listRecords(TABLES.registrosPonto, {
          orderBy: "registrado_em",
          fazendaId: context.fazendaId,
          usuarioId: context.usuarioId,
          filters: [{ column: "funcionario_id", value: employee.id }]
        }),
        listRecords(TABLES.folhaPagamento, {
          orderBy: "competencia",
          fazendaId: context.fazendaId,
          usuarioId: context.usuarioId,
          filters: [{ column: "funcionario_id", value: employee.id }]
        })
      ]);
      setTimeEntries(nextTimeEntries);
      setPayrolls(nextPayrolls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar a ficha.");
    } finally {
      setDetailsLoading(false);
    }
  }, [context.fazendaId, context.usuarioId, employee.id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const currentPayroll = useMemo(
    () => payrolls.find((row) => monthKey(row.competencia) === currentMonth()),
    [payrolls]
  );

  useEffect(() => {
    if (!currentPayroll) {
      setPayrollDraft((current) => ({
        ...current,
        competencia: currentMonth(),
        salario_base: String(employee.salario_base ?? 0)
      }));
      return;
    }

    setPayrollDraft({
      competencia: monthKey(currentPayroll.competencia) || currentMonth(),
      salario_base: String(currentPayroll.salario_base ?? employee.salario_base ?? 0),
      horas_extras: String(currentPayroll.horas_extras ?? 0),
      valor_horas_extras: String(currentPayroll.valor_horas_extras ?? 0),
      descontos: String(currentPayroll.descontos ?? 0),
      adiantamentos: String(currentPayroll.adiantamentos ?? 0),
      status: String(currentPayroll.status || "rascunho"),
      pago_em: String(currentPayroll.pago_em || "")
    });
  }, [currentPayroll, employee.salario_base]);

  const pointThisMonth = useMemo(
    () => timeEntries.filter((row) => monthKey(row.registrado_em) === currentMonth()).length,
    [timeEntries]
  );
  const estimatedPayroll = currentPayroll ? Number(currentPayroll.total_liquido ?? payrollTotal(currentPayroll)) : Number(employee.salario_base || 0);
  const showDetailPlaceholders = detailsLoading || Boolean(error && !timeEntries.length && !payrolls.length);

  async function submitEmployee(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      await updateRecord(TABLES.funcionarios, employee.id, values);
      notifyDashboardUpdated();
      setEditingEmployee(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o funcionario.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPoint(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await createRecord(TABLES.registrosPonto, {
        funcionario_id: employee.id,
        tipo: pointDraft.tipo,
        registrado_em: pointDraft.registrado_em ? new Date(pointDraft.registrado_em).toISOString() : new Date().toISOString(),
        observacao: pointDraft.observacao || null
      }, context);
      setPointDraft({ tipo: "entrada", registrado_em: nowLocalDatetime(), observacao: "" });
      setShowPointForm(false);
      notifyDashboardUpdated();
      await loadDetails();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar o ponto.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPayroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        funcionario_id: employee.id,
        competencia: monthStart(payrollDraft.competencia),
        salario_base: Number(payrollDraft.salario_base || 0),
        horas_extras: Number(payrollDraft.horas_extras || 0),
        valor_horas_extras: Number(payrollDraft.valor_horas_extras || 0),
        descontos: Number(payrollDraft.descontos || 0),
        adiantamentos: Number(payrollDraft.adiantamentos || 0),
        total_liquido: payrollTotal(payrollDraft),
        status: payrollDraft.status,
        pago_em: payrollDraft.pago_em || null
      };

      const existing = payrolls.find((row) => monthKey(row.competencia) === payrollDraft.competencia);
      if (existing?.id) {
        await updateRecord(TABLES.folhaPagamento, existing.id, payload);
      } else {
        await createRecord(TABLES.folhaPagamento, payload, context);
      }

      notifyDashboardUpdated();
      await loadDetails();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar a folha.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm md:p-6">
      <section className="flex max-h-[96vh] w-full max-w-6xl animate-fade-in flex-col overflow-hidden rounded-t-lg border border-slate-200 bg-white shadow-soft dark:border-slate-800 dark:bg-slate-950 md:rounded-lg">
        <header className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 via-white to-cyan-50 p-5 dark:border-slate-800 dark:from-emerald-950/40 dark:via-slate-950 dark:to-cyan-950/20 md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700 dark:text-emerald-300">Ficha do funcionario</p>
              <h2 className="mt-2 text-4xl font-black tracking-tight">{employee.nome || "Funcionario"}</h2>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {employee.funcao || "Funcao nao informada"} - {employee.ativo !== false ? "Ativo" : "Inativo"}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary" type="button" onClick={() => setShowPointForm(true)}>
                <Plus className="h-4 w-4" /> Registrar ponto
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => setEditingEmployee(true)}>
                <Pencil className="h-4 w-4" /> Editar dados
              </button>
              <button className="rounded-lg border border-slate-200 p-3 hover:bg-white dark:border-slate-800 dark:hover:bg-slate-900" type="button" onClick={onClose} title="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="border-b border-slate-200 px-5 dark:border-slate-800 md:px-6">
          <nav className="flex gap-6 overflow-auto">
            {[
              ["resumo", "Resumo"],
              ["ponto", "Ponto"],
              ["folha", "Folha"]
            ].map(([value, label]) => (
              <button
                key={value}
                className={`border-b-2 px-1 py-4 text-sm font-black transition ${tab === value ? "border-emerald-600 text-emerald-700 dark:text-emerald-300" : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"}`}
                type="button"
                onClick={() => setTab(value as Tab)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="overflow-y-auto p-5 md:p-6">
          {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

          {tab === "resumo" ? (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
                  <DollarSign className="h-6 w-6 text-emerald-700" />
                  <p className="mt-4 text-sm font-black">Folha estimada</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Mes atual</p>
                  {showDetailPlaceholders ? <Skeleton className="mt-4 h-9 w-32" /> : <h3 className="mt-4 text-3xl font-black">{formatCurrency(estimatedPayroll)}</h3>}
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/30">
                  <Clock3 className="h-6 w-6 text-blue-700" />
                  <p className="mt-4 text-sm font-black">Pontos no mes</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Entradas e saidas</p>
                  {showDetailPlaceholders ? <Skeleton className="mt-4 h-9 w-20" /> : <h3 className="mt-4 text-3xl font-black">{pointThisMonth}</h3>}
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
                  <FileText className="h-6 w-6 text-amber-700" />
                  <p className="mt-4 text-sm font-black">Registros de folha</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Historico salvo</p>
                  {showDetailPlaceholders ? <Skeleton className="mt-4 h-9 w-20" /> : <h3 className="mt-4 text-3xl font-black">{payrolls.length}</h3>}
                </div>
              </div>

              <section className="rounded-lg border border-slate-200 p-5 dark:border-slate-800">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Dados do funcionario</p>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  {[
                    ["Cargo / funcao", employee.funcao || "-"],
                    ["Salario-base", formatCurrency(employee.salario_base)],
                    ["WhatsApp", employee.contato_whatsapp || "-"],
                    ["CPF", employee.cpf || "-"],
                    ["Admissao", formatDate(employee.data_admissao)],
                    ["Hora extra", formatCurrency(employee.valor_hora_extra)],
                    ["Carga mensal", `${employee.carga_horaria_mensal || 0}h`],
                    ["Status", employee.ativo !== false ? "Ativo" : "Inativo"]
                  ].map(([label, value]) => (
                    <div className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-900" key={label}>
                      <span className="text-slate-500 dark:text-slate-400">{label}</span>
                      <strong className="text-right">{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {tab === "ponto" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black">Registros de ponto</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Pontos vinculados a {employee.nome}.</p>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => setShowPointForm(true)}>
                  <Plus className="h-4 w-4" /> Registrar ponto
                </button>
              </div>

              {showPointForm ? (
                <form onSubmit={submitPoint} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                  <div className="grid gap-4 md:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-sm font-bold">Tipo</span>
                      <select className="input" value={pointDraft.tipo} onChange={(event) => setPointDraft((current) => ({ ...current, tipo: event.target.value }))}>
                        <option value="entrada">Entrada</option>
                        <option value="saida">Saida</option>
                      </select>
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-bold">Data e hora</span>
                      <input className="input" type="datetime-local" value={pointDraft.registrado_em} onChange={(event) => setPointDraft((current) => ({ ...current, registrado_em: event.target.value }))} />
                    </label>
                    <label className="space-y-2 md:col-span-1">
                      <span className="text-sm font-bold">Observacao</span>
                      <input className="input" value={pointDraft.observacao} onChange={(event) => setPointDraft((current) => ({ ...current, observacao: event.target.value }))} />
                    </label>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button className="btn btn-primary" type="submit" disabled={busy}><Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar ponto"}</button>
                    <button className="btn btn-secondary" type="button" onClick={() => setShowPointForm(false)}>Cancelar</button>
                  </div>
                </form>
              ) : null}

              <div className="space-y-3">
                {showDetailPlaceholders ? Array.from({ length: 4 }).map((_, index) => (
                  <div key={`point-skeleton-${index}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="mt-3 h-4 w-56 max-w-full" />
                  </div>
                )) : timeEntries.length ? timeEntries.map((entry) => (
                  <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong>{entry.tipo === "saida" ? "Saida" : "Entrada"}</strong>
                        <Badge tone={entry.tipo === "saida" ? "warning" : "success"}>{formatDate(entry.registrado_em)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{entry.observacao || "Sem observacao"}</p>
                    </div>
                    <Clock3 className="h-5 w-5 text-slate-400" />
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
                    Nenhum ponto registrado para este funcionario.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {tab === "folha" ? (
            <div className="space-y-5">
              <form onSubmit={submitPayroll} className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/55">
                <div className="mb-4">
                  <h3 className="text-xl font-black">Folha do funcionario</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Atualize o registro mensal sem criar lancamento financeiro duplicado.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Competencia</span>
                    <input className="input" type="month" value={payrollDraft.competencia} onChange={(event) => setPayrollDraft((current) => ({ ...current, competencia: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Salario-base</span>
                    <input className="input" type="number" step="0.01" value={payrollDraft.salario_base} onChange={(event) => setPayrollDraft((current) => ({ ...current, salario_base: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Horas extras</span>
                    <input className="input" type="number" step="0.01" value={payrollDraft.horas_extras} onChange={(event) => setPayrollDraft((current) => ({ ...current, horas_extras: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Valor horas extras</span>
                    <input className="input" type="number" step="0.01" value={payrollDraft.valor_horas_extras} onChange={(event) => setPayrollDraft((current) => ({ ...current, valor_horas_extras: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Descontos</span>
                    <input className="input" type="number" step="0.01" value={payrollDraft.descontos} onChange={(event) => setPayrollDraft((current) => ({ ...current, descontos: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Adiantamentos</span>
                    <input className="input" type="number" step="0.01" value={payrollDraft.adiantamentos} onChange={(event) => setPayrollDraft((current) => ({ ...current, adiantamentos: event.target.value }))} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Status</span>
                    <select className="input" value={payrollDraft.status} onChange={(event) => setPayrollDraft((current) => ({ ...current, status: event.target.value }))}>
                      <option value="rascunho">Rascunho</option>
                      <option value="fechada">Fechada</option>
                      <option value="paga">Paga</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-bold">Pago em</span>
                    <input className="input" type="date" value={payrollDraft.pago_em} onChange={(event) => setPayrollDraft((current) => ({ ...current, pago_em: event.target.value }))} />
                  </label>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                    <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">Total liquido</p>
                    <strong className="mt-2 block text-2xl">{formatCurrency(payrollTotal(payrollDraft))}</strong>
                  </div>
                </div>
                <button className="btn btn-primary mt-4" type="submit" disabled={busy}>
                  <Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar folha"}
                </button>
              </form>

              <div className="space-y-3">
                {showDetailPlaceholders ? Array.from({ length: 3 }).map((_, index) => (
                  <div key={`payroll-skeleton-${index}`} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="mt-3 h-4 w-60 max-w-full" />
                  </div>
                )) : payrolls.length ? payrolls.map((row) => (
                  <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <strong>{monthKey(row.competencia)}</strong>
                        <Badge tone={row.status === "paga" ? "success" : "info"}>{row.status || "rascunho"}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Base {formatCurrency(row.salario_base)} - Total {formatCurrency(row.total_liquido ?? payrollTotal(row))}
                      </p>
                    </div>
                    <CalendarDays className="h-5 w-5 text-slate-400" />
                  </div>
                )) : (
                  <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
                    Nenhuma folha registrada para este funcionario.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <button className="btn btn-secondary w-full" type="button" onClick={onClose}>
            <CalendarDays className="h-4 w-4" /> Fechar ficha
          </button>
        </footer>
      </section>

      {editingEmployee ? (
        <EmployeeForm
          employee={employee}
          busy={busy}
          onClose={() => setEditingEmployee(false)}
          onSubmit={submitEmployee}
        />
      ) : null}
    </div>
  );
}
