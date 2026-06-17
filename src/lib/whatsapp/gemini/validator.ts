import type { AnyRecord } from "@/lib/types";
import { GEMINI_CONSULT_INTENTS, normalizeGeminiIntent } from "@/lib/whatsapp/gemini/allowed-intents";
import { allowedFieldsForGeminiIntent, schemaForGeminiIntent } from "@/lib/whatsapp/gemini/schemas";
import type { GeminiStructuredAction, GeminiStructuredResult } from "@/lib/whatsapp/gemini/types";
import {
  detectDestructiveBulkAction,
  detectRecentBirthsQuery,
  recentBirthsQueryData
} from "@/lib/whatsapp/nlp-core/safety-guards";

export type GeminiValidationContext = {
  originalText?: string;
  currentDate?: string;
  timezone?: string;
};

export type GeminiValidationResult =
  | {
      ok: true;
      status: "valid" | "missing_fields";
      value: GeminiStructuredResult;
      warnings: string[];
      missingFields: string[];
    }
  | {
      ok: false;
      status: "blocked" | "invalid";
      reason: string;
      message: string;
      warnings: string[];
    };

const STRING_MAX = 500;
const MAX_ACTIONS = 12;
const DANGEROUS_TEXT_PATTERN =
  /\b(?:drop\s+table|truncate|alter\s+table|delete\s+from|insert\s+into|update\s+\w+\s+set|select\s+\*|schema|supabase|api[_-]?key|senha|password|token)\b/i;
const ANIMAL_NAME_STOPWORDS = new Set(["novo", "nova", "cadastrar", "animal", "adicionar", "criar"]);
const PHYSICAL_UNITS = new Set(["kg", "g", "l", "litro", "litros", "saco", "sacos", "dose", "doses", "fardo", "unidade"]);
const FINANCIAL_FIELDS = new Set(["valor", "valor_total", "preco", "preco_total", "salario_base"]);
const DATE_FIELDS = new Set(["data", "nascimento", "horario"]);
const GEMINI_BLOCKED_INTENTS = new Set(["ACAO_DESTRUTIVA_EM_MASSA"]);

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberOrDefault(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function geminiIntentRequiresConfirmation(intent: string) {
  return !GEMINI_CONSULT_INTENTS.has(intent) && !GEMINI_BLOCKED_INTENTS.has(intent) && intent !== "DESCONHECIDO";
}

function normalizeMissing(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeWarnings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 30);
}

function normalizedFields(value: unknown, errors: string[], path: string) {
  if (value === undefined || value === null) return {};
  if (!isPlainObject(value)) {
    errors.push(`${path} deve ser objeto`);
    return {};
  }
  return { ...value };
}

function hasDangerousString(value: unknown): boolean {
  if (typeof value === "string") return DANGEROUS_TEXT_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(hasDangerousString);
  if (isPlainObject(value)) return Object.values(value).some(hasDangerousString);
  return false;
}

function invalidDateLike(value: unknown) {
  if (!hasValue(value)) return false;
  const text = String(value).trim().toLowerCase();
  if (["hoje", "ontem", "anteontem", "amanha", "semana", "mes"].includes(text)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return Number.isNaN(new Date(`${text}T12:00:00`).getTime());
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(text)) return false;
  if (/^\d{1,2}h(?:\d{2})?$/.test(text) || /^\d{1,2}:\d{2}$/.test(text)) return false;
  return DATE_FIELDS.has(text);
}

function validateFieldValues(intent: string, fields: AnyRecord, errors: string[], warnings: string[]) {
  for (const [field, value] of Object.entries(fields)) {
    if (typeof value === "string" && value.length > STRING_MAX) errors.push(`${intent}.${field} muito longo`);
    if (typeof value === "number" && !Number.isFinite(value)) errors.push(`${intent}.${field} deve ser numero valido`);
    if (typeof value === "number" && value < 0 && FINANCIAL_FIELDS.has(field)) {
      errors.push(`${intent}.${field} financeiro negativo sem contexto claro`);
    }
    if (/quantidade|litros|peso/.test(field) && typeof value === "number" && value < 0) {
      errors.push(`${intent}.${field} fisico negativo`);
    }
    if ((field === "animal_ref" || field === "animal_codigo") && /^\d{1,2}h(?:\d{2})?$/i.test(String(value || ""))) {
      errors.push("horario nao pode ser interpretado como animal");
    }
    if ((field === "animal_ref" || field === "animal_codigo") && /\be\s+\S+\s+\d+\b/i.test(String(value || ""))) {
      errors.push("trecho composto nao pode ser interpretado como animal");
    }
    if ((field === "nome" || field === "animal_ref") && ANIMAL_NAME_STOPWORDS.has(String(value || "").trim().toLowerCase())) {
      errors.push("nome de animal e stopword");
    }
    if ((field.includes("data") || field === "nascimento" || field === "horario") && invalidDateLike(value)) {
      errors.push(`${intent}.${field} invalido`);
    }
  }

  const unit = String(fields.unidade || "").trim().toLowerCase();
  const hasPhysicalQuantity = hasValue(fields.quantidade) && (!unit || PHYSICAL_UNITS.has(unit));
  if (intent === "FINANCEIRO_DESPESA" && hasPhysicalQuantity && !hasValue(fields.valor)) {
    errors.push("quantidade fisica nao pode virar despesa sem valor explicito");
  }
  if (intent === "FINANCEIRO_RECEITA" && hasPhysicalQuantity && !hasValue(fields.valor)) {
    errors.push("quantidade fisica nao pode virar receita sem valor explicito");
  }
  if (intent === "VENDA" && hasPhysicalQuantity && !hasValue(fields.valor_total)) {
    warnings.push("venda fisica sem preco deve pedir valor antes de registrar receita");
  }
}

