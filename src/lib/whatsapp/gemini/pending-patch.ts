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
  operation?: "update" | "cancel" | "finish_optional" | "clarify" | "none";
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
  if (normalized.quantity !== undefined && normalized.quantidade === undefined) normalized.quantidade = normalized.quantity;
  if (normalized.amount !== undefined && normalized.valor === undefined) normalized.valor = normalized.amount;
  if (normalized.value !== undefined && normalized.valor === undefined) normalized.valor = normalized.value;
  if (normalized.total !== undefined && normalized.valor === undefined) normalized.valor = normalized.total;
  if (normalized.stock_item !== undefined && normalized.item_nome === undefined) normalized.item_nome = normalized.stock_item;
  if (normalized.item !== undefined && normalized.item_nome === undefined) normalized.item_nome = normalized.item;
  if (normalized.produto !== undefined && normalized.item_nome === undefined) normalized.item_nome = normalized.produto;
  if (normalized.product !== undefined && normalized.item_nome === undefined) normalized.item_nome = normalized.product;
  if (normalized.lote !== undefined && normalized.lote_nome === undefined) normalized.lote_nome = normalized.lote;
  if (normalized.lot !== undefined && normalized.lote_nome === undefined) normalized.lote_nome = normalized.lot;
  if (normalized.animal !== undefined && normalized.animal_codigo === undefined) normalized.animal_codigo = normalized.animal;
  if (normalized.animal_ref !== undefined && normalized.animal_codigo === undefined) normalized.animal_codigo = normalized.animal_ref;
  if (normalized.notes !== undefined && normalized.observacoes === undefined) normalized.observacoes = normalized.notes;
  if (normalized.note !== undefined && normalized.observacoes === undefined) normalized.observacoes = normalized.note;
  if (normalized.date !== undefined && normalized.data_referencia === undefined) normalized.data_referencia = normalized.date;
  if (normalized.birth_date === undefined && normalized.data_referencia !== undefined) normalized.birth_date = normalized.data_referencia;
  if (normalized.field !== undefined && normalized.campo_alterado === undefined) normalized.campo_alterado = normalized.field;
  if (normalized.correct_field !== undefined && normalized.campo_alterado === undefined) normalized.campo_alterado = normalized.correct_field;
  if (normalized.correct_value !== undefined && normalized.novo_valor === undefined) normalized.novo_valor = normalized.correct_value;
  if (normalized.valor_correto !== undefined && normalized.novo_valor === undefined) normalized.novo_valor = normalized.valor_correto;
  if (normalized.new_value !== undefined && normalized.novo_valor === undefined) normalized.novo_valor = normalized.new_value;
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
  if (normalized.father_unknown === undefined && normalized.sem_pai !== undefined) normalized.father_unknown = normalized.sem_pai;
  if (normalized.father_unknown === undefined && normalized.pai_nao_informado !== undefined) normalized.father_unknown = normalized.pai_nao_informado;
  if (normalized.skip_optional_fields === undefined && normalized.finish_optional !== undefined) normalized.skip_optional_fields = normalized.finish_optional;
  if (normalized.skip_optional_fields === undefined && normalized.concluir !== undefined) normalized.skip_optional_fields = normalized.concluir;
  if (normalized.cancel_current === undefined && normalized.cancelar !== undefined) normalized.cancel_current = normalized.cancelar;
  return normalized;
}

