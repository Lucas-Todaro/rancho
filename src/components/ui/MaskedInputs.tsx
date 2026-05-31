"use client";

import { formatBrazilianPhone, formatCPF, formatCurrencyTyping } from "@/lib/input-format";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  value: string;
  onChange: (value: string) => void;
};

export function CurrencyInput({ value, onChange, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={props.className || "input"}
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(formatCurrencyTyping(event.target.value))}
    />
  );
}

export function CPFInput({ value, onChange, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={props.className || "input"}
      inputMode="numeric"
      maxLength={14}
      value={value}
      onChange={(event) => onChange(formatCPF(event.target.value))}
    />
  );
}

export function WhatsAppInput({ value, onChange, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={props.className || "input"}
      inputMode="tel"
      maxLength={15}
      value={value}
      onChange={(event) => onChange(formatBrazilianPhone(event.target.value))}
    />
  );
}
