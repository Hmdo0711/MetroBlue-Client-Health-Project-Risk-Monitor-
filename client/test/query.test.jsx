import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, stateToLocation, filtersToQuery, toggleStatus, hasActiveFilters, EMPTY_FILTERS } from '../src/lib/query.js';
import { relativeDays, formatCurrency } from '../src/lib/format.js';

test('URL state round-trips', () => {
  const state = {
    view: 'accounts',
    selected: 'p-1',
    filters: { clientId: 'c-1', projectId: '', ownerId: 'u-2', q: 'pos', statuses: ['Critical', 'At Risk'] },
  };
  assert.deepEqual(parseLocation(stateToLocation(state)), state);
});

test('defaults: projects view, no filters, empty query string', () => {
  const s = parseLocation('');
  assert.equal(s.view, 'projects');
  assert.deepEqual(s.filters, { ...EMPTY_FILTERS });
  assert.equal(stateToLocation(s), '');
});

test('unknown statuses and views are ignored', () => {
  const s = parseLocation('?view=admin&status=Critical,Bogus');
  assert.equal(s.view, 'projects');
  assert.deepEqual(s.filters.statuses, ['Critical']);
});

test('API query omits empty values', () => {
  assert.equal(filtersToQuery({ ...EMPTY_FILTERS, statuses: ['At Risk'] }), 'status=At+Risk');
  assert.equal(filtersToQuery(EMPTY_FILTERS), '');
});

test('toggleStatus and hasActiveFilters', () => {
  assert.deepEqual(toggleStatus(['Critical'], 'Healthy'), ['Critical', 'Healthy']);
  assert.deepEqual(toggleStatus(['Critical'], 'Critical'), []);
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, q: 'x' }), true);
});

test('formatting helpers', () => {
  const asOf = new Date('2026-11-12T12:00:00Z');
  assert.equal(relativeDays('2026-11-12', asOf), 'today');
  assert.equal(relativeDays('2026-11-11T20:00:00Z', asOf), 'yesterday');
  assert.equal(relativeDays('2026-10-25', asOf), '18 days ago');
  assert.equal(relativeDays(null, asOf), 'never');
  assert.equal(formatCurrency(480000), '$480,000');
});
