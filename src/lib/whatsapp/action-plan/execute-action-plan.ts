import { getRanchTodayISO } from "@/lib/dates/ranch-time";
import type { ActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import { buildMissing, finalize } from "@/lib/whatsapp/nlp-core/result";
import {
  actionPlanParsedMetadata,
  finalizeBlockedActionPlanParsed
} from "@/lib/whatsapp/action-plan/action-plan-to-parsed";
import { executeImportTableActionPlan } from "@/lib/whatsapp/action-plan/execute-import-table-action-plan";
import { validateActionPlan } from "@/lib/whatsapp/gemini/action-plan-validator";
import { calfCategoryForSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import {
  normalizeDate,
  normalizeReproductionEvent,
  normalizeSex
} from "@/lib/whatsapp/nlp-core/reproduction-normalizers";
import {
  executeQueryActionPlan,
  type ActionPlanOwnerContext,
  type ActionPlanSupabaseLike
} from "@/lib/whatsapp/action-plan/execute-query-action-plan";

export type ExecuteActionPlanInput = {
  plan: ActionPlan;
  text: string;
  owner: ActionPlanOwnerContext;
  supabase?: ActionPlanSupabaseLike | null;
  currentDate?: string;
};

export type ExecuteActionPlanResult =
  | {
      ok: true;
      parsed: ParsedRanchoMessage;
      response?: string;
      logEvent: "action_plan_used" | "table_action_plan_used" | "action_plan_blocked";
    }
  | {
      ok: false;
      status: "clarify" | "blocked";
      reason: string;
      message: string;
      logEvent: "action_plan_invalid" | "action_plan_blocked";
    };

function blockParsed(plan: ActionPlan) {
  const reason = plan.action === "block" ? plan.safety?.reason || plan.reason || "action_plan_blocked" : "action_plan_blocked";
  return finalizeBlockedActionPlanParsed(plan, reason);
}

function actionPlanMetadata(plan: ActionPlan) {
  return actionPlanParsedMetadata(plan);
}

type PhysicalStockTrade = {
  kind: "sale" | "purchase";
  item?: string;
  quantity?: number;
  unit?: string;
  value?: number;
};

function parseActionPlanNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  const cleaned = text.replace(/[^\d,.-]/g, "");
  if (!cleaned) return undefined;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const normalized = lastComma >= 0 && lastDot >= 0
    ? lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "")
    : cleaned.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function compactTradeText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/[.;:,]+$/g, "")
    .trim();
}

function actionPlanDeathCue(...values: unknown[]) {
  const text = normalizeRanchoText(values.filter(Boolean).join(" "));
  return /\b(?:morte|morreu|morto|morta|obito|faleceu|falecida|falecido|falecimento|registro_morte)\b/.test(text);
}

function extractPhysicalStockTrade(text: string): PhysicalStockTrade | null {
  const raw = compactTradeText(text);
  if (!raw) return null;
  const normalized = normalizeRanchoText(raw);
  const isSale = /\b(vendi|vendemos|vendeu|venderam|venda|vender)\b/.test(normalized);
  const isPurchase = /\b(comprei|compramos|comprou|compraram|compra|comprar|adquiri|adquirimos)\b/.test(normalized);
  const kind = isSale ? "sale" : isPurchase ? "purchase" : null;
  if (!kind) return null;

  const verbs = kind === "sale"
    ? "vendi|vendemos|vendeu|venderam|venda|vender"
    : "comprei|compramos|comprou|compraram|compra|comprar|adquiri|adquirimos";
  const unit = "sacos?|sacas?|kg|kgs|quilos?|litros?|lts?|l|unidades?|un|doses?|toneladas?|tons?|pacotes?|caixas?|fardos?";
  const amount = "([0-9]+(?:[.,][0-9]+)*)";
  const money = "(?:r\\$\\s*)?([0-9]+(?:[.,][0-9]+)*)(?:\\s*reais?)?";
  const pattern = new RegExp(
    `\\b(?:${verbs})\\b\\s+${amount}\\s+(${unit})\\s+(?:de\\s+|do\\s+|da\\s+|dos\\s+|das\\s+)?(.+?)\\s+(?:por|a|ao valor de|no valor de|custou|total(?: de)?)\\s+${money}\\b`,
    "i"
  );
  const match = raw.match(pattern);
  if (!match) return { kind };

  return {
    kind,
    quantity: parseActionPlanNumber(match[1]),
    unit: compactTradeText(match[2]),
    item: compactTradeText(match[3]),
    value: parseActionPlanNumber(match[4])
  };
}

