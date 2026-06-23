import { BOT_EXAMPLES, type ParsedRanchoMessage } from "@/lib/whatsapp/nlp";

export const PENDING_ACTION_CANCELLED_MESSAGE = "Beleza, cancelei essa acao. Nada foi salvo.";
export const NO_PENDING_ACTION_MESSAGE = "Nao ha acao pendente para cancelar.";

export function intentLabel(tipo: ParsedRanchoMessage["tipo"]) {
  const labels: Record<ParsedRanchoMessage["tipo"], string> = {
    PRODUCAO_LEITE: "produção de leite",
    PARTO: "parto",
    VACINA_MEDICAMENTO: "vacina ou medicamento",
    MORTE: "morte de animal",
    DESPESA: "saída financeira",
    RECEITA_VENDA: "entrada financeira",
    CRIAR_ITEM_ESTOQUE: "criação de item no estoque",
    ESTOQUE_CADASTRO: "cadastro de item no estoque",
    ESTOQUE_ENTRADA: "entrada de estoque",
    ESTOQUE_SAIDA: "baixa de estoque",
    CRIAR_FUNCIONARIO: "cadastro de funcionário",
    ATUALIZAR_FUNCIONARIO: "atualização de funcionário",
    DESLIGAR_FUNCIONARIO: "desligamento de funcionário",
    EXCLUIR_FUNCIONARIO: "exclusão de funcionário",
    PAGAMENTO_FUNCIONARIO: "pagamento de funcionário",
    PONTO_FUNCIONARIO: "registro de ponto",
    CADASTRO_ANIMAL: "cadastro de animal",
    EXCLUIR_REBANHO: "exclusão do rebanho",
    ACAO_DESTRUTIVA_EM_MASSA: "ação destrutiva em massa bloqueada",
    ATUALIZACAO_ANIMAL: "atualização de animal",
    CONSULTA_ANIMAL: "consulta de animal",
    CRIAR_LOTE: "cadastro de lote",
    CONSULTA_REBANHO: "consulta de rebanho",
    CONSULTA_LOTES: "consulta de lotes",
    ATUALIZACAO_GENEALOGIA: "atualização de genealogia",
    CONSULTA_GENEALOGIA: "consulta de genealogia",
    CONSULTA_PRODUCAO: "consulta de produção",
    CONSULTA_PRODUCAO_HOJE: "consulta de produção",
    CONSULTA_PRODUCAO_ANIMAL: "consulta de produção por animal",
    CONSULTA_FINANCEIRO: "consulta financeira",
    CONSULTA_ESTOQUE: "consulta de estoque",
    CONSULTA_ESTOQUE_ITEM: "consulta de estoque",
    CONSULTA_ESTOQUE_GERAL: "consulta de estoque",
    CONSULTA_FUNCIONARIO: "consulta de funcionário",
    CONSULTA_FOLHA: "consulta de folha",
    CONSULTA_PONTO: "consulta de ponto",
    CONSULTA_REGISTROS_HOJE: "consulta de registros",
    ORDEM_SERVICO: "ordem de serviço",
    LOTE_REGISTROS: "registros em lote",
    IMPORTACAO_EVENTOS_TABELA: "importação de eventos por tabela",
    IMPORTACAO_ANIMAIS_TABELA: "cadastro de animais por tabela",
    IMPORTACAO_ESTOQUE_TABELA: "importação de estoque por tabela",
    IMPORTACAO_TABELA_DOMINIO: "importação tabular por domínio",
    IMPORTACAO_TABELA_AMBIGUA: "tabela enviada",
    AJUDA: "ajuda",
    DESCONHECIDO: "uma mensagem"
  };
  return labels[tipo];
}

export function missingText(parsed: ParsedRanchoMessage) {
  return `Entendi que é ${intentLabel(parsed.tipo)}.\n${parsed.perguntas_faltantes[0] || "Qual dado faltou?"}`;
}

export function unknownText() {
  return `Não consegui entender certinho. Você quer registrar produção, financeiro, estoque, funcionário ou ponto?\n\nExemplos:\n${BOT_EXAMPLES.join("\n")}`;
}

export function helpText() {
  return `Pode mandar do seu jeito. Eu entendo frases como:\n${BOT_EXAMPLES.join("\n")}\n\nAntes de salvar qualquer coisa, eu sempre vou pedir confirmação.`;
}

export function ownerBlockedMessage(reason: string | null | undefined) {
  if (reason === "no_farm") {
    return "Não encontrei um rancho vinculado a este WhatsApp.";
  }
  if (reason === "farm_inactive") {
    return "O acesso deste rancho não está ativo no momento. Fale com o administrador ou suporte.";
  }
  if (reason === "user_inactive") {
    return "Este WhatsApp está cadastrado, mas está inativo para usar o bot. Fale com o administrador do Rancho.";
  }
  if (reason === "multiple_farms") {
    return "Encontrei este WhatsApp em mais de um rancho. Peça ao administrador para definir qual rancho deve usar o bot.";
  }
  return "Este WhatsApp ainda não está autorizado a usar o bot do Rancho. Peça ao administrador para cadastrar seu número na aba WhatsApp do sistema.";
}
