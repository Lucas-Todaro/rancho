export type FieldType = "text" | "number" | "date" | "select" | "textarea" | "currency" | "month" | "tel";
export type FieldOption = { label: string; value: string };
export type ModuleField = {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
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
  quickStats?: Array<{ label: string; field: string; mode: "count" | "sum" | "avg" | "critical" | "moneyIn" | "moneyOut"; suffix?: string }>;
};
export type AnyRecord = Record<string, any>;
export type WhatsAppSession = { phone: string; state: string; payload: AnyRecord; updated_at?: string };
