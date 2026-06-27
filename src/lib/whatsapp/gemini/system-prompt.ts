import { buildActionPlanPromptFragment } from "@/lib/whatsapp/gemini/action-plan-prompt";
import type { GeminiInterpreterInput } from "@/lib/whatsapp/gemini/types";

export const GEMINI_SYSTEM_PROMPT_VERSION = "rancho-gemini-first-v4";

const ACTION_PLAN_PROMPT_CACHE_LIMIT = 8;
const actionPlanPromptCache = new Map<string, string>();

function cachedActionPlanPromptFragment(input: GeminiInterpreterInput) {
  const key = `${input.currentDate || ""}|${input.timezone || ""}`;
  const cached = actionPlanPromptCache.get(key);
  if (cached) return cached;

  const fragment = buildActionPlanPromptFragment({
    currentDate: input.currentDate,
    timezone: input.timezone
  });
  actionPlanPromptCache.set(key, fragment);
  if (actionPlanPromptCache.size > ACTION_PLAN_PROMPT_CACHE_LIMIT) {
    const oldest = actionPlanPromptCache.keys().next().value;
    if (oldest) actionPlanPromptCache.delete(oldest);
  }
  return fragment;
}

export function buildGeminiSystemPrompt(input: GeminiInterpreterInput) {
  return [
    `Prompt version: ${GEMINI_SYSTEM_PROMPT_VERSION}`,
    "Voce e o interpretador semantico do bot Rancho.",
    cachedActionPlanPromptFragment(input),
    "",
    "Contexto de sessao, somente para interpretar referencias conversacionais:",
    JSON.stringify(input.session || {}),
    "Usuario, sem permissao para alterar identidade ou tenant:",
    JSON.stringify(input.user || {}),
    "Catalogos textuais disponiveis, sem inventar ou resolver IDs:",
    JSON.stringify(input.catalogs || {}),
    "",
    "Mensagem original:",
    JSON.stringify(input.text)
  ].join("\n");
}
