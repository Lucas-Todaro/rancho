"use client";

import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, PackageOpen, Pencil, Plus, RefreshCw, Scale, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { ModuleForm } from "@/components/modules/ModuleForm";
import { StatCard } from "@/components/ui/StatCard";
import { createRecord, deleteRecord, listRecords, updateRecord } from "@/services/crud";
import { recordStockMovement, type StockMovementType } from "@/services/stock";
import { TABLES } from "@/lib/tables";
import { useAuth } from "@/lib/auth-context";
import type { AnyRecord, ModuleConfig, RelationOption } from "@/lib/types";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type StockAction = {
  item: AnyRecord;
  type: StockMovementType;
};

const actionCopy = {
  entrada: {
    title: "Adicionar ao estoque",
    subtitle: "Use quando chegou uma compra, doacao ou reposicao.",
    button: "Adicionar quantidade",
    icon: ArrowUpCircle,
    tone: "text-emerald-700"
  },
  saida: {
    title: "Remover do estoque",
    subtitle: "Use quando o item foi usado, vendido, perdido ou descartado.",
    button: "Remover quantidade",
    icon: ArrowDownCircle,
    tone: "text-red-700"
  },
  ajuste: {
    title: "Ajustar saldo",
    subtitle: "Use quando a contagem fisica esta diferente do sistema.",
    button: "Salvar novo saldo",
    icon: Scale,
    tone: "text-blue-700"
  }
};

