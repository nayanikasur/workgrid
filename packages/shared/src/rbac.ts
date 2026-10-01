export const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'org:update',
  'org:delete',
  'billing:manage',
  'member:invite',
  'member:update_role',
  'member:remove',
  'audit:read',
  'project:create',
  'project:update',
  'project:delete',
  'task:create',
  'task:update',
  'task:delete',
  'comment:create',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MEMBER_PERMISSIONS: Permission[] = [
  'project:create',
  'project:update',
  'task:create',
  'task:update',
  'task:delete',
  'comment:create',
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  'org:update',
  'member:invite',
  'member:update_role',
  'member:remove',
  'audit:read',
  'project:delete',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  viewer: [],
};

export function can(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Lower number = more privileged. Used to stop admins from managing owners. */
export const ROLE_RANK: Record<Role, number> = { owner: 0, admin: 1, member: 2, viewer: 3 };

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};
