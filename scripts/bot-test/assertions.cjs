module.exports = function loadBotTestSection(context) {
  with (context) {
    const animalStatusTests = [
      { name: "bloqueia producao para animal morto", animal: { id: "animal-morto", brinco: "M-001", status: "morto" }, intent: "PRODUCAO_LEITE", responseIncludes: "morto/inativo" },
      { name: "bloqueia vacina para animal inativo", animal: { id: "animal-inativo", brinco: "I-001", status: "inativo" }, intent: "VACINA_MEDICAMENTO", responseIncludes: "vacina ou medicamento" },
      { name: "permite registro para animal ativo", animal: { id: "animal-ativo", brinco: "A-001", status: "ativo" }, intent: "PRODUCAO_LEITE", allowed: true }
    ];

    function hasValue(value) {
      return value !== undefined && value !== null && value !== "";
    }

    function normalize(value) {
      return normalizeCatalogText(String(value ?? ""));
    }

    function parseResolved(phrase) {
      return resolveParsed(parseRanchoMessage(phrase));
    }

    function resolveParsed(parsed) {
      const dados = { ...(parsed.dados || {}) };

      if (parsed.tipo === "LOTE_REGISTROS" && Array.isArray(dados.registros)) {
        dados.registros = dados.registros.map((registro) => resolveParsed(registro));
        return refreshRanchoMessage(parsed, dados);
      }

      if (["PRODUCAO_LEITE", "PARTO", "VACINA_MEDICAMENTO", "MORTE", "ATUALIZACAO_ANIMAL", "CONSULTA_ANIMAL", "ATUALIZACAO_GENEALOGIA", "CONSULTA_GENEALOGIA"].includes(parsed.tipo) && dados.animal_codigo) {
        const resolved = resolveAnimalIdentifier(dados.animal_codigo, mockAnimals);
        if (resolved.row && resolved.status !== "ambiguous") {
          dados.animal_codigo = resolved.row.brinco;
          dados.animal_id = resolved.row.id;
        }
      }

      if (parsed.tipo === "ATUALIZACAO_GENEALOGIA") {
        for (const field of ["mae", "pai"]) {
          const valueKey = `${field}_nome`;
          const idKey = `${field}_id`;
          if (!dados[valueKey]) continue;
          const resolved = resolveAnimalIdentifier(dados[valueKey], mockAnimals);
          if (resolved.row && resolved.status !== "ambiguous") {
            dados[idKey] = resolved.row.id;
            dados[valueKey] = resolved.row.nome && resolved.row.nome !== resolved.row.brinco
              ? `${resolved.row.nome} (${resolved.row.brinco})`
              : resolved.row.brinco;
          }
        }
      }

      if (["ESTOQUE_ENTRADA", "ESTOQUE_SAIDA", "CONSULTA_ESTOQUE", "CONSULTA_ESTOQUE_ITEM"].includes(parsed.tipo) && dados.item_nome) {
        const itemExtraido = dados.item_nome;
        const resolved = resolveStockItem(itemExtraido, mockStock);
        dados.item_extraido = itemExtraido;
        dados.item_normalizado = normalizeCatalogText(itemExtraido);
        dados.origem_catalogo = "mock";
        dados.quantidade_itens_catalogo = mockStock.length;
        dados.candidatos_catalogo = (resolved.rows?.length ? resolved.rows : resolved.row ? [resolved.row] : mockStock.slice(0, 8)).map((row) => row.nome);
        dados.status_resolucao = resolved.status;
        dados.score_resolucao = Number(resolved.score.toFixed(3));
        dados.item_estoque_encontrado = Boolean(resolved.row && resolved.status !== "ambiguous" && resolved.score >= 0.86);
        dados.motivo_processamento = parsed.tipo === "ESTOQUE_ENTRADA" && dados.compra
          ? dados.item_estoque_encontrado ? "item_encontrado: estoque+financeiro" : "item_nao_encontrado: fluxo_criar_item_ou_financeiro"
          : parsed.tipo === "ESTOQUE_SAIDA" && dados.venda
            ? dados.item_estoque_encontrado ? "item_encontrado: perguntar_baixa_estoque_ou_financeiro" : "item_nao_encontrado: financeiro_apenas"
            : dados.item_estoque_encontrado ? "item_encontrado" : "item_nao_encontrado";

        if (resolved.row && resolved.status !== "ambiguous" && resolved.score >= 0.86) {
          dados.item_nome = resolved.row.nome;
          dados.item_id = resolved.row.id;
          dados.item_resolvido = resolved.row.nome;
        } else {
          dados.item_resolvido = null;
          dados.item_id = null;
        }
      }

      return refreshRanchoMessage(parsed, dados);
    }

    function pendingFrom(phrase, replies = []) {
      return replies.reduce((current, reply) => resolveParsed(mergeRanchoMessageData(current, reply)), parseResolved(phrase));
    }

    function canonicalIntent(tipo, dados) {
      if (tipo === "VACINA" || tipo === "TRATAMENTO") return "VACINA_MEDICAMENTO";
      if (tipo === "ENTRADA_ESTOQUE" || tipo === "COMPRA_ESTOQUE") return "ESTOQUE_ENTRADA";
      if (tipo === "SAIDA_ESTOQUE") return "ESTOQUE_SAIDA";
      if (tipo === "CONSULTA_ESTOQUE_ITEM") return "CONSULTA_ESTOQUE";
      if (tipo === "CONSULTA_ESTOQUE_GERAL") return "CONSULTA_ESTOQUE";
      if (tipo === "CRIAR_ITEM_ESTOQUE") return "CRIAR_ITEM_ESTOQUE";
      if (tipo === "ESTOQUE_CADASTRO") return "CRIAR_ITEM_ESTOQUE";
      return tipo;
    }

    function missingContains(parsed, field) {
      const text = normalize(parsed.perguntas_faltantes.join(" "));
      const checks = {
        animal_codigo: /animal|brinco/.test(text),
        litros: /litro/.test(text),
        quantidade: /quantidade/.test(text),
        unidade: /unidade/.test(text),
        produto: /medicamento|vacina|manejo|produto/.test(text),
        valor: /valor|custou/.test(text),
        descricao: /descri|descricao|registro/.test(text),
        telefone: /whatsapp|ddd/.test(text),
        funcionario_nome: /funcionario|funcion/.test(text),
        item_nome: /item|estoque/.test(text),
        sexo: /sexo|femea|macho/.test(text),
        fase: /fase|lactacao|gestante|seca|vazia|crescimento|engorda/.test(text),
        raca: /raca/.test(text),
        lote_animal: /lote/.test(text),
        lote_nome: /lote/.test(text),
        data_nascimento: /nascimento|data/.test(text),
        campo_alterado: /dado|atualizar/.test(text),
        novo_valor: /valor|cadastro/.test(text),
        horario: /horario|horario|7:30|17:00/.test(text),
        mae_nome: /mae|mãe/.test(text),
        pai_nome: /pai/.test(text),
        genealogia_campo: /mae|mãe|pai|genealogia/.test(text),
        whatsapp: /whatsapp|ddd/.test(text),
        funcao: /funcao|cargo/.test(text),
        data: /admissao|data/.test(text),
        data_admissao: /admissao|data/.test(text),
        funcionario: /funcionario|funcion/.test(text)
      };
      return Boolean(checks[field]);
    }

    function assertExpected(test, parsed) {
      const failures = [];
      const dados = parsed.dados || {};
      const expected = test.expected || {};

      if (expected.exactTipo && expected.tipo && parsed.tipo !== expected.tipo) {
        failures.push(`tipo exato esperado ${expected.tipo}, recebido ${parsed.tipo}`);
      } else if (expected.tipo && canonicalIntent(parsed.tipo, dados) !== canonicalIntent(expected.tipo, expected)) {
        failures.push(`tipo esperado ${expected.tipo}, recebido ${parsed.tipo}`);
      }

      if (expected.compra && !dados.compra) failures.push("esperava compra=true");
      if (expected.venda && !dados.venda) failures.push("esperava venda=true");
      if ("registro_evento_animal" in expected && Boolean(dados.registro_evento_animal) !== Boolean(expected.registro_evento_animal)) failures.push(`registro_evento_animal esperado ${expected.registro_evento_animal}, recebido ${dados.registro_evento_animal}`);
      if (expected.evento_tipo && normalize(dados.evento_tipo) !== normalize(expected.evento_tipo)) failures.push(`evento_tipo esperado ${expected.evento_tipo}, recebido ${dados.evento_tipo}`);
      if (expected.animal && normalize(dados.animal_codigo) !== normalize(expected.animal)) failures.push(`animal esperado ${expected.animal}, recebido ${dados.animal_codigo}`);
      if (expected.animalAny && !expected.animalAny.map(normalize).includes(normalize(dados.animal_codigo))) failures.push(`animal esperado um de ${expected.animalAny.join(", ")}, recebido ${dados.animal_codigo}`);
      if (expected.notAnimal && normalize(dados.animal_codigo) === normalize(expected.notAnimal)) failures.push(`animal nao deveria ser ${expected.notAnimal}`);
      if (expected.animalId && dados.animal_id !== expected.animalId) failures.push(`animal_id esperado ${expected.animalId}, recebido ${dados.animal_id}`);
      if (expected.categoria && normalize(dados.categoria) !== normalize(expected.categoria)) failures.push(`categoria esperada ${expected.categoria}, recebida ${dados.categoria}`);
      if (expected.nome && normalize(dados.nome) !== normalize(expected.nome)) failures.push(`nome esperado ${expected.nome}, recebido ${dados.nome}`);
      if (expected.modo && normalize(dados.modo) !== normalize(expected.modo)) failures.push(`modo esperado ${expected.modo}, recebido ${dados.modo}`);
      if (expected.sexo && normalize(dados.sexo) !== normalize(expected.sexo)) failures.push(`sexo esperado ${expected.sexo}, recebido ${dados.sexo}`);
      if (expected.status && normalize(dados.status) !== normalize(expected.status)) failures.push(`status esperado ${expected.status}, recebido ${dados.status}`);
      if ("sem_lote" in expected && Boolean(dados.sem_lote) !== Boolean(expected.sem_lote)) failures.push(`sem_lote esperado ${expected.sem_lote}, recebido ${dados.sem_lote}`);
      if ("pagina" in expected && Number(dados.pagina) !== Number(expected.pagina)) failures.push(`pagina esperada ${expected.pagina}, recebida ${dados.pagina}`);
      if (expected.fase && normalize(dados.fase) !== normalize(expected.fase)) failures.push(`fase esperada ${expected.fase}, recebida ${dados.fase}`);
      if (expected.raca && normalize(dados.raca) !== normalize(expected.raca)) failures.push(`raca esperada ${expected.raca}, recebida ${dados.raca}`);
      if (expected.lote && normalize(dados.lote_nome) !== normalize(expected.lote)) failures.push(`lote esperado ${expected.lote}, recebido ${dados.lote_nome}`);
      if (expected.loteId && dados.lote_id !== expected.loteId) failures.push(`lote_id esperado ${expected.loteId}, recebido ${dados.lote_id}`);
      if (expected.data_nascimento && dados.data_nascimento !== expected.data_nascimento) failures.push(`data_nascimento esperada ${expected.data_nascimento}, recebida ${dados.data_nascimento}`);
      if (expected.data_referencia && dados.data_referencia !== expected.data_referencia) failures.push(`data_referencia esperada ${expected.data_referencia}, recebida ${dados.data_referencia}`);
      if (expected.turno && normalize(dados.turno) !== normalize(expected.turno)) failures.push(`turno esperado ${expected.turno}, recebido ${dados.turno}`);
      if ("peso" in expected && Number(dados.peso) !== Number(expected.peso)) failures.push(`peso esperado ${expected.peso}, recebido ${dados.peso}`);
      if (expected.campo_alterado && normalize(dados.campo_alterado) !== normalize(expected.campo_alterado)) failures.push(`campo_alterado esperado ${expected.campo_alterado}, recebido ${dados.campo_alterado}`);
      if ("novo_valor" in expected && normalize(dados.novo_valor) !== normalize(expected.novo_valor)) failures.push(`novo_valor esperado ${expected.novo_valor}, recebido ${dados.novo_valor}`);
      if (expected.novoValorIncludes && !normalize(dados.novo_valor).includes(normalize(expected.novoValorIncludes))) failures.push(`novo_valor deveria conter ${expected.novoValorIncludes}, recebido ${dados.novo_valor}`);
      if ("consulta" in expected && Boolean(dados.consulta) !== Boolean(expected.consulta)) failures.push(`consulta esperada ${expected.consulta}, recebida ${dados.consulta}`);
      if (expected.consulta_registros && normalize(dados.consulta_registros) !== normalize(expected.consulta_registros)) failures.push(`consulta_registros esperada ${expected.consulta_registros}, recebida ${dados.consulta_registros}`);
      if (expected.consulta_producao && normalize(dados.consulta_producao) !== normalize(expected.consulta_producao)) failures.push(`consulta_producao esperada ${expected.consulta_producao}, recebida ${dados.consulta_producao}`);
      if (expected.relatorio_modo && normalize(dados.relatorio_modo) !== normalize(expected.relatorio_modo)) failures.push(`relatorio_modo esperado ${expected.relatorio_modo}, recebido ${dados.relatorio_modo}`);
      if (expected.relatorio_tipo && normalize(dados.relatorio_tipo) !== normalize(expected.relatorio_tipo)) failures.push(`relatorio_tipo esperado ${expected.relatorio_tipo}, recebido ${dados.relatorio_tipo}`);
      if (expected.financeiro_modo && normalize(dados.financeiro_modo) !== normalize(expected.financeiro_modo)) failures.push(`financeiro_modo esperado ${expected.financeiro_modo}, recebido ${dados.financeiro_modo}`);
      if (expected.financeiro_tipo && normalize(dados.financeiro_tipo) !== normalize(expected.financeiro_tipo)) failures.push(`financeiro_tipo esperado ${expected.financeiro_tipo}, recebido ${dados.financeiro_tipo}`);
      if (expected.filtro_texto && normalize(dados.filtro_texto) !== normalize(expected.filtro_texto)) failures.push(`filtro_texto esperado ${expected.filtro_texto}, recebido ${dados.filtro_texto}`);
      if ("litros" in expected && Number(dados.litros) !== Number(expected.litros)) failures.push(`litros esperado ${expected.litros}, recebido ${dados.litros}`);
      if (expected.produto && normalize(dados.produto) !== normalize(expected.produto)) failures.push(`produto esperado ${expected.produto}, recebido ${dados.produto}`);
      if (expected.item && normalize(dados.item_nome) !== normalize(expected.item)) failures.push(`item esperado ${expected.item}, recebido ${dados.item_nome}`);
      if (expected.itemAny && !expected.itemAny.map(normalize).includes(normalize(dados.item_nome))) failures.push(`item esperado um de ${expected.itemAny.join(", ")}, recebido ${dados.item_nome}`);
      if (expected.normalizedItem && normalize(dados.item_normalizado) !== normalize(expected.normalizedItem)) failures.push(`item normalizado esperado ${expected.normalizedItem}, recebido ${dados.item_normalizado}`);
      if (expected.itemId && dados.item_id !== expected.itemId) failures.push(`item_id esperado ${expected.itemId}, recebido ${dados.item_id}`);
      if (expected.catalogSource && normalize(dados.origem_catalogo) !== normalize(expected.catalogSource)) failures.push(`origem_catalogo esperado ${expected.catalogSource}, recebido ${dados.origem_catalogo}`);
      if ("itemFound" in expected && Boolean(dados.item_estoque_encontrado) !== Boolean(expected.itemFound)) failures.push(`item_estoque_encontrado esperado ${expected.itemFound}, recebido ${dados.item_estoque_encontrado}`);
      if (expected.motivoIncludes && !normalize(dados.motivo_processamento).includes(normalize(expected.motivoIncludes))) failures.push(`motivo esperado contendo ${expected.motivoIncludes}, recebido ${dados.motivo_processamento}`);
      if ("quantidade" in expected && Number(dados.quantidade) !== Number(expected.quantidade)) failures.push(`quantidade esperada ${expected.quantidade}, recebida ${dados.quantidade}`);
      if (expected.unidade && normalize(dados.unidade) !== normalize(expected.unidade)) failures.push(`unidade esperada ${expected.unidade}, recebida ${dados.unidade}`);
      if ("valor" in expected && Number(dados.valor) !== Number(expected.valor)) failures.push(`valor esperado ${expected.valor}, recebido ${dados.valor}`);
      if ("notValor" in expected && Number(dados.valor) === Number(expected.notValor)) failures.push(`valor nao deveria ser ${expected.notValor}`);
      if (expected.descricao && !normalize(dados.descricao).includes(normalize(expected.descricao))) failures.push(`descrição esperada ${expected.descricao}, recebida ${dados.descricao}`);
      if (expected.funcionario_nome && normalize(dados.funcionario_nome) !== normalize(expected.funcionario_nome)) failures.push(`funcionário esperado ${expected.funcionario_nome}, recebido ${dados.funcionario_nome}`);
      if (expected.telefone && normalizeWhatsappNumber(dados.telefone) !== expected.telefone) failures.push(`telefone esperado ${expected.telefone}, recebido ${dados.telefone}`);
      if ("salario_base" in expected && Number(dados.salario_base) !== Number(expected.salario_base)) failures.push(`salario_base esperado ${expected.salario_base}, recebido ${dados.salario_base}`);
      if (expected.cpf && String(dados.cpf || "").replace(/\D/g, "") !== String(expected.cpf).replace(/\D/g, "")) failures.push(`cpf esperado ${expected.cpf}, recebido ${dados.cpf}`);
      if (expected.tipo_acesso && normalize(dados.tipo_acesso) !== normalize(expected.tipo_acesso)) failures.push(`tipo_acesso esperado ${expected.tipo_acesso}, recebido ${dados.tipo_acesso}`);
      if (expected.consulta_campo && normalize(dados.consulta_campo) !== normalize(expected.consulta_campo)) failures.push(`consulta_campo esperado ${expected.consulta_campo}, recebido ${dados.consulta_campo}`);
      if (expected.consulta_genealogia && normalize(dados.consulta_genealogia) !== normalize(expected.consulta_genealogia)) failures.push(`consulta_genealogia esperado ${expected.consulta_genealogia}, recebido ${dados.consulta_genealogia}`);
      if (expected.genealogia_campo && normalize(dados.genealogia_campo) !== normalize(expected.genealogia_campo)) failures.push(`genealogia_campo esperado ${expected.genealogia_campo}, recebido ${dados.genealogia_campo}`);
      if (expected.mae_nome && !normalize(dados.mae_nome).includes(normalize(expected.mae_nome))) failures.push(`mae_nome esperado ${expected.mae_nome}, recebido ${dados.mae_nome}`);
      if (expected.pai_nome && !normalize(dados.pai_nome).includes(normalize(expected.pai_nome))) failures.push(`pai_nome esperado ${expected.pai_nome}, recebido ${dados.pai_nome}`);
      if (expected.maeId && dados.mae_id !== expected.maeId) failures.push(`mae_id esperado ${expected.maeId}, recebido ${dados.mae_id}`);
      if (expected.paiId && dados.pai_id !== expected.paiId) failures.push(`pai_id esperado ${expected.paiId}, recebido ${dados.pai_id}`);
      if ("remover_mae" in expected && Boolean(dados.remover_mae) !== Boolean(expected.remover_mae)) failures.push(`remover_mae esperado ${expected.remover_mae}, recebido ${dados.remover_mae}`);
      if ("remover_pai" in expected && Boolean(dados.remover_pai) !== Boolean(expected.remover_pai)) failures.push(`remover_pai esperado ${expected.remover_pai}, recebido ${dados.remover_pai}`);
      if ("agora" in expected && Boolean(dados.agora) !== Boolean(expected.agora)) failures.push(`agora esperado ${expected.agora}, recebido ${dados.agora}`);
      if (expected.ponto_tipo && dados.ponto_tipo !== expected.ponto_tipo) failures.push(`ponto_tipo esperado ${expected.ponto_tipo}, recebido ${dados.ponto_tipo}`);
      if (expected.horario && dados.horario !== expected.horario) failures.push(`horário esperado ${expected.horario}, recebido ${dados.horario}`);
      if (expected.destino && normalize(dados.destino) !== normalize(expected.destino)) failures.push(`destino esperado ${expected.destino}, recebido ${dados.destino}`);
      if (expected.local && normalize(dados.local) !== normalize(expected.local)) failures.push(`local esperado ${expected.local}, recebido ${dados.local}`);
      if (expected.itemUnresolved && dados.item_id) failures.push(`item deveria ficar sem resolução oficial, recebeu item_id ${dados.item_id}`);
      if (expected.resumoIncludes && !normalize(parsed.resumo).includes(normalize(expected.resumoIncludes))) failures.push(`resumo deveria conter "${expected.resumoIncludes}", recebeu "${parsed.resumo}"`);
      if ("registros" in expected) {
        const registros = Array.isArray(dados.registros) ? dados.registros : [];
        if (registros.length !== expected.registros) failures.push(`registros esperados ${expected.registros}, recebidos ${registros.length}`);
      }
      if ("total_litros" in expected && Number(dados.total_litros) !== Number(expected.total_litros)) failures.push(`total_litros esperado ${expected.total_litros}, recebido ${dados.total_litros}`);
      if (expected.registroTipos) {
        const tipos = Array.isArray(dados.registros) ? dados.registros.map((registro) => registro.tipo) : [];
        const missingTipos = expected.registroTipos.filter((tipo) => !tipos.includes(tipo));
        if (missingTipos.length) failures.push(`tipos de lote faltando: ${missingTipos.join(", ")}`);
      }
      if ("total_linhas" in expected && Number(dados.total_linhas) !== Number(expected.total_linhas)) failures.push(`total_linhas esperado ${expected.total_linhas}, recebido ${dados.total_linhas}`);
      if ("total_linhas_parse_validas" in expected && Number(dados.total_linhas_parse_validas) !== Number(expected.total_linhas_parse_validas)) failures.push(`total_linhas_parse_validas esperado ${expected.total_linhas_parse_validas}, recebido ${dados.total_linhas_parse_validas}`);
      if ("total_linhas_parse_invalidas" in expected && Number(dados.total_linhas_parse_invalidas) !== Number(expected.total_linhas_parse_invalidas)) failures.push(`total_linhas_parse_invalidas esperado ${expected.total_linhas_parse_invalidas}, recebido ${dados.total_linhas_parse_invalidas}`);
      if (expected.tableRow) {
        const rows = Array.isArray(dados.linhas) ? dados.linhas : [];
        const row = rows.find((item) => Number(item.lineNumber) === Number(expected.tableRow.lineNumber))
          || rows[Number(expected.tableRow.index || 0)];
        if (!row) {
          failures.push(`linha de tabela esperada nao encontrada: ${JSON.stringify(expected.tableRow)}`);
        } else {
          if (expected.tableRow.animal && normalize(row.animal_codigo) !== normalize(expected.tableRow.animal)) failures.push(`linha tabela animal esperado ${expected.tableRow.animal}, recebido ${row.animal_codigo}`);
          if (expected.tableRow.evento_tipo && normalize(row.evento_tipo) !== normalize(expected.tableRow.evento_tipo)) failures.push(`linha tabela evento esperado ${expected.tableRow.evento_tipo}, recebido ${row.evento_tipo}`);
          if (expected.tableRow.data_referencia && row.data_referencia !== expected.tableRow.data_referencia) failures.push(`linha tabela data esperada ${expected.tableRow.data_referencia}, recebida ${row.data_referencia}`);
          if (expected.tableRow.observacoes && !normalize(row.observacoes).includes(normalize(expected.tableRow.observacoes))) failures.push(`linha tabela observacao esperada ${expected.tableRow.observacoes}, recebida ${row.observacoes}`);
          if (expected.tableRow.nome && normalize(row.nome) !== normalize(expected.tableRow.nome)) failures.push(`linha tabela nome esperado ${expected.tableRow.nome}, recebido ${row.nome}`);
          if (expected.tableRow.categoria && normalize(row.categoria) !== normalize(expected.tableRow.categoria)) failures.push(`linha tabela categoria esperada ${expected.tableRow.categoria}, recebida ${row.categoria}`);
          if (expected.tableRow.sexo && normalize(row.sexo) !== normalize(expected.tableRow.sexo)) failures.push(`linha tabela sexo esperado ${expected.tableRow.sexo}, recebido ${row.sexo}`);
          if (expected.tableRow.raca && normalize(row.raca) !== normalize(expected.tableRow.raca)) failures.push(`linha tabela raca esperada ${expected.tableRow.raca}, recebida ${row.raca}`);
          if (expected.tableRow.lote_nome && normalize(row.lote_nome) !== normalize(expected.tableRow.lote_nome)) failures.push(`linha tabela lote esperado ${expected.tableRow.lote_nome}, recebido ${row.lote_nome}`);
          if (expected.tableRow.status && normalize(row.status) !== normalize(expected.tableRow.status)) failures.push(`linha tabela status esperado ${expected.tableRow.status}, recebido ${row.status}`);
          if (expected.tableRow.item_nome && normalize(row.item_nome) !== normalize(expected.tableRow.item_nome)) failures.push(`linha tabela item esperado ${expected.tableRow.item_nome}, recebido ${row.item_nome}`);
          if ("quantidade" in expected.tableRow && Number(row.quantidade) !== Number(expected.tableRow.quantidade)) failures.push(`linha tabela quantidade esperada ${expected.tableRow.quantidade}, recebida ${row.quantidade}`);
          if (expected.tableRow.unidade && normalize(row.unidade) !== normalize(expected.tableRow.unidade)) failures.push(`linha tabela unidade esperada ${expected.tableRow.unidade}, recebida ${row.unidade}`);
          if (expected.tableRow.tipo_movimento && normalize(row.tipo_movimento) !== normalize(expected.tableRow.tipo_movimento)) failures.push(`linha tabela movimento esperado ${expected.tableRow.tipo_movimento}, recebido ${row.tipo_movimento}`);
          if (expected.tableRow.problem && !(Array.isArray(row.problemas) && row.problemas.includes(expected.tableRow.problem))) failures.push(`linha tabela deveria conter problema ${expected.tableRow.problem}, recebeu ${row.problemas}`);
        }
      }
      if (expected.registroDetalhes) {
        const registros = Array.isArray(dados.registros) ? dados.registros : [];
        expected.registroDetalhes.forEach((detail, index) => {
          const registro = registros[index];
          const registroDados = registro?.dados || {};
          if (!registro) {
            failures.push(`registro ${index + 1} ausente`);
            return;
          }
          if (detail.tipo && canonicalIntent(registro.tipo, registroDados) !== canonicalIntent(detail.tipo, detail)) failures.push(`registro ${index + 1}: tipo esperado ${detail.tipo}, recebido ${registro.tipo}`);
          if (detail.animal && normalize(registroDados.animal_codigo) !== normalize(detail.animal)) failures.push(`registro ${index + 1}: animal esperado ${detail.animal}, recebido ${registroDados.animal_codigo}`);
          if (detail.animalAny && !detail.animalAny.map(normalize).includes(normalize(registroDados.animal_codigo))) failures.push(`registro ${index + 1}: animal esperado um de ${detail.animalAny.join(", ")}, recebido ${registroDados.animal_codigo}`);
          if ("litros" in detail && Number(registroDados.litros) !== Number(detail.litros)) failures.push(`registro ${index + 1}: litros esperado ${detail.litros}, recebido ${registroDados.litros}`);
          if (detail.produto && normalize(registroDados.produto) !== normalize(detail.produto)) failures.push(`registro ${index + 1}: produto esperado ${detail.produto}, recebido ${registroDados.produto}`);
          if (detail.item && normalize(registroDados.item_nome) !== normalize(detail.item)) failures.push(`registro ${index + 1}: item esperado ${detail.item}, recebido ${registroDados.item_nome}`);
          if ("quantidade" in detail && Number(registroDados.quantidade) !== Number(detail.quantidade)) failures.push(`registro ${index + 1}: quantidade esperada ${detail.quantidade}, recebida ${registroDados.quantidade}`);
          if (detail.unidade && normalize(registroDados.unidade) !== normalize(detail.unidade)) failures.push(`registro ${index + 1}: unidade esperada ${detail.unidade}, recebida ${registroDados.unidade}`);
          if ("valor" in detail && Number(registroDados.valor) !== Number(detail.valor)) failures.push(`registro ${index + 1}: valor esperado ${detail.valor}, recebido ${registroDados.valor}`);
          if (detail.descricao && !normalize(registroDados.descricao).includes(normalize(detail.descricao))) failures.push(`registro ${index + 1}: descrição esperada ${detail.descricao}, recebida ${registroDados.descricao}`);
        });
      }

      for (const field of expected.missing || []) {
        if (hasValue(dados[field])) failures.push(`campo ${field} deveria estar faltando, recebido ${dados[field]}`);
        if (!missingContains(parsed, field)) failures.push(`pergunta faltante para ${field} não encontrada`);
      }

      if (expected.noMissing && parsed.perguntas_faltantes.length > 0) {
        failures.push(`não esperava pendências, recebeu: ${parsed.perguntas_faltantes.join(" | ")}`);
      }

      return failures;
    }

    function adminActionDenied(test, parsed) {
      const actor = mockUsers.find((user) => user.nome === test.actor);
      if (!actor || actor.admin) return null;
      if (["CRIAR_ITEM_ESTOQUE", "CRIAR_FUNCIONARIO", "ATUALIZAR_FUNCIONARIO", "DESLIGAR_FUNCIONARIO", "EXCLUIR_FUNCIONARIO", "ATUALIZACAO_GENEALOGIA", "CRIAR_LOTE", "CADASTRO_ANIMAL", "IMPORTACAO_ANIMAIS_TABELA"].includes(parsed.tipo)) {
        if (parsed.tipo === "ATUALIZACAO_GENEALOGIA") {
          return "Você não tem permissão para alterar genealogia pelo bot. Peça para um administrador fazer essa alteração.";
        }
        if (parsed.tipo === "CRIAR_LOTE") {
          return "Você não tem permissão para criar lotes pelo bot. Peça para um administrador fazer esse cadastro.";
        }
        if (parsed.tipo === "CADASTRO_ANIMAL" || parsed.tipo === "IMPORTACAO_ANIMAIS_TABELA") {
          return "Você não tem permissão para cadastrar animais.";
        }
        return parsed.tipo === "CRIAR_ITEM_ESTOQUE"
          ? "Você não tem permissão para criar itens de estoque. Peça para um administrador cadastrar esse item."
          : "Você não tem permissão para cadastrar funcionários pelo bot. Peça para um administrador fazer esse cadastro.";
      }
      return null;
    }


    return { animalStatusTests, hasValue, normalize, parseResolved, resolveParsed, pendingFrom, canonicalIntent, missingContains, assertExpected, adminActionDenied };
  }
};
