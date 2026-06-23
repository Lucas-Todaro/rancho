import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { normalizeCatalogText } from "@/lib/whatsapp/catalog";
import { formatStockUnit } from "@/lib/whatsapp/nlp";
import { normalizeRanchoText, refreshRanchoMessage, type ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { formatNumber } from "@/services/whatsapp/message-format";
import type { StockLookupResult } from "@/services/whatsapp/catalog-service";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function isBotAdmin(owner: WhatsAppOwner) {
  return owner.papel_bot === "admin";
}

function hasBotValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function formatStockAmount(quantity: number | string | null | undefined, unit: string | null | undefined) {
  return `${formatNumber(quantity)} ${formatStockUnit(quantity, unit)}`.trim();
}

export type MilkStockResolution = {
  status: "matched" | "ambiguous" | "not_found";
  row?: AnyRecord;
  options: AnyRecord[];
  catalogSource: "banco_real";
  catalogCount: number;
  reason: string;
};

export function stockResolutionDebug(input: unknown, found?: StockLookupResult) {
  return {
    item_extraido: String(input || ""),
    item_normalizado: normalizeCatalogText(String(input || "")),
    origem_catalogo: found?.catalogSource || "banco_real",
    quantidade_itens_catalogo: found?.catalogCount ?? 0,
    candidatos_catalogo: found?.candidateNames || [],
    item_resolvido: found?.row?.nome || null,
    item_estoque_encontrado: Boolean(found?.row && !found.ambiguousRows?.length && found.score >= 0.86),
    item_id: found?.row?.id || null,
    status_resolucao: found?.resolutionStatus || "not_found",
    score: typeof found?.score === "number" ?Number(found.score.toFixed(3)) : 0,
    motivo_nao_resolvido: found?.row ?null : found?.reason || "item_nao_encontrado"
  };
}

export function stockDecisionReason(parsed: ParsedRanchoMessage, found?: StockLookupResult, owner?: WhatsAppOwner) {
  if (parsed.tipo === "ESTOQUE_SAIDA" && parsed.dados?.venda && found?.row && !found.ambiguousRows?.length && found.score >= 0.86) {
    return parsed.dados?.deve_baixar_estoque === true
      ? "item_encontrado: estoque+receita"
      : "item_encontrado: perguntar_baixa_estoque_ou_financeiro";
  }
  if (parsed.tipo === "ESTOQUE_SAIDA" && parsed.dados?.venda && !found?.row) {
    return "item_nao_encontrado: financeiro_apenas";
  }
  if (parsed.tipo === "ESTOQUE_ENTRADA" && parsed.dados?.compra && found?.row && !found.ambiguousRows?.length && found.score >= 0.86) {
    return "item_encontrado: estoque+financeiro";
  }
  if (parsed.tipo === "ESTOQUE_ENTRADA" && parsed.dados?.compra && !found?.row && owner && isBotAdmin(owner)) {
    return "item_nao_encontrado: perguntar_criar_item_ou_financeiro";
  }
  if (parsed.tipo === "ESTOQUE_ENTRADA" && parsed.dados?.compra && !found?.row) {
    return "item_nao_encontrado: financeiro_apenas";
  }
  if (found?.ambiguousRows?.length) return "item_ambiguo: pedir_confirmacao";
  if (found?.row && found.score >= 0.86) return "item_encontrado";
  return "item_nao_encontrado";
}

export function milkStockAfterSaveText(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  if (!stock) return "";

  if (stock.status_resolucao === "matched") {
    return stock.estoque_movimentar
      ?`\nEstoque de ${stock.item_leite_resolvido} atualizado com ${formatNumber(Number(stock.total_litros || parsed.dados?.total_litros || 0), " L")}.`
      :`\nEstoque de leite: item compatível identificado (${stock.item_leite_resolvido}), mas não foi movimentado.`;
  }

  if (stock.status_resolucao === "ambiguous") {
    return "\nEstoque de leite: encontrei múltiplos itens compatíveis e não movimentei estoque automaticamente.";
  }

  return "\nNão encontrei item de estoque compatível com leite. Registrei apenas a produção.";
}

export function isMilkStockUnit(unit: unknown) {
  const normalized = normalizeRanchoText(String(unit || ""));
  return ["l", "litro", "litros"].includes(normalized);
}

export function isMilkStockName(name: unknown) {
  const normalized = normalizeRanchoText(String(name || ""));
  return /\bleite\b/.test(normalized);
}

export function milkStockNameScore(name: unknown) {
  const normalized = normalizeRanchoText(String(name || ""));
  if (normalized === "leite cru") return 100;
  if (normalized === "leite in natura") return 95;
  if (normalized === "leite ordenhado") return 90;
  if (normalized === "leite") return 85;
  if (/\bleite\s+cru\b/.test(normalized)) return 80;
  if (/\bleite\b/.test(normalized)) return 60;
  return 0;
}

export async function resolveMilkStockItem(supabase: SupabaseAdmin, owner: WhatsAppOwner): Promise<MilkStockResolution> {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);

  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  const compatibleRows = activeRows
    .filter((row) => isMilkStockName(row.nome) && isMilkStockUnit(row.unidade_medida))
    .sort((left, right) => milkStockNameScore(right.nome) - milkStockNameScore(left.nome));

  if (compatibleRows.length === 1) {
    return {
      status: "matched",
      row: compatibleRows[0],
      options: [],
      catalogSource: "banco_real",
      catalogCount: activeRows.length,
      reason: "item_leite_unico_compativel"
    };
  }

  if (compatibleRows.length > 1) {
    const topScore = milkStockNameScore(compatibleRows[0].nome);
    const tiedTop = compatibleRows.filter((row) => milkStockNameScore(row.nome) === topScore);
    if (topScore > 0 && tiedTop.length === 1) {
      return {
        status: "matched",
        row: compatibleRows[0],
        options: [],
        catalogSource: "banco_real",
        catalogCount: activeRows.length,
        reason: "item_leite_melhor_compativel"
      };
    }

    return {
      status: "ambiguous",
      options: compatibleRows.slice(0, 8),
      catalogSource: "banco_real",
      catalogCount: activeRows.length,
      reason: "multiplos_itens_leite_compativeis"
    };
  }

  return {
    status: "not_found",
    options: [],
    catalogSource: "banco_real",
    catalogCount: activeRows.length,
    reason: activeRows.length ?"sem_item_leite_em_litros" : "catalogo_vazio"
  };
}

