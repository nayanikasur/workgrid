import type { Role } from '@workgrid/shared';
import type { OrgDoc } from '../models/Organization';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. */
      userId?: string;
      /** Set by `resolveTenant`. */
      tenant?: { org: OrgDoc; role: Role; membershipId: string };
    }
  }
}

export {};
