import type { ActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import { finalize } from "@/lib/whatsapp/nlp-core/result";
import { executeImportTableActionPlan } from "@/lib/whatsapp/action-plan/execute-import-table-action-plan";
import {
  executeQueryActionPlan,
  type ActionPlanOwnerContext,
  type ActionPlanSupabaseLike
} from "@/lib/whatsapp/action-plan/execute-query-action-plan";

export type ExecuteActionPlanInput = {
  plan: ActionPlan;
  text: string;
  owner: ActionPlanOwnerContext;
  supabase?: ActionPlanSupabaseLike | null;
  currentDate?: string;
};

export type ExecuteActionPlanResult =
  | {
      ok: true;
      parsed: ParsedRanchoMessage;
      response?: string;
      logEvent: "action_plan_used" | "table_action_plan_used" | "action_plan_blocked";
    }
  | {
      ok: false;
      status: "clarify" | "blocked";
      reason: string;
      message: string;
      logEvent: "action_plan_invalid" | "action_plan_blocked";
    };

function blockParsed(plan: ActionPlan) {
  const reason = plan.action === "block" ? plan.reason : "action_plan_blocked";
  return finalize("ACAO_DESTRUTIVA_EM_MASSA", {
    blocked: true,
    bloqueado: true,
    motivo: reason,
    should_confirm: false,
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "action_plan_block",
    action_plan_used: true,
    action_plan: plan
  }, [], 1);
}

export async function executeActionPlan(input: ExecuteActionPlanInput): Promise<ExecuteActionPlanResult> {
  if (input.plan.action === "block") {
    return {
      ok: true,
      parsed: blockParsed(input.plan),
      logEvent: "action_plan_blocked"
    };
  }

  if (input.plan.action === "clarify") {
    return {
      ok: false,
      status: "clarify",
      reason: "action_plan_clarify",
      message: input.plan.question,
      logEvent: "action_plan_invalid"
    };
  }

  if (input.plan.action === "query") {
    const result = await executeQueryActionPlan({
      plan: input.plan,
      supabase: input.supabase,
      owner: input.owner,
      currentDate: input.currentDate,
      originalText: input.text
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        reason: result.reason,
        message: result.message,
        logEvent: result.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid"
      };
    }
    return {
      ok: true,
      parsed: result.parsed,
      response: result.response,
      logEvent: "action_plan_used"
    };
  }

  if (input.plan.action === "import_table") {
    const result = await executeImportTableActionPlan({
      plan: input.plan,
      text: input.text
    });
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        reason: result.reason,
        message: result.message,
        logEvent: result.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid"
      };
    }
    return {
      ok: true,
      parsed: result.parsed,
      response: result.preview,
      logEvent: "table_action_plan_used"
    };
  }

  return {
    ok: false,
    status: "clarify",
    reason: "action_plan_mutation_not_integrated",
    message: "Esse tipo de pedido ainda não está habilitado para execução segura.",
    logEvent: "action_plan_invalid"
  };
}
