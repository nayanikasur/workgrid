import { PLANS, isWithinLimit, type PlanId } from '@workgrid/shared';
import Stripe from 'stripe';
import { env } from '../config/env';
import { planLimit } from '../lib/errors';
import { Invite, Membership, Organization, type OrgDoc } from '../models/Organization';
import { Project } from '../models/Project';

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured');
  client ??= new Stripe(env.STRIPE_SECRET_KEY);
  return client;
}

export async function assertCanAddProject(org: OrgDoc) {
  const { projects } = PLANS[org.plan].limits;
  const count = await Project.countDocuments({ orgId: org._id, archived: false });
  if (!isWithinLimit(projects, count)) {
    throw planLimit(`The ${PLANS[org.plan].name} plan allows ${projects} active projects. Upgrade to add more.`);
  }
}

/** Pending invites hold a seat, otherwise a team could over-invite past its limit. */
export async function assertCanAddMember(org: OrgDoc) {
  const { members } = PLANS[org.plan].limits;
  const [current, pending] = await Promise.all([
    Membership.countDocuments({ orgId: org._id }),
    Invite.countDocuments({ orgId: org._id, expiresAt: { $gt: new Date() } }),
  ]);
  if (!isWithinLimit(members, current + pending)) {
    throw planLimit(`The ${PLANS[org.plan].name} plan allows ${members} members. Upgrade to invite more.`);
  }
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/** Mirrors a Stripe subscription onto the org. Stripe is the source of truth for the plan. */
export async function syncSubscription(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const plan: PlanId = ACTIVE_STATUSES.has(subscription.status) ? 'pro' : 'free';
  // `current_period_end` lives on the subscription item in current API versions.
  const periodEnd = subscription.items.data[0]?.current_period_end;

  await Organization.updateOne(
    { stripeCustomerId: customerId },
    {
      plan,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  );
}
