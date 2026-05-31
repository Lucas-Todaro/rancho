export function normalizePhoneNumber(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/[+\s\-()]/g, "")
    .replace(/\D/g, "");
}

export function normalizeWhatsappNumber(value: string | number | null | undefined) {
  const digits = normalizePhoneNumber(value).replace(/^00/, "");
  if (!digits) return "";
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function addBrazilianPhoneCandidate(candidates: Set<string>, value: string) {
  if (!value) return;

  candidates.add(value);

  const national = value.startsWith("55") && (value.length === 12 || value.length === 13)
    ? value.slice(2)
    : value;

  if (national.length !== 10 && national.length !== 11) return;

  candidates.add(national);
  candidates.add(`55${national}`);

  if (national.length === 11 && national[2] === "9") {
    const withoutNinthDigit = `${national.slice(0, 2)}${national.slice(3)}`;
    candidates.add(withoutNinthDigit);
    candidates.add(`55${withoutNinthDigit}`);
  }

  if (national.length === 10) {
    const withNinthDigit = `${national.slice(0, 2)}9${national.slice(2)}`;
    candidates.add(withNinthDigit);
    candidates.add(`55${withNinthDigit}`);
  }
}

export function whatsappNumberCandidates(value: string | number | null | undefined) {
  const raw = normalizePhoneNumber(value).replace(/^00/, "");
  const normalized = normalizeWhatsappNumber(value);
  const candidates = new Set<string>();

  addBrazilianPhoneCandidate(candidates, normalized);
  addBrazilianPhoneCandidate(candidates, raw);

  return Array.from(candidates).filter(Boolean);
}

export function whatsappNumbersMatch(left: string | number | null | undefined, right: string | number | null | undefined) {
  const rightCandidates = new Set(whatsappNumberCandidates(right));
  return whatsappNumberCandidates(left).some((candidate) => rightCandidates.has(candidate));
}
