import type { AnyRecord } from "@/lib/types";
import { getRanchTodayISO } from "@/lib/dates/ranch-time";
import { generateStructuredAI, parseJsonObjectText, providerApiKeyConfigured } from "@/lib/whatsapp/ai-provider";
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
const PURE_NAVIGATION_OR_REPEAT = /^(?:menu|ajuda|inicio|voltar|repete|repetir|repita|mostra de novo|mostrar de novo|manda de novo|mande de novo)$/;
const ROW_REMOVAL_RE = /\b(?:nao\s+(?:importa|importar|salva|salvar|cadastre|cadastrar|inclua|incluir)|ignora|ignorar|remove|remover|retira|retirar|tira|tirar|exclui|excluir|cancela|cancelar)\b/;
const ROW_UPDATE_RE = /\b(?:corrige|corrigir|muda|mudar|troca|trocar|altera|alterar|ajusta|ajustar|atualiza|atualizar|coloca|colocar|define|definir|marca|marcar)\b/;

export type PendingActionInterpretation = {
  operation: "birth_child_complement" | "remove_rows" | "update_rows" | "answer_question" | "clarify";
  parsed: ParsedRanchoMessage;
  message: string;
  matchedRows: number;
};

type SemanticPendingAction = {
  type: "pending_action_interpretation";
  operation: "remove_rows" | "update_rows" | "answer_question" | "clarify" | "none";
  confidence: number;
  target?: {
    lineNumbers?: number[];
    ordinal?: "first" | "second" | "third" | "last" | null;
    searchText?: string | null;
  };
  patch?: AnyRecord;
  answer?: string | null;
  clarificationQuestion?: string | null;
};
type RowOrdinal = NonNullable<NonNullable<SemanticPendingAction["target"]>["ordinal"]>;

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

function rowLabel(row: AnyRecord) {
  const line = rowLine(row);
  const values = row.values as AnyRecord | undefined;
  const parsedValues = row.parsedValues as AnyRecord | undefined;
  const label = row.item_nome
    || row.item_original
    || row.animal_codigo
    || row.animal_codigo_original
    || row.nome
    || row.lote_nome
    || values?.nome
    || values?.descricao
    || values?.animal_ref
    || parsedValues?.nome
    || parsedValues?.descricao
    || row.rawText
    || "linha";
  return `${line ? `linha ${line}: ` : ""}${String(label).trim()}`;
}

function normalizedRowKey(row: AnyRecord) {
  const line = rowLine(row);
  return line ? `line:${line}` : `text:${rowText(row)}`;
}

function ordinalFromCommand(command: string): "first" | "second" | "third" | "last" | null {
  if (/\b(?:primeira|primeiro|1a|1o)\b/.test(command)) return "first";
  if (/\b(?:segunda|segundo|2a|2o)\b/.test(command)) return "second";
  if (/\b(?:terceira|terceiro|3a|3o)\b/.test(command)) return "third";
  if (/\b(?:ultima|ultimo|ult)\b/.test(command)) return "last";
  return null;
}

