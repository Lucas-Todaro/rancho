import type { AnyRecord } from "@/lib/types";
import {
  AGGREGATION_OPERATORS,
  ACTION_PLAN_ACTIONS,
  FILTER_OPERATORS,
  type ActionPlan,
  type AggregationPlan,
  type CreateActionPlan,
  type ExecuteCapabilityActionPlan,
  type FilterPlan,
  type ImportTableActionPlan,
  type QueryActionPlan,
  type UpdateActionPlan
} from "@/lib/whatsapp/gemini/action-plan-types";
import {
  capabilityRequiresConfirmation,
  normalizeActionPlanCapability
} from "@/lib/whatsapp/gemini/action-plan-capabilities";
import {
  RANCHO_DOMAIN_MANIFEST,
  type DomainFieldDefinition,
  type DomainManifest,
  type DomainManifestEntry
} from "@/lib/whatsapp/gemini/domain-manifest";
import {
  normalizeDate,
  normalizeReproductionEvent,
  normalizeSex
} from "@/lib/whatsapp/nlp-core/reproduction-normalizers";
import { normalizeActionPlanSemantic } from "@/lib/whatsapp/gemini/action-plan-semantic";

export type ParsedTableForValidation = {
  headers: Array<string | number>;
  rows?: unknown[][];
  hasHeader?: boolean;
};

export type ActionPlanValidationContext = {
  manifest?: DomainManifest;
  minConfidence?: number;
  parsedTable?: ParsedTableForValidation | null;
};

export type ActionPlanValidationResult =
  | {
      ok: true;
      status: "valid" | "clarify" | "blocked";
      value: ActionPlan;
      warnings: string[];
      executable: boolean;
    }
  | {
      ok: false;
      status: "invalid" | "blocked";
      reason: string;
      warnings: string[];
      executable: false;
    };

const DEFAULT_MIN_CONFIDENCE = 0.55;
const TEMPORAL_GROUPS = new Set(["day", "week", "month", "year"]);
const FORBIDDEN_SCOPE_FIELDS = new Set([
  "fazenda_id",
  "rancho_id",
  "ranch_id",
  "client_id",
  "tenant_id",
  "usuario_id",
  "user_id"
]);
const SQL_KEY_PATTERN = /(?:^|_)(?:sql|raw_sql|sql_raw|statement|where_clause)(?:$|_)/i;
const FREE_SQL_PATTERN =
  /\b(?:select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+table|truncate|alter\s+table|create\s+table|grant\s+|revoke\s+|service_role|api[_-]?key|supabase)\b/i;

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizedHeader(value: unknown) {
  return normalizeKey(value).replace(/[^a-z0-9_]/g, "");
}

