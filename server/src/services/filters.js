import { STATUS } from '../engine/health.js';

const VALID_STATUSES = new Set(Object.values(STATUS));

/** Parse filter query parameters into a normalised filter object. */
export function parseFilters(searchParams) {
  const get = (k) => {
    const v = searchParams.get(k);
    return v && v.trim() ? v.trim() : null;
  };
  const statuses = (searchParams.getAll('status') ?? [])
    .flatMap((s) => s.split(','))
    .map((s) => s.trim())
    .filter((s) => VALID_STATUSES.has(s));
  return {
    clientId: get('clientId'),
    projectId: get('projectId'),
    q: get('q'),
    ownerId: get('ownerId'),
    statuses,
  };
}

/** Apply filters to project views (or client roll-ups, which share clientId/accountOwnerId/status). */
export function applyFilters(rows, { clientId, projectId, q, ownerId, statuses = [] } = {}) {
  const needle = q ? q.toLowerCase() : null;
  return rows.filter((row) => {
    if (clientId && row.clientId !== clientId) return false;
    if (ownerId && row.accountOwnerId !== ownerId) return false;
    if (statuses.length && !statuses.includes(row.status)) return false;
    if (projectId) {
      const ids = row.projects ? row.projects.map((p) => p.id) : [row.id];
      if (!ids.includes(projectId)) return false;
    }
    if (needle) {
      const haystack = [row.name, row.clientName, ...(row.projects ?? []).map((p) => p.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export function countByStatus(rows) {
  const counts = { total: rows.length, [STATUS.HEALTHY]: 0, [STATUS.AT_RISK]: 0, [STATUS.CRITICAL]: 0 };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}
