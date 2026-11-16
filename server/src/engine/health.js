import { DEFAULT_RULES } from '../config/rules.js';
import { daysBetween, isoDate, plural } from './dates.js';

export const STATUS = Object.freeze({
  HEALTHY: 'Healthy',
  AT_RISK: 'At Risk',
  CRITICAL: 'Critical',
});

export const LEVEL = Object.freeze({ WATCH: 'watch', RISK: 'risk', CRITICAL: 'critical' });

const LEVEL_ORDER = [LEVEL.WATCH, LEVEL.RISK, LEVEL.CRITICAL];
const STATUS_ORDER = [STATUS.HEALTHY, STATUS.AT_RISK, STATUS.CRITICAL];

export const INDICATORS = Object.freeze({
  OVERDUE_MILESTONE: 'Overdue milestones',
  OVERDUE_CHECKLIST: 'Overdue checklist items',
  BLOCKER: 'Unresolved blockers',
  MISSED_ACTIVITY: 'Missed activities',
  RESCHEDULED_ACTIVITY: 'Rescheduled activities',
  UPCOMING_DEADLINE: 'Upcoming deadlines',
  STALE_UPDATES: 'Time since last update',
});

export function statusRank(status) {
  return STATUS_ORDER.indexOf(status);
}

export function levelRank(level) {
  return LEVEL_ORDER.indexOf(level);
}

function escalate(level) {
  return LEVEL_ORDER[Math.min(levelRank(level) + 1, LEVEL_ORDER.length - 1)];
}

function finding(ruleId, indicator, level, message, extra = {}) {
  return { ruleId, indicator, level, message, ...extra };
}

/* ------------------------------------------------------------------------ */
/* Individual rules. Each returns an array of findings (possibly empty).    */
/* ------------------------------------------------------------------------ */

/** R1 — incomplete milestones whose due date has passed. One finding per milestone. */
export function overdueMilestones(milestones, now, rules) {
  const cfg = rules.overdueMilestone;
  return milestones
    .filter((m) => !m.completedAt && daysBetween(m.dueDate, now) > 0)
    .map((m) => {
      const daysOver = daysBetween(m.dueDate, now);
      const threshold = m.isKey ? cfg.keyMilestoneCriticalAfterDays : cfg.criticalAfterDays;
      const level = daysOver >= threshold ? LEVEL.CRITICAL : LEVEL.RISK;
      const label = m.isKey ? 'Key milestone' : 'Milestone';
      return finding(
        'R1',
        INDICATORS.OVERDUE_MILESTONE,
        level,
        `${label} "${m.name}" is ${plural(daysOver, 'day')} overdue (due ${isoDate(m.dueDate)}, ${m.progress ?? 0}% complete)`,
        { ref: { type: 'milestone', id: m.id }, metric: daysOver },
      );
    });
}

/** R2 — open checklist items past their due date. One aggregate finding. */
export function overdueChecklist(items, now, rules) {
  const cfg = rules.overdueChecklist;
  const overdue = items.filter((i) => !i.done && i.dueDate && daysBetween(i.dueDate, now) > 0);
  const n = overdue.length;
  if (n < cfg.watchAtCount) return [];
  const level = n >= cfg.criticalAtCount ? LEVEL.CRITICAL : n >= cfg.riskAtCount ? LEVEL.RISK : LEVEL.WATCH;
  const oldest = Math.max(...overdue.map((i) => daysBetween(i.dueDate, now)));
  return [
    finding(
      'R2',
      INDICATORS.OVERDUE_CHECKLIST,
      level,
      `${plural(n, 'checklist item')} overdue (oldest ${plural(oldest, 'day')} late)`,
      { ref: { type: 'checklist', ids: overdue.map((i) => i.id) }, metric: n },
    ),
  ];
}

/** R3 — unresolved blockers. One finding per blocker. */
export function unresolvedBlockers(blockers, now, rules) {
  const cfg = rules.blockers;
  return blockers
    .filter((b) => !b.resolvedAt)
    .map((b) => {
      const severity = cfg.baseLevel[b.severity] ? b.severity : 'medium';
      const age = Math.max(0, daysBetween(b.raisedAt, now));
      let level = cfg.baseLevel[severity];
      const escalated = age >= cfg.escalateAfterDays[severity];
      if (escalated) level = escalate(level);
      const suffix = escalated ? ' — exceeds escalation window' : '';
      return finding(
        'R3',
        INDICATORS.BLOCKER,
        level,
        `${capitalise(severity)}-severity blocker "${b.title}" open for ${plural(age, 'day')}${suffix}`,
        { ref: { type: 'blocker', id: b.id }, metric: age },
      );
    });
}

