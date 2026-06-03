export function normalizeRanchoText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bconprei\b/g, "comprei")
    .replace(/\bvendii\b/g, "vendi")
    .replace(/\bleiti\b/g, "leite")
    .replace(/\bdinhero\b/g, "dinheiro")
    .replace(/\bdespeza\b/g, "despesa")
    .replace(/\bfinaceiro\b/g, "financeiro")
    .replace(/\bresutado\b/g, "resultado")
    .replace(/\b(?:slario|salaro)\b/g, "salario")
    .replace(/\baftoza\b/g, "aftosa")
    .replace(/\bmimosaa\b/g, "mimosa")
    .replace(/\brebanio\b/g, "rebanho")
    .replace(/\banimas\b/g, "animais")
    .replace(/\banimau\b/g, "animal")
    .replace(/\bvacaz\b/g, "vacas")
    .replace(/\bbezero\b/g, "bezerro")
    .replace(/\bbezeras\b/g, "bezerras")
    .replace(/\bnovila\b/g, "novilha")
    .replace(/\btoro\b/g, "touro")
    .replace(/\bloti\b/g, "lote")
    .replace(/\bfemias\b/g, "femeas")
    .replace(/\bmaxos?\b/g, "machos")
    .replace(/\bm\s+e\b/g, "mae")
    .replace(/\btratameto\b/g, "tratamento")
    .replace(/\bduente\b/g, "doente")
    .replace(/\bfico\b/g, "ficou")
    .replace(/\bmancandoo\b/g, "mancando")
    .replace(/\bpartu\b/g, "parto")
    .replace(/\bpariuu\b/g, "pariu")
    .replace(/\bcioo\b/g, "cio")
    .replace(/\bpr\b/g, "por")
    .replace(/\bese\b/g, "esse")
    .replace(/\bentro\b/g, "entrou")
    .replace(/\b(\d+(?:[.,]\d+)?)(l|lt|lts)\b/g, "$1 litros")
    .replace(/\b(\d+(?:[.,]\d+)?)(sc)\b/g, "$1 sacos")
    .replace(/\b(\d+(?:[.,]\d+)?)(cx)\b/g, "$1 caixas")
    .replace(/\b(\d+(?:[.,]\d+)?)(kg|g)\b/g, "$1 $2")
    .replace(/\be\s*(?=(?:a\s+)?(?:vaca|animal|boi|touro|bezerro|bezerra|novilha|brinco)|b-\d|\d)/g, "e ")
    .replace(/[!?;()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\btem m e\b/g, "tem mae")
    .replace(/\bm e\b/g, "mae")
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
