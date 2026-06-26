import type { AnyRecord } from "@/lib/types";
import { parseJsonObjectText, type GenerateStructuredResult, type ProviderRequest } from "@/lib/whatsapp/ai-provider-types";
import { recordGeminiLiveCall } from "@/lib/whatsapp/gemini/runtime";

type GeminiApiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

const GEMINI_TIMEOUT_MS = 8000;

function textFromGeminiResponse(data: GeminiApiResponse) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function geminiAuthHeaders(credential: string): Record<string, string> {
  return { "x-goog-api-key": credential.trim() };
}

function classifyGeminiHttpStatus(status: number) {
  if (status === 401 || status === 403) return "configuration_error" as const;
  if (status === 429) return "rate_limit" as const;
  return "api_error" as const;
}

export async function generateStructuredWithGemini(input: ProviderRequest): Promise<GenerateStructuredResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = input.model;

  if (!apiKey) {
    return { ok: false, provider: "gemini", model, reason: "missing_api_key", message: "GEMINI_API_KEY nao configurada." };
  }

  const prompt = [input.systemPrompt, input.userPrompt].filter(Boolean).join("\n\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const modelPath = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelPath)}:generateContent`;

  try {
    recordGeminiLiveCall();
    const requestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", ...geminiAuthHeaders(apiKey) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: input.temperature ?? 0.1, responseMimeType: "application/json" }
      }),
      signal: controller.signal
    } satisfies RequestInit;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(url, requestInit);
      if (response.status < 500 || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    if (!response) {
      return { ok: false, provider: "gemini", model, reason: "network_error", message: "Erro de rede ao chamar Gemini." };
    }

    const data = await response.json().catch(() => ({})) as GeminiApiResponse;
    if (!response.ok) {
      const rawText = JSON.stringify(data as AnyRecord).slice(0, 1200);
      return {
        ok: false,
        provider: "gemini",
        model,
        reason: classifyGeminiHttpStatus(response.status),
        status: response.status,
        message: data.error?.message || "Erro ao chamar Gemini.",
        rawText
      };
    }

    const rawText = textFromGeminiResponse(data);
    if (!rawText) {
      return { ok: false, provider: "gemini", model, reason: "empty_response", message: "Gemini retornou resposta vazia." };
    }

    try {
      parseJsonObjectText(rawText);
    } catch {
      return { ok: false, provider: "gemini", model, reason: "invalid_json", message: "Gemini retornou JSON invalido.", rawText };
    }

    return { ok: true, provider: "gemini", model, rawText };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      provider: "gemini",
      model,
      reason: aborted ? "timeout" : "network_error",
      message: aborted ? "Tempo esgotado ao chamar Gemini." : "Erro de rede ao chamar Gemini."
    };
  } finally {
    clearTimeout(timeout);
  }
}
