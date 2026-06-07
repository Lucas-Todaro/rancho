module.exports = function loadBotTestSection(context) {
  with (context) {
    const genealogyParserTests = [
      { module: "genealogia", phrase: "ver genealogia da Mimosa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "genealogia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "arvore genealogica da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "árvore genealógica da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "linhagem da vaca Estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "linhagem do animal A12", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "A12", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "historico familiar da Mimosa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "familia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "ver arvore da Estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "mostrar árvore da vaca Lua", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "VACA-15", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "quem sao os pais da Estrela?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "quem é a mãe da B-002?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "mae", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "quem e o pai da B-002?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "pai", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "quais os filhos da Mimosa?", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "descendentes", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "descendentes da Mimosa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-001", consulta_genealogia: "descendentes", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "filhos da Estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "descendentes", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "avós da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "avos", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "avo materna da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "avos", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "avô paterno da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "avos", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "genelogia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "geneologia da estrela", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta_genealogia: "arvore", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "arvori genealogica da Princesa", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-003", consulta_genealogia: "arvore", consulta: true, noMissing: true } },

      { module: "genealogia", phrase: "mãe da B-002 é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "a mãe da Estrela é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "define Mimosa como mãe da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "coloca Mimosa como mãe da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "B-002 é filha da Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "Estrela é filha de Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "a vaca Estrela tem mãe Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "mãe do animal A12 é Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "coloca a Estrela como mãe do A12", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "registrar mãe da Lua como Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "VACA-15", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "a novilha N-033 é filha da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "N-033", mae_nome: "Estrela", maeId: "animal-b-002", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "mãe de VACA-15 é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "VACA-15", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },

      { module: "genealogia", phrase: "pai da B-002 é Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "define Touro Rei como pai da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "coloca T-001 como pai da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "B-002 é filha do Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "Touro Rei é pai da Estrela", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "pai do A12 é T-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", pai_nome: "Touro Forte", paiId: "animal-t-002", genealogia_campo: "pai", noMissing: true } },

      { module: "genealogia", phrase: "mãe da A12 é Estrela e pai é Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "ambos", noMissing: true } },
      { module: "genealogia", phrase: "A12 tem mãe Estrela e pai Touro Forte", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Forte", paiId: "animal-t-002", genealogia_campo: "ambos", noMissing: true } },
      { module: "genealogia", phrase: "A12 é filho da Estrela e do Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "ambos", noMissing: true } },
      { module: "genealogia", phrase: "Novilha N-033 é filha de Estrela com Touro Forte", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "N-033", mae_nome: "Estrela", maeId: "animal-b-002", pai_nome: "Touro Forte", paiId: "animal-t-002", genealogia_campo: "ambos", noMissing: true } },

      { module: "genealogia", phrase: "remove mãe da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_mae: true, genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "tirar pai da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_pai: true, genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "limpa genealogia da A12", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", remover_mae: true, remover_pai: true, genealogia_campo: "ambos", noMissing: true } },
      { module: "genealogia", phrase: "pai da B-002 não informado", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_pai: true, genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "mãe da B-002 não informada", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", remover_mae: true, genealogia_campo: "mae", noMissing: true } },

      { module: "genealogia", phrase: "definir genealogia da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", missing: ["genealogia_campo"] } },
      { module: "genealogia", phrase: "definir mãe da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", genealogia_campo: "mae", missing: ["mae_nome"] } },
      { module: "genealogia", phrase: "definir pai da B-002", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", genealogia_campo: "pai", missing: ["pai_nome"] } },
      { module: "genealogia", phrase: "mae", pending: () => pendingFrom("definir genealogia da B-002"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", genealogia_campo: "mae", missing: ["mae_nome"] } },
      { module: "genealogia", phrase: "Mimosa", pending: () => pendingFrom("definir mãe da B-002"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", noMissing: true } },
      { module: "genealogia", phrase: "Touro Rei", pending: () => pendingFrom("definir pai da B-002"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", noMissing: true } },
      { module: "genealogia", phrase: "os dois", pending: () => pendingFrom("definir genealogia da A12"), expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "A12", genealogia_campo: "ambos", missing: ["mae_nome", "pai_nome"] } },
      { module: "genealogia", phrase: "genelogia da B-002", expected: { tipo: "CONSULTA_GENEALOGIA", animal: "B-002", consulta: true, noMissing: true } },
      { module: "genealogia", phrase: "mai da B-002 é Mimosa", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", mae_nome: "Mimosa", maeId: "animal-b-001", genealogia_campo: "mae", noMissing: true } },
      { module: "genealogia", phrase: "paii da B-002 é Touro Rei", expected: { tipo: "ATUALIZACAO_GENEALOGIA", animal: "B-002", pai_nome: "Touro Rei", paiId: "animal-t-001", genealogia_campo: "pai", noMissing: true } },
      { module: "genealogia", phrase: "funcionario Joao é filho da Maria", expected: { tipo: "DESCONHECIDO", exactTipo: true } }
    ];


    return { genealogyParserTests };
  }
};
