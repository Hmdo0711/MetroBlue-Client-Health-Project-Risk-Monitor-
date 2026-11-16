import { STATUSES } from '../lib/query.js';
import { statusClass } from '../lib/format.js';

/**
 * Count tiles; clicking one toggles that status filter.
 * `statusCounts` are totals before the status filter is applied, so tiles never drop to 0
 * just because another status is selected. `counts.total` is what is currently listed.
 */
export function KpiTiles({ counts, statusCounts = counts, activeStatuses = [], onToggle, noun = 'projects' }) {
  return (
    <div className="kpis" role="group" aria-label="Filter by status">
      {STATUSES.map((s) => {
        const active = activeStatuses.includes(s);
        return (
          <button
            key={s}
            type="button"
            className={`kpi kpi-${statusClass(s)}${active ? ' kpi-active' : ''}`}
            aria-pressed={active}
            onClick={() => onToggle?.(s)}
          >
            <span className="kpi-label">{s}</span>
            <span className="kpi-value">{statusCounts?.[s] ?? 0}</span>
            <span className="kpi-sub">{noun}</span>
          </button>
        );
      })}
      <div className="kpi kpi-total">
        <span className="kpi-label">In view</span>
        <span className="kpi-value">{counts?.total ?? 0}</span>
        <span className="kpi-sub">{noun}</span>
      </div>
    </div>
  );
}
