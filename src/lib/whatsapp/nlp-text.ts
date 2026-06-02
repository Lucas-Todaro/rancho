export function normalizeRanchoText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanAnswer(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}