/** R4 — activities marked missed inside the lookback window. One aggregate finding. */
export function missedActivities(activities, now, rules) {
  const cfg = rules.missedActivities;
  const missed = activities.filter(
    (a) => a.status === 'missed' && inLookback(a.scheduledFor, now, cfg.lookbackDays),
  );
  const n = missed.length;
  if (n < cfg.watchAtCount) return [];
  const level = n >= cfg.criticalAtCount ? LEVEL.CRITICAL : n >= cfg.riskAtCount ? LEVEL.RISK : LEVEL.WATCH;
  const names = missed.map((a) => a.title).slice(0, 3).join(', ');
  return [
    finding(
      'R4',
      INDICATORS.MISSED_ACTIVITY,
      level,
      `${plural(n, 'activity', 'activities')} missed in the last ${cfg.lookbackDays} days (${names}${n > 3 ? ', …' : ''})`,
      { ref: { type: 'activity', ids: missed.map((a) => a.id) }, metric: n },
    ),
  ];
}

/** R5 — activities that were rescheduled inside the lookback window. One aggregate finding. */
export function rescheduledActivities(activities, now, rules) {
  const cfg = rules.rescheduledActivities;
  const moved = activities.filter(
    (a) =>
      (a.rescheduleCount ?? 0) > 0 &&
      inLookback(a.lastRescheduledAt ?? a.scheduledFor, now, cfg.lookbackDays),
  );
  const total = moved.reduce((sum, a) => sum + a.rescheduleCount, 0);
  const worst = moved.reduce((max, a) => (a.rescheduleCount > (max?.rescheduleCount ?? 0) ? a : max), null);
  if (total < cfg.watchAtTotal && !(worst && worst.rescheduleCount >= cfg.riskAtSingleActivity)) return [];
  const level =
    total >= cfg.riskAtTotal || worst.rescheduleCount >= cfg.riskAtSingleActivity ? LEVEL.RISK : LEVEL.WATCH;
  return [
    finding(
      'R5',
      INDICATORS.RESCHEDULED_ACTIVITY,
      level,
      `${plural(total, 'reschedule')} across ${plural(moved.length, 'activity', 'activities')} in the last ${cfg.lookbackDays} days` +
        ` ("${worst.title}" moved ${plural(worst.rescheduleCount, 'time')})`,
      { ref: { type: 'activity', ids: moved.map((a) => a.id) }, metric: total },
    ),
  ];
}