function actionPlanPhysicalStockTrade(plan: ActionPlan, data: Record<string, unknown>, text?: string): PhysicalStockTrade | null {
  const fromText = extractPhysicalStockTrade(text || "");
  const movementText = normalizeRanchoText([
    plan.operation,
    data.tipo_movimento,
    data.tipo,
    data.movimento,
    data.descricao,
    data.categoria
  ].filter(Boolean).join(" "));
  const kind = fromText?.kind
    || (/\b(venda|vender|vendido)\b/.test(movementText)
      ? "sale"
      : /\b(compra|comprar|comprado)\b/.test(movementText)
        ? "purchase"
        : null);
  if (!kind && !fromText) return null;

  const item = compactTradeText(data.item || data.item_ref || data.nome || data.produto || fromText?.item);
  const unit = compactTradeText(data.unidade || data.unidade_medida || fromText?.unit);
  const quantity = parseActionPlanNumber(data.quantidade) ?? fromText?.quantity;
  const value = parseActionPlanNumber(data.valor_total ?? data.valor) ?? fromText?.value;

  return {
    kind: kind || fromText?.kind || "purchase",
    item: item || undefined,
    unit: unit || undefined,
    quantity,
    value
  };
}

function mutationParsed(plan: ActionPlan, currentDate?: string, originalText?: string): ParsedRanchoMessage | null {
  if (plan.action !== "create" && plan.action !== "update") return null;
  const data = plan.data || {};
  const metadata = actionPlanMetadata(plan);
  const ranchCurrentDate = currentDate || getRanchTodayISO();
  const date = normalizeDate(data.data || data.data_evento, ranchCurrentDate) || ranchCurrentDate;

  if (plan.domain === "producao_leite") {
    const dados = {
      animal_codigo: data.animal_ref || data.animal_id,
      litros: data.litros,
      data_referencia: date,
      horario: data.hora || undefined,
      turno: data.turno || undefined,
      destino_leite: data.destino || undefined,
      observacoes: data.observacoes || undefined,
      ...metadata
    };
    return finalize("PRODUCAO_LEITE", dados, buildMissing("PRODUCAO_LEITE", dados), plan.confidence);
  }

  if (plan.domain === "estoque") {
    const trade = actionPlanPhysicalStockTrade(plan, data, originalText);
    const movement = normalizeRanchoText(String(data.tipo_movimento || data.tipo || plan.operation || ""));
    const isOut = trade?.kind === "sale" || ["saida", "uso", "consumo", "venda", "venda_estoque"].some((value) => movement.includes(value));
    const value = parseActionPlanNumber(data.valor_total ?? data.valor) ?? trade?.value;
    const isPurchase = trade?.kind === "purchase"
      || movement.includes("compra")
      || plan.operation === "compra_estoque"
      || (!isOut && data.gera_financeiro === true && value !== undefined);
    const isSale = trade?.kind === "sale" || movement.includes("venda") || plan.operation === "venda_estoque";
    const tipo = isOut ? "ESTOQUE_SAIDA" : "ESTOQUE_ENTRADA";
    const dados = {
      item_nome: data.item || data.item_ref || data.nome || trade?.item,
      quantidade: parseActionPlanNumber(data.quantidade) ?? trade?.quantity ?? data.quantidade,
      unidade: data.unidade || data.unidade_medida || trade?.unit,
      valor: value,
      data_referencia: date,
      compra: isPurchase || undefined,
      sem_financeiro: isPurchase && value === undefined ? true : undefined,
      venda: isSale || undefined,
      destino: data.destino || undefined,
      motivo: data.motivo || data.observacoes || undefined,
      ...metadata
    };
    return finalize(tipo, dados, buildMissing(tipo, dados), plan.confidence);
  }

  if (plan.domain === "financeiro") {
    const trade = actionPlanPhysicalStockTrade(plan, data, originalText);
    if (trade?.item && trade.quantity !== undefined && trade.unit && trade.value !== undefined) {
      const tipo = trade.kind === "sale" ? "ESTOQUE_SAIDA" : "ESTOQUE_ENTRADA";
      const dados = {
        item_nome: trade.item,
        quantidade: trade.quantity,
        unidade: trade.unit,
        valor: trade.value,
        data_referencia: date,
        compra: trade.kind === "purchase" || undefined,
        venda: trade.kind === "sale" || undefined,
        ...metadata
      };
      return finalize(tipo, dados, buildMissing(tipo, dados), plan.confidence);
    }

    const financialType = String(data.tipo || "").toLowerCase();
    const tipo = ["receita", "entrada", "credito"].includes(financialType) ? "RECEITA_VENDA" : "DESPESA";
    const dados = {
      valor: data.valor,
      descricao: data.descricao || data.categoria,
      categoria: data.categoria || undefined,
      forma_pagamento: data.forma_pagamento || data.metodo_pagamento || undefined,
      data_referencia: date,
      ...metadata
    };
    return finalize(tipo, dados, buildMissing(tipo, dados), plan.confidence);
  }

  if (plan.domain === "animais") {
    if (actionPlanDeathCue(plan.operation, data.status, data.observacoes, data.descricao)) {
      const dados = {
        animal_codigo: data.animal_ref || data.brinco,
        data_referencia: date,
        observacoes: data.observacoes || data.descricao || undefined,
        ...metadata
      };
      return finalize("MORTE", dados, buildMissing("MORTE", dados), plan.confidence);
    }

    const optional = ["sexo", "nome", "peso", "fase", "raca", "lote_animal", "data_nascimento", "observacoes"];
    const dados = {
      animal_codigo: data.brinco || data.animal_ref,
      nome: data.nome || undefined,
      categoria: data.categoria,
      sexo: data.sexo || undefined,
      fase: data.fase || undefined,
      raca: data.raca || undefined,
      peso: data.peso,
      lote_nome: data.lote_ref || undefined,
      data_nascimento: data.data_nascimento || undefined,
      observacoes: data.observacoes || undefined,
      campos_opcionais_pulados: optional.filter((field) => {
        const source = field === "lote_animal" ? data.lote_ref : data[field];
        return source === undefined || source === null || String(source).trim() === "";
      }),
      ...metadata
    };
    return finalize("CADASTRO_ANIMAL", dados, buildMissing("CADASTRO_ANIMAL", dados), plan.confidence);
  }

  if (plan.domain === "lotes") {
    const dados = {
      lote_nome: data.nome,
      descricao: data.descricao || undefined,
      ...metadata
    };
    return finalize("CRIAR_LOTE", dados, buildMissing("CRIAR_LOTE", dados), plan.confidence);
  }

  if (plan.domain === "observacoes" && data.animal_ref) {
    const observation = data.observacao || data.observacoes;
    const dados = {
      animal_codigo: data.animal_ref,
      campo_alterado: "observacoes",
      novo_valor: observation,
      descricao: observation,
      registro_evento_animal: true,
      evento_tipo: "observacao",
      data_referencia: date,
      ...metadata
    };
    return finalize("ATUALIZACAO_ANIMAL", dados, buildMissing("ATUALIZACAO_ANIMAL", dados), plan.confidence);
  }

  if (plan.domain === "saude_sanitario") {
    if (actionPlanDeathCue(plan.operation, data.evento, data.tipo, data.descricao, data.observacoes)) {
      const dados = {
        animal_codigo: data.animal_ref,
        data_referencia: date,
        observacoes: data.observacoes || data.descricao || undefined,
        ...metadata
      };
      return finalize("MORTE", dados, buildMissing("MORTE", dados), plan.confidence);
    }

    const rawType = String(data.tipo || data.evento || "tratamento").trim().toLowerCase();
    const eventType = rawType === "vacina" ? "vacina" : "tratamento";
    const quantity = data.quantidade;
    const unit = String(data.unidade || "").trim();
    const dose = data.dose || (quantity !== undefined && quantity !== null
      ? `${quantity}${unit ? ` ${unit}` : ""}`
      : undefined);
    const dados = {
      animal_codigo: data.animal_ref,
      lote_nome: data.lote_ref || undefined,
      produto: data.item || data.produto || data.medicamento || rawType,
      dose,
      quantidade: quantity,
      unidade: unit || undefined,
      evento_tipo: eventType,
      data_referencia: date,
      observacoes: data.observacoes || data.descricao || undefined,
      custo: data.custo,
      ...metadata
    };
    return finalize("VACINA_MEDICAMENTO", dados, buildMissing("VACINA_MEDICAMENTO", dados), plan.confidence);
  }

  if (plan.domain === "agenda_tarefas") {
    const dados = {
      descricao: data.titulo || data.tarefa,
      data_referencia: date,
      horario: data.horario || undefined,
      responsavel: data.responsavel || undefined,
      observacoes: data.observacoes || undefined,
      ...metadata
    };
    return finalize("ORDEM_SERVICO", dados, [], plan.confidence);
  }

  if (plan.domain === "ponto_funcionario") {
    const tipo = String(data.tipo || plan.operation || "entrada").toLowerCase().includes("saida") ? "saida" : "entrada";
    const pointDate = normalizeDate(data.data || data.data_evento || data.registrado_em, ranchCurrentDate) || date;
    const dados = {
      funcionario_nome: data.funcionario_ref || data.funcionario_id || data.nome,
      ponto_tipo: tipo,
      horario: data.hora || data.horario || undefined,
      data_referencia: pointDate,
      agora: !data.hora && !data.horario && !data.registrado_em ? true : undefined,
      observacoes: data.observacoes || data.observacao || undefined,
      ...metadata
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados), plan.confidence);
  }

  return reproductionMutationParsed(plan, currentDate);
}

