type ActionPlanRuntimeStats = {
  actionPlanUsed: number;
  tableActionPlanUsed: number;
  legacyFallback: number;
  invalid: number;
  blocked: number;
};

type ActionPlanRuntimeGlobal = typeof globalThis & {
  __RANCHO_ACTION_PLAN_RUNTIME_STATS__?: ActionPlanRuntimeStats;
};

function runtimeGlobal() {
  return globalThis as ActionPlanRuntimeGlobal;
}

export function actionPlanRuntimeStats(): ActionPlanRuntimeStats {
  const holder = runtimeGlobal();
  if (!holder.__RANCHO_ACTION_PLAN_RUNTIME_STATS__) {
    holder.__RANCHO_ACTION_PLAN_RUNTIME_STATS__ = {
      actionPlanUsed: 0,
      tableActionPlanUsed: 0,
      legacyFallback: 0,
      invalid: 0,
      blocked: 0
    };
  }
  return holder.__RANCHO_ACTION_PLAN_RUNTIME_STATS__;
}

export function resetActionPlanRuntimeStats() {
  runtimeGlobal().__RANCHO_ACTION_PLAN_RUNTIME_STATS__ = {
    actionPlanUsed: 0,
    tableActionPlanUsed: 0,
    legacyFallback: 0,
    invalid: 0,
    blocked: 0
  };
}

export function recordActionPlanRuntime(event: keyof ActionPlanRuntimeStats) {
  actionPlanRuntimeStats()[event] += 1;
}

export function actionPlanRuntimeReportLines() {
  const stats = actionPlanRuntimeStats();
  return [
    `ActionPlan used: ${stats.actionPlanUsed}`,
    `Table ActionPlan used: ${stats.tableActionPlanUsed}`,
    `ActionPlan legacy fallback: ${stats.legacyFallback}`,
    `ActionPlan invalid: ${stats.invalid}`,
    `ActionPlan blocked: ${stats.blocked}`
  ];
}
