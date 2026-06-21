module.exports = function loadBotTestSection(context) {
  with (context) {
    function assertProcessResult(expected = {}, result) {
      const failures = [];
      const dados = result.dadosExtraidos || {};

      if ("intent" in expected && result.intencaoDetectada !== expected.intent) {
        failures.push(`intent esperado ${expected.intent}, recebido ${result.intencaoDetectada}`);
      }

      if ("estadoAnterior" in expected && result.estadoAnterior !== expected.estadoAnterior) {
        failures.push(`estadoAnterior esperado ${expected.estadoAnterior}, recebido ${result.estadoAnterior}`);
      }

      if ("estadoNovo" in expected && result.estadoNovo !== expected.estadoNovo) {
        failures.push(`estadoNovo esperado ${expected.estadoNovo}, recebido ${result.estadoNovo}`);
      }

      if ("eventoConfirmado" in expected && Boolean(result.eventoConfirmado) !== Boolean(expected.eventoConfirmado)) {
        failures.push(`eventoConfirmado esperado ${expected.eventoConfirmado}, recebido ${result.eventoConfirmado}`);
      }

      if (expected.responseIncludes && !normalize(result.respostaTexto).includes(normalize(expected.responseIncludes))) {
        failures.push(`resposta deveria conter "${expected.responseIncludes}", recebeu "${result.respostaTexto}"`);
      }

      const rawIncludes = Array.isArray(expected.responseRawIncludes)
        ? expected.responseRawIncludes
        : expected.responseRawIncludes ? [expected.responseRawIncludes] : [];
      for (const text of rawIncludes) {
        if (!String(result.respostaTexto || "").includes(text)) {
          failures.push(`resposta deveria conter exatamente "${text}", recebeu "${result.respostaTexto}"`);
        }
      }

      const rawNotIncludes = Array.isArray(expected.responseRawNotIncludes)
        ? expected.responseRawNotIncludes
        : expected.responseRawNotIncludes ? [expected.responseRawNotIncludes] : [];
      for (const text of rawNotIncludes) {
        if (String(result.respostaTexto || "").includes(text)) {
          failures.push(`resposta não deveria conter exatamente "${text}", recebeu "${result.respostaTexto}"`);
        }
      }

      for (const field of expected.missing || []) {
        if (hasValue(dados[field])) failures.push(`campo ${field} deveria estar faltando, recebeu ${dados[field]}`);
        if (!result.camposFaltantes.some((question) => normalize(question).includes(normalize(field)))) {
          failures.push(`campo faltante ${field} nao apareceu em camposFaltantes`);
        }
      }

      for (const [field, value] of Object.entries(expected.dados || {})) {
        const received = dados[field];
        if (typeof value === "number") {
          if (Number(received) !== value) failures.push(`dados.${field} esperado ${value}, recebido ${received}`);
        } else if (normalize(received) !== normalize(value)) {
          failures.push(`dados.${field} esperado ${value}, recebido ${received}`);
        }
      }

      if (result.erro) failures.push(`handler retornou erro: ${result.erro}`);
      return failures;
    }

    function createSupabaseForScenario(test = {}) {
      const supabase = new BotTestSupabase();
      if (test.ranches) {
        supabase.tables[BOT_TEST_TABLES.fazendas].push(...test.ranches.map((ranch) => ({
          id: ranch.id,
          ativa: ranch.ativa !== false,
          nome: ranch.nome || ranch.id
        })));
      }
      if (test.whatsappUsers) {
        supabase.tables[BOT_TEST_TABLES.whatsappUsuarios] = clone(test.whatsappUsers);
      }
      if (test.extraAnimals) {
        supabase.tables[BOT_TEST_TABLES.animais].push(...test.extraAnimals.map((animal, index) => ({
          id: animal.id || `animal-extra-${index + 1}`,
          fazenda_id: animal.fazenda_id || BOT_TEST_FARM_ID,
          brinco: animal.brinco,
          nome: animal.nome || animal.brinco,
          categoria: animal.categoria || "vaca",
          sexo: animal.sexo || "femea",
          fase: animal.fase || "lactacao",
          status: animal.status || "ativo",
          raca: animal.raca || "Girolando",
          lote_id: animal.lote_id || "lote-lactacao-1",
          data_nascimento: animal.data_nascimento || null,
          peso: animal.peso || null,
          observacoes: animal.observacoes || "",
          mae_id: animal.mae_id || null,
          pai_id: animal.pai_id || null,
          genealogia_observacoes: animal.genealogia_observacoes || null
        })));
      }
      if (test.extraLots) {
        supabase.tables[BOT_TEST_TABLES.lotes].push(...test.extraLots.map((lot, index) => ({
          id: lot.id || `lote-extra-${index + 1}`,
          fazenda_id: lot.fazenda_id || BOT_TEST_FARM_ID,
          nome: lot.nome,
          descricao: lot.descricao || lot.nome,
          ativo: lot.ativo !== false
        })));
      }
      if (test.reportFixture) {
        const today = localDateOnly();
        const yesterday = localDateOnly(-1);
        for (const table of [BOT_TEST_TABLES.ordenhas, BOT_TEST_TABLES.transacoesFinanceiras, BOT_TEST_TABLES.eventosAnimal, BOT_TEST_TABLES.registrosPonto, BOT_TEST_TABLES.estoqueItens, BOT_TEST_TABLES.estoqueMovimentacoes]) {
          supabase.tables[table] = supabase.tables[table].filter((row) => ![BOT_TEST_FARM_ID, BOT_TEST_FARM_ID_B].includes(row.fazenda_id));
        }
        supabase.tables[BOT_TEST_TABLES.ordenhas].push(
          { id: "report-ordenha-a-1", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-002", litros: 32, ordenhado_em: `${today}T08:00:00.000Z` },
          { id: "report-ordenha-a-2", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-003", litros: 18, ordenhado_em: `${today}T08:10:00.000Z` },
          { id: "report-ordenha-a-3", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-001", litros: 15, ordenhado_em: `${today}T08:20:00.000Z` },
          { id: "report-ordenha-a-old", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-002", litros: 60, ordenhado_em: `${yesterday}T08:00:00.000Z` },
          { id: "report-ordenha-b-1", fazenda_id: BOT_TEST_FARM_ID_B, animal_id: "animal-b2-b-002", litros: 20, ordenhado_em: `${today}T08:00:00.000Z` }
        );
        supabase.tables[BOT_TEST_TABLES.transacoesFinanceiras].push(
          { id: "report-fin-a-1", fazenda_id: BOT_TEST_FARM_ID, tipo: "entrada", valor: 900, descricao: "Venda de leite", categoria: "leite", data_transacao: today },
          { id: "report-fin-a-2", fazenda_id: BOT_TEST_FARM_ID, tipo: "saida", valor: 300, descricao: "Compra de racao", categoria: "racao", data_transacao: today },
          { id: "report-fin-a-3", fazenda_id: BOT_TEST_FARM_ID, tipo: "saida", valor: 150, descricao: "Energia", categoria: "energia", data_transacao: today },
          { id: "report-fin-b-1", fazenda_id: BOT_TEST_FARM_ID_B, tipo: "entrada", valor: 200, descricao: "Venda B", categoria: "leite", data_transacao: today },
          { id: "report-fin-b-2", fazenda_id: BOT_TEST_FARM_ID_B, tipo: "saida", valor: 300, descricao: "Racao B", categoria: "racao", data_transacao: today }
        );
        supabase.tables[BOT_TEST_TABLES.estoqueItens].push(
          { id: "report-stock-a-racao", fazenda_id: BOT_TEST_FARM_ID, nome: "Racao", descricao: "Racao", categoria: "racao", quantidade_atual: 10, quantidade_minima: 5, unidade_medida: "saco", ativo: true },
          { id: "report-stock-a-sal", fazenda_id: BOT_TEST_FARM_ID, nome: "Sal mineral", descricao: "Sal mineral", categoria: "insumo", quantidade_atual: 25, quantidade_minima: 5, unidade_medida: "kg", ativo: true },
          { id: "report-stock-a-aftosa", fazenda_id: BOT_TEST_FARM_ID, nome: "Aftosa", descricao: "Aftosa", categoria: "medicamento", quantidade_atual: 2, quantidade_minima: 5, unidade_medida: "dose", ativo: true },
          { id: "report-stock-b-racao", fazenda_id: BOT_TEST_FARM_ID_B, nome: "Racao", descricao: "Racao", categoria: "racao", quantidade_atual: 0, quantidade_minima: 10, unidade_medida: "saco", ativo: true }
        );
        supabase.tables[BOT_TEST_TABLES.estoqueMovimentacoes].push(
          { id: "report-stock-move-a-1", fazenda_id: BOT_TEST_FARM_ID, item_id: "report-stock-a-racao", tipo: "saida", quantidade: 2, created_at: `${today}T12:00:00.000Z` },
          { id: "report-stock-move-b-1", fazenda_id: BOT_TEST_FARM_ID_B, item_id: "report-stock-b-racao", tipo: "entrada", quantidade: 1, created_at: `${today}T12:00:00.000Z` }
        );
        supabase.tables[BOT_TEST_TABLES.eventosAnimal].push(
          { id: "report-event-a-1", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-002", tipo: "vacina", medicamento: "Aftosa", descricao: "Vacina Aftosa aplicada", data_evento: `${today}T09:00:00.000Z` },
          { id: "report-event-a-2", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-001", tipo: "observacao", medicamento: null, descricao: "queda de apetite", data_evento: `${today}T10:00:00.000Z` },
          { id: "report-event-a-3", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-003", tipo: "cio", medicamento: null, descricao: "cio registrado", data_evento: `${today}T11:00:00.000Z` },
          { id: "report-event-a-old", fazenda_id: BOT_TEST_FARM_ID, animal_id: "animal-b-001", tipo: "parto", medicamento: null, descricao: "parto registrado", data_evento: `${yesterday}T11:00:00.000Z` },
          { id: "report-event-b-1", fazenda_id: BOT_TEST_FARM_ID_B, animal_id: "animal-b2-b-002", tipo: "observacao", medicamento: null, descricao: "observacao B", data_evento: `${today}T11:00:00.000Z` }
        );
        supabase.tables[BOT_TEST_TABLES.registrosPonto].push(
          { id: "report-point-a-1", fazenda_id: BOT_TEST_FARM_ID, funcionario_id: "func-joao", tipo: "entrada", registrado_em: `${today}T07:00:00.000Z`, origem: "whatsapp" },
          { id: "report-point-a-2", fazenda_id: BOT_TEST_FARM_ID, funcionario_id: "func-bruno-a", tipo: "entrada", registrado_em: `${today}T07:30:00.000Z`, origem: "whatsapp" }
        );
      }
      if (test.auditLogs) {
        supabase.tables[BOT_TEST_TABLES.auditoriaLogs].push(...test.auditLogs.map((row, index) => ({
          id: row.id || `audit-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          usuario_id: row.usuario_id ?? null,
          entidade: row.entidade,
          acao: row.acao || "insert",
          depois: row.depois || {},
          origem: row.origem || "whatsapp",
          created_at: row.created_at || new Date().toISOString()
        })));
      }
      if (test.whatsappMessages) {
        supabase.tables[BOT_TEST_TABLES.whatsappMensagens].push(...test.whatsappMessages.map((row, index) => ({
          id: row.id || `wa-message-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          telefone_e164: row.telefone_e164 || test.phone || BOT_TEST_ADMIN_PHONE,
          wa_message_id: row.wa_message_id || `wa-message-extra-${index + 1}`,
          direcao: row.direcao || "entrada",
          tipo: row.tipo || "text",
          payload: row.payload || { body: row.body || "" },
          processada_em: row.processada_em || new Date().toISOString(),
          created_at: row.created_at || row.processada_em || new Date().toISOString()
        })));
      }
      if (test.financeTransactions) {
        supabase.tables[BOT_TEST_TABLES.transacoesFinanceiras].push(...test.financeTransactions.map((row, index) => ({
          id: row.id || `financeiro-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          tipo: row.tipo || "entrada",
          valor: row.valor,
          descricao: row.descricao || "transacao teste",
          categoria: row.categoria || null,
          metodo_pagamento: row.metodo_pagamento || null,
          origem: row.origem || null,
          data_transacao: row.data_transacao || localDateOnly(),
          created_at: row.created_at || `${row.data_transacao || localDateOnly()}T12:00:00.000Z`
        })));
      }
      if (test.animalEvents) {
        supabase.tables[BOT_TEST_TABLES.eventosAnimal].push(...test.animalEvents.map((row, index) => ({
          id: row.id || `evento-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          animal_id: row.animal_id,
          tipo: row.tipo || "observacao",
          data_evento: row.data_evento || `${localDateOnly()}T12:00:00.000Z`,
          descricao: row.descricao || "evento teste",
          medicamento: row.medicamento || null,
          dose: row.dose || null,
          custo: row.custo ?? 0
        })));
      }
      if (test.animalProductions) {
        supabase.tables[BOT_TEST_TABLES.ordenhas].push(...test.animalProductions.map((row, index) => ({
          id: row.id || `ordenha-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          animal_id: row.animal_id,
          litros: row.litros,
          ordenhado_em: row.ordenhado_em || new Date().toISOString(),
          turno: row.turno || null,
          destino: row.destino || null,
          origem: row.origem || "whatsapp",
          registrado_por: row.registrado_por || null,
          observacoes: row.observacoes || null
        })));
      }
      if (test.employees) {
        supabase.tables[BOT_TEST_TABLES.funcionarios] = test.employees.map((row, index) => ({
          id: row.id || `func-custom-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          nome: row.nome,
          funcao: row.funcao || "Funcionário",
          cpf: row.cpf || null,
          contato_whatsapp: row.contato_whatsapp || null,
          salario_base: row.salario_base ?? 0,
          tipo_acesso: row.tipo_acesso || "bot_only",
          ativo: row.ativo !== false,
          deleted_at: row.deleted_at || null
        }));
      }
      if (test.extraEmployees) {
        supabase.tables[BOT_TEST_TABLES.funcionarios].push(...test.extraEmployees.map((row, index) => ({
          id: row.id || `func-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          nome: row.nome,
          funcao: row.funcao || "Funcionário",
          cpf: row.cpf || null,
          contato_whatsapp: row.contato_whatsapp || null,
          salario_base: row.salario_base ?? 0,
          tipo_acesso: row.tipo_acesso || "bot_only",
          ativo: row.ativo !== false,
          deleted_at: row.deleted_at || null
        })));
      }
      if (test.pointRecords) {
        supabase.tables[BOT_TEST_TABLES.registrosPonto].push(...test.pointRecords.map((row, index) => ({
          id: row.id || `ponto-extra-${index + 1}`,
          fazenda_id: row.fazenda_id || BOT_TEST_FARM_ID,
          funcionario_id: row.funcionario_id,
          tipo: row.tipo || "entrada",
          registrado_em: row.registrado_em || new Date().toISOString(),
          origem: row.origem || "whatsapp"
        })));
      }
      if (test.stockItems) {
        supabase.tables[BOT_TEST_TABLES.estoqueItens] = test.stockItems.map((item, itemIndex) => ({
          id: item.id || `stock-custom-${itemIndex + 1}`,
          fazenda_id: item.fazenda_id || BOT_TEST_FARM_ID,
          nome: item.nome,
          descricao: item.nome,
          categoria: item.categoria || "outro",
          quantidade_atual: item.quantidade_atual ?? 0,
          quantidade_minima: item.quantidade_minima ?? 0,
          unidade_medida: item.unidade_medida || stockUnitFor(item.nome),
          valor_unitario: item.valor_unitario ?? 0,
          ativo: item.ativo !== false
        }));
      }
      if (test.extraStockItems) {
        supabase.tables[BOT_TEST_TABLES.estoqueItens].push(...test.extraStockItems.map((item, itemIndex) => ({
          id: item.id || `stock-extra-${itemIndex + 1}`,
          fazenda_id: item.fazenda_id || BOT_TEST_FARM_ID,
          nome: item.nome,
          descricao: item.nome,
          categoria: item.categoria || "outro",
          quantidade_atual: item.quantidade_atual ?? 0,
          quantidade_minima: item.quantidade_minima ?? 0,
          unidade_medida: item.unidade_medida || stockUnitFor(item.nome),
          valor_unitario: item.valor_unitario ?? 0,
          ativo: item.ativo !== false
        })));
      }
      seedInitialSession(supabase, test);
      return supabase;
    }

    function materializeInitialSession(initialSession) {
      if (!initialSession) return null;
      const session = typeof initialSession === "function" ? initialSession() : initialSession;
      if (!session) return null;
      if (session.dados?.pending) return session;
      if (session.pending) {
        return {
          etapa: session.etapa || "aguardando_dado",
          dados: { pending: session.pending }
        };
      }
      return session;
    }

    function seedInitialSession(supabase, test = {}) {
      const session = materializeInitialSession(test.initialSession);
      if (!session) return;
      const phone = test.phone || BOT_TEST_ADMIN_PHONE;
      const whatsappUser = supabase.tables[BOT_TEST_TABLES.whatsappUsuarios].find((row) => row.telefone_e164 === phone) || {};
      supabase.tables[BOT_TEST_TABLES.whatsappSessoes].push({
        id: `session-${phone}`,
        fazenda_id: session.fazenda_id || test.ranch?.id || whatsappUser.fazenda_id || BOT_TEST_FARM_ID,
        whatsapp_usuario_id: whatsappUser.id || "wa-admin",
        telefone_e164: phone,
        fluxo: session.etapa === "livre" ? null : "nlp_local",
        etapa: session.etapa || "livre",
        dados: clone(session.dados || {}),
        status: "ativa",
        ultimo_interacao_em: new Date().toISOString(),
        expira_em: session.expira_em || new Date(Date.now() + 60 * 60 * 1000).toISOString()
      });
    }

    function simulatedReproductiveDbType(kind) {
      if (kind === "inseminacao") return "inseminacao";
      if (kind === "parto") return "parto";
      return "observacao";
    }

    function simulatedReproductiveDescription(dados) {
      const labels = {
        inseminacao: "Inseminacao",
        prenhez: "Prenhez",
        pre_parto: "Pre-parto",
        parto: "Parto",
        protocolo: "Protocolo",
        reteste: "Reteste de protocolo",
        observacao: "Observacao reprodutiva"
      };
      const kind = dados.evento_reprodutivo_tipo || "observacao";
      return `[Reproducao Animal] ${labels[kind] || labels.observacao} registrada via WhatsApp`;
    }

    function simulatedSaveActionsForResult(result, phone) {
      if (!result.eventoConfirmado) return [];
      const tipo = result.intencaoDetectada;
      const dados = result.dadosExtraidos || {};
      const base = {
        type: "create",
        dryRun: true,
        source: "processWhatsappMessage:modoTeste",
        phone: maskPhone(phone)
      };
      const fazendaId = farmIdForPhone(phone);

      if (tipo === "PRODUCAO_LEITE") {
        const actions = [{
          ...base,
          table: BOT_TEST_TABLES.ordenhas,
          payload: {
            fazenda_id: fazendaId,
            animal_id: dados.animal_id || null,
            animal_codigo: dados.animal_codigo,
            litros: Number(dados.litros),
            origem: "whatsapp"
          }
        }];
        const stock = dados.estoque_leite || {};
        if (stock.estoque_movimentar && stock.item_id) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.estoqueMovimentacoes,
            payload: {
              fazenda_id: fazendaId,
              item_id: stock.item_id,
              item_nome: stock.item_leite_resolvido,
              tipo: "entrada",
              quantidade: Number(stock.total_litros || dados.litros || 0),
              origem: "whatsapp"
            }
          });
        }
        return actions;
      }

      if (tipo === "LOTE_REGISTROS") {
        const registros = Array.isArray(dados.registros) ? dados.registros : [];
        const actions = registros.flatMap((registro) => {
          if (registro.tipo !== "PRODUCAO_LEITE") return [];
          return [{
            ...base,
            table: BOT_TEST_TABLES.ordenhas,
            payload: {
              fazenda_id: fazendaId,
              animal_id: registro.dados?.animal_id || null,
              animal_codigo: registro.dados?.animal_codigo,
              litros: Number(registro.dados?.litros || 0),
              origem: "whatsapp"
            }
          }];
        });
        const stock = dados.estoque_leite || {};
        if (stock.estoque_movimentar && stock.item_id) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.estoqueMovimentacoes,
            payload: {
              fazenda_id: fazendaId,
              item_id: stock.item_id,
              item_nome: stock.item_leite_resolvido,
              tipo: "entrada",
              quantidade: Number(stock.total_litros || dados.total_litros || 0),
              origem: "whatsapp"
            }
          });
        }
        return actions;
      }

      if (tipo === "IMPORTACAO_EVENTOS_TABELA") {
        const rows = Array.isArray(dados.linhas_validadas) ? dados.linhas_validadas : [];
        return rows
          .filter((row) => row.status_validacao === "pronto")
          .map((row) => ({
            ...base,
            table: BOT_TEST_TABLES.eventosAnimal,
            payload: {
              fazenda_id: fazendaId,
              animal_id: row.animal_id || null,
              animal_codigo: row.animal_codigo,
              evento_tipo: row.evento_tipo || row.db_tipo || null,
              data_evento: row.data_referencia || null,
              descricao: row.descricao_salvar || row.observacoes || null,
              origem: "whatsapp"
            }
          }));
      }

      if (tipo === "IMPORTACAO_ANIMAIS_TABELA") {
        const rows = Array.isArray(dados.linhas_validadas) ? dados.linhas_validadas : [];
        const actions = [];
        if (dados.criar_lotes_faltantes) {
          const lots = Array.from(new Set(rows
            .filter((row) => row.status_validacao === "pronto" && Array.isArray(row.problemas_validacao) && row.problemas_validacao.includes("lote_nao_encontrado"))
            .map((row) => String(row.lote_nome || "").trim())
            .filter(Boolean)));
          for (const lotName of lots) {
            actions.push({
              ...base,
              table: BOT_TEST_TABLES.lotes,
              payload: {
                fazenda_id: fazendaId,
                nome: lotName,
                ativo: true,
                origem: "whatsapp"
              }
            });
          }
        }

        for (const row of rows.filter((item) => item.status_validacao === "pronto")) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.animais,
            payload: {
              fazenda_id: fazendaId,
              brinco: row.animal_codigo,
              nome: row.nome || null,
              categoria: row.categoria || "outro",
              sexo: row.sexo || "nao_informado",
              raca: row.raca || null,
              lote_id: row.lote_id || null,
              lote_nome: row.lote_nome || null,
              data_nascimento: row.data_nascimento || null,
              peso: row.peso !== undefined && row.peso !== null && row.peso !== "" ? Number(row.peso) : null,
              status: row.status || "ativo",
              origem: "whatsapp"
            }
          });
        }
        return actions;
      }

      if (tipo === "IMPORTACAO_ESTOQUE_TABELA") {
        const rows = Array.isArray(dados.linhas_validadas) ? dados.linhas_validadas : [];
        const actions = [];
        if (dados.criar_itens_faltantes) {
          const items = Array.from(new Set(rows
            .filter((row) => row.status_validacao === "pronto" && row.criar_item_estoque)
            .map((row) => String(row.item_nome || row.item_original || "").trim())
            .filter(Boolean)));
          for (const itemName of items) {
            actions.push({
              ...base,
              table: BOT_TEST_TABLES.estoqueItens,
              payload: {
                fazenda_id: fazendaId,
                nome: itemName,
                unidade_medida: "kg",
                ativo: true,
                origem: "whatsapp"
              }
            });
          }
        }

        for (const row of rows.filter((item) => item.status_validacao === "pronto")) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.estoqueMovimentacoes,
            payload: {
              fazenda_id: fazendaId,
              item_id: row.item_id || null,
              item_nome: row.item_resolvido || row.item_nome || row.item_original,
              tipo: row.tipo_movimento,
              quantidade: Number(row.quantidade || 0),
              unidade: row.unidade,
              origem: "whatsapp"
            }
          });
        }
        return actions;
      }

      if (tipo === "DESPESA" || tipo === "RECEITA_VENDA") {
        return [{
          ...base,
          table: BOT_TEST_TABLES.transacoesFinanceiras,
          payload: {
            fazenda_id: fazendaId,
            tipo: tipo === "DESPESA" ? "saida" : "entrada",
            valor: Number(dados.valor),
            descricao: dados.descricao || null,
            origem: "whatsapp"
          }
        }];
      }

      if (tipo === "PARTO" && (dados.parto_cria_cadastro || dados.cria_codigo || dados.cria_sexo || dados.cria_categoria)) {
        const mother = mockAnimals.find((animal) => animal.id === dados.animal_id || sameValue(animal.brinco, dados.animal_codigo)) || {};
        const childSex = dados.cria_sexo || "nao_informado";
        const childCategory = dados.cria_categoria || (childSex === "femea" ? "bezerra" : "bezerro");
        const actions = [{
          ...base,
          table: BOT_TEST_TABLES.eventosAnimal,
          payload: {
            fazenda_id: fazendaId,
            animal_id: dados.animal_id || null,
            animal_codigo: dados.animal_codigo,
            evento_tipo: "PARTO",
            tipo: "parto",
            cria_codigo: dados.cria_codigo || null,
            cria_sexo: childSex,
            mother_categoria: mother.categoria || null,
            mother_fase: mother.fase || null,
            origem: "whatsapp"
          }
        }, {
          ...base,
          table: BOT_TEST_TABLES.animais,
          payload: {
            fazenda_id: fazendaId,
            brinco: dados.cria_codigo || null,
            nome: dados.cria_nome || null,
            categoria: childCategory,
            sexo: childSex,
            fase: "crescimento",
            status: "ativo",
            mae_id: dados.animal_id || null,
            pai_id: dados.pai_id || null,
            data_nascimento: dados.data_referencia || null,
            origem: "whatsapp"
          }
        }];
        if (["gestante", "prenhe", "prenha", "prenhez"].includes(normalize(mother.fase))) {
          actions.push({
            ...base,
            type: "update",
            table: BOT_TEST_TABLES.animais,
            payload: {
              fazenda_id: fazendaId,
              id: mother.id || null,
              fase: "lactacao"
            }
          });
        }
        return actions;
      }

      if (tipo === "VACINA_MEDICAMENTO" || tipo === "PARTO" || tipo === "MORTE") {
        return [{
          ...base,
          table: BOT_TEST_TABLES.eventosAnimal,
          payload: {
            fazenda_id: fazendaId,
            animal_id: dados.animal_id || null,
            animal_codigo: dados.animal_codigo,
            produto: dados.produto || null,
            evento_tipo: dados.evento_tipo || tipo,
            origem: "whatsapp"
          }
        }];
      }

      if (tipo === "CRIAR_ITEM_ESTOQUE" || tipo === "ESTOQUE_CADASTRO") {
        const actions = [{
          ...base,
          table: BOT_TEST_TABLES.estoqueItens,
          payload: {
            fazenda_id: fazendaId,
            nome: dados.item_nome,
            quantidade_atual: Number(dados.quantidade || 0),
            unidade_medida: dados.unidade || "unidade"
          }
        }];

        if (dados.compra && dados.valor) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.transacoesFinanceiras,
            payload: {
              fazenda_id: fazendaId,
              tipo: "saida",
              valor: Number(dados.valor),
              descricao: dados.item_nome || null,
              origem: "whatsapp"
            }
          });
        }

        return actions;
      }

      if (tipo === "CRIAR_LOTE") {
        return [{
          ...base,
          table: BOT_TEST_TABLES.lotes,
          payload: {
            fazenda_id: fazendaId,
            nome: dados.lote_nome,
            ativo: true
          }
        }];
      }

      if (tipo === "ESTOQUE_ENTRADA" || tipo === "ESTOQUE_SAIDA") {
        if (!dados.item_id && dados.item_estoque_encontrado === false) return [];

        const actions = [];

        if (!(tipo === "ESTOQUE_SAIDA" && dados.venda && dados.deve_baixar_estoque === false)) {
          actions.push({
          ...base,
          table: BOT_TEST_TABLES.estoqueMovimentacoes,
          payload: {
            fazenda_id: fazendaId,
            item_id: dados.item_id || null,
            item_nome: dados.item_nome,
            tipo: tipo === "ESTOQUE_ENTRADA" ? "entrada" : "saida",
            quantidade: Number(dados.quantidade || 0)
          }
          });
        }

        if (dados.compra && dados.valor) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.transacoesFinanceiras,
            payload: {
              fazenda_id: fazendaId,
              tipo: "saida",
              valor: Number(dados.valor),
              descricao: dados.item_nome || null,
              origem: "whatsapp"
            }
          });
        }

        if (dados.venda && dados.valor) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.transacoesFinanceiras,
            payload: {
              fazenda_id: fazendaId,
              tipo: "entrada",
              valor: Number(dados.valor),
              descricao: dados.item_nome || null,
              origem: "whatsapp"
            }
          });
        }

        return actions;
      }

      if (tipo === "PONTO_FUNCIONARIO") {
        return [{
          ...base,
          table: BOT_TEST_TABLES.registrosPonto,
          payload: {
            fazenda_id: fazendaId,
            funcionario_nome: dados.funcionario_nome,
            tipo: dados.ponto_tipo || "entrada",
            horario: dados.horario || null
          }
        }];
      }

      if (tipo === "CRIAR_FUNCIONARIO") {
        const actions = [{
          ...base,
          table: BOT_TEST_TABLES.funcionarios,
          payload: {
            fazenda_id: fazendaId,
            nome: dados.funcionario_nome,
            funcao: dados.funcao || "Funcionário",
            cpf: dados.cpf || null,
            contato_whatsapp: dados.telefone || null,
            salario_base: Number(dados.salario_base || 0),
            tipo_acesso: dados.tipo_acesso || "bot_only"
          }
        }];
        if (dados.telefone) {
          actions.push({
            ...base,
            table: BOT_TEST_TABLES.whatsappUsuarios,
            payload: {
              fazenda_id: fazendaId,
              telefone_e164: normalizeWhatsappNumber(dados.telefone),
              nome_exibicao: dados.funcionario_nome,
              papel_bot: "funcionario"
            }
          });
        }
        return actions;
      }

      if (tipo === "PAGAMENTO_FUNCIONARIO") {
        return [
          {
            ...base,
            table: BOT_TEST_TABLES.folhaPagamento,
            payload: {
              fazenda_id: fazendaId,
              funcionario_nome: dados.funcionario_nome,
              total_liquido: Number(dados.valor || 0),
              status: "paga",
              pagamento_tipo: dados.pagamento_tipo || "salario"
            }
          },
          {
            ...base,
            table: BOT_TEST_TABLES.transacoesFinanceiras,
            payload: {
              fazenda_id: fazendaId,
              tipo: "saida",
              valor: Number(dados.valor || 0),
              descricao: dados.funcionario_nome || null,
              origem: "folha_pagamento"
            }
          }
        ];
      }

      if (tipo === "ATUALIZAR_FUNCIONARIO") {
        return [{
          ...base,
          type: "update",
          table: BOT_TEST_TABLES.funcionarios,
          payload: {
            fazenda_id: fazendaId,
            funcionario_nome: dados.funcionario_nome,
            campo_alterado: dados.campo_alterado,
            novo_valor: dados.novo_valor
          }
        }];
      }

      if (tipo === "DESLIGAR_FUNCIONARIO" || tipo === "EXCLUIR_FUNCIONARIO") {
        return [{
          ...base,
          type: "update",
          table: BOT_TEST_TABLES.funcionarios,
          payload: {
            fazenda_id: fazendaId,
            funcionario_nome: dados.funcionario_nome,
            ativo: false,
            deleted_at: tipo === "EXCLUIR_FUNCIONARIO" ? "simulado" : null
          }
        }];
      }

      if (tipo === "CADASTRO_ANIMAL") {
        return [{
          ...base,
          table: BOT_TEST_TABLES.animais,
            payload: {
              fazenda_id: fazendaId,
              brinco: dados.animal_codigo,
              nome: dados.nome || null,
              categoria: dados.categoria || null,
              sexo: dados.sexo || null,
              peso: dados.peso !== undefined && dados.peso !== null && dados.peso !== "" ? Number(dados.peso) : null,
              raca: dados.raca || null,
              lote_id: dados.lote_id || null,
              data_nascimento: dados.data_nascimento || null,
              observacoes: dados.observacoes || null
            }
          }];
      }

      if (tipo === "EXCLUIR_REBANHO") {
        return [{
          ...base,
          type: "delete",
          table: BOT_TEST_TABLES.animais,
          payload: {
            fazenda_id: fazendaId,
            alvo: "rebanho"
          }
        }];
      }

      if (tipo === "ATUALIZACAO_ANIMAL") {
        if (dados.registro_evento_animal) {
          const reproductiveKind = dados.evento_tipo === "reprodutivo" ? (dados.evento_reprodutivo_tipo || "observacao") : null;
          const actions = [{
            ...base,
            table: BOT_TEST_TABLES.eventosAnimal,
            payload: {
              fazenda_id: fazendaId,
              animal_id: dados.animal_id || null,
              animal_codigo: dados.animal_codigo,
              evento_tipo: dados.evento_tipo || "observacao",
              evento_reprodutivo_tipo: dados.evento_reprodutivo_tipo || null,
              tipo: reproductiveKind ? simulatedReproductiveDbType(reproductiveKind) : "observacao",
              descricao: dados.descricao || dados.novo_valor || null,
              descricao_salvar: reproductiveKind ? simulatedReproductiveDescription(dados) : dados.descricao || dados.novo_valor || null,
              medicamento: reproductiveKind === "inseminacao" ? dados.origem_inseminacao || null : null,
              custo: Number(dados.custo || dados.valor || 0),
              origem: "whatsapp"
            }
          }];

          if (reproductiveKind === "prenhez" && dados.campo_alterado === "fase") {
            actions.push({
              ...base,
              type: "update",
              table: BOT_TEST_TABLES.animais,
              payload: {
                fazenda_id: fazendaId,
                animal_codigo: dados.animal_codigo,
                campo_alterado: "fase",
                novo_valor: dados.novo_valor
              }
            });
          }

          if (Number(dados.custo || dados.valor || 0) > 0) {
            actions.push({
              ...base,
              table: BOT_TEST_TABLES.transacoesFinanceiras,
              payload: {
                fazenda_id: fazendaId,
                tipo: "saida",
                valor: Number(dados.custo || dados.valor || 0),
                descricao: dados.descricao || dados.novo_valor || null,
                origem: "whatsapp"
              }
            });
          }

          return actions;
        }

        return [{
          ...base,
          type: "update",
          table: BOT_TEST_TABLES.animais,
          payload: {
            fazenda_id: fazendaId,
            animal_codigo: dados.animal_codigo,
            campo_alterado: dados.campo_alterado,
            novo_valor: dados.novo_valor
          }
        }];
      }

      if (tipo === "ATUALIZACAO_GENEALOGIA") {
        return [{
          ...base,
          type: "update",
          table: BOT_TEST_TABLES.animais,
          payload: {
            fazenda_id: fazendaId,
            animal_id: dados.animal_id || null,
            animal_codigo: dados.animal_codigo,
            mae_id: dados.remover_mae ? null : dados.mae_id || null,
            pai_id: dados.remover_pai ? null : dados.pai_id || null,
            mae_nome: dados.remover_mae ? null : dados.mae_nome || null,
            pai_nome: dados.remover_pai ? null : dados.pai_nome || null,
            origem: "whatsapp"
          }
        }];
      }

      return [];
    }

    function maskPhone(phone) {
      const digits = String(phone || "").replace(/\D/g, "");
      return digits ? `***${digits.slice(-4)}` : "";
    }

    function farmIdForPhone(phone) {
      const normalized = normalizeWhatsappNumber(phone) || String(phone || "");
      const whatsappUser = activeBotTestSupabase?.tables?.[BOT_TEST_TABLES.whatsappUsuarios]?.find((row) => row.telefone_e164 === normalized);
      return whatsappUser?.fazenda_id || BOT_TEST_FARM_ID;
    }

    function hasAskedConfirmation(steps) {
      return steps.some((step) => (
        step.result.estadoNovo === "aguardando_confirmacao"
        || normalize(step.result.respostaTexto).includes("correto")
        || normalize(step.result.respostaTexto).includes("confirmar")
      ));
    }

    function hasAskedFollowUp(steps) {
      return steps.some((step) => ["aguardando_dado", "aguardando_confirmacao"].includes(step.result.estadoNovo));
    }

    function firstConfirmationIndex(steps) {
      return steps.findIndex((step) => step.result.eventoConfirmado);
    }

    function sameValue(received, expected) {
      if (typeof expected === "number") return Number(received) === expected;
      return normalize(received) === normalize(expected);
    }

    function actionPayloadHas(actions, field, expected) {
      return actions.some((action) => sameValue(action.payload?.[field], expected));
    }

    function uniqueActionKey(action) {
      return `${action.type}:${action.table}:${JSON.stringify(action.payload || {})}`;
    }

    function writeActionsForTrace(trace) {
      const trackedTables = new Set([
        ...Array.from(BOT_TEST_BUSINESS_TABLES),
        BOT_TEST_TABLES.lotes,
        BOT_TEST_TABLES.whatsappUsuarios
      ]);
      return (trace.writes || [])
        .filter((write) => trackedTables.has(write.tableName))
        .flatMap((write) => (write.rows || []).map((row) => ({
        type: write.action === "update" ? "update" : write.action === "delete" ? "delete" : "create",
        dryRun: false,
        source: "processWhatsappMessage:real-save",
        table: write.tableName,
        payload: row || {}
      })));
    }

    function detectStuckFlow(steps) {
      const failures = [];
      for (let index = 1; index < steps.length; index += 1) {
        const previous = steps[index - 1].result;
        const current = steps[index].result;
        if (
          previous.estadoNovo === "aguardando_dado"
          && current.estadoNovo === "aguardando_dado"
          && normalize((previous.camposFaltantes || []).join("|")) === normalize((current.camposFaltantes || []).join("|"))
        ) {
          failures.push(`fluxo possivelmente preso apos mensagem ${index + 1}: ${steps[index].text}`);
        }
      }
      return failures;
    }

    function evaluateStructuredCase(test, trace) {
      const failures = [];
      const expected = test.expected || {};
      const finalStep = trace.steps[trace.steps.length - 1];
      const finalResult = finalStep?.result || {};
      const finalData = finalResult.dadosExtraidos || {};
      const simulatedActions = trace.simulatedSaveActions || [];
      const capturedActions = [...simulatedActions, ...writeActionsForTrace(trace)];
      const confirmIndex = firstConfirmationIndex(trace.steps);

      if (expected.finalIntent && finalResult.intencaoDetectada !== expected.finalIntent) {
        failures.push(`intent final esperado ${expected.finalIntent}, recebido ${finalResult.intencaoDetectada}`);
      }

      for (const forbiddenIntent of expected.avoidIntents || []) {
        if (trace.steps.some((step) => step.result.intencaoDetectada === forbiddenIntent)) {
          failures.push(`intent proibido detectado: ${forbiddenIntent}`);
        }
      }

      for (const [field, value] of Object.entries(expected.entities || {})) {
        const received = finalData[field];
        if (!sameValue(received, value)) failures.push(`entidade ${field} esperada ${value}, recebida ${received}`);
      }

      for (const field of expected.absentEntities || []) {
        if (hasValue(finalData[field])) failures.push(`entidade ${field} deveria estar ausente, recebida ${finalData[field]}`);
      }

      if (expected.responseIncludes && !normalize(finalResult.respostaTexto).includes(normalize(expected.responseIncludes))) {
        failures.push(`resposta final deveria conter "${expected.responseIncludes}", recebeu "${finalResult.respostaTexto}"`);
      }

      if (expected.responseNotIncludes && normalize(finalResult.respostaTexto).includes(normalize(expected.responseNotIncludes))) {
        failures.push(`resposta final nao deveria conter "${expected.responseNotIncludes}", recebeu "${finalResult.respostaTexto}"`);
      }

      const allResponsesNotInclude = Array.isArray(expected.allResponsesNotInclude)
        ? expected.allResponsesNotInclude
        : expected.allResponsesNotInclude ? [expected.allResponsesNotInclude] : [];
      for (const forbiddenText of allResponsesNotInclude) {
        const leakingStep = trace.steps.find((step) => normalize(step.result.respostaTexto).includes(normalize(forbiddenText)));
        if (leakingStep) {
          failures.push(`resposta nao deveria conter "${forbiddenText}" em nenhuma etapa, recebeu na mensagem "${leakingStep.text}": ${leakingStep.result.respostaTexto}`);
        }
      }

      if (expected.shouldAskConfirmation && !hasAskedConfirmation(trace.steps)) {
        failures.push("esperava pedido de confirmacao");
      }

      if (expected.shouldAskFollowUp && !hasAskedFollowUp(trace.steps)) {
        failures.push("esperava pergunta de campo faltante ou confirmacao");
      }

      if (expected.shouldSaveBeforeConfirmation === false) {
        const beforeConfirmSteps = confirmIndex >= 0 ? trace.steps.slice(0, confirmIndex) : trace.steps;
        const wroteBeforeConfirm = beforeConfirmSteps.some((step) => step.businessWritesDelta.length || step.simulatedSaveActions.length);
        if (wroteBeforeConfirm) failures.push("houve tentativa de salvamento antes da confirmacao");
      }

      if (expected.savedAfterConfirmation === true && !capturedActions.length) {
        failures.push("esperava acao de salvamento apos confirmacao positiva");
      }

      if (expected.savedAfterConfirmation === false && capturedActions.length) {
        failures.push(`nao esperava salvamento, recebeu ${capturedActions.length}`);
      }

      if (typeof expected.simulatedSaveCount === "number" && simulatedActions.length !== expected.simulatedSaveCount) {
        failures.push(`acoes simuladas esperadas ${expected.simulatedSaveCount}, recebidas ${simulatedActions.length}`);
      }

      for (const table of expected.savedTables || []) {
        if (!capturedActions.some((action) => action.table === table)) failures.push(`tabela esperada ${table} nao capturada`);
      }

      if (expected.shouldNotDuplicate) {
        const keys = capturedActions.map(uniqueActionKey);
        if (new Set(keys).size !== keys.length) failures.push("salvamento simulado duplicado detectado");
      }

      for (const [field, value] of Object.entries(expected.shouldSaveValues || {})) {
        if (!actionPayloadHas(capturedActions, field, value)) failures.push(`acao deveria salvar ${field}=${value}`);
      }

      for (const [field, value] of Object.entries(expected.shouldNotSaveValues || {})) {
        if (actionPayloadHas(capturedActions, field, value)) failures.push(`acao nao deveria salvar ${field}=${value}`);
      }

      if (expected.shouldClearSession && finalResult.estadoNovo !== "livre") {
        failures.push(`sessao deveria ficar livre, recebeu ${finalResult.estadoNovo}`);
      }

      if (expected.ranchId) {
        const wrongRanch = capturedActions.find((action) => action.payload?.fazenda_id && action.payload.fazenda_id !== expected.ranchId);
        if (wrongRanch) failures.push(`acao com fazenda_id incorreto: ${wrongRanch.payload.fazenda_id}`);
      }

      if (expected.sessionFarmId) {
        const normalizedPhone = normalizeWhatsappNumber(test.phone || BOT_TEST_ADMIN_PHONE) || String(test.phone || BOT_TEST_ADMIN_PHONE);
        const session = trace.sessions.find((row) => normalizeWhatsappNumber(row.telefone_e164) === normalizedPhone);
        if (!session) {
          failures.push(`sessao esperada para ${maskPhone(test.phone || BOT_TEST_ADMIN_PHONE)} nao encontrada`);
        } else if (session.fazenda_id !== expected.sessionFarmId) {
          failures.push(`sessao com fazenda_id esperado ${expected.sessionFarmId}, recebido ${session.fazenda_id}`);
        }
      }

      if (expected.shouldNotWriteBusiness !== false && trace.businessWrites.length) {
        failures.push(`dry-run gerou escrita de negocio: ${trace.businessWrites.map((write) => `${write.tableName}:${write.action}`).join(", ")}`);
      }

      if (expected.allowSchemaErrors !== true && trace.schemaErrors?.length) {
        failures.push(`consulta/payload com coluna inexistente: ${trace.schemaErrors.map((error) => `${error.tableName}:${error.action}:${error.message}`).join("; ")}`);
      }

      if (expected.detectStuck !== false) failures.push(...detectStuckFlow(trace.steps));

      return failures;
    }

    async function runStructuredEvaluationCase(test, index) {
      const supabase = createSupabaseForScenario(test);
      activeBotTestSupabase = supabase;
      const steps = [];
      const failures = [];

      try {
        for (let messageIndex = 0; messageIndex < test.messages.length; messageIndex += 1) {
          const message = test.messages[messageIndex];
          const text = typeof message === "string" ? message : message.text;
          const modoTeste = typeof message === "object" && "modoTeste" in message ? Boolean(message.modoTeste) : true;
          const salvarReal = typeof message === "object" && "salvarReal" in message ? Boolean(message.salvarReal) : false;
          const beforeBusinessWrites = supabase.businessWrites().length;
          const result = await processWhatsappMessage({
            telefone: test.phone || BOT_TEST_ADMIN_PHONE,
            mensagem: text,
            provider: "simulador",
            modoTeste,
            salvarReal,
            messageSid: `bot-eval-${index + 1}-${messageIndex + 1}`
          });
          const businessWritesDelta = supabase.businessWrites().slice(beforeBusinessWrites);
          const simulatedSaveActions = simulatedSaveActionsForResult(result, test.phone || BOT_TEST_ADMIN_PHONE);
          steps.push({ text, result, businessWritesDelta, simulatedSaveActions });

          if (BOT_TEST_VERBOSE) {
            console.log("[BOT EVAL STEP]", JSON.stringify({
              test: test.name,
              message: text,
              intent: result.intencaoDetectada,
              estado: result.estadoNovo,
              missing: result.camposFaltantes,
              simulatedSaveActions
            }));
          }
        }

        const trace = {
          steps,
          writes: clone(supabase.writes),
          businessWrites: supabase.businessWrites(),
          simulatedSaveActions: steps.flatMap((step) => step.simulatedSaveActions),
          schemaErrors: clone(supabase.schemaErrors),
          sessions: clone(supabase.tables[BOT_TEST_TABLES.whatsappSessoes])
        };
        failures.push(...evaluateStructuredCase(test, trace));

        return {
          index,
          kind: "framework",
          module: test.module || "geral",
          test,
          steps,
          businessWrites: trace.businessWrites,
          simulatedSaveActions: trace.simulatedSaveActions,
          schemaErrors: trace.schemaErrors,
          ok: failures.length === 0,
          failures
        };
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
        return {
          index,
          kind: "framework",
          module: test.module || "geral",
          test,
          steps,
          writes: clone(supabase.writes),
          businessWrites: supabase.businessWrites(),
          simulatedSaveActions: steps.flatMap((step) => step.simulatedSaveActions),
          schemaErrors: clone(supabase.schemaErrors),
          ok: false,
          failures
        };
      } finally {
        activeBotTestSupabase = null;
      }
    }

    async function runConversationTest(test, index) {
      const supabase = createSupabaseForScenario(test);
      activeBotTestSupabase = supabase;
      const steps = [];
      const failures = [];

      for (let messageIndex = 0; messageIndex < test.messages.length; messageIndex += 1) {
        const step = test.messages[messageIndex];
        const result = await processWhatsappMessage({
          telefone: test.phone,
          mensagem: step.text,
          provider: "simulador",
          modoTeste: true,
          salvarReal: false,
          messageSid: `bot-test-${index + 1}-${messageIndex + 1}`
        });
        const stepFailures = assertProcessResult(step.expected, result);
        if (stepFailures.length) {
          failures.push(`mensagem ${messageIndex + 1} (${step.text}): ${stepFailures.join("; ")}`);
        }
        steps.push({ text: step.text, result });
      }

      const businessWrites = supabase.businessWrites();
      if (test.expectNoBusinessWrites && businessWrites.length) {
        failures.push(`dry-run gerou escrita de negocio: ${businessWrites.map((write) => `${write.tableName}:${write.action}`).join(", ")}`);
      }

      activeBotTestSupabase = null;
      return {
        index,
        test,
        steps,
        businessWrites,
        ok: failures.length === 0,
        failures
      };
    }

    const allTests = [
      ...mandatoryTests,
      ...extraTests,
      ...regressionTests,
      ...consultationParserTests,
      ...herdLotParserTests,
      ...decimalRegressionTests,
      ...(typeof geminiFallbackDecisionTests !== "undefined" ? geminiFallbackDecisionTests : []),
      ...financeHumanParserTests,
      ...inventoryHumanParserTests,
      ...productionRobustnessTests,
      ...animalConsultationAndUpdateTests,
      ...eventHumanParserTests,
      ...genealogyParserTests,
      ...employeePointPayrollParserTests,
      ...(typeof tabularImportParserTests !== "undefined" ? tabularImportParserTests : [])
    ];

    if (allTests.length < 90) {
      console.error(`Erro interno do test:bot: esperado ao menos 90 testes, recebido ${allTests.length}.`);
      process.exit(1);
    }

    const parserResults = allTests.map((test, index) => {
      try {
        const parsed = test.pending ? resolveParsed(mergeRanchoMessageData(test.pending(), test.phrase)) : parseResolved(test.phrase);
        const denied = adminActionDenied(test, parsed);
        if (test.expected?.responseIncludes) {
          const ok = denied && normalize(denied).includes(normalize(test.expected.responseIncludes));
          return {
            index: index + 1,
            test,
            parsed,
            response: denied,
            ok,
            failures: ok ? [] : [`resposta esperada contendo ${test.expected.responseIncludes}, recebida ${denied || "nenhuma"}`]
          };
        }
        const failures = denied ? [`ação bloqueada para ${test.actor}: ${denied}`] : assertExpected(test, parsed);
        return { index: index + 1, test, parsed, ok: failures.length === 0, failures };
      } catch (error) {
        return { index: index + 1, test, parsed: null, ok: false, failures: [error instanceof Error ? error.message : String(error)] };
      }
    });

    const animalResults = animalStatusTests.map((test, index) => {
      const blocked = isAnimalInactiveForBot(test.animal);
      const response = blocked ? animalBlockedMessage(test.animal, test.intent) : "";
      const ok = test.allowed ? !blocked : blocked && normalize(response).includes(normalize(test.responseIncludes));
      return {
        index: allTests.length + index + 1,
        test,
        parsed: null,
        response,
        ok,
        failures: ok ? [] : [`status animal falhou: blocked=${blocked}, response=${response}`]
      };
    });

    const securityUtilityTests = [
      {
        name: "logs: telefone, cpf, email e token sao mascarados",
        module: "seguranca-logs",
        run() {
          const text = redactSensitiveText("telefone whatsapp:+55 (83) 99673-2761 cpf 123.456.789-09 email henrique@rancho.com token eyJabcdefghijklmnopqrstuvwxyz123456");
          const failures = [];
          for (const forbidden of ["99673-2761", "123.456.789-09", "henrique@rancho.com", "eyJabcdefghijklmnopqrstuvwxyz123456"]) {
            if (text.includes(forbidden)) failures.push(`valor sensivel nao mascarado: ${forbidden}`);
          }
          if (!text.includes("+55******2761")) failures.push("telefone nao foi mascarado no formato esperado");
          if (!text.includes("***.***.***-09")) failures.push("cpf nao foi mascarado no formato esperado");
          if (!text.includes("he***@rancho.com")) failures.push("email nao foi mascarado no formato esperado");
          if (!text.includes("[redacted]")) failures.push("token nao foi redigido");
          return failures;
        }
      },
      {
        name: "logs: safeErrorText nao expoe erro tecnico sensivel",
        module: "seguranca-logs",
        run() {
          const text = safeErrorText(new Error("Authorization: Bearer eyJabcdefghijklmnopqrstuvwxyz123456 telefone 5583996732761 password=abc123"));
          const failures = [];
          for (const forbidden of ["eyJabcdefghijklmnopqrstuvwxyz123456", "5583996732761", "password=abc123"]) {
            if (text.includes(forbidden)) failures.push(`erro sensivel nao mascarado: ${forbidden}`);
          }
          if (!text.includes("+55******2761")) failures.push("telefone do erro nao foi mascarado");
          if (!text.includes("[redacted]")) failures.push("token/senha do erro nao foram redigidos");
          return failures;
        }
      },
      {
        name: "logs: mascaramento direto de telefone whatsapp",
        module: "seguranca-logs",
        run() {
          const received = maskSensitivePhone("whatsapp:+55 (83) 99673-2761");
          return received === "+55******2761" ? [] : [`telefone mascarado esperado +55******2761, recebido ${received}`];
        }
      }
    ];

    const securityUtilityResults = securityUtilityTests.map((test, index) => {
      const failures = test.run();
      return {
        index: allTests.length + animalResults.length + index + 1,
        kind: "security-utility",
        module: test.module,
        test,
        ok: failures.length === 0,
        failures
      };
    });


    return { assertProcessResult, createSupabaseForScenario, materializeInitialSession, seedInitialSession, simulatedSaveActionsForResult, maskPhone, farmIdForPhone, hasAskedConfirmation, hasAskedFollowUp, firstConfirmationIndex, sameValue, actionPayloadHas, uniqueActionKey, detectStuckFlow, evaluateStructuredCase, runStructuredEvaluationCase, runConversationTest, allTests, parserResults, animalResults, securityUtilityTests, securityUtilityResults };
  }
};
