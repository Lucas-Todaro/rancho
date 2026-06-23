import { TABLES } from "@/lib/tables";
import type { AnyRecord } from "@/lib/types";
import { animalDeathDate, animalStatusValue } from "@/lib/whatsapp/animal-status";
import { detectReproductiveEventKind, normalizeRanchoText, reproductiveEventDbType, type ReproductiveEventKind as NlpReproductiveEventKind } from "@/lib/whatsapp/nlp";
import type { WhatsAppOwner } from "@/services/whatsapp/identity";
import { formatNumber } from "@/services/whatsapp/message-format";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

type AnimalReportDependencies = {
  listAnimals: (supabase: SupabaseAdmin, owner: WhatsAppOwner) => Promise<AnyRecord[]>;
};

function animalLabel(animal?: AnyRecord | null) {
  if (!animal) return "Não informado";
  const brinco = String(animal.brinco || "").trim();
  const nome = String(animal.nome || "").trim();
  if (brinco && nome && normalizeRanchoText(brinco) !== normalizeRanchoText(nome)) return `${nome} (${brinco})`;
  return brinco || nome || String(animal.id || "Animal");
}

function lotLabel(lot?: AnyRecord | null) {
  if (!lot) return "Sem lote";
  return String(lot.nome || lot.descricao || lot.id || "Lote");
}

function animalStatusLabel(animal: AnyRecord) {
  return animalStatusValue(animal) || String(animal.status || "ativo");
}

function eventDateMs(event: AnyRecord) {
  const value = String(event.data_evento || event.created_at || "");
  const ms = Date.parse(value);
  return Number.isFinite(ms) ?ms : 0;
}

function eventTypeMatches(row: AnyRecord, requested?: string) {
  if (!requested) return true;
  const text = normalizeRanchoText([row.tipo, row.descricao, row.medicamento].filter(Boolean).join(" "));
  if (requested === "clinico") return /\b(?:doenca|doente|observacao|clinico|clinica|apetite|mastite|problema)\b/.test(text);
  if (requested === "reprodutivo") return Boolean(detectReproductiveEventKind(text)) || /\b(?:cio|prenhez|inseminacao|cobertura|reprodutivo|pre\s*parto|pre-parto|protocolo|reteste|parto)\b/.test(text);
  return text.includes(requested);
}

function animalPhaseIsPregnant(animal: AnyRecord) {
  return /\b(?:gestante|prenhe|prenha|prenhez|gravida)\b/.test(normalizeRanchoText(String(animal.fase || "")));
}

function reportMissingValue(value: unknown) {
  const text = normalizeRanchoText(String(value ?? ""));
  return !text || ["null", "undefined", "nao informado", "nao_informado", "sem informacao", "sem_informacao"].includes(text);
}

function cleanReportText(value: unknown) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseReport(value: unknown) {
  const text = cleanReportText(value).replace(/[_-]+/g, " ").toLowerCase();
  if (!text) return "";
  return text.replace(/\b[a-zà-ÿ]/g, (letter) => letter.toUpperCase());
}

function formatAnimalReportCategory(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value) || normalized === "outro") return "Não informada";
  const labels: Record<string, string> = {
    vaca: "Vaca",
    boi: "Boi",
    touro: "Touro",
    bezerro: "Bezerro",
    bezerra: "Bezerra",
    novilha: "Novilha",
    matriz: "Matriz",
    reprodutor: "Reprodutor"
  };
  return labels[normalized] || titleCaseReport(value);
}

function formatAnimalReportSex(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value)) return "Não informado";
  if (["femea", "feminino"].includes(normalized)) return "Fêmea";
  if (["macho", "masculino"].includes(normalized)) return "Macho";
  return titleCaseReport(value);
}