function rowsByOrdinal(rows: AnyRecord[], ordinal?: RowOrdinal | null) {
  if (!ordinal) return [];
  if (ordinal === "first") return rows[0] ? [rows[0]] : [];
  if (ordinal === "second") return rows[1] ? [rows[1]] : [];
  if (ordinal === "third") return rows[2] ? [rows[2]] : [];
  if (ordinal === "last") return rows[rows.length - 1] ? [rows[rows.length - 1]] : [];
  return [];
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
    .replace(/\b(?:a|o|as|os|do|da|dos|das|de|essa|esse|estes|estas|primeira|primeiro|segunda|segundo|terceira|terceiro|ultima|ultimo|importacao|importar|tabela|registro|linha|linhas|lote|item|produto|animal|codigo|cod|movimento|quantidade|qtd|qtde|unidade|valor|capacidade|vagas|status|sexo|peso|para|pra|por|como|entrada|entradas|saida|saidas|ativo|ativa|inativo|inativa)\b/g, " ")
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

  const ordinalRows = rowsByOrdinal(rows, ordinalFromCommand(command));
  if (ordinalRows.length) return ordinalRows;

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

function rowsMatchingSemanticTarget(parsed: ParsedRanchoMessage, target: SemanticPendingAction["target"]) {
  const rows = rowsFromParsed(parsed);
  if (!rows.length || !target) return [];
  const lineNumbers = new Set((Array.isArray(target.lineNumbers) ? target.lineNumbers : []).map(Number).filter((line) => Number.isFinite(line) && line > 0));
  if (lineNumbers.size) return rows.filter((row) => lineNumbers.has(rowLine(row)));
  const ordinalRows = rowsByOrdinal(rows, target.ordinal || null);
  if (ordinalRows.length) return ordinalRows;
  const searchText = normalizeRanchoText(String(target.searchText || ""));
  if (searchText) {
    const tokens = targetTokens(searchText);
    if (!tokens.length) return [];
    const exact = rows.filter((row) => rowText(row).includes(searchText));
    if (exact.length) return exact;
    return rows.filter((row) => {
      const text = rowText(row);
      const hits = tokens.filter((token) => text.includes(token)).length;
      return hits === tokens.length || (tokens.length >= 3 && hits >= tokens.length - 1);
    });
  }
  return rows.length === 1 ? rows : [];
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

function categoryFromCommand(command: string) {
  const match = command.match(/\b(vaca|boi|touro|novilha|bezerra|bezerro|outro)\b/);
  return match?.[1] || null;
}

function dateFromCommand(command: string) {
  const match = command.match(/\b(?:data|dia|em|para|pra)\s+(\d{1,2}[/. -]\d{1,2}(?:[/. -]\d{2,4})?|\d{4}-\d{2}-\d{2}|hoje|ontem|amanha)\b/);
  return match?.[1] || null;
}

function buildRowPatch(parsed: ParsedRanchoMessage, command: string) {
  const patch: AnyRecord = {};

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const movement = stockMovementFromCommand(command);
    const unit = unitFromCommand(command);
    const quantity = /\b(?:quantidade|qtd|qtde)\b/.test(command) || unit ? decimalFromCommand(command) : null;
    if (movement) patch.tipo_movimento = movement;
    if (unit) patch.unidade = unit;
    if (typeof quantity === "number" && quantity >= 0) patch.quantidade = quantity;
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const sex = sexFromCommand(command);
    const weight = /\b(?:peso|kg|quilos?)\b/.test(command) ? decimalFromCommand(command) : null;
    const status = activeFromCommand(command);
    const category = categoryFromCommand(command);
    if (sex) patch.sexo = sex;
    if (typeof weight === "number" && weight >= 0) patch.peso = weight;
    if (status) patch.status = status === "ativo" ? "ativo" : "inativo";
    if (category) patch.categoria = category;
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const eventKind = detectReproductiveEventKind(command);
    const date = dateFromCommand(command);
    if (eventKind) {
      patch.evento_tipo = eventKind;
      patch.db_tipo = reproductiveEventDbType(eventKind);
      patch.evento_label = reproductiveEventLabel(eventKind);
      patch.status_original = reproductiveEventLabel(eventKind);
    }
    if (date) patch.data_referencia = date;
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

function testModeBlocksSemanticAI() {
  return process.env.RANCHO_BOT_TEST === "1" || process.env.NODE_ENV === "test";
}

function shouldSkipPendingActionSemantic(command: string) {
  return !command
    || PURE_CONFIRMATION_OR_CANCEL.test(command)
    || PURE_NAVIGATION_OR_REPEAT.test(command);
}

function shouldUseSemanticAI(text: string) {
  const command = normalizeRanchoText(text);
  if (shouldSkipPendingActionSemantic(command)) return false;
  if (process.env.BOT_PENDING_ACTION_AI === "false") return false;
  if (testModeBlocksSemanticAI()) return false;
  if (!providerApiKeyConfigured()) return false;
  return command.length > 2;
}

function rowPromptSummary(parsed: ParsedRanchoMessage) {
  return rowsFromParsed(parsed).slice(0, 20).map((row, index) => ({
    index: index + 1,
    lineNumber: rowLine(row) || index + 1,
    label: rowLabel(row),
    text: rowText(row).slice(0, 240)
  }));
}

function buildPendingActionPrompt(pending: ParsedRanchoMessage, text: string) {
  return [
    "Voce interpreta uma mensagem do usuario sobre uma acao pendente do bot Rancho.",
    "Retorne somente JSON. Nao retorne markdown. Nao salve nada. Nao execute nada.",
    "A IA so classifica a resposta; o backend vai validar campos, linhas e permissao.",
    "",
    "Operacoes permitidas:",
    "- remove_rows: remover uma ou mais linhas da importacao pendente.",
    "- update_rows: alterar campos de uma ou mais linhas da importacao pendente.",
    "- answer_question: responder uma pergunta sobre o preview pendente sem alterar nada.",
    "- clarify: pedir mais contexto quando nao souber linha/campo.",
    "- none: mensagem nao relacionada a acao pendente.",
    "",
    "Contrato JSON:",
    JSON.stringify({
      type: "pending_action_interpretation",
      operation: "update_rows",
      confidence: 0.9,
      target: { lineNumbers: [2], ordinal: null, searchText: "sal mineral" },
      patch: { tipo_movimento: "saida", quantidade: 20, unidade: "kg" },
      answer: null,
      clarificationQuestion: null
    }, null, 2),
    "",
    "Campos permitidos por area:",
    "- estoque: item_nome, tipo_movimento entrada|saida, quantidade, unidade, valor_unitario, observacoes, data_referencia.",
    "- animais: animal_codigo, nome, categoria vaca|boi|touro|novilha|bezerra|bezerro|outro, sexo macho|femea, lote_nome, peso, status ativo|inativo, data_nascimento, observacoes.",
    "- eventos/reproducao: animal_codigo, evento_tipo parto|cio|prenhez|inseminacao|pre_parto|protocolo|reteste|aborto|observacao, data_referencia, observacoes, cria_codigo, cria_sexo, pai_ref.",
    "- dominio: nome, descricao, status, capacidade, valor, data, tipo, funcionario_ref, animal_ref, observacao, entrada, saida.",
    "",
    "Regras:",
    "- Se o usuario falar segunda/terceira/ultima linha, use target.ordinal.",
    "- Se citar numero de linha, use target.lineNumbers.",
    "- Se citar item/lote/animal pelo nome, use target.searchText.",
    "- Se a frase puder atingir varias linhas e nao for claro, operation=clarify.",
    "- Nunca invente valores ausentes. Se nao souber, operation=clarify.",
    "",
    `Data atual do rancho: ${getRanchTodayISO()}`,
    `Acao pendente: ${pending.tipo}`,
    `Resumo dos dados pendentes: ${JSON.stringify({ total_linhas: pending.dados?.total_linhas, dominio_tabela: pending.dados?.dominio_tabela })}`,
    `Linhas disponiveis: ${JSON.stringify(rowPromptSummary(pending))}`,
    "",
    `Usuario: ${text}`
  ].join("\n");
}

function semanticOperation(value: unknown): SemanticPendingAction["operation"] | null {
  const normalized = String(value || "").trim();
  if (["remove_rows", "update_rows", "answer_question", "clarify", "none"].includes(normalized)) {
    return normalized as SemanticPendingAction["operation"];
  }
  return null;
}

function normalizeSemanticAction(value: unknown): SemanticPendingAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as AnyRecord;
  if (record.type !== "pending_action_interpretation") return null;
  const operation = semanticOperation(record.operation);
  if (!operation) return null;
  const confidence = Number(record.confidence || 0);
  const target = record.target && typeof record.target === "object" && !Array.isArray(record.target) ? record.target as AnyRecord : {};
  const ordinal = ["first", "second", "third", "last"].includes(String(target.ordinal || "")) ? String(target.ordinal) as RowOrdinal : null;
  const lineNumbers = Array.isArray(target.lineNumbers)
    ? target.lineNumbers.map(Number).filter((line) => Number.isFinite(line) && line > 0)
    : [];
  return {
    type: "pending_action_interpretation",
    operation,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    target: {
      lineNumbers,
      ordinal,
      searchText: typeof target.searchText === "string" ? target.searchText : null
    },
    patch: record.patch && typeof record.patch === "object" && !Array.isArray(record.patch) ? record.patch as AnyRecord : {},
    answer: typeof record.answer === "string" ? record.answer : null,
    clarificationQuestion: typeof record.clarificationQuestion === "string" ? record.clarificationQuestion : null
  };
}

function semanticNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = parseDecimalNumber(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function semanticText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizeSemanticMovement(value: unknown) {
  const normalized = normalizeRanchoText(String(value || ""));
  if (stockMovementFromCommand(normalized) === "saida" || normalized === "saida") return "saida";
  if (stockMovementFromCommand(normalized) === "entrada" || normalized === "entrada") return "entrada";
  return undefined;
}

function semanticPatchForPending(parsed: ParsedRanchoMessage, semantic: SemanticPendingAction) {
  const source = semantic.patch || {};
  const patch: AnyRecord = {};

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    const movement = normalizeSemanticMovement(source.tipo_movimento || source.movimento || source.tipo);
    const quantity = semanticNumber(source.quantidade || source.qtd || source.quantity);
    if (semanticText(source.item_nome || source.item || source.produto)) patch.item_nome = semanticText(source.item_nome || source.item || source.produto);
    if (movement) patch.tipo_movimento = movement;
    if (typeof quantity === "number" && quantity >= 0) patch.quantidade = quantity;
    if (semanticText(source.unidade)) patch.unidade = semanticText(source.unidade);
    if (semanticNumber(source.valor_unitario || source.valor)) patch.valor_unitario = semanticNumber(source.valor_unitario || source.valor);
    if (semanticText(source.data_referencia || source.data)) patch.data_referencia = semanticText(source.data_referencia || source.data);
    if (semanticText(source.observacoes || source.obs)) patch.observacoes = semanticText(source.observacoes || source.obs);
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    const sex = sexFromCommand(normalizeRanchoText(String(source.sexo || "")));
    const status = activeFromCommand(normalizeRanchoText(String(source.status || "")));
    const category = categoryFromCommand(normalizeRanchoText(String(source.categoria || "")));
    const weight = semanticNumber(source.peso);
    if (semanticText(source.animal_codigo || source.codigo || source.brinco)) patch.animal_codigo = semanticText(source.animal_codigo || source.codigo || source.brinco);
    if (semanticText(source.nome)) patch.nome = semanticText(source.nome);
    if (category) patch.categoria = category;
    if (sex) patch.sexo = sex;
    if (semanticText(source.lote_nome || source.lote)) patch.lote_nome = semanticText(source.lote_nome || source.lote);
    if (typeof weight === "number" && weight >= 0) patch.peso = weight;
    if (status) patch.status = status;
    if (semanticText(source.data_nascimento || source.nascimento)) patch.data_nascimento = semanticText(source.data_nascimento || source.nascimento);
    if (semanticText(source.observacoes || source.obs)) patch.observacoes = semanticText(source.observacoes || source.obs);
  }

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    const eventText = normalizeRanchoText(String(source.evento_tipo || source.evento || source.tipo || ""));
    const eventKind = detectReproductiveEventKind(eventText);
    if (semanticText(source.animal_codigo || source.animal_ref || source.codigo)) patch.animal_codigo = semanticText(source.animal_codigo || source.animal_ref || source.codigo);
    if (eventKind) {
      patch.evento_tipo = eventKind;
      patch.db_tipo = reproductiveEventDbType(eventKind);
      patch.evento_label = reproductiveEventLabel(eventKind);
      patch.status_original = reproductiveEventLabel(eventKind);
    }
    if (semanticText(source.data_referencia || source.data)) patch.data_referencia = semanticText(source.data_referencia || source.data);
    if (semanticText(source.observacoes || source.obs)) patch.observacoes = semanticText(source.observacoes || source.obs);
    if (semanticText(source.cria_codigo)) patch.cria_codigo = semanticText(source.cria_codigo);
    if (semanticText(source.pai_ref)) patch.pai_ref = semanticText(source.pai_ref);
    const childSex = sexFromCommand(normalizeRanchoText(String(source.cria_sexo || source.sexo_cria || "")));
    if (childSex) patch.cria_sexo = childSex;
  }

  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    const allowed = ["nome", "descricao", "status", "capacidade", "valor", "data", "tipo", "funcionario_ref", "animal_ref", "observacao", "entrada", "saida"];
    const valuesPatch: AnyRecord = {};
    for (const key of allowed) {
      if (source[key] !== undefined && source[key] !== null && String(source[key]).trim() !== "") {
        valuesPatch[key] = source[key];
      }
    }
    if (Object.keys(valuesPatch).length) {
      patch.values = valuesPatch;
      patch.parsedValues = valuesPatch;
    }
  }

  return Object.keys(patch).length ? patch : null;
}

