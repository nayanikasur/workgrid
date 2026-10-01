import { AsyncLocalStorage } from 'node:async_hooks';
import { Schema, Types, type Query } from 'mongoose';

/**
 * Tenant isolation.
 *
 * Every request under /api/orgs/:orgSlug runs inside an AsyncLocalStorage
 * context holding the resolved org id. Models that use `tenantPlugin` read that
 * context in their query hooks and force an `orgId` filter onto every read and
 * write, so a route handler cannot leak another tenant's rows by forgetting a
 * filter. Outside a request (scripts, webhooks) queries fail closed unless they
 * pass an explicit orgId or opt out with `{ crossTenant: true }`.
 */
const storage = new AsyncLocalStorage<{ orgId: string }>();

export function runWithTenant<T>(orgId: string, fn: () => T): T {
  return storage.run({ orgId }, fn);
}

export function currentOrgId(): string | undefined {
  return storage.getStore()?.orgId;
}

export class TenantContextError extends Error {
  constructor(model: string, op: string) {
    super(`Tenant-scoped ${op} on ${model} without a tenant context or explicit orgId`);
  }
}

/** Spread into a schema definition so the field shows up in inferred types. */
export const tenantField = {
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
} as const;

const QUERY_OPS = [
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'distinct',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne',
] as const;

export function tenantPlugin(schema: Schema) {
  schema.pre(QUERY_OPS as never, function (this: Query<unknown, unknown>) {
    if (this.getOptions().crossTenant) return;
    const orgId = currentOrgId();
    if (orgId) {
      // Overrides anything the caller put in the filter.
      this.where({ orgId: new Types.ObjectId(orgId) });
      return;
    }
    if (this.getFilter().orgId == null) {
      throw new TenantContextError(this.model.modelName, 'query');
    }
  });

  // On `validate` rather than `save` so the orgId is stamped before `required` is checked.
  schema.pre('validate', function () {
    const orgId = currentOrgId();
    if (!orgId) return; // `required: true` still rejects documents with no orgId.
    if (this.get('orgId') == null) {
      this.set('orgId', orgId);
    } else if (String(this.get('orgId')) !== orgId) {
      throw new TenantContextError((this.constructor as { modelName?: string }).modelName ?? '', 'save');
    }
  });

  schema.pre('aggregate', function () {
    if ((this.options as { crossTenant?: boolean }).crossTenant) return;
    const orgId = currentOrgId();
    if (!orgId) throw new TenantContextError(this.model().modelName, 'aggregate');
    this.pipeline().unshift({ $match: { orgId: new Types.ObjectId(orgId) } });
  });
}
