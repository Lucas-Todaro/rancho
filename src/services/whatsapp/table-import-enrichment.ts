import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { reproductionImportChildSummary } from "@/lib/whatsapp/action-plan/reproduction-import-child";
import { normalizeCatalogText, resolveAnimalIdentifier, resolveStockItem } from "@/lib/whatsapp/catalog";
import { animalStatusValue, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import { refreshRanchoMessage, type ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { animalLabel, bestMatch, exactAnimalImportCodeKey, listAnimals, listLots, listStockItems } from "@/services/whatsapp/catalog-service";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

export function importedTableEventDescription(row: AnyRecord, animal?: AnyRecord | null) {
  const label = String(row.evento_label || row.status_original || "Evento").trim();
  const animalCode = String(animal?.brinco || row.animal_codigo || "").trim();
  const notes = String(row.observacoes || "").trim();
  return [
    `${label} importado via WhatsApp${animalCode ?` para o animal ${animalCode}` : ""}`,
    notes ?`Observacoes: ${notes}` : ""
  ].filter(Boolean).join(". ");
}

export function importedTableEventDate(value: unknown) {
  return String(value || "").slice(0, 10);
}

export function importedTableEventKey(row: AnyRecord) {
  return [
    String(row.animal_id || ""),
    String(row.db_tipo || ""),
    importedTableEventDate(row.data_referencia || row.data_evento),
    normalizeCatalogText(String(row.descricao_salvar || row.descricao || ""))
  ].join("|");
}

export async function existingAnimalEventKeysForImport(supabase: SupabaseAdmin, owner: WhatsAppOwner) {
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,data_evento,descricao")
    .eq("fazenda_id", owner.fazenda_id)
    .limit(5000);
  if (error) throw new Error(error.message);

  return new Set(((data || []) as AnyRecord[]).map((row) => importedTableEventKey({
    animal_id: row.animal_id,
    db_tipo: row.tipo,
    data_evento: row.data_evento,
    descricao: row.descricao
  })));
}

export async function enrichTabularAnimalEventImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const rows = Array.isArray(dados.linhas) ?dados.linhas as AnyRecord[] : [];
  const animals = await listAnimals(supabase, owner);
  const existingKeys = await existingAnimalEventKeysForImport(supabase, owner);
  const validatedRows: AnyRecord[] = [];

  for (const row of rows) {
    const problems = Array.isArray(row.problemas) ?row.problemas.map(String) : [];
    const next: AnyRecord = {
      ...row,
      problemas_validacao: [...problems],
      status_validacao: "invalido"
    };

    if (!problems.length) {
      const resolved = resolveAnimalIdentifier(row.animal_codigo, animals);
      if (!resolved.row) {
        next.problemas_validacao.push("animal_nao_encontrado");
      } else if (resolved.status === "ambiguous") {
        next.problemas_validacao.push("animal_ambiguo");
        next.animal_opcoes = (resolved.rows || []).slice(0, 5).map((animal) => animalLabel(animal));
      } else if (isAnimalInactiveForBot(resolved.row)) {
        next.problemas_validacao.push("animal_inativo");
        next.animal_status = animalStatusValue(resolved.row) || null;
      } else {
        next.animal_id = resolved.row.id;
        next.animal_codigo = String(resolved.row.brinco || row.animal_codigo || "").trim();
        next.animal_resolvido = {
          id: resolved.row.id,
          brinco: resolved.row.brinco,
          nome: resolved.row.nome
        };
        next.descricao_salvar = importedTableEventDescription(row, resolved.row);

        const duplicateKey = importedTableEventKey(next);
        if (existingKeys.has(duplicateKey)) {
          next.problemas_validacao.push("duplicado");
          next.status_validacao = "duplicado";
        } else {
          existingKeys.add(duplicateKey);
          next.status_validacao = "pronto";
        }
      }
    }

    if (next.problemas_validacao.length && next.status_validacao === "pronto") {
      next.status_validacao = "invalido";
    }
    validatedRows.push(next);
  }

  const readyRows = validatedRows.filter((row) => row.status_validacao === "pronto");
  const invalidRows = validatedRows.filter((row) => row.status_validacao !== "pronto");
  const countIssue = (issue: string) => validatedRows.filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes(issue)).length;

  dados.linhas_validadas = validatedRows;
  dados.linhas_prontas = readyRows;
  dados.linhas_invalidas = invalidRows;
  dados.resumo_partos = reproductionImportChildSummary(validatedRows);
  dados.resumo_validacao = {
    total: validatedRows.length,
    prontas: readyRows.length,
    invalidas: invalidRows.length,
    revisao: validatedRows.filter((row) => Array.isArray(row.avisos) && row.avisos.length > 0).length,
    partos: dados.resumo_partos,
    duplicadas: countIssue("duplicado"),
    animais_nao_encontrados: countIssue("animal_nao_encontrado"),
    animais_ambiguos: countIssue("animal_ambiguo"),
    animais_inativos: countIssue("animal_inativo"),
    datas_ausentes: countIssue("data_ausente"),
    datas_invalidas: countIssue("data_invalida"),
    tipos_desconhecidos: countIssue("tipo_evento_desconhecido"),
    por_tipo: validatedRows.reduce<Record<string, number>>((counts, row) => {
      const key = String(row.evento_tipo || "desconhecido");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  };

  return refreshRanchoMessage(parsed, dados);
}

export async function enrichTabularAnimalImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const rows = Array.isArray(dados.linhas) ?dados.linhas as AnyRecord[] : [];
  const animals = await listAnimals(supabase, owner);
  const lots = await listLots(supabase, owner);
  const existingAnimalCodes = new Set(
    animals
      .map((animal) => exactAnimalImportCodeKey(animal.brinco))
      .filter(Boolean)
  );
  const seenTableCodes = new Set<string>();
  const validatedRows: AnyRecord[] = [];
  const createMissingLots = Boolean(dados.criar_lotes_faltantes);

  for (const row of rows) {
    const problems = Array.isArray(row.problemas) ?row.problemas.map(String) : [];
    const next: AnyRecord = {
      ...row,
      problemas_validacao: [...problems],
      status_validacao: "invalido"
    };
    const codeKey = exactAnimalImportCodeKey(row.animal_codigo);

    if (codeKey) {
      if (seenTableCodes.has(codeKey)) {
        next.problemas_validacao.push("duplicado_na_tabela");
        next.status_validacao = "duplicado";
      } else {
        seenTableCodes.add(codeKey);
      }

      if (existingAnimalCodes.has(codeKey)) {
        next.problemas_validacao.push("animal_duplicado");
        next.status_validacao = "duplicado";
      }
    }

    const lotName = String(row.lote_nome || "").trim();
    if (lotName) {
      const lot = bestMatch(lots, lotName, (item) => [item.nome, item.descricao]);
      if (lot?.row && (lot.exact || lot.score >= 0.86)) {
        next.lote_id = lot.row.id;
        next.lote_nome_resolvido = lot.row.nome;
        next.lote_resolvido = {
          id: lot.row.id,
          nome: lot.row.nome
        };
      } else {
        next.problemas_validacao.push("lote_nao_encontrado");
      }
    }

    const uniqueProblems = Array.from(new Set(next.problemas_validacao.map(String)));
    next.problemas_validacao = uniqueProblems;
    const onlyMissingLot = uniqueProblems.length === 1 && uniqueProblems[0] === "lote_nao_encontrado";
    const noProblems = uniqueProblems.length === 0 || (createMissingLots && onlyMissingLot);
    if (noProblems) next.status_validacao = "pronto";
    else if (uniqueProblems.includes("animal_duplicado") || uniqueProblems.includes("duplicado_na_tabela")) next.status_validacao = "duplicado";
    else next.status_validacao = "invalido";
    validatedRows.push(next);
  }

  const readyRows = validatedRows.filter((row) => row.status_validacao === "pronto");
  const invalidRows = validatedRows.filter((row) => row.status_validacao !== "pronto");
  const countIssue = (issue: string) => validatedRows.filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes(issue)).length;
  const missingLotNames = Array.from(new Set(
    validatedRows
      .filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("lote_nao_encontrado"))
      .map((row) => String(row.lote_nome || "").trim())
      .filter(Boolean)
  ));

  dados.linhas_validadas = validatedRows;
  dados.linhas_prontas = readyRows;
  dados.linhas_invalidas = invalidRows;
  dados.criar_lotes_faltantes = createMissingLots;
  dados.resumo_validacao = {
    total: validatedRows.length,
    prontas: readyRows.length,
    invalidas: invalidRows.length,
    duplicadas: countIssue("animal_duplicado") + countIssue("duplicado_na_tabela"),
    lotes_nao_encontrados: countIssue("lote_nao_encontrado"),
    lotes_encontrados: validatedRows.filter((row) => row.lote_id).length,
    parse_invalidas: Number(dados.total_linhas_parse_invalidas || 0),
    categorias_ausentes: countIssue("categoria_ausente"),
    categorias_invalidas: countIssue("categoria_invalida"),
    nomes_lotes_nao_encontrados: missingLotNames,
    por_categoria: validatedRows.reduce<Record<string, number>>((counts, row) => {
      const key = String(row.categoria || "desconhecido");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  };

  return refreshRanchoMessage(parsed, dados);
}

export async function enrichTabularStockImport(supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const dados = { ...(parsed.dados || {}) };
  const rows = Array.isArray(dados.linhas) ?dados.linhas as AnyRecord[] : [];
  const stockItems = await listStockItems(supabase, owner);
  const seenKeys = new Set<string>();
  const validatedRows: AnyRecord[] = [];
  const createMissingItems = Boolean(dados.criar_itens_faltantes);

  for (const row of rows) {
    const problems = Array.isArray(row.problemas) ?row.problemas.map(String) : [];
    const isItemRegistration = row.tipo_linha_estoque === "cadastro_item";
    const next: AnyRecord = {
      ...row,
      problemas_validacao: [...problems],
      status_validacao: "invalido"
    };
    const itemName = String(row.item_nome || row.item_original || "").trim();
    const duplicateKey = [
      normalizeCatalogText(itemName),
      isItemRegistration ? "cadastro_item" : (row.tipo_movimento || ""),
      row.quantidade ?? "",
      row.unidade || "",
      row.data_referencia || row.data_original || "",
      row.categoria || "",
      row.quantidade_minima ?? "",
      row.valor_unitario ?? ""
    ].join("|");

    if (duplicateKey && seenKeys.has(duplicateKey)) {
      next.problemas_validacao.push("duplicado_na_tabela");
      next.status_validacao = "duplicado";
    } else {
      seenKeys.add(duplicateKey);
    }

    if (itemName && !problems.includes("item_ausente")) {
      const resolved = resolveStockItem(itemName, stockItems);
      if (resolved.row && resolved.status === "matched") {
        next.item_id = resolved.row.id;
        next.item_resolvido = resolved.row.nome;
        next.unidade_resolvida = resolved.row.unidade_medida || row.unidade || null;
        if (isItemRegistration) next.problemas_validacao.push("item_ja_cadastrado");
      } else if (isItemRegistration) {
        next.criar_item_estoque = true;
      } else if (createMissingItems) {
        next.criar_item_estoque = true;
      } else {
        next.problemas_validacao.push("item_nao_encontrado");
        next.itens_parecidos = (resolved.rows || [])
          .slice(0, 5)
          .map((item) => String(item.nome || ""))
          .filter(Boolean);
      }
    }

    const uniqueProblems = Array.from(new Set(next.problemas_validacao.map(String)));
    next.problemas_validacao = uniqueProblems;
    const onlyMissingItem = uniqueProblems.length === 1 && uniqueProblems[0] === "item_nao_encontrado";
    const noProblems = uniqueProblems.length === 0 || (!isItemRegistration && createMissingItems && onlyMissingItem);
    if (noProblems) next.status_validacao = "pronto";
    else if (uniqueProblems.includes("duplicado_na_tabela")) next.status_validacao = "duplicado";
    else next.status_validacao = "invalido";
    validatedRows.push(next);
  }

  const readyRows = validatedRows.filter((row) => row.status_validacao === "pronto");
  const invalidRows = validatedRows.filter((row) => row.status_validacao !== "pronto");
  const countIssue = (issue: string) => validatedRows.filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes(issue)).length;
  const missingItemNames = Array.from(new Set(
    validatedRows
      .filter((row) => Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("item_nao_encontrado"))
      .map((row) => String(row.item_nome || row.item_original || "").trim())
      .filter(Boolean)
  ));

  dados.linhas_validadas = validatedRows;
  dados.linhas_prontas = readyRows;
  dados.linhas_invalidas = invalidRows;
  dados.criar_itens_faltantes = createMissingItems;
  dados.resumo_validacao = {
    total: validatedRows.length,
    prontas: readyRows.length,
    invalidas: invalidRows.length,
    duplicadas: countIssue("duplicado_na_tabela"),
    itens_nao_encontrados: countIssue("item_nao_encontrado"),
    nomes_itens_nao_encontrados: missingItemNames,
    datas_invalidas: countIssue("data_invalida"),
    quantidades_invalidas: countIssue("quantidade_ausente") + countIssue("quantidade_invalida"),
    unidades_invalidas: countIssue("unidade_ausente") + countIssue("unidade_invalida"),
    tipos_desconhecidos: countIssue("tipo_movimento_ausente") + countIssue("tipo_movimento_desconhecido"),
    valores_invalidos: countIssue("valor_invalido"),
    cadastros_itens: validatedRows.filter((row) => row.tipo_linha_estoque === "cadastro_item").length,
    por_tipo: validatedRows.reduce<Record<string, number>>((counts, row) => {
      const key = String(row.tipo_linha_estoque || row.tipo_movimento || "desconhecido");
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})
  };

  return refreshRanchoMessage(parsed, dados);
}
