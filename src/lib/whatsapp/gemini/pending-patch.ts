import { getRanchTodayISO } from "@/lib/dates/ranch-time";
import type { AnyRecord } from "@/lib/types";
import { aiProviderLog, generateStructuredAI, parseJsonObjectText } from "@/lib/whatsapp/ai-provider";
import {
  findPendingPatchMockFixture,
  geminiMode,
  recordGeminiMockCall
} from "@/lib/whatsapp/gemini/runtime";
import { calfCategoryForSex, normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { refreshRanchoMessage } from "@/lib/whatsapp/nlp-core/result";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp-core/types";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

export type PendingPatch = {
  type: "pending_patch";
  targetIntent?: string;
  targetDomain?: string;
  confidence: number;
  data: AnyRecord;
  requiresConfirmation?: boolean;
  clarificationQuestion?: string | null;
  cannotApplyReason?: string | null;
};

export type PendingPatchResult =
  | { ok: true; patch: PendingPatch; model: string; rawText: string }
  | { ok: false; reason: string; message: string; rawText?: string; status?: number };

type PendingPatchInput = {
  text: string;
  pending: ParsedRanchoMessage;
  status: string;
  currentDate?: string;
  timezone?: string;
  geminiMockId?: string | null;
};

function logPendingPatch(event: string, details: Record<string, unknown>) {
  console.log("[BOT GEMINI PENDING PATCH]", { event, ...details });
}

function normalizePatchData(data: AnyRecord) {
  const normalized: AnyRecord = { ...data };
  const sex = normalizeCalfSex(
    normalized.child_sex
    ?? normalized.cria_sexo
    ?? normalized.sexo_cria
    ?? normalized.sexo
  );
  if (sex) normalized.child_sex = sex;
  if (normalized.child_code === undefined && normalized.cria_codigo !== undefined) normalized.child_code = normalized.cria_codigo;
  if (normalized.child_name === undefined && normalized.cria_nome !== undefined) normalized.child_name = normalized.cria_nome;
  if (normalized.father_ref === undefined && normalized.pai_ref !== undefined) normalized.father_ref = normalized.pai_ref;
  if (normalized.birth_date === undefined && normalized.data_referencia !== undefined) normalized.birth_date = normalized.data_referencia;
  return normalized;
}

export function validatePendingPatch(value: unknown, pending: ParsedRanchoMessage): PendingPatchResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid_schema", message: "PendingPatch precisa ser um objeto JSON." };
  }
  const record = value as AnyRecord;
  if (record.type !== "pending_patch") {
    return { ok: false, reason: "invalid_type", message: "Resposta nao e PendingPatch." };
  }
  const targetIntent = String(record.targetIntent || pending.tipo || "").trim().toUpperCase();
  if (targetIntent && targetIntent !== pending.tipo) {
    return { ok: false, reason: "target_intent_mismatch", message: "Patch nao corresponde a acao pendente." };
  }
  const data = normalizePatchData((record.data && typeof record.data === "object" && !Array.isArray(record.data)) ?record.data as AnyRecord : {});
  if (data.child_sex && !normalizeCalfSex(data.child_sex)) {
    return { ok: false, reason: "invalid_child_sex", message: "Sexo da cria invalido no patch." };
  }
  const confidence = Number(record.confidence ?? 0);
  return {
    ok: true,
    model: "validated",
    rawText: JSON.stringify(value),
    patch: {
      type: "pending_patch",
      targetIntent: pending.tipo,
      targetDomain: record.targetDomain ?String(record.targetDomain) : undefined,
      confidence: Number.isFinite(confidence) ? confidence : 0,
      data,
      requiresConfirmation: record.requiresConfirmation !== false,
      clarificationQuestion: typeof record.clarificationQuestion === "string" ? record.clarificationQuestion : null,
      cannotApplyReason: typeof record.cannotApplyReason === "string" ? record.cannotApplyReason : null
    }
  };
}

function buildPendingPatchPrompt(input: PendingPatchInput) {
  const dados = input.pending.dados || {};
  return [
    "Voce interpreta uma resposta do usuario para uma acao pendente do bot Rancho.",
    "Retorne somente JSON. Nao retorne markdown. Nao retorne ActionPlan. Nao salve nada.",
    "Contrato obrigatorio: PendingPatch.",
    "",
    "Formato:",
    JSON.stringify({
      type: "pending_patch",
      targetIntent: input.pending.tipo,
      confidence: 0.9,
      data: {
        confirm_child: true,
        child_sex: "femea",
        child_code: "c-140",
        child_name: null,
        father_ref: "t-50",
        birth_date: null,
        notes: null
      },
      requiresConfirmation: true
    }, null, 2),
    "",
    "Normalizacoes para PARTO:",
    "- femea, f, feminino, bezerra => child_sex=femea",
    "- macho, m, masculino, bezerro => child_sex=macho",
    "- codigo, brinco, cod => child_code",
    "- pai, touro, reprodutor => father_ref",
    "- nao quero cadastrar cria, sem cria => confirm_child=false",
    "- nao invente pai, sexo, codigo, data ou nome.",
    "",
    `Status da sessao: ${input.status}`,
    `Acao pendente: ${input.pending.tipo}`,
    `Dados conhecidos: ${JSON.stringify(dados)}`,
    `Campos faltantes: ${JSON.stringify(input.pending.perguntas_faltantes || [])}`,
    `Data atual do rancho: ${input.currentDate || getRanchTodayISO()}`,
    `Data atual: ${input.currentDate || getRanchTodayISO()}`,
    `Timezone: ${input.timezone || "America/Sao_Paulo"}`,
    "",
    "Exemplos:",
    "Usuario: sim.\nsexo:femea\ncodigo:c-140\npai:t-50",
    JSON.stringify({ type: "pending_patch", targetIntent: "PARTO", confidence: 0.94, data: { confirm_child: true, child_sex: "femea", child_code: "c-140", father_ref: "t-50" }, requiresConfirmation: true }),
    "Usuario: nao quero cadastrar cria",
    JSON.stringify({ type: "pending_patch", targetIntent: "PARTO", confidence: 0.92, data: { confirm_child: false }, requiresConfirmation: true }),
    "Usuario: e femea, codigo C-00691",
    JSON.stringify({ type: "pending_patch", targetIntent: "PARTO", confidence: 0.92, data: { confirm_child: true, child_sex: "femea", child_code: "C-00691" }, requiresConfirmation: true }),
    "",
    `Usuario: ${input.text}`
  ].join("\n");
}

