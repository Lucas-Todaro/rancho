import type { AnyRecord } from "@/lib/types";
import { applyReproductionImportChildComplement } from "@/lib/whatsapp/action-plan/reproduction-import-child";
import {
  detectReproductiveEventKind,
  normalizeRanchoText,
  parseDecimalNumber,
  refreshRanchoMessage,
  reproductiveEventDbType,
  reproductiveEventLabel,
  type ParsedRanchoMessage
} from "@/lib/whatsapp/nlp";

const TABLE_IMPORT_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "IMPORTACAO_EVENTOS_TABELA",
  "IMPORTACAO_ANIMAIS_TABELA",
  "IMPORTACAO_ESTOQUE_TABELA",
  "IMPORTACAO_TABELA_DOMINIO"
]);

const PURE_CONFIRMATION_OR_CANCEL = /^(?:1|2|sim|s|ok|confirmar|confirma|importar|salvar|cancelar|cancela|cancele|nao|n|corrigir|corrige)$/;
const ROW_REMOVAL_RE = /\b(?:nao\s+(?:importa|importar|salva|salvar|cadastre|cadastrar|inclua|incluir)|ignora|ignorar|remove|remover|retira|retirar|tira|tirar|exclui|excluir|cancela|cancelar)\b/;
const ROW_UPDATE_RE = /\b(?:corrige|corrigir|muda|mudar|troca|trocar|altera|alterar|ajusta|ajustar|atualiza|atualizar|coloca|colocar|define|definir|marca|marcar)\b/;

export type PendingActionInterpretation = {
  operation: "birth_child_complement" | "remove_rows" | "update_rows" | "clarify";
  parsed: ParsedRanchoMessage;
  message: string;
  matchedRows: number;
};

function rowsFromParsed(parsed: ParsedRanchoMessage) {
  return Array.isArray(parsed.dados?.linhas) ? parsed.dados.linhas as AnyRecord[] : [];
}

function primitiveValues(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (["string", "number", "boolean"].includes(typeof value)) return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => primitiveValues(item));
  if (typeof value === "object") {
    return Object.values(value as AnyRecord).flatMap((item) => primitiveValues(item));
  }
  return [];
}

function rowText(row: AnyRecord) {
  const values = [
    row.rawText,
    row.animal_codigo,
    row.animal_codigo_original,
    row.brinco,
    row.nome,
    row.categoria,
    row.lote_nome,
    row.item_nome,
    row.item_original,
    row.produto,
    row.tipo_movimento,
    row.evento_tipo,
    row.evento_label,
    row.status_original,
    row.descricao,
    row.observacoes,
    ...primitiveValues(row.values),
    ...primitiveValues(row.parsedValues)
  ];
  return normalizeRanchoText(values.filter(Boolean).join(" "));
}

function rowLine(row: AnyRecord) {
  return Number(row.lineNumber || row.linha || 0) || 0;
}

function normalizedRowKey(row: AnyRecord) {
  const line = rowLine(row);
  return line ? `line:${line}` : `text:${rowText(row)}`;
}

function lineNumbersFromCommand(command: string) {
  const numbers = new Set<number>();
  for (const match of Array.from(command.matchAll(/\blinhas?\s+(\d+(?:\s*(?:,|e)\s*\d+)*)\b/g))) {
    for (const numberText of match[1].split(/\s*(?:,|e)\s*/)) {
      const number = Number(numberText);
      if (Number.isFinite(number) && number > 0) numbers.add(number);
    }
  }
  return numbers;
}

