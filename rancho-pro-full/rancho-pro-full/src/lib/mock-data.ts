import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";

export const mockData: Record<string, AnyRecord[]> = {
  [TABLES.animals]: [
    { id: "a1", name: "Estrela", tag_number: "B-042", category: "vaca", breed: "Girolando", birth_date: "2020-03-18", weight_kg: 520, reproductive_status: "prenha", health_status: "ok", status: "ativo", notes: "Alta produtividade", created_at: "2026-05-20" },
    { id: "a2", name: "Mimosa", tag_number: "B-017", category: "vaca", breed: "Holandesa", birth_date: "2019-08-12", weight_kg: 610, reproductive_status: "normal", health_status: "ok", status: "ativo", notes: "Boa persistência de lactação", created_at: "2026-05-18" },
    { id: "a3", name: "Thor", tag_number: "T-003", category: "touro", breed: "Gir", birth_date: "2021-02-04", weight_kg: 760, reproductive_status: "normal", health_status: "ok", status: "ativo", notes: "Reprodutor", created_at: "2026-05-10" }
  ],
  [TABLES.milkProductions]: [
    { id: "p1", animal_name: "Estrela", animal_tag: "B-042", liters: 24.5, period: "manha", produced_at: "2026-05-30", quality: "boa", notes: "Ordenha normal" },
    { id: "p2", animal_name: "Mimosa", animal_tag: "B-017", liters: 31.2, period: "manha", produced_at: "2026-05-30", quality: "boa", notes: "Excelente produção" },
    { id: "p3", animal_name: "Estrela", animal_tag: "B-042", liters: 19.4, period: "tarde", produced_at: "2026-05-29", quality: "boa", notes: "" }
  ],
  [TABLES.stockItems]: [
    { id: "s1", name: "Ração 22%", category: "racao", quantity: 18, unit: "sacos", min_quantity: 12, cost: 118, supplier: "Agro Minas", expiration_date: "2026-10-20", notes: "" },
    { id: "s2", name: "Vacina clostridial", category: "vacina", quantity: 4, unit: "unidades", min_quantity: 8, cost: 47, supplier: "Vet Campo", expiration_date: "2026-07-01", notes: "Comprar urgente" },
    { id: "s3", name: "Sal mineral", category: "racao", quantity: 9, unit: "sacos", min_quantity: 10, cost: 86, supplier: "Cooperativa", expiration_date: "2027-01-12", notes: "Estoque crítico" }
  ],
  [TABLES.financialEntries]: [
    { id: "f1", type: "receita", amount: 14800, category: "Venda de leite", description: "Recebimento laticínio", due_date: "2026-05-28", status: "pago", payment_method: "pix", notes: "" },
    { id: "f2", type: "despesa", amount: 3890, category: "Ração", description: "Compra de ração", due_date: "2026-05-24", status: "pago", payment_method: "boleto", notes: "" },
    { id: "f3", type: "despesa", amount: 730, category: "Veterinário", description: "Atendimento rebanho", due_date: "2026-05-21", status: "pago", payment_method: "pix", notes: "" }
  ],
  [TABLES.employees]: [
    { id: "e1", name: "João Silva", role: "Ordenhador", salary: 2400, benefits: 280, phone: "31999990000", admission_date: "2024-01-15", status: "ativo", notes: "Turno manhã" },
    { id: "e2", name: "Maria Santos", role: "Tratadora", salary: 2200, benefits: 260, phone: "31988887777", admission_date: "2023-09-02", status: "ativo", notes: "Responsável por alimentação" }
  ],
  [TABLES.payrolls]: [
    { id: "r1", employee_name: "João Silva", month: "2026-05", base_salary: 2400, additions: 180, discounts: 96, benefits: 280, net_salary: 2764, status: "aberta", notes: "" },
    { id: "r2", employee_name: "Maria Santos", month: "2026-05", base_salary: 2200, additions: 140, discounts: 88, benefits: 260, net_salary: 2512, status: "aberta", notes: "" }
  ],
  [TABLES.activityLogs]: [
    { id: "l1", action: "Produção registrada", actor: "WhatsApp", description: "Estrela - 24,5 L", created_at: "2026-05-30T08:12:00" },
    { id: "l2", action: "Estoque crítico", actor: "Sistema", description: "Vacina clostridial abaixo do mínimo", created_at: "2026-05-30T09:30:00" }
  ],
  [TABLES.notifications]: [
    { id: "n1", title: "Vacina em estoque crítico", message: "Vacina clostridial está abaixo do mínimo", level: "warning", created_at: "2026-05-30T09:30:00" },
    { id: "n2", title: "Produção atualizada", message: "Dashboard sincronizado com os registros de hoje", level: "success", created_at: "2026-05-30T10:15:00" }
  ],
  [TABLES.whatsappSessions]: []
};
