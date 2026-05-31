import type { ModuleConfig } from "@/lib/types";
import { currentMonth, nowLocalDatetime, todayISO } from "@/lib/utils";

export const TABLES = {
  fazendas: "fazendas",
  usuarios: "usuarios",
  lotes: "lotes",
  animais: "animais",
  eventosAnimal: "eventos_animal",
  ordenhas: "ordenhas",
  estoqueItens: "estoque_itens",
  estoqueMovimentacoes: "estoque_movimentacoes",
  transacoesFinanceiras: "transacoes_financeiras",
  funcionarios: "funcionarios",
  registrosPonto: "registros_ponto",
  folhaPagamento: "folha_pagamento",
  whatsappUsuarios: "whatsapp_usuarios",
  whatsappSessoes: "whatsapp_sessoes",
  whatsappMensagens: "whatsapp_mensagens",
  alertas: "alertas",
  auditoriaLogs: "auditoria_logs"
} as const;

export const FARM_SCOPED_TABLES = new Set<string>([
  TABLES.usuarios,
  TABLES.lotes,
  TABLES.animais,
  TABLES.eventosAnimal,
  TABLES.ordenhas,
  TABLES.estoqueItens,
  TABLES.estoqueMovimentacoes,
  TABLES.transacoesFinanceiras,
  TABLES.funcionarios,
  TABLES.registrosPonto,
  TABLES.folhaPagamento,
  TABLES.whatsappUsuarios,
  TABLES.whatsappSessoes,
  TABLES.whatsappMensagens,
  TABLES.alertas,
  TABLES.auditoriaLogs
]);

export const CREATED_BY_FIELDS: Record<string, string> = {
  [TABLES.animais]: "created_by",
  [TABLES.estoqueItens]: "created_by",
  [TABLES.estoqueMovimentacoes]: "responsavel_usuario_id",
  [TABLES.transacoesFinanceiras]: "created_by",
  [TABLES.registrosPonto]: "created_by",
  [TABLES.ordenhas]: "registrado_por",
  [TABLES.eventosAnimal]: "responsavel_usuario_id"
};

const animalCategories = [
  { label: "Vaca", value: "vaca" },
  { label: "Boi", value: "boi" },
  { label: "Bezerro", value: "bezerro" },
  { label: "Novilha", value: "novilha" },
  { label: "Touro", value: "touro" },
  { label: "Outro", value: "outro" }
];

const animalPhases = [
  { label: "Lactacao", value: "lactacao" },
  { label: "Seca", value: "seca" },
  { label: "Gestante", value: "gestante" },
  { label: "Vazia", value: "vazia" },
  { label: "Crescimento", value: "crescimento" },
  { label: "Engorda", value: "engorda" },
  { label: "Nao aplicavel", value: "nao_aplicavel" }
];

const animalStatus = [
  { label: "Ativo", value: "ativo" },
  { label: "Vendido", value: "vendido" },
  { label: "Morto", value: "morto" },
  { label: "Inativo", value: "inativo" }
];

