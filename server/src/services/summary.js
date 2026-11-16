import { STATUS, statusRank } from '../engine/health.js';
import { addDays, isoDate, weekStart } from '../engine/dates.js';
import { countByStatus } from './filters.js';

/**
 * Build the weekly management summary for a set of (already permission-scoped) projects.
 */
export function buildWeeklySummary({ projects, clients = [], now = new Date(), previousSnapshot = null, recipient = null, scopeLabel = 'All accounts' }) {
  const start = weekStart(now);
  const prev = previousSnapshot?.statuses ?? null;

  const rows = projects.map((p) => {
    const previousStatus = prev ? (prev[p.id] ?? null) : null;
    let change = 'unchanged';
    if (prev && !previousStatus) change = 'new';
    else if (previousStatus && statusRank(p.status) > statusRank(previousStatus)) change = 'escalated';
    else if (previousStatus && statusRank(p.status) < statusRank(previousStatus)) change = 'improved';
    return {
      id: p.id,
      name: p.name,
      clientName: p.clientName,
      accountOwnerName: p.accountOwnerName,
      status: p.status,
      previousStatus,
      change,
      score: p.score,
      statusExplanation: p.statusExplanation,
      reasons: p.reasons.map((r) => r.message),
      topReasons: p.reasons.filter((r) => r.level !== 'watch').slice(0, 3).map((r) => r.message),
    };
  });

  const previousTotals = prev
    ? countByStatus(rows.filter((r) => r.previousStatus).map((r) => ({ status: r.previousStatus })))
    : null;

  const indicatorBreakdown = {};
  for (const p of projects) {
    const seen = new Set(p.reasons.filter((r) => r.level !== 'watch').map((r) => r.indicator));
    for (const ind of seen) indicatorBreakdown[ind] = (indicatorBreakdown[ind] ?? 0) + 1;
  }

  return {
    title: 'MetroBlue weekly delivery health summary',
    scopeLabel,
    recipient: recipient ? { id: recipient.id, name: recipient.name, email: recipient.email } : null,
    periodStart: isoDate(start),
    periodEnd: isoDate(addDays(start, 6)),
    generatedAt: new Date(now).toISOString(),
    comparedWithWeekOf: previousSnapshot?.weekStart ?? null,
    totals: countByStatus(projects),
    previousTotals,
    attention: rows.filter((r) => r.status !== STATUS.HEALTHY),
    escalated: rows.filter((r) => r.change === 'escalated'),
    improved: rows.filter((r) => r.change === 'improved'),
    accountsNeedingAttention: clients
      .filter((c) => c.status !== STATUS.HEALTHY)
      .map((c) => ({ clientName: c.clientName, accountOwnerName: c.accountOwnerName, status: c.status, projectCounts: c.projectCounts })),
    indicatorBreakdown: Object.entries(indicatorBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([indicator, projectCount]) => ({ indicator, projectCount })),
    rows,
  };
}

/* ------------------------------------------------------------------------ */
/* Export formats                                                           */
/* ------------------------------------------------------------------------ */

