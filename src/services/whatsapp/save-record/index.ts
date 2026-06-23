import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import type { SaveRecordDependencies, SaveRecordHandlerContext, SaveResult, SupabaseAdmin } from "@/services/whatsapp/save-record/types";
import { saveAnimalRecord } from "@/services/whatsapp/save-record/save-animal-record";
import { saveEmployeeRecord } from "@/services/whatsapp/save-record/save-employee-record";
import { saveFinanceRecord } from "@/services/whatsapp/save-record/save-finance-record";
import { saveGenealogyRecord } from "@/services/whatsapp/save-record/save-genealogy-record";
import { saveHealthRecord } from "@/services/whatsapp/save-record/save-health-record";
import { saveLotRecord } from "@/services/whatsapp/save-record/save-lot-record";
import { savePayrollRecord } from "@/services/whatsapp/save-record/save-payroll-record";
import { savePointRecord } from "@/services/whatsapp/save-record/save-point-record";
import { saveProductionRecord } from "@/services/whatsapp/save-record/save-production-record";
import { saveReproductionRecord } from "@/services/whatsapp/save-record/save-reproduction-record";
import { saveServiceOrderRecord } from "@/services/whatsapp/save-record/save-service-order-record";
import { saveStockRecord } from "@/services/whatsapp/save-record/save-stock-record";
import { saveTableImportRecord } from "@/services/whatsapp/save-record/save-table-import-record";

const TABLE_IMPORT_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["IMPORTACAO_TABELA_DOMINIO", "IMPORTACAO_EVENTOS_TABELA", "IMPORTACAO_ANIMAIS_TABELA", "IMPORTACAO_ESTOQUE_TABELA"]);
const PRODUCTION_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["LOTE_REGISTROS", "PRODUCAO_LEITE"]);
const HEALTH_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["VACINA_MEDICAMENTO", "MORTE"]);
const ANIMAL_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["EXCLUIR_REBANHO", "ATUALIZACAO_ANIMAL", "CADASTRO_ANIMAL"]);
const EMPLOYEE_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["CRIAR_FUNCIONARIO", "ATUALIZAR_FUNCIONARIO", "DESLIGAR_FUNCIONARIO", "EXCLUIR_FUNCIONARIO"]);
const STOCK_INTENTS = new Set<ParsedRanchoMessage["tipo"]>(["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"]);

export async function saveConfirmedRecordByDomain(
  deps: SaveRecordDependencies,
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  pending: ParsedRanchoMessage
): Promise<SaveResult> {
  const invalidReason = deps.validatePendingForSave(pending);
  if (invalidReason) return { response: invalidReason };

  const ctx: SaveRecordHandlerContext = {
    deps,
    supabase,
    owner,
    pending,
    saveConfirmedRecord: (nextSupabase, nextOwner, nextPending) => saveConfirmedRecordByDomain(deps, nextSupabase, nextOwner, nextPending)
  };

  if (TABLE_IMPORT_INTENTS.has(pending.tipo)) return saveTableImportRecord(ctx);
  if (ANIMAL_INTENTS.has(pending.tipo)) return saveAnimalRecord(ctx);
  if (PRODUCTION_INTENTS.has(pending.tipo)) return saveProductionRecord(ctx);
  if (pending.tipo === "PARTO") return saveReproductionRecord(ctx);
  if (HEALTH_INTENTS.has(pending.tipo)) return saveHealthRecord(ctx);
  if (pending.tipo === "ATUALIZACAO_GENEALOGIA") return saveGenealogyRecord(ctx);
  if (pending.tipo === "CRIAR_LOTE") return saveLotRecord(ctx);
  if (pending.tipo === "DESPESA" || pending.tipo === "RECEITA_VENDA") return saveFinanceRecord(ctx);
  if (STOCK_INTENTS.has(pending.tipo)) return saveStockRecord(ctx);
  if (EMPLOYEE_INTENTS.has(pending.tipo)) return saveEmployeeRecord(ctx);
  if (pending.tipo === "PAGAMENTO_FUNCIONARIO") return savePayrollRecord(ctx);
  if (pending.tipo === "PONTO_FUNCIONARIO") return savePointRecord(ctx);
  if (pending.tipo === "ORDEM_SERVICO") return saveServiceOrderRecord(ctx);

  return { response: deps.unknownText() };
}
