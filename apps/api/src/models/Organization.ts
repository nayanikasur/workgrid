import { PLAN_IDS, ROLES } from '@workgrid/shared';
import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    plan: { type: String, enum: PLAN_IDS, required: true, default: 'free' },
    stripeCustomerId: { type: String, index: true },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: { type: String },
    currentPeriodEnd: { type: Date },
  },
  { timestamps: true },
);

export type OrgDoc = HydratedDocument<InferSchemaType<typeof organizationSchema>>;
export const Organization = model('Organization', organizationSchema);

/**
 * Membership and Invite are looked up across tenants (e.g. "which orgs am I in?",
 * "which org does this invite token belong to?"), so they carry an explicit
 * orgId instead of using the tenant plugin.
 */
const membershipSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ROLES, required: true },
  },
  { timestamps: true },
);
membershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });

export type MembershipDoc = HydratedDocument<InferSchemaType<typeof membershipSchema>>;
export const Membership = model('Membership', membershipSchema);

const inviteSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ROLES, required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true },
);
inviteSchema.index({ orgId: 1, email: 1 }, { unique: true });

export const Invite = model('Invite', inviteSchema);
