import { z } from 'zod';

const DEV_SECRET = 'dev-only-secret-do-not-use-in-production';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/workgrid'),
    CLIENT_URL: z.string().default('http://localhost:5173'),
    JWT_ACCESS_SECRET: z.string().min(24).default(DEV_SECRET),
    // `lax` suits the recommended setup where the web host proxies /api (first-party cookie).
    // Use `none` only if the browser calls the API on a different site directly.
    COOKIE_SAMESITE: z.enum(['lax', 'none']).default('lax'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_PRICE_PRO: z.string().optional(),
  })
  .refine((v) => v.NODE_ENV !== 'production' || v.JWT_ACCESS_SECRET !== DEV_SECRET, {
    message: 'JWT_ACCESS_SECRET must be set in production',
    path: ['JWT_ACCESS_SECRET'],
  });

const parsed = schema.safeParse(
  // Treat blank values in .env as unset.
  Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')),
);

if (!parsed.success) {
  console.error('Invalid environment configuration:\n' + z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  /** Comma separated list is allowed so preview deployments can be whitelisted. */
  clientOrigins: parsed.data.CLIENT_URL.split(',').map((s) => s.trim().replace(/\/$/, '')),
  billingEnabled: Boolean(parsed.data.STRIPE_SECRET_KEY && parsed.data.STRIPE_PRICE_PRO),
};
