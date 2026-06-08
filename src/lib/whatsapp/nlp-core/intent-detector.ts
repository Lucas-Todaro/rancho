import { cleanAnswer, hasValue, normalizeRanchoText } from "@/lib/whatsapp/nlp-text";
import { firstNumber } from "@/lib/whatsapp/nlp-numbers";
import { animalCategoryMap, animalSexMap, animalWords, stockItemHintPattern } from "./constants";
import {
  detectReproductiveEventKind,
  extractInseminationOrigin,
  hasReproductiveEventCue
} from "./reproductive-events";
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
  extractAnimalWeight,
  extractConsultationPeriod,
  extractDateReference,
  extractEmployeeCreationName,
  extractEmployeeAccessMode,
  extractEmployeeCpf,
  extractEmployeeLooseName,
  extractEmployeeName,
  extractEmployeePaymentName,
  extractEmployeePaymentPeriod,
  extractEmployeePaymentType,
  extractEmployeeRole,
  extractEmployeeSalary,
  extractExplicitTimeReference,
  extractFinanceDescription,
  extractLiters,
  extractLooseProductionLiters,
  extractMoneyValue,
  extractPointTime,
  extractPointType,
  extractProduct,
  extractProductionAnimalReference,
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

const clinicalObservationCue = /\b(?:mancando|doente|doenca|doença|recuperou|febre|diarreia|sem comer|nao comeu|nao levantou|mastite|carrapato|triste|fraco|fraca|ruim|tossindo|ferida|veterinario|queda de producao|problema no casco|casco)\b/;
const reproductiveObservationCue = /\b(?:cio|ia|iatf|inseminad[ao]s?|inseminacao|inseminar|inseminaram|cobertura|coberta|coberto|semen|prenhas?|prenhe|prenha|prenhez|gestante|gestacao|pegou cria|diagnostico positivo|pre\s*parto|pre-parto|preparto|protocolo|reteste|nao passou|aborto)\b/;
const vaccineProductCue = /\b(?:vacina|vacinei|vacinada|vacinado|aftosa|brucelose|raiva|clostridial)\b/;
const treatmentProductCue = /\b(?:mediquei|medicar|medicou|tratei|tratou|tratamento|manejo|remedio|medicamento|terramicina|vermifugo|antibiotico|dipirona|anti-inflamatorio|antiinflamatorio|carrapaticida|pour-on|pour on|suplemento)\b/;

const extendedClinicalObservationCue = /\b(?:mancou|adoeceu|ferimento|machucado|machucada|sangrando|inchado|inchada|bicheira|berne|infeccao|veterinaria|veterinario|mal de saude|passando mal|nao quer comer|sem apetite|tratamento caro|despesa veterinaria)\b/;

function hasClinicalObservationCue(normalized: string) {
  clinicalObservationCue.lastIndex = 0;
  extendedClinicalObservationCue.lastIndex = 0;
  return clinicalObservationCue.test(normalized) || extendedClinicalObservationCue.test(normalized);
}

function animalObservationEventType(normalized: string) {
  if (hasClinicalObservationCue(normalized)) return "clinico";
  if (hasReproductiveEventCue(normalized) || reproductiveObservationCue.test(normalized)) return "reprodutivo";
  return "observacao";
}

function hasAnimalEventCostCue(normalized: string) {
  return hasExplicitMoney(normalized)
    || /\b(?:paguei|gastei|custou|custo|cobrou|despesa|ficou|deu)\s+(?:r\$\s*)?\d+(?:[,.]\d+)?\b/.test(normalized);
}

function withAnimalObservationEventData(dados: Record<string, unknown>, original: string, normalized: string) {
  const cost = hasAnimalEventCostCue(normalized) ?extractMoneyValue(normalized) : undefined;
  const reproductiveKind = detectReproductiveEventKind(normalized);
  const descriptionSource = dados.descricao || (dados.campo_alterado === "observacoes" ? dados.novo_valor : undefined) || original;
  const descricao = cleanUpdateValue(String(descriptionSource));
  const inseminationOrigin = reproductiveKind === "inseminacao" ? extractInseminationOrigin(original) : undefined;
  return {
    ...dados,
    campo_alterado: dados.campo_alterado || "observacoes",
    novo_valor: dados.novo_valor || descricao || original,
    descricao: descricao || original,
    registro_evento_animal: true,
    evento_tipo: animalObservationEventType(normalized),
    ...(reproductiveKind ? { evento_reprodutivo_tipo: reproductiveKind } : {}),
    ...(inseminationOrigin ? { origem_inseminacao: inseminationOrigin } : {}),
    data_referencia: dados.data_referencia || extractDateReference(normalized) || "hoje",
    ...(hasValue(cost) && Number(cost) > 0 ?{ custo: cost, valor: cost } : {})
  };
}

type StockConsultationDetection = {
  tipo: ParsedRanchoMessage["tipo"];
  dados: Record<string, unknown>;
  confidence: number;
};

const financeMonthNumbers: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12
};

function financeNamedMonthPeriod(normalized: string) {
  const match = normalized.match(/\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+((?:19|20)\d{2}))?\b/);
  if (!match) return undefined;
  const year = match[2] ? Number(match[2]) : new Date().getFullYear();
  const month = financeMonthNumbers[match[1]];
  return month ? `${year}-${String(month).padStart(2, "0")}` : undefined;
}

function financeQueryPeriod(normalized: string) {
  const reference = extractDateReference(normalized);
  if (reference && !/^\d{4}-\d{2}-\d{2}$/.test(reference)) return reference;
  return reference || financeNamedMonthPeriod(normalized) || (/\b(?:dia|diario|diaria)\b/.test(normalized) ? "hoje" : "mes");
}

function financeQueryType(normalized: string) {
  if (/\b(?:entradas?|receitas?|vendas?|recebidos?|recebemos|recebi|entrou|entro|vendemos|vendi|ganhamos|ganhei)\b/.test(normalized)) return "entrada";
  if (/\b(?:saidas?|despesas?|despezas?|gastos?|gastamos|gastei|saiu|compras?|paguei|pagamos|pagamentos?|salarios?|folha|contas?)\b/.test(normalized)) return "saida";
  return undefined;
}

function financeQueryMode(normalized: string) {
  if (/\b(?:transacoes?|movimentacoes?|lancamentos?|extrato|detalhes?|quais|listar|lista|mostra|mostrar|ver)\b/.test(normalized)) return "detalhado";
  return "resumo";
}

