const DAY = 86_400_000;

const dayStart = (v) => {
  const d = new Date(v);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export function daysAgo(iso, asOf = new Date()) {
  if (!iso) return null;
  return Math.round((dayStart(asOf) - dayStart(iso)) / DAY);
}

export function relativeDays(iso, asOf = new Date()) {
  const n = daysAgo(iso, asOf);
  if (n === null) return 'never';
  if (n === 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n > 0) return `${n} days ago`;
  if (n === -1) return 'tomorrow';
  return `in ${-n} days`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatCurrency(n) {
  if (typeof n !== 'number') return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export const LEVEL_LABEL = { critical: 'Critical', risk: 'At Risk', watch: 'Watch' };

export function statusClass(status) {
  return { Critical: 'critical', 'At Risk': 'risk', Healthy: 'healthy' }[status] ?? 'healthy';
}