function normalizePatchOperation(value: unknown, data: AnyRecord): PendingPatch["operation"] {
  const operation = String(value || "").trim();
  if (["update", "cancel", "finish_optional", "clarify", "none"].includes(operation)) {
    return operation as PendingPatch["operation"];
  }
  if (data.cancel_current === true) return "cancel";
  if (data.skip_optional_fields === true) return "finish_optional";
  return "update";
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
      operation: normalizePatchOperation(record.operation, data),
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
    "A IA apenas interpreta; o backend valida permissao, campos, catalogos e confirmacao antes de salvar.",
    "Contrato obrigatorio: PendingPatch.",
    "",
    "Formato:",
    JSON.stringify({
      type: "pending_patch",
      operation: "update",
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
    "Operacoes permitidas:",
    "- update: corrigir ou completar dados da acao pendente.",
    "- cancel: usuario quer cancelar/nao cadastrar/nao salvar a acao pendente.",
    "- finish_optional: usuario nao quer informar mais campos opcionais e quer ir para confirmacao.",
    "- clarify: usuario falou da acao pendente, mas faltou contexto seguro.",
    "- none: mensagem nao relacionada a acao pendente.",
    "",
    "Campos genericos aceitos quando fizerem sentido para a acao pendente:",
    "- animal_codigo, item_nome, quantidade, unidade, valor, litros, data_referencia, observacoes.",
    "- lote_nome, nome, categoria, sexo, peso, fase, raca, data_nascimento.",
    "- campo_alterado e novo_valor para atualizacao de cadastro.",
    "- funcionario_nome, telefone, funcao, cpf, salario_base, horario, ponto_tipo.",
    "- produto, dose, custo, motivo, descricao, forma_pagamento.",
    "",
    "Normalizacoes para PARTO:",
    "- femea, f, feminino, bezerra => child_sex=femea",
    "- macho, m, masculino, bezerro => child_sex=macho",
    "- codigo, brinco, cod => child_code",
    "- pai, touro, reprodutor => father_ref",
    "- sem pai, pai nao informado, pode deixar sem pai => father_unknown=true",
    "- nao quero cadastrar cria, sem cria => confirm_child=false",
    "- nao invente pai, sexo, codigo, data ou nome.",
    "",
    "Regras:",
    "- Se o usuario disser que nao quer cadastrar/salvar esse registro, operation=cancel.",
    "- Se disser que nao quer informar mais nada e so faltam opcionais, operation=finish_optional.",
    "- Se disser 'nao, a quantidade era 12', use data.quantidade=12.",
    "- Se disser 'troca o lote para Lactacao', use lote_nome='Lactacao' e, para atualizacao de animal, campo_alterado='lote_id' e novo_valor='Lactacao'.",
    "- Se disser 'esse item e sal mineral, nao racao', use item_nome='sal mineral'.",
    "- Nunca invente valor ausente. Se nao souber o animal/item/linha/campo, operation=clarify.",
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
    JSON.stringify({ type: "pending_patch", operation: "update", targetIntent: "PARTO", confidence: 0.94, data: { confirm_child: true, child_sex: "femea", child_code: "c-140", father_ref: "t-50" }, requiresConfirmation: true }),
    "Usuario: nao quero cadastrar cria",
    JSON.stringify({ type: "pending_patch", operation: "update", targetIntent: "PARTO", confidence: 0.92, data: { confirm_child: false }, requiresConfirmation: true }),
    "Usuario: e femea, codigo C-00691",
    JSON.stringify({ type: "pending_patch", operation: "update", targetIntent: "PARTO", confidence: 0.92, data: { confirm_child: true, child_sex: "femea", child_code: "C-00691" }, requiresConfirmation: true }),
    "Usuario: pode deixar sem pai",
    JSON.stringify({ type: "pending_patch", operation: "update", targetIntent: "PARTO", confidence: 0.92, data: { father_unknown: true }, requiresConfirmation: true }),
    "Usuario: nao quero informar mais nada",
    JSON.stringify({ type: "pending_patch", operation: "finish_optional", targetIntent: input.pending.tipo, confidence: 0.9, data: { skip_optional_fields: true }, requiresConfirmation: true }),
    "Usuario: nao cadastra esse animal",
    JSON.stringify({ type: "pending_patch", operation: "cancel", targetIntent: input.pending.tipo, confidence: 0.93, data: { cancel_current: true }, requiresConfirmation: false }),
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

function hasText(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

function textValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function truthyPatchValue(value: unknown) {
  if (value === true) return true;
  const normalized = normalizeRanchoText(String(value ?? ""));
  return /^(?:true|sim|s|1|yes|y|sem pai|pai nao informado|nao informado)$/.test(normalized);
}

function copyText(data: AnyRecord, dados: AnyRecord, from: string, to = from) {
  const value = textValue(data[from]);
  if (value !== undefined) dados[to] = value;
}

function copyNumber(data: AnyRecord, dados: AnyRecord, from: string, to = from) {
  const value = numberValue(data[from]);
  if (value !== undefined) dados[to] = value;
}

function copyBoolean(data: AnyRecord, dados: AnyRecord, from: string, to = from) {
  if (data[from] === undefined) return;
  dados[to] = truthyPatchValue(data[from]);
}

function applyCommonPatchFields(dados: AnyRecord, data: AnyRecord) {
  copyText(data, dados, "animal_codigo");
  copyText(data, dados, "data_referencia");
  copyText(data, dados, "observacoes");
}

function updateAnimalFieldFromPatch(dados: AnyRecord, data: AnyRecord) {
  const explicitField = textValue(data.campo_alterado);
  const explicitValue = data.novo_valor !== undefined ? data.novo_valor : undefined;
  if (explicitField && explicitValue !== undefined && hasText(explicitValue)) {
    dados.campo_alterado = explicitField;
    dados.novo_valor = String(explicitValue).trim();
    return;
  }

  const candidates: Array<[string, unknown, string]> = [
    ["lote_id", data.lote_nome, "lote_nome"],
    ["peso", data.peso, "peso"],
    ["fase", data.fase, "fase"],
    ["status", data.status, "status"],
    ["nome", data.nome, "nome"],
    ["raca", data.raca, "raca"],
    ["data_nascimento", data.data_nascimento, "data_nascimento"],
    ["observacoes", data.observacoes, "observacoes"]
  ];
  const found = candidates.find(([, value]) => hasText(value));
  if (!found) return;
  const [field, value, sourceKey] = found;
  dados.campo_alterado = field;
  dados.novo_valor = String(value).trim();
  if (sourceKey === "lote_nome") dados.lote_nome = String(value).trim();
}

export function applyPendingPatchToSession(pending: ParsedRanchoMessage, patch: PendingPatch) {
  const data = patch.data || {};
  const dados: AnyRecord = { ...(pending.dados || {}) };
  const intent = pending.tipo;

  applyCommonPatchFields(dados, data);

  if (intent === "PARTO") {
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
    if (truthyPatchValue(data.father_unknown)) {
      dados.pai_ref = undefined;
      dados.pai_nome = undefined;
      dados.pai_id = undefined;
      dados.pai_nao_informado = true;
      dados.precisa_pai_ref = undefined;
    } else if (data.father_ref !== undefined && String(data.father_ref).trim()) {
      dados.pai_ref = String(data.father_ref).trim();
      dados.pai_nome = String(data.father_ref).trim();
      dados.pai_nao_informado = undefined;
      dados.precisa_pai_ref = undefined;
    }
    if (data.birth_date !== undefined && String(data.birth_date).trim()) dados.data_referencia = String(data.birth_date).trim();
    if (data.notes !== undefined && String(data.notes).trim()) dados.cria_observacoes = String(data.notes).trim();
  }

  if (intent === "PRODUCAO_LEITE") {
    copyNumber(data, dados, "litros");
    copyText(data, dados, "turno");
    copyText(data, dados, "destino_leite");
    copyBoolean(data, dados, "adicionar_ao_estoque");
  }

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(intent)) {
    copyText(data, dados, "item_nome");
    copyNumber(data, dados, "quantidade");
    copyText(data, dados, "unidade");
    copyNumber(data, dados, "valor");
    copyNumber(data, dados, "valor_unitario");
    copyNumber(data, dados, "quantidade_minima");
    copyText(data, dados, "categoria");
    copyText(data, dados, "fornecedor");
    copyBoolean(data, dados, "sem_financeiro");
  }

  if (intent === "CADASTRO_ANIMAL") {
    copyText(data, dados, "animal_codigo");
    copyText(data, dados, "nome");
    copyText(data, dados, "categoria");
    copyText(data, dados, "sexo");
    copyNumber(data, dados, "peso");
    copyText(data, dados, "fase");
    copyText(data, dados, "raca");
    copyText(data, dados, "lote_nome");
    copyText(data, dados, "data_nascimento");
    copyText(data, dados, "mae_nome");
    copyText(data, dados, "pai_nome");
  }

  if (intent === "ATUALIZACAO_ANIMAL") {
    copyText(data, dados, "animal_codigo");
    updateAnimalFieldFromPatch(dados, data);
  }

  if (intent === "ATUALIZACAO_GENEALOGIA") {
    copyText(data, dados, "animal_codigo");
    copyText(data, dados, "mae_nome");
    copyText(data, dados, "pai_nome");
    if (truthyPatchValue(data.remover_pai)) dados.remover_pai = true;
    if (truthyPatchValue(data.remover_mae)) dados.remover_mae = true;
  }

  if (["VACINA_MEDICAMENTO", "SAUDE_ANIMAL", "MORTE"].includes(intent)) {
    copyText(data, dados, "produto");
    copyText(data, dados, "dose");
    copyNumber(data, dados, "custo");
    copyText(data, dados, "motivo");
    copyText(data, dados, "descricao_generica");
    copyText(data, dados, "sintomas");
    copyText(data, dados, "gravidade");
  }

  if (["DESPESA", "RECEITA_VENDA"].includes(intent)) {
    copyNumber(data, dados, "valor");
    copyText(data, dados, "descricao");
    copyText(data, dados, "categoria");
    copyText(data, dados, "forma_pagamento");
  }

  if (intent === "CRIAR_LOTE") {
    copyText(data, dados, "lote_nome");
    copyNumber(data, dados, "capacidade");
    copyText(data, dados, "descricao");
  }

  if (["CRIAR_FUNCIONARIO", "ATUALIZAR_FUNCIONARIO", "PAGAMENTO_FUNCIONARIO", "PONTO_FUNCIONARIO"].includes(intent)) {
    copyText(data, dados, "funcionario_nome");
    copyText(data, dados, "telefone");
    copyText(data, dados, "funcao");
    copyText(data, dados, "cpf");
    copyNumber(data, dados, "salario_base");
    copyNumber(data, dados, "valor");
    copyText(data, dados, "pagamento_tipo");
    copyText(data, dados, "periodo_pagamento");
    copyText(data, dados, "ponto_tipo");
    copyText(data, dados, "horario");
    if (intent === "ATUALIZAR_FUNCIONARIO") {
      if (textValue(data.campo_alterado)) dados.campo_alterado = textValue(data.campo_alterado);
      if (hasText(data.novo_valor)) dados.novo_valor = String(data.novo_valor).trim();
    }
  }

  return refreshRanchoMessage(pending, dados);
}

export function shouldUsePendingPatchForText(text: string) {
  const command = normalizeRanchoText(text);
  if (/^(?:1|sim|s|ss|confirmar|confirma|confirmado|ok|cancelar|cancela|menu|ajuda|nao|n)$/.test(command)) return false;
  return command.length > 1;
}
