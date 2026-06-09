const GROUP_COUNTS = {
  G1: 32,
  G2: 20,
  G3: 36,
  G4: 24,
  G5: 28,
  G6: 28,
  G7: 24,
  G8: 20,
  G9: 24,
  G10: 20,
  G11: 36,
  G12: 20,
  G13: 24,
  G14: 28,
  G15: 20,
  G16: 28,
  G17: 28,
  G18: 16,
  G19: 20,
  G20: 24
};

const GROUPS = {
  G1: "Producao simples correta",
  G2: "Producao incompleta",
  G3: "Producao em massa/lote correta",
  G4: "Producao suspeita",
  G5: "Estoque entrada/compra correta",
  G6: "Estoque saida/uso correto",
  G7: "Venda fisica sem preco",
  G8: "Venda com preco correto",
  G9: "Financeiro despesa/receita",
  G10: "Funcionarios e folha",
  G11: "Saude/observacao sanitaria",
  G12: "Vacina/medicamento",
  G13: "Reproducao/parto/inseminacao",
  G14: "Cadastro individual de animal",
  G15: "Cadastro em massa de animal",
  G16: "Consultas e relatorios",
  G17: "Frases compostas/multiplas acoes",
  G18: "Correcao/cancelamento/negacao",
  G19: "Ruido, typos e linguagem informal",
  G20: "Casos perigosos de nao fallback"
};

function cycle(items, index) {
  return items[index % items.length];
}

function makeCases(group, count, seeds, defaults = {}) {
  return Array.from({ length: count }, (_, index) => {
    const seed = seeds[index % seeds.length];
    const variant = typeof seed === "string" ? { mensagem: seed } : seed;
    const suffixes = defaults.suffixes || [""];
    const suffix = variant.keepExact ? "" : cycle(suffixes, Math.floor(index / seeds.length));
    return {
      id: `${group}-${String(index + 1).padStart(3, "0")}`,
      grupo: group,
      grupoNome: GROUPS[group],
      mensagem: `${variant.mensagem}${suffix}`.trim(),
      expectedIntentAnyOf: variant.expectedIntentAnyOf || defaults.expectedIntentAnyOf || [],
      expectedShouldCallGemini: variant.expectedShouldCallGemini ?? defaults.expectedShouldCallGemini ?? false,
      expectedCriticalWarnings: variant.expectedCriticalWarnings || defaults.expectedCriticalWarnings || [],
      expectedMustNotHappen: variant.expectedMustNotHappen || defaults.expectedMustNotHappen || [],
      forbiddenPatterns: variant.forbiddenPatterns || defaults.forbiddenPatterns || [],
      mustNotSave: variant.mustNotSave ?? defaults.mustNotSave ?? false,
      observacao: variant.observacao || defaults.observacao || ""
    };
  });
}