export const moduleConfigs: ModuleConfig[] = [
  {
    key: "lotes",
    title: "Lotes",
    subtitle: "Grupos de manejo para organizar o rebanho por fase, piquete ou finalidade.",
    tableName: TABLES.lotes,
    icon: "Layers3",
    primaryColumn: "nome",
    descriptionColumn: "descricao",
    orderBy: "created_at",
    fields: [
      { name: "nome", label: "Nome do lote", type: "text", required: true, placeholder: "Ex: Lactacao 1" },
      { name: "descricao", label: "Descricao", type: "textarea", tableVisible: false },
      { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: "true" }
    ],
    quickStats: [
      { label: "Lotes", field: "id", mode: "count" },
      { label: "Ativos", field: "ativo", mode: "active" }
    ]
  },
  {
    key: "rebanho",
    title: "Gestao de Rebanho",
    subtitle: "Animais, brincos, categorias, fases produtivas, lotes e historico individual.",
    tableName: TABLES.animais,
    icon: "PawPrint",
    primaryColumn: "brinco",
    descriptionColumn: "categoria",
    orderBy: "created_at",
    fields: [
      { name: "brinco", label: "Numero do brinco", type: "text", required: true, placeholder: "Ex: B-042" },
      { name: "categoria", label: "Categoria", type: "select", required: true, defaultValue: "vaca", options: animalCategories },
      { name: "fase", label: "Fase", type: "select", defaultValue: "nao_aplicavel", options: animalPhases },
      { name: "raca", label: "Raca", type: "text", placeholder: "Ex: Girolando" },
      {
        name: "lote_id",
        label: "Lote",
        type: "relation",
        relation: { tableName: TABLES.lotes, labelColumn: "nome", descriptionColumn: "descricao", orderBy: "nome" }
      },
      { name: "data_nascimento", label: "Nascimento", type: "date" },
      { name: "peso", label: "Peso kg", type: "number", defaultValue: 0 },
      { name: "status", label: "Status", type: "select", defaultValue: "ativo", options: animalStatus },
      { name: "observacoes", label: "Historico / observacoes", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Animais", field: "id", mode: "count" },
      { label: "Ativos", field: "status", mode: "active" },
      { label: "Peso medio", field: "peso", mode: "avg", suffix: " kg" }
    ]
  },
  {
    key: "eventos",
    title: "Eventos do Animal",
    subtitle: "Partos, vacinas, doencas, tratamentos, pesagens e observacoes do rebanho.",
    tableName: TABLES.eventosAnimal,
    icon: "ClipboardList",
    primaryColumn: "tipo",
    descriptionColumn: "descricao",
    orderBy: "data_evento",
    fields: [
      {
        name: "animal_id",
        label: "Animal",
        type: "relation",
        required: true,
        relation: { tableName: TABLES.animais, labelColumn: "brinco", descriptionColumn: "categoria", orderBy: "brinco" }
      },
      { name: "tipo", label: "Tipo", type: "select", required: true, defaultValue: "observacao", options: [
        { label: "Parto", value: "parto" },
        { label: "Vacina", value: "vacina" },
        { label: "Doenca", value: "doenca" },
        { label: "Tratamento", value: "tratamento" },
        { label: "Inseminacao", value: "inseminacao" },
        { label: "Pesagem", value: "pesagem" },
        { label: "Observacao", value: "observacao" },
        { label: "Outro", value: "outro" }
      ] },
      { name: "data_evento", label: "Data e hora", type: "datetime-local", defaultValue: nowLocalDatetime() },
      { name: "descricao", label: "Descricao", type: "textarea" },
      { name: "medicamento", label: "Medicamento", type: "text" },
      { name: "dose", label: "Dose", type: "text" },
      { name: "custo", label: "Custo", type: "currency", defaultValue: 0 }
    ],
    quickStats: [
      { label: "Eventos", field: "id", mode: "count" },
      { label: "Custos", field: "custo", mode: "sum" }
    ]
  },
  {
    key: "producao",
    title: "Producao Leiteira",
    subtitle: "Ordenhas por animal, turnos, destino do leite e origem do registro.",
    tableName: TABLES.ordenhas,
    icon: "Droplets",
    primaryColumn: "animal_id",
    descriptionColumn: "litros",
    orderBy: "ordenhado_em",
    fields: [
      {
        name: "animal_id",
        label: "Animal",
        type: "relation",
        required: true,
        relation: { tableName: TABLES.animais, labelColumn: "brinco", descriptionColumn: "categoria", orderBy: "brinco" }
      },
      { name: "litros", label: "Litros", type: "number", required: true, defaultValue: 0 },
      { name: "turno", label: "Turno", type: "select", required: true, defaultValue: "manha", options: [
        { label: "Manha", value: "manha" },
        { label: "Tarde", value: "tarde" },
        { label: "Noite", value: "noite" }
      ] },
      { name: "ordenhado_em", label: "Data e hora", type: "datetime-local", defaultValue: nowLocalDatetime() },
      { name: "destino", label: "Destino", type: "select", defaultValue: "tanque", options: [
        { label: "Tanque", value: "tanque" },
        { label: "Venda", value: "venda" },
        { label: "Consumo", value: "consumo" },
        { label: "Descarte", value: "descarte" }
      ] },
      { name: "observacoes", label: "Observacoes", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Registros", field: "id", mode: "count" },
      { label: "Total", field: "litros", mode: "sum", suffix: " L" },
      { label: "Media", field: "litros", mode: "avg", suffix: " L" }
    ]
  },
  {
    key: "estoque",
    title: "Gestao de Estoque",
    subtitle: "Racao, medicamentos, insumos, equipamentos, saldo atual e estoque minimo.",
    tableName: TABLES.estoqueItens,
    icon: "PackageOpen",
    primaryColumn: "nome",
    descriptionColumn: "categoria",
    orderBy: "created_at",
    fields: [
      { name: "nome", label: "Produto / insumo", type: "text", required: true, placeholder: "Ex: Racao 22%" },
      { name: "categoria", label: "Categoria", type: "select", required: true, defaultValue: "racao", options: [
        { label: "Racao", value: "racao" },
        { label: "Medicamento", value: "medicamento" },
        { label: "Insumo", value: "insumo" },
        { label: "Equipamento", value: "equipamento" },
        { label: "Outro", value: "outro" }
      ] },
      { name: "unidade_medida", label: "Unidade", type: "text", required: true, defaultValue: "kg", placeholder: "kg, saco, L, unidade" },
      { name: "quantidade_atual", label: "Quantidade atual", type: "number", required: true, defaultValue: 0 },
      { name: "quantidade_minima", label: "Quantidade minima", type: "number", defaultValue: 0 },
      { name: "valor_unitario", label: "Valor unitario", type: "currency", defaultValue: 0 },
      { name: "fornecedor", label: "Fornecedor", type: "text" },
      { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: "true" }
    ],
    quickStats: [
      { label: "Itens", field: "id", mode: "count" },
      { label: "Criticos", field: "quantidade_atual", mode: "critical", compareField: "quantidade_minima" }
    ]
  },
  {
    key: "financeiro",
    title: "Financeiro",
    subtitle: "Entradas, saidas, categorias, comprovantes e fluxo de caixa da fazenda.",
    tableName: TABLES.transacoesFinanceiras,
    icon: "Wallet",
    primaryColumn: "descricao",
    descriptionColumn: "categoria",
    orderBy: "data_transacao",
    fields: [
      { name: "tipo", label: "Tipo", type: "select", required: true, defaultValue: "entrada", options: [
        { label: "Entrada", value: "entrada" },
        { label: "Saida", value: "saida" }
      ] },
      { name: "data_transacao", label: "Data", type: "date", defaultValue: todayISO() },
      { name: "valor", label: "Valor", type: "currency", required: true, defaultValue: 0 },
      { name: "categoria", label: "Categoria", type: "text", required: true, placeholder: "Ex: Venda de leite" },
      { name: "descricao", label: "Descricao", type: "text", placeholder: "Ex: Recebimento do laticinio" },
      { name: "metodo_pagamento", label: "Forma de pagamento", type: "text", placeholder: "Pix, dinheiro, boleto..." }
    ],
    quickStats: [
      { label: "Entradas", field: "valor", mode: "moneyIn" },
      { label: "Saidas", field: "valor", mode: "moneyOut" }
    ]
  },
  {
    key: "funcionarios",
    title: "Funcionarios",
    subtitle: "Equipe, funcoes, admissao, salario base, contato e carga horaria.",
    tableName: TABLES.funcionarios,
    icon: "Users",
    primaryColumn: "nome",
    descriptionColumn: "funcao",
    orderBy: "created_at",
    fields: [
      { name: "nome", label: "Nome", type: "text", required: true, placeholder: "Ex: Joao Silva" },
      { name: "funcao", label: "Funcao", type: "text", required: true, placeholder: "Ex: Ordenhador" },
      { name: "cpf", label: "CPF", type: "text", placeholder: "Opcional" },
      { name: "salario_base", label: "Salario base", type: "currency", defaultValue: 0 },
      { name: "data_admissao", label: "Admissao", type: "date", required: true, defaultValue: todayISO() },
      { name: "contato_whatsapp", label: "WhatsApp", type: "tel", placeholder: "Ex: 5585999990000" },
      { name: "carga_horaria_mensal", label: "Carga mensal", type: "number", defaultValue: 220 },
      { name: "valor_hora_extra", label: "Valor hora extra", type: "currency", defaultValue: 0 },
      { name: "ativo", label: "Ativo", type: "checkbox", defaultValue: "true" }
    ],
    quickStats: [
      { label: "Funcionarios", field: "id", mode: "count" },
      { label: "Ativos", field: "ativo", mode: "active" },
      { label: "Folha base", field: "salario_base", mode: "sum" }
    ]
  },
  {
    key: "ponto",
    title: "Registros de Ponto",
    subtitle: "Entradas e saidas da equipe, inclusive registros vindos do WhatsApp.",
    tableName: TABLES.registrosPonto,
    icon: "Clock3",
    primaryColumn: "funcionario_id",
    descriptionColumn: "tipo",
    orderBy: "registrado_em",
    fields: [
      {
        name: "funcionario_id",
        label: "Funcionario",
        type: "relation",
        required: true,
        relation: { tableName: TABLES.funcionarios, labelColumn: "nome", descriptionColumn: "funcao", orderBy: "nome" }
      },
      { name: "tipo", label: "Tipo", type: "select", required: true, defaultValue: "entrada", options: [
        { label: "Entrada", value: "entrada" },
        { label: "Saida", value: "saida" }
      ] },
      { name: "registrado_em", label: "Data e hora", type: "datetime-local", defaultValue: nowLocalDatetime() },
      { name: "observacao", label: "Observacao", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Registros", field: "id", mode: "count" }
    ]
  },
  {
    key: "folha",
    title: "Folha de Pagamento",
    subtitle: "Competencia mensal, horas extras, descontos, adiantamentos e status de pagamento.",
    tableName: TABLES.folhaPagamento,
    icon: "Receipt",
    primaryColumn: "funcionario_id",
    descriptionColumn: "competencia",
    orderBy: "competencia",
    fields: [
      {
        name: "funcionario_id",
        label: "Funcionario",
        type: "relation",
        required: true,
        relation: { tableName: TABLES.funcionarios, labelColumn: "nome", descriptionColumn: "funcao", orderBy: "nome" }
      },
      { name: "competencia", label: "Competencia", type: "month", defaultValue: currentMonth() },
      { name: "salario_base", label: "Salario base", type: "currency", defaultValue: 0 },
      { name: "horas_extras", label: "Horas extras", type: "number", defaultValue: 0 },
      { name: "valor_horas_extras", label: "Valor horas extras", type: "currency", defaultValue: 0 },
      { name: "descontos", label: "Descontos", type: "currency", defaultValue: 0 },
      { name: "adiantamentos", label: "Adiantamentos", type: "currency", defaultValue: 0 },
      { name: "total_liquido", label: "Total liquido", type: "currency", defaultValue: 0 },
      { name: "status", label: "Status", type: "select", defaultValue: "rascunho", options: [
        { label: "Rascunho", value: "rascunho" },
        { label: "Fechada", value: "fechada" },
        { label: "Paga", value: "paga" },
        { label: "Cancelada", value: "cancelada" }
      ] },
      { name: "pago_em", label: "Pago em", type: "date" }
    ],
    quickStats: [
      { label: "Registros", field: "id", mode: "count" },
      { label: "Total liquido", field: "total_liquido", mode: "sum" }
    ]
  }
];

export function getModuleConfig(key: string) {
  return moduleConfigs.find((module) => module.key === key);
}
