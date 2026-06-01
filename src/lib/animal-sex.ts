import type { AnyRecord } from "@/lib/types";

type SexTone = {
  label: string;
  className: string;
};

const sexStyles: Record<"female" | "male" | "unknown", SexTone> = {
  female: {
    label: "Fêmea",
    className: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/35 dark:text-rose-200"
  },
  male: {
    label: "Macho",
    className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-200"
  },
  unknown: {
    label: "Sexo não informado",
    className: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900/55 dark:text-slate-300"
  }
};

function normalize(value: unknown) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function getAnimalSexInfo(input: AnyRecord | string | null | undefined) {
  const value = typeof input === "string"
    ? input
    : input?.sexo || input?.genero || input?.categoria;

  const normalized = normalize(value);

  if (["femea", "vaca", "novilha", "bezerra"].includes(normalized)) return sexStyles.female;
  if (["macho", "boi", "touro", "bezerro"].includes(normalized)) return sexStyles.male;

  return sexStyles.unknown;
}
