import { LevelChip } from './StatusBadge.jsx';

/** The explanation behind a status: every triggered rule, most severe first. */
export function ReasonList({ reasons, compact = false }) {
  if (!reasons?.length) {
    return <p className="muted reason-empty">No risk indicators triggered.</p>;
  }
  return (
    <ul className={`reasons${compact ? ' reasons-compact' : ''}`}>
      {reasons.map((r, i) => (
        <li key={`${r.ruleId}-${i}`} className={`reason reason-${r.level}`}>
          <LevelChip level={r.level} />
          <div>
            <div className="reason-msg">{r.message}</div>
            {!compact && (
              <div className="reason-meta">
                {r.ruleId} · {r.indicator}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One-line summary for table rows. */
export function TopReason({ reasons }) {
  if (!reasons?.length) return <span className="muted">No issues</span>;
  const [first, ...rest] = reasons;
  return (
    <span className="top-reason">
      <LevelChip level={first.level} /> <span className="top-reason-text">{first.message}</span>
      {rest.length > 0 && <span className="more"> +{rest.length} more</span>}
    </span>
  );
}