function reproductionMutationParsed(plan: ActionPlan, currentDate?: string): ParsedRanchoMessage | null {
  if ((plan.action !== "create" && plan.action !== "update") || plan.domain !== "reproducao") return null;
  const data = plan.data || {};
  const event = normalizeReproductionEvent(data.evento || data.tipo);
  const animalRef = String(data.animal_ref || data.mae_ref || "").trim();
  const ranchCurrentDate = currentDate || getRanchTodayISO();
  const date = normalizeDate(data.data || data.data_evento, ranchCurrentDate) || ranchCurrentDate;
  if (!event || !animalRef) return null;

  const actionPlanData = {
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "action_plan",
    action_plan_used: true,
    action_plan_domain: "reproducao",
    action_plan: plan
  };

  if (event === "PARTO") {
    const childSex = normalizeSex(data.cria_sexo || data.sexo_cria);
    const childCode = String(data.cria_codigo || "").trim() || undefined;
    const childName = String(data.cria_nome || "").trim() || undefined;
    const fatherRef = String(data.pai_ref || "").trim() || undefined;
    const hasChildData = Boolean(childSex || childCode || childName || data.cria_ref || fatherRef);
    const dados = {
      animal_codigo: animalRef,
      mae_ref: animalRef,
      evento_reprodutivo_tipo: "parto",
      data_referencia: date,
      observacoes: data.observacoes || data.descricao || undefined,
      parto_cria_decisao_pendente: hasChildData ? undefined : true,
      parto_cria_cadastro: hasChildData || undefined,
      cria_ref: data.cria_ref || undefined,
      cria_codigo: childCode,
      cria_nome: childName,
      cria_sexo: childSex,
      cria_categoria: calfCategoryForSex(childSex),
      pai_ref: fatherRef,
      pai_nome: fatherRef,
      pai_nao_informado: hasChildData && !fatherRef ? true : undefined,
      ...actionPlanData
    };
    return finalize("PARTO", dados, buildMissing("PARTO", dados), plan.confidence);
  }

  const eventKind = event === "EM_PROTOCOLO"
    ? "protocolo"
    : event === "EM_RETESTE" ? "reteste" : event.toLowerCase();
  const description = String(data.observacoes || data.descricao || event.replace(/_/g, " ")).trim();
  const dados = {
    animal_codigo: animalRef,
    campo_alterado: "observacoes",
    novo_valor: description,
    descricao: description,
    registro_evento_animal: true,
    evento_tipo: "reprodutivo",
    evento_reprodutivo_tipo: eventKind,
    data_referencia: date,
    custo: data.custo,
    ...actionPlanData
  };
  return finalize("ATUALIZACAO_ANIMAL", dados, buildMissing("ATUALIZACAO_ANIMAL", dados), plan.confidence);
}