function normalizedLooseHeader(value: unknown) {
  return normalizeLooseText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

const DATA_META_FIELDS = new Set(["semantic_scope"]);

function stripDataMetaFields(data: unknown) {
  if (!isPlainObject(data)) return data;
  const next: AnyRecord = { ...data };
  DATA_META_FIELDS.forEach((fieldName) => {
    delete next[fieldName];
  });
  return next;
}

function manifestFieldName(domain: DomainManifestEntry, value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (domain.fields[text]) return text;
  const normalized = normalizedHeader(text);
  const loose = normalizedLooseHeader(text);
  return Object.keys(domain.fields).find((fieldName) => (
    normalizedHeader(fieldName) === normalized || normalizedLooseHeader(fieldName) === loose
  )) || null;
}

const FIELD_ALIASES_BY_DOMAIN: Record<string, Record<string, string>> = {
  animais: {
    animal: "animal_ref",
    vaca: "animal_ref",
    codigo: "brinco",
    codigo_animal: "brinco",
    cod: "brinco",
    identificacao: "brinco",
    identificador: "brinco",
    lote: "lote_ref",
    nascimento: "data_nascimento",
    data_nasc: "data_nascimento",
    mae: "mae_ref",
    pai: "pai_ref"
  },
  estoque: {
    produto: "item",
    produto_nome: "item",
    item_nome: "item",
    movimento: "tipo_movimento",
    movimentacao: "tipo_movimento",
    entrada_saida: "tipo_movimento",
    qtd: "quantidade",
    quantidade_atual: "quantidade",
    quantidade_inicial: "quantidade",
    estoque_atual: "quantidade",
    minimo: "quantidade_minima",
    minimo_estoque: "quantidade_minima",
    quantidade_minima: "quantidade_minima",
    unidade_padrao: "unidade",
    preco_unitario: "valor_unitario"
  },
  producao_leite: {
    animal: "animal_ref",
    vaca: "animal_ref",
    codigo: "animal_ref",
    brinco: "animal_ref",
    quantidade: "litros",
    leite: "litros",
    volume: "litros",
    dia: "data"
  },
  financeiro: {
    valor_total: "valor",
    quantia: "valor",
    movimento: "tipo",
    entrada_saida: "tipo",
    pagamento: "metodo_pagamento"
  },
  lotes: {
    lote: "nome",
    ativo_inativo: "ativo"
  },
  funcionarios: {
    funcionario: "nome",
    colaborador: "nome",
    telefone: "contato_whatsapp",
    whatsapp: "contato_whatsapp",
    salario: "salario_base",
    pagamento: "salario_base",
    valor: "salario_base",
    valor_total: "salario_base",
    admissao: "data_admissao",
    data: "data_admissao"
  },
  ponto_funcionario: {
    funcionario: "funcionario_ref",
    colaborador: "funcionario_ref",
    movimento: "tipo",
    horario: "registrado_em"
  },
  saude_sanitario: {
    animal: "animal_ref",
    vaca: "animal_ref",
    codigo: "animal_ref",
    evento_sanitario: "evento",
    medicamento_produto: "produto"
  },
  reproducao: {
    animal: "animal_ref",
    vaca: "animal_ref",
    codigo: "animal_ref",
    mae: "mae_ref",
    pai: "pai_ref",
    evento_reprodutivo: "evento",
    cria: "cria_codigo",
    codigo_cria: "cria_codigo",
    sexo_da_cria: "cria_sexo"
  },
  genealogia: {
    animal: "animal_ref",
    codigo: "animal_ref",
    filho: "filho_ref",
    mae: "mae_ref",
    pai: "pai_ref",
    cria: "cria_codigo",
    sexo_da_cria: "sexo_cria"
  },
  observacoes: {
    texto: "observacao",
    descricao: "observacao",
    animal: "animal_ref",
    item: "item_ref",
    funcionario: "funcionario_ref",
    lote: "lote_ref"
  },
  agenda_tarefas: {
    lembrete: "titulo",
    compromisso: "titulo",
    atividade: "titulo",
    responsavel_nome: "responsavel"
  }
};

const REQUIRED_FIELD_COVERAGE_BY_DOMAIN: Record<string, Record<string, string[]>> = {
  animais: {
    animal_ref: ["animal_ref", "brinco"]
  },
  genealogia: {
    animal_ref: ["animal_ref", "filho_ref", "cria_ref"],
    filho_ref: ["filho_ref", "animal_ref", "cria_ref"]
  },
  funcionarios: {
    funcionario_ref: ["funcionario_ref", "nome"]
  },
  estoque: {
    item: ["item", "item_ref", "nome"]
  }
};

function fieldNameForDomain(domainName: string, domain: DomainManifestEntry, value: unknown) {
  const manifestName = manifestFieldName(domain, value);
  if (manifestName) return manifestName;
  const alias = FIELD_ALIASES_BY_DOMAIN[domainName]?.[normalizedLooseHeader(value)];
  return alias && domain.fields[alias] ? alias : null;
}

function normalizeColumnMappingForDomain(domainName: string, columnMapping: unknown): Record<string, string | number> {
  if (!isPlainObject(columnMapping)) return {};
  const domain = domainFromContext(domainName, RANCHO_DOMAIN_MANIFEST);
  if (!domain) return columnMapping as Record<string, string | number>;
  const normalized: Record<string, string | number> = {};
  for (const [rawKey, rawValue] of Object.entries(columnMapping)) {
    const exactKeyField = domain.fields[rawKey] ? rawKey : null;
    const valueField = typeof rawValue === "string" ? fieldNameForDomain(domainName, domain, rawValue) : null;
    const looseKeyField = fieldNameForDomain(domainName, domain, rawKey);

    if (exactKeyField) {
      normalized[exactKeyField] = rawValue as string | number;
    } else if (valueField) {
      normalized[valueField] = rawKey;
    } else if (looseKeyField) {
      normalized[looseKeyField] = rawValue as string | number;
    } else {
      normalized[rawKey] = rawValue as string | number;
    }
  }
  return normalized;
}

function normalizeReproductionValue(fieldName: string, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeReproductionValue(fieldName, item));
  if (["evento", "tipo"].includes(fieldName)) return normalizeReproductionEvent(value) || value;
  if (["data", "data_evento"].includes(fieldName)) return normalizeDate(value) || value;
  if (["cria_sexo", "sexo_cria"].includes(fieldName)) return normalizeSex(value) || value;
  return value;
}

function normalizeReproductionData(data: unknown) {
  if (!isPlainObject(data)) return data;
  const normalized: AnyRecord = { ...data };
  if (isPlainObject(normalized.cria)) {
    if (!hasValue(normalized.cria_sexo) && hasValue(normalized.cria.sexo)) normalized.cria_sexo = normalized.cria.sexo;
    if (!hasValue(normalized.cria_codigo) && hasValue(normalized.cria.codigo)) normalized.cria_codigo = normalized.cria.codigo;
    if (!hasValue(normalized.cria_nome) && hasValue(normalized.cria.nome)) normalized.cria_nome = normalized.cria.nome;
    delete normalized.cria;
  }
  if (!hasValue(normalized.animal_ref) && hasValue(normalized.mae_ref)) normalized.animal_ref = normalized.mae_ref;
  if (!hasValue(normalized.evento) && hasValue(normalized.tipo)) normalized.evento = normalized.tipo;
  if (!hasValue(normalized.cria_sexo) && hasValue(normalized.sexo_cria)) normalized.cria_sexo = normalized.sexo_cria;
  for (const [fieldName, value] of Object.entries(normalized)) {
    normalized[fieldName] = normalizeReproductionValue(fieldName, value);
  }
  return normalized;
}

