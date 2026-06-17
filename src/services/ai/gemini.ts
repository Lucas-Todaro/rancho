import {
  geminiMode as geminiRuntimeMode,
  liveGeminiBlockedResult,
  recordGeminiLiveCall,
  recordGeminiMockCall,
  shouldBlockGeminiLiveCall
} from "@/lib/whatsapp/gemini/runtime";

type GeminiFailureReason =
  | "missing_api_key"
  | "timeout"
  | "rate_limit"
  | "network_error"
  | "api_error"
  | "empty_response"
  | "invalid_json"
  | "invalid_schema"
  | "dangerous_response";

export type GeminiAction = {
  type: string;
  operation: string;
  entity: string | null;
  quantity: number | null;
  unit: string | null;
  date: string | null;
  notes: string | null;
  rawText: string;
};

export type GeminiInterpretation = {
  confidence: number;
  requiresConfirmation: boolean;
  reason: string;
  reasoning_short?: string;
  risk_flags?: string[];
  alternative_intents?: string[];
  actions: GeminiAction[];
  userResponse: string;
};

export type GeminiFarmContext = {
  channel: "whatsapp";
  userRole: string;
};

export type GeminiInterpretationResult =
  | {
      ok: true;
      interpretation: GeminiInterpretation;
      model: string;
      rawText: string;
    }
  | {
      ok: false;
      reason: GeminiFailureReason;
      message: string;
      status?: number;
    };

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

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_FALLBACK_CONFIDENCE = 0.7;
const GEMINI_TIMEOUT_MS = 8000;
const MAX_ACTIONS = 8;
const MAX_TEXT_LENGTH = 500;

export const GEMINI_ACTION_TYPES = [
  "PRODUCAO_LEITE",
  "PARTO",
  "VACINA_MEDICAMENTO",
  "MORTE",
  "DESPESA",
  "RECEITA_VENDA",
  "CRIAR_ITEM_ESTOQUE",
  "ESTOQUE_CADASTRO",
  "ESTOQUE_ENTRADA",
  "ESTOQUE_SAIDA",
  "CRIAR_FUNCIONARIO",
  "ATUALIZAR_FUNCIONARIO",
  "DESLIGAR_FUNCIONARIO",
  "EXCLUIR_FUNCIONARIO",
  "PONTO_FUNCIONARIO",
  "CADASTRO_ANIMAL",
  "EXCLUIR_REBANHO",
  "ACAO_DESTRUTIVA_EM_MASSA",
  "ATUALIZACAO_GENEALOGIA",
  "CONSULTA_GENEALOGIA",
  "ATUALIZACAO_ANIMAL",
  "CONSULTA_ANIMAL",
  "CRIAR_LOTE",
  "CONSULTA_REBANHO",
  "CONSULTA_LOTES",
  "CONSULTA_PRODUCAO",
  "CONSULTA_PRODUCAO_HOJE",
  "CONSULTA_PRODUCAO_ANIMAL",
  "CONSULTA_FINANCEIRO",
  "CONSULTA_ESTOQUE",
  "CONSULTA_ESTOQUE_ITEM",
  "CONSULTA_ESTOQUE_GERAL",
  "CONSULTA_FUNCIONARIO",
  "CONSULTA_PONTO",
  "CONSULTA_REGISTROS_HOJE",
  "ORDEM_SERVICO",
  "AJUDA"
] as const;

const GEMINI_CONSULTATION_ACTION_TYPES = new Set<string>([
  "CONSULTA_GENEALOGIA",
  "CONSULTA_ANIMAL",
  "CONSULTA_REBANHO",
  "CONSULTA_LOTES",
  "CONSULTA_PRODUCAO",
  "CONSULTA_PRODUCAO_HOJE",
  "CONSULTA_PRODUCAO_ANIMAL",
  "CONSULTA_FINANCEIRO",
  "CONSULTA_ESTOQUE",
  "CONSULTA_ESTOQUE_ITEM",
  "CONSULTA_ESTOQUE_GERAL",
  "CONSULTA_FUNCIONARIO",
  "CONSULTA_PONTO",
  "CONSULTA_REGISTROS_HOJE",
  "AJUDA"
]);

const GEMINI_OPERATIONS = [
  "register",
  "create",
  "add",
  "remove",
  "update",
  "delete",
  "deactivate",
  "query",
  "report",
  "clock_in",
  "clock_out",
  "help"
] as const;

