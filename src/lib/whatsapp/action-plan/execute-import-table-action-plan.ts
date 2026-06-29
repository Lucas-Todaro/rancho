import type { AnyRecord } from "@/lib/types";
import { getRanchTodayISO, parseUserDateToRanchDate } from "@/lib/dates/ranch-time";
import type { ImportTableActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import { validateImportTableActionPlan, type ParsedTableForValidation } from "@/lib/whatsapp/gemini/action-plan-validator";
import { getDomainManifest, type DomainManifestEntry } from "@/lib/whatsapp/gemini/domain-manifest";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import { finalizeActionPlanParsed } from "@/lib/whatsapp/action-plan/action-plan-to-parsed";
import {
  classifyReproductionImportChild,
  reproductionImportChildSummary,
  warningCodesForChildStatus
} from "@/lib/whatsapp/action-plan/reproduction-import-child";
import {
  normalizeReproductiveEventType,
  reproductiveEventDbType,
  reproductiveEventLabel
} from "@/lib/whatsapp/nlp-core/reproductive-events";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

export type ExecuteImportTableActionPlanInput = {
  plan: ImportTableActionPlan;
  text: string;
};

export type ExecuteImportTableActionPlanResult =
  | {
      ok: true;
      parsed: ParsedRanchoMessage;
      preview: string;
      rows: AnyRecord[];
      parsedTable: ParsedTableForValidation;
    }
  | {
      ok: false;
      status: "clarify" | "blocked";
      reason: string;
      message: string;
    };

const TABULAR_DOMAIN_BY_ACTION_DOMAIN: Record<string, string> = {
  animais: "REBANHO_ANIMAIS",
  lotes: "LOTES",
  genealogia: "GENEALOGIA",
  reproducao: "REPRODUCAO",
  producao_leite: "PRODUCAO_LEITE",
  estoque: "ESTOQUE",
  financeiro: "FINANCEIRO",
  funcionarios: "FUNCIONARIOS",
  ponto_funcionario: "PONTO_FUNCIONARIO",
  saude_sanitario: "SAUDE_SANITARIO",
  observacoes: "OBSERVACOES",
  agenda_tarefas: "AGENDA_TAREFAS"
};

function splitRows(text: string, separator?: string) {
  const lines = String(text || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sep = separator || (lines[0]?.includes(";") ? ";" : lines[0]?.includes("|") ? "|" : lines[0]?.includes("\t") ? "\t" : lines[0]?.includes(":") ? ":" : ",");
  return {
    separator: sep,
    lines,
    rows: lines.map((line) => line.split(sep).map((cell) => cell.trim()))
  };
}

export function parseStructuredTableForActionPlan(text: string, separator?: string, hasHeader = true): ParsedTableForValidation {
  const parsed = splitRows(text, separator);
  const firstRow = parsed.rows[0] || [];
  return {
    headers: hasHeader ? firstRow : firstRow.map((_cell, index) => index),
    rows: hasHeader ? parsed.rows.slice(1) : parsed.rows,
    hasHeader
  };
}

function columnIndex(headers: Array<string | number>, reference: string | number) {
  if (typeof reference === "number") return reference;
  const normalized = String(reference).trim().toLowerCase();
  return headers.findIndex((header) => String(header).trim().toLowerCase() === normalized);
}

function parseNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value || "").replace(/[^0-9,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return null;
  const ranchDate = parseUserDateToRanchDate(text);
  if (ranchDate) return ranchDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dateMatch = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, "0");
    const month = dateMatch[2].padStart(2, "0");
    const year = dateMatch[3].length === 2 ? `20${dateMatch[3]}` : dateMatch[3];
    return `${year}-${month}-${day}`;
  }
  return text;
}

