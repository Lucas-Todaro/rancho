import { getRanchTodayISO, RANCH_TIMEZONE } from "@/lib/dates/ranch-time";
import {
  summarizeDomainManifestForPrompt,
  type DomainManifest,
  RANCHO_DOMAIN_MANIFEST
} from "@/lib/whatsapp/gemini/domain-manifest";
import { ACTION_PLAN_CAPABILITIES } from "@/lib/whatsapp/gemini/action-plan-capabilities";
import { ACTION_PLAN_DESIGN_MEMORY } from "@/lib/whatsapp/gemini/action-plan-memory";

export const ACTION_PLAN_PROMPT_VERSION = "rancho-gemini-action-plan-v8";

const EXAMPLES = [
  {
    user: "090 pariu",
    plan: {
      action: "create", domain: "reproducao", confidence: 0.9,
      data: { animal_ref: "090", evento: "parto" },
      requiresConfirmation: true
    }
  },
  {
    user: "quais vacas tao prenhas?",
    plan: {
      action: "query", domain: "reproducao", confidence: 0.94,
      filters: [
        { field: "status_reprodutivo", op: "eq", value: "prenhe" },
        { field: "categoria", op: "eq", value: "vaca" }
      ],
      limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "dados das vacas",
    plan: {
      action: "query", domain: "animais", confidence: 0.94,
      filters: [{ field: "categoria", op: "eq", value: "vaca" }],
      limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "dados da vaca B-001",
    plan: {
      action: "query", domain: "animais", confidence: 0.94,
      filters: [{ field: "animal_ref", op: "eq", value: "B-001" }],
      limit: 20, requiresConfirmation: false
    }
  },
  {
    user: "relatorio financeiro dos ultimos 6 meses",
    plan: {
      action: "query", domain: "financeiro", confidence: 0.94,
      filters: [{ field: "data", op: "last_months", value: 6 }],
      aggregations: [{ field: "valor", op: "sum", as: "total" }],
      groupBy: ["month"], limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "como foi o financeiro desse mes?",
    plan: {
      action: "query", domain: "financeiro", confidence: 0.94,
      filters: [{ field: "data", op: "current_month" }],
      aggregations: [{ field: "valor", op: "sum", as: "total" }],
      groupBy: ["tipo"], limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "quais eventos teve hoje?",
    plan: {
      action: "query", domain: "observacoes", operation: "eventos_gerais", confidence: 0.94,
      semantic: {
        intent: "consultar_eventos",
        scope: "eventos",
        date: "hoje",
        report: { type: "eventos", detailLevel: "resumo", includeDomains: ["observacoes", "reproducao", "saude_sanitario"] }
      },
      filters: [{ field: "data", op: "last_days", value: 1 }],
      limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "adicionar entrada de mil reais",
    plan: {
      action: "execute", capability: "registrar_financeiro", confidence: 0.92,
      semantic: {
        intent: "registrar_receita",
        scope: "financeiro",
        money: { value: 1000, type: "receita", category: "receita via WhatsApp" },
        date: "hoje",
        effects: [{ domain: "financeiro", type: "receita" }]
      },
      data: { tipo: "entrada", valor: 1000, categoria: "receita via WhatsApp", descricao: "receita via WhatsApp", data: "hoje" },
      requiresConfirmation: true
    }
  },
  {
    user: "adicionar saida de mil reais",
    plan: {
      action: "execute", capability: "registrar_financeiro", confidence: 0.92,
      semantic: {
        intent: "registrar_despesa",
        scope: "financeiro",
        money: { value: 1000, type: "despesa", category: "despesa via WhatsApp" },
        date: "hoje",
        effects: [{ domain: "financeiro", type: "despesa" }]
      },
      data: { tipo: "saida", valor: 1000, categoria: "despesa via WhatsApp", descricao: "despesa via WhatsApp", data: "hoje" },
      requiresConfirmation: true
    }
  },
  {
    user: "quanto gastei com racao nos ultimos 90 dias",
    plan: {
      action: "query", domain: "financeiro", confidence: 0.94,
      filters: [
        { field: "tipo", op: "eq", value: "despesa" },
        { field: "descricao", op: "contains", value: "racao" },
        { field: "data", op: "last_days", value: 90 }
      ],
      aggregations: [{ field: "valor", op: "sum", as: "total_gasto" }],
      limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "dados dos funcionarios",
    plan: {
      action: "query", domain: "funcionarios", confidence: 0.94,
      filters: [],
      limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "Nome;Função;WhatsApp;Data admissão;Salário\nJoao;Vaqueiro;+55 83 99999-0001;2026-06-01;1800\nMaria;Ordenha;+55 83 99999-0002;2026-06-01;1700",
    plan: {
      action: "import_table", domain: "funcionarios", confidence: 0.94,
      data: {
        rows: [
          { nome: "Joao", funcao: "Vaqueiro", contato_whatsapp: "+55 83 99999-0001", data_admissao: "2026-06-01", salario_base: 1800 },
          { nome: "Maria", funcao: "Ordenha", contato_whatsapp: "+55 83 99999-0002", data_admissao: "2026-06-01", salario_base: 1700 }
        ]
      },
      table: {
        hasHeader: true,
        separator: ";",
        columnMapping: {
          nome: "Nome",
          funcao: "Função",
          contato_whatsapp: "WhatsApp",
          data_admissao: "Data admissão",
          salario_base: "Salário"
        }
      },
      requiresConfirmation: true
    }
  },
  {
    user: "quem bateu ponto hoje",
    plan: {
      action: "query", domain: "ponto_funcionario", confidence: 0.94,
      filters: [{ field: "data", op: "last_days", value: 1 }],
      limit: 100, requiresConfirmation: false
    }
  },
  {
    user: "090 deu 15 litros ontem as 18h",
    plan: {
      action: "create", domain: "producao_leite", confidence: 0.94,
      semantic: {
        intent: "registrar_producao_leite",
        scope: "producao_leite",
        entities: { animal: "090" },
        quantity: { value: 15, unit: "litros", kind: "leite" },
        attributes: { hora: "18:00" },
        date: "ontem",
        effects: [{ domain: "producao_leite", type: "registrar_ordenha" }]
      },
      data: { animal_ref: "090", litros: 15, data: "ontem", hora: "18:00" },
      requiresConfirmation: true
    }
  },
  {
    user: "comprei 10 sacos de racao por 500 reais",
    plan: {
      action: "execute", capability: "registrar_movimento_estoque", operation: "compra_estoque", confidence: 0.92,
      semantic: {
        intent: "compra_item_fisico",
        scope: "estoque",
        entities: { item: "racao" },
        quantity: { value: 10, unit: "saco" },
        money: { value: 500, type: "despesa", category: "racao" },
        date: "hoje",
        effects: [{ domain: "estoque", type: "entrada" }, { domain: "financeiro", type: "despesa" }]
      },
      data: { tipo_movimento: "entrada", item_ref: "racao", quantidade: 10, unidade: "saco", valor_total: 500, gera_financeiro: true },
      requiresConfirmation: true
    }
  },
  {
    user: "vendi 4 sacos de milho por 320 reais",
    plan: {
      action: "execute", capability: "registrar_movimento_estoque", operation: "venda_estoque", confidence: 0.92,
      semantic: {
        intent: "venda_item_fisico",
        scope: "estoque",
        entities: { item: "milho" },
        quantity: { value: 4, unit: "saco" },
        money: { value: 320, type: "receita", category: "milho" },
        date: "hoje",
        effects: [{ domain: "estoque", type: "saida" }, { domain: "financeiro", type: "receita" }]
      },
      data: { tipo_movimento: "saida", item_ref: "milho", quantidade: 4, unidade: "saco", valor_total: 320, gera_financeiro: true },
      requiresConfirmation: true
    }
  },
  {
    user: "codigo;categoria\nT-187;touro\nT-234;touro",
    plan: {
      action: "import_table", domain: "animais", confidence: 0.95,
      table: {
        hasHeader: true, separator: ";",
        columnMapping: { brinco: "codigo", categoria: "categoria" },
        defaultFields: {}, ignoredColumns: [], ambiguousColumns: []
      },
      requiresConfirmation: true
    }
  },
  {
    user: "177:PROTOCOLO\n094:PARTO\n053:INSEMINACAO\n249:RETESTE\n520:EMPRENHOU",
    plan: {
      action: "import_table", domain: "reproducao", confidence: 0.92,
      data: {
        rows: [
          { animal_ref: "177", evento: "protocolo" },
          { animal_ref: "094", evento: "parto" },
          { animal_ref: "053", evento: "inseminacao" },
          { animal_ref: "249", evento: "reteste" },
          { animal_ref: "520", evento: "prenhez" }
        ]
      },
      requiresConfirmation: true
    }
  },
  {
    user: "177:PROTOCOLO\n094:PROTOCOLO\n053:INSEMINACAO\n249:PROTOCOLO\n205:RETESTE",
    plan: {
      action: "import_table", domain: "reproducao", confidence: 0.92,
      table: {
        hasHeader: false, separator: ":",
        columnMapping: { animal_ref: 0, evento: 1 },
        defaultFields: { data: "hoje" },
        ignoredColumns: [], ambiguousColumns: []
      },
      requiresConfirmation: true
    }
  },
  {
    user: "777 pariu femea codigo B-777 hoje",
    plan: {
      action: "create", domain: "reproducao", operation: "parto_com_cria", confidence: 0.94,
      semantic: {
        intent: "registrar_parto_com_cria",
        scope: "reproducao",
        entities: { mae: "777", cria: { codigo: "B-777", sexo: "femea" }, pai: null },
        date: "hoje",
        effects: [
          { domain: "reproducao", type: "registrar_parto" },
          { domain: "animais", type: "cadastrar_cria" },
          { domain: "genealogia", type: "vincular_mae_cria" },
          { domain: "animais", type: "atualizar_status_mae" }
        ]
      },
      data: { mae_ref: "777", evento: "parto", data: "hoje", cria_sexo: "femea", cria_codigo: "B-777" },
      requiresConfirmation: true
    }
  },
  {
    user: "a vaca B-002 morreu hoje",
    plan: {
      action: "execute", capability: "registrar_evento_animal", operation: "registro_morte", confidence: 0.94,
      semantic: {
        intent: "registrar_morte_animal",
        scope: "saude_sanitario",
        entities: { animal: "B-002" },
        date: "hoje",
        effects: [{ domain: "saude_sanitario", type: "morte" }, { domain: "animais", type: "marcar_morto" }]
      },
      data: { animal_ref: "B-002", tipo_evento: "morte", data: "hoje" },
      requiresConfirmation: true
    }
  },
  {
    user: "cadastrar vaca B-120 chamada Estrela",
    plan: {
      action: "execute", capability: "cadastrar_animal", confidence: 0.92,
      semantic: {
        intent: "cadastrar_animal",
        scope: "animais",
        entities: { animal: "B-120" },
        attributes: { brinco: "B-120", categoria: "vaca", nome: "Estrela" },
        effects: [{ domain: "animais", type: "cadastrar" }]
      },
      data: { brinco: "B-120", categoria: "vaca", nome: "Estrela" },
      requiresConfirmation: true
    }
  },
  {
    user: "paguei 1500 de salario para Joao",
    plan: {
      action: "execute", capability: "registrar_pagamento_funcionario", confidence: 0.92,
      semantic: {
        intent: "registrar_pagamento_funcionario",
        scope: "funcionarios",
        entities: { funcionario: "Joao" },
        money: { value: 1500, type: "despesa", category: "salario" },
        date: "hoje",
        effects: [{ domain: "funcionarios", type: "pagamento" }, { domain: "financeiro", type: "despesa" }]
      },
      data: { funcionario_ref: "Joao", valor: 1500, pagamento_tipo: "salario", data: "hoje" },
      requiresConfirmation: true
    }
  },
  {
    user: "Joao chegou agora",
    plan: {
      action: "execute", capability: "registrar_ponto_funcionario", operation: "registrar_ponto", confidence: 0.9,
      semantic: {
        intent: "registrar_ponto_funcionario",
        scope: "ponto_funcionario",
        entities: { funcionario: "Joao" },
        attributes: { tipo: "entrada" },
        date: "hoje",
        effects: [{ domain: "ponto_funcionario", type: "entrada" }]
      },
      data: { funcionario_ref: "Joao", tipo: "entrada", data: "hoje" },
      requiresConfirmation: true
    }
  },
  {
    user: "excluir todo o rebanho",
    plan: {
      action: "block", domain: "animais", confidence: 0.99, requiresConfirmation: false,
      safety: { risk: "high", reason: "exclusao em massa proibida pelo WhatsApp" }
    }
  }
];

export function buildActionPlanPromptFragment(input: { manifest?: DomainManifest; currentDate?: string; timezone?: string } = {}) {
  const manifest = input.manifest || RANCHO_DOMAIN_MANIFEST;
  return [
    `ActionPlan prompt version: ${ACTION_PLAN_PROMPT_VERSION}`,
    "Retorne somente um objeto JSON ActionPlan. Nao retorne markdown, texto livre, bloco ```json, intent legado ou SQL.",
    "Voce interpreta a intencao. O backend valida e executa. Voce nunca acessa o banco e nunca decide salvar.",
    "Use somente action=query|create|update|execute|import_table|clarify|block e somente dominios, campos e enums do manifest.",
    "Para mensagens comuns de operacao do usuario, prefira action=execute com uma capability permitida. Isso da liberdade sem inventar intent legado.",
    "Capabilities permitidas: " + ACTION_PLAN_CAPABILITIES.join(", ") + ".",
    "Todo plano deve incluir semantic sempre que a mensagem tiver uma intencao operacional ou consulta. semantic e um bloco semantico, nao uma permissao para executar.",
    "Formato semantic recomendado: { intent, scope, operation, domains, entities, attributes, quantity, money, date, period, effects, report, missingFields, risk }.",
    "Use semantic.entities para animal, mae, cria, pai, funcionario, item, lote; use semantic.quantity para quantidade/unidade; use semantic.money para valor/tipo/categoria; use semantic.effects para efeitos cruzados entre dominios.",
    "Para relatorios e consultas, use semantic.scope e semantic.report.type/detailLevel/includeDomains. Exemplo: resumo dos eventos de hoje => report.type=eventos, detailLevel=resumo, scope=eventos.",
    "O backend so executa capabilities e dominios permitidos, valida campos pelo manifest e exige confirmacao para mutacoes. Nunca use semantic para escapar dessas regras.",
    "Em action=execute, use capability, semantic, data, confidence e requiresConfirmation. Mutacoes exigem requiresConfirmation=true; consultas exigem false.",
    "Use action=query quando precisar de filtros/agregacoes mais ricos. Use action=import_table para tabelas.",
    "Nao invente IDs, valores, sexo da cria, pai, codigo, data, resultado financeiro, tabela ou coluna Supabase.",
    "query exige requiresConfirmation=false. create, update, execute mutacional e import_table exigem requiresConfirmation=true.",
    "Se faltar dado obrigatorio, use clarify, missingFields e userQuestion. Nao complete o dado por suposicao.",
    "Pedido destrutivo, SQL, delete ou update em massa deve usar block com safety.risk=high.",
    "Lancamento financeiro puro sem item fisico usa create domain=financeiro. Entrada, entrou, recebi, receita e ganhei viram tipo=entrada/receita. Saida, saiu, paguei, gastei e despesa viram tipo=saida/despesa.",
    "Consultas financeiras com termo, como 'quanto gastei com racao esse mes', devem preservar tipo=despesa quando houver gasto/paguei e filtro descricao/categoria contains com o termo mencionado.",
    "Compra ou venda de item fisico com quantidade, unidade, item e valor deve usar domain=estoque, gera_financeiro=true. Compra vira entrada de estoque + despesa; venda vira saida de estoque + receita. Nao use somente financeiro nesses casos.",
    "Cadastro de item/produto/insumo/material no estoque, sem verbo de compra/venda/entrada/saida/uso, deve usar action=execute capability=cadastrar_item_estoque ou action=create domain=estoque. Quantidade inicial pode ficar ausente para o backend perguntar ao usuario.",
    "Consultas coletivas como dados do rebanho, dados das vacas, dados das vagas, lista das vacas, vacas cadastradas ou meus animais usam action=query domain=animais. Nao use animal_ref para plural/coletivo; use categoria quando houver vaca, boi, bezerro, novilha ou touro.",
    "Consultas de um animal especifico com brinco/codigo/nome claro, como dados da vaca B-001, ficha da Mimosa ou historico do animal 120, usam action=query domain=animais com filtro animal_ref. Nao transforme isso em consulta coletiva.",
    "Consultas de funcionarios, equipe, dados dos funcionarios, salarios ou cargos usam action=query domain=funcionarios. Consultas de ponto, presenca, quem bateu ponto, entradas ou saidas de funcionario usam action=query domain=ponto_funcionario.",
    "Cadastro de animal: nao use a mesma palavra solta como nome e brinco/codigo. Se a mensagem disser apenas 'criar vaca Felipe', trate Felipe como nome e deixe brinco/codigo faltando. So preencha brinco/codigo quando houver marcador explicito (brinco, codigo, numero) ou formato claro de codigo com numero/hifen.",
    "Consultas genericas como quais eventos teve hoje, eventos de hoje, registros de hoje, o que aconteceu hoje, movimentacoes de hoje, resumo do dia ou fechamento de hoje usam action=query domain=observacoes, operation=eventos_gerais, requiresConfirmation=false.",
    "Nao classifique consulta generica de eventos como saude_sanitario ou reproducao. Use saude_sanitario apenas quando houver vacina, tratamento, medicamento, vermifugo, antibiotico, doenca, morte, saude ou sanitario; use reproducao apenas quando houver parto, prenhez, inseminacao, protocolo, reteste ou cio.",
    "Para tabela, use import_table. Quando conseguir ler as linhas com seguranca, prefira data.rows com campos canonicos do manifest; use table.columnMapping como apoio campo_canonico -> coluna_original.",
    "Para lista estruturada simples ja normalizada, import_table tambem deve usar data.rows com objetos por linha.",
    "A ordem, acentos e o texto dos cabecalhos podem variar. Infira o mapping semanticamente usando o manifest, nunca exemplos literais; nao rejeite cabecalho humano como WhatsApp, Funcao, Data admissao ou Salario quando o significado estiver claro.",
    "Tabela desconhecida deve usar clarify e perguntar a area. Nao force o dominio para animais ou eventos.",
    "Nunca inclua fazenda_id, rancho_id, tenant_id, usuario_id, service role, segredo ou instrucao de persistencia.",
    "Campos da cria devem usar cria_sexo, cria_codigo e cria_nome no data; pai_ref pode ser null quando nao informado.",
    "Listas codigo:evento de reproducao devem usar import_table domain=reproducao com data.rows [{animal_ref, evento}] ou table hasHeader=false separator=':' columnMapping animal_ref=0 evento=1.",
    "Eventos aceitos nessas listas: protocolo, inseminacao, reteste, parto, pre_parto, cio, prenhez. requiresConfirmation deve ser true.",
    "Listas do tipo codigo:evento com PROTOCOLO, EM PROTOCOLO, INSEMINACAO, INSEMINAÇÃO, RETESTE, EM RETESTE, PARIU, PARTO ou PRE PARTO devem usar import_table domain=reproducao, hasHeader=false, separator=':', columnMapping animal_ref=0 e evento=1, com defaultFields.data='hoje' quando nao houver data explicita.",
    "Em import_table de reproducao, parto sem dados da cria ainda e uma linha valida de evento da mae. Nao use clarify para cada parto da tabela.",
    "Em import_table de reproducao, nao invente sexo, codigo, nome ou pai da cria. Se a tabela trouxer cria_sexo, cria_codigo, cria_nome ou pai_ref, preencha esses campos; se nao trouxer, deixe ausente para o backend tratar complemento em lote.",
    "Vacina, vermifugo, medicamento, antibiotico e tratamento usam create no dominio saude_sanitario, operation=registro_sanitario.",
    "Morte, morreu, morta, morto, obito, obito com acento, faleceu ou falecimento de animal usam create domain=saude_sanitario, operation=registro_morte, evento=morte. O backend registra o evento e marca o animal como morto somente apos confirmacao.",
    "Em saude_sanitario use animal_ref, item, quantidade, unidade, tipo e data. Normalize vermifugo e antibiotico como medicamento ou tratamento sem inventar dose.",
    "Se houver lote_ref sem animal individual e o plano nao puder ser executado por lote com seguranca, use clarify. Nao gere baixa de estoque implicitamente.",
    "Ponto de funcionario em fala natural, como 'Joao chegou agora' ou 'Maria saiu', usa create domain=ponto_funcionario com funcionario_ref igual ao nome informado e tipo entrada/saida. Nao peca codigo se houver nome.",
    "Para parto individual sem sexo da cria, use clarify com domain=reproducao, operation=parto, data.animal_ref ou data.mae_ref, data.evento=PARTO e missingFields=[cria_sexo].",
    "Parida e recem-parida sao estados derivados de evento de parto; nao altere categoria, lote ou fase produtiva.",
    "Protocolo de inseminacao normaliza para em_protocolo e nova tentativa ou retorno de inseminacao normaliza para em_reteste, sem inventar resultado ou prenhez.",
    "",
    "Memoria de melhoria continua:",
    ACTION_PLAN_DESIGN_MEMORY.join("\n"),
    "",
    "Domain manifest:",
    JSON.stringify(summarizeDomainManifestForPrompt(manifest)),
    "",
    "Exemplos de contrato:",
    JSON.stringify(EXAMPLES),
    "",
    `Data atual do rancho: ${input.currentDate || getRanchTodayISO()}`,
    `Data atual: ${input.currentDate || getRanchTodayISO()}`,
    `Timezone: ${input.timezone || RANCH_TIMEZONE}`
  ].join("\n");
}