function formatAnimalReportStatus(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value)) return "Não informado";
  const labels: Record<string, string> = {
    ativo: "Ativo",
    ativa: "Ativo",
    inativo: "Inativo",
    inativa: "Inativo",
    morto: "Morto",
    morta: "Morto",
    vendido: "Vendido",
    vendida: "Vendido",
    excluido: "Excluído",
    excluida: "Excluído"
  };
  return labels[normalized] || titleCaseReport(value);
}

function formatAnimalReportPhase(value: unknown) {
  const normalized = normalizeRanchoText(String(value ?? ""));
  if (reportMissingValue(value)) return "Não informada";
  const labels: Record<string, string> = {
    nao_aplicavel: "Não se aplica",
    naoaplicavel: "Não se aplica",
    outro: "Não informada",
    lactacao: "Lactação",
    lactante: "Lactação",
    gestante: "Prenha",
    prenha: "Prenha",
    prenhe: "Prenha",
    pre_parto: "Pré-parto",
    preparto: "Pré-parto",
    seca: "Seca",
    crescimento: "Crescimento",
    cria: "Cria",
    recria: "Recria"
  };
  return labels[normalized] || titleCaseReport(value);
}

function reportDate(value: unknown) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function animalReportTitle(animal: AnyRecord, reference: string) {
  const category = normalizeRanchoText(String(animal.categoria || ""));
  const noun = category === "vaca" ?"vaca" : category === "touro" ?"touro" : category === "boi" ?"boi" : "animal";
  return `Resumo ${noun === "vaca" ? "da" : "do"} ${noun} ${animal.brinco || animal.nome || reference}:`;
}

function animalReportEventText(row: AnyRecord) {
  return normalizeRanchoText([row.tipo, row.descricao, row.medicamento, row.dose].filter(Boolean).join(" "));
}

type AnimalReportReproductionKind = NlpReproductiveEventKind | "nao_passou";

function animalReportReproductionKind(row: AnyRecord): AnimalReportReproductionKind | undefined {
  const type = normalizeRanchoText(String(row.tipo || ""));
  const text = animalReportEventText(row);
  if (/\b(?:pre\s*parto|pre-parto|preparto|perto de parir|quase parindo|para parir)\b/.test(text)) return "pre_parto";
  if (type === "parto" || /\b(?:parto|pariu|nasceu|nascimento|deu cria)\b/.test(text)) return "parto";
  if (/\bnao passou\b/.test(text)) return "nao_passou";
  if (/\breteste\b/.test(text)) return "reteste";
  if (!/\b(?:nao esta prenha|nao ficou prenha|prenhez negativa|diagnostico negativo)\b/.test(text)
    && /\b(?:prenhez|prenhe|prenha|gestante|gestacao|gravida|confirmar prenhez|diagnostico positivo|pegou cria)\b/.test(text)) {
    return "prenhez";
  }
  if (type === "inseminacao" || /\b(?:inseminacao|inseminada|inseminado|cobertura|coberta|coberto|semen|ia|iatf)\b/.test(text)) return "inseminacao";
  if (/\b(?:protocolo|protocolada|protocolado)\b/.test(text)) return "protocolo";
  return detectReproductiveEventKind(text);
}

function isAnimalReportInsemination(row: AnyRecord) {
  const type = normalizeRanchoText(String(row.tipo || ""));
  const text = animalReportEventText(row);
  return type === "inseminacao" || /\b(?:inseminacao|inseminada|inseminado|cobertura|coberta|coberto|semen|ia|iatf)\b/.test(text);
}

function isAnimalReportReproductiveEvent(row: AnyRecord) {
  return Boolean(animalReportReproductionKind(row)) || eventTypeMatches(row, "reprodutivo");
}

function formatAnimalReportReproductionKind(kind?: AnimalReportReproductionKind) {
  if (kind === "inseminacao") return "Inseminação";
  if (kind === "prenhez") return "Prenhez";
  if (kind === "pre_parto") return "Pré-parto";
  if (kind === "parto") return "Parto";
  if (kind === "protocolo") return "Protocolo";
  if (kind === "reteste") return "Reteste";
  if (kind === "nao_passou") return "Não passou";
  return "Observação reprodutiva";
}

