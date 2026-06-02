import { listRecords, updateRecord } from "@/services/crud";
import { TABLES } from "@/lib/tables";
import type { AnyRecord, DataContext } from "@/lib/types";

export async function syncAnimalPhaseAfterEvent(eventRecord: AnyRecord, context: DataContext) {
  if (String(eventRecord.tipo || "") !== "parto" || !eventRecord.animal_id) return;

  const [animal] = await listRecords(TABLES.animais, {
    fazendaId: context.fazendaId,
    usuarioId: context.usuarioId,
    filters: [{ column: "id", value: eventRecord.animal_id }]
  });

  if (animal?.id && animal.fase === "gestante") {
    await updateRecord(TABLES.animais, animal.id, { fase: "lactacao" });
  }
}
