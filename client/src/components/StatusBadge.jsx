import { statusClass, LEVEL_LABEL } from '../lib/format.js';

const ICON = { Critical: '●', 'At Risk': '▲', Healthy: '✓' };

/** Status pill. Shape + text label, so status never relies on colour alone. */
export function StatusBadge({ status, size = 'md' }) {
  return (
    <span className={`badge badge-${statusClass(status)} badge-${size}`}>
      <span aria-hidden="true" className="badge-icon">
        {ICON[status]}
      </span>
      {status}
    </span>
  );
}

export function LevelChip({ level }) {
  return <span className={`level level-${level}`}>{LEVEL_LABEL[level] ?? level}</span>;
}
