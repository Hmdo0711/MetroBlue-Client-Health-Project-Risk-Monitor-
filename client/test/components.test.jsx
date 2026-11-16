import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusBadge } from '../src/components/StatusBadge.jsx';
import { ReasonList, TopReason } from '../src/components/ReasonList.jsx';
import { ProjectTable } from '../src/components/ProjectTable.jsx';
import { KpiTiles } from '../src/components/KpiTiles.jsx';
import { AccountsView } from '../src/components/AccountsView.jsx';
import { SummaryContent } from '../src/components/SummaryView.jsx';

const asOf = '2026-11-12T12:00:00Z';
const reasons = [
  { ruleId: 'R1', indicator: 'Overdue milestones', level: 'critical', message: 'Key milestone "Build" is 10 days overdue' },
  { ruleId: 'R7', indicator: 'Time since last update', level: 'watch', message: 'No project update for 9 days' },
];
const project = {
  id: 'p1', name: 'WMS Rollout', clientName: 'Northwind', phase: 'Build', accountOwnerName: 'Priya',
  status: 'Critical', score: 11, reasons, lastUpdateAt: '2026-10-20T10:00:00Z',
};

test('StatusBadge always shows a text label (not colour alone)', () => {
  const html = renderToStaticMarkup(<StatusBadge status="At Risk" />);
  assert.match(html, /At Risk/);
  assert.match(html, /badge-risk/);
});

test('ReasonList shows every reason with level, rule and indicator', () => {
  const html = renderToStaticMarkup(<ReasonList reasons={reasons} />);
  assert.match(html, /10 days overdue/);
  assert.match(html, /No project update for 9 days/);
  assert.match(html, /R1 · Overdue milestones/);
  assert.match(html, />Critical</);
  assert.match(html, />Watch</);
});

test('ReasonList empty state', () => {
  assert.match(renderToStaticMarkup(<ReasonList reasons={[]} />), /No risk indicators triggered/);
});

test('TopReason shows the most severe reason and a count of the rest', () => {
  const html = renderToStaticMarkup(<TopReason reasons={reasons} />);
  assert.match(html, /10 days overdue/);
  assert.match(html, /\+1 more/);
});

test('ProjectTable renders rows with status, client, reason and stale flag', () => {
  const html = renderToStaticMarkup(<ProjectTable items={[project]} asOf={asOf} onSelect={() => {}} />);
  assert.match(html, /WMS Rollout/);
  assert.match(html, /Northwind · Build/);
  assert.match(html, /23 days ago/);
  assert.match(html, /class="stale"/);
  assert.match(html, /aria-label="WMS Rollout, Critical. Open details"/);
});

test('ProjectTable empty state', () => {
  assert.match(renderToStaticMarkup(<ProjectTable items={[]} asOf={asOf} onSelect={() => {}} />), /No projects match/);
});

test('KpiTiles marks active status filters with aria-pressed', () => {
  const html = renderToStaticMarkup(<KpiTiles counts={{ total: 5, Critical: 1, 'At Risk': 2, Healthy: 2 }} activeStatuses={['Critical']} />);
  assert.match(html, /aria-pressed="true"[^>]*><span class="kpi-label">Critical/);
  assert.match(html, /aria-pressed="false"[^>]*><span class="kpi-label">At Risk/);
});

test('AccountsView lists projects and the reasons driving account status', () => {
  const html = renderToStaticMarkup(
    <AccountsView
      items={[{
        clientId: 'c1', clientName: 'Northwind', accountOwnerName: 'Priya', tier: 'Strategic', region: 'East', status: 'Critical',
        projectCounts: { Critical: 1, 'At Risk': 0, Healthy: 1 },
        projects: [{ id: 'p1', name: 'WMS Rollout', status: 'Critical' }, { id: 'p2', name: 'Portal', status: 'Healthy' }],
        reasons: ['WMS Rollout: Critical — milestone overdue'],
      }]}
      onOpenClient={() => {}}
      onOpenProject={() => {}}
    />,
  );
  assert.match(html, /Northwind/);
  assert.match(html, /Driving this status/);
  assert.match(html, /WMS Rollout: Critical — milestone overdue/);
});

test('SummaryContent shows week-on-week deltas and movement', () => {
  const html = renderToStaticMarkup(
    <SummaryContent
      summary={{
        totals: { total: 3, Critical: 2, 'At Risk': 0, Healthy: 1 },
        previousTotals: { total: 3, Critical: 1, 'At Risk': 1, Healthy: 1 },
        escalated: [{ id: 'p1', name: 'WMS', clientName: 'NW', previousStatus: 'At Risk', status: 'Critical' }],
        improved: [],
        attention: [{ id: 'p1', name: 'WMS', clientName: 'NW', accountOwnerName: 'Priya', status: 'Critical', topReasons: ['late'] }],
        indicatorBreakdown: [{ indicator: 'Overdue milestones', projectCount: 2 }],
      }}
    />,
  );
  assert.match(html, /\+1 vs last week/);
  assert.match(html, /-1 vs last week/);
  assert.match(html, /no change/);
  assert.match(html, /Movement since last week/);
  assert.match(html, /Overdue milestones/);
});
