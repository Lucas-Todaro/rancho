import type { AnyRecord } from "@/lib/types";
import type { ImportTableActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import { validateImportTableActionPlan, type ParsedTableForValidation } from "@/lib/whatsapp/gemini/action-plan-validator";
import { getDomainManifest, type DomainManifestEntry } from "@/lib/whatsapp/gemini/domain-manifest";
import { finalize } from "@/lib/whatsapp/nlp-core/result";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import { parseTabularAnimalEventsMessageAs } from "@/lib/whatsapp/nlp-core/tabular-events";

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
  const sep = separator || (lines[0]?.includes(";") ? ";" : lines[0]?.includes("\t") ? "\t" : ",");
  return {
    separator: sep,
    lines,
    rows: lines.map((line) => line.split(sep).map((cell) => cell.trim()))
  };
}

export function parseStructuredTableForActionPlan(text: string, separator?: string): ParsedTableForValidation {
  const parsed = splitRows(text, separator);
  const headers = parsed.rows[0] || [];
  return {
    headers,
    rows: parsed.rows.slice(1)
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const dateMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
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
    const text = String(value || "").trim().toLowerCase();
    if (["true", "sim", "1", "ativo"].includes(text)) return true;
    if (["false", "nao", "não", "0", "inativo"].includes(text)) return false;
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
    for (const [field, value] of Object.entries(values)) {
      parsedValues[field] = parseValue(domain, field, value);
    }
    return {
      lineNumber: index + 2,
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
      const type = String(row.parsedValues?.tipo_movimento || row.values?.tipo_movimento || "").toLowerCase();
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
  const birthsWithoutChild = rows.filter((row) => (
    row.evento_tipo === "parto" && Array.isArray(row.avisos) && row.avisos.includes("dados_da_cria_ausentes")
  )).length;
  const warning = birthsWithoutChild
    ? ` ${birthsWithoutChild === 1 ? "O parto nao tem" : `${birthsWithoutChild} partos nao tem`} dados da cria; posso registrar o evento agora e cadastrar a cria depois.`
    : "";
  return `Li uma tabela de reproducao com ${rows.length} registro(s)${summary ? `: ${summary}` : "."}.${warning}`.replace("..", ".");
}

function reproductionTableParsed(plan: ImportTableActionPlan, text: string) {
  const parsed = parseTabularAnimalEventsMessageAs(text, "REPRODUCAO");
  if (!parsed || parsed.tipo !== "IMPORTACAO_EVENTOS_TABELA") return null;
  const rows = (Array.isArray(parsed.dados?.linhas) ? parsed.dados.linhas : []).map((rawRow) => {
    const row = rawRow as AnyRecord;
    const avisos = Array.isArray(row.avisos) ? [...row.avisos] : [];
    if (row.evento_tipo === "parto" && !row.parto_cria_cadastro && !avisos.includes("dados_da_cria_ausentes")) {
      avisos.push("dados_da_cria_ausentes");
    }
    return {
      ...row,
      evento_normalizado: row.evento_tipo ? String(row.evento_tipo).toUpperCase() : null,
      status_linha: Array.isArray(row.problemas) && row.problemas.length ? "invalido" : "pronto",
      avisos
    };
  });
  const invalidRows = rows.filter((row) => row.status_linha === "invalido");
  const reviewRows = rows.filter((row) => Array.isArray(row.avisos) && row.avisos.length > 0);
  const preview = reproductionPreview(rows);
  parsed.dados = {
    ...parsed.dados,
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "table_action_plan",
    table_action_plan_used: true,
    column_mapping: plan.table.columnMapping,
    texto_tabela_original: text,
    linhas: rows,
    linhas_parse_invalidas: invalidRows,
    linhas_revisao: reviewRows,
    total_linhas: rows.length,
    total_linhas_parse_validas: rows.length - invalidRows.length,
    total_linhas_parse_invalidas: invalidRows.length,
    total_linhas_needs_review: reviewRows.length,
    preview_only: true,
    action_plan: plan,
    action_plan_preview: preview
  };
  return { parsed, rows, preview };
}

function productionBatchParsed(plan: ImportTableActionPlan, rows: AnyRecord[], preview: string): ParsedRanchoMessage {
  const registros = rows.map((row) => finalize("PRODUCAO_LEITE", {
    animal_codigo: row.parsedValues.animal_ref || row.values.animal_ref,
    litros: row.parsedValues.litros,
    data_referencia: row.parsedValues.data || row.values.data,
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "table_action_plan"
  }, [], plan.confidence));
  const totalLitros = rows.reduce((sum, row) => sum + Number(row.parsedValues?.litros || 0), 0);
  return finalize("LOTE_REGISTROS", {
    registros,
    total_registros: registros.length,
    total_litros: totalLitros,
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "table_action_plan",
    table_action_plan_used: true,
    action_plan: plan,
    action_plan_preview: preview
  }, [], plan.confidence);
}

function genericDomainParsed(plan: ImportTableActionPlan, rows: AnyRecord[], preview: string): ParsedRanchoMessage {
  const domain = getDomainManifest(plan.domain);
  if (!domain) throw new Error(`Dominio ActionPlan invalido: ${plan.domain}`);
  const normalizedRows = genericRows(rows, domain);
  const readyRows = normalizedRows.filter((row) => row.status_linha === "pronto");
  const invalidRows = normalizedRows.filter((row) => row.status_linha === "invalido");
  const tabularDomain = TABULAR_DOMAIN_BY_ACTION_DOMAIN[plan.domain] || plan.domain.toUpperCase();
  const metrics = metricsFor(plan.domain, normalizedRows);

  return finalize("IMPORTACAO_TABELA_DOMINIO", {
    origem_parser: "gemini_action_plan",
    route: "structured_input",
    interpreter_final_usado: "table_action_plan",
    table_action_plan_used: true,
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
    action_plan: plan,
    action_plan_preview: preview
  }, [], plan.confidence);
}

export async function executeImportTableActionPlan(input: ExecuteImportTableActionPlanInput): Promise<ExecuteImportTableActionPlanResult> {
  const parsedTable = parseStructuredTableForActionPlan(input.text, input.plan.table.separator);
  const validation = validateImportTableActionPlan(input.plan, parsedTable);
  if (!validation.ok) {
    return {
      ok: false,
      status: validation.status === "blocked" ? "blocked" : "clarify",
      reason: validation.reason,
      message: validation.status === "blocked"
        ? "Nao posso importar essa tabela com seguranca."
        : "Preciso revisar o mapeamento da tabela antes de importar."
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
  if (plan.domain === "reproducao") {
    const reproduction = reproductionTableParsed(plan, input.text);
    if (!reproduction) {
      return {
        ok: false,
        status: "clarify",
        reason: "reproduction_table_parse_failed",
        message: "Nao consegui ler as linhas dessa tabela de reproducao com seguranca."
      };
    }
    return {
      ok: true,
      parsed: reproduction.parsed,
      preview: reproduction.preview,
      rows: reproduction.rows,
      parsedTable
    };
  }

  const rows = mappedRows(plan, domain, parsedTable);
  const normalizedRows = genericRows(rows, domain);
  const metrics = metricsFor(plan.domain, normalizedRows);
  const preview = previewText(plan.domain, normalizedRows, metrics);
  const parsed = plan.domain === "producao_leite"
    ? productionBatchParsed(plan, normalizedRows, preview)
    : genericDomainParsed(plan, normalizedRows, preview);
  parsed.dados.texto_tabela_original = input.text;

  return { ok: true, parsed, preview, rows: normalizedRows, parsedTable };
}
