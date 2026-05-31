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

export function whatsappNumberCandidates(value: string | number | null | undefined) {
  const raw = normalizePhoneNumber(value).replace(/^00/, "");
  const normalized = normalizeWhatsappNumber(value);
  const candidates = new Set<string>();

  if (normalized) candidates.add(normalized);
  if (raw) candidates.add(raw);
  if (normalized.startsWith("55")) candidates.add(normalized.slice(2));
  if (raw.startsWith("55")) candidates.add(raw.slice(2));
  if (raw.length === 10 || raw.length === 11) candidates.add(`55${raw}`);

  return Array.from(candidates).filter(Boolean);
}

export function whatsappNumbersMatch(left: string | number | null | undefined, right: string | number | null | undefined) {
  const rightCandidates = new Set(whatsappNumberCandidates(right));
  return whatsappNumberCandidates(left).some((candidate) => rightCandidates.has(candidate));
}
