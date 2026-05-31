"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CPFInput, CurrencyInput, WhatsAppInput } from "@/components/ui/MaskedInputs";
import { formatBrazilianPhone, formatCPF, formatCurrencyForInput, isValidBrazilianPhone, isValidCPF, onlyDigits, parseCurrencyInput, stripBrazilCountryCode } from "@/lib/input-format";
import type { AnyRecord } from "@/lib/types";

type EmployeeValues = {
  nome: string;
  funcao: string;
  cpf: string;
  contato_whatsapp: string;
  salario_base: string;
  data_admissao: string;
  carga_horaria_mensal: string;
  valor_hora_extra: string;
  ativo: boolean;
};

function initialValues(employee?: AnyRecord | null): EmployeeValues {
  return {
    nome: String(employee?.nome || ""),
    funcao: String(employee?.funcao || ""),
    cpf: formatCPF(employee?.cpf),
    contato_whatsapp: formatBrazilianPhone(employee?.contato_whatsapp),
    salario_base: formatCurrencyForInput(employee?.salario_base),
    data_admissao: String(employee?.data_admissao || new Date().toISOString().slice(0, 10)),
    carga_horaria_mensal: String(employee?.carga_horaria_mensal ?? 220),
    valor_hora_extra: formatCurrencyForInput(employee?.valor_hora_extra),
    ativo: employee?.ativo !== false
  };
}

export function EmployeeForm({
  employee,
  busy,
  onClose,
  onSubmit
}: {
  employee?: AnyRecord | null;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (values: AnyRecord) => Promise<void>;
}) {
  const base = useMemo(() => initialValues(employee), [employee]);
  const [values, setValues] = useState<EmployeeValues>(base);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    setValues(base);
    setFormError("");
  }, [base]);

  function update(name: keyof EmployeeValues, value: string | boolean) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (values.cpf && !isValidCPF(values.cpf)) {
      setFormError("Informe um CPF válido ou deixe o campo em branco.");
      return;
    }

    if (values.contato_whatsapp && !isValidBrazilianPhone(values.contato_whatsapp)) {
      setFormError("Informe um WhatsApp brasileiro válido com DDD.");
      return;
    }

    await onSubmit({
      nome: values.nome,
      funcao: values.funcao,
      cpf: onlyDigits(values.cpf) || null,
      contato_whatsapp: stripBrazilCountryCode(values.contato_whatsapp) || null,
      salario_base: parseCurrencyInput(values.salario_base),
      data_admissao: values.data_admissao || null,
      carga_horaria_mensal: Number(values.carga_horaria_mensal || 0),
      valor_hora_extra: parseCurrencyInput(values.valor_hora_extra),
      ativo: values.ativo
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center">
      <form onSubmit={submit} className="w-full max-w-4xl animate-fade-in rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950 md:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">{employee?.id ? "Editar funcionário" : "Novo funcionário"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Dados profissionais, salário e contato do colaborador.</p>
          </div>
          <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" type="button" onClick={onClose} title="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        {formError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{formError}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-bold">Nome *</span>
            <input className="input" value={values.nome} onChange={(event) => update("nome", event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Cargo / função *</span>
            <input className="input" value={values.funcao} onChange={(event) => update("funcao", event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">WhatsApp</span>
            <WhatsAppInput value={values.contato_whatsapp} onChange={(value) => update("contato_whatsapp", value)} placeholder="(00) 00000-0000" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">CPF</span>
            <CPFInput value={values.cpf} onChange={(value) => update("cpf", value)} placeholder="000.000.000-00" />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Salário-base</span>
            <CurrencyInput value={values.salario_base} onChange={(value) => update("salario_base", value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Admissão</span>
            <input className="input" type="date" value={values.data_admissao} onChange={(event) => update("data_admissao", event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Carga mensal</span>
            <input className="input" type="number" step="1" min="0" value={values.carga_horaria_mensal} onChange={(event) => update("carga_horaria_mensal", event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Valor hora extra</span>
            <CurrencyInput value={values.valor_hora_extra} onChange={(value) => update("valor_hora_extra", value)} />
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/70">
            <input type="checkbox" checked={values.ativo} onChange={(event) => update("ativo", event.target.checked)} />
            Funcionário ativo
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            <Save className="h-4 w-4" /> {busy ? "Salvando..." : "Salvar funcionário"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
