import type { AnyRecord } from "@/lib/types";
import type { GeminiTableDomain } from "@/lib/whatsapp/nlp-core/tabular-domain-router";

export type GeminiStructuredAction = {
  intent: string;
  confidence?: number;
  riskScore?: number;
  fields?: AnyRecord;
  missing_fields?: string[];
  warnings?: string[];
  should_confirm?: boolean;
  response_hint?: string | null;
};

export type GeminiStructuredResult = {
  intent: string;
  confidence: number;
  riskScore: number;
  fields: AnyRecord;
  actions: GeminiStructuredAction[];
  missing_fields: string[];
  warnings: string[];
  should_confirm: boolean;
  response_hint: string | null;
  table_import?: {
    domain: GeminiTableDomain;
    confidence: number;
    column_mapping: Record<string, string>;
    normalized_rows: AnyRecord[];
    unknown_columns: string[];
    warnings: string[];
    errors: string[];
    ambiguous_domains?: GeminiTableDomain[];
    needs_manual_choice: boolean;
  } | null;
};

export type GeminiInterpreterInput = {
  text: string;
  session?: AnyRecord | null;
  user?: AnyRecord | null;
  rancho?: AnyRecord | null;
  currentDate?: string;
  timezone?: string;
  catalogs?: AnyRecord;
  allowedIntents?: string[];
  schemas?: AnyRecord;
  geminiMockId?: string | null;
};

export type GeminiInterpreterFailureReason =
  | "missing_api_key"
  | "timeout"
  | "rate_limit"
  | "network_error"
  | "api_error"
  | "empty_response"
  | "invalid_json"
  | "invalid_schema"
  | "dangerous_response";

export type GeminiInterpreterResult =
  | {
      ok: true;
      interpretation: GeminiStructuredResult;
      model: string;
      rawText: string;
      validationStatus: "valid" | "missing_fields";
    }
  | {
      ok: false;
      reason: GeminiInterpreterFailureReason;
      message: string;
      status?: number;
      rawText?: string;
    };

