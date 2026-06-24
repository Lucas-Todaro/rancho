import fs from "fs";
import path from "path";

import type { AnyRecord } from "@/lib/types";
import { geminiActionPlanEnabled, geminiTableActionPlanEnabled } from "@/lib/whatsapp/gemini/config";

export type GeminiMode = "mock" | "live";

type GeminiRuntimeStats = {
  liveCalls: number;
  mockCalls: number;
  fixturesUsed: string[];
};

type GeminiMockFixture = {
  id: string;
  description?: string;
  examples?: string[];
  input?: string;
  inputExamples?: string[];
  response: AnyRecord;
  sourcePath?: string;
};

type GeminiRuntimeGlobal = typeof globalThis & {
  __RANCHO_GEMINI_RUNTIME_STATS__?: GeminiRuntimeStats;
  __RANCHO_GEMINI_MOCK_FIXTURES__?: GeminiMockFixture[] | null;
};

const FIXTURE_DIR = path.join(process.cwd(), "scripts", "bot-test", "gemini-mocks");
const LIVE_TEST_BLOCK_MESSAGE = "Teste tentou chamar Gemini live. Use GEMINI_MODE=mock.";

function runtimeGlobal() {
  return globalThis as GeminiRuntimeGlobal;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isActionPlanFixture(fixture: GeminiMockFixture) {
  return isPlainObject(fixture.response) && typeof fixture.response.action === "string";
}

function actionPlanFixtureEnabled(fixture: GeminiMockFixture) {
  if (!isActionPlanFixture(fixture)) return true;
  const action = String(fixture.response.action || "").trim();
  if (action === "import_table") return geminiTableActionPlanEnabled();
  if (action === "block") return geminiActionPlanEnabled() || geminiTableActionPlanEnabled();
  return geminiActionPlanEnabled();
}

function anyActionPlanFixtureEnabled() {
  return geminiActionPlanEnabled() || geminiTableActionPlanEnabled();
}

function isMilkImportActionPlanFixture(fixture: GeminiMockFixture) {
  return fixture.response.action === "import_table" && fixture.response.domain === "producao_leite";
}

function isReproductionImportActionPlanFixture(fixture: GeminiMockFixture) {
  return fixture.response.action === "import_table" && fixture.response.domain === "reproducao";
}

function listFixtureFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listFixtureFiles(fullPath);
      return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
    });
}

function normalizeFixture(filePath: string): GeminiMockFixture | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AnyRecord;
    const response = isPlainObject(parsed.response)
      ? parsed.response
      : isPlainObject(parsed.plan) ? parsed.plan : null;
    if (!response) return null;

    const id = String(parsed.id || path.basename(filePath, ".json")).trim();
    if (!id) return null;

    return {
      ...parsed,
      id,
      response,
      sourcePath: path.relative(FIXTURE_DIR, filePath).replace(/\\/g, "/")
    } as GeminiMockFixture;
  } catch {
    return null;
  }
}

