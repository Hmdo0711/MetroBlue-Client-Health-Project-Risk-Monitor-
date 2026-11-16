import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { buildSeed } from '../src/data/seed.js';
import { resolveScope, redact, hasPermission, PERMISSIONS } from '../src/auth/permissions.js';
import { testConfig } from './helpers.js';

const NOW = new Date('2026-11-12T12:00:00Z');
const app = createApp({ config: testConfig(), dataset: buildSeed(NOW), clock: () => NOW });
const user = (id) => app.repo.getUser(id);
const visible = (id) => app.projectViewsFor(user(id)).map((v) => v.id).sort();

describe('project visibility by role', () => {
  test('executive sees every active project', () => {
    assert.equal(visible('u-exec').length, app.repo.projects.length);
  });

  test('account owner sees only their own clients', () => {
    const views = app.projectViewsFor(user('u-ao1'));
    assert.ok(views.length > 0);
    assert.ok(views.every((v) => v.accountOwnerId === 'u-ao1'));
  });

  test('delivery manager sees their team’s accounts and nothing else', () => {
    const views = app.projectViewsFor(user('u-dm1'));
    const owners = new Set(views.map((v) => v.accountOwnerId));
    assert.deepEqual([...owners].sort(), ['u-ao1', 'u-ao2']);
    assert.ok(!views.some((v) => v.clientId === 'c-atlas'));
  });

  test('project manager sees only assigned projects', () => {
    const expected = app.repo.projects.filter((p) => p.projectManagerId === 'u-pm1' || p.memberIds.includes('u-pm1')).map((p) => p.id).sort();
    assert.deepEqual(visible('u-pm1'), expected);
  });

  test('explicit grants extend scope', () => {
    const u = { id: 'x', role: 'project_manager', projectIds: ['p-at-iot'], clientIds: ['c-brightline'] };
    const scope = resolveScope(u, app.repo);
    assert.ok(scope.projectIds.has('p-at-iot'));
    assert.ok(scope.projectIds.has('p-bl-billing'));
    assert.ok(!scope.projectIds.has('p-nw-wms'));
  });

  test('unknown user / role gets nothing', () => {
    assert.equal(resolveScope(null, app.repo).projectIds.size, 0);
    assert.equal(resolveScope({ id: 'z', role: 'contractor' }, app.repo).projectIds.size, 0);
  });
});

describe('detail access and field redaction', () => {
  test('project outside scope returns null', () => {
    assert.equal(app.projectDetailFor(user('u-ao1'), 'p-at-mes'), null);
    assert.ok(app.projectDetailFor(user('u-ao3'), 'p-at-mes'));
  });

  test('contract value hidden from users without view_financials', () => {
    const [pmView] = app.projectViewsFor(user('u-pm1'));
    const [ownerView] = app.projectViewsFor(user('u-ao1'));
    assert.equal('contractValue' in pmView, false);
    assert.equal(typeof ownerView.contractValue, 'number');
    assert.equal('contractValue' in app.projectDetailFor(user('u-pm1'), pmView.id), false);
  });

  test('redact does not mutate its input', () => {
    const view = { id: 'a', contractValue: 1 };
    redact(view, { permissions: new Set() });
    assert.equal(view.contractValue, 1);
  });

  test('only executives and delivery managers can export the weekly summary', () => {
    const can = (id) => hasPermission(app.scopeFor(user(id)), PERMISSIONS.EXPORT_SUMMARY);
    assert.equal(can('u-exec'), true);
    assert.equal(can('u-dm1'), true);
    assert.equal(can('u-ao1'), false);
    assert.equal(can('u-pm1'), false);
  });
});