function normalizeQueryDataToFilters(
  plan: QueryActionPlan & { data?: unknown },
  domainName: string,
  domain: DomainManifestEntry
): QueryActionPlan {
  const filters: FilterPlan[] = Array.isArray(plan.filters)
    ? plan.filters.map((filter) => {
      if (!isPlainObject(filter)) return filter as FilterPlan;
      const field = fieldNameForDomain(domainName, domain, filter.field) || String(filter.field || "");
      return {
        ...filter,
        field,
        op: (filter.op || "eq") as FilterPlan["op"],
        value: domainName === "reproducao" ? normalizeReproductionValue(field, filter.value) : filter.value
      };
    })
    : [];

  const data = stripDataMetaFields(plan.data);
  if (isPlainObject(data)) {
    for (const [rawField, rawValue] of Object.entries(data)) {
      if (!hasValue(rawValue)) continue;
      const field = fieldNameForDomain(domainName, domain, rawField);
      if (!field) continue;
      if (!domain.searchableFields.includes(field) && !domain.dateFields.includes(field) && !domain.relationFields.includes(field)) continue;
      if (filters.some((filter) => filter.field === field)) continue;
      filters.push({
        field,
        op: "eq",
        value: domainName === "reproducao" ? normalizeReproductionValue(field, rawValue) : rawValue
      });
    }
  }

  return {
    ...plan,
    requiresConfirmation: false,
    filters
  };
}

function normalizeLooseText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isDeathCue(value: unknown) {
  return /\b(?:morte|morreu|morto|morta|obito|faleceu|falecida|falecido|falecimento|registro_morte)\b/.test(normalizeLooseText(value));
}

function normalizeImportRowsForDomain(data: unknown, domainName: string) {
  if (!isPlainObject(data)) return data;
  if (!Array.isArray(data.rows)) return data;
  return {
    ...data,
    rows: data.rows.map((row) => {
      if (!isPlainObject(row)) return row;
      const domain = domainFromContext(domainName, RANCHO_DOMAIN_MANIFEST);
      if (!domain) return domainName === "reproducao" ? normalizeReproductionData(row) : row;
      const normalized: AnyRecord = {};
      for (const [fieldName, value] of Object.entries(row)) {
        const targetField = fieldNameForDomain(domainName, domain, fieldName) || fieldName;
        normalized[targetField] = value;
      }
      return domainName === "reproducao" ? normalizeReproductionData(normalized) : normalized;
    })
  };
}

function normalizePlanForDomain(plan: ActionPlan, domainName: string): ActionPlan {
  if (plan.action === "create" || plan.action === "update") {
    plan = { ...plan, data: stripDataMetaFields(plan.data) as Record<string, unknown> };
  }
  if (plan.action === "import_table") {
    const table: AnyRecord = isPlainObject(plan.table) ? plan.table : {};
    plan = {
      ...plan,
      data: isPlainObject(plan.data)
        ? {
          ...plan.data,
          rows: Array.isArray(plan.data.rows)
            ? plan.data.rows.map((row) => stripDataMetaFields(row))
            : plan.data.rows
        } as ImportTableActionPlan["data"]
        : plan.data,
      table: {
        ...table,
        hasHeader: table.hasHeader === false ? false : true,
        columnMapping: normalizeColumnMappingForDomain(domainName, table.columnMapping),
        defaultFields: stripDataMetaFields(table.defaultFields || {}) as Record<string, unknown>
      }
    };
    plan = {
      ...plan,
      data: normalizeImportRowsForDomain(plan.data || {}, domainName) as ImportTableActionPlan["data"]
    };
  }
  if (plan.action === "query") {
    const domain = domainFromContext(domainName, RANCHO_DOMAIN_MANIFEST);
    if (domain) {
      plan = normalizeQueryDataToFilters(plan as QueryActionPlan & { data?: unknown }, domainName, domain) as ActionPlan;
    }
  }

  if (domainName === "saude_sanitario" && (plan.action === "create" || plan.action === "update")) {
    const data = { ...plan.data };
    if (!hasValue(data.evento) && hasValue(data.tipo)) data.evento = data.tipo;
    if (!hasValue(data.produto) && hasValue(data.item)) data.produto = data.item;
    if (isDeathCue([plan.operation, data.evento, data.tipo, data.descricao, data.observacoes].filter(Boolean).join(" "))) {
      data.evento = "morte";
      data.tipo = "morte";
    }
    return { ...plan, data };
  }
  if (domainName !== "reproducao") return plan;

  if (plan.action === "query") {
    return plan;
  }

  if (plan.action === "create" || plan.action === "update") {
    return { ...plan, data: normalizeReproductionData(plan.data) as Record<string, unknown> };
  }

  if (plan.action === "import_table") {
    const table: AnyRecord = isPlainObject(plan.table) ? plan.table : {};
    const columnMapping = { ...(isPlainObject(table.columnMapping) ? table.columnMapping : {}) };
    if (!columnMapping.animal_ref && columnMapping.mae_ref) columnMapping.animal_ref = columnMapping.mae_ref;
    if (!columnMapping.evento && columnMapping.tipo) columnMapping.evento = columnMapping.tipo;
    return {
      ...plan,
      data: normalizeImportRowsForDomain(plan.data || {}, domainName) as ImportTableActionPlan["data"],
      table: {
        ...table,
        hasHeader: table.hasHeader === false ? false : true,
        columnMapping,
        defaultFields: normalizeReproductionData(table.defaultFields || {}) as Record<string, unknown>
      }
    };
  }

  return plan;
}

function pushUnique(target: string[], message: string) {
  if (!target.includes(message)) target.push(message);
}

function domainFromContext(domain: string, manifest: DomainManifest) {
  return manifest[domain] || null;
}

function fieldDefinition(domain: DomainManifestEntry, fieldName: string): DomainFieldDefinition | null {
  return domain.fields[fieldName] || null;
}

function isNumberField(definition: DomainFieldDefinition | null) {
  return definition?.type === "number";
}