export function milkStockDebug(resolution: MilkStockResolution, totalLitros: number, destinoDetectado?: string | null) {
  const row = resolution.row;
  const options = resolution.options.map((option) => ({
    item_id: option.id || null,
    nome: option.nome || null,
    unidade: option.unidade_medida || null
  }));

  return {
    total_litros: totalLitros,
    destino_detectado: destinoDetectado || null,
    item_leite_resolvido: row?.nome || null,
    item_id: row?.id || null,
    unidade: row?.unidade_medida || null,
    origem: resolution.catalogSource,
    status_resolucao: resolution.status,
    motivo: resolution.reason,
    opcoes: options,
    estoque_movimentar: resolution.status === "matched" && destinoDetectado === "tanque",
    acao_pendente_estoque: resolution.status === "matched" && destinoDetectado === "tanque",
    pedir_decisao: resolution.status === "matched" && !destinoDetectado,
    todo_salvar_estoque: null
  };
}

export function shouldResolveMilkStockForProduction(dados: AnyRecord, totalLitros: number) {
  if (!totalLitros || totalLitros <= 0) return false;
  return String(dados.destino_leite || "") !== "venda";
}

export function milkStockNeedsDecision(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  return Boolean(stock?.pedir_decisao && stock.status_resolucao === "matched" && !stock.estoque_movimentar);
}

export function milkStockDecisionQuestion(parsed: ParsedRanchoMessage) {
  const stock = parsed.dados?.estoque_leite as AnyRecord | undefined;
  const total = Number(stock?.total_litros || parsed.dados?.total_litros || parsed.dados?.litros || 0);
  return `Deseja adicionar também ${formatNumber(total, " L")} ao estoque de ${stock?.item_leite_resolvido || "leite"}?\n1 - Sim\n2 - Não`;
}

export function withMilkStockMovementDecision(parsed: ParsedRanchoMessage, shouldMove: boolean) {
  const stock = { ...((parsed.dados?.estoque_leite || {}) as AnyRecord) };
  stock.estoque_movimentar = shouldMove && stock.status_resolucao === "matched";
  stock.acao_pendente_estoque = stock.estoque_movimentar;
  stock.pedir_decisao = false;
  const dados = {
    ...(parsed.dados || {}),
    estoque_leite: stock,
    estoque_leite_movimentar: stock.estoque_movimentar
  };
  return refreshRanchoMessage(parsed, dados);
}

export function physicalSaleNeedsStockDecision(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  return Boolean(
    parsed.tipo === "ESTOQUE_SAIDA"
    && dados.venda
    && hasBotValue(dados.valor)
    && dados.item_estoque_encontrado
    && dados.item_id
    && dados.deve_baixar_estoque !== true
    && dados.deve_baixar_estoque !== false
  );
}

