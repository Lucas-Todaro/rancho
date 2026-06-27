import { aiProviderLog, generateStructuredAI, parseJsonObjectText } from "@/lib/whatsapp/ai-provider";
import { botTestVerbose, geminiActionPlanEnabled } from "@/lib/whatsapp/gemini/config";
import { buildGeminiSystemPrompt } from "@/lib/whatsapp/gemini/system-prompt";
import { validateInterpretedAction } from "@/lib/whatsapp/gemini/validator";
import {
  findGeminiMockFixture,
  geminiMode,
  recordGeminiMockCall,
  unknownGeminiMockResponse
} from "@/lib/whatsapp/gemini/runtime";
import type {
  GeminiInterpreterInput,
  GeminiInterpreterResult
} from "@/lib/whatsapp/gemini/types";

type GeminiMockGlobal = typeof globalThis & {
  __RANCHO_GEMINI_INTERPRETER_MOCK__?: (input: GeminiInterpreterInput) => unknown | Promise<unknown>;
};

function geminiInterpreterLog(event: string, details: Record<string, unknown>) {
  console.log("[BOT GEMINI INTERPRETER]", {
    event,
    ...details
  });
}

async function mockInterpretation(input: GeminiInterpreterInput) {
  const globalMock = (globalThis as GeminiMockGlobal).__RANCHO_GEMINI_INTERPRETER_MOCK__;
  if (globalMock) return globalMock(input);

  if (process.env.BOT_GEMINI_MOCK === "json" && process.env.BOT_GEMINI_MOCK_RESPONSE) {
    return parseJsonObjectText(process.env.BOT_GEMINI_MOCK_RESPONSE);
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

  const prompt = buildGeminiSystemPrompt({
    ...input
  });

  try {
    const generated = await generateStructuredAI({
      purpose: "action_plan",
      userPrompt: prompt,
      temperature: 0.1,
      requestId: input.geminiMockId || undefined
    });
    const model = generated.model;
    const provider = generated.provider;

    geminiInterpreterLog("request", { provider, model, messageLength: input.text.length });
    if (!generated.ok) {
      return {
        ok: false,
        reason: generated.reason,
        status: generated.status,
        message: generated.message,
        rawText: generated.rawText
      };
    }

    const rawText = generated.rawText;
    let parsed: unknown;
    try {
      parsed = parseJsonObjectText(rawText);
    } catch {
      geminiInterpreterLog("error", { provider, reason: "invalid_json", model, responseLength: rawText.length });
      return { ok: false, reason: "invalid_json", message: "Interpretador retornou JSON invalido.", rawText };
    }

    const validation = validateInterpretedAction(parsed, {
      originalText: input.text,
      currentDate: input.currentDate,
      timezone: input.timezone
    });
    if (!validation.ok) {
      aiProviderLog("ai_provider_contract_error", {
        provider,
        model,
        purpose: "action_plan",
        requestId: input.geminiMockId || null,
        reason: validation.reason
      });
      geminiInterpreterLog("error", { provider, reason: validation.reason, model, message: validation.message });
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
        provider,
        model,
        action: plan.action,
        domain: "domain" in plan ? plan.domain : null,
        confidence: validation.value.confidence
      });
    } else if (geminiActionPlanEnabled() && validation.value.legacy_intent_returned) {
      geminiInterpreterLog("legacy_intent_returned_while_action_plan_enabled", {
        provider,
        model,
        intent: validation.value.intent,
        actionPlanUsed: false,
        fallbackEligible: validation.value.fallback_eligible === true,
        messageLength: input.text.length
      });
    }

    geminiInterpreterLog("success", {
      provider,
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
      provider,
      rawText,
      interpretation: validation.value,
      validationStatus: validation.status
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const reason = aborted ? "timeout" : "network_error";
    geminiInterpreterLog("error", { reason });
    return {
      ok: false,
      reason,
      message: aborted ? "Tempo esgotado ao chamar Gemini." : "Erro de rede ao chamar Gemini."
    };
  }
}

export async function interpretWithGemini(input: GeminiInterpreterInput): Promise<GeminiInterpreterResult> {
  return callGeminiInterpreter(input);
}

