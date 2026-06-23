import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { normalizeCatalogText, resolveAnimalIdentifier, resolveStockItem } from "@/lib/whatsapp/catalog";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export function exactAnimalImportCodeKey(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").toUpperCase();
}

export type MatchResult<T extends AnyRecord> = {
  row: T;
  exact: boolean;
  score: number;
  ambiguousRows?: T[];
  resolutionStatus?: string;
};

export type StockLookupResult = {
  row?: AnyRecord;
  exact: boolean;
  score: number;
  ambiguousRows?: AnyRecord[];
  resolutionStatus: string;
  catalogSource: "banco_real";
  catalogCount: number;
  candidateNames: string[];
  reason: string;
};

export function matchKey(value: unknown) {
  return normalizeRanchoText(String(value || "")).replace(/[^a-z0-9]/g, "");
}

export function numericKey(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ?digits.replace(/^0+/, "") || "0" : "";
}

export function levenshtein(left: string, right: string) {
  const costs = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let previous = i;
    for (let j = 1; j <= right.length; j += 1) {
      const next = left[i - 1] === right[j - 1]
        ?costs[j - 1]
        : Math.min(costs[j - 1], previous, costs[j]) + 1;
      costs[j - 1] = previous;
      previous = next;
    }
    costs[right.length] = previous;
  }
  return costs[right.length];
}

export function scoreCandidate(term: string, candidate: string) {
  const target = matchKey(term);
  const option = matchKey(candidate);
  if (!target || !option) return 0;
  if (target === option) return 1;
  const targetNumeric = numericKey(term);
  const optionNumeric = numericKey(candidate);
  if (targetNumeric && optionNumeric && targetNumeric === optionNumeric) return 1;
  if (option.includes(target)) return 0.92;
  if (target.includes(option)) return 0.82;
  const distance = levenshtein(target, option);
  return 1 - distance / Math.max(target.length, option.length);
}

export function bestMatch<T extends AnyRecord>(rows: T[], term: string, labels: (row: T) => Array<unknown>) {
  const scored = rows
    .map((row) => {
      const rowScores = labels(row).map((label) => scoreCandidate(term, String(label || "")));
      return { row, score: Math.max(...rowScores), exact: rowScores.some((score) => score === 1) };
    })
    .filter((item) => item.score >= 0.72)
    .sort((left, right) => right.score - left.score);

  return scored[0] as MatchResult<T> | undefined;
}

export async function findAnimal(supabase: SupabaseAdmin, owner: WhatsAppOwner, code: string) {
  const { data, error } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,nome,categoria,sexo,fase,status,raca,lote_id,data_nascimento,peso,observacoes,mae_id,pai_id,genealogia_observacoes")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const resolved = resolveAnimalIdentifier(code, (data || []) as AnyRecord[]);
  if (!resolved.row) return undefined;
  return {
    row: resolved.row,
    exact: resolved.status === "matched" && resolved.exact,
    score: resolved.score,
    ambiguousRows: resolved.status === "ambiguous" ?resolved.rows : undefined,
    resolutionStatus: resolved.status
  };
}

export async function listAnimals(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.animais)
    .select("id,brinco,nome,categoria,sexo,fase,status,raca,lote_id,data_nascimento,peso,observacoes,mae_id,pai_id,genealogia_observacoes")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(2000);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => row.status !== "excluido");
}

export function animalLabel(animal?: AnyRecord | null) {
  if (!animal) return "Não informado";
  const brinco = String(animal.brinco || "").trim();
  const nome = String(animal.nome || "").trim();
  if (brinco && nome && normalizeRanchoText(brinco) !== normalizeRanchoText(nome)) return `${nome} (${brinco})`;
  return brinco || nome || String(animal.id || "Animal");
}

export function animalSexKind(animal?: AnyRecord | null) {
  const values = [animal?.sexo, animal?.categoria].map((value) => normalizeRanchoText(String(value || "")));
  if (values.some((value) => ["femea", "feminino", "vaca", "novilha", "bezerra"].includes(value))) return "femea";
  if (values.some((value) => ["macho", "masculino", "boi", "touro", "bezerro"].includes(value))) return "macho";
  return "";
}

export function lotLabel(lot?: AnyRecord | null) {
  if (!lot) return "Sem lote";
  return String(lot.nome || lot.descricao || lot.id || "Lote");
}

export async function findLot(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string) {
  const { data, error } = await supabase
    .from(TABLES.lotes)
    .select("id,nome,descricao,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  return bestMatch(activeRows, name, (row) => [row.nome, row.descricao]);
}

export async function listLots(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.lotes)
    .select("id,nome,descricao,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
}

export async function findStockItem(supabase: SupabaseAdmin, owner: WhatsAppOwner, name: string): Promise<StockLookupResult> {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  const activeRows = ((data || []) as AnyRecord[]).filter((row) => row.ativo !== false);
  const resolved = resolveStockItem(name, activeRows);

  const candidateRows = (resolved.rows?.length ?resolved.rows : resolved.row ?[resolved.row] : activeRows.slice(0, 8)) as AnyRecord[];
  const candidateNames = candidateRows
    .map((row) => String(row.nome || row.id || ""))
    .filter(Boolean)
    .slice(0, 8);
  const reason = !activeRows.length
    ?"catalogo_vazio"
    : resolved.status === "not_found"
      ?"sem_match_seguro"
      : resolved.status === "ambiguous"
        ?"multiplos_itens_parecidos"
        : resolved.status === "suggestion"
          ?"match_medio_precisa_confirmacao"
          : "match_seguro";

  return {
    row: resolved.row,
    exact: resolved.status === "matched" && resolved.exact,
    score: resolved.score,
    ambiguousRows: resolved.status === "ambiguous" ?resolved.rows : undefined,
    resolutionStatus: resolved.status,
    catalogSource: "banco_real",
    catalogCount: activeRows.length,
    candidateNames,
    reason
  };
}

export async function listStockItems(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.estoqueItens)
    .select("id,nome,categoria,quantidade_atual,quantidade_minima,unidade_medida,valor_unitario,ativo")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(1000);

  if (error) throw new Error(error.message);
  return ((data || []) as AnyRecord[])
    .filter((row) => row.ativo !== false)
    .sort((left, right) => String(left.nome || "").localeCompare(String(right.nome || ""), "pt-BR"));
}
