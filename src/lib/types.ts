export type FieldType =
  | "text"
  | "number"
  | "date"
  | "datetime-local"
  | "select"
  | "textarea"
  | "currency"
  | "month"
  | "tel"
  | "checkbox"
  | "relation";
export type FieldOption = { label: string; value: string };

export type RelationConfig = {
  tableName: string;
  valueColumn?: string;
  labelColumn: string;
  descriptionColumn?: string;
  orderBy?: string;
};

export type ModuleField = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
  relation?: RelationConfig;
  defaultValue?: string | number;
  tableVisible?: boolean;
  summary?: boolean;
};

export type ModuleConfig = {
  key: string;
  title: string;
  subtitle: string;
  tableName: string;
  icon: string;
  primaryColumn: string;
  descriptionColumn?: string;
  orderBy?: string;
  fields: ModuleField[];
  quickStats?: Array<{
    label: string;
    field: string;
    mode: "count" | "sum" | "avg" | "critical" | "moneyIn" | "moneyOut" | "active";
    suffix?: string;
    compareField?: string;
  }>;
};
export type AnyRecord = Record<string, any>;

export type FazendaProfile = {
  id: string;
  nome: string;
  slug?: string;
  timezone?: string;
  plano?: string;
  ativa?: boolean;
};

export type UsuarioProfile = {
  id: string;
  fazenda_id: string;
  nome: string;
  telefone?: string | null;
  papel: "dono" | "admin" | "gerente" | "funcionario" | "veterinario" | "contador" | "bot_only";
  ativo: boolean;
  is_internal_tester?: boolean;
  is_platform_admin?: boolean;
  fazenda?: FazendaProfile | null;
};

export type DataContext = {
  fazendaId?: string;
  usuarioId?: string;
};

export type RelationOption = {
  value: string;
  label: string;
};

export type WhatsAppSession = {
  phone: string;
  fazendaId?: string;
  whatsappUsuarioId?: string | null;
  usuarioId?: string | null;
  state: string;
  payload: AnyRecord;
  updated_at?: string;
};
