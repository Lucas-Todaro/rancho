import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";

export const DEMO_FAZENDA_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_USUARIO_ID = "00000000-0000-4000-8000-000000000002";

export const mockData: Record<string, AnyRecord[]> = {
  [TABLES.fazendas]: [
    {
      id: DEMO_FAZENDA_ID,
      nome: "Fazenda Modelo",
      slug: "fazenda-modelo",
      timezone: "America/Fortaleza",
      plano: "mvp",
      ativa: true,
      created_at: "2026-05-01T08:00:00.000Z"
    }
  ],
  [TABLES.usuarios]: [
    {
      id: DEMO_USUARIO_ID,
      fazenda_id: DEMO_FAZENDA_ID,
      nome: "Administrador",
      telefone: "5585999990000",
      papel: "admin",
      ativo: true,
      created_at: "2026-05-01T08:00:00.000Z"
    }
  ],
  [TABLES.lotes]: [
    { id: "lote-1", fazenda_id: DEMO_FAZENDA_ID, nome: "Lactacao 1", descricao: "Vacas em pico de producao", ativo: true, created_at: "2026-05-20T08:00:00.000Z" },
    { id: "lote-2", fazenda_id: DEMO_FAZENDA_ID, nome: "Novilhas", descricao: "Animais em crescimento", ativo: true, created_at: "2026-05-18T08:00:00.000Z" }
  ],
  [TABLES.animais]: [
    { id: "animal-1", fazenda_id: DEMO_FAZENDA_ID, brinco: "B-042", categoria: "vaca", fase: "lactacao", raca: "Girolando", lote_id: "lote-1", data_nascimento: "2020-03-18", peso: 520, status: "ativo", observacoes: "Alta produtividade", created_by: DEMO_USUARIO_ID, created_at: "2026-05-20T08:00:00.000Z" },
    { id: "animal-2", fazenda_id: DEMO_FAZENDA_ID, brinco: "B-017", categoria: "vaca", fase: "lactacao", raca: "Holandesa", lote_id: "lote-1", data_nascimento: "2019-08-12", peso: 610, status: "ativo", observacoes: "Boa persistencia de lactacao", created_by: DEMO_USUARIO_ID, created_at: "2026-05-18T08:00:00.000Z" },
    { id: "animal-3", fazenda_id: DEMO_FAZENDA_ID, brinco: "T-003", categoria: "touro", fase: "nao_aplicavel", raca: "Gir", lote_id: null, data_nascimento: "2021-02-04", peso: 760, status: "ativo", observacoes: "Reprodutor", created_by: DEMO_USUARIO_ID, created_at: "2026-05-10T08:00:00.000Z" }
  ],
  [TABLES.eventosAnimal]: [
    { id: "evento-1", fazenda_id: DEMO_FAZENDA_ID, animal_id: "animal-1", tipo: "vacina", data_evento: "2026-05-23T09:00:00.000Z", descricao: "Reforco sanitario", medicamento: "Clostridial", dose: "5 ml", custo: 47, created_at: "2026-05-23T09:00:00.000Z" }
  ],
  [TABLES.ordenhas]: [
    { id: "ordenha-1", fazenda_id: DEMO_FAZENDA_ID, animal_id: "animal-1", litros: 24.5, turno: "manha", destino: "tanque", origem: "web", ordenhado_em: "2026-05-30T08:00:00.000Z", observacoes: "Ordenha normal", registrado_por: DEMO_USUARIO_ID, created_at: "2026-05-30T08:05:00.000Z" },
    { id: "ordenha-2", fazenda_id: DEMO_FAZENDA_ID, animal_id: "animal-2", litros: 31.2, turno: "manha", destino: "tanque", origem: "web", ordenhado_em: "2026-05-30T08:20:00.000Z", observacoes: "Excelente producao", registrado_por: DEMO_USUARIO_ID, created_at: "2026-05-30T08:25:00.000Z" },
    { id: "ordenha-3", fazenda_id: DEMO_FAZENDA_ID, animal_id: "animal-1", litros: 19.4, turno: "tarde", destino: "tanque", origem: "whatsapp", ordenhado_em: "2026-05-29T16:30:00.000Z", observacoes: "", registrado_por: DEMO_USUARIO_ID, created_at: "2026-05-29T16:35:00.000Z" }
  ],
  [TABLES.estoqueItens]: [
    { id: "estoque-1", fazenda_id: DEMO_FAZENDA_ID, nome: "Racao 22%", categoria: "racao", unidade_medida: "sacos", quantidade_atual: 18, quantidade_minima: 12, valor_unitario: 118, fornecedor: "Agro Minas", ativo: true, created_by: DEMO_USUARIO_ID, created_at: "2026-05-15T08:00:00.000Z" },
    { id: "estoque-2", fazenda_id: DEMO_FAZENDA_ID, nome: "Vacina clostridial", categoria: "medicamento", unidade_medida: "unidades", quantidade_atual: 4, quantidade_minima: 8, valor_unitario: 47, fornecedor: "Vet Campo", ativo: true, created_by: DEMO_USUARIO_ID, created_at: "2026-05-13T08:00:00.000Z" },
    { id: "estoque-3", fazenda_id: DEMO_FAZENDA_ID, nome: "Sal mineral", categoria: "racao", unidade_medida: "sacos", quantidade_atual: 9, quantidade_minima: 10, valor_unitario: 86, fornecedor: "Cooperativa", ativo: true, created_by: DEMO_USUARIO_ID, created_at: "2026-05-12T08:00:00.000Z" }
  ],
  [TABLES.estoqueMovimentacoes]: [],
  [TABLES.transacoesFinanceiras]: [
    { id: "fin-1", fazenda_id: DEMO_FAZENDA_ID, tipo: "entrada", data_transacao: "2026-05-28", valor: 14800, categoria: "Venda de leite", descricao: "Recebimento laticinio", metodo_pagamento: "pix", origem: "web", created_by: DEMO_USUARIO_ID, created_at: "2026-05-28T12:00:00.000Z" },
    { id: "fin-2", fazenda_id: DEMO_FAZENDA_ID, tipo: "saida", data_transacao: "2026-05-24", valor: 3890, categoria: "Racao", descricao: "Compra de racao", metodo_pagamento: "boleto", origem: "web", created_by: DEMO_USUARIO_ID, created_at: "2026-05-24T12:00:00.000Z" },
    { id: "fin-3", fazenda_id: DEMO_FAZENDA_ID, tipo: "saida", data_transacao: "2026-05-21", valor: 730, categoria: "Veterinario", descricao: "Atendimento rebanho", metodo_pagamento: "pix", origem: "web", created_by: DEMO_USUARIO_ID, created_at: "2026-05-21T12:00:00.000Z" }
  ],
  [TABLES.funcionarios]: [
    { id: "func-1", fazenda_id: DEMO_FAZENDA_ID, nome: "Joao Silva", funcao: "Ordenhador", cpf: null, salario_base: 2400, data_admissao: "2024-01-15", contato_whatsapp: "5531999990000", carga_horaria_mensal: 220, valor_hora_extra: 18, ativo: true, created_at: "2024-01-15T08:00:00.000Z" },
    { id: "func-2", fazenda_id: DEMO_FAZENDA_ID, nome: "Maria Santos", funcao: "Tratadora", cpf: null, salario_base: 2200, data_admissao: "2023-09-02", contato_whatsapp: "553188887777", carga_horaria_mensal: 220, valor_hora_extra: 16, ativo: true, created_at: "2023-09-02T08:00:00.000Z" }
  ],
  [TABLES.registrosPonto]: [
    { id: "ponto-1", fazenda_id: DEMO_FAZENDA_ID, funcionario_id: "func-1", tipo: "entrada", registrado_em: "2026-05-30T06:00:00.000Z", origem: "web", observacao: "", created_by: DEMO_USUARIO_ID, created_at: "2026-05-30T06:00:00.000Z" }
  ],
  [TABLES.folhaPagamento]: [
    { id: "folha-1", fazenda_id: DEMO_FAZENDA_ID, funcionario_id: "func-1", competencia: "2026-05-01", salario_base: 2400, horas_extras: 10, valor_horas_extras: 180, descontos: 96, adiantamentos: 0, total_liquido: 2484, status: "rascunho", pago_em: null, created_at: "2026-05-30T08:00:00.000Z" },
    { id: "folha-2", fazenda_id: DEMO_FAZENDA_ID, funcionario_id: "func-2", competencia: "2026-05-01", salario_base: 2200, horas_extras: 8, valor_horas_extras: 140, descontos: 88, adiantamentos: 0, total_liquido: 2252, status: "rascunho", pago_em: null, created_at: "2026-05-30T08:00:00.000Z" }
  ],
  [TABLES.whatsappUsuarios]: [
    { id: "wa-user-1", fazenda_id: DEMO_FAZENDA_ID, telefone_e164: "5531999990000", usuario_id: DEMO_USUARIO_ID, funcionario_id: "func-1", nome_exibicao: "Joao Silva", papel_bot: "funcionario", ativo: true, created_at: "2026-05-01T08:00:00.000Z" }
  ],
  [TABLES.whatsappSessoes]: [],
  [TABLES.whatsappMensagens]: [],
  [TABLES.alertas]: [
    { id: "alerta-1", fazenda_id: DEMO_FAZENDA_ID, tipo: "estoque", severidade: "warning", titulo: "Vacina em estoque critico", descricao: "Vacina clostridial esta abaixo do minimo", resolvido: false, created_at: "2026-05-30T09:30:00.000Z" }
  ],
  [TABLES.auditoriaLogs]: []
};
