import fs from "fs";
import path from "path";

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
  response: AnyRecord;
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
    .replace(/\s+/g, " ")
    .trim();
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

  const fixtures = fs.readdirSync(FIXTURE_DIR)
    .filter((file) => file.endsWith(".json"))
    .flatMap((file) => {
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), "utf8")) as GeminiMockFixture;
        return parsed?.id && parsed?.response ? [parsed] : [];
      } catch {
        return [];
      }
    });

  holder.__RANCHO_GEMINI_MOCK_FIXTURES__ = fixtures;
  return fixtures;
}

export function findGeminiMockFixture(input: { text?: string; geminiMockId?: string | null }) {
  const fixtures = loadFixtures();
  const explicitId = String(input.geminiMockId || "").trim();
  if (explicitId) return fixtures.find((fixture) => fixture.id === explicitId) || null;

  const normalizedText = normalizeText(input.text);
  return fixtures.find((fixture) => (fixture.examples || []).some((example) => normalizeText(example) === normalizedText)) || null;
}

export function unknownGeminiMockResponse() {
  return {
    intent: "DESCONHECIDO",
    confidence: 0.2,
    riskScore: 0.2,
    fields: {},
    actions: [],
    missing_fields: [],
    warnings: ["gemini_mock_fixture_not_found"],
    should_confirm: false,
    response_hint: "Nao encontrei fixture mockada para essa mensagem."
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
