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

function looksLikeCode(value: unknown) {
  return /[\d-]/.test(clean(value));
}

function childCodeFrom(value: unknown) {
  const text = clean(value);
  if (!text) return "";
  const explicit = text.match(/\b(?:codigo|c[o\u00f3]digo|brinco|cria)\s*(?:e|eh|\u00e9|:)?\s*([a-zA-Z0-9-]+)/i)?.[1];
  return explicit || text;
}

function childCodeFromToken(value: unknown) {
  const code = childCodeFrom(value);
  return looksLikeCode(code) ? code : "";
}

function taggedValue(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(new RegExp(`\\b${label}\\s*:?\\s*([a-zA-Z0-9-]+)`, "i"))?.[1];
    if (match) return match;
  }
  return "";
}

function codeTokens(text: string) {
  const tokens: string[] = [];
  const regex = /\b[a-zA-Z0-9-]*\d[a-zA-Z0-9-]*\b/g;
  let match: RegExpExecArray | null = regex.exec(text);
  while (match) {
    tokens.push(match[0]);
    match = regex.exec(text);
  }
  return tokens;
}

function pickSemicolonChildFields(cells: string[]) {
  const second = clean(cells[1]);
  const third = clean(cells[2]);
  const secondSex = normalizeCalfSex(second);
  const thirdSex = normalizeCalfSex(third);

  if (secondSex && !thirdSex) {
    return {
      cria_sexo: secondSex,
      cria_codigo: childCodeFromToken(third),
      pai_ref: clean(cells[3])
    };
  }

  if (!secondSex && thirdSex) {
    return {
      cria_sexo: thirdSex,
      cria_codigo: childCodeFromToken(second),
      pai_ref: clean(cells[3])
    };
  }

  return {
    cria_sexo: secondSex || thirdSex,
    cria_codigo: childCodeFromToken(second) || childCodeFromToken(third),
    pai_ref: clean(cells[3])
  };
}

function childPatchFromFreeText(text: string, animalRef: string) {
  const sex = normalizeCalfSex(taggedValue(text, ["sexo"])) || normalizeCalfSex(text);
  const father = clean(taggedValue(text, ["pai", "touro"]));
  const explicitCode = childCodeFromToken(taggedValue(text, ["cria", "codigo", "c[o\\u00f3]digo", "brinco"]));
  const fallbackCode = codeTokens(text)
    .find((candidate) => codeKey(candidate) !== codeKey(animalRef) && codeKey(candidate) !== codeKey(father)) || "";

  return {
    cria_sexo: sex,
    cria_codigo: explicitCode || fallbackCode,
    pai_ref: father
  };
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
    return { animalRef, ...pickSemicolonChildFields(cells) };
  }

  const animalRef = text.match(/^([a-zA-Z0-9-]+)/)?.[1] || "";
  if (!animalRef) return null;
  if (semCria) return { animalRef, semCria: true };

  const patch = childPatchFromFreeText(text, animalRef);
  if (!patch.cria_sexo && !patch.cria_codigo && !patch.pai_ref) return null;
  return { animalRef, ...patch };
}

function parseComplementLines(text: string) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const parsed = lines.flatMap((line) => {
    if (!line.includes(";")) {
      const patch = parseComplementLine(line);
      return patch ? [patch] : [];
    }

    const compactSegments = line
      .split(/\s+(?=[a-zA-Z0-9-]+\s*;\s*[a-zA-Z0-9-]+\s*;\s*(?:macho|femea|fêmea|fem|f|m)\b)/i)
      .map((segment) => segment.trim())
      .filter(Boolean);
    if (compactSegments.length > 1) {
      return compactSegments
        .map((segment) => parseComplementLine(segment))
        .filter((patch): patch is NonNullable<ReturnType<typeof parseComplementLine>> => Boolean(patch));
    }

    const cells = line.split(";").map((cell) => cell.trim()).filter((cell) => cell !== "");
    if (cells.length > 4 && cells.length % 4 === 0) {
      return Array.from({ length: cells.length / 4 }, (_item, index) => {
        const chunk = cells.slice(index * 4, index * 4 + 4).join(";");
        return parseComplementLine(chunk);
      }).filter((patch): patch is NonNullable<ReturnType<typeof parseComplementLine>> => Boolean(patch));
    }

    const patch = parseComplementLine(line);
    return patch ? [patch] : [];
  });
  return parsed;
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
  for (const patch of parseComplementLines(text)) {
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
