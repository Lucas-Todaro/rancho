"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnyRecord, ModuleConfig, ModuleField, RelationOption } from "@/lib/types";
import { cn } from "@/lib/utils";

function initialValues(config: ModuleConfig, editing?: AnyRecord | null) {
  return config.fields.reduce<AnyRecord>((acc, field) => {
    const value = editing?.[field.name] ?? field.defaultValue ?? "";
    if (field.type === "month" && typeof value === "string") {
      acc[field.name] = value.slice(0, 7);
      return acc;
    }
    if (field.type === "datetime-local" && typeof value === "string") {
      acc[field.name] = value.slice(0, 16);
      return acc;
    }
    if (field.type === "checkbox") {
      acc[field.name] = value === true || value === "true";
      return acc;
    }
    acc[field.name] = value;
    return acc;
  }, {});
}

function FieldInput({
  field,
  value,
  onChange,
  relationOptions
}: {
  field: ModuleField;
  value: any;
  onChange: (value: any) => void;
  relationOptions?: RelationOption[];
}) {
  if (field.type === "select" || field.type === "relation") {
    const options = field.type === "relation" ? relationOptions || [] : field.options || [];
    if (field.name === "unidade_medida") {
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <label key={option.value} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition", value === option.value ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-slate-200 bg-white/70 text-slate-600 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300")}>
              <input className="accent-emerald-700" type="radio" name={field.name} value={option.value} checked={value === option.value} onChange={(event) => onChange(event.target.value)} required={field.required} />
              {option.label}
            </label>
          ))}
        </div>
      );
    }
    return (
      <select className="input" value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required}>
        <option value="">Selecione...</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === "textarea") {
    return <textarea className="input min-h-28 resize-y" value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} required={field.required} />;
  }

  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-bold dark:border-slate-800 dark:bg-slate-900/70">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        Sim
      </label>
    );
  }

  const type = field.type === "currency" ? "number" : field.type;
  return (
    <input className="input" type={type} step={field.type === "currency" || field.type === "number" ? "0.01" : undefined} value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} required={field.required} />
  );
}

export function ModuleForm({
  config,
  editing,
  onSubmit,
  onCancel,
  busy,
  relationOptions = {}
}: {
  config: ModuleConfig;
  editing: AnyRecord | null;
  onSubmit: (values: AnyRecord) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
  relationOptions?: Record<string, RelationOption[]>;
}) {
  const base = useMemo(() => initialValues(config, editing), [config, editing]);
  const [values, setValues] = useState<AnyRecord>(base);

  useEffect(() => {
    setValues(base);
  }, [base]);

  function update(name: string, value: any) {
    setValues((current) => {
      const next = { ...current, [name]: value };
      if (config.key === "folha" && ["salario_base", "valor_horas_extras", "descontos", "adiantamentos"].includes(name)) {
        next.total_liquido = Number(next.salario_base || 0) + Number(next.valor_horas_extras || 0) - Number(next.descontos || 0) - Number(next.adiantamentos || 0);
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = { ...values };
    config.fields.forEach((field) => {
      if (["number", "currency"].includes(field.type)) normalized[field.name] = Number(normalized[field.name] || 0);
      if (field.type === "month" && typeof normalized[field.name] === "string" && normalized[field.name].length === 7) {
        normalized[field.name] = `${normalized[field.name]}-01`;
      }
      if (field.type === "datetime-local" && normalized[field.name]) {
        normalized[field.name] = new Date(normalized[field.name]).toISOString();
      }
    });
    await onSubmit(normalized);
    if (!editing) setValues(initialValues(config));
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-lg p-5 shadow-soft md:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">{editing ? "Editar registro" : "Novo registro"}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Preencha os campos principais e salve o registro.</p>
        </div>
        {editing ? (
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {config.fields.map((field) => (
          <label key={field.name} className={cn("space-y-2", field.type === "textarea" && "md:col-span-2 xl:col-span-3")}>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{field.label}{field.required ? " *" : ""}</span>
            <FieldInput field={field} value={values[field.name]} onChange={(value) => update(field.name, value)} relationOptions={relationOptions[field.name]} />
          </label>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="btn btn-primary" type="submit" disabled={busy}>
          <Save className="h-4 w-4" /> {busy ? "Salvando..." : editing ? "Salvar alterações" : "Adicionar"}
        </button>
        {editing ? <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancelar</button> : null}
      </div>
    </form>
  );
}
