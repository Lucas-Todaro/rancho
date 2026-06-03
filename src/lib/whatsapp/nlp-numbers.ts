const numberWords: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  quatorze: 14,
  catorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900
};

export const decimalNumberPattern = "\\d+(?:[.,]\\d+)*";

function normalizeSingleDecimalSeparator(value: string, separator: "." | ",") {
  const parts = value.split(separator);
  if (parts.length === 1) return value;

  const last = parts[parts.length - 1];
  const first = parts[0];
  const allThousandsGroups = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);

  if (parts.length === 2 && last.length === 3 && first !== "0") return `${first}${last}`;
  if (parts.length > 2 && allThousandsGroups) return parts.join("");

  return `${parts.slice(0, -1).join("")}.${last}`;
}

export function parseDecimalNumber(input: string | number | null | undefined) {
  if (input === undefined || input === null || input === "") return undefined;

  const raw = String(input).replace(/\s+/g, "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(raw)) return undefined;

  const sign = raw.startsWith("-") ? -1 : 1;
  const value = raw.replace(/^-/, "");
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  let normalized = value;

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    normalized = value
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".");
  } else if (lastComma >= 0) {
    normalized = normalizeSingleDecimalSeparator(value, ",");
  } else if (lastDot >= 0) {
    normalized = normalizeSingleDecimalSeparator(value, ".");
  }

  const parsed = Number(normalized) * sign;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toNumber(value: string | undefined) {
  return parseDecimalNumber(value);
}

function parseNumberWordSequence(words: string[], start: number) {
  let total = 0;
  let current = 0;
  let used = 0;

  for (let index = start; index < words.length; index += 1) {
    const word = words[index];
    if (word === "e") {
      used += 1;
      continue;
    }

    if (word === "mil") {
      total += (current || 1) * 1000;
      current = 0;
      used += 1;
      continue;
    }

    const value = numberWords[word];
    if (value === undefined) break;

    current += value;
    used += 1;
  }

  if (!used) return null;
  return { value: total + current, used };
}

export function numberMatches(text: string) {
  const matches: Array<{ raw: string; value: number; index: number }> = [];
  const digitPattern = new RegExp(`\\b${decimalNumberPattern}\\b`, "g");
  let digitMatch = digitPattern.exec(text);

  while (digitMatch) {
    const value = toNumber(digitMatch[0]);
    const index = digitMatch.index || 0;
    const before = text[index - 1] || "";
    const after = text[index + digitMatch[0].length] || "";
    const isCodePart = /[a-z-]/i.test(before) || /[a-z-]/i.test(after);
    if (value !== undefined && !isCodePart) matches.push({ raw: digitMatch[0], value, index });
    digitMatch = digitPattern.exec(text);
  }

  const words = text.split(/\s+/).filter(Boolean);
  let searchFrom = 0;
  for (let index = 0; index < words.length; index += 1) {
    const parsed = parseNumberWordSequence(words, index);
    if (!parsed) continue;

    const raw = words.slice(index, index + parsed.used).join(" ");
    const rawIndex = text.indexOf(raw, searchFrom);
    matches.push({ raw, value: parsed.value, index: rawIndex >= 0 ? rawIndex : index });
    searchFrom = rawIndex >= 0 ? rawIndex + raw.length : searchFrom;
    index += parsed.used - 1;
  }

  return matches.sort((left, right) => left.index - right.index);
}

export function firstNumber(text: string) {
  return numberMatches(text)[0]?.value;
}

export function lastNumber(text: string) {
  const numbers = numberMatches(text);
  return numbers[numbers.length - 1]?.value;
}

export function financialNumberMatches(text: string) {
  const matches = numberMatches(text);
  const normalized = String(text || "").toLowerCase();
  const milPattern = new RegExp(`\\b(?:(?:${decimalNumberPattern})\\s+)?mil\\b`, "g");
  let match = milPattern.exec(normalized);

  while (match) {
    const raw = match[0];
    const prefix = raw.match(new RegExp(`^(${decimalNumberPattern})\\s+mil$`))?.[1];
    const value = prefix ? parseDecimalNumber(prefix) : 1;
    if (value !== undefined) {
      matches.push({ raw, value: value * 1000, index: match.index || 0 });
    }
    match = milPattern.exec(normalized);
  }

  return matches.sort((left, right) => left.index - right.index || String(left.raw).length - String(right.raw).length);
}

export function lastFinancialNumber(text: string) {
  const numbers = financialNumberMatches(text);
  const combinedMil = numbers.filter((match) => /\d.*\bmil\b/.test(match.raw));
  if (combinedMil.length) return combinedMil[combinedMil.length - 1]?.value;
  const wordMil = numbers.filter((match) => /\bmil\b/.test(match.raw) && /[a-z]/i.test(match.raw.replace(/\bmil\b/i, "")));
  if (wordMil.length) return wordMil[wordMil.length - 1]?.value;
  const standaloneMil = numbers.filter((match) => /\bmil\b/.test(match.raw));
  if (standaloneMil.length) return standaloneMil[standaloneMil.length - 1]?.value;
  return numbers[numbers.length - 1]?.value;
}
