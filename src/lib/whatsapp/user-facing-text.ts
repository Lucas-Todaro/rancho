const INTERNAL_CODE_LABELS: Record<string, string> = {
  animal_ambiguo: "animal ambíguo",
  animal_inativo: "animal inativo",
  animal_nao_encontrado: "animal não encontrado",
  animal_obrigatorio: "animal obrigatório",
  animal_principal_ambiguo: "animal principal ambíguo",
  animal_principal_nao_encontrado: "animal principal não encontrado",
  animal_principal_obrigatorio: "animal principal obrigatório",
  animal_sem_codigo: "animal sem código",
  categoria_ausente: "categoria ausente",
  categoria_invalida: "categoria inválida",
  ciclo_genealogico: "vínculo criaria um ciclo genealógico",
  codigo_obrigatorio: "código obrigatório",
  cpf_duplicado_no_rancho: "CPF já cadastrado no rancho",
  cpf_invalido: "CPF inválido",
  data_ausente: "data ausente",
  data_invalida: "data inválida",
  data_nascimento_invalida: "data de nascimento inválida",
  descricao_padrao_segura: "será usada uma descrição padrão",
  dose_sem_numero: "dose sem quantidade numérica",
  duplicado_na_tabela: "linha repetida na tabela",
  entrada_invalida: "horário de entrada inválido",
  entrada_ou_saida_obrigatoria: "informe um horário de entrada ou saída",
  evento_duplicado_no_rancho: "evento já cadastrado no rancho",
  evento_ou_produto_obrigatorio: "evento ou produto obrigatório",
  evento_repetido_na_tabela: "evento repetido na tabela",
  funcionario_nao_encontrado: "funcionário não encontrado",
  funcionario_obrigatorio: "funcionário obrigatório",
  item_ausente: "item não informado",
  item_nao_encontrado: "item de estoque não cadastrado",
  lote_duplicado_no_rancho: "lote já cadastrado no rancho",
  lote_nao_encontrado: "lote não encontrado",
  lote_repetido_na_tabela: "lote repetido na tabela",
  mae_ambiguo: "mãe ambígua",
  mae_igual_ao_animal: "a mãe não pode ser o próprio animal",
  mae_nao_encontrado: "mãe não encontrada",
  nome_funcionario_obrigatorio: "nome do funcionário obrigatório",
  nome_lote_obrigatorio: "nome do lote obrigatório",
  observacao_duplicada_no_rancho: "observação já cadastrada no rancho",
  observacao_obrigatoria: "observação obrigatória",
  observacao_repetida_na_tabela: "observação repetida na tabela",
  pai_ambiguo: "pai ambíguo",
  pai_igual_ao_animal: "o pai não pode ser o próprio animal",
  pai_nao_encontrado: "pai não encontrado",
  pai_ou_mae_obrigatorio: "informe o pai ou a mãe",
  peso_invalido: "peso inválido",
  ponto_duplicado_no_rancho: "registro de ponto já cadastrado no rancho",
  ponto_repetido_na_tabela: "registro de ponto repetido na tabela",
  responsavel_nao_encontrado: "responsável não encontrado",
  saida_antes_da_entrada: "o horário de saída é anterior ao de entrada",
  saida_invalida: "horário de saída inválido",
  salario_invalido: "salário inválido",
  status_invalido: "status inválido",
  tarefa_com_data_passada: "tarefa com data no passado",
  tarefa_obrigatoria: "tarefa obrigatória",
  tipo_evento_desconhecido: "tipo de evento não reconhecido",
  tipo_financeiro_invalido: "tipo financeiro inválido",
  tipo_movimento_ausente: "tipo de movimento ausente",
  tipo_movimento_desconhecido: "tipo de movimento desconhecido",
  transacao_duplicada_no_rancho: "transação já cadastrada no rancho",
  transacao_repetida_na_tabela: "transação repetida na tabela",
  unidade_ausente: "unidade ausente",
  unidade_invalida: "unidade inválida",
  valor_financeiro_invalido: "valor financeiro inválido",
  valor_invalido: "valor inválido",
  whatsapp_duplicado_no_rancho: "WhatsApp já cadastrado no rancho",
  whatsapp_invalido: "WhatsApp inválido",
  whatsapp_ja_vinculado: "WhatsApp já vinculado a outro cadastro"
};