function cleanFinanceFilterCandidate(candidate?: string | null) {
  const cleaned = normalizeRanchoText(cleanAnswer(candidate || ""))
    .replace(/\b(?:hoje|hj|ontem|anteontem|semana|mes|mensal|dia|esse|essa|este|esta|nesse|nesta|desse|dessa)\b/g, " ")
    .replace(/\b(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g, " ")
    .replace(/\b(?:transacoes?|movimentacoes?|lancamentos?|extrato|detalhes?|quais|listar|lista|mostra|mostrar|ver|quanto|resultado|saldo|financeiro|caixa|entradas?|saidas?|receitas?|despesas?|despezas?|gastos?|compras?|vendas?)\b/g, " ")
    .replace(/^(?:de|do|da|dos|das|com|em|no|na|por|para|pra|a|o|os|as|um|uma)\s+/g, " ")
    .replace(/\b(?:de|do|da|dos|das|com|em|no|na|por|para|pra)\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || /^(?:tudo|todos?|geral|periodo)$/.test(cleaned)) return undefined;
  return cleaned;
}

function financeQueryFilter(normalized: string) {
  const direct =
    normalized.match(/\b(?:venda|vendas|receita|receitas)\s+(?:de|do|da)\s+(.+)$/)?.[1]
    || normalized.match(/\b(?:gasto|gastos|despesa|despesas|despeza|despezas|compra|compras|pagamento|pagamentos)\s+(?:com|de|do|da|em|no|na)\s+(.+)$/)?.[1]
    || normalized.match(/\b(?:quanto\s+(?:gastei|gastamos|entrou|recebi|vendemos)|quais\s+(?:entradas|saidas|despesas|receitas|transacoes))\s+(?:com|de|do|da|em|no|na)\s+(.+)$/)?.[1];
  return cleanFinanceFilterCandidate(direct);
}

function financeQueryData(normalized: string) {
  const period = financeQueryPeriod(normalized);
  const financeiro_tipo = financeQueryType(normalized);
  const financeiro_modo = financeQueryMode(normalized);
  const filtro_texto = financeQueryFilter(normalized);
  return {
    data_referencia: period,
    periodo: period,
    financeiro_tipo,
    financeiro_modo,
    filtro_texto,
    consulta: true
  };
}

function reportQueryPeriod(normalized: string) {
  if (/\b(?:ultimos|ultimas)\s+30\s+dias\b/.test(normalized)) return "ultimos_30";
  if (/\b(?:ultimos|ultimas)\s+7\s+dias\b/.test(normalized)) return "ultimos_7";
  if (/\b(?:semana passada|ultima semana)\b/.test(normalized)) return "semana_passada";
  if (/\bmes\s+passado\b/.test(normalized)) return "mes_passado";
  if (/\b(?:este ano|esse ano|deste ano|desse ano|ano atual)\b/.test(normalized)) return "ano";
  const reference = extractDateReference(normalized);
  if (reference) return reference;
  const namedMonth = financeNamedMonthPeriod(normalized);
  if (namedMonth) return namedMonth;
  if (/\b(?:semana|semanal)\b/.test(normalized)) return "semana";
  if (/\b(?:mes|mensal|mez)\b/.test(normalized)) return "mes";
  if (/\b(?:ontem|anteontem)\b/.test(normalized)) return extractDateReference(normalized);
  return "hoje";
}

function reportEventType(normalized: string) {
  if (/\b(?:vacina|vacinas|vacinacao|vacinados|aftosa)\b/.test(normalized)) return "vacina";
  if (/\b(?:medicamento|medicamentos|medicacao|medicacoes|tratamento|tratamentos|medicados|remedio|vermifugo)\b/.test(normalized)) return "tratamento";
  if (/\b(?:doente|doenca|clinico|clinica|observacao|observacoes|problema|problemas|apetite|mastite)\b/.test(normalized)) return "clinico";
  if (/\b(?:parto|partos|nascimento|nascimentos|pariram|pariu)\b/.test(normalized)) return "parto";
  if (/\b(?:cio|cios|prenhez|prenhezes|inseminacao|inseminacoes|reprodutivo|reprodutivos)\b/.test(normalized)) return "reprodutivo";
  return undefined;
}

function reportArea(normalized: string) {
  if (/\b(?:financeiro|caixa|saldo|receitas?|despesas?|transacoes?|vendas?|compras?)\b/.test(normalized)) return "financeiro";
  if (/\b(?:producao|leite|ordenha|ordenhado|ordenhados|litros?)\b/.test(normalized)) return "producao";
  if (/\b(?:estoque|racao|insumos?|medicamentos?|vacinas?|saldo de estoque|movimentacoes? de estoque)\b/.test(normalized)) return "estoque";
  if (/\b(?:funcionarios?|equipe|ponto|folha)\b/.test(normalized)) return "funcionarios";
  return undefined;
}

function reportQueryData(normalized: string) {
  const area = reportArea(normalized);
  const consulta_registros = /\b(?:alerta|alertas|atencao|atenção|preoculpante|preocupante|critico|crítico|problema|problemas|resolver|pendencia|pendência)\b/.test(normalized)
    ? "alertas"
    : /\b(?:eventos?|acontecimentos?|ocorrencias?|historico|vacinas?|vacinacao|medicacoes?|tratamentos?|doente|partos?|nascimentos?|cios?|prenhezes|inseminacoes?)\b/.test(normalized)
      ? "eventos"
      : "relatorio";
  const relatorio_modo = /\b(?:detalhado|detalhes|completo|tudo|movimentacoes?)\b/.test(normalized)
    ? "detalhado"
    : /\b(?:rapido|rapidao|resumao|principal|principais|preciso saber)\b/.test(normalized)
      ? "rapido"
      : /\b(?:bem|mal|bom|positivo|lucro|preocupante|preoculpante|indo)\b/.test(normalized)
        ? "analise"
        : "resumo";
  return {
    data_referencia: reportQueryPeriod(normalized),
    periodo: reportQueryPeriod(normalized),
    consulta: true,
    consulta_registros,
    relatorio_modo,
    relatorio_tipo: area,
    evento_tipo: reportEventType(normalized)
  };
}

function isAmbiguousReportQuery(normalized: string) {
  return /^(?:relatorio|relatirio|resumo|resumao|geral|eventos|acontecimentos|historico|alertas|problemas|dados)$/.test(normalized);
}

function isReportPeriodTokenAsAnimalCode(code?: string | null) {
  if (!code) return false;
  const normalized = normalizeRanchoText(code).replace(/[_-]+/g, " ").trim();
  return /^(?:hoje|hj|dia|ontem|ntem|anteontem|semana|semanal|semana passada|mes|mez|mensal|mes passado|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)$/.test(normalized);
}

function milkProductionDestination(normalized: string) {
  if (/\b(?:tanque|resfriador|estoque)\b/.test(normalized)) return "tanque";
  if (/\b(?:venda|vender|vendido|laticinio|laticínio|cliente)\b/.test(normalized)) return "venda";
  return undefined;
}

function cleanStockSpecificItemCandidate(candidate?: string | null) {
  const cleaned = normalizeRanchoText(cleanAnswer(candidate || ""))
    .replace(/\b(?:no|na|em|do|da)\s+estoque\b/g, " ")
    .replace(/^(?:de|do|da|dos|das|o|a|os|as|um|uma)\s+/g, " ")
    .replace(/^(?:saco|sacos|kg|quilo|quilos|dose|doses|unidade|unidades|litro|litros|caixa|caixas|fardo|fardos)\s+(?:de|do|da)?\s*/g, " ")
    .replace(/\b(?:tem|tenho|resta|disponivel|disponiveis|guardado|guardados|agora|hoje|por favor)\b$/g, " ")
    .replace(/\b(?:estoque|item|itens|produto|produtos|consulta|consultar|ver|mostra|mostrar|quanto|quantos|quantas|saldo|qual|quais|me|eu|tenho)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return undefined;
  if (/^(?:baixo|baixos|zerado|zerados|acabando|minimo|categoria|coisa|algo|guardado|disponivel)$/.test(cleaned)) return undefined;
  return cleaned;
}

function stockCategoryFromQuery(normalized: string) {
  if (/\b(?:vacina|vacinas|aftosa|brucelose|raiva)\b/.test(normalized)) return "vacina";
  if (/\b(?:medicamento|medicamentos|remedio|remedios|veterinario|veterinarios|vermifugo|terramicina|antibiotico|antibioticos|carrapaticida)\b/.test(normalized)) return "medicamento";
  if (/\b(?:racao|racoes|silagem|farelo|milho)\b/.test(normalized)) return "racao";
  if (/\b(?:insumo|insumos)\b/.test(normalized)) return "insumo";
  return undefined;
}

function isStockMutationActionForConsultation(normalized: string) {
  const restockQuestion = /\b(?:preciso comprar(?: o que)?|comprar o que|o que precisa repor|precisa repor|preciso repor|itens para repor|produtos para repor)\b/.test(normalized);
  const movementQuestion = /\b(?:movimentacoes?|historico|ultimas?\s+(?:baixas|entradas)|o que entrou|o que saiu|quem deu baixa|baixas de estoque|entradas de estoque)\b/.test(normalized);
  if (movementQuestion) return false;
  if (restockQuestion) return false;
  return /\b(?:comprei|compramos|comprar|compra|chegou|chegaram|chego|xegou|entrou|entrada|recebi|recebemos|usei|tira|tirar|retirei|baixa|baixar|bota|botar|botei|coloca|colocar|coloquei|adiciona|adicionar|adicionei|inclui|incluir|lanca|lancar|cria|criar|cadastra|cadastrar|cadastre|novo|nova|paguei|gastei|saiu|saida|consumi|descartei)\b/.test(normalized);
}

function extractSpecificStockQueryItem(original: string, normalized: string) {
  const fromCleanStockQuery = cleanStockQueryItem(original, normalized);
  const normalizedCleanStockQuery = normalizeRanchoText(fromCleanStockQuery || "");
  if (fromCleanStockQuery && !/\b(?:quantos?|quantas?)\b/.test(normalizedCleanStockQuery) && !/^(?:estoque|baixo|zerado|itens|produtos)$/.test(normalizedCleanStockQuery)) return fromCleanStockQuery;

  const patterns = [
    /\bquanto\s+(?:eu\s+)?(?:tenho|tem|resta)\s+(?:de|do|da)\s+(.+?)(?:\s+(?:no|na|em)\s+estoque)?$/,
    /\bquanto\s+(?:de|do|da)\s+(.+?)\s+(?:tem|tenho|resta)(?:\s+(?:no|na|em)\s+estoque)?$/,
    /\bquantos?\s+(?:sacos?|kg|quilo|quilos|litros?|caixas?|fardos?|unidades?)\s+(?:de|do|da)\s+(.+?)(?:\s+(?:tem|tenho|resta))?(?:\s+(?:no|na|em)\s+estoque)?$/,
    /\bquantas?\s+(?:doses?|unidades?|caixas?|litros?)\s+(?:de|do|da)\s+(.+?)(?:\s+(?:tem|tenho|resta))?(?:\s+(?:no|na|em)\s+estoque)?$/,
    /\btem\s+(.+?)\s+(?:no|na|em)\s+estoque$/,
    /\bainda\s+tem\s+(.+)$/,
    /\btem\s+((?:vacina\s+)?(?:aftosa|brucelose|raiva)|vermifugo|remedio|medicamento|terramicina|antibiotico|carrapaticida)(?:\s+.+)?$/,
    /\bqual\s+saldo\s+(?:de|do|da)\s+(.+)$/,
    /\bsaldo\s+(?:do\s+estoque\s+)?(?:de|do|da)\s+(.+)$/,
    /^(.+?)\s+tem\s+quanto$/,
    /\bquantidade\s+(?:de|do|da)\s+(.+)$/,
    /\bconsulta\s+(?:estoque\s+(?:de|do|da)\s+)?(.+)$/,
    /\bver\s+item\s+(.+)$/,
    /\bme\s+mostra\s+(.+?)\s+(?:no|na|em)\s+estoque$/,
    /\bestoque\s+(?:de|do|da)\s+(.+)$/,
    /^(.+?)\s+disponivel(?:\s+(?:no|na|em)\s+estoque)?$/
  ];

  for (const pattern of patterns) {
    const item = cleanStockSpecificItemCandidate(normalized.match(pattern)?.[1]);
    if (item) return item;
  }

  return undefined;
}

function extractStockHistoryItem(normalized: string) {
  const patterns = [
    /\bhistorico\s+(?:de|do|da)\s+(.+?)(?:\s+hoje|\s+ontem|\s+dia\s+\d|$)/,
    /\bmovimentacoes?\s+(?:de|do|da)\s+(.+?)(?:\s+hoje|\s+ontem|\s+dia\s+\d|$)/,
    /\bultimas?\s+(?:baixas|entradas)\s+(?:de|do|da)\s+(.+?)(?:\s+hoje|\s+ontem|\s+dia\s+\d|$)/
  ];
  for (const pattern of patterns) {
    const item = cleanStockSpecificItemCandidate(normalized.match(pattern)?.[1]);
    if (item) return item;
  }
  return undefined;
}

function detectStockConsultation(original: string, normalized: string): StockConsultationDetection | null {
  if (isStockMutationActionForConsultation(normalized)) return null;
  if (/\bleite\b/.test(normalized) && /\b(?:hoje|ontem|semana|mes|tirou|ordenha|ordenhado|ordenhados|produziu|producao|litros?)\b/.test(normalized) && !/\bestoque\b/.test(normalized)) return null;
  if (/\b(?:vacina|medicamento|remedio)\b/.test(normalized) && Boolean(extractAnimalCode(normalized, "CONSULTA_ANIMAL"))) return null;

  const stockSubject = /\b(?:estoque|racao|racoes|milho|feno|sal|mineral|aftosa|vacina|vacinas|remedio|remedios|medicamento|medicamentos|vermifugo|terramicina|antibiotico|leite|suplemento|insumo|insumos)\b/.test(normalized);
  const lowQuery = /\b(?:estoque baixo|baixo estoque|abaixo do minimo|itens abaixo|item abaixo|acabando|preciso comprar(?: o que)?|o que precisa repor|precisa repor|itens para repor|estoque minimo|alertas? de estoque|pouco estoque|falta alguma coisa no estoque|produto baixo|produtos baixos)\b/.test(normalized)
    || (/\b(?:baixo|baixos|minimo|repor|acabando|pouco|alertas?)\b/.test(normalized) && /\b(?:estoque|itens?|produtos?|insumos?)\b/.test(normalized));
  if (lowQuery) {
    return { tipo: "CONSULTA_ESTOQUE_GERAL", dados: { consulta: true, consulta_estoque: "baixo" }, confidence: 0.9 };
  }

  const zeroQuery = /\b(?:itens? zerados?|produtos? zerados?|estoque zerado|sem estoque|sem quantidade|nao tem mais no estoque|o que acabou|quais itens estao zerados|tem algum item zerado)\b/.test(normalized);
  if (zeroQuery) {
    return { tipo: "CONSULTA_ESTOQUE_GERAL", dados: { consulta: true, consulta_estoque: "zerado" }, confidence: 0.9 };
  }

  const historyQuery = /\b(?:movimentacoes?|historico|ultimas?|entradas?|baixas?|quem deu baixa|o que entrou|o que saiu|o que foi usado)\b/.test(normalized)
    && /\b(?:estoque|racao|sal|mineral|aftosa|vacina|vermifugo|medicamento|remedio|milho|feno)\b/.test(normalized);
  if (historyQuery) {
    return {
      tipo: "CONSULTA_ESTOQUE_GERAL",
      dados: {
        consulta: true,
        consulta_estoque: "historico",
        item_nome: extractStockHistoryItem(normalized),
        movimento_tipo: /\b(?:baixa|baixas|saiu|saida|usado|usei|quem deu baixa)\b/.test(normalized) ?"saida" : /\b(?:entrada|entradas|entrou)\b/.test(normalized) ?"entrada" : undefined,
        data_referencia: extractDateReference(normalized) || (/\bhoje\b/.test(normalized) ?"hoje" : undefined)
      },
      confidence: 0.87
    };
  }

  const category = stockCategoryFromQuery(normalized);
  const categoryQuery = Boolean(category) && (
    /\bquais\s+(?:medicamentos|vacinas|racoes|insumos|produtos veterinarios)\s+(?:eu\s+)?tenho\b/.test(normalized)
    || /\b(?:listar|lista|mostrar|mostra|ver)\s+(?:medicamentos|vacinas|racoes|insumos|produtos veterinarios)\b/.test(normalized)
    || /\bestoque\s+(?:de|do|da)\s+(?:medicamentos|vacinas|racoes|insumos|produtos veterinarios)\b/.test(normalized)
    || /\b(?:produtos|itens)\s+(?:da|de)\s+categoria\s+(?:medicamento|vacina|racao|insumo)\b/.test(normalized)
  );
  if (categoryQuery) {
    return { tipo: "CONSULTA_ESTOQUE_GERAL", dados: { consulta: true, consulta_estoque: "categoria", categoria: category }, confidence: 0.89 };
  }

  const itemQueryCue = stockSubject && (
    /\b(?:quanto|quantos|quantas|saldo|quantidade|resta|disponivel|consulta|consultar|ver item|tem quanto|ainda tem)\b/.test(normalized)
    || /\btem\s+.+\s+(?:no|na|em)\s+estoque\b/.test(normalized)
    || /^.+\s+tem\s+quanto$/.test(normalized)
    || /\bestoque\s+(?:de|do|da)\s+.+/.test(normalized)
  );
  if (itemQueryCue) {
    const itemNome = extractSpecificStockQueryItem(original, normalized);
    if (itemNome) return { tipo: "CONSULTA_ESTOQUE_ITEM", dados: { item_nome: itemNome, consulta: true }, confidence: 0.9 };
  }

  const listQuery = /\b(?:o que tem no estoque|quais itens tenho no estoque|quais itens eu tenho no estoque|me mostra o estoque|mostrar estoque|mostra estoque|listar estoque|lista o estoque|ver estoque|consultar estoque|como esta o estoque|como ta o estoque|resumo do estoque|itens do estoque|produtos no estoque|quais produtos tenho|quais produtos eu tenho|quais insumos tenho|quais insumos eu tenho|me fala meu estoque|estoque atual|saldo do estoque|o que eu tenho guardado|o que tem disponivel no estoque)\b/.test(normalized)
    || (/\b(?:estoque|itens|produtos|insumos)\b/.test(normalized) && /\b(?:listar|lista|mostra|mostrar|ver|consultar|consulta|resumo|saldo|atual|quais|o que)\b/.test(normalized));
  if (listQuery) {
    return { tipo: "CONSULTA_ESTOQUE_GERAL", dados: { consulta: true, consulta_estoque: "lista" }, confidence: 0.89 };
  }

  return null;
}

function cleanLotName(value?: string | null) {
  const cleaned = cleanAnswer(value || "")
    .replace(/[.:,;!?]+$/g, "")
    .replace(/^(?:(?:lote|grupo de animais|grupo|chamado|chamada|novo|nova|um|uma|o|a|os|as|de|do|da|dos|das|no|na|para|pra)\s+)+/i, "")
    .replace(/\b(?:cadastrado|cadastrados|cadastradas|existem|existe|tem|possui|hoje|agora|por favor)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

function extractLotNameForCreate(original: string, normalized: string) {
  const patterns = [
    /\blote\s+(?:chamado|chamada|novo|nova|para|de)?\s*[:\-]?\s*([a-zA-Z0-9À-ÿ\s'-]+)$/i,
    /\b(?:chamado|chamada)\s+([a-zA-Z0-9À-ÿ\s'-]+)$/i,
    /\bgrupo\s+de\s+animais\s+(?:chamado|chamada)?\s*([a-zA-Z0-9À-ÿ\s'-]+)$/i
  ];

  for (const pattern of patterns) {
    const match = original.match(pattern)?.[1];
    const cleaned = cleanLotName(match);
    if (cleaned) return cleaned;
  }

  const normalizedName = normalized.match(/\blote\s+([a-z0-9\s'-]+)$/)?.[1];
  return cleanLotName(normalizedName);
}

function extractLotNameForQuery(original: string) {
  const patterns = [
    /\b(?:animais|animal|vacas?|bois?|bezerros?|bezerras?|novilhas?|touros?|gado)\s+(?:do|da|de|dos|das|no|na)\s+(?:lote|piquete|pasto)\s+([a-zA-Z0-9À-ÿ\s'-]+?)(?:\s+(?:tem|possui|cadastrados|cadastradas|existem|existe)\b|$)/i,
    /\b(?:no|na|do|da|de)\s+(?:lote|piquete|pasto)\s+([a-zA-Z0-9À-ÿ\s'-]+?)(?:\s+(?:tem|possui|cadastrados|cadastradas|existem|existe)\b|$)/i,
    /\b(?:lote|piquete|pasto)\s+(?:do|da|de|dos|das)?\s*([a-zA-Z0-9À-ÿ\s'-]+?)(?:\s+(?:tem|possui|cadastrados|cadastradas|existem|existe)\b|$)/i
  ];

  for (const pattern of patterns) {
    const match = original.match(pattern)?.[1];
    const cleaned = cleanLotName(match);
    if (cleaned) return cleaned;
  }

  return undefined;
}

function extractQueryPage(normalized: string) {
  const page = Number(normalized.match(/\b(?:pagina|pg)\s*(\d+)\b/)?.[1]);
  return Number.isFinite(page) && page > 0 ?page : undefined;
}

function herdCategoryFromText(normalized: string) {
  const word = Object.keys(animalCategoryMap).find((item) => new RegExp(`\\b${item}\\b`).test(normalized));
  return word ?animalCategoryMap[word] : undefined;
}

function herdSexFromText(normalized: string) {
  if (/\b(?:sem sexo|sexo nao informado|sexo desconhecido|nao informado)\b/.test(normalized)) return "nao_informado";
  const word = Object.keys(animalSexMap).find((item) => new RegExp(`\\b${item}\\b`).test(normalized));
  return word ?animalSexMap[word] : undefined;
}

function herdStatusFromText(normalized: string) {
  if (/\b(?:mortos?|mortas?|obito|obitos|morreram)\b/.test(normalized)) return "morto";
  if (/\b(?:vendidos?|vendidas?|saiu do rebanho|sairam do rebanho)\b/.test(normalized)) return "vendido";
  if (/\b(?:inativos?|inativas?|desativados?|desativadas?)\b/.test(normalized)) return "inativo";
  if (/\b(?:ativos?|ativas?)\b/.test(normalized)) return "ativo";
  return undefined;
}

function herdReproductionFilterFromText(normalized: string) {
  if (/\b(?:sem\s+(?:evento|eventos|registro|registros|historico|ocorrencia|ocorrencias)|sem\s+(?:informacao|info)\s+reprodutiva|sem\s+nada\s+(?:lancado|registrado)|nao\s+tem\s+(?:evento|eventos|registro|registros))\b/.test(normalized)) return "sem_evento";
  if (/\b(?:pre\s*parto|pre-parto|preparto|perto\s+de\s+parir|quase\s+parindo|para\s+parir|final\s+da\s+gestacao|fim\s+da\s+gestacao)\b/.test(normalized)) return "pre_parto";
  if (/\b(?:inseminad[ao]s?|inseminacao|inseminacoes|cobert[ao]s?|cobertura|cobertas?|cobertos?|ia|iatf|semen)\b/.test(normalized)) return "inseminada";
  if (/\b(?:gravid[ao]s?|prenhas?|prenhes|prenhe|prenhez|gestantes?|gestacao|gestando)\b/.test(normalized)) return "prenhe";
  if (/\b(?:com\s+(?:evento|eventos|registro|registros|historico|ocorrencia|ocorrencias))\b/.test(normalized)) return "com_evento";
  return undefined;
}

function hasExplicitAnimalCodeForHerdQuery(normalized: string) {
  return /\b[a-z]+-\d[a-z0-9-]*\b/.test(normalized)
    || /\b[a-z]+\d[a-z0-9-]*\b/.test(normalized)
    || /\b(?:brinco|codigo|cod|numero|n)\s+[a-z]*\d[a-z0-9-]*\b/.test(normalized)
    || /\b(?:vaca|animal|boi|touro|bezerro|bezerra|novilha)\s+\d[a-z0-9-]*\b/.test(normalized);
}

function herdReproductionQueryCue(normalized: string, original: string) {
  const filter = herdReproductionFilterFromText(normalized);
  if (!filter) return false;
  if (hasExplicitAnimalCodeForHerdQuery(normalized)) return false;
  if (/\b(?:cadastra|cadastrar|cadastre|cadastro|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lançar|lancar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova|mudar|atualizar|alterar|trocar|corrigir|confirmar|diagnostico|positivo|negativo|vendi|vendeu|morreu|pariu|ficou|esta|ta|foi|marcar|marca|coberta|coberto)\b/.test(normalized)) return false;
  if (/\b(?:prenhez|inseminacao|cobertura)\s+(?:da|do|de|na|no)\b/.test(normalized)) return false;
  const groupCue = /\b(?:quais|quantos|quantas|total|lista|listar|liste|mostra|mostrar|mostre|me\s+mostra|me\s+mostre|ver|consulta|consultar|tenho|tem|existem|existe|rebanho|gado|animais|animal|vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?)\b/.test(normalized)
    || (/\?/.test(original) && /\b(?:rebanho|gado|animais|animal|vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?)\b/.test(normalized));
  return groupCue;
}

function consultationModeFromText(normalized: string) {
  if (/\b(?:quantos|quantas|total|contagem|numero)\b/.test(normalized)) return "contagem";
  if (/\b(?:resumo|relatorio|como esta|como ta)\b/.test(normalized)) return "resumo";
  return "lista";
}

function herdQueryData(original: string, normalized: string) {
  return {
    consulta: true,
    modo: consultationModeFromText(normalized),
    categoria: herdCategoryFromText(normalized),
    sexo: herdSexFromText(normalized),
    status: herdStatusFromText(normalized),
    reproducao: herdReproductionFilterFromText(normalized),
    lote_nome: extractLotNameForQuery(original) || extractLotNameForQuery(normalized),
    sem_lote: /\b(?:sem lote|sem piquete|sem pasto|fora de lote)\b/.test(normalized) || undefined,
    pagina: extractQueryPage(normalized)
  };
}

function lotQueryData(original: string, normalized: string) {
  const lote_nome = extractLotNameForQuery(original) || extractLotNameForQuery(normalized);
  return {
    consulta: true,
    modo: lote_nome ?"animais_lote" : consultationModeFromText(normalized),
    lote_nome,
    sem_lote: /\b(?:sem lote|sem piquete|sem pasto|fora de lote)\b/.test(normalized) || undefined,
    pagina: extractQueryPage(normalized)
  };
}

function extractAnimalUpdateData(original: string, normalized: string) {
  const animal_codigo = extractAnimalCode(normalized, "ATUALIZACAO_ANIMAL");
  const data_referencia = extractDateReference(normalized);
  const reproductiveKind = detectReproductiveEventKind(normalized);
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

  if (/\b(?:nao esta prenha|nao ficou prenha|prenhez negativa|diagnostico negativo de prenhez)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "fase", novo_valor: "vazia" };
  }

  if (/\b(?:confirmar prenhez|prenhez positiva|diagnostico positivo de prenhez|esta gestante|esta prenha)\b/.test(normalized)) {
    return withAnimalObservationEventData({
      animal_codigo,
      campo_alterado: "fase",
      novo_valor: "gestante",
      descricao: original,
      data_referencia
    }, original, normalized);
  }

  if (/\bprenhez\b/.test(normalized)) {
    return withAnimalObservationEventData({
      animal_codigo,
      campo_alterado: "fase",
      novo_valor: "gestante",
      descricao: original,
      data_referencia
    }, original, normalized);
  }

  if (reproductiveKind === "prenhez") {
    return withAnimalObservationEventData({
      animal_codigo,
      campo_alterado: "fase",
      novo_valor: "gestante",
      descricao: original,
      data_referencia
    }, original, normalized);
  }

  if (reproductiveKind && reproductiveKind !== "parto") {
    return withAnimalObservationEventData({
      animal_codigo,
      campo_alterado: "observacoes",
      novo_valor: cleanUpdateValue(observation || original),
      data_referencia
    }, original, normalized);
  }

  if (phase && /\b(?:ficou|esta|ta|marcar|marca|alterar|status|prenhe|prenha|prenhez|gestante|vazia|seca|lactante|lactacao)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "fase", novo_valor: phase };
  }

  if (weight !== undefined && /\b(?:peso|pesou|kg)\b/.test(normalized)) {
    return { animal_codigo, campo_alterado: "peso", novo_valor: weight };
  }

  if (hasClinicalObservationCue(normalized) || reproductiveObservationCue.test(normalized)) {
    return withAnimalObservationEventData({
      animal_codigo,
      campo_alterado: "observacoes",
      novo_valor: cleanUpdateValue(observation || original),
      data_referencia
    }, original, normalized);
  }

  if (observation || clinicalObservationCue.test(normalized) || reproductiveObservationCue.test(normalized) || /\b(?:observacao|observação|obs)\b/.test(normalized)) {
    return {
      animal_codigo,
      campo_alterado: "observacoes",
      novo_valor: cleanUpdateValue(observation || original),
      data_referencia
    };
  }

  return { animal_codigo };
}

function employeeUpdateData(original: string, normalized: string) {
  const funcionario_nome = extractEmployeeLooseName(original, normalized);
  const phone = extractWhatsappPhone(original);
  const cpf = extractEmployeeCpf(original);
  const salary = extractEmployeeSalary(original, normalized);
  const role = extractEmployeeRole(normalized)
    || cleanUpdateValue(original.match(/\b(?:cargo|funcao|função)\s+(?:do|da|de)?\s*.*?\s+(?:para|como)\s+(.+)$/i)?.[1])
    || cleanUpdateValue(original.match(/\b(?:virou|agora\s+(?:e|é))\s+(.+)$/i)?.[1]);
  const name = cleanUpdateValue(original.match(/\b(?:corrige|corrigir|muda|alterar|troca|trocar)\s+nome\s+(?:do|da|de)?\s*.*?\s+para\s+(.+)$/i)?.[1]);

  if (salary !== undefined) return { funcionario_nome, campo_alterado: "salario_base", novo_valor: salary };
  if (cpf) return { funcionario_nome, campo_alterado: "cpf", novo_valor: cpf };
  if (phone) return { funcionario_nome, campo_alterado: "contato_whatsapp", novo_valor: phone };
  if (name) return { funcionario_nome, campo_alterado: "nome", novo_valor: name };
  if (role) return { funcionario_nome, campo_alterado: "funcao", novo_valor: role };
  if (/\b(?:reativa|reativar|ativa|ativar)\b/.test(normalized)) return { funcionario_nome, campo_alterado: "ativo", novo_valor: true };
  return { funcionario_nome };
}

function cleanGenealogyReference(value?: string | null) {
  return cleanAnswer(value || "")
    .replace(/[.:;!?]+$/g, "")
    .replace(/^(?:(?:e|eh|como|da|do|de|a|o|os|as|animal|vaca|novilha|bezerro|bezerra)\s+)+/i, "")
    .replace(/\b(?:e|eh|como|mae|pai|filha|filho|do|da|de|com|tem|animal|vaca|novilha)\b\s*$/i, "")
    .trim();
}

function compactAnimalReference(value?: string | null) {
  return cleanGenealogyReference(value)
    .replace(/\b(?:hoje|ontem|agora)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParents(value: string) {
  const normalized = value.replace(/\s+e\s+(?:do|da|de)?\s+/i, " | ").replace(/\s+com\s+/i, " | ");
  const [first, second] = normalized.split("|").map((part) => compactAnimalReference(part));
  return { first, second };
}

function relationFieldFromParent(parent?: string | null) {
  const normalized = normalizeRanchoText(parent || "");
  if (/\b(?:touro|pai)\b/.test(normalized) || /^t[-\s]?\d+/i.test(String(parent || ""))) return "pai";
  return "mae";
}

function extractGenealogyAnimalFromQuery(original: string, normalized: string) {
  const relationTarget = normalized.match(/\b(?:pais|mae|pai|filhos|descendentes|avos|avo|materna|materno|paterno|paterna)\s+(?:da|do|de|dos|das)\s+(.+)$/i)?.[1];
  if (relationTarget) return compactAnimalReference(relationTarget);

  const code = extractAnimalCode(normalized, "CONSULTA_ANIMAL");
  if (code && !["mae", "pai", "pais", "avo", "avos"].includes(normalizeRanchoText(code))) return code;

  return compactAnimalReference(
    normalized.match(/\b(?:genealogia|geneologia|genelogia|arvore|arvori|linhagem|linhage|familia|pais|mae|pai|filhos|descendentes|avos|avo|materna|materno|paterno|paterna)\s+(?:da|do|de|dos|das)?\s*(.+)$/i)?.[1]
    || normalized.match(/\b(?:da|do|de)\s+(?:vaca|animal|touro|novilha)?\s*([a-z0-9-]+(?:\s+[a-z0-9-]+){0,3})/i)?.[1]
  );
}

function genealogyQueryData(original: string, normalized: string) {
  const consulta_genealogia = /\b(?:filhos|descendente|descendentes)\b/.test(normalized) ? "descendentes"
    : /\b(?:avos|avo|materna|materno|paterno|paterna)\b/.test(normalized) ? "avos"
      : /\bmae\b/.test(normalized) && !/\b(?:pai|pais|filhos|descendentes)\b/.test(normalized) ? "mae"
        : /\bpai\b/.test(normalized) && !/\b(?:mae|pais|filhos|descendentes)\b/.test(normalized) ? "pai"
          : "arvore";
  return {
    animal_codigo: extractGenealogyAnimalFromQuery(original, normalized),
    consulta_genealogia,
    consulta: true
  };
}

function genealogyUpdateData(original: string, normalized: string) {
  const data: Record<string, unknown> = {};
  const actionVerb = /\b(?:define|definir|coloca|colocar|registrar|registra|remove|remover|tirar|tira|limpa|limpar|apaga|apagar|corrigir|corrige|alterar|altera)\b/.test(normalized);

  const removeAll = /\b(?:remove|remover|tirar|tira|limpa|limpar|apaga|apagar)\b/.test(normalized)
    && /\b(?:genealogia|filiacao|pai e mae)\b/.test(normalized);
  const removeMother = removeAll || (/\b(?:remove|remover|tirar|tira|limpa|limpar|apaga|apagar)\b/.test(normalized) && /\bmae\b/.test(normalized)) || /\bmae\b.*\b(?:nao informada|sem mae)\b/.test(normalized);
  const removeFather = removeAll || (/\b(?:remove|remover|tirar|tira|limpa|limpar|apaga|apagar)\b/.test(normalized) && /\bpai\b/.test(normalized)) || /\bpai\b.*\b(?:nao informado|sem pai)\b/.test(normalized);
  if (removeMother || removeFather) {
    data.animal_codigo = extractAnimalCode(normalized, "ATUALIZACAO_ANIMAL")
      || compactAnimalReference(normalized.match(/\b(?:da|do|de)\s+(.+)$/i)?.[1]);
    data.remover_mae = removeMother || undefined;
    data.remover_pai = removeFather || undefined;
    data.genealogia_campo = removeMother && removeFather ? "ambos" : removeMother ? "mae" : "pai";
    return data;
  }

  let match = normalized.match(/\b(?:mae|mai|maee)\s+(?:da|do|de)\s+(.+?)\s+(?:e|eh|=)\s+(.+?)(?:\s+e\s+pai\s+(?:e|eh|=)\s+(.+))?$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[1]);
    data.mae_nome = compactAnimalReference(match[2]);
    if (match[3]) data.pai_nome = compactAnimalReference(match[3]);
    data.genealogia_campo = data.pai_nome ? "ambos" : "mae";
    return data;
  }

  match = normalized.match(/\b(?:pai|paii)\s+(?:da|do|de)\s+(.+?)\s+(?:e|eh|=)\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[1]);
    data.pai_nome = compactAnimalReference(match[2]);
    data.genealogia_campo = "pai";
    return data;
  }

  match = normalized.match(/\b(?:define|definir|coloca|colocar|registrar|registra)\s+(.+?)\s+como\s+(mae|pai)\s+(?:da|do|de)\s+(.+)$/i);
  if (match) {
    const field = match[2] === "pai" ? "pai" : "mae";
    data[field + "_nome"] = compactAnimalReference(match[1]);
    data.animal_codigo = compactAnimalReference(match[3]);
    data.genealogia_campo = field;
    return data;
  }

  match = normalized.match(/\b(?:registrar|registra|corrigir|corrige|alterar|altera)\s+(mae|pai)\s+(?:da|do|de)\s+(.+?)\s+como\s+(.+)$/i);
  if (match) {
    const field = match[1] === "pai" ? "pai" : "mae";
    data.animal_codigo = compactAnimalReference(match[2]);
    data[field + "_nome"] = compactAnimalReference(match[3]);
    data.genealogia_campo = field;
    return data;
  }

  match = normalized.match(/\b(.+?)\s+(?:e|eh)\s+pai\s+(?:da|do|de)\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[2]);
    data.pai_nome = compactAnimalReference(match[1]);
    data.genealogia_campo = "pai";
    return data;
  }

  match = normalized.match(/\b(?:definir|define|registrar|registra|alterar|altera|corrigir|corrige)\s+(mae|pai|genealogia|filiacao)\s+(?:da|do|de)\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[2]);
    data.genealogia_campo = match[1] === "pai" ? "pai" : match[1] === "mae" ? "mae" : undefined;
    return data;
  }

  match = normalized.match(/\b(.+?)\s+tem\s+mae\s+(.+?)\s+e\s+pai\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[1]);
    data.mae_nome = compactAnimalReference(match[2]);
    data.pai_nome = compactAnimalReference(match[3]);
    data.genealogia_campo = "ambos";
    return data;
  }

  match = normalized.match(/\b(.+?)\s+tem\s+mae\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[1]);
    data.mae_nome = compactAnimalReference(match[2]);
    data.genealogia_campo = "mae";
    return data;
  }

  match = normalized.match(/\b(.+?)\s+tem\s+pai\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[1]);
    data.pai_nome = compactAnimalReference(match[2]);
    data.genealogia_campo = "pai";
    return data;
  }

  match = normalized.match(/\b(.+?)\s+(?:e|eh)?\s*(?:filha|filho)\s+(?:da|do|de)\s+(.+)$/i);
  if (match) {
    data.animal_codigo = compactAnimalReference(match[1]);
    const parents = splitParents(match[2]);
    const firstField = relationFieldFromParent(parents.first);
    data[firstField + "_nome"] = parents.first;
    if (parents.second) {
      const secondField = relationFieldFromParent(parents.second);
      data[secondField + "_nome"] = parents.second;
    }
    data.genealogia_campo = data.mae_nome && data.pai_nome ? "ambos" : data.pai_nome ? "pai" : "mae";
    return data;
  }

  if (actionVerb && /\b(?:mae|pai|genealogia|filiacao)\b/.test(normalized)) {
    data.animal_codigo = extractAnimalCode(normalized, "ATUALIZACAO_ANIMAL")
      || compactAnimalReference(normalized.match(/\b(?:da|do|de)\s+(.+)$/i)?.[1]);
    data.genealogia_campo = /\bmae\b/.test(normalized) ? "mae" : /\bpai\b/.test(normalized) ? "pai" : undefined;
  }

  return data;
}

export function parseSingleRanchoMessage(text: string): ParsedRanchoMessage {
  const original = cleanAnswer(text);
  const normalized = normalizeRanchoText(original);
  if (!normalized) return finalize("DESCONHECIDO", {}, []);

  if (isAmbiguousReportQuery(normalized)) {
    return finalize("CONSULTA_REGISTROS_HOJE", { consulta: true, precisa_periodo: true, consulta_registros: "relatorio" }, [], 0.75);
  }

  const directOperationalReport = /\b(?:me\s+da\s+(?:um\s+)?geral|geral\s+(?:de|do|da)|me\s+fala\s+tudo|tudo\s+que\s+aconteceu|movimentacoes?\s+(?:de\s+)?hoje|movimentacoes?\s+do\s+dia|movimentacoes?\s+de\s+estoque)\b/.test(normalized)
    || (/\b(?:rancho|fazenda)\b/.test(normalized) && /\b(?:foi|bem|mal|indo|geral|resumo|relatorio)\b/.test(normalized));
  if (directOperationalReport) return finalize("CONSULTA_REGISTROS_HOJE", reportQueryData(normalized), [], 0.9);

  const exactDashboardSummaryQuery = /^(?:dashboard|resumo do dia|como foi o rancho hoje|como foi a fazenda hoje|como esta a fazenda hoje|como está a fazenda hoje|como ta a fazenda hoje|como tá a fazenda hoje|me manda o fechamento de hoje|fechamento de hoje|o que aconteceu hoje|me da um resumo|me dá um resumo|resumo da fazenda|relatorio do dia|relatório do dia)$/.test(normalized);
  if (exactDashboardSummaryQuery) {
    return finalize("CONSULTA_REGISTROS_HOJE", {
      data_referencia: "hoje",
      periodo: "hoje",
      consulta: true,
      consulta_registros: "relatorio",
      relatorio_modo: "resumo"
    }, [], 0.9);
  }

  const explicitOperationalReportPeriod = (
    /\b(?:relatorio|relatirio|resumo|resumao|fechamento|balanco)\b/.test(normalized)
    && /\b(?:hoje|hj|ontem|anteontem|dia|semana|semanal|semana passada|ultima semana|mes|mensal|mes passado|ultimos|ultimas)\b/.test(normalized)
    && !/\b(?:financeiro|finaceiro|financeirro|caixa|saldo|lucro|receitas?|despesas?|despezas?|transacoes?|extrato)\b/.test(normalized)
    && !/\b(?:ponto|funcionarios?|funcionario|equipe|folha|producao|leite|ordenha|ordenhado|ordenhados|litros?)\b/.test(normalized)
    && !/\b(?:vaca|animal|boi|touro|bezerra|bezerro|novilha|brinco)\b/.test(normalized)
  );
  if (explicitOperationalReportPeriod) {
    return finalize("CONSULTA_REGISTROS_HOJE", reportQueryData(normalized), [], 0.9);
  }

  const looseAnimalReportCandidate = compactAnimalReference(
    normalized.match(/\b(?:resumo|relatorio|relatirio|ficha|dados|situacao|status)\s+(?:da|do|de)\s+(?:vaca|animal|boi|touro|bezerra|bezerro|novilha)?\s*([a-z0-9][a-z0-9-]*(?:\s+[a-z]{1,4})?)/i)?.[1]
  );
  const looseAnimalReportCode = looseAnimalReportCandidate
    && !/^(?:fazenda|rancho|rebanho|gado|estoque|financeiro)$/i.test(looseAnimalReportCandidate)
    && !isReportPeriodTokenAsAnimalCode(looseAnimalReportCandidate)
    ?looseAnimalReportCandidate
    : undefined;
  const reportAnimalCode = extractAnimalCode(normalized, "CONSULTA_ANIMAL") || looseAnimalReportCode;
  const reportAnimalSpecific = Boolean(
    reportAnimalCode
    && !financeNamedMonthPeriod(normalized)
    && !isReportPeriodTokenAsAnimalCode(reportAnimalCode)
    && (/\d/.test(reportAnimalCode) || Boolean(looseAnimalReportCode) || /\b(?:vaca|animal|boi|touro|bezerra|bezerro|novilha|brinco)\b/.test(normalized))
  );

  if (herdReproductionQueryCue(normalized, original)) {
    const dados = herdQueryData(original, normalized);
    return finalize("CONSULTA_REBANHO", dados, [], 0.88);
  }

  const eventQueryCue = /\b(?:quais|qual|teve|foram|foi|mostra|mostrar|ver|historico|ultimos|ultimas|registrados?|registradas?|ocorreram|aconteceu|acontecimentos?|ocorrencias?|rebanho|do mes|da semana|de hoje|de ontem)\b/.test(normalized);
  const reportCue = /\b(?:relatorio|relatirio|resumo|resumao|geral|mez|panorama|visao geral|fechamento|balanco|status do dia|status do mes|como foi|como esta indo|esta indo|ta indo|principais|alertas?|atencao|preocupante|preoculpante|critico|problemas?|eventos?|ocorrencias?|aconteceu|acontecimentos?)\b/.test(normalized)
    || /\btudo\s+que\s+aconteceu\b/.test(normalized)
    || (/\b(?:rancho|fazenda)\b/.test(normalized) && /\b(?:foi|bem|mal|indo|geral|resumo|relatorio)\b/.test(normalized));
  const eventTypeCue = /\b(?:vacinas?|vacinacao|medicacoes?|tratamentos?|doente|partos?|nascimentos?|cios?|prenhezes|inseminacoes?)\b/.test(normalized);
  const earlyReportQuery = (
    (reportCue || (eventTypeCue && eventQueryCue))
    && !/\b(?:registrar|registra|cadastrar|cadastra|lancar|lanca|apliquei|aplicar|vacinei|mediquei|tratei|pariu|ficou doente|observacao:|deu cria)\b/.test(normalized)
    && !/\b(?:financeiro|ponto|pagina|tenho)\b/.test(normalized)
    && !reportAnimalSpecific
    && !(/\b(?:mimosa|estrela|vaca|novilha|animal)\b/.test(normalized) && !eventQueryCue && !/\b(?:fazenda|rancho|rebanho)\b/.test(normalized))
  );
  if (earlyReportQuery) return finalize("CONSULTA_REGISTROS_HOJE", reportQueryData(normalized), [], 0.9);

  const earlyFinanceQuery = (
    /\b(?:quanto\s+(?:entrou|entro|saiu|vendemos|gastamos|gastei|recebi)|quais\s+(?:entradas?|saidas?|transacoes?|despesas?|receitas?)|transacoes?|movimentacoes?|extrato|resultado|resutado|financeiro|finaceiro|financeirro|caixa|saldo|lucro|despesas?|despezas?|receitas?|vendas?|compras?)\b/.test(normalized)
    && /\b(?:hoje|hj|ontem|anteontem|semana|mes|dia|\d{1,2}[/-]\d{1,2}|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|financeiro|caixa|saldo|resultado|resutado|transacoes?|movimentacoes?|extrato)\b/.test(normalized)
    && !/\b(?:registrar|registra|cadastrar|cadastra|lancar|lanca|ponto)\b/.test(normalized)
    && !/\bestoque\b/.test(normalized)
    && !/\b(?:entrou|recebi|recebemos|vendi|paguei|gastei|gastamos)\s+(?:r\$\s*)?\d/.test(normalized)
  );
  if (earlyFinanceQuery) return finalize("CONSULTA_FINANCEIRO", financeQueryData(normalized), [], 0.9);

  const isHelp = /\b(?:ajuda|suporte|exemplos|como usar|o que voce faz|o que você faz|deu erro|bot nao funciona|bot não funciona|falar com alguem|falar com alguém|contato|email de suporte)\b/.test(normalized);
  if (isHelp) return finalize("AJUDA", {}, [], 0.95);

  const isDashboardSummaryQuery = /\b(?:resumo do dia|dashboard|como foi o rancho hoje|como foi a fazenda hoje|como esta a fazenda hoje|como está a fazenda hoje|como ta a fazenda hoje|como tá a fazenda hoje|me manda o fechamento de hoje|fechamento de hoje|o que aconteceu hoje|me da um resumo|me dá um resumo|resumo da fazenda|relatorio do dia|relatório do dia)\b/.test(normalized);
  if (isDashboardSummaryQuery && !reportAnimalSpecific) {
    return finalize("CONSULTA_REGISTROS_HOJE", {
      data_referencia: "hoje",
      periodo: "hoje",
      consulta: true,
      consulta_registros: "relatorio",
      relatorio_modo: "resumo"
    }, [], 0.9);
  }

  const isTodayRecordsQuery = /\b(?:o que|quais|meus|minhas|ultimos|últimos|ultimas|últimas)\b/.test(normalized)
    && /\b(?:registrei|registros|eventos|lancei|lancamentos|lançamentos|hoje)\b/.test(normalized)
    || /\b(?:eventos|registros|lancamentos)\s+(?:de\s+)?hoje\b/.test(normalized);
  if (isTodayRecordsQuery) return finalize("CONSULTA_REGISTROS_HOJE", { data_referencia: "hoje", consulta: true }, [], 0.9);

  const earlyStockConsultation = detectStockConsultation(original, normalized);
  if (earlyStockConsultation) {
    return finalize(earlyStockConsultation.tipo, earlyStockConsultation.dados, [], earlyStockConsultation.confidence);
  }

  const earlyStockActionForQuery = /\b(?:comprei|compramos|comprar|compra|chegou|entrou|usei|tira|tirar|retirei|baixa|baixar|bota|botar|botei|coloca|colocar|coloquei|adiciona|adicionar|adicionei|lanca|lancar|cria|criar|cadastra|cadastrar|cadastre|novo|nova)\b/.test(normalized);
  const earlyGeneralStockQuery = !earlyStockActionForQuery && (
    (/\b(?:como|resumo|estoque|baixo|baixos|acabando|minimo)\b/.test(normalized)
      && /\b(?:estoque|abaixo|baixo|acabando|minimo)\b/.test(normalized))
    || /\b(?:o que esta acabando|tem algo baixo|itens abaixo|abaixo do minimo)\b/.test(normalized)
  );
  const earlyStockItemMention = /\b(?:racao|milho|feno|sal|mineral|aftosa|remedio|medicamento|terramicina|leite|suplemento)\b/.test(normalized);
  if (/\bquanto\s+(?:eu\s+)?tenho\s+de\b/.test(normalized) && !earlyStockActionForQuery) {
    const itemNome = cleanStockQueryItem(original, normalized);
    if (itemNome) return finalize("CONSULTA_ESTOQUE_ITEM", { item_nome: itemNome, consulta: true }, [], 0.88);
  }
  if (earlyGeneralStockQuery && (!cleanStockQueryItem(original, normalized) || !earlyStockItemMention)) {
    return finalize("CONSULTA_ESTOQUE_GERAL", { consulta: true }, [], 0.88);
  }

  const explicitStockItemQuery = /\b(?:estoque\s+de|quanto\s+tem\s+de|tem\s+quanto\s+de|saldo\s+de|ainda\s+tem|como\s+(?:esta|está|ta|tá)\s+o\s+estoque\s+de)\b/.test(normalized);
  if (explicitStockItemQuery && !earlyStockActionForQuery) {
    const itemNome = cleanStockQueryItem(original, normalized);
    if (itemNome) return finalize("CONSULTA_ESTOQUE_ITEM", { item_nome: itemNome, consulta: true }, [], 0.88);
  }

  const period = extractConsultationPeriod(normalized);
  const productionQuestionCue = /\b(?:quanto|quantos|total|media|média|consulta|consultar|ver|relatorio|relatório)\b/.test(normalized) || /\?/.test(original);
  const productionSubjectCue = /\b(?:producao|produção|produziu|ordenha|ordenhados|ordenhado|leite|litros|tirou)\b/.test(normalized);
  const productionReportCue = /\b(?:producao|produção)\b/.test(normalized) && /\b(?:hoje|semana|mes|relatorio|relatório)\b/.test(normalized);
  const productionQueryCue = productionSubjectCue && (productionQuestionCue || productionReportCue);
  const productionRankingQuery = productionSubjectCue && normalized.match(/\bqual\s+(?:vaca|animal)\s+produziu\s+(mais|menos)\b/);
  if (productionRankingQuery) {
    return finalize("CONSULTA_PRODUCAO", {
      data_referencia: period,
      periodo: period,
      consulta: true,
      consulta_producao: productionRankingQuery[1] === "menos" ? "menor_produtor" : "maior_produtor"
    }, [], 0.9);
  }
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
    && !herdReproductionFilterFromText(normalized)
    && !hasValue(extractLiters(normalized))
    && !hasClinicalObservationCue(normalized)
    && !/\b(?:vacina|vacinas|evento|eventos|medicamento|medicamentos|tratamento|tratamentos|parto|partos|clinico|reprodutivo)\b/.test(normalized);
  if (productionAnimalReport) {
    return finalize("CONSULTA_PRODUCAO_ANIMAL", {
      animal_codigo: extractAnimalCode(normalized, "CONSULTA_PRODUCAO_ANIMAL"),
      data_referencia: period,
      periodo: period,
      consulta: true
    }, [], 0.9);
  }

  const generalProductionQuery = productionQueryCue && /\b(?:hoje|semana|mes|total|ordenhados|ordenhado|tirou|produzidos|produzido|relatorio|relatório)\b/.test(normalized);
  if (generalProductionQuery) {
    return finalize(period === "hoje" ?"CONSULTA_PRODUCAO_HOJE" : "CONSULTA_PRODUCAO", {
      data_referencia: period,
      periodo: period,
      consulta: true
    }, [], 0.9);
  }

  const isProductionQuery = /\b(?:quanto|total|media|média|consulta|consultar|ver)\b/.test(normalized) && /\b(?:produziu|producao|produção|leite|ordenha)\b/.test(normalized);
  if (isProductionQuery) return finalize("CONSULTA_PRODUCAO", { data_referencia: extractDateReference(normalized) || "hoje" }, [], 0.9);

  const lotCreateCue = (
    /^(?:quero\s+)?(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|adiciona|adicionar)\s+(?:um|uma|o|a|novo|nova)?\s*(?:lote|grupo de animais)\b/.test(normalized)
    || /\b(?:lote|grupo de animais)\s+(?:chamado|chamada)\b/.test(normalized)
  ) && !/\b(?:brinco|codigo|cod|numero|sexo|raca|nascimento)\b/.test(normalized);
  if (lotCreateCue) {
    const dados = {
      lote_nome: extractLotNameForCreate(original, normalized)
    };
    return finalize("CRIAR_LOTE", dados, buildMissing("CRIAR_LOTE", dados), 0.87);
  }

  if (/\b(?:sem lote|sem piquete|sem pasto|fora de lote)\b/.test(normalized)) {
    const dados = herdQueryData(original, normalized);
    return finalize("CONSULTA_REBANHO", dados, [], 0.88);
  }

  const lotQueryCue = !/\b(?:cria|criar|cadastra|cadastrar|cadastre|novo|nova|adiciona|adicionar|mudar|move|mover|coloca|colocar|troca|trocar)\b/.test(normalized)
    && /\b(?:lotes?|piquetes?|pastos?)\b/.test(normalized)
    && (
      /\b(?:quais|listar|lista|mostrar|mostra|ver|consulta|consultar|quantos|quantas|resumo|relatorio|relatório|tem|existem|existe)\b/.test(normalized)
      || /\b(?:animais|animal|vacas?|bois?|bezerros?|bezerras?|novilhas?|touros?|gado)\b/.test(normalized)
      || /\?/.test(original)
    );
  if (lotQueryCue) {
    const dados = lotQueryData(original, normalized);
    if (dados.lote_nome && /\b(?:animais|animal|vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?|gado)\b/.test(normalized)) {
      return finalize("CONSULTA_REBANHO", herdQueryData(original, normalized), [], 0.88);
    }
    return finalize("CONSULTA_LOTES", dados, [], 0.88);
  }

  const herdActionCue = /\b(?:cadastra|cadastrar|cadastre|cadastro|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lançar|lancar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova|mudar|atualizar|alterar|trocar|corrigir|vendi|vendeu|morreu|pariu)\b/.test(normalized);
  const herdReproductiveMutationCue = /\b(?:confirmar|diagnostico|positivo|negativo|ficou|esta|ta|foi|marcar|marca|coberta|coberto)\b/.test(normalized)
    || /\b(?:prenhez|inseminacao|cobertura)\s+(?:da|do|de|na|no)\b/.test(normalized);
  const herdQueryCue = !herdActionCue
    && !herdReproductiveMutationCue
    && (
      /\b(?:quais|quantos|quantas|total|lista|listar|mostra|mostrar|ver|consulta|consultar|tenho|cadastrados|cadastradas|resumo|relatorio|relatório|como esta|como ta|pagina|pg)\b/.test(normalized)
      || /\?/.test(original)
    )
    && (
      /\b(?:rebanho|gado|animais|animal|vacas?|bois?|touros?|bezerros?|bezerras?|novilhas?|machos?|femeas?|ativos?|ativas?|mortos?|mortas?|vendidos?|vendidas?|inativos?|inativas?)\b/.test(normalized)
      || Boolean(herdCategoryFromText(normalized) || herdSexFromText(normalized) || herdStatusFromText(normalized) || herdReproductionFilterFromText(normalized))
    )
    && !/\b(?:genealogia|geneologia|genelogia|arvore|arvori|linhagem|linhage|familia|familiar|pais|mae|pai|filhos|filhas|descendentes|avos|avo)\b/.test(normalized)
    && !/\b(?:funcionario|funcionarios|colaborador|equipe|estoque|financeiro|ponto|leite|litros|ordenha|producao|produção)\b/.test(normalized)
    && !hasExplicitAnimalCodeForHerdQuery(normalized);
  if (herdQueryCue) {
    const dados = herdQueryData(original, normalized);
    return finalize("CONSULTA_REBANHO", dados, [], 0.88);
  }

  const genealogyVocabulary = /\b(?:genealogia|geneologia|genelogia|arvore|arvori|genealogica|linhagem|linhage|familia|familiar|pais|mae|mai|maee|pai|paii|filhos|filhas|filho|filha|descendente|descendentes|avos|avo|filiacao)\b/.test(normalized);
  const genealogyBlockedSubject = /\b(?:funcionario|funcionarios|colaborador|colaboradora)\b/.test(normalized)
    || /\b(?:clinico|clinica)\b/.test(normalized);
  const genealogyMutationCue = /\b(?:define|definir|coloca|colocar|registrar|registra|remove|remover|tirar|tira|limpa|limpar|apaga|apagar|corrigir|corrige|alterar|altera|filha|filho|mae|pai|mai|paii)\b/.test(normalized)
    && (
      /\b(?:e|eh|=|como|nao informado|nao informada|sem pai|sem mae)\b/.test(normalized)
      || /\b(?:filha|filho)\b/.test(normalized)
      || /\btem\s+(?:mae|pai)\b/.test(normalized)
      || /\b(?:define|definir|remove|remover|tirar|tira|limpa|limpar|apaga|apagar)\b/.test(normalized)
    );
  if (genealogyVocabulary && !genealogyBlockedSubject && genealogyMutationCue && !/\?\s*$/.test(original.trim())) {
    const dados = genealogyUpdateData(original, normalized);
    if (Object.keys(dados).length) {
      return finalize("ATUALIZACAO_GENEALOGIA", dados, buildMissing("ATUALIZACAO_GENEALOGIA", dados), 0.88);
    }
  }

  const genealogyQueryCue = genealogyVocabulary && (
    /\b(?:ver|mostrar|mostra|consulta|consultar|quem|quais|qual|historico|arvore|arvori|linhagem|familia|filhos|descendentes|avos|avo|materna|materno|paterno|paterna|genealogia|geneologia|genelogia|genealogica)\b/.test(normalized)
    || /\?/.test(original)
  );
  if (genealogyQueryCue && !genealogyBlockedSubject) {
    const dados = genealogyQueryData(original, normalized);
    return finalize("CONSULTA_GENEALOGIA", dados, buildMissing("CONSULTA_GENEALOGIA", dados), 0.88);
  }

  if (/\b(?:funcionario|funcionarios|colaborador|colaboradora)\b/.test(normalized) && /\b(?:filho|filha)\b/.test(normalized)) {
    return finalize("DESCONHECIDO", {}, [], 0.25);
  }

  const explicitFinanceValue = hasValue(extractMoneyValue(normalized));
  const financeQueryBlocked = /\b(?:registrar|registra|cadastrar|cadastra|lancar|lanca|ponto)\b/.test(normalized) || /\b(?:entrada|saida)\s+(?:do|da)\s+\w+\b/.test(normalized);
  const payrollQueryText = /\b(?:ja recebeu|salario .* pago|quanto falta pagar|quem falta pagar|folha de pagamento|folha do mes|quanto deu a folha|quanto .* recebe)\b/i.test(original);
  const enhancedFinanceQuery = !financeQueryBlocked && !explicitFinanceValue && !payrollQueryText && ((
    /\b(?:como ta|como esta|saldo|resultado|resutado|financeiro|finaceiro|financeirro|caixa|entradas?|saidas?|lucro|relatorio|transacoes?|movimentacoes?|lancamentos?|extrato|despesas?|despezas?|receitas?|folha)\b/.test(normalized)
    && /\b(?:financeiro|finaceiro|financeirro|mes|mez|hoje|hj|ontem|semana|caixa|entradas?|saidas?|lucro|resultado|resutado|transacoes?|movimentacoes?|lancamentos?|extrato|despesas?|despezas?|receitas?|folha|dia|janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(normalized)
  ) || /\bquanto\s+(?:entrou|entro|saiu|vendemos|gastamos|gastei|recebi)\b/.test(normalized)) && !/\bponto\b/.test(normalized);
  if (enhancedFinanceQuery) return finalize("CONSULTA_FINANCEIRO", financeQueryData(normalized), [], 0.9);
  const isFinanceQuery = !explicitFinanceValue && ((
    /\b(?:como ta|como está|saldo|resultado|financeiro|caixa|entradas|saidas|saídas|lucro|relatorio|relatório|transacoes|transações|despesas|receitas|folha)\b/.test(normalized)
    && /\b(?:financeiro|mes|mês|hoje|ontem|semana|caixa|entradas|saidas|saídas|lucro|resultado|transacoes|transações|despesas|receitas|folha)\b/.test(normalized)
  ) || /\bquanto\s+(?:entrou|saiu|vendemos|gastamos)\b/.test(normalized)) && !/\bponto\b/.test(normalized);
  if (isFinanceQuery && !payrollQueryText) return finalize("CONSULTA_FINANCEIRO", { data_referencia: extractDateReference(normalized) || "mes" }, [], 0.9);

  const employeeName = extractEmployeeLooseName(original, normalized);
  const employeePhone = extractWhatsappPhone(original);
  const employeeCpf = extractEmployeeCpf(original);
  const employeeSalary = extractEmployeeSalary(original, normalized);
  const employeeAccessMode = extractEmployeeAccessMode(original, normalized);
  const employeeRole = extractEmployeeRole(normalized);
  const employeePaymentName = extractEmployeePaymentName(original, normalized);
  const employeePaymentType = extractEmployeePaymentType(normalized);

  const employeeQuery = !explicitFinanceValue
    && (
      /\b(?:listar|lista|ver|mostra|mostrar|quem sao|quem são|funcionarios ativos|funcionarios desligados|equipe|ficha|dados|quantos funcionarios|cargo|whatsapp|cpf)\b/.test(normalized)
      || /\b(?:salario|salário|quanto .* ganha)\b/i.test(original)
    )
    && /\b(?:funcionario|funcionarios|funcionário|funcionários|colaborador|equipe|bruno|joao|joão|pedro|ana|carlos)\b/.test(normalized)
    && !/\b(?:cadastra|cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar|contratei|contratar)\b/.test(normalized)
    && !/\b(?:muda|mudar|altera|alterar|atualiza|atualizar|define|definir|paguei|pagamento|recebeu)\b/.test(normalized);
  if (employeeQuery) {
    return finalize("CONSULTA_FUNCIONARIO", {
      funcionario_nome: employeeName || extractEmployeeName(original, normalized),
      consulta_campo: /\b(?:salario|salário|ganha)\b/i.test(original) ?"salario_base" : /\bcpf\b/i.test(original) ?"cpf" : /\bwhatsapp|telefone|zap\b/i.test(original) ?"contato_whatsapp" : /\bcargo|funcao|função\b/i.test(original) ?"funcao" : undefined
    }, [], 0.86);
  }

  const pointQuery = !explicitFinanceValue
    && /\b(?:ponto|horas|trabalhou|trabalhadas|faltas|relatorio de ponto|relatório de ponto|quem bateu|sem ponto)\b/.test(normalized)
    && /\b(?:hoje|ontem|mes|mês|funcionarios|funcionários|bruno|joao|joão|pedro|ana|carlos|ponto|horas|faltas)\b/.test(normalized)
    && !/\b(?:registrar|registra|marcar|marca|entrada|saida|saída|entrou|saiu|chegou|comecei|começou|comecou|terminei|terminou)\b/.test(normalized);
  if (pointQuery) {
    const pointEmployeeName = employeeName || extractEmployeeName(original, normalized);
    return finalize("CONSULTA_PONTO", {
      funcionario_nome: normalizeRanchoText(pointEmployeeName || "") === "quem" ?undefined : pointEmployeeName,
      data_referencia: extractDateReference(normalized) || (/\bmes|mês\b/.test(normalized) ?"mes" : "hoje"),
      consulta: true
    }, [], 0.86);
  }

  const employeePayrollQuery = !explicitFinanceValue && (
    payrollQueryText
    || (/\b(?:folha|salario|salário)\b/.test(normalized) && /\b(?:pago|recebeu|pagar|falta|mes|mês)\b/.test(normalized) && !/\bpaguei\b/.test(normalized))
  );
  if (employeePayrollQuery) {
    return finalize("CONSULTA_FOLHA", {
      funcionario_nome: /\b(?:quem falta|folha|quanto deu)\b/.test(normalized) ? undefined : employeePaymentName || employeeName,
      consulta_folha: /\bquem falta\b/.test(normalized) ? "faltantes" : /\b(?:folha|quanto deu)\b/.test(normalized) ? "resumo" : "funcionario",
      periodo_pagamento: extractEmployeePaymentPeriod(normalized)
    }, [], 0.86);
  }

  const paymentTarget = normalizeRanchoText(employeePaymentName || "");
  const genericPaymentTarget = /^(?:agua|aluguel|combustivel|conta luz|diesel|energia|frete|luz|racao|rem|remedio|veterinario|vaqueiro|ordenhador|gerente|pagamento)$/.test(paymentTarget);
  const employeePaymentKeyword = /\b(?:salario|folha|funcionario|funcionaria|colaborador|colaboradora|adiantamento|diaria|pagamento)\b/.test(normalized);
  const employeePayment = /\b(?:paguei|pagar|pagamento|quitar|quitei|salario pago|adiantamento|diaria)\b/.test(normalized)
    && (
      (employeePaymentKeyword && !genericPaymentTarget)
      || Boolean(employeePaymentName && !genericPaymentTarget && /\bpaguei\s+[A-Z?-?]/.test(original))
    )
    && !/\bpagamento recebido\b/i.test(original)
    && !hasPhysicalQuantity(original)
    && !stockItemHintPattern.test(normalized);
  if (employeePayment) {
    const dados = {
      funcionario_nome: employeePaymentName || employeeName,
      valor: extractMoneyValue(normalized),
      pagamento_tipo: employeePaymentType,
      periodo_pagamento: extractEmployeePaymentPeriod(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PAGAMENTO_FUNCIONARIO", dados, buildMissing("PAGAMENTO_FUNCIONARIO", dados), 0.88);
  }

  const employeeDelete = /\b(?:exclui|excluir|apaga|apagar|remove|remover|deleta|deletar)\b/.test(normalized)
    && /\b(?:funcionario|funcionário|colaborador|bruno|joao|joão|pedro|ana|carlos)\b/.test(normalized);
  if (employeeDelete) {
    const dados = { funcionario_nome: employeeName };
    return finalize("EXCLUIR_FUNCIONARIO", dados, buildMissing("EXCLUIR_FUNCIONARIO", dados), 0.86);
  }

  const employeeDeactivate = /\b(?:desliga|desligar|inativa|inativar|desativa|desativar|demite|demitir|saiu da fazenda|nao trabalha mais|não trabalha mais|afasta|afastar|inativo|desligada)\b/.test(normalized);
  if (employeeDeactivate) {
    const dados = { funcionario_nome: employeeName };
    return finalize("DESLIGAR_FUNCIONARIO", dados, buildMissing("DESLIGAR_FUNCIONARIO", dados), 0.86);
  }

  const employeeUpdateBlockedByAnimal = Boolean(extractAnimalCode(normalized, "ATUALIZACAO_ANIMAL"))
    && /\b(?:animal|vaca|boi|touro|bezerro|bezerra|novilha|brinco|lote|piquete|pasto|raca|raça|nascimento|nasceu|fase|peso|pesou|prenhe|prenha|prenhez|gestante|vazia|seca|lactante)\b/.test(normalized);
  const employeeUpdate = (
    /\b(?:muda|mudar|altera|alterar|atualiza|atualizar|corrige|corrigir|troca|trocar|define|definir|reativa|reativar|ativa|ativar|virou|agora ganha|ganha|salario|salário|slario|cpf|whatsapp|telefone)\b/.test(normalized)
    && !/\b(?:cadastra|cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar|contratei|contratar)\b/.test(normalized)
    && !/\b(?:paguei|pagamento|salario pago|salário pago|diaria|diária|recebeu)\b/.test(normalized)
    && !employeeUpdateBlockedByAnimal
    && (employeeName || employeeSalary !== undefined || employeePhone || employeeCpf)
  );
  if (employeeUpdate) {
    const dados = employeeUpdateData(original, normalized);
    return finalize("ATUALIZAR_FUNCIONARIO", dados, buildMissing("ATUALIZAR_FUNCIONARIO", dados), 0.86);
  }

  const richEmployeeCreate = (
    /\b(?:cadastra|cadastrar|cadastre|cadatra|adicionar|adiciona|novo|nova|cria|criar|registrar|registra|coloca|contratei|contratar)\b/.test(normalized)
    || /\b(?:começou a trabalhar|comecou a trabalhar|trabalha como|vai usar so|vai usar só)\b/i.test(original)
    || /^funcion[aá]rio\s+/i.test(original)
  )
    && (
      /\b(?:funcionario|funcionário|funcionaria|colaborador|vaqueiro|ordenhador|ordenhadora|tratador|tratadora|gerente|trabalhar|trabalha|bot|whatsapp|salario|salário)\b/.test(normalized)
      || (employeeName && /\b(?:contratei|contratar|trabalha como|começou a trabalhar|comecou a trabalhar)\b/i.test(original))
      || employeeSalary !== undefined
      || employeePhone
      || employeeAccessMode
    );
  if (richEmployeeCreate) {
    const dados = {
      funcionario_nome: extractEmployeeCreationName(original) || employeeName,
      telefone: employeePhone,
      funcao: employeeRole,
      salario_base: employeeSalary,
      cpf: employeeCpf,
      tipo_acesso: employeeAccessMode,
      telefone_obrigatorio: Boolean(employeeAccessMode || /\b(?:autoriza|libera|numero|número|whatsapp|bot)\b/.test(normalized))
    };
    return finalize("CRIAR_FUNCIONARIO", dados, buildMissing("CRIAR_FUNCIONARIO", dados), 0.88);
  }

  const stockLikePointText = hasPhysicalQuantity(original)
    || hasLooseStockQuantity(original)
    || /\b(?:racao|ração|saco|sacos|fardo|fardos|poste|postes|brinco|brincos|identificacao|identificação|kg|quilo|quilos)\b/.test(normalized);
  const pointContext = /\b(?:ponto|bateu|bater ponto|registrar ponto|cheguei|comecei|terminei|fim do expediente|foi embora|fechou o ponto)\b/.test(normalized)
    || Boolean(extractEmployeeName(original, normalized) || employeeName);
  const earlyPoint = /\b(?:ponto|entrou|entrada|saiu|saida|bateu|bater ponto|registrar ponto|chegou|cheguei|comecei|comecou|iniciou|inicio|terminou|terminei|encerrou|fim do expediente|foi embora|fechou o ponto)\b/.test(normalized)
    && pointContext
    && !stockLikePointText
    && !reproductiveObservationCue.test(normalized)
    && !hasValue(extractMoneyValue(normalized))
    && !/\b(?:paguei|pagamento|salario|salário|folha|diaria|diária|financeiro|despesa|receita|venda|vendi)\b/.test(normalized);
  if (earlyPoint) {
    const dados = {
      funcionario_nome: extractEmployeeName(original, normalized) || employeeName,
      ponto_tipo: extractPointType(normalized),
      horario: extractPointTime(normalized),
      data_referencia: extractDateReference(normalized) || "hoje",
      agora: /\bagora\b/.test(normalized) || undefined
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados), 0.88);
  }

  const isEmployeeCreate = /\b(?:cadastra|cadastrar|cadastre|adicionar|adiciona|novo|nova|cria|criar)\b/.test(normalized)
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
  const isSale = /\b(?:vendi|vendii|vendeu|vendemos|vender)\b/.test(normalized) || /^venda\b/.test(normalized);
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

  const animalQueryCode = extractAnimalCode(normalized, "CONSULTA_ANIMAL") || looseAnimalReportCode;
  const animalUpdateVerb = /\b(?:mudar|atualizar|alterar|trocar|corrigir|agora|ficou|esta|ta|em|marcar|marca|para|prenhe|prenha|prenhez|gestante|vazia|seca|lactante|peso|pesou|nome|vendida|vendido|saiu do rebanho)\b/.test(normalized)
    || hasClinicalObservationCue(normalized)
    || reproductiveObservationCue.test(normalized);
  const isQuestion = /\?/.test(original);
  const animalCreationCue = /\b(?:cadastra|cadastrar|cadastre|cadastro|cadatra|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lancar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova)\b/.test(normalized)
    && new RegExp(`\\b${animalWords}\\b`).test(normalized);
  const animalEventCue = /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra|nasceu um bezerro|nasceu uma bezerra|teve bezerro|teve bezerra|deu cria|nascimento de bezerro|nascimento de bezerra)\b/.test(normalized)
    && !(/\bcria\b/.test(normalized) && animalCreationCue && !/\b(?:deu cria|criou|pariu|parto|nasceu|teve)\b/.test(normalized));
  const earlyHasProductionCue = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|produção)\b/.test(normalized);
  const earlyMedicineCue = vaccineProductCue.test(normalized) || treatmentProductCue.test(normalized);
  const clearAnimalRegistrationDetails = Boolean(extractAnimalRegistrationCode(normalized))
    || /\b(?:peso|pesou|brinco|codigo|cod|numero|número|nome|chamado|chamada|raca|raça|lote|nascimento|nasceu)\b/.test(normalized);
  if (!earlyHasProductionCue && !animalEventCue && !earlyMedicineCue && animalCreationCue && (!hasStockItemHint || clearAnimalRegistrationDetails)) {
    const dados = {
      animal_codigo: extractAnimalRegistrationCode(normalized),
      nome: extractAnimalRegistrationName(original),
      categoria: extractAnimalCategory(normalized),
      sexo: extractAnimalSex(normalized),
      peso: extractAnimalWeight(original),
      fase: extractAnimalPhase(normalized),
      raca: extractAnimalBreed(original),
      lote_nome: extractAnimalLotName(original),
      data_nascimento: extractAnimalBirthDate(original),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("CADASTRO_ANIMAL", dados, buildMissing("CADASTRO_ANIMAL", dados));
  }
  const animalReportCue = /\b(?:como\s+(?:que\s+)?(?:ta|t[aá]|esta|est[aá])|me\s+(?:fala|mostra|mostre|manda|d[aá])|relatorio|relat[oó]rio|resumo|ficha|dados|situa[cç][aã]o|status|panorama)\b/.test(normalized);
  const isAnimalConsultation = Boolean(animalQueryCode)
    && !animalCreationCue
    && !animalEventCue
    && (!animalUpdateVerb || isQuestion || animalReportCue)
    && (animalReportCue || /\b(?:consultar|consulta|ver|mostra|mostrar|dados|informacoes|informações|ficha|historico|histórico|eventos|vacinas|medicamentos|tratamentos|partos|clinico|reprodutivo|ultima vacina|quando|status|idade|nasceu|nascimento|raca|raça|lote)\b/.test(normalized) || /\?/.test(original));
  if (isAnimalConsultation) {
    return finalize("CONSULTA_ANIMAL", { animal_codigo: animalQueryCode, consulta: true }, [], 0.88);
  }

  const isEmployeeQuery = /\b(?:consultar|ver|funcionario|funcionário|equipe|colaborador)\b/.test(normalized)
    && !explicitFinanceValue
    && !/\b(?:pagamento|despesa|salario|folha|diaria|paguei)\b/.test(normalized)
    && !/\b(?:entrou|saiu|ponto|entrada|saida|saída)\b/.test(normalized);
  if (isEmployeeQuery) return finalize("CONSULTA_FUNCIONARIO", { funcionario_nome: extractEmployeeName(original, normalized) }, [], 0.8);

  const hasFinancialEntryCue = /\b(?:entrada|entrou|saida|saída)\b/.test(normalized)
    && hasValue(extractMoneyValue(normalized))
    && !extractPointTime(normalized);
  const explicitFinanceLaunch = /\b(?:registrar|registra|lancar|lanca|lançar|lança|anotar|anota)\s+(?:entrada|saida|saída|receita|despesa)\b/.test(normalized);
  const hasFinanceOperation = /\b(?:venda|vendi|vendii|recebi|recebemos|receita|despesa|pagamento|paguei|financeiro|caixa|lucro|salario|folha|diaria|gasto|ganhei)\b/.test(normalized)
    || hasFinancialEntryCue
    || explicitFinanceLaunch;
  const isPoint = /\b(?:ponto|entrou|entrada|saiu|saida|saída|bateu|bater ponto|registrar ponto)\b/.test(normalized)
    && !physicalQuantity
    && !hasFinanceOperation
    && !hasClinicalObservationCue(normalized)
    && !reproductiveObservationCue.test(normalized);
  if (isPoint) {
    const dados = {
      funcionario_nome: extractEmployeeName(original, normalized),
      ponto_tipo: extractPointType(normalized),
      horario: extractPointTime(normalized),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("PONTO_FUNCIONARIO", dados, buildMissing("PONTO_FUNCIONARIO", dados), 0.88);
  }

  const stockOutVerb = /\b(?:baixa|baixar|dar baixa|da baixa|retira|retirar|retirei|retire|tira|tirar|usei|usar|gastei|dei|deu para|saiu|saida|saída|consumi|consumiu|descartei)\b/.test(normalized);
  const medicineAnimalCue = (vaccineProductCue.test(normalized) || treatmentProductCue.test(normalized)) && Boolean(extractAnimalCode(normalized, "VACINA_MEDICAMENTO"));
  const isStockSale = isSale && physicalQuantity && !medicineAnimalCue && Boolean(stockItemName);
  if (isStockSale) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized),
      valor: explicitMoney ?extractMoneyValue(normalized) : undefined,
      venda: true,
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("ESTOQUE_SAIDA", dados, buildMissing("ESTOQUE_SAIDA", dados), 0.88);
  }
  const paidPhysicalPurchaseValue = normalized.match(/\b(?:paguei|gastei|gasto|despesa)\s+(?:r\$\s*)?(\d+(?:[,.]\d+)?)(?![\d,.])(?!\s*(?:kg|kilos?|k\b|quilos?|sacos?|caixas?|doses?|fardos?|unidades?|litros?))/)?.[1];
  const paidPhysicalValue = paidPhysicalPurchaseValue ?firstNumber(paidPhysicalPurchaseValue) : undefined;
  const paidPhysicalPurchase = physicalQuantity
    && hasValue(paidPhysicalValue)
    && !isSale
    && /\b(?:paguei|gastei|gasto|despesa)\b/.test(normalized)
    && Boolean(stockItemName);
  if (paidPhysicalPurchase) {
    const dados = {
      item_nome: stockItemName,
      quantidade: stockQuantity,
      unidade: extractStockUnit(normalized),
      valor: paidPhysicalValue,
      compra: true,
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("ESTOQUE_ENTRADA", dados, buildMissing("ESTOQUE_ENTRADA", dados), 0.88);
  }
  const stockOutWithoutQuantity = !physicalQuantity && stockOutVerb && hasStockItemHint && !medicineAnimalCue && !explicitMoney && (!hasValue(stockQuantity) || !/\bgastei\b/.test(normalized));
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
  const implicitStockIn = physicalQuantity && hasStockItemHint && !stockOutVerb && !isSale && !explicitMoney;
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
      compra: (isPurchase || paidPhysicalStock) || undefined,
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("ESTOQUE_ENTRADA", dados, buildMissing("ESTOQUE_ENTRADA", dados));
  }

  const productionAnimalReference = extractProductionAnimalReference(original, normalized) || extractAnimalCode(normalized, "PRODUCAO_LEITE");
  const explicitProductionTime = extractExplicitTimeReference(original);
  const productionLitersBeforeFinance = extractLiters(normalized) ?? extractLooseProductionLiters(normalized);
  const productionBeforeFinance = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|produção|tirei|deu|fez)\b/.test(normalized)
    && Number(productionLitersBeforeFinance || 0) > 0
    && Boolean(productionAnimalReference)
    && !/^(?:recebi|recebemos|ganhei|receita|vendi|vendii|venda)\b/.test(normalized)
    && !/\b(?:baixa|cria|parto)\b/.test(normalized);
  if (productionBeforeFinance) {
    const destino = milkProductionDestination(normalized);
    const dados = {
      animal_codigo: productionAnimalReference,
      litros: extractLiters(normalized) ?? extractLooseProductionLiters(normalized),
      turno: extractTurno(normalized),
      horario: explicitProductionTime,
      data_referencia: extractDateReference(normalized) || "hoje",
      destino_leite: destino,
      destino_leite_claro: Boolean(destino),
      tanque: destino === "tanque"
    };
    return finalize("PRODUCAO_LEITE", dados, buildMissing("PRODUCAO_LEITE", dados));
  }

  const animalObservationBeforeFinanceData = extractAnimalUpdateData(original, normalized) as Record<string, unknown>;
  const animalObservationBeforeFinance = !animalCreationCue
    && !isQuestion
    && (hasClinicalObservationCue(normalized) || reproductiveObservationCue.test(normalized))
    && (Boolean(animalObservationBeforeFinanceData.animal_codigo)
      || /\b(?:animal|vaca|gado|novilha|bezerro|bezerra|registrar|registra|observacao|doenca|clinica|clinico|cio|prenhez|inseminacao|cobertura)\b/.test(normalized));
  if (animalObservationBeforeFinance) {
    return finalize("ATUALIZACAO_ANIMAL", animalObservationBeforeFinanceData, buildMissing("ATUALIZACAO_ANIMAL", animalObservationBeforeFinanceData), 0.88);
  }

  const isExpense = /\b(?:gastei|gasto|despesa|paguei|comprei|conprei|custo|saida|saída|pagamento funcionario|pagamento de funcionario|salario|folha|diaria)\b/.test(normalized);
  const isRevenue = /\b(?:vendi|vendii|venda|recebi|recebemos|receita|entrada|entrou|faturou|faturei|ganhei|pagamento recebido|cliente pagou)\b/.test(normalized)
    && !hasClinicalObservationCue(normalized)
    && !reproductiveObservationCue.test(normalized);

  if (isRevenue && !isExpense) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "RECEITA_VENDA"),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("RECEITA_VENDA", dados, buildMissing("RECEITA_VENDA", dados));
  }

  if (isExpense && (!physicalQuantity || explicitMoney)) {
    const dados = {
      valor: extractMoneyValue(normalized),
      descricao: extractFinanceDescription(original, normalized, "DESPESA"),
      data_referencia: extractDateReference(normalized) || "hoje"
    };
    return finalize("DESPESA", dados, buildMissing("DESPESA", dados));
  }

  const isParto = !herdReproductionFilterFromText(normalized)
    && /\b(?:pariu|parto|cria|criou|nasceu bezerro|nasceu bezerra|nasceu um bezerro|nasceu uma bezerra|deu cria|teve bezerro|teve bezerra|teve cria|nascimento de bezerro|nascimento de bezerra)\b/.test(normalized);
  if (isParto) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "PARTO"),
      data_referencia: extractDateReference(normalized)
    };
    return finalize("PARTO", dados, buildMissing("PARTO", dados));
  }

  const isMedicine = /\b(?:apliquei|aplicar|aplicou|recebeu|tomou|dose)\b/.test(normalized) && (vaccineProductCue.test(normalized) || treatmentProductCue.test(normalized))
    || vaccineProductCue.test(normalized)
    || treatmentProductCue.test(normalized);
  if (isMedicine) {
    const dados = {
      animal_codigo: extractAnimalCode(normalized, "VACINA_MEDICAMENTO"),
      produto: extractProduct(original, normalized),
      evento_tipo: vaccineProductCue.test(normalized) ?"vacina" : "tratamento",
      data_referencia: extractDateReference(normalized)
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

  const animalUpdateData = extractAnimalUpdateData(original, normalized) as Record<string, unknown>;
  const isAnimalUpdate = Boolean(animalUpdateData.animal_codigo)
    && !animalCreationCue
    && (/\b(?:mudar|atualizar|alterar|trocar|corrigir|agora|ficou|esta|ta|em|marcar|marca|prenhe|prenha|prenhez|gestante|vazia|seca|lactante|lote|piquete|pasto|peso|pesou|kg|nome|raca|raça|observacao|observação|vendida|vendido|saiu do rebanho)\b/.test(normalized)
      || hasClinicalObservationCue(normalized)
      || reproductiveObservationCue.test(normalized))
    && !/\bdeu\b/.test(normalized)
    && !isQuestion;
  const isIncompleteAnimalUpdate = !animalCreationCue
    && !isQuestion
    && !animalUpdateData.animal_codigo
    && (hasClinicalObservationCue(normalized) || reproductiveObservationCue.test(normalized))
    && /\b(?:animal|vaca|gado|novilha|registrar|registra|observacao|observação|doenca|doença|clinica|clinico|cio|prenhez|inseminacao|cobertura)\b/.test(normalized);
  if (isAnimalUpdate || isIncompleteAnimalUpdate) {
    return finalize("ATUALIZACAO_ANIMAL", animalUpdateData, buildMissing("ATUALIZACAO_ANIMAL", animalUpdateData));
  }

  const hasProductionCue = /\b(?:leite|litro|litros|ordenha|ordenhei|produziu|producao|produção)\b/.test(normalized);
  const isAnimalCreation = !hasProductionCue
    && /\b(?:cadastrar|cadastre|cadastro|cadatra|adicionar|adiciona|adicione|inclui|incluir|registrar|registra|lanca|lança|lancar|lançar|bota|botar|botei|coloca|colocar|coloquei|cria|criar|novo|nova)\b/.test(normalized)
    && new RegExp(`\\b${animalWords}\\b`).test(normalized);
  if (isAnimalCreation) {
    const dados = {
      animal_codigo: extractAnimalRegistrationCode(normalized),
      nome: extractAnimalRegistrationName(original),
      categoria: extractAnimalCategory(normalized),
      sexo: extractAnimalSex(normalized),
      peso: extractAnimalWeight(original),
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
    const destino = milkProductionDestination(normalized);
    const animalReference = extractProductionAnimalReference(original, normalized) || extractAnimalCode(normalized, "PRODUCAO_LEITE");
    const dados = {
      animal_codigo: animalReference,
      litros: extractLiters(normalized) ?? extractLooseProductionLiters(normalized),
      turno: extractTurno(normalized),
      horario: extractExplicitTimeReference(original),
      data_referencia: extractDateReference(normalized) || "hoje",
      destino_leite: destino,
      destino_leite_claro: Boolean(destino),
      tanque: destino === "tanque"
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