function stripCommandNoise(command: string) {
  return command
    .replace(/\blinhas?\s+\d+(?:\s*(?:,|e)\s*\d+)*\b/g, " ")
    .replace(ROW_REMOVAL_RE, " ")
    .replace(ROW_UPDATE_RE, " ")
    .replace(/\b(?:a|o|as|os|do|da|dos|das|de|essa|esse|estes|estas|importacao|importar|tabela|registro|linha|linhas|lote|item|produto|animal|codigo|cod|movimento|quantidade|qtd|qtde|unidade|valor|capacidade|vagas|status|sexo|peso|para|pra|por|como|entrada|entradas|saida|saidas|ativo|ativa|inativo|inativa)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function targetTextFromCommand(command: string) {
  const direct = command.match(/\b(?:linha|lote|item|produto|animal|codigo|cod)\s+([a-z0-9_.-][a-z0-9_.\-\s]*)$/);
  const text = direct?.[1] || stripCommandNoise(command);
  return normalizeRanchoText(text);
}

function targetTokens(target: string) {
  return target
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !["para", "como", "por", "em", "no", "na"].includes(token));
}

function rowsMatchingCommand(parsed: ParsedRanchoMessage, command: string) {
  const rows = rowsFromParsed(parsed);
  if (!rows.length) return [];

  const lineNumbers = lineNumbersFromCommand(command);
  if (lineNumbers.size) {
    return rows.filter((row) => lineNumbers.has(rowLine(row)));
  }

  const target = targetTextFromCommand(command);
  const tokens = targetTokens(target);
  if (!tokens.length) return rows.length === 1 ? rows : [];

  const exact = rows.filter((row) => rowText(row).includes(target));
  if (exact.length) return exact;

  return rows.filter((row) => {
    const text = rowText(row);
    const hits = tokens.filter((token) => text.includes(token)).length;
    return hits === tokens.length || (tokens.length >= 3 && hits >= tokens.length - 1);
  });
}

function withoutValidationMetadata(row: AnyRecord) {
  const next = { ...row };
  for (const key of [
    "problemas",
    "avisos",
    "problemas_validacao",
    "status_validacao",
    "animal_id",
    "animal_resolvido",
    "animal_opcoes",
    "descricao_salvar",
    "item_id",
    "item_resolvido",
    "itens_parecidos",
    "unidade_resolvida",
    "lote_id",
    "lote_resolvido",
    "lote_nome_resolvido",
    "problemas_validacao_dominio",
    "avisos_validacao_dominio",
    "status_validacao_dominio",
    "resumo_validacao_dominio"
  ]) {
    delete next[key];
  }
  return next;
}

function parsedWithRows(parsed: ParsedRanchoMessage, rows: AnyRecord[]) {
  const dados = {
    ...(parsed.dados || {}),
    linhas: rows,
    total_linhas: rows.length,
    total_linhas_parse_validas: rows.length
  };
  return refreshRanchoMessage(parsed, dados);
}

function removeRows(parsed: ParsedRanchoMessage, selectedRows: AnyRecord[]) {
  const selected = new Set(selectedRows.map(normalizedRowKey));
  const remaining = rowsFromParsed(parsed).filter((row) => !selected.has(normalizedRowKey(row)));
  const dados = {
    ...(parsed.dados || {}),
    linhas: remaining,
    total_linhas: remaining.length,
    total_linhas_parse_validas: remaining.length,
    linhas_removidas_pelo_usuario: [
      ...((Array.isArray(parsed.dados?.linhas_removidas_pelo_usuario) ? parsed.dados.linhas_removidas_pelo_usuario : []) as AnyRecord[]),
      ...selectedRows.map((row) => ({
        lineNumber: rowLine(row) || null,
        rawText: row.rawText || null,
        removida_em_conversa: true
      }))
    ]
  };
  return refreshRanchoMessage(parsed, dados);
}

function decimalFromCommand(command: string) {
  const match = command.match(/\b(?:para|pra|por|=)\s*(-?\d+(?:[.,]\d+)?)\b/) || command.match(/\b(-?\d+(?:[.,]\d+)?)\b/);
  if (!match) return null;
  const parsed = parseDecimalNumber(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function stockMovementFromCommand(command: string) {
  if (/\b(?:saida|saidas|venda|vendi|baixa|retirada|retirar|usei|consumi|gastou|gastei)\b/.test(command)) return "saida";
  if (/\b(?:entrada|entradas|compra|comprei|adiciona|adicionar|recebi|chegou)\b/.test(command)) return "entrada";
  return null;
}

function unitFromCommand(command: string) {
  const match = command.match(/\b(kg|quilo|quilos|saco|sacos|litro|litros|l|dose|doses|unidade|unidades|caixa|caixas|fardo|fardos)\b/);
  if (!match) return null;
  const value = match[1];
  if (["quilo", "quilos"].includes(value)) return "kg";
  if (["saco"].includes(value)) return "sacos";
  if (["litro", "litros", "l"].includes(value)) return "litros";
  if (["dose"].includes(value)) return "doses";
  if (["unidade"].includes(value)) return "unidades";
  if (["caixa"].includes(value)) return "caixas";
  if (["fardo"].includes(value)) return "fardos";
  return value;
}

function sexFromCommand(command: string) {
  if (/\b(?:femea|feminino|bezerra|vaca|novilha)\b/.test(command)) return "femea";
  if (/\b(?:macho|masculino|bezerro|boi|touro)\b/.test(command)) return "macho";
  return null;
}

function activeFromCommand(command: string) {
  if (/\b(?:inativo|inativa|desativado|desativada|desligado|desligada|nao ativo|nao ativa)\b/.test(command)) return "inativo";
  if (/\b(?:ativo|ativa|sim)\b/.test(command)) return "ativo";
  return null;
}

function buildRowPatch(parsed: ParsedRanchoMessage, command: string) {
  const patch: AnyRecord = {};

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const movement = stockMovementFromCommand(command);
    const unit = unitFromCommand(command);
    const quantity = /\b(?:quantidade|qtd|qtde)\b/.test(command) ? decimalFromCommand(command) : null;
    if (movement) patch.tipo_movimento = movement;
    if (unit) patch.unidade = unit;
    if (typeof quantity === "number" && quantity >= 0) patch.quantidade = quantity;
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const sex = sexFromCommand(command);
    const weight = /\b(?:peso|kg|quilos?)\b/.test(command) ? decimalFromCommand(command) : null;
    const status = activeFromCommand(command);
    if (sex) patch.sexo = sex;
    if (typeof weight === "number" && weight >= 0) patch.peso = weight;
    if (status) patch.status = status === "ativo" ? "ativo" : "inativo";
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const eventKind = detectReproductiveEventKind(command);
    if (eventKind) {
      patch.evento_tipo = eventKind;
      patch.db_tipo = reproductiveEventDbType(eventKind);
      patch.evento_label = reproductiveEventLabel(eventKind);
      patch.status_original = reproductiveEventLabel(eventKind);
    }
  }

  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    const capacity = /\b(?:capacidade|vagas?)\b/.test(command) ? decimalFromCommand(command) : null;
    const status = activeFromCommand(command);
    if (typeof capacity === "number" && capacity >= 0) {
      patch.values = { capacidade: capacity };
      patch.parsedValues = { capacidade: capacity };
    }
    if (status) {
      patch.values = { ...(patch.values || {}), status };
      patch.parsedValues = { ...(patch.parsedValues || {}), status };
    }
  }

  return Object.keys(patch).length ? patch : null;
}

function mergePatchIntoRow(row: AnyRecord, patch: AnyRecord) {
  const next = withoutValidationMetadata(row);
  const valuesPatch = patch.values as AnyRecord | undefined;
  const parsedValuesPatch = patch.parsedValues as AnyRecord | undefined;
  delete patch.values;
  delete patch.parsedValues;
  Object.assign(next, patch);
  if (valuesPatch) next.values = { ...((next.values || {}) as AnyRecord), ...valuesPatch };
  if (parsedValuesPatch) next.parsedValues = { ...((next.parsedValues || {}) as AnyRecord), ...parsedValuesPatch };
  return next;
}

function updateRows(parsed: ParsedRanchoMessage, selectedRows: AnyRecord[], patch: AnyRecord) {
  const selected = new Set(selectedRows.map(normalizedRowKey));
  const nextRows = rowsFromParsed(parsed).map((row) => (
    selected.has(normalizedRowKey(row)) ? mergePatchIntoRow(row, { ...patch }) : row
  ));
  return parsedWithRows(parsed, nextRows);
}

function wantsRowRemoval(command: string) {
  if (!ROW_REMOVAL_RE.test(command)) return false;
  if (PURE_CONFIRMATION_OR_CANCEL.test(command)) return false;
  return targetTokens(targetTextFromCommand(command)).length > 0 || lineNumbersFromCommand(command).size > 0;
}

function wantsRowUpdate(command: string) {
  if (!ROW_UPDATE_RE.test(command)) return false;
  if (PURE_CONFIRMATION_OR_CANCEL.test(command)) return false;
  return true;
}

export function interpretPendingActionMessage(pending: ParsedRanchoMessage, text: string): PendingActionInterpretation | null {
  if (!TABLE_IMPORT_INTENTS.has(pending.tipo)) return null;
  const command = normalizeRanchoText(text);
  if (!command || PURE_CONFIRMATION_OR_CANCEL.test(command)) return null;

  if (pending.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const childPatched = applyReproductionImportChildComplement(pending, text);
    if (childPatched) {
      return {
        operation: "birth_child_complement",
        parsed: childPatched,
        message: "Atualizei os dados das crias no lote. Revise o resumo atualizado:",
        matchedRows: rowsFromParsed(childPatched).length
      };
    }
  }

  if (wantsRowRemoval(command)) {
    const rows = rowsMatchingCommand(pending, command);
    if (!rows.length) {
      return {
        operation: "clarify",
        parsed: pending,
        message: "Nao encontrei essa linha na importacao pendente. Me envie o numero da linha ou o nome/codigo exatamente como aparece no resumo.",
        matchedRows: 0
      };
    }
    const parsed = removeRows(pending, rows);
    return {
      operation: "remove_rows",
      parsed,
      message: `Removi ${rows.length} linha(s) da importacao pendente. Revise o resumo atualizado:`,
      matchedRows: rows.length
    };
  }

  if (wantsRowUpdate(command)) {
    const patch = buildRowPatch(pending, command);
    if (!patch) return null;
    const rows = rowsMatchingCommand(pending, command);
    if (!rows.length) {
      return {
        operation: "clarify",
        parsed: pending,
        message: "Entendi que voce quer corrigir a importacao, mas nao encontrei a linha certa. Me envie o numero da linha ou o nome/codigo do item.",
        matchedRows: 0
      };
    }
    const parsed = updateRows(pending, rows, patch);
    return {
      operation: "update_rows",
      parsed,
      message: `Atualizei ${rows.length} linha(s) da importacao pendente. Revise o resumo atualizado:`,
      matchedRows: rows.length
    };
  }

  return null;
}
