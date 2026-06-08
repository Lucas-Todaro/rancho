module.exports = function loadBotTestSection(context) {
  with (context) {
    const animalConsultationAndUpdateTests = [
      { phrase: "B-002 esta prenha?", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
      { phrase: "status da B-002?", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
      { phrase: "ver ficha da B-002", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
      { phrase: "dados do animal B-002", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "B-002", consulta: true } },
      { phrase: "como que ta a vaca 19", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "19", consulta: true } },
      { phrase: "como esta a Amanda?", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "Amanda", consulta: true } },
      { phrase: "me fala da vaca 19", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "19", consulta: true } },
      { phrase: "relatorio da vaca 19", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "19", consulta: true } },
      { phrase: "ficha da 19", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "19", consulta: true } },
      { phrase: "situacao da Amanda", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "Amanda", consulta: true } },
      { phrase: "relatorio do animal 5714 CF", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "5714", consulta: true } },
      { phrase: "me da um resumo da 19", expected: { tipo: "CONSULTA_ANIMAL", exactTipo: true, animal: "19", consulta: true } },
      { phrase: "mudar B-002 para lote Piquete 2", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "lote_id", novo_valor: "Piquete 2" } },
      { phrase: "B-002 450kg", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "peso", novo_valor: 450 } },
      { phrase: "B-002 ficou prenha", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "gestante" } },
      { phrase: "B-002 ficou seca", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "fase", novo_valor: "seca" } },
      { phrase: "B-002 vendida", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "status", novo_valor: "vendido" } },
      { phrase: "trocar nome da B-002 para Mimosa Nova", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "nome", novo_valor: "Mimosa Nova" } },
      { phrase: "mudar raca da B-002 para Jersey", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "raca", novo_valor: "Jersey" } },
      { phrase: "corrigir nascimento da B-002 para 10/05/2024", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "data_nascimento", novo_valor: "2024-05-10" } },
      { phrase: "B-002 observacao: mancando da pata", expected: { tipo: "ATUALIZACAO_ANIMAL", exactTipo: true, animal: "B-002", campo_alterado: "observacoes", novo_valor: "mancando da pata" } },
      { phrase: "nasceu bezerro da vaca B-002", expected: { tipo: "PARTO", exactTipo: true, animal: "B-002" } },
      { phrase: "adicionar vaca com nome Mimosa", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "vaca", nome: "Mimosa", missing: ["animal_codigo"] } },
      { phrase: "criar vaca Amanda", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "vaca", nome: "Amanda", missing: ["animal_codigo"] } },
      { phrase: "criar vaca Amanda B-902", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "vaca", nome: "Amanda", animal: "B-902" } },
      { phrase: "adiciona boi Anderson 320kg B-100", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "boi", nome: "Anderson", animal: "B-100", peso: 320 } },
      { phrase: "nova novilha Estrela", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "novilha", nome: "Estrela", missing: ["animal_codigo"] } },
      { phrase: "cadatra vaca Mimosaa", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "vaca", nome: "Mimosaa", missing: ["animal_codigo"] } },
      { phrase: "cadastra reprodutor Touro Rei", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "touro", nome: "Touro Rei", missing: ["animal_codigo"] } },
      { phrase: "cadastrar animal Todaro", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, nome: "Todaro", missing: ["animal_codigo"] } },
      { phrase: "cadastrar vaca Amanda B-903 femea", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "vaca", nome: "Amanda", animal: "B-903", sexo: "femea" } },
      { phrase: "cadastrar touro Brutus T-904 macho", expected: { tipo: "CADASTRO_ANIMAL", exactTipo: true, categoria: "touro", nome: "Brutus", animal: "T-904", sexo: "macho" } }
    ];


    return { animalConsultationAndUpdateTests };
  }
};
