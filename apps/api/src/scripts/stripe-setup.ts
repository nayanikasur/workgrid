/**
 * One-time Stripe setup for a fresh (test-mode) account:
 *   pnpm stripe:setup
 * Creates the "WorkGrid Pro" product and monthly price, and a Customer Portal
 * configuration, then prints the price id for STRIPE_PRICE_PRO. Safe to re-run:
 * existing objects are found by lookup key / metadata and reused.
 */
import { PLANS } from '@workgrid/shared';
import Stripe from 'stripe';
import { env } from '../config/env';

const LOOKUP_KEY = 'workgrid_pro_monthly';

async function main() {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Set STRIPE_SECRET_KEY in apps/api/.env first');
  if (!env.STRIPE_SECRET_KEY.startsWith('sk_test_')) throw new Error('Refusing to run against a live-mode key');
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  let [price] = (await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], active: true, limit: 1 })).data;
  if (price) {
    console.log(`Found existing price ${price.id}`);
  } else {
    const product = await stripe.products.create({
      name: 'WorkGrid Pro',
      description: PLANS.pro.tagline,
      metadata: { app: 'workgrid', plan: 'pro' },
    });
    price = await stripe.prices.create({
      product: product.id,
      currency: 'usd',
      unit_amount: PLANS.pro.priceMonthly * 100,
      recurring: { interval: 'month' },
      lookup_key: LOOKUP_KEY,
    });
    console.log(`Created product ${product.id} and price ${price.id}`);
  }

  // The portal refuses to open until a configuration exists.
  const configs = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (configs.data.length) {
    console.log(`Found existing portal configuration ${configs.data[0]!.id}`);
  } else {
    const config = await stripe.billingPortal.configurations.create({
      business_profile: { headline: 'Manage your WorkGrid subscription' },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: { enabled: true, mode: 'at_period_end' },
      },
    });
    console.log(`Created portal configuration ${config.id}`);
  }

  console.log(`\nSet this in apps/api/.env:\nSTRIPE_PRICE_PRO=${price.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
