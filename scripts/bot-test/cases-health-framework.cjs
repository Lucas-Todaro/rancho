module.exports = function loadBotTestSection(context) {
  with (context) {
    const eventFrameworkCases = [
      {
        name: "vacina completa pede confirmacao e nao salva antes",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "vacina salva uma vez apos confirmacao em dry-run",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tratamento salva uma vez apos confirmacao em dry-run",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["mediquei Mimosa com vermifugo", "ok"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-001", produto: "vermifugo", evento_tipo: "tratamento" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-001", produto: "vermifugo", evento_tipo: "tratamento" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "parto salva uma vez apos confirmacao em dry-run",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Mimosa pariu hoje", "confirma"],
        expected: {
          finalIntent: "PARTO",
          entities: { animal_codigo: "B-001", data_referencia: "hoje" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-001", evento_tipo: "PARTO" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "doenca vira evento clinico e salva so apos confirmacao",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 ficou doente", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "clinico" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-002", evento_tipo: "clinico" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "observacao sanitaria com nome nao vira cancelamento",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-lindona", brinco: "001", nome: "Lindona" }],
        messages: ["Lindona não comeu hoje", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "001", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "clinico" },
          responseNotIncludes: "cancelar ou corrigir",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "001", evento_tipo: "clinico" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "doenca com custo salva evento e financeiro apos confirmacao",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 ficou doente e custou 500 reais", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "clinico", valor: 500 },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.transacoesFinanceiras],
          shouldSaveValues: { animal_codigo: "B-002", evento_tipo: "clinico", valor: 500 },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "ocorrencia sanitaria generica pede animal antes de salvar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["tem vaca doente"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "clinico" },
          responseIncludes: "brinco",
          responseNotIncludes: "Está correto",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cio vira evento reprodutivo e salva so apos confirmacao",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Mimosa entrou no cio", "pode salvar"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-001", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "prenhez positiva altera fase somente apos confirmar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["confirmar prenhez da estrela", "isso mesmo"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "fase", novo_valor: "gestante" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.animais],
          shouldSaveValues: { animal_codigo: "B-002", campo_alterado: "fase", novo_valor: "gestante" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "inseminacao vira observacao e confirma antes de salvar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 inseminada com semen do touro T-01", "certo"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "vacina em etapas coleta animal e produto antes de confirmar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["registrar vacina", "B-002", "aftosa", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-002", produto: "aftosa", evento_tipo: "vacina" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-002", produto: "aftosa" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "tratamento em etapas coleta animal e produto antes de confirmar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["registrar tratamento", "Mimosa", "vermifugo", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-001", produto: "vermifugo", evento_tipo: "tratamento" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-001", produto: "vermifugo" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "doenca em etapas coleta animal antes de confirmar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["animal doente", "B001", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-001", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "clinico" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "parto em etapas coleta mae antes de confirmar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["registrar parto", "Mimosa", "sim"],
        expected: {
          finalIntent: "PARTO",
          entities: { animal_codigo: "B-001" },
          shouldAskFollowUp: true,
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "correcao de vacina antes de salvar troca produto",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["vacinei B-002 com aftosa", "nao, foi brucelose", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-002", produto: "brucelose", evento_tipo: "vacina" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { produto: "brucelose" },
          shouldNotSaveValues: { produto: "aftosa" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "correcao de animal antes de salvar troca animal",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002", "nao, foi na 15", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "15", produto: "aftosa" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "15", produto: "aftosa" },
          shouldNotSaveValues: { animal_codigo: "B-002" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "correcao de data de parto antes de salvar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Mimosa pariu hoje", "nao, foi ontem", "sim"],
        expected: {
          finalIntent: "PARTO",
          entities: { animal_codigo: "B-001", data_referencia: "ontem" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "cancelamento de vacina limpa sessao e confirmacao antiga nao salva",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002", "cancelar", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "confirmacao negativa de vacina nao salva",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002", "nao"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "repetir resumo de vacina antes de confirmar nao duplica",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002", "repete", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-002", produto: "aftosa" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "confirmacao duplicada de vacina nao duplica salvamento",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["apliquei aftosa na B-002", "sim", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "consulta de historico por animal nao salva",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["historico da Mimosa"],
        expected: {
          finalIntent: "CONSULTA_ANIMAL",
          entities: { animal_codigo: "B-001" },
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta de registros de hoje nao pede confirmacao nem salva",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["eventos de hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta eventos do rebanho lista eventos reais do rancho",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["quais eventos ocorreram no rebanho?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos" },
          responseIncludes: "Vacina Aftosa",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta vacina hoje filtra eventos de vacina",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["teve vacina hoje?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", evento_tipo: "vacina" },
          responseIncludes: "Aftosa",
          responseNotIncludes: "queda de apetite",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta animal doente hoje filtra ocorrencia clinica",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["teve animal doente hoje?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", evento_tipo: "clinico" },
          responseIncludes: "queda de apetite",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio do dia resume producao financeiro estoque eventos e ponto",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["relatorio do dia"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "hoje" },
          responseIncludes: "65 litros",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "resumo do dia traz fechamento curto de gestao",
        module: "dashboard-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        whatsappMessages: [
          { telefone_e164: BOT_TEST_ADMIN_PHONE, body: "B-002 deu 30 litros" }
        ],
        messages: ["resumo do dia"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "hoje" },
          responseIncludes: "WhatsApp: 1 registro",
          responseRawIncludes: ["Resumo:\n-", "\n\nFinanceiro:", "\n\nProdução:", "\n\nEstoque:", "\n\nEventos:", "\n\nFuncionários:"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "fechamento de hoje inclui movimentacoes de estoque",
        module: "dashboard-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["me manda o fechamento de hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "hoje" },
          responseIncludes: "1 movimentação",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "como foi o rancho hoje abre resumo de gestao",
        module: "dashboard-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["como foi o rancho hoje?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "hoje" },
          responseIncludes: "65 litros",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "geral de hoje usa relatorio operacional completo",
        module: "dashboard-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["me da um geral de hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "hoje" },
          responseIncludes: "Resumo:",
          responseRawIncludes: ["Financeiro:", "Produção:", "Estoque:", "Eventos:"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "movimentacoes de estoque hoje focam estoque",
        module: "dashboard-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["quais foram as movimentacoes de estoque hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "hoje", relatorio_tipo: "estoque" },
          responseIncludes: "Relatório de estoque",
          responseRawIncludes: "1 movimentação",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "tudo que aconteceu hoje vira relatorio detalhado",
        module: "dashboard-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["me fala tudo que aconteceu hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", relatorio_modo: "detalhado" },
          responseIncludes: "Eventos hoje no rebanho",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "qual vaca produziu mais usa ranking de ordenhas",
        module: "producao",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["qual vaca produziu mais?"],
        expected: {
          finalIntent: "CONSULTA_PRODUCAO",
          entities: { consulta_producao: "maior_produtor" },
          responseIncludes: "B-002",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio de producao da semana foca producao",
        module: "producao",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["relatorio de producao da semana"],
        expected: {
          finalIntent: "CONSULTA_PRODUCAO",
          responseIncludes: "litros",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio do mes usa periodo mensal e nao salva",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["resumo do mes"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "relatorio", data_referencia: "mes" },
          responseIncludes: "Relatório de este mês",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "analise se esta indo bem usa dados e alertas",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["esta indo bem?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { relatorio_modo: "analise" },
          responseIncludes: "Análise",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "resumo rapido fica curto e mostra pontos principais",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["resumo rapido"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { relatorio_modo: "rapido" },
          responseIncludes: "Resumo rápido",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio detalhado inclui lista de eventos sem salvar",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["relatorio detalhado de hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { relatorio_modo: "detalhado" },
          responseIncludes: "Eventos hoje no rebanho",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "alertas de hoje destaca estoque baixo e clinico",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["alertas hj"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "alertas" },
          responseIncludes: "Aftosa abaixo do mínimo",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio ambiguo pergunta periodo sem salvar",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["relatorio"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          responseIncludes: "hoje, da semana ou do mês",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "consulta evento nao vira cadastro de vacina",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["teve vacina hoje?"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          avoidIntents: ["VACINA_MEDICAMENTO"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cadastro de evento continua pedindo confirmacao",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["apliquei aftosa na B-002"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "funcionario comum recebe relatorio sem valores financeiros",
        module: "eventos-relatorios",
        phone: BOT_TEST_WORKER_PHONE,
        reportFixture: true,
        messages: ["relatorio do dia"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          responseIncludes: "não tem permissão",
          allResponsesNotInclude: ["R$"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio multi fazenda A nao mostra dados do rancho B",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE,
        reportFixture: true,
        messages: ["relatorio do dia"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          responseIncludes: "65 litros",
          responseNotIncludes: "20 litros",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "relatorio multi fazenda B nao mostra dados do rancho A",
        module: "eventos-relatorios",
        phone: BOT_TEST_ADMIN_PHONE_B,
        reportFixture: true,
        messages: ["relatorio do dia"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          responseIncludes: "20 litros",
          responseNotIncludes: "65 litros",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "baixa de estoque de dose continua separada de evento e nao salva antes",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["usei 1 dose de aftosa na B-002"],
        expected: {
          finalIntent: "ESTOQUE_SAIDA",
          entities: { item_nome: "Aftosa", quantidade: 1, unidade: "dose" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "telefone nao autorizado nao registra vacina",
        module: "eventos",
        phone: "5583000000000",
        messages: ["apliquei aftosa na B-002", "sim"],
        expected: {
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "vacina usa fazenda do telefone autorizado B",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE_B,
        ranches: [{ id: BOT_TEST_FARM_ID_B, nome: "Fazenda B" }],
        whatsappUsers: [
          {
            id: "wa-admin-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            usuario_id: "user-admin-b",
            funcionario_id: null,
            telefone_e164: BOT_TEST_ADMIN_PHONE_B,
            nome_exibicao: "Dono B",
            papel_bot: "admin",
            ativo: true
          }
        ],
        messages: ["apliquei aftosa na B-002", "sim"],
        expected: {
          finalIntent: "VACINA_MEDICAMENTO",
          entities: { animal_codigo: "B-002", produto: "aftosa" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-002", produto: "aftosa" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID_B
        }
      }
    ];


    return { eventFrameworkCases };
  }
};
