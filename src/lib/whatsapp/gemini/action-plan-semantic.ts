import type { AnyRecord } from "@/lib/types";
import type { ActionPlan, FilterPlan, SemanticActionPlanBlock } from "@/lib/whatsapp/gemini/action-plan-types";
import { RANCHO_DOMAIN_MANIFEST, type DomainManifest } from "@/lib/whatsapp/gemini/domain-manifest";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function firstValue(...values: unknown[]) {
  return values.find(hasValue);
}

function entityValue(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  return firstValue(value.ref, value.codigo, value.brinco, value.nome, value.id, value.value);
}

function entityText(value: unknown) {
  const resolved = entityValue(value);
  return hasValue(resolved) ? String(resolved).trim() : undefined;
}

function put(data: AnyRecord, key: string, value: unknown, allowedFields?: Set<string>) {
  if (allowedFields && !allowedFields.has(key)) return;
  if (!hasValue(value) || hasValue(data[key])) return;
  data[key] = value;
}

function effectText(effect: unknown) {
  if (!isPlainObject(effect)) return "";
  return normalizeRanchoText([effect.domain, effect.type, effect.target, effect.value].filter(Boolean).join(" "));
}

function semanticText(semantic: SemanticActionPlanBlock | undefined, plan: ActionPlan) {
  if (!semantic) return "";
  const effects = Array.isArray(semantic.effects) ? semantic.effects.map(effectText).join(" ") : "";
  return normalizeRanchoText([
    semantic.intent,
    semantic.scope,
    semantic.operation,
    semantic.report?.type,
    semantic.report?.detailLevel,
    plan.operation,
    effects
  ].filter(Boolean).join(" "));
}

function quantityParts(quantity: SemanticActionPlanBlock["quantity"]) {
  if (isPlainObject(quantity)) return { value: quantity.value, unit: quantity.unit, kind: quantity.kind };
  return { value: quantity };
}

function moneyParts(money: SemanticActionPlanBlock["money"]) {
  if (isPlainObject(money)) return {
    value: money.value,
    type: money.type,
    category: money.category,
    method: money.method
  };
  return { value: money };
}

function addEntityData(data: AnyRecord, semantic: SemanticActionPlanBlock, allowedFields?: Set<string>) {
  const entities = isPlainObject(semantic.entities) ? semantic.entities : {};
  const animal = firstValue(entities.animal, entities.vaca, entities.boi, entities.touro, entities.animal_ref);
  const mother = firstValue(entities.mae, entities.matriz, entities.mae_ref);
  const father = firstValue(entities.pai, entities.touro_pai, entities.pai_ref);
  const child = firstValue(entities.cria, entities.filho, entities.bezerro, entities.bezerra, entities.cria_ref);
  const employee = firstValue(entities.funcionario, entities.funcionaria, entities.colaborador, entities.funcionario_ref);
  const item = firstValue(entities.item, entities.produto, entities.insumo, entities.item_ref);
  const lot = firstValue(entities.lote, entities.piquete, entities.lote_ref);
  const category = firstValue(entities.categoria, entities.categoria_animal, entities.tipo_animal);

  put(data, "animal_ref", entityText(animal) || entityText(mother), allowedFields);
  put(data, "animal_codigo", entityText(animal) || entityText(mother), allowedFields);
  put(data, "brinco", entityText(animal), allowedFields);
  put(data, "mae_ref", entityText(mother), allowedFields);
  put(data, "pai_ref", entityText(father), allowedFields);
  put(data, "funcionario_ref", entityText(employee), allowedFields);
  put(data, "funcionario_nome", entityText(employee), allowedFields);
  put(data, "item", entityText(item), allowedFields);
  put(data, "item_ref", entityText(item), allowedFields);
  put(data, "produto", entityText(item), allowedFields);
  put(data, "nome", entityText(item), allowedFields);
  put(data, "lote_ref", entityText(lot), allowedFields);
  put(data, "lote_nome", entityText(lot), allowedFields);
  put(data, "categoria", entityText(category), allowedFields);

  if (isPlainObject(child)) {
    put(data, "cria_ref", entityText(child), allowedFields);
    put(data, "cria_codigo", firstValue(child.codigo, child.brinco, child.ref, child.id), allowedFields);
    put(data, "cria_nome", child.nome, allowedFields);
    put(data, "cria_sexo", firstValue(child.sexo, child.genero), allowedFields);
    put(data, "sexo_cria", firstValue(child.sexo, child.genero), allowedFields);
  } else {
    put(data, "cria_ref", entityText(child), allowedFields);
  }
}

