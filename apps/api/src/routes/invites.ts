import type { InvitePreviewDTO } from '@workgrid/shared';
import { Router } from 'express';
import { forbidden, notFound } from '../lib/errors';
import { toOrgDTO } from '../lib/serialize';
import { hashToken } from '../lib/tokens';
import { authUserId, requireAuth } from '../middleware/auth';
import { AuditLog } from '../models/AuditLog';
import { Invite, Membership, type OrgDoc } from '../models/Organization';
import { User, type UserDoc } from '../models/User';
import { assertCanAddMember } from '../services/billing';

/** Invite links are opened before the visitor belongs to the org, so these sit outside the tenant router. */
export const invitesRouter = Router();

async function findInvite(token: string) {
  const invite = await Invite.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } })
    .populate<{ orgId: OrgDoc | null }>('orgId')
    .populate<{ invitedBy: UserDoc | null }>('invitedBy');
  if (!invite?.orgId) throw notFound('This invite link is invalid or has expired');
  return { invite, org: invite.orgId };
}

invitesRouter.get('/:token', async (req, res) => {
  const { invite, org } = await findInvite(req.params.token);
  const body: InvitePreviewDTO = {
    email: invite.email,
    role: invite.role,
    orgName: org.name,
    orgSlug: org.slug,
    invitedBy: invite.invitedBy?.name ?? 'A teammate',
  };
  res.json({ invite: body });
});

invitesRouter.post('/:token/accept', requireAuth, async (req, res) => {
  const { invite, org } = await findInvite(String(req.params.token));
  const user = await User.findById(authUserId(req));
  // The link alone is not enough: it must be redeemed by the address it was sent to.
  if (!user || user.email !== invite.email) {
    throw forbidden(`This invite was sent to ${invite.email}. Sign in with that account to accept it.`);
  }

  if (!(await Membership.exists({ orgId: org._id, userId: user._id }))) {
    await invite.deleteOne(); // frees the seat the invite was holding
    await assertCanAddMember(org);
    await Membership.create({ orgId: org._id, userId: user._id, role: invite.role });
    await AuditLog.create({
      orgId: org._id,
      actorId: user._id,
      action: 'member.joined',
      entityType: 'member',
      summary: 'joined the workspace',
    });
  } else {
    await invite.deleteOne();
  }
  res.json({ org: toOrgDTO(org, invite.role) });
});