function answerQuestionFromPending(parsed: ParsedRanchoMessage, semantic: SemanticPendingAction) {
  const rows = rowsMatchingSemanticTarget(parsed, semantic.target);
  if (rows.length) {
    return `No preview pendente, encontrei:\n${rows.slice(0, 6).map((row) => `- ${rowLabel(row)}`).join("\n")}`;
  }
  const allRows = rowsFromParsed(parsed);
  if (!allRows.length) return "Nao ha linhas no preview pendente para consultar.";
  return `O preview pendente tem ${allRows.length} linha(s). Principais linhas:\n${allRows.slice(0, 6).map((row) => `- ${rowLabel(row)}`).join("\n")}`;
}

function applySemanticAction(pending: ParsedRanchoMessage, semantic: SemanticPendingAction): PendingActionInterpretation | null {
  if (semantic.confidence < 0.72) return null;
  if (semantic.operation === "none") return null;
  if (semantic.operation === "clarify") {
    return {
      operation: "clarify",
      parsed: pending,
      message: semantic.clarificationQuestion || "Entendi que voce esta falando da importacao pendente, mas preciso saber qual linha ou campo voce quer alterar.",
      matchedRows: 0
    };
  }
  if (semantic.operation === "answer_question") {
    return {
      operation: "answer_question",
      parsed: pending,
      message: answerQuestionFromPending(pending, semantic),
      matchedRows: rowsMatchingSemanticTarget(pending, semantic.target).length
    };
  }

  const rows = rowsMatchingSemanticTarget(pending, semantic.target);
  if (!rows.length) {
    return {
      operation: "clarify",
      parsed: pending,
      message: "Entendi a mudanca, mas nao consegui identificar a linha certa. Me diga o numero da linha ou o nome/codigo exatamente como aparece no resumo.",
      matchedRows: 0
    };
  }

  if (semantic.operation === "remove_rows") {
    return {
      operation: "remove_rows",
      parsed: removeRows(pending, rows),
      message: `Removi ${rows.length} linha(s) da importacao pendente. Revise o resumo atualizado:`,
      matchedRows: rows.length
    };
  }

  const patch = semanticPatchForPending(pending, semantic);
  if (!patch) {
    return {
      operation: "clarify",
      parsed: pending,
      message: "Entendi a linha, mas nao encontrei um campo seguro para alterar. Me diga algo como quantidade, movimento, lote, status, data ou observacao.",
      matchedRows: rows.length
    };
  }

  return {
    operation: "update_rows",
    parsed: updateRows(pending, rows, patch),
    message: `Atualizei ${rows.length} linha(s) da importacao pendente. Revise o resumo atualizado:`,
    matchedRows: rows.length
  };
}

