import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge } from './StatusBadge.jsx';
import { ReasonList } from './ReasonList.jsx';
import { formatDate, formatCurrency, relativeDays } from '../lib/format.js';

export function ProjectDrawer({ projectId, asOf, onClose }) {
  const [state, setState] = useState({ loading: true });
  const closeRef = useRef(null);

  useEffect(() => {
    let live = true;
    setState({ loading: true });
    api
      .project(projectId)
      .then((data) => live && setState({ data }))
      .catch((error) => live && setState({ error }));
    return () => {
      live = false;
    };
  }, [projectId]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const p = state.data;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div>
            <div className="eyebrow">{p?.clientName ?? ' '}</div>
            <h2 id="drawer-title">{p?.name ?? 'Loading…'}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close details">
            ✕
          </button>
        </div>

        {state.loading && <div className="drawer-body muted">Loading project…</div>}
        {state.error && (
          <div className="drawer-body error">{state.error.status === 404 ? 'This project is not available to you.' : state.error.message}</div>
        )}

        {p && (
          <div className="drawer-body">
            <section className="status-panel">
              <StatusBadge status={p.status} size="lg" />
              <div>
                <div className="status-why">{p.statusExplanation}</div>
                <div className="muted small">
                  Risk score {p.score} · {p.counts.critical} critical · {p.counts.risk} at risk · {p.counts.watch} watch
                </div>
              </div>
            </section>

            <dl className="facts">
              <div>
                <dt>Account owner</dt>
                <dd>{p.accountOwnerName}</dd>
              </div>
              <div>
                <dt>Project manager</dt>
                <dd>{p.projectManagerName}</dd>
              </div>
              <div>
                <dt>Phase</dt>
                <dd>{p.phase}</dd>
              </div>
              <div>
                <dt>Planned end</dt>
                <dd>{formatDate(p.endDate)}</dd>
              </div>
              <div>
                <dt>Last update</dt>
                <dd>{relativeDays(p.lastUpdateAt, asOf)}</dd>
              </div>
              {'contractValue' in p && (
                <div>
                  <dt>Contract value</dt>
                  <dd>{formatCurrency(p.contractValue)}</dd>
                </div>
              )}
            </dl>

            <h3>Why this status</h3>
            <ReasonList reasons={p.reasons} />

            <h3>Milestones</h3>
            <table className="mini">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>Due</th>
                  <th className="num">Progress</th>
                </tr>
              </thead>
              <tbody>
                {p.milestones.map((m) => (
                  <tr key={m.id} className={m.completedAt ? 'done' : ''}>
                    <td>
                      {m.name} {m.isKey && <span className="tag">Key</span>}
                    </td>
                    <td>{formatDate(m.dueDate)}</td>
                    <td className="num">{m.completedAt ? 'Done' : `${m.progress}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {p.blockers.length > 0 && (
              <>
                <h3>Blockers</h3>
                <ul className="list">
                  {p.blockers.map((b) => (
                    <li key={b.id} className={b.resolvedAt ? 'done' : ''}>
                      <span className={`sev sev-${b.severity}`}>{b.severity}</span> {b.title}
                      <div className="muted small">
                        {b.ownerName} · raised {formatDate(b.raisedAt)}
                        {b.resolvedAt ? ` · resolved ${formatDate(b.resolvedAt)}` : ' · open'}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {p.checklistItems.length > 0 && (
              <>
                <h3>Checklist</h3>
                <ul className="list">
                  {p.checklistItems.map((c) => (
                    <li key={c.id} className={c.done ? 'done' : ''}>
                      {c.done ? '☑' : '☐'} {c.title} <span className="muted small">· due {formatDate(c.dueDate)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {p.activities.length > 0 && (
              <>
                <h3>Activities</h3>
                <ul className="list">
                  {p.activities.map((a) => (
                    <li key={a.id}>
                      <span className={`act act-${a.status}`}>{a.status}</span> {a.title}
                      <span className="muted small">
                        {' '}
                        · {formatDate(a.scheduledFor)}
                        {a.rescheduleCount ? ` · rescheduled ×${a.rescheduleCount}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <h3>Recent updates</h3>
            {p.updates.length ? (
              <ul className="list">
                {p.updates.map((u) => (
                  <li key={u.id}>
                    {u.summary}
                    <div className="muted small">
                      {u.authorName} · {formatDate(u.postedAt)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">No updates recorded.</p>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
