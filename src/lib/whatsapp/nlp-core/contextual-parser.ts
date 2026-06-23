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
  extractAnimalRegistrationCode,
  extractAnimalRegistrationName,
  extractAnimalSex,
  extractAnimalWeight,
  inferAnimalSexFromCategory,
  extractDateReference,
  extractEmployeeCreationName,
  extractEmployeeAccessMode,
  extractEmployeeCpf,
  extractEmployeeName,
  extractEmployeePaymentPeriod,
  extractEmployeePaymentType,
  extractEmployeeSalary,
  extractFinanceDescription,
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
  isSkipAnimalSexOptionalAnswer,
  isSkipOptionalAnswer,
  markAnimalOptionalFieldSkipped,
  normalizeAnimalCandidate,
  removeValueAndCommonWords
} from "./extractors";
import { calfCategoryForSex, extractBirthChildData, normalizeCalfSex } from "./birth-child";

export function mergeRanchoMessageData(current: ParsedRanchoMessage, answer: string): ParsedRanchoMessage {
  const original = cleanAnswer(answer);
  const normalized = normalizeRanchoText(original);
  const parsedAnswer = parseRanchoMessage(answer);
  const dados = { ...current.dados };
  const expectedFields = buildMissing(current.tipo, dados);
  const expectedField = expectedFields[0];
  const correctionLike = /^(?:nao|não|n|na verdade|verdade|corrigir|corrige|errado|incorreto|animal errado|foi|era|troca|trocar|corrija|ajusta|ajustar|atualiza|atualizar)\b/.test(normalized);

  const stockPurchaseWithoutFinance = current.tipo === "ESTOQUE_ENTRADA"
    && dados.compra
    && expectedField === "valor"
    && /^(?:2|sem financeiro|so estoque|s[oó] estoque|apenas estoque|nao sei|n[aã]o sei|depois)$/.test(normalized);

  if (stockPurchaseWithoutFinance) {
    const nextDados = { ...dados, sem_financeiro: true, valor: undefined };
    return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
  }

  if (current.tipo === "PARTO" && expectedField === "parto_cria_decisao") {
    if (/^(?:nao|n|2|so parto|apenas parto|registrar so o parto|sem cadastrar cria)\b/.test(normalized)) {
      const nextDados = {
        ...dados,
        parto_cria_decisao_pendente: undefined,
        parto_sem_cadastro_cria: true
      };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }

    const childData = extractBirthChildData(original);
    if (/^(?:sim|s|1|quero|pode)\b/.test(normalized) || childData.parto_cria_cadastro) {
      const nextDados = {
        ...dados,
        ...childData,
        parto_cria_decisao_pendente: undefined,
        parto_cria_cadastro: true,
        parto_sem_cadastro_cria: undefined
      };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
  }

  if (current.tipo === "PARTO" && expectedField === "cria_sexo") {
    const sexAnswer = normalizeCalfSex(original);
    if (sexAnswer) {
      const nextDados = {
        ...dados,
        parto_cria_cadastro: true,
        cria_sexo: sexAnswer,
        cria_categoria: calfCategoryForSex(sexAnswer)
      };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
  }

  if (current.tipo === "PARTO" && expectedField === "cria_codigo") {
    if (/^(?:2|gerar|gera|temporario|temporario|sem brinco|sem codigo|nao sei|não sei)$/i.test(original)) {
      const nextDados = { ...dados, gerar_cria_codigo_temporario: true };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
    if (/^(?:informar codigo|informar c[oó]digo|informar brinco|vou informar codigo|vou informar c[oó]digo|vou informar brinco)$/i.test(original)) {
      return finalize(current.tipo, dados, buildMissing(current.tipo, dados), current.confianca);
    }
    const childCode = extractAnimalRegistrationCode(normalized) || normalizeAnimalCandidate(original);
    if (childCode) {
      const nextDados = { ...dados, cria_codigo: childCode, gerar_cria_codigo_temporario: undefined };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
  }

  if (current.tipo === "PARTO" && expectedField === "pai_ref") {
    if (/^(?:sem pai|nao sei|não sei|nao informado|não informado|pular|2)$/i.test(original)) {
      const nextDados = { ...dados, pai_ref: undefined, pai_nome: undefined, pai_id: undefined, pai_nao_informado: true, precisa_pai_ref: undefined };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
    const fatherRef = extractAnimalCode(normalized, "PARTO") || normalizeAnimalCandidate(original);
    if (fatherRef) {
      const nextDados = { ...dados, pai_ref: fatherRef, pai_nome: fatherRef, pai_nao_informado: undefined, precisa_pai_ref: undefined };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
  }

  if (current.tipo === "CADASTRO_ANIMAL" && expectedField === "sexo") {
    const sexAnswer = extractAnimalSex(normalized);
    if (sexAnswer) {
      const nextDados = { ...dados, sexo: sexAnswer, sexo_origem: "informado", sexo_inferido_categoria: undefined };
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
    if (isSkipAnimalSexOptionalAnswer(original)) {
      const nextDados = markAnimalOptionalFieldSkipped(dados, expectedField);
      return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
    }
  }

  if (current.tipo === "CADASTRO_ANIMAL" && isAnimalOptionalField(expectedField) && isSkipOptionalAnswer(original)) {
    const nextDados = markAnimalOptionalFieldSkipped(dados, expectedField as string);
    return finalize(current.tipo, nextDados, buildMissing(current.tipo, nextDados), current.confianca);
  }

  if (current.tipo === "CADASTRO_ANIMAL" && ["animal_codigo", "categoria_animal"].includes(String(expectedField || "")) && isSkipOptionalAnswer(original)) {
    return finalize(current.tipo, { ...dados, campo_obrigatorio_pulado: expectedField }, buildMissing(current.tipo, dados), current.confianca);
  }

  if (parsedAnswer.tipo === current.tipo) {
    Object.entries(parsedAnswer.dados).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (key === expectedField || dados[key] === undefined || dados[key] === null || dados[key] === "") {
        dados[key] = value;
      }
    });
  }

  if (expectedField) {
    const contextualNumber = firstNumber(normalized);
    const contextualValue = extractMoneyValue(normalized);
    const contextualQuantity = extractStockQuantity(original);
    const contextualPhone = extractWhatsappPhone(original);
    const contextualAnimal = expectedField === "animal_codigo" ?extractAnimalRegistrationCode(original) || normalizeAnimalCandidate(original) || extractAnimalRegistrationCode(normalized) || extractAnimalCode(normalized, current.tipo) : undefined;

    if (expectedField === "animal_codigo" && contextualAnimal) dados.animal_codigo = contextualAnimal;
    if (expectedField === "litros" && contextualNumber) dados.litros = contextualNumber;
    if (expectedField === "valor" && contextualValue !== undefined) dados.valor = contextualValue;
    if (expectedField === "quantidade" && contextualQuantity !== undefined) dados.quantidade = contextualQuantity;
    if (expectedField === "unidade") dados.unidade = extractStockUnit(normalized) || original;
    if (expectedField === "produto" && original) dados.produto = original;
    if (expectedField === "item_nome" && original) dados.item_nome = extractStockItem(original) || original;
    if (expectedField === "lote_nome" && original) dados.lote_nome = original;
    if (expectedField === "descricao" && original) dados.descricao = original;
    if (expectedField === "funcionario_nome" && original) dados.funcionario_nome = extractEmployeeCreationName(original) || original;
    if (expectedField === "telefone" && contextualPhone) dados.telefone = contextualPhone;
    if (expectedField === "funcao" && original) dados.funcao = original;
    if (expectedField === "data_admissao" && original) dados.data_admissao = normalized === "2" ? new Date().toISOString().slice(0, 10) : extractDateReference(normalized) || original;
    if (expectedField === "pagamento_tipo" && original) dados.pagamento_tipo = extractEmployeePaymentType(normalized);
    if (expectedField === "periodo_pagamento" && original) dados.periodo_pagamento = normalized === "1" ? "mes_atual" : normalized === "2" ? "mes_anterior" : extractEmployeePaymentPeriod(normalized);
    if (expectedField === "ponto_tipo") dados.ponto_tipo = extractPointType(normalized);
    if (expectedField === "horario") dados.horario = extractPointTime(normalized) || original;
    if (expectedField === "nome" && current.tipo === "CADASTRO_ANIMAL" && original && !correctionLike) dados.nome = extractAnimalRegistrationName(original) || original;
    if (expectedField === "peso" && current.tipo === "CADASTRO_ANIMAL" && !correctionLike) dados.peso = extractAnimalWeight(original) ?? contextualNumber;
    if (expectedField === "observacoes" && current.tipo === "CADASTRO_ANIMAL" && original && !correctionLike) dados.observacoes = original;
    if (expectedField === "campo_alterado" && original) {
      if (/\b(?:salario|salário|slario|ganha)\b/.test(normalized)) dados.campo_alterado = "salario_base";
      else if (/\b(?:whatsapp|telefone|zap|celular)\b/.test(normalized)) dados.campo_alterado = "contato_whatsapp";
      else if (/\bcpf\b/.test(normalized)) dados.campo_alterado = "cpf";
      else if (/\b(?:cargo|funcao|função)\b/.test(normalized)) dados.campo_alterado = "funcao";
      else if (/\bnome\b/.test(normalized)) dados.campo_alterado = "nome";
      else if (/\b(?:ativo|inativo|reativar|reativa)\b/.test(normalized)) dados.campo_alterado = "ativo";
    }
    if (expectedField === "novo_valor" && original) {
      dados.novo_valor = contextualPhone || extractEmployeeCpf(original) || extractEmployeeSalary(original, normalized) || original;
    }
    if (expectedField === "categoria_animal") {
      dados.categoria = extractAnimalCategory(normalized) || original.toLowerCase();
      const inferredSex = inferAnimalSexFromCategory(dados.categoria);
      if (inferredSex && !dados.sexo) {
        dados.sexo = inferredSex;
        dados.sexo_origem = "inferido_categoria";
        dados.sexo_inferido_categoria = dados.categoria;
      }
    }
    if (expectedField === "sexo") {
      dados.sexo = extractAnimalSex(normalized);
      if (dados.sexo) {
        dados.sexo_origem = "informado";
        dados.sexo_inferido_categoria = undefined;
      }
    }
    if (expectedField === "fase") dados.fase = extractAnimalPhase(normalized);
    if (expectedField === "raca" && original) dados.raca = extractAnimalBreed(original) || original;
    if (expectedField === "lote_animal" && original) {
      dados.lote_nome = extractAnimalLotName(original) || original;
      dados.lote_nao_encontrado = undefined;
      dados.lote_opcoes = undefined;
    }
    if (expectedField === "data_nascimento") dados.data_nascimento = extractAnimalBirthDate(original);
    if (expectedField === "mae_nome" && original) dados.mae_nome = normalizeAnimalCandidate(original) || original;
    if (expectedField === "pai_nome" && original) dados.pai_nome = normalizeAnimalCandidate(original) || original;
    if (expectedField === "genealogia_campo" && original) {
      if (/\b(?:os dois|ambos|pai e mae|pai e mÃ£e|mae e pai|mÃ£e e pai)\b/.test(normalized)) dados.genealogia_campo = "ambos";
      else if (/\b(?:mae|mÃ£e)\b/.test(normalized)) dados.genealogia_campo = "mae";
      else if (/\bpai\b/.test(normalized)) dados.genealogia_campo = "pai";
    }
  }

  const animalIntent = ["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE", "CADASTRO_ANIMAL", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL", "ATUALIZACAO_GENEALOGIA", "CONSULTA_GENEALOGIA"].includes(current.tipo);
  const animalCode = animalIntent && expectedField && expectedField !== "animal_codigo"
    ?undefined
    : current.tipo === "CADASTRO_ANIMAL"
      ?extractAnimalRegistrationCode(original) || extractAnimalRegistrationCode(normalized)
      : animalIntent ?extractAnimalCode(normalized, current.tipo) : undefined;
  const liters = extractLiters(normalized);
  const value = extractMoneyValue(normalized);
  const quantity = extractStockQuantity(original);
  const itemName = extractStockItem(original);
  const employeeName = extractEmployeeName(original, normalized);
  const employeeCreationName = extractEmployeeCreationName(original);
  const employeeSalary = extractEmployeeSalary(original, normalized);
  const employeeCpf = extractEmployeeCpf(original);
  const employeeAccessMode = extractEmployeeAccessMode(original, normalized);
  const phone = extractWhatsappPhone(original);
  const pointType = extractPointType(normalized);
  const pointTime = extractPointTime(normalized);
  const dateReference = extractDateReference(normalized);
  const turno = extractTurno(normalized);
  const isCorrection = (!expectedField || (current.tipo === "CADASTRO_ANIMAL" && isAnimalOptionalField(expectedField))) && correctionLike;

  if (current.tipo === "CRIAR_LOTE" && original && (!dados.lote_nome || expectedField === "lote_nome" || isCorrection)) {
    dados.lote_nome = original.replace(/^(?:nao|não|n|na verdade|verdade|corrigir|corrige|errado|incorreto|foi|era)\b\s*,?\s*/i, "").trim() || original;
  }

  if (animalCode && (!dados.animal_codigo || expectedField === "animal_codigo" || (isCorrection && current.tipo !== "CADASTRO_ANIMAL"))) dados.animal_codigo = animalCode;
  if (liters !== undefined && current.tipo === "PRODUCAO_LEITE" && (!hasValue(dados.litros) || expectedField === "litros" || isCorrection)) dados.litros = liters;
  if (current.tipo === "PRODUCAO_LEITE" && isCorrection && liters === undefined && firstNumber(normalized) !== undefined && /(?:litro|l\b|foi|era|valor|quantidade)/.test(normalized)) {
    dados.litros = firstNumber(normalized);
  }
  const isFinancialValueCorrection = value !== undefined
    && ["DESPESA", "RECEITA_VENDA"].includes(current.tipo)
    && !expectedField
    && /^(?:foi|era|valor|r\$|\d)/.test(normalized);
  if (value !== undefined && ["DESPESA", "RECEITA_VENDA"].includes(current.tipo) && (!hasValue(dados.valor) || expectedField === "valor" || isFinancialValueCorrection)) dados.valor = value;
  const financeIntent = ["DESPESA", "RECEITA_VENDA"].includes(current.tipo);
  const financeDescription = financeIntent ?extractFinanceDescription(original, normalized, current.tipo as "DESPESA" | "RECEITA_VENDA") : undefined;
  const correctionDescriptionLooksUseful = Boolean(financeDescription && /[a-z]/.test(normalizeRanchoText(financeDescription)) && !/^(?:foi|foram|era|valor|quantidade)$/.test(normalizeRanchoText(financeDescription)));
  if (financeDescription && financeIntent && (!dados.descricao || expectedField === "descricao" || (isCorrection && correctionDescriptionLooksUseful && value === undefined))) dados.descricao = financeDescription;
  const stockIntent = ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo);
  const normalizedItemName = normalizeRanchoText(itemName || "");
  const correctionItemLooksUseful = Boolean(itemName && /[a-z]/.test(normalizedItemName) && !/^(?:na verdade|verdade|foi|foram|era|quantidade|valor)$/.test(normalizedItemName));
  if (quantity !== undefined && stockIntent && (!hasValue(dados.quantidade) || expectedField === "quantidade" || isCorrection)) dados.quantidade = quantity;
  if (itemName && stockIntent && (!dados.item_nome || expectedField === "item_nome" || (isCorrection && correctionItemLooksUseful))) dados.item_nome = itemName;
  if (value !== undefined && current.tipo === "ESTOQUE_SAIDA" && dados.venda && (!hasValue(dados.valor) || expectedField === "valor" || isCorrection)) dados.valor = value;
  if (employeeName && current.tipo === "PONTO_FUNCIONARIO" && (!dados.funcionario_nome || expectedField === "funcionario_nome")) dados.funcionario_nome = employeeName;
  if (employeeCreationName && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.funcionario_nome || expectedField === "funcionario_nome" || isCorrection)) dados.funcionario_nome = employeeCreationName;
  if (employeeSalary !== undefined && current.tipo === "CRIAR_FUNCIONARIO" && (!hasValue(dados.salario_base) || expectedField === "salario_base" || isCorrection)) dados.salario_base = employeeSalary;
  if (employeeCpf && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.cpf || expectedField === "cpf" || isCorrection)) dados.cpf = employeeCpf;
  if (employeeAccessMode && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.tipo_acesso || expectedField === "tipo_acesso" || isCorrection)) {
    dados.tipo_acesso = employeeAccessMode;
    dados.telefone_obrigatorio = true;
  }
  if (phone && current.tipo === "CRIAR_FUNCIONARIO" && (!dados.telefone || expectedField === "telefone" || isCorrection)) dados.telefone = phone;
  if (current.tipo === "PAGAMENTO_FUNCIONARIO") {
    if (employeeName && (!dados.funcionario_nome || expectedField === "funcionario_nome" || isCorrection)) dados.funcionario_nome = employeeName;
    if (value !== undefined && (!hasValue(dados.valor) || expectedField === "valor" || isCorrection)) dados.valor = value;
    if (!dados.pagamento_tipo || expectedField === "pagamento_tipo" || isCorrection) dados.pagamento_tipo = extractEmployeePaymentType(normalized);
    if (!dados.periodo_pagamento || expectedField === "periodo_pagamento" || isCorrection) dados.periodo_pagamento = extractEmployeePaymentPeriod(normalized);
  }
  if (current.tipo === "ATUALIZAR_FUNCIONARIO") {
    if (employeeName && (!dados.funcionario_nome || expectedField === "funcionario_nome" || isCorrection)) dados.funcionario_nome = employeeName;
    if (phone && (!dados.novo_valor || expectedField === "novo_valor" || isCorrection)) {
      dados.campo_alterado = "contato_whatsapp";
      dados.novo_valor = phone;
    } else if (employeeCpf && (!dados.novo_valor || expectedField === "novo_valor" || isCorrection)) {
      dados.campo_alterado = "cpf";
      dados.novo_valor = employeeCpf;
    } else if (employeeSalary !== undefined && (!hasValue(dados.novo_valor) || expectedField === "novo_valor" || isCorrection)) {
      dados.campo_alterado = "salario_base";
      dados.novo_valor = employeeSalary;
    }
  }
  if (pointType && current.tipo === "PONTO_FUNCIONARIO" && (!dados.ponto_tipo || expectedField === "ponto_tipo" || isCorrection)) dados.ponto_tipo = pointType;
  if (pointTime && current.tipo === "PONTO_FUNCIONARIO" && (!dados.horario || expectedField === "horario" || isCorrection)) dados.horario = pointTime;

  if (turno && (!dados.turno || isCorrection)) dados.turno = turno;
  if (dateReference && (!dados.data_referencia || isCorrection)) dados.data_referencia = dateReference;
  if (!dados.unidade && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(current.tipo)) dados.unidade = extractStockUnit(normalized);
  const medicineProduct = current.tipo === "VACINA_MEDICAMENTO" ?extractProduct(original, normalized) : undefined;
  if (medicineProduct && current.tipo === "VACINA_MEDICAMENTO" && expectedField !== "animal_codigo" && (!dados.produto || expectedField === "produto" || isCorrection)) dados.produto = medicineProduct;
  if (!dados.descricao && ["DESPESA", "RECEITA_VENDA", "ORDEM_SERVICO"].includes(current.tipo)) dados.descricao = removeValueAndCommonWords(original) || original;
  if (current.tipo === "CADASTRO_ANIMAL") {
    const registrationCode = extractAnimalRegistrationCode(original) || extractAnimalRegistrationCode(normalized);
    const registrationName = extractAnimalRegistrationName(original);
    const animalCategory = extractAnimalCategory(normalized);
    const animalSex = extractAnimalSex(normalized);
    const animalWeight = extractAnimalWeight(original);
    const correctionText = original.replace(/^(?:nao|nÃ£o|n|na verdade|verdade|corrigir|corrige|errado|incorreto|foi|era|troca|trocar|corrija|ajusta|ajustar|atualiza|atualizar)\b\s*,?\s*/i, "").trim();
    const nameCorrection = correctionText.replace(/^(?:o\s+|a\s+)?nome\s+(?:e|eh|Ã©|era|foi|para|pra)?\s*/i, "").trim();

    if (registrationCode && (!dados.animal_codigo || expectedField === "animal_codigo" || isCorrection)) {
      dados.animal_codigo = registrationCode;
      if (dados.campo_obrigatorio_pulado === "animal_codigo") dados.campo_obrigatorio_pulado = undefined;
    }
    if (animalCategory && (!dados.categoria || expectedField === "categoria_animal" || isCorrection)) {
      dados.categoria = animalCategory;
      if (dados.campo_obrigatorio_pulado === "categoria_animal") dados.campo_obrigatorio_pulado = undefined;
    }
    if (animalSex && (!dados.sexo || expectedField === "sexo" || isCorrection || animalCategory)) {
      dados.sexo = animalSex;
      const inferredSex = animalCategory ?inferAnimalSexFromCategory(animalCategory) : undefined;
      if (inferredSex && inferredSex === animalSex && expectedField !== "sexo") {
        dados.sexo_origem = "inferido_categoria";
        dados.sexo_inferido_categoria = animalCategory;
      } else {
        dados.sexo_origem = "informado";
        dados.sexo_inferido_categoria = undefined;
      }
    }
    if (registrationName && (!dados.nome || expectedField === "nome")) dados.nome = registrationName;
    if (isCorrection && nameCorrection && nameCorrection !== correctionText && !animalCategory && !registrationCode && animalWeight === undefined) {
      dados.nome = extractAnimalRegistrationName(nameCorrection) || nameCorrection;
    }
    if (animalWeight !== undefined && (!hasValue(dados.peso) || expectedField === "peso" || isCorrection)) dados.peso = animalWeight;
    if (!dados.fase || isCorrection) dados.fase = extractAnimalPhase(normalized) || dados.fase;
    if (!dados.raca || isCorrection) dados.raca = extractAnimalBreed(original) || dados.raca;
    if ((!dados.lote_nome && !dados.lote_id) || isCorrection) dados.lote_nome = extractAnimalLotName(original) || dados.lote_nome;
    if (!dados.data_nascimento || isCorrection) dados.data_nascimento = extractAnimalBirthDate(original) || dados.data_nascimento;
  }

  if (current.tipo === "ATUALIZACAO_GENEALOGIA") {
    if (isCorrection) {
      const cleaned = original.replace(/^(?:nao|nÃ£o|n|errado|incorreto|corrigir|corrige|na verdade|foi|era)\b\s*,?\s*/i, "").trim();
      if (cleaned) {
        if (/\b(?:mae|mÃ£e)\b/.test(normalized) || dados.genealogia_campo === "mae") {
          dados.mae_nome = normalizeAnimalCandidate(cleaned) || cleaned;
          dados.mae_id = undefined;
        } else if (/\bpai\b/.test(normalized) || dados.genealogia_campo === "pai") {
          dados.pai_nome = normalizeAnimalCandidate(cleaned) || cleaned;
          dados.pai_id = undefined;
        }
      }
    }
    if (expectedField === "mae_nome" && original) dados.mae_nome = normalizeAnimalCandidate(original) || original;
    if (expectedField === "pai_nome" && original) dados.pai_nome = normalizeAnimalCandidate(original) || original;
  }

  let nextTipo = current.tipo;
  if (financeIntent && isCorrection) {
    if (/\b(?:saida|saída|despesa|gasto|gastei|paguei|comprei|compra)\b/.test(normalized)) nextTipo = "DESPESA";
    if (/\b(?:entrada|receita|venda|vendi|recebi|recebemos|ganhei|entrou)\b/.test(normalized)) nextTipo = "RECEITA_VENDA";
  }

  const missing = buildMissing(nextTipo, dados);
  return finalize(nextTipo, dados, missing);
}
