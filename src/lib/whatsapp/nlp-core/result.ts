import type { AnyRecord } from "@/lib/types";
import { hasValue } from "@/lib/whatsapp/nlp-text";
import { formatBotNumber, formatStockQuantity, moneyText } from "@/lib/whatsapp/nlp-format";
import { BOT_EXAMPLES, animalOptionalFields, questionByField } from "./constants";
import type { ParsedRanchoMessage, RanchoIntent } from "./types";
import { hasAnimalOptionalValue, hasSkippedAnimalOptionalField, isValidBotPhone } from "./extractors";

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
    if (field === "quantidade" && tipo === "ESTOQUE_SAIDA" && dados.item_nome) {
      return `Qual quantidade de ${dados.item_nome} saiu do estoque?`;
    }
    if (field === "telefone" && tipo === "CRIAR_FUNCIONARIO" && dados.funcionario_nome) {
      return `Qual é o WhatsApp do funcionário ${dados.funcionario_nome}?Envie com DDD.`;
    }
    if (field === "campo_alterado" && tipo === "ATUALIZAR_FUNCIONARIO") {
      return "Qual dado do funcionário deseja alterar?Exemplos: salário, cargo, WhatsApp ou CPF.";
    }
    if (field === "novo_valor" && tipo === "ATUALIZAR_FUNCIONARIO") {
      return "Qual novo valor deve ficar no cadastro do funcionário?";
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

  if (["ESTOQUE_CADASTRO", "CRIAR_ITEM_ESTOQUE"].includes(tipo)) return `criar novo item de estoque${dados.item_nome ?` chamado ${dados.item_nome}` : ""}${dados.unidade ?`, unidade ${dados.unidade}` : ""}${hasValue(dados.quantidade) ?`, quantidade inicial ${formatBotNumber(dados.quantidade)}` : ""}`;

  if (tipo === "ESTOQUE_ENTRADA" && dados.compra && hasValue(dados.valor)) {
    return `adicionar ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} ao estoque e registrar despesa de ${moneyText(dados.valor)}${dados.item_nome ?` com ${dados.item_nome}` : ""}`;
  }

  if (tipo === "ESTOQUE_ENTRADA") return `adicionar ${formatStockQuantity(dados.quantidade, dados.unidade)} de ${dados.item_nome || "item"} ao estoque`;

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

  if (tipo === "ATUALIZAR_FUNCIONARIO") {
    const valor = hasValue(dados.novo_valor) ?` para ${dados.campo_alterado === "salario_base" ?moneyText(dados.novo_valor) : dados.novo_valor}` : "";
    return `alterar ${dados.campo_alterado || "dados"} do funcionário ${dados.funcionario_nome || "informado"}${valor}`;
  }

  if (tipo === "DESLIGAR_FUNCIONARIO") return `desligar funcionário ${dados.funcionario_nome || "informado"}`;
  if (tipo === "EXCLUIR_FUNCIONARIO") return `excluir funcionário ${dados.funcionario_nome || "informado"}`;

  if (tipo === "CADASTRO_ANIMAL") {
    const details = [
      dados.sexo ?`sexo ${dados.sexo}` : "",
      dados.fase ?`fase ${dados.fase}` : "",
      dados.raca ?`raça ${dados.raca}` : "",
      dados.lote_nome ?`lote ${dados.lote_nome}` : "",
      dados.data_nascimento ?`nascimento ${dados.data_nascimento}` : ""
    ].filter(Boolean);
    return `cadastrar ${dados.categoria || "animal"}${dados.nome ?` ${dados.nome}` : ""}${dados.animal_codigo ?` com brinco ${dados.animal_codigo}` : ""}${details.length ?` (${details.join(", ")})` : ""}`;
  }

  if (tipo === "CONSULTA_PRODUCAO") return "consultar produção de leite";
  if (tipo === "CONSULTA_PRODUCAO_HOJE") return "consultar produção de leite de hoje";
  if (tipo === "CONSULTA_PRODUCAO_ANIMAL") return `consultar produção${dados.animal_codigo ?` do animal ${dados.animal_codigo}` : ""}`;
  if (tipo === "ATUALIZACAO_ANIMAL") {
    const value = hasValue(dados.novo_valor) ?` para ${dados.novo_valor}` : "";
    return `atualizar ${dados.campo_alterado || "dados"} do animal ${dados.animal_codigo || "informado"}${value}`;
  }

  if (tipo === "CONSULTA_ANIMAL") return `consultar animal${dados.animal_codigo ?` ${dados.animal_codigo}` : ""}`;

  if (tipo === "CONSULTA_FINANCEIRO") return "consultar financeiro";
  if (tipo === "CONSULTA_ESTOQUE") return dados.item_nome ?`consultar estoque de ${dados.item_nome}` : "consultar estoque";
  if (tipo === "CONSULTA_ESTOQUE_ITEM") return dados.item_nome ?`consultar estoque de ${dados.item_nome}` : "consultar item do estoque";
  if (tipo === "CONSULTA_ESTOQUE_GERAL") return "consultar resumo do estoque";
  if (tipo === "CONSULTA_FUNCIONARIO") return dados.funcionario_nome ?`consultar funcionário ${dados.funcionario_nome}` : "consultar funcionários";
  if (tipo === "CONSULTA_PONTO") return dados.funcionario_nome ?`consultar ponto de ${dados.funcionario_nome}` : "consultar ponto";
  if (tipo === "ORDEM_SERVICO") return `registrar ordem de serviço: ${dados.descricao || "serviço informado"}`;
  if (tipo === "CONSULTA_REGISTROS_HOJE") return "consultar registros de hoje";
  if (tipo === "LOTE_REGISTROS") {
    const registros = Array.isArray(dados.registros) ?dados.registros : [];
    return `registrar ${registros.length || dados.total_registros || 0} registros em lote`;
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
  if (["PRODUCAO_LEITE", "PARTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL"].includes(tipo) && !dados.animal_codigo) missing.push("animal_codigo");
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
  if (tipo === "ESTOQUE_ENTRADA" && dados.compra && !hasValue(dados.valor)) missing.push("valor");
  if (tipo === "CRIAR_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "CRIAR_FUNCIONARIO" && (dados.telefone_obrigatorio || dados.tipo_acesso === "bot_only") && !isValidBotPhone(dados.telefone)) missing.push("telefone");
  if (tipo === "ATUALIZAR_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "ATUALIZAR_FUNCIONARIO" && !dados.campo_alterado) missing.push("campo_alterado");
  if (tipo === "ATUALIZAR_FUNCIONARIO" && !hasValue(dados.novo_valor)) missing.push("novo_valor");
  if (["DESLIGAR_FUNCIONARIO", "EXCLUIR_FUNCIONARIO"].includes(tipo) && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.funcionario_nome) missing.push("funcionario_nome");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.ponto_tipo) missing.push("ponto_tipo");
  if (tipo === "PONTO_FUNCIONARIO" && !dados.horario && !dados.agora) missing.push("horario");
  if (tipo === "CADASTRO_ANIMAL") {
    if (!dados.animal_codigo) missing.push("animal_codigo");
    if (!dados.categoria) missing.push("categoria_animal");
    if (missing.length) return missing;

    animalOptionalFields.forEach((field) => {
      if (!hasAnimalOptionalValue(dados, field) && !hasSkippedAnimalOptionalField(dados, field)) {
        missing.push(field);
      }
    });
  }
  if (tipo === "ATUALIZACAO_ANIMAL") {
    if (!dados.campo_alterado) missing.push("campo_alterado");
    if (!hasValue(dados.novo_valor)) missing.push("novo_valor");
  }
  return missing;
}

export function refreshRanchoMessage(parsed: ParsedRanchoMessage, dados: AnyRecord = parsed.dados): ParsedRanchoMessage {
  return finalize(parsed.tipo, dados, buildMissing(parsed.tipo, dados), parsed.confianca);
}
