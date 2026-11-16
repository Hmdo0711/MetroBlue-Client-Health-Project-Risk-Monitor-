import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRepository, loadDataset } from './data/repository.js';
import { DEFAULT_RULES, mergeRules } from './config/rules.js';
import { resolveScope, canSeeProject, redact, hasPermission, PERMISSIONS } from './auth/permissions.js';
import { createSnapshotStore } from './services/snapshots.js';
import { buildWeeklySummary } from './services/summary.js';
import { deliverSummary } from './services/notifications.js';
import { isoDate, weekStart } from './engine/dates.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT ?? 4000),
    authMode: env.AUTH_MODE ?? 'dev', // 'dev' enables the user switcher + demo tokens
    varDir: path.resolve(env.VAR_DIR ?? path.join(here, '..', 'var')),
    clientDist: path.resolve(env.CLIENT_DIST ?? path.join(here, '..', '..', 'client', 'dist')),
    webhookUrl: env.SUMMARY_WEBHOOK_URL || null,
    schedule: {
      enabled: env.SUMMARY_SCHEDULE !== 'off',
      dayOfWeek: Number(env.SUMMARY_DAY ?? 1),
      hour: Number(env.SUMMARY_HOUR ?? 8),
    },
    rulesFile: env.HEALTH_RULES_FILE || null,
    asOf: env.AS_OF || null, // freeze "today" (YYYY-MM-DD) for demos/tests
  };
}

/**
 * Wire the domain together. Everything the HTTP layer and CLI need goes through here,
 * so permission checks are applied in exactly one place.
 */
export function createApp({ config = loadConfig(), dataset, clock } = {}) {
  const now = clock ?? (() => (config.asOf ? new Date(`${config.asOf}T12:00:00Z`) : new Date()));
  const rules = config.rulesFile
    ? mergeRules(DEFAULT_RULES, JSON.parse(fs.readFileSync(config.rulesFile, 'utf8')))
    : DEFAULT_RULES;
  const repo = createRepository(dataset ?? loadDataset({ now: now() }), { rules });
  const snapshots = createSnapshotStore({ dir: config.varDir, baseline: (n) => repo.baselineSnapshot(n) });

  const scopeFor = (user) => resolveScope(user, repo);

  function projectViewsFor(user, at = now()) {
    const scope = scopeFor(user);
    return repo
      .assessAll(at)
      .filter((v) => canSeeProject(scope, v.id))
      .map((v) => redact(v, scope));
  }

  function projectDetailFor(user, projectId, at = now()) {
    const scope = scopeFor(user);
    if (!canSeeProject(scope, projectId)) return null;
    const detail = repo.projectDetail(projectId, at);
    return detail ? redact(detail, scope) : null;
  }

  function clientViewsFor(user, at = now()) {
    return repo.assessClients(projectViewsFor(user, at));
  }

  function summaryFor(user, at = now()) {
    const scope = scopeFor(user);
    const projects = projectViewsFor(user, at);
    return buildWeeklySummary({
      projects,
      clients: repo.assessClients(projects),
      now: at,
      previousSnapshot: snapshots.previousFor(isoDate(weekStart(at)), at),
      recipient: user,
      scopeLabel: scope.label,
    });
  }

  /** Generate and deliver the summary for every user entitled to receive it, then snapshot. */
  async function distributeWeekly(at = now(), { users } = {}) {
    const recipients = (users ?? repo.users).filter((u) => hasPermission(scopeFor(u), PERMISSIONS.EXPORT_SUMMARY));
    const results = [];
    for (const user of recipients) {
      results.push(
        await deliverSummary({
          summary: summaryFor(user, at),
          user,
          outboxDir: path.join(config.varDir, 'outbox'),
          webhookUrl: config.webhookUrl,
        }),
      );
    }
    snapshots.save(isoDate(weekStart(at)), repo.assessAll(at));
    return results;
  }

  /** On-demand delivery to a single user (does not record a weekly snapshot). */
  async function sendSummaryTo(user, at = now()) {
    return deliverSummary({
      summary: summaryFor(user, at),
      user,
      outboxDir: path.join(config.varDir, 'outbox'),
      webhookUrl: config.webhookUrl,
    });
  }

  return {
    config,
    rules,
    repo,
    now,
    scopeFor,
    projectViewsFor,
    projectDetailFor,
    clientViewsFor,
    summaryFor,
    distributeWeekly,
    sendSummaryTo,
  };
}
