import { summarizeDomainManifestForPrompt, type DomainManifest, RANCHO_DOMAIN_MANIFEST } from "@/lib/whatsapp/gemini/domain-manifest";

export const ACTION_PLAN_PROMPT_VERSION = "rancho-gemini-action-plan-v2";

const ACTION_PLAN_FORMAT = {
  query: {
    action: "query",
    domain: "financeiro",
    confidence: 0.86,
    filters: [
      { field: "data", op: "last_months", value: 6 }
    ],
    aggregations: [
      { field: "valor", op: "sum", as: "total_valor" }
    ],
    groupBy: ["month"],
    limit: 500,
    requiresConfirmation: false
  },
  import_table: {
    action: "import_table",
    domain: "producao_leite",
    confidence: 0.9,
    table: {
      hasHeader: true,
      separator: ";",
      columnMapping: {
        animal_ref: "animal",
        litros: "litros",
        data: "data"
      },
      defaultFields: {},
      ignoredColumns: [],
      ambiguousColumns: []
    },
    requiresConfirmation: true
  },
  clarify: {
    action: "clarify",
    question: "Essa tabela parece ambigua. Voce quer importar como financeiro, estoque ou funcionarios?",
    options: ["financeiro", "estoque", "funcionarios"]
  },
  block: {
    action: "block",
    reason: "destructive_bulk_action",
    userMessage: "Nao posso montar plano para excluir dados em massa pelo WhatsApp."
  }
};

const ACTION_PLAN_QUERY_EXAMPLES = [
  {
    user: "relatório financeiro dos últimos 6 meses",
    response: {
      action: "query",
      domain: "financeiro",
      confidence: 0.94,
      filters: [
        { field: "data", op: "last_months", value: 6 }
      ],
      aggregations: [
        { field: "valor", op: "sum", as: "total" }
      ],
      groupBy: ["month"],
      limit: 100,
      requiresConfirmation: false
    }
  },
  {
    user: "quanto gastei com ração nos últimos 90 dias",
    response: {
      action: "query",
      domain: "financeiro",
      confidence: 0.94,
      filters: [
        { field: "tipo", op: "eq", value: "despesa" },
        { field: "descricao", op: "contains", value: "ração" },
        { field: "data", op: "last_days", value: 90 }
      ],
      aggregations: [
        { field: "valor", op: "sum", as: "total_gasto" }
      ],
      limit: 100,
      requiresConfirmation: false
    }
  },
  {
    user: "produção de leite da Mimosa desde janeiro",
    response: {
      action: "query",
      domain: "producao_leite",
      confidence: 0.94,
      filters: [
        { field: "animal_ref", op: "contains", value: "Mimosa" },
        { field: "data", op: "since", value: "janeiro" }
      ],
      aggregations: [
        { field: "litros", op: "sum", as: "total_litros" }
      ],
      groupBy: ["month"],
      limit: 100,
      requiresConfirmation: false
    }
  },
  {
    user: "partos dos últimos 6 meses",
    response: {
      action: "query",
      domain: "reproducao",
      confidence: 0.94,
      filters: [
        { field: "evento", op: "eq", value: "PARTO" },
        { field: "data", op: "last_months", value: 6 }
      ],
      limit: 100,
      requiresConfirmation: false
    }
  }
];

export function buildActionPlanPromptFragment(input: { manifest?: DomainManifest; currentDate?: string; timezone?: string } = {}) {
  const manifest = input.manifest || RANCHO_DOMAIN_MANIFEST;

  return [
    `ActionPlan prompt version: ${ACTION_PLAN_PROMPT_VERSION}`,
    "Voce deve retornar somente um JSON ActionPlan valido.",
    "Quando ActionPlan estiver habilitado, consultas livres, relatorios e perguntas analiticas devem usar action=query.",
    "Para consultas livres cobertas por ActionPlan, nao retorne intent legado como formato principal.",
    "Use intent/fields legado apenas se a acao ainda nao estiver coberta por ActionPlan ou se o backend exigir fluxo legado.",
    "Use apenas os dominios e campos do domain manifest abaixo.",
    "Nao invente campos, tabelas, IDs, nomes de colunas Supabase, SQL livre, filtros SQL, RLS ou service role.",
    "O Gemini nunca acessa banco, nunca executa select/insert/update/delete e nunca decide persistencia final.",
    "O Gemini so monta o plano. Numeros de relatorio, totais e saldos vem do backend local.",
    "Nunca inclua fazenda_id, rancho_id, ranch_id, client_id, tenant_id, usuario_id ou user_id no plano.",
    "Consultas usam action=query, requiresConfirmation=false, filtros seguros e limite ate maxLimit do dominio.",
    "Periodos dinamicos devem usar operadores de data: last_days, last_months, current_month, current_year ou since.",
    "Tabelas/listas devem usar action=import_table, com columnMapping no formato campo_canonico -> coluna_original.",
    "Importacoes, criacoes e atualizacoes exigem requiresConfirmation=true e serao apenas validadas/localmente confirmadas pelo backend.",
    "Nunca proponha delete. Atualizacao precisa de filtro ou identificador; atualizacao em massa deve virar block.",
    "Quando a intencao ou tabela estiver ambigua, retorne action=clarify com pergunta objetiva e opcoes.",
    "Quando o pedido for perigoso, destrutivo, pedir SQL livre ou tentar acessar escopo interno, retorne action=block.",
    "",
    "Domain manifest resumido:",
    JSON.stringify(summarizeDomainManifestForPrompt(manifest), null, 2),
    "",
    "Formatos esperados:",
    JSON.stringify(ACTION_PLAN_FORMAT, null, 2),
    "",
    "Exemplos obrigatorios de consultas ActionPlan:",
    JSON.stringify(ACTION_PLAN_QUERY_EXAMPLES, null, 2),
    "",
    `Data atual: ${input.currentDate || new Date().toISOString().slice(0, 10)}`,
    `Timezone: ${input.timezone || "America/Fortaleza"}`
  ].join("\n");
}
