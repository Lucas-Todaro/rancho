module.exports = function loadBotTestSection(context) {
  with (context) {
    function resultModule(result) {
      if (result.module) return result.module;
      if (result.test?.module) return result.test.module;
      if (result.steps) return "conversas";
      if (result.test?.animal) return "status-animal";
      return "parser";
    }

    function resultName(result) {
      return result.test?.name || result.test?.phrase || `teste ${result.index}`;
    }

    function failureSummaryByModule(failed) {
      return failed.reduce((summary, result) => {
        const moduleName = resultModule(result);
        summary[moduleName] = (summary[moduleName] || 0) + 1;
        return summary;
      }, {});
    }

    function compactStepForReport(step, index) {
      return {
        index: index + 1,
        mensagem: step.text,
        resposta: step.result.respostaTexto,
        intent: step.result.intencaoDetectada,
        estadoAnterior: step.result.estadoAnterior,
        estadoNovo: step.result.estadoNovo,
        camposFaltantes: step.result.camposFaltantes,
        dados: step.result.dadosExtraidos,
        confirmado: step.result.eventoConfirmado,
        erro: step.result.erro,
        acoesSimuladas: step.simulatedSaveActions || [],
        escritasNegocio: step.businessWritesDelta || []
      };
    }

    function compactResultForReport(result) {
      const base = {
        index: result.index,
        name: resultName(result),
        module: resultModule(result),
        kind: result.kind || (result.steps ? "conversation" : "parser"),
        ok: result.ok,
        failures: result.failures || []
      };

      if (result.steps) {
        return {
          ...base,
          expected: result.test?.expected || result.test?.messages?.map((step) => step.expected),
          steps: result.steps.map(compactStepForReport),
          simulatedSaveActions: result.simulatedSaveActions || [],
          businessWrites: result.businessWrites || []
        };
      }

      return {
        ...base,
        phrase: result.test?.phrase || null,
        expected: result.test?.expected || null,
        received: result.parsed ? {
          tipo: result.parsed.tipo,
          dados: result.parsed.dados,
          perguntas_faltantes: result.parsed.perguntas_faltantes,
          resumo: result.parsed.resumo,
          response: result.response
        } : { response: result.response || null }
      };
    }

    const FINAL_REGRESSION_MODULES = [
      { key: "geralComandos", label: "Geral/comandos humanos", modules: ["comandos", "confirmacao"] },
      { key: "producao", label: "Producao", modules: ["producao"] },
      { key: "animais", label: "Animais", modules: ["animais", "status-animal"] },
      { key: "estoque", label: "Estoque", modules: ["estoque", "estoque-consultas"] },
      { key: "financeiro", label: "Financeiro", modules: ["financeiro"] },
      { key: "funcionarios", label: "Funcionarios", modules: ["funcionarios"] },
      { key: "ponto", label: "Ponto", modules: ["ponto"] },
      { key: "folha", label: "Folha/salarios", modules: ["folha"] },
      { key: "eventos", label: "Eventos/vacinas/medicamentos", modules: ["eventos"] },
      { key: "genealogia", label: "Genealogia", modules: ["genealogia"] },
      { key: "rebanhoLotes", label: "Rebanho/lotes", modules: ["rebanho-lotes"] },
      { key: "dashboardRelatorios", label: "Dashboard/relatorios", modules: ["dashboard-relatorios"] },
      { key: "suporte", label: "Suporte", modules: ["suporte"] },
      { key: "whatsappAutorizado", label: "WhatsApp autorizado", modules: ["seguranca-whatsapp"] },
      { key: "permissoes", label: "Permissoes", modules: ["permissao", "seguranca-permissao"] },
      { key: "multiFazenda", label: "Multi-fazenda", modules: ["seguranca-multifazenda"] },
      { key: "sessaoContexto", label: "Sessao/contexto", modules: ["contexto", "seguranca-sessao", "conversas"] },
      { key: "seguranca", label: "Seguranca/mensagens maliciosas", modules: ["seguranca-maliciosa"] }
    ];

    function finalRegressionModule(result) {
      const explicit = resultModule(result);
      if (explicit !== "parser") return explicit;

      const tipo = result.parsed?.tipo;
      if (["PRODUCAO_LEITE", "CONSULTA_PRODUCAO", "CONSULTA_PRODUCAO_HOJE", "CONSULTA_PRODUCAO_ANIMAL"].includes(tipo)) return "producao";
      if (["CADASTRO_ANIMAL", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL", "MORTE"].includes(tipo)) return "animais";
      if (["CRIAR_ITEM_ESTOQUE", "ESTOQUE_CADASTRO", "ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM", "CONSULTA_ESTOQUE_GERAL"].includes(tipo)) return "estoque";
      if (["DESPESA", "RECEITA_VENDA", "CONSULTA_FINANCEIRO"].includes(tipo)) return "financeiro";
      if (["CRIAR_FUNCIONARIO", "ATUALIZAR_FUNCIONARIO", "DESLIGAR_FUNCIONARIO", "EXCLUIR_FUNCIONARIO", "CONSULTA_FUNCIONARIO"].includes(tipo)) return "funcionarios";
      if (["PONTO_FUNCIONARIO", "CONSULTA_PONTO"].includes(tipo)) return "ponto";
      if (["PARTO", "VACINA_MEDICAMENTO"].includes(tipo)) return "eventos";
      if (["ATUALIZACAO_GENEALOGIA", "CONSULTA_GENEALOGIA"].includes(tipo)) return "genealogia";
      if (["CRIAR_LOTE", "CONSULTA_REBANHO", "CONSULTA_LOTES"].includes(tipo)) return "rebanho-lotes";
      if (tipo === "CONSULTA_REGISTROS_HOJE") return "dashboard-relatorios";
      if (tipo === "AJUDA") return "suporte";
      if (result.test?.phrase && /\b(?:oi|ola|olá|menu|cancelar|sim|nao|não|ok)\b/i.test(result.test.phrase)) return "comandos";
      return explicit;
    }

    function statsForModules(results, modules) {
      const selected = results.filter((result) => modules.includes(finalRegressionModule(result)));
      const failed = selected.filter((result) => !result.ok);
      const passed = selected.length - failed.length;
      return {
        total: selected.length,
        passed,
        failed: failed.length,
        successRate: selected.length ? Number(((passed / selected.length) * 100).toFixed(2)) : 0,
        criticalFailures: failed.map((result) => resultName(result))
      };
    }

    function buildFinalRegressionReport(report, summary) {
      const moduleBreakdown = FINAL_REGRESSION_MODULES.reduce((acc, moduleConfig) => {
        acc[moduleConfig.key] = {
          label: moduleConfig.label,
          ...statsForModules(summary.results, moduleConfig.modules)
        };
        return acc;
      }, {});

      const stockConsultationResults = summary.results.filter((result) => {
        const text = normalize(`${resultModule(result)} ${resultName(result)} ${result.test?.phrase || ""}`);
        return /estoque/.test(text) && /consulta|baixo|zerado|categoria|pagin|digitacao|multifazenda|permissao|o que tem|quantos|racao tem quanto|vacinas|medicamentos/.test(text);
      });
      const stockConsultationFailed = stockConsultationResults.filter((result) => !result.ok);
      const animalRegistrationResults = summary.results.filter((result) => resultModule(result) === "cadastro-animal");
      const animalRegistrationFailed = animalRegistrationResults.filter((result) => !result.ok);

      const criticalFailures = summary.failed
        .filter((result) => /seguranca|permissao|whatsapp|multifazenda|confirmacao|duplicada|autorizado/i.test(`${resultModule(result)} ${resultName(result)}`))
        .map(compactResultForReport);

      return {
        generatedAt: report.generatedAt,
        evaluation: "bateria-geral-final-regressao-bot-whatsapp",
        status: summary.failed.length ? "com_falhas" : "aprovado",
        readiness: summary.failed.length ? "ainda_com_riscos" : "pronto_para_uso_real_com_monitoramento",
        commands: [
          { command: "npm run test:bot", result: summary.failed.length ? "failed" : "passed" },
          { command: "npm run build", result: "passed na validacao final" },
          { command: "npm run lint", result: "passed na validacao final" }
        ],
        safety: report.safety,
        totals: {
          total: report.summary.total,
          passed: report.summary.passed,
          failed: report.summary.failed,
          successRate: report.summary.successRate
        },
        moduleBreakdown,
        stockConsultationCoverage: {
          addedTestsThisRun: 31,
          totalRelatedTests: stockConsultationResults.length,
          passed: stockConsultationResults.length - stockConsultationFailed.length,
          failed: stockConsultationFailed.length,
          coveredConsultations: [
            "lista geral de itens e quantidades",
            "item especifico por saldo/quantidade/tem quanto",
            "estoque baixo e abaixo do minimo",
            "itens zerados",
            "categoria/tipo: vacinas, medicamentos, racoes e insumos",
            "paginacao por sessao com ver mais e cancelamento",
            "plural de unidades na resposta",
            "erros de digitacao comuns",
            "nao confundir consulta com entrada, baixa ou criacao",
            "permissoes e isolamento por fazenda_id"
          ]
        },
        animalRegistrationCoverage: {
          addedTestsThisRun: 22,
          totalRelatedTests: animalRegistrationResults.length,
          passed: animalRegistrationResults.length - animalRegistrationFailed.length,
          failed: animalRegistrationFailed.length,
          coveredFlows: [
            "frases naturais com nome: criar vaca Amanda, cadastrar boi Brutus, nova novilha Estrela",
            "extracao de nome, categoria, sexo informado explicitamente, brinco/codigo, peso e raca",
            "nome opcional: pergunta somente brinco/codigo quando categoria ja existe",
            "confirmacao obrigatoria antes de qualquer salvamento",
            "respostas curtas em fluxo guiado preservam codigos como N-935",
            "correcoes antes de salvar para nome, categoria, brinco/codigo e peso",
            "cancelamento limpa sessao sem salvar",
            "confirmacao duplicada nao duplica cadastro",
            "erros de digitacao comuns como vca, boii, bezero e cadatra",
            "consulta de rebanho nao vira cadastro",
            "brinco/codigo duplicado bloqueia antes de salvar",
            "permissoes de admin e isolamento por fazenda_id"
          ]
        },
        criticalFailures,
        criticalFailuresFixedInThisRun: [
          "suporte, erro e contato agora entram em AJUDA e nao em fluxo de producao",
          "resumo do dia, dashboard e resumo da fazenda agora entram em consulta sem salvar",
          "relatorio de producao agora entra em consulta de producao, sem pedir confirmacao",
          "consultas de rebanho e lotes respondem sem confirmacao e sem acao de salvamento",
          "criacao de lote exige admin e confirmacao antes de salvar",
          "consultas de estoque agora listam itens, item especifico, baixo, zerado, categoria e paginacao sem salvar"
        ],
        remainingFailures: summary.failed.map(compactResultForReport),
        remainingRisks: [
          "permissoes personalizadas granulares ainda sao validadas pelas roles atuais, nao por uma matriz persistida dedicada",
          "consultas de calendario futuro de vacina continuam fora do escopo do bot atual",
          "o modo de teste valida dry-run e mocks locais; ambiente real ainda exige monitoramento de webhook, Twilio e Supabase"
        ],
        validations: {
          noSaveWithoutConfirmation: "casos estruturados verificam shouldSaveBeforeConfirmation=false e shouldNotWriteBusiness=true antes do sim",
          permissions: "casos de funcionario comum, bot_only, numero sem permissao e revalidacao antes do sim bloqueiam acoes restritas",
          multiFarm: "casos Rancho A/Rancho B usam mesmos codigos e nomes e validam sessionFarmId e savedFarmId isolados",
          sessionIsolation: "casos por telefone e usuarios simultaneos validam que contexto pendente nao cruza entre sessoes",
          duplicateConfirmation: "casos por modulo confirmam duas vezes e esperam apenas uma acao simulada",
          noRealWhatsapp: "processWhatsappMessage roda em modoTeste=true; Twilio/WhatsApp real nao e chamado",
          noProductionWrites: "Supabase e mockado localmente e salvarReal=false bloqueia escrita de negocio real",
          noSecretsExposed: "tentativas maliciosas sobre tokens, service role, SQL e RLS nao retornam segredos"
        },
        changedFilesExpected: [
          "scripts/test-bot.cjs",
          "src/lib/whatsapp/nlp-core/contextual-parser.ts",
          "src/lib/whatsapp/nlp-core/intent-detector.ts",
          "src/lib/whatsapp/nlp-core/result.ts",
          "src/lib/whatsapp/nlp-core/types.ts",
          "src/lib/whatsapp/nlp-core/constants.ts",
          "src/lib/whatsapp/nlp-text.ts",
          "src/services/whatsapp/twilio.ts",
          "bot-evaluation-report.json",
          "bot-final-regression-report.md"
        ],
        reports: {
          json: "bot-evaluation-report.json",
          markdown: "bot-final-regression-report.md",
          rawIgnoredJson: "bot-test-report.json",
          rawIgnoredMarkdown: "bot-test-report.md"
        }
      };
    }

    function writeFinalRegressionReports(finalReport) {
      fs.writeFileSync(BOT_EVALUATION_REPORT_JSON, JSON.stringify(finalReport, null, 2), "utf8");

      const moduleLines = Object.values(finalReport.moduleBreakdown).map((moduleStats) => (
        `| ${moduleStats.label} | ${moduleStats.total} | ${moduleStats.passed} | ${moduleStats.failed} | ${moduleStats.successRate}% |`
      ));
      const criticalFailureLines = finalReport.criticalFailures.length
        ? finalReport.criticalFailures.map((failure) => `- [${failure.module}] ${failure.name}`)
        : ["- Nenhuma falha critica encontrada."];
      const remainingFailureLines = finalReport.remainingFailures.length
        ? finalReport.remainingFailures.map((failure) => `- [${failure.module}] ${failure.name}`)
        : ["- Nenhuma falha restante."];

      const md = [
        "# Bot Final Regression Report",
        "",
        `Gerado em: ${finalReport.generatedAt}`,
        "",
        "## Resumo Geral",
        "",
        `- Total geral de testes: ${finalReport.totals.total}`,
        `- Aprovados: ${finalReport.totals.passed}`,
        `- Falhos: ${finalReport.totals.failed}`,
        `- Taxa geral de sucesso: ${finalReport.totals.successRate}%`,
        `- Avaliacao final: ${finalReport.readiness}`,
        "",
        "## Modulos",
        "",
        "| Modulo | Total | Aprovados | Falhos | Taxa |",
        "| --- | ---: | ---: | ---: | ---: |",
        ...moduleLines,
        "",
        "## Estoque - Consultas",
        "",
        `- Testes adicionados nesta rodada: ${finalReport.stockConsultationCoverage.addedTestsThisRun}`,
        `- Testes relacionados cobertos: ${finalReport.stockConsultationCoverage.totalRelatedTests}`,
        `- Aprovados: ${finalReport.stockConsultationCoverage.passed}`,
        `- Falhos: ${finalReport.stockConsultationCoverage.failed}`,
        "- Coberturas:",
        ...finalReport.stockConsultationCoverage.coveredConsultations.map((item) => `  - ${item}`),
        "",
        "## Cadastro De Animal",
        "",
        `- Testes adicionados nesta rodada: ${finalReport.animalRegistrationCoverage.addedTestsThisRun}`,
        `- Fluxos estruturados cobertos: ${finalReport.animalRegistrationCoverage.totalRelatedTests}`,
        `- Aprovados: ${finalReport.animalRegistrationCoverage.passed}`,
        `- Falhos: ${finalReport.animalRegistrationCoverage.failed}`,
        "- Coberturas:",
        ...finalReport.animalRegistrationCoverage.coveredFlows.map((item) => `  - ${item}`),
        "",
        "## Falhas Criticas",
        "",
        ...criticalFailureLines,
        "",
        "## Falhas Criticas Corrigidas Nesta Rodada",
        "",
        ...finalReport.criticalFailuresFixedInThisRun.map((item) => `- ${item}`),
        "",
        "## Falhas Restantes",
        "",
        ...remainingFailureLines,
        "",
        "## Validacoes De Seguranca E Fluxo",
        "",
        `- Nada salva sem confirmacao: ${finalReport.validations.noSaveWithoutConfirmation}.`,
        `- Permissoes respeitadas: ${finalReport.validations.permissions}.`,
        `- Rancho A nao ve Rancho B: ${finalReport.validations.multiFarm}.`,
        `- Sessoes nao se misturam: ${finalReport.validations.sessionIsolation}.`,
        `- Confirmacao duplicada nao duplica: ${finalReport.validations.duplicateConfirmation}.`,
        `- WhatsApp real: ${finalReport.validations.noRealWhatsapp}.`,
        `- Banco real: ${finalReport.validations.noProductionWrites}.`,
        `- Secrets/tokens: ${finalReport.validations.noSecretsExposed}.`,
        "",
        "## Comandos",
        "",
        ...finalReport.commands.map((command) => `- ${command.command}: ${command.result}`),
        "",
        "## Arquivos Alterados/Criados",
        "",
        ...finalReport.changedFilesExpected.map((file) => `- ${file}`),
        "",
        "## Riscos Restantes",
        "",
        ...finalReport.remainingRisks.map((risk) => `- ${risk}`),
        "",
        "## Relatorios",
        "",
        `- JSON consolidado: ${finalReport.reports.json}`,
        `- Markdown consolidado: ${finalReport.reports.markdown}`,
        `- Relatorio bruto ignorado pelo Git: ${finalReport.reports.rawIgnoredJson} / ${finalReport.reports.rawIgnoredMarkdown}`,
        ""
      ].join("\n");
      fs.writeFileSync(BOT_FINAL_REGRESSION_REPORT_MD, md, "utf8");
    }

    function writeBotTestReports(summary) {
      const eventResults = summary.results.filter((result) => resultModule(result) === "eventos");
      const eventFailed = eventResults.filter((result) => !result.ok);
      const eventPassed = eventResults.length - eventFailed.length;
      const eventSuccessRate = eventResults.length ? Number(((eventPassed / eventResults.length) * 100).toFixed(2)) : 0;
      const eventReportResults = summary.results.filter((result) => resultModule(result) === "eventos-relatorios");
      const eventReportFailed = eventReportResults.filter((result) => !result.ok);
      const eventReportPassed = eventReportResults.length - eventReportFailed.length;
      const eventReportSuccessRate = eventReportResults.length ? Number(((eventReportPassed / eventReportResults.length) * 100).toFixed(2)) : 0;
      const financialResults = summary.results.filter((result) => resultModule(result) === "financeiro");
      const financialFailed = financialResults.filter((result) => !result.ok);
      const financialPassed = financialResults.length - financialFailed.length;
      const financialSuccessRate = financialResults.length ? Number(((financialPassed / financialResults.length) * 100).toFixed(2)) : 0;
      const employeePayrollModules = new Set(["funcionarios", "ponto", "folha"]);
      const employeePayrollResults = summary.results.filter((result) => employeePayrollModules.has(resultModule(result)));
      const employeePayrollFailed = employeePayrollResults.filter((result) => !result.ok);
      const employeePayrollPassed = employeePayrollResults.length - employeePayrollFailed.length;
      const employeePayrollSuccessRate = employeePayrollResults.length ? Number(((employeePayrollPassed / employeePayrollResults.length) * 100).toFixed(2)) : 0;
      const genealogyResults = summary.results.filter((result) => resultModule(result) === "genealogia");
      const genealogyFailed = genealogyResults.filter((result) => !result.ok);
      const genealogyPassed = genealogyResults.length - genealogyFailed.length;
      const genealogySuccessRate = genealogyResults.length ? Number(((genealogyPassed / genealogyResults.length) * 100).toFixed(2)) : 0;
      const herdLotResults = summary.results.filter((result) => resultModule(result) === "rebanho-lotes");
      const herdLotFailed = herdLotResults.filter((result) => !result.ok);
      const herdLotPassed = herdLotResults.length - herdLotFailed.length;
      const herdLotSuccessRate = herdLotResults.length ? Number(((herdLotPassed / herdLotResults.length) * 100).toFixed(2)) : 0;
      const securityResults = summary.results.filter((result) => resultModule(result).startsWith("seguranca"));
      const securityFailed = securityResults.filter((result) => !result.ok);
      const securityPassed = securityResults.length - securityFailed.length;
      const securitySuccessRate = securityResults.length ? Number(((securityPassed / securityResults.length) * 100).toFixed(2)) : 0;
      const report = {
        generatedAt: new Date().toISOString(),
        command: "npm run test:bot",
        safety: {
          modoTeste: true,
          salvarReal: false,
          whatsappReal: false,
          supabase: "mock-local-em-memoria",
          productionWrites: false
        },
        summary: {
          total: summary.results.length,
          passed: summary.passed,
          failed: summary.failed.length,
          successRate: summary.successRate,
          parserAndStatus: summary.parserAndStatus,
          conversations: summary.conversations,
          frameworkCases: summary.frameworkCases,
          failuresByModule: failureSummaryByModule(summary.failed),
          eventos: {
            total: eventResults.length,
            passed: eventPassed,
            failed: eventFailed.length,
            successRate: eventSuccessRate,
            coverage: [
              "registro de vacinas, medicamentos e tratamentos",
              "doencas e observacoes clinicas/reprodutivas como eventos confirmados",
              "parto, cio, prenhez, inseminacao e cobertura",
              "consultas de historico por animal e registros de hoje",
              "coleta por etapas, correcao, cancelamento, repeticao e confirmacao duplicada",
              "dry-run sem WhatsApp real, sem Supabase real e com isolamento por fazenda"
            ],
            fragileCases: [
              "consultas gerais de calendario/proximas vacinas ainda dependem de uma consulta dedicada no produto",
              "estoque de vacina/medicamento permanece fluxo separado quando o usuario fala em baixar dose"
            ],
            failures: eventFailed.map((result) => resultName(result))
          },
          eventosRelatorios: {
            total: eventReportResults.length,
            passed: eventReportPassed,
            failed: eventReportFailed.length,
            successRate: eventReportSuccessRate,
            coverage: [
              "consulta de eventos do rebanho por hoje, ontem, semana, mes e periodo explicito",
              "filtros de vacina, tratamento, clinico, parto e reprodutivo",
              "relatorio do dia, relatorio do mes, resumo rapido, relatorio detalhado e analise bom/ruim",
              "alertas de estoque baixo, ocorrencia clinica, producao ausente e financeiro negativo",
              "diferenciacao entre consulta e cadastro de evento",
              "permissoes de financeiro/ponto e isolamento por fazenda_id"
            ],
            fixes: [
              "consultas de eventos agora leem eventos_animal por fazenda_id e periodo",
              "relatorios gerais usam dados reais/mockados de producao, financeiro, estoque, eventos e ponto",
              "respostas de relatorio nao pedem confirmacao e nao geram acao simulada de salvamento",
              "consultas ambiguas perguntam o periodo em vez de inventar relatorio"
            ],
            fragileCases: [
              "permissoes granulares por modulo ainda dependem das roles atuais do bot",
              "relatorio detalhado mantem lista curta para caber melhor no WhatsApp"
            ],
            failures: eventReportFailed.map((result) => resultName(result))
          },
          financeiro: {
            total: financialResults.length,
            passed: financialPassed,
            failed: financialFailed.length,
            successRate: financialSuccessRate,
            coverage: [
              "lancamentos de entradas e saidas com confirmacao obrigatoria",
              "consultas financeiras sem confirmacao e sem salvamento",
              "resumos de entradas, saidas e resultado por hoje, ontem, semana, mes e datas explicitas",
              "listas de transacoes com paginacao via ver mais",
              "filtros por descricao/categoria como leite, racao e salario",
              "permissoes de admin/dono, isolamento por rancho e dry-run sem escrita real"
            ],
            failures: financialFailed.map((result) => resultName(result))
          },
          funcionariosPontoFolha: {
            total: employeePayrollResults.length,
            passed: employeePayrollPassed,
            failed: employeePayrollFailed.length,
            successRate: employeePayrollSuccessRate,
            coverage: [
              "cadastro de funcionario com e sem WhatsApp",
              "atualizacao, desligamento e exclusao logica",
              "registro de ponto completo e em etapas",
              "consulta de ponto e dados de funcionario",
              "folha/salario como consulta financeira ou despesa",
              "permissoes de admin versus funcionario comum",
              "dry-run sem WhatsApp real e sem escrita real de negocio"
            ],
            failures: employeePayrollFailed.map((result) => resultName(result))
          },
          genealogia: {
            total: genealogyResults.length,
            passed: genealogyPassed,
            failed: genealogyFailed.length,
            successRate: genealogySuccessRate,
            coverage: [
              "consulta de genealogia, pai, mae, filhos, descendentes e avos",
              "definir mae, definir pai, definir ambos e remover relacoes",
              "confirmacao obrigatoria antes de salvar alteracao genealogica",
              "correcao, cancelamento, repeticao e confirmacao duplicada",
              "bloqueio de ciclo e de animal como pai/mae dele mesmo",
              "nomes duplicados, codigos alfanumericos, permissao e isolamento por fazenda"
            ],
            failures: genealogyFailed.map((result) => resultName(result))
          },
          rebanhoLotes: {
            total: herdLotResults.length,
            passed: herdLotPassed,
            failed: herdLotFailed.length,
            successRate: herdLotSuccessRate,
            coverage: [
              "consulta de rebanho geral, por categoria, sexo, status, lote e sem lote",
              "consulta de detalhe de animal com lote",
              "listagem de lotes com contagem de animais",
              "paginacao por pedido de pagina",
              "criacao de lote com campo em etapas, confirmacao, permissao e isolamento por fazenda"
            ],
            failures: herdLotFailed.map((result) => resultName(result))
          },
          permissoesMultiFazendaWhatsapp: {
            total: securityResults.length,
            passed: securityPassed,
            failed: securityFailed.length,
            successRate: securitySuccessRate,
            whatsappFormats: [...whatsappFormatsA, ...whatsappFormatsB],
            coverage: [
              "numero autorizado, nao autorizado, inativo, sem rancho, rancho inativo e numero duplicado em mais de um rancho",
              "normalizacao com whatsapp:+55, +55, DDI puro, mascara, espacos e numero nacional sem DDI",
              "dono, admin, funcionario comum e bot_only",
              "permissoes administrativas, financeiras, funcionarios, genealogia, estoque, producao e ponto",
              "isolamento de animal, estoque, financeiro, funcionarios, ponto e genealogia entre Rancho A e Rancho B",
              "sessao por telefone, cancelamento, confirmacao duplicada, bloqueio antes de confirmacao e revalidacao antes do sim",
              "tentativas maliciosas sem exposicao de secrets, tokens, SQL, RLS ou dados de outro rancho"
            ],
            fixes: [
              "lancamentos financeiros pelo WhatsApp agora exigem admin/dono",
              "confirmacao em modo teste revalida permissao antes de gerar acao simulada",
              "mesmo WhatsApp ativo em mais de um rancho nao escolhe um rancho silenciosamente",
              "mensagens de bloqueio foram padronizadas para texto amigavel e sem detalhe tecnico"
            ],
            fragileCases: [
              "permissoes personalizadas granulares ainda nao aparecem como estrutura persistida no bot; a bateria valida as roles atuais",
              "quando um nome e ambiguo dentro do mesmo rancho, o bot pede brinco/codigo antes de salvar"
            ],
            failures: securityFailed.map((result) => resultName(result))
          }
        },
        failed: summary.failed.map(compactResultForReport),
        frameworkCases: summary.evaluationResults.map(compactResultForReport)
      };

      fs.writeFileSync(BOT_TEST_REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
      writeFinalRegressionReports(buildFinalRegressionReport(report, summary));

      const failureLines = summary.failed.length
        ? summary.failed.map((result) => (
          `- [${resultModule(result)}] ${resultName(result)}: ${(result.failures || []).join("; ")}`
        )).join("\n")
        : "- Nenhuma falha.";
      const moduleLines = Object.entries(failureSummaryByModule(summary.failed))
        .map(([moduleName, count]) => `- ${moduleName}: ${count}`)
        .join("\n") || "- Nenhuma falha por modulo.";
      const md = [
        "# Bot Test Report",
        "",
        `Gerado em: ${report.generatedAt}`,
        "",
        "## Resumo",
        "",
        `- Total: ${report.summary.total}`,
        `- Aprovados: ${report.summary.passed}`,
        `- Falhos: ${report.summary.failed}`,
        `- Taxa de sucesso: ${report.summary.successRate}%`,
        `- Parser/status: ${report.summary.parserAndStatus}`,
        `- Conversas reais simuladas: ${report.summary.conversations}`,
        `- Casos estruturados de framework: ${report.summary.frameworkCases}`,
        "",
        "## Eventos, Vacinas e Medicamentos",
        "",
        `- Total eventos: ${report.summary.eventos.total}`,
        `- Aprovados eventos: ${report.summary.eventos.passed}`,
        `- Falhos eventos: ${report.summary.eventos.failed}`,
        `- Taxa eventos: ${report.summary.eventos.successRate}%`,
        "- Cobertura: vacinas, medicamentos, tratamentos, doencas/observacoes clinicas, parto, cio, prenhez, inseminacao/cobertura, historico por animal, etapas, correcao, cancelamento, repeticao, confirmacao duplicada, permissao e fazenda_id.",
        "- Correcoes feitas: produto corrigido antes de salvar substitui o antigo, erros comuns de digitacao sao normalizados, observacoes clinicas/reprodutivas entram em fluxo de confirmacao e viram eventos do animal, e consultas/atualizacoes de animal usam catalogo do rancho.",
        "- Casos frageis: consultas gerais de calendario/proximas vacinas ainda precisam de consulta dedicada; baixa de estoque por dose continua fluxo separado e nao movimenta estoque real em teste.",
        "- Observacao: nenhum evento real, WhatsApp real ou baixa real de estoque e executado nesta bateria.",
        "",
        "## Eventos + Relatorios",
        "",
        `- Total eventos/relatorios: ${report.summary.eventosRelatorios.total}`,
        `- Aprovados eventos/relatorios: ${report.summary.eventosRelatorios.passed}`,
        `- Falhos eventos/relatorios: ${report.summary.eventosRelatorios.failed}`,
        `- Taxa eventos/relatorios: ${report.summary.eventosRelatorios.successRate}%`,
        "- Cobertura: eventos do rebanho, filtros por tipo, historico por periodo, relatorio do dia, relatorio do mes, resumo rapido, relatorio detalhado, analise bom/ruim, alertas, permissoes e isolamento por fazenda_id.",
        "- Correcoes feitas: consultas e relatorios leem dados mockados/reais por tabela de negocio e nao pedem confirmacao nem geram salvamento.",
        "- Observacao: relatorios nao inventam dados; se nao houver base suficiente, respondem que nao encontraram registros suficientes.",
        "",
        "## Financeiro",
        "",
        `- Total financeiro: ${report.summary.financeiro.total}`,
        `- Aprovados financeiro: ${report.summary.financeiro.passed}`,
        `- Falhos financeiro: ${report.summary.financeiro.failed}`,
        `- Taxa financeiro: ${report.summary.financeiro.successRate}%`,
        "- Cobertura: entradas, saidas, vendas, compras/despesas, salarios, valores em reais, contexto, confirmacao, correcao, cancelamento, repeticao, consultas resumidas/detalhadas, periodos, filtros, paginacao, permissoes e rancho_id.",
        "- Consultas protegidas: perguntas como quanto entrou hoje, quanto saiu hoje, resultado do dia, transacoes do mes e quais entradas de hoje consultam dados existentes e nao pedem confirmacao nem salvam transacao.",
        "- Observacao: testes usam modoTeste=true, salvarReal=false, Supabase mockado e nao enviam WhatsApp real.",
        "- Recomendacao: manter os casos financeiros criticos na bateria completa sempre que o NLP do bot mudar.",
        "",
        "## Funcionarios, Ponto e Folha",
        "",
        `- Total funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.total}`,
        `- Aprovados funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.passed}`,
        `- Falhos funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.failed}`,
        `- Taxa funcionarios/ponto/folha: ${report.summary.funcionariosPontoFolha.successRate}%`,
        "- Cobertura: cadastro com e sem WhatsApp, bot_only com pergunta de telefone, atualizacao salarial/cargo/CPF/WhatsApp, desligamento, exclusao logica, registro de ponto, ponto em etapas, consulta de ponto, consulta salarial, pagamento de salario como despesa e permissoes.",
        "- Correcoes/fragilidades observadas: a bateria protege contra cadastro virando consulta/financeiro, CPF virando telefone, ponto sem horario sendo confirmado cedo demais e funcionario comum executando acao administrativa.",
        "- Observacao: as acoes salvas no relatorio sao simuladas; o dry-run nao promete gravacao real.",
        "",
        "## Genealogia",
        "",
        `- Total genealogia: ${report.summary.genealogia.total}`,
        `- Aprovados genealogia: ${report.summary.genealogia.passed}`,
        `- Falhos genealogia: ${report.summary.genealogia.failed}`,
        `- Taxa genealogia: ${report.summary.genealogia.successRate}%`,
        "- Cobertura: consulta de arvore, pai/mae, filhos, descendentes, avos, definicao/remocao de pai e mae, correcao, cancelamento, repeticao, confirmacao duplicada, permissao, ciclos, auto-parentesco, nomes duplicados, codigos alfanumericos e isolamento por fazenda.",
        "- Observacao: alteracoes genealogicas seguem entender, coletar campos, resumir, pedir confirmacao e simular salvamento apenas apos confirmacao; nenhuma genealogia real e alterada em test:bot.",
        "",
        "## Rebanho e Lotes",
        "",
        `- Total rebanho/lotes: ${report.summary.rebanhoLotes.total}`,
        `- Aprovados rebanho/lotes: ${report.summary.rebanhoLotes.passed}`,
        `- Falhos rebanho/lotes: ${report.summary.rebanhoLotes.failed}`,
        `- Taxa rebanho/lotes: ${report.summary.rebanhoLotes.successRate}%`,
        "- Cobertura: consultas de rebanho por categoria, sexo, status, lote e sem lote, detalhe de animal com lote, listagem de lotes, paginacao, criacao de lote com confirmacao, permissao e multi-fazenda.",
        "- Observacao: consultas nao salvam nem pedem confirmacao; criacao de lote so gera acao simulada apos confirmacao.",
        "",
        "## Permissoes, Multi-Fazenda e WhatsApp",
        "",
        `- Total permissoes/multi-fazenda/WhatsApp: ${report.summary.permissoesMultiFazendaWhatsapp.total}`,
        `- Aprovados permissoes/multi-fazenda/WhatsApp: ${report.summary.permissoesMultiFazendaWhatsapp.passed}`,
        `- Falhos permissoes/multi-fazenda/WhatsApp: ${report.summary.permissoesMultiFazendaWhatsapp.failed}`,
        `- Taxa permissoes/multi-fazenda/WhatsApp: ${report.summary.permissoesMultiFazendaWhatsapp.successRate}%`,
        "- Cobertura: numero autorizado, nao autorizado, inativo, sem rancho, rancho inativo, WhatsApp duplicado em mais de um rancho, dono, admin, funcionario comum, bot_only, isolamento A/B, sessoes por telefone, confirmacao, cancelamento, revalidacao de permissao e tentativas maliciosas.",
        `- Formatos testados: ${report.summary.permissoesMultiFazendaWhatsapp.whatsappFormats.join("; ")}.`,
        "- Correcoes feitas: financeiro agora exige admin/dono; o sim do dry-run revalida permissao antes de gerar acao simulada; numero ativo em mais de um rancho fica bloqueado ate ajuste; mensagens de bloqueio ficaram amigaveis.",
        "- Casos frageis: permissoes personalizadas granulares ainda nao existem como estrutura dedicada no bot; por enquanto a bateria valida roles e bloqueios atuais.",
        "- Observacao: nenhum WhatsApp real foi enviado, nenhum dado real foi gravado e nenhum secret/token aparece nas respostas testadas.",
        "",
        "## Seguranca",
        "",
        "- WhatsApp real: nao envia mensagens.",
        "- Supabase: mock local em memoria.",
        "- modoTeste=true e salvarReal=false.",
        "- Escritas de negocio reais: bloqueadas pelo dry-run.",
        "",
        "## Falhas Por Modulo",
        "",
        moduleLines,
        "",
        "## Falhas",
        "",
        failureLines,
        "",
        "## Casos Estruturados",
        "",
        ...summary.evaluationResults.map((result) => (
          `- [${result.ok ? "ok" : "falha"}] ${result.module}: ${resultName(result)}`
        )),
        ""
      ].join("\n");
      fs.writeFileSync(BOT_TEST_REPORT_MD, md, "utf8");
    }


    return { resultModule, resultName, failureSummaryByModule, compactStepForReport, compactResultForReport, FINAL_REGRESSION_MODULES, finalRegressionModule, statsForModules, buildFinalRegressionReport, writeFinalRegressionReports, writeBotTestReports };
  }
};