function addQuantityData(data: AnyRecord, semantic: SemanticActionPlanBlock, plan: ActionPlan, allowedFields?: Set<string>) {
  const quantity = quantityParts(semantic.quantity);
  put(data, "quantidade", quantity.value, allowedFields);
  put(data, "unidade", quantity.unit, allowedFields);
  put(data, "unidade_medida", quantity.unit, allowedFields);
  const text = normalizeRanchoText(String(quantity.unit || quantity.kind || semantic.intent || plan.operation || ""));
  if (plan.domain === "producao_leite" || plan.action === "execute" && plan.capability === "registrar_producao_leite" || /\b(litro|litros|l)\b/.test(text)) {
    put(data, "litros", quantity.value, allowedFields);
  }
}

function addMoneyData(data: AnyRecord, semantic: SemanticActionPlanBlock, allowedFields?: Set<string>) {
  const money = moneyParts(semantic.money);
  put(data, "valor", money.value, allowedFields);
  put(data, "valor_total", money.value, allowedFields);
  put(data, "tipo", money.type, allowedFields);
  put(data, "categoria", money.category, allowedFields);
  put(data, "forma_pagamento", money.method, allowedFields);
  put(data, "metodo_pagamento", money.method, allowedFields);
}

function addEffectData(data: AnyRecord, semantic: SemanticActionPlanBlock, allowedFields?: Set<string>) {
  for (const effect of Array.isArray(semantic.effects) ? semantic.effects : []) {
    if (!isPlainObject(effect)) continue;
    const text = effectText(effect);
    if (text.includes("estoque") && /\b(saida|baixa|venda|consumo|uso)\b/.test(text)) put(data, "tipo_movimento", "saida", allowedFields);
    if (text.includes("estoque") && /\b(entrada|compra|reposicao)\b/.test(text)) put(data, "tipo_movimento", "entrada", allowedFields);
    if (text.includes("financeiro")) {
      put(data, "gera_financeiro", true, allowedFields);
      if (/\b(receita|entrada)\b/.test(text)) put(data, "tipo", "receita", allowedFields);
      if (/\b(despesa|saida)\b/.test(text)) put(data, "tipo", "despesa", allowedFields);
    }
    if (/\b(parto|registrar_parto)\b/.test(text)) {
      put(data, "evento", "parto", allowedFields);
      put(data, "tipo_evento", "parto", allowedFields);
      put(data, "parto_cria_cadastro", true, allowedFields);
    }
    if (/\b(morte|obito)\b/.test(text)) {
      put(data, "evento", "morte", allowedFields);
      put(data, "tipo_evento", "morte", allowedFields);
    }
  }
}

function addReportData(data: AnyRecord, semantic: SemanticActionPlanBlock) {
  if (!isPlainObject(semantic.report)) return;
  put(data, "report_type", semantic.report.type);
  put(data, "relatorio_tipo", semantic.report.type);
  put(data, "detail_level", semantic.report.detailLevel);
  put(data, "relatorio_modo", semantic.report.detailLevel);
  put(data, "include_domains", semantic.report.includeDomains);
  put(data, "exclude_domains", semantic.report.excludeDomains);
}

