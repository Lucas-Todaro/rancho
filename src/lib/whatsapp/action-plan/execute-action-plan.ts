import type { ActionPlan } from "@/lib/whatsapp/gemini/action-plan-types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import { buildMissing, finalize } from "@/lib/whatsapp/nlp-core/result";
import { executeImportTableActionPlan } from "@/lib/whatsapp/action-plan/execute-import-table-action-plan";
import { validateActionPlan } from "@/lib/whatsapp/gemini/action-plan-validator";
import { calfCategoryForSex } from "@/lib/whatsapp/nlp-core/birth-child";
import {
  normalizeDate,
  normalizeReproductionEvent,
  normalizeSex
} from "@/lib/whatsapp/nlp-core/reproduction-normalizers";
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

function reproductionMutationParsed(plan: ActionPlan, currentDate?: string): ParsedRanchoMessage | null {
  if ((plan.action !== "create" && plan.action !== "update") || plan.domain !== "reproducao") return null;
  const data = plan.data || {};
  const event = normalizeReproductionEvent(data.evento || data.tipo);
  const animalRef = String(data.animal_ref || data.mae_ref || "").trim();
  const date = normalizeDate(data.data || data.data_evento, currentDate) || currentDate || "hoje";
  if (!event || !animalRef) return null;

  const actionPlanData = {
    origem_parser: "gemini_action_plan",
    interpreter_final_usado: "action_plan",
    action_plan_used: true,
    action_plan_domain: "reproducao",
    action_plan: plan
  };

  if (event === "PARTO") {
    const childSex = normalizeSex(data.cria_sexo || data.sexo_cria);
    const childCode = String(data.cria_codigo || "").trim() || undefined;
    const childName = String(data.cria_nome || "").trim() || undefined;
    const fatherRef = String(data.pai_ref || "").trim() || undefined;
    const hasChildData = Boolean(childSex || childCode || childName || data.cria_ref || fatherRef);
    const dados = {
      animal_codigo: animalRef,
      mae_ref: animalRef,
      evento_reprodutivo_tipo: "parto",
      data_referencia: date,
      observacoes: data.observacoes || data.descricao || undefined,
      parto_cria_decisao_pendente: hasChildData ? undefined : true,
      parto_cria_cadastro: hasChildData || undefined,
      cria_ref: data.cria_ref || undefined,
      cria_codigo: childCode,
      cria_nome: childName,
      cria_sexo: childSex,
      cria_categoria: calfCategoryForSex(childSex),
      pai_ref: fatherRef,
      pai_nome: fatherRef,
      pai_nao_informado: hasChildData && !fatherRef ? true : undefined,
      ...actionPlanData
    };
    return finalize("PARTO", dados, buildMissing("PARTO", dados), plan.confidence);
  }

  const eventKind = event.toLowerCase();
  const description = String(data.observacoes || data.descricao || event.replace(/_/g, " ")).trim();
  const dados = {
    animal_codigo: animalRef,
    campo_alterado: "observacoes",
    novo_valor: description,
    descricao: description,
    registro_evento_animal: true,
    evento_tipo: "reprodutivo",
    evento_reprodutivo_tipo: eventKind,
    data_referencia: date,
    custo: data.custo,
    ...actionPlanData
  };
  return finalize("ATUALIZACAO_ANIMAL", dados, buildMissing("ATUALIZACAO_ANIMAL", dados), plan.confidence);
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

  if (input.plan.action === "create" || input.plan.action === "update") {
    const validation = validateActionPlan(input.plan);
    if (!validation.ok) {
      return {
        ok: false,
        status: validation.status === "blocked" ? "blocked" : "clarify",
        reason: validation.reason,
        message: validation.status === "blocked"
          ? "Nao posso executar esse pedido com seguranca."
          : "Preciso revisar os dados antes de continuar.",
        logEvent: validation.status === "blocked" ? "action_plan_blocked" : "action_plan_invalid"
      };
    }
    const parsed = reproductionMutationParsed(validation.value, input.currentDate);
    if (parsed) {
      return {
        ok: true,
        parsed,
        logEvent: "action_plan_used"
      };
    }
  }

  return {
    ok: false,
    status: "clarify",
    reason: "action_plan_mutation_not_integrated",
    message: "Esse tipo de pedido ainda não está habilitado para execução segura.",
    logEvent: "action_plan_invalid"
  };
}
