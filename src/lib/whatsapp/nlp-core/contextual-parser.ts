import { cleanAnswer, hasValue, normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { firstNumber } from "@/lib/whatsapp/nlp-numbers";
import type { ParsedRanchoMessage } from "./types";
import { buildMissing, finalize } from "./result";
import { parseRanchoMessage } from "./parser";
import {
  extractAnimalBirthDate,
  extractAnimalBreed,
  extractAnimalCategory,
  extractAnimalCode,
  extractAnimalLotName,
  extractAnimalPhase,
  extractAnimalSex,
  extractDateReference,
  extractEmployeeCreationName,
  extractEmployeeName,
  extractLiters,
  extractMoneyValue,
  extractPointTime,
  extractPointType,
  extractProduct,
  extractStockItem,
  extractStockQuantity,
  extractStockUnit,
  extractTurno,
  extractWhatsappPhone,
  isAnimalOptionalField,
  isSkipOptionalAnswer,
  markAnimalOptionalFieldSkipped,
  normalizeAnimalCandidate,
  removeValueAndCommonWords
} from "./extractors";

export function mergeRanchoMessageData(current: ParsedRanchoMessage, answer: string): ParsedRanchoMessage {
  const original = cleanAnswer(answer);
  const normalized = normalizeRanchoText(original);
  const parsedAnswer = parseRanchoMessage(answer);
  const dados = { ...current.dados };
  const expectedFields = buildMissing(current.tipo, dados);
  const expectedField = expectedFields[0];

  if (current.tipo === "CADASTRO_ANIMAL" && isAnimalOptionalField(expectedField) && isSkipOptionalAnswer(original)) {
    const nextDados = markAnimalOptionalFieldSkipped(dados, expectedField as string);
    return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
  }

  if (parsedAnswer.tipo === current.tipo) {
    Object.entries(parsedAnswer.dados).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (!expectedField || key === expectedField || dados[key] === undefined || dados[key] === null || dados[key] === "") {
        dados[key] = value;
      }
    });
  }

  if (expectedField) {
    const contextualNumber = firstNumber(normalized);
    const contextualQuantity = extractStockQuantity(original);
    const contextualPhone = extractWhatsappPhone(original);
    const contextualAnimal = expectedField === "animal_codigo" ?normalizeAnimalCandidate(original) || extractAnimalCode(normalized, current.tipo) : undefined;

    if (expectedField === "animal_codigo" && contextualAnimal) dados.animal_codigo = contextualAnimal;
    if (expectedField === "litros" && contextualNumber) dados.litros = contextualNumber;
    if (expectedField === "valor" && contextualNumber) dados.valor = contextualNumber;
    if (expectedField === "quantidade" && contextualQuantity !== undefined) dados.quantidade = contextualQuantity;
    if (expectedField === "unidade") dados.unidade = extractStockUnit(normalized) || original;
    if (expectedField === "produto" && original) dados.produto = original;
    if (expectedField === "item_nome" && original) dados.item_nome = extractStockItem(original) || original;
    if (expectedField === "descricao" && original) dados.descricao = original;
    if (expectedField === "funcionario_nome" && original) dados.funcionario_nome = extractEmployeeCreationName(original) || original;
    if (expectedField === "telefone" && contextualPhone) dados.telefone = contextualPhone;
    if (expectedField === "ponto_tipo") dados.ponto_tipo = extractPointType(normalized);
    if (expectedField === "categoria_animal") dados.categoria = extractAnimalCategory(normalized) || original.toLowerCase();
    if (expectedField === "sexo") dados.sexo = extractAnimalSex(normalized);
    if (expectedField === "fase") dados.fase = extractAnimalPhase(normalized);
    if (expectedField === "raca" && original) dados.raca = extractAnimalBreed(original) || original;
    if (expectedField === "lote_animal" && original) {
      dados.lote_nome = extractAnimalLotName(original) || original;
      dados.lote_nao_encontrado = undefined;
      dados.lote_opcoes = undefined;
    }
    if (expectedField === "data_nascimento") dados.data_nascimento = extractAnimalBirthDate(original);
  }

  const animalIntent = ["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE", "CADASTRO_ANIMAL"].includes(current.tipo);
  const animalCode = animalIntent && expectedField && expectedField !== "animal_codigo"
    ?undefined
    : animalIntent ?extractAnimalCode(normalized, current.tipo) : undefined;
  const liters = extractLiters(normalized);
  const value = extractMoneyValue(normalized);
  const quantity = extractStockQuantity(original);
  const itemName = extractStockItem(original);
  const employeeName = extractEmployeeName(original, normalized);
  const employeeCreationName = extractEmployeeCreationName(original);
  const phone = extractWhatsappPhone(original);
  const pointType = extractPointType(normalized);
  const pointTime = extractPointTime(normalized);

  if (animalCode && (!dados.animal_codigo || expectedField === "animal_codigo")) dados.animal_codigo = animalCode;
  if (liters && current.tipo === "PRODUCAO_LEITE" && (!dados.litros || expectedField === "litros")) dados.litros = liters;
  const isFinancialValueCorrection = value !== undefined
    && ["DESPESA", "RECEITA_VENDA"].includes(current.tipo)
    && !expectedField
    && /^(?:foi|era|valor|r\$|\d)/.test(normalized);
  if (value !== undefined && ["DESPESA", "RECEITA_VENDA"].includes(current.tipo) && (!hasValue(dados.valor) || expectedField === "valor" || isFinancialValueCorrection)) dados.valor = value;
  if (quantity !== undefined && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo) && (!hasValue(dados.quantidade) || expectedField === "quantidade")) dados.quantidade = quantity;
  if (itemName && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo) && (!dados.item_nome || expectedField === "item_nome")) dados.item_nome = itemName;
  if (employeeName && current.tipo === "PONTO_FUNCIONARIO" && (!dados.funcionario_nome || expectedField === "funcionario_nome")) dados.funcionario_nome = employeeName;
  if (employeeCreationName && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.funcionario_nome || expectedField === "funcionario_nome")) dados.funcionario_nome = employeeCreationName;
  if (phone && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.telefone || expectedField === "telefone")) dados.telefone = phone;
  if (pointType && current.tipo === "PONTO_FUNCIONARIO" && (!dados.ponto_tipo || expectedField === "ponto_tipo")) dados.ponto_tipo = pointType;
  if (pointTime && current.tipo === "PONTO_FUNCIONARIO" && !dados.horario) dados.horario = pointTime;

  if (!dados.turno) dados.turno = extractTurno(normalized);
  if (!dados.data_referencia) dados.data_referencia = extractDateReference(normalized);
  if (!dados.unidade && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo)) dados.unidade = extractStockUnit(normalized);
  if (!dados.produto && current.tipo === "VACINA_MEDICAMENTO") dados.produto = extractProduct(answer, normalized);
  if (!dados.descricao && ["DESPESA", "RECEITA_VENDA", "ORDEM_SERVICO"].includes(current.tipo)) dados.descricao = removeValueAndCommonWords(original) || original;
  if (current.tipo === "CADASTRO_ANIMAL") {
    if (!dados.categoria) dados.categoria = extractAnimalCategory(normalized);
    if (!dados.sexo) dados.sexo = extractAnimalSex(normalized);
    if (!dados.fase) dados.fase = extractAnimalPhase(normalized);
    if (!dados.raca) dados.raca = extractAnimalBreed(original);
    if (!dados.lote_nome && !dados.lote_id) dados.lote_nome = extractAnimalLotName(original);
    if (!dados.data_nascimento) dados.data_nascimento = extractAnimalBirthDate(original);
  }

  const missing = buildMissing(current.tipo, dados);
  return finalize(current.tipo, dados, missing);
}
