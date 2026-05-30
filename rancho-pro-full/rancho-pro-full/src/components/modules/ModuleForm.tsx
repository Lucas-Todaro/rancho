"use client";

import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AnyRecord, ModuleConfig, ModuleField } from "@/lib/types";
import { cn } from "@/lib/utils";

function initialValues(config: ModuleConfig, editing?: AnyRecord | null) {
  return config.fields.reduce<AnyRecord>((acc, field) => {
    acc[field.name] = editing?.[field.name] ?? field.defaultValue ?? "";
    return acc;
  }, {});
}

function FieldInput({ field, value, onChange }: { field: ModuleField; value: any; onChange: (value: any) => void }) {
  if (field.type === "select") {
    return (
      <select className="input" value={value ?? ""} onChange={(event) => onChange(event.target.value)} required={field.required}>
        <option value="">Selecione...</option>
        {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (field.type === "textarea") {
    return <textarea className="input min-h-28 resize-y" value={value ?? ""} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} required={field.required} />;
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
  busy
}: {
  config: ModuleConfig;
  editing: AnyRecord | null;
  onSubmit: (values: AnyRecord) => Promise<void>;
  onCancel: () => void;
  busy?: boolean;
}) {
  const base = useMemo(() => initialValues(config, editing), [config, editing]);
  const [values, setValues] = useState<AnyRecord>(base);

  useEffect(() => {
    setValues(base);
  }, [base]);

  function update(name: string, value: any) {
    setValues((current) => {
      const next = { ...current, [name]: value };
      if (config.key === "folha" && ["base_salary", "additions", "discounts", "benefits"].includes(name)) {
        next.net_salary = Number(next.base_salary || 0) + Number(next.additions || 0) + Number(next.benefits || 0) - Number(next.discounts || 0);
      }
      return next;
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = { ...values };
    config.fields.forEach((field) => {
      if (["number", "currency"].includes(field.type)) normalized[field.name] = Number(normalized[field.name] || 0);
    });
    await onSubmit(normalized);
    if (!editing) setValues(initialValues(config));
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-3xl p-5 shadow-soft">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-black">{editing ? "Editar registro" : "Novo registro"}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Preencha os campos e salve para sincronizar.</p>
        </div>
        {editing ? (
          <button type="button" onClick={onCancel} className="rounded-2xl border border-slate-200 p-2 dark:border-slate-700">
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {config.fields.map((field) => (
          <label key={field.name} className={cn("space-y-2", field.type === "textarea" && "md:col-span-2")}>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{field.label}{field.required ? " *" : ""}</span>
            <FieldInput field={field} value={values[field.name]} onChange={(value) => update(field.name, value)} />
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
