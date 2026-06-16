import { botTestVerbose, configuredGeminiModel } from "@/lib/whatsapp/gemini/config";
import type { StructuredParsedTable, StructuredTableDomain, StructuredTablePlan } from "@/lib/whatsapp/nlp-core/structured-table";

type GeminiApiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string; status?: string };
};

type GeminiTableClassifierInput = {
  text: string;
  table: StructuredParsedTable;
};

type GeminiTableClassifierResult =
  | { ok: true; plan: StructuredTablePlan; sampleRowCount: number; model: string }
  | { ok: false; reason: string; message?: string };

type TableClassifierMockGlobal = typeof globalThis & {
  __RANCHO_GEMINI_TABLE_CLASSIFIER_MOCK__?: (input: GeminiTableClassifierInput) => unknown | Promise<unknown>;
};

const ALLOWED_TABLE_TYPES: StructuredTableDomain[] = [
  "REPRODUCAO_EVENTOS",
  "PRODUCAO_LEITE",
  "ESTOQUE_MOVIMENTACAO",
  "FINANCEIRO",
  "CADASTRO_ANIMAL",
  "CADASTRO_FUNCIONARIO",
  "SAUDE_ANIMAL",
  "OBSERVACAO_ANIMAL",
  "PONTO_FUNCIONARIO",
  "DESCONHECIDO"
];

const MAX_SAMPLE_ROWS = 8;
const GEMINI_TIMEOUT_MS = 8000;

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

function textFromGeminiResponse(data: GeminiApiResponse) {
  return (data.candidates || [])
    .flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || "")
    .join("\n")
    .trim();
}

function validatePlan(value: unknown, table: StructuredParsedTable): StructuredTablePlan | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (Array.isArray(candidate.records) || Array.isArray(candidate.linhas) || Array.isArray(candidate.rows)) return null;

  const tableType = String(candidate.tableType || candidate.domain || "");
  if (!ALLOWED_TABLE_TYPES.includes(tableType as StructuredTableDomain)) return null;

  const rawMapping = candidate.columnMapping;
  if (!rawMapping || typeof rawMapping !== "object" || Array.isArray(rawMapping)) return null;
  const maxWidth = Math.max(...table.rows.map((row) => row.cells.length), table.headers.length, 0);
  const columnMapping = Object.entries(rawMapping as Record<string, unknown>).reduce<Record<string, number>>((mapping, [field, index]) => {
    const numericIndex = typeof index === "number" ? index : Number(index);
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < maxWidth) mapping[field] = numericIndex;
    return mapping;
  }, {});

  return {
    tableType: tableType as StructuredTableDomain,
    confidence: typeof candidate.confidence === "number" ? Math.max(0, Math.min(1, candidate.confidence)) : 0.75,
    columnMapping,
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings.map(String) : [],
    needsUserClarification: candidate.needsUserClarification === true,
    source: "gemini"
  };
}

function buildPrompt(input: GeminiTableClassifierInput, sampleRows: string[][]) {
  return [
    "Classifique uma tabela/lista do sistema Rancho.",
    "Voce deve devolver SOMENTE um JSON com: tableType, confidence, columnMapping, warnings, needsUserClarification.",
    "Nao devolva todos os registros linha por linha. O backend aplicara o columnMapping em todas as linhas.",
    `Dominios permitidos: ${ALLOWED_TABLE_TYPES.join(", ")}.`,
    "Campos genericos: animal_ref, event_type, date, observations, item, quantity, unit, movement_type, value, name, category, sex, breed, lot, status, weight, birth_date, description, employee.",
    "Se o dominio for desconhecido, use tableType DESCONHECIDO e needsUserClarification true.",
    "Se algum valor parecer ambiguo, apenas sinalize em warnings; nao invente.",
    JSON.stringify({
      structureType: input.table.detection.structureType,
      separator: input.table.detection.separator,
      hasHeader: input.table.detection.hasHeader,
      rowCount: input.table.rows.length,
      headers: input.table.headers,
      sampleRows
    })
  ].join("\n");
}

export async function classifyTableWithGemini(input: GeminiTableClassifierInput): Promise<GeminiTableClassifierResult> {
  const sampleRows = input.table.rows.slice(0, MAX_SAMPLE_ROWS).map((row) => row.cells);
  const globalMock = (globalThis as TableClassifierMockGlobal).__RANCHO_GEMINI_TABLE_CLASSIFIER_MOCK__;
  if (globalMock) {
    const plan = validatePlan(await globalMock(input), input.table);
    if (!plan) return { ok: false, reason: "invalid_mock_plan" };
    return { ok: true, plan, sampleRowCount: sampleRows.length, model: "mock" };
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = configuredGeminiModel();
  if (!apiKey) return { ok: false, reason: "missing_api_key" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const modelPath = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelPath)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    console.log("[BOT TABLE CLASSIFIER]", {
      event: "request",
      model,
      structureType: input.table.detection.structureType,
      separator: input.table.detection.separator,
      hasHeader: input.table.detection.hasHeader,
      rowCount: input.table.rows.length,
      sampleRowCount: sampleRows.length
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(input, sampleRows) }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" }
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({})) as GeminiApiResponse;
    if (!response.ok) return { ok: false, reason: "api_error", message: data.error?.message };
    const rawText = textFromGeminiResponse(data);
    const plan = validatePlan(parseJsonObject(rawText), input.table);
    if (!plan) return { ok: false, reason: "invalid_schema" };
    if (botTestVerbose()) console.log("[BOT TABLE CLASSIFIER]", { event: "plan", plan, sampleRows });
    return { ok: true, plan, sampleRowCount: sampleRows.length, model };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "api_error" };
  } finally {
    clearTimeout(timeout);
  }
}
