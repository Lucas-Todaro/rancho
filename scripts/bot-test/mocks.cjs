module.exports = function loadBotTestSection(context) {
  with (context) {
    const mockAnimals = [
      { id: "animal-b-001", brinco: "B-001", nome: "Mimosa", sexo: "femea", categoria: "vaca", fase: "lactacao" },
      { id: "animal-b-002", brinco: "B-002", nome: "Estrela", sexo: "femea", categoria: "vaca", fase: "gestante", mae_id: "animal-b-001", pai_id: "animal-t-001" },
      { id: "animal-b-003", brinco: "B-003", nome: "Princesa", sexo: "femea", categoria: "novilha", fase: "lactacao", mae_id: "animal-b-002", pai_id: "animal-t-002" },
      { id: "animal-t-001", brinco: "T-001", nome: "Touro Rei", sexo: "macho", categoria: "touro", fase: "nao_aplicavel" },
      { id: "animal-t-002", brinco: "T-002", nome: "Touro Forte", sexo: "macho", categoria: "touro", fase: "nao_aplicavel" },
      { id: "animal-a12", brinco: "A12", nome: "Bezerro A12", sexo: "macho", categoria: "bezerro", fase: "crescimento" },
      { id: "animal-vaca-15", brinco: "VACA-15", nome: "Lua", sexo: "femea", categoria: "vaca", fase: "lactacao" },
      { id: "animal-n-033", brinco: "N-033", nome: "Novilha N-033", sexo: "femea", categoria: "novilha", fase: "crescimento" },
      { id: "animal-1", brinco: "1" },
      { id: "animal-002", brinco: "002" },
      { id: "animal-2", brinco: "2" },
      { id: "animal-3", brinco: "3" },
      { id: "animal-15", brinco: "15" },
      { id: "animal-n-01", brinco: "N-01" },
      { id: "animal-malhada", brinco: "MALHADA" },
      { id: "animal-preta", brinco: "PRETA" },
      { id: "animal-kelly", brinco: "KELLY", nome: "Kelly", sexo: "femea", categoria: "vaca", fase: "lactacao" },
      { id: "animal-thais", brinco: "THAIS", nome: "Thais", sexo: "femea", categoria: "vaca", fase: "lactacao" }
    ];

    const mockStock = [
      { id: "item-racao-boi", nome: "Ração de boi" },
      { id: "item-racao", nome: "Ração" },
      { id: "item-milho", nome: "Milho" },
      { id: "item-feno", nome: "Feno" },
      { id: "item-sal-mineral", nome: "Sal mineral" },
      { id: "item-racao-especial", nome: "Ração especial" },
      { id: "item-mistura-lactacao", nome: "Mistura lactação" },
      { id: "item-nucleo-mineral", nome: "Núcleo mineral" },
      { id: "item-aftosa", nome: "Aftosa" },
      { id: "item-terramicina", nome: "Terramicina" },
      { id: "item-remedio", nome: "Remédio" },
      { id: "item-vermifugo", nome: "Vermifugo" },
      { id: "item-antibiotico", nome: "Antibiotico" },
      { id: "item-carrapaticida", nome: "Carrapaticida" },
      { id: "item-suplemento", nome: "Suplemento" },
      { id: "item-leite-cru", nome: "Leite Cru" }
    ];

    const mockUsers = [
      { nome: "Dono", telefone: "5583999999999", admin: true, fazenda_id: "mock-fazenda-1" },
      { nome: "João", telefone: "5583888888888", admin: false, fazenda_id: "mock-fazenda-1" }
    ];

    const BOT_TEST_TABLES = {
      fazendas: "fazendas",
      usuarios: "usuarios",
      lotes: "lotes",
      animais: "animais",
      eventosAnimal: "eventos_animal",
      ordenhas: "ordenhas",
      estoqueItens: "estoque_itens",
      estoqueMovimentacoes: "estoque_movimentacoes",
      transacoesFinanceiras: "transacoes_financeiras",
      funcionarios: "funcionarios",
      folhaPagamento: "folha_pagamento",
      registrosPonto: "registros_ponto",
      whatsappUsuarios: "whatsapp_usuarios",
      whatsappSessoes: "whatsapp_sessoes",
      whatsappMensagens: "whatsapp_mensagens",
      notificacoes: "notificacoes",
      auditoriaLogs: "auditoria_logs"
    };

    const BOT_TEST_BUSINESS_TABLES = new Set([
      BOT_TEST_TABLES.animais,
      BOT_TEST_TABLES.eventosAnimal,
      BOT_TEST_TABLES.ordenhas,
      BOT_TEST_TABLES.estoqueItens,
      BOT_TEST_TABLES.estoqueMovimentacoes,
      BOT_TEST_TABLES.transacoesFinanceiras,
      BOT_TEST_TABLES.funcionarios,
      BOT_TEST_TABLES.folhaPagamento,
      BOT_TEST_TABLES.registrosPonto
    ]);

    const BOT_TEST_FORBIDDEN_SELECT_COLUMNS = {
      [BOT_TEST_TABLES.estoqueMovimentacoes]: new Set(["unidade"]),
      [BOT_TEST_TABLES.whatsappMensagens]: new Set(["body"])
    };

    const BOT_TEST_FORBIDDEN_WRITE_COLUMNS = {
      [BOT_TEST_TABLES.lotes]: new Set(["created_by"]),
      [BOT_TEST_TABLES.estoqueMovimentacoes]: new Set(["unidade"]),
      [BOT_TEST_TABLES.whatsappMensagens]: new Set(["body"])
    };

    const BOT_TEST_FARM_ID = "mock-fazenda-1";
    const BOT_TEST_FARM_ID_B = "mock-fazenda-2";
    const BOT_TEST_ADMIN_PHONE = "5583999999999";
    const BOT_TEST_ADMIN_PHONE_B = "5583777777777";
    const BOT_TEST_WORKER_PHONE = "5583888888888";
    const SECURITY_OWNER_A_PHONE = "5531999990001";
    const SECURITY_ADMIN_A_PHONE = "5531999990002";
    const SECURITY_WORKER_A_PHONE = "5531999990003";
    const SECURITY_BOT_ONLY_A_PHONE = "5531999990004";
    const SECURITY_INACTIVE_A_PHONE = "5531999990005";
    const SECURITY_OWNER_B_PHONE = "5531888880001";
    const SECURITY_ADMIN_B_PHONE = "5531888880002";
    const SECURITY_WORKER_B_PHONE = "5531888880003";
    const SECURITY_BOT_ONLY_B_PHONE = "5531888880004";
    const SECURITY_INACTIVE_B_PHONE = "5531888880005";
    const SECURITY_UNAUTHORIZED_PHONE = "5531777770000";

    function clone(value) {
      return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function selectedColumnNames(columns) {
      const text = String(columns || "").trim();
      if (!text || text === "*") return [];
      return text
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const token = part.split(/\s+/)[0].replace(/^["']|["']$/g, "");
          const aliasParts = token.split(":");
          return aliasParts[aliasParts.length - 1].replace(/\(.*/, "").trim();
        })
        .filter(Boolean);
    }

    function firstForbiddenSelectColumn(tableName, columns) {
      const forbidden = BOT_TEST_FORBIDDEN_SELECT_COLUMNS[tableName];
      if (!forbidden) return null;
      return selectedColumnNames(columns).find((column) => forbidden.has(column)) || null;
    }

    function firstForbiddenWriteColumn(tableName, row) {
      const forbidden = BOT_TEST_FORBIDDEN_WRITE_COLUMNS[tableName];
      if (!forbidden || !row || typeof row !== "object") return null;
      return Object.keys(row).find((column) => forbidden.has(column)) || null;
    }

    function schemaColumnError(tableName, column) {
      return {
        code: "42703",
        message: `column ${tableName}.${column} does not exist`
      };
    }

    function stockUnitFor(name) {
      const normalizedName = normalize(name);
      if (/leite/.test(normalizedName)) return "litro";
      if (/aftosa|terramicina|vacina|vermifugo|antibiotico|carrapaticida/.test(normalizedName)) return "dose";
      if (/feno/.test(normalizedName)) return "fardo";
      if (/remedio|suplemento/.test(normalizedName)) return "unidade";
      return "kg";
    }

    function localDateOnly(offsetDays = 0) {
      const date = new Date();
      date.setDate(date.getDate() + offsetDays);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }

    function securityWhatsappUsers(overrides = []) {
      return [
        { id: "sec-wa-owner-a", fazenda_id: BOT_TEST_FARM_ID, usuario_id: "sec-user-owner-a", funcionario_id: null, telefone_e164: SECURITY_OWNER_A_PHONE, nome_exibicao: "Dono A", papel_bot: "admin", ativo: true },
        { id: "sec-wa-admin-a", fazenda_id: BOT_TEST_FARM_ID, usuario_id: "sec-user-admin-a", funcionario_id: null, telefone_e164: SECURITY_ADMIN_A_PHONE, nome_exibicao: "Admin A", papel_bot: "admin", ativo: true },
        { id: "sec-wa-worker-a", fazenda_id: BOT_TEST_FARM_ID, usuario_id: null, funcionario_id: "func-sec-joao-a", telefone_e164: SECURITY_WORKER_A_PHONE, nome_exibicao: "Funcionario A", papel_bot: "funcionario", ativo: true },
        { id: "sec-wa-bot-only-a", fazenda_id: BOT_TEST_FARM_ID, usuario_id: null, funcionario_id: "func-sec-bot-a", telefone_e164: SECURITY_BOT_ONLY_A_PHONE, nome_exibicao: "Bot Only A", papel_bot: "funcionario", ativo: true },
        { id: "sec-wa-inactive-a", fazenda_id: BOT_TEST_FARM_ID, usuario_id: null, funcionario_id: "func-sec-inativo-a", telefone_e164: SECURITY_INACTIVE_A_PHONE, nome_exibicao: "Inativo A", papel_bot: "funcionario", ativo: false },
        { id: "sec-wa-owner-b", fazenda_id: BOT_TEST_FARM_ID_B, usuario_id: "sec-user-owner-b", funcionario_id: null, telefone_e164: SECURITY_OWNER_B_PHONE, nome_exibicao: "Dono B", papel_bot: "admin", ativo: true },
        { id: "sec-wa-admin-b", fazenda_id: BOT_TEST_FARM_ID_B, usuario_id: "sec-user-admin-b", funcionario_id: null, telefone_e164: SECURITY_ADMIN_B_PHONE, nome_exibicao: "Admin B", papel_bot: "admin", ativo: true },
        { id: "sec-wa-worker-b", fazenda_id: BOT_TEST_FARM_ID_B, usuario_id: null, funcionario_id: "func-sec-joao-b", telefone_e164: SECURITY_WORKER_B_PHONE, nome_exibicao: "Funcionario B", papel_bot: "funcionario", ativo: true },
        { id: "sec-wa-bot-only-b", fazenda_id: BOT_TEST_FARM_ID_B, usuario_id: null, funcionario_id: "func-sec-bot-b", telefone_e164: SECURITY_BOT_ONLY_B_PHONE, nome_exibicao: "Bot Only B", papel_bot: "funcionario", ativo: true },
        { id: "sec-wa-inactive-b", fazenda_id: BOT_TEST_FARM_ID_B, usuario_id: null, funcionario_id: "func-sec-inativo-b", telefone_e164: SECURITY_INACTIVE_B_PHONE, nome_exibicao: "Inativo B", papel_bot: "funcionario", ativo: false },
        ...overrides
      ];
    }

    function createBotTestTables() {
      const now = new Date().toISOString();

      return {
        [BOT_TEST_TABLES.fazendas]: [
          { id: BOT_TEST_FARM_ID, ativa: true, nome: "Fazenda de teste" },
          { id: BOT_TEST_FARM_ID_B, ativa: true, nome: "Fazenda de teste B" }
        ],
        [BOT_TEST_TABLES.whatsappUsuarios]: [
          {
            id: "wa-admin",
            fazenda_id: BOT_TEST_FARM_ID,
            usuario_id: "user-admin",
            funcionario_id: null,
            telefone_e164: BOT_TEST_ADMIN_PHONE,
            nome_exibicao: "Dono",
            papel_bot: "admin",
            ativo: true
          },
          {
            id: "wa-worker",
            fazenda_id: BOT_TEST_FARM_ID,
            usuario_id: null,
            funcionario_id: "func-joao",
            telefone_e164: BOT_TEST_WORKER_PHONE,
            nome_exibicao: "Joao",
            papel_bot: "funcionario",
            ativo: true
          },
          {
            id: "wa-admin-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            usuario_id: "user-admin-b",
            funcionario_id: null,
            telefone_e164: BOT_TEST_ADMIN_PHONE_B,
            nome_exibicao: "Dono B",
            papel_bot: "admin",
            ativo: true
          },
          {
            id: "wa-worker-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            usuario_id: null,
            funcionario_id: "func-bruno-b",
            telefone_e164: "5583666666666",
            nome_exibicao: "Bruno B",
            papel_bot: "funcionario",
            ativo: true
          }
        ],
        [BOT_TEST_TABLES.whatsappSessoes]: [],
        [BOT_TEST_TABLES.whatsappMensagens]: [],
        [BOT_TEST_TABLES.usuarios]: [
          {
            id: "user-admin",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Dono",
            telefone: BOT_TEST_ADMIN_PHONE.slice(2),
            papel: "dono",
            ativo: true
          },
          {
            id: "user-worker",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Usuario comum",
            telefone: "5583777777777",
            papel: "funcionario",
            ativo: true
          },
          {
            id: "user-admin-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            nome: "Dono B",
            telefone: BOT_TEST_ADMIN_PHONE_B.slice(2),
            papel: "dono",
            ativo: true
          }
        ],
        [BOT_TEST_TABLES.lotes]: [
          {
            id: "lote-lactacao-1",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Lactacao 1",
            descricao: "Lote principal",
            ativo: true
          },
          {
            id: "lote-piquete-2",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Piquete 2",
            descricao: "Piquete de teste",
            ativo: true
          }
        ],
        [BOT_TEST_TABLES.animais]: mockAnimals.map((animal, index) => ({
          ...animal,
          fazenda_id: BOT_TEST_FARM_ID,
          nome: animal.nome || animal.brinco,
          categoria: animal.categoria || (index % 2 === 0 ? "vaca" : "boi"),
          sexo: animal.sexo || (index % 2 === 0 ? "femea" : "macho"),
          fase: animal.fase || (animal.brinco === "B-002" ? "gestante" : "lactacao"),
          status: "ativo",
          raca: "Girolando",
          lote_id: "lote-lactacao-1",
          data_nascimento: animal.brinco === "B-002" ? "2021-05-10" : null,
          peso: animal.brinco === "B-002" ? 450 : null,
          observacoes: "",
          mae_id: animal.mae_id || null,
          pai_id: animal.pai_id || null,
          genealogia_observacoes: animal.genealogia_observacoes || null
        })).concat([
          {
            id: "animal-b2-b-001",
            fazenda_id: BOT_TEST_FARM_ID_B,
            brinco: "B-001",
            nome: "Mimosa",
            categoria: "vaca",
            sexo: "femea",
            fase: "lactacao",
            status: "ativo",
            raca: "Girolando",
            lote_id: null,
            data_nascimento: null,
            peso: null,
            observacoes: "",
            mae_id: null,
            pai_id: null,
            genealogia_observacoes: null
          },
          {
            id: "animal-b2-b-002",
            fazenda_id: BOT_TEST_FARM_ID_B,
            brinco: "B-002",
            nome: "Mimosa",
            categoria: "vaca",
            sexo: "femea",
            fase: "lactacao",
            status: "ativo",
            raca: "Girolando",
            lote_id: null,
            data_nascimento: null,
            peso: null,
            observacoes: "",
            mae_id: null,
            pai_id: null,
            genealogia_observacoes: null
          },
          {
            id: "animal-b2-b-003",
            fazenda_id: BOT_TEST_FARM_ID_B,
            brinco: "B-003",
            nome: "Estrela",
            categoria: "vaca",
            sexo: "femea",
            fase: "lactacao",
            status: "ativo",
            raca: "Girolando",
            lote_id: null,
            data_nascimento: null,
            peso: null,
            observacoes: "",
            mae_id: null,
            pai_id: null,
            genealogia_observacoes: null
          },
          {
            id: "animal-b2-t-001",
            fazenda_id: BOT_TEST_FARM_ID_B,
            brinco: "T-001",
            nome: "Touro Rei",
            categoria: "touro",
            sexo: "macho",
            fase: "nao_aplicavel",
            status: "ativo",
            raca: "Girolando",
            lote_id: null,
            data_nascimento: null,
            peso: null,
            observacoes: "",
            mae_id: null,
            pai_id: null,
            genealogia_observacoes: null
          }
        ]),
        [BOT_TEST_TABLES.estoqueItens]: mockStock.map((item, index) => ({
          ...item,
          fazenda_id: BOT_TEST_FARM_ID,
          descricao: item.nome,
          categoria: "racao",
          quantidade_atual: index === 3 ? 4 : 100,
          quantidade_minima: 5,
          unidade_medida: stockUnitFor(item.nome),
          valor_unitario: index + 1,
          ativo: true
        })).concat([
          {
            id: "item-b-racao",
            fazenda_id: BOT_TEST_FARM_ID_B,
            nome: "Racao",
            descricao: "Racao",
            categoria: "racao",
            quantidade_atual: 80,
            quantidade_minima: 10,
            unidade_medida: "saco",
            valor_unitario: 120,
            ativo: true
          },
          {
            id: "item-b-aftosa",
            fazenda_id: BOT_TEST_FARM_ID_B,
            nome: "Aftosa",
            descricao: "Aftosa",
            categoria: "medicamento",
            quantidade_atual: 50,
            quantidade_minima: 5,
            unidade_medida: "dose",
            valor_unitario: 4,
            ativo: true
          }
        ]),
        [BOT_TEST_TABLES.funcionarios]: [
          {
            id: "func-joao",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Joao",
            funcao: "Ordenhador",
            cpf: "11122233344",
            contato_whatsapp: BOT_TEST_WORKER_PHONE,
            salario_base: 1800,
            tipo_acesso: "bot_only",
            ativo: true,
            deleted_at: null
          },
          {
            id: "func-bruno-a",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Bruno",
            funcao: "Vaqueiro",
            cpf: "22233344455",
            contato_whatsapp: null,
            salario_base: 1900,
            tipo_acesso: "sistema",
            ativo: true,
            deleted_at: null
          },
          {
            id: "func-bruno-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            nome: "Bruno",
            funcao: "Vaqueiro",
            cpf: "33344455566",
            contato_whatsapp: "5583666666666",
            salario_base: 2100,
            tipo_acesso: "bot_only",
            ativo: true,
            deleted_at: null
          },
          {
            id: "func-sec-joao-a",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Funcionario A",
            funcao: "Operador",
            cpf: null,
            contato_whatsapp: SECURITY_WORKER_A_PHONE,
            salario_base: 1500,
            tipo_acesso: "bot_only",
            ativo: true,
            deleted_at: null
          },
          {
            id: "func-sec-bot-a",
            fazenda_id: BOT_TEST_FARM_ID,
            nome: "Bot Only A",
            funcao: "Operador",
            cpf: null,
            contato_whatsapp: SECURITY_BOT_ONLY_A_PHONE,
            salario_base: 1500,
            tipo_acesso: "bot_only",
            ativo: true,
            deleted_at: null
          },
          {
            id: "func-sec-joao-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            nome: "Funcionario B",
            funcao: "Operador",
            cpf: null,
            contato_whatsapp: SECURITY_WORKER_B_PHONE,
            salario_base: 1500,
            tipo_acesso: "bot_only",
            ativo: true,
            deleted_at: null
          },
          {
            id: "func-sec-bot-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            nome: "Bot Only B",
            funcao: "Operador",
            cpf: null,
            contato_whatsapp: SECURITY_BOT_ONLY_B_PHONE,
            salario_base: 1500,
            tipo_acesso: "bot_only",
            ativo: true,
            deleted_at: null
          }
        ],
        [BOT_TEST_TABLES.ordenhas]: [
          {
            id: "ordenha-seed",
            fazenda_id: BOT_TEST_FARM_ID,
            animal_id: "animal-b-002",
            litros: 12,
            ordenhado_em: now
          },
          {
            id: "ordenha-seed-b",
            fazenda_id: BOT_TEST_FARM_ID_B,
            animal_id: "animal-b2-b-002",
            litros: 7,
            ordenhado_em: now
          }
        ],
        [BOT_TEST_TABLES.transacoesFinanceiras]: [
          {
            id: "financeiro-seed-entrada",
            fazenda_id: BOT_TEST_FARM_ID,
            tipo: "entrada",
            valor: 800,
            data_transacao: now.slice(0, 10)
          },
          {
            id: "financeiro-seed-saida",
            fazenda_id: BOT_TEST_FARM_ID,
            tipo: "saida",
            valor: 100,
            data_transacao: now.slice(0, 10)
          },
          {
            id: "financeiro-seed-b-entrada",
            fazenda_id: BOT_TEST_FARM_ID_B,
            tipo: "entrada",
            valor: 500,
            data_transacao: now.slice(0, 10)
          }
        ],
        [BOT_TEST_TABLES.eventosAnimal]: [],
        [BOT_TEST_TABLES.estoqueMovimentacoes]: [],
        [BOT_TEST_TABLES.registrosPonto]: [],
        [BOT_TEST_TABLES.folhaPagamento]: [],
        [BOT_TEST_TABLES.notificacoes]: [],
        [BOT_TEST_TABLES.auditoriaLogs]: []
      };
    }

    class BotTestQueryBuilder {
      constructor(db, tableName) {
        this.db = db;
        this.tableName = tableName;
        this.filters = [];
        this.rangeFilters = [];
        this.limitCount = null;
        this.orderConfig = null;
        this.operation = "select";
        this.payload = null;
        this.conflictColumns = [];
        this.forcedError = null;
      }

      select(columns = "*") {
        const forbiddenColumn = firstForbiddenSelectColumn(this.tableName, columns);
        if (forbiddenColumn) this.forcedError = schemaColumnError(this.tableName, forbiddenColumn);
        return this;
      }

      eq(field, value) {
        if (["id", "fazenda_id", "rancho_id", "usuario_id", "whatsapp_usuario_id", "funcionario_id", "animal_id", "item_id"].includes(field) && value === "") {
          this.forcedError = { message: 'invalid input syntax for type uuid: ""' };
        }
        this.filters.push((row) => row?.[field] === value || String(row?.[field]) === String(value));
        return this;
      }

      neq(field, value) {
        this.filters.push((row) => row?.[field] !== value && String(row?.[field]) !== String(value));
        return this;
      }

      is(field, value) {
        this.filters.push((row) => row?.[field] === value);
        return this;
      }

      gte(field, value) {
        this.rangeFilters.push((row) => String(row?.[field] || "") >= String(value));
        return this;
      }

      lt(field, value) {
        this.rangeFilters.push((row) => String(row?.[field] || "") < String(value));
        return this;
      }

      lte(field, value) {
        this.rangeFilters.push((row) => String(row?.[field] || "") <= String(value));
        return this;
      }

      limit(count) {
        this.limitCount = count;
        return this;
      }

      order(field, options = {}) {
        this.orderConfig = { field, ascending: options.ascending !== false };
        return this;
      }

      insert(payload) {
        this.operation = "insert";
        this.payload = Array.isArray(payload) ? payload : [payload];
        const invalidRow = this.payload.find((row) => firstForbiddenWriteColumn(this.tableName, row));
        if (invalidRow) this.forcedError = schemaColumnError(this.tableName, firstForbiddenWriteColumn(this.tableName, invalidRow));
        return this;
      }

      upsert(payload, options = {}) {
        this.operation = "upsert";
        this.payload = Array.isArray(payload) ? payload : [payload];
        const invalidRow = this.payload.find((row) => firstForbiddenWriteColumn(this.tableName, row));
        if (invalidRow) this.forcedError = schemaColumnError(this.tableName, firstForbiddenWriteColumn(this.tableName, invalidRow));
        this.conflictColumns = String(options.onConflict || "id")
          .split(",")
          .map((field) => field.trim())
          .filter(Boolean);
        return this;
      }

      update(payload) {
        this.operation = "update";
        this.payload = payload || {};
        const forbiddenColumn = firstForbiddenWriteColumn(this.tableName, this.payload);
        if (forbiddenColumn) this.forcedError = schemaColumnError(this.tableName, forbiddenColumn);
        return this;
      }

      delete() {
        this.operation = "delete";
        return this;
      }

      maybeSingle() {
        return Promise.resolve(this.execute("maybeSingle"));
      }

      single() {
        return Promise.resolve(this.execute("single"));
      }

      then(resolve, reject) {
        return Promise.resolve(this.execute()).then(resolve, reject);
      }

      catch(reject) {
        return Promise.resolve(this.execute()).catch(reject);
      }

      tableRows() {
        if (!this.db.tables[this.tableName]) this.db.tables[this.tableName] = [];
        return this.db.tables[this.tableName];
      }

      matches(row) {
        return this.filters.every((filter) => filter(row)) && this.rangeFilters.every((filter) => filter(row));
      }

      selectedRows() {
        let rows = this.tableRows().filter((row) => this.matches(row));

        if (this.orderConfig) {
          const { field, ascending } = this.orderConfig;
          rows = [...rows].sort((left, right) => {
            const leftValue = String(left?.[field] || "");
            const rightValue = String(right?.[field] || "");
            return ascending ? leftValue.localeCompare(rightValue) : rightValue.localeCompare(leftValue);
          });
        }

        if (typeof this.limitCount === "number") rows = rows.slice(0, this.limitCount);
        return rows;
      }

      withId(row) {
        return {
          id: row.id || `${this.tableName}-${nodeCrypto.randomUUID()}`,
          created_at: row.created_at || new Date().toISOString(),
          ...clone(row)
        };
      }

      executeInsert() {
        const rows = this.payload.map((row) => this.withId(row));
        this.tableRows().push(...rows);
        this.db.recordWrite(this.tableName, "insert", rows);
        return rows;
      }

      executeUpsert() {
        const rows = this.payload.map((row) => this.withId(row));
        const table = this.tableRows();
        const changed = [];

        for (const row of rows) {
          const existingIndex = table.findIndex((current) => this.conflictColumns.every((field) => (
            current?.[field] === row?.[field] || String(current?.[field]) === String(row?.[field])
          )));

          if (existingIndex >= 0) {
            table[existingIndex] = { ...table[existingIndex], ...clone(row) };
            changed.push(table[existingIndex]);
          } else {
            table.push(row);
            changed.push(row);
          }
        }

        this.db.recordWrite(this.tableName, "upsert", changed);
        return changed;
      }

      executeUpdate() {
        const changed = [];
        const table = this.tableRows();

        for (let index = 0; index < table.length; index += 1) {
          if (this.matches(table[index])) {
            table[index] = { ...table[index], ...clone(this.payload) };
            changed.push(table[index]);
          }
        }

        this.db.recordWrite(this.tableName, "update", changed);
        return changed;
      }

      executeDelete() {
        const table = this.tableRows();
        const removed = [];
        this.db.tables[this.tableName] = table.filter((row) => {
          if (!this.matches(row)) return true;
          removed.push(row);
          return false;
        });
        this.db.recordWrite(this.tableName, "delete", removed);
        return removed;
      }

      execute(singleMode) {
        if (this.forcedError) {
          this.db.recordSchemaError(this.tableName, this.operation, this.forcedError.message);
          return { data: null, error: this.forcedError };
        }
        let rows;
        if (this.operation === "insert") rows = this.executeInsert();
        else if (this.operation === "upsert") rows = this.executeUpsert();
        else if (this.operation === "update") rows = this.executeUpdate();
        else if (this.operation === "delete") rows = this.executeDelete();
        else rows = this.selectedRows();

        const data = clone(rows);
        if (singleMode === "single") {
          if (!data.length) return { data: null, error: { message: `Nenhum registro em ${this.tableName}` } };
          return { data: data[0], error: null };
        }

        if (singleMode === "maybeSingle") {
          return { data: data[0] || null, error: null };
        }

        return { data, error: null };
      }
    }

    class BotTestSupabase {
      constructor() {
        this.reset();
      }

      reset() {
        this.tables = createBotTestTables();
        this.writes = [];
        this.schemaErrors = [];
      }

      from(tableName) {
        return new BotTestQueryBuilder(this, tableName);
      }

      recordWrite(tableName, action, rows) {
        if (!rows.length) return;
        this.writes.push({
          tableName,
          action,
          count: rows.length,
          rows: clone(rows),
          business: BOT_TEST_BUSINESS_TABLES.has(tableName)
        });
      }

      recordSchemaError(tableName, action, message) {
        this.schemaErrors.push({ tableName, action, message });
      }

      businessWrites() {
        return this.writes.filter((write) => write.business);
      }
    }


    return { mockAnimals, mockStock, mockUsers, BOT_TEST_TABLES, BOT_TEST_BUSINESS_TABLES, BOT_TEST_FORBIDDEN_SELECT_COLUMNS, BOT_TEST_FORBIDDEN_WRITE_COLUMNS, BOT_TEST_FARM_ID, BOT_TEST_FARM_ID_B, BOT_TEST_ADMIN_PHONE, BOT_TEST_ADMIN_PHONE_B, BOT_TEST_WORKER_PHONE, SECURITY_OWNER_A_PHONE, SECURITY_ADMIN_A_PHONE, SECURITY_WORKER_A_PHONE, SECURITY_BOT_ONLY_A_PHONE, SECURITY_INACTIVE_A_PHONE, SECURITY_OWNER_B_PHONE, SECURITY_ADMIN_B_PHONE, SECURITY_WORKER_B_PHONE, SECURITY_BOT_ONLY_B_PHONE, SECURITY_INACTIVE_B_PHONE, SECURITY_UNAUTHORIZED_PHONE, clone, selectedColumnNames, firstForbiddenSelectColumn, firstForbiddenWriteColumn, schemaColumnError, stockUnitFor, localDateOnly, securityWhatsappUsers, createBotTestTables, BotTestQueryBuilder, BotTestSupabase };
  }
};