function buildFallbackAuditCases() {
  const cases = [
    ...makeCases("G1", GROUP_COUNTS.G1, [
      "vaca 1 deu 15 litros",
      "B-002 deu 30 litros",
      "ordenhei 21,5L da Natasha",
      "Mimosa deu 18 litros",
      "vaca 021 produziu 12,5 litros",
      "Kelly deu 28 litros",
      "Thais deu 25 litros",
      "a vaca 7 deu 19 litros",
      "producao da vaca 3 foi 14 litros",
      "Natasha 21 litros"
    ], { expectedIntentAnyOf: ["PRODUCAO_LEITE"], suffixes: ["", " hoje", " ontem", " de manha"] }),

    ...makeCases("G2", GROUP_COUNTS.G2, [
      "vaca 2 deu leite",
      "Mimosa deu leite",
      "deu 20 litros",
      "ordenhei a vaca 5",
      "producao da Kelly",
      "vaca B-002 produziu",
      "a 7 deu leite",
      "Natasha leite hoje"
    ], { expectedIntentAnyOf: ["PRODUCAO_LEITE"], expectedShouldCallGemini: false, mustNotSave: true }),

    ...makeCases("G3", GROUP_COUNTS.G3, [
      "vaca 1 deu 15 e a 2 20",
      "Kelly deu 28 litros e Thais 25",
      "Mimosa 20 litros, Estrela 18, Preta 22",
      "B-002 deu 30 e B-003 25",
      "Kelly deu 28 e Thais tambem",
      "vaca 1 15L; vaca 2 20L; vaca 3 18L",
      "Natasha 21,5L e Lindona 19L",
      "Mimosa deu 20 litros, Preta 22 litros e Malhada 18",
      "a 1 deu 15, a 2 deu 20",
      "ordenhei Kelly 28 e Thais 25"
    ], { expectedIntentAnyOf: ["LOTE_REGISTROS"], expectedShouldCallGemini: false }),

    ...makeCases("G4", GROUP_COUNTS.G4, [
      "ordenhei 21,5L de Natasha hoje de 10h",
      "ordenhei 20 litros de 10h",
      "vaca 10h deu 20 litros",
      "B-002 deu 30 litros e",
      "vaca deu 20 litros e Thais",
      "Kelly deu 28 litros, e 25",
      "ordenhei de manha 20 litros Natasha",
      "vaca 1 deu 15 e 20",
      "deu 20 litros na vaca nova",
      "Kelly deu 28 litros e Thais"
    ], { expectedIntentAnyOf: ["PRODUCAO_LEITE", "LOTE_REGISTROS"], expectedShouldCallGemini: true, expectedCriticalWarnings: ["use_gemini_fallback"], mustNotSave: true }),

    ...makeCases("G5", GROUP_COUNTS.G5, [
      "comprei 10 sacos de racao por 300 reais",
      "comprei 20kg de sal mineral por 150",
      "entrou 50 doses de aftosa",
      "chegou 30kg de racao de boi",
      "comprei 10 sacos de racao de boi por 2,5 mil",
      "entrada de 40 litros de leite cru",
      "adicionei 15kg de milho no estoque",
      "comprei 3 caixas de medicamento por 120 reais",
      "chegou 100kg de silagem",
      "comprei 2 fardos de feno por 80"
    ], { expectedIntentAnyOf: ["ESTOQUE_ENTRADA", "CRIAR_ITEM_ESTOQUE"], expectedShouldCallGemini: false }),

    ...makeCases("G6", GROUP_COUNTS.G6, [
      "usei 20kg de racao",
      "gastei 2 doses de aftosa",
      "dei baixa em 10kg de sal mineral",
      "saiu 5 sacos de racao",
      "usei 1 frasco de medicamento",
      "baixar 30kg de milho",
      "consumi 15kg de silagem",
      "usei 2 doses de vermifugo",
      "retirei 40 litros de leite cru",
      "usei 20kg de racao e 2 doses de aftosa"
    ], { expectedIntentAnyOf: ["ESTOQUE_SAIDA", "LOTE_REGISTROS"], expectedShouldCallGemini: false }),

    ...makeCases("G7", GROUP_COUNTS.G7, [
      "vendi 40L de leite",
      "vendi 30kg de racao",
      "vendi 2 bezerros",
      "vendi 10 sacos de milho",
      "vendi 50 litros de leite cru",
      "vendi 1 vaca",
      "vendi 3 doses de vacina",
      "venda de 20kg de racao",
      "saiu venda de 40L leite",
      "vendemos 25 litros de leite"
    ], { expectedIntentAnyOf: ["ESTOQUE_SAIDA", "RECEITA_VENDA"], expectedShouldCallGemini: true, expectedCriticalWarnings: ["physical_sale_without_price"], mustNotSave: true, expectedMustNotHappen: ["finance_value_equals_physical_quantity"] }),

    ...makeCases("G8", GROUP_COUNTS.G8, [
      "vendi bezerro por 15 mil",
      "vendi 40L de leite por 120 reais",
      "vendi 30kg de racao por 90",
      "venda de boi por 5000",
      "recebi 250 reais da venda de leite",
      "vendi uma vaca por 4,5 mil",
      "vendi 2 bezerros por 3000",
      "vendi leite por 180 reais",
      "recebi 120 pelo leite",
      "vendi 10 sacos de milho por 700"
    ], { expectedIntentAnyOf: ["RECEITA_VENDA", "ESTOQUE_SAIDA"], expectedShouldCallGemini: false }),

    ...makeCases("G9", GROUP_COUNTS.G9, [
      "paguei 500 reais de energia",
      "recebi 1200 de venda",
      "gastei 300 com veterinario",
      "paguei salario do Bruno 2500",
      "recebi 2,5 mil de leite",
      "paguei 150 de frete",
      "comprei remedio por 80 reais",
      "paguei 20 mil no trator",
      "entrada de 500 reais",
      "saida de 120 reais"
    ], { expectedIntentAnyOf: ["DESPESA", "RECEITA_VENDA", "PAGAMENTO_FUNCIONARIO", "ESTOQUE_ENTRADA"], expectedShouldCallGemini: false }),

    ...makeCases("G10", GROUP_COUNTS.G10, [
      "paguei salario do Bruno",
      "paguei salario do Bruno 2500",
      "adiantamento pro Joao de 300 reais",
      "cadastre funcionario Pedro",
      "novo funcionario Ana",
      "paguei diaria do Carlos 120",
      "Bruno recebeu salario",
      "lanca pagamento do funcionario Joao 2000",
      "paguei 2,5 mil pro Bruno",
      "folha do Bruno paga"
    ], { expectedIntentAnyOf: ["PAGAMENTO_FUNCIONARIO", "CRIAR_FUNCIONARIO", "CONSULTA_FOLHA", "DESPESA"], expectedShouldCallGemini: false }),

    ...makeCases("G11", GROUP_COUNTS.G11, [
      "Lindona nao comeu hoje",
      "a preta ta mancando",
      "Mimosa esta triste",
      "vaca 12 com febre",
      "tem vaca doente",
      "animal doente no curral",
      "a vaca do curral morreu",
      "bezerro 03 esta fraco",
      "Kelly machucou a pata",
      "Thais nao levantou hoje",
      "a vaca preta ta estranha",
      "tem bezerro tossindo",
      "Lindona com diarreia",
      "Mimosa parou de comer",
      "vaca 7 abortou"
    ], { expectedIntentAnyOf: ["ATUALIZACAO_ANIMAL", "MORTE", "PARTO"], expectedShouldCallGemini: false, expectedMustNotHappen: ["health_as_animal_register", "correction_or_cancellation"] }),

    ...makeCases("G12", GROUP_COUNTS.G12, [
      "apliquei aftosa na vaca 1",
      "vacinei B-002 contra aftosa",
      "dei 2ml de medicamento na Mimosa",
      "apliquei vermifugo no lote 1",
      "usei 2 doses de aftosa na vaca 3",
      "mediquei Lindona com antibiotico",
      "vaca 5 tomou vacina",
      "apliquei 10ml de remedio no bezerro 2",
      "vacina de raiva na Estrela",
      "usei 2 doses de aftosa e 20kg de racao"
    ], { expectedIntentAnyOf: ["VACINA_MEDICAMENTO", "ESTOQUE_SAIDA", "LOTE_REGISTROS"], expectedShouldCallGemini: false }),

    ...makeCases("G13", GROUP_COUNTS.G13, [
      "Mimosa foi inseminada hoje",
      "inseminar vaca 12",
      "vaca 7 pariu",
      "nasceu bezerro da Lindona",
      "Thais entrou em pre parto",
      "diagnostico positivo para Kelly",
      "vaca 3 esta prenha",
      "Mimosa abortou",
      "retorno de cio da vaca 5",
      "parto da vaca B-002 hoje"
    ], { expectedIntentAnyOf: ["PARTO", "ATUALIZACAO_ANIMAL", "VACINA_MEDICAMENTO"], expectedShouldCallGemini: false }),

    ...makeCases("G14", GROUP_COUNTS.G14, [
      { mensagem: "novo animal", expectedShouldCallGemini: true, expectedCriticalWarnings: ["use_gemini_fallback"], expectedMustNotHappen: ["command_word_as_name"] },
      { mensagem: "cadastrar novo animal", expectedShouldCallGemini: true, expectedCriticalWarnings: ["use_gemini_fallback"], expectedMustNotHappen: ["command_word_as_name"] },
      "cadastrar animal",
      "novo animal Anderson",
      "cadastrar novo animal Anderson",
      "nova vaca Estrela",
      "cadastrar vaca Mimosa",
      "cadastrar boi Anderson 320kg",
      "novo touro Brutus",
      "nova novilha Estrela",
      "cadastrar animal Anderson macho 320kg",
      "cadastrar animal Estrela femea 400kg",
      "cadastrar bezerro 030 filho da Mimosa",
      { mensagem: "vaca 1 deu 15 litros", expectedIntentAnyOf: ["PRODUCAO_LEITE"], expectedShouldCallGemini: false },
      { mensagem: "Lindona nao comeu hoje", expectedIntentAnyOf: ["ATUALIZACAO_ANIMAL"], expectedShouldCallGemini: false }
    ], { expectedIntentAnyOf: ["CADASTRO_ANIMAL"], expectedShouldCallGemini: false, expectedMustNotHappen: ["command_word_as_name"] }),

    ...makeCases("G15", GROUP_COUNTS.G15, [
      "001;vaca\n002;boi\n003;novilha",
      "004;touro\n005;bezerra\n006;bezerro",
      "007;animal;macho\n008;bovino;femea",
      "009;animal\n010;bovino",
      "Codigo;Categoria\n011;vaca\n012;boi",
      "021;vaca;femea\n022;boi;macho"
    ], { expectedIntentAnyOf: ["IMPORTACAO_ANIMAIS_TABELA"], expectedShouldCallGemini: false }),

    ...makeCases("G16", GROUP_COUNTS.G16, [
      "quanto tem de Leite Cru no estoque?",
      "resumo do dia",
      "o que eu registrei hoje?",
      "relatorio da vaca 19",
      "como ta a vaca 19?",
      "quais foram os partos recentes?",
      "lista de animais",
      "estoque atual",
      "saldo financeiro de hoje",
      "producao de leite da semana",
      "ranking de produtividade",
      "quais animais estao prenhas?",
      "funcionarios cadastrados",
      "ultimas compras",
      "ultimas vendas"
    ], { expectedIntentAnyOf: ["CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM", "CONSULTA_ESTOQUE_GERAL", "CONSULTA_REGISTROS_HOJE", "CONSULTA_ANIMAL", "CONSULTA_REBANHO", "CONSULTA_PRODUCAO", "CONSULTA_PRODUCAO_ANIMAL", "CONSULTA_FINANCEIRO", "CONSULTA_FUNCIONARIO"], expectedShouldCallGemini: false, mustNotSave: true }),

    ...makeCases("G17", GROUP_COUNTS.G17, [
      "vaca 1 deu 15 litros e usei 20kg de racao",
      "comprei racao e paguei o Bruno",
      "vendi leite e cadastrei uma vaca",
      "Mimosa foi inseminada e Lindona pariu",
      "usei 20kg de racao e 2 doses de aftosa",
      "vaca 1 deu 15, vaca 2 deu 20 e paguei 300 de energia",
      "comprei milho por 500 e vendi leite por 120",
      "cadastrei vaca Mimosa e registrei producao 20 litros",
      "paguei salario do Bruno e comprei racao",
      "Mimosa nao comeu e vaca 2 deu 15 litros"
    ], { expectedIntentAnyOf: ["LOTE_REGISTROS", "PRODUCAO_LEITE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "RECEITA_VENDA", "DESPESA", "CADASTRO_ANIMAL", "ATUALIZACAO_ANIMAL", "PARTO"], expectedShouldCallGemini: true, expectedCriticalWarnings: ["use_gemini_fallback"], expectedMustNotHappen: ["compound_single_without_fallback"] }),

    ...makeCases("G18", GROUP_COUNTS.G18, [
      "nao e parto, e inseminacao",
      "corrige o leite da vaca 1 para 20 litros",
      "cancela o ultimo registro",
      "apaga o lancamento de racao",
      "nao foi venda, foi compra",
      "Lindona nao comeu hoje",
      "nao registra isso ainda",
      "corrigir vaca 2",
      "o valor certo e 250",
      "nao era 15 litros, era 18"
    ], { expectedIntentAnyOf: ["DESCONHECIDO", "PRODUCAO_LEITE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "ATUALIZACAO_ANIMAL", "PARTO"], expectedShouldCallGemini: true, expectedCriticalWarnings: ["use_gemini_fallback"] }),

    ...makeCases("G19", GROUP_COUNTS.G19, [
      "vca 1 deu 15 litro",
      "mimosa deu uns 20 litro hj",
      "lanca ai 30 l da kelly",
      "botei racao 20kg",
      "paguei o brunno 2 mil",
      "a preta ta mancando hj",
      "qto tem de leite cru",
      "resumo hj",
      "cadatra vaca estrela",
      "comprei racao 2,5mil"
    ], { expectedIntentAnyOf: ["PRODUCAO_LEITE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "DESPESA", "ATUALIZACAO_ANIMAL", "CONSULTA_ESTOQUE", "CONSULTA_REGISTROS_HOJE", "CADASTRO_ANIMAL"], expectedShouldCallGemini: true }),

    ...makeCases("G20", GROUP_COUNTS.G20, [
      "vendi 40L de leite",
      "ordenhei 21,5L de Natasha hoje de 10h",
      "Kelly deu 28 litros e Thais 25",
      "novo animal",
      "cadastrar novo animal",
      "tem vaca doente",
      "a vaca do curral morreu",
      "vendi 30kg de racao",
      "comprei 30kg de racao",
      "quanto tem de racao?",
      "resumo do dia",
      "Lindona nao comeu hoje",
      "vaca 2 deu leite",
      "10h ordenhei Natasha 20 litros",
      "paguei salario do Bruno",
      "001;vaca",
      "002;boi",
      "cadastrar vaca Mimosa",
      "cadastrar animal Mimosa",
      "vaca 1 deu 15 e usei 20kg racao"
    ], { expectedIntentAnyOf: [], expectedShouldCallGemini: true, expectedCriticalWarnings: ["use_gemini_fallback"], expectedMustNotHappen: ["silent_dangerous_parse"], mustNotSave: true })
  ];

  if (cases.length !== 500) {
    throw new Error(`Fallback audit deve gerar exatamente 500 casos; gerou ${cases.length}.`);
  }
  return cases;
}

module.exports = { GROUP_COUNTS, GROUPS, buildFallbackAuditCases };
