import { configuredGeminiModel } from "@/lib/whatsapp/gemini/config";
import { generateStructuredWithGemini } from "@/lib/whatsapp/gemini-provider";
import { generateStructuredWithOpenRouter } from "@/lib/whatsapp/openrouter-provider";
import type { AIProviderName, GenerateStructuredInput, GenerateStructuredResult, ProviderRequest } from "@/lib/whatsapp/ai-provider-types";

export type {
  AIProviderFailureReason,
  AIProviderName,
  GenerateStructuredInput,
  GenerateStructuredPurpose,
  GenerateStructuredResult,
  GenerateStructuredUsage,
  ProviderRequest
} from "@/lib/whatsapp/ai-provider-types";
export { parseJsonObjectText } from "@/lib/whatsapp/ai-provider-types";

export function configuredAIProviderName(): AIProviderName {
  const raw = String(process.env.BOT_AI_PROVIDER || "").trim().toLowerCase();
  if (raw === "openrouter") return "openrouter";
  if (!raw && process.env.OPENROUTER_API_KEY?.trim()) return "openrouter";
  return "gemini";
}

export function configuredAIModel(provider: AIProviderName = configuredAIProviderName()) {
  if (provider === "openrouter") return String(process.env.BOT_AI_MODEL || process.env.OPENROUTER_MODEL || "qwen/qwen3-32b").trim();
  return configuredGeminiModel();
}

export function providerApiKeyConfigured(provider: AIProviderName = configuredAIProviderName()) {
  if (provider === "openrouter") return Boolean(process.env.OPENROUTER_API_KEY?.trim());
  return Boolean(process.env.GEMINI_API_KEY?.trim());
}

function automatedTestBlocksLiveProvider() {
  const isAutomatedTest = process.env.NODE_ENV === "test" || process.env.RANCHO_BOT_TEST === "1";
  if (!isAutomatedTest) return false;
  return process.env.ALLOW_LIVE_AI_TESTS !== "true" && process.env.ALLOW_LIVE_GEMINI_TESTS !== "true";
}

export function aiProviderLog(event: string, details: Record<string, unknown>) {
  console.log("[BOT AI PROVIDER]", { event, ...details });
}

export function isTransientAIProviderFailure(result: { reason: string; status?: number }) {
  return result.reason === "rate_limit"
    || result.reason === "timeout"
    || result.reason === "network_error"
    || result.status === 429
    || result.status === 500
    || result.status === 502
    || result.status === 503
    || result.status === 504;
}

function blockedLiveResult(provider: AIProviderName, model: string): GenerateStructuredResult {
  return {
    ok: false,
    provider,
    model,
    reason: "api_error",
    message: provider === "gemini"
      ? "Teste tentou chamar Gemini live. Use GEMINI_MODE=mock."
      : "Teste tentou chamar OpenRouter live. Use mocks ou ALLOW_LIVE_AI_TESTS=true."
  };
}

function logProviderResult(input: GenerateStructuredInput, result: GenerateStructuredResult) {
  const base = {
    provider: result.provider,
    model: result.model,
    purpose: input.purpose,
    requestId: input.requestId || null,
    status: result.ok ? null : result.status || null
  };

  if (result.ok) {
    aiProviderLog("ai_provider_request_success", {
      ...base,
      outputLength: result.rawText.length,
      usage: result.usage || null
    });
    return;
  }

  aiProviderLog(
    result.reason === "invalid_json" ? "ai_provider_invalid_json" : "ai_provider_request_failed",
    {
      ...base,
      reason: result.reason,
      message: result.message,
      responseLength: result.rawText ? result.rawText.length : 0
    }
  );
}

export async function generateStructuredAI(input: GenerateStructuredInput): Promise<GenerateStructuredResult> {
  const provider = configuredAIProviderName();
  const model = configuredAIModel(provider);

  aiProviderLog("ai_provider_selected", {
    provider,
    model: model || null,
    purpose: input.purpose,
    requestId: input.requestId || null
  });

  if (automatedTestBlocksLiveProvider()) {
    const result = blockedLiveResult(provider, model);
    logProviderResult(input, result);
    return result;
  }

  aiProviderLog("ai_provider_request_started", {
    provider,
    model: model || null,
    purpose: input.purpose,
    requestId: input.requestId || null
  });

  const request: ProviderRequest = { ...input, provider, model };
  const result = provider === "openrouter"
    ? await generateStructuredWithOpenRouter(request)
    : await generateStructuredWithGemini(request);

  logProviderResult(input, result);
  return result;
}
