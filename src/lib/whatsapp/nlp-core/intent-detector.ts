import { cleanAnswer, hasValue, normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { firstNumber } from "@/lib/whatsapp/nlp-numbers";
import { animalWords, stockItemHintPattern } from "./constants";
import { buildMissing, finalize } from "./result";
import {
  cleanStockQueryItem,
  extractAnimalBirthDate,
  extractAnimalBreed,
  extractAnimalCategory,
  extractAnimalCode,
  extractAnimalFromProductionQuery,
  extractAnimalLocal,
  extractAnimalLotName,
  extractAnimalPhase,
  extractAnimalRegistrationCode,
  extractAnimalRegistrationName,
  extractAnimalSex,
  extractConsultationPeriod,
  extractDateReference,
  extractEmployeeCreationName,
  extractEmployeeName,
  extractEmployeeRole,
  extractFinanceDescription,
  extractLiters,
  extractLooseProductionLiters,
  extractMoneyValue,
  extractPointTime,
  extractPointType,
  extractProduct,
  extractServiceLocal,
  extractStockDestination,
  extractStockItem,
  extractStockQuantity,
  extractStockUnit,
  extractTurno,
  extractWhatsappPhone,
  hasExplicitMoney,
  hasLooseStockQuantity,
  hasPhysicalQuantity,
  isPurchaseText
} from "./extractors";
import type { ParsedRanchoMessage } from "./types";

function cleanUpdateValue(value?: string | null) {
  return cleanAnswer(value || "")
    .replace(/[.:]+$/g, "")
    .replace(/^(?:para|pra|no|na|o|a|um|uma)\s+/i, "")
    .trim();
}

function extractAnimalUpdateData(original: string, normalized: string) {
  const animal_codigo = extractAnimalCode(normalized, "ATUALIZACAO_ANIMAL");
  const phase = extractAnimalPhase(normalized);
  const birthDate = extractAnimalBirthDate(original);
  const breedForUpdate = original.match(/\b(?:raca|raça)\b.*?\bpara\s+(.+)$/i)?.[1];
  const breed = cleanUpdateValue(breedForUpdate) || extractAnimalBreed(original);
  const weight = firstNumber(normalized) ?? extractStockQuantity(original);
  const explicitName = original.match(/\b(?:trocar|mudar|alterar|corrigir)\s+nome\s+(?:da|do)?\s*.*?\s+para\s+(.+)$/i)?.[1]
    || original.match(/\bnome\s+(?:da|do)?\s*.*?\s+para\s+(.+)$/i)?.[1];
  const lotName = extractAnimalLotName(original)
    || original.match(/\b(?:lote|piquete|pasto)\s+([a-zA-Z0-9À-ÿ\s'-]+?)(?:[.,;:]|$)/i)?.[1];
  const observation = original.match(/\b(?:observacao|observação|obs)\s*(?:na|no|da|do)?\s*.*?:\s*(.+)$/i)?.[1];

  if (/\b(?:vendida|vendido|vendeu|saiu do rebanho)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "status", novo_valor: "vendido" };
  }

  if (/\b(?:inativa|inativo|desativar|desativa)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "status", novo_valor: "inativo" };
  }

  if (lotName && /\b(?:lote|piquete|pasto)\b/.test(normalized)) {
    const cleanedLot = cleanUpdateValue(lotName);
    return { animal_codigo, campo_alterado: "lote_id", novo_valor: cleanedLot, lote_nome: cleanedLot };
  }

  if (breed && /\b(?:raca|raça)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "raca", novo_valor: breed };
  }

  if (birthDate && /\b(?:nasceu|nascimento|nascida|nascido)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "data_nascimento", novo_valor: birthDate };
  }

  if (explicitName) {
    return { animal_codigo, campo_alterado: "nome", novo_valor: cleanUpdateValue(explicitName) };
  }

  if (phase && /\b(?:ficou|esta|ta|marcar|marca|alterar|status|prenhe|prenha|seca|lactante|lactacao)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "fase", novo_valor: phase };
  }

  if (weight !== undefined && /\b(?:peso|pesou|kg)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "peso", novo_valor: weight };
  }

  if (observation || /\b(?:mancando|doente|recuperou|observacao|observação|obs)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "observacoes", novo_valor: cleanUpdateValue(observation || original) };
  }

  return { animal_codigo };
}