export async function interpretPendingPatchWithGemini(input: PendingPatchInput): Promise<PendingPatchResult> {
  logPendingPatch("pending_patch_gemini_request", {
    targetIntent: input.pending.tipo,
    status: input.status,
    messageLength: input.text.length
  });

  if (geminiMode() === "mock") {
    const fixture = findPendingPatchMockFixture({
      text: input.text,
      geminiMockId: input.geminiMockId,
      targetIntent: input.pending.tipo
    });
    if (!fixture) {
      recordGeminiMockCall("pending-patch-fixture-not-found");
      return { ok: false, reason: "mock_fixture_not_found", message: "Fixture PendingPatch nao encontrada." };
    }
    recordGeminiMockCall(fixture.id);
    const validation = validatePendingPatch(fixture.response, input.pending);
    if (!validation.ok) return validation;
    logPendingPatch("pending_patch_success", {
      targetIntent: input.pending.tipo,
      confidence: validation.patch.confidence,
      fields: Object.keys(validation.patch.data || {})
    });
    return { ...validation, model: `mock:${fixture.id}` };
  }

  try {
    const generated = await generateStructuredAI({
      purpose: "pending_patch",
      userPrompt: buildPendingPatchPrompt(input),
      temperature: 0.1,
      requestId: input.geminiMockId || undefined
    });

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
    const parsed = parseJsonObjectText(rawText);
    const validation = validatePendingPatch(parsed, input.pending);
    if (!validation.ok) {
      aiProviderLog("ai_provider_contract_error", {
        provider: generated.provider,
        model: generated.model,
        purpose: "pending_patch",
        requestId: input.geminiMockId || null,
        reason: validation.reason
      });
      return { ...validation, rawText };
    }
    logPendingPatch("pending_patch_success", {
      provider: generated.provider,
      model: generated.model,
      targetIntent: input.pending.tipo,
      confidence: validation.patch.confidence,
      fields: Object.keys(validation.patch.data || {})
    });
    return { ...validation, model: generated.model, rawText };
  } catch (error) {
    return { ok: false, reason: error instanceof Error && error.name === "AbortError" ? "timeout" : "network_error", message: error instanceof Error ? error.message : String(error) };
  }
}

export function applyPendingPatchToSession(pending: ParsedRanchoMessage, patch: PendingPatch) {
  const data = patch.data || {};
  const dados: AnyRecord = { ...(pending.dados || {}) };
  if (pending.tipo !== "PARTO") return pending;

  if (data.confirm_child === false) {
    dados.parto_cria_decisao_pendente = undefined;
    dados.parto_sem_cadastro_cria = true;
    dados.parto_cria_cadastro = undefined;
  } else if (data.confirm_child === true || data.child_sex || data.child_code || data.child_name || data.father_ref) {
    dados.parto_cria_decisao_pendente = undefined;
    dados.parto_sem_cadastro_cria = undefined;
    dados.parto_cria_cadastro = true;
  }

  const sex = normalizeCalfSex(data.child_sex);
  if (sex) {
    dados.cria_sexo = sex;
    dados.cria_categoria = calfCategoryForSex(sex);
  }
  if (data.child_code !== undefined && String(data.child_code).trim()) dados.cria_codigo = String(data.child_code).trim();
  if (data.child_name !== undefined && String(data.child_name).trim()) dados.cria_nome = String(data.child_name).trim();
  if (data.father_ref !== undefined && String(data.father_ref).trim()) {
    dados.pai_ref = String(data.father_ref).trim();
    dados.pai_nome = String(data.father_ref).trim();
    dados.pai_nao_informado = undefined;
    dados.precisa_pai_ref = undefined;
  }
  if (data.birth_date !== undefined && String(data.birth_date).trim()) dados.data_referencia = String(data.birth_date).trim();
  if (data.notes !== undefined && String(data.notes).trim()) dados.cria_observacoes = String(data.notes).trim();

  return refreshRanchoMessage(pending, dados);
}

export function shouldUsePendingPatchForText(text: string) {
  const command = normalizeRanchoText(text);
  if (/^(?:1|sim|s|ss|confirmar|confirma|confirmado|ok|cancelar|cancela|menu|ajuda|nao|n)$/.test(command)) return false;
  return command.length > 1;
}
