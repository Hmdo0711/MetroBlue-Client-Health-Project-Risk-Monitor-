import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessProject,
  assessClient,
  deriveStatus,
  overdueMilestones,
  overdueChecklist,
  unresolvedBlockers,
  missedActivities,
  rescheduledActivities,
  upcomingDeadlines,
  staleUpdates,
  STATUS,
} from '../src/engine/health.js';
import { DEFAULT_RULES as R, mergeRules } from '../src/config/rules.js';
import { addDays, isoDate } from '../src/engine/dates.js';

const NOW = new Date('2026-11-12T12:00:00Z');
const d = (offset) => isoDate(addDays(NOW, offset));
const project = { id: 'p1', name: 'Test project' };
const fresh = [{ postedAt: d(-1) }];

describe('R1 overdue milestones', () => {
  test('ignores completed and not-yet-due milestones', () => {
    const out = overdueMilestones(
      [
        { id: 'a', name: 'Done', dueDate: d(-20), completedAt: d(-21) },
        { id: 'b', name: 'Due today', dueDate: d(0) },
        { id: 'c', name: 'Future', dueDate: d(5) },
      ],
      NOW,
      R,
    );
    assert.equal(out.length, 0);
  });

  test('1–7 days overdue is At Risk; 8+ is Critical', () => {
    const [seven] = overdueMilestones([{ id: 'a', name: 'M', dueDate: d(-7), progress: 50 }], NOW, R);
    const [eight] = overdueMilestones([{ id: 'a', name: 'M', dueDate: d(-8) }], NOW, R);
    assert.equal(seven.level, 'risk');
    assert.match(seven.message, /7 days overdue/);
    assert.equal(eight.level, 'critical');
  });

  test('key milestones become Critical after 4 days', () => {
    const [three] = overdueMilestones([{ id: 'a', name: 'K', dueDate: d(-3), isKey: true }], NOW, R);
    const [four] = overdueMilestones([{ id: 'a', name: 'K', dueDate: d(-4), isKey: true }], NOW, R);
    assert.equal(three.level, 'risk');
    assert.equal(four.level, 'critical');
    assert.match(four.message, /^Key milestone/);
  });
});

describe('R2 overdue checklist items', () => {
  const items = (n, offset = -1) => Array.from({ length: n }, (_, i) => ({ id: `k${i}`, dueDate: d(offset), done: false }));
  test('thresholds: 1 watch, 3 risk, 8 critical', () => {
    assert.equal(overdueChecklist(items(0), NOW, R).length, 0);
    assert.equal(overdueChecklist(items(1), NOW, R)[0].level, 'watch');
    assert.equal(overdueChecklist(items(2), NOW, R)[0].level, 'watch');
    assert.equal(overdueChecklist(items(3), NOW, R)[0].level, 'risk');
    assert.equal(overdueChecklist(items(8), NOW, R)[0].level, 'critical');
  });
  test('done items and items due today are not overdue', () => {
    const list = [{ id: 'a', dueDate: d(-5), done: true }, { id: 'b', dueDate: d(0), done: false }];
    assert.equal(overdueChecklist(list, NOW, R).length, 0);
  });
});

