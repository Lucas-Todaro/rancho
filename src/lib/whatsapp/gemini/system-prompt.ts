import { buildActionPlanPromptFragment } from "@/lib/whatsapp/gemini/action-plan-prompt";
import type { GeminiInterpreterInput } from "@/lib/whatsapp/gemini/types";

export const GEMINI_SYSTEM_PROMPT_VERSION = "rancho-gemini-first-v4";

export function buildGeminiSystemPrompt(input: GeminiInterpreterInput) {
  return [
    `Prompt version: ${GEMINI_SYSTEM_PROMPT_VERSION}`,
    "Voce e o interpretador semantico do bot Rancho.",
    buildActionPlanPromptFragment({
      currentDate: input.currentDate,
      timezone: input.timezone
    }),
    "",
    "Contexto de sessao, somente para interpretar referencias conversacionais:",
    JSON.stringify(input.session || {}, null, 2),
    "Usuario, sem permissao para alterar identidade ou tenant:",
    JSON.stringify(input.user || {}, null, 2),
    "Catalogos textuais disponiveis, sem inventar ou resolver IDs:",
    JSON.stringify(input.catalogs || {}, null, 2),
    "",
    "Mensagem original:",
    JSON.stringify(input.text)
  ].join("\n");
}