export function physicalSaleStockDecisionQuestion(parsed: ParsedRanchoMessage) {
  const dados = parsed.dados || {};
  const item = dados.item_resolvido || dados.item_nome || "item";
  return `Encontrei ${item} no estoque. Deseja dar baixa de ${formatStockAmount(Number(dados.quantidade || 0), dados.unidade)} desse item?\n1 - Sim\n2 - Não`;
}

export function normalizePhysicalSalePending(parsed: ParsedRanchoMessage) {
  if (parsed.tipo !== "ESTOQUE_SAIDA" || !parsed.dados?.venda) return parsed;

  const dados = { ...(parsed.dados || {}) };
  const actionPlan = dados.action_plan && typeof dados.action_plan === "object"
    ? dados.action_plan as AnyRecord
    : {};
  const actionPlanData = actionPlan.data && typeof actionPlan.data === "object"
    ? actionPlan.data as AnyRecord
    : {};
  const missing = (value: unknown) => value === undefined || value === null || String(value).trim() === "";
  const firstPresent = (...values: unknown[]) => values.find((value) => !missing(value));

  if (missing(dados.quantidade)) {
    dados.quantidade = firstPresent(dados.venda_quantidade_original, actionPlanData.quantidade);
  }
  if (missing(dados.unidade)) {
    dados.unidade = firstPresent(dados.venda_unidade_original, actionPlanData.unidade, actionPlanData.unidade_medida);
  }
  if (missing(dados.valor)) {
    dados.valor = firstPresent(dados.venda_valor_original, actionPlanData.valor_total);
  }
  if (missing(dados.item_nome)) {
    dados.item_nome = firstPresent(
      dados.venda_item_original,
      actionPlanData.item,
      actionPlanData.item_ref,
      actionPlanData.nome
    );
  }

  if (!missing(dados.quantidade) && Number.isFinite(Number(dados.quantidade)) && Number(dados.quantidade) > 0) {
    dados.venda_quantidade_original = dados.quantidade;
  }
  if (!missing(dados.unidade)) dados.venda_unidade_original = dados.unidade;
  if (!missing(dados.valor) && Number.isFinite(Number(dados.valor)) && Number(dados.valor) > 0) {
    dados.venda_valor_original = dados.valor;
  }
  if (!missing(dados.item_nome)) dados.venda_item_original = dados.item_nome;

  return refreshRanchoMessage(parsed, dados);
}

export function saleFinanceDataFromStockSale(parsed: ParsedRanchoMessage) {
  const dados = normalizePhysicalSalePending(parsed).dados || {};
  const item = dados.item_extraido || dados.item_nome || dados.item_resolvido || "item";
  return {
    valor: dados.valor,
    descricao: `venda de ${item}`,
    data_referencia: dados.data_referencia,
    quantidade: dados.quantidade,
    unidade: dados.unidade,
    item_extraido: dados.item_extraido || item,
    item_normalizado: dados.item_normalizado,
    item_resolvido: dados.item_resolvido || null,
    item_estoque_encontrado: Boolean(dados.item_estoque_encontrado),
    item_id: dados.item_id || null,
    deve_baixar_estoque: false,
    motivo_processamento: "usuario_escolheu_financeiro_apenas"
  };
}

export function withPhysicalSaleStockDecision(parsed: ParsedRanchoMessage, shouldMove: boolean) {
  const normalized = normalizePhysicalSalePending(parsed);
  if (shouldMove) {
    const dados = {
      ...(normalized.dados || {}),
      deve_baixar_estoque: true,
      motivo_processamento: "usuario_escolheu_estoque+receita"
    };
    return refreshRanchoMessage(normalized, dados);
  }

  const financeData = saleFinanceDataFromStockSale(normalized);
  return refreshRanchoMessage({ ...normalized, tipo: "RECEITA_VENDA", dados: financeData }, financeData);
}

export function withoutChildMilkStockMetadata(parsed: ParsedRanchoMessage) {
  if (parsed.tipo !== "PRODUCAO_LEITE") return parsed;
  const dados = { ...(parsed.dados || {}) };
  delete dados.estoque_leite_detectado;
  delete dados.estoque_leite;
  delete dados.estoque_leite_item_id;
  delete dados.estoque_leite_item_nome;
  delete dados.estoque_leite_unidade;
  delete dados.estoque_leite_opcoes;
  delete dados.estoque_leite_status;
  delete dados.estoque_leite_origem;
  delete dados.estoque_leite_movimentar;
  return refreshRanchoMessage(parsed, dados);
}
