import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import type { ConsultationDependencies, SupabaseAdmin } from "@/services/whatsapp/consultation/types";

export async function handleConsultation(
  deps: ConsultationDependencies,
  supabase: SupabaseAdmin,
  owner: WhatsAppOwner,
  parsed: ParsedRanchoMessage
) {
  const {
    helpText,
    unknownText,
    saveSession,
    handleHerdConsultation,
    handleLotConsultation,
    handleProductionRankingConsultation,
    handleFinanceConsultation,
    handleStockListConsultation,
    handleEventsReportConsultation,
    handleTodayRecordsConsultation,
    findAnimal,
    findStockItem,
    findEmployee,
    listAnimals,
    listLots,
    buildAnimalIndividualReport,
    collectDescendantIds,
    animalOptionsText,
    animalLabel,
    animalMap,
    animalShortLabel,
    periodRange,
    periodLabel,
    formatNumber,
    formatMoney,
    formatStockAmount,
    formatWhatsappForBot,
    isBotAdmin,
    monthStartFromPaymentPeriod,
    monthRange,
    monthKeyFromDate
  } = deps;

  if (parsed.tipo === "AJUDA") return helpText();

  if (parsed.dados?.action_plan_response) {
    parsed.dados.consulta_executada = parsed.dados.consulta_executada || "action_plan";
    await saveSession(supabase, owner, { etapa: "livre", dados: {} });
    return String(parsed.dados.action_plan_response);
  }

  if (parsed.tipo === "CONSULTA_REBANHO") {
    return handleHerdConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_LOTES") {
    return handleLotConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_ANIMAL") {
    if (parsed.dados.animal_referencia_nao_encontrada && Array.isArray(parsed.dados.animal_opcoes) && parsed.dados.animal_opcoes.length) {
      const options = parsed.dados.animal_opcoes.slice(0, 5).join(", ");
      return `Encontrei mais de um animal parecido com ${parsed.dados.animal_referencia_nao_encontrada}. Qual é o brinco correto?\nOpções: ${options}.`;
    }

    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return "Não encontrei esse animal no rebanho. Confira o nome ou código e tente novamente.";
    if (found.ambiguousRows?.length) {
      return `Encontrei mais de um animal parecido. Qual deles você quer ver?\n${animalOptionsText(found.ambiguousRows)}`;
    }

    const animal = found.row as AnyRecord;
    const lots = await listLots(supabase, owner);
    const lot = animal.lote_id ?lots.find((row) => String(row.id || "") === String(animal.lote_id)) : null;
    const report = await buildAnimalIndividualReport(supabase, owner, animal, animalReference, lot);
    parsed.dados.consulta_executada = "animal_individual";
    parsed.dados.resultado = report.result;
    return report.text;
  }

  if (parsed.tipo === "CONSULTA_GENEALOGIA") {
    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return `Não encontrei o animal "${animalReference || "informado"}" no cadastro.`;
    if (found.ambiguousRows?.length) {
      return `Encontrei mais de um animal parecido. Tente pelo brinco cadastrado:\n${animalOptionsText(found.ambiguousRows)}`;
    }

    const animal = found.row as AnyRecord;
    const animals = await listAnimals(supabase, owner);
    const byId = new Map(animals.map((row) => [String(row.id), row]));
    const mother = animal.mae_id ?byId.get(String(animal.mae_id)) : null;
    const father = animal.pai_id ?byId.get(String(animal.pai_id)) : null;
    const maternalGrandmother = mother?.mae_id ?byId.get(String(mother.mae_id)) : null;
    const maternalGrandfather = mother?.pai_id ?byId.get(String(mother.pai_id)) : null;
    const paternalGrandmother = father?.mae_id ?byId.get(String(father.mae_id)) : null;
    const paternalGrandfather = father?.pai_id ?byId.get(String(father.pai_id)) : null;
    const directChildren = animals.filter((row) => String(row.mae_id || "") === String(animal.id) || String(row.pai_id || "") === String(animal.id));
    const descendantIds = collectDescendantIds(String(animal.id), animals);
    const descendants = Array.from(descendantIds).map((id) => byId.get(id)).filter(Boolean) as AnyRecord[];
    const query = String(parsed.dados.consulta_genealogia || "arvore");

    parsed.dados.consulta_executada = "genealogia";
    parsed.dados.resultado = {
      animal_id: animal.id,
      animal: animalLabel(animal),
      mae: mother ?animalLabel(mother) : null,
      pai: father ?animalLabel(father) : null,
      filhos: directChildren.map(animalLabel),
      descendentes: descendants.map(animalLabel)
    };

    if (query === "mae") return `${animalLabel(animal)}\nMãe: ${mother ?animalLabel(mother) : "Não informado"}.`;
    if (query === "pai") return `${animalLabel(animal)}\nPai: ${father ?animalLabel(father) : "Não informado"}.`;
    if (query === "descendentes") {
      const childrenText = directChildren.length ?directChildren.map(animalLabel).join(", ") : "Nenhum filho informado";
      const descendantsText = descendants.length > directChildren.length ?`\nDescendentes: ${descendants.map(animalLabel).join(", ")}.` : "";
      return `Filhos de ${animalLabel(animal)}: ${childrenText}.${descendantsText}`;
    }
    if (query === "avos") {
      return [
        `Avós de ${animalLabel(animal)}:`,
        `Maternos: ${maternalGrandmother ?animalLabel(maternalGrandmother) : "Não informado"} / ${maternalGrandfather ?animalLabel(maternalGrandfather) : "Não informado"}.`,
        `Paternos: ${paternalGrandmother ?animalLabel(paternalGrandmother) : "Não informado"} / ${paternalGrandfather ?animalLabel(paternalGrandfather) : "Não informado"}.`
      ].join("\n");
    }

    return [
      `Genealogia de ${animalLabel(animal)}`,
      `Mãe: ${mother ?animalLabel(mother) : "Não informado"}.`,
      `Pai: ${father ?animalLabel(father) : "Não informado"}.`,
      `Avós maternos: ${maternalGrandmother ?animalLabel(maternalGrandmother) : "Não informado"} / ${maternalGrandfather ?animalLabel(maternalGrandfather) : "Não informado"}.`,
      `Avós paternos: ${paternalGrandmother ?animalLabel(paternalGrandmother) : "Não informado"} / ${paternalGrandfather ?animalLabel(paternalGrandfather) : "Não informado"}.`,
      `Filhos: ${directChildren.length ?directChildren.map(animalLabel).join(", ") : "Nenhum filho informado"}.`
    ].join("\n");
  }

  if (parsed.tipo === "CONSULTA_PRODUCAO" || parsed.tipo === "CONSULTA_PRODUCAO_HOJE") {
    if (parsed.dados.consulta_producao === "maior_produtor" || parsed.dados.consulta_producao === "menor_produtor") {
      return handleProductionRankingConsultation(supabase, owner, parsed);
    }

    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const range = periodRange(period);
    const { data, error } = await supabase
      .from(TABLES.ordenhas)
      .select("animal_id,litros,ordenhado_em,created_at")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("ordenhado_em", range.start)
      .lt("ordenhado_em", range.end)
      .order("ordenhado_em", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data || []) as AnyRecord[];
    const total = rows.reduce((sum, row) => sum + Number(row.litros || 0), 0);
    const count = rows.length;
    const animalsById = animalMap(await listAnimals(supabase, owner));
    const formatProductionTime = (row: AnyRecord) => {
      const value = String(row.ordenhado_em || row.created_at || "");
      const match = value.match(/[T\s](\d{2}):(\d{2})/);
      return match ?`${match[1]}:${match[2]}` : "";
    };
    const registros = rows.map((row) => ({
      animal_id: row.animal_id || null,
      animal: animalShortLabel(animalsById.get(String(row.animal_id || ""))),
      litros: Number(row.litros || 0),
      horario: formatProductionTime(row) || null
    }));
    parsed.dados.consulta_executada = "producao";
    parsed.dados.resultado = { total_litros: total, registros: count, periodo: period, detalhes: registros };
    if (!count) return period === "hoje"
      ?"Não encontrei produções de leite registradas hoje."
      :`Não encontrei produções de leite registradas ${periodLabel(period)}.`;
    const detalhes = registros.slice(0, 20).map((row, index) => {
      const horario = row.horario ?` - ${row.horario}` : "";
      return `${index + 1}. ${row.animal} - ${formatNumber(row.litros)} L${horario}`;
    }).join("\n");
    const extra = registros.length > 20 ?`\n...e mais ${registros.length - 20} registro(s).` : "";
    return `Relatório de produção ${periodLabel(period)}:\nTotal: ${formatNumber(total)} litros\nRegistros: ${count}\n\n${detalhes}${extra}`;
  }

  if (parsed.tipo === "CONSULTA_PRODUCAO_ANIMAL") {
    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const animalReference = String(parsed.dados.animal_codigo || "").trim();
    const found = animalReference ?await findAnimal(supabase, owner, animalReference) : undefined;
    if (!found?.row) return `Não encontrei o animal "${animalReference || "informado"}" no cadastro.`;
    if (found.ambiguousRows?.length) {
      const options = found.ambiguousRows.slice(0, 5).map((row: AnyRecord) => row.brinco || row.nome).filter(Boolean).join(", ");
      return `Encontrei mais de um animal parecido. Tente pelo brinco cadastrado. Opções: ${options}.`;
    }

    const range = periodRange(period);
    const { data, error } = await supabase
      .from(TABLES.ordenhas)
      .select("litros")
      .eq("fazenda_id", owner.fazenda_id)
      .eq("animal_id", found.row.id)
      .gte("ordenhado_em", range.start)
      .lt("ordenhado_em", range.end);
    if (error) throw new Error(error.message);
    const total = (data || []).reduce((sum: number, row: AnyRecord) => sum + Number(row.litros || 0), 0);
    const count = (data || []).length;
    const label = found.row.brinco || found.row.nome || animalReference;
    parsed.dados.consulta_executada = "producao_animal";
    parsed.dados.resultado = { animal_id: found.row.id, animal: label, total_litros: total, registros: count, periodo: period };
    if (!count) return `Não encontrei produção registrada ${periodLabel(period)} para ${label}.`;
    return `${period === "hoje" ?"Hoje" : periodLabel(period)} a ${label} produziu ${formatNumber(total)} litros${count > 1 ?` no total em ${count} registros` : ""}.`;
  }

  if (parsed.tipo === "CONSULTA_FINANCEIRO") {
    return handleFinanceConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_ESTOQUE" || parsed.tipo === "CONSULTA_ESTOQUE_ITEM") {
    if (parsed.dados.item_nome) {
      const itemLabel = String(parsed.dados.item_nome || "").trim();
      const found = await findStockItem(supabase, owner, itemLabel);
      if (found.ambiguousRows?.length) {
        const options = found.ambiguousRows.slice(0, 5).map((row: AnyRecord) => row.nome).filter(Boolean).join(", ");
        return `Encontrei mais de um item parecido no estoque. Tente pelo nome cadastrado. Opções: ${options}.`;
      }
      if (!found.row) return `Não encontrei esse item${itemLabel ?` (${itemLabel})` : ""} no estoque deste rancho.`;

      const current = Number(found.row.quantidade_atual || 0);
      const minimum = Number(found.row.quantidade_minima || 0);
      const hasMinimum = Number.isFinite(minimum) && minimum > 0;
      const status = hasMinimum && current < minimum ?"abaixo do mínimo" : "ok";
      parsed.dados.consulta_executada = "estoque_item";
      parsed.dados.resultado = {
        item_id: found.row.id,
        item: found.row.nome,
        quantidade_atual: current,
        quantidade_minima: hasMinimum ?minimum : null,
        unidade: found.row.unidade_medida,
        status
      };
      return `Estoque de ${found.row.nome}: ${formatStockAmount(found.row.quantidade_atual, found.row.unidade_medida)} disponíveis no estoque.${hasMinimum ?` Mínimo: ${formatStockAmount(found.row.quantidade_minima, found.row.unidade_medida)}. Status: ${status}.` : ""}`;
    }
  }

  if (parsed.tipo === "CONSULTA_ESTOQUE" || parsed.tipo === "CONSULTA_ESTOQUE_GERAL") {
    return handleStockListConsultation(supabase, owner, parsed);
  }

  if (parsed.tipo === "CONSULTA_FUNCIONARIO") {
    if (parsed.dados.funcionario_nome) {
      if (!isBotAdmin(owner)) return "Você não tem permissão para consultar dados de funcionários pelo WhatsApp.";
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (found) {
        const field = String(parsed.dados.consulta_campo || "");
        if (field === "salario_base") return `${found.row.nome}: salário-base ${formatMoney(found.row.salario_base)}.`;
        if (field === "cpf") return `${found.row.nome}: CPF ${found.row.cpf || "não informado"}.`;
        if (field === "contato_whatsapp") return `${found.row.nome}: WhatsApp ${found.row.contato_whatsapp ?formatWhatsappForBot(found.row.contato_whatsapp) : "não informado"}.`;
        if (field === "funcao") return `${found.row.nome}: ${found.row.funcao || "função não informada"}.`;
        return [
          `${found.row.nome}: ${found.row.funcao || "função não informada"} - ${found.row.ativo === false ?"inativo" : "ativo"}.`,
          `Salário-base: ${formatMoney(found.row.salario_base)}.`,
          `WhatsApp: ${found.row.contato_whatsapp ?formatWhatsappForBot(found.row.contato_whatsapp) : "não informado"}.`,
          `Acesso: ${found.row.tipo_acesso || "bot_only"}.`
        ].join("\n");
      }
    }

    const { data, error } = await supabase
      .from(TABLES.funcionarios)
      .select("id,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(1000);
    if (error) throw new Error(error.message);
    const active = (data || []).filter((row: AnyRecord) => row.ativo !== false && !row.deleted_at).length;
    return `Funcionários ativos: ${active}.`;
  }

  if (parsed.tipo === "CONSULTA_FOLHA") {
    const consultaFolha = String(parsed.dados.consulta_folha || "");
    const isGeneral = ["geral", "faltantes", "resumo"].includes(consultaFolha) || !parsed.dados.funcionario_nome;
    if (isGeneral && !isBotAdmin(owner)) return "Você não tem permissão para consultar folha geral pelo WhatsApp.";

    const competencia = monthStartFromPaymentPeriod(String(parsed.dados.periodo_pagamento || "mes_atual"));

    if (parsed.dados.funcionario_nome) {
      if (!isBotAdmin(owner)) return "Você não tem permissão para consultar folha de funcionários pelo WhatsApp.";
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (!found?.row) return `Não encontrei o funcionário "${parsed.dados.funcionario_nome}".`;

      const { data, error } = await supabase
        .from(TABLES.folhaPagamento)
        .select("id,total_liquido,salario_base,adiantamentos,status,pago_em,competencia")
        .eq("fazenda_id", owner.fazenda_id)
        .eq("funcionario_id", found.row.id)
        .gte("competencia", competencia)
        .lt("competencia", monthRange(monthKeyFromDate(competencia)).end.slice(0, 10))
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return `${found.row.nome} ainda não tem pagamento registrado este mês. Salário-base previsto: ${formatMoney(found.row.salario_base)}.`;
      const total = Number(data.total_liquido ?? data.salario_base ?? 0);
      return `${found.row.nome} já tem folha este mês: ${formatMoney(total)}. Status: ${data.status || "rascunho"}${data.pago_em ?` em ${String(data.pago_em).slice(0, 10)}` : ""}.`;
    }

    const { data: employees, error: employeesError } = await supabase
      .from(TABLES.funcionarios)
      .select("id,nome,salario_base,ativo,deleted_at")
      .eq("fazenda_id", owner.fazenda_id)
      .limit(2000);
    if (employeesError) throw new Error(employeesError.message);
    const activeEmployees = ((employees || []) as AnyRecord[]).filter((row) => row.ativo !== false && !row.deleted_at);

    const { data: payrolls, error: payrollError } = await supabase
      .from(TABLES.folhaPagamento)
      .select("funcionario_id,total_liquido,salario_base,status,competencia")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("competencia", competencia)
      .lt("competencia", monthRange(monthKeyFromDate(competencia)).end.slice(0, 10))
      .limit(2000);
    if (payrollError) throw new Error(payrollError.message);

    const paid = new Set(((payrolls || []) as AnyRecord[]).filter((row) => row.status === "paga").map((row) => String(row.funcionario_id)));
    if (consultaFolha === "faltantes") {
      const missing = activeEmployees.filter((row) => !paid.has(String(row.id))).slice(0, 20);
      if (!missing.length) return "Todos os funcionários ativos têm pagamento registrado este mês.";
      return `Funcionários ainda sem pagamento no mês:\n${missing.map((row, index) => `${index + 1}. ${row.nome}`).join("\n")}`;
    }

    const paidTotal = ((payrolls || []) as AnyRecord[]).reduce((sum, row) => sum + Number(row.total_liquido ?? row.salario_base ?? 0), 0);
    const expectedTotal = activeEmployees.reduce((sum, row) => sum + Number(row.salario_base || 0), 0);
    return `Folha do mês: ${formatMoney(paidTotal)} pagos de ${formatMoney(expectedTotal)} previstos.`;
  }

  if (parsed.tipo === "CONSULTA_PONTO") {
    if (!isBotAdmin(owner)) return "Você não tem permissão para consultar ponto pelo WhatsApp.";
    const period = String(parsed.dados.periodo || parsed.dados.data_referencia || "hoje");
    const range = periodRange(period);
    let employeeId: string | null = null;
    let employeeName = "";

    if (parsed.dados.funcionario_nome) {
      const found = await findEmployee(supabase, owner, String(parsed.dados.funcionario_nome));
      if (!found?.row) return `Não encontrei o funcionário "${parsed.dados.funcionario_nome}".`;
      employeeId = String(found.row.id);
      employeeName = String(found.row.nome || parsed.dados.funcionario_nome);
    }

    let query = supabase
      .from(TABLES.registrosPonto)
      .select("funcionario_id,tipo,registrado_em")
      .eq("fazenda_id", owner.fazenda_id)
      .gte("registrado_em", range.start)
      .lt("registrado_em", range.end);
    if (employeeId) query = query.eq("funcionario_id", employeeId);

    const { data, error } = await query.limit(2000);
    if (error) throw new Error(error.message);
    const rows = (data || []) as AnyRecord[];
    parsed.dados.consulta_executada = "ponto";
    parsed.dados.resultado = { registros: rows.length, funcionario_id: employeeId, periodo: period };
    if (!rows.length) {
      return employeeId
        ?`Não encontrei ponto registrado ${periodLabel(period)} para ${employeeName}.`
        :`Não encontrei ponto registrado ${periodLabel(period)}.`;
    }
    const entradas = rows.filter((row) => row.tipo === "entrada").length;
    const saidas = rows.filter((row) => row.tipo === "saida").length;
    return employeeId
      ?`Ponto de ${employeeName} ${periodLabel(period)}: ${rows.length} registro(s), ${entradas} entrada(s) e ${saidas} saída(s).`
      :`Ponto ${periodLabel(period)}: ${rows.length} registro(s), ${entradas} entrada(s) e ${saidas} saída(s).`;
  }

  if (parsed.tipo === "CONSULTA_REGISTROS_HOJE") {
    if (parsed.dados.consulta_registros && parsed.dados.consulta_registros !== "whatsapp") {
      return handleEventsReportConsultation(supabase, owner, parsed);
    }
    if (parsed.dados.precisa_periodo) return handleEventsReportConsultation(supabase, owner, parsed);
    return handleTodayRecordsConsultation(supabase, owner, parsed);
  }

  return unknownText();
}
