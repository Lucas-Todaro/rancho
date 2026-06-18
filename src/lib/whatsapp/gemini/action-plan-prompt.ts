import { summarizeDomainManifestForPrompt, type DomainManifest, RANCHO_DOMAIN_MANIFEST } from "@/lib/whatsapp/gemini/domain-manifest";

export const ACTION_PLAN_PROMPT_VERSION = "rancho-gemini-action-plan-v1";

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

export function buildActionPlanPromptFragment(input: { manifest?: DomainManifest; currentDate?: string; timezone?: string } = {}) {
  const manifest = input.manifest || RANCHO_DOMAIN_MANIFEST;

  return [
    `ActionPlan prompt version: ${ACTION_PLAN_PROMPT_VERSION}`,
    "Voce deve retornar somente um JSON ActionPlan valido.",
    "Use apenas os dominios e campos do domain manifest abaixo.",
    "Nao invente campos, tabelas, IDs, nomes de colunas Supabase, SQL livre, filtros SQL, RLS ou service role.",
    "O Gemini nunca acessa banco, nunca executa select/insert/update/delete e nunca decide persistencia final.",
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
    `Data atual: ${input.currentDate || new Date().toISOString().slice(0, 10)}`,
    `Timezone: ${input.timezone || "America/Fortaleza"}`
  ].join("\n");
}