function isDateField(domain: DomainManifestEntry, fieldName: string, definition: DomainFieldDefinition | null) {
  return Boolean(
    definition?.type === "date" ||
    definition?.type === "datetime" ||
    domain.dateFields.includes(fieldName)
  );
}

function isTextLikeField(definition: DomainFieldDefinition | null) {
  return definition?.type === "string" || definition?.type === "relation";
}

function enumValuesFor(domain: DomainManifestEntry, fieldName: string, definition: DomainFieldDefinition | null) {
  return definition?.enumValues || domain.enumFields[fieldName] || [];
}

function validateNoForbiddenScope(value: unknown, errors: string[], path = "plan") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoForbiddenScope(item, errors, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizeKey(key);
    if (FORBIDDEN_SCOPE_FIELDS.has(normalized)) {
      pushUnique(errors, `${path}.${key} nao pode vir do Gemini`);
    }
    if ((key === "field" || key.endsWith("Field")) && FORBIDDEN_SCOPE_FIELDS.has(normalizeKey(nested))) {
      pushUnique(errors, `${path}.${key} nao pode apontar para escopo interno`);
    }
    validateNoForbiddenScope(nested, errors, `${path}.${key}`);
  }
}

function validateNoFreeSql(value: unknown, errors: string[], path = "plan") {
  if (typeof value === "string") {
    if (FREE_SQL_PATTERN.test(value)) pushUnique(errors, `${path} contem SQL livre ou segredo operacional`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateNoFreeSql(item, errors, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (SQL_KEY_PATTERN.test(key)) pushUnique(errors, `${path}.${key} sugere SQL livre`);
    validateNoFreeSql(nested, errors, `${path}.${key}`);
  }
}

function validateConfidence(plan: AnyRecord, minConfidence: number, errors: string[]) {
  if (plan.confidence === undefined || plan.confidence === null || plan.confidence === "") {
    plan.confidence = 0.8;
  }

  if (typeof plan.confidence === "string") {
    const raw = plan.confidence.trim();
    const parsed = Number(raw.replace("%", "").replace(",", "."));
    if (Number.isFinite(parsed)) {
      plan.confidence = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
    }
  }

  if (typeof plan.confidence !== "number" || !Number.isFinite(plan.confidence)) {
    errors.push("confidence deve ser numero");
    return;
  }
  if (plan.confidence < minConfidence) {
    errors.push(`confidence abaixo do minimo ${minConfidence}`);
  }
  if (plan.confidence > 1 || plan.confidence < 0) {
    errors.push("confidence deve estar entre 0 e 1");
  }
}

function validateFieldExists(domain: DomainManifestEntry, fieldName: unknown, errors: string[], path: string) {
  const field = String(fieldName || "").trim();
  if (!field) {
    errors.push(`${path} deve informar campo`);
    return null;
  }
  const definition = fieldDefinition(domain, field);
  if (!definition) {
    errors.push(`${path}.${field} nao existe no manifest de ${domain.domain}`);
    return null;
  }
  return definition;
}

function validateEnumValue(
  domain: DomainManifestEntry,
  fieldName: string,
  definition: DomainFieldDefinition | null,
  value: unknown,
  errors: string[],
  path: string
) {
  const enumValues = enumValuesFor(domain, fieldName, definition);
  if (!enumValues.length || !hasValue(value)) return;
  const received = normalizeLooseText(value).replace(/\s+/g, "_");
  const allowed = enumValues.map((item) => normalizeLooseText(item).replace(/\s+/g, "_"));
  if (!allowed.includes(received)) {
    errors.push(`${path} possui valor enum fora do manifest`);
  }
}

function validateEnumFilterValue(
  domain: DomainManifestEntry,
  fieldName: string,
  definition: DomainFieldDefinition | null,
  value: unknown,
  errors: string[],
  path: string
) {
  const values = Array.isArray(value) ? value : [value];
  values.forEach((item, index) => validateEnumValue(
    domain,
    fieldName,
    definition,
    item,
    errors,
    Array.isArray(value) ? `${path}[${index}]` : path
  ));
}

function validateFilterOperator(
  domain: DomainManifestEntry,
  filter: FilterPlan,
  definition: DomainFieldDefinition | null,
  errors: string[],
  path: string
) {
  if (!FILTER_OPERATORS.includes(filter.op)) {
    errors.push(`${path}.op nao permitido`);
    return;
  }

  const isDate = isDateField(domain, filter.field, definition);
  const isNumber = isNumberField(definition);
  const isText = isTextLikeField(definition);
  const enumValues = enumValuesFor(domain, filter.field, definition);

  if (["last_days", "last_months", "current_month", "current_year", "since"].includes(filter.op) && !isDate) {
    errors.push(`${path}.${filter.op} so pode ser usado em campo de data`);
  }
  if (filter.op === "contains" && !isText) {
    errors.push(`${path}.contains exige campo textual ou relacional`);
  }
  if (["gte", "lte", "between"].includes(filter.op) && !isDate && !isNumber) {
    errors.push(`${path}.${filter.op} exige campo numerico ou data`);
  }
  if (enumValues.length && !["eq", "neq", "in"].includes(filter.op)) {
    errors.push(`${path}.${filter.op} nao e compativel com enum`);
  }
  if (["eq", "neq", "in"].includes(filter.op)) {
    validateEnumFilterValue(domain, filter.field, definition, filter.value, errors, `${path}.value`);
  }
  if (filter.op === "in") {
    const values = Array.isArray(filter.value) ? filter.value : [filter.value];
    if (!values.length || values.some((item) => !hasValue(item))) {
      errors.push(`${path}.value deve informar ao menos um valor para in`);
    }
  }
  if (["last_days", "last_months"].includes(filter.op)) {
    if (typeof filter.value !== "number" || !Number.isInteger(filter.value) || filter.value <= 0) {
      errors.push(`${path}.value deve ser inteiro positivo para ${filter.op}`);
    }
  }
  if (filter.op === "between") {
    const validArray = Array.isArray(filter.value) && filter.value.length === 2;
    const validObject = isPlainObject(filter.value) && hasValue(filter.value.from) && hasValue(filter.value.to);
    if (!validArray && !validObject) errors.push(`${path}.value deve ter intervalo com dois limites`);
  }
  if (["eq", "neq", "contains", "gte", "lte", "since"].includes(filter.op) && !hasValue(filter.value)) {
    errors.push(`${path}.value obrigatorio para ${filter.op}`);
  }
}

function validateFilters(domain: DomainManifestEntry, filters: unknown, errors: string[], path: string) {
  if (!Array.isArray(filters)) {
    errors.push(`${path} deve ser array`);
    return;
  }
  filters.forEach((filter, index) => {
    const filterPath = `${path}[${index}]`;
    if (!isPlainObject(filter)) {
      errors.push(`${filterPath} deve ser objeto`);
      return;
    }
    const definition = validateFieldExists(domain, filter.field, errors, `${filterPath}.field`);
    if (definition) validateFilterOperator(domain, filter as FilterPlan, definition, errors, filterPath);
  });
}

function validateAggregation(domain: DomainManifestEntry, aggregation: AggregationPlan, errors: string[], path: string) {
  if (!AGGREGATION_OPERATORS.includes(aggregation.op)) {
    errors.push(`${path}.op nao permitido`);
    return;
  }
  const definition = validateFieldExists(domain, aggregation.field, errors, `${path}.field`);
  if (!definition) return;
  const isAggregatable = domain.aggregatableFields.includes(aggregation.field);
  const isCountId = aggregation.op === "count" && aggregation.field === "id";
  if (!isAggregatable && !isCountId) {
    errors.push(`${path}.${aggregation.field} nao e aggregatable`);
    return;
  }
  if (aggregation.op !== "count" && !isNumberField(definition)) {
    errors.push(`${path}.${aggregation.field} precisa ser numerico para ${aggregation.op}`);
  }
}

function validateSelect(domain: DomainManifestEntry, select: unknown, errors: string[], path: string) {
  if (select === undefined) return;
  if (!Array.isArray(select)) {
    errors.push(`${path} deve ser array`);
    return;
  }
  select.forEach((fieldName, index) => validateFieldExists(domain, fieldName, errors, `${path}[${index}]`));
}

function validateGroupBy(domain: DomainManifestEntry, groupBy: unknown, errors: string[], path: string) {
  if (groupBy === undefined) return;
  if (!Array.isArray(groupBy)) {
    errors.push(`${path} deve ser array`);
    return;
  }
  groupBy.forEach((value, index) => {
    const fieldName = String(value || "").trim();
    if (TEMPORAL_GROUPS.has(fieldName)) {
      if (!domain.dateFields.length) errors.push(`${path}[${index}] grupo temporal exige campo de data no dominio`);
      return;
    }
    validateFieldExists(domain, fieldName, errors, `${path}[${index}]`);
  });
}

function validateOrderBy(domain: DomainManifestEntry, orderBy: unknown, errors: string[]) {
  if (orderBy === undefined) return;
  if (!isPlainObject(orderBy)) {
    errors.push("orderBy deve ser objeto");
    return;
  }
  validateFieldExists(domain, orderBy.field, errors, "orderBy.field");
  if (orderBy.direction !== "asc" && orderBy.direction !== "desc") {
    errors.push("orderBy.direction deve ser asc ou desc");
  }
}

function validateRequiredFields(
  domain: DomainManifestEntry,
  action: "create" | "update" | "import_table",
  fields: Set<string>,
  errors: string[]
) {
  for (const required of domain.requiredFieldsByAction[action] || []) {
    const coverage = REQUIRED_FIELD_COVERAGE_BY_DOMAIN[domain.domain]?.[required] || [required];
    if (!coverage.some((fieldName) => fields.has(fieldName))) {
      errors.push(`${action}.${required} obrigatorio para ${domain.domain}`);
    }
  }
}

function validateDataObject(
  domain: DomainManifestEntry,
  data: unknown,
  action: "create" | "update",
  errors: string[]
) {
  if (!isPlainObject(data)) {
    errors.push(`${action}.data deve ser objeto`);
    return new Set<string>();
  }

  const fields = new Set<string>();
  for (const [fieldName, value] of Object.entries(data)) {
    const definition = validateFieldExists(domain, fieldName, errors, `${action}.data`);
    if (!definition) continue;
    fields.add(fieldName);
    validateEnumValue(domain, fieldName, definition, value, errors, `${action}.data.${fieldName}`);
  }
  if (!fields.size) errors.push(`${action}.data nao pode ser vazio`);
  return fields;
}

function tableHeaders(parsedTable?: ParsedTableForValidation | null) {
  return (parsedTable?.headers || []).map((header) => String(header));
}

function columnExists(column: string | number, headers: string[]) {
  if (typeof column === "number") return Number.isInteger(column) && column >= 0 && column < headers.length;
  const normalized = normalizedHeader(column);
  return headers.some((header) => normalizedHeader(header) === normalized);
}

function validateColumnReference(column: unknown, headers: string[], errors: string[], path: string) {
  if (typeof column !== "string" && typeof column !== "number") {
    errors.push(`${path} deve apontar para coluna por nome ou indice`);
    return;
  }
  if (!headers.length) {
    errors.push(`${path} nao pode ser validado sem headers da tabela`);
    return;
  }
  if (!columnExists(column, headers)) {
    errors.push(`${path} aponta para coluna inexistente`);
  }
}

function validateConfirmation(action: string, requiresConfirmation: unknown, errors: string[]) {
  if (action === "query" && requiresConfirmation !== false) {
    errors.push("query exige requiresConfirmation=false");
  }
  if (["create", "update", "import_table"].includes(action) && requiresConfirmation !== true) {
    errors.push(`${action} exige requiresConfirmation=true`);
  }
}

function validateQueryPlan(plan: QueryActionPlan, domain: DomainManifestEntry, errors: string[], warnings: string[]) {
  validateConfirmation("query", plan.requiresConfirmation, errors);
  validateFilters(domain, plan.filters, errors, "filters");
  validateSelect(domain, plan.select, errors, "select");
  if (plan.aggregations !== undefined) {
    if (!Array.isArray(plan.aggregations)) errors.push("aggregations deve ser array");
    else plan.aggregations.forEach((aggregation, index) => validateAggregation(domain, aggregation, errors, `aggregations[${index}]`));
  }
  validateGroupBy(domain, plan.groupBy, errors, "groupBy");
  validateOrderBy(domain, plan.orderBy, errors);
  if (plan.limit !== undefined) {
    if (typeof plan.limit !== "number" || !Number.isInteger(plan.limit) || plan.limit <= 0) {
      errors.push("limit deve ser inteiro positivo");
    } else if (plan.limit > domain.maxLimit) {
      plan.limit = domain.maxLimit;
      warnings.push(`limit limitado a ${domain.maxLimit}`);
    }
  }
}

function validateCreatePlan(plan: CreateActionPlan, domain: DomainManifestEntry, errors: string[]) {
  validateConfirmation("create", plan.requiresConfirmation, errors);
  const fields = validateDataObject(domain, plan.data, "create", errors);
  validateRequiredFields(domain, "create", fields, errors);
}

function updateHasTarget(plan: UpdateActionPlan, domain: DomainManifestEntry) {
  const data = isPlainObject(plan.data) ? plan.data : {};
  if (Object.keys(data).some((fieldName) => domain.relationFields.includes(fieldName) || /_ref$|_id$/.test(fieldName))) return true;
  return Array.isArray(plan.filters) && plan.filters.length > 0;
}

function fieldsFromEqFilters(plan: UpdateActionPlan, domain: DomainManifestEntry) {
  const fields = new Set<string>();
  if (!Array.isArray(plan.filters)) return fields;
  for (const filter of plan.filters) {
    if (!filter || filter.op !== "eq" || !hasValue(filter.value)) continue;
    if (fieldDefinition(domain, filter.field)) fields.add(filter.field);
  }
  return fields;
}

function validateUpdatePlan(plan: UpdateActionPlan, domain: DomainManifestEntry, errors: string[]) {
  validateConfirmation("update", plan.requiresConfirmation, errors);
  const fields = validateDataObject(domain, plan.data, "update", errors);
  if (plan.filters !== undefined) validateFilters(domain, plan.filters, errors, "filters");
  if (!updateHasTarget(plan, domain)) errors.push("update precisa de filtro ou identificador para evitar update em massa");
  if (fields.size) {
    const targetFields = fieldsFromEqFilters(plan, domain);
    validateRequiredFields(domain, "update", new Set(Array.from(fields).concat(Array.from(targetFields))), errors);
  }
}

function validateImportTableCore(
  plan: ImportTableActionPlan,
  domain: DomainManifestEntry,
  parsedTable: ParsedTableForValidation | null | undefined,
  errors: string[]
) {
  validateConfirmation("import_table", plan.requiresConfirmation, errors);
  const dataRows = isPlainObject(plan.data) && Array.isArray(plan.data.rows) ? plan.data.rows : null;
  if (dataRows) {
    if (!dataRows.length) errors.push("import_table.data.rows nao pode ser vazio");
    const mappedFields = new Set<string>();
    dataRows.slice(0, 120).forEach((row, rowIndex) => {
      if (!isPlainObject(row)) {
        errors.push(`import_table.data.rows[${rowIndex}] deve ser objeto`);
        return;
      }
      for (const [fieldName, value] of Object.entries(row)) {
        const definition = validateFieldExists(domain, fieldName, errors, `import_table.data.rows[${rowIndex}]`);
        if (!definition) continue;
        mappedFields.add(fieldName);
        validateEnumValue(domain, fieldName, definition, value, errors, `import_table.data.rows[${rowIndex}].${fieldName}`);
      }
    });
    validateRequiredFields(domain, "import_table", mappedFields, errors);
    return;
  }

  if (!isPlainObject(plan.table)) {
    errors.push("table deve ser objeto");
    return;
  }
  if (typeof plan.table.hasHeader !== "boolean") errors.push("table.hasHeader deve ser boolean");
  if (!isPlainObject(plan.table.columnMapping) || !Object.keys(plan.table.columnMapping).length) {
    errors.push("table.columnMapping nao pode ser vazio");
    return;
  }

  const headers = tableHeaders(parsedTable);
  const mappedFields = new Set<string>();
  for (const [canonicalField, originalColumn] of Object.entries(plan.table.columnMapping)) {
    const definition = validateFieldExists(domain, canonicalField, errors, `table.columnMapping.${canonicalField}`);
    if (definition) mappedFields.add(canonicalField);
    validateColumnReference(originalColumn, headers, errors, `table.columnMapping.${canonicalField}`);
  }

  if (plan.table.defaultFields !== undefined) {
    if (!isPlainObject(plan.table.defaultFields)) {
      errors.push("table.defaultFields deve ser objeto");
    } else {
      for (const [fieldName, value] of Object.entries(plan.table.defaultFields)) {
        const definition = validateFieldExists(domain, fieldName, errors, `table.defaultFields.${fieldName}`);
        if (!definition) continue;
        mappedFields.add(fieldName);
        validateEnumValue(domain, fieldName, definition, value, errors, `table.defaultFields.${fieldName}`);
      }
    }
  }

  for (const [listName, list] of Object.entries({
    ignoredColumns: plan.table.ignoredColumns,
    ambiguousColumns: plan.table.ambiguousColumns
  })) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`table.${listName} deve ser array`);
      continue;
    }
    list.forEach((column, index) => validateColumnReference(column, headers, errors, `table.${listName}[${index}]`));
  }

  validateRequiredFields(domain, "import_table", mappedFields, errors);
}

