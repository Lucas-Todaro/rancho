const fs = require("node:fs");
const path = require("node:path");

const nextDir = path.join(process.cwd(), ".next");

try {
  fs.rmSync(nextDir, { recursive: true, force: true });
} catch (error) {
  console.warn(`[Rancho] Nao foi possivel limpar .next: ${error.message}`);
}