function reproductionPartoClarifyParsed(plan: ActionPlan, currentDate?: string): ParsedRanchoMessage | null {
  if (plan.action !== "clarify" || plan.domain !== "reproducao") return null;
  const data = plan.data || {};
  const event = normalizeReproductionEvent(data.evento || data.tipo || plan.operation);
  const animalRef = String(data.animal_ref || data.mae_ref || "").trim();
  if (event !== "PARTO" || !animalRef) return null;

  const dados = {
    animal_codigo: animalRef,
    mae_ref: animalRef,
    evento_reprodutivo_tipo: "parto",
    data_referencia: normalizeDate(data.data || data.data_evento, currentDate || getRanchTodayISO()) || currentDate || getRanchTodayISO(),
    parto_cria_cadastro: true,
    parto_perguntar_sexo_direto: true,
    pai_nao_informado: true,
    ...actionPlanMetadata(plan)
  };
  return finalize("PARTO", dados, buildMissing("PARTO", dados), plan.confidence || 0.65);
}

export async function executeActionPlan(input: ExecuteActionPlanInput): Promise<ExecuteActionPlanResult> {
  if (input.plan.action === "block") {
    return {
      ok: true,
      parsed: blockParsed(input.plan),
      logEvent: "action_plan_blocked"
    };
  }

  if (input.plan.action === "clarify") {
    const parsed = reproductionPartoClarifyParsed(input.plan, input.currentDate);
    if (parsed) {
      return {
        ok: true,
        parsed,
        logEvent: "action_plan_used"
      };
    }
    return {
      ok: false,
      status: "clarify",
      reason: "action_plan_clarify",
      message: input.plan.userQuestion || input.plan.question || "Pode informar o dado que faltou?",
      logEvent: "action_plan_invalid"
    };
  }

  if (input.plan.action === "query") {
    const result = await executeQueryActionPlan({
      plan: input.plan,
      supabase: input.supabase,
      owner: input.owner,
      currentDate: input.currentDate,
      originalText: input.text
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        reason: result.reason,
        message: result.message,
        logEvent: result.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid"
      };
    }
    return {
      ok: true,
      parsed: result.parsed,
      response: result.response,
      logEvent: "action_plan_used"
    };
  }

  if (input.plan.action === "import_table") {
    const result = await executeImportTableActionPlan({
      plan: input.plan,
      text: input.text
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        reason: result.reason,
        message: result.message,
        logEvent: result.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid"
      };
    }
    return {
      ok: true,
      parsed: result.parsed,
      response: result.preview,
      logEvent: "table_action_plan_used"
    };
  }

  if (input.plan.action === "create" || input.plan.action === "update") {
    const validation = validateActionPlan(input.plan);
    if (!validation.ok) {
      return {
        ok: false,
        status: validation.status === "blocked" ? "blocked" : "clarify",
        reason: validation.reason,
        message: validation.status === "blocked"
          ? "Nao posso executar esse pedido com seguranca."
          : "Preciso revisar os dados antes de continuar.",
        logEvent: validation.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid"
      };
    }
    const parsed = mutationParsed(validation.value, input.currentDate, input.text);
    if (parsed) {
      return {
        ok: true,
        parsed,
        logEvent: "action_plan_used"
      };
    }
  }

  return {
    ok: false,
    status: "clarify",
    reason: "action_plan_mutation_not_integrated",
    message: "Esse tipo de pedido ainda não está habilitado para execução segura.",
    logEvent: "action_plan_invalid"
  };
}
