import type { AnyRecord } from "@/lib/types";
import type { ActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import type { ParsedRanchoMessage, RanchoIntent } from "@/lib/whatsapp/nlp";
import { finalize } from "@/lib/whatsapp/nlp-core/result";

type ActionPlanParsedOptions = {
  interpreterFinal?: string;
  table?: boolean;
  extra?: AnyRecord;
};

export function actionPlanParsedMetadata(plan: ActionPlan, options: ActionPlanParsedOptions = {}) {
  return {
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: options.interpreterFinal || "action_plan",
    action_plan_used: true,
    action_plan_domain: "domain" in plan ? plan.domain : undefined,
    action_plan_semantic: plan.semantic,
    action_plan: plan,
    ...(options.table ? { table_action_plan_used: true } : {}),
    ...(options.extra || {})
  };
}

export function finalizeActionPlanParsed(
  tipo: RanchoIntent,
  dados: AnyRecord,
  missing: string[],
  confidence: number,
  plan: ActionPlan,
  options: ActionPlanParsedOptions = {}
): ParsedRanchoMessage {
  return finalize(tipo, {
    ...dados,
    ...actionPlanParsedMetadata(plan, options)
  }, missing, confidence);
}

export function withActionPlanParsedMetadata(
  parsed: ParsedRanchoMessage,
  plan: ActionPlan,
  options: ActionPlanParsedOptions = {}
): ParsedRanchoMessage {
  return {
    ...parsed,
    dados: {
      ...(parsed.dados || {}),
      ...actionPlanParsedMetadata(plan, options)
    }
  };
}

export function finalizeBlockedActionPlanParsed(plan: ActionPlan, reason: string): ParsedRanchoMessage {
  return finalizeActionPlanParsed("ACAO_DESTRUTIVA_EM_MASSA", {
    blocked: true,
    bloqueado: true,
    motivo: reason,
    should_confirm: false
  }, [], 1, plan, { interpreterFinal: "action_plan_block" });
}
