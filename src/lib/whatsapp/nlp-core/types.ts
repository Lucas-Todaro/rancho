import type { AnyRecord } from "@/lib/types";

export type ParserRiskFlag =
  | "single_clear_intent"
  | "multiple_intents_detected"
  | "compound_message"
  | "ambiguous_verb"
  | "ambiguous_reference"
  | "missing_required_entity"
  | "missing_quantity"
  | "missing_unit"
  | "missing_money_value"
  | "unknown_animal"
  | "unknown_stock_item"
  | "unknown_employee"
  | "suspicious_animal_ref"
  | "suspicious_item_name"
  | "intent_keyword_conflict"
  | "physical_sale_without_price"
  | "command_word_as_name"
  | "ambiguous_category"
  | "parsed_number_may_be_time"
  | "possible_multi_domain_message"
  | "missing_domain_in_parse_result"
  | "delete_or_cancel_keyword_conflict"
  | "correction_message"
  | "negation_message"
  | "cancellation_message"
  | "confirmation_response"
  | "pending_action_response"
  | "references_previous_context"
  | "missing_context"
  | "requires_confirmation"
  | "safe_to_apply_correction"
  | "unsafe_to_apply_correction"
  | "possible_duplicate_risk"
  | "do_not_treat_as_new_action"
  | "sensitive_action"
  | "destructive_action"
  | "conflicting_intents"
  | "needs_confirmation"
  | "needs_clarification"
  | "safe_for_local_execution"
  | "use_gemini_fallback";

export type ParserDecision =
  | "local_execution"
  | "gemini_fallback"
  | "ask_confirmation"
  | "ask_clarification"
  | "blocked";

export type DetectedRanchoEntities = {
  animals: string[];
  stockItems: string[];
  employees: string[];
  quantities: number[];
  units: string[];
  dates: string[];
  moneyValues: number[];
};

export type ParsedAction = {
  type: RanchoIntent;
  operation?: string;
  entity?: string | null;
  quantity?: number | null;
  unit?: string | null;
  date?: string | null;
  notes?: string | null;
  rawText?: string;
};

export type RanchoIntent =
  | "PRODUCAO_LEITE"
  | "PARTO"
  | "VACINA_MEDICAMENTO"
  | "MORTE"
  | "DESPESA"
  | "RECEITA_VENDA"
  | "CRIAR_ITEM_ESTOQUE"
  | "ESTOQUE_CADASTRO"
  | "ESTOQUE_ENTRADA"
  | "ESTOQUE_SAIDA"
  | "CRIAR_FUNCIONARIO"
  | "ATUALIZAR_FUNCIONARIO"
  | "DESLIGAR_FUNCIONARIO"
  | "EXCLUIR_FUNCIONARIO"
  | "PAGAMENTO_FUNCIONARIO"
  | "PONTO_FUNCIONARIO"
  | "CADASTRO_ANIMAL"
  | "EXCLUIR_REBANHO"
  | "ACAO_DESTRUTIVA_EM_MASSA"
  | "ATUALIZACAO_GENEALOGIA"
  | "CONSULTA_GENEALOGIA"
  | "ATUALIZACAO_ANIMAL"
  | "CONSULTA_ANIMAL"
  | "CRIAR_LOTE"
  | "CONSULTA_REBANHO"
  | "CONSULTA_LOTES"
  | "CONSULTA_PRODUCAO"
  | "CONSULTA_PRODUCAO_HOJE"
  | "CONSULTA_PRODUCAO_ANIMAL"
  | "CONSULTA_FINANCEIRO"
  | "CONSULTA_ESTOQUE"
  | "CONSULTA_ESTOQUE_ITEM"
  | "CONSULTA_ESTOQUE_GERAL"
  | "CONSULTA_FUNCIONARIO"
  | "CONSULTA_FOLHA"
  | "CONSULTA_PONTO"
  | "CONSULTA_REGISTROS_HOJE"
  | "ORDEM_SERVICO"
  | "LOTE_REGISTROS"
  | "IMPORTACAO_EVENTOS_TABELA"
  | "IMPORTACAO_ANIMAIS_TABELA"
  | "IMPORTACAO_ESTOQUE_TABELA"
  | "IMPORTACAO_TABELA_DOMINIO"
  | "IMPORTACAO_TABELA_AMBIGUA"
  | "AJUDA"
  | "DESCONHECIDO";

export type ParsedRanchoMessage = {
  tipo: RanchoIntent;
  confianca: number;
  dados: AnyRecord;
  resumo: string;
  perguntas_faltantes: string[];
  flags?: ParserRiskFlag[];
  riskScore?: number;
  reason?: string;
  fallbackReason?: string;
  debugReason?: string;
  detectedEntities?: DetectedRanchoEntities;
  actions?: ParsedAction[];
  decision?: ParserDecision;
};
