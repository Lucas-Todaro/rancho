import fs from "fs";
import path from "path";

import { geminiActionPlanEnabled, geminiTableActionPlanEnabled } from "@/lib/whatsapp/gemini/config";
import type { AnyRecord } from "@/lib/types";

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

function actionPlanFixturesEnabled() {
  return geminiActionPlanEnabled() || geminiTableActionPlanEnabled();
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
  if (explicitId) return fixtures.find((fixture) => fixture.id === explicitId) || null;

  const normalizedText = normalizeText(input.text);
  const matches = fixtures.filter((fixture) => fixtureExamples(fixture).some((example) => normalizeText(example) === normalizedText));
  if (!matches.length) return null;
  if (actionPlanFixturesEnabled()) return matches.find(isActionPlanFixture) || matches[0];
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
    response_hint: "mock_fixture_missing: crie uma fixture em scripts/bot-test/gemini-mocks ou use GEMINI_MODE=live fora dos testes."
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
