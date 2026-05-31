export function normalizePhoneNumber(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/[+\s\-()]/g, "")
    .replace(/\D/g, "");
}
