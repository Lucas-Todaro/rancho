const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
process.env.GEMINI_MODE = "live";
process.env.ALLOW_LIVE_GEMINI_TESTS = "true";

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

const { interpretWithGemini } = require("../src/lib/whatsapp/gemini/interpreter.ts");
const { geminiRuntimeReportLines, resetGeminiRuntimeStats } = require("../src/lib/whatsapp/gemini/runtime.ts");

(async () => {
  resetGeminiRuntimeStats();
  const result = await interpretWithGemini({
    text: "090 deu 15 litros hoje",
    currentDate: new Date().toISOString().slice(0, 10),
    timezone: "America/Sao_Paulo"
  });

  console.log("Smoke Gemini live Rancho");
  console.log(`Resultado: ${result.ok ? "ok" : result.reason}`);
  if (!result.ok) console.log(`Mensagem: ${result.message}`);
  for (const line of geminiRuntimeReportLines()) console.log(line);

  if (!result.ok) process.exitCode = 1;
})().catch((error) => {
  console.error("Falha no smoke Gemini live", error);
  process.exitCode = 1;
});
