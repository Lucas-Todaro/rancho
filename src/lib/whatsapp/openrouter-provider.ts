import { parseJsonObjectText, type GenerateStructuredResult, type ProviderRequest } from "@/lib/whatsapp/ai-provider-types";

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: string;
    native_finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      refusal?: string | null;
      reasoning?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string | number;
  };
};

const OPENROUTER_TIMEOUT_MS = 8000;
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function configuredOpenRouterBaseUrl() {
  return (process.env.OPENROUTER_BASE_URL || DEFAULT_OPENROUTER_BASE_URL).trim().replace(/\/+$/, "");
}

function openRouterHeaders(apiKey: string) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  const siteUrl = process.env.OPENROUTER_SITE_URL?.trim();
  const appName = process.env.OPENROUTER_APP_NAME?.trim();
  if (siteUrl) headers["HTTP-Referer"] = siteUrl;
  if (appName) headers["X-Title"] = appName;
  return headers;
}

function messagesFor(input: ProviderRequest) {
  return [
    input.systemPrompt ? { role: "system", content: input.systemPrompt } : null,
    { role: "user", content: input.userPrompt }
  ].filter(Boolean);
}

function bodyFor(input: ProviderRequest, includeResponseFormat: boolean) {
  return {
    model: input.model,
    messages: messagesFor(input),
    temperature: input.temperature ?? 0,
    ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
    ...(includeResponseFormat ? { response_format: { type: "json_object" } } : {})
  };
}

function openRouterText(data: OpenRouterResponse) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || "")
      .join("\n")
      .trim();
  }
  return "";
}

function safeOpenRouterDiagnostic(data: OpenRouterResponse) {
  return JSON.stringify({
    choices: (data.choices || []).slice(0, 2).map((choice) => {
      const content = choice.message?.content;
      return {
        finish_reason: choice.finish_reason || null,
        native_finish_reason: choice.native_finish_reason || null,
        message_keys: choice.message ? Object.keys(choice.message).filter((key) => key !== "content" && key !== "reasoning") : [],
        content_type: Array.isArray(content) ? "array" : typeof content,
        content_length: typeof content === "string" ? content.length : Array.isArray(content) ? content.length : 0,
        has_refusal: Boolean(choice.message?.refusal),
        has_reasoning: Boolean(choice.message?.reasoning)
      };
    }),
    usage: data.usage || null,
    error: data.error ? { message: data.error.message || null, code: data.error.code || null } : null
  }).slice(0, 1200);
}

function shouldRetryWithoutResponseFormat(status: number, data: OpenRouterResponse) {
  if (status !== 400) return false;
  return /response_format|json_object|schema|format/i.test(String(data.error?.message || ""));
}

function classifyOpenRouterHttpStatus(status: number) {
  if (status === 401 || status === 403) return "configuration_error" as const;
  if (status === 429) return "rate_limit" as const;
  return "api_error" as const;
}

async function requestOpenRouter(input: ProviderRequest, apiKey: string, includeResponseFormat: boolean, signal: AbortSignal) {
  return fetch(`${configuredOpenRouterBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: openRouterHeaders(apiKey),
    body: JSON.stringify(bodyFor(input, includeResponseFormat)),
    signal
  });
}

export async function generateStructuredWithOpenRouter(input: ProviderRequest): Promise<GenerateStructuredResult> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model = input.model;

  if (!apiKey) {
    return { ok: false, provider: "openrouter", model, reason: "missing_api_key", message: "OPENROUTER_API_KEY nao configurada." };
  }
  if (!model) {
    return { ok: false, provider: "openrouter", model, reason: "missing_model", message: "BOT_AI_MODEL nao configurado para OpenRouter." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    let response = await requestOpenRouter(input, apiKey, true, controller.signal);
    let data = await response.json().catch(() => ({})) as OpenRouterResponse;

    if (!response.ok && shouldRetryWithoutResponseFormat(response.status, data)) {
      response = await requestOpenRouter(input, apiKey, false, controller.signal);
      data = await response.json().catch(() => ({})) as OpenRouterResponse;
    }

    if (!response.ok) {
      const rawText = JSON.stringify(data).slice(0, 1200);
      return {
        ok: false,
        provider: "openrouter",
        model,
        reason: classifyOpenRouterHttpStatus(response.status),
        status: response.status,
        message: data.error?.message || "Erro ao chamar OpenRouter.",
        rawText
      };
    }

    let rawText = openRouterText(data);
    if (!rawText) {
      response = await requestOpenRouter(input, apiKey, false, controller.signal);
      data = await response.json().catch(() => ({})) as OpenRouterResponse;
      if (!response.ok) {
        const rawErrorText = JSON.stringify(data).slice(0, 1200);
        return {
          ok: false,
          provider: "openrouter",
          model,
          reason: classifyOpenRouterHttpStatus(response.status),
          status: response.status,
          message: data.error?.message || "Erro ao chamar OpenRouter.",
          rawText: rawErrorText
        };
      }
      rawText = openRouterText(data);
    }

    if (!rawText) {
      return {
        ok: false,
        provider: "openrouter",
        model,
        reason: "empty_response",
        message: "OpenRouter retornou resposta vazia.",
        rawText: safeOpenRouterDiagnostic(data)
      };
    }

    try {
      parseJsonObjectText(rawText);
    } catch {
      return { ok: false, provider: "openrouter", model, reason: "invalid_json", message: "OpenRouter retornou JSON invalido.", rawText };
    }

    return {
      ok: true,
      provider: "openrouter",
      model,
      rawText,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens
      }
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      provider: "openrouter",
      model,
      reason: aborted ? "timeout" : "network_error",
      message: aborted ? "Tempo esgotado ao chamar OpenRouter." : "Erro de rede ao chamar OpenRouter."
    };
  } finally {
    clearTimeout(timeout);
  }
}
