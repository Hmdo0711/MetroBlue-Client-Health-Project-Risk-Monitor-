import { StatusBadge } from './StatusBadge.jsx';
import { TopReason } from './ReasonList.jsx';
import { relativeDays, daysAgo } from '../lib/format.js';

export function ProjectTable({ items, asOf, selectedId, onSelect }) {
  if (!items.length) {
    return <div className="empty">No projects match these filters.</div>;
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Status</th>
            <th scope="col">Project</th>
            <th scope="col">Account owner</th>
            <th scope="col" className="col-why">
              Why
            </th>
            <th scope="col">Last update</th>
            <th scope="col" className="num" title="Weighted count of findings, used for ranking">
              Risk score
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => {
            const stale = daysAgo(p.lastUpdateAt, asOf) > 14;
            return (
              <tr
                key={p.id}
                className={`row${selectedId === p.id ? ' row-selected' : ''}`}
                tabIndex={0}
                aria-label={`${p.name}, ${p.status}. Open details`}
                onClick={() => onSelect(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(p.id))}
              >
                <td>
                  <StatusBadge status={p.status} />
                </td>
                <td>
                  <div className="cell-title">{p.name}</div>
                  <div className="cell-sub">
                    {p.clientName} · {p.phase}
                  </div>
                </td>
                <td>{p.accountOwnerName}</td>
                <td className="col-why">
                  <TopReason reasons={p.reasons} />
                </td>
                <td className={stale ? 'stale' : ''}>{relativeDays(p.lastUpdateAt, asOf)}</td>
                <td className="num">
                  <span className="score">{p.score}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