function destructiveBulkGeminiValue(originalText: string): GeminiStructuredResult {
  return {
    intent: "ACAO_DESTRUTIVA_EM_MASSA",
    confidence: 1,
    riskScore: 1,
    fields: {
      alvo: "massa",
      blocked: true,
      motivo: "destructive_bulk_action_blocked",
      observacoes: originalText
    },
    actions: [],
    missing_fields: [],
    warnings: ["destructive_bulk_action_blocked"],
    should_confirm: false,
    response_hint: null
  };
}

function normalizeGeminiReproductionQuery(originalText: string | undefined, value: GeminiStructuredResult) {
  if (!originalText || !detectRecentBirthsQuery(originalText)) return value;
  if (!["DESCONHECIDO", "CONSULTA_ANIMAL", "CONSULTA_REGISTROS_HOJE", "RELATORIO_DIA"].includes(value.intent)) return value;

  const fields = {
    ...(value.fields || {}),
    ...recentBirthsQueryData(originalText),
    tipo: "eventos"
  };
  return {
    ...value,
    intent: "CONSULTA_REGISTROS_HOJE",
    confidence: Math.max(value.confidence || 0, 0.92),
    riskScore: Math.min(value.riskScore || 0, 0.1),
    fields,
    missing_fields: [],
    warnings: Array.from(new Set([...(value.warnings || []), "reproduction_birth_query_normalized"])),
    should_confirm: false
  };
}

function validateSingleAction(
  raw: unknown,
  path: string,
  parentIntent: string | null,
  errors: string[],
  warnings: string[]
): GeminiStructuredAction {
  const object = isPlainObject(raw) ? raw : {};
  if (!isPlainObject(raw)) errors.push(`${path} deve ser objeto`);

  const intent = normalizeGeminiIntent(String(object.intent || parentIntent || ""));
  if (!intent) errors.push(`${path}.intent inexistente ou nao permitido`);
  const schema = intent ? schemaForGeminiIntent(intent) : null;
  if (!schema) errors.push(`${path}.schema inexistente`);

  const fields = normalizedFields(object.fields, errors, `${path}.fields`);
  if (intent && schema) {
    const allowedFields = allowedFieldsForGeminiIntent(intent);
    for (const key of Object.keys(fields)) {
      if (!allowedFields.has(key)) errors.push(`${path}.fields.${key} nao existe no schema de ${intent}`);
    }
    for (const required of schema.required) {
      if (required === "actions") continue;
      if (!hasValue(fields[required])) warnings.push(`${path}.missing.${required}`);
    }
    validateFieldValues(intent, fields, errors, warnings);
  }

  if (hasDangerousString(fields)) errors.push(`${path} contem conteudo perigoso`);

  const missingFields = Array.from(new Set([
    ...normalizeMissing(object.missing_fields),
    ...warnings
      .filter((warning) => warning.startsWith(`${path}.missing.`))
      .map((warning) => warning.replace(`${path}.missing.`, ""))
  ]));

  return {
    intent,
    confidence: numberOrDefault(object.confidence, 0.8, 0, 1),
    riskScore: numberOrDefault(object.riskScore, 0, 0, 1),
    fields,
    missing_fields: missingFields,
    warnings: normalizeWarnings(object.warnings),
    should_confirm: typeof object.should_confirm === "boolean" ? object.should_confirm : geminiIntentRequiresConfirmation(intent),
    response_hint: typeof object.response_hint === "string" ? object.response_hint.slice(0, STRING_MAX) : null
  };
}

