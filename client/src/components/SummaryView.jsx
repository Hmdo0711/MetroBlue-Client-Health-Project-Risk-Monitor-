import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { StatusBadge } from './StatusBadge.jsx';
import { formatDate } from '../lib/format.js';

function Delta({ now, before }) {
  if (before === null || before === undefined) return null;
  const d = now - before;
  if (d === 0) return <span className="delta">no change</span>;
  return <span className="delta">{`${d > 0 ? '+' : ''}${d} vs last week`}</span>;
}

export function SummaryContent({ summary }) {
  const t = summary.totals;
  const p = summary.previousTotals;
  const max = Math.max(1, ...summary.indicatorBreakdown.map((i) => i.projectCount));
  return (
    <>
      <div className="summary-tiles">
        {[
          ['Critical', 'critical'],
          ['At Risk', 'risk'],
          ['Healthy', 'healthy'],
        ].map(([s, cls]) => (
          <div key={s} className={`kpi kpi-${cls} kpi-static`}>
            <span className="kpi-label">{s}</span>
            <span className="kpi-value">{t[s]}</span>
            <Delta now={t[s]} before={p?.[s]} />
          </div>
        ))}
      </div>

      {(summary.escalated.length > 0 || summary.improved.length > 0) && (
        <section className="card">
          <h3>Movement since last week</h3>
          <ul className="movement">
            {summary.escalated.map((r) => (
              <li key={r.id}>
                <span className="arrow up" aria-label="escalated">
                  ↑
                </span>
                <strong>{r.name}</strong> <span className="muted">({r.clientName})</span> {r.previousStatus} → <StatusBadge status={r.status} size="sm" />
              </li>
            ))}
            {summary.improved.map((r) => (
              <li key={r.id}>
                <span className="arrow down" aria-label="improved">
                  ↓
                </span>
                {r.name} <span className="muted">({r.clientName})</span> {r.previousStatus} → <StatusBadge status={r.status} size="sm" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>Projects needing attention</h3>
        {summary.attention.length === 0 && <p className="muted">Nothing is At Risk or Critical this week.</p>}
        <ul className="attention">
          {summary.attention.map((r) => (
            <li key={r.id}>
              <div className="attention-head">
                <StatusBadge status={r.status} size="sm" />
                <strong>{r.name}</strong>
                <span className="muted">
                  {r.clientName} · {r.accountOwnerName}
                </span>
              </div>
              <ul className="attention-reasons">
                {r.topReasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {summary.indicatorBreakdown.length > 0 && (
        <section className="card">
          <h3>Most common risk drivers</h3>
          <div className="bars">
            {summary.indicatorBreakdown.map((i) => (
              <div key={i.indicator} className="bar-row">
                <span className="bar-label">{i.indicator}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${(i.projectCount / max) * 100}%` }} />
                </span>
                <span className="bar-value">{i.projectCount}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export function SummaryView({ me }) {
  const allowed = me?.permissions.includes('export_summary');
  const [state, setState] = useState({ loading: true });
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    setState({ loading: true });
    api
      .summary()
      .then((summary) => live && setState({ summary }))
      .catch((error) => live && setState({ error }));
    return () => {
      live = false;
    };
  }, [allowed, me?.id]);

  if (!allowed) {
    return (
      <div className="empty">
        The weekly management summary is available to delivery managers and executives. Your role ({me?.roleLabel}) can still view project and account health.
      </div>
    );
  }
  if (state.loading) return <div className="empty">Building summary…</div>;
  if (state.error) return <div className="empty error">{state.error.message}</div>;

  const s = state.summary;
  const send = async () => {
    setNotice({ kind: 'info', text: 'Sending…' });
    try {
      const r = await api.sendSummary();
      setNotice({ kind: 'ok', text: `Summary delivered for ${r.to}${r.webhook ? (r.webhook.ok ? ' and posted to the notification webhook' : ' (webhook failed)') : ''}.` });
    } catch (e) {
      setNotice({ kind: 'error', text: e.message });
    }
  };

  return (
    <div className="summary">
      <div className="summary-head">
        <div>
          <h2>Week of {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}</h2>
          <div className="muted small">
            {s.scopeLabel} · {s.totals.total} active projects
            {s.comparedWithWeekOf ? ` · compared with week of ${formatDate(s.comparedWithWeekOf)}` : ''}
          </div>
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={() => api.download('csv')}>
            Export CSV
          </button>
          <button type="button" className="btn" onClick={() => api.download('md')}>
            Markdown
          </button>
          <button type="button" className="btn" onClick={() => api.download('html')}>
            Email HTML
          </button>
          <button type="button" className="btn btn-primary" onClick={send}>
            Send to me now
          </button>
        </div>
      </div>
      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          {notice.text}
        </div>
      )}
      <SummaryContent summary={s} />
      <p className="muted small">Sent automatically every Monday morning to delivery managers and executives, scoped to their own accounts.</p>
    </div>
  );
}
