import type { AnyRecord } from "@/lib/types";
import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

function cleanRef(value?: string | null) {
  return String(value || "")
    .replace(/[.;,]+$/g, "")
    .replace(/^(?:do|da|de|o|a|um|uma)\s+/i, "")
    .trim();
}

export function normalizeCalfSex(value: unknown) {
  const text = normalizeRanchoText(String(value || ""));
  if (/^(?:f|femea|feminino|bezerra|terneira|novilha)$/.test(text) || /\b(?:femea|feminino|bezerra|terneira|novilha)\b/.test(text)) return "femea";
  if (/^(?:m|macho|masculino|bezerro|terneiro)$/.test(text) || /\b(?:macho|masculino|bezerro|terneiro)\b/.test(text)) return "macho";
  return undefined;
}

export function calfCategoryForSex(sex: unknown) {
  const normalized = normalizeCalfSex(sex);
  if (normalized === "femea") return "bezerra";
  if (normalized === "macho") return "bezerro";
  return undefined;
}

export function hasBirthChildData(dados: AnyRecord = {}) {
  return Boolean(
    dados.parto_cria_cadastro ||
    dados.cria_codigo ||
    dados.gerar_cria_codigo_temporario ||
    dados.cria_sexo ||
    dados.cria_categoria ||
    dados.cria_nome ||
    dados.pai_ref ||
    dados.pai_nome ||
    dados.pai_id
  );
}

export function extractBirthChildData(originalText: string) {
  const normalized = normalizeRanchoText(originalText);
  const criaCodigo =
    cleanRef(normalized.match(/\b(?:codigo|brinco)\s+([a-z][a-z0-9]*-\d[a-z0-9-]*|\d+[a-z0-9-]*)\b/i)?.[1])
    ||
    cleanRef(originalText.match(/\b(?:codigo|c[oó]digo|brinco)\s+(?:da\s+)?cria\s+([A-Za-z0-9][A-Za-z0-9-]*)/i)?.[1])
    || cleanRef(originalText.match(/\bcria\s+(?:codigo|c[oó]digo|brinco)\s+([A-Za-z0-9][A-Za-z0-9-]*)/i)?.[1])
    || cleanRef(originalText.match(/\bcria\s+([A-Za-z]+-\d[A-Za-z0-9-]*|[A-Za-z]*\d[A-Za-z0-9-]*-\w+)\b/i)?.[1]);
  const criaSexo = normalizeCalfSex(normalized);
  const explicitChildCue = /\b(?:cria|bezerra|bezerro|terneira|terneiro|filha|filho|nasceu)\b/.test(normalized);
  const paiRef = cleanRef(
    originalText.match(/\bpai\s+(?:touro\s+)?([A-Za-z0-9À-ÿ][A-Za-z0-9À-ÿ\s-]*?)(?=\s*,|\s+cria\b|\s+filh[ao]\b|\s+hoje\b|\s+ontem\b|\s+dia\b|$)/i)?.[1]
  );
  const criaNome = cleanRef(
    originalText.match(/\b(?:nome\s+da\s+cria|cria\s+chamad[ao])\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'-]{1,40})(?=\s*,|\s+pai\b|\s+hoje\b|\s+ontem\b|\s+dia\b|$)/i)?.[1]
  );
  const partoCriaCadastro = Boolean(criaSexo || criaCodigo || paiRef || criaNome || /\bcria\s+(?:femea|macho)\b/.test(normalized) || /\b(?:bezerra|bezerro|terneira|terneiro)\b/.test(normalized));

  return {
    parto_cria_cadastro: partoCriaCadastro || undefined,
    cria_codigo: criaCodigo || undefined,
    cria_sexo: criaSexo,
    cria_categoria: calfCategoryForSex(criaSexo),
    cria_nome: criaNome || undefined,
    pai_ref: paiRef || undefined,
    pai_nome: paiRef || undefined,
    pai_nao_informado: partoCriaCadastro && !paiRef ? true : undefined,
    cria_observacoes: explicitChildCue ? "Cria informada no registro de parto." : undefined
  };
}
