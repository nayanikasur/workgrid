import { zodResolver } from '@hookform/resolvers/zod';
import { ROLES, ROLE_LABELS, ROLE_RANK, inviteSchema, type InviteDTO, type MemberDTO, type Role } from '@workgrid/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, MailPlus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth, useUser } from '@/auth/AuthProvider';
import { Avatar, Badge, Button, Card, Input, Modal, PageHeader, PageLoader, Select } from '@/components/ui';
import { Page } from '@/layouts/AppLayout';
import { api, errorMessage } from '@/lib/api';
import { keys, useOrg } from '@/lib/org';
import { useMembers } from '@/lib/queries';
import { handleFormError, timeAgo } from '@/lib/utils';

const ASSIGNABLE_ROLES = ROLES.filter((r): r is Exclude<Role, 'owner'> => r !== 'owner');

const ROLE_HINTS: Record<Exclude<Role, 'owner'>, string> = {
  admin: 'Manages members, projects and settings',
  member: 'Creates and edits projects and tasks',
  viewer: 'Read-only access',
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  };
  return (
    <Button variant="secondary" onClick={copy}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { org, base } = useOrg();
  const queryClient = useQueryClient();
  const [link, setLink] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(inviteSchema), defaultValues: { email: '', role: 'member' as const } });
  const { errors, isSubmitting } = form.formState;
  const role = form.watch('role');

  const close = () => {
    setLink(null);
    form.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const { invite } = await api.post<{ invite: InviteDTO }>(`${base}/invites`, values);
      await queryClient.invalidateQueries({ queryKey: keys.invites(org.slug) });
      setLink(invite.link ?? null);
    } catch (err) {
      handleFormError(err, form.setError);
    }
  });

  return (
    <Modal
      open={open}
      onClose={close}
      title={link ? 'Invite created' : 'Invite a teammate'}
      description={link ? 'Share this link with them. It expires in 7 days and only works for the invited email.' : `They will join ${org.name}.`}
    >
      {link ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" className="h-9 min-w-0 flex-1 rounded-md border border-line-strong bg-bg px-3 text-xs" />
            <CopyButton text={link} />
          </div>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Input label="Email" type="email" placeholder="teammate@company.com" autoFocus error={errors.email?.message} {...form.register('email')} />
          <Select label="Role" hint={ROLE_HINTS[role]} error={errors.role?.message} {...form.register('role')}>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              Create invite link
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function MemberRow({ member }: { member: MemberDTO }) {
  const { org, base, can } = useOrg();
  const me = useUser();
  const { reloadOrgs } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = member.user.id === me.id;
  const isOwner = member.role === 'owner';
  const canEditRole = can('member:update_role') && !isSelf && !isOwner;
  // Admins can remove members and viewers, not each other; anyone but the owner can leave.
  const canRemove = !isOwner && (isSelf || (can('member:remove') && ROLE_RANK[org.role] < ROLE_RANK[member.role]));

  const changeRole = async (role: string) => {
    try {
      await api.patch(`${base}/members/${member.id}`, { role });
      await queryClient.invalidateQueries({ queryKey: keys.members(org.slug) });
      toast.success(`${member.user.name} is now ${ROLE_LABELS[role as Role]}`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`${base}/members/${member.id}`);
      if (isSelf) {
        await reloadOrgs();
        navigate('/');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: keys.members(org.slug) });
      toast.success(`${member.user.name} removed`);
      setConfirming(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={member.user.name} color={member.user.avatarColor} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.user.name} {isSelf && <span className="font-normal text-subtle">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted">{member.user.email}</p>
      </div>
      {canEditRole ? (
        <select
          value={member.role}
          onChange={(e) => void changeRole(e.target.value)}
          aria-label={`Role for ${member.user.name}`}
          className="h-8 rounded-md border border-line-strong bg-surface px-2 text-sm focus:border-brand focus:outline-none"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      ) : (
        <Badge tone={isOwner ? 'brand' : 'neutral'}>{ROLE_LABELS[member.role]}</Badge>
      )}
      {canRemove ? (
        <Button variant="ghost" size={isSelf ? 'sm' : 'icon'} onClick={() => setConfirming(true)} aria-label={isSelf ? undefined : `Remove ${member.user.name}`}>
          {isSelf ? 'Leave' : <Trash2 className="size-4" />}
        </Button>
      ) : (
        <span className="w-8" />
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={isSelf ? `Leave ${org.name}?` : `Remove ${member.user.name}?`}
        description={
          isSelf ? 'You will lose access until someone invites you again.' : 'They will lose access immediately and their tasks will become unassigned.'
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            {isSelf ? 'Leave workspace' : 'Remove member'}
          </Button>
        </div>
      </Modal>
    </li>
  );
}

function PendingInvites() {
  const { org, base } = useOrg();
  const queryClient = useQueryClient();
  const { data: invites } = useQuery({
    queryKey: keys.invites(org.slug),
    queryFn: async () => (await api.get<{ invites: InviteDTO[] }>(`${base}/invites`)).invites,
  });

  const revoke = async (invite: InviteDTO) => {
    try {
      await api.delete(`${base}/invites/${invite.id}`);
      await queryClient.invalidateQueries({ queryKey: keys.invites(org.slug) });
      toast.success(`Invite for ${invite.email} revoked`);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!invites?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold">Pending invites</h2>
      <Card>
        <ul className="divide-y divide-line">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-hover text-subtle">
                <MailPlus className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{invite.email}</p>
                <p className="text-xs text-muted">
                  Invited by {invite.invitedBy} {timeAgo(invite.createdAt)}
                </p>
              </div>
              <Badge>{ROLE_LABELS[invite.role]}</Badge>
              <Button variant="ghost" size="sm" onClick={() => void revoke(invite)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

export function MembersPage() {
  const { can } = useOrg();
  const { data: members, isPending } = useMembers();
  const [inviting, setInviting] = useState(false);

  return (
    <Page className="max-w-3xl">
      <PageHeader
        title="Members"
        description={members ? `${members.length} ${members.length === 1 ? 'person' : 'people'} in this workspace.` : undefined}
        actions={
          can('member:invite') && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="size-4" /> Invite
            </Button>
          )
        }
      />
      {isPending ? (
        <PageLoader />
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {members?.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </ul>
        </Card>
      )}
      {can('member:invite') && <PendingInvites />}
      <InviteModal open={inviting} onClose={() => setInviting(false)} />
    </Page>
  );
}
