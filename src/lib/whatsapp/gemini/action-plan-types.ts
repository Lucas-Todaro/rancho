export type ActionPlanAction = "query" | "import_table" | "create" | "update" | "execute" | "clarify" | "block";

export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "gte"
  | "lte"
  | "between"
  | "last_days"
  | "last_months"
  | "current_month"
  | "current_year"
  | "since";

export type AggregationOperator = "sum" | "avg" | "count" | "min" | "max";

export type FilterPlan = {
  field: string;
  op: FilterOperator;
  value?: unknown;
};

export type AggregationPlan = {
  field: string;
  op: AggregationOperator;
  as?: string;
};

export type QueryActionPlan = {
  action: "query";
  domain: string;
  confidence: number;
  filters: FilterPlan[];
  select?: string[];
  aggregations?: AggregationPlan[];
  groupBy?: string[];
  orderBy?: { field: string; direction: "asc" | "desc" };
  limit?: number;
  requiresConfirmation: false;
  operation?: string;
  missingFields?: string[];
  userQuestion?: string | null;
  safety?: ActionPlanSafety;
};

export type ActionPlanSafety = {
  risk: "low" | "medium" | "high";
  reason?: string | null;
};

export type ImportTableActionPlan = {
  action: "import_table";
  domain: string;
  confidence: number;
  table: {
    hasHeader: boolean;
    separator?: string;
    columnMapping: Record<string, string | number>;
    defaultFields?: Record<string, unknown>;
    ignoredColumns?: Array<string | number>;
    ambiguousColumns?: Array<string | number>;
  };
  data?: {
    rows?: Array<Record<string, unknown>>;
  };
  requiresConfirmation: true;
  operation?: string;
  missingFields?: string[];
  userQuestion?: string | null;
  safety?: ActionPlanSafety;
};

export type CreateActionPlan = {
  action: "create";
  domain: string;
  confidence: number;
  data: Record<string, unknown>;
  requiresConfirmation: true;
  operation?: string;
  missingFields?: string[];
  userQuestion?: string | null;
  safety?: ActionPlanSafety;
};

export type UpdateActionPlan = {
  action: "update";
  domain: string;
  confidence: number;
  data: Record<string, unknown>;
  filters?: FilterPlan[];
  requiresConfirmation: true;
  operation?: string;
  missingFields?: string[];
  userQuestion?: string | null;
  safety?: ActionPlanSafety;
};

export type ExecuteCapabilityActionPlan = {
  action: "execute";
  capability: string;
  domain?: string;
  confidence: number;
  data: Record<string, unknown>;
  requiresConfirmation: boolean;
  operation?: string;
  missingFields?: string[];
  userQuestion?: string | null;
  safety?: ActionPlanSafety;
};

export type ClarifyActionPlan = {
  action: "clarify";
  domain?: string;
  operation?: string;
  confidence?: number;
  data?: Record<string, unknown>;
  missingFields?: string[];
  question?: string;
  userQuestion?: string;
  options?: string[];
  requiresConfirmation?: false;
  safety?: ActionPlanSafety;
};

export type BlockActionPlan = {
  action: "block";
  domain?: string;
  operation?: string;
  confidence?: number;
  reason?: string;
  userMessage?: string;
  requiresConfirmation?: false;
  safety?: ActionPlanSafety;
};

export type ActionPlan =
  | QueryActionPlan
  | ImportTableActionPlan
  | CreateActionPlan
  | UpdateActionPlan
  | ExecuteCapabilityActionPlan
  | ClarifyActionPlan
  | BlockActionPlan;

export const ACTION_PLAN_ACTIONS: readonly ActionPlanAction[] = [
  "query",
  "import_table",
  "create",
  "update",
  "execute",
  "clarify",
  "block"
];

export const FILTER_OPERATORS: readonly FilterOperator[] = [
  "eq",
  "neq",
  "contains",
  "gte",
  "lte",
  "between",
  "last_days",
  "last_months",
  "current_month",
  "current_year",
  "since"
];

export const AGGREGATION_OPERATORS: readonly AggregationOperator[] = [
  "sum",
  "avg",
  "count",
  "min",
  "max"
];