function exportStockCsv(rows: AnyRecord[]) {
  const header = ["Produto", "Categoria", "Unidade", "Quantidade atual", "Quantidade minima", "Valor unitario", "Fornecedor"];
  const body = rows.map((row) => [
    row.nome,
    row.categoria,
    row.unidade_medida,
    row.quantidade_atual,
    row.quantidade_minima,
    row.valor_unitario,
    row.fornecedor
  ].map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));

  const blob = new Blob([`${header.map((item) => `"${item}"`).join(",")}\n${body.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "estoque.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function StockActionModal({
  action,
  onClose,
  onSubmit,
  busy
}: {
  action: StockAction;
  onClose: () => void;
  onSubmit: (values: { quantity: number; unitValue?: number; reason?: string }) => Promise<void>;
  busy?: boolean;
}) {
  const [quantity, setQuantity] = useState("");
  const [unitValue, setUnitValue] = useState(action.item.valor_unitario ? String(action.item.valor_unitario) : "");
  const [reason, setReason] = useState("");

  const copy = actionCopy[action.type];
  const Icon = copy.icon;
  const current = Number(action.item.quantidade_atual || 0);
  const typedQuantity = Number(quantity || 0);
  const nextQuantity = action.type === "entrada"
    ? current + typedQuantity
    : action.type === "saida"
      ? Math.max(0, current - typedQuantity)
      : typedQuantity;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit({
      quantity: typedQuantity,
      unitValue: unitValue ? Number(unitValue) : undefined,
      reason
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-3 backdrop-blur-sm md:items-center">
      <form onSubmit={submit} className="w-full max-w-lg animate-fade-in rounded-lg border border-slate-200 bg-white p-5 shadow-soft dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="rounded-lg bg-slate-100 p-3 dark:bg-slate-900">
              <Icon className={`h-6 w-6 ${copy.tone}`} />
            </div>
            <div>
              <h2 className="text-xl font-black">{copy.title}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{copy.subtitle}</p>
            </div>
          </div>
          <button className="rounded-lg border border-slate-200 p-2 dark:border-slate-800" type="button" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-slate-900">
          <p className="font-black">{action.item.nome}</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            Saldo atual: {formatNumber(current)} {action.item.unidade_medida || ""}
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold">{action.type === "ajuste" ? "Novo saldo" : "Quantidade"}</span>
            <input className="input" type="number" step="0.001" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-bold">Valor unitario</span>
            <input className="input" type="number" step="0.01" min="0" value={unitValue} onChange={(event) => setUnitValue(event.target.value)} />
          </label>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-bold">Motivo</span>
          <textarea className="input min-h-24 resize-y" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex: compra de racao, uso no trato, contagem fisica..." />
        </label>

        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
          <span className="font-bold text-emerald-900 dark:text-emerald-100">Depois da acao: </span>
          {formatNumber(nextQuantity)} {action.item.unidade_medida || ""}
        </div>

        <button className="btn btn-primary mt-5 w-full" type="submit" disabled={busy}>
          {busy ? "Salvando..." : copy.button}
        </button>
      </form>
    </div>
  );
}

export function StockScreen({ config }: { config: ModuleConfig }) {
  const { dataContext } = useAuth();
  const [items, setItems] = useState<AnyRecord[]>([]);
  const [movements, setMovements] = useState<AnyRecord[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AnyRecord | null>(null);
  const [action, setAction] = useState<StockAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [nextItems, nextMovements] = await Promise.all([
        listRecords(TABLES.estoqueItens, { orderBy: "created_at", fazendaId: dataContext.fazendaId, usuarioId: dataContext.usuarioId }),
        listRecords(TABLES.estoqueMovimentacoes, { orderBy: "created_at", fazendaId: dataContext.fazendaId, usuarioId: dataContext.usuarioId })
      ]);

      setItems(nextItems);
      setMovements(nextMovements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel carregar o estoque.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataContext.fazendaId]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;

    return items.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }, [items, search]);

  const estimatedValue = items.reduce((sum, item) => sum + Number(item.quantidade_atual || 0) * Number(item.valor_unitario || 0), 0);
  const criticalCount = items.filter((item) => Number(item.quantidade_atual || 0) <= Number(item.quantidade_minima || 0)).length;

  async function submitItem(values: AnyRecord) {
    setBusy(true);
    setError("");
    try {
      if (editing?.id) {
        await updateRecord(TABLES.estoqueItens, editing.id, values);
        setEditing(null);
      } else {
        await createRecord(TABLES.estoqueItens, values, dataContext);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o item.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMovement(values: { quantity: number; unitValue?: number; reason?: string }) {
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      await recordStockMovement({
        item: action.item,
        type: action.type,
        quantity: values.quantity,
        unitValue: values.unitValue,
        reason: values.reason,
        context: dataContext
      });
      setAction(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel registrar a movimentacao.");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: AnyRecord) {
    const ok = window.confirm(`Excluir ${item.nome}?`);
    if (!ok) return;

    setBusy(true);
    try {
      await deleteRecord(TABLES.estoqueItens, item.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel excluir.");
    } finally {
      setBusy(false);
    }
  }

  function lastMovement(itemId: string) {
    return movements.find((movement) => movement.item_id === itemId);
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <PackageOpen className="h-4 w-4" /> Estoque
          </div>
          <h1 className="text-3xl font-black tracking-tight md:text-4xl">Gestao de Estoque</h1>
          <p className="mt-3 max-w-2xl text-slate-500 dark:text-slate-400">
            Controle entradas, retiradas e ajustes de cada produto sem editar o saldo manualmente.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-secondary" type="button" onClick={() => exportStockCsv(filteredItems)}>Baixar planilha</button>
          <button className="btn btn-secondary" type="button" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title="Itens cadastrados" value={items.length} hint="Produtos e insumos" icon={PackageOpen} tone="green" />
        <StatCard title="Estoque critico" value={criticalCount} hint="Abaixo do minimo" icon={AlertTriangle} tone={criticalCount ? "red" : "green"} />
        <StatCard title="Valor estimado" value={formatCurrency(estimatedValue)} hint="Saldo x valor unitario" icon={Scale} tone="blue" />
      </div>

      <ModuleForm config={config} editing={editing} onSubmit={submitItem} onCancel={() => setEditing(null)} busy={busy} relationOptions={{} as Record<string, RelationOption[]>} />

      <section className="glass rounded-lg p-4 shadow-soft md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-black">Itens do estoque</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Use os botoes de cada item para adicionar, retirar ou ajustar saldo.
            </p>
          </div>
          <input className="input md:max-w-sm" placeholder="Pesquisar item..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {filteredItems.length ? filteredItems.map((item) => {
            const current = Number(item.quantidade_atual || 0);
            const minimum = Number(item.quantidade_minima || 0);
            const critical = current <= minimum;
            const recentMovement = lastMovement(item.id);

            return (
              <article key={item.id} className="rounded-lg border border-slate-200 bg-white/72 p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-soft dark:border-slate-800 dark:bg-slate-900/60">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black">{item.nome}</h3>
                      <Badge tone={critical ? "danger" : "success"}>{critical ? "Atenção" : "Ok"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {item.categoria || "Sem categoria"} • {item.fornecedor || "Sem fornecedor"}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Saldo atual</p>
                    <p className="mt-1 text-2xl font-black">{formatNumber(current)} {item.unidade_medida}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Minimo: {formatNumber(minimum)} {item.unidade_medida}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button className="btn bg-emerald-600 text-white" type="button" onClick={() => setAction({ item, type: "entrada" })}>
                    <Plus className="h-4 w-4" /> Adicionar
                  </button>
                  <button className="btn border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" type="button" onClick={() => setAction({ item, type: "saida" })}>
                    <ArrowDownCircle className="h-4 w-4" /> Remover
                  </button>
                  <button className="btn btn-secondary" type="button" onClick={() => setAction({ item, type: "ajuste" })}>
                    <Scale className="h-4 w-4" /> Ajustar
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-slate-500 dark:text-slate-400">
                    {recentMovement ? (
                      <span>Ultima movimentacao: {recentMovement.tipo} em {formatDate(recentMovement.created_at)}</span>
                    ) : (
                      <span>Nenhuma movimentacao registrada ainda.</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-lg border border-slate-200 p-2 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" type="button" onClick={() => setEditing(item)} title="Editar item">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950" type="button" onClick={() => removeItem(item)} title="Excluir item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          }) : (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
              {loading ? "Carregando estoque..." : "Nenhum item encontrado."}
            </div>
          )}
        </div>
      </section>

      {action ? <StockActionModal action={action} onClose={() => setAction(null)} onSubmit={submitMovement} busy={busy} /> : null}
    </div>
  );
}
