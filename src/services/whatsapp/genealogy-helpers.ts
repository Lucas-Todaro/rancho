import type { AnyRecord } from "@/lib/types";
import type { ParsedRanchoMessage } from "@/lib/whatsapp/nlp";

export function collectDescendantIds(animalId: string, animals: AnyRecord[]) {
  const descendants = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const animal of animals) {
      const id = String(animal.id || "");
      if (!id || descendants.has(id)) continue;
      const mother = String(animal.mae_id || "");
      const father = String(animal.pai_id || "");
      if (mother === animalId || father === animalId || descendants.has(mother) || descendants.has(father)) {
        descendants.add(id);
        changed = true;
      }
    }
  }

  return descendants;
}

export function relationBlockMessage(parsed: ParsedRanchoMessage) {
  return String(parsed.dados?.genealogia_bloqueio || parsed.dados?.parto_bloqueio || "").trim() || null;
}

export function addGenealogyBlock(dados: AnyRecord, message: string) {
  dados.genealogia_bloqueio = message;
  dados.genealogia_estoque_movimentado = false;
}

export function genealogyPayloadFromData(dados: AnyRecord) {
  const payload: AnyRecord = {};
  if (dados.remover_mae) payload.mae_id = null;
  else if (dados.mae_id) payload.mae_id = dados.mae_id;
  if (dados.remover_pai) payload.pai_id = null;
  else if (dados.pai_id) payload.pai_id = dados.pai_id;
  return payload;
}