function fixtureExamples(fixture: GeminiMockFixture) {
  return [
    ...(Array.isArray(fixture.examples) ? fixture.examples : []),
    ...(Array.isArray(fixture.inputExamples) ? fixture.inputExamples : []),
    fixture.input
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function normalizedHeader(value: unknown) {
  return normalizeText(value).replace(/[^a-z0-9_ ]/g, "").replace(/\s+/g, "_");
}

function splitStructuredHeader(text: unknown) {
  const lines = String(text || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const separators = [";", "|", "\t"];
  const scored = separators
    .map((separator) => ({
      separator,
      headers: lines[0].split(separator).map((cell) => cell.trim()).filter(Boolean)
    }))
    .filter((candidate) => candidate.headers.length >= 3)
    .sort((left, right) => right.headers.length - left.headers.length);
  return scored[0] || null;
}

function findHeader(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizedHeader);
  return headers.find((header) => normalizedAliases.includes(normalizedHeader(header))) || null;
}

function milkTableMapping(text: unknown) {
  const header = splitStructuredHeader(text);
  if (!header) return null;

  const animal = findHeader(header.headers, ["animal", "vaca", "codigo", "código", "brinco"]);
  const litros = findHeader(header.headers, ["litros", "litro", "leite", "producao", "produção"]);
  const data = findHeader(header.headers, ["data", "dia"]);
  if (!animal || !litros || !data) return null;

  const turno = findHeader(header.headers, ["turno"]);
  const observacoes = findHeader(header.headers, ["observacoes", "observações", "observacao", "observação", "obs"]);
  return {
    separator: header.separator,
    columnMapping: {
      animal_ref: animal,
      litros,
      data,
      ...(turno ? { turno } : {}),
      ...(observacoes ? { observacoes } : {})
    }
  };
}

function reproductionTableMapping(text: unknown) {
  const pairList = reproductionPairListMapping(text);
  if (pairList) return pairList;

  const header = splitStructuredHeader(text);
  if (!header) return null;

  const animal = findHeader(header.headers, [
    "animal",
    "vaca",
    "codigo",
    "cÃ³digo",
    "brinco",
    "codigo animal",
    "cÃ³digo / animal"
  ]);
  const event = findHeader(header.headers, ["evento", "tipo", "status tipo", "status / tipo", "ocorrencia"]);
  const date = findHeader(header.headers, ["data", "dia"]);
  if (!animal || !event || !date) return null;

  const observations = findHeader(header.headers, ["observacoes", "observaÃ§Ãµes", "observacao", "observaÃ§Ã£o", "obs"]);
  return {
    separator: header.separator,
    hasHeader: true,
    columnMapping: {
      animal_ref: animal,
      evento: event,
      data: date,
      ...(observations ? { observacoes: observations } : {})
    },
    defaultFields: {}
  };
}

function splitPairListLine(line: string, separator: ":" | " - ") {
  if (separator === ":") {
    const index = line.indexOf(":");
    if (index <= 0) return null;
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }
  const cells = line.split(separator).map((cell) => cell.trim()).filter(Boolean);
  return cells.length >= 2 ? cells : null;
}

function reproductionPairListMapping(text: unknown) {
  const lines = String(text || "")
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return null;

  const separator = lines.every((line) => splitPairListLine(line, ":")) ? ":" : lines.every((line) => splitPairListLine(line, " - ")) ? " - " : null;
  if (!separator) return null;

  const maxCells = Math.max(...lines.map((line) => splitPairListLine(line, separator)?.length || 0));
  return {
    separator,
    hasHeader: false,
    columnMapping: {
      animal_ref: 0,
      evento: 1,
      ...(maxCells >= 3 ? { observacoes: 2 } : {})
    },
    defaultFields: separator === ":" ? { data: "hoje" } : {}
  };
}

function adaptMilkImportFixture(fixture: GeminiMockFixture, text: unknown): GeminiMockFixture {
  const mapping = milkTableMapping(text);
  if (!mapping || !isMilkImportActionPlanFixture(fixture)) return fixture;

  return {
    ...fixture,
    response: {
      ...fixture.response,
      table: {
        ...(isPlainObject(fixture.response.table) ? fixture.response.table : {}),
        hasHeader: true,
        separator: mapping.separator,
        columnMapping: mapping.columnMapping,
        defaultFields: {},
        ignoredColumns: [],
        ambiguousColumns: []
      }
    }
  };
}

function adaptReproductionImportFixture(fixture: GeminiMockFixture, text: unknown): GeminiMockFixture {
  const mapping = reproductionTableMapping(text);
  if (!mapping || !isReproductionImportActionPlanFixture(fixture)) return fixture;

  return {
    ...fixture,
    response: {
      ...fixture.response,
      table: {
        ...(isPlainObject(fixture.response.table) ? fixture.response.table : {}),
        hasHeader: mapping.hasHeader ?? true,
        separator: mapping.separator,
        columnMapping: mapping.columnMapping,
        defaultFields: mapping.defaultFields || {},
        ignoredColumns: [],
        ambiguousColumns: []
      }
    }
  };
}

function adaptStructuredImportFixture(fixture: GeminiMockFixture, text: unknown) {
  return adaptReproductionImportFixture(adaptMilkImportFixture(fixture, text), text);
}

function structuredMilkFixture(fixtures: GeminiMockFixture[], text: unknown) {
  const mapping = milkTableMapping(text);
  if (!mapping) return null;

  const candidates = fixtures.filter((fixture) => (
    isMilkImportActionPlanFixture(fixture) && actionPlanFixtureEnabled(fixture)
  ));
  if (!candidates.length) return null;

  const needsOptional = Boolean(mapping.columnMapping.turno || mapping.columnMapping.observacoes);
  const preferred = candidates.find((fixture) => {
    const columnMapping = isPlainObject(fixture.response.table) && isPlainObject(fixture.response.table.columnMapping)
      ? fixture.response.table.columnMapping
      : {};
    const hasOptional = Boolean(columnMapping.turno || columnMapping.observacoes);
    return needsOptional ? hasOptional : !hasOptional;
  }) || candidates[0];

  return adaptMilkImportFixture(preferred, text);
}

function structuredReproductionFixture(fixtures: GeminiMockFixture[], text: unknown) {
  const mapping = reproductionTableMapping(text);
  if (!mapping) return null;

  const fixture = fixtures.find((item) => (
    isReproductionImportActionPlanFixture(item) && actionPlanFixtureEnabled(item)
  ));
  return fixture ? adaptReproductionImportFixture(fixture, text) : null;
}

export function geminiMode(): GeminiMode {
  const raw = String(process.env.GEMINI_MODE || "live").trim().toLowerCase();
  return raw === "mock" ? "mock" : "live";
}

export function geminiRuntimeStats(): GeminiRuntimeStats {
  const holder = runtimeGlobal();
  if (!holder.__RANCHO_GEMINI_RUNTIME_STATS__) {
    holder.__RANCHO_GEMINI_RUNTIME_STATS__ = {
      liveCalls: 0,
      mockCalls: 0,
      fixturesUsed: []
    };
  }
  return holder.__RANCHO_GEMINI_RUNTIME_STATS__;
}

export function resetGeminiRuntimeStats() {
  runtimeGlobal().__RANCHO_GEMINI_RUNTIME_STATS__ = {
    liveCalls: 0,
    mockCalls: 0,
    fixturesUsed: []
  };
}

export function recordGeminiLiveCall() {
  geminiRuntimeStats().liveCalls += 1;
}

export function recordGeminiMockCall(fixtureId: string) {
  const stats = geminiRuntimeStats();
  stats.mockCalls += 1;
  if (fixtureId && !stats.fixturesUsed.includes(fixtureId)) stats.fixturesUsed.push(fixtureId);
}

export function shouldBlockGeminiLiveCall() {
  const isAutomatedTest = process.env.NODE_ENV === "test" || process.env.RANCHO_BOT_TEST === "1";
  return isAutomatedTest && process.env.ALLOW_LIVE_GEMINI_TESTS !== "true";
}

export function liveGeminiBlockedResult() {
  return {
    ok: false as const,
    reason: "api_error" as const,
    message: LIVE_TEST_BLOCK_MESSAGE
  };
}

function loadFixtures() {
  const holder = runtimeGlobal();
  if (holder.__RANCHO_GEMINI_MOCK_FIXTURES__) return holder.__RANCHO_GEMINI_MOCK_FIXTURES__;
  if (!fs.existsSync(FIXTURE_DIR)) {
    holder.__RANCHO_GEMINI_MOCK_FIXTURES__ = [];
    return holder.__RANCHO_GEMINI_MOCK_FIXTURES__;
  }

  const fixtures = listFixtureFiles(FIXTURE_DIR)
    .map(normalizeFixture)
    .filter((fixture): fixture is GeminiMockFixture => Boolean(fixture));

  holder.__RANCHO_GEMINI_MOCK_FIXTURES__ = fixtures;
  return fixtures;
}

export function findGeminiMockFixture(input: { text?: string; geminiMockId?: string | null }) {
  const fixtures = loadFixtures();
  const explicitId = String(input.geminiMockId || "").trim();
  if (explicitId) {
    return fixtures.find((fixture) => fixture.id === explicitId && actionPlanFixtureEnabled(fixture)) || null;
  }

  const normalizedText = normalizeText(input.text);
  const matches = fixtures.filter((fixture) => fixtureExamples(fixture).some((example) => normalizeText(example) === normalizedText));
  if (!matches.length) {
    if (geminiMode() === "mock" && geminiTableActionPlanEnabled()) {
      return structuredReproductionFixture(fixtures, input.text) || structuredMilkFixture(fixtures, input.text);
    }
    return null;
  }

  if (anyActionPlanFixtureEnabled()) {
    const fixture = matches.find((item) => isActionPlanFixture(item) && actionPlanFixtureEnabled(item))
      || matches.find((item) => !isActionPlanFixture(item));
    return fixture ? adaptStructuredImportFixture(fixture, input.text) : null;
  }

  return matches.find((fixture) => !isActionPlanFixture(fixture)) || null;
}

export function unknownGeminiMockResponse() {
  return {
    intent: "DESCONHECIDO",
    confidence: 0.2,
    riskScore: 0.2,
    fields: {},
    actions: [],
    missing_fields: [],
    warnings: ["gemini_mock_fixture_not_found", "mock_fixture_missing"],
    should_confirm: false,
    response_hint: "Nao encontrei uma resposta de teste para esta mensagem. Tente uma das mensagens cobertas neste ambiente."
  };
}

export function geminiRuntimeReportLines() {
  const stats = geminiRuntimeStats();
  return [
    `Gemini mode: ${geminiMode()}`,
    `Gemini live calls: ${stats.liveCalls}`,
    `Gemini mock calls: ${stats.mockCalls}`,
    `Gemini fixtures usadas: ${stats.fixturesUsed.length ? stats.fixturesUsed.join(", ") : "nenhuma"}`
  ];
}