function invalid(reason: string, warnings: string[] = [], blocked = false): ActionPlanValidationResult {
  return {
    ok: false,
    status: blocked ? "blocked" : "invalid",
    reason,
    warnings,
    executable: false
  };
}

function validateClarify(plan: AnyRecord, warnings: string[]): ActionPlanValidationResult {
  const errors: string[] = [];
  const question = typeof plan.userQuestion === "string" && plan.userQuestion.trim()
    ? plan.userQuestion.trim()
    : typeof plan.question === "string" ? plan.question.trim() : "";
  if (!question) errors.push("clarify.userQuestion obrigatorio");
  if (plan.options !== undefined && (!Array.isArray(plan.options) || plan.options.some((item) => typeof item !== "string" || !item.trim()))) {
    errors.push("clarify.options deve ser array de textos");
  }
  if (errors.length) return invalid(errors.join("; "), warnings);
  return {
    ok: true,
    status: "clarify",
    value: { ...plan, question, userQuestion: question, requiresConfirmation: false } as ActionPlan,
    warnings,
    executable: false
  };
}

function validateBlock(plan: AnyRecord, warnings: string[]): ActionPlanValidationResult {
  const errors: string[] = [];
  const reason = typeof plan.safety?.reason === "string" && plan.safety.reason.trim()
    ? plan.safety.reason.trim()
    : typeof plan.reason === "string" ? plan.reason.trim() : "";
  const userMessage = typeof plan.userMessage === "string" && plan.userMessage.trim()
    ? plan.userMessage.trim()
    : "Nao posso executar esse pedido com seguranca.";
  if (!reason) errors.push("block.safety.reason obrigatorio");
  if (errors.length) return invalid(errors.join("; "), warnings, true);
  return {
    ok: true,
    status: "blocked",
    value: {
      ...plan,
      reason,
      userMessage,
      requiresConfirmation: false,
      safety: { risk: "high", ...(isPlainObject(plan.safety) ? plan.safety : {}), reason }
    } as ActionPlan,
    warnings,
    executable: false
  };
}

