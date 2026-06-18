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
  response: AnyRecord;
  actionPlan?: boolean;
};

type GeminiRuntimeGlobal = typeof globalThis & {
  __RANCHO_GEMINI_RUNTIME_STATS__?: GeminiRuntimeStats;
  __RANCHO_GEMINI_MOCK_FIXTURES__?: GeminiMockFixture[] | null;
};

const FIXTURE_DIR = path.join(process.cwd(), "scripts", "bot-test", "gemini-mocks");
const ACTION_PLAN_FIXTURE_DIR = path.join(FIXTURE_DIR, "action-plan");
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

function jsonFixtureFiles(dir: string) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(dir, file));
}

function fixtureFromFile(file: string, actionPlan = false): GeminiMockFixture[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as AnyRecord;
    if (parsed?.id && parsed?.response) {
      return [{ ...parsed, actionPlan }] as GeminiMockFixture[];
    }
    if (actionPlan && parsed?.plan) {
      const id = path.basename(file, ".json");
      const examples = [
        parsed.input,
        ...(Array.isArray(parsed.inputExamples) ? parsed.inputExamples : [])
      ]
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      return [{
        id,
        description: parsed.description,
        examples,
        response: parsed.plan as AnyRecord,
        actionPlan: true
      }];
    }
    return [];
  } catch {
    return [];
  }
}

function loadFixtures() {
  const holder = runtimeGlobal();
  if (holder.__RANCHO_GEMINI_MOCK_FIXTURES__) return holder.__RANCHO_GEMINI_MOCK_FIXTURES__;
  if (!fs.existsSync(FIXTURE_DIR)) {
    holder.__RANCHO_GEMINI_MOCK_FIXTURES__ = [];
    return holder.__RANCHO_GEMINI_MOCK_FIXTURES__;
  }

  const fixtures = [
    ...jsonFixtureFiles(FIXTURE_DIR).flatMap((file) => fixtureFromFile(file)),
    ...jsonFixtureFiles(ACTION_PLAN_FIXTURE_DIR).flatMap((file) => fixtureFromFile(file, true))
  ];

  holder.__RANCHO_GEMINI_MOCK_FIXTURES__ = fixtures;
  return fixtures;
}

function actionPlanFixtureEnabled(fixture: GeminiMockFixture) {
  if (!fixture.actionPlan) return true;
  const action = String(fixture.response?.action || "").trim();
  if (action === "import_table") return geminiTableActionPlanEnabled();
  if (action === "block") return geminiActionPlanEnabled() || geminiTableActionPlanEnabled();
  return geminiActionPlanEnabled();
}

export function findGeminiMockFixture(input: { text?: string; geminiMockId?: string | null }) {
  const fixtures = loadFixtures();
  const explicitId = String(input.geminiMockId || "").trim();
  if (explicitId) return fixtures.find((fixture) => fixture.id === explicitId && actionPlanFixtureEnabled(fixture)) || null;

  const normalizedText = normalizeText(input.text);
  const matches = fixtures.filter((fixture) => (fixture.examples || []).some((example) => normalizeText(example) === normalizedText));
  if (!matches.length) return null;
  const actionPlanMatch = matches.find((fixture) => fixture.actionPlan && actionPlanFixtureEnabled(fixture));
  if (actionPlanMatch) return actionPlanMatch;
  return matches.find((fixture) => !fixture.actionPlan) || null;
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
