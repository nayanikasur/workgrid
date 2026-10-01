import { can, type Permission } from '@workgrid/shared';
import type { NextFunction, Request, Response } from 'express';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { runWithTenant } from '../lib/tenant';
import { verifyAccessToken } from '../lib/tokens';
import { Membership, Organization } from '../models/Organization';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const userId = header?.startsWith('Bearer ') ? verifyAccessToken(header.slice(7)) : null;
  if (!userId) throw unauthorized();
  req.userId = userId;
  next();
}

/**
 * Resolves `:orgSlug` to an org the caller belongs to, then runs the rest of the
 * request inside that tenant's context (see lib/tenant.ts). Non-members get a 404
 * rather than a 403 so workspace slugs can't be enumerated.
 */
export async function resolveTenant(req: Request, _res: Response, next: NextFunction) {
  const org = await Organization.findOne({ slug: String(req.params.orgSlug).toLowerCase() });
  const membership = org && (await Membership.findOne({ orgId: org._id, userId: req.userId }));
  if (!org || !membership) throw notFound('Workspace not found');

  req.tenant = { org, role: membership.role, membershipId: membership.id };
  runWithTenant(org.id, next);
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!can(req.tenant?.role, permission)) throw forbidden();
    next();
  };
}

/** Accessors for handlers mounted behind the middleware above. */
export function authUserId(req: Request): string {
  if (!req.userId) throw unauthorized();
  return req.userId;
}

export function tenantOf(req: Request) {
  if (!req.tenant) throw notFound('Workspace not found');
  return req.tenant;
}
