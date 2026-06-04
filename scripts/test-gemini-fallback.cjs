const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const SECRET = "test-gemini-api-key-should-not-appear";
const ADMIN_OWNER = {
  papel_bot: "admin",
  telefone_e164: "5583999999999",
  fazenda_id: "mock-fazenda-1",
  usuario_id: "user-admin",
  whatsapp_usuario_id: "whatsapp-admin"
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    const base = path.join(root, "src", request.slice(2));
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: filename
  });
  module._compile(output.outputText, filename);
};

const { parseRanchoMessage } = require("../src/lib/whatsapp/nlp.ts");
const { parseWithGeminiFallback } = require("../src/services/whatsapp/gemini-fallback.ts");

const originalFetch = global.fetch;
const originalLog = console.log;
const originalError = console.error;
const originalEnv = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_FALLBACK_CONFIDENCE: process.env.GEMINI_FALLBACK_CONFIDENCE
};

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Esperado: ${JSON.stringify(expected)}. Recebido: ${JSON.stringify(actual)}.`);
  }
}

function assertIncludes(value, expected, message) {
  if (!String(value || "").includes(expected)) {
    throw new Error(`${message}. Esperado conter: ${expected}. Recebido: ${value}`);
  }
}

function resetEnvironment() {
  if (originalEnv.GEMINI_API_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY;

  if (originalEnv.GEMINI_MODEL === undefined) delete process.env.GEMINI_MODEL;
  else process.env.GEMINI_MODEL = originalEnv.GEMINI_MODEL;

  if (originalEnv.GEMINI_FALLBACK_CONFIDENCE === undefined) delete process.env.GEMINI_FALLBACK_CONFIDENCE;
  else process.env.GEMINI_FALLBACK_CONFIDENCE = originalEnv.GEMINI_FALLBACK_CONFIDENCE;

  global.fetch = originalFetch;
  console.log = originalLog;
  console.error = originalError;
}

function withGeminiEnv() {
  process.env.GEMINI_API_KEY = SECRET;
  process.env.GEMINI_MODEL = "gemini-test-model";
  process.env.GEMINI_FALLBACK_CONFIDENCE = "0.6";
}

function captureLogs() {
  const logs = [];
  console.log = (...args) => {
    logs.push(args.map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(" "));
  };
  console.error = (...args) => {
    logs.push(args.map((arg) => {
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(" "));
  };
  return logs;
}

function geminiApiEnvelope(text) {
  return {
    candidates: [
      {
        content: {
          parts: [
            {
              text: typeof text === "string" ?text : JSON.stringify(text)
            }
          ]
        }
      }
    ]
  };
}

function interpretation({ confidence = 0.82, requiresConfirmation = false, actions, userResponse = "" }) {
  return {
    confidence,
    requiresConfirmation,
    reason: "mock seguro do Gemini para o fallback",
    actions,
    userResponse
  };
}

function action({ type, operation, entity = null, quantity = null, unit = null, date = null, notes = null, rawText }) {
  return {
    type,
    operation,
    entity,
    quantity,
    unit,
    date,
    notes,
    rawText
  };
}

function mockFetchQueue(responses) {
  const queue = responses.slice();
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({
      url: String(url),
      body: String(options.body || "")
    });
    if (!queue.length) throw new Error("fetch mock sem resposta configurada");
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return {
      ok: next.ok !== false,
      status: next.status || (next.ok === false ?500 : 200),
      json: async () => next.body
    };
  };
  return calls;
}

function lowConfidenceLocal(message) {
  const parsed = parseRanchoMessage(message);
  return {
    ...parsed,
    tipo: "DESCONHECIDO",
    confianca: 0.2,
    dados: {},
    resumo: "mock local com baixa confiança",
    perguntas_faltantes: []
  };
}

async function runFallback(message, geminiBody, options = {}) {
  withGeminiEnv();
  const calls = mockFetchQueue([{ body: geminiApiEnvelope(geminiBody) }]);
  const logs = captureLogs();
  const result = await parseWithGeminiFallback({
    text: message,
    localParsed: options.localParsed || lowConfidenceLocal(message),
    owner: ADMIN_OWNER
  });
  return { calls, logs, result };
}

function assertGeminiNotCalled(calls, message) {
  assertEqual(calls.length, 0, `${message}: Gemini não deveria ser chamado`);
}

function assertGeminiCalled(calls, message) {
  assertEqual(calls.length, 1, `${message}: Gemini deveria ser chamado uma vez`);
}

function assertNoApiKeyInLogs(logs) {
  const text = logs.join("\n");
  assert(!text.includes(SECRET), "A chave GEMINI_API_KEY apareceu nos logs");
}

function postConsultations(pending) {
  const value = pending?.dados?.gemini_consultas_apos_confirmacao;
  return Array.isArray(value) ?value : [];
}

const simpleMessages = [
  "cadastro vaca Estrela",
  "registra 12 litros da Estrela hoje",
  "comprei 3 sacos de ração",
  "paguei 200 reais pro João",
  "quanto tem de ração no estoque?"
];

for (const message of simpleMessages) {
  test(`mensagem simples não chama Gemini: ${message}`, async () => {
    withGeminiEnv();
    const calls = mockFetchQueue([new Error("Gemini não deveria ser chamado")]);
    const localParsed = parseRanchoMessage(message);
    assert(localParsed.confianca >= 0.6, `Parser local deveria ficar acima de 0.6 para: ${message}. Recebido: ${localParsed.confianca}`);

    const result = await parseWithGeminiFallback({
      text: message,
      localParsed,
      owner: ADMIN_OWNER
    });

    assertEqual(result.kind, "local", `${message}: resultado deveria continuar local`);
    assertGeminiNotCalled(calls, message);
  });
}

test("limite 0.6 é inclusivo: confidence_score 0.6 não chama Gemini", async () => {
  withGeminiEnv();
  const calls = mockFetchQueue([new Error("Gemini não deveria ser chamado no limite")]);
  const localParsed = {
    ...parseRanchoMessage("mensagem no limite"),
    confianca: 0.6
  };

  const result = await parseWithGeminiFallback({
    text: "mensagem no limite",
    localParsed,
    owner: ADMIN_OWNER
  });

  assertEqual(result.kind, "local", "confidence_score igual ao limite deve manter parser local");
  assertGeminiNotCalled(calls, "confidence_score 0.6");
});

test("confidence_score 0.59 chama Gemini", async () => {
  const localParsed = {
    ...lowConfidenceLocal("sobe 30kg de ração"),
    confianca: 0.59
  };
  const { calls, result } = await runFallback("sobe 30kg de ração", interpretation({
    requiresConfirmation: true,
    actions: [
      action({
        type: "ESTOQUE_ENTRADA",
        operation: "add",
        entity: "ração",
        quantity: 30,
        unit: "kg",
        rawText: "sobe 30kg de ração"
      })
    ]
  }), { localParsed });

  assertGeminiCalled(calls, "confidence_score 0.59");
  assertEqual(result.kind, "parsed", "fallback deveria retornar ação validada");
});

test("composta: relatório depois de entrada de estoque mantém ordem", async () => {
  const message = "me dá o relatório de hoje, mas antes sobe aí 30kg de ração";
  const { calls, result } = await runFallback(message, interpretation({
    requiresConfirmation: true,
    actions: [
      action({
        type: "ESTOQUE_ENTRADA",
        operation: "add",
        entity: "ração",
        quantity: 30,
        unit: "kg",
        date: "hoje",
        rawText: "sobe aí 30kg de ração"
      }),
      action({
        type: "CONSULTA_REGISTROS_HOJE",
        operation: "report",
        date: "hoje",
        rawText: "me dá o relatório de hoje"
      })
    ]
  }));

  assertGeminiCalled(calls, message);
  assertEqual(result.kind, "compound", "composta deveria virar ação pendente mais consulta posterior");
  assertEqual(result.pending.tipo, "ESTOQUE_ENTRADA", "primeira ação deve ser entrada de estoque");
  assertEqual(postConsultations(result.pending)[0]?.tipo, "CONSULTA_REGISTROS_HOJE", "consulta deve ficar depois da confirmação");
});

test("composta: produção antes de consulta semanal da vaca", async () => {
  const message = "registra 12 litros da Estrela e depois me fala quanto ela produziu na semana";
  const { result } = await runFallback(message, interpretation({
    requiresConfirmation: true,
    actions: [
      action({
        type: "PRODUCAO_LEITE",
        operation: "register",
        entity: "Estrela",
        quantity: 12,
        unit: "L",
        date: "hoje",
        rawText: "registra 12 litros da Estrela"
      }),
      action({
        type: "CONSULTA_PRODUCAO_ANIMAL",
        operation: "query",
        entity: "Estrela",
        date: "semana",
        rawText: "me fala quanto ela produziu na semana"
      })
    ]
  }));

  assertEqual(result.kind, "compound", "produção + consulta deveria ser composta");
  assertEqual(result.pending.tipo, "PRODUCAO_LEITE", "registro deve vir antes da consulta");
  assertEqual(postConsultations(result.pending)[0]?.tipo, "CONSULTA_PRODUCAO_ANIMAL", "consulta da produção deve ficar depois");
});

test("composta: despesa antes de consulta financeira do mês", async () => {
  const message = "coloca 200 reais de despesa com ração e vê como ficou o financeiro do mês";
  const { result } = await runFallback(message, interpretation({
    requiresConfirmation: true,
    actions: [
      action({
        type: "DESPESA",
        operation: "register",
        entity: "ração",
        quantity: 200,
        unit: "BRL",
        date: "hoje",
        notes: "ração",
        rawText: "coloca 200 reais de despesa com ração"
      }),
      action({
        type: "CONSULTA_FINANCEIRO",
        operation: "report",
        date: "mes",
        rawText: "vê como ficou o financeiro do mês"
      })
    ]
  }));

  assertEqual(result.kind, "compound", "despesa + financeiro deveria ser composta");
  assertEqual(result.pending.tipo, "DESPESA", "despesa deve vir primeiro");
  assertEqual(postConsultations(result.pending)[0]?.tipo, "CONSULTA_FINANCEIRO", "consulta financeira deve ficar depois");
});

test("composta: baixa de estoque e tarefa mantêm ordem no lote", async () => {
  const message = "dá baixa em 1 saco de sal e cria uma tarefa pra comprar mais amanhã";
  const { result } = await runFallback(message, interpretation({
    requiresConfirmation: true,
    actions: [
      action({
        type: "ESTOQUE_SAIDA",
        operation: "remove",
        entity: "sal",
        quantity: 1,
        unit: "saco",
        date: "hoje",
        rawText: "dá baixa em 1 saco de sal"
      }),
      action({
        type: "ORDEM_SERVICO",
        operation: "create",
        date: "amanha",
        notes: "comprar mais sal",
        rawText: "cria uma tarefa pra comprar mais amanhã"
      })
    ]
  }));

  assertEqual(result.kind, "parsed", "duas mutações deveriam virar lote de registros");
  assertEqual(result.parsed.tipo, "LOTE_REGISTROS", "mutações compostas devem virar lote");
  const registros = result.parsed.dados.registros || [];
  assertEqual(registros[0]?.tipo, "ESTOQUE_SAIDA", "primeira ação do lote deve ser baixa de estoque");
  assertEqual(registros[1]?.tipo, "ORDEM_SERVICO", "segunda ação do lote deve ser tarefa");
});

const ambiguousMessages = [
  {
    message: "sobe 30 de ração",
    response: interpretation({
      requiresConfirmation: true,
      actions: [
        action({
          type: "ESTOQUE_ENTRADA",
          operation: "add",
          entity: "ração",
          quantity: 30,
          rawText: "sobe 30 de ração"
        })
      ]
    })
  },
  {
    message: "tira 2 do estoque",
    response: interpretation({
      requiresConfirmation: true,
      actions: [
        action({
          type: "ESTOQUE_SAIDA",
          operation: "remove",
          quantity: 2,
          rawText: "tira 2 do estoque"
        })
      ]
    })
  },
  {
    message: "paguei João",
    response: interpretation({
      requiresConfirmation: true,
      actions: [
        action({
          type: "DESPESA",
          operation: "register",
          entity: "João",
          rawText: "paguei João"
        })
      ]
    })
  },
  {
    message: "lança leite da Estrela",
    response: interpretation({
      requiresConfirmation: true,
      actions: [
        action({
          type: "PRODUCAO_LEITE",
          operation: "register",
          entity: "Estrela",
          rawText: "lança leite da Estrela"
        })
      ]
    })
  }
];

for (const item of ambiguousMessages) {
  test(`ambígua exige confirmação antes de executar: ${item.message}`, async () => {
    const { result } = await runFallback(item.message, item.response);
    assert(["parsed", "compound"].includes(result.kind), `${item.message}: fallback deveria retornar uma ação pendente`);
    const pending = result.kind === "compound" ?result.pending : result.parsed;
    assertEqual(Boolean(pending.dados.gemini_requires_confirmation), true, `${item.message}: ação deveria exigir confirmação`);
  });
}

const invalidMessages = [
  "faz qualquer coisa aí",
  "apaga tudo",
  "muda todos os dados",
  "zera o estoque"
];

for (const message of invalidMessages) {
  test(`inválida não executa nada: ${message}`, async () => {
    const { result } = await runFallback(message, interpretation({
      confidence: 0.35,
      requiresConfirmation: true,
      userResponse: "Preciso que você diga exatamente o que quer lançar.",
      actions: [
        action({
          type: "AJUDA",
          operation: "help",
          rawText: message
        })
      ]
    }));

    assertEqual(result.kind, "clarify", `${message}: mensagem inválida deve pedir esclarecimento`);
    assertIncludes(result.message, "exatamente", `${message}: resposta deve pedir esclarecimento`);
  });
}

test("Gemini com JSON inválido não gera ação executável", async () => {
  const { calls, result } = await runFallback("mensagem confusa", "{ invalid-json");

  assertGeminiCalled(calls, "JSON inválido");
  assertEqual(result.kind, "clarify", "JSON inválido deve virar esclarecimento");
  assertEqual(result.reason, "invalid_json", "motivo deve registrar JSON inválido");
});

test("resposta perigosa do Gemini não gera ação executável", async () => {
  const { result } = await runFallback("apaga tudo", interpretation({
    confidence: 0.9,
    requiresConfirmation: true,
    actions: [
      action({
        type: "ESTOQUE_SAIDA",
        operation: "delete",
        entity: "estoque",
        notes: "DROP TABLE estoque_itens",
        rawText: "apaga tudo"
      })
    ]
  }));

  assertEqual(result.kind, "clarify", "conteúdo perigoso deve ser bloqueado");
  assertEqual(result.reason, "dangerous_response", "motivo deve registrar resposta perigosa");
});

test("consulta clara via Gemini pode executar direto", async () => {
  const { result } = await runFallback("quanto tem de ração no estoque?", interpretation({
    requiresConfirmation: false,
    actions: [
      action({
        type: "CONSULTA_ESTOQUE_ITEM",
        operation: "query",
        entity: "ração",
        rawText: "quanto tem de ração no estoque?"
      })
    ]
  }));

  assertEqual(result.kind, "parsed", "consulta clara deveria virar parsed");
  assertEqual(result.parsed.tipo, "CONSULTA_ESTOQUE_ITEM", "tipo de consulta esperado");
  assertEqual(Boolean(result.parsed.dados.gemini_requires_confirmation), false, "consulta clara não deve exigir confirmação");
});

test("sem GEMINI_API_KEY o sistema segue com parser local e não chama rede", async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_FALLBACK_CONFIDENCE = "0.6";
  const calls = mockFetchQueue([new Error("Gemini não deveria chamar rede sem chave")]);
  const result = await parseWithGeminiFallback({
    text: "mensagem pouco clara",
    localParsed: lowConfidenceLocal("mensagem pouco clara"),
    owner: ADMIN_OWNER
  });

  assertEqual(result.kind, "local", "sem chave deve voltar para o resultado local");
  assertGeminiNotCalled(calls, "sem GEMINI_API_KEY");
});

test("logs seguros não expõem GEMINI_API_KEY", async () => {
  const { calls, logs, result } = await runFallback("sobe 30kg de ração", interpretation({
    requiresConfirmation: true,
    actions: [
      action({
        type: "ESTOQUE_ENTRADA",
        operation: "add",
        entity: "ração",
        quantity: 30,
        unit: "kg",
        rawText: "sobe 30kg de ração"
      })
    ]
  }));

  assertGeminiCalled(calls, "logs seguros");
  assertEqual(result.kind, "parsed", "resultado esperado para logs seguros");
  assertNoApiKeyInLogs(logs);
});

(async () => {
  const results = [];

  for (const current of tests) {
    try {
      resetEnvironment();
      await current.fn();
      results.push({ name: current.name, ok: true });
    } catch (error) {
      results.push({
        name: current.name,
        ok: false,
        error: error instanceof Error ?error.message : String(error)
      });
    } finally {
      resetEnvironment();
    }
  }

  const failed = results.filter((result) => !result.ok);
  originalLog("Gemini fallback test offline Rancho");
  originalLog(`Total: ${results.length}`);
  originalLog(`Aprovados: ${results.length - failed.length}`);
  originalLog(`Falhos: ${failed.length}`);

  if (failed.length) {
    for (const failure of failed) {
      originalLog(`\n--- Falha: ${failure.name} ---`);
      originalLog(failure.error);
    }
    process.exitCode = 1;
  }
})().catch((error) => {
  resetEnvironment();
  originalError("Falha ao rodar test:gemini-fallback", error);
  process.exitCode = 1;
});