export function validateInterpretedAction(result: unknown, context: GeminiValidationContext = {}): GeminiValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (context.originalText && detectDestructiveBulkAction(context.originalText)) {
    const value = destructiveBulkGeminiValue(context.originalText);
    return {
      ok: true,
      status: "valid",
      value,
      warnings: value.warnings,
      missingFields: []
    };
  }

  if (!isPlainObject(result)) {
    return {
      ok: false,
      status: "invalid",
      reason: "invalid_schema",
      message: "Resposta do Gemini nao e um objeto JSON.",
      warnings
    };
  }

  const topIntent = normalizeGeminiIntent(String(result.intent || ""));
  if (!topIntent) errors.push("intent inexistente ou nao permitido");

  const fields = normalizedFields(result.fields, errors, "fields");
  const rawActions = Array.isArray(result.actions) ? result.actions : [];
  if (rawActions.length > MAX_ACTIONS) errors.push("actions excede limite");

  const actionWarnings: string[] = [];
  const actions = rawActions.slice(0, MAX_ACTIONS).map((action, index) => (
    validateSingleAction(action, `actions[${index}]`, null, errors, actionWarnings)
  ));
  warnings.push(...actionWarnings.filter((warning) => !/\.missing\./.test(warning)));

  if ((topIntent === "LOTE_ACOES" || topIntent === "LOTE_REGISTROS") && actions.length === 0) {
    errors.push("LOTE_ACOES precisa de actions");
  }

  if (topIntent && topIntent !== "LOTE_ACOES" && topIntent !== "LOTE_REGISTROS") {
    const topSchema = schemaForGeminiIntent(topIntent);
    if (!topSchema) errors.push("schema inexistente");
    if (topSchema) {
      const allowedFields = allowedFieldsForGeminiIntent(topIntent);
      for (const key of Object.keys(fields)) {
        if (!allowedFields.has(key)) errors.push(`fields.${key} nao existe no schema de ${topIntent}`);
      }
      for (const required of topSchema.required) {
        if (!hasValue(fields[required])) warnings.push(`missing.${required}`);
      }
      validateFieldValues(topIntent, fields, errors, warnings);
    }
  }

  if (hasDangerousString(fields) || hasDangerousString(result.response_hint)) {
    errors.push("resposta contem conteudo perigoso");
  }

  const shouldConfirm = typeof result.should_confirm === "boolean"
    ? result.should_confirm
    : geminiIntentRequiresConfirmation(topIntent);
  if (!shouldConfirm && topIntent && geminiIntentRequiresConfirmation(topIntent)) {
    warnings.push("registro sensivel sem confirmacao foi forcado para confirmacao local");
  }

  if (errors.some((error) => /perigoso|SQL|schema|token|senha/i.test(error))) {
    return {
      ok: false,
      status: "blocked",
      reason: "dangerous_response",
      message: errors.join("; "),
      warnings
    };
  }

  if (errors.length) {
    return {
      ok: false,
      status: "invalid",
      reason: "invalid_schema",
      message: errors.join("; "),
      warnings
    };
  }

  const missingFields = Array.from(new Set([
    ...normalizeMissing(result.missing_fields),
    ...warnings
      .filter((warning) => warning.startsWith("missing."))
      .map((warning) => warning.replace("missing.", ""))
  ]));

  const value: GeminiStructuredResult = normalizeGeminiReproductionQuery(context.originalText, {
    intent: topIntent,
    confidence: numberOrDefault(result.confidence, 0.8, 0, 1),
    riskScore: numberOrDefault(result.riskScore, 0, 0, 1),
    fields,
    actions,
    missing_fields: missingFields,
    warnings: Array.from(new Set([...normalizeWarnings(result.warnings), ...warnings.filter((warning) => !warning.startsWith("missing."))])),
    should_confirm: shouldConfirm || geminiIntentRequiresConfirmation(topIntent),
    response_hint: typeof result.response_hint === "string" ? result.response_hint.slice(0, STRING_MAX) : null
  });

  if (context.originalText && /(?:corrige|cancela|nao era)/i.test(context.originalText) && !["CORRECAO", "CANCELAMENTO", "DESCONHECIDO"].includes(value.intent)) {
    return {
      ok: false,
      status: "blocked",
      reason: "unsafe_correction_context",
      message: "Correcao ou cancelamento sem contexto nao pode virar registro novo.",
      warnings: value.warnings
    };
  }

  return {
    ok: true,
    status: missingFields.length ? "missing_fields" : "valid",
    value,
    warnings: value.warnings,
    missingFields
  };
}