const ACTION_DESCRIPTIONS = [
  "PRODUCAO_LEITE: registrar litros de leite de um animal",
  "PARTO: registrar parto; se houver cria informada, notes pode conter cria_sexo, cria_codigo, cria_nome e pai_ref, sempre com confirmacao e validacao local",
  "VACINA_MEDICAMENTO: registrar vacina, medicamento ou tratamento",
  "MORTE: registrar morte de animal",
  "DESPESA: registrar gasto, compra paga ou saida financeira",
  "RECEITA_VENDA: registrar entrada financeira ou venda",
  "CRIAR_ITEM_ESTOQUE/ESTOQUE_CADASTRO: criar item de estoque",
  "ESTOQUE_ENTRADA: adicionar quantidade ao estoque",
  "ESTOQUE_SAIDA: dar baixa/remover quantidade do estoque",
  "CRIAR_FUNCIONARIO/ATUALIZAR_FUNCIONARIO/DESLIGAR_FUNCIONARIO/EXCLUIR_FUNCIONARIO: administrar funcionarios",
  "PONTO_FUNCIONARIO: registrar entrada ou saida de ponto",
  "CADASTRO_ANIMAL/ATUALIZACAO_ANIMAL: cadastrar ou alterar animais",
  "ACAO_DESTRUTIVA_EM_MASSA: comandos para excluir/deletar/apagar/remover/limpar/zerar todo o rebanho, todas as vacas, todos os animais, gado, fazenda ou todos os dados; deve ser bloqueada pelo backend e nao exige confirmacao",
  "ATUALIZACAO_GENEALOGIA/CONSULTA_GENEALOGIA: alterar ou consultar genealogia",
  "CRIAR_LOTE/CONSULTA_LOTES: criar ou consultar lotes",
  "CONSULTA_ANIMAL: consultar dados de um animal especifico somente quando houver codigo/brinco/nome claro",
  "CONSULTA_REBANHO: listar ou resumir animais/rebanho; use para minhas vacas, meus animais, lista de vacas, dados das vacas, vacas cadastradas, gado ou rebanho",
  "CONSULTA_PRODUCAO/CONSULTA_PRODUCAO_HOJE/CONSULTA_PRODUCAO_ANIMAL: consultar producao",
  "CONSULTA_FINANCEIRO: consultar financeiro",
  "CONSULTA_ESTOQUE/CONSULTA_ESTOQUE_ITEM/CONSULTA_ESTOQUE_GERAL: consultar estoque",
  "CONSULTA_FUNCIONARIO/CONSULTA_PONTO: consultar funcionarios ou ponto",
  "CONSULTA_REGISTROS_HOJE: resumo, fechamento, relatorio do dia ou registros recentes",
  "ORDEM_SERVICO: registrar tarefa/ordem de servico",
  "AJUDA: pedido de ajuda/menu"
];

const DANGEROUS_TEXT_PATTERN = /\b(?:drop\s+table|truncate|alter\s+table|delete\s+from|insert\s+into|update\s+\w+\s+set|schema|supabase|api[_-]?key|senha|password|token)\b/i;

export function geminiFallbackConfidence() {
  const raw = Number(process.env.GEMINI_FALLBACK_CONFIDENCE || DEFAULT_FALLBACK_CONFIDENCE);
  if (!Number.isFinite(raw)) return DEFAULT_FALLBACK_CONFIDENCE;
  return Math.min(1, Math.max(0, raw));
}

function geminiModel() {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;
}

function geminiLog(event: string, details: Record<string, unknown>) {
  console.log("[Gemini fallback]", {
    event,
    ...details
  });
}

