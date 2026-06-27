import { TABLES } from "@/lib/tables";

export type DomainAction = "query" | "create" | "update" | "import_table";
export type DomainFieldType = "string" | "number" | "date" | "datetime" | "enum" | "relation" | "boolean";

export type DomainFieldDefinition = {
  type: DomainFieldType;
  label?: string;
  sourceField?: string;
  relationDomain?: string;
  enumValues?: readonly string[];
};

export type DomainManifestEntry = {
  domain: string;
  label: string;
  tableName?: string;
  sourceName?: string;
  allowedActions: readonly DomainAction[];
  fields: Record<string, DomainFieldDefinition>;
  requiredFieldsByAction: Partial<Record<DomainAction, readonly string[]>>;
  searchableFields: readonly string[];
  aggregatableFields: readonly string[];
  dateFields: readonly string[];
  relationFields: readonly string[];
  enumFields: Record<string, readonly string[]>;
  maxLimit: number;
};

export type DomainManifest = Record<string, DomainManifestEntry>;

function field(type: DomainFieldType, options: Omit<DomainFieldDefinition, "type"> = {}): DomainFieldDefinition {
  return { type, ...options };
}

const allActions = ["query", "create", "update", "import_table"] as const;
const queryCreateImport = ["query", "create", "import_table"] as const;
const queryCreateUpdateImport = ["query", "create", "update", "import_table"] as const;
const queryCreate = ["query", "create"] as const;

