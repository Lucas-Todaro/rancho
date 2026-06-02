export function normalizeRanchoText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\be\s*(?=(?:a\s+)?(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco)|b-\d|\d)/g, "e ")
    .replace(/[!?;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanAnswer(value: string) {
  return value
    .replace(/\be\s*(?=(?:a\s+)?(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco)|B-\d|\d)/gi, "e ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}