const ORTHOGRAPHY: Record<string, string> = {
  acao: "ação",
  acoes: "ações",
  atualizacao: "atualização",
  ambiguo: "ambíguo",
  ambiguos: "ambíguos",
  basico: "básico",
  basicos: "básicos",
  codigo: "código",
  codigos: "códigos",
  confirmacao: "confirmação",
  criacao: "criação",
  critico: "crítico",
  criticos: "críticos",
  dominio: "domínio",
  dominios: "domínios",
  femea: "fêmea",
  femeas: "fêmeas",
  funcionario: "funcionário",
  funcionarios: "funcionários",
  genealogico: "genealógico",
  genealogicos: "genealógicos",
  importacao: "importação",
  importacoes: "importações",
  importavel: "importável",
  informacao: "informação",
  informacoes: "informações",
  inseminacao: "inseminação",
  lancamento: "lançamento",
  lancamentos: "lançamentos",
  lancar: "lançar",
  lanca: "lança",
  invalida: "inválida",
  invalidas: "inválidas",
  invalido: "inválido",
  invalidos: "inválidos",
  lactacao: "lactação",
  mae: "mãe",
  movimentacao: "movimentação",
  movimentacoes: "movimentações",
  nao: "não",
  observacao: "observação",
  observacoes: "observações",
  pendencia: "pendência",
  pendencias: "pendências",
  periodo: "período",
  periodos: "períodos",
  possivel: "possível",
  possiveis: "possíveis",
  previsao: "previsão",
  preview: "prévia",
  producao: "produção",
  proxima: "próxima",
  proximas: "próximas",
  proximo: "próximo",
  proximos: "próximos",
  racao: "ração",
  relatorio: "relatório",
  relatorios: "relatórios",
  reproducao: "reprodução",
  responsavel: "responsável",
  responsaveis: "responsáveis",
  saida: "saída",
  saidas: "saídas",
  salario: "salário",
  salarios: "salários",
  sanitario: "sanitário",
  saude: "saúde",
  seguranca: "segurança",
  simulacao: "simulação",
  so: "só",
  temporario: "temporário",
  temporarios: "temporários",
  transacao: "transação",
  transacoes: "transações",
  ultima: "última",
  ultimas: "últimas",
  ultimo: "último",
  ultimos: "últimos",
  valida: "válida",
  validas: "válidas",
  valido: "válido",
  validos: "válidos",
  vinculo: "vínculo",
  vinculos: "vínculos",
  voce: "você",
  ja: "já"
};

function preserveCase(source: string, replacement: string) {
  if (source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

export function userFacingCodeLabel(value: unknown) {
  const code = String(value ?? "").trim();
  if (!code) return "";
  if (INTERNAL_CODE_LABELS[code]) return INTERNAL_CODE_LABELS[code];
  return code.replace(/_/g, " ");
}

export function polishBotResponse(value: unknown) {
  let text = String(value ?? "");
  text = text
    .replace(/\b[Ee]sta correto\b/g, (phrase) => preserveCase(phrase, "está correto"))
    .replace(/\b[Ee]sta errad[oa]\b/g, (phrase) => preserveCase(phrase, "está errado"))
    .replace(/\b[Nn]ao e\b/g, (phrase) => preserveCase(phrase, "não é"))
    .replace(/\b[Nn]ao ha\b/g, (phrase) => preserveCase(phrase, "não há"))
    .replace(/\b[Qq]ual e\b/g, (phrase) => preserveCase(phrase, "qual é"))
    .replace(/\b[Ee]ntao\b/g, (word) => preserveCase(word, "então"))
    .replace(/\b[Ss]era\b/g, (word) => preserveCase(word, "será"))
    .replace(/\b[Ff]uncao\b/g, (word) => preserveCase(word, "função"))
    .replace(/\b[Aa]dmissao\b/g, (word) => preserveCase(word, "admissão"))
    .replace(/\b[Hh]istorico\b/g, (word) => preserveCase(word, "histórico"));
  text = text.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (code) => userFacingCodeLabel(code));
  text = text.replace(/\b[A-Za-zÀ-ÿ]+\b/g, (word) => {
    const replacement = ORTHOGRAPHY[word.toLowerCase()];
    return replacement ? preserveCase(word, replacement) : word;
  });
  return text;
}