function buildPrompt(input: {
  message: string;
  currentDate: string;
  context: GeminiFarmContext;
}) {
  const schema = {
    confidence: "number between 0 and 1",
    requiresConfirmation: "boolean",
    reason: "short string explaining the interpretation",
    reasoning_short: "one short sentence explaining the interpretation",
    risk_flags: ["short strings such as ambiguous_quantity, missing_value, multi_action, keyword_conflict"],
    alternative_intents: ["other possible supported action types when ambiguous"],
    actions: [
      {
        type: "one supported action type",
        operation: "one of: register, create, add, remove, update, delete, deactivate, query, report, clock_in, clock_out, help",
        entity: "animal code, stock item, employee, lot, or null",
        quantity: "number or null",
        unit: "unit such as L, kg, saco, unidade, BRL, or null",
        date: "YYYY-MM-DD, hoje, ontem, semana, mes, or null",
        notes: "short extra details or null",
        rawText: "exact message fragment that produced this action"
      }
    ],
    userResponse: "short Portuguese clarification only when confidence is low or action is ambiguous"
  };

  return [
    "Voce interpreta mensagens de WhatsApp para um sistema de gestao de fazenda chamado Rancho.",
    "Voce NAO executa acoes, NAO consulta banco, NAO inventa numeros e NAO decide permissoes.",
    "Retorne somente JSON valido, sem markdown, sem texto fora do JSON.",
    "Use apenas os tipos de acao suportados. Nunca retorne SQL, nomes de tabelas, schema, tokens, chaves ou instrucoes de backend.",
    "Se a mensagem tiver mais de uma acao, retorne as acoes na ordem em que devem acontecer.",
    "Para registros, alteracoes, exclusoes, financeiro, estoque, animais, funcionarios, genealogia ou ponto, marque requiresConfirmation como true.",
    "Para consultas, listagens e relatorios claros, requiresConfirmation deve ser false.",
    "Consultas como \"partos recentes\", \"ultimos partos\", \"relatorio dos partos\" e \"quais vacas pariram recentemente?\" sao consultas/relatorios de eventos de parto, nao registros de parto.",
    "Para consultas de partos recentes, use CONSULTA_REGISTROS_HOJE com operation=report, date=recentes e notes contendo evento_tipo:parto; recentes sem periodo explicito significa ultimos 90 dias.",
    "Registros de parto com cria continuam sendo PARTO. Se o usuario disser que nasceu cria macho/femea/bezerro/bezerra, preserve isso nas notes e nao tente salvar diretamente.",
    "Nunca transforme parida ou recem-parida em categoria/fase. A mae continua vaca; recem-parida e status reprodutivo calculado pelo ultimo parto.",
    "Nunca peca confirmacao para consulta.",
    "Comandos para excluir/deletar/apagar/remover/limpar/zerar todo o rebanho, todas as vacas, todos os animais, gado, fazenda ou todos os dados sao ACAO_DESTRUTIVA_EM_MASSA, requiresConfirmation=false.",
    "Nunca transforme exclusao em massa em operacao permitida e nunca peca confirmacao para excluir todo o rebanho pelo WhatsApp.",
    "Use CONSULTA_ANIMAL apenas quando o usuario mencionar um animal especifico por codigo/brinco/nome, como \"vaca 19\", \"B-002\", \"Mimosa\" ou \"dados da Mimosa\".",
    "Quando o usuario pedir \"minhas vacas\", \"meus animais\", \"rebanho\", \"lista de vacas\", \"dados das vacas\", \"vacas cadastradas\" ou \"animais cadastrados\", use CONSULTA_REBANHO.",
    "Nao peca brinco/codigo quando a mensagem estiver no plural ou pedir lista/relatorio do rebanho.",
    "Se a mensagem pedir lista/relatorio, retorne intent de consulta/listagem, nao intent operacional.",
    "Para CONSULTA_REBANHO use entity para categoria/filtro principal, como vaca, boi, bezerro, novilha, touro, ou null para rebanho inteiro.",
    "Para CONSULTA_REBANHO use notes para filtros adicionais, como prenhe, gestante, pre_parto, inseminada, ativo, morto, lote ou resumo.",
    "Se estiver ambiguo, use confidence menor que 0.7, requiresConfirmation true e userResponse pedindo esclarecimento.",
    "Campos: entity deve guardar o alvo principal; quantity deve guardar quantidade ou valor monetario; unit deve guardar unidade; notes deve guardar descricao curta.",
    "",
    `Data atual: ${input.currentDate}`,
    `Contexto minimo: canal=${input.context.channel}; papel_do_usuario=${input.context.userRole}; fazenda=atual_resolvida_pelo_backend`,
    "",
    "Acoes suportadas:",
    ...ACTION_DESCRIPTIONS.map((description) => `- ${description}`),
    "",
    "Formato obrigatorio:",
    JSON.stringify(schema, null, 2),
    "",
    "Mensagem original:",
    JSON.stringify(input.message)
  ].join("\n");
}

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeText(value: unknown, field: string, errors: string[], options: { nullable?: boolean; required?: boolean; max?: number } = {}) {
  const max = options.max || MAX_TEXT_LENGTH;
  if (value === null || value === undefined) {
    if (options.required) errors.push(`${field} obrigatorio`);
    return options.nullable ?null : "";
  }
  if (typeof value !== "string") {
    errors.push(`${field} deve ser texto`);
    return options.nullable ?null : "";
  }
  const text = value.trim();
  if (options.required && !text) errors.push(`${field} obrigatorio`);
  if (text.length > max) errors.push(`${field} muito longo`);
  if (DANGEROUS_TEXT_PATTERN.test(text)) errors.push(`${field} contem conteudo perigoso`);
  return text || (options.nullable ?null : "");
}