export const RANCHO_DOMAIN_MANIFEST = {
  animais: {
    domain: "animais",
    label: "Animais",
    tableName: TABLES.animais,
    allowedActions: allActions,
    fields: {
      animal_ref: field("relation", { relationDomain: "animais" }),
      brinco: field("string"),
      nome: field("string"),
      categoria: field("enum", { enumValues: ["vaca", "boi", "bezerro", "bezerra", "novilha", "touro", "outro"] }),
      sexo: field("enum", { enumValues: ["femea", "macho", "nao_informado"] }),
      fase: field("enum", { enumValues: ["lactacao", "seca", "gestante", "vazia", "crescimento", "engorda", "nao_aplicavel"] }),
      raca: field("string"),
      lote_id: field("relation", { relationDomain: "lotes" }),
      lote_ref: field("relation", { relationDomain: "lotes", sourceField: "lote_id" }),
      data_nascimento: field("date"),
      data: field("date"),
      data_evento: field("datetime"),
      peso: field("number"),
      status: field("enum", { enumValues: ["ativo", "vendido", "morto", "inativo"] }),
      observacoes: field("string"),
      pai_ref: field("relation", { relationDomain: "animais", sourceField: "pai_id" }),
      mae_ref: field("relation", { relationDomain: "animais", sourceField: "mae_id" })
    },
    requiredFieldsByAction: {
      create: ["brinco", "categoria"],
      update: ["animal_ref"],
      import_table: ["brinco"]
    },
    searchableFields: ["animal_ref", "brinco", "nome", "categoria", "sexo", "fase", "raca", "status", "observacoes"],
    aggregatableFields: ["peso"],
    dateFields: ["data_nascimento", "data", "data_evento"],
    relationFields: ["animal_ref", "lote_id", "lote_ref", "pai_ref", "mae_ref"],
    enumFields: {
      categoria: ["vaca", "boi", "bezerro", "bezerra", "novilha", "touro", "outro"],
      sexo: ["femea", "macho", "nao_informado"],
      fase: ["lactacao", "seca", "gestante", "vazia", "crescimento", "engorda", "nao_aplicavel"],
      status: ["ativo", "vendido", "morto", "inativo"]
    },
    maxLimit: 500
  },
  lotes: {
    domain: "lotes",
    label: "Lotes",
    tableName: TABLES.lotes,
    allowedActions: allActions,
    fields: {
      nome: field("string"),
      tipo: field("string"),
      capacidade: field("number"),
      area: field("number"),
      unidade_area: field("string"),
      descricao: field("string"),
      observacoes: field("string", { sourceField: "descricao" }),
      ativo: field("boolean"),
      status: field("boolean", { sourceField: "ativo" })
    },
    requiredFieldsByAction: {
      create: ["nome"],
      update: ["nome"],
      import_table: ["nome"]
    },
    searchableFields: ["nome", "descricao"],
    aggregatableFields: [],
    dateFields: [],
    relationFields: [],
    enumFields: {},
    maxLimit: 300
  },
  genealogia: {
    domain: "genealogia",
    label: "Genealogia",
    sourceName: `${TABLES.animais}+${TABLES.eventosAnimal}`,
    allowedActions: allActions,
    fields: {
      animal_ref: field("relation", { relationDomain: "animais" }),
      pai_ref: field("relation", { relationDomain: "animais" }),
      mae_ref: field("relation", { relationDomain: "animais" }),
      filho_ref: field("relation", { relationDomain: "animais" }),
      cria_codigo: field("string"),
      cria_nome: field("string"),
      sexo_cria: field("enum", { enumValues: ["femea", "macho", "nao_informado"] }),
      data_nascimento: field("date"),
      data_parto: field("date"),
      observacoes: field("string")
    },
    requiredFieldsByAction: {
      update: ["animal_ref"],
      import_table: []
    },
    searchableFields: ["animal_ref", "pai_ref", "mae_ref", "filho_ref", "cria_codigo", "cria_nome", "observacoes"],
    aggregatableFields: [],
    dateFields: ["data_nascimento", "data_parto"],
    relationFields: ["animal_ref", "pai_ref", "mae_ref", "filho_ref"],
    enumFields: {
      sexo_cria: ["femea", "macho", "nao_informado"]
    },
    maxLimit: 300
  },
  reproducao: {
    domain: "reproducao",
    label: "Reproducao",
    tableName: TABLES.eventosAnimal,
    allowedActions: queryCreateUpdateImport,
    fields: {
      animal_ref: field("relation", { relationDomain: "animais", sourceField: "animal_id" }),
      animal_id: field("relation", { relationDomain: "animais" }),
      evento: field("enum", { sourceField: "tipo", enumValues: ["parto", "inseminacao", "pre_parto", "cio", "prenhez", "aborto", "em_protocolo", "em_reteste", "observacao"] }),
      tipo: field("enum", { enumValues: ["parto", "inseminacao", "pre_parto", "cio", "prenhez", "aborto", "em_protocolo", "em_reteste", "observacao"] }),
      status_reprodutivo: field("enum", { enumValues: ["prenhe", "inseminada", "pre_parto", "cio", "vazia", "parida", "em_protocolo", "em_reteste"] }),
      categoria: field("enum", { enumValues: ["vaca", "boi", "touro", "bezerro", "bezerra", "novilha"] }),
      data: field("date", { sourceField: "data_evento" }),
      data_evento: field("datetime"),
      mae_ref: field("relation", { relationDomain: "animais", sourceField: "animal_id" }),
      pai_ref: field("relation", { relationDomain: "animais" }),
      resultado: field("string"),
      cria_ref: field("relation", { relationDomain: "animais" }),
      cria_codigo: field("string"),
      cria_nome: field("string"),
      cria_sexo: field("enum", { enumValues: ["femea", "macho", "nao_informado"] }),
      sexo_cria: field("enum", { enumValues: ["femea", "macho", "nao_informado"] }),
      descricao: field("string"),
      observacoes: field("string"),
      custo: field("number")
    },
    requiredFieldsByAction: {
      create: ["animal_ref", "evento"],
      update: ["animal_ref"],
      import_table: ["animal_ref", "evento"]
    },
    searchableFields: ["animal_ref", "mae_ref", "evento", "tipo", "status_reprodutivo", "categoria", "resultado", "cria_ref", "cria_codigo", "cria_nome", "descricao", "observacoes"],
    aggregatableFields: ["custo"],
    dateFields: ["data", "data_evento"],
    relationFields: ["animal_ref", "animal_id", "mae_ref", "pai_ref", "cria_ref"],
    enumFields: {
      evento: ["parto", "inseminacao", "pre_parto", "cio", "prenhez", "aborto", "em_protocolo", "em_reteste", "observacao"],
      tipo: ["parto", "inseminacao", "pre_parto", "cio", "prenhez", "aborto", "em_protocolo", "em_reteste", "observacao"],
      status_reprodutivo: ["prenhe", "inseminada", "pre_parto", "cio", "vazia", "parida", "em_protocolo", "em_reteste"],
      categoria: ["vaca", "boi", "touro", "bezerro", "bezerra", "novilha"],
      cria_sexo: ["femea", "macho", "nao_informado"],
      sexo_cria: ["femea", "macho", "nao_informado"]
    },
    maxLimit: 500
  },
  producao_leite: {
    domain: "producao_leite",
    label: "Producao de leite",
    tableName: TABLES.ordenhas,
    allowedActions: queryCreateImport,
    fields: {
      animal_ref: field("relation", { relationDomain: "animais", sourceField: "animal_id" }),
      animal_id: field("relation", { relationDomain: "animais" }),
      litros: field("number"),
      data: field("date", { sourceField: "ordenhado_em" }),
      hora: field("string"),
      ordenhado_em: field("datetime"),
      turno: field("enum", { enumValues: ["manha", "tarde", "noite"] }),
      destino: field("enum", { enumValues: ["tanque", "venda", "consumo", "descarte"] }),
      observacoes: field("string")
    },
    requiredFieldsByAction: {
      create: ["animal_ref", "litros"],
      import_table: ["animal_ref", "litros", "data"]
    },
    searchableFields: ["animal_ref", "turno", "destino", "observacoes"],
    aggregatableFields: ["litros"],
    dateFields: ["data", "ordenhado_em"],
    relationFields: ["animal_ref", "animal_id"],
    enumFields: {
      turno: ["manha", "tarde", "noite"],
      destino: ["tanque", "venda", "consumo", "descarte"]
    },
    maxLimit: 500
  },
  estoque: {
    domain: "estoque",
    label: "Estoque",
    sourceName: `${TABLES.estoqueItens}+${TABLES.estoqueMovimentacoes}`,
    allowedActions: allActions,
    fields: {
      item: field("string", { sourceField: "nome" }),
      item_ref: field("relation", { relationDomain: "estoque", sourceField: "item_id" }),
      nome: field("string"),
      categoria: field("enum", { enumValues: ["racao", "medicamento", "insumo", "equipamento", "outro"] }),
      quantidade: field("number"),
      quantidade_atual: field("number"),
      quantidade_minima: field("number"),
      unidade: field("string", { sourceField: "unidade_medida" }),
      unidade_medida: field("string"),
      tipo_movimento: field("enum", { sourceField: "tipo", enumValues: ["entrada", "saida"] }),
      tipo: field("enum", { enumValues: ["entrada", "saida"] }),
      valor_total: field("number"),
      valor_unitario: field("number"),
      gera_financeiro: field("boolean"),
      data: field("date"),
      fornecedor: field("string"),
      destino: field("string"),
      observacoes: field("string"),
      motivo: field("string"),
      ativo: field("boolean")
    },
    requiredFieldsByAction: {
      create: ["item", "quantidade"],
      update: ["item_ref"],
      import_table: ["item", "quantidade"]
    },
    searchableFields: ["item", "nome", "categoria", "unidade", "fornecedor", "destino", "observacoes", "motivo"],
    aggregatableFields: ["quantidade", "quantidade_atual", "quantidade_minima", "valor_total", "valor_unitario"],
    dateFields: ["data"],
    relationFields: ["item_ref"],
    enumFields: {
      categoria: ["racao", "medicamento", "insumo", "equipamento", "outro"],
      tipo_movimento: ["entrada", "saida"],
      tipo: ["entrada", "saida"]
    },
    maxLimit: 500
  },
  financeiro: {
    domain: "financeiro",
    label: "Financeiro",
    tableName: TABLES.transacoesFinanceiras,
    allowedActions: ["query", "create", "import_table"],
    fields: {
      descricao: field("string"),
      tipo: field("enum", { enumValues: ["receita", "despesa", "entrada", "saida"] }),
      valor: field("number"),
      data: field("date", { sourceField: "data_transacao" }),
      data_transacao: field("date"),
      categoria: field("string"),
      metodo_pagamento: field("string"),
      forma_pagamento: field("string", { sourceField: "metodo_pagamento" }),
      pessoa: field("string"),
      observacoes: field("string")
    },
    requiredFieldsByAction: {
      create: ["tipo", "valor", "categoria"],
      import_table: ["valor"]
    },
    searchableFields: ["descricao", "tipo", "categoria", "metodo_pagamento", "forma_pagamento", "pessoa", "observacoes"],
    aggregatableFields: ["valor"],
    dateFields: ["data", "data_transacao"],
    relationFields: [],
    enumFields: {
      tipo: ["receita", "despesa", "entrada", "saida"]
    },
    maxLimit: 500
  },
  funcionarios: {
    domain: "funcionarios",
    label: "Funcionarios",
    tableName: TABLES.funcionarios,
    allowedActions: allActions,
    fields: {
      funcionario_ref: field("relation", { relationDomain: "funcionarios" }),
      nome: field("string"),
      funcao: field("string"),
      cargo: field("string", { sourceField: "funcao" }),
      cpf: field("string"),
      salario_base: field("number"),
      salario: field("number", { sourceField: "salario_base" }),
      data_admissao: field("date"),
      contato_whatsapp: field("string"),
      telefone: field("string", { sourceField: "contato_whatsapp" }),
      carga_horaria_mensal: field("number"),
      valor_hora_extra: field("number"),
      ativo: field("boolean"),
      status: field("enum", { sourceField: "ativo", enumValues: ["ativo", "inativo"] }),
      observacoes: field("string")
    },
    requiredFieldsByAction: {
      create: ["nome", "funcao", "contato_whatsapp", "data_admissao"],
      update: ["funcionario_ref"],
      import_table: ["nome"]
    },
    searchableFields: ["funcionario_ref", "nome", "funcao", "cargo", "cpf", "contato_whatsapp", "telefone", "status", "observacoes"],
    aggregatableFields: ["salario_base", "salario", "carga_horaria_mensal", "valor_hora_extra"],
    dateFields: ["data_admissao"],
    relationFields: ["funcionario_ref"],
    enumFields: {
      status: ["ativo", "inativo"]
    },
    maxLimit: 300
  },
  ponto_funcionario: {
    domain: "ponto_funcionario",
    label: "Ponto de funcionario",
    tableName: TABLES.registrosPonto,
    allowedActions: queryCreateImport,
    fields: {
      funcionario_ref: field("relation", { relationDomain: "funcionarios", sourceField: "funcionario_id" }),
      funcionario_id: field("relation", { relationDomain: "funcionarios" }),
      tipo: field("enum", { enumValues: ["entrada", "saida"] }),
      data: field("date", { sourceField: "registrado_em" }),
      registrado_em: field("datetime"),
      entrada: field("datetime"),
      saida: field("datetime"),
      intervalo: field("number"),
      horas: field("number"),
      observacao: field("string"),
      observacoes: field("string", { sourceField: "observacao" })
    },
    requiredFieldsByAction: {
      create: ["funcionario_ref", "tipo"],
      import_table: ["funcionario_ref", "data"]
    },
    searchableFields: ["funcionario_ref", "tipo", "observacao", "observacoes"],
    aggregatableFields: ["intervalo", "horas"],
    dateFields: ["data", "registrado_em", "entrada", "saida"],
    relationFields: ["funcionario_ref", "funcionario_id"],
    enumFields: {
      tipo: ["entrada", "saida"]
    },
    maxLimit: 500
  },
  saude_sanitario: {
    domain: "saude_sanitario",
    label: "Saude e sanitario",
    tableName: TABLES.eventosAnimal,
    allowedActions: queryCreateUpdateImport,
    fields: {
      animal_ref: field("relation", { relationDomain: "animais", sourceField: "animal_id" }),
      lote_ref: field("relation", { relationDomain: "lotes" }),
      evento: field("enum", { sourceField: "tipo", enumValues: ["vacina", "doenca", "tratamento", "medicamento", "observacao", "morte"] }),
      tipo: field("enum", { sourceField: "tipo", enumValues: ["vacina", "doenca", "tratamento", "medicamento", "observacao", "morte"] }),
      item: field("string", { sourceField: "medicamento" }),
      quantidade: field("number"),
      unidade: field("string"),
      produto: field("string", { sourceField: "medicamento" }),
      medicamento: field("string"),
      dose: field("string"),
      data: field("date", { sourceField: "data_evento" }),
      data_evento: field("datetime"),
      sintomas: field("string"),
      responsavel: field("string"),
      observacoes: field("string", { sourceField: "descricao" }),
      descricao: field("string"),
      custo: field("number")
    },
    requiredFieldsByAction: {
      create: ["animal_ref", "evento"],
      update: ["animal_ref"],
      import_table: ["animal_ref", "evento"]
    },
    searchableFields: ["animal_ref", "evento", "produto", "medicamento", "dose", "sintomas", "responsavel", "observacoes", "descricao"],
    aggregatableFields: ["custo"],
    dateFields: ["data", "data_evento"],
    relationFields: ["animal_ref", "lote_ref"],
    enumFields: {
      evento: ["vacina", "doenca", "tratamento", "medicamento", "observacao", "morte"],
      tipo: ["vacina", "doenca", "tratamento", "medicamento", "observacao", "morte"]
    },
    maxLimit: 500
  },
  observacoes: {
    domain: "observacoes",
    label: "Observacoes",
    sourceName: TABLES.eventosAnimal,
    allowedActions: queryCreateUpdateImport,
    fields: {
      entidade_ref: field("relation"),
      tipo_entidade: field("enum", { enumValues: ["animal", "lote", "estoque", "funcionario", "fazenda"] }),
      animal_ref: field("relation", { relationDomain: "animais" }),
      item_ref: field("relation", { relationDomain: "estoque" }),
      funcionario_ref: field("relation", { relationDomain: "funcionarios" }),
      lote_ref: field("relation", { relationDomain: "lotes" }),
      observacao: field("string"),
      observacoes: field("string", { sourceField: "observacao" }),
      data: field("date"),
      categoria: field("string")
    },
    requiredFieldsByAction: {
      create: ["observacao"],
      update: ["entidade_ref"],
      import_table: ["observacao"]
    },
    searchableFields: ["entidade_ref", "tipo_entidade", "animal_ref", "item_ref", "funcionario_ref", "lote_ref", "observacao", "observacoes", "categoria"],
    aggregatableFields: [],
    dateFields: ["data"],
    relationFields: ["entidade_ref", "animal_ref", "item_ref", "funcionario_ref", "lote_ref"],
    enumFields: {
      tipo_entidade: ["animal", "lote", "estoque", "funcionario", "fazenda"]
    },
    maxLimit: 500
  },
  agenda_tarefas: {
    domain: "agenda_tarefas",
    label: "Agenda e tarefas",
    sourceName: TABLES.notificacoes,
    allowedActions: queryCreateImport,
    fields: {
      titulo: field("string"),
      tarefa: field("string", { sourceField: "titulo" }),
      data: field("date"),
      horario: field("datetime"),
      responsavel: field("relation", { relationDomain: "funcionarios" }),
      categoria: field("string"),
      recorrencia: field("string"),
      observacoes: field("string")
    },
    requiredFieldsByAction: {
      create: ["titulo"],
      import_table: ["titulo"]
    },
    searchableFields: ["titulo", "tarefa", "responsavel", "categoria", "recorrencia", "observacoes"],
    aggregatableFields: [],
    dateFields: ["data", "horario"],
    relationFields: ["responsavel"],
    enumFields: {},
    maxLimit: 300
  }
} as const satisfies DomainManifest;

