import {
  ROLE_LABELS,
  ROLE_RANK,
  can,
  createOrgSchema,
  inviteSchema,
  updateMemberSchema,
  updateOrgSchema,
  type InviteDTO,
  type MemberDTO,
} from '@workgrid/shared';
import { Router } from 'express';
import { env } from '../config/env';
import { conflict, forbidden, notFound, parse } from '../lib/errors';
import { toOrgDTO, toUserDTO } from '../lib/serialize';
import { INVITE_TTL_MS, hashToken, randomToken } from '../lib/tokens';
import { authUserId, requireAuth, requirePermission, resolveTenant, tenantOf } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import { Invite, Membership, Organization } from '../models/Organization';
import { Comment, Project, Task } from '../models/Project';
import { User, type UserDoc } from '../models/User';
import { audit } from '../services/audit';
import { assertCanAddMember } from '../services/billing';
import { listOrgsFor } from './auth';
import { analyticsRouter } from './analytics';
import { billingRouter } from './billing';
import { projectsRouter } from './projects';

export const orgsRouter = Router();
orgsRouter.use(requireAuth);

orgsRouter.get('/', async (req, res) => {
  res.json({ orgs: await listOrgsFor(authUserId(req)) });
});

orgsRouter.post('/', async (req, res) => {
  const input = parse(createOrgSchema, req.body);
  if (await Organization.exists({ slug: input.slug })) throw conflict('That workspace URL is taken');

  const org = await Organization.create(input);
  await Membership.create({ orgId: org._id, userId: authUserId(req), role: 'owner' });
  res.status(201).json({ org: toOrgDTO(org, 'owner') });
});

/** Everything below is scoped to one tenant. */
const tenant = Router({ mergeParams: true });
orgsRouter.use('/:orgSlug', resolveTenant, tenant);

tenant.get('/', (req, res) => {
  const { org, role } = tenantOf(req);
  res.json({ org: toOrgDTO(org, role) });
});

tenant.patch('/', requirePermission('org:update'), async (req, res) => {
  const { org, role } = tenantOf(req);
  org.name = parse(updateOrgSchema, req.body).name;
  await org.save();
  await audit(req, { action: 'org.updated', entityType: 'org', entityId: org._id, summary: `renamed the workspace to ${org.name}` });
  res.json({ org: toOrgDTO(org, role) });
});

tenant.delete('/', requirePermission('org:delete'), async (req, res) => {
  const { org } = tenantOf(req);
  await Promise.all([
    Task.deleteMany({}),
    Comment.deleteMany({}),
    Project.deleteMany({}),
    AuditLog.deleteMany({}),
    Membership.deleteMany({ orgId: org._id }),
    Invite.deleteMany({ orgId: org._id }),
  ]);
  await org.deleteOne();
  res.status(204).end();
});

/* ---------------------------------- Members --------------------------------- */

tenant.get('/members', async (req, res) => {
  const { org } = tenantOf(req);
  const memberships = await Membership.find({ orgId: org._id }).populate<{ userId: UserDoc | null }>('userId');
  const members: MemberDTO[] = memberships
    .flatMap((m) =>
      m.userId ? [{ id: m.id as string, user: toUserDTO(m.userId), role: m.role, joinedAt: m.createdAt.toISOString() }] : [],
    )
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.user.name.localeCompare(b.user.name));
  res.json({ members });
});

tenant.patch('/members/:memberId', requirePermission('member:update_role'), async (req, res) => {
  const { org, membershipId } = tenantOf(req);
  const { role } = parse(updateMemberSchema, req.body);
  const member = await Membership.findOne({ _id: req.params.memberId, orgId: org._id }).populate<{ userId: UserDoc }>('userId');
  if (!member) throw notFound('Member not found');
  if (member.id === membershipId) throw forbidden('You cannot change your own role');
  if (member.role === 'owner') throw forbidden('The owner’s role cannot be changed');

  member.role = role;
  await member.save();
  await audit(req, {
    action: 'member.role_changed',
    entityType: 'member',
    entityId: member._id,
    summary: `changed ${member.userId.name}’s role to ${ROLE_LABELS[role]}`,
  });
  res.json({ ok: true });
});