describe('R3 unresolved blockers', () => {
  test('severity sets base level', () => {
    const out = unresolvedBlockers(
      [
        { id: 'l', title: 'L', severity: 'low', raisedAt: d(-1) },
        { id: 'm', title: 'M', severity: 'medium', raisedAt: d(-1) },
        { id: 'h', title: 'H', severity: 'high', raisedAt: d(-1) },
      ],
      NOW,
      R,
    );
    assert.deepEqual(out.map((f) => f.level), ['watch', 'risk', 'risk']);
  });
  test('ageing past the escalation window raises one level', () => {
    const out = unresolvedBlockers(
      [
        { id: 'l', title: 'L', severity: 'low', raisedAt: d(-14) },
        { id: 'm', title: 'M', severity: 'medium', raisedAt: d(-10) },
        { id: 'h', title: 'H', severity: 'high', raisedAt: d(-5) },
        { id: 'h2', title: 'H2', severity: 'high', raisedAt: d(-4) },
      ],
      NOW,
      R,
    );
    assert.deepEqual(out.map((f) => f.level), ['risk', 'critical', 'critical', 'risk']);
    assert.match(out[0].message, /exceeds escalation window/);
  });
  test('resolved blockers are ignored; unknown severity treated as medium', () => {
    const out = unresolvedBlockers(
      [
        { id: 'r', title: 'R', severity: 'high', raisedAt: d(-30), resolvedAt: d(-2) },
        { id: 'u', title: 'U', severity: 'weird', raisedAt: d(-1) },
      ],
      NOW,
      R,
    );
    assert.equal(out.length, 1);
    assert.equal(out[0].level, 'risk');
  });
});

describe('R4 missed activities', () => {
  const missed = (n, offset = -3) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, title: `Call ${i}`, scheduledFor: d(offset), status: 'missed' }));
  test('thresholds: 1 watch, 2 risk, 4 critical', () => {
    assert.equal(missedActivities(missed(1), NOW, R)[0].level, 'watch');
    assert.equal(missedActivities(missed(2), NOW, R)[0].level, 'risk');
    assert.equal(missedActivities(missed(4), NOW, R)[0].level, 'critical');
  });
  test('only counts misses within the 30-day lookback', () => {
    assert.equal(missedActivities(missed(5, -31), NOW, R).length, 0);
    assert.equal(missedActivities(missed(1, -30), NOW, R).length, 1);
  });
});

describe('R5 rescheduled activities', () => {
  const act = (count, offset = -2) => ({ id: `a${count}${offset}`, title: 'Workshop', scheduledFor: d(offset), status: 'completed', rescheduleCount: count, lastRescheduledAt: d(offset) });
  test('a single reschedule is ignored', () => {
    assert.equal(rescheduledActivities([act(1)], NOW, R).length, 0);
  });
  test('2 total reschedules is watch, 4 is risk', () => {
    assert.equal(rescheduledActivities([act(1), act(1, -3)], NOW, R)[0].level, 'watch');
    assert.equal(rescheduledActivities([act(2), act(2, -4)], NOW, R)[0].level, 'risk');
  });
  test('one activity moved 3 times is risk', () => {
    const [f] = rescheduledActivities([act(3)], NOW, R);
    assert.equal(f.level, 'risk');
    assert.match(f.message, /moved 3 times/);
  });
});

describe('R6 upcoming deadlines', () => {
  test('due within 14 days is watch; within 7 days and <60% is risk', () => {
    const out = upcomingDeadlines(
      [
        { id: 'a', name: 'Far', dueDate: d(15), progress: 0 },
        { id: 'b', name: 'Soon-ish', dueDate: d(14), progress: 0 },
        { id: 'c', name: 'Soon, behind', dueDate: d(7), progress: 59 },
        { id: 'd', name: 'Soon, on track', dueDate: d(3), progress: 60 },
        { id: 'e', name: 'Today', dueDate: d(0), progress: 10 },
      ],
      NOW,
      R,
    );
    assert.deepEqual(out.map((f) => [f.ref.id, f.level]), [
      ['b', 'watch'],
      ['c', 'risk'],
      ['d', 'watch'],
      ['e', 'risk'],
    ]);
    assert.match(out[3].message, /due today/);
  });
});

describe('R7 time since last update', () => {
  test('7 days is fine, 8 watch, 15 risk, 31 critical', () => {
    assert.equal(staleUpdates(d(-7), NOW, R).length, 0);
    assert.equal(staleUpdates(d(-8), NOW, R)[0].level, 'watch');
    assert.equal(staleUpdates(d(-15), NOW, R)[0].level, 'risk');
    assert.equal(staleUpdates(d(-31), NOW, R)[0].level, 'critical');
  });
  test('a project with no updates at all is critical', () => {
    assert.equal(staleUpdates(null, NOW, R)[0].level, 'critical');
  });
});

