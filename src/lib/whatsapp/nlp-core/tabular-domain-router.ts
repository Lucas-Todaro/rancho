import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

export const TABULAR_TABLE_DOMAINS = [
  "REBANHO_ANIMAIS",
  "LOTES",
  "GENEALOGIA",
  "REPRODUCAO",
  "PRODUCAO_LEITE",
  "ESTOQUE",
  "FINANCEIRO",
  "FUNCIONARIOS",
  "PONTO_FUNCIONARIO",
  "SAUDE_SANITARIO",
  "OBSERVACOES",
  "AGENDA_TAREFAS",
  "DESCONHECIDO"
] as const;

export type TabularTableDomain = typeof TABULAR_TABLE_DOMAINS[number];
export type KnownTabularTableDomain = Exclude<TabularTableDomain, "DESCONHECIDO">;

export type TabularDomainSchema = {
  domain: KnownTabularTableDomain;
  intentPerRow: string;
  fields: string[];
  aliases: Record<string, string[]>;
  strongFields: string[];
  requiredFields: string[];
};

export type StructuredTableDomainClassification = {
  domain: TabularTableDomain;
  confidence: number;
  intentPerRow: string | null;
  columnMapping: Record<string, number>;
  defaultFields: Record<string, unknown>;
  needsUserClarification: boolean;
  clarificationQuestion: string | null;
  warnings: string[];
  candidateDomains: Array<{ domain: KnownTabularTableDomain; score: number }>;
};

export type ClassifyStructuredTableDomainInput = {
  headers: string[];
  sampleRows?: string[][];
  rowCount?: number;
  allowedDomains?: TabularTableDomain[];
  domainSchemas?: Partial<Record<KnownTabularTableDomain, TabularDomainSchema>>;
};