tenant.delete('/members/:memberId', async (req, res) => {
  const { org, role, membershipId } = tenantOf(req);
  const member = await Membership.findOne({ _id: req.params.memberId, orgId: org._id }).populate<{ userId: UserDoc }>('userId');
  if (!member) throw notFound('Member not found');
  if (member.role === 'owner') throw forbidden('The owner cannot be removed from the workspace');

  const leaving = member.id === membershipId;
  // Anyone can leave; removing someone else needs the permission and a higher rank.
  if (!leaving && (!can(role, 'member:remove') || ROLE_RANK[role] >= ROLE_RANK[member.role])) throw forbidden();

  await Task.updateMany({ assigneeId: member.userId._id }, { assigneeId: null });
  await member.deleteOne();
  await audit(req, {
    action: leaving ? 'member.left' : 'member.removed',
    entityType: 'member',
    entityId: member._id,
    summary: leaving ? 'left the workspace' : `removed ${member.userId.name} from the workspace`,
  });
  res.status(204).end();
});

/* ---------------------------------- Invites --------------------------------- */

tenant.get('/invites', requirePermission('member:invite'), async (req, res) => {
  const { org } = tenantOf(req);
  const invites = await Invite.find({ orgId: org._id, expiresAt: { $gt: new Date() } })
    .populate<{ invitedBy: UserDoc | null }>('invitedBy')
    .sort('-createdAt');
  const body: InviteDTO[] = invites.map((i) => ({
    id: i.id as string,
    email: i.email,
    role: i.role,
    invitedBy: i.invitedBy?.name ?? 'Unknown',
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));
  res.json({ invites: body });
});

tenant.post('/invites', requirePermission('member:invite'), async (req, res) => {
  const { org } = tenantOf(req);
  const input = parse(inviteSchema, req.body);

  const existingUser = await User.findOne({ email: input.email });
  if (existingUser && (await Membership.exists({ orgId: org._id, userId: existingUser._id }))) {
    throw conflict('That person is already a member');
  }
  // Re-inviting replaces the old link instead of failing.
  await Invite.deleteOne({ orgId: org._id, email: input.email });
  await assertCanAddMember(org);

  const token = randomToken();
  const inviter = await User.findById(authUserId(req));
  const invite = await Invite.create({
    orgId: org._id,
    email: input.email,
    role: input.role,
    tokenHash: hashToken(token),
    invitedBy: authUserId(req),
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });
  await audit(req, {
    action: 'invite.created',
    entityType: 'invite',
    entityId: invite._id,
    summary: `invited ${input.email} as ${ROLE_LABELS[input.role]}`,
  });

  const body: InviteDTO = {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedBy: inviter?.name ?? 'Unknown',
    expiresAt: invite.expiresAt.toISOString(),
    createdAt: invite.createdAt.toISOString(),
    // No email provider on the free tier: the inviter shares this link themselves.
    link: `${env.clientOrigins[0]}/invite/${token}`,
  };
  res.status(201).json({ invite: body });
});

tenant.delete('/invites/:inviteId', requirePermission('member:invite'), async (req, res) => {
  const { org } = tenantOf(req);
  const invite = await Invite.findOneAndDelete({ _id: req.params.inviteId, orgId: org._id });
  if (!invite) throw notFound('Invite not found');
  await audit(req, { action: 'invite.revoked', entityType: 'invite', entityId: invite._id, summary: `revoked the invite for ${invite.email}` });
  res.status(204).end();
});

tenant.use('/', projectsRouter);
tenant.use('/', analyticsRouter);
tenant.use('/billing', billingRouter);
