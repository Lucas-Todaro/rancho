function percent(part, total) {
  return total ? Number(((part / total) * 100).toFixed(2)) : 0;
}

function groupFailures(results) {
  return results.reduce((acc, result) => {
    if (result.passed) return acc;
    acc[result.grupoNome] = (acc[result.grupoNome] || 0) + 1;
    return acc;
  }, {});
}

function summarizeFallbackAudit(results, groupCounts) {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const failed = total - passed;
  const expectedGemini = results.filter((result) => result.expectedShouldCallGemini).length;
  const calledGemini = results.filter((result) => result.fallbackCalled).length;
  const falseNegatives = results.filter((result) => result.falseNegativeFallback);
  const falsePositives = results.filter((result) => result.falsePositiveFallback);
  const wrongIntents = results.filter((result) => result.intentWrong);
  const missingWarnings = results.filter((result) => result.missingWarnings.length);
  const critical = results
    .filter((result) => result.critical)
    .sort((left, right) => {
      if (left.falseNegativeFallback !== right.falseNegativeFallback) return left.falseNegativeFallback ? -1 : 1;
      return right.errors.length - left.errors.length;
    })
    .slice(0, 20);

  return {
    total,
    passed,
    failed,
    accuracy: percent(passed, total),
    expectedGemini,
    calledGemini,
    falseNegativeFallback: falseNegatives.length,
    falsePositiveFallback: falsePositives.length,
    wrongIntents: wrongIntents.length,
    missingWarnings: missingWarnings.length,
    groupCounts,
    failuresByGroup: groupFailures(results),
    topCritical: critical
  };
}

function markdownForFallbackAudit(summary, results) {
  const lines = [
    "# Fallback Audit - Bot WhatsApp",
    "",
    `Total de casos: ${summary.total}`,
    `Passaram: ${summary.passed}`,
    `Falharam: ${summary.failed}`,
    `Acuracia: ${summary.accuracy}%`,
    "",
    `Gemini esperado: ${summary.expectedGemini}`,
    `Gemini chamado: ${summary.calledGemini}`,
    `Falsos negativos de fallback: ${summary.falseNegativeFallback}`,
    `Falsos positivos de fallback: ${summary.falsePositiveFallback}`,
    `Intents erradas: ${summary.wrongIntents}`,
    `Warnings ausentes: ${summary.missingWarnings}`,
    "",
    "## Casos por grupo",
    ""
  ];

  for (const [group, count] of Object.entries(summary.groupCounts)) {
    lines.push(`- ${group}: ${count}`);
  }

  lines.push("", "## Erros por grupo", "");
  const failuresByGroup = Object.entries(summary.failuresByGroup);
  if (!failuresByGroup.length) lines.push("- Nenhum");
  for (const [group, count] of failuresByGroup) {
    lines.push(`- ${group}: ${count}`);
  }

  lines.push("", "## Top 20 casos criticos", "");
  if (!summary.topCritical.length) lines.push("- Nenhum");
  summary.topCritical.forEach((result, index) => {
    lines.push(`${index + 1}. [${result.id}] "${result.mensagem}"`);
    lines.push(`   - Esperado: ${result.expectedIntentAnyOf.join(" ou ") || "qualquer intent segura"}; fallback=${result.expectedShouldCallGemini}`);
    lines.push(`   - Atual: ${result.parserIntent}; confidence=${result.confidence}; riskScore=${result.riskScore}; fallback=${result.fallbackCalled}`);
    lines.push(`   - Problemas: ${result.errors.join("; ")}`);
  });

  lines.push("", "## Lista completa de falhas", "");
  const failed = results.filter((result) => !result.passed);
  if (!failed.length) lines.push("- Nenhuma");
  failed.forEach((result) => {
    lines.push(`- [${result.id}] ${result.grupoNome}: "${result.mensagem}"`);
    lines.push(`  - Atual: ${result.parserIntent}; fallback=${result.fallbackCalled}; confidence=${result.confidence}; riskScore=${result.riskScore}`);
    lines.push(`  - Erros: ${result.errors.join("; ")}`);
  });

  return `${lines.join("\n")}\n`;
}

module.exports = { summarizeFallbackAudit, markdownForFallbackAudit };
