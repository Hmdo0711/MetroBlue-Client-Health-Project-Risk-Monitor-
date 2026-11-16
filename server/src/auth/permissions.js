/**
 * Permission model.
 *
 * The monitor never widens access: a user only sees projects they could already
 * see in MetroBlue. The mapping below mirrors a typical role setup; to reuse
 * MetroBlue's real entitlements, replace `resolveScope` with a call to the
 * existing permission service and return the same shape.
 *
 *   Role               Project visibility                                     Capabilities
 *   executive          all projects                                           view_financials, export_summary
 *   delivery_manager   clients owned by self or anyone in teamMemberIds       view_financials, export_summary
 *   account_owner      clients where they are the account owner               view_financials
 *   project_manager    projects where they are PM or a listed member          —
 *
 * Any user may also hold explicit grants: `clientIds` / `projectIds` arrays.
 */

export const PERMISSIONS = Object.freeze({
  VIEW_FINANCIALS: 'view_financials',
  EXPORT_SUMMARY: 'export_summary',
});

const ROLE_CAPABILITIES = {
  executive: [PERMISSIONS.VIEW_FINANCIALS, PERMISSIONS.EXPORT_SUMMARY],
  delivery_manager: [PERMISSIONS.VIEW_FINANCIALS, PERMISSIONS.EXPORT_SUMMARY],
  account_owner: [PERMISSIONS.VIEW_FINANCIALS],
  project_manager: [],
};

export const ROLE_LABELS = {
  executive: 'Executive',
  delivery_manager: 'Delivery manager',
  account_owner: 'Account owner',
  project_manager: 'Project manager',
};

/**
 * @returns {{ all: boolean, projectIds: Set<string>, permissions: Set<string>, label: string }}
 */
export function resolveScope(user, repo) {
  if (!user) return { all: false, projectIds: new Set(), permissions: new Set(), label: 'No access' };
  const permissions = new Set([...(ROLE_CAPABILITIES[user.role] ?? []), ...(user.extraPermissions ?? [])]);

  if (user.role === 'executive') {
    return { all: true, projectIds: new Set(repo.projects.map((p) => p.id)), permissions, label: 'All accounts' };
  }

  const clientIds = new Set(user.clientIds ?? []);
  const projectIds = new Set(user.projectIds ?? []);

  if (user.role === 'delivery_manager') {
    const owners = new Set([user.id, ...(user.teamMemberIds ?? [])]);
    repo.clients.filter((c) => owners.has(c.accountOwnerId)).forEach((c) => clientIds.add(c.id));
  } else if (user.role === 'account_owner') {
    repo.clients.filter((c) => c.accountOwnerId === user.id).forEach((c) => clientIds.add(c.id));
  } else if (user.role === 'project_manager') {
    repo.projects
      .filter((p) => p.projectManagerId === user.id || (p.memberIds ?? []).includes(user.id))
      .forEach((p) => projectIds.add(p.id));
  }

  for (const p of repo.projects) if (clientIds.has(p.clientId)) projectIds.add(p.id);

  const label =
    user.role === 'delivery_manager'
      ? 'Your team’s accounts'
      : user.role === 'account_owner'
        ? 'Your accounts'
        : 'Your projects';
  return { all: false, projectIds, permissions, label };
}

export function canSeeProject(scope, projectId) {
  return scope.all || scope.projectIds.has(projectId);
}

export function hasPermission(scope, permission) {
  return scope.permissions.has(permission);
}

/** Remove fields the user isn't entitled to. Returns a new object. */
export function redact(view, scope) {
  if (hasPermission(scope, PERMISSIONS.VIEW_FINANCIALS)) return view;
  const { contractValue, ...rest } = view;
  return rest;
}

export function publicUser(user, scope) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    title: user.title,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role] ?? user.role,
    scopeLabel: scope.label,
    permissions: [...scope.permissions],
  };
}