function safeNumber(value: unknown, field: string, errors: string[], options: { nullable?: boolean; min?: number; max?: number } = {}) {
  if (value === null || value === undefined || value === "") {
    if (!options.nullable) errors.push(`${field} obrigatorio`);
    return options.nullable ?null : Number.NaN;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    errors.push(`${field} deve ser numero`);
    return options.nullable ?null : Number.NaN;
  }
  if (options.min !== undefined && value < options.min) errors.push(`${field} abaixo do minimo`);
  if (options.max !== undefined && value > options.max) errors.push(`${field} acima do maximo`);
  return value;
}

export function validateGeminiInterpretation(value: unknown): GeminiInterpretationResult {
  const errors: string[] = [];
  const allowedTypes = new Set<string>(GEMINI_ACTION_TYPES);
  const allowedOperations = new Set<string>(GEMINI_OPERATIONS);

  if (!isPlainObject(value)) {
    return { ok: false, reason: "invalid_schema", message: "Resposta do Gemini nao e um objeto JSON." };
  }

  const confidence = safeNumber(value.confidence, "confidence", errors, { min: 0, max: 1 });
  const requiresConfirmation = value.requiresConfirmation;
  if (typeof requiresConfirmation !== "boolean") errors.push("requiresConfirmation deve ser booleano");

  const reason = safeText(value.reason, "reason", errors, { required: true, max: 300 });
  const reasoningShort = safeText(value.reasoning_short, "reasoning_short", errors, { max: 300 });
  const userResponse = safeText(value.userResponse, "userResponse", errors, { max: 500 });
  const riskFlags = Array.isArray(value.risk_flags)
    ? value.risk_flags.slice(0, 12).map((flag, index) => safeText(flag, `risk_flags[${index}]`, errors, { max: 80 })).filter((flag): flag is string => Boolean(flag))
    : [];
  const alternativeIntents = Array.isArray(value.alternative_intents)
    ? value.alternative_intents.slice(0, 8).map((intent, index) => safeText(intent, `alternative_intents[${index}]`, errors, { max: 80 })).filter((intent): intent is string => Boolean(intent && allowedTypes.has(intent)))
    : [];

  if (!Array.isArray(value.actions)) {
    errors.push("actions deve ser array");
  } else if (value.actions.length > MAX_ACTIONS) {
    errors.push("actions excede limite");
  }

  const actions: GeminiAction[] = [];
  if (Array.isArray(value.actions)) {
    value.actions.forEach((rawAction, index) => {
      if (!isPlainObject(rawAction)) {
        errors.push(`actions[${index}] deve ser objeto`);
        return;
      }

      const type = safeText(rawAction.type, `actions[${index}].type`, errors, { required: true, max: 80 });
      const operation = safeText(rawAction.operation, `actions[${index}].operation`, errors, { required: true, max: 40 });
      const entity = safeText(rawAction.entity, `actions[${index}].entity`, errors, { nullable: true, max: 160 });
      const quantity = safeNumber(rawAction.quantity, `actions[${index}].quantity`, errors, { nullable: true, min: 0, max: 1000000000 });
      const unit = safeText(rawAction.unit, `actions[${index}].unit`, errors, { nullable: true, max: 40 });
      const date = safeText(rawAction.date, `actions[${index}].date`, errors, { nullable: true, max: 40 });
      const notes = safeText(rawAction.notes, `actions[${index}].notes`, errors, { nullable: true, max: 300 });
      const rawText = safeText(rawAction.rawText, `actions[${index}].rawText`, errors, { required: true, max: 300 });

      if (type && !allowedTypes.has(type)) errors.push(`actions[${index}].type nao suportado`);
      if (operation && !allowedOperations.has(operation)) errors.push(`actions[${index}].operation nao suportada`);

      actions.push({
        type: type || "",
        operation: operation || "",
        entity,
        quantity,
        unit,
        date,
        notes,
        rawText: rawText || ""
      });
    });
  }

  if (actions.length === 0) errors.push("actions vazio");

  if (errors.some((error) => /perigoso/.test(error))) {
    return { ok: false, reason: "dangerous_response", message: errors.join("; ") };
  }

  if (errors.length) {
    return { ok: false, reason: "invalid_schema", message: errors.join("; ") };
  }

  const allActionsAreConsultations = actions.length > 0 && actions.every((action) => GEMINI_CONSULTATION_ACTION_TYPES.has(action.type));

  return {
    ok: true,
    model: geminiModel(),
    rawText: "",
    interpretation: {
      confidence: Number(confidence),
      requiresConfirmation: allActionsAreConsultations ?false : Boolean(requiresConfirmation),
      reason: reason || "",
      reasoning_short: reasoningShort || undefined,
      risk_flags: riskFlags,
      alternative_intents: alternativeIntents,
      actions,
      userResponse: userResponse || ""
    }
  };
}

