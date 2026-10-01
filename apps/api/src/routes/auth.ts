import { loginSchema, registerSchema, type OrgDTO } from '@workgrid/shared';
import bcrypt from 'bcryptjs';
import { Router, type CookieOptions, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { conflict, parse, unauthorized } from '../lib/errors';
import { toOrgDTO, toUserDTO } from '../lib/serialize';
import { REFRESH_TOKEN_TTL_MS, hashToken, randomToken, signAccessToken } from '../lib/tokens';
import { authUserId, requireAuth } from '../middleware/auth';
import { Membership, type OrgDoc } from '../models/Organization';
import { Session } from '../models/Session';
import { User } from '../models/User';

const REFRESH_COOKIE = 'wg_rt';
/** How long a just-rotated refresh token keeps working, to absorb concurrent tabs. */
const ROTATION_GRACE_MS = 30_000;

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: env.COOKIE_SAMESITE,
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_MS,
};

async function startSession(req: Request, res: Response, userId: string) {
  const token = randomToken();
  await Session.create({
    userId,
    tokenHash: hashToken(token),
    userAgent: req.headers['user-agent']?.slice(0, 200) ?? '',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  res.cookie(REFRESH_COOKIE, token, cookieOptions);
}

export async function listOrgsFor(userId: string): Promise<OrgDTO[]> {
  const memberships = await Membership.find({ userId }).populate<{ orgId: OrgDoc | null }>('orgId').sort('createdAt');
  return memberships.flatMap((m) => (m.orgId ? [toOrgDTO(m.orgId, m.role)] : []));
}

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !env.isProd,
  message: { error: { code: 'rate_limited', message: 'Too many attempts, try again in a few minutes' } },
});

authRouter.post('/register', limiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  if (await User.exists({ email: input.email })) throw conflict('An account with that email already exists');

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await bcrypt.hash(input.password, 12),
  });
  await startSession(req, res, user.id);
  res.status(201).json({ user: toUserDTO(user), accessToken: signAccessToken(user.id), orgs: [] });
});

authRouter.post('/login', limiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  // Same message either way so the endpoint doesn't reveal which emails are registered.
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw unauthorized('Incorrect email or password');
  }
  await startSession(req, res, user.id);
  res.json({ user: toUserDTO(user), accessToken: signAccessToken(user.id), orgs: await listOrgsFor(user.id) });
});

authRouter.post('/refresh', async (req, res) => {
  const token: unknown = req.cookies[REFRESH_COOKIE];
  if (typeof token !== 'string') throw unauthorized();
  const tokenHash = hashToken(token);

  let session = await Session.findOne({ tokenHash, expiresAt: { $gt: new Date() } });
  if (session) {
    const next = randomToken();
    session.prevTokenHash = tokenHash;
    session.tokenHash = hashToken(next);
    session.rotatedAt = new Date();
    session.expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    await session.save();
    res.cookie(REFRESH_COOKIE, next, cookieOptions);
  } else {
    // Another tab rotated this token moments ago; it already holds the new cookie.
    session = await Session.findOne({
      prevTokenHash: tokenHash,
      rotatedAt: { $gt: new Date(Date.now() - ROTATION_GRACE_MS) },
    });
  }

  const user = session && (await User.findById(session.userId));
  if (!user) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions);
    throw unauthorized('Session expired');
  }
  res.json({ user: toUserDTO(user), accessToken: signAccessToken(user.id), orgs: await listOrgsFor(user.id) });
});

authRouter.post('/logout', async (req, res) => {
  const token: unknown = req.cookies[REFRESH_COOKIE];
  if (typeof token === 'string') await Session.deleteOne({ tokenHash: hashToken(token) });
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(authUserId(req));
  if (!user) throw unauthorized();
  res.json({ user: toUserDTO(user), orgs: await listOrgsFor(user.id) });
});