async function interpretPendingActionWithSemanticAI(pending: ParsedRanchoMessage, text: string) {
  if (!TABLE_IMPORT_INTENTS.has(pending.tipo)) return null;
  if (!shouldUseSemanticAI(text)) return null;
  try {
    const generated = await generateStructuredAI({
      purpose: "pending_action",
      userPrompt: buildPendingActionPrompt(pending, text),
      temperature: 0.05,
      maxTokens: 700
    });
    if (!generated.ok) return null;
    const semantic = normalizeSemanticAction(parseJsonObjectText(generated.rawText));
    return semantic ? applySemanticAction(pending, semantic) : null;
  } catch {
    return null;
  }
}

function wantsRowRemoval(command: string) {
  if (!ROW_REMOVAL_RE.test(command)) return false;
  if (PURE_CONFIRMATION_OR_CANCEL.test(command)) return false;
  return targetTokens(targetTextFromCommand(command)).length > 0 || lineNumbersFromCommand(command).size > 0 || Boolean(ordinalFromCommand(command));
}

function wantsRowUpdate(command: string) {
  if (!ROW_UPDATE_RE.test(command)) return false;
  if (PURE_CONFIRMATION_OR_CANCEL.test(command)) return false;
  return true;
}

function wantsPendingQuestion(command: string) {
  if (ROW_REMOVAL_RE.test(command) || ROW_UPDATE_RE.test(command)) return false;
  return /\b(?:qual|quais|mostrar|mostra|mostre|ver|detalha|detalhe|resumo|lista|liste)\b/.test(command)
    && /\b(?:linha|linhas|importacao|preview|pendente|item|lote|animal|registro)\b/.test(command);
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

  if (wantsPendingQuestion(command)) {
    const rows = rowsMatchingCommand(pending, command);
    const message = rows.length
      ? `No preview pendente, encontrei:\n${rows.slice(0, 6).map((row) => `- ${rowLabel(row)}`).join("\n")}`
      : answerQuestionFromPending(pending, { type: "pending_action_interpretation", operation: "answer_question", confidence: 1, target: {}, patch: {} });
    return {
      operation: "answer_question",
      parsed: pending,
      message,
      matchedRows: rows.length
    };
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

export async function interpretPendingActionMessageSmart(pending: ParsedRanchoMessage, text: string): Promise<PendingActionInterpretation | null> {
  const command = normalizeRanchoText(text);
  if (shouldSkipPendingActionSemantic(command)) return null;
  const local = interpretPendingActionMessage(pending, text);
  if (local && local.operation !== "clarify") return local;
  const semantic = await interpretPendingActionWithSemanticAI(pending, text);
  return semantic || local;
}
