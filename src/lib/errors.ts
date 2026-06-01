type ErrorLike = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
};

function rawErrorText(error: unknown) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const item = error as ErrorLike;
    return [item.message, item.details, item.hint, item.code].filter(Boolean).join(" ");
  }
  return String(error);
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const friendlyRules: Array<[RegExp, string]> = [
  [/invalid login credentials|invalid credentials|email not confirmed/i, "E-mail ou senha incorretos."],
  [/email rate limit exceeded|over email send rate limit|rate limit|too many requests|for security purposes.*only request|429/i, "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de pedir outro e-mail."],
  [/otp expired|token.*expired|link.*expired|expired token|expired/i, "Este link expirou. Solicite um novo link e tente novamente."],
  [/invalid.*token|invalid.*link|auth session missing|session.*missing|missing.*session/i, "O link de acesso não é válido ou já foi usado. Solicite um novo link."],
  [/user already registered|already registered|email already/i, "Já existe uma conta cadastrada com este e-mail."],
  [/signup disabled|signups not allowed|email signup disabled/i, "O cadastro direto está fechado. Peça um convite ao administrador."],
  [/password should be at least|weak password|password.*characters|senha.*caracteres/i, "A senha precisa ter pelo menos 6 caracteres."],
  [/same password|new password should be different/i, "A nova senha precisa ser diferente da senha atual."],
  [/invalid email|email.*invalid/i, "Informe um e-mail válido."],
  [/failed to fetch|fetch failed|network error|networkerror/i, "Não foi possível carregar as informações. Verifique sua conexão e tente novamente."],
  [/timeout|timed out|tempo esgotado|demorou/i, "A conexão demorou para responder. Tente novamente em instantes."],
  [/unauthorized|not authorized|jwt|permission denied|forbidden/i, "Você não tem permissão para acessar esta informação."],
  [/row level security|rls|policy violation|violates row-level security/i, "Você não tem permissão para realizar esta ação."],
  [/duplicate key|unique constraint|already exists|23505/i, "Já existe um cadastro com essas informações."],
  [/foreign key|violates foreign key constraint|23503/i, "Este registro está vinculado a outras informações. Remova ou atualize os vínculos antes de excluir."],
  [/not null|null value|23502/i, "Preencha os campos obrigatórios antes de salvar."],
  [/invalid input syntax|invalid uuid|22p02/i, "Algum campo foi preenchido em formato inválido. Revise os dados e tente novamente."],
  [/column .* does not exist|relation .* does not exist|schema cache|42p01|42703/i, "O sistema precisa de uma atualização no banco de dados antes de concluir essa ação."],
  [/something went wrong/i, "Algo deu errado. Tente novamente."]
];

function looksTechnical(message: string) {
  return /supabase|postgres|sql|constraint|violates|stack|schema|relation|column|failed|unauthorized|jwt|policy|pgrst|rate limit|token|otp|auth|42p01|42703|23503|23505/i.test(message);
}

export function getFriendlyErrorMessage(error: unknown, fallback = "Algo deu errado. Tente novamente.") {
  const raw = rawErrorText(error).trim();
  if (!raw) return fallback;

  const normalized = normalize(raw);
  const rule = friendlyRules.find(([pattern]) => pattern.test(raw) || pattern.test(normalized));
  if (rule) return rule[1];

  if (looksTechnical(raw)) return fallback;
  return raw;
}

export function logTechnicalError(scope: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error(`[Rancho] ${scope}`, error);
  } else {
    console.error(`[Rancho] ${scope}`, rawErrorText(error));
  }
}
