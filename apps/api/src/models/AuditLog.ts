import { Schema, model } from 'mongoose';
import { tenantField, tenantPlugin } from '../lib/tenant';

const auditLogSchema = new Schema(
  {
    ...tenantField,
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Dotted verb, e.g. `task.status_changed`. */
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    /** Human readable, written without the actor's name: "created project Website". */
    summary: { type: String, required: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ orgId: 1, createdAt: -1 });
auditLogSchema.plugin(tenantPlugin);

export const AuditLog = model('AuditLog', auditLogSchema);