function semanticData(plan: ActionPlan, manifest: DomainManifest) {
  const semantic = plan.semantic;
  if (!semantic || !isPlainObject(semantic)) return {};
  const domain = "domain" in plan && plan.domain ? manifest[plan.domain] : null;
  const allowedFields = domain && (plan.action === "create" || plan.action === "update")
    ? new Set(Object.keys(domain.fields))
    : undefined;
  const data: AnyRecord = {};

  addEntityData(data, semantic, allowedFields);
  addQuantityData(data, semantic, plan, allowedFields);
  addMoneyData(data, semantic, allowedFields);
  addEffectData(data, semantic, allowedFields);
  addReportData(data, semantic);

  const attributes = isPlainObject(semantic.attributes) ? semantic.attributes : {};
  for (const [key, value] of Object.entries(attributes)) put(data, key, value, allowedFields);

  put(data, "data", semantic.date, allowedFields);
  put(data, "data_referencia", semantic.date, allowedFields);
  put(data, "periodo", semantic.period, allowedFields);

  const text = semanticText(semantic, plan);
  if (/\b(parto|pariu)\b/.test(text)) {
    put(data, "evento", "parto", allowedFields);
    put(data, "tipo_evento", "parto", allowedFields);
  }
  if (/\b(morte|morreu|obito|faleceu)\b/.test(text)) {
    put(data, "evento", "morte", allowedFields);
    put(data, "tipo_evento", "morte", allowedFields);
  }
  if (/\b(vacina|vacinacao)\b/.test(text)) put(data, "evento", "vacina", allowedFields);
  if (/\b(tratamento|medicamento|vermifugo|antibiotico)\b/.test(text)) put(data, "evento", "tratamento", allowedFields);

  return data;
}

function semanticDateFilter(semantic: SemanticActionPlanBlock | undefined): FilterPlan | null {
  if (!semantic || !isPlainObject(semantic)) return null;
  const period = normalizeRanchoText(String(firstValue(semantic.period, semantic.date, semantic.report?.detailLevel) || ""));
  if (!period) return null;
  if (period.includes("hoje")) return { field: "data", op: "last_days", value: 1 };
  if (period.includes("mes")) return { field: "data", op: "current_month" };
  if (period.includes("ano")) return { field: "data", op: "current_year" };
  const days = period.match(/\bultim[oa]s?\s+(\d+)\s+dias?\b/);
  if (days) return { field: "data", op: "last_days", value: Number(days[1]) };
  return null;
}

export function semanticReportType(plan: Pick<ActionPlan, "semantic" | "operation">) {
  const text = semanticText(plan.semantic, plan as ActionPlan);
  if (/\b(eventos?|registros?|ocorrencias?)\b/.test(text)) return "eventos";
  if (/\b(geral|tudo|fazenda|rancho)\b/.test(text)) return "relatorio";
  if (/\b(financeiro|estoque|rebanho|producao|leite|saude|sanitario|reproducao)\b/.test(text)) return "relatorio";
  return undefined;
}

export function semanticPeriod(plan: Pick<ActionPlan, "semantic">) {
  const semantic = plan.semantic;
  if (!semantic || !isPlainObject(semantic)) return undefined;
  const period = firstValue(semantic.period, semantic.date);
  return hasValue(period) ? String(period) : undefined;
}

export function normalizeActionPlanSemantic<T extends ActionPlan>(plan: T, manifest: DomainManifest = RANCHO_DOMAIN_MANIFEST): T {
  if (!isPlainObject(plan.semantic)) return plan;
  const data = semanticData(plan, manifest);
  const operation = plan.operation || plan.semantic.operation || plan.semantic.intent || undefined;

  if (plan.action === "execute") {
    return {
      ...plan,
      operation,
      data: {
        ...data,
        ...(isPlainObject(plan.data) ? plan.data : {})
      }
    } as T;
  }

  if (plan.action === "create" || plan.action === "update") {
    return {
      ...plan,
      operation,
      data: {
        ...data,
        ...(isPlainObject(plan.data) ? plan.data : {})
      }
    } as T;
  }

  if (plan.action === "query") {
    const dateFilter = semanticDateFilter(plan.semantic);
    return {
      ...plan,
      operation,
      data: {
        ...data,
        ...(isPlainObject((plan as unknown as AnyRecord).data) ? (plan as unknown as AnyRecord).data : {})
      },
      filters: Array.isArray(plan.filters) && plan.filters.length
        ? plan.filters
        : dateFilter ? [dateFilter] : plan.filters
    } as T;
  }

  return { ...plan, operation } as T;
}