/** R6 — incomplete milestones due soon. One finding per milestone. */
export function upcomingDeadlines(milestones, now, rules) {
  const cfg = rules.upcomingDeadline;
  return milestones
    .filter((m) => !m.completedAt)
    .map((m) => ({ m, daysLeft: daysBetween(now, m.dueDate) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= cfg.watchWithinDays)
    .map(({ m, daysLeft }) => {
      const progress = m.progress ?? 0;
      const behind = daysLeft <= cfg.riskWithinDays && progress < cfg.riskIfProgressBelow;
      const when = daysLeft === 0 ? 'today' : `in ${plural(daysLeft, 'day')}`;
      return finding(
        'R6',
        INDICATORS.UPCOMING_DEADLINE,
        behind ? LEVEL.RISK : LEVEL.WATCH,
        `${m.isKey ? 'Key milestone' : 'Milestone'} "${m.name}" due ${when} (${isoDate(m.dueDate)}) and ${progress}% complete`,
        { ref: { type: 'milestone', id: m.id }, metric: daysLeft },
      );
    });
}

/** R7 — time since the most recent project update. */
export function staleUpdates(lastUpdateAt, now, rules) {
  const cfg = rules.staleUpdates;
  if (!lastUpdateAt) {
    return [
      finding('R7', INDICATORS.STALE_UPDATES, LEVEL.CRITICAL, 'No project update has ever been recorded', {
        metric: null,
      }),
    ];
  }
  const days = daysBetween(lastUpdateAt, now);
  let level = null;
  if (days >= cfg.criticalAfterDays) level = LEVEL.CRITICAL;
  else if (days >= cfg.riskAfterDays) level = LEVEL.RISK;
  else if (days >= cfg.watchAfterDays) level = LEVEL.WATCH;
  if (!level) return [];
  return [
    finding(
      'R7',
      INDICATORS.STALE_UPDATES,
      level,
      `No project update for ${plural(days, 'day')} (last update ${isoDate(lastUpdateAt)})`,
      { metric: days },
    ),
  ];
}

/* ------------------------------------------------------------------------ */
/* Roll-up                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Turn a list of findings into an overall status with a human-readable explanation.
 */
export function deriveStatus(findings, rules = DEFAULT_RULES) {
  const counts = { watch: 0, risk: 0, critical: 0 };
  for (const f of findings) counts[f.level] += 1;
  const cfg = rules.status;

  let status = STATUS.HEALTHY;
  let explanation = 'No risk indicators triggered';

  if (counts.critical > 0) {
    status = STATUS.CRITICAL;
    explanation = `${plural(counts.critical, 'critical finding')}`;
  } else if (counts.risk >= cfg.criticalIfRiskFindingsAtLeast) {
    status = STATUS.CRITICAL;
    explanation = `${counts.risk} At Risk findings combined (threshold ${cfg.criticalIfRiskFindingsAtLeast}) escalate to Critical`;
  } else if (counts.risk > 0) {
    status = STATUS.AT_RISK;
    explanation = `${plural(counts.risk, 'At Risk finding')}`;
  } else if (counts.watch >= cfg.atRiskIfWatchFindingsAtLeast) {
    status = STATUS.AT_RISK;
    explanation = `${counts.watch} watch items combined (threshold ${cfg.atRiskIfWatchFindingsAtLeast}) escalate to At Risk`;
  } else if (counts.watch > 0) {
    explanation = `${plural(counts.watch, 'watch item')} — not enough to change status`;
  }

  const w = rules.scoreWeights;
  const score = Math.min(100, counts.watch * w.watch + counts.risk * w.risk + counts.critical * w.critical);
  return { status, explanation, counts, score };
}

/**
 * Assess one project.
 *
 * @param {object} input  { project, milestones, checklistItems, blockers, activities, updates }
 * @param {Date|string} now
 * @param {object} rules  thresholds (defaults to DEFAULT_RULES)
 */
export function assessProject(input, now = new Date(), rules = DEFAULT_RULES) {
  const { project, milestones = [], checklistItems = [], blockers = [], activities = [], updates = [] } = input;
  const lastUpdateAt = latestUpdate(project, updates);

  const findings = [
    ...overdueMilestones(milestones, now, rules),
    ...overdueChecklist(checklistItems, now, rules),
    ...unresolvedBlockers(blockers, now, rules),
    ...missedActivities(activities, now, rules),
    ...rescheduledActivities(activities, now, rules),
    ...upcomingDeadlines(milestones, now, rules),
    ...staleUpdates(lastUpdateAt, now, rules),
  ].sort((a, b) => levelRank(b.level) - levelRank(a.level) || a.ruleId.localeCompare(b.ruleId));

  const { status, explanation, counts, score } = deriveStatus(findings, rules);
  return {
    projectId: project.id,
    status,
    statusExplanation: explanation,
    score,
    counts,
    reasons: findings,
    lastUpdateAt: lastUpdateAt ? new Date(lastUpdateAt).toISOString() : null,
    assessedAt: new Date(now).toISOString(),
  };
}

/** Account (client) health = worst project status; reasons summarise the projects driving it. */
export function assessClient(client, projectAssessments) {
  if (projectAssessments.length === 0) {
    return { clientId: client.id, status: STATUS.HEALTHY, score: 0, projectCounts: emptyCounts(), reasons: [] };
  }
  const projectCounts = emptyCounts();
  let worst = STATUS.HEALTHY;
  for (const a of projectAssessments) {
    projectCounts[a.status] += 1;
    if (statusRank(a.status) > statusRank(worst)) worst = a.status;
  }
  const reasons = projectAssessments
    .filter((a) => a.status !== STATUS.HEALTHY)
    .sort((a, b) => statusRank(b.status) - statusRank(a.status) || b.score - a.score)
    .map((a) => `${a.projectName ?? a.projectId}: ${a.status} — ${a.reasons[0]?.message ?? a.statusExplanation}`);
  return {
    clientId: client.id,
    status: worst,
    score: Math.max(...projectAssessments.map((a) => a.score)),
    projectCounts,
    reasons,
  };
}

function emptyCounts() {
  return { [STATUS.HEALTHY]: 0, [STATUS.AT_RISK]: 0, [STATUS.CRITICAL]: 0 };
}

function latestUpdate(project, updates) {
  const times = updates.map((u) => new Date(u.postedAt).getTime());
  if (project.lastUpdateAt) times.push(new Date(project.lastUpdateAt).getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

function inLookback(date, now, lookbackDays) {
  if (!date) return false;
  const ago = daysBetween(date, now);
  return ago >= 0 && ago <= lookbackDays;
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
