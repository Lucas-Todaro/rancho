import type { AnyRecord } from "@/lib/types";
import { hasValue } from "@/lib/whatsapp/nlp-text";
import { formatBotNumber, formatStockQuantity, moneyText } from "@/lib/whatsapp/nlp-format";
import { BOT_EXAMPLES, animalOptionalFields, questionByField } from "./constants";
import type { ParsedRanchoMessage, RanchoIntent } from "./types";
import { hasAnimalOptionalValue, hasSkippedAnimalOptionalField, isValidBotPhone } from "./extractors";
import { reproductiveEventLabel, type ReproductiveEventKind } from "./reproductive-events";

function missingQuestions(fields: string[], tipo: RanchoIntent, dados: AnyRecord) {
  return fields.map((field) => {
    if (field === "animal_codigo" && dados.animal_referencia_nao_encontrada) {
      if (Array.isArray(dados.animal_opcoes) && dados.animal_opcoes.length) {
        return `Encontrei mais de um animal parecido com ${dados.animal_referencia_nao_encontrada}. Qual é o brinco correto?${dados.animal_opcoes.slice(0, 5).join(", ")}`;
      }
      return `Não encontrei um animal cadastrado como ${dados.animal_referencia_nao_encontrada}. Qual é o brinco ou código do animal?`;
    }
    if (field === "lote_animal" && dados.lote_nao_encontrado) {
      return `Não encontrei o lote "${dados.lote_nao_encontrado}". Envie o nome de um lote já cadastrado ou 2 para pular.`;
    }
    if (dados.campo_obrigatorio_pulado === field) {
      return `Esse campo é obrigatório. ${questionByField[field] || "Informe o dado para continuar."}`;
    }
    if (field === "unidade" && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) {
      return "Qual unidade padrão?Exemplos: kg, saco, unidade, dose, fardo.";
    }
    if (field === "quantidade" && ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) {
      return "Qual quantidade inicial? Se não tiver, responda 0.";
    }
    if (field === "quantidade" && ["ESTOQUE_CADASTRO", "ESTOQUE_ENTRADA"].includes(tipo) && dados.item_nome) {
      return `Qual quantidade de ${dados.item_nome} entrou no estoque?`;
    }
    if (field === "valor" && tipo === "ESTOQUE_ENTRADA" && dados.compra) {
      return "Quanto custou essa compra?";
    }
    if (field === "valor" && tipo === "ESTOQUE_SAIDA" && dados.venda) {
      return `Entendi que você vendeu ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"}. Qual foi o valor da venda?`;
    }
    if (field === "quantidade" && tipo === "ESTOQUE_SAIDA" && dados.item_nome) {
      return `Qual quantidade de ${dados.item_nome} saiu do estoque?`;
    }
    if (field === "telefone" && tipo === "CRIAR_FUNCIONARIO" && dados.funcionario_nome) {
      return `Qual é o WhatsApp do funcionário ${dados.funcionario_nome}?Envie com DDD.`;
    }
    if (field === "valor" && tipo === "PAGAMENTO_FUNCIONARIO" && dados.funcionario_nome) {
      return `Qual foi o valor pago ao ${dados.funcionario_nome}?`;
    }
    if (field === "campo_alterado" && tipo === "ATUALIZAR_FUNCIONARIO") {
      return "Qual dado do funcionário deseja alterar?Exemplos: salário, cargo, WhatsApp ou CPF.";
    }
    if (field === "novo_valor" && tipo === "ATUALIZAR_FUNCIONARIO") {
      return "Qual novo valor deve ficar no cadastro do funcionário?";
    }
    if (field === "mae_nome" && tipo === "ATUALIZACAO_GENEALOGIA" && dados.mae_referencia_nao_encontrada) {
      if (Array.isArray(dados.mae_opcoes) && dados.mae_opcoes.length) {
        return `Encontrei mais de uma opção para mãe (${dados.mae_referencia_nao_encontrada}). Qual é o brinco correto? ${dados.mae_opcoes.slice(0, 5).join(", ")}`;
      }
      return `Não encontrei "${dados.mae_referencia_nao_encontrada}" no rebanho. Quem é a mãe?`;
    }
    if (field === "pai_nome" && tipo === "ATUALIZACAO_GENEALOGIA" && dados.pai_referencia_nao_encontrada) {
      if (Array.isArray(dados.pai_opcoes) && dados.pai_opcoes.length) {
        return `Encontrei mais de uma opção para pai (${dados.pai_referencia_nao_encontrada}). Qual é o brinco correto? ${dados.pai_opcoes.slice(0, 5).join(", ")}`;
      }
      return `Não encontrei "${dados.pai_referencia_nao_encontrada}" no rebanho. Quem é o pai?`;
    }
    return questionByField[field];
  }).filter(Boolean);
}