export function parseSingleRanchoMessage(text: string): ParsedRanchoMessage {
  const original = cleanAnswer(text);
  const normalized = normalizeRanchoText(original);
  if (!normalized) return finalize("DESCONHECIDO", {}, []);

  const isHelp = /\b(?:ajuda|suporte|exemplos|como usar|o que voce faz|o que você faz)\b/.test(normalized);
  if (isHelp) return finalize("AJUDA", {}, [], 0.95);

  const isTodayRecordsQuery = /\b(?:o que|quais|meus|minhas|ultimos|Ãºltimos|ultimas|Ãºltimas)\b/.test(normalized)
    && /\b(?:registrei|registros|lancei|lancamentos|lanÃ§amentos|hoje)\b/.test(normalized);
  if (isTodayRecordsQuery) return finalize("CONSULTA_REGISTROS_HOJE", { data_referencia: "hoje", consulta: true }, [], 0.9);

  const earlyStockActionForQuery = /\b(?:comprei|compramos|comprar|compra|chegou|entrou|usei|tira|tirar|retirei|baixa|baixar|bota|botar|botei|coloca|colocar|coloquei|adiciona|adicionar|adicionei|lanca|lancar|cria|criar|cadastra|cadastrar|cadastre|novo|nova)\b/.test(normalized);
  const earlyGeneralStockQuery = !earlyStockActionForQuery && (
    (/\b(?:como|resumo|estoque|baixo|baixos|acabando|minimo)\b/.test(normalized)
      && /\b(?:estoque|abaixo|baixo|acabando|minimo)\b/.test(normalized))
    || /\b(?:o que esta acabando|tem algo baixo|itens abaixo|abaixo do minimo)\b/.test(normalized)
  );
  const earlyStockItemMention = /\b(?:racao|milho|feno|sal|mineral|aftosa|remedio|medicamento|terramicina|leite|suplemento)\b/.test(normalized);
  if (earlyGeneralStockQuery && (!cleanStockQueryItem(original, normalized) || !earlyStockItemMention)) {
    return finalize("CONSULTA_ESTOQUE_GERAL", { consulta: true }, [], 0.88);
  }

  const explicitStockItemQuery = /\b(?:estoque\s+de|quanto\s+tem\s+de|tem\s+quanto\s+de|saldo\s+de|ainda\s+tem|como\s+(?:esta|estÃ¡|ta|tÃ¡)\s+o\s+estoque\s+de)\b/.test(normalized);
  if (explicitStockItemQuery && !earlyStockActionForQuery) {
    const itemNome = cleanStockQueryItem(original, normalized);
    if (itemNome) return finalize("CONSULTA_ESTOQUE_ITEM", { item_nome: itemNome, consulta: true }, [], 0.88);
  }

  const period = extractConsultationPeriod(normalized);
  const productionQuestionCue = /\b(?:quanto|quantos|total|media|média|consulta|consultar|ver)\b/.test(normalized) || /\?/.test(original);
  const productionSubjectCue = /\b(?:producao|produÃ§Ã£o|produziu|ordenha|ordenhados|ordenhado|leite|litros|tirou)\b/.test(normalized);
  const productionReportCue = /\b(?:producao|produÃ§Ã£o)\b/.test(normalized) && /\b(?:hoje|semana|mes)\b/.test(normalized);
  const productionQueryCue = productionSubjectCue && (productionQuestionCue || productionReportCue);
  const animalQuery = productionQueryCue && !hasValue(extractLiters(normalized)) && (
    /\b(?:vaca|animal|brinco|boi|touro|bezerro|bezerra|novilha)\b/.test(normalized)
    || /\b[a-z]+-\d[a-z0-9-]*\b/.test(normalized)
    || /\b(?:da|do|a|o)\s+[a-z]*\d[a-z0-9-]*\b/.test(normalized)
  );
  if (animalQuery) {
    return finalize("CONSULTA_PRODUCAO_ANIMAL", {
      animal_codigo: extractAnimalFromProductionQuery(normalized),
      data_referencia: period,
      periodo: period,
      consulta: true
    }, [], 0.9);
  }

  const productionAnimalReport = /\b(?:producao|produção|historico|histórico|ultima|última|media|média)\b/.test(normalized)
    && Boolean(extractAnimalCode(normalized, "CONSULTA_PRODUCAO_ANIMAL"))
    && !hasValue(extractLiters(normalized));
  if (productionAnimalReport) {
    return finalize("CONSULTA_PRODUCAO_ANIMAL", {
      animal_codigo: extractAnimalCode(normalized, "CONSULTA_PRODUCAO_ANIMAL"),
      data_referencia: period,
      periodo: period,
      consulta: true
    }, [], 0.9);
  }

  const generalProductionQuery = productionQueryCue && /\b(?:hoje|semana|mes|total|ordenhados|ordenhado|tirou|produzidos|produzido)\b/.test(normalized);
  if (generalProductionQuery) {
    return finalize(period === "hoje" ?"CONSULTA_PRODUCAO_HOJE" : "CONSULTA_PRODUCAO", {
      data_referencia: period,
      periodo: period,
      consulta: true
    }, [], 0.9);
  }

  const isProductionQuery = /\b(?:quanto|total|media|média|consulta|consultar|ver)\b/.test(normalized) && /\b(?:produziu|producao|produção|leite|ordenha)\b/.test(normalized);
  if (isProductionQuery) return finalize("CONSULTA_PRODUCAO", { data_referencia: extractDateReference(normalized) || "hoje" }, [], 0.9);

  const isFinanceQuery = /\b(?:como ta|como está|saldo|resultado|financeiro|caixa|entradas|saidas|saídas|lucro)\b/.test(normalized) && /\b(?:financeiro|mes|mês|caixa|entradas|saidas|saídas|lucro)\b/.test(normalized);
  if (isFinanceQuery) return finalize("CONSULTA_FINANCEIRO", { data_referencia: extractDateReference(normalized) || "mes" }, [], 0.9);

  const isEmployeeCreate = /\b(?:cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar)\b/.test(normalized)
    && /\b(?:funcionario|funcionário|colaborador|vaqueiro|ordenhador|tratador|tratadora|gerente)\b/.test(normalized);
  if (isEmployeeCreate) {
    const phone = extractWhatsappPhone(original);
    const dados = {
      funcionario_nome: extractEmployeeCreationName(original),
      telefone: phone,
      funcao: extractEmployeeRole(normalized)
    };
    return finalize("CRIAR_FUNCIONARIO", dados, buildMissing("CRIAR_FUNCIONARIO", dados), 0.88);
  }

  const stockQuantity = extractStockQuantity(original);
  const physicalQuantity = hasPhysicalQuantity(original) || hasLooseStockQuantity(original);
  const explicitMoney = hasExplicitMoney(original);
  const isPurchase = isPurchaseText(original);
  const stockItemName = extractStockItem(original);
  const hasPurchaseQuantity = isPurchase && hasValue(stockQuantity) && Boolean(stockItemName);
  const hasStockVocabulary = stockItemHintPattern.test(normalized) || /\bestoque\b/.test(normalized);
  const hasStockItemHint = Boolean(stockItemName) && hasStockVocabulary;
  const stockBlockedByAnimalCreation = !physicalQuantity
    && /\b(?:cadastrar|cadastre|cadastro|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lança|lancar|lançar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova)\b/.test(normalized)
    && new RegExp(`\\b${animalWords}\\b`).test(normalized);

  const hasStockActionForQuery = /\b(?:comprei|compramos|comprar|compra|chegou|chegaram|chego|xegou|entrou|entrada|recebi|recebemos|usei|tira|tirar|retirei|baixa|baixar|bota|botar|botei|coloca|colocar|coloquei|adiciona|adicionar|adicionei|inclui|incluir|lanca|lancar|cria|criar|cadastra|cadastrar|cadastre|novo|nova)\b/.test(normalized);
  const generalStockQuery = !hasStockActionForQuery && (
    (/\b(?:como|resumo|estoque|baixo|baixos|acabando|minimo)\b/.test(normalized)
      && /\b(?:estoque|abaixo|baixo|acabando|minimo)\b/.test(normalized))
    || /\b(?:o que esta acabando|tem algo baixo|itens abaixo|abaixo do minimo)\b/.test(normalized)
  );
  const stockItemMention = /\b(?:racao|milho|feno|sal|mineral|aftosa|remedio|medicamento|terramicina|leite|suplemento)\b/.test(normalized);
  if (generalStockQuery && (!cleanStockQueryItem(original, normalized) || !stockItemMention)) {
    return finalize("CONSULTA_ESTOQUE_GERAL", { consulta: true }, [], 0.88);
  }

  const itemStockQuery = /\b(?:como|quanto|tem|estoque|saldo|ainda)\b/.test(normalized)
    && !hasStockActionForQuery
    && (hasStockVocabulary || stockItemHintPattern.test(normalized) || /\b(?:aftosa|terramicina|leite|sal|mineral|feno|milho)\b/.test(normalized));
  if (itemStockQuery) {
    const itemNome = cleanStockQueryItem(original, normalized);
    if (itemNome) return finalize("CONSULTA_ESTOQUE_ITEM", { item_nome: itemNome, consulta: true }, [], 0.88);
  }

  const hasStockCreate = /\b(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|registrar)\b/.test(normalized)
    && !/\b(?:entrada|entrou|chegou|chegaram|chego|xegou|saida|baixa|baixar)\b/.test(normalized)
    && /\b(?:item|estoque|racao|ração|medicamento|remedio|remédio|insumo)\b/.test(normalized);
  if (hasStockCreate) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized)
    };
    return finalize("CRIAR_ITEM_ESTOQUE", dados, buildMissing("CRIAR_ITEM_ESTOQUE", dados), 0.86);
  }

  const hasStockAction = /\b(?:comprei|compramos|comprar|compra|paguei|adiciona|adicionar|adicionei|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|recebemos|repor|reposicao|reposição|baixa|baixar|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|dei|deu para|saiu|saida|saída|consumi|consumiu|descartei)\b/.test(normalized);
  const isStockQuery = !hasStockAction && /\b(?:consultar|ver|quanto|saldo|tem|estoque)\b/.test(normalized) && /\b(?:estoque|racao|ração|medicamento|insumo|sacos?)\b/.test(normalized);
  if (isStockQuery) return finalize("CONSULTA_ESTOQUE", { item_nome: stockItemName }, [], 0.85);

  const animalQueryCode = extractAnimalCode(normalized, "CONSULTA_ANIMAL");
  const animalUpdateVerb = /\b(?:mudar|atualizar|alterar|trocar|corrigir|agora|ficou|marcar|marca|para|prenhe|prenha|seca|lactante|peso|pesou|nome|vendida|vendido|saiu do rebanho)\b/.test(normalized);
  const isQuestion = /\?/.test(original);
  const animalCreationCue = /\b(?:cadastrar|cadastre|cadastro|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lancar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova)\b/.test(normalized)
    && new RegExp(`\\b${animalWords}\\b`).test(normalized);
  const animalEventCue = /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra|deu cria)\b/.test(normalized);
  const isAnimalConsultation = Boolean(animalQueryCode)
    && !animalCreationCue
    && !animalEventCue
    && (!animalUpdateVerb || isQuestion)
    && (/\b(?:consultar|consulta|ver|mostra|mostrar|dados|informacoes|informações|ficha|historico|histórico|status|idade|nasceu|nascimento|raca|raça|lote)\b/.test(normalized) || /\?/.test(original));
  if (isAnimalConsultation) {
    return finalize("CONSULTA_ANIMAL", { animal_codigo: animalQueryCode, consulta: true }, [], 0.88);
  }

  const isEmployeeQuery = /\b(?:consultar|ver|funcionario|funcionário|equipe|colaborador)\b/.test(normalized) && !/\b(?:entrou|saiu|ponto|entrada|saida|saída)\b/.test(normalized);
  if (isEmployeeQuery) return finalize("CONSULTA_FUNCIONARIO", { funcionario_nome: extractEmployeeName(original, normalized) }, [], 0.8);

  const hasFinanceOperation = /\b(?:venda|vendi|recebi|receita|despesa|paguei|financeiro|caixa|lucro)\b/.test(normalized);
  const isPoint = /\b(?:ponto|entrou|entrada|saiu|saida|saída|bateu|bater ponto|registrar ponto)\b/.test(normalized)
    && !physicalQuantity
    && !hasFinanceOperation;
  if (isPoint) {
    const dados = {
      funcionario_nome: extractEmployeeName(original, normalized),
      ponto_tipo: extractPointType(normalized),
      horario: extractPointTime(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados));
  }

  const stockOutVerb = /\b(?:baixa|baixar|dar baixa|da baixa|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|dei|deu para|saiu|saida|saída|consumi|consumiu|descartei)\b/.test(normalized);
  const stockOutWithoutQuantity = !physicalQuantity && stockOutVerb && hasStockItemHint && !explicitMoney && (!hasValue(stockQuantity) || !/\bgastei\b/.test(normalized));
  const isStockOut = (physicalQuantity && stockOutVerb) || stockOutWithoutQuantity;
  if (isStockOut) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized),
      destino: extractStockDestination(original),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("ESTOQUE_SAIDA", dados, buildMissing("ESTOQUE_SAIDA", dados));
  }

  const stockInVerb = /\b(?:comprei|compramos|comprar|compra|adiciona|adicionar|adicionei|bota|botar|botei|coloca|colocar|coloquei|lanca|lança|lancar|lançar|entrada|entrou|chegou|recebemos|repor|reposicao|reposição)\b/.test(normalized);
  const stockInVerbVariant = /\b(?:chegaram|chego|xegou|recebi|inclui|incluir)\b/.test(normalized);
  const effectiveStockInVerb = stockInVerb || stockInVerbVariant;
  const receiveLooksFinancial = /\brecebi\b/.test(normalized) && !physicalQuantity && hasValue(stockQuantity);
  const implicitStockIn = physicalQuantity && hasStockItemHint && !stockOutVerb && !explicitMoney;
  const paidPhysicalStock = physicalQuantity && /\bpaguei\b/.test(normalized);
  const isStockIn = !stockBlockedByAnimalCreation && !receiveLooksFinancial && (
    ((physicalQuantity || hasStockItemHint) && effectiveStockInVerb)
    || implicitStockIn
    || paidPhysicalStock
    || (isPurchase && (hasStockItemHint || hasPurchaseQuantity))
  );
  if (isStockIn) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized),
      valor: explicitMoney ?extractMoneyValue(normalized) : undefined,
      compra: isPurchase || undefined,
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("ESTOQUE_ENTRADA", dados, buildMissing("ESTOQUE_ENTRADA", dados));
  }

  const isExpense = /\b(?:gastei|despesa|paguei|comprei|custo|saida|saída|pagamento)\b/.test(normalized);
  const isRevenue = /\b(?:vendi|venda|recebi|receita|entrada|entrou|faturou)\b/.test(normalized);

  if (isRevenue && !isExpense) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "RECEITA_VENDA"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("RECEITA_VENDA", dados, buildMissing("RECEITA_VENDA", dados));
  }

  if (isExpense && (!physicalQuantity || explicitMoney)) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "DESPESA"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("DESPESA", dados, buildMissing("DESPESA", dados));
  }

  const isParto = /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra|deu cria)\b/.test(normalized);
  if (isParto) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PARTO"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("PARTO", dados, buildMissing("PARTO", dados));
  }

  const isMedicine = /\b(?:vacina|vacinei|apliquei|aplicou|aftosa|brucelose|mediquei|medicou|tratei|tratou|tratamento|manejo|remedio|remédio|medicamento|terramicina|tomou)\b/.test(normalized);
  if (isMedicine) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "VACINA_MEDICAMENTO"),
      produto: extractProduct(original, normalized),
      evento_tipo: /\b(?:vacina|vacinei|aftosa|brucelose)\b/.test(normalized) ?"vacina" : "tratamento"
    };
    return finalize("VACINA_MEDICAMENTO", dados, buildMissing("VACINA_MEDICAMENTO", dados));
  }

  const isDeath = /\b(?:morreu|morta|morto|obito|óbito)\b/.test(normalized);
  if (isDeath) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "MORTE"),
      data_referencia: extractDateReference(normalized),
      local: extractAnimalLocal(normalized)
    };
    return finalize("MORTE", dados, buildMissing("MORTE", dados));
  }

  const animalUpdateData = extractAnimalUpdateData(original, normalized);
  const isAnimalUpdate = Boolean(animalUpdateData.animal_codigo)
    && !animalCreationCue
    && /\b(?:mudar|atualizar|alterar|trocar|corrigir|agora|ficou|esta|ta|marcar|marca|prenhe|prenha|seca|lactante|lote|piquete|pasto|peso|pesou|kg|nome|raca|raça|observacao|observação|mancando|doente|recuperou|vendida|vendido|saiu do rebanho)\b/.test(normalized)
    && !/\bdeu\b/.test(normalized)
    && !isQuestion;
  if (isAnimalUpdate) {
    return finalize("ATUALIZACAO_ANIMAL", animalUpdateData, buildMissing("ATUALIZACAO_ANIMAL", animalUpdateData));
  }

  const hasProductionCue = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|produção)\b/.test(normalized);
  const isAnimalCreation = !hasProductionCue
    && /\b(?:cadastrar|cadastre|cadastro|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lança|lancar|lançar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova)\b/.test(normalized)
    && new RegExp(`\\b${animalWords}\\b`).test(normalized);
  if (isAnimalCreation) {
    const dados = {
      animal_codigo: extractAnimalRegistrationCode(normalized),
      nome: extractAnimalRegistrationName(original),
      categoria: extractAnimalCategory(normalized),
      sexo: extractAnimalSex(normalized),
      fase: extractAnimalPhase(normalized),
      raca: extractAnimalBreed(original),
      lote_nome: extractAnimalLotName(original),
      data_nascimento: extractAnimalBirthDate(original),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("CADASTRO_ANIMAL", dados, buildMissing("CADASTRO_ANIMAL", dados));
  }

  const isProduction = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|produção|tirei|deu|fez)\b/.test(normalized)
    && !/\b(?:baixa|cria|parto)\b/.test(normalized);
  if (isProduction) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PRODUCAO_LEITE"),
      litros: extractLiters(normalized) ?? extractLooseProductionLiters(normalized),
      turno: extractTurno(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PRODUCAO_LEITE", dados, buildMissing("PRODUCAO_LEITE", dados));
  }

  const isService = /\b(?:cerca quebrada|arrumar|consertar|manutencao|manutenção|precisa|bebedouro|porteira|curral)\b/.test(normalized);
  if (isService) {
    const dados = {
      descricao: original,
      local: extractServiceLocal(original)
    };
    return finalize("ORDEM_SERVICO", dados, []);
  }

  return finalize("DESCONHECIDO", {}, []);
}
