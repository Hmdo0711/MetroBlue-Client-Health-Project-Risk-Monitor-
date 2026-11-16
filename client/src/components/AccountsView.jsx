import { StatusBadge } from './StatusBadge.jsx';

export function AccountsView({ items, onOpenClient, onOpenProject }) {
  if (!items.length) return <div className="empty">No accounts match these filters.</div>;
  return (
    <div className="accounts">
      {items.map((c) => (
        <article key={c.clientId} className={`account account-${c.status === 'Critical' ? 'critical' : c.status === 'At Risk' ? 'risk' : 'healthy'}`}>
          <header className="account-head">
            <div>
              <h3>{c.clientName}</h3>
              <div className="muted small">
                {c.accountOwnerName} · {c.tier} · {c.region}
              </div>
            </div>
            <StatusBadge status={c.status} />
          </header>

          <div className="account-counts">
            <span>
              <strong>{c.projectCounts.Critical}</strong> critical
            </span>
            <span>
              <strong>{c.projectCounts['At Risk']}</strong> at risk
            </span>
            <span>
              <strong>{c.projectCounts.Healthy}</strong> healthy
            </span>
          </div>

          <ul className="account-projects">
            {c.projects.map((p) => (
              <li key={p.id}>
                <button type="button" className="link" onClick={() => onOpenProject(p.id)}>
                  {p.name}
                </button>
                <StatusBadge status={p.status} size="sm" />
              </li>
            ))}
          </ul>

          {c.reasons.length > 0 && (
            <div className="account-reasons">
              <div className="eyebrow">Driving this status</div>
              <ul>
                {c.reasons.slice(0, 3).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenClient(c.clientId)}>
            View projects →
          </button>
        </article>
      ))}
    </div>
  );
}
