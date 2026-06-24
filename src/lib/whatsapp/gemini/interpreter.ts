import { configuredGeminiModel, botTestVerbose, geminiActionPlanEnabled } from "@/lib/whatsapp/gemini/config";
import { GEMINI_ALLOWED_INTENTS } from "@/lib/whatsapp/gemini/allowed-intents";
import { allGeminiSchemasForPrompt } from "@/lib/whatsapp/gemini/schemas";
import { buildGeminiSystemPrompt } from "@/lib/whatsapp/gemini/system-prompt";
import { validateInterpretedAction } from "@/lib/whatsapp/gemini/validator";
import {
  findGeminiMockFixture,
  geminiMode,
  liveGeminiBlockedResult,
  recordGeminiLiveCall,
  recordGeminiMockCall,
  shouldBlockGeminiLiveCall,
  unknownGeminiMockResponse
} from "@/lib/whatsapp/gemini/runtime";
import type {
  GeminiInterpreterInput,
  GeminiInterpreterResult
} from "@/lib/whatsapp/gemini/types";

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

type GeminiMockGlobal = typeof globalThis & {
  __RANCHO_GEMINI_INTERPRETER_MOCK__?: (input: GeminiInterpreterInput) => unknown | Promise<unknown>;
};

const GEMINI_TIMEOUT_MS = 8000;