function queryLooksReproductive(plan: AnyRecord) {
  if (plan.action !== "query") return false;
  const raw = [
    plan.operation,
    plan.userQuestion,
    plan.semantic?.intent,
    plan.semantic?.scope,
    plan.semantic?.operation,
    plan.semantic?.report?.type,
    ...(Array.isArray(plan.filters)
      ? plan.filters.flatMap((filter) => isPlainObject(filter) ? [filter.field, filter.value] : [])
      : [])
  ].flat().filter(Boolean).join(" ");
  return /\b(?:prenhas?|prenhe|prenhez|gestantes?|inseminad[ao]s?|inseminacao|iatf|protocolo|reteste|paridas?|partos?|cio|reproducao|status_reprodutivo)\b/.test(normalizeLooseText(raw));
}

function normalizeDomainNameForPlan(plan: AnyRecord, domainName: string, manifest: DomainManifest) {
  if (domainName === "animais" && queryLooksReproductive(plan) && manifest.reproducao) return "reproducao";
  return domainName;
}

function validateDomainList(list: unknown, manifest: DomainManifest, errors: string[], path: string) {
  if (list === undefined) return;
  if (!Array.isArray(list)) {
    errors.push(`${path} deve ser array`);
    return;
  }
  list.forEach((domain, index) => {
    const name = String(domain || "").trim();
    if (!name || !manifest[name]) errors.push(`${path}[${index}] deve ser dominio valido do manifest`);
  });
}

