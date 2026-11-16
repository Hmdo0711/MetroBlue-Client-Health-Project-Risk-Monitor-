import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildWeeklySummary, summaryToCSV, summaryToMarkdown, summaryToHTML } from '../src/services/summary.js';
import { createWeeklyScheduler, deliverSummary } from '../src/services/notifications.js';
import { createApp } from '../src/app.js';
import { buildSeed } from '../src/data/seed.js';
import { testConfig } from './helpers.js';

const NOW = new Date('2026-11-12T12:00:00Z'); // Thursday; week starts Monday 2026-11-09

const view = (id, status, reasons = [], extra = {}) => ({
  id,
  name: `Project ${id}`,
  clientId: 'c1',
  clientName: 'Client One',
  accountOwnerName: 'Owner',
  status,
  score: reasons.length * 3,
  statusExplanation: 'x',
  reasons: reasons.map((m) => ({ message: m, level: 'risk', indicator: 'Overdue milestones' })),
  ...extra,
});

describe('buildWeeklySummary', () => {
  const projects = [view('a', 'Critical', ['late']), view('b', 'At Risk', ['blocked']), view('c', 'Healthy'), view('d', 'Healthy')];
  const s = buildWeeklySummary({
    projects,
    now: NOW,
    previousSnapshot: { weekStart: '2026-11-02', statuses: { a: 'At Risk', b: 'At Risk', c: 'Critical' } },
  });

  test('period is the Monday–Sunday week containing now', () => {
    assert.equal(s.periodStart, '2026-11-09');
    assert.equal(s.periodEnd, '2026-11-15');
  });

  test('totals and previous totals', () => {
    assert.deepEqual(s.totals, { total: 4, Healthy: 2, 'At Risk': 1, Critical: 1 });
    assert.deepEqual(s.previousTotals, { total: 3, Healthy: 0, 'At Risk': 2, Critical: 1 });
  });

  test('movement: escalated, improved, new', () => {
    assert.deepEqual(s.escalated.map((r) => r.id), ['a']);
    assert.deepEqual(s.improved.map((r) => r.id), ['c']);
    assert.equal(s.rows.find((r) => r.id === 'd').change, 'new');
    assert.equal(s.rows.find((r) => r.id === 'b').change, 'unchanged');
  });

  test('attention list excludes Healthy projects', () => {
    assert.deepEqual(s.attention.map((r) => r.id), ['a', 'b']);
  });

  test('without a previous snapshot there is no movement', () => {
    const none = buildWeeklySummary({ projects, now: NOW });
    assert.equal(none.previousTotals, null);
    assert.equal(none.escalated.length, 0);
  });
});

describe('export formats', () => {
  const s = buildWeeklySummary({
    projects: [
      view('a', 'Critical', ['Milestone "UAT", 3 days late'], { clientName: 'Acme, Inc.' }),
      view('b', 'At Risk', ['x'], { clientName: '=HYPERLINK("http://evil")' }),
    ],
    now: NOW,
  });

  test('CSV has a header row, escapes commas/quotes and neutralises formulas', () => {
    const csv = summaryToCSV(s);
    const [header, row, formulaRow] = csv.trim().split('\r\n');
    assert.match(header, /^Week starting,Client,Project/);
    assert.match(row, /"Acme, Inc\."/);
    assert.match(row, /""UAT""/);
    assert.match(formulaRow, /^2026-11-09,"'=HYPERLINK/, 'cell starting with = is prefixed with a quote');
  });

  test('Markdown includes counts and reasons', () => {
    const md = summaryToMarkdown(s);
    assert.match(md, /Critical: \*\*1\*\*/);
    assert.match(md, /Milestone "UAT", 3 days late/);
  });

  test('HTML escapes user content', () => {
    const html = summaryToHTML(buildWeeklySummary({ projects: [view('x', 'At Risk', ['<script>alert(1)</script>'])], now: NOW }));
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('delivery and scheduling', () => {
  test('distributeWeekly writes one summary per entitled user, scoped, and records a snapshot', async () => {
    const config = testConfig();
    const app = createApp({ config, dataset: buildSeed(NOW), clock: () => NOW });
    const results = await app.distributeWeekly(NOW);
    assert.deepEqual(results.map((r) => r.userId).sort(), ['u-dm1', 'u-exec']);
    const dm = fs.readFileSync(path.join(config.varDir, 'outbox', '2026-11-09', 'u-dm1.md'), 'utf8');
    assert.match(dm, /Your team’s accounts/);
    assert.ok(!dm.includes('Atlas Manufacturing'), 'delivery manager summary excludes other teams');
    const snaps = JSON.parse(fs.readFileSync(path.join(config.varDir, 'snapshots.json'), 'utf8'));
    assert.equal(snaps[0].weekStart, '2026-11-09');
    assert.equal(Object.keys(snaps[0].statuses).length, app.repo.projects.length);
  });

  test('webhook receives a JSON payload', async () => {
    const config = testConfig();
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, status: 200 };
    };
    const app = createApp({ config, dataset: buildSeed(NOW), clock: () => NOW });
    const result = await deliverSummary({ summary: app.summaryFor(app.repo.getUser('u-exec')), user: app.repo.getUser('u-exec'), outboxDir: config.varDir, webhookUrl: 'https://hooks.example/x', fetchImpl });
    assert.deepEqual(result.webhook, { ok: true, status: 200 });
    assert.equal(calls[0].body.to, 'dana.whitfield@metroblue.example');
    assert.match(calls[0].body.text, /Weekly|weekly/);
  });

  test('scheduler fires once per week on the configured day/hour and survives restarts', async () => {
    const { varDir } = testConfig();
    let runs = 0;
    let clock = new Date(2026, 10, 9, 7, 30); // Monday 07:30 local
    const make = () => createWeeklyScheduler({ run: async () => runs++, dayOfWeek: 1, hour: 8, stateDir: varDir, clock: () => clock, logger: { error() {} } });
    const s = make();
    assert.equal(await s.tick(), false, 'too early');
    clock = new Date(2026, 10, 9, 8, 1);
    assert.equal(await s.tick(), true);
    assert.equal(await s.tick(), false, 'already ran this week');
    assert.equal(await make().tick(), false, 'state persisted across restart');
    clock = new Date(2026, 10, 10, 9, 0); // Tuesday
    assert.equal(await s.tick(), false);
    clock = new Date(2026, 10, 16, 8, 0); // next Monday
    assert.equal(await s.tick(), true);
    assert.equal(runs, 2);
  });
});
