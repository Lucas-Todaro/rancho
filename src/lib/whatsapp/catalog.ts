export type CatalogRow = Record<string, unknown>;

export type CatalogResolution<T extends CatalogRow> = {
  status: "matched" | "suggestion" | "ambiguous" | "not_found";
  row?: T;
  rows?: T[];
  score: number;
  exact: boolean;
};

export function normalizeCatalogText(value: string | number | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?;()[\]{}.,:/\\|_+=*"'`~^]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactCatalogKey(value: string | number | null | undefined) {
  return normalizeCatalogText(value).replace(/[^a-z0-9]/g, "");
}

function numberKey(value: string | number | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.replace(/^0+/, "") || "0" : "";
}

function hasLetters(value: string | number | null | undefined) {
  return /[a-z]/i.test(String(value ?? ""));
}

function labelsFrom(row: CatalogRow, keys: string[]) {
  return keys
    .map((key) => row[key])
    .filter((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function withoutConnectors(value: string | number | null | undefined) {
  return normalizeCatalogText(value)
    .split(/\s+/)
    .filter((word) => !["de", "do", "da", "dos", "das"].includes(word))
    .join("");
}

function stockTokens(value: string | number | null | undefined) {
  return normalizeCatalogText(value)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !["de", "do", "da", "dos", "das", "o", "a"].includes(word));
}

function uniqueRows<T extends CatalogRow>(rows: T[]) {
  return rows.filter((row, index) => rows.findIndex((item) => item === row || item.id === row.id) === index);
}

function asResolution<T extends CatalogRow>(
  status: CatalogResolution<T>["status"],
  rows: T[],
  score: number,
  exact: boolean
): CatalogResolution<T> {
  if (status === "not_found" || rows.length === 0) return { status: "not_found", score: 0, exact: false };
  if (status === "ambiguous" || rows.length > 1) return { status: "ambiguous", row: rows[0], rows, score, exact: false };
  return { status, row: rows[0], rows, score, exact };
}

export function resolveAnimalIdentifier<T extends CatalogRow>(
  input: string | number | null | undefined,
  catalog: T[] = []
): CatalogResolution<T> {
  const text = String(input ?? "").trim();
  const compact = compactCatalogKey(text);
  const normalized = normalizeCatalogText(text);
  const numeric = numberKey(text);
  const inputHasLetters = hasLetters(text);

  if (!compact || catalog.length === 0) return { status: "not_found", score: 0, exact: false };

  const codeKeys = ["brinco", "codigo"];
  const descriptiveKeys = ["nome", "apelido", "descricao", "caracteristicas", "observacoes", "raca"];
  const labelKeys = [...codeKeys, ...descriptiveKeys];

  const compactMatches = uniqueRows(catalog.filter((row) => (
    labelsFrom(row, labelKeys).some((label) => compactCatalogKey(String(label)) === compact)
  )));
  if (compactMatches.length) return asResolution("matched", compactMatches, 1, true);

  const normalizedMatches = uniqueRows(catalog.filter((row) => (
    labelsFrom(row, labelKeys).some((label) => normalizeCatalogText(String(label)) === normalized)
  )));
  if (normalizedMatches.length) return asResolution("matched", normalizedMatches, 1, true);

  if (!inputHasLetters && numeric) {
    const numericMatches = uniqueRows(catalog.filter((row) => (
      labelsFrom(row, codeKeys).some((label) => numberKey(String(label)) === numeric)
    )));
    if (numericMatches.length) return asResolution("matched", numericMatches, 0.96, true);
  }

  const descriptiveMatches = uniqueRows(catalog.filter((row) => (
    labelsFrom(row, descriptiveKeys).some((label) => {
      const option = normalizeCatalogText(String(label));
      return option === normalized || option.split(/\s+/).includes(normalized) || option.includes(normalized);
    })
  )));
  if (descriptiveMatches.length) return asResolution("matched", descriptiveMatches, 0.9, false);

  return { status: "not_found", score: 0, exact: false };
}

function levenshtein(left: string, right: string) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = left[i - 1] === right[j - 1]
        ? costs[j - 1]
        : Math.min(costs[j - 1], previous, costs[j]) + 1;
      costs[j - 1] = previous;
      previous = next;
    }
    costs[right.length] = previous;
  }
  return costs[right.length];
}

function stockScore(input: string, label: string) {
  const target = normalizeCatalogText(input);
  const option = normalizeCatalogText(label);
  const targetCompact = compactCatalogKey(target);
  const optionCompact = compactCatalogKey(option);

  if (!target || !option) return 0;
  if (target === option || targetCompact === optionCompact) return 1;
  if (withoutConnectors(target) && withoutConnectors(target) === withoutConnectors(option)) return 0.96;
  if (option.includes(target)) return 0.92;
  if (target.includes(option)) return 0.86;

  const targetTokens = stockTokens(target);
  const optionTokens = stockTokens(option);
  if (targetTokens.length && targetTokens.every((token) => optionTokens.includes(token))) return 0.9;
  if (optionTokens.length && optionTokens.every((token) => targetTokens.includes(token))) return 0.84;

  const distance = levenshtein(targetCompact, optionCompact);
  if (targetCompact.length <= 7 && distance <= 2) return 0.86;
  return 1 - distance / Math.max(targetCompact.length, optionCompact.length, 1);
}

export function resolveStockItem<T extends CatalogRow>(
  input: string | number | null | undefined,
  catalog: T[] = []
): CatalogResolution<T> {
  const text = String(input ?? "").trim();
  if (!text || catalog.length === 0) return { status: "not_found", score: 0, exact: false };

  const scored = catalog
    .map((row) => {
      const scores = labelsFrom(row, ["nome", "descricao", "item"]).map((label) => stockScore(text, String(label)));
      const score = Math.max(0, ...scores);
      return { row, score, exact: score === 1 };
    })
    .filter((item) => item.score >= 0.72)
    .sort((left, right) => right.score - left.score);

  const best = scored[0];
  if (!best) return { status: "not_found", score: 0, exact: false };

  const tied = uniqueRows(scored
    .filter((item) => Math.abs(item.score - best.score) <= 0.02)
    .map((item) => item.row));

  if (tied.length > 1 && best.score < 1) return asResolution("ambiguous", tied, best.score, false);
  if (best.score >= 0.86) return asResolution("matched", [best.row], best.score, best.exact);
  return asResolution("suggestion", [best.row], best.score, false);
}
