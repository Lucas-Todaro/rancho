import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { animalStatusValue, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import { calfCategoryForSex, normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { refreshRanchoMessage, type ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { addGenealogyBlock, collectDescendantIds } from "@/services/whatsapp/genealogy-helpers";
import { animalLabel, animalSexKind, findAnimal, findLot, findStockItem, listAnimals } from "@/services/whatsapp/catalog-service";
import { enrichTabularAnimalEventImport, enrichTabularAnimalImport, enrichTabularStockImport } from "@/services/whatsapp/table-import-enrichment";
import {
  milkStockDebug,
  normalizePhysicalSalePending,
  resolveMilkStockItem,
  shouldResolveMilkStockForProduction,
  stockDecisionReason,
  stockResolutionDebug,
  withoutChildMilkStockMetadata
} from "@/services/whatsapp/milk-stock-service";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const ANIMAL_LOOKUP_INTENTS = new Set<ParsedRanchoMessage["tipo"]>([
  "PRODUCAO_LEITE",
  "PARTO",
  "VACINA_MEDICAMENTO",
  "MORTE",
  "ATUALIZACAO_ANIMAL",
  "CONSULTA_ANIMAL",
  "ATUALIZACAO_GENEALOGIA",
  "CONSULTA_GENEALOGIA"
]);

export type CatalogEnrichmentDependencies = {
  botAnimalCheckLog: (owner: WhatsAppOwner, parsed: ParsedRanchoMessage, animal: AnyRecord, canRegister: boolean) => void;
  botLog: (event: string, owner: WhatsAppOwner, details: AnyRecord) => void;
  calfCodeFromParto: (dados: AnyRecord, mother: AnyRecord) => string;
  enrichDomainTableImport: (supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) => Promise<ParsedRanchoMessage>;
  partoWithChild: (dados: AnyRecord) => boolean;
};

function isBotAdmin(owner: WhatsAppOwner) {
  return owner.papel_bot === "admin";
}

function hasCatalogValue(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function shouldAutoApplyStockOutForPhysicalSale(parsed: ParsedRanchoMessage, dados: AnyRecord) {
  return Boolean(
    parsed.tipo === "ESTOQUE_SAIDA"
    && dados.venda
    && hasCatalogValue(dados.valor)
    && hasCatalogValue(dados.quantidade)
    && dados.deve_baixar_estoque !== false
  );
}

export async function enrichWithCatalog(deps: CatalogEnrichmentDependencies, supabase: SupabaseAdmin, owner: WhatsAppOwner, parsed: ParsedRanchoMessage) {
  const { botAnimalCheckLog, botLog, calfCodeFromParto, enrichDomainTableImport, partoWithChild } = deps;
  parsed = normalizePhysicalSalePending(parsed);
  const dados = { ...(parsed.dados || {}) };
  let changed = false;

  if (parsed.tipo === "IMPORTACAO_EVENTOS_TABELA") {
    return enrichTabularAnimalEventImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    return enrichTabularAnimalImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    return enrichTabularStockImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "IMPORTACAO_TABELA_DOMINIO") {
    return enrichDomainTableImport(supabase, owner, parsed);
  }

  if (parsed.tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros as ParsedRanchoMessage[] : [];
    const enrichedRegistros: ParsedRanchoMessage[] = [];

    for (const registro of registros) {
      enrichedRegistros.push(withoutChildMilkStockMetadata(await enrichWithCatalog(deps, supabase, owner, registro)));
    }

    const productionRecords = enrichedRegistros.filter((registro) => registro.tipo === "PRODUCAO_LEITE");
    const totalLitros = productionRecords.reduce((sum, registro) => sum + Number(registro.dados?.litros || 0), 0);

    dados.registros = enrichedRegistros;
    dados.total_registros = enrichedRegistros.length;
    dados.tipos = Array.from(new Set(enrichedRegistros.map((registro) => registro.tipo)));

    if (productionRecords.length > 1 && shouldResolveMilkStockForProduction(dados, totalLitros)) {
      const resolution = await resolveMilkStockItem(supabase, owner);
      const destinoDetectado = dados.tanque ?"tanque" : null;
      dados.total_litros = totalLitros;
      dados.estoque_leite_detectado = true;
      dados.estoque_leite = milkStockDebug(resolution, totalLitros, destinoDetectado);
      dados.estoque_leite_item_id = resolution.row?.id || null;
      dados.estoque_leite_item_nome = resolution.row?.nome || null;
      dados.estoque_leite_unidade = resolution.row?.unidade_medida || null;
      dados.estoque_leite_opcoes = resolution.options.map((option) => ({
        item_id: option.id || null,
        nome: option.nome || null,
        unidade: option.unidade_medida || null
      }));
      dados.estoque_leite_status = resolution.status;
      dados.estoque_leite_origem = resolution.catalogSource;
      dados.estoque_leite_movimentar = dados.estoque_leite.estoque_movimentar;
    }

    return refreshRanchoMessage(parsed, dados);
  }

  if (parsed.tipo === "PRODUCAO_LEITE" && shouldResolveMilkStockForProduction(dados, Number(dados.litros || 0))) {
    const resolution = await resolveMilkStockItem(supabase, owner);
    const destinoDetectado = dados.tanque ?"tanque" : null;
    dados.total_litros = Number(dados.litros || 0);
    dados.estoque_leite_detectado = true;
    dados.estoque_leite = milkStockDebug(resolution, Number(dados.litros || 0), destinoDetectado);
    dados.estoque_leite_item_id = resolution.row?.id || null;
    dados.estoque_leite_item_nome = resolution.row?.nome || null;
    dados.estoque_leite_unidade = resolution.row?.unidade_medida || null;
    dados.estoque_leite_opcoes = resolution.options.map((option) => ({
      item_id: option.id || null,
      nome: option.nome || null,
      unidade: option.unidade_medida || null
    }));
    dados.estoque_leite_status = resolution.status;
    dados.estoque_leite_origem = resolution.catalogSource;
    dados.estoque_leite_movimentar = dados.estoque_leite.estoque_movimentar;
    changed = true;
  }

  if (ANIMAL_LOOKUP_INTENTS.has(parsed.tipo) && dados.animal_codigo) {
    const found = await findAnimal(supabase, owner, String(dados.animal_codigo));
    if (found && !found.ambiguousRows?.length && (found.exact || found.score >= 0.9)) {
      dados.animal_codigo = found.row.brinco;
      dados.animal_id = found.row.id;
      dados.animal_status = animalStatusValue(found.row) || null;
      dados.animal_resolvido = found.row;
      botAnimalCheckLog(owner, parsed, found.row, !isAnimalInactiveForBot(found.row));
      changed = true;
    } else if (found?.ambiguousRows?.length) {
      dados.animal_opcoes = found.ambiguousRows.map((row) => row.brinco);
      dados.animal_referencia_nao_encontrada = dados.animal_codigo;
      dados.animal_codigo = undefined;
      changed = true;
    } else if (!found) {
      dados.animal_referencia_nao_encontrada = dados.animal_codigo;
      dados.animal_codigo = undefined;
      changed = true;
    }
  }

  if (parsed.tipo === "PARTO" && partoWithChild(dados)) {
    const mother = dados.animal_resolvido as AnyRecord | undefined;
    if (mother && animalSexKind(mother) === "macho") {
      dados.parto_bloqueio = `O animal ${animalLabel(mother)} está marcado como macho. Para registrar parto com cria, informe uma mãe fêmea. Nada foi salvo.`;
      changed = true;
    }

    const childSex = normalizeCalfSex(dados.cria_sexo);
    if (childSex && childSex !== dados.cria_sexo) {
      dados.cria_sexo = childSex;
      changed = true;
    }
    if (childSex && !dados.cria_categoria) {
      dados.cria_categoria = calfCategoryForSex(childSex);
      changed = true;
    }

    if (mother && dados.gerar_cria_codigo_temporario && !dados.cria_codigo) {
      dados.cria_codigo = calfCodeFromParto(dados, mother);
      changed = true;
    }

    if (dados.cria_codigo) {
      const duplicate = await findAnimal(supabase, owner, String(dados.cria_codigo));
      if (duplicate?.row && duplicate.exact) {
        dados.cria_codigo_duplicado = duplicate.row.brinco || dados.cria_codigo;
        dados.cria_codigo = undefined;
        dados.gerar_cria_codigo_temporario = undefined;
        changed = true;
      }
    }

    const fatherRef = String(dados.pai_ref || dados.pai_nome || "").trim();
    if (fatherRef && !dados.pai_id) {
      const father = await findAnimal(supabase, owner, fatherRef);
      if (father && !father.ambiguousRows?.length && (father.exact || father.score >= 0.86)) {
        if (animalSexKind(father.row) === "femea") {
          dados.parto_bloqueio = `O pai informado (${animalLabel(father.row)}) está marcado como fêmea. Corrija o pai ou registre o parto sem pai informado. Nada foi salvo.`;
        } else {
          dados.pai_id = father.row.id;
          dados.pai_ref = father.row.brinco || fatherRef;
          dados.pai_nome = animalLabel(father.row);
          dados.pai_resolvido = father.row;
          dados.pai_nao_informado = undefined;
          dados.precisa_pai_ref = undefined;
        }
        changed = true;
      } else {
        dados.pai_referencia_nao_encontrada = fatherRef;
        dados.pai_opcoes = father?.ambiguousRows?.map((row) => animalLabel(row)) || [];
        dados.pai_ref = undefined;
        dados.pai_nome = undefined;
        dados.pai_id = undefined;
        dados.precisa_pai_ref = true;
        changed = true;
      }
    } else if (!fatherRef && !dados.pai_id) {
      dados.pai_nao_informado = true;
    }
  }

  if (parsed.tipo === "ATUALIZACAO_GENEALOGIA" && dados.animal_id) {
    const resolveParent = async (field: "mae" | "pai") => {
      const valueKey = `${field}_nome`;
      const idKey = `${field}_id`;
      const notFoundKey = `${field}_referencia_nao_encontrada`;
      const optionsKey = `${field}_opcoes`;
      if (!dados[valueKey] || dados[idKey]) return;

      const found = await findAnimal(supabase, owner, String(dados[valueKey]));
      if (found && !found.ambiguousRows?.length && (found.exact || found.score >= 0.86)) {
        dados[idKey] = found.row.id;
        dados[valueKey] = animalLabel(found.row);
        dados[`${field}_resolvido`] = found.row;
        dados[notFoundKey] = undefined;
        dados[optionsKey] = undefined;
        changed = true;
        return;
      }

      dados[notFoundKey] = dados[valueKey];
      dados[optionsKey] = found?.ambiguousRows?.map((row) => animalLabel(row)) || [];
      dados[valueKey] = undefined;
      dados[idKey] = undefined;
      changed = true;
    };

    await resolveParent("mae");
    await resolveParent("pai");

    const animalId = String(dados.animal_id || "");
    const motherId = dados.remover_mae ?null : dados.mae_id ?String(dados.mae_id) : null;
    const fatherId = dados.remover_pai ?null : dados.pai_id ?String(dados.pai_id) : null;

    if ((motherId && motherId === animalId) || (fatherId && fatherId === animalId)) {
      addGenealogyBlock(dados, "O animal não pode ser pai ou mãe dele mesmo. Nada foi salvo.");
      changed = true;
    } else if (motherId || fatherId) {
      const animals = await listAnimals(supabase, owner);
      const descendants = collectDescendantIds(animalId, animals);
      if ((motherId && descendants.has(motherId)) || (fatherId && descendants.has(fatherId))) {
        addGenealogyBlock(dados, "Não é possível escolher um descendente como pai ou mãe. Nada foi salvo.");
        changed = true;
      }
    }
  }

  if (parsed.tipo === "CADASTRO_ANIMAL" && dados.lote_nome && !dados.lote_id) {
    const found = await findLot(supabase, owner, String(dados.lote_nome));
    if (found && (found.exact || found.score >= 0.86)) {
      dados.lote_id = found.row.id;
      dados.lote_nome = found.row.nome;
      dados.lote_nao_encontrado = undefined;
      dados.lote_opcoes = undefined;
      changed = true;
    } else {
      dados.lote_nao_encontrado = dados.lote_nome;
      dados.lote_nome = undefined;
      dados.lote_id = undefined;
      changed = true;
    }
  }

  if (parsed.tipo === "PONTO_FUNCIONARIO" && !dados.funcionario_nome && owner.funcionario_id) {
    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,ativo,deleted_at")
      .eq("id", owner.funcionario_id)
      .eq("fazenda_id", owner.fazenda_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data && data.ativo !== false && !data.deleted_at) {
      dados.funcionario_nome = data.nome || owner.nome_exibicao || "";
      dados.funcionario_id = data.id;
      changed = true;
    }
  }

  if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM"].includes(parsed.tipo) && dados.item_nome) {
    const originalItemName = String(dados.item_nome);
    const found = await findStockItem(supabase, owner, originalItemName);
    const stockResolution = stockResolutionDebug(originalItemName, found);
    let decision = stockDecisionReason(parsed, found, owner);

    dados.item_extraido = originalItemName;
    dados.item_normalizado = stockResolution.item_normalizado;
    dados.origem_catalogo = stockResolution.origem_catalogo;
    dados.quantidade_itens_catalogo = stockResolution.quantidade_itens_catalogo;
    dados.candidatos_catalogo = stockResolution.candidatos_catalogo;
    dados.status_resolucao = stockResolution.status_resolucao;
    dados.score_resolucao = stockResolution.score;
    dados.item_estoque_encontrado = stockResolution.item_estoque_encontrado;
    dados.item_resolvido = stockResolution.item_resolvido;
    dados.item_id = stockResolution.item_id;
    dados.motivo_processamento = decision;
    changed = true;

    if (found.row && !found.ambiguousRows?.length && (found.exact || found.score >= 0.86)) {
      dados.item_nome = found.row.nome;
      dados.item_id = found.row.id;
      dados.item_resolvido = found.row.nome;
      dados.item_estoque_encontrado = true;
      if (shouldAutoApplyStockOutForPhysicalSale(parsed, dados)) {
        dados.deve_baixar_estoque = true;
        decision = "item_encontrado: estoque+receita";
        dados.motivo_processamento = decision;
      }
      changed = true;
    }

    botLog("stock_resolution", owner, {
      currentIntent: parsed.tipo,
      status: "catalogo",
      stockResolution,
      decision
    });

    if (parsed.tipo === "ESTOQUE_ENTRADA" && dados.compra && !found.row && !isBotAdmin(owner)) {
      const financeData = {
        valor: dados.valor,
        descricao: dados.item_nome,
        data_referencia: dados.data_referencia,
        item_extraido: originalItemName,
        item_normalizado: stockResolution.item_normalizado,
        item_resolvido: null,
        item_estoque_encontrado: false,
        item_id: null,
        motivo_processamento: decision
      };
      return refreshRanchoMessage({ ...parsed, tipo: "DESPESA", dados: financeData }, financeData);
    }

    if (parsed.tipo === "ESTOQUE_SAIDA" && dados.venda && !found.row) {
      const financeData = {
        valor: dados.valor,
        descricao: `venda de ${dados.item_nome || originalItemName}`,
        data_referencia: dados.data_referencia,
        quantidade: dados.quantidade,
        unidade: dados.unidade,
        item_extraido: originalItemName,
        item_normalizado: stockResolution.item_normalizado,
        item_resolvido: null,
        item_estoque_encontrado: false,
        item_id: null,
        motivo_processamento: decision
      };
      return refreshRanchoMessage({ ...parsed, tipo: "RECEITA_VENDA", dados: financeData }, financeData);
    }
  }

  return changed ?refreshRanchoMessage(parsed, dados) : parsed;
}
