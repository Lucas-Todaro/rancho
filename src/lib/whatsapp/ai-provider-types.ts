export type AIProviderName = "gemini" | "openrouter";

export type GenerateStructuredPurpose = "action_plan" | "pending_patch" | "pending_action" | "response_composer";

export type GenerateStructuredInput = {
  purpose: GenerateStructuredPurpose;
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  requestId?: string;
};

export type GenerateStructuredUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type AIProviderFailureReason =
  | "missing_api_key"
  | "missing_model"
  | "configuration_error"
  | "timeout"
  | "rate_limit"
  | "network_error"
  | "api_error"
  | "empty_response"
  | "invalid_json";

export type GenerateStructuredResult =
  | {
      ok: true;
      provider: AIProviderName;
      model: string;
      rawText: string;
      usage?: GenerateStructuredUsage;
    }
  | {
      ok: false;
      provider: AIProviderName;
      model: string;
      reason: AIProviderFailureReason;
      message: string;
      status?: number;
      rawText?: string;
    };

export type ProviderRequest = GenerateStructuredInput & {
  provider: AIProviderName;
  model: string;
};

export function parseJsonObjectText(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("JSON object not found");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
