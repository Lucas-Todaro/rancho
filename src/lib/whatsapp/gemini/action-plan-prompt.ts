import { getRanchTodayISO, RANCH_TIMEZONE } from "@/lib/dates/ranch-time";
import {
  summarizeDomainManifestForPrompt,
  type DomainManifest,
  RANCHO_DOMAIN_MANIFEST
} from "@/lib/whatsapp/gemini/domain-manifest";

export const ACTION_PLAN_PROMPT_VERSION = "rancho-gemini-action-plan-v4";

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
    user: "090 deu 15 litros ontem as 18h",
    plan: {
      action: "create", domain: "producao_leite", confidence: 0.94,
      data: { animal_ref: "090", litros: 15, data: "ontem", hora: "18:00" },
      requiresConfirmation: true
    }
  },
  {
    user: "comprei 10 sacos de racao por 500 reais",
    plan: {
      action: "create", domain: "estoque", operation: "compra_estoque", confidence: 0.92,
      data: { tipo_movimento: "entrada", item_ref: "racao", quantidade: 10, unidade: "saco", valor_total: 500, gera_financeiro: true },
      requiresConfirmation: true
    }
  },
  {
    user: "vendi 4 sacos de milho por 320 reais",
    plan: {
      action: "create", domain: "estoque", operation: "venda_estoque", confidence: 0.92,
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
      data: { mae_ref: "777", evento: "parto", data: "hoje", cria_sexo: "femea", cria_codigo: "B-777" },
      requiresConfirmation: true
    }
  },
  {
    user: "Joao chegou agora",
    plan: {
      action: "create", domain: "ponto_funcionario", operation: "registrar_ponto", confidence: 0.9,
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
    "Use somente action=query|create|update|import_table|clarify|block e somente dominios, campos e enums do manifest.",
    "Nao invente IDs, valores, sexo da cria, pai, codigo, data, resultado financeiro, tabela ou coluna Supabase.",
    "query exige requiresConfirmation=false. create, update e import_table exigem requiresConfirmation=true.",
    "Se faltar dado obrigatorio, use clarify, missingFields e userQuestion. Nao complete o dado por suposicao.",
    "Pedido destrutivo, SQL, delete ou update em massa deve usar block com safety.risk=high.",
    "Compra ou venda de item fisico com quantidade, unidade, item e valor deve usar domain=estoque, gera_financeiro=true. Compra vira entrada de estoque + despesa; venda vira saida de estoque + receita. Nao use somente financeiro nesses casos.",
    "Consultas coletivas como dados do rebanho, dados das vacas, dados das vagas, lista das vacas, vacas cadastradas ou meus animais usam action=query domain=animais. Nao use animal_ref para plural/coletivo; use categoria quando houver vaca, boi, bezerro, novilha ou touro.",
    "Para tabela, use import_table e columnMapping no formato campo_canonico -> coluna_original.",
    "Para lista estruturada simples ja normalizada, import_table tambem pode usar data.rows com objetos por linha.",
    "A ordem e o texto dos cabecalhos podem variar. Infira o mapping semanticamente usando o manifest, nunca exemplos literais.",
    "Tabela desconhecida deve usar clarify e perguntar a area. Nao force o dominio para animais ou eventos.",
    "Nunca inclua fazenda_id, rancho_id, tenant_id, usuario_id, service role, segredo ou instrucao de persistencia.",
    "Campos da cria devem usar cria_sexo, cria_codigo e cria_nome no data; pai_ref pode ser null quando nao informado.",
    "Listas codigo:evento de reproducao devem usar import_table domain=reproducao com data.rows [{animal_ref, evento}] ou table hasHeader=false separator=':' columnMapping animal_ref=0 evento=1.",
    "Eventos aceitos nessas listas: protocolo, inseminacao, reteste, parto, pre_parto, cio, prenhez. requiresConfirmation deve ser true.",
    "Listas do tipo codigo:evento com PROTOCOLO, EM PROTOCOLO, INSEMINACAO, INSEMINAÇÃO, RETESTE, EM RETESTE, PARIU, PARTO ou PRE PARTO devem usar import_table domain=reproducao, hasHeader=false, separator=':', columnMapping animal_ref=0 e evento=1, com defaultFields.data='hoje' quando nao houver data explicita.",
    "Em import_table de reproducao, parto sem dados da cria ainda e uma linha valida de evento da mae. Nao use clarify para cada parto da tabela.",
    "Em import_table de reproducao, nao invente sexo, codigo, nome ou pai da cria. Se a tabela trouxer cria_sexo, cria_codigo, cria_nome ou pai_ref, preencha esses campos; se nao trouxer, deixe ausente para o backend tratar complemento em lote.",
    "Vacina, vermifugo, medicamento, antibiotico e tratamento usam create no dominio saude_sanitario, operation=registro_sanitario.",
    "Em saude_sanitario use animal_ref, item, quantidade, unidade, tipo e data. Normalize vermifugo e antibiotico como medicamento ou tratamento sem inventar dose.",
    "Se houver lote_ref sem animal individual e o plano nao puder ser executado por lote com seguranca, use clarify. Nao gere baixa de estoque implicitamente.",
    "Ponto de funcionario em fala natural, como 'Joao chegou agora' ou 'Maria saiu', usa create domain=ponto_funcionario com funcionario_ref igual ao nome informado e tipo entrada/saida. Nao peca codigo se houver nome.",
    "Para parto individual sem sexo da cria, use clarify com domain=reproducao, operation=parto, data.animal_ref ou data.mae_ref, data.evento=PARTO e missingFields=[cria_sexo].",
    "Parida e recem-parida sao estados derivados de evento de parto; nao altere categoria, lote ou fase produtiva.",
    "Protocolo de inseminacao normaliza para em_protocolo e nova tentativa ou retorno de inseminacao normaliza para em_reteste, sem inventar resultado ou prenhez.",
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
