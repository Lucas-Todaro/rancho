export type BotInterpreterMode = "gemini" | "legacy_parser" | "shadow";

export const GEMINI_SAFE_FAILURE_MESSAGE =
  "Nao consegui interpretar com seguranca agora. Pode enviar novamente de forma mais direta?";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function botInterpreterMode(): BotInterpreterMode {
  const raw = String(process.env.BOT_INTERPRETER || "gemini").trim().toLowerCase();
  if (raw === "legacy_parser" || raw === "shadow" || raw === "gemini") return raw;
  return "gemini";
}

export function botAllowsLegacyRollback() {
  return String(process.env.BOT_ALLOW_LEGACY_ROLLBACK || "").trim().toLowerCase() === "true";
}

export function geminiActionPlanEnabled() {
  return String(process.env.GEMINI_ACTION_PLAN_ENABLED || "").trim().toLowerCase() === "true";
}

export function geminiTableActionPlanEnabled() {
  return String(process.env.GEMINI_TABLE_ACTION_PLAN_ENABLED || "").trim().toLowerCase() === "true";
}

export function botTestVerbose() {
  return process.env.BOT_TEST_VERBOSE === "1";
}

export function configuredGeminiModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
}