function parseValue(domain: DomainManifestEntry, field: string, value: unknown) {
  const definition = domain.fields[field];
  if (!definition) return value;
  if (definition.type === "number") return parseNumber(value);
  if (definition.type === "date" || definition.type === "datetime") return parseDate(value);
  if (definition.type === "boolean") {
    const text = normalizeRanchoText(String(value || "").trim());
    if (["true", "sim", "1", "ativo"].includes(text)) return true;
    if (["false", "nao", "não", "0", "inativo"].includes(text)) return false;
  }
  if (definition.type === "enum") {
    const text = String(value || "").trim();
    const normalizedText = normalizeRanchoText(text).replace(/\s+/g, "_");
    const enumValues = definition.enumValues || domain.enumFields[field] || [];
    const matched = enumValues.find((item) => normalizeRanchoText(item).replace(/\s+/g, "_") === normalizedText);
    return matched || text;
  }
  return String(value || "").trim();
}

function mappedRows(plan: ImportTableActionPlan, domain: DomainManifestEntry, parsedTable: ParsedTableForValidation) {
  const headers = parsedTable.headers || [];
  const dataRows = (parsedTable.rows || []) as string[][];
  return dataRows.map((cells, index) => {
    const values: AnyRecord = { ...(plan.table.defaultFields || {}) };
    const parsedValues: AnyRecord = {};
    for (const [field, originalColumn] of Object.entries(plan.table.columnMapping || {})) {
      const indexInRow = columnIndex(headers, originalColumn);
      const rawValue = indexInRow >= 0 ? cells[indexInRow] : "";
      values[field] = rawValue;
    }
    if (domain.fields.data && !String(values.data || "").trim()) values.data = getRanchTodayISO();
    for (const [field, value] of Object.entries(values)) {
      parsedValues[field] = parseValue(domain, field, value);
    }
    return {
      lineNumber: index + (parsedTable.hasHeader === false ? 1 : 2),
      rawText: cells.join(";"),
      values,
      parsedValues
    };
  });
}

function missingRequired(row: AnyRecord, domain: DomainManifestEntry) {
  return (domain.requiredFieldsByAction.import_table || [])
    .filter((field) => {
      const value = row.parsedValues?.[field] ?? row.values?.[field];
      return value === undefined || value === null || String(value).trim() === "";
    });
}

function genericRows(rows: AnyRecord[], domain: DomainManifestEntry) {
  return rows.map((row) => {
    const missing = missingRequired(row, domain);
    const invalid = Object.entries(row.parsedValues || {})
      .filter(([field, value]) => domain.fields[field]?.type === "number" && value === null)
      .map(([field]) => `${field}_invalido`);
    const problemas = Array.from(new Set([...missing.map((field) => `${field}_ausente`), ...invalid]));
    return {
      ...row,
      status_linha: problemas.length ? "invalido" : "pronto",
      problemas,
      avisos: []
    };
  });
}

function metricsFor(domain: string, rows: AnyRecord[]) {
  if (domain === "financeiro") {
    return rows.reduce((metrics, row) => {
      const type = String(row.parsedValues?.tipo || row.values?.tipo || "").toLowerCase();
      const value = Number(row.parsedValues?.valor || 0);
      if (["receita", "entrada"].includes(type)) metrics.receitas += value;
      else if (["despesa", "saida"].includes(type)) metrics.despesas += value;
      else metrics.tipo_indefinido += 1;
      return metrics;
    }, { receitas: 0, despesas: 0, saldo: 0, tipo_indefinido: 0 });
  }
  if (domain === "producao_leite") {
    return { total_litros: rows.reduce((sum, row) => sum + Number(row.parsedValues?.litros || 0), 0) };
  }
  if (domain === "estoque") {
    return rows.reduce((metrics, row) => {
      const type = stockMovement(row.parsedValues?.tipo_movimento || row.values?.tipo_movimento);
      if (type === "entrada") metrics.entradas += 1;
      else if (type === "saida") metrics.saidas += 1;
      if (!row.parsedValues?.valor_total) metrics.itens_sem_valor_financeiro += 1;
      return metrics;
    }, { entradas: 0, saidas: 0, itens_sem_valor_financeiro: 0 });
  }
  if (domain === "animais") return { animais: rows.length };
  if (domain === "lotes") return { lotes: rows.length };
  if (domain === "genealogia") return { vinculos: rows.length };
  if (domain === "reproducao") return { eventos: rows.length };
  if (domain === "funcionarios") return { funcionarios: rows.length };
  if (domain === "saude_sanitario") return { procedimentos: rows.length };
  if (domain === "agenda_tarefas") return { tarefas: rows.length };
  return { linhas: rows.length };
}

