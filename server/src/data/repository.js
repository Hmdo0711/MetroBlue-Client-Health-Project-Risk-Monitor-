import fs from 'node:fs';
import path from 'node:path';
import { buildSeed } from './seed.js';
import { assessProject, assessClient, statusRank } from '../engine/health.js';
import { DEFAULT_RULES } from '../config/rules.js';
import { isoDate, weekStart, addDays } from '../engine/dates.js';

const COLLECTIONS = ['milestones', 'checklistItems', 'blockers', 'activities', 'updates'];

/**
 * Load the raw dataset.
 *
 * Integration point: to run against MetroBlue's real data, set DATA_FILE to a JSON
 * export with the same shape as src/data/seed.js, or replace this function with an
 * adapter that calls MetroBlue's project system. Nothing else needs to change.
 */
export function loadDataset({ now = new Date(), dataFile = process.env.DATA_FILE } = {}) {
  if (dataFile) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(dataFile), 'utf8'));
    for (const key of ['users', 'clients', 'projects', ...COLLECTIONS]) raw[key] ??= [];
    return raw;
  }
  return buildSeed(now);
}

/**
 * In-memory repository over a dataset. Provides lookups and computes assessments.
 */
export function createRepository(dataset, { rules = DEFAULT_RULES } = {}) {
  const usersById = new Map(dataset.users.map((u) => [u.id, u]));
  const clientsById = new Map(dataset.clients.map((c) => [c.id, c]));
  const projectsById = new Map(dataset.projects.map((p) => [p.id, p]));

  const byProject = {};
  for (const key of COLLECTIONS) {
    byProject[key] = new Map();
    for (const row of dataset[key] ?? []) {
      if (!byProject[key].has(row.projectId)) byProject[key].set(row.projectId, []);
      byProject[key].get(row.projectId).push(row);
    }
  }

  const related = (projectId) =>
    Object.fromEntries(COLLECTIONS.map((key) => [key, byProject[key].get(projectId) ?? []]));

  const activeProjects = () => dataset.projects.filter((p) => !p.closed && p.status !== 'closed');

  function describeProject(project, assessment) {
    const client = clientsById.get(project.clientId);
    const owner = client ? usersById.get(client.accountOwnerId) : null;
    const pm = project.projectManagerId ? usersById.get(project.projectManagerId) : null;
    return {
      id: project.id,
      name: project.name,
      clientId: project.clientId,
      clientName: client?.name ?? 'Unknown client',
      accountOwnerId: client?.accountOwnerId ?? null,
      accountOwnerName: owner?.name ?? 'Unassigned',
      projectManagerName: pm?.name ?? 'Unassigned',
      phase: project.phase,
      startDate: project.startDate,
      endDate: project.endDate,
      contractValue: project.contractValue,
      ...assessment,
    };
  }

  function assessAll(now = new Date()) {
    return activeProjects()
      .map((p) => describeProject(p, assessProject({ project: p, ...related(p.id) }, now, rules)))
      .sort(bySeverity);
  }

  function projectDetail(projectId, now = new Date()) {
    const project = projectsById.get(projectId);
    if (!project) return null;
    const rel = related(projectId);
    const view = describeProject(project, assessProject({ project, ...rel }, now, rules));
    const userName = (id) => usersById.get(id)?.name ?? id;
    return {
      ...view,
      milestones: [...rel.milestones].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      checklistItems: [...rel.checklistItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
      blockers: [...rel.blockers].sort((a, b) => (a.resolvedAt ? 1 : 0) - (b.resolvedAt ? 1 : 0)),
      activities: [...rel.activities].sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor)),
      updates: [...rel.updates]
        .sort((a, b) => b.postedAt.localeCompare(a.postedAt))
        .map((u) => ({ ...u, authorName: userName(u.authorId) })),
    };
  }

  function assessClients(projectViews) {
    const grouped = new Map();
    for (const view of projectViews) {
      if (!grouped.has(view.clientId)) grouped.set(view.clientId, []);
      grouped.get(view.clientId).push({ ...view, projectName: view.name });
    }
    return [...grouped.entries()]
      .map(([clientId, views]) => {
        const client = clientsById.get(clientId) ?? { id: clientId, name: clientId };
        const owner = usersById.get(client.accountOwnerId);
        return {
          ...assessClient(client, views),
          clientName: client.name,
          region: client.region,
          tier: client.tier,
          accountOwnerId: client.accountOwnerId,
          accountOwnerName: owner?.name ?? 'Unassigned',
          projects: views.map((v) => ({ id: v.id, name: v.name, status: v.status, score: v.score })),
        };
      })
      .sort(bySeverity);
  }

  function baselineSnapshot(now = new Date()) {
    const base = dataset.baselineSnapshot;
    if (!base) return null;
    return { ...base, weekStart: base.weekStart ?? isoDate(addDays(weekStart(now), -7)) };
  }

  return {
    rules,
    users: dataset.users,
    clients: dataset.clients,
    projects: dataset.projects,
    getUser: (id) => usersById.get(id) ?? null,
    getUserByToken: (token) => dataset.users.find((u) => u.token && u.token === token) ?? null,
    getClient: (id) => clientsById.get(id) ?? null,
    getProject: (id) => projectsById.get(id) ?? null,
    assessAll,
    assessClients,
    projectDetail,
    baselineSnapshot,
  };
}

export function bySeverity(a, b) {
  return (
    statusRank(b.status) - statusRank(a.status) ||
    b.score - a.score ||
    String(a.clientName ?? a.name).localeCompare(String(b.clientName ?? b.name))
  );
}
