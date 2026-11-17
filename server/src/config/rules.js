/**
 * Health calculation thresholds.
 *
 * Every number that influences a project's status lives here so the rules can be
 * tuned without touching engine code. See docs/CALCULATION_RULES.md for the
 * plain-English description of each rule. Override any value at runtime by
 * pointing HEALTH_RULES_FILE at a JSON file with the same shape (deep-merged).
 */
export const DEFAULT_RULES = Object.freeze({
  // R1 — Overdue milestones (incomplete and past due date)
  overdueMilestone: {
    criticalAfterDays: 8, // > 7 days overdue  -> Critical
    keyMilestoneCriticalAfterDays: 4, // key milestones: > 3 days overdue -> Critical
  },

  // R2 — Overdue checklist items (not done and past due date)
  overdueChecklist: {
    watchAtCount: 1,
    riskAtCount: 3,
    criticalAtCount: 8,
  },

  // R3 — Unresolved blockers. Base level by severity, escalated one level when
  // the blocker has been open longer than the escalation age for its severity.
  blockers: {
    baseLevel: { low: 'watch', medium: 'risk', high: 'risk' },
    escalateAfterDays: { low: 14, medium: 10, high: 5 },
  },

  // R4 — Missed activities (meetings, status calls, workshops) in the lookback window
  missedActivities: {
    lookbackDays: 30,
    watchAtCount: 1,
    riskAtCount: 2,
    criticalAtCount: 4,
  },

  // R5 — Rescheduled activities in the lookback window
  rescheduledActivities: {
    lookbackDays: 30,
    watchAtTotal: 2, // total reschedules across activities
    riskAtTotal: 4,
    riskAtSingleActivity: 3, // one activity moved this many times
  },

  // R6 — Upcoming deadlines for incomplete milestones
  upcomingDeadline: {
    watchWithinDays: 14,
    riskWithinDays: 7,
    riskIfProgressBelow: 60, // percent complete
  },

  // R7 — Long periods without a project update
  staleUpdates: {
    watchAfterDays: 8, // > 7 days
    riskAfterDays: 15, // > 14 days
    criticalAfterDays: 31, // > 30 days
  },

  // Overall status roll-up
  status: {
    criticalIfRiskFindingsAtLeast: 3, // several At Risk signals together -> Critical
    atRiskIfWatchFindingsAtLeast: 5, // several Watch signals together -> At Risk
  },

  // Risk score weights (used for sorting/prioritising, not for status)
  scoreWeights: { watch: 1, risk: 3, critical: 10 },
});

export function mergeRules(base, override) {
  if (!override || typeof override !== 'object') return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object') {
      out[key] = mergeRules(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