function textFromGeminiResponse(data: GeminiApiResponse) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function parseJsonObject(text: string): unknown {
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

function geminiInterpreterLog(event: string, details: Record<string, unknown>) {
  console.log("[BOT GEMINI INTERPRETER]", {
    event,
    ...details
  });
}

function geminiAuthHeaders(credential: string): Record<string, string> {
  return { "x-goog-api-key": credential.trim() };
}

async function mockInterpretation(input: GeminiInterpreterInput) {
  const globalMock = (globalThis as GeminiMockGlobal).__RANCHO_GEMINI_INTERPRETER_MOCK__;
  if (globalMock) return globalMock(input);

  if (process.env.BOT_GEMINI_MOCK === "json" && process.env.BOT_GEMINI_MOCK_RESPONSE) {
    return parseJsonObject(process.env.BOT_GEMINI_MOCK_RESPONSE);
  }

  return undefined;
}

function validateMockedInterpretation(input: GeminiInterpreterInput, mock: unknown, model = "mock"): GeminiInterpreterResult {
  const validation = validateInterpretedAction(mock, {
    originalText: input.text,
    currentDate: input.currentDate,
    timezone: input.timezone
  });
  if (!validation.ok) {
    return { ok: false, reason: validation.reason === "dangerous_response" ? "dangerous_response" : "invalid_schema", message: validation.message };
  }
  return {
    ok: true,
    interpretation: validation.value,
    model,
    rawText: JSON.stringify(mock),
    validationStatus: validation.status
  };
}

export async function callGeminiInterpreter(input: GeminiInterpreterInput): Promise<GeminiInterpreterResult> {
  if (geminiMode() === "mock") {
    if (input.geminiMockId) {
      const fixture = findGeminiMockFixture({ text: input.text, geminiMockId: input.geminiMockId });
      if (fixture) {
        recordGeminiMockCall(fixture.id);
        return validateMockedInterpretation(input, fixture.response, `mock:${fixture.id}`);
      }
      recordGeminiMockCall("fixture-not-found");
      return validateMockedInterpretation(input, unknownGeminiMockResponse(), "mock:fixture-not-found");
    }

    const mock = await mockInterpretation(input);
    if (mock !== undefined) {
      recordGeminiMockCall("global-or-env-mock");
      return validateMockedInterpretation(input, mock);
    }

    const fixture = findGeminiMockFixture({ text: input.text, geminiMockId: input.geminiMockId });
    if (fixture) {
      recordGeminiMockCall(fixture.id);
      return validateMockedInterpretation(input, fixture.response, `mock:${fixture.id}`);
    }

    recordGeminiMockCall("fixture-not-found");
    return validateMockedInterpretation(input, unknownGeminiMockResponse(), "mock:fixture-not-found");
  }

  if (shouldBlockGeminiLiveCall()) return liveGeminiBlockedResult();

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = configuredGeminiModel();
  if (!apiKey) {
    geminiInterpreterLog("skipped", { reason: "missing_api_key", model, messageLength: input.text.length });
    return { ok: false, reason: "missing_api_key", message: "GEMINI_API_KEY nao configurada." };
  }

  const prompt = buildGeminiSystemPrompt({
    ...input,
    allowedIntents: input.allowedIntents || [...GEMINI_ALLOWED_INTENTS],
    schemas: input.schemas || allGeminiSchemasForPrompt()
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const modelPath = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelPath)}:generateContent`;

  try {
    geminiInterpreterLog("request", { model, messageLength: input.text.length });
    recordGeminiLiveCall();
    const requestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", ...geminiAuthHeaders(apiKey) },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      }),
      signal: controller.signal
    } satisfies RequestInit;
    let response: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      response = await fetch(url, requestInit);
      if (response.status < 500 || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!response) return { ok: false, reason: "network_error", message: "Erro de rede ao chamar Gemini." };

    const data = await response.json().catch(() => ({})) as GeminiApiResponse;
    if (!response.ok) {
      const reason = response.status === 429 ? "rate_limit" : response.status >= 500 ? "api_error" : "api_error";
      const rawText = JSON.stringify(data).slice(0, 1200);
      geminiInterpreterLog("gemini_http_error", {
        reason,
        status: response.status,
        statusText: response.statusText,
        model,
        hasKey: Boolean(apiKey),
        keyLength: apiKey.length,
        authHeaderUsed: false,
        xGoogApiKeyUsed: true,
        apiStatus: data.error?.status || null,
        bodyPreview: rawText,
        responseBodyPreview: rawText
      });
      return {
        ok: false,
        reason,
        status: response.status,
        message: data.error?.message || "Erro ao chamar Gemini.",
        rawText
      };
    }

    const rawText = textFromGeminiResponse(data);
    if (!rawText) {
      geminiInterpreterLog("gemini_empty_response", { reason: "empty_response", model });
      return { ok: false, reason: "empty_response", message: "Gemini retornou resposta vazia." };
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObject(rawText);
    } catch {
      geminiInterpreterLog("error", { reason: "invalid_json", model, responseLength: rawText.length });
      return { ok: false, reason: "invalid_json", message: "Gemini retornou JSON invalido.", rawText };
    }

    const validation = validateInterpretedAction(parsed, {
      originalText: input.text,
      currentDate: input.currentDate,
      timezone: input.timezone
    });
    if (!validation.ok) {
      geminiInterpreterLog("error", { reason: validation.reason, model, message: validation.message });
      return {
        ok: false,
        reason: validation.reason === "dangerous_response" ? "dangerous_response" : "invalid_schema",
        message: validation.message,
        rawText
      };
    }

    if (botTestVerbose()) {
      geminiInterpreterLog("verbose", {
        prompt,
        rawText,
        validationStatus: validation.status,
        warnings: validation.warnings
      });
    }

    if (validation.value.action_plan) {
      const plan = validation.value.action_plan;
      geminiInterpreterLog("action_plan_success", {
        model,
        action: plan.action,
        domain: "domain" in plan ? plan.domain : null,
        confidence: validation.value.confidence
      });
    } else if (geminiActionPlanEnabled() && validation.value.legacy_intent_returned) {
      geminiInterpreterLog("legacy_intent_returned_while_action_plan_enabled", {
        model,
        intent: validation.value.intent,
        actionPlanUsed: false,
        fallbackEligible: validation.value.fallback_eligible === true,
        messageLength: input.text.length
      });
    }

    geminiInterpreterLog("success", {
      model,
      intent: validation.value.intent,
      confidence: validation.value.confidence,
      riskScore: validation.value.riskScore,
      missingFields: validation.missingFields,
      shouldConfirm: validation.value.should_confirm
    });

    return {
      ok: true,
      model,
      rawText,
      interpretation: validation.value,
      validationStatus: validation.status
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const reason = aborted ? "timeout" : "network_error";
    geminiInterpreterLog("error", { reason, model });
    return {
      ok: false,
      reason,
      message: aborted ? "Tempo esgotado ao chamar Gemini." : "Erro de rede ao chamar Gemini."
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function interpretWithGemini(input: GeminiInterpreterInput): Promise<GeminiInterpreterResult> {
  return callGeminiInterpreter(input);
}

