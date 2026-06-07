module.exports = function loadBotTestSection(context) {
  with (context) {
    const employeePointPayrollParserTests = [
      { module: "funcionarios", phrase: "cadastra funcionario Bruno", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", missing: ["whatsapp", "funcao", "data"] } },
      { module: "funcionarios", phrase: "cadastra Bruno salario 1500", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", salario_base: 1500, missing: ["whatsapp", "funcao", "data"] } },
      { module: "funcionarios", phrase: "cadastra funcionario Ana WhatsApp 31999999999", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Ana", telefone: "5531999999999", missing: ["funcao", "data"] } },
      { module: "funcionarios", phrase: "cadastra Bruno so no WhatsApp", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", tipo_acesso: "bot_only", missing: ["telefone"] } },
      { module: "funcionarios", phrase: "Bruno trabalha como vaqueiro", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Bruno", missing: ["whatsapp", "data"] } },
      { module: "funcionarios", phrase: "adicionar colaboradora Ana telefone 31999999999", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Ana", telefone: "5531999999999", missing: ["funcao", "data"] } },
      { module: "funcionarios", phrase: "criar funcionario Pedro cpf 12345678901 salario 2200 cargo vaqueiro", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Pedro", cpf: "12345678901", salario_base: 2200, missing: ["whatsapp", "funcao", "data"] } },
      { module: "funcionarios", phrase: "novo funcionario Carlos", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Carlos", missing: ["whatsapp", "funcao", "data"] } },
      { module: "funcionarios", phrase: "contratei Maria", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Maria", missing: ["whatsapp", "funcao", "data"] } },
      { module: "funcionarios", phrase: "cadastrar funcionario Rafael salario 1900", expected: { tipo: "CRIAR_FUNCIONARIO", funcionario_nome: "Rafael", salario_base: 1900, missing: ["whatsapp", "funcao", "data"] } },
      { module: "funcionarios", phrase: "muda salario do Bruno para 1800", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Bruno", campo_alterado: "salario_base", novo_valor: 1800, noMissing: true } },
      { module: "funcionarios", phrase: "Bruno agora ganha 2000", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Bruno", campo_alterado: "salario_base", novo_valor: 2000, noMissing: true } },
      { module: "funcionarios", phrase: "altera cargo da Ana para gerente", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Ana", campo_alterado: "funcao", novo_valor: "gerente", noMissing: true } },
      { module: "funcionarios", phrase: "trocar WhatsApp do Joao para 31988887777", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Joao", campo_alterado: "contato_whatsapp", novo_valor: "5531988887777", noMissing: true } },
      { module: "funcionarios", phrase: "alterar cpf do Joao para 12345678901", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Joao", campo_alterado: "cpf", novo_valor: "12345678901", noMissing: true } },
      { module: "funcionarios", phrase: "reativar funcionario Joao", expected: { tipo: "ATUALIZAR_FUNCIONARIO", funcionario_nome: "Joao", campo_alterado: "ativo", novo_valor: true, noMissing: true } },
      { module: "funcionarios", phrase: "desliga funcionario Bruno", expected: { tipo: "DESLIGAR_FUNCIONARIO", funcionario_nome: "Bruno", noMissing: true } },
      { module: "funcionarios", phrase: "exclui funcionario Pedro", expected: { tipo: "EXCLUIR_FUNCIONARIO", funcionario_nome: "Pedro", noMissing: true } },
      { module: "funcionarios", phrase: "apagar colaborador Ana", expected: { tipo: "EXCLUIR_FUNCIONARIO", funcionario_nome: "Ana", noMissing: true } },
      { module: "funcionarios", phrase: "Bruno nao trabalha mais", expected: { tipo: "DESLIGAR_FUNCIONARIO", funcionario_nome: "Bruno", noMissing: true } },
      { module: "funcionarios", phrase: "salario do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "salario_base", noMissing: true } },
      { module: "funcionarios", phrase: "cpf do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "cpf", noMissing: true } },
      { module: "funcionarios", phrase: "WhatsApp do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "contato_whatsapp", noMissing: true } },
      { module: "funcionarios", phrase: "cargo do Joao", expected: { tipo: "CONSULTA_FUNCIONARIO", funcionario_nome: "Joao", consulta_campo: "funcao", noMissing: true } },
      { module: "funcionarios", phrase: "listar funcionarios", expected: { tipo: "CONSULTA_FUNCIONARIO", noMissing: true } },
      { module: "funcionarios", phrase: "quantos funcionarios ativos", expected: { tipo: "CONSULTA_FUNCIONARIO", noMissing: true } },
      { module: "ponto", phrase: "Joao entrou as 7", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "joao", ponto_tipo: "entrada", horario: "07:00", noMissing: true } },
      { module: "ponto", phrase: "Joao saiu as 17", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "joao", ponto_tipo: "saida", horario: "17:00", noMissing: true } },
      { module: "ponto", phrase: "Bruno terminou agora", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "Bruno", ponto_tipo: "saida", agora: true, noMissing: true } },
      { module: "ponto", phrase: "registrar ponto", expected: { tipo: "PONTO_FUNCIONARIO", missing: ["funcionario_nome", "horario"] } },
      { module: "ponto", phrase: "entrada do Joao", expected: { tipo: "PONTO_FUNCIONARIO", funcionario_nome: "Joao", ponto_tipo: "entrada", missing: ["horario"] } },
      { module: "ponto", phrase: "ponto do Joao hoje", expected: { tipo: "CONSULTA_PONTO", funcionario_nome: "Joao", consulta: true, noMissing: true } },
      { module: "ponto", phrase: "relatorio de ponto do Joao hoje", expected: { tipo: "CONSULTA_PONTO", funcionario_nome: "Joao", consulta: true, noMissing: true } },
      { module: "ponto", phrase: "ponto do mes", expected: { tipo: "CONSULTA_PONTO", consulta: true, noMissing: true } },
      { module: "ponto", phrase: "quem bateu ponto hoje", expected: { tipo: "CONSULTA_PONTO", consulta: true, noMissing: true } },
      { module: "ponto", phrase: "horas do Joao hoje", expected: { tipo: "CONSULTA_PONTO", funcionario_nome: "Joao", consulta: true, noMissing: true } },
      { module: "folha", phrase: "folha do mes", expected: { tipo: "CONSULTA_FOLHA", noMissing: true } },
      { module: "folha", phrase: "paguei salario do Joao 1500", expected: { tipo: "PAGAMENTO_FUNCIONARIO", funcionario_nome: "Joao", valor: 1500, pagamento_tipo: "salario", noMissing: true } },
      { module: "folha", phrase: "pagamento funcionario Bruno 800", expected: { tipo: "PAGAMENTO_FUNCIONARIO", funcionario_nome: "Bruno", valor: 800, pagamento_tipo: "salario", noMissing: true } },
      { module: "folha", phrase: "paguei diaria da Ana 120", expected: { tipo: "PAGAMENTO_FUNCIONARIO", funcionario_nome: "Ana", valor: 120, pagamento_tipo: "diaria", noMissing: true } },
      { module: "folha", phrase: "salario pago Joao 1800", expected: { tipo: "PAGAMENTO_FUNCIONARIO", funcionario_nome: "Joao", valor: 1800, pagamento_tipo: "salario", noMissing: true } }
    ];


    return { employeePointPayrollParserTests };
  }
};
