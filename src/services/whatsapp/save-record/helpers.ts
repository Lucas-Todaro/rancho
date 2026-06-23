import type { AnyRecord } from "@/lib/types";
import { animalBlockedMessage, isAnimalInactiveForBot } from "@/lib/whatsapp/animal-status";
import type { SaveRecordHandlerContext, SaveResult } from "@/services/whatsapp/save-record/types";

export function createSaveRecordScope(ctx: SaveRecordHandlerContext): AnyRecord {
  return {
    dados: ctx.pending.dados || {},
    saveConfirmedRecord: ctx.saveConfirmedRecord,
    ...ctx.deps
  };
}

export async function prepareAnimalRecord(ctx: SaveRecordHandlerContext): Promise<{ animal: AnyRecord; result?: never } | { animal?: never; result: SaveResult }> {
  const { supabase, owner, pending } = ctx;
  const { dados, findAnimal, pendingWithData, botAnimalCheckLog } = createSaveRecordScope(ctx);

  const found = await findAnimal(supabase, owner, String(dados.animal_codigo || ""));
  if (!found) {
    return {
      result: {
        response: `N\u00e3o encontrei o animal "${dados.animal_codigo || ""}" no rebanho. Me envie o brinco cadastrado.`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      }
    };
  }

  if (found.ambiguousRows?.length) {
    const options = found.ambiguousRows.slice(0, 5).map((row: AnyRecord) => `- ${row.brinco}`).join("\n");
    return {
      result: {
        response: `Encontrei mais de um animal parecido. Me envie o brinco correto:\n${options}`,
        nextSession: { etapa: "aguardando_dado", dados: { pending: pendingWithData(pending, { animal_codigo: undefined }) } }
      }
    };
  }

  if (!found.exact) {
    const nextPending = pendingWithData(pending, { animal_codigo: found.row.brinco });
    return {
      result: {
        response: `Encontrei um animal parecido: ${found.row.brinco}. Quer usar esse animal?\n1 - Confirmar\n2 - Corrigir`,
        nextSession: { etapa: "aguardando_confirmacao", dados: { pending: nextPending } }
      }
    };
  }

  const animal = found.row;
  botAnimalCheckLog(owner, pending, animal, !isAnimalInactiveForBot(animal));
  if (isAnimalInactiveForBot(animal)) {
    return {
      result: {
        response: animalBlockedMessage(animal, pending.tipo),
        nextSession: { etapa: "livre", dados: {} }
      }
    };
  }

  return { animal };
}
