import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { parseFilters, applyFilters, countByStatus } from '../services/filters.js';
import { summaryToCSV, summaryToHTML, summaryToMarkdown } from '../services/summary.js';
import { hasPermission, PERMISSIONS, publicUser, ROLE_LABELS } from '../auth/permissions.js';
import { STATUS, INDICATORS } from '../engine/health.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.map': 'application/json',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'content-type': 'application/json; charset=utf-8' });
}

/**
 * Authentication.
 *  - AUTH_MODE=dev:    `Authorization: Bearer <token>` using the demo tokens in the dataset.
 *  - AUTH_MODE=header: trust `X-Authenticated-Email`, set by MetroBlue's SSO reverse proxy.
 *                      (Only use behind a proxy that strips this header from client requests.)
 */
function authenticate(req, app) {
  const { authMode } = app.config;
  if (authMode === 'header') {
    const email = req.headers['x-authenticated-email'];
    return email ? (app.repo.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) ?? null) : null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  return match ? app.repo.getUserByToken(match[1].trim()) : null;
}

export function createServer(app, { logger = console } = {}) {
  const routes = [
    ['GET', /^\/api\/health$/, () => ({ ok: true })],

    ['GET', /^\/api\/dev\/users$/, (_ctx) => {
      if (app.config.authMode !== 'dev') throw new HttpError(404, 'Not found');
      return app.repo.users.map((u) => ({ id: u.id, name: u.name, title: u.title, roleLabel: ROLE_LABELS[u.role], token: u.token }));
    }, { public: true }],

    ['GET', /^\/api\/me$/, ({ user, scope }) => publicUser(user, scope)],

    ['GET', /^\/api\/meta$/, ({ user }) => {
      const views = app.projectViewsFor(user);
      const clients = uniqueBy(views.map((v) => ({ id: v.clientId, name: v.clientName })), 'id');
      const owners = uniqueBy(views.map((v) => ({ id: v.accountOwnerId, name: v.accountOwnerName })), 'id');
      const projects = views.map((v) => ({ id: v.id, name: v.name, clientId: v.clientId }));
      return {
        asOf: app.now().toISOString(),
        statuses: Object.values(STATUS),
        indicators: Object.values(INDICATORS),
        clients: sortByName(clients),
        accountOwners: sortByName(owners),
        projects: sortByName(projects),
      };
    }],

    ['GET', /^\/api\/projects$/, ({ user, url }) => {
      const all = app.projectViewsFor(user);
      const filters = parseFilters(url.searchParams);
      const beforeStatus = applyFilters(all, { ...filters, statuses: [] });
      const items = applyFilters(beforeStatus, { statuses: filters.statuses });
      return {
        asOf: app.now().toISOString(),
        counts: countByStatus(items), // what is listed
        statusCounts: countByStatus(beforeStatus), // per-status totals ignoring the status filter (for the tiles)
        totalInScope: all.length,
        items,
      };
    }],

    ['GET', /^\/api\/projects\/([\w-]+)$/, ({ user, params }) => {
      const detail = app.projectDetailFor(user, params[0]);
      // 404 (not 403) so users can't probe for projects outside their permissions.
      if (!detail) throw new HttpError(404, 'Project not found');
      return detail;
    }],

    ['GET', /^\/api\/clients$/, ({ user, url }) => {
      const filters = parseFilters(url.searchParams);
      // Filter projects first (client/owner/project/search), roll up, then filter on account status.
      const projects = applyFilters(app.projectViewsFor(user), { ...filters, statuses: [] });
      const accounts = app.repo.assessClients(projects);
      const items = applyFilters(accounts, { statuses: filters.statuses });
      return { asOf: app.now().toISOString(), counts: countByStatus(items), statusCounts: countByStatus(accounts), items };
    }],

    ['GET', /^\/api\/summary\/weekly$/, ({ user, scope, url, res }) => {
      requirePermission(scope, PERMISSIONS.EXPORT_SUMMARY);
      const summary = app.summaryFor(user);
      const format = url.searchParams.get('format') ?? 'json';
      const name = `metroblue-health-summary-${summary.periodStart}`;
      const download = url.searchParams.get('download') === '1';
      const disposition = (ext) => (download ? { 'content-disposition': `attachment; filename="${name}.${ext}"` } : {});
      if (format === 'csv') return send(res, 200, summaryToCSV(summary), { 'content-type': 'text/csv; charset=utf-8', ...disposition('csv') });
      if (format === 'md') return send(res, 200, summaryToMarkdown(summary), { 'content-type': 'text/markdown; charset=utf-8', ...disposition('md') });
      if (format === 'html') return send(res, 200, summaryToHTML(summary), { 'content-type': 'text/html; charset=utf-8', ...disposition('html') });
      if (format !== 'json') throw new HttpError(400, 'format must be one of json, csv, md, html');
      return summary;
    }],

    ['POST', /^\/api\/summary\/weekly\/send$/, async ({ user, scope }) => {
      requirePermission(scope, PERMISSIONS.EXPORT_SUMMARY);
      const result = await app.sendSummaryTo(user);
      return { delivered: true, to: user.email, files: result.files.map((f) => path.basename(f)), webhook: result.webhook };
    }],
  ];

  async function handleApi(req, res, url) {
    for (const [method, pattern, handler, opts = {}] of routes) {
      const m = pattern.exec(url.pathname);
      if (!m) continue;
      if (req.method !== method) continue;
      let user = null;
      let scope = null;
      if (!opts.public && !url.pathname.endsWith('/health')) {
        user = authenticate(req, app);
        if (!user) throw new HttpError(401, 'Authentication required');
        scope = app.scopeFor(user);
      }
      const result = await handler({ req, res, url, user, scope, params: m.slice(1) });
      if (!res.headersSent && result !== undefined) json(res, 200, result);
      return;
    }
    throw new HttpError(404, 'Not found');
  }

  function serveStatic(req, res, url) {
    const root = app.config.clientDist;
    const indexFile = path.join(root, 'index.html');
    if (!fs.existsSync(indexFile)) {
      return send(res, 503, 'Frontend not built. Run `npm run build` (or `npm run dev`).', { 'content-type': 'text/plain' });
    }
    const requested = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    const inside = requested.startsWith(root + path.sep);
    const file = inside && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : indexFile;
    send(res, 200, fs.readFileSync(file), { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET') serveStatic(req, res, url);
      else throw new HttpError(405, 'Method not allowed');
    } catch (err) {
      const status = err.status ?? 500;
      if (status === 500) logger.error(err);
      if (!res.headersSent) json(res, status, { error: status === 500 ? 'Internal server error' : err.message });
    }
  });
}

function requirePermission(scope, permission) {
  if (!hasPermission(scope, permission)) throw new HttpError(403, `Missing permission: ${permission}`);
}

function uniqueBy(rows, key) {
  return [...new Map(rows.filter((r) => r[key]).map((r) => [r[key], r])).values()];
}

function sortByName(rows) {
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
