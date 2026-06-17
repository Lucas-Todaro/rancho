import { GEMINI_ALLOWED_INTENTS, type GeminiAllowedIntent } from "@/lib/whatsapp/gemini/allowed-intents";

export type GeminiIntentSchema = {
  required: string[];
  optional: string[];
};

const COMMON_OPTIONAL = ["data", "horario", "observacoes", "descricao"];

export const GEMINI_INTENT_SCHEMAS: Record<GeminiAllowedIntent, GeminiIntentSchema> = {
  PRODUCAO_LEITE: {
    required: ["animal_ref", "litros"],
    optional: ["data", "horario", "observacoes", "adicionar_ao_estoque"]
  },
  LOTE_REGISTROS: {
    required: ["actions"],
    optional: ["observacoes"]
  },
  LOTE_ACOES: {
    required: ["actions"],
    optional: ["observacoes"]
  },
  ESTOQUE_ENTRADA: {
    required: ["item", "quantidade"],
    optional: ["unidade", "valor_total", "data", "observacoes", "fornecedor"]
  },
  ESTOQUE_SAIDA: {
    required: ["item", "quantidade"],
    optional: ["unidade", "motivo", "data", "observacoes"]
  },
  CRIAR_ITEM_ESTOQUE: {
    required: ["item", "unidade"],
    optional: ["quantidade", "quantidade_minima", "valor_unitario", "categoria", "fornecedor", "observacoes"]
  },
  ESTOQUE_CADASTRO: {
    required: ["item", "unidade"],
    optional: ["quantidade", "quantidade_minima", "valor_unitario", "categoria", "fornecedor", "observacoes"]
  },
  COMPRA_ESTOQUE_FINANCEIRO: {
    required: ["item", "quantidade"],
    optional: ["unidade", "valor_total", "fornecedor", "data", "observacoes"]
  },
  VENDA: {
    required: ["item", "quantidade"],
    optional: ["unidade", "valor_total", "comprador", "data", "observacoes"]
  },
  FINANCEIRO_RECEITA: {
    required: ["valor", "descricao"],
    optional: ["categoria", "data", "forma_pagamento", "observacoes"]
  },
  FINANCEIRO_DESPESA: {
    required: ["valor", "descricao"],
    optional: ["categoria", "data", "forma_pagamento", "observacoes"]
  },
  DESPESA: {
    required: ["valor", "descricao"],
    optional: ["categoria", "data", "forma_pagamento", "observacoes"]
  },
  RECEITA_VENDA: {
    required: ["valor", "descricao"],
    optional: ["categoria", "data", "forma_pagamento", "observacoes"]
  },
  CONSULTA_FINANCEIRO: {
    required: [],
    optional: ["periodo", "data", "tipo", "categoria", "descricao"]
  },
  CONSULTA_FINANCEIRO_DESPESAS: {
    required: [],
    optional: ["periodo", "data", "categoria", "descricao"]
  },
  CONSULTA_ESTOQUE: {
    required: [],
    optional: ["item", "categoria", "modo"]
  },
  CONSULTA_ESTOQUE_ITEM: {
    required: ["item"],
    optional: ["categoria"]
  },
  CONSULTA_ESTOQUE_GERAL: {
    required: [],
    optional: ["categoria", "modo"]
  },
  CONSULTA_PRODUCAO: {
    required: [],
    optional: ["periodo", "data", "animal_ref", "modo"]
  },
  CONSULTA_PRODUCAO_HOJE: {
    required: [],
    optional: ["animal_ref", "modo"]
  },
  CONSULTA_PRODUCAO_ANIMAL: {
    required: ["animal_ref"],
    optional: ["periodo", "data", "modo"]
  },
  CONSULTA_REBANHO: {
    required: [],
    optional: ["categoria", "sexo", "status", "reproducao", "lote", "lote_nome", "modo", "pagina", "sem_lote"]
  },
  CONSULTA_REGISTROS_HOJE: {
    required: [],
    optional: ["data", "periodo", "tipo", "evento", "evento_tipo", "dias"]
  },
  RELATORIO_DIA: {
    required: [],
    optional: ["data", "periodo", "tipo", "evento", "evento_tipo", "dias"]
  },
  CADASTRO_ANIMAL: {
    required: ["codigo", "categoria"],
    optional: ["nome", "sexo", "peso", "raca", "lote", "nascimento", "fase", "observacoes", "pai", "mae"]
  },
  CADASTRO_ANIMAL_EM_MASSA: {
    required: ["linhas"],
    optional: ["observacoes"]
  },
  IMPORTACAO_ANIMAIS_TABELA: {
    required: ["linhas"],
    optional: ["observacoes"]
  },
  ACAO_DESTRUTIVA_EM_MASSA: {
    required: [],
    optional: ["alvo", "blocked", "motivo", "observacoes"]
  },
  CADASTRO_FUNCIONARIO: {
    required: ["funcionario"],
    optional: ["funcao", "telefone", "cpf", "salario_base", "data_admissao", "observacoes"]
  },
  CRIAR_FUNCIONARIO: {
    required: ["funcionario"],
    optional: ["funcao", "telefone", "cpf", "salario_base", "data_admissao", "observacoes"]
  },
  PAGAMENTO_FUNCIONARIO: {
    required: ["funcionario", "valor"],
    optional: ["data", "periodo_pagamento", "pagamento_tipo", "observacoes"]
  },
  PONTO_FUNCIONARIO: {
    required: ["funcionario"],
    optional: ["tipo", "horario", "data", "observacoes", "agora"]
  },
  EVENTO_SANITARIO: {
    required: [],
    optional: ["animal_ref", "descricao_generica", "sintomas", "data", "horario", "observacoes", "gravidade"]
  },
  OBSERVACAO_ANIMAL: {
    required: [],
    optional: ["animal_ref", "descricao_generica", "sintomas", "data", "horario", "observacoes", "gravidade"]
  },
  ATUALIZACAO_ANIMAL: {
    required: ["animal_ref"],
    optional: ["campo", "valor", "data", "observacoes", "descricao_generica", "sintomas", "gravidade"]
  },
  MEDICACAO: {
    required: ["animal_ref"],
    optional: ["produto", "dose", "data", "horario", "observacoes", "custo"]
  },
  VACINA: {
    required: ["animal_ref"],
    optional: ["produto", "dose", "data", "horario", "observacoes", "custo"]
  },
  VACINA_MEDICAMENTO: {
    required: ["animal_ref"],
    optional: ["produto", "dose", "data", "horario", "observacoes", "custo"]
  },
  INSEMINACAO: {
    required: ["animal_ref", "data"],
    optional: ["observacoes", "resultado", "cria", "sexo_cria"]
  },
  PRENHEZ: {
    required: ["animal_ref", "data"],
    optional: ["observacoes", "resultado", "cria", "sexo_cria"]
  },
  PRE_PARTO: {
    required: ["animal_ref", "data"],
    optional: ["observacoes", "resultado", "cria", "sexo_cria"]
  },
  PARTO: {
    required: ["animal_ref", "data"],
    optional: ["observacoes", "resultado", "cria", "sexo_cria", "mae_ref", "data_parto", "cria_sexo", "cria_categoria", "cria_codigo", "codigo_cria", "brinco_cria", "cria_nome", "nome_cria", "pai_ref", "pai", "touro_ref"]
  },
  CIO: {
    required: ["animal_ref", "data"],
    optional: ["observacoes", "resultado", "cria", "sexo_cria"]
  },
  ABORTO: {
    required: ["animal_ref", "data"],
    optional: ["observacoes", "resultado", "cria", "sexo_cria"]
  },
  CONSULTA_ANIMAL: {
    required: ["animal_ref"],
    optional: ["periodo", "data", "tipo"]
  },
  CORRECAO: {
    required: [],
    optional: ["referencia", "campo", "valor_correto", "observacoes"]
  },
  CANCELAMENTO: {
    required: [],
    optional: ["referencia", "motivo", "observacoes"]
  },
  AJUDA: {
    required: [],
    optional: COMMON_OPTIONAL
  },
  DESCONHECIDO: {
    required: [],
    optional: COMMON_OPTIONAL
  }
};

export function schemaForGeminiIntent(intent: string) {
  return GEMINI_INTENT_SCHEMAS[intent as GeminiAllowedIntent];
}

export function allowedFieldsForGeminiIntent(intent: string) {
  const schema = schemaForGeminiIntent(intent);
  if (!schema) return new Set<string>();
  return new Set([...schema.required, ...schema.optional]);
}

export function allGeminiSchemasForPrompt() {
  return Object.fromEntries(
    GEMINI_ALLOWED_INTENTS.map((intent) => [
      intent,
      {
        required: GEMINI_INTENT_SCHEMAS[intent].required,
        optional: GEMINI_INTENT_SCHEMAS[intent].optional
      }
    ])
  );
}