function animalReportEventLabel(row: AnyRecord) {
  const tipo = normalizeRanchoText(String(row.tipo || ""));
  const reproductionKind = animalReportReproductionKind(row);
  if (reproductionKind) return formatAnimalReportReproductionKind(reproductionKind);
  if (tipo === "vacina") return row.medicamento ?`Vacina ${cleanReportText(row.medicamento)}` : "Vacina";
  if (tipo === "tratamento") return row.medicamento ?`Tratamento ${cleanReportText(row.medicamento)}` : "Tratamento";
  if (tipo === "observacao") return "Observação clínica";
  if (tipo === "doenca") return "Ocorrência clínica";
  if (tipo === "cio") return "Cio";
  return titleCaseReport(row.tipo || "Evento");
}

function animalReportEventNote(row: AnyRecord) {
  const text = animalReportEventText(row);
  if (/\bnao passou\b/.test(text)) return "Não passou";
  if (/\breteste\b/.test(text)) return "Reteste";
  if (isAnimalReportInsemination(row) && cleanReportText(row.medicamento)) return `Origem: ${cleanReportText(row.medicamento)}`;
  const raw = cleanReportText(row.descricao)
    .replace(/^\[?reproducao animal\]?\s*/i, "")
    .replace(/\bregistrad[ao]\s+via\s+whatsapp\b/gi, "")
    .replace(/\b(?:inseminacao|prenhez|pre-parto|parto|protocolo|observacao reprodutiva)\s+registrad[ao]\b/gi, "")
    .replace(/\s+-\s+/g, " - ")
    .trim();
  if (!raw || normalizeRanchoText(raw) === normalizeRanchoText(animalReportEventLabel(row))) return "";
  return raw.length > 90 ?`${raw.slice(0, 87)}...` : raw;
}

function animalReportInseminationOrigin(row?: AnyRecord | null) {
  if (!row) return "";
  const direct = cleanReportText(row.medicamento);
  if (direct && !/\b(?:dose|ml|mg)\b/i.test(direct)) return direct;
  const description = cleanReportText(row.descricao);
  const origin = description.match(/\bOrigem:\s*([^.;-]+)/i)?.[1] || description.match(/\bcom\s+(?:s[eê]men\s+)?(?:do|da|de)?\s*([^.;-]+)/i)?.[1];
  return cleanReportText(origin);
}

function hasLaterAnimalReportEvent(reference: AnyRecord | undefined, rows: AnyRecord[], kind: AnimalReportReproductionKind) {
  if (!reference) return false;
  return rows.some((row) => eventDateMs(row) > eventDateMs(reference) && animalReportReproductionKind(row) === kind);
}

function hasLaterAnimalReportOutcome(reference: AnyRecord | undefined, rows: AnyRecord[]) {
  if (!reference) return false;
  return rows.some((row) => {
    if (eventDateMs(row) <= eventDateMs(reference)) return false;
    return ["prenhez", "pre_parto", "parto", "nao_passou", "reteste"].includes(String(animalReportReproductionKind(row) || ""));
  });
}

