import type { ModuleConfig } from "@/lib/types";
import { currentMonth, todayISO } from "@/lib/utils";

export const TABLES = {
  animals: "animals",
  milkProductions: "milk_productions",
  stockItems: "stock_items",
  financialEntries: "financial_entries",
  employees: "employees",
  payrolls: "payrolls",
  activityLogs: "activity_logs",
  notifications: "notifications",
  whatsappSessions: "whatsapp_sessions"
};

export const moduleConfigs: ModuleConfig[] = [
  {
    key: "rebanho",
    title: "Gestão de Rebanho",
    subtitle: "Vacas, bezerros, touros, histórico, status sanitário e identificação individual.",
    tableName: TABLES.animals,
    icon: "PawPrint",
    primaryColumn: "name",
    descriptionColumn: "tag_number",
    orderBy: "created_at",
    fields: [
      { name: "name", label: "Nome do animal", type: "text", required: true, placeholder: "Ex: Estrela" },
      { name: "tag_number", label: "Número do brinco", type: "text", required: true, placeholder: "Ex: B-042" },
      { name: "category", label: "Categoria", type: "select", required: true, defaultValue: "vaca", options: [
        { label: "Vaca", value: "vaca" }, { label: "Bezerro", value: "bezerro" }, { label: "Touro", value: "touro" }
      ] },
      { name: "breed", label: "Raça", type: "text", placeholder: "Ex: Girolando" },
      { name: "birth_date", label: "Nascimento", type: "date" },
      { name: "weight_kg", label: "Peso kg", type: "number", defaultValue: 0 },
      { name: "reproductive_status", label: "Reprodução", type: "select", defaultValue: "normal", options: [
        { label: "Normal", value: "normal" }, { label: "Prenha", value: "prenha" }, { label: "Em cio", value: "cio" }, { label: "Pós-parto", value: "pos_parto" }
      ] },
      { name: "health_status", label: "Sanitário", type: "select", defaultValue: "ok", options: [
        { label: "Ok", value: "ok" }, { label: "Vacinação pendente", value: "vacinacao_pendente" }, { label: "Em tratamento", value: "tratamento" }
      ] },
      { name: "status", label: "Status", type: "select", defaultValue: "ativo", options: [
        { label: "Ativo", value: "ativo" }, { label: "Vendido", value: "vendido" }, { label: "Falecido", value: "falecido" }
      ] },
      { name: "notes", label: "Histórico / observações", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Animais", field: "id", mode: "count" },
      { label: "Peso médio", field: "weight_kg", mode: "avg", suffix: " kg" }
    ]
  },
  {
    key: "producao",
    title: "Produção Leiteira",
    subtitle: "Registros diários por vaca, médias, ranking e histórico de produtividade.",
    tableName: TABLES.milkProductions,
    icon: "Droplets",
    primaryColumn: "animal_name",
    descriptionColumn: "liters",
    orderBy: "produced_at",
    fields: [
      { name: "animal_name", label: "Vaca", type: "text", required: true, placeholder: "Ex: Estrela" },
      { name: "animal_tag", label: "Brinco", type: "text", placeholder: "Ex: B-042" },
      { name: "liters", label: "Litros", type: "number", required: true, defaultValue: 0 },
      { name: "period", label: "Ordenha", type: "select", defaultValue: "manha", options: [
        { label: "Manhã", value: "manha" }, { label: "Tarde", value: "tarde" }, { label: "Noite", value: "noite" }, { label: "WhatsApp", value: "whatsapp" }
      ] },
      { name: "produced_at", label: "Data", type: "date", defaultValue: todayISO() },
      { name: "quality", label: "Qualidade", type: "select", defaultValue: "boa", options: [
        { label: "Boa", value: "boa" }, { label: "Regular", value: "regular" }, { label: "Descartar", value: "descartar" }
      ] },
      { name: "notes", label: "Observações", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Registros", field: "id", mode: "count" },
      { label: "Total", field: "liters", mode: "sum", suffix: " L" },
      { label: "Média", field: "liters", mode: "avg", suffix: " L" }
    ]
  },
  {
    key: "estoque",
    title: "Gestão de Estoque",
    subtitle: "Ração, medicamentos, vacinas, entradas, saídas e estoque crítico.",
    tableName: TABLES.stockItems,
    icon: "PackageOpen",
    primaryColumn: "name",
    descriptionColumn: "category",
    orderBy: "created_at",
    fields: [
      { name: "name", label: "Produto / insumo", type: "text", required: true, placeholder: "Ex: Ração 22%" },
      { name: "category", label: "Categoria", type: "select", required: true, defaultValue: "racao", options: [
        { label: "Ração", value: "racao" }, { label: "Medicamento", value: "medicamento" }, { label: "Vacina", value: "vacina" }, { label: "Material", value: "material" }
      ] },
      { name: "quantity", label: "Quantidade", type: "number", required: true, defaultValue: 0 },
      { name: "unit", label: "Unidade", type: "select", defaultValue: "kg", options: [
        { label: "kg", value: "kg" }, { label: "sacos", value: "sacos" }, { label: "unidades", value: "unidades" }, { label: "litros", value: "litros" }
      ] },
      { name: "min_quantity", label: "Estoque mínimo", type: "number", defaultValue: 0 },
      { name: "cost", label: "Custo unitário", type: "currency", defaultValue: 0 },
      { name: "supplier", label: "Fornecedor", type: "text" },
      { name: "expiration_date", label: "Validade", type: "date" },
      { name: "notes", label: "Observações", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Itens", field: "id", mode: "count" },
      { label: "Críticos", field: "quantity", mode: "critical" }
    ]
  },
  {
    key: "financeiro",
    title: "Financeiro",
    subtitle: "Receitas, despesas, contas a pagar, contas a receber e fluxo de caixa.",
    tableName: TABLES.financialEntries,
    icon: "Wallet",
    primaryColumn: "description",
    descriptionColumn: "category",
    orderBy: "due_date",
    fields: [
      { name: "type", label: "Tipo", type: "select", required: true, defaultValue: "receita", options: [
        { label: "Receita", value: "receita" }, { label: "Despesa", value: "despesa" }
      ] },
      { name: "amount", label: "Valor", type: "currency", required: true, defaultValue: 0 },
      { name: "category", label: "Categoria", type: "text", required: true, placeholder: "Ex: Venda de leite" },
      { name: "description", label: "Descrição", type: "text", required: true, placeholder: "Ex: Recebimento laticínio" },
      { name: "due_date", label: "Data", type: "date", defaultValue: todayISO() },
      { name: "status", label: "Status", type: "select", defaultValue: "pago", options: [
        { label: "Pago", value: "pago" }, { label: "Pendente", value: "pendente" }, { label: "Atrasado", value: "atrasado" }
      ] },
      { name: "payment_method", label: "Forma de pagamento", type: "select", defaultValue: "pix", options: [
        { label: "Pix", value: "pix" }, { label: "Dinheiro", value: "dinheiro" }, { label: "Cartão", value: "cartao" }, { label: "Boleto", value: "boleto" }, { label: "WhatsApp", value: "whatsapp" }
      ] },
      { name: "notes", label: "Observações", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Receitas", field: "amount", mode: "moneyIn" },
      { label: "Despesas", field: "amount", mode: "moneyOut" }
    ]
  },
  {
    key: "funcionarios",
    title: "Funcionários",
    subtitle: "Equipe, salários, presença, férias, benefícios e histórico de pagamentos.",
    tableName: TABLES.employees,
    icon: "Users",
    primaryColumn: "name",
    descriptionColumn: "role",
    orderBy: "created_at",
    fields: [
      { name: "name", label: "Nome", type: "text", required: true, placeholder: "Ex: João Silva" },
      { name: "role", label: "Cargo", type: "text", required: true, placeholder: "Ex: Ordenhador" },
      { name: "salary", label: "Salário", type: "currency", defaultValue: 0 },
      { name: "benefits", label: "Benefícios", type: "currency", defaultValue: 0 },
      { name: "phone", label: "Telefone", type: "tel", placeholder: "Ex: 31999990000" },
      { name: "admission_date", label: "Admissão", type: "date", defaultValue: todayISO() },
      { name: "status", label: "Status", type: "select", defaultValue: "ativo", options: [
        { label: "Ativo", value: "ativo" }, { label: "Férias", value: "ferias" }, { label: "Afastado", value: "afastado" }, { label: "Desligado", value: "desligado" }
      ] },
      { name: "notes", label: "Observações", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Ativos", field: "id", mode: "count" },
      { label: "Folha base", field: "salary", mode: "sum" }
    ]
  },
  {
    key: "folha",
    title: "Folha de Pagamento",
    subtitle: "Cálculo mensal, adicionais, descontos, benefícios e pagamentos.",
    tableName: TABLES.payrolls,
    icon: "Receipt",
    primaryColumn: "employee_name",
    descriptionColumn: "month",
    orderBy: "created_at",
    fields: [
      { name: "employee_name", label: "Funcionário", type: "text", required: true, placeholder: "Ex: João Silva" },
      { name: "month", label: "Mês", type: "month", defaultValue: currentMonth() },
      { name: "base_salary", label: "Salário base", type: "currency", defaultValue: 0 },
      { name: "additions", label: "Adicionais", type: "currency", defaultValue: 0 },
      { name: "discounts", label: "Descontos", type: "currency", defaultValue: 0 },
      { name: "benefits", label: "Benefícios", type: "currency", defaultValue: 0 },
      { name: "net_salary", label: "Líquido", type: "currency", defaultValue: 0 },
      { name: "status", label: "Status", type: "select", defaultValue: "aberta", options: [
        { label: "Aberta", value: "aberta" }, { label: "Fechada", value: "fechada" }, { label: "Paga", value: "paga" }
      ] },
      { name: "notes", label: "Observações", type: "textarea", tableVisible: false }
    ],
    quickStats: [
      { label: "Registros", field: "id", mode: "count" },
      { label: "Total líquido", field: "net_salary", mode: "sum" }
    ]
  }
];

export function getModuleConfig(key: string) {
  return moduleConfigs.find((module) => module.key === key);
}
