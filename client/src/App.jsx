import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { parseLocation, stateToLocation, filtersToQuery, toggleStatus, EMPTY_FILTERS } from './lib/query.js';
import { formatDate } from './lib/format.js';
import { KpiTiles } from './components/KpiTiles.jsx';
import { FilterBar } from './components/FilterBar.jsx';
import { ProjectTable } from './components/ProjectTable.jsx';
import { ProjectDrawer } from './components/ProjectDrawer.jsx';
import { AccountsView } from './components/AccountsView.jsx';
import { SummaryView } from './components/SummaryView.jsx';

const TABS = [
  ['projects', 'Projects'],
  ['accounts', 'Accounts'],
  ['summary', 'Weekly summary'],
];

/** Sign in: use the stored token, or in dev mode fall back to the first demo user. */
function useSession() {
  const [session, setSession] = useState({ loading: true });

  const load = useCallback(async () => {
    setSession((s) => ({ ...s, loading: true }));
    const devUsers = await api.devUsers().catch(() => null);
    try {
      if (!getToken() && devUsers?.length) setToken(devUsers[0].token);
      setSession({ me: await api.me(), devUsers });
    } catch (error) {
      if (error.status === 401 && devUsers?.length && getToken() !== devUsers[0].token) {
        setToken(devUsers[0].token);
        return load();
      }
      setSession({ error, devUsers });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchUser = (token) => {
    setToken(token);
    load();
  };
  return { ...session, switchUser };
}

export function App() {
  const session = useSession();
  const [{ view, filters, selected }, setNav] = useState(() => parseLocation(window.location.search));
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState({ loading: true });

  // Keep the URL shareable and in sync with view + filters.
  useEffect(() => {
    const next = stateToLocation({ view, filters, selected });
    if (next !== window.location.search) window.history.replaceState(null, '', `${window.location.pathname}${next}`);
  }, [view, filters, selected]);

  useEffect(() => {
    const onPop = () => setNav(parseLocation(window.location.search));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const meId = session.me?.id;
  useEffect(() => {
    if (!meId) return;
    api.meta().then(setMeta).catch(() => setMeta(null));
  }, [meId]);

  const query = filtersToQuery(filters);
  useEffect(() => {
    if (!meId || view === 'summary') return;
    let live = true;
    setData((d) => ({ ...d, loading: true }));
    const load = view === 'accounts' ? api.clients : api.projects;
    load(query)
      .then((res) => live && setData({ ...res, view }))
      .catch((error) => live && setData({ error }));
    return () => {
      live = false;
    };
  }, [meId, view, query]);

  const setFilters = (f) => setNav((n) => ({ ...n, filters: f }));
  const setView = (v) => setNav((n) => ({ ...n, view: v }));
  const select = (id) => setNav((n) => ({ ...n, selected: id }));
  const closeDrawer = useCallback(() => setNav((n) => ({ ...n, selected: null })), []);

  if (session.error && !session.me) {
    return (
      <div className="fatal">
        <h1>Sign-in required</h1>
        <p>{session.error.status === 401 ? 'Your session could not be verified. Sign in through MetroBlue SSO and reload.' : session.error.message}</p>
      </div>
    );
  }

  const asOf = meta?.asOf ?? data.asOf;
  const items = data.view === view ? (data.items ?? []) : [];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            MB
          </span>
          <div>
            <div className="brand-name">MetroBlue</div>
            <div className="brand-sub">Client Health &amp; Project Risk</div>
          </div>
        </div>
        <nav className="tabs" aria-label="Views">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" className={`tab${view === id ? ' tab-active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="who">
          {session.me && (
            <div className="who-text">
              <div className="who-name">{session.me.name}</div>
              <div className="who-scope">
                {session.me.roleLabel} · {session.me.scopeLabel}
              </div>
            </div>
          )}
          {session.devUsers?.length > 0 && (
            <label className="switcher">
              <span className="sr-only">View as (demo)</span>
              <select value={getToken() ?? ''} onChange={(e) => session.switchUser(e.target.value)} title="Demo only: view the app as another user">
                {session.devUsers.map((u) => (
                  <option key={u.id} value={u.token}>
                    View as {u.name} — {u.roleLabel}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      <main className="main">
        <div className="page-head">
          <h1>{TABS.find(([id]) => id === view)[1]}</h1>
          {asOf && <div className="muted small">Assessed {formatDate(asOf)} · statuses recalculated on every load</div>}
        </div>

        {view !== 'summary' && (
          <>
            <KpiTiles
              counts={data.counts}
              statusCounts={data.statusCounts}
              activeStatuses={filters.statuses}
              noun={view === 'accounts' ? 'accounts' : 'projects'}
              onToggle={(s) => setFilters({ ...filters, statuses: toggleStatus(filters.statuses, s) })}
            />
            <FilterBar meta={meta} filters={filters} onChange={setFilters} />
            {data.error && <div className="empty error">{data.error.message}</div>}
            {!data.error && data.view !== view && <div className="empty">Loading…</div>}
            {!data.error && data.view === view && view === 'projects' && <ProjectTable items={items} asOf={asOf} selectedId={selected} onSelect={select} />}
            {!data.error && data.view === view && view === 'accounts' && (
              <AccountsView
                items={items}
                onOpenProject={select}
                onOpenClient={(clientId) => setNav((n) => ({ ...n, view: 'projects', filters: { ...EMPTY_FILTERS, clientId } }))}
              />
            )}
          </>
        )}

        {view === 'summary' && <SummaryView me={session.me} />}
      </main>

      {selected && session.me && <ProjectDrawer key={`${selected}-${meId}`} projectId={selected} asOf={asOf} onClose={closeDrawer} />}
    </div>
  );
}