function validateSemanticBlock(semantic: unknown, manifest: DomainManifest, errors: string[]) {
  if (semantic === undefined) return;
  if (!isPlainObject(semantic)) {
    errors.push("semantic deve ser objeto");
    return;
  }
  validateDomainList(semantic.domains, manifest, errors, "semantic.domains");
  if (semantic.report !== undefined) {
    if (!isPlainObject(semantic.report)) {
      errors.push("semantic.report deve ser objeto");
    } else {
      validateDomainList(semantic.report.includeDomains, manifest, errors, "semantic.report.includeDomains");
      validateDomainList(semantic.report.excludeDomains, manifest, errors, "semantic.report.excludeDomains");
    }
  }
  if (semantic.effects !== undefined) {
    if (!Array.isArray(semantic.effects)) {
      errors.push("semantic.effects deve ser array");
    } else {
      semantic.effects.forEach((effect, index) => {
        if (!isPlainObject(effect)) {
          errors.push(`semantic.effects[${index}] deve ser objeto`);
          return;
        }
        const domain = String(effect.domain || "").trim();
        const type = String(effect.type || "").trim();
        if (!domain || !manifest[domain]) errors.push(`semantic.effects[${index}].domain deve ser dominio valido do manifest`);
        if (!type) errors.push(`semantic.effects[${index}].type obrigatorio`);
      });
    }
  }
  if (semantic.missingFields !== undefined && (!Array.isArray(semantic.missingFields) || semantic.missingFields.some((field) => typeof field !== "string" || !field.trim()))) {
    errors.push("semantic.missingFields deve ser array de textos");
  }
}