describe('status roll-up', () => {
  const f = (level) => ({ level });
  test('no findings -> Healthy', () => {
    assert.equal(deriveStatus([]).status, STATUS.HEALTHY);
  });
  test('watch items alone stay Healthy until 3 of them', () => {
    assert.equal(deriveStatus([f('watch'), f('watch')]).status, STATUS.HEALTHY);
    const r = deriveStatus([f('watch'), f('watch'), f('watch')]);
    assert.equal(r.status, STATUS.AT_RISK);
    assert.match(r.explanation, /escalate to At Risk/);
  });
  test('any risk finding -> At Risk; 3 risk findings -> Critical', () => {
    assert.equal(deriveStatus([f('risk')]).status, STATUS.AT_RISK);
    assert.equal(deriveStatus([f('risk'), f('risk')]).status, STATUS.AT_RISK);
    assert.equal(deriveStatus([f('risk'), f('risk'), f('risk')]).status, STATUS.CRITICAL);
  });
  test('any critical finding -> Critical', () => {
    assert.equal(deriveStatus([f('critical')]).status, STATUS.CRITICAL);
  });
  test('score is weighted and capped at 100', () => {
    assert.equal(deriveStatus([f('watch'), f('risk'), f('critical')]).score, 14);
    assert.equal(deriveStatus(Array(20).fill(f('critical'))).score, 100);
  });
  test('thresholds are configurable', () => {
    const rules = mergeRules(R, { status: { criticalIfRiskFindingsAtLeast: 2 } });
    assert.equal(deriveStatus([f('risk'), f('risk')], rules).status, STATUS.CRITICAL);
    assert.equal(rules.staleUpdates.watchAfterDays, R.staleUpdates.watchAfterDays, 'merge keeps other values');
  });
});

describe('assessProject', () => {
  test('healthy project has no reasons', () => {
    const a = assessProject({ project, updates: fresh, milestones: [{ id: 'm', name: 'Later', dueDate: d(40), progress: 10 }] }, NOW);
    assert.equal(a.status, STATUS.HEALTHY);
    assert.equal(a.reasons.length, 0);
    assert.equal(a.score, 0);
  });

  test('reasons are sorted most severe first and each carries an explanation', () => {
    const a = assessProject(
      {
        project,
        updates: [{ postedAt: d(-9) }],
        milestones: [{ id: 'm', name: 'Build', dueDate: d(-10), progress: 40 }],
        blockers: [{ id: 'b', title: 'Access', severity: 'medium', raisedAt: d(-2) }],
      },
      NOW,
    );
    assert.equal(a.status, STATUS.CRITICAL);
    assert.deepEqual(a.reasons.map((r) => r.level), ['critical', 'risk', 'watch']);
    for (const r of a.reasons) {
      assert.ok(r.ruleId && r.indicator && r.message, 'reason has rule, indicator and message');
    }
  });

  test('uses the latest of project.lastUpdateAt and update log', () => {
    const a = assessProject({ project: { ...project, lastUpdateAt: d(-2) }, updates: [{ postedAt: d(-40) }] }, NOW);
    assert.equal(a.status, STATUS.HEALTHY);
    assert.equal(a.lastUpdateAt.slice(0, 10), d(-2));
  });
});

describe('assessClient', () => {
  test('account status is the worst project status', () => {
    const c = assessClient({ id: 'c' }, [
      { projectId: 'a', status: STATUS.HEALTHY, score: 0, reasons: [] },
      { projectId: 'b', status: STATUS.AT_RISK, score: 3, reasons: [{ message: 'x' }], projectName: 'B' },
    ]);
    assert.equal(c.status, STATUS.AT_RISK);
    assert.deepEqual(c.projectCounts, { Healthy: 1, 'At Risk': 1, Critical: 0 });
    assert.equal(c.reasons[0], 'B: At Risk — x');
  });
});
