import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createServer } from '../src/http/server.js';
import { buildSeed } from '../src/data/seed.js';
import { testConfig } from './helpers.js';

const NOW = new Date('2026-11-12T12:00:00Z');
let server;
let base;

before(async () => {
  const app = createApp({ config: testConfig(), dataset: buildSeed(NOW), clock: () => NOW });
  server = createServer(app, { logger: { error() {} } });
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const TOKENS = { exec: 'dev-token-dana', dm: 'dev-token-marcus', ao1: 'dev-token-priya', pm: 'dev-token-sam' };
const get = (path, token) => fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const getJson = async (path, token) => (await get(path, token)).json();

describe('authentication', () => {
  test('API requires a valid token', async () => {
    assert.equal((await get('/api/projects')).status, 401);
    assert.equal((await get('/api/projects', 'nope')).status, 401);
    assert.equal((await get('/api/projects', TOKENS.exec)).status, 200);
  });
  test('health endpoint is public', async () => {
    assert.equal((await get('/api/health')).status, 200);
  });
  test('/api/me returns role and permissions', async () => {
    const me = await getJson('/api/me', TOKENS.dm);
    assert.equal(me.id, 'u-dm1');
    assert.ok(me.permissions.includes('export_summary'));
    assert.equal(me.token, undefined, 'token never echoed');
  });
});

describe('GET /api/projects filtering', () => {
  test('returns projects sorted most severe first with reasons', async () => {
    const { items, counts } = await getJson('/api/projects', TOKENS.exec);
    assert.equal(items.length, counts.total);
    assert.equal(items[0].status, 'Critical');
    assert.ok(items[0].reasons.length > 0);
    assert.equal(items.at(-1).status, 'Healthy');
  });

  test('by status (comma list and repeated params)', async () => {
    const a = await getJson('/api/projects?status=Critical,At%20Risk', TOKENS.exec);
    const b = await getJson('/api/projects?status=Critical&status=At%20Risk', TOKENS.exec);
    assert.ok(a.items.every((p) => p.status !== 'Healthy'));
    assert.deepEqual(a.items.map((p) => p.id), b.items.map((p) => p.id));
  });

  test('by client, account owner, project id and search text', async () => {
    const byClient = await getJson('/api/projects?clientId=c-atlas', TOKENS.exec);
    assert.ok(byClient.items.length && byClient.items.every((p) => p.clientId === 'c-atlas'));
    const byOwner = await getJson('/api/projects?ownerId=u-ao2', TOKENS.exec);
    assert.ok(byOwner.items.length && byOwner.items.every((p) => p.accountOwnerId === 'u-ao2'));
    const byProject = await getJson('/api/projects?projectId=p-hh-ehr', TOKENS.exec);
    assert.deepEqual(byProject.items.map((p) => p.id), ['p-hh-ehr']);
    const bySearch = await getJson('/api/projects?q=kyc', TOKENS.exec);
    assert.deepEqual(bySearch.items.map((p) => p.id), ['p-pb-kyc']);
  });

  test('statusCounts ignore the status filter so tiles keep their totals', async () => {
    const all = await getJson('/api/projects', TOKENS.exec);
    const crit = await getJson('/api/projects?status=Critical', TOKENS.exec);
    assert.deepEqual(crit.statusCounts, all.counts);
    assert.equal(crit.counts.total, crit.items.length);
  });

  test('filters cannot widen scope', async () => {
    const { items } = await getJson('/api/projects?clientId=c-atlas', TOKENS.ao1);
    assert.equal(items.length, 0);
  });
});

describe('detail, accounts and meta are permission-scoped', () => {
  test('out-of-scope project detail is 404', async () => {
    assert.equal((await get('/api/projects/p-at-mes', TOKENS.ao1)).status, 404);
    const detail = await getJson('/api/projects/p-nw-wms', TOKENS.ao1);
    assert.ok(Array.isArray(detail.milestones) && Array.isArray(detail.blockers));
  });

  test('accounts roll up per client and respect status filter', async () => {
    const { items } = await getJson('/api/clients?status=Critical', TOKENS.exec);
    assert.ok(items.length > 0 && items.every((c) => c.status === 'Critical'));
    const mine = await getJson('/api/clients', TOKENS.ao1);
    assert.deepEqual(mine.items.map((c) => c.clientId).sort(), ['c-harbor', 'c-northwind']);
  });

  test('meta lists only in-scope filter options', async () => {
    const meta = await getJson('/api/meta', TOKENS.ao1);
    assert.deepEqual(meta.accountOwners.map((o) => o.id), ['u-ao1']);
    assert.equal(meta.clients.length, 2);
  });
});

describe('weekly summary export', () => {
  test('forbidden without export permission', async () => {
    assert.equal((await get('/api/summary/weekly', TOKENS.ao1)).status, 403);
  });

  test('JSON, CSV, Markdown and HTML formats', async () => {
    const json = await getJson('/api/summary/weekly', TOKENS.dm);
    assert.equal(json.periodStart, '2026-11-09');
    assert.ok(json.escalated.length > 0, 'baseline snapshot gives movement');

    const csv = await get('/api/summary/weekly?format=csv&download=1', TOKENS.dm);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(csv.headers.get('content-disposition'), /metroblue-health-summary-2026-11-09\.csv/);
    const lines = (await csv.text()).trim().split('\r\n');
    assert.equal(lines.length, json.totals.total + 1);

    assert.match(await (await get('/api/summary/weekly?format=md', TOKENS.dm)).text(), /^# MetroBlue/);
    assert.match(await (await get('/api/summary/weekly?format=html', TOKENS.dm)).text(), /<!DOCTYPE html>/);
    assert.equal((await get('/api/summary/weekly?format=pdf', TOKENS.dm)).status, 400);
  });

  test('POST send delivers to the requesting manager', async () => {
    const res = await fetch(`${base}/api/summary/weekly/send`, { method: 'POST', headers: { authorization: `Bearer ${TOKENS.dm}` } });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.deepEqual(body.files, ['u-dm1.html', 'u-dm1.md']);
  });
});

describe('header auth mode (behind SSO proxy)', () => {
  test('identifies users by X-Authenticated-Email and disables dev endpoints', async () => {
    const app = createApp({ config: testConfig({ authMode: 'header' }), dataset: buildSeed(NOW), clock: () => NOW });
    const s = createServer(app, { logger: { error() {} } });
    await new Promise((r) => s.listen(0, r));
    const url = `http://127.0.0.1:${s.address().port}`;
    try {
      assert.equal((await fetch(`${url}/api/me`, { headers: { authorization: 'Bearer dev-token-dana' } })).status, 401);
      const me = await (await fetch(`${url}/api/me`, { headers: { 'x-authenticated-email': 'Priya.Raman@metroblue.example' } })).json();
      assert.equal(me.id, 'u-ao1');
      assert.equal((await fetch(`${url}/api/dev/users`)).status, 404);
    } finally {
      s.close();
    }
  });
});
