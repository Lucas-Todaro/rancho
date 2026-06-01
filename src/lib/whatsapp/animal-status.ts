import type { AnyRecord } from "@/lib/types";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp";

const BLOCKED_ANIMAL_STATUSES = new Set(["morto", "inativo"]);

export function animalStatusValue(animal: AnyRecord | null | undefined) {
  return normalizeRanchoText(String(animal?.status || ""));
}

export function animalDeathDate(animal: AnyRecord | null | undefined) {
  return String(animal?.died_at || animal?.death_date || animal?.data_morte || "").slice(0, 10);
}

export function isAnimalInactiveForBot(animal: AnyRecord | null | undefined) {
  return BLOCKED_ANIMAL_STATUSES.has(animalStatusValue(animal));
}

export function animalActionLabel(intent: string) {
  if (intent === "PRODUCAO_LEITE") return "produção";
  if (intent === "VACINA_MEDICAMENTO") return "vacina ou medicamento";
  if (intent === "PARTO") return "parto";
  if (intent === "MORTE") return "morte";
  return "novas movimentações";
}

export function animalBlockedMessage(animal: AnyRecord, intent: string) {
  const date = animalDeathDate(animal);
  if (intent === "MORTE") {
    return date
      ? `Esse animal já está marcado como morto/inativo desde ${date}, então não posso registrar morte novamente.`
      : "Esse animal já está marcado como morto/inativo, então não posso registrar morte novamente.";
  }

  return date
    ? `Esse animal está marcado como morto/inativo desde ${date}, então não posso registrar ${animalActionLabel(intent)} para ele.`
    : `Esse animal está marcado como morto/inativo no rebanho, então não posso registrar ${animalActionLabel(intent)} para ele.`;
}