function buildResumo(tipo: RanchoIntent, dados: AnyRecord) {
  if (tipo === "PRODUCAO_LEITE") {
    return `registrar produção de leite${dados.animal_codigo ?` do animal ${dados.animal_codigo}` : ""}${hasValue(dados.litros) ?` com ${formatBotNumber(dados.litros)} litros` : ""}${dados.data_referencia ?` (${dados.data_referencia})` : ""}`;
  }

  if (tipo === "PARTO") return `registrar parto${dados.animal_codigo ?` do animal ${dados.animal_codigo}` : ""}${dados.data_referencia ?` (${dados.data_referencia})` : ""}`;

  if (tipo === "VACINA_MEDICAMENTO") {
    const evento = dados.evento_tipo === "vacina" ?"vacina" : "tratamento";
    const produto = dados.produto ?`${evento === "vacina" ?" de" : " com"} ${dados.produto}` : "";
    return `registrar ${evento}${produto}${dados.animal_codigo ?` no animal ${dados.animal_codigo}` : ""}`;
  }

  if (tipo === "MORTE") return `registrar morte do animal ${dados.animal_codigo || "informado"}${dados.data_referencia ?` (${dados.data_referencia})` : ""}`;

  if (tipo === "DESPESA") return `registrar saída financeira${dados.valor ?` de ${moneyText(dados.valor)}` : ""}${dados.descricao ?` (${dados.descricao})` : ""}`;

  if (tipo === "RECEITA_VENDA") return `registrar entrada financeira${dados.valor ?` de ${moneyText(dados.valor)}` : ""}${dados.descricao ?` (${dados.descricao})` : ""}`;

  if (["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) {
    const financeText = dados.compra && hasValue(dados.valor) ?` e registrar despesa de ${moneyText(dados.valor)}` : "";
    return `criar novo item de estoque${dados.item_nome ?` chamado ${dados.item_nome}` : ""}${dados.unidade ?`, unidade ${dados.unidade}` : ""}${hasValue(dados.quantidade) ?`, quantidade inicial ${formatBotNumber(dados.quantidade)}` : ""}${financeText}`;
  }

  if (tipo === "ESTOQUE_ENTRADA" && dados.compra && hasValue(dados.valor)) {
    return `adicionar ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} ao estoque e registrar despesa de ${moneyText(dados.valor)}${dados.item_nome ?` com ${dados.item_nome}` : ""}`;
  }

  if (tipo === "ESTOQUE_ENTRADA") return `adicionar ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} ao estoque`;

  if (tipo === "ESTOQUE_SAIDA" && dados.venda && hasValue(dados.valor)) {
    return `registrar receita de ${moneyText(dados.valor)} com venda de ${dados.item_nome || "item"} e dar baixa de ${formatStockQuantity(dados.quantidade, dados.unidade)} no estoque`;
  }

  if (tipo === "ESTOQUE_SAIDA" && dados.venda) return `vender ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"}`;

  if (tipo === "ESTOQUE_SAIDA") return `dar baixa de ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} no estoque`;

  if (tipo === "PONTO_FUNCIONARIO") return `registrar ${dados.ponto_tipo || "ponto"} de ${dados.funcionario_nome || "funcionário"}${dados.horario ?` às ${dados.horario}` : ""}`;

  if (tipo === "CRIAR_FUNCIONARIO") {
    const detalhes = [
      dados.funcao ?`função ${dados.funcao}` : "",
      hasValue(dados.salario_base) ?`salário ${moneyText(dados.salario_base)}` : "",
      dados.cpf ?`CPF ${dados.cpf}` : "",
      dados.telefone ?`WhatsApp ${dados.telefone}` : "",
      dados.tipo_acesso ?`acesso ${dados.tipo_acesso}` : ""
    ].filter(Boolean);
    return `cadastrar funcionário${dados.funcionario_nome ?` ${dados.funcionario_nome}` : ""}${detalhes.length ?` (${detalhes.join(", ")})` : ""}`;
  }

  if (tipo === "PAGAMENTO_FUNCIONARIO") {
    const type = String(dados.pagamento_tipo || "salario");
    const period = dados.periodo_pagamento === "mes_anterior" ? "mês anterior" : dados.periodo_pagamento === "hoje" ? "hoje" : "mês atual";
    return `registrar pagamento de ${type} para ${dados.funcionario_nome || "funcionário"}${hasValue(dados.valor) ?` no valor de ${moneyText(dados.valor)}` : ""} referente ao ${period} e lançar saída financeira`;
  }

  if (tipo === "ATUALIZAR_FUNCIONARIO") {
    const valor = hasValue(dados.novo_valor) ?` para ${dados.campo_alterado === "salario_base" ?moneyText(dados.novo_valor) : dados.novo_valor}` : "";
    return `alterar ${dados.campo_alterado || "dados"} do funcionário ${dados.funcionario_nome || "informado"}${valor}`;
  }

  if (tipo === "DESLIGAR_FUNCIONARIO") return `desligar funcionário ${dados.funcionario_nome || "informado"}`;
  if (tipo === "EXCLUIR_FUNCIONARIO") return `excluir funcionário ${dados.funcionario_nome || "informado"}`;

  if (tipo === "CADASTRO_ANIMAL") {
    const sexDetail = dados.sexo
      ?dados.sexo_origem === "inferido_categoria" && dados.sexo_inferido_categoria
        ?`sexo ${dados.sexo} (inferido pela categoria ${dados.sexo_inferido_categoria})`
        : `sexo ${dados.sexo}`
      : "";
    const details = [
      sexDetail,
      dados.fase ?`fase ${dados.fase}` : "",
      dados.peso ?`peso ${dados.peso} kg` : "",
      dados.raca ?`raça ${dados.raca}` : "",
      dados.lote_nome ?`lote ${dados.lote_nome}` : "",
      dados.data_nascimento ?`nascimento ${dados.data_nascimento}` : ""
    ].filter(Boolean);
    return `cadastrar ${dados.categoria || "animal"}${dados.nome ?` ${dados.nome}` : ""}${dados.animal_codigo ?` com brinco ${dados.animal_codigo}` : ""}${details.length ?` (${details.join(", ")})` : ""}`;
  }

  if (tipo === "CRIAR_LOTE") return `criar lote${dados.lote_nome ?` ${dados.lote_nome}` : ""}`;
  if (tipo === "CONSULTA_REBANHO") {
    const filtros = [
      dados.categoria ?`categoria ${dados.categoria}` : "",
      dados.sexo ?`sexo ${dados.sexo}` : "",
      dados.status ?`status ${dados.status}` : "",
      dados.reproducao ?`reproduÃ§Ã£o ${dados.reproducao}` : "",
      dados.lote_nome ?`lote ${dados.lote_nome}` : "",
      dados.sem_lote ?"sem lote" : ""
    ].filter(Boolean);
    return `consultar rebanho${filtros.length ?` (${filtros.join(", ")})` : ""}`;
  }
  if (tipo === "CONSULTA_LOTES") return dados.lote_nome ?`consultar lote ${dados.lote_nome}` : "consultar lotes";

  if (tipo === "CONSULTA_PRODUCAO") return "consultar produção de leite";
  if (tipo === "CONSULTA_PRODUCAO_HOJE") return "consultar produção de leite de hoje";
  if (tipo === "CONSULTA_PRODUCAO_ANIMAL") return `consultar produção${dados.animal_codigo ?` do animal ${dados.animal_codigo}` : ""}`;
  if (tipo === "ATUALIZACAO_GENEALOGIA") {
    const removals = [
      dados.remover_mae ? "remover mãe" : "",
      dados.remover_pai ? "remover pai" : ""
    ].filter(Boolean);
    const changes = [
      dados.mae_nome ?`mãe ${dados.mae_nome}` : "",
      dados.pai_nome ?`pai ${dados.pai_nome}` : "",
      ...removals
    ].filter(Boolean);
    return `atualizar genealogia do animal ${dados.animal_codigo || "informado"}${changes.length ?`: ${changes.join(", ")}` : ""}`;
  }

  if (tipo === "CONSULTA_GENEALOGIA") {
    const label = dados.consulta_genealogia || "genealogia";
    return `consultar ${label}${dados.animal_codigo ?` do animal ${dados.animal_codigo}` : ""}`;
  }

  if (tipo === "ATUALIZACAO_ANIMAL") {
    if (dados.registro_evento_animal) {
      const reproductiveKind = dados.evento_reprodutivo_tipo as ReproductiveEventKind | undefined;
      const evento = dados.evento_tipo === "reprodutivo"
        ? (reproductiveKind ? reproductiveEventLabel(reproductiveKind).toLowerCase() : "ocorrência reprodutiva")
        : "ocorrência clínica";
      const custo = hasValue(dados.custo || dados.valor) ?` com custo de ${moneyText(dados.custo || dados.valor)}` : "";
      return `registrar ${evento}${dados.animal_codigo ?` para ${dados.animal_codigo}` : ""}${custo}${dados.descricao ?`: ${dados.descricao}` : ""}`;
    }
    if (dados.campo_alterado === "observacoes") {
      return `registrar observação de saúde${dados.animal_codigo ?` para ${dados.animal_codigo}` : ""}${dados.novo_valor ?`: ${dados.novo_valor}` : ""}`;
    }
    const value = hasValue(dados.novo_valor) ?` para ${dados.novo_valor}` : "";
    return `atualizar ${dados.campo_alterado || "dados"} do animal ${dados.animal_codigo || "informado"}${value}`;
  }

  if (tipo === "CONSULTA_ANIMAL") return `consultar animal${dados.animal_codigo ?` ${dados.animal_codigo}` : ""}`;

  if (tipo === "CONSULTA_FINANCEIRO") return "consultar financeiro";
  if (tipo === "CONSULTA_ESTOQUE") return dados.item_nome ?`consultar estoque de ${dados.item_nome}` : "consultar estoque";
  if (tipo === "CONSULTA_ESTOQUE_ITEM") return dados.item_nome ?`consultar estoque de ${dados.item_nome}` : "consultar item do estoque";
  if (tipo === "CONSULTA_ESTOQUE_GERAL") return "consultar resumo do estoque";
  if (tipo === "CONSULTA_FUNCIONARIO") return dados.funcionario_nome ?`consultar funcionário ${dados.funcionario_nome}` : "consultar funcionários";
  if (tipo === "CONSULTA_FOLHA") return dados.funcionario_nome ?`consultar folha de ${dados.funcionario_nome}` : "consultar folha de pagamento";
  if (tipo === "CONSULTA_PONTO") return dados.funcionario_nome ?`consultar ponto de ${dados.funcionario_nome}` : "consultar ponto";
  if (tipo === "ORDEM_SERVICO") return `registrar ordem de serviço: ${dados.descricao || "serviço informado"}`;
  if (tipo === "CONSULTA_REGISTROS_HOJE") return "consultar registros de hoje";
  if (tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros : [];
    return `registrar ${registros.length || dados.total_registros || 0} registros em lote`;
  }
  if (tipo === "IMPORTACAO_EVENTOS_TABELA") {
    return `importar ${dados.total_linhas || 0} eventos do rebanho por tabela`;
  }
  if (tipo === "IMPORTACAO_ANIMAIS_TABELA") {
    return `cadastrar ${dados.total_linhas || 0} animais por tabela`;
  }
  if (tipo === "IMPORTACAO_ESTOQUE_TABELA") {
    return `importar ${dados.total_linhas || 0} movimentacoes de estoque por tabela`;
  }
  if (tipo === "IMPORTACAO_TABELA_AMBIGUA") {
    return "identificar tipo de tabela enviada";
  }
  if (tipo === "AJUDA") return "mostrar ajuda do bot";

  return `Não consegui entender certinho. Você pode tentar assim:\n${BOT_EXAMPLES.join("\n")}`;
}

export function finalize(tipo: RanchoIntent, dados: AnyRecord, missingFields: string[], confidence?: number): ParsedRanchoMessage {
  if (tipo === "DESCONHECIDO") {
    return {
      tipo,
      confianca: 0.2,
      dados: {},
      resumo: buildResumo(tipo, {}),
      perguntas_faltantes: []
    };
  }

  const complete = missingFields.length === 0;
  return {
    tipo,
    confianca: confidence ?? (complete ? 0.9 : 0.65),
    dados,
    resumo: buildResumo(tipo, dados),
    perguntas_faltantes: missingQuestions(missingFields, tipo, dados)
  };
}

export function buildMissing(tipo: RanchoIntent, dados: AnyRecord) {
  const missing: string[] = [];
  const stockCreateIntent = ["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo);
  const stockMovementIntent = ["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA"].includes(tipo);
  if (["PRODUCAO_LEITE", "PARTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL", "ATUALIZACAO_GENEALOGIA", "CONSULTA_GENEALOGIA"].includes(tipo) && !dados.animal_codigo) missing.push("animal_codigo");
  if (tipo === "PRODUCAO_LEITE" && (!hasValue(dados.litros) || Number(dados.litros) <= 0)) missing.push("litros");
  if (tipo === "VACINA_MEDICAMENTO" && !dados.animal_codigo) missing.push("animal_codigo");
  if (tipo === "VACINA_MEDICAMENTO" && !dados.produto) missing.push("produto");
  if (["DESPESA", "RECEITA_VENDA"].includes(tipo) && (!hasValue(dados.valor) || Number(dados.valor) <= 0)) missing.push("valor");
  if (["DESPESA", "RECEITA_VENDA"].includes(tipo) && !dados.descricao) missing.push("descricao");
  if ((stockCreateIntent || stockMovementIntent) && !dados.item_nome) missing.push("item_nome");
  if (stockCreateIntent && !dados.unidade) missing.push("unidade");
  if (stockCreateIntent && !hasValue(dados.quantidade)) missing.push("quantidade");
  if (stockMovementIntent && !hasValue(dados.quantidade)) missing.push("quantidade");
  if (stockMovementIntent && !dados.unidade) missing.push("unidade");
  if (tipo === "ESTOQUE_SAIDA" && dados.venda && !hasValue(dados.valor)) missing.push("valor");
  if (tipo === "CRIAR_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "CRIAR_FUNCIONARIO" && !isValidBotPhone(dados.telefone)) missing.push("telefone");
  if (tipo === "CRIAR_FUNCIONARIO" && !dados.funcao) missing.push("funcao");
  if (tipo === "CRIAR_FUNCIONARIO" && !dados.data_admissao) missing.push("data_admissao");
  if (tipo === "ATUALIZAR_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "ATUALIZAR_FUNCIONARIO" && !dados.campo_alterado) missing.push("campo_alterado");
  if (tipo === "ATUALIZAR_FUNCIONARIO" && !hasValue(dados.novo_valor)) missing.push("novo_valor");
  if (["DESLIGAR_FUNCIONARIO", "EXCLUIR_FUNCIONARIO"].includes(tipo) && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PAGAMENTO_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PAGAMENTO_FUNCIONARIO" && (!hasValue(dados.valor) || Number(dados.valor) <= 0)) missing.push("valor");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.ponto_tipo) missing.push("ponto_tipo");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.horario && !dados.agora) missing.push("horario");
  if (tipo === "CRIAR_LOTE" && !dados.lote_nome) missing.push("lote_nome");
  if (tipo === "CADASTRO_ANIMAL") {
    if (!dados.animal_codigo) missing.push("animal_codigo");
    if (!dados.categoria) missing.push("categoria_animal");
    if (!missing.length) {
      for (const field of animalOptionalFields) {
        if (!hasAnimalOptionalValue(dados, field) && !hasSkippedAnimalOptionalField(dados, field)) missing.push(field);
      }
    }
  }
  if (tipo === "ATUALIZACAO_ANIMAL") {
    if (!dados.animal_codigo) missing.push("animal_codigo");
    if (!dados.campo_alterado) missing.push("campo_alterado");
    if (!hasValue(dados.novo_valor)) missing.push("novo_valor");
  }
  if (tipo === "ATUALIZACAO_GENEALOGIA") {
    const wantsMae = dados.genealogia_campo === "mae" || dados.genealogia_campo === "ambos" || dados.mae_nome || dados.remover_mae;
    const wantsPai = dados.genealogia_campo === "pai" || dados.genealogia_campo === "ambos" || dados.pai_nome || dados.remover_pai;
    if (!wantsMae && !wantsPai) missing.push("genealogia_campo");
    if (wantsMae && !dados.remover_mae && !dados.mae_nome) missing.push("mae_nome");
    if (wantsPai && !dados.remover_pai && !dados.pai_nome) missing.push("pai_nome");
  }
  return missing;
}

export function refreshRanchoMessage(parsed: ParsedRanchoMessage, dados: AnyRecord = parsed.dados): ParsedRanchoMessage {
  return finalize(parsed.tipo, dados, buildMissing(parsed.tipo, dados), parsed.confianca);
}
