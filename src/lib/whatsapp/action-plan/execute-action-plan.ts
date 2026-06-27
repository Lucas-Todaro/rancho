import { getRanchTodayISO } from "@/lib/dates/ranch-time";
import type { ActionPlan, ExecuteCapabilityActionPlan, FilterPlan, QueryActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
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

function firstValue(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = data[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function firstText(data: Record<string, unknown>, keys: string[]) {
  const value = firstValue(data, keys);
  const text = String(value ?? "").trim();
  return text || undefined;
}

function firstNumber(data: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = parseActionPlanNumber(data[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function capabilityAnimalRef(data: Record<string, unknown>) {
  return firstValue(data, ["animal_ref", "animal_id", "animal_codigo", "brinco", "codigo", "mae_ref"]);
}

function capabilityEmployeeRef(data: Record<string, unknown>) {
  return firstValue(data, ["funcionario_ref", "funcionario_id", "funcionario_nome", "nome"]);
}

function capabilityDate(data: Record<string, unknown>, currentDate?: string) {
  const ranchCurrentDate = currentDate || getRanchTodayISO();
  return normalizeDate(firstValue(data, ["data", "data_evento", "data_referencia", "ordenhado_em", "registrado_em"]), ranchCurrentDate) || ranchCurrentDate;
}

function capabilityEventText(plan: ExecuteCapabilityActionPlan, data: Record<string, unknown>) {
  return normalizeRanchoText([
    plan.operation,
    data.evento,
    data.tipo_evento,
    data.tipo,
    data.status,
    data.descricao,
    data.observacoes
  ].filter(Boolean).join(" "));
}

function capabilityQueryDomain(plan: ExecuteCapabilityActionPlan, data: Record<string, unknown>) {
  const explicit = normalizeRanchoText(String(plan.domain || data.domain || data.dominio || data.area || ""));
  if (explicit.includes("financeiro")) return "financeiro";
  if (explicit.includes("estoque")) return "estoque";
  if (explicit.includes("producao") || explicit.includes("leite")) return "producao_leite";
  if (explicit.includes("funcionario")) return "funcionarios";
  if (explicit.includes("ponto")) return "ponto_funcionario";
  if (explicit.includes("genealogia")) return "genealogia";
  if (explicit.includes("reproducao") || explicit.includes("evento")) return "reproducao";
  if (explicit.includes("lote")) return "lotes";
  if (explicit.includes("animal") || explicit.includes("rebanho")) return "animais";

  if (plan.capability === "consultar_financeiro") return "financeiro";
  if (plan.capability === "consultar_estoque") return "estoque";
  if (plan.capability === "consultar_producao_leite") return "producao_leite";
  if (plan.capability === "consultar_funcionarios") return "funcionarios";
  if (plan.capability === "consultar_ponto") return "ponto_funcionario";
  if (plan.capability === "consultar_genealogia") return "genealogia";
  if (plan.capability === "consultar_eventos") return "reproducao";
  if (plan.capability === "consultar_animal" || plan.capability === "consultar_rebanho") return "animais";
  return null;
}

function capabilityFilters(plan: ExecuteCapabilityActionPlan, data: Record<string, unknown>): FilterPlan[] {
  const filters = Array.isArray(data.filters) ? data.filters.filter((filter): filter is FilterPlan => Boolean(filter && typeof filter === "object")) : [];
  const domain = capabilityQueryDomain(plan, data);
  const add = (field: string, value: unknown) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") filters.push({ field, op: "eq", value });
  };
  if (domain === "animais") {
    add("animal_ref", firstValue(data, ["animal_ref", "animal_codigo", "brinco", "codigo"]));
    add("categoria", data.categoria);
    add("sexo", data.sexo);
    add("status", data.status);
    add("lote_ref", data.lote_ref || data.lote_nome);
  }
  if (domain === "financeiro") {
    add("tipo", data.tipo);
    if (data.categoria) filters.push({ field: "categoria", op: "contains", value: data.categoria });
    if (data.descricao) filters.push({ field: "descricao", op: "contains", value: data.descricao });
  }
  if (domain === "estoque") {
    const item = firstValue(data, ["item", "item_ref", "item_nome", "produto", "nome"]);
    if (item) filters.push({ field: "item", op: "contains", value: item });
    add("categoria", data.categoria);
  }
  if (domain === "producao_leite") add("animal_ref", capabilityAnimalRef(data));
  if (domain === "funcionarios") add("funcionario_ref", capabilityEmployeeRef(data));
  if (domain === "ponto_funcionario") add("funcionario_ref", capabilityEmployeeRef(data));
  if (domain === "genealogia") add("animal_ref", capabilityAnimalRef(data));
  if (domain === "reproducao") {
    add("animal_ref", capabilityAnimalRef(data));
    add("evento", data.evento || data.tipo_evento || data.tipo);
  }
  const period = normalizeRanchoText(String(data.periodo || data.data_periodo || ""));
  const dateField = domain === "financeiro" || domain === "producao_leite" || domain === "reproducao" || domain === "ponto_funcionario" ? "data" : null;
  if (dateField && period.includes("mes")) filters.push({ field: dateField, op: "current_month" });
  if (dateField && period.includes("ano")) filters.push({ field: dateField, op: "current_year" });
  const lastDays = firstNumber(data, ["ultimos_dias", "dias"]);
  if (dateField && lastDays) filters.push({ field: dateField, op: "last_days", value: lastDays });
  return filters;
}

function capabilityQueryPlan(plan: ExecuteCapabilityActionPlan): QueryActionPlan | null {
  const data = plan.data || {};
  const domain = capabilityQueryDomain(plan, data);
  if (!domain) return null;
  const groupBy = Array.isArray(data.groupBy)
    ? data.groupBy as string[]
    : Array.isArray(data.group_by) ? data.group_by as string[] : undefined;
  const orderBy = data.orderBy && typeof data.orderBy === "object"
    ? data.orderBy as QueryActionPlan["orderBy"]
    : data.order_by && typeof data.order_by === "object" ? data.order_by as QueryActionPlan["orderBy"] : undefined;
  return {
    action: "query",
    domain,
    confidence: plan.confidence,
    filters: capabilityFilters(plan, data),
    aggregations: Array.isArray(data.aggregations) ? data.aggregations as QueryActionPlan["aggregations"] : undefined,
    groupBy,
    orderBy,
    limit: parseActionPlanNumber(data.limit) || 100,
    requiresConfirmation: false,
    operation: plan.operation
  };
}

function capabilityMutationParsed(plan: ExecuteCapabilityActionPlan, currentDate?: string, originalText?: string): ParsedRanchoMessage | null {
  const data = plan.data || {};
  const metadata = actionPlanMetadata(plan);
  const date = capabilityDate(data, currentDate);

  if (plan.capability === "registrar_producao_leite") {
    const dados = {
      animal_codigo: capabilityAnimalRef(data),
      litros: firstNumber(data, ["litros", "quantidade", "volume"]),
      data_referencia: date,
      horario: firstValue(data, ["hora", "horario"]),
      turno: data.turno,
      destino_leite: data.destino,
      observacoes: data.observacoes || data.descricao || undefined,
      ...metadata
    };
    return finalize("PRODUCAO_LEITE", dados, buildMissing("PRODUCAO_LEITE", dados), plan.confidence);
  }

  if (plan.capability === "registrar_financeiro") {
    const text = normalizeRanchoText([plan.operation, data.tipo, data.categoria, data.descricao, originalText].filter(Boolean).join(" "));
    const tipo = /\b(receita|entrada|recebi|ganhei|venda|credito)\b/.test(text) ? "RECEITA_VENDA" : "DESPESA";
    const dados = {
      valor: firstNumber(data, ["valor", "valor_total", "preco", "preco_total"]),
      descricao: data.descricao || data.categoria || undefined,
      categoria: data.categoria || undefined,
      forma_pagamento: data.forma_pagamento || data.metodo_pagamento || undefined,
      data_referencia: date,
      ...metadata
    };
    return finalize(tipo, dados, buildMissing(tipo, dados), plan.confidence);
  }

  if (plan.capability === "registrar_movimento_estoque") {
    const trade = actionPlanPhysicalStockTrade({ ...plan, domain: "estoque" } as ActionPlan, data, originalText);
    const movement = normalizeRanchoText([plan.operation, data.tipo_movimento, data.tipo, data.movimento, originalText].filter(Boolean).join(" "));
    const isOut = trade?.kind === "sale" || /\b(saida|baixa|uso|consumo|venda|vendi|vender)\b/.test(movement);
    const tipo = isOut ? "ESTOQUE_SAIDA" : "ESTOQUE_ENTRADA";
    const value = firstNumber(data, ["valor_total", "valor", "preco_total", "preco"]) ?? trade?.value;
    const dados = {
      item_nome: firstValue(data, ["item", "item_ref", "item_nome", "produto", "nome"]) || trade?.item,
      quantidade: firstNumber(data, ["quantidade", "qtd"]) ?? trade?.quantity,
      unidade: firstValue(data, ["unidade", "unidade_medida"]) || trade?.unit,
      valor: value,
      data_referencia: date,
      compra: (!isOut && (value !== undefined || /\b(compra|comprei|comprar)\b/.test(movement))) || undefined,
      venda: isOut && (value !== undefined || /\b(venda|vendi|vender)\b/.test(movement)) || undefined,
      destino: data.destino || undefined,
      motivo: data.motivo || data.observacoes || undefined,
      ...metadata
    };
    return finalize(tipo, dados, buildMissing(tipo, dados), plan.confidence);
  }

  if (plan.capability === "cadastrar_item_estoque") {
    const dados = {
      item_nome: firstValue(data, ["item", "item_nome", "produto", "nome"]),
      quantidade: firstNumber(data, ["quantidade", "quantidade_inicial", "saldo_inicial"]) ?? 0,
      unidade: firstValue(data, ["unidade", "unidade_medida"]),
      valor: firstNumber(data, ["valor", "valor_total", "preco"]),
      compra: data.compra || undefined,
      ...metadata
    };
    return finalize("CRIAR_ITEM_ESTOQUE", dados, buildMissing("CRIAR_ITEM_ESTOQUE", dados), plan.confidence);
  }

  if (plan.capability === "cadastrar_animal") {
    const optional = ["sexo", "nome", "peso", "fase", "raca", "lote_animal", "data_nascimento", "observacoes"];
    const dados = {
      animal_codigo: firstValue(data, ["brinco", "animal_ref", "animal_codigo", "codigo"]),
      nome: data.nome || undefined,
      categoria: data.categoria,
      sexo: data.sexo || undefined,
      fase: data.fase || undefined,
      raca: data.raca || undefined,
      peso: firstNumber(data, ["peso"]),
      lote_nome: data.lote_ref || data.lote_nome || undefined,
      data_nascimento: data.data_nascimento || undefined,
      observacoes: data.observacoes || undefined,
      campos_opcionais_pulados: optional.filter((field) => {
        const source = field === "lote_animal" ? data.lote_ref || data.lote_nome : data[field];
        return source === undefined || source === null || String(source).trim() === "";
      }),
      ...metadata
    };
    return finalize("CADASTRO_ANIMAL", dados, buildMissing("CADASTRO_ANIMAL", dados), plan.confidence);
  }

  if (plan.capability === "alterar_status_animal" || plan.capability === "atualizar_animal") {
    if (actionPlanDeathCue(plan.operation, data.status, data.novo_valor, data.descricao, data.observacoes)) {
      const dados = {
        animal_codigo: capabilityAnimalRef(data),
        data_referencia: date,
        observacoes: data.observacoes || data.descricao || undefined,
        ...metadata
      };
      return finalize("MORTE", dados, buildMissing("MORTE", dados), plan.confidence);
    }
    const dados = {
      animal_codigo: capabilityAnimalRef(data),
      campo_alterado: data.campo_alterado || data.campo || (data.status ? "status" : undefined),
      novo_valor: firstValue(data, ["novo_valor", "valor", "status"]),
      descricao: data.descricao || data.observacoes || undefined,
      data_referencia: date,
      ...metadata
    };
    return finalize("ATUALIZACAO_ANIMAL", dados, buildMissing("ATUALIZACAO_ANIMAL", dados), plan.confidence);
  }

  if (plan.capability === "registrar_evento_animal") {
    const eventText = capabilityEventText(plan, data);
    if (/\b(parto|pariu)\b/.test(eventText)) {
      const childSex = normalizeSex(data.cria_sexo || data.sexo_cria);
      const childCode = String(data.cria_codigo || data.codigo_cria || "").trim() || undefined;
      const fatherRef = String(data.pai_ref || "").trim() || undefined;
      const hasChildData = Boolean(childSex || childCode || data.cria_nome || data.cria_ref || fatherRef);
      const dados = {
        animal_codigo: capabilityAnimalRef(data),
        mae_ref: capabilityAnimalRef(data),
        evento_reprodutivo_tipo: "parto",
        data_referencia: date,
        observacoes: data.observacoes || data.descricao || undefined,
        parto_cria_decisao_pendente: hasChildData ? undefined : true,
        parto_cria_cadastro: hasChildData || undefined,
        cria_ref: data.cria_ref || undefined,
        cria_codigo: childCode,
        cria_nome: data.cria_nome || undefined,
        cria_sexo: childSex,
        cria_categoria: calfCategoryForSex(childSex),
        pai_ref: fatherRef || undefined,
        pai_nome: fatherRef || undefined,
        pai_nao_informado: hasChildData && !fatherRef ? true : undefined,
        ...metadata
      };
      return finalize("PARTO", dados, buildMissing("PARTO", dados), plan.confidence);
    }
    if (actionPlanDeathCue(eventText)) {
      const dados = {
        animal_codigo: capabilityAnimalRef(data),
        data_referencia: date,
        observacoes: data.observacoes || data.descricao || undefined,
        ...metadata
      };
      return finalize("MORTE", dados, buildMissing("MORTE", dados), plan.confidence);
    }
    if (/\b(vacina|vacin|vermifug|medicamento|remedio|antibiotico|tratamento)\b/.test(eventText)) {
      const eventType = /\b(vacina|vacin)\b/.test(eventText) ? "vacina" : "tratamento";
      const quantity = firstNumber(data, ["quantidade"]);
      const unit = String(firstValue(data, ["unidade"]) || "").trim();
      const dados = {
        animal_codigo: capabilityAnimalRef(data),
        lote_nome: data.lote_ref || data.lote_nome || undefined,
        produto: firstValue(data, ["produto", "item", "medicamento"]) || data.evento || data.tipo || "tratamento",
        dose: data.dose || (quantity !== undefined ? `${quantity}${unit ? ` ${unit}` : ""}` : undefined),
        quantidade: quantity,
        unidade: unit || undefined,
        evento_tipo: eventType,
        data_referencia: date,
        observacoes: data.observacoes || data.descricao || undefined,
        custo: firstNumber(data, ["custo", "valor"]),
        ...metadata
      };
      return finalize("VACINA_MEDICAMENTO", dados, buildMissing("VACINA_MEDICAMENTO", dados), plan.confidence);
    }
    const reproductiveEvent = normalizeReproductionEvent(data.evento || data.tipo_evento || data.tipo || plan.operation);
    if (reproductiveEvent) {
      const eventKind = reproductiveEvent === "EM_PROTOCOLO"
        ? "protocolo"
        : reproductiveEvent === "EM_RETESTE" ? "reteste" : reproductiveEvent.toLowerCase();
      const description = String(data.observacoes || data.descricao || reproductiveEvent.replace(/_/g, " ")).trim();
      const dados = {
        animal_codigo: capabilityAnimalRef(data),
        campo_alterado: "observacoes",
        novo_valor: description,
        descricao: description,
        registro_evento_animal: true,
        evento_tipo: "reprodutivo",
        evento_reprodutivo_tipo: eventKind,
        data_referencia: date,
        custo: firstNumber(data, ["custo", "valor"]),
        ...metadata
      };
      return finalize("ATUALIZACAO_ANIMAL", dados, buildMissing("ATUALIZACAO_ANIMAL", dados), plan.confidence);
    }
    const observation = data.observacoes || data.descricao || data.evento || data.tipo_evento;
    const dados = {
      animal_codigo: capabilityAnimalRef(data),
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

  if (plan.capability === "criar_lote") {
    const dados = {
      lote_nome: firstValue(data, ["lote_nome", "nome"]),
      descricao: data.descricao || data.observacoes || undefined,
      ...metadata
    };
    return finalize("CRIAR_LOTE", dados, buildMissing("CRIAR_LOTE", dados), plan.confidence);
  }

  if (plan.capability === "registrar_ponto_funcionario") {
    const tipo = normalizeRanchoText(String(firstValue(data, ["tipo", "ponto_tipo"]) || plan.operation || "entrada")).includes("saida") ? "saida" : "entrada";
    const dados = {
      funcionario_nome: capabilityEmployeeRef(data),
      ponto_tipo: tipo,
      horario: firstValue(data, ["hora", "horario"]),
      data_referencia: date,
      agora: !data.hora && !data.horario && !data.registrado_em ? true : undefined,
      observacoes: data.observacoes || data.observacao || undefined,
      ...metadata
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados), plan.confidence);
  }

  if (plan.capability === "cadastrar_funcionario") {
    const dados = {
      funcionario_nome: capabilityEmployeeRef(data),
      funcao: data.funcao || data.cargo,
      telefone: data.telefone || data.contato_whatsapp,
      cpf: data.cpf || undefined,
      salario_base: firstNumber(data, ["salario_base", "salario"]),
      data_admissao: data.data_admissao || data.data || date,
      tipo_acesso: data.tipo_acesso || undefined,
      ...metadata
    };
    return finalize("CRIAR_FUNCIONARIO", dados, buildMissing("CRIAR_FUNCIONARIO", dados), plan.confidence);
  }

  if (plan.capability === "atualizar_funcionario") {
    const dados = {
      funcionario_nome: capabilityEmployeeRef(data),
      campo_alterado: data.campo_alterado || data.campo || (data.status ? "status" : undefined),
      novo_valor: firstValue(data, ["novo_valor", "valor", "status", "telefone", "funcao", "cargo", "salario_base", "salario"]),
      data_referencia: date,
      ...metadata
    };
    return finalize("ATUALIZAR_FUNCIONARIO", dados, buildMissing("ATUALIZAR_FUNCIONARIO", dados), plan.confidence);
  }

  if (plan.capability === "registrar_pagamento_funcionario") {
    const dados = {
      funcionario_nome: capabilityEmployeeRef(data),
      valor: firstNumber(data, ["valor", "valor_total"]),
      pagamento_tipo: data.pagamento_tipo || data.tipo || "salario",
      periodo_pagamento: data.periodo_pagamento || data.periodo || "mes_atual",
      data_referencia: date,
      observacoes: data.observacoes || data.descricao || undefined,
      ...metadata
    };
    return finalize("PAGAMENTO_FUNCIONARIO", dados, buildMissing("PAGAMENTO_FUNCIONARIO", dados), plan.confidence);
  }

  if (plan.capability === "atualizar_genealogia") {
    const dados = {
      animal_codigo: capabilityAnimalRef(data) || data.filho_ref || data.cria_ref,
      mae_nome: data.mae_nome || data.mae_ref || undefined,
      pai_nome: data.pai_nome || data.pai_ref || undefined,
      remover_mae: data.remover_mae || undefined,
      remover_pai: data.remover_pai || undefined,
      data_referencia: date,
      ...metadata
    };
    return finalize("ATUALIZACAO_GENEALOGIA", dados, buildMissing("ATUALIZACAO_GENEALOGIA", dados), plan.confidence);
  }

  if (plan.capability === "registrar_ordem_servico") {
    const dados = {
      descricao: data.descricao || data.titulo || data.tarefa,
      data_referencia: date,
      horario: data.horario || undefined,
      responsavel: data.responsavel || data.funcionario_ref || undefined,
      observacoes: data.observacoes || undefined,
      ...metadata
    };
    return finalize("ORDEM_SERVICO", dados, [], plan.confidence);
  }

  return null;
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

  if (input.plan.action === "execute") {
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

    const capabilityPlan = validation.value as ExecuteCapabilityActionPlan;
    if (capabilityPlan.requiresConfirmation === false) {
      const queryPlan = capabilityQueryPlan(capabilityPlan);
      if (!queryPlan) {
        return {
          ok: false,
          status: "clarify",
          reason: "execute_capability_query_domain_missing",
          message: "Preciso saber qual area voce quer consultar.",
          logEvent: "action_plan_invalid"
        };
      }
      const result = await executeQueryActionPlan({
        plan: queryPlan,
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
        parsed: {
          ...result.parsed,
          dados: {
            ...(result.parsed.dados || {}),
            action_plan_capability: capabilityPlan.capability,
            action_plan_capability_query_domain: queryPlan.domain
          }
        },
        response: result.response,
        logEvent: "action_plan_used"
      };
    }

    const parsed = capabilityMutationParsed(capabilityPlan, input.currentDate, input.text);
    if (parsed) {
      return {
        ok: true,
        parsed: {
          ...parsed,
          dados: {
            ...(parsed.dados || {}),
            action_plan_capability: capabilityPlan.capability
          }
        },
        logEvent: "action_plan_used"
      };
    }

    return {
      ok: false,
      status: "clarify",
      reason: "execute_capability_not_integrated",
      message: "Esse tipo de pedido ainda nao esta habilitado para execucao segura.",
      logEvent: "action_plan_invalid"
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
