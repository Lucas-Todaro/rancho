import type { AnyRecord } from "@/lib/types";
import {
  AGGREGATION_OPERATORS,
  ACTION_PLAN_ACTIONS,
  FILTER_OPERATORS,
  type ActionPlan,
  type AggregationPlan,
  type CreateActionPlan,
  type FilterPlan,
  type ImportTableActionPlan,
  type QueryActionPlan,
  type UpdateActionPlan
} from "@/lib/whatsapp/gemini/action-plan-types";
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

function hasValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function normalizeReproductionValue(fieldName: string, value: unknown) {
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

function normalizePlanForDomain(plan: ActionPlan, domainName: string): ActionPlan {
  if (domainName === "saude_sanitario" && (plan.action === "create" || plan.action === "update")) {
    const data = { ...plan.data };
    if (!hasValue(data.evento) && hasValue(data.tipo)) data.evento = data.tipo;
    if (!hasValue(data.produto) && hasValue(data.item)) data.produto = data.item;
    return { ...plan, data };
  }
  if (domainName !== "reproducao") return plan;

  if (plan.action === "query") {
    return {
      ...plan,
      filters: plan.filters.map((filter) => ({
        ...filter,
        value: normalizeReproductionValue(filter.field, filter.value)
      }))
    };
  }

  if (plan.action === "create" || plan.action === "update") {
    return { ...plan, data: normalizeReproductionData(plan.data) as Record<string, unknown> };
  }

  if (plan.action === "import_table") {
    const columnMapping = { ...(plan.table.columnMapping || {}) };
    if (!columnMapping.animal_ref && columnMapping.mae_ref) columnMapping.animal_ref = columnMapping.mae_ref;
    if (!columnMapping.evento && columnMapping.tipo) columnMapping.evento = columnMapping.tipo;
    return {
      ...plan,
      table: {
        ...plan.table,
        columnMapping,
        defaultFields: normalizeReproductionData(plan.table.defaultFields || {}) as Record<string, unknown>
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
  const received = String(value).trim().toLowerCase();
  const allowed = enumValues.map((item) => String(item).trim().toLowerCase());
  if (!allowed.includes(received)) {
    errors.push(`${path} possui valor enum fora do manifest`);
  }
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
  if (enumValues.length && !["eq", "neq"].includes(filter.op)) {
    errors.push(`${path}.${filter.op} nao e compativel com enum`);
  }
  if (["eq", "neq"].includes(filter.op)) {
    validateEnumValue(domain, filter.field, definition, filter.value, errors, `${path}.value`);
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
    if (domain.domain === "estoque" && action === "create" && required === "item" && (fields.has("item_ref") || fields.has("nome"))) {
      continue;
    }
    if (!fields.has(required)) errors.push(`${action}.${required} obrigatorio para ${domain.domain}`);
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

function validateUpdatePlan(plan: UpdateActionPlan, domain: DomainManifestEntry, errors: string[]) {
  validateConfirmation("update", plan.requiresConfirmation, errors);
  const fields = validateDataObject(domain, plan.data, "update", errors);
  if (plan.filters !== undefined) validateFilters(domain, plan.filters, errors, "filters");
  if (!updateHasTarget(plan, domain)) errors.push("update precisa de filtro ou identificador para evitar update em massa");
  if (fields.size) validateRequiredFields(domain, "update", fields, errors);
}

function validateImportTableCore(
  plan: ImportTableActionPlan,
  domain: DomainManifestEntry,
  parsedTable: ParsedTableForValidation | null | undefined,
  errors: string[]
) {
  validateConfirmation("import_table", plan.requiresConfirmation, errors);
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
  if (errors.length) return invalid(errors.join("; "), warnings, true);

  const action = String(plan.action || "").trim();
  if (action === "delete") return invalid("delete nao e suportado em ActionPlan", warnings, true);
  if (!ACTION_PLAN_ACTIONS.includes(action as never)) return invalid("action inexistente ou nao permitida", warnings);
  if (action === "clarify") return validateClarify(plan, warnings);
  if (action === "block") return validateBlock(plan, warnings);

  const domainName = String(plan.domain || "").trim();
  if (!domainName) errors.push("domain obrigatorio");
  const domain = domainName ? domainFromContext(domainName, manifest) : null;
  if (!domain) errors.push(`domain ${domainName || "(vazio)"} nao existe no manifest`);
  if (domain && !domain.allowedActions.includes(action as never)) {
    errors.push(`${domain.domain} nao permite action ${action}`);
  }

  validateConfidence(plan, minConfidence, errors);
  if (errors.length || !domain) return invalid(errors.join("; "), warnings);

  const normalizedPlan = normalizePlanForDomain({ ...plan } as ActionPlan, domainName);
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
