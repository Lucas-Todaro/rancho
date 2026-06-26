import type { AnyRecord } from "@/lib/types";
import { normalizeCalfSex } from "@/lib/whatsapp/nlp-core/birth-child";
import { normalizeRanchoText, refreshRanchoMessage, type ParsedRanchoMessage } from "@/lib/whatsapp/nlp";

export type ReproductionImportChildStatus =
  | "not_applicable"
  | "pending_child_optional"
  | "complete"
  | "missing_child_code"
  | "missing_child_sex"
  | "not_registered";

function clean(value: unknown) {
  return String(value || "").trim();
}

function codeKey(value: unknown) {
  return normalizeRanchoText(clean(value)).replace(/[^a-z0-9]/g, "");
}

function childCodeFrom(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  return text.match(/\b(?:codigo|c[oó]digo|brinco)\s*(?:e|eh|é|:)?\s*([a-zA-Z0-9-]+)/i)?.[1] || text;
}

export function classifyReproductionImportChild(row: AnyRecord) {
  const eventKind = clean(row.evento_tipo || row.evento_normalizado).toLowerCase();
  if (eventKind !== "parto" && eventKind !== "parto".toUpperCase()) {
    return {
      child_status: "not_applicable" as ReproductionImportChildStatus,
      parto_cria_cadastro: false
    };
  }

  const sex = normalizeCalfSex(row.cria_sexo || row.sexo_cria || row.child_sex);
  const childCode = childCodeFrom(row.cria_codigo || row.codigo_cria || row.brinco_cria || row.child_code);
  const childName = clean(row.cria_nome || row.nome_cria || row.child_name);
  const fatherRef = clean(row.pai_ref || row.pai || row.father_ref);

  let childStatus: ReproductionImportChildStatus = "pending_child_optional";
  if (sex && childCode) childStatus = "complete";
  else if (sex && !childCode) childStatus = "missing_child_code";
  else if (!sex && childCode) childStatus = "missing_child_sex";

  return {
    child_status: childStatus,
    parto_cria_cadastro: childStatus === "complete",
    cria_sexo: sex || undefined,
    cria_codigo: childCode || undefined,
    cria_nome: childName || undefined,
    pai_ref: fatherRef || undefined
  };
}

export function warningCodesForChildStatus(status: ReproductionImportChildStatus) {
  if (status === "pending_child_optional") return ["dados_da_cria_ausentes"];
  if (status === "missing_child_code") return ["cria_codigo_ausente"];
  if (status === "missing_child_sex") return ["cria_sexo_ausente"];
  if (status === "not_registered") return ["cria_nao_cadastrada"];
  return [];
}

export function reproductionImportChildSummary(rows: AnyRecord[]) {
  const births = rows.filter((row) => String(row.evento_tipo || "").toLowerCase() === "parto");
  return {
    total_partos: births.length,
    partos_com_cria_completa: births.filter((row) => row.child_status === "complete").length,
    partos_sem_cria_cadastrada: births.filter((row) => row.child_status === "pending_child_optional" || row.child_status === "not_registered").length,
    partos_com_cria_pendente: births.filter((row) => row.child_status === "missing_child_code" || row.child_status === "missing_child_sex").length
  };
}

function parseComplementLine(line: string) {
  const text = clean(line);
  if (!text) return null;

  const semCria = /\bsem\s+cria\b/i.test(text);
  if (text.includes(";")) {
    const cells = text.split(";").map((cell) => cell.trim());
    const animalRef = cells[0];
    if (!animalRef) return null;
    if (semCria || normalizeRanchoText(cells[1] || "") === "sem cria") return { animalRef, semCria: true };
    return {
      animalRef,
      cria_sexo: normalizeCalfSex(cells[1]),
      cria_codigo: childCodeFrom(cells[2]),
      pai_ref: clean(cells[3])
    };
  }

  const animalRef = text.match(/^([a-zA-Z0-9-]+)/)?.[1] || "";
  if (!animalRef) return null;
  if (semCria) return { animalRef, semCria: true };

  const sex = normalizeCalfSex(text.match(/\bsexo\s*:?\s*([a-zA-ZÀ-ÿ]+)/i)?.[1] || text);
  const code = childCodeFrom(text.match(/\b(?:codigo|c[oó]digo|brinco)\s*:?\s*([a-zA-Z0-9-]+)/i)?.[1] || "");
  const father = clean(text.match(/\bpai\s*:?\s*([a-zA-Z0-9-]+)/i)?.[1]);
  if (!sex && !code && !father) return null;
  return { animalRef, cria_sexo: sex, cria_codigo: code, pai_ref: father };
}

function applyPatchToRows(rows: AnyRecord[], patches: Map<string, AnyRecord>) {
  let changed = false;
  const patchedRows = rows.map((row) => {
    if (String(row.evento_tipo || "").toLowerCase() !== "parto") return row;
    const patch = patches.get(codeKey(row.animal_codigo || row.animal_codigo_original));
    if (!patch) return row;
    changed = true;
    if (patch.semCria) {
      return {
        ...row,
        child_status: "not_registered",
        parto_cria_cadastro: false,
        cria_sexo: undefined,
        cria_codigo: undefined,
        pai_ref: undefined,
        avisos: warningCodesForChildStatus("not_registered")
      };
    }
    const next = {
      ...row,
      cria_sexo: patch.cria_sexo || row.cria_sexo,
      cria_codigo: patch.cria_codigo || row.cria_codigo,
      pai_ref: patch.pai_ref || row.pai_ref
    };
    const child = classifyReproductionImportChild(next);
    return {
      ...next,
      ...child,
      avisos: warningCodesForChildStatus(child.child_status)
    };
  });
  return { rows: patchedRows, changed };
}

export function applyReproductionImportChildComplement(parsed: ParsedRanchoMessage, text: string) {
  if (parsed.tipo !== "IMPORTACAO_EVENTOS_TABELA") return null;
  const patches = new Map<string, AnyRecord>();
  for (const line of String(text || "").split(/\r?\n/)) {
    const patch = parseComplementLine(line);
    if (!patch) continue;
    const key = codeKey(patch.animalRef);
    if (key) patches.set(key, patch);
  }
  if (!patches.size) return null;

  const dados = { ...(parsed.dados || {}) };
  const base = applyPatchToRows(Array.isArray(dados.linhas) ? dados.linhas as AnyRecord[] : [], patches);
  const validated = applyPatchToRows(Array.isArray(dados.linhas_validadas) ? dados.linhas_validadas as AnyRecord[] : [], patches);
  if (!base.changed && !validated.changed) return null;

  const nextRows = base.rows.length ? base.rows : validated.rows;
  const childSummary = reproductionImportChildSummary(nextRows);
  return refreshRanchoMessage(parsed, {
    ...dados,
    linhas: base.rows,
    linhas_validadas: validated.rows.length ? validated.rows : dados.linhas_validadas,
    resumo_partos: childSummary,
    complemento_crias_lote_aplicado: true
  });
}
