export type ActionPlanAction = "query" | "import_table" | "create" | "update" | "clarify" | "block";

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
  requiresConfirmation: true;
};

export type CreateActionPlan = {
  action: "create";
  domain: string;
  confidence: number;
  data: Record<string, unknown>;
  requiresConfirmation: true;
};

export type UpdateActionPlan = {
  action: "update";
  domain: string;
  confidence: number;
  data: Record<string, unknown>;
  filters?: FilterPlan[];
  requiresConfirmation: true;
};

export type ClarifyActionPlan = {
  action: "clarify";
  question: string;
  options?: string[];
};

export type BlockActionPlan = {
  action: "block";
  reason: string;
  userMessage: string;
};

export type ActionPlan =
  | QueryActionPlan
  | ImportTableActionPlan
  | CreateActionPlan
  | UpdateActionPlan
  | ClarifyActionPlan
  | BlockActionPlan;

export const ACTION_PLAN_ACTIONS: readonly ActionPlanAction[] = [
  "query",
  "import_table",
  "create",
  "update",
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
