import type { Request } from 'express';
import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog';

interface AuditEntry {
  action: string;
  entityType: 'org' | 'member' | 'invite' | 'project' | 'task' | 'billing';
  entityId?: Types.ObjectId;
  /** Written without the actor's name: "created project Website". */
  summary: string;
  meta?: Record<string, unknown>;
}

/** Records an audit event for the current tenant. Never fails the request it is describing. */
export async function audit(req: Request, entry: AuditEntry): Promise<void> {
  try {
    await AuditLog.create({ ...entry, orgId: req.tenant?.org._id, actorId: req.userId ?? null });
  } catch (err) {
    console.error('Failed to write audit log', err);
  }
}