function animalReportReproductionSummary(animal: AnyRecord, events: AnyRecord[]) {
  const sorted = [...events].sort((left, right) => eventDateMs(right) - eventDateMs(left));
  const reproductiveEvents = sorted.filter(isAnimalReportReproductiveEvent);
  const lastInsemination = sorted.find(isAnimalReportInsemination);
  const lastPrenhez = sorted.find((row) => animalReportReproductionKind(row) === "prenhez");
  const lastPreParto = sorted.find((row) => animalReportReproductionKind(row) === "pre_parto");
  const lastParto = sorted.find((row) => animalReportReproductionKind(row) === "parto");
  const lastNaoPassou = sorted.find((row) => animalReportReproductionKind(row) === "nao_passou");
  const lastReteste = sorted.find((row) => animalReportReproductionKind(row) === "reteste");
  const lastProtocol = sorted.find((row) => animalReportReproductionKind(row) === "protocolo");

  let status = "Sem registro reprodutivo";
  let inferred = false;
  if (lastPreParto && !hasLaterAnimalReportEvent(lastPreParto, sorted, "parto")) {
    status = "Pré-parto";
  } else if (lastPrenhez && !hasLaterAnimalReportEvent(lastPrenhez, sorted, "parto")) {
    status = "Prenha";
  } else if (lastNaoPassou && (!lastInsemination || eventDateMs(lastNaoPassou) >= eventDateMs(lastInsemination))) {
    status = "Não passou";
  } else if (lastReteste && (!lastInsemination || eventDateMs(lastReteste) >= eventDateMs(lastInsemination))) {
    status = "Reteste";
  } else if (animalPhaseIsPregnant(animal) && !lastParto) {
    status = "Provavelmente prenha";
    inferred = true;
  } else if (lastInsemination && !hasLaterAnimalReportOutcome(lastInsemination, sorted)) {
    status = "Inseminada";
  } else if (lastParto) {
    const daysSinceParto = Math.floor((Date.now() - eventDateMs(lastParto)) / (24 * 60 * 60 * 1000));
    status = daysSinceParto >= 0 && daysSinceParto <= 45 ? "Recém-parida" : "Pariu";
  }

  return {
    reproductiveEvents,
    lastInsemination,
    lastPrenhez,
    lastPreParto,
    lastParto,
    lastNaoPassou,
    lastReteste,
    lastProtocol,
    status,
    inferred
  };
}

