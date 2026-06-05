const SECRET_VALUE_PATTERN = /\b(?:eyJ[a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9_-]{20,}|SG\.[a-zA-Z0-9_-]{20,}|AC[a-f0-9]{20,}|[a-zA-Z0-9_-]{32,})\b/g;
const SECRET_ASSIGNMENT_PATTERN = /\b(?:service[_ -]?role|auth[_ -]?token|api[_ -]?key|secret|password|jwt|private[_ -]?key|supabase[_ -]?key|twilio[_ -]?token)\b\s*[:=]\s*["']?[^"',\s}]+/gi;
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const CPF_PATTERN = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const EMAIL_PATTERN = /\b([a-zA-Z0-9._%+-]{1,2})[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g;
const PHONE_PATTERN = /\b(?:whatsapp:)?\+?\d[\d\s().-]{9,}\d\b/g;

export const MAX_WHATSAPP_MESSAGE_LENGTH = 2000;
export const SAFE_OPERATION_BLOCKED_MESSAGE = "Não posso executar esse tipo de comando nem revelar dados internos. Envie uma consulta ou registro permitido do Rancho.";

function normalizeSecurityText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function redactSensitiveText(value: unknown) {
  return String(value ?? "")
    .replace(SECRET_ASSIGNMENT_PATTERN, (match) => {
      const key = match.split(/[:=]/)[0]?.trim() || "secret";
      return `${key}: [redacted]`;
    })
    .replace(SECRET_VALUE_PATTERN, "[redacted]")
    .replace(CPF_PATTERN, (match) => `***.***.***-${match.replace(/\D/g, "").slice(-2)}`)
    .replace(EMAIL_PATTERN, (_match, prefix, domain) => `${prefix}***${domain}`)
    .replace(PHONE_PATTERN, (match) => maskSensitivePhone(match));
}

export function maskSensitivePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const suffix = digits.slice(-4);
  return digits.startsWith("55") ? `+55******${suffix}` : `******${suffix}`;
}

export function safeErrorText(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) return redactSensitiveText(error.message);
  if (typeof error === "object") {
    const item = error as { message?: unknown; code?: unknown };
    return redactSensitiveText([item.message, item.code].filter(Boolean).join(" "));
  }
  return redactSensitiveText(error);
}

export function sanitizeFreeText(value: unknown, maxLength = MAX_WHATSAPP_MESSAGE_LENGTH) {
  return String(value ?? "")
    .replace(CONTROL_CHARS_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function isOversizedText(value: unknown, maxLength = MAX_WHATSAPP_MESSAGE_LENGTH) {
  return String(value ?? "").length > maxLength;
}

export function isUnsafeOperationalMessage(value: unknown) {
  const text = normalizeSecurityText(String(value ?? ""));
  return [
    /\b(?:drop|truncate|alter)\s+table\b/,
    /\b(?:delete|apaga|apagar)\s+(?:todos?|tudo|dados|banco)\b/,
    /\b(?:executa|rodar?|roda|faz)\s+(?:sql|query|select|insert|update|delete)\b/,
    /\bselect\s+\*\s+from\b/,
    /\binsert\s+into\b/,
    /\bupdate\s+\w+\s+set\b/,
    /\b(?:ignore|ignora)\s+(?:as\s+)?permissoes\b/,
    /\b(?:bypassa|burlar?|burla|desativa|desativar)\s+rls\b/,
    /\b(?:service\s*role|supabase|token|chave\s+do\s+supabase|auth\s*token|api\s*key|segredo|secret)\b/,
    /\b(?:sou|me\s+torna|vira)\s+(?:admin|dono|owner)\b/,
    /\b(?:muda|troca|altera)\s+meu\s+cargo\s+para\s+(?:dono|admin|owner)\b/,
    /\b(?:mostra|ver|acessa|usar?|usa)\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:dados|rancho|fazenda)\s+de\s+outr[ao]\b/,
    /\b(?:confirma|salva|registra|faz)\s+tudo\s+sozinh[ao]\b/,
    /\b(?:sem|sem pedir)\s+confirmacao\b/
  ].some((pattern) => pattern.test(text));
}

export function sanitizePayloadValue(value: unknown, maxLength = 500): unknown {
  if (value === undefined) return undefined;
  if (typeof value === "string") return sanitizeFreeText(value, maxLength);
  if (Array.isArray(value)) return value.map((item) => sanitizePayloadValue(item, maxLength));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, sanitizePayloadValue(item, maxLength)])
        .filter(([, item]) => item !== undefined)
    );
  }
  return value;
}
