const TOKEN_KEY = 'mb.health.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable — token lives for this page only */
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', raw = false } = {}) {
  const token = getToken();
  const res = await fetch(path, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error ?? message;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, message);
  }
  return raw ? res : res.json();
}

export const api = {
  devUsers: () => request('/api/dev/users'),
  me: () => request('/api/me'),
  meta: () => request('/api/meta'),
  projects: (query) => request(`/api/projects${query ? `?${query}` : ''}`),
  project: (id) => request(`/api/projects/${encodeURIComponent(id)}`),
  clients: (query) => request(`/api/clients${query ? `?${query}` : ''}`),
  summary: () => request('/api/summary/weekly'),
  sendSummary: () => request('/api/summary/weekly/send', { method: 'POST' }),
  /** Download an export with auth headers (a plain link can't carry the bearer token). */
  async download(format) {
    const res = await request(`/api/summary/weekly?format=${format}&download=1`, { raw: true });
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? `summary.${format}`;
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
