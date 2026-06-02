import { decimalNumberPattern } from "@/lib/whatsapp/nlp-numbers";

export const BOT_EXAMPLES = [
  "- Mimosa deu 15 litros de leite hoje",
  "- Adicionar vaca Mimosa com brinco B-043, fêmea, gestante, raça Girolando",
  "- Vendi leite por 900 reais",
  "- Comprei ração por 300 reais",
  "- Entrou 10 sacos de ração no estoque",
  "- João entrou às 7:30"
];

export const questionByField: Record<string, string> = {
  animal_codigo: "Qual é o brinco ou código do animal?",
  litros: "Quantos litros foram produzidos?",
  produto: "Qual medicamento, vacina ou manejo foi feito?",
  valor: "Qual foi o valor?",
  descricao: "Qual é a descrição do registro?",
  item_nome: "Qual item do estoque?",
  quantidade: "Qual quantidade?",
  unidade: "Qual unidade deseja usar?Exemplo: saco, kg ou unidade.",
  funcionario_nome: "Qual funcionário?",
  telefone: "Qual é o WhatsApp do funcionário?Envie com DDD.",
  ponto_tipo: "Foi entrada ou saída?",
  categoria_animal: "Qual é a categoria do animal?Ex: vaca, bezerro ou touro.",
  sexo: "Quer informar o sexo do animal?Envie fêmea, macho ou 2 para pular.",
  fase: "Quer informar a fase?Ex: lactação, seca, gestante, vazia, crescimento, engorda ou 2 para pular.",
  raca: "Quer informar a raça?Envie o nome da raça ou 2 para pular.",
  lote_animal: "Quer informar o lote?Envie o nome do lote já cadastrado ou 2 para pular.",
  data_nascimento: "Quer informar o nascimento?Envie a data (DD/MM/AAAA ou AAAA-MM-DD) ou 2 para pular."
};

export const animalWords = "(?:vacas?|animais|animal|gado|bois?|touros?|bezerros?|bezerras?|novilhas?|brinco)";
export const animalOptionalFields = ["sexo", "fase", "raca", "lote_animal", "data_nascimento"];
export const animalCategories = new Set(["vaca", "vacas", "boi", "bois", "bezerro", "bezerros", "bezerra", "bezerras", "novilha", "novilhas", "touro", "touros", "animal", "animais"]);
export const animalCategoryMap: Record<string, string | undefined> = {
  vaca: "vaca",
  vacas: "vaca",
  boi: "boi",
  bois: "boi",
  bezerro: "bezerro",
  bezerros: "bezerro",
  bezerra: "bezerro",
  bezerras: "bezerro",
  novilha: "novilha",
  novilhas: "novilha",
  touro: "touro",
  touros: "touro"
};
export const animalSexMap: Record<string, string | undefined> = {
  femea: "femea",
  femeas: "femea",
  f: "femea",
  feminino: "femea",
  macho: "macho",
  machos: "macho",
  m: "macho",
  masculino: "macho"
};
export const animalPhaseMap: Record<string, string | undefined> = {
  lactacao: "lactacao",
  lactante: "lactacao",
  leite: "lactacao",
  seca: "seca",
  gestante: "gestante",
  prenha: "gestante",
  vazia: "vazia",
  crescimento: "crescimento",
  recria: "crescimento",
  engorda: "engorda",
  nao_aplicavel: "nao_aplicavel",
  inaplicavel: "nao_aplicavel"
};
export const animalCodePattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const stockUnitWords = "(?:sacos?|kg|quilos?|gramas?|g|litros?|l|caixas?|doses?|fardos?|unidades?)";
export const stockUnitAfterQuantityPattern = new RegExp(`\\b(${decimalNumberPattern})\\s*(${stockUnitWords})\\b`, "i");
export const stockItemHintPattern = /\b(?:racao|ração|milho|feno|sal|mineral|aftosa|remedio|remédio|medicamento|insumo|silagem|suplemento)\b/;
export const forbiddenAnimalCodes = new Set([
  "vaca",
  "vacas",
  "animal",
  "animais",
  "boi",
  "bois",
  "touro",
  "touros",
  "bezerro",
  "bezerros",
  "bezerra",
  "bezerras",
  "novilha",
  "novilhas",
  "pariu",
  "morreu",
  "fundo",
  "curral",
  "pasto",
  "piquete",
  "hoje",
  "ontem",
  "vacina",
  "medicamento",
  "remedio",
  "terramicina",
  "aftosa",
  "racao",
  "milho",
  "feno",
  "sal",
  "mineral",
  "estoque",
  "litros",
  "kg",
  "saco",
  "sacos",
  "dose",
  "doses",
  "fardo",
  "fardos"
]);
