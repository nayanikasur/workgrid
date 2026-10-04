import { zodResolver } from '@hookform/resolvers/zod';
import { PLANS, PLAN_IDS, updateOrgSchema, type PlanDefinition, type PlanId } from '@workgrid/shared';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, Button, Card, Input, Modal, PageHeader, PageLoader } from '@/components/ui';
import { Page } from '@/layouts/AppLayout';
import { api, errorMessage } from '@/lib/api';
import { keys, useOrg } from '@/lib/org';
import { useUsage } from '@/lib/queries';
import { cn, handleFormError } from '@/lib/utils';

function GeneralSettings() {
  const { org, base, can } = useOrg();
  const { reloadOrgs } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const form = useForm({ resolver: zodResolver(updateOrgSchema), defaultValues: { name: org.name } });
  const { errors, isSubmitting, isDirty } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.patch(`${base}`, values);
      await reloadOrgs();
      form.reset(values);
      toast.success('Workspace updated');
    } catch (err) {
      handleFormError(err, form.setError);
    }
  });

  const deleteOrg = async () => {
    setDeleting(true);
    try {
      await api.delete(base);
      await reloadOrgs();
      toast.success(`${org.name} deleted`);
      navigate('/');
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="text-sm font-semibold">General</h2>
        <form onSubmit={onSubmit} className="mt-4 max-w-sm space-y-4" noValidate>
          <Input label="Workspace name" disabled={!can('org:update')} error={errors.name?.message} {...form.register('name')} />
          <Input label="Workspace URL" value={`${window.location.host}/${org.slug}`} disabled readOnly hint="The URL cannot be changed." />
          {can('org:update') && (
            <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
              Save changes
            </Button>
          )}
        </form>
      </Card>

      {can('org:delete') && (
        <Card className="border-danger/40 p-5">
          <h2 className="text-sm font-semibold">Delete workspace</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">Permanently deletes every project, task, comment and membership in {org.name}. This cannot be undone.</p>
          <Button variant="danger" className="mt-4" onClick={() => setConfirming(true)}>
            Delete workspace
          </Button>
        </Card>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title={`Delete ${org.name}?`} description={`Type the workspace URL “${org.slug}” to confirm.`}>
        <div className="space-y-4">
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={org.slug} aria-label="Workspace URL" autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={confirmText !== org.slug} loading={deleting} onClick={deleteOrg}>
              Delete forever
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** A usage meter: the track is a lighter step of the fill, which turns to danger at the limit. */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const full = limit !== null && used >= limit;
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-muted">{label}</span>
        <span className="font-medium tabular-nums">
          {used} <span className="font-normal text-subtle">/ {limit ?? 'Unlimited'}</span>
        </span>
      </div>
      <div className={cn('h-1.5 overflow-hidden rounded-full', full ? 'bg-danger-soft' : 'bg-brand-soft')}>
        <div className={cn('h-full rounded-full', full ? 'bg-danger' : 'bg-brand')} style={{ width: `${limit === null ? 4 : Math.min(100, (used / limit) * 100)}%` }} />
      </div>
    </div>
  );
}

function PlanCard({ plan, current, action }: { plan: PlanDefinition; current: boolean; action?: React.ReactNode }) {
  return (
    <Card className={cn('flex flex-col p-5', current && 'border-brand ring-1 ring-brand')}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{plan.name}</h3>
        {current && <Badge tone="brand">Current plan</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted">{plan.tagline}</p>
      <p className="mt-4">
        <span className="text-3xl font-semibold tracking-tight">${plan.priceMonthly}</span>
        <span className="text-sm text-muted"> / month</span>
      </p>
      <ul className="mt-4 mb-5 space-y-2 text-sm">
        {plan.features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <Check className="size-4 shrink-0 text-success" /> {f}
          </li>
        ))}
      </ul>
      <div className="mt-auto">{action}</div>
    </Card>
  );
}

function BillingSettings() {
  const { org, base, can } = useOrg();
  const { reloadOrgs } = useAuth();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [redirecting, setRedirecting] = useState(false);
  const { data: usage, isPending } = useUsage();
  const checkout = params.get('checkout');
  const fromPortal = params.get('portal') === 'returned';
  const handledReturn = useRef(false);

  // Back from Stripe Checkout or the portal: ask the API to re-read the
  // subscription from Stripe rather than waiting for a webhook.
  useEffect(() => {
    if ((!checkout && !fromPortal) || handledReturn.current) return;
    handledReturn.current = true; // StrictMode runs effects twice in development
    setParams({}, { replace: true });
    if (checkout === 'cancelled') {
      toast.info('Checkout cancelled. You have not been charged.');
      return;
    }
    void (async () => {
      try {
        const { plan } = await api.post<{ plan: PlanId }>(`${base}/billing/sync`);
        await Promise.all([reloadOrgs(), queryClient.invalidateQueries({ queryKey: keys.usage(org.slug) })]);
        if (checkout === 'success') {
          if (plan === 'pro') toast.success('You’re on Pro. Limits are lifted for the whole workspace.');
          else toast.info('Your payment is still processing. The plan will update shortly.');
        }
      } catch (err) {
        toast.error(errorMessage(err));
      }
    })();
  }, [checkout, fromPortal, base, org.slug, queryClient, reloadOrgs, setParams]);

  const goToStripe = async (endpoint: 'checkout' | 'portal') => {
    setRedirecting(true);
    try {
      const { url } = await api.post<{ url: string }>(`${base}/billing/${endpoint}`);
      window.location.assign(url);
    } catch (err) {
      toast.error(errorMessage(err));
      setRedirecting(false);
    }
  };

  if (isPending || !usage) return <PageLoader />;
  const limits = PLANS[usage.plan].limits;
  const canManage = can('billing:manage');

  return (
    <div className="space-y-6">
      {!usage.billingEnabled && (
        <p className="flex items-start gap-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" />
          Billing is not configured on this server. Add Stripe test keys to the API environment to enable checkout.
        </p>
      )}

      <Card className="p-5">
        <h2 className="text-sm font-semibold">Usage</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <UsageMeter label="Active projects" used={usage.projects} limit={limits.projects} />
          <UsageMeter label="Members" used={usage.members} limit={limits.members} />
        </div>
        {usage.currentPeriodEnd && (
          <p className="mt-4 text-xs text-muted">
            Subscription {usage.subscriptionStatus} · current period ends {format(new Date(usage.currentPeriodEnd), 'MMM d, yyyy')}
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {PLAN_IDS.map((id) => {
          const current = usage.plan === id;
          let action: React.ReactNode = null;
          if (canManage && usage.billingEnabled) {
            if (id === 'pro' && !current) {
              action = (
                <Button className="w-full" loading={redirecting} onClick={() => void goToStripe('checkout')}>
                  Upgrade to Pro
                </Button>
              );
            } else if (id === 'pro' && current && usage.subscriptionStatus) {
              action = (
                <Button variant="secondary" className="w-full" loading={redirecting} onClick={() => void goToStripe('portal')}>
                  Manage subscription
                </Button>
              );
            }
          }
          return <PlanCard key={id} plan={PLANS[id]} current={current} action={action} />;
        })}
      </div>
      {!canManage && <p className="text-sm text-muted">Only the workspace owner can change the plan.</p>}
    </div>
  );
}

export function SettingsPage() {
  const { org } = useOrg();
  const billing = useLocation().pathname.endsWith('/billing');
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn('border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors', isActive ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg');

  return (
    <Page className="max-w-3xl">
      <PageHeader title="Settings" />
      <nav className="mb-6 flex gap-5 border-b border-line" aria-label="Settings sections">
        <NavLink to={`/${org.slug}/settings`} end className={tab}>
          General
        </NavLink>
        <NavLink to={`/${org.slug}/settings/billing`} className={tab}>
          Plan and billing
        </NavLink>
      </nav>
      {billing ? <BillingSettings /> : <GeneralSettings key={org.id} />}
    </Page>
  );
}