function compactHeader(value: string) {
  return normalizeRanchoText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeToken(value: unknown) {
  return normalizeRanchoText(String(value || ""));
}

function schema(
  domain: KnownTabularTableDomain,
  intentPerRow: string,
  fields: string[],
  aliases: Record<string, string[]>,
  strongFields: string[],
  requiredFields: string[]
): TabularDomainSchema {
  return { domain, intentPerRow, fields, aliases, strongFields, requiredFields };
}

export const TABULAR_DOMAIN_SCHEMAS: Record<KnownTabularTableDomain, TabularDomainSchema> = {
  REBANHO_ANIMAIS: schema(
    "REBANHO_ANIMAIS",
    "CADASTRO_ANIMAL",
    ["codigo", "nome", "categoria", "sexo", "raca", "lote", "nascimento", "peso", "status", "fase", "observacoes", "pai_ref", "mae_ref"],
    {
      codigo: ["codigo", "cod", "brinco", "id", "animal id", "animal_id", "codigo animal", "cod animal"],
      nome: ["nome", "animal", "apelido", "identificacao"],
      categoria: ["categoria", "tipo", "classe"],
      sexo: ["sexo", "genero"],
      raca: ["raca"],
      lote: ["lote", "piquete", "grupo", "pasto"],
      nascimento: ["nascimento", "nasc", "data nascimento", "data_nascimento", "data de nascimento"],
      peso: ["peso", "kg"],
      status: ["status", "situacao"],
      fase: ["fase", "estagio"],
      observacoes: ["obs", "observacao", "observacoes", "nota", "comentario"],
      pai_ref: ["pai", "pai_ref", "touro", "reprodutor"],
      mae_ref: ["mae", "mae_ref", "matriz"]
    },
    ["codigo", "categoria", "sexo", "raca", "nascimento", "peso", "fase"],
    ["codigo"]
  ),
  LOTES: schema(
    "LOTES",
    "CRIAR_LOTE",
    ["nome", "tipo", "capacidade", "area", "unidade_area", "observacoes", "status"],
    {
      nome: ["lote", "nome", "piquete", "grupo", "setor", "pasto"],
      tipo: ["tipo", "categoria"],
      capacidade: ["capacidade", "lotacao"],
      area: ["area", "hectares", "ha"],
      unidade_area: ["unidade area", "unidade_area"],
      observacoes: ["obs", "observacao", "observacoes", "descricao"],
      status: ["status", "situacao"]
    },
    ["capacidade", "area", "unidade_area"],
    ["nome"]
  ),
  GENEALOGIA: schema(
    "GENEALOGIA",
    "ATUALIZACAO_GENEALOGIA",
    ["animal_ref", "pai_ref", "mae_ref", "filho_ref", "cria_codigo", "cria_nome", "sexo_cria", "data_nascimento", "data_parto", "observacoes"],
    {
      animal_ref: ["animal", "codigo", "brinco", "animal_ref"],
      pai_ref: ["pai", "pai_ref", "touro", "reprodutor"],
      mae_ref: ["mae", "mae_ref", "matriz"],
      filho_ref: ["filho", "filha", "cria", "bezerro", "bezerra"],
      cria_codigo: ["codigo cria", "cod cria", "brinco cria", "cria codigo", "codigo_cria", "brinco_cria"],
      cria_nome: ["nome cria", "cria nome", "nome_cria"],
      sexo_cria: ["sexo cria", "sexo_cria", "cria sexo", "sexo bezerro", "sexo bezerra"],
      data_nascimento: ["data nascimento", "nascimento", "nasc", "data_nascimento"],
      data_parto: ["data parto", "parto", "data_parto"],
      observacoes: ["obs", "observacao", "observacoes", "nota"]
    },
    ["pai_ref", "mae_ref", "filho_ref", "cria_codigo", "sexo_cria", "data_parto"],
    []
  ),
  REPRODUCAO: schema(
    "REPRODUCAO",
    "IMPORTACAO_EVENTOS_TABELA",
    ["animal_ref", "evento", "data", "pai_ref", "resultado", "cria_ref", "sexo_cria", "observacoes"],
    {
      animal_ref: ["animal", "vaca", "codigo", "cod", "brinco", "bicho", "codigo animal", "codigo / animal", "animal_ref"],
      evento: ["evento", "tipo", "status tipo", "status / tipo", "ocorrencia", "procedimento"],
      data: ["data", "dia", "quando", "data evento", "data_evento"],
      pai_ref: ["pai", "pai_ref", "touro", "reprodutor"],
      resultado: ["resultado", "status"],
      cria_ref: ["cria", "cria_ref", "bezerro", "bezerra"],
      sexo_cria: ["sexo cria", "sexo_cria"],
      observacoes: ["obs", "observacao", "observacoes", "nota", "comentario"]
    },
    ["evento", "data", "resultado", "cria_ref", "sexo_cria"],
    ["animal_ref", "evento"]
  ),
  PRODUCAO_LEITE: schema(
    "PRODUCAO_LEITE",
    "PRODUCAO_LEITE",
    ["animal_ref", "litros", "data", "horario", "turno", "destino", "observacoes"],
    {
      animal_ref: ["animal", "vaca", "codigo", "cod", "brinco", "nome", "animal_ref"],
      litros: ["litros", "litro", "leite", "producao", "producao litros", "volume", "qtd", "qtde", "quantidade", "total litros", "total_litros"],
      data: ["data", "dia", "quando", "ordenha data", "ordenha_data"],
      horario: ["hora", "horario"],
      turno: ["turno", "ordenha"],
      destino: ["destino", "uso", "para"],
      observacoes: ["obs", "observacao", "observacoes", "nota"]
    },
    ["litros", "turno", "destino"],
    ["animal_ref", "litros"]
  ),
  ESTOQUE: schema(
    "ESTOQUE",
    "IMPORTACAO_ESTOQUE_TABELA",
    ["item", "quantidade", "unidade", "tipo_movimento", "valor_total", "data", "fornecedor", "destino", "observacoes"],
    {
      item: ["item", "produto", "insumo", "material", "estoque"],
      quantidade: ["entrada", "qtd entrada", "qtde entrada", "quantidade entrada", "quantidade", "qtd", "qtde", "saida", "uso", "usado", "consumo", "baixa"],
      unidade: ["unidade", "un", "medida"],
      tipo_movimento: ["tipo", "movimento", "tipo movimento", "entrada ou saida"],
      valor_total: ["valor", "preco", "total", "valor_total", "valor total", "custo"],
      data: ["data", "dia"],
      fornecedor: ["fornecedor", "origem", "comprado de", "comprado_de"],
      destino: ["destino", "usado em", "usado_em", "lote destino", "lote_destino"],
      observacoes: ["obs", "observacao", "observacoes", "motivo"]
    },
    ["item", "quantidade", "unidade", "tipo_movimento"],
    ["item", "quantidade"]
  ),
  FINANCEIRO: schema(
    "FINANCEIRO",
    "FINANCEIRO_TRANSACAO",
    ["descricao", "tipo", "valor", "data", "categoria", "forma_pagamento", "pessoa", "observacoes"],
    {
      descricao: ["descricao", "item", "motivo", "historico"],
      tipo: ["tipo", "entrada", "saida", "receita", "despesa"],
      valor: ["valor", "preco", "total", "quantia"],
      data: ["data", "dia", "vencimento", "pagamento"],
      categoria: ["categoria", "grupo"],
      forma_pagamento: ["forma", "pagamento", "forma pagamento", "forma_pagamento"],
      pessoa: ["pessoa", "cliente", "fornecedor", "funcionario"],
      observacoes: ["obs", "observacao", "observacoes", "nota"]
    },
    ["descricao", "tipo", "valor", "forma_pagamento"],
    ["valor"]
  ),
  FUNCIONARIOS: schema(
    "FUNCIONARIOS",
    "CRIAR_FUNCIONARIO",
    ["nome", "cargo", "telefone", "salario", "data_admissao", "status", "observacoes"],
    {
      nome: ["nome", "funcionario", "colaborador"],
      cargo: ["cargo", "funcao"],
      telefone: ["telefone", "celular", "whatsapp"],
      salario: ["salario", "pagamento"],
      data_admissao: ["admissao", "entrada", "data admissao", "data_admissao"],
      status: ["status", "situacao"],
      observacoes: ["obs", "observacao", "observacoes"]
    },
    ["cargo", "telefone", "salario", "data_admissao"],
    ["nome"]
  ),
  PONTO_FUNCIONARIO: schema(
    "PONTO_FUNCIONARIO",
    "PONTO_FUNCIONARIO",
    ["funcionario_ref", "data", "entrada", "saida", "intervalo", "horas", "observacoes"],
    {
      funcionario_ref: ["funcionario", "nome", "colaborador"],
      data: ["data", "dia"],
      entrada: ["entrada", "entrou", "inicio"],
      saida: ["saida", "saiu", "fim"],
      intervalo: ["intervalo", "pausa", "almoco"],
      horas: ["horas", "total horas", "total_horas"],
      observacoes: ["obs", "observacao", "observacoes"]
    },
    ["entrada", "saida", "horas", "intervalo"],
    ["funcionario_ref", "data"]
  ),
  SAUDE_SANITARIO: schema(
    "SAUDE_SANITARIO",
    "EVENTO_SANITARIO",
    ["animal_ref", "evento", "produto", "dose", "data", "sintomas", "responsavel", "observacoes"],
    {
      animal_ref: ["animal", "vaca", "codigo", "cod", "brinco", "animal_ref"],
      evento: ["evento", "tipo", "procedimento"],
      produto: ["vacina", "medicamento", "remedio", "produto"],
      dose: ["dose", "quantidade"],
      data: ["data", "dia"],
      sintomas: ["sintomas", "problema", "doenca"],
      responsavel: ["responsavel", "aplicador"],
      observacoes: ["obs", "observacao", "observacoes", "nota"]
    },
    ["evento", "produto", "dose", "sintomas", "responsavel"],
    ["animal_ref"]
  ),
  OBSERVACOES: schema(
    "OBSERVACOES",
    "OBSERVACAO",
    ["entidade_ref", "tipo_entidade", "observacao", "data", "categoria"],
    {
      entidade_ref: ["animal", "vaca", "item", "funcionario", "lote"],
      tipo_entidade: ["tipo entidade", "tipo_entidade"],
      observacao: ["observacao", "obs", "nota", "comentario"],
      data: ["data", "dia"],
      categoria: ["tipo", "categoria"]
    },
    ["observacao"],
    ["observacao"]
  ),
  AGENDA_TAREFAS: schema(
    "AGENDA_TAREFAS",
    "ORDEM_SERVICO",
    ["titulo", "data", "horario", "responsavel", "categoria", "recorrencia", "observacoes"],
    {
      titulo: ["tarefa", "titulo", "atividade", "compromisso"],
      data: ["data", "dia", "quando"],
      horario: ["hora", "horario"],
      responsavel: ["responsavel", "funcionario"],
      categoria: ["categoria", "tipo"],
      recorrencia: ["recorrencia", "repetir"],
      observacoes: ["obs", "observacao", "observacoes", "nota"]
    },
    ["titulo", "responsavel", "recorrencia", "horario"],
    ["titulo"]
  )
};

function normalizedAliasMap(schema: TabularDomainSchema) {
  const map = new Map<string, string>();
  for (const [field, aliases] of Object.entries(schema.aliases)) {
    for (const alias of aliases) map.set(compactHeader(alias), field);
  }
  return map;
}

export function mapColumnsForDomain(headers: string[], schema: TabularDomainSchema) {
  const aliases = normalizedAliasMap(schema);
  const mapping: Record<string, number> = {};
  const normalizedHeaders = headers.map(compactHeader);

  normalizedHeaders.forEach((header, index) => {
    const direct = aliases.get(header);
    if (direct && mapping[direct] === undefined) {
      mapping[direct] = index;
      return;
    }

    for (const [alias, field] of Array.from(aliases.entries())) {
      if (!alias || mapping[field] !== undefined) continue;
      if (header === alias || header.includes(alias) || alias.includes(header)) {
        mapping[field] = index;
        return;
      }
    }
  });

  return mapping;
}

function sampleText(sampleRows?: string[][]) {
  return normalizeToken((sampleRows || []).flat().join(" "));
}

function hasField(mapping: Record<string, number>, field: string) {
  return mapping[field] !== undefined;
}

function domainBonus(domain: KnownTabularTableDomain, mapping: Record<string, number>, sample: string) {
  let score = 0;
  const has = (field: string) => hasField(mapping, field);

  if (domain === "PRODUCAO_LEITE" && has("animal_ref") && has("litros")) score += 5;
  if (domain === "PRODUCAO_LEITE" && /\b(?:litros?|leite|ordenha)\b/.test(sample)) score += 3;

  if (domain === "ESTOQUE" && has("item") && has("quantidade")) score += 5;
  if (domain === "ESTOQUE" && /\b(?:racao|sal mineral|entrada|saida|estoque|insumo|kg|saco)\b/.test(sample)) score += 3;

  if (domain === "FINANCEIRO" && has("valor") && (has("descricao") || has("tipo"))) score += 5;
  if (domain === "FINANCEIRO" && /\b(?:receita|despesa|energia|venda|pagamento|pix|dinheiro)\b/.test(sample)) score += 3;

  if (domain === "FUNCIONARIOS" && has("nome") && (has("cargo") || has("telefone") || has("salario"))) score += 5;
  if (domain === "FUNCIONARIOS" && /\b(?:vaqueiro|ordenha|salario|funcionario|colaborador)\b/.test(sample)) score += 3;

  if (domain === "PONTO_FUNCIONARIO" && has("funcionario_ref") && has("entrada") && has("saida")) score += 5;
  if (domain === "PONTO_FUNCIONARIO" && /\b\d{1,2}:\d{2}\b/.test(sample)) score += 2;

  if (domain === "LOTES" && has("nome") && (has("capacidade") || has("area"))) score += 5;
  if (domain === "LOTES" && /\b(?:piquete|lote|lactacao|ha|hectare)\b/.test(sample)) score += 3;

  if (domain === "GENEALOGIA" && (has("pai_ref") || has("mae_ref")) && (has("animal_ref") || has("filho_ref") || has("cria_codigo"))) score += 5;
  if (domain === "GENEALOGIA" && /\b(?:pai|mae|matriz|touro|cria|bezerro|bezerra)\b/.test(sample)) score += 2;

  if (domain === "REPRODUCAO" && has("animal_ref") && has("evento") && has("data")) score += 5;
  if (domain === "REPRODUCAO" && /\b(?:inseminacao|pariu|parto|prenhez|prenha|pre parto|pre-parto|cio|aborto|iatf)\b/.test(sample)) score += 4;

  if (domain === "SAUDE_SANITARIO" && has("animal_ref") && (has("produto") || has("dose") || has("sintomas"))) score += 5;
  if (domain === "SAUDE_SANITARIO" && /\b(?:vacina|medicacao|antibiotico|brucelose|aftosa|dose|doenca|mancando|sintoma)\b/.test(sample)) score += 4;

  if (domain === "OBSERVACOES" && has("observacao")) score += 4;
  if (domain === "OBSERVACOES" && /\b(?:nao comeu|mancando|observacao|nota|comentario)\b/.test(sample)) score += 2;

  if (domain === "AGENDA_TAREFAS" && has("titulo") && has("data")) score += 4;
  if (domain === "AGENDA_TAREFAS" && /\b(?:vacinar|comprar|tarefa|compromisso|agenda|repetir)\b/.test(sample)) score += 3;

  return score;
}

function scoreDomain(schema: TabularDomainSchema, headers: string[], sampleRows?: string[][]) {
  const mapping = mapColumnsForDomain(headers, schema);
  const mappedFields = Object.keys(mapping);
  if (!mappedFields.length) return { score: 0, mapping };

  const strong = mappedFields.filter((field) => schema.strongFields.includes(field)).length;
  const required = schema.requiredFields.filter((field) => hasField(mapping, field)).length;
  const missingRequired = schema.requiredFields.length - required;
  let score = mappedFields.length * 2 + strong * 3 + required * 2;
  score += domainBonus(schema.domain, mapping, sampleText(sampleRows));
  score -= missingRequired * 2;

  return { score: Math.max(0, score), mapping };
}

function defaultUnknownQuestion() {
  return [
    "Li a tabela, mas nao consegui identificar com seguranca a qual area ela pertence. Ela e sobre:",
    "1 - Rebanho/animais",
    "2 - Lotes",
    "3 - Genealogia",
    "4 - Reproducao",
    "5 - Producao de leite",
    "6 - Estoque",
    "7 - Financeiro/transacoes",
    "8 - Funcionarios",
    "9 - Ponto/folha",
    "10 - Saude/sanitario",
    "11 - Observacoes",
    "12 - Agenda/tarefas"
  ].join("\n");
}

function ambiguousQuestion(text: string) {
  return text || defaultUnknownQuestion();
}

function explicitAmbiguity(headers: string[], sampleRows?: string[][]) {
  const normalized = headers.map(compactHeader);
  const sample = sampleText(sampleRows);
  const has = (pattern: RegExp) => normalized.some((header) => pattern.test(header));

  if (
    has(/^(?:animal|vaca|codigo|cod|brinco)$/)
    && has(/^(?:tipo|evento|procedimento)$/)
    && has(/^data$/)
    && /\bprotocolo\b/.test(sample)
    && !/\b(?:inseminacao|inseminada|parto|pariu|pre parto|pre-parto|cio|prenhez|diagnostico)\b/.test(sample)
  ) {
    return "Entendi a tabela, mas o tipo 'protocolo' pode ser reproducao, saude ou observacao. Como voce quer registrar?";
  }

  if (has(/^(?:animal|vaca|codigo|cod|brinco)$/) && has(/^(?:tipo|evento)$/) && has(/^data$/) && has(/^(?:sexo|categoria)$/)) {
    return "Entendi a tabela, mas ela mistura campos de cadastro e evento. Voce quer cadastrar animais, registrar reproducao ou revisar como genealogia?";
  }

  if (has(/^nome$/) && has(/^valor$/) && has(/^data$/)) {
    return "Entendi a tabela, mas nome, valor e data podem ser financeiro, funcionario/salario ou estoque. Como voce quer registrar?";
  }

  return "";
}

export function classifyStructuredTableDomain(input: ClassifyStructuredTableDomainInput): StructuredTableDomainClassification {
  const headers = input.headers.map((header) => String(header || ""));
  const allowed = new Set(input.allowedDomains || TABULAR_TABLE_DOMAINS);
  const schemas = { ...TABULAR_DOMAIN_SCHEMAS, ...(input.domainSchemas || {}) };
  const ambiguity = explicitAmbiguity(headers, input.sampleRows);

  if (ambiguity) {
    return {
      domain: "DESCONHECIDO",
      confidence: 0.35,
      intentPerRow: null,
      columnMapping: {},
      defaultFields: {},
      needsUserClarification: true,
      clarificationQuestion: ambiguousQuestion(ambiguity),
      warnings: ["ambiguous_table_domain"],
      candidateDomains: []
    };
  }

  const candidates = (Object.values(schemas) as TabularDomainSchema[])
    .filter((item) => allowed.has(item.domain))
    .map((schemaItem) => {
      const scored = scoreDomain(schemaItem, headers, input.sampleRows);
      return { domain: schemaItem.domain, score: scored.score, mapping: scored.mapping, schema: schemaItem };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  const best = candidates[0];
  const second = candidates[1];
  const isLowConfidence = !best || best.score < 5;
  const isClose = Boolean(best && second && best.score - second.score < 3 && best.score < 14);

  if (isLowConfidence || isClose || !allowed.has(best?.domain || "DESCONHECIDO")) {
    return {
      domain: "DESCONHECIDO",
      confidence: isClose ? 0.48 : 0.35,
      intentPerRow: null,
      columnMapping: {},
      defaultFields: {},
      needsUserClarification: true,
      clarificationQuestion: defaultUnknownQuestion(),
      warnings: [isClose ? "ambiguous_table_domain" : "unknown_table_domain"],
      candidateDomains: candidates.slice(0, 3).map((item) => ({ domain: item.domain, score: item.score }))
    };
  }

  const denominator = best.score + (second?.score || 0) + 4;
  const confidence = Math.max(0.55, Math.min(0.98, best.score / denominator + 0.45));

  return {
    domain: best.domain,
    confidence: Number(confidence.toFixed(2)),
    intentPerRow: best.schema.intentPerRow,
    columnMapping: best.mapping,
    defaultFields: {},
    needsUserClarification: false,
    clarificationQuestion: null,
    warnings: [],
    candidateDomains: candidates.slice(0, 3).map((item) => ({ domain: item.domain, score: item.score }))
  };
}

export function tabularDomainLabel(domain: TabularTableDomain) {
  const labels: Record<TabularTableDomain, string> = {
    REBANHO_ANIMAIS: "rebanho/animais",
    LOTES: "lotes",
    GENEALOGIA: "genealogia",
    REPRODUCAO: "reproducao",
    PRODUCAO_LEITE: "producao de leite",
    ESTOQUE: "estoque",
    FINANCEIRO: "financeiro/transacoes",
    FUNCIONARIOS: "funcionarios",
    PONTO_FUNCIONARIO: "ponto/folha",
    SAUDE_SANITARIO: "saude/sanitario",
    OBSERVACOES: "observacoes",
    AGENDA_TAREFAS: "agenda/tarefas",
    DESCONHECIDO: "desconhecido"
  };
  return labels[domain];
}

export function domainFromUserChoice(value: string): KnownTabularTableDomain | null {
  const command = normalizeToken(value);
  const byNumber: Record<string, KnownTabularTableDomain> = {
    "1": "REBANHO_ANIMAIS",
    "2": "LOTES",
    "3": "GENEALOGIA",
    "4": "REPRODUCAO",
    "5": "PRODUCAO_LEITE",
    "6": "ESTOQUE",
    "7": "FINANCEIRO",
    "8": "FUNCIONARIOS",
    "9": "PONTO_FUNCIONARIO",
    "10": "SAUDE_SANITARIO",
    "11": "OBSERVACOES",
    "12": "AGENDA_TAREFAS"
  };
  if (byNumber[command]) return byNumber[command];
  if (/\b(?:rebanho|animal|animais|gado)\b/.test(command)) return "REBANHO_ANIMAIS";
  if (/\b(?:lote|lotes|piquete|piquetes|grupo)\b/.test(command)) return "LOTES";
  if (/\b(?:genealogia|pai|mae|linhagem)\b/.test(command)) return "GENEALOGIA";
  if (/\b(?:reproducao|inseminacao|parto|prenhez|cio)\b/.test(command)) return "REPRODUCAO";
  if (/\b(?:producao|leite|ordenha)\b/.test(command)) return "PRODUCAO_LEITE";
  if (/\b(?:estoque|insumo|produto|material)\b/.test(command)) return "ESTOQUE";
  if (/\b(?:financeiro|financas|transacao|receita|despesa)\b/.test(command)) return "FINANCEIRO";
  if (/\b(?:funcionario|funcionarios|colaborador)\b/.test(command)) return "FUNCIONARIOS";
  if (/\b(?:ponto|folha|horas)\b/.test(command)) return "PONTO_FUNCIONARIO";
  if (/\b(?:saude|sanitario|vacina|medicamento|doenca)\b/.test(command)) return "SAUDE_SANITARIO";
  if (/\b(?:observacao|observacoes|nota)\b/.test(command)) return "OBSERVACOES";
  if (/\b(?:agenda|tarefa|tarefas|compromisso)\b/.test(command)) return "AGENDA_TAREFAS";
  return null;
}