export type RanchoActionPlanDomain = keyof typeof RANCHO_DOMAIN_MANIFEST;

export const RANCHO_ACTION_PLAN_DOMAINS = Object.keys(RANCHO_DOMAIN_MANIFEST) as RanchoActionPlanDomain[];

export function getDomainManifest(domain: string, manifest: DomainManifest = RANCHO_DOMAIN_MANIFEST) {
  return manifest[domain] || null;
}

export function summarizeDomainManifestForPrompt(manifest: DomainManifest = RANCHO_DOMAIN_MANIFEST) {
  return Object.fromEntries(
    Object.entries(manifest).map(([domain, entry]) => [
      domain,
      {
        label: entry.label,
        source: entry.tableName || entry.sourceName,
        allowedActions: entry.allowedActions,
        fields: Object.fromEntries(
          Object.entries(entry.fields).map(([fieldName, definition]) => [
            fieldName,
            definition.enumValues?.length
              ? { type: definition.type, enumValues: definition.enumValues }
              : { type: definition.type }
          ])
        ),
        requiredFieldsByAction: entry.requiredFieldsByAction,
        searchableFields: entry.searchableFields,
        aggregatableFields: entry.aggregatableFields,
        dateFields: entry.dateFields,
        relationFields: entry.relationFields,
        maxLimit: entry.maxLimit
      }
    ])
  );
}
