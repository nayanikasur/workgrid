import { ROLE_LABELS, type InvitePreviewDTO, type OrgDTO } from '@workgrid/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Button, PageLoader } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { AuthShell } from './Auth';

export function InvitePage() {
  const { token } = useParams();
  const { status, user, reloadOrgs, logout } = useAuth();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState(false);

  const { data: invite, isPending, error } = useQuery({
    queryKey: ['invite', token],
    queryFn: async () => (await api.get<{ invite: InvitePreviewDTO }>(`/invites/${token}`)).invite,
    retry: false,
  });

  if (isPending || status === 'loading') return <PageLoader />;
  if (error || !invite) {
    return (
      <AuthShell title="Invite unavailable" subtitle={errorMessage(error)}>
        <Link to="/" className="font-medium text-brand-fg hover:underline">
          Go to WorkGrid
        </Link>
      </AuthShell>
    );
  }

  const next = encodeURIComponent(`/invite/${token}`);
  const wrongAccount = user && user.email !== invite.email;

  const accept = async () => {
    setAccepting(true);
    try {
      const { org } = await api.post<{ org: OrgDTO }>(`/invites/${token}/accept`);
      await reloadOrgs();
      toast.success(`You joined ${org.name}`);
      navigate(`/${org.slug}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setAccepting(false);
    }
  };

  return (
    <AuthShell
      title={`Join ${invite.orgName}`}
      subtitle={`${invite.invitedBy} invited ${invite.email} to join as ${ROLE_LABELS[invite.role]}.`}
    >
      {status === 'guest' ? (
        <div className="space-y-2">
          <Link to={`/register?next=${next}`}>
            <Button className="w-full">Create an account to join</Button>
          </Link>
          <Link to={`/login?next=${next}`}>
            <Button variant="secondary" className="mt-2 w-full">
              I already have an account
            </Button>
          </Link>
        </div>
      ) : wrongAccount ? (
        <div className="space-y-3">
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            You are signed in as {user.email}. This invite can only be accepted by {invite.email}.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => void logout()}>
            Sign out and switch account
          </Button>
        </div>
      ) : (
        <Button className="w-full" onClick={accept} loading={accepting}>
          Accept invite
        </Button>
      )}
    </AuthShell>
  );
}
