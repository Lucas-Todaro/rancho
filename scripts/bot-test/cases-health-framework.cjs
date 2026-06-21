module.exports = function loadBotTestSection(context) {
  with (context) {
    const recentReproductiveEvents = [
      { id: "recent-parto-204", animal_id: "animal-b-001", tipo: "parto", descricao: "parto registrado", data_evento: "2026-01-10T08:00:00.000Z" },
      { id: "recent-parto-062", animal_id: "animal-b-002", tipo: "parto", descricao: "parto registrado", data_evento: "2026-03-21T08:00:00.000Z" },
      { id: "recent-parto-064", animal_id: "animal-b-003", tipo: "parto", descricao: "parto registrado", data_evento: "2026-05-07T08:00:00.000Z" },
      { id: "recent-parto-306", animal_id: "animal-kelly", tipo: "parto", descricao: "parto registrado", data_evento: "2026-05-11T08:00:00.000Z" },
      { id: "recent-parto-318", animal_id: "animal-thais", tipo: "parto", descricao: "parto registrado", data_evento: "2026-05-14T08:00:00.000Z" },
      { id: "recent-ia-001", animal_id: "animal-b-001", tipo: "inseminacao", descricao: "inseminacao registrada", data_evento: "2026-01-01T08:00:00.000Z" },
      { id: "recent-ia-177", animal_id: "animal-b-002", tipo: "inseminacao", descricao: "Reteste", data_evento: "2026-02-18T08:00:00.000Z" },
      { id: "recent-ia-5714", animal_id: "animal-b-003", tipo: "inseminacao", descricao: "Nao passou", data_evento: "2026-05-06T08:00:00.000Z" },
      { id: "recent-ia-244", animal_id: "animal-kelly", tipo: "inseminacao", descricao: "inseminacao registrada", data_evento: "2026-06-02T08:00:00.000Z" },
      { id: "recent-protocolo", animal_id: "animal-thais", tipo: "observacao", descricao: "Protocolo reprodutivo - Nao passou", data_evento: "2026-06-03T08:00:00.000Z" },
      { id: "recent-pre-parto", animal_id: "animal-b-002", tipo: "observacao", descricao: "Pre-parto registrado", data_evento: "2026-06-04T08:00:00.000Z" },
      { id: "recent-other-farm", fazenda_id: BOT_TEST_FARM_ID_B, animal_id: "animal-b2-b-002", tipo: "parto", descricao: "parto rancho B", data_evento: "2026-06-05T08:00:00.000Z" }
    ];

    const paginatedPartos = Array.from({ length: 12 }, (_, index) => {
      const day = 20 - index;
      return {
        id: `recent-parto-page-${index + 1}`,
        animal_id: "animal-b-001",
        tipo: "parto",
        descricao: `parto pagina ${index + 1}`,
        data_evento: `2026-05-${String(day).padStart(2, "0")}T08:00:00.000Z`
      };
    });

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
        name: "parto com cria pergunta codigo e vincula descendente sem alterar categoria da mae",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-001 pariu uma femea hoje", "C-001", "sim"],
        expected: {
          finalIntent: "PARTO",
          entities: { animal_codigo: "B-001", data_referencia: "hoje", cria_sexo: "femea", cria_categoria: "bezerra", cria_codigo: "C-001" },
          shouldAskConfirmation: true,
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.animais],
          shouldSaveValues: {
            animal_codigo: "B-001",
            evento_tipo: "PARTO",
            brinco: "C-001",
            categoria: "bezerra",
            sexo: "femea",
            mae_id: "animal-b-001",
            mother_categoria: "vaca",
            mother_fase: "lactacao"
          },
          shouldNotSaveValues: { categoria: "parida", fase: "parida", novo_valor: "parida" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "parto com cria e pai vincula pai informado",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-001 pariu macho hoje, pai T-001", "C-002", "sim"],
        expected: {
          finalIntent: "PARTO",
          entities: { animal_codigo: "B-001", cria_sexo: "macho", cria_categoria: "bezerro", cria_codigo: "C-002", pai_id: "animal-t-001" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.animais],
          shouldSaveValues: { brinco: "C-002", categoria: "bezerro", sexo: "macho", mae_id: "animal-b-001", pai_id: "animal-t-001" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "parto da 777 com codigo na frase cadastra cria e genealogia apos confirmacao",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["777 pariu macho codigo B-555 hoje", "sim"],
        expected: {
          finalIntent: "PARTO",
          entities: { animal_codigo: "777", cria_sexo: "macho", cria_categoria: "bezerro", cria_codigo: "B-555" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.animais],
          shouldSaveValues: {
            brinco: "B-555",
            categoria: "bezerro",
            sexo: "macho",
            mae_id: "animal-777",
            pai_id: null
          },
          shouldNotSaveValues: { novo_valor: "lactacao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "parto completo da 777 salva cria genealogia e evento sem alterar fase da mae",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["777 pariu femea codigo B-777 hoje", { text: "sim", salvarReal: true }],
        expected: {
          finalIntent: "PARTO",
          responseIncludes: "Registro salvo no sistema com sucesso",
          entities: { animal_codigo: "777", cria_sexo: "femea", cria_categoria: "bezerra", cria_codigo: "B-777" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          savedTables: [BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.animais],
          shouldSaveValues: {
            brinco: "B-777",
            categoria: "bezerra",
            sexo: "femea",
            mae_id: "animal-777",
            pai_id: null,
            tipo: "parto"
          },
          shouldNotSaveValues: { novo_valor: "lactacao" },
          shouldNotWriteBusiness: false,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "parto com codigo de cria existente pede outro codigo sem erro interno",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-b-777-existente", brinco: "B-777", nome: "Cria existente", sexo: "femea", categoria: "bezerra" }],
        messages: ["777 pariu femea codigo B-777 hoje"],
        expected: {
          finalIntent: "PARTO",
          responseIncludes: "Ja existe um animal com o codigo/brinco",
          responseNotIncludes: "Erro interno no Rancho",
          shouldAskFollowUp: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
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
        name: "prenhez positiva cria evento reprodutivo e altera fase apos confirmar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["confirmar prenhez da estrela", "isso mesmo"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "fase", novo_valor: "gestante", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "prenhez" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 2,
          savedTables: [BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.animais],
          shouldSaveValues: { animal_codigo: "B-002", campo_alterado: "fase", novo_valor: "gestante", evento_reprodutivo_tipo: "prenhez", tipo: "observacao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "inseminacao vira evento real e confirma antes de salvar",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["B-002 inseminada com semen do touro T-01", "certo"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-002", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "inseminacao", origem_inseminacao: "T-01" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-002", evento_reprodutivo_tipo: "inseminacao", tipo: "inseminacao", medicamento: "T-01" },
          shouldNotSaveValues: { tipo: "observacao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "Thais foi inseminada cria evento de inseminacao real",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Thais foi inseminada", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "THAIS", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "inseminacao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "THAIS", evento_reprodutivo_tipo: "inseminacao", tipo: "inseminacao" },
          shouldNotSaveValues: { tipo: "observacao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "inseminacao por codigo com data preserva evento real",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-19", brinco: "19", nome: "Animal 19" }],
        messages: ["inseminacao da 19 dia 01.06.26", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "19", data_referencia: "2026-06-01", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "inseminacao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "19", tipo: "inseminacao", evento_reprodutivo_tipo: "inseminacao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "pre parto vira evento reprodutivo visivel na reproducao",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Mimosa entrou em pre-parto", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "B-001", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "pre_parto" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "B-001", tipo: "observacao", evento_reprodutivo_tipo: "pre_parto" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "protocolo nao passou vira evento reprodutivo",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-090", brinco: "090", nome: "Animal 090" }],
        messages: ["ultimo protocolo da 090 nao passou", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "090", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "protocolo" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "090", tipo: "observacao", evento_reprodutivo_tipo: "protocolo" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "codigo com espaco nao passou preserva animal do rancho atual",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        extraAnimals: [{ id: "animal-5714-cf", brinco: "5714 CF", nome: "Animal 5714 CF" }],
        messages: ["5714 CF nao passou", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "5714 CF", campo_alterado: "observacoes", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "protocolo" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "5714 CF", tipo: "observacao", evento_reprodutivo_tipo: "protocolo" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "animal nao encontrado nao salva evento reprodutivo solto",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Fantasma foi inseminada"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_referencia_nao_encontrada: "FANTASMA", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "inseminacao" },
          responseIncludes: "Não encontrei",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "cancelamento de inseminacao nao salva evento",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Thais foi inseminada", "cancelar", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldClearSession: true,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "confirmacao duplicada de inseminacao nao duplica evento",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE,
        messages: ["Thais foi inseminada", "sim", "sim"],
        expected: {
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "THAIS", tipo: "inseminacao" },
          shouldNotDuplicate: true,
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID
        }
      },
      {
        name: "inseminacao respeita multi fazenda do telefone",
        module: "eventos",
        phone: BOT_TEST_ADMIN_PHONE_B,
        extraAnimals: [{ id: "animal-thais-b", brinco: "THAIS", nome: "Thais", fazenda_id: BOT_TEST_FARM_ID_B }],
        messages: ["Thais foi inseminada", "sim"],
        expected: {
          finalIntent: "ATUALIZACAO_ANIMAL",
          entities: { animal_codigo: "THAIS", registro_evento_animal: true, evento_tipo: "reprodutivo", evento_reprodutivo_tipo: "inseminacao" },
          shouldAskConfirmation: true,
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: true,
          simulatedSaveCount: 1,
          savedTables: [BOT_TEST_TABLES.eventosAnimal],
          shouldSaveValues: { animal_codigo: "THAIS", tipo: "inseminacao" },
          shouldNotWriteBusiness: true,
          ranchId: BOT_TEST_FARM_ID_B
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
        name: "partos recentes buscam ultimos registros e nao apenas hoje",
        module: "eventos-periodo",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: recentReproductiveEvents,
        messages: ["quais foram os partos recentes"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", data_referencia: "recentes", evento_tipo: "parto" },
          responseIncludes: "Últimos partos registrados",
          responseRawIncludes: "14/05/2026",
          responseRawNotIncludes: ["hoje", "rancho B"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "partos de hoje respeita periodo explicito",
        module: "eventos-periodo",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: recentReproductiveEvents,
        messages: ["partos de hoje"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", data_referencia: "hoje", evento_tipo: "parto" },
          responseIncludes: "Não encontrei partos registrados hoje",
          responseNotIncludes: "14/05/2026",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "partos de maio filtram mes nominal",
        module: "eventos-periodo",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: recentReproductiveEvents,
        messages: ["partos de maio"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", data_referencia: "2026-05", evento_tipo: "parto" },
          responseRawIncludes: "14/05/2026",
          responseRawNotIncludes: "10/01/2026",
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "ultimas inseminacoes mostram observacoes reprodutivas",
        module: "eventos-periodo",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: recentReproductiveEvents,
        messages: ["ultimas inseminacoes"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", data_referencia: "recentes", evento_tipo: "inseminacao" },
          responseIncludes: "Últimas inseminações registradas",
          responseRawIncludes: ["02/06/2026", "Reteste", "Nao passou"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "eventos reprodutivos recentes agregam tipos reprodutivos",
        module: "eventos-periodo",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: recentReproductiveEvents,
        messages: ["eventos reprodutivos recentes"],
        expected: {
          finalIntent: "CONSULTA_REGISTROS_HOJE",
          entities: { consulta_registros: "eventos", data_referencia: "recentes", evento_tipo: "reprodutivo" },
          responseIncludes: "Últimos eventos reprodutivos",
          responseRawIncludes: ["Pré-parto", "Protocolo", "Inseminação"],
          shouldSaveBeforeConfirmation: false,
          savedAfterConfirmation: false,
          shouldNotWriteBusiness: true
        }
      },
      {
        name: "paginacao de eventos recentes continua mesma consulta",
        module: "eventos-periodo",
        phone: BOT_TEST_ADMIN_PHONE,
        animalEvents: paginatedPartos,
        messages: ["ultimos partos", "ver mais"],
        expected: {
          responseRawIncludes: ["11. Mimosa (B-001) - 10/05/2026", "12. Mimosa (B-001) - 09/05/2026"],
          responseRawNotIncludes: "20/05/2026",
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
