export function normalizeRanchoText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(\d+(?:[.,]\d+)?)(l|lt|lts)\b/g, "$1 litros")
    .replace(/\b(\d+(?:[.,]\d+)?)(sc)\b/g, "$1 sacos")
    .replace(/\b(\d+(?:[.,]\d+)?)(cx)\b/g, "$1 caixas")
    .replace(/\b(\d+(?:[.,]\d+)?)(kg|g)\b/g, "$1 $2")
    .replace(/\be\s*(?=(?:a\s+)?(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco)|b-\d|\d)/g, "e ")
    .replace(/[!?;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanAnswer(value: string) {
  return value
    .replace(/\b(\d+(?:[.,]\d+)?)(l|lt|lts)\b/gi, "$1 litros")
    .replace(/\b(\d+(?:[.,]\d+)?)(sc)\b/gi, "$1 sacos")
    .replace(/\b(\d+(?:[.,]\d+)?)(cx)\b/gi, "$1 caixas")
    .replace(/\b(\d+(?:[.,]\d+)?)(kg|g)\b/gi, "$1 $2")
    .replace(/\be\s*(?=(?:a\s+)?(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco)|B-\d|\d)/gi, "e ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== "";
}
