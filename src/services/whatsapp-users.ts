"use client";

import { createRecord, listRecords, updateRecord } from "@/services/crud";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext } from "@/lib/types";
import { isValidBrazilianPhone, normalizeBrazilianWhatsApp } from "@/lib/input-format";

const INVALID_WHATSAPP_MESSAGE = "Informe um WhatsApp válido para o funcionário.";
const DUPLICATE_WHATSAPP_MESSAGE = "Já existe um funcionário ativo com este WhatsApp nesta fazenda.";

function requireFarm(context?: DataContext) {
  if (!context?.fazendaId) throw new Error("Não foi possível identificar a fazenda para vincular o WhatsApp.");
}

export function normalizeEmployeeWhatsApp(value: unknown) {
  const phone = normalizeBrazilianWhatsApp(String(value || ""));
  if (!isValidBrazilianPhone(phone)) throw new Error(INVALID_WHATSAPP_MESSAGE);
  return phone;
}

export async function assertUniqueActiveEmployeeWhatsApp(employee: AnyRecord, context?: DataContext) {
  requireFarm(context);
  const phone = normalizeEmployeeWhatsApp(employee.contato_whatsapp);
  if (employee.ativo === false) return phone;

  const employees = await listRecords(TABLES.funcionarios, {
    fazendaId: context?.fazendaId,
    usuarioId: context?.usuarioId,
    orderBy: "created_at"
  });

  const duplicate = employees.find((row) => {
    if (row.id === employee.id || row.ativo === false || row.deleted_at) return false;
    const currentPhone = normalizeBrazilianWhatsApp(row.contato_whatsapp);
    return currentPhone === phone;
  });

  if (duplicate) throw new Error(DUPLICATE_WHATSAPP_MESSAGE);
  return phone;
}

async function findWhatsAppUserRows(employee: AnyRecord, phone: string, context?: DataContext) {
  requireFarm(context);
  const [byEmployee, byPhone] = await Promise.all([
    employee.id
      ? listRecords(TABLES.whatsappUsuarios, {
        fazendaId: context?.fazendaId,
        usuarioId: context?.usuarioId,
        orderBy: "created_at",
        filters: [{ column: "funcionario_id", value: employee.id }]
      })
      : Promise.resolve([]),
    phone
      ? listRecords(TABLES.whatsappUsuarios, {
        fazendaId: context?.fazendaId,
        usuarioId: context?.usuarioId,
        orderBy: "created_at",
        filters: [{ column: "telefone_e164", value: phone }]
      })
      : Promise.resolve([])
  ]);

  return [...byEmployee, ...byPhone].filter((row, index, rows) => {
    return row.id && rows.findIndex((item) => item.id === row.id) === index;
  });
}

export async function syncEmployeeWhatsAppUser(employee: AnyRecord, context?: DataContext) {
  requireFarm(context);
  if (!employee.id) throw new Error("Não foi possível vincular o WhatsApp ao funcionário salvo.");

  const phone = await assertUniqueActiveEmployeeWhatsApp(employee, context);
  const payload = {
    fazenda_id: context?.fazendaId,
    telefone_e164: phone,
    usuario_id: employee.usuario_id || null,
    funcionario_id: employee.id,
    nome_exibicao: employee.nome || "Funcionário",
    papel_bot: "funcionario",
    ativo: employee.ativo !== false
  };

  const rows = await findWhatsAppUserRows(employee, phone, context);
  const ownRow = rows.find((row) => row.funcionario_id === employee.id);
  const reusablePhoneRow = rows.find((row) => row.telefone_e164 === phone && (row.ativo === false || !row.funcionario_id));
  const target = ownRow || (employee.ativo !== false ? reusablePhoneRow : undefined);

  if (target?.id) {
    await updateRecord(TABLES.whatsappUsuarios, target.id, payload);
    await Promise.all(rows
      .filter((row) => row.id !== target.id && row.funcionario_id === employee.id)
      .map((row) => updateRecord(TABLES.whatsappUsuarios, row.id, { ativo: false })));
    return;
  }

  await createRecord(TABLES.whatsappUsuarios, payload, context);
}

export async function deactivateEmployeeWhatsAppUser(employee: AnyRecord, context?: DataContext, options: { clearEmployeeLink?: boolean } = {}) {
  requireFarm(context);
  const phone = normalizeBrazilianWhatsApp(employee.contato_whatsapp);
  const rows = await findWhatsAppUserRows(employee, phone, context);
  await Promise.all(rows.map((row) => updateRecord(TABLES.whatsappUsuarios, row.id, {
    ativo: false,
    ...(options.clearEmployeeLink ? { funcionario_id: null } : {})
  })));
}
