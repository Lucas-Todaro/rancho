import { normalizeRanchoText } from "@/lib/whatsapp/nlp-text";

export type ReproductiveEventKind =
  | "inseminacao"
  | "prenhez"
  | "pre_parto"
  | "parto"
  | "protocolo"
  | "reteste"
  | "observacao";

const reproductiveCuePattern = /\b(?:cio|aborto|ia|iatf|inseminad[ao]s?|inseminacao|inseminacoes|inseminar|inseminaram|cobert[ao]s?|cobertura|cobertas?|cobertos?|semen|prenhas?|prenhes|prenhe|prenhez|gestantes?|gestacao|pegou cria|diagnostico positivo|pre\s*parto|pre-parto|preparto|parto|pariu|deu cria|teve cria|protocolo|reteste|nao passou)\b/;

function normalizeReproductiveTypeText(value: string) {
  const preCleaned = String(value || "")
    .replace(/\bpr\S{0,4}[-_\s]*parto\b/gi, "pre parto");
  return normalizeRanchoText(preCleaned)
    .replace(/[-_‐‑‒–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeReproductiveEventType(rawType: string): ReproductiveEventKind | undefined {
  const normalized = normalizeReproductiveTypeText(rawType);
  if (!normalized) return undefined;

  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  if (compact.includes("preparto") || /\b(?:entrada em |entrou em |em )?pre\s*parto\b/.test(normalized) || /\b(?:perto de parir|quase parindo|para parir|final da gestacao|fim da gestacao)\b/.test(normalized)) {
    return "pre_parto";
  }

  if (/\b(?:pariu|parto|deu cria|teve cria|nascimento|nasceu|nasceu bezerro|nasceu bezerra)\b/.test(normalized)) {
    return "parto";
  }

  if (/\b(?:inseminad[ao]s?|inseminacao|inseminacoes|inseminar|inseminaram|recebeu ia|ia|iatf|cobert[ao]s?|cobertura|cobertas?|cobertos?|semen)\b/.test(normalized)) {
    return "inseminacao";
  }

  if (!/\b(?:nao esta prenha|nao ficou prenha|prenhez negativa|diagnostico negativo de prenhez)\b/.test(normalized)
    && /\b(?:confirmar prenhez|prenhez confirmada|prenhez positiva|diagnostico positivo|emprenhou|esta gestante|esta prenha|ficou prenha|pegou cria|prenhas?|prenhes|prenhe|prenhez|gestantes?|gestacao)\b/.test(normalized)) {
    return "prenhez";
  }

  if (/\b(?:reteste|novo teste)\b/.test(normalized)) return "reteste";
  if (/\b(?:ultimo protocolo|protocolo|protocolada|protocolado|nao passou)\b/.test(normalized)) return "protocolo";
  if (/\b(?:cio|aborto|abortou)\b/.test(normalized)) return "observacao";

  return undefined;
}

export function detectReproductiveEventKind(text: string): ReproductiveEventKind | undefined {
  return normalizeReproductiveEventType(text);
}

export function hasReproductiveEventCue(text: string) {
  return Boolean(normalizeReproductiveEventType(text)) || reproductiveCuePattern.test(normalizeRanchoText(text));
}

export function reproductiveEventDbType(kind?: ReproductiveEventKind) {
  if (kind === "inseminacao") return "inseminacao";
  if (kind === "parto") return "parto";
  return "observacao";
}

export function reproductiveEventLabel(kind?: ReproductiveEventKind) {
  if (kind === "inseminacao") return "Inseminacao";
  if (kind === "prenhez") return "Prenhez";
  if (kind === "pre_parto") return "Pre-parto";
  if (kind === "parto") return "Parto";
  if (kind === "protocolo") return "Protocolo";
  if (kind === "reteste") return "Reteste de protocolo";
  return "Observacao reprodutiva";
}

export function extractInseminationOrigin(original: string) {
  const patterns = [
    /\borigem\s+([a-zA-Z0-9À-ÿ\s'-]+?)(?:\s+(?:hoje|ontem|anteontem|amanha|dia|em|no dia|custou|custo|por|r\$)|[.,;:]|$)/i,
    /\bcom\s+(?:semen|sêmen)?\s*(?:do|da|de)?\s*(?:touro)?\s*([a-zA-Z0-9À-ÿ\s'-]+?)(?:\s+(?:hoje|ontem|anteontem|amanha|dia|em|no dia|custou|custo|por|r\$)|[.,;:]|$)/i,
    /\b(?:touro|semen|sêmen)\s+([a-zA-Z0-9À-ÿ\s'-]+?)(?:\s+(?:hoje|ontem|anteontem|amanha|dia|em|no dia|custou|custo|por|r\$)|[.,;:]|$)/i
  ];

  for (const pattern of patterns) {
    const raw = original.match(pattern)?.[1];
    const cleaned = String(raw || "")
      .replace(/\b(?:do|da|de|touro|semen|sêmen)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned && !/\b(?:custo|custou|reais|real)\b/i.test(cleaned)) return cleaned;
  }

  return undefined;
}

export function reproductiveEventDescription(kind: ReproductiveEventKind | undefined, description: string, origin?: string | null) {
  const label = reproductiveEventLabel(kind);
  const parts = [`[Reproducao Animal] ${label} registrada via WhatsApp`];
  const cleanedOrigin = String(origin || "").trim();
  const cleanedDescription = String(description || "").trim();

  if (cleanedOrigin) parts.push(`Origem: ${cleanedOrigin}`);
  if (cleanedDescription && normalizeRanchoText(cleanedDescription) !== normalizeRanchoText(label)) {
    parts.push(cleanedDescription);
  }

  return parts.join(" - ");
}
