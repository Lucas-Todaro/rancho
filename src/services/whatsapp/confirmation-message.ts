import type { AnyRecord } from "@/lib/types";
import { normalizeCatalogText } from "@/lib/whatsapp/catalog";
import { detectDestructiveBulkAction, DESTRUCTIVE_BULK_ACTION_MESSAGE } from "@/lib/whatsapp/nlp-core/safety-guards";
import { calfCategoryForSex, normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { manualDomainChoiceOptionsText, tabularDomainLabel } from "@/lib/whatsapp/nlp-core/tabular-domain-router";
import {
  detectReproductiveEventKind,
  normalizeRanchoText,
  refreshRanchoMessage,
  reproductiveEventDbType,
  type ParsedRanchoMessage
} from "@/lib/whatsapp/nlp";
import { userFacingCodeLabel } from "@/lib/whatsapp/user-facing-text";
import { dateOnlyFromReference, isoFromReference } from "@/services/whatsapp/date-utils";
import { formatMoney, formatNumber } from "@/services/whatsapp/message-format";
import { exactAnimalImportCodeKey } from "@/services/whatsapp/catalog-service";

export type DomainImportSaveStats = {
  domain: string;
  saved: number;
  skipped: number;
  failed: Array<{ line: number; reason: string }>;
  savedTables: Set<string>;
};

function partoWithChild(dados: AnyRecord) {
  return Boolean(dados.registrar_cria || dados.cria_codigo || dados.cria_sexo || dados.cria_categoria || dados.gerar_cria_codigo_temporario);
}

export function domainImportRows(parsed: ParsedRanchoMessage) {
  return Array.isArray(parsed.dados?.linhas) ?parsed.dados.linhas as AnyRecord[] : [];
}



export function domainImportReadyRows(parsed: ParsedRanchoMessage) {
  return domainImportRows(parsed).filter((row) => row.status_linha === "pronto" && row.status_validacao_dominio !== "erro");
}



export function domainImportCriticalRows(parsed: ParsedRanchoMessage) {
  return domainImportRows(parsed).filter((row) => row.status_validacao_dominio === "erro" || row.status_linha === "invalido");
}



export function domainImportWarningRows(parsed: ParsedRanchoMessage) {
  return domainImportRows(parsed).filter((row) => {
    const warnings = Array.isArray(row.avisos_validacao_dominio) ?row.avisos_validacao_dominio : Array.isArray(row.avisos) ?row.avisos : [];
    return warnings.length && row.status_validacao_dominio !== "erro";
  });
}



export function domainRowValues(row: AnyRecord) {
  return {
    ...((row.values || {}) as AnyRecord),
    ...((row.parsedValues || {}) as AnyRecord)
  };
}



export function domainLine(row: AnyRecord) {
  return Number(row.lineNumber || row.linha || 0) || 0;
}



export function domainText(value: unknown) {
  return String(value ?? "").trim();
}



export function domainDateOnly(value: unknown) {
  const text = domainText(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return dateOnlyFromReference(text || "hoje");
}



export function domainTime(value: unknown) {
  const match = domainText(value).match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/i);
  if (!match) return "";
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}



export function domainDateTime(value: unknown, time?: unknown) {
  const date = domainDateOnly(value);
  const hour = domainTime(time);
  return isoFromReference(date, hour || undefined);
}



export function domainStatusActive(value: unknown) {
  const normalized = normalizeRanchoText(domainText(value));
  if (!normalized) return true;
  return !/\b(?:inativo|inativa|desligado|desligada|demitido|demitida|cancelado|cancelada|false|nao|0)\b/.test(normalized);
}



export function domainImportFailureText(failed: Array<{ line: number; reason: string }>) {
  if (!failed.length) return "";
  const visible = failed.slice(0, 5).map((item) => `linha ${item.line || "?"}: ${userFacingCodeLabel(item.reason)}`).join("; ");
  const extra = failed.length > 5 ?`; mais ${failed.length - 5}` : "";
  return `\nLinhas nao salvas: ${visible}${extra}.`;
}

export function domainRowIssueText(row: AnyRecord) {
  const issues = [
    ...(Array.isArray(row.problemas) ?row.problemas : []),
    ...(Array.isArray(row.problemas_validacao_dominio) ?row.problemas_validacao_dominio : [])
  ].map(String);
  return issues.length ?issues.map(userFacingCodeLabel).join(", ") : "erro crítico";
}



export function domainRowWarningText(row: AnyRecord) {
  const warnings = [
    ...(Array.isArray(row.avisos) ?row.avisos : []),
    ...(Array.isArray(row.avisos_validacao_dominio) ?row.avisos_validacao_dominio : [])
  ].map(String);
  return warnings.length ?warnings.map(userFacingCodeLabel).join(", ") : "aviso";
}



export function domainPreviewLine(row: AnyRecord, domain: string) {
  const values = domainRowValues(row);
  if (domain === "LOTES") return domainText(values.nome || values.lote || row.rawText || "lote");
  if (domain === "GENEALOGIA") {
    const parents = [values.mae_ref ?`mae ${values.mae_ref}` : "", values.pai_ref ?`pai ${values.pai_ref}` : ""].filter(Boolean).join(", ");
    return `${domainText(values.animal_ref || values.filho_ref || values.cria_codigo || "animal")}${parents ?`: ${parents}` : ""}`;
  }
  if (domain === "FINANCEIRO") return `${domainText(values.descricao || values.categoria || "transacao")} - ${formatMoney(Number(values.valor || 0))}`;
  if (domain === "FUNCIONARIOS") return domainText(values.nome || row.rawText || "funcionario");
  if (domain === "PONTO_FUNCIONARIO") return `${domainText(values.funcionario_ref || "funcionario")} ${domainText(values.data || "")}`.trim();
  if (domain === "SAUDE_SANITARIO") return `${domainText(values.animal_ref || "animal")} - ${domainText(values.evento || values.produto || "evento")}`;
  if (domain === "OBSERVACOES") return `${domainText(values.entidade_ref || "geral")} - ${domainText(values.observacao || "observacao")}`;
  if (domain === "AGENDA_TAREFAS") return domainText(values.titulo || values.tarefa || row.rawText || "tarefa");
  return domainText(row.rawText || "linha");
}



export function validDomainStatus(value: unknown) {
  const normalized = normalizeRanchoText(domainText(value));
  if (!normalized) return true;
  return /^(?:ativo|ativa|inativo|inativa|desligado|desligada|cancelado|cancelada|pendente|concluido|concluida|feito|feita|aberto|aberta|false|true|sim|nao|0|1)$/.test(normalized);
}



export function validDomainSex(value: unknown) {
  const normalized = normalizeRanchoText(domainText(value));
  if (!normalized) return true;
  return /^(?:macho|femea|masculino|feminino|nao informado|nao_informado)$/.test(normalized);
}



export function validDomainAnimalCategory(value: unknown) {
  const normalized = normalizeRanchoText(domainText(value));
  if (!normalized) return true;
  return /^(?:vaca|boi|bezerro|bezerra|novilha|touro|outro)$/.test(normalized);
}



export function validCpf(value: unknown) {
  const digits = domainText(value).replace(/\D/g, "");
  if (!digits) return true;
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  const calc = (size: number) => {
    const sum = digits.slice(0, size).split("").reduce((total, digit, index) => total + Number(digit) * (size + 1 - index), 0);
    const mod = (sum * 10) % 11;
    return mod === 10 ?0 : mod;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}



export function importKey(parts: unknown[]) {
  return parts.map((part) => normalizeCatalogText(domainText(part))).join("|");
}



export function domainParsedDate(row: AnyRecord, field = "data") {
  const values = row.values || {};
  const parsedValues = row.parsedValues || {};
  if (!domainText(values[field])) return "";
  return domainText(parsedValues[field]);
}



export function domainImportResultMessage(label: string, stats: DomainImportSaveStats, noun: string) {
  const skippedText = stats.skipped ?`\nIgnorados: ${stats.skipped}.` : "";
  const failedText = domainImportFailureText(stats.failed);
  if (!stats.saved) {
    return `Nenhum ${noun} foi salvo em ${label}.${skippedText}${failedText}`.trim();
  }
  return `Importacao de ${label} concluida: ${stats.saved} ${noun}(s) salvo(s).${skippedText}${failedText}`;
}



export function normalizeDomainFinanceType(value: unknown) {
  const normalized = normalizeRanchoText(domainText(value));
  if (/\b(?:receita|entrada|credito|creditos|venda|recebimento)\b/.test(normalized)) return "entrada";
  if (/\b(?:despesa|saida|debito|debitos|compra|pagamento|custo)\b/.test(normalized)) return "saida";
  return "";
}



export function normalizeDomainEventType(value: unknown, product?: unknown) {
  const normalized = normalizeRanchoText(`${domainText(value)} ${domainText(product)}`);
  if (/\b(?:vacina|vacinacao|aftosa|brucelose|raiva)\b/.test(normalized)) return "vacina";
  if (/\b(?:doenca|doente|mastite|febre)\b/.test(normalized)) return "doenca";
  if (/\b(?:inseminacao|cio|prenhez|pre parto|preparto|parto|pariu)\b/.test(normalized)) {
    return reproductiveEventDbType(detectReproductiveEventKind(normalized) || "observacao");
  }
  if (/\b(?:medicacao|medicamento|tratamento|remedio|vermifugo|antibiotico)\b/.test(normalized)) return "tratamento";
  return "observacao";
}



export function isDestructiveBulkParsed(parsed?: ParsedRanchoMessage | null) {
  return parsed?.tipo === "ACAO_DESTRUTIVA_EM_MASSA" || parsed?.tipo === "EXCLUIR_REBANHO";
}



export function milkStockStatusText(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const stock = dados.estoque_leite as AnyRecord | undefined;
  if (!stock || !dados.estoque_leite_detectado) return "";

  const total = formatNumber(Number(stock.total_litros || dados.total_litros || 0), " L");
  const destino = stock.destino_detectado ?`\nDestino detectado: ${stock.destino_detectado}.` : "";

  if (stock.status_resolucao === "matched") {
    if (stock.estoque_movimentar) {
      return `\n\nTambém vou adicionar ${total} ao estoque de ${stock.item_leite_resolvido}.`;
    }
    if (stock.pedir_decisao) return "";
    return `\n\nItem de leite encontrado (${stock.item_leite_resolvido}), mas não vou movimentar estoque automaticamente.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    const options = Array.isArray(stock.opcoes) ?stock.opcoes as AnyRecord[] : [];
    const lines = options.slice(0, 5).map((option, index) => `${index + 1}. ${option.nome} (${option.unidade || "unidade não informada"})`).join("\n");
    return `\n\nEncontrei mais de um item de estoque compatível com leite (${total}).${destino}\n${lines}\nNão vou movimentar estoque automaticamente; vou registrar apenas a produção.`;
  }

  return `\n\nNão encontrei item de estoque compatível com leite (${total}).${destino}\nVou registrar apenas a produção.`;
}



export function postConfirmationConsultationNote(parsed: ParsedRanchoMessage) {
  const consultations = parsed.dados?.gemini_consultas_apos_confirmacao;
  const total = Array.isArray(consultations) ?consultations.length : 0;
  if (!total) return "";
  return `\nDepois de confirmar, também vou responder ${total === 1 ?"a consulta pedida" : "as consultas pedidas"}.`;
}



export function tabularImportRows(parsed: ParsedRanchoMessage) {
  const rows = parsed.dados?.linhas_validadas || parsed.dados?.linhas || [];
  return Array.isArray(rows) ?rows as AnyRecord[] : [];
}



export function tabularImportSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  const rows = tabularImportRows(parsed);
  const ready = rows.filter((row) => row.status_validacao === "pronto");
  const invalid = rows.filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  return {
    total: Number(summary.total || dados.total_linhas || rows.length || 0),
    ready: Number(summary.prontas ?? ready.length ?? 0),
    invalid: Number(summary.invalidas ?? invalid.length ?? 0),
    review: Number(summary.revisao || dados.total_linhas_needs_review || 0),
    duplicates: Number(summary.duplicadas || 0),
    notFound: Number(summary.animais_nao_encontrados || 0),
    missingDate: Number(summary.datas_ausentes || 0),
    invalidDate: Number(summary.datas_invalidas || 0),
    unknownType: Number(summary.tipos_desconhecidos || 0),
    births: (summary.partos || dados.resumo_partos || {}) as AnyRecord,
    eventCounts: (summary.por_tipo || dados.contagem_eventos_parse || {}) as Record<string, number>
  };
}



export function tabularEventTypeLabel(type: string) {
  if (type === "inseminacao") return "inseminacao";
  if (type === "prenhez") return "prenhez";
  if (type === "pre_parto") return "pre-parto";
  if (type === "parto") return "parto";
  if (type === "protocolo") return "protocolo";
  return type || "desconhecido";
}



export function tabularImportCountText(eventCounts: Record<string, number>) {
  return Object.entries(eventCounts)
    .filter(([, total]) => Number(total) > 0)
    .map(([type, total]) => `${tabularEventTypeLabel(type)}: ${total}`)
    .join(", ");
}



export function tabularImportIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    animal_sem_codigo: "sem codigo do animal",
    tipo_evento_desconhecido: "tipo nao reconhecido",
    data_ausente: "sem data",
    data_invalida: "data invalida",
    animal_nao_encontrado: "animal nao encontrado neste rancho",
    animal_ambiguo: "animal ambiguo",
    animal_inativo: "animal inativo",
    duplicado: "possivel duplicado"
  };
  return labels[issue] || userFacingCodeLabel(issue);
}



export function tabularImportIssueDetails(parsed: ParsedRanchoMessage, maxRows = 8) {
  const issueRows = tabularImportRows(parsed).filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  const rows = issueRows.slice(0, maxRows);
  if (!rows.length) return "";

  const lines = rows.map((row) => {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    return `- linha ${row.lineNumber || "?"} (${row.animal_codigo || row.animal_codigo_original || "sem codigo"}): ${issues.map((issue) => tabularImportIssueLabel(String(issue))).join(", ") || "nao importavel"}`;
  });

  const extra = issueRows.length > rows.length ?`\n...e mais ${issueRows.length - rows.length} linha(s) com alerta.` : "";
  return `${lines.join("\n")}${extra}`;
}



export function tabularMissingAnimalCodes(parsed: ParsedRanchoMessage, maxRows = 8) {
  const codes = new Set<string>();
  for (const row of tabularImportRows(parsed)) {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    if (issues.includes("animal_nao_encontrado")) {
      const code = String(row.animal_codigo_original || row.animal_codigo || "").trim();
      if (code) codes.add(code);
    }
  }
  return Array.from(codes).slice(0, maxRows);
}



export function tabularReadyEventDetails(parsed: ParsedRanchoMessage, maxRows = 6) {
  const rows = tabularImportRows(parsed)
    .filter((row) => {
      const issues = Array.isArray(row.problemas_validacao)
        ? row.problemas_validacao
        : Array.isArray(row.problemas) ? row.problemas : [];
      return issues.length === 0 || row.status_validacao === "pronto";
    })
    .slice(0, maxRows);
  if (!rows.length) return "";
  const lines = rows.map((row) => [
    `- ${row.animal_codigo || row.animal_codigo_original || "Animal"}`,
    row.evento_label || row.evento_normalizado || row.evento_tipo || "evento",
    row.data_referencia || row.data_original || "data nao informada",
    row.evento_tipo === "parto" && row.child_status === "complete" ? `cria ${row.cria_sexo || ""} ${row.cria_codigo || ""}`.trim() : "",
    row.evento_tipo === "parto" && row.child_status === "pending_child_optional" ? "sem cria cadastrada agora" : "",
    row.evento_tipo === "parto" && row.child_status === "missing_child_code" ? "falta codigo da cria" : "",
    row.evento_tipo === "parto" && row.child_status === "missing_child_sex" ? "falta sexo da cria" : "",
    row.observacoes || ""
  ].filter(Boolean).join(" | "));
  const total = tabularImportRows(parsed).length;
  if (total > rows.length) lines.push(`...e mais ${total - rows.length} linha(s).`);
  return lines.join("\n");
}



export function tabularImportConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = tabularImportSummary(parsed);
  const counts = tabularImportCountText(summary.eventCounts);
  const preview = String(parsed.dados?.action_plan_preview || "").trim();
  const previewBlock = preview ?`\n\nResumo do lote:\n${preview}` : "";
  const births = summary.births || {};
  const birthBlock = Number(births.total_partos || 0) ?[
    "",
    "Partos no lote:",
    `- Total: ${Number(births.total_partos || 0)}.`,
    `- Com cria completa: ${Number(births.partos_com_cria_completa || 0)}.`,
    `- Sem cria cadastrada agora: ${Number(births.partos_sem_cria_cadastrada || 0)}.`,
    `- Com dados de cria faltando: ${Number(births.partos_com_cria_pendente || 0)}.`,
    Number(births.partos_sem_cria_cadastrada || 0) || Number(births.partos_com_cria_pendente || 0)
      ? "Para complementar em lote, envie linhas como: 094;femea;C-094;T-50 ou 398;sem cria."
      : ""
  ].filter(Boolean).join("\n") : "";
  const issueText = tabularImportIssueDetails(parsed, 6);
  const issueBlock = issueText ?`\n\nLinhas que nao vou importar agora:\n${issueText}` : "";
  const duplicateText = summary.duplicates ?`Duplicadas ignoradas: ${summary.duplicates}.` : "";
  const notFoundText = summary.notFound ?`Animais nao encontrados: ${summary.notFound}.` : "";
  const missingCodes = summary.notFound ?tabularMissingAnimalCodes(parsed, 8) : [];
  const missingCodesText = missingCodes.length ?`Codigos faltantes: ${missingCodes.join(", ")}.` : "";
  const dateText = summary.missingDate || summary.invalidDate ?`Datas com problema: ${summary.missingDate + summary.invalidDate}.` : "";
  const typeText = summary.unknownType ?`Tipos nao reconhecidos: ${summary.unknownType}.` : "";
  const readyDetails = tabularReadyEventDetails(parsed);
  const readyBlock = readyDetails ? `\n\nEventos reconhecidos:\n${readyDetails}` : "";

  if (summary.notFound) {
    return [
      "Li a tabela de eventos do rebanho.",
      `Linhas lidas: ${summary.total}.`,
      `Prontas para importar agora: ${summary.ready}.`,
      counts ?`Tipos: ${counts}.` : "",
      duplicateText,
      notFoundText,
      missingCodesText,
      dateText,
      typeText,
      previewBlock,
      birthBlock,
      readyBlock,
      issueBlock,
      "",
      "O que deseja fazer?",
      "1 - Cadastrar animais faltantes",
      summary.ready ? "2 - Importar somente eventos dos animais encontrados" : "2 - Ver pendencias",
      summary.ready ? "3 - Ver pendencias" : "3 - Cancelar",
      summary.ready ? "4 - Cancelar" : ""
    ].filter((line) => line !== "").join("\n");
  }

  if (!summary.ready) {
    return `Li a tabela, mas nenhuma linha esta pronta para importar.\nLinhas lidas: ${summary.total}.${issueBlock}\n\nNada foi salvo. Envie a tabela corrigida.`;
  }

  return [
    "Li a tabela de eventos do rebanho.",
    `Linhas lidas: ${summary.total}.`,
    `Prontas para importar: ${summary.ready}.`,
    counts ?`Tipos: ${counts}.` : "",
    duplicateText,
    notFoundText,
    dateText,
    typeText,
    previewBlock,
    birthBlock,
    readyBlock,
    issueBlock,
    "",
    summary.invalid || summary.duplicates ? "Quer importar apenas as linhas validas?" : "Esta correto?",
    "1 - Importar",
    "2 - Cancelar"
  ].filter((line) => line !== "").join("\n");
}



export function animalImportRows(parsed: ParsedRanchoMessage) {
  const rows = parsed.dados?.linhas_validadas || parsed.dados?.linhas || [];
  return Array.isArray(rows) ?rows as AnyRecord[] : [];
}



export function animalImportSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  const rows = animalImportRows(parsed);
  const ready = rows.filter((row) => row.status_validacao === "pronto");
  const invalid = rows.filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  return {
    total: Number(summary.total || dados.total_linhas || rows.length || 0),
    ready: Number(summary.prontas ?? ready.length ?? 0),
    invalid: Number(summary.invalidas ?? invalid.length ?? 0),
    duplicates: Number(summary.duplicadas || 0),
    missingLots: Number(summary.lotes_nao_encontrados || 0),
    lotsFound: Number(summary.lotes_encontrados || 0),
    parseInvalid: Number(summary.parse_invalidas || dados.total_linhas_parse_invalidas || 0),
    missingCategory: Number(summary.categorias_ausentes || 0),
    invalidCategory: Number(summary.categorias_invalidas || 0),
    createMissingLots: Boolean(dados.criar_lotes_faltantes),
    missingLotNames: Array.isArray(summary.nomes_lotes_nao_encontrados) ?summary.nomes_lotes_nao_encontrados as string[] : []
  };
}



export function animalImportIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    animal_sem_codigo: "sem codigo",
    categoria_ausente: "sem categoria",
    categoria_invalida: "categoria invalida",
    sexo_invalido: "sexo invalido",
    status_invalido: "status invalido",
    peso_invalido: "peso invalido",
    data_nascimento_invalida: "nascimento invalido",
    animal_duplicado: "animal ja existe",
    duplicado_na_tabela: "codigo repetido na tabela",
    lote_nao_encontrado: "lote nao encontrado"
  };
  return labels[issue] || userFacingCodeLabel(issue);
}



export function animalImportIssueDetails(parsed: ParsedRanchoMessage, maxRows = 8) {
  const issueRows = animalImportRows(parsed).filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  const rows = issueRows.slice(0, maxRows);
  if (!rows.length) return "";

  const lines = rows.map((row) => {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    return `- linha ${row.lineNumber || "?"} (${row.animal_codigo || row.animal_codigo_original || "sem codigo"}): ${issues.map((issue) => animalImportIssueLabel(String(issue))).join(", ") || "nao cadastravel"}`;
  });

  const extra = issueRows.length > rows.length ?`\n...e mais ${issueRows.length - rows.length} linha(s) com pendencia.` : "";
  return `${lines.join("\n")}${extra}`;
}



export function animalImportConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = animalImportSummary(parsed);
  const issueText = animalImportIssueDetails(parsed, 6);
  const issueBlock = issueText ?`\n\nLinhas que nao vou cadastrar agora:\n${issueText}` : "";
  const duplicateText = summary.duplicates ?`Ja existem no rebanho ou repetidos: ${summary.duplicates}.` : "";
  const lotText = summary.missingLots ?`Lotes nao encontrados: ${summary.missingLotNames.slice(0, 5).join(", ")}.` : "";
  const lotFoundText = summary.lotsFound ?`Lotes encontrados: ${summary.lotsFound}.` : "";
  const categoryText = summary.missingCategory || summary.invalidCategory ?`Categorias com problema: ${summary.missingCategory + summary.invalidCategory}.` : "";

  if (!summary.ready && !summary.missingLots) {
    return `Li a tabela de cadastro de animais, mas nenhuma linha esta pronta para cadastrar.\nLinhas lidas: ${summary.total}.${issueBlock}\n\nNada foi salvo. Envie a tabela corrigida.`;
  }

  return [
    "Recebi uma tabela de cadastro de animais.",
    `Animais lidos: ${summary.total}.`,
    `Prontos para cadastrar: ${summary.ready}.`,
    duplicateText,
    lotFoundText,
    lotText,
    categoryText,
    issueBlock,
    "",
    summary.missingLots ? "O que deseja fazer?" : "Deseja cadastrar os animais validos?",
    summary.missingLots ? "1 - Cadastrar apenas os validos" : "1 - Cadastrar",
    summary.missingLots ? "2 - Criar lotes e cadastrar" : "",
    summary.missingLots ? "3 - Ver pendencias" : "2 - Ver pendencias",
    summary.missingLots ? "4 - Cancelar" : "3 - Cancelar"
  ].filter((line) => line !== "").join("\n");
}



export function stockImportRows(parsed: ParsedRanchoMessage) {
  const rows = parsed.dados?.linhas_validadas || parsed.dados?.linhas || [];
  return Array.isArray(rows) ?rows as AnyRecord[] : [];
}



export function stockImportSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = (dados.resumo_validacao || {}) as AnyRecord;
  const rows = stockImportRows(parsed);
  const ready = rows.filter((row) => row.status_validacao === "pronto");
  const invalid = rows.filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  return {
    total: Number(summary.total || dados.total_linhas || rows.length || 0),
    ready: Number(summary.prontas ?? ready.length ?? 0),
    invalid: Number(summary.invalidas ?? invalid.length ?? 0),
    missingItems: Number(summary.itens_nao_encontrados || 0),
    duplicates: Number(summary.duplicadas || 0),
    invalidDates: Number(summary.datas_invalidas || 0),
    invalidQuantities: Number(summary.quantidades_invalidas || 0),
    invalidUnits: Number(summary.unidades_invalidas || 0),
    unknownTypes: Number(summary.tipos_desconhecidos || 0),
    createMissingItems: Boolean(dados.criar_itens_faltantes),
    missingItemNames: Array.isArray(summary.nomes_itens_nao_encontrados) ?summary.nomes_itens_nao_encontrados as string[] : [],
    movementCounts: (summary.por_tipo || dados.contagem_estoque_parse || {}) as Record<string, number>
  };
}



export function stockImportIssueLabel(issue: string) {
  const labels: Record<string, string> = {
    item_ausente: "item não informado",
    item_nao_encontrado: "item de estoque não cadastrado",
    quantidade_ausente: "quantidade ausente",
    quantidade_invalida: "quantidade inválida",
    unidade_ausente: "unidade ausente",
    unidade_invalida: "unidade inválida",
    tipo_movimento_ausente: "tipo de movimento ausente",
    tipo_movimento_desconhecido: "tipo de movimento desconhecido",
    data_invalida: "data inválida",
    valor_invalido: "valor inválido",
    duplicado_na_tabela: "linha repetida na tabela"
  };
  return labels[issue] || userFacingCodeLabel(issue);
}



export function stockImportIssueDetails(parsed: ParsedRanchoMessage, maxRows = 8) {
  const issueRows = stockImportRows(parsed).filter((row) => row.status_validacao && row.status_validacao !== "pronto");
  const rows = issueRows.slice(0, maxRows);
  if (!rows.length) return "";

  const lines = rows.map((row) => {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    return `- linha ${row.lineNumber || "?"} (${row.item_nome || row.item_original || "sem item"}): ${issues.map((issue) => stockImportIssueLabel(String(issue))).join(", ") || "não importável"}`;
  });

  const extra = issueRows.length > rows.length ?`\n...e mais ${issueRows.length - rows.length} linha(s) com pendência.` : "";
  return `${lines.join("\n")}${extra}`;
}



export function stockImportConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = stockImportSummary(parsed);
  const issueText = stockImportIssueDetails(parsed, 6);
  const issueBlock = issueText ?`\n\nPendências:\n${issueText}` : "";
  const missingText = summary.missingItems ?`Itens de estoque não cadastrados: ${summary.missingItemNames.slice(0, 5).join(", ")}.` : "";
  const invalidText = summary.invalidDates || summary.invalidQuantities || summary.invalidUnits || summary.unknownTypes
    ?`Problemas de formato: ${summary.invalidDates + summary.invalidQuantities + summary.invalidUnits + summary.unknownTypes}.`
    : "";
  const duplicateText = summary.duplicates ?`Possíveis duplicidades: ${summary.duplicates}.` : "";
  const options = summary.missingItems
    ?[
      "O que deseja fazer?",
      "1 - Criar itens faltantes",
      summary.ready ? "2 - Importar somente linhas válidas" : "",
      "3 - Ver pendências",
      "4 - Cancelar importação"
    ]
    : [
      summary.invalid || summary.duplicates ? "O que deseja fazer?" : "Deseja importar as linhas válidas?",
      "1 - Importar linhas válidas",
      summary.invalid || summary.duplicates ? "2 - Ver pendências" : "",
      summary.invalid || summary.duplicates ? "3 - Cancelar importação" : "2 - Cancelar importação"
    ];

  return [
    "Recebi uma tabela de estoque.",
    "Pré-validação concluída. Nenhum dado foi salvo ainda.",
    `Linhas lidas: ${summary.total}.`,
    `Linhas prontas: ${summary.ready}.`,
    missingText,
    invalidText,
    duplicateText,
    issueBlock,
    "",
    ...options
  ].filter((line) => line !== "").join("\n");
}



export function domainTableSummary(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const summary = ((dados.resumo_validacao_dominio || dados.resumo_validacao || {}) as AnyRecord);
  return {
    domain: String(dados.dominio_tabela || "DESCONHECIDO"),
    total: Number(summary.total || dados.total_linhas || 0),
    ready: Number(summary.prontas || dados.total_linhas_parse_validas || 0),
    invalid: Number(summary.erros_criticos || summary.invalidas || dados.total_linhas_parse_invalidas || 0),
    review: Number(summary.avisos || summary.revisao || dados.total_linhas_needs_review || 0),
    metrics: (summary.metricas || {}) as AnyRecord
  };
}



export function domainTableList(rows: AnyRecord[], domain: string, maxRows = 5) {
  const lines = rows.slice(0, maxRows).map((row) => `- ${domainPreviewLine(row, domain)}`);
  const extra = rows.length > maxRows ?[`...e mais ${rows.length - maxRows}.`] : [];
  return [...lines, ...extra].join("\n");
}



export function domainTableIssuesText(rows: AnyRecord[], domain: string, kind: "error" | "warning", maxRows = 5) {
  const selected = rows.slice(0, maxRows);
  if (!selected.length) return "";
  const lines = selected.map((row) => {
    const issue = kind === "error" ?domainRowIssueText(row) : domainRowWarningText(row);
    return `- linha ${domainLine(row) || "?"} (${domainPreviewLine(row, domain)}): ${issue}`;
  });
  const extra = rows.length > selected.length ?`\n...e mais ${rows.length - selected.length}.` : "";
  return `${lines.join("\n")}${extra}`;
}



export function domainSpecificMetricLines(summary: ReturnType<typeof domainTableSummary>, readyRows: AnyRecord[]) {
  if (summary.domain === "FINANCEIRO") {
    const totals = readyRows.reduce((acc, row) => {
      const values = domainRowValues(row);
      const type = normalizeDomainFinanceType(values.tipo);
      const value = Number(values.valor || 0);
      if (type === "entrada") acc.in += value;
      if (type === "saida") acc.out += value;
      return acc;
    }, { in: 0, out: 0 });
    return [
      `Entradas: ${formatMoney(totals.in)}.`,
      `Saidas: ${formatMoney(totals.out)}.`,
      `Resultado: ${formatMoney(totals.in - totals.out)}.`
    ];
  }

  if (summary.domain === "PONTO_FUNCIONARIO") {
    const points = readyRows.reduce((total, row) => {
      const values = domainRowValues(row);
      return total + (domainTime(values.entrada) ?1 : 0) + (domainTime(values.saida) ?1 : 0);
    }, 0);
    return [`Marcacoes de ponto: ${points}.`];
  }

  return [];
}



export function domainTableConfirmationText(parsed: ParsedRanchoMessage) {
  const summary = domainTableSummary(parsed);
  const label = tabularDomainLabel(summary.domain as Parameters<typeof tabularDomainLabel>[0]);
  const rows = domainImportRows(parsed);
  const readyRows = domainImportReadyRows(parsed);
  const errorRows = domainImportCriticalRows(parsed);
  const warningRows = domainImportWarningRows(parsed);
  const preview = readyRows.length ?domainTableList(readyRows, summary.domain, 5) : "";
  const errors = domainTableIssuesText(errorRows, summary.domain, "error", 6);
  const warnings = domainTableIssuesText(warningRows, summary.domain, "warning", 6);
  const metricLines = domainSpecificMetricLines(summary, readyRows);
  const noun: Record<string, string> = {
    LOTES: "lotes para cadastrar",
    GENEALOGIA: "vinculos genealogicos",
    FINANCEIRO: "transacoes financeiras",
    FUNCIONARIOS: "funcionarios para cadastrar",
    PONTO_FUNCIONARIO: "registros de ponto",
    SAUDE_SANITARIO: "eventos de saude/sanitario",
    OBSERVACOES: "observacoes",
    AGENDA_TAREFAS: "tarefas"
  };

  if (errorRows.length) {
    return [
      `Encontrei ${summary.total} linha(s) de ${label}.`,
      `Prontas: ${readyRows.length}.`,
      `Erros criticos: ${errorRows.length}.`,
      preview ?`\nLinhas validas:\n${preview}` : "",
      warnings ?`\nAvisos:\n${warnings}` : "",
      `\nErros:\n${errors}`,
      "",
      "Corrija os erros antes de salvar. Nada foi salvo ainda.",
      "Envie a tabela corrigida ou responda cancelar."
    ].filter(Boolean).join("\n");
  }

  return [
    `Encontrei ${summary.total} ${noun[summary.domain] || `linha(s) de ${label}`}.`,
    `Prontas: ${summary.ready}.`,
    summary.review ?`Avisos: ${summary.review}.` : "",
    ...metricLines,
    preview ?`\nResumo:\n${preview}` : "",
    warnings ?`\nAvisos:\n${warnings}` : "",
    "",
    "Nenhum dado foi salvo ainda.",
    summary.domain === "AGENDA_TAREFAS"
      ?"Esse dominio ainda nao possui tabela real segura. Deseja apenas confirmar o preview?"
      :`Deseja salvar ${summary.ready} linha(s) valida(s) de ${label}?`,
    "1 - Confirmar salvamento",
    "2 - Cancelar"
  ].filter(Boolean).join("\n");
}



export function ambiguousTableQuestion(parsed: ParsedRanchoMessage) {
  const question = String(parsed.dados?.clarificationQuestion || parsed.dados?.classificacao_tabela?.clarificationQuestion || "").trim();
  return question ? `${question}\n\n${manualDomainChoiceOptionsText()}` : manualDomainChoiceOptionsText();
}



export function animalImportPendingFromMissingEventAnimals(parsed: ParsedRanchoMessage) {
  const unique = new Map<string, AnyRecord>();
  for (const row of tabularImportRows(parsed)) {
    const issues = Array.isArray(row.problemas_validacao)
      ?row.problemas_validacao
      : Array.isArray(row.problemas)
        ?row.problemas
        : [];
    if (!issues.includes("animal_nao_encontrado")) continue;
    const code = exactAnimalImportCodeKey(row.animal_codigo || row.animal_codigo_original);
    if (!code || unique.has(code)) continue;
    unique.set(code, {
      lineNumber: row.lineNumber,
      rawText: row.rawText || String(row.animal_codigo_original || row.animal_codigo || ""),
      animal_codigo_original: row.animal_codigo_original || row.animal_codigo || code,
      animal_codigo: code,
      nome: null,
      categoria_original: "outro",
      categoria: "outro",
      sexo_original: "",
      sexo: "nao_informado",
      raca: null,
      lote_nome: null,
      status_original: "ativo",
      status: "ativo",
      peso: null,
      data_nascimento: null,
      observacoes: "Cadastrado a partir de tabela de eventos enviada pelo WhatsApp",
      problemas: []
    });
  }

  const rows = Array.from(unique.values());
  const dados = {
    origem_parser: "tabela_local",
    tipo_tabela: "animals_import",
    importacao_tabela_animais: true,
    tabela_destino: "animais",
    total_linhas: rows.length,
    total_linhas_parse_validas: rows.length,
    total_linhas_parse_invalidas: 0,
    contagem_animais_parse: { outro: rows.length },
    linhas: rows,
    linhas_parse_invalidas: [],
    instrucoes_confirmacao: "confirmar_para_cadastrar_animais_faltantes",
    origem_animais_faltantes_eventos: true,
    eventos_apos_cadastro: parsed
  };

  return refreshRanchoMessage({
    tipo: "IMPORTACAO_ANIMAIS_TABELA",
    confianca: 0.94,
    dados,
    resumo: "",
    perguntas_faltantes: []
  }, dados);
}



export function confirmationText(parsed: ParsedRanchoMessage) {
  if (isDestructiveBulkParsed(parsed)) {
    return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  }

  if (parsed.tipo === "EXCLUIR_REBANHO") {
    return [
      "Entendi que você quer excluir todos os animais do rebanho.",
      "Essa ação também remove os vínculos dos animais no bot e não pode ser desfeita.",
      "",
      "Está correto?",
      "1 - Confirmar",
      "2 - Corrigir"
    ].join("\n");
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") return tabularImportConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") return animalImportConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") return stockImportConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") return domainTableConfirmationText(parsed);
  if (parsed.tipo === "IMPORTACAO_TABELA_AMBIGUA") return ambiguousTableQuestion(parsed);

  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(parsed.dados?.registros) ?parsed.dados.registros as ParsedRanchoMessage[] : [];
    const lines = registros
      .slice(0, 6)
      .map((registro, index) => `${index + 1}. ${registro.resumo}`)
      .join("\n");
    const extra = registros.length > 6 ?`\n...e mais ${registros.length - 6} registro(s).` : "";
    const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
    if (stock?.status_resolucao === "matched" && stock.estoque_movimentar) {
      return `Entendi ${registros.length} registros de produção, totalizando ${formatNumber(Number(stock.total_litros || parsed.dados?.total_litros || 0), " L")}, e entrada de ${formatNumber(Number(stock.total_litros || parsed.dados?.total_litros || 0), " L")} no estoque de ${stock.item_leite_resolvido}.\n${lines}${extra}${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
    }
    return `Entendi ${registros.length} registros:\n${lines}${extra}${milkStockStatusText(parsed)}${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
  }

  if (parsed.tipo === "PRODUCAO_LEITE") {
    const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
    if (stock?.status_resolucao === "matched" && stock.estoque_movimentar) {
      return `Entendi: registrar produção de leite do animal ${parsed.dados?.animal_codigo || "informado"} com ${formatNumber(Number(parsed.dados?.litros || 0), " L")} e adicionar ${formatNumber(Number(stock.total_litros || parsed.dados?.litros || 0), " L")} ao estoque de ${stock.item_leite_resolvido}.${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
    }
  }

  if (parsed.tipo === "PARTO" && partoWithChild(parsed.dados || {})) {
    return `${partoChildConfirmationText(parsed)}${postConfirmationConsultationNote(parsed)}`;
  }

  return `Entendi que você quer ${parsed.resumo}.${milkStockStatusText(parsed)}${postConfirmationConsultationNote(parsed)}\n\nEstá correto?\n1 - Confirmar\n2 - Corrigir`;
}



export function dryRunConfirmationText(parsed?: ParsedRanchoMessage) {
  if (!parsed) return "Confirmação recebida no modo teste. Nenhum registro real foi salvo.";

  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;

  if (isDestructiveBulkParsed(parsed)) {
    return DESTRUCTIVE_BULK_ACTION_MESSAGE;
  }

  if (parsed.tipo === "LOTE_REGISTROS") {
    const total = Number(parsed.dados?.total_registros || (Array.isArray(parsed.dados?.registros) ?parsed.dados.registros.length : 0));
    return `Simulação concluída: ${total} registros seriam salvos${stock?.estoque_movimentar ? " e a entrada consolidada de leite seria lançada no estoque" : ""}. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const summary = tabularImportSummary(parsed);
    return `Simulacao concluida: ${summary.ready} evento(s) do rebanho seriam importados. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const summary = animalImportSummary(parsed);
    const lotText = summary.createMissingLots && summary.missingLots ?` e ${summary.missingLots} lote(s) seriam criados` : "";
    return `Simulacao concluida: ${summary.ready} animal(is) seriam cadastrados${lotText}. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const summary = stockImportSummary(parsed);
    const itemText = summary.createMissingItems && summary.missingItems ?` e ${summary.missingItems} item(ns) seriam criados` : "";
    return `Simulacao concluida: ${summary.ready} movimentacao(oes) de estoque seriam importadas${itemText}. Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    const summary = domainTableSummary(parsed);
    return `Simulacao concluida: tabela de ${tabularDomainLabel(summary.domain as Parameters<typeof tabularDomainLabel>[0])} classificada com ${summary.total} linha(s). Nenhum registro real foi salvo.`;
  }

  if (parsed.tipo === "EXCLUIR_REBANHO") {
    return "Simulação concluída: todos os animais do rebanho seriam excluídos. Nenhum registro real foi salvo.";
  }

  if (parsed.tipo === "PARTO" && partoWithChild(parsed.dados || {})) {
    const dados = parsed.dados || {};
    return `Simulacao concluida: o parto seria registrado e a cria ${dados.cria_codigo || "informada"} seria cadastrada/vinculada como descendente direto. Nenhum registro real foi salvo.`;
  }

  return `Confirmação recebida no modo teste. Nenhum registro real foi salvo.\nResumo: ${parsed.resumo}.`;
}



export function partoChildConfirmationText(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const mother = String(dados.animal_codigo || "informada").trim();
  const childSex = normalizeCalfSex(dados.cria_sexo) || String(dados.cria_sexo || "nao informado");
  const childCategory = String(dados.cria_categoria || calfCategoryForSex(childSex) || "cria");
  const childCode = String(dados.cria_codigo || (dados.gerar_cria_codigo_temporario ? "codigo temporario" : "a informar")).trim();
  const father = String(dados.pai_nome || dados.pai_ref || (dados.pai_nao_informado ? "nao informado" : "nao informado")).trim();
  const date = String(dados.data_referencia || "hoje").trim();
  return [
    "Entendi:",
    `- Evento: parto`,
    `- Mae: ${mother}`,
    `- Cria: ${childCategory} ${childSex}`,
    `- Codigo da cria: ${childCode}`,
    `- Pai: ${father}`,
    `- Data do parto/nascimento: ${date}`,
    "",
    "Isso vai registrar o parto, cadastrar a cria ativa e vincular a cria como descendente direto da mae.",
    "",
    "Esta correto?",
    "1 - Confirmar",
    "2 - Corrigir"
  ].join("\n");
}