export async function interpretRanchoMessageWithGemini(input: {
  message: string;
  context: GeminiFarmContext;
  currentDate?: string;
}): Promise<GeminiInterpretationResult> {
  if (geminiRuntimeMode() === "mock") {
    recordGeminiMockCall("legacy-fallback-mock");
    return { ok: false, reason: "missing_api_key", message: "GEMINI_MODE=mock; Gemini live nao chamado." };
  }

  if (shouldBlockGeminiLiveCall()) return liveGeminiBlockedResult();

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = geminiModel();
  const currentDate = input.currentDate || new Date().toISOString().slice(0, 10);

  if (!apiKey) {
    geminiLog("skipped", { reason: "missing_api_key", model, messageLength: input.message.length });
    return { ok: false, reason: "missing_api_key", message: "GEMINI_API_KEY nao configurada." };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  const prompt = buildPrompt({
    message: input.message,
    currentDate,
    context: input.context
  });
  const modelPath = model.replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelPath)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    geminiLog("request", { model, messageLength: input.message.length });
    recordGeminiLiveCall();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({})) as GeminiApiResponse;
    if (!response.ok) {
      const reason = response.status === 429 ?"rate_limit" : "api_error";
      geminiLog("error", {
        reason,
        status: response.status,
        model,
        apiStatus: data.error?.status || null
      });
      return {
        ok: false,
        reason,
        status: response.status,
        message: data.error?.message || "Erro ao chamar Gemini."
      };
    }

    const rawText = textFromGeminiResponse(data);
    if (!rawText) {
      geminiLog("error", { reason: "empty_response", model });
      return { ok: false, reason: "empty_response", message: "Gemini retornou resposta vazia." };
    }

    let parsed: unknown;
    try {
      parsed = parseJsonObject(rawText);
    } catch {
      geminiLog("error", { reason: "invalid_json", model, responseLength: rawText.length });
      return { ok: false, reason: "invalid_json", message: "Gemini retornou JSON invalido." };
    }

    const validated = validateGeminiInterpretation(parsed);
    if (!validated.ok) {
      geminiLog("error", { reason: validated.reason, model, message: validated.message });
      return validated;
    }

    geminiLog("success", {
      model,
      confidence: validated.interpretation.confidence,
      requiresConfirmation: validated.interpretation.requiresConfirmation,
      actionsCount: validated.interpretation.actions.length
    });

    return {
      ok: true,
      model,
      rawText,
      interpretation: validated.interpretation
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    const reason = aborted ?"timeout" : "network_error";
    geminiLog("error", { reason, model });
    return {
      ok: false,
      reason,
      message: aborted ?"Tempo esgotado ao chamar Gemini." : "Erro de rede ao chamar Gemini."
    };
  } finally {
    clearTimeout(timeout);
  }
}