function previewText(domain: string, rows: AnyRecord[], metrics: AnyRecord) {
  if (domain === "financeiro") {
    const saldo = Number(metrics.receitas || 0) - Number(metrics.despesas || 0);
    return `Li a tabela e preparei a importação financeira: ${rows.length} linha(s). Receitas R$ ${Number(metrics.receitas || 0).toFixed(2)}, despesas R$ ${Number(metrics.despesas || 0).toFixed(2)}, saldo R$ ${saldo.toFixed(2)}.`;
  }
  if (domain === "producao_leite") {
    return `Li a tabela e preparei a importação de produção: ${rows.length} registro(s), total ${Number(metrics.total_litros || 0)} litros.`;
  }
  if (domain === "estoque") {
    return `Li a tabela e preparei a importação de estoque: ${rows.length} linha(s), entradas ${metrics.entradas || 0}, saidas ${metrics.saidas || 0}, sem valor financeiro ${metrics.itens_sem_valor_financeiro || 0}.`;
  }
  return `Li a tabela e preparei a importação: ${rows.length} linha(s).`;
}

function reproductionPreview(rows: AnyRecord[]) {
  const counts = rows.reduce<Record<string, number>>((result, row) => {
    const key = String(row.evento_tipo || "desconhecido");
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  const labels: Record<string, string> = {
    parto: "parto",
    inseminacao: "inseminacao",
    prenhez: "prenhez",
    pre_parto: "pre-parto",
    cio: "cio",
    aborto: "aborto"
  };
  const summary = Object.entries(counts)
    .filter(([kind]) => kind !== "desconhecido")
    .map(([kind, count]) => `${count} ${labels[kind] || kind}`)
    .join(", ");
  const childSummary = reproductionImportChildSummary(rows);
  const birthLines = childSummary.total_partos ? [
    `Partos encontrados: ${childSummary.total_partos}.`,
    `Com cria completa: ${childSummary.partos_com_cria_completa}.`,
    `Sem cria cadastrada agora: ${childSummary.partos_sem_cria_cadastrada}.`,
    `Com dados de cria faltando: ${childSummary.partos_com_cria_pendente}.`,
    childSummary.partos_sem_cria_cadastrada || childSummary.partos_com_cria_pendente
      ? "Se confirmar agora, os partos serao salvos nas maes sem cadastrar crias. Para cadastrar crias antes de importar, envie: 094;C-094;femea;T-50. Formato: codigo_da_mae;codigo_da_cria;sexo_da_cria;pai_opcional."
      : ""
  ].filter(Boolean).join(" ") : "";
  return [
    `Li uma tabela de reproducao com ${rows.length} registro(s)${summary ? `: ${summary}` : "."}`,
    birthLines
  ].filter(Boolean).join(" ").replace("..", ".");
}

function reproductionTableParsed(plan: ImportTableActionPlan, rows: AnyRecord[], text: string) {
  const normalizedRows = rows.map((row) => {
    const animalRef = String(row.parsedValues?.animal_ref || row.values?.animal_ref || "").trim();
    const eventOriginal = String(row.values?.evento || row.parsedValues?.evento || "").trim();
    const eventKind = normalizeReproductiveEventType(eventOriginal);
    const mappedDate = String(row.values?.data || row.parsedValues?.data || "").trim();
    const embeddedDate = eventOriginal.match(/\b(?:hoje|ontem|anteontem|amanha|amanhã|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/i)?.[0] || "";
    const dateOriginal = mappedDate || embeddedDate || "hoje";
    const date = parseDate(dateOriginal);
    const problems: string[] = [];
    let warnings: string[] = [];
    if (!animalRef) problems.push("animal_sem_codigo");
    if (!eventKind) problems.push("tipo_evento_desconhecido");
    if (!date) problems.push("data_invalida");
    const child = classifyReproductionImportChild({
      evento_tipo: eventKind,
      cria_sexo: row.parsedValues?.cria_sexo || row.values?.cria_sexo || row.parsedValues?.sexo_cria || row.values?.sexo_cria,
      cria_codigo: row.parsedValues?.cria_codigo || row.values?.cria_codigo || row.parsedValues?.codigo_cria || row.values?.codigo_cria,
      cria_nome: row.parsedValues?.cria_nome || row.values?.cria_nome,
      pai_ref: row.parsedValues?.pai_ref || row.values?.pai_ref
    });
    warnings = eventKind === "parto" ? warningCodesForChildStatus(child.child_status) : warnings;
    const statusLinha = problems.length ? "invalido" : "pronto";
    return {
      lineNumber: row.lineNumber,
      rawText: row.rawText,
      animal_codigo_original: animalRef,
      animal_codigo: animalRef,
      status_original: eventOriginal,
      evento_tipo: eventKind || null,
      evento_normalizado: eventKind === "protocolo"
        ? "EM_PROTOCOLO"
        : eventKind === "reteste" ? "EM_RETESTE" : eventKind ? eventKind.toUpperCase() : null,
      evento_label: reproductiveEventLabel(eventKind),
      db_tipo: reproductiveEventDbType(eventKind),
      data_original: dateOriginal,
      data_referencia: date,
      observacoes: String(row.parsedValues?.observacoes || row.values?.observacoes || "").trim(),
      child_status: child.child_status,
      parto_cria_cadastro: child.parto_cria_cadastro,
      cria_sexo: child.cria_sexo,
      cria_codigo: child.cria_codigo,
      cria_nome: child.cria_nome,
      pai_ref: child.pai_ref,
      classificacao_linha: problems.length ? "invalid" : child.child_status === "missing_child_code" || child.child_status === "missing_child_sex" ? "pending_child_data" : "ready",
      problemas: problems,
      avisos: warnings,
      status_linha: statusLinha
    };
  });
  const rowsWithStatus = normalizedRows;
  const invalidRows = rowsWithStatus.filter((row) => row.status_linha === "invalido");
  const reviewRows = rowsWithStatus.filter((row) => row.avisos.length > 0);
  const preview = reproductionPreview(rowsWithStatus);
  const childSummary = reproductionImportChildSummary(rowsWithStatus);
  const parsed = finalizeActionPlanParsed("IMPORTACAO_EVENTOS_TABELA", {
    column_mapping: plan.table.columnMapping,
    texto_tabela_original: text,
    linhas: rowsWithStatus,
    linhas_parse_invalidas: invalidRows,
    linhas_revisao: reviewRows,
    total_linhas: rowsWithStatus.length,
    total_linhas_parse_validas: rowsWithStatus.length - invalidRows.length,
    total_linhas_parse_invalidas: invalidRows.length,
    total_linhas_needs_review: reviewRows.length,
    resumo_partos: childSummary,
    resumo_validacao: {
      total: rowsWithStatus.length,
      prontas: rowsWithStatus.length - invalidRows.length,
      invalidas: invalidRows.length,
      revisao: reviewRows.length,
      partos: childSummary,
      por_tipo: rowsWithStatus.reduce<Record<string, number>>((counts, row) => {
        const key = String(row.evento_tipo || "desconhecido");
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {})
    },
    preview_only: true,
    action_plan_preview: preview
  }, [], plan.confidence, plan, { interpreterFinal: "table_action_plan", table: true });
  return { parsed, rows: rowsWithStatus, preview };
}

function productionBatchParsed(plan: ImportTableActionPlan, rows: AnyRecord[], preview: string): ParsedRanchoMessage {
  const registros = rows.map((row) => finalizeActionPlanParsed("PRODUCAO_LEITE", {
    animal_codigo: row.parsedValues.animal_ref || row.values.animal_ref,
    litros: row.parsedValues.litros,
    data_referencia: row.parsedValues.data || row.values.data
  }, [], plan.confidence, plan, { interpreterFinal: "table_action_plan", table: true }));
  const totalLitros = rows.reduce((sum, row) => sum + Number(row.parsedValues?.litros || 0), 0);
  return finalizeActionPlanParsed("LOTE_REGISTROS", {
    registros,
    total_registros: registros.length,
    total_litros: totalLitros,
    action_plan_preview: preview
  }, [], plan.confidence, plan, { interpreterFinal: "table_action_plan", table: true });
}

function importRowsFromPlanData(plan: ImportTableActionPlan, domain: DomainManifestEntry) {
  const rows = Array.isArray(plan.data?.rows) ? plan.data.rows : [];
  return rows.map((row, index) => {
    const values = { ...(row || {}) };
    if (domain.fields.data && !String(values.data || "").trim()) values.data = getRanchTodayISO();
    const parsedValues: AnyRecord = {};
    for (const [field, value] of Object.entries(values)) {
      parsedValues[field] = parseValue(domain, field, value);
    }
    return {
      lineNumber: index + 1,
      rawText: Object.values(values).map((value) => String(value ?? "")).join(";"),
      values,
      parsedValues
    };
  });
}

function actionPlanWithTableDefaults(plan: ImportTableActionPlan, rows: AnyRecord[]): ImportTableActionPlan {
  if (plan.table) return plan;
  const sample = rows[0]?.values && typeof rows[0].values === "object" ? rows[0].values as AnyRecord : {};
  return {
    ...plan,
    table: {
      hasHeader: false,
      columnMapping: Object.fromEntries(Object.keys(sample).map((field) => [field, field])),
      defaultFields: {},
      ignoredColumns: [],
      ambiguousColumns: []
    }
  };
}

function animalImportParsed(plan: ImportTableActionPlan, rows: AnyRecord[], preview: string): ParsedRanchoMessage {
  const normalizedRows = rows.map((row) => {
    const values = row.parsedValues || {};
    const code = String(values.brinco || values.animal_ref || "").trim();
    const category = String(values.categoria || "").trim().toLowerCase();
    const problems = [...(row.problemas || [])];
    if (!code) problems.push("animal_sem_codigo");
    if (!category) problems.push("categoria_ausente");
    return {
      lineNumber: row.lineNumber,
      rawText: row.rawText,
      animal_codigo_original: code,
      animal_codigo: code,
      nome: values.nome || null,
      categoria_original: values.categoria || "",
      categoria: category || null,
      sexo: values.sexo || "nao_informado",
      fase: values.fase || "nao_aplicavel",
      raca: values.raca || null,
      lote_nome: values.lote_ref || null,
      status: values.status || "ativo",
      peso: values.peso ?? null,
      data_nascimento: values.data_nascimento || null,
      observacoes: values.observacoes || "",
      problemas: problems
    };
  });
  const invalid = normalizedRows.filter((row) => row.problemas.length > 0);
  return finalizeActionPlanParsed("IMPORTACAO_ANIMAIS_TABELA", {
    column_mapping: plan.table.columnMapping,
    linhas: normalizedRows,
    total_linhas: normalizedRows.length,
    total_linhas_parse_validas: normalizedRows.length - invalid.length,
    total_linhas_parse_invalidas: invalid.length,
    linhas_parse_invalidas: invalid,
    preview_only: true,
    action_plan_preview: preview
  }, [], plan.confidence, plan, { interpreterFinal: "table_action_plan", table: true });
}

function stockMovement(value: unknown) {
  const normalized = normalizeRanchoText(String(value || "").trim());
  if (["entrada", "compra", "comprado", "recebido", "recebimento", "reposicao", "abastecimento", "adicao"].includes(normalized)) {
    return "entrada";
  }
  if (["saida", "uso", "usado", "consumo", "venda", "vendido", "baixa", "retirada", "descarte", "perda", "quebra"].includes(normalized)) {
    return "saida";
  }
  return null;
}

function hasTableValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function optionalTableNumber(value: unknown) {
  return hasTableValue(value) ?parseNumber(value) : null;
}

function booleanTableValue(value: unknown) {
  const normalized = normalizeRanchoText(String(value || "").trim());
  if (!normalized) return null;
  if (["sim", "s", "true", "ativo", "ativa", "1"].includes(normalized)) return true;
  if (["nao", "n", "false", "inativo", "inativa", "0"].includes(normalized)) return false;
  return null;
}

function stockImportParsed(plan: ImportTableActionPlan, rows: AnyRecord[], preview: string): ParsedRanchoMessage {
  const normalizedRows = rows.map((row) => {
    const values = row.parsedValues || {};
    const item = String(values.item || values.nome || "").trim();
    const quantity = parseNumber(values.quantidade);
    const currentQuantity = optionalTableNumber(values.quantidade_atual);
    const minimumQuantity = optionalTableNumber(values.quantidade_minima);
    const unitValue = optionalTableNumber(values.valor_unitario);
    const unit = String(values.unidade || values.unidade_medida || "").trim();
    const movement = stockMovement(values.tipo_movimento || values.tipo);
    const isItemRegistration = !movement && (
      hasTableValue(values.quantidade_atual)
      || hasTableValue(values.quantidade_minima)
      || hasTableValue(values.valor_unitario)
      || hasTableValue(values.categoria)
      || hasTableValue(values.ativo)
    );
    const problems: string[] = [];
    if (!item) problems.push("item_ausente");
    if (!unit) problems.push("unidade_ausente");
    if (isItemRegistration) {
      if (hasTableValue(values.quantidade_atual) && (currentQuantity === null || currentQuantity < 0)) problems.push("quantidade_invalida");
      if (hasTableValue(values.quantidade_minima) && (minimumQuantity === null || minimumQuantity < 0)) problems.push("quantidade_minima_invalida");
      if (hasTableValue(values.valor_unitario) && (unitValue === null || unitValue < 0)) problems.push("valor_invalido");
    } else {
      if (quantity === null || quantity <= 0) problems.push("quantidade_invalida");
      if (!movement) problems.push("tipo_movimento_desconhecido");
    }
    return {
      lineNumber: row.lineNumber,
      rawText: row.rawText,
      tipo_linha_estoque: isItemRegistration ? "cadastro_item" : "movimentacao",
      item_original: item,
      item_nome: item,
      quantidade_original: values.quantidade,
      quantidade: isItemRegistration ?(currentQuantity ?? quantity ?? 0) : quantity,
      quantidade_atual: currentQuantity,
      quantidade_minima: minimumQuantity,
      unidade_original: unit,
      unidade: unit || null,
      categoria_original: values.categoria || "",
      categoria: values.categoria || null,
      tipo_original: values.tipo_movimento || values.tipo || "",
      tipo_movimento: movement,
      data_original: values.data || "",
      data_referencia: values.data || null,
      valor_original: values.valor_total || values.valor_unitario || "",
      valor: parseNumber(values.valor_total),
      valor_unitario: unitValue,
      fornecedor: values.fornecedor || "",
      ativo: booleanTableValue(values.ativo),
      observacoes: values.observacoes || values.motivo || "",
      problemas: problems
    };
  });
  const invalid = normalizedRows.filter((row) => row.problemas.length > 0);
  return finalizeActionPlanParsed("IMPORTACAO_ESTOQUE_TABELA", {
    column_mapping: plan.table.columnMapping,
    linhas: normalizedRows,
    total_linhas: normalizedRows.length,
    total_linhas_parse_validas: normalizedRows.length - invalid.length,
    total_linhas_parse_invalidas: invalid.length,
    linhas_parse_invalidas: invalid,
    preview_only: true,
    action_plan_preview: preview
  }, [], plan.confidence, plan, { interpreterFinal: "table_action_plan", table: true });
}

function genericDomainParsed(plan: ImportTableActionPlan, rows: AnyRecord[], preview: string): ParsedRanchoMessage {
  const domain = getDomainManifest(plan.domain);
  if (!domain) throw new Error(`Dominio ActionPlan invalido: ${plan.domain}`);
  const normalizedRows = genericRows(rows, domain);
  const readyRows = normalizedRows.filter((row) => row.status_linha === "pronto");
  const invalidRows = normalizedRows.filter((row) => row.status_linha === "invalido");
  const tabularDomain = TABULAR_DOMAIN_BY_ACTION_DOMAIN[plan.domain] || plan.domain.toUpperCase();
  const metrics = metricsFor(plan.domain, normalizedRows);

  return finalizeActionPlanParsed("IMPORTACAO_TABELA_DOMINIO", {
    route: "structured_input",
    tipo_tabela: `domain_${tabularDomain.toLowerCase()}`,
    dominio_tabela: tabularDomain,
    classificacao_tabela: {
      domain: tabularDomain,
      confidence: plan.confidence,
      needsUserClarification: false,
      warnings: [],
      candidateDomains: []
    },
    column_mapping: plan.table.columnMapping,
    default_fields: plan.table.defaultFields || {},
    texto_tabela_original: "",
    total_linhas: normalizedRows.length,
    total_linhas_parse_validas: readyRows.length,
    total_linhas_parse_invalidas: invalidRows.length,
    total_linhas_needs_review: 0,
    linhas: normalizedRows,
    linhas_parse_invalidas: invalidRows,
    linhas_revisao: [],
    resumo_validacao: {
      total: normalizedRows.length,
      prontas: readyRows.length,
      invalidas: invalidRows.length,
      revisao: 0,
      por_status: {
        pronto: readyRows.length,
        invalido: invalidRows.length
      },
      metricas: metrics
    },
    importacao_tabela_dominio: true,
    tabela_destino: tabularDomain,
    instrucoes_confirmacao: "confirmar_preview_tabela_dominio",
    preview_only: true,
    action_plan_preview: preview
  }, [], plan.confidence, plan, { interpreterFinal: "table_action_plan", table: true });
}

export async function executeImportTableActionPlan(input: ExecuteImportTableActionPlanInput): Promise<ExecuteImportTableActionPlanResult> {
  const dataRows = Array.isArray(input.plan.data?.rows) ? input.plan.data.rows : null;
  const table = input.plan.table || { hasHeader: true, columnMapping: {} };
  const parsedTable = dataRows
    ? {
      headers: dataRows[0] && typeof dataRows[0] === "object" ? Object.keys(dataRows[0]) : [],
      rows: dataRows.map((row) => Object.values(row || {})),
      hasHeader: false
    }
    : parseStructuredTableForActionPlan(input.text, table.separator, table.hasHeader);
  const validation = validateImportTableActionPlan(input.plan, parsedTable);
  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status === "blocked" ? "blocked" : "clarify",
      reason: validation.reason,
      message: validation.status === "blocked"
        ? "Nao posso importar essa tabela com seguranca."
        : "Não consegui validar essa lista para importação. Revise o formato ou tente com cabeçalho."
    };
  }

  const plan = validation.value as ImportTableActionPlan;
  const domain = getDomainManifest(plan.domain);
  if (!domain) {
    return {
      ok: false,
      status: "clarify",
      reason: "domain_without_manifest",
      message: "Ainda não tenho um mapeamento seguro para importar esse tipo de tabela."
    };
  }
  const rows = dataRows ? importRowsFromPlanData(plan, domain) : mappedRows(plan, domain, parsedTable);
  const executablePlan = actionPlanWithTableDefaults(plan, rows);
  if (executablePlan.domain === "reproducao") {
    const reproduction = reproductionTableParsed(executablePlan, rows, input.text);
    return {
      ok: true,
      parsed: reproduction.parsed,
      preview: reproduction.preview,
      rows: reproduction.rows,
      parsedTable
    };
  }

  const normalizedRows = genericRows(rows, domain);
  const metrics = metricsFor(executablePlan.domain, normalizedRows);
  const preview = previewText(executablePlan.domain, normalizedRows, metrics);
  const parsed = executablePlan.domain === "producao_leite"
    ? productionBatchParsed(executablePlan, normalizedRows, preview)
    : executablePlan.domain === "animais"
      ? animalImportParsed(executablePlan, normalizedRows, preview)
      : executablePlan.domain === "estoque"
        ? stockImportParsed(executablePlan, normalizedRows, preview)
        : genericDomainParsed(executablePlan, normalizedRows, preview);
  parsed.dados.texto_tabela_original = input.text;

  return { ok: true, parsed, preview, rows: normalizedRows, parsedTable };
}