async function queryAnimalReportEvents(supabase: SupabaseAdmin, owner: WhatsAppOwner, animalId: unknown) {
  const { data, error } = await supabase
    .from(TABLES.eventosAnimal)
    .select("id,animal_id,tipo,descricao,medicamento,dose,custo,data_evento,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("animal_id", animalId)
    .order("data_evento", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

async function queryAnimalReportProductions(supabase: SupabaseAdmin, owner: WhatsAppOwner, animalId: unknown) {
  const { data, error } = await supabase
    .from(TABLES.ordenhas)
    .select("id,animal_id,litros,ordenhado_em,created_at")
    .eq("fazenda_id", owner.fazenda_id)
    .eq("animal_id", animalId)
    .order("ordenhado_em", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return (data || []) as AnyRecord[];
}

function animalReportBasicLines(animal: AnyRecord, lot?: AnyRecord | null) {
  return [
    "Dados gerais:",
    cleanReportText(animal.nome) ?`- Nome: ${cleanReportText(animal.nome)}` : "",
    cleanReportText(animal.brinco) ?`- Código: ${cleanReportText(animal.brinco)}` : "",
    `- Categoria: ${formatAnimalReportCategory(animal.categoria)}`,
    `- Sexo: ${formatAnimalReportSex(animal.sexo)}`,
    `- Status: ${formatAnimalReportStatus(animalStatusValue(animal) || animal.status || "ativo")}`,
    `- Fase: ${formatAnimalReportPhase(animal.fase)}`,
    `- Lote: ${lotLabel(lot)}`,
    cleanReportText(animal.raca) ?`- Raça: ${cleanReportText(animal.raca)}` : "",
    reportDate(animal.data_nascimento) ?`- Nascimento: ${reportDate(animal.data_nascimento)}` : "",
    animal.peso !== undefined && animal.peso !== null && animal.peso !== "" ?`- Peso: ${formatNumber(animal.peso, " kg")}` : ""
  ].filter(Boolean);
}

function animalReportReproductionLines(summary: ReturnType<typeof animalReportReproductionSummary>) {
  const lines = [
    "Reprodução:",
    `- Status: ${summary.inferred ?`${summary.status}, com base na fase cadastrada` : summary.status}`
  ];

  if (!summary.reproductiveEvents.length) {
    lines.push("- Não encontrei registros reprodutivos para este animal.");
    return lines;
  }

  if (summary.lastInsemination) {
    lines.push(`- Última inseminação: ${reportDate(summary.lastInsemination.data_evento || summary.lastInsemination.created_at) || "sem data"}`);
    lines.push(`- Origem da inseminação: ${animalReportInseminationOrigin(summary.lastInsemination) || "Não informada"}`);
  }
  if (summary.lastPrenhez) lines.push(`- Prenhez confirmada em: ${reportDate(summary.lastPrenhez.data_evento || summary.lastPrenhez.created_at) || "sem data"}`);
  lines.push(`- Pré-parto: ${summary.lastPreParto ? reportDate(summary.lastPreParto.data_evento || summary.lastPreParto.created_at) || "registrado sem data" : "não registrado"}`);
  lines.push(`- Último parto: ${summary.lastParto ? reportDate(summary.lastParto.data_evento || summary.lastParto.created_at) || "registrado sem data" : "não encontrado"}`);

  const observations = [
    summary.lastNaoPassou ? "Não passou" : "",
    summary.lastReteste ? "Reteste" : "",
    summary.lastProtocol && !summary.lastNaoPassou && !summary.lastReteste ? "Protocolo" : ""
  ].filter(Boolean);
  if (observations.length) lines.push(`- Observação: ${observations.slice(0, 2).join(", ")}`);

  return lines;
}

function animalReportEventLines(events: AnyRecord[]) {
  const sorted = [...events].sort((left, right) => eventDateMs(right) - eventDateMs(left)).slice(0, 5);
  if (!sorted.length) return [];
  return [
    "Eventos recentes:",
    ...sorted.map((row, index) => {
      const date = reportDate(row.data_evento || row.created_at) || "sem data";
      const note = animalReportEventNote(row);
      return `${index + 1}. ${date} - ${animalReportEventLabel(row)}${note ?` - ${note}` : ""}`;
    }),
    events.length > 5 ?"Quer ver o histórico completo? Peça os eventos desse animal." : ""
  ].filter(Boolean);
}

function animalReportProductionLines(rows: AnyRecord[]) {
  const sorted = [...rows].sort((left, right) => Date.parse(String(right.ordenhado_em || right.created_at || "")) - Date.parse(String(left.ordenhado_em || left.created_at || "")));
  if (!sorted.length) return [];
  const last = sorted[0];
  const total = sorted.reduce((sum, row) => sum + Number(row.litros || 0), 0);
  const average = sorted.length ?total / sorted.length : 0;
  return [
    "Produção:",
    `- Último registro: ${formatNumber(last.litros)} litros em ${reportDate(last.ordenhado_em || last.created_at) || "data não informada"}`,
    sorted.length > 1 ?`- Média recente: ${formatNumber(average)} litros` : ""
  ].filter(Boolean);
}

function animalReportGenealogyLines(animal: AnyRecord, animals: AnyRecord[]) {
  const byId = new Map(animals.map((row) => [String(row.id), row]));
  const mother = animal.mae_id ?byId.get(String(animal.mae_id)) : null;
  const father = animal.pai_id ?byId.get(String(animal.pai_id)) : null;
  const notes = cleanReportText(animal.genealogia_observacoes);
  const descendants = animals
    .filter((row) => String(row.mae_id || "") === String(animal.id) || String(row.pai_id || "") === String(animal.id))
    .sort((left, right) => {
      const rightDate = Date.parse(String(right.data_nascimento || right.created_at || ""));
      const leftDate = Date.parse(String(left.data_nascimento || left.created_at || ""));
      return (Number.isFinite(rightDate) ?rightDate : 0) - (Number.isFinite(leftDate) ?leftDate : 0);
    });
  const lastChild = descendants[0] || null;
  if (!mother && !father && !notes && !descendants.length) return [];
  return [
    "Genealogia:",
    mother ?`- Mãe: ${animalLabel(mother)}` : "",
    father ?`- Pai: ${animalLabel(father)}` : "",
    `- Descendentes diretos: ${descendants.length}`,
    lastChild ?`- Última cria: ${animalLabel(lastChild)}${lastChild.data_nascimento ?` em ${reportDate(lastChild.data_nascimento)}` : ""}` : "",
    notes ?`- Observação: ${notes}` : ""
  ].filter(Boolean);
}

function animalReportAlertLines(animal: AnyRecord, reproduction: ReturnType<typeof animalReportReproductionSummary>, events: AnyRecord[], productions: AnyRecord[]) {
  const alerts: string[] = [];
  const status = normalizeRanchoText(String(animalStatusValue(animal) || animal.status || ""));
  if (["morto", "morta", "vendido", "vendida", "inativo", "inativa"].includes(status)) alerts.push(`Status do animal: ${formatAnimalReportStatus(status)}.`);
  if (reproduction.lastPreParto && !hasLaterAnimalReportEvent(reproduction.lastPreParto, events, "parto")) {
    alerts.push(`Animal em pré-parto desde ${reportDate(reproduction.lastPreParto.data_evento || reproduction.lastPreParto.created_at) || "data não informada"}.`);
  } else if (reproduction.lastPrenhez && !reproduction.lastPreParto && !hasLaterAnimalReportEvent(reproduction.lastPrenhez, events, "parto")) {
    alerts.push("Prenhez sem pré-parto registrado.");
  }
  if (reproduction.lastNaoPassou) alerts.push("A última observação reprodutiva indica: Não passou.");
  const clinical = events.find((row) => eventTypeMatches(row, "clinico"));
  if (clinical) alerts.push(`Evento clínico recente em ${reportDate(clinical.data_evento || clinical.created_at) || "data não informada"}.`);
  if (!productions.length && normalizeRanchoText(String(animal.categoria || "")) === "vaca") alerts.push("Sem produção recente registrada.");
  if (normalizeRanchoText(String(animal.categoria || "")) === "outro") alerts.push("Categoria não informada no cadastro.");
  if (reportMissingValue(animal.sexo)) alerts.push("Sexo não informado no cadastro.");

  if (!alerts.length) return [];
  return ["Alertas:", ...alerts.slice(0, 4).map((alert) => `- ${alert}`)];
}

export async function buildAnimalIndividualReport(deps: AnimalReportDependencies, supabase: SupabaseAdmin, owner: WhatsAppOwner, animal: AnyRecord, reference: string, lot?: AnyRecord | null) {
  const [events, productions, animals] = await Promise.all([
    queryAnimalReportEvents(supabase, owner, animal.id),
    queryAnimalReportProductions(supabase, owner, animal.id),
    deps.listAnimals(supabase, owner)
  ]);
  const reproduction = animalReportReproductionSummary(animal, events);
  const sections = [
    [animalReportTitle(animal, reference)],
    animalReportBasicLines(animal, lot),
    animalReportReproductionLines(reproduction),
    animalReportEventLines(events),
    animalReportProductionLines(productions),
    animalReportAlertLines(animal, reproduction, events, productions),
    animalReportGenealogyLines(animal, animals)
  ].filter((section) => section.length);

  return {
    text: sections.map((section) => section.join("\n")).join("\n\n"),
    result: {
      animal_id: animal.id,
      animal: animalLabel(animal),
      fazenda_id: owner.fazenda_id,
      eventos: events.length,
      eventos_reprodutivos: reproduction.reproductiveEvents.length,
      producoes_recentes: productions.length,
      status_reprodutivo: reproduction.status
    }
  };
}
