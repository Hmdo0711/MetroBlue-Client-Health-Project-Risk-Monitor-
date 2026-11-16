export const STATUSES = ['Critical', 'At Risk', 'Healthy'];
export const VIEWS = ['projects', 'accounts', 'summary'];

export const EMPTY_FILTERS = Object.freeze({ clientId: '', projectId: '', ownerId: '', q: '', statuses: [] });

/** Parse the browser query string into app state. */
export function parseLocation(search) {
  const p = new URLSearchParams(search);
  const view = VIEWS.includes(p.get('view')) ? p.get('view') : 'projects';
  const statuses = (p.get('status') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => STATUSES.includes(s));
  return {
    view,
    selected: p.get('selected') ?? null,
    filters: {
      clientId: p.get('clientId') ?? '',
      projectId: p.get('projectId') ?? '',
      ownerId: p.get('ownerId') ?? '',
      q: p.get('q') ?? '',
      statuses,
    },
  };
}

/** Filters -> query string for the API (no leading '?'; empty values omitted). */
export function filtersToQuery(filters) {
  const p = new URLSearchParams();
  for (const key of ['clientId', 'projectId', 'ownerId', 'q']) if (filters[key]) p.set(key, filters[key]);
  if (filters.statuses?.length) p.set('status', filters.statuses.join(','));
  return p.toString();
}

/** Full app state -> browser query string (with leading '?', or '' when default). */
export function stateToLocation({ view, filters, selected }) {
  const p = new URLSearchParams(filtersToQuery(filters));
  if (view && view !== 'projects') p.set('view', view);
  if (selected) p.set('selected', selected);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function hasActiveFilters(filters) {
  return Boolean(filters.clientId || filters.projectId || filters.ownerId || filters.q || filters.statuses.length);
}

export function toggleStatus(statuses, status) {
  return statuses.includes(status) ? statuses.filter((s) => s !== status) : [...statuses, status];
}
