import type { UsageDTO } from '@workgrid/shared';
import { Router, type Request, type Response } from 'express';
import { env } from '../config/env';
import { AppError, badRequest } from '../lib/errors';
import { authUserId, requirePermission, tenantOf } from '../middleware/auth';
import { Membership } from '../models/Organization';
import { Project } from '../models/Project';
import { User } from '../models/User';
import { audit } from '../services/audit';
import { stripe, syncSubscription } from '../services/billing';

export const billingRouter = Router({ mergeParams: true });

function assertBillingEnabled() {
  if (!env.billingEnabled) throw new AppError(503, 'billing_disabled', 'Billing is not configured on this server');
}

billingRouter.get('/usage', async (req, res) => {
  const { org } = tenantOf(req);
  const [projects, members] = await Promise.all([
    Project.countDocuments({ archived: false }),
    Membership.countDocuments({ orgId: org._id }),
  ]);
  const usage: UsageDTO = {
    plan: org.plan,
    projects,
    members,
    billingEnabled: env.billingEnabled,
    subscriptionStatus: org.subscriptionStatus ?? null,
    currentPeriodEnd: org.currentPeriodEnd?.toISOString() ?? null,
  };
  res.json({ usage });
});

billingRouter.post('/checkout', requirePermission('billing:manage'), async (req, res) => {
  assertBillingEnabled();
  const { org } = tenantOf(req);
  if (org.plan === 'pro') throw badRequest('This workspace is already on Pro');

  if (!org.stripeCustomerId) {
    const user = await User.findById(authUserId(req));
    const customer = await stripe().customers.create({ name: org.name, email: user?.email, metadata: { orgId: org.id } });
    org.stripeCustomerId = customer.id;
    await org.save();
  }

  const returnUrl = `${env.clientOrigins[0]}/${org.slug}/settings/billing`;
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: org.stripeCustomerId,
    line_items: [{ price: env.STRIPE_PRICE_PRO, quantity: 1 }],
    success_url: `${returnUrl}?checkout=success`,
    cancel_url: `${returnUrl}?checkout=cancelled`,
  });
  await audit(req, { action: 'billing.checkout_started', entityType: 'billing', summary: 'started an upgrade to Pro' });
  res.json({ url: session.url });
});

billingRouter.post('/portal', requirePermission('billing:manage'), async (req, res) => {
  assertBillingEnabled();
  const { org } = tenantOf(req);
  if (!org.stripeCustomerId) throw badRequest('This workspace has no billing account yet');
  const session = await stripe().billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${env.clientOrigins[0]}/${org.slug}/settings/billing`,
  });
  res.json({ url: session.url });
});

/**
 * Stripe webhook. Mounted before the JSON body parser because signature
 * verification needs the raw request bytes.
 */
export async function stripeWebhook(req: Request, res: Response) {
  if (!env.billingEnabled || !env.STRIPE_WEBHOOK_SECRET) {
    res.status(503).end();
    return;
  }
  let event;
  try {
    event = stripe().webhooks.constructEvent(req.body as Buffer, String(req.headers['stripe-signature']), env.STRIPE_WEBHOOK_SECRET);
  } catch {
    res.status(400).send('Invalid signature');
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const subscriptionId = event.data.object.subscription;
      if (subscriptionId) {
        await syncSubscription(await stripe().subscriptions.retrieve(typeof subscriptionId === 'string' ? subscriptionId : subscriptionId.id));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(event.data.object);
      break;
  }
  res.json({ received: true });
}
