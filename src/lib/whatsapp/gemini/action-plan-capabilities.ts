export const ACTION_PLAN_CAPABILITIES = [
  "consultar_dados",
  "consultar_rebanho",
  "consultar_animal",
  "consultar_financeiro",
  "consultar_estoque",
  "consultar_producao_leite",
  "consultar_funcionarios",
  "consultar_ponto",
  "consultar_genealogia",
  "consultar_eventos",
  "cadastrar_animal",
  "atualizar_animal",
  "alterar_status_animal",
  "registrar_evento_animal",
  "registrar_producao_leite",
  "registrar_movimento_estoque",
  "cadastrar_item_estoque",
  "registrar_financeiro",
  "criar_lote",
  "cadastrar_funcionario",
  "atualizar_funcionario",
  "registrar_pagamento_funcionario",
  "registrar_ponto_funcionario",
  "atualizar_genealogia",
  "registrar_ordem_servico"
] as const;

export type ActionPlanCapability = (typeof ACTION_PLAN_CAPABILITIES)[number];

const MUTATION_CAPABILITIES = new Set<ActionPlanCapability>([
  "cadastrar_animal",
  "atualizar_animal",
  "alterar_status_animal",
  "registrar_evento_animal",
  "registrar_producao_leite",
  "registrar_movimento_estoque",
  "cadastrar_item_estoque",
  "registrar_financeiro",
  "criar_lote",
  "cadastrar_funcionario",
  "atualizar_funcionario",
  "registrar_pagamento_funcionario",
  "registrar_ponto_funcionario",
  "atualizar_genealogia",
  "registrar_ordem_servico"
]);

function normalizeCapabilityText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function normalizeActionPlanCapability(value: unknown): ActionPlanCapability | null {
  const normalized = normalizeCapabilityText(value);
  return ACTION_PLAN_CAPABILITIES.find((capability) => capability === normalized) || null;
}

export function isMutationCapability(capability: ActionPlanCapability) {
  return MUTATION_CAPABILITIES.has(capability);
}

export function capabilityRequiresConfirmation(capability: ActionPlanCapability) {
  return isMutationCapability(capability);
}