function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function summaryToCSV(summary) {
  const header = ['Week starting', 'Client', 'Project', 'Account owner', 'Status', 'Previous status', 'Change', 'Risk score', 'Reasons'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of summary.rows) {
    lines.push(
      [summary.periodStart, r.clientName, r.name, r.accountOwnerName, r.status, r.previousStatus ?? '', r.change, r.score, r.reasons.join('; ')]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}

function delta(now, before) {
  if (before === null || before === undefined) return '';
  const d = now - before;
  return d === 0 ? ' (no change)' : ` (${d > 0 ? '+' : ''}${d} vs last week)`;
}

export function summaryToMarkdown(s) {
  const t = s.totals;
  const p = s.previousTotals;
  const out = [];
  out.push(`# ${s.title}`);
  out.push('');
  out.push(`**Week of ${s.periodStart} – ${s.periodEnd}** · Scope: ${s.scopeLabel}${s.recipient ? ` · Prepared for ${s.recipient.name}` : ''}`);
  out.push('');
  out.push('## At a glance');
  out.push('');
  out.push(`- 🔴 Critical: **${t.Critical}**${delta(t.Critical, p?.Critical)}`);
  out.push(`- 🟠 At Risk: **${t['At Risk']}**${delta(t['At Risk'], p?.['At Risk'])}`);
  out.push(`- 🟢 Healthy: **${t.Healthy}**${delta(t.Healthy, p?.Healthy)}`);
  out.push(`- Active projects: ${t.total}`);
  out.push('');

  if (s.escalated.length || s.improved.length) {
    out.push('## Movement since last week');
    out.push('');
    for (const r of s.escalated) out.push(`- ⬆️ **${r.clientName} — ${r.name}**: ${r.previousStatus} → ${r.status}`);
    for (const r of s.improved) out.push(`- ⬇️ ${r.clientName} — ${r.name}: ${r.previousStatus} → ${r.status}`);
    out.push('');
  }

  out.push('## Projects needing attention');
  out.push('');
  if (!s.attention.length) out.push('_No projects are At Risk or Critical this week._');
  for (const r of s.attention) {
    out.push(`### ${r.status === STATUS.CRITICAL ? '🔴' : '🟠'} ${r.clientName} — ${r.name} (${r.status})`);
    out.push(`Account owner: ${r.accountOwnerName} · Risk score ${r.score} · ${r.statusExplanation}`);
    out.push('');
    for (const reason of r.topReasons) out.push(`- ${reason}`);
    out.push('');
  }

  if (s.indicatorBreakdown.length) {
    out.push('## Most common risk drivers');
    out.push('');
    out.push('| Indicator | Projects affected |');
    out.push('| --- | ---: |');
    for (const i of s.indicatorBreakdown) out.push(`| ${i.indicator} | ${i.projectCount} |`);
    out.push('');
  }
  out.push(`_Generated ${s.generatedAt}. Status rules: see docs/CALCULATION_RULES.md._`);
  return out.join('\n') + '\n';
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const COLORS = {
  [STATUS.CRITICAL]: { fg: '#9f1d1d', bg: '#fde8e8' },
  [STATUS.AT_RISK]: { fg: '#8a4b00', bg: '#fff1d6' },
  [STATUS.HEALTHY]: { fg: '#1d6b3a', bg: '#e3f5e9' },
};

function pill(status) {
  const c = COLORS[status];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${c.bg};color:${c.fg};font-weight:600;font-size:12px">${esc(status)}</span>`;
}

/** Self-contained, inline-styled HTML suitable for an email body. */
export function summaryToHTML(s) {
  const t = s.totals;
  const p = s.previousTotals;
  const tile = (label, value, before, status) => {
    const c = COLORS[status];
    return `<td style="padding:12px 16px;background:${c.bg};border-radius:8px;width:33%"><div style="font-size:12px;color:${c.fg};text-transform:uppercase;letter-spacing:.04em">${label}</div><div style="font-size:28px;font-weight:700;color:${c.fg}">${value}</div><div style="font-size:12px;color:#555">${esc(delta(value, before).replace(/[()]/g, '').trim() || '&nbsp;')}</div></td>`;
  };
  const movement = [...s.escalated, ...s.improved]
    .map(
      (r) =>
        `<li>${r.change === 'escalated' ? '⬆️' : '⬇️'} <strong>${esc(r.clientName)} — ${esc(r.name)}</strong>: ${esc(r.previousStatus)} → ${esc(r.status)}</li>`,
    )
    .join('');
  const attention = s.attention
    .map(
      (r) => `<tr>
        <td style="padding:10px 8px;border-top:1px solid #e5e7eb;vertical-align:top">${pill(r.status)}</td>
        <td style="padding:10px 8px;border-top:1px solid #e5e7eb;vertical-align:top"><strong>${esc(r.name)}</strong><br><span style="color:#555">${esc(r.clientName)} · ${esc(r.accountOwnerName)}</span></td>
        <td style="padding:10px 8px;border-top:1px solid #e5e7eb;vertical-align:top"><ul style="margin:0;padding-left:18px">${r.topReasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></td>
      </tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(s.title)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6fa;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f2937">
<div style="max-width:760px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
  <div style="font-size:12px;color:#1d4ed8;font-weight:700;letter-spacing:.08em">METROBLUE</div>
  <h1 style="margin:4px 0 4px;font-size:22px">Weekly delivery health summary</h1>
  <div style="color:#555;font-size:14px">Week of ${esc(s.periodStart)} – ${esc(s.periodEnd)} · ${esc(s.scopeLabel)}${s.recipient ? ` · Prepared for ${esc(s.recipient.name)}` : ''}</div>
  <table role="presentation" style="width:100%;border-spacing:8px;margin:18px -8px"><tr>
    ${tile('Critical', t.Critical, p?.Critical, STATUS.CRITICAL)}
    ${tile('At Risk', t['At Risk'], p?.['At Risk'], STATUS.AT_RISK)}
    ${tile('Healthy', t.Healthy, p?.Healthy, STATUS.HEALTHY)}
  </tr></table>
  ${movement ? `<h2 style="font-size:16px;margin:20px 0 8px">Movement since last week</h2><ul style="margin:0;padding-left:18px;line-height:1.6">${movement}</ul>` : ''}
  <h2 style="font-size:16px;margin:24px 0 8px">Projects needing attention</h2>
  ${attention ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${attention}</table>` : '<p>No projects are At Risk or Critical this week.</p>'}
  <p style="color:#777;font-size:12px;margin-top:24px">Generated ${esc(s.generatedAt)} · ${t.total} active projects in scope.</p>
</div></body></html>
`;
}
