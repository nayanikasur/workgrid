import type { ApiErrorBody } from '@workgrid/shared';
import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

export function notFoundHandler(req: Request, res: Response<ApiErrorBody>) {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response<ApiErrorBody>, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // A malformed ObjectId in the URL is just a missing resource.
  if (err instanceof mongoose.Error.CastError) {
    res.status(404).json({ error: { code: 'not_found', message: 'Not found' } });
    return;
  }
  if (err instanceof mongoose.Error.ValidationError) {
    res.status(400).json({ error: { code: 'bad_request', message: err.message } });
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
    res.status(409).json({ error: { code: 'conflict', message: 'That already exists' } });
    return;
  }
  if (typeof err === 'object' && err !== null && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body' } });
    return;
  }

  if (!env.isTest) console.error(err);
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
