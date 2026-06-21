module.exports = function loadBotTestSection(context) {
  with (context) {
    const botConversationTests = [
      {
        name: "producao com dado faltante, sessao e confirmacao em dry-run",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "vaca B-002 deu leite",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_dado",
              missing: ["litros"],
              responseIncludes: "litro"
            }
          },
          {
            text: "32",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoAnterior: "aguardando_dado",
              estadoNovo: "aguardando_dado",
              dados: { litros: 32, animal_codigo: "B-002" },
              responseIncludes: "Deseja adicionar"
            }
          },
          {
            text: "2",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoAnterior: "aguardando_dado",
              estadoNovo: "aguardando_confirmacao",
              dados: { litros: 32, animal_codigo: "B-002", estoque_leite_movimentar: false },
              responseIncludes: "correto"
            }
          },
          {
            text: "sim",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo",
              responseRawIncludes: "Confirmação",
              responseRawNotIncludes: ["Confirma\u00c3", "produ\u00c3"]
            }
          }
        ]
      },
      {
        name: "correcao antes de confirmar nao salva e atualiza entidades",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "vaca B-002 deu 18 litros para venda",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_confirmacao",
              dados: { litros: 18 }
            }
          },
          {
            text: "corrigir 20 litros",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "aguardando_confirmacao",
              dados: { litros: 20 },
              responseIncludes: "Agora entendi"
            }
          },
          {
            text: "sim",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo"
            }
          }
        ]
      },
      {
        name: "negacao de parto sem contexto nao vira evento",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "não é parto",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "nao vou registrar como parto"
            }
          },
          {
            text: "não foi parto",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "nao vou registrar como parto"
            }
          },
          {
            text: "não era parto, era cio",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "nao vou registrar como parto"
            }
          }
        ]
      },
      {
        name: "mensagens contextuais sem contexto pedem esclarecimento",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "corrige isso",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "O que voce quer corrigir"
            }
          },
          {
            text: "cancela",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "Nao ha acao pendente"
            }
          },
          {
            text: "não",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "Nao ha acao pendente"
            }
          },
          {
            text: "sim",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "confirmacao pendente"
            }
          },
          {
            text: "entendeu errado",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "O que voce quer corrigir"
            }
          },
          {
            text: "não quis dizer isso",
            expected: {
              intent: null,
              estadoNovo: "livre",
              responseIncludes: "O que voce quer corrigir"
            }
          }
        ]
      },
      {
        name: "fluxo completo nega parto pendente sem registrar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "a Estrela pariu hoje",
            expected: {
              intent: "PARTO",
              estadoNovo: "aguardando_confirmacao",
              responseIncludes: "correto"
            }
          },
          {
            text: "não é parto",
            expected: {
              intent: null,
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "livre",
              eventoConfirmado: false,
              responseIncludes: "nao e parto"
            }
          }
        ]
      },
      {
        name: "correcao de parto para cio vira observacao pendente",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        initialSession: () => ({
          etapa: "aguardando_confirmacao",
          dados: { pending: parseResolved("Mimosa pariu hoje") }
        }),
        messages: [
          {
            text: "não era parto, era cio",
            expected: {
              intent: "ATUALIZACAO_ANIMAL",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-001", campo_alterado: "observacoes", novo_valor: "cio" },
              responseIncludes: "cio"
            }
          }
        ]
      },
      {
        name: "correcao de litros usa contexto pendente e nao duplica",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        initialSession: () => ({
          etapa: "aguardando_confirmacao",
          dados: { pending: parseResolved("B-002 deu 15 litros para venda") }
        }),
        messages: [
          {
            text: "errei, não era 15 litros, era 18",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-002", litros: 18 },
              responseIncludes: "15L para 18L"
            }
          }
        ]
      },
      {
        name: "correcao de animal troca pendencia por animal resolvido",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        initialSession: () => ({
          etapa: "aguardando_confirmacao",
          dados: { pending: parseResolved("Estrela deu 15 litros para venda") }
        }),
        messages: [
          {
            text: "não era a Estrela, era a Mimosa",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-001", litros: 15 },
              responseIncludes: "trocar o animal"
            }
          }
        ]
      },
      {
        name: "correcao de compra para uso troca entrada por baixa",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        initialSession: () => ({
          etapa: "aguardando_confirmacao",
          dados: { pending: parseResolved("comprei 10 sacos de racao por 300 reais") }
        }),
        messages: [
          {
            text: "não foi compra, foi uso",
            expected: {
              intent: "ESTOQUE_SAIDA",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "aguardando_confirmacao",
              dados: { item_nome: "Racao", quantidade: 10, unidade: "saco" },
              responseIncludes: "uso/saida"
            }
          }
        ]
      },
      {
        name: "correcao de quantidade em dado faltante atualiza estoque pendente",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        initialSession: () => ({
          etapa: "aguardando_dado",
          dados: { pending: parseResolved("usei racao") }
        }),
        messages: [
          {
            text: "na verdade foram 20kg",
            expected: {
              intent: "ESTOQUE_SAIDA",
              estadoAnterior: "aguardando_dado",
              estadoNovo: "aguardando_confirmacao",
              dados: { item_nome: "Racao", quantidade: 20, unidade: "kg" },
              responseIncludes: "20 kg"
            }
          }
        ]
      },
      {
        name: "tabela estruturada substitui campo pendente sem virar observacao",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        initialSession: () => ({
          etapa: "aguardando_dado",
          dados: { pending: parseResolved("registrar inseminacao") }
        }),
        messages: [
          {
            text: "Data;Observacoes;Animal;Evento\nontem;primeira inseminacao;B-002;Inseminada\nhoje;;B-003;Prenha",
            expected: {
              intent: "IMPORTACAO_EVENTOS_TABELA",
              estadoAnterior: "aguardando_dado",
              estadoNovo: "aguardando_confirmacao",
              dados: { total_linhas: 2 },
              responseIncludes: "Li a tabela de eventos"
            }
          }
        ]
      },
      {
        name: "cancelamento limpa a sessao sem salvar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "vaca B-002 deu leite",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_dado",
              missing: ["litros"]
            }
          },
          {
            text: "cancelar",
            expected: {
              estadoAnterior: "aguardando_dado",
              estadoNovo: "livre",
              responseIncludes: "Nada foi salvo"
            }
          }
        ]
      },
      {
        name: "compra de estoque passa por catalogo e confirmacao sem gravar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "comprei 3 sacos de sal mineral por 180 reais",
            expected: {
              intent: "ESTOQUE_ENTRADA",
              estadoNovo: "aguardando_confirmacao",
              dados: {
                item_nome: "Sal mineral",
                quantidade: 3,
                valor: 180
              }
            }
          },
          {
            text: "sim",
            expected: {
              intent: "ESTOQUE_ENTRADA",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo"
            }
          }
        ]
      },
      {
        name: "cadastro de animal pergunta opcionais antes de confirmar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "adicionar vaca",
            expected: {
              intent: "CADASTRO_ANIMAL",
              estadoNovo: "aguardando_dado",
              missing: ["brinco"],
              responseIncludes: "brinco"
            }
          },
          {
            text: "B-777",
            expected: {
              intent: "CADASTRO_ANIMAL",
              estadoAnterior: "aguardando_dado",
              estadoNovo: "aguardando_dado",
              dados: { animal_codigo: "B-777", categoria: "vaca" },
              responseIncludes: "nome"
            }
          },
          { text: "2", expected: { intent: "CADASTRO_ANIMAL", estadoNovo: "aguardando_dado", responseIncludes: "peso" } },
          { text: "2", expected: { intent: "CADASTRO_ANIMAL", estadoNovo: "aguardando_dado", responseIncludes: "fase" } },
          { text: "2", expected: { intent: "CADASTRO_ANIMAL", estadoNovo: "aguardando_dado", responseIncludes: "raça" } },
          { text: "2", expected: { intent: "CADASTRO_ANIMAL", estadoNovo: "aguardando_dado", responseIncludes: "lote" } },
          { text: "2", expected: { intent: "CADASTRO_ANIMAL", estadoNovo: "aguardando_dado", responseIncludes: "nascimento" } },
          { text: "2", expected: { intent: "CADASTRO_ANIMAL", estadoNovo: "aguardando_dado", responseIncludes: "observacoes" } },
          {
            text: "2",
            expected: {
              intent: "CADASTRO_ANIMAL",
              estadoAnterior: "aguardando_dado",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-777", categoria: "vaca" },
              responseIncludes: "correto"
            }
          },
          {
            text: "sim",
            expected: {
              intent: "CADASTRO_ANIMAL",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo"
            }
          }
        ]
      },
      {
        name: "funcionario comum nao pode criar item de estoque",
        phone: BOT_TEST_WORKER_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "criar estoque de racao nova",
            expected: {
              intent: "CRIAR_ITEM_ESTOQUE",
              estadoNovo: "livre",
              responseIncludes: "permiss"
            }
          }
        ]
      },
      {
        name: "telefone nao autorizado recebe bloqueio amigavel",
        phone: "5583000000000",
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "menu",
            expected: {
              estadoNovo: null,
              responseIncludes: "autorizado"
            }
          }
        ]
      },
      {
        name: "dono com telefone no perfil pode usar bot mesmo sem whatsapp_usuarios",
        phone: BOT_TEST_ADMIN_PHONE,
        whatsappUsers: [],
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "quanto leite hoje",
            expected: {
              intent: "CONSULTA_PRODUCAO_HOJE",
              estadoNovo: "livre",
              responseIncludes: "12"
            }
          }
        ]
      },
      {
        name: "consulta usa base mockada sem abrir confirmacao",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "quanto leite hoje",
            expected: {
              intent: "CONSULTA_PRODUCAO_HOJE",
              estadoNovo: "livre",
              responseIncludes: "12"
            }
          }
        ]
      },
      {
        name: "consulta de producao geral nao abre confirmacao",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "Quantos litros foram ordenhados hoje?",
            expected: {
              intent: "CONSULTA_PRODUCAO_HOJE",
              estadoNovo: "livre",
              responseIncludes: "Relatório de produção hoje"
            }
          }
        ]
      },
      {
        name: "relatorio de producao hoje mostra detalhe por animal",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        animalProductions: [
          { animal_id: "animal-b-001", litros: 25, ordenhado_em: `${localDateOnly()}T08:15:00.000Z` },
          { animal_id: "animal-b-003", litros: 30, ordenhado_em: `${localDateOnly()}T08:30:00.000Z` }
        ],
        messages: [
          {
            text: "dá o relatório da produção de hoje",
            expected: {
              intent: "CONSULTA_PRODUCAO_HOJE",
              estadoNovo: "livre",
              responseRawIncludes: ["Relatório de produção hoje", "Total:", "Mimosa (B-001) - 25 L - 08:15", "Princesa (B-003) - 30 L - 08:30"]
            }
          }
        ]
      },
      {
        name: "consulta de producao por animal usa ordenhas reais",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "A vaca B-002 deu quantos litros?",
            expected: {
              intent: "CONSULTA_PRODUCAO_ANIMAL",
              estadoNovo: "livre",
              responseIncludes: "B-002 produziu 12"
            }
          }
        ]
      },
      {
        name: "consulta de animal usa cadastro sem abrir confirmacao",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "B-002 esta prenha?",
            expected: {
              intent: "CONSULTA_ANIMAL",
              estadoNovo: "livre",
              dados: { animal_codigo: "B-002" },
              responseIncludes: "Fase: Prenha"
            }
          }
        ]
      },
      {
        name: "atualizacao de animal pede confirmacao e nao grava no dry-run",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "mudar B-002 para lote Piquete 2",
            expected: {
              intent: "ATUALIZACAO_ANIMAL",
              estadoNovo: "aguardando_confirmacao",
              dados: {
                animal_codigo: "B-002",
                campo_alterado: "lote_id",
                novo_valor: "Piquete 2"
              },
              responseIncludes: "atualizar lote_id"
            }
          },
          {
            text: "sim",
            expected: {
              intent: "ATUALIZACAO_ANIMAL",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo"
            }
          }
        ]
      },
      {
        name: "cancelamento explicito durante confirmacao limpa sem salvar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "B-002 deu 30 litros para venda",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-002", litros: 30 }
            }
          },
          {
            text: "nao salvar",
            expected: {
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "livre",
              responseIncludes: "cancelei"
            }
          }
        ]
      },
      {
        name: "cancelamento durante campo faltante limpa sem salvar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "B-002 deu leite",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_dado",
              missing: ["litros"]
            }
          },
          {
            text: "esquece",
            expected: {
              estadoAnterior: "aguardando_dado",
              estadoNovo: "livre",
              responseIncludes: "cancelei"
            }
          }
        ]
      },
      {
        name: "rejeicao simples durante confirmacao limpa sem salvar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "B-002 deu 30 litros para venda",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-002", litros: 30 }
            }
          },
          {
            text: "negativo",
            expected: {
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "livre",
              responseIncludes: "Nada foi salvo"
            }
          }
        ]
      },
      {
        name: "nova operacao substitui pendente antes de confirmar",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "B-002 deu 30 litros para venda",
            expected: {
              intent: "PRODUCAO_LEITE",
              estadoNovo: "aguardando_confirmacao",
              dados: { animal_codigo: "B-002", litros: 30 }
            }
          },
          {
            text: "comprei 3 sacos de milho por 120 reais",
            expected: {
              intent: "ESTOQUE_ENTRADA",
              estadoAnterior: "aguardando_confirmacao",
              estadoNovo: "aguardando_confirmacao",
              dados: { item_nome: "Milho", quantidade: 3, unidade: "saco", valor: 120 },
              responseIncludes: "Troquei"
            }
          },
          {
            text: "sim",
            expected: {
              intent: "ESTOQUE_ENTRADA",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo"
            }
          }
        ]
      },
      {
        name: "consulta de item de estoque usa item real",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "Como está o estoque de ração de boi?",
            expected: {
              intent: "CONSULTA_ESTOQUE_ITEM",
              estadoNovo: "livre",
              responseIncludes: "Estoque de Ração de boi"
            }
          }
        ]
      },
      {
        name: "consulta de item inexistente nao salva nem cria item",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "Ainda tem item inexistente?",
            expected: {
              intent: "CONSULTA_ESTOQUE_ITEM",
              estadoNovo: "livre",
              responseIncludes: "Não encontrei esse item"
            }
          }
        ]
      },
      {
        name: "consulta de registros de hoje nao abre confirmacao",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "O que eu registrei hoje?",
            expected: {
              intent: "CONSULTA_REGISTROS_HOJE",
              estadoNovo: "livre",
              responseIncludes: "Você ainda não registrou nada hoje"
            }
          }
        ]
      },
      {
        name: "ponto de funcionario pede confirmacao e nao grava no dry-run",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "Joao entrou as 7:30",
            expected: {
              intent: "PONTO_FUNCIONARIO",
              estadoNovo: "aguardando_confirmacao",
              dados: {
                funcionario_nome: "Joao",
                ponto_tipo: "entrada",
                horario: "07:30"
              }
            }
          },
          {
            text: "sim",
            expected: {
              intent: "PONTO_FUNCIONARIO",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "Nenhum registro real foi salvo"
            }
          }
        ]
      },
      {
        name: "lote de producao no tanque resolve item unico e prepara estoque no dry-run",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        messages: [
          {
            text: "vaca 1 deu 14 litros e vaca 2 15 no tanque",
            expected: {
              intent: "LOTE_REGISTROS",
              estadoNovo: "aguardando_confirmacao",
              dados: {
                total_litros: 29,
                estoque_leite_status: "matched",
                estoque_leite_item_nome: "Leite Cru",
                estoque_leite_item_id: "item-leite-cru",
                estoque_leite_movimentar: true
              },
              responseIncludes: "estoque de Leite Cru",
              responseRawIncludes: ["entrada"],
              responseRawNotIncludes: ["ficar", "produ\u00c3"]
            }
          },
          {
            text: "sim",
            expected: {
              intent: "LOTE_REGISTROS",
              estadoNovo: "livre",
              eventoConfirmado: true,
              responseIncludes: "entrada consolidada",
              responseRawIncludes: "Simulação",
              responseRawNotIncludes: ["Simula\u00c3", "produ\u00c3"]
            }
          }
        ]
      },
      {
        name: "lote de producao prefere item mais compativel de leite e pergunta sem destino",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        extraStockItems: [
          { id: "item-leite-in-natura", nome: "Leite in natura", unidade_medida: "litro" }
        ],
        messages: [
          {
            text: "vaca 1 deu 14 litros e vaca 2 15",
            expected: {
              intent: "LOTE_REGISTROS",
              estadoNovo: "aguardando_dado",
              dados: {
                total_litros: 29,
                estoque_leite_status: "matched",
                estoque_leite_movimentar: false
              },
              responseIncludes: "Deseja adicionar"
            }
          }
        ]
      },
      {
        name: "lote de producao sem item de leite registra apenas producao",
        phone: BOT_TEST_ADMIN_PHONE,
        expectNoBusinessWrites: true,
        stockItems: mockStock.filter((item) => !/leite/i.test(item.nome)),
        messages: [
          {
            text: "vaca 1 deu 14 litros e vaca 2 15",
            expected: {
              intent: "LOTE_REGISTROS",
              estadoNovo: "aguardando_confirmacao",
              dados: {
                total_litros: 29,
                estoque_leite_status: "not_found",
                estoque_leite_movimentar: false
              },
              responseIncludes: "item de estoque"
            }
          }
        ]
      }
    ];

    const positiveConfirmationFrameworkCases = ["s", "ss", "ok", "pode salvar", "salvar", "registrar", "fechou", "show"].map((confirmation) => ({
      name: `confirmacao positiva aceita: ${confirmation}`,
      module: "confirmacao",
      phone: BOT_TEST_ADMIN_PHONE,
      messages: ["B-002 deu 32 litros para venda", confirmation],
      expected: {
        finalIntent: "PRODUCAO_LEITE",
        entities: { animal_codigo: "B-002", litros: 32 },
        shouldAskConfirmation: true,
        shouldSaveBeforeConfirmation: false,
        savedAfterConfirmation: true,
        simulatedSaveCount: 1,
        savedTables: [BOT_TEST_TABLES.ordenhas],
        shouldNotDuplicate: true,
        shouldNotWriteBusiness: true,
        ranchId: BOT_TEST_FARM_ID
      }
    }));

    const negativeConfirmationFrameworkCases = ["cancelar", "nao salvar", "esquece", "deixa pra la", "negativo", "2"].map((rejection) => ({
      name: `confirmacao negativa limpa: ${rejection}`,
      module: "confirmacao",
      phone: BOT_TEST_ADMIN_PHONE,
      messages: ["B-002 deu 32 litros para venda", rejection],
      expected: {
        finalIntent: "PRODUCAO_LEITE",
        entities: { animal_codigo: "B-002", litros: 32 },
        shouldAskConfirmation: true,
        shouldSaveBeforeConfirmation: false,
        savedAfterConfirmation: false,
        shouldClearSession: true,
        shouldNotWriteBusiness: true
      }
    }));

    const herdDeleteConfirmationCases = [
      "excluir todo o rebanho",
      "deletar todas as vacas",
      "apagar todos os animais",
      "remover todo o rebanho"
    ].map((message) => ({
      name: `exclusao em massa bloqueada: ${message}`,
      module: "confirmacao",
      phone: BOT_TEST_ADMIN_PHONE,
      messages: [message],
      expected: {
        finalIntent: "ACAO_DESTRUTIVA_EM_MASSA",
        entities: { blocked: true },
        responseIncludes: "Por segurança, não faço exclusão em massa pelo WhatsApp",
        responseNotIncludes: "Confirmar",
        shouldSaveBeforeConfirmation: false,
        savedAfterConfirmation: false,
        shouldNotWriteBusiness: true
      }
    }));

    return {
      botConversationTests: [...botConversationTests, ...herdDeleteConfirmationCases],
      positiveConfirmationFrameworkCases,
      negativeConfirmationFrameworkCases,
      herdDeleteConfirmationCases
    };
  }
};
