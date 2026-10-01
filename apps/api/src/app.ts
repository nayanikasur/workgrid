import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './routes/auth';
import { stripeWebhook } from './routes/billing';
import { invitesRouter } from './routes/invites';
import { orgsRouter } from './routes/orgs';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render terminates TLS in front of the app.

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', uptime: Math.round(process.uptime()) });
  });
  app.use('/api/auth', authRouter);
  app.use('/api/invites', invitesRouter);
  app.use('/api/orgs', orgsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
