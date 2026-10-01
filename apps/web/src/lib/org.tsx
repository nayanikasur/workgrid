import { can, type OrgDTO, type Permission } from '@workgrid/shared';
import { createContext, useContext } from 'react';

export interface OrgContextValue {
  org: OrgDTO;
  /** API path prefix for this tenant, e.g. `/orgs/acme`. */
  base: string;
  can: (permission: Permission) => boolean;
  /** True once the socket has joined this org's room; project rooms can only be joined after that. */
  realtimeReady: boolean;
}

export const OrgContext = createContext<OrgContextValue | null>(null);

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used inside a workspace route');
  return ctx;
}

export function buildOrgContext(org: OrgDTO, realtimeReady: boolean): OrgContextValue {
  return { org, base: `/orgs/${org.slug}`, can: (permission) => can(org.role, permission), realtimeReady };
}

/** React Query keys, all namespaced by tenant so switching workspace never shows stale data. */
export const keys = {
  projects: (slug: string) => ['org', slug, 'projects'] as const,
  members: (slug: string) => ['org', slug, 'members'] as const,
  invites: (slug: string) => ['org', slug, 'invites'] as const,
  tasks: (slug: string, projectId: string) => ['org', slug, 'tasks', projectId] as const,
  comments: (slug: string, taskId: string) => ['org', slug, 'comments', taskId] as const,
  myTasks: (slug: string) => ['org', slug, 'my-tasks'] as const,
  analytics: (slug: string) => ['org', slug, 'analytics'] as const,
  audit: (slug: string) => ['org', slug, 'audit'] as const,
  usage: (slug: string) => ['org', slug, 'usage'] as const,
};
