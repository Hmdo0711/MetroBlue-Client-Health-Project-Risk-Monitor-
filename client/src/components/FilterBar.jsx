import { STATUSES, toggleStatus, hasActiveFilters, EMPTY_FILTERS } from '../lib/query.js';
import { statusClass } from '../lib/format.js';

export function FilterBar({ meta, filters, onChange }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const projects = (meta?.projects ?? []).filter((p) => !filters.clientId || p.clientId === filters.clientId);

  return (
    <div className="filters" role="search">
      <label className="field">
        <span>Client</span>
        <select value={filters.clientId} onChange={(e) => set({ clientId: e.target.value, projectId: '' })}>
          <option value="">All clients</option>
          {meta?.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Project</span>
        <select value={filters.projectId} onChange={(e) => set({ projectId: e.target.value })}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Account owner</span>
        <select value={filters.ownerId} onChange={(e) => set({ ownerId: e.target.value })}>
          <option value="">All owners</option>
          {meta?.accountOwners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-grow">
        <span>Search</span>
        <input type="search" placeholder="Project or client name" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
      </label>

      <fieldset className="field status-filter">
        <legend>Status</legend>
        <div className="chips">
          {STATUSES.map((s) => (
            <label key={s} className={`chip chip-${statusClass(s)}${filters.statuses.includes(s) ? ' chip-on' : ''}`}>
              <input type="checkbox" checked={filters.statuses.includes(s)} onChange={() => set({ statuses: toggleStatus(filters.statuses, s) })} />
              {s}
            </label>
          ))}
        </div>
      </fieldset>

      <button type="button" className="btn btn-ghost" disabled={!hasActiveFilters(filters)} onClick={() => onChange({ ...EMPTY_FILTERS })}>
        Clear filters
      </button>
    </div>
  );
}