function validateExecuteCapability(plan: AnyRecord, minConfidence: number, warnings: string[]): ActionPlanValidationResult {
  const errors: string[] = [];
  const capability = normalizeActionPlanCapability(plan.capability || plan.operation);
  if (!capability) errors.push("execute.capability inexistente ou nao permitida");
  validateConfidence(plan, minConfidence, errors);
  if (!isPlainObject(plan.data)) errors.push("execute.data deve ser objeto");
  if (capability) {
    const requiresConfirmation = capabilityRequiresConfirmation(capability);
    if (plan.requiresConfirmation !== requiresConfirmation) {
      warnings.push(`execute.${capability} teve requiresConfirmation normalizado para ${requiresConfirmation}`);
      plan.requiresConfirmation = requiresConfirmation;
    }
  }
  if (errors.length) return invalid(errors.join("; "), warnings);
  return {
    ok: true,
    status: "valid",
    value: {
      ...plan,
      capability,
      data: { ...plan.data },
      requiresConfirmation: capability ? capabilityRequiresConfirmation(capability) : Boolean(plan.requiresConfirmation)
    } as ExecuteCapabilityActionPlan,
    warnings,
    executable: true
  };
}

export function validateImportTableActionPlan(
  plan: unknown,
  parsedTable: ParsedTableForValidation,
  manifest: DomainManifest = RANCHO_DOMAIN_MANIFEST
): ActionPlanValidationResult {
  return validateActionPlan(plan, { manifest, parsedTable });
}

export function validateActionPlan(plan: unknown, context: ActionPlanValidationContext = {}): ActionPlanValidationResult {
  const manifest = context.manifest || RANCHO_DOMAIN_MANIFEST;
  const minConfidence = context.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isPlainObject(plan)) return invalid("ActionPlan deve ser objeto");

  validateNoForbiddenScope(plan, errors);
  validateNoFreeSql(plan, errors);
  validateSemanticBlock(plan.semantic, manifest, errors);
  if (errors.length) return invalid(errors.join("; "), warnings, true);

  const normalizedInput = normalizeActionPlanSemantic(plan as ActionPlan, manifest) as AnyRecord;
  const action = String(normalizedInput.action || "").trim();
  if (action === "delete") return invalid("delete nao e suportado em ActionPlan", warnings, true);
  if (!ACTION_PLAN_ACTIONS.includes(action as never)) return invalid("action inexistente ou nao permitida", warnings);
  if (action === "clarify") return validateClarify(normalizedInput, warnings);
  if (action === "block") return validateBlock(normalizedInput, warnings);
  if (action === "execute") return validateExecuteCapability(normalizedInput, minConfidence, warnings);

  const rawDomainName = String(normalizedInput.domain || "").trim();
  const domainName = normalizeDomainNameForPlan(normalizedInput, rawDomainName, manifest);
  if (domainName !== rawDomainName) normalizedInput.domain = domainName;
  if (!domainName) errors.push("domain obrigatorio");
  const domain = domainName ? domainFromContext(domainName, manifest) : null;
  if (!domain) errors.push(`domain ${domainName || "(vazio)"} nao existe no manifest`);
  if (domain && !domain.allowedActions.includes(action as never)) {
    errors.push(`${domain.domain} nao permite action ${action}`);
  }

  validateConfidence(normalizedInput, minConfidence, errors);
  if (errors.length || !domain) return invalid(errors.join("; "), warnings);

  const normalizedPlan = normalizePlanForDomain({ ...normalizedInput } as ActionPlan, domainName);
  if (action === "query") validateQueryPlan(normalizedPlan as QueryActionPlan, domain, errors, warnings);
  if (action === "create") validateCreatePlan(normalizedPlan as CreateActionPlan, domain, errors);
  if (action === "update") validateUpdatePlan(normalizedPlan as UpdateActionPlan, domain, errors);
  if (action === "import_table") {
    validateImportTableCore(normalizedPlan as ImportTableActionPlan, domain, context.parsedTable, errors);
  }

  if (errors.length) return invalid(errors.join("; "), warnings);
  return {
    ok: true,
    status: "valid",
    value: normalizedPlan,
    warnings,
    executable: action !== "query" && action !== "import_table" && action !== "create" && action !== "update" ? false : true
  };
}
