import { Activity, ArrowRight, Building2, CreditCard, KanbanSquare, ShieldCheck, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useHomePath } from '@/App';
import { useAuth } from '@/auth/AuthProvider';
import { Button, Logo, PageLoader } from '@/components/ui';

const FEATURES: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <Building2 />,
    title: 'True multi-tenancy',
    body: 'Every workspace is isolated at the data layer. Tenant scoping is enforced by the ORM, not left to each query.',
  },
  {
    icon: <Zap />,
    title: 'Real-time boards',
    body: 'Drag a card and your teammates see it move. Live presence shows who is looking at the board with you.',
  },
  {
    icon: <ShieldCheck />,
    title: 'Roles and permissions',
    body: 'Owner, admin, member and viewer roles share one permission map between the API and the UI.',
  },
  {
    icon: <KanbanSquare />,
    title: 'Projects that scale',
    body: 'Kanban boards, priorities, assignees, due dates, labels and threaded comments on every task.',
  },
  {
    icon: <Activity />,
    title: 'Audit log and analytics',
    body: 'See who changed what, and track throughput and workload from live aggregation pipelines.',
  },
  {
    icon: <CreditCard />,
    title: 'Plans and billing',
    body: 'Free and Pro tiers with server-enforced limits, Stripe Checkout and a self-serve billing portal.',
  },
];

export function LandingPage() {
  const { status } = useAuth();
  const home = useHomePath();
  if (status === 'loading') return <PageLoader />;
  if (status === 'authed') return <Navigate to={home} replace />;

  return (
    <div className="min-h-full">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
        <Logo className="text-base" />
        <nav className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost">Sign in</Button>
          </Link>
          <Link to="/register">
            <Button>Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-5">
        <section className="py-16 text-center sm:py-24">
          <p className="mx-auto mb-5 w-fit rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            Multi-tenant SaaS · MongoDB · Express · React · Node
          </p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-6xl">
            Where your team’s work <span className="text-brand-fg">lines up</span>.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted text-balance sm:text-lg">
            WorkGrid is project management for teams that ship: real-time boards, roles, audit trails and billing, one workspace per team.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register">
              <Button className="h-11 px-5 text-base">
                Start for free <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button variant="secondary" className="h-11 px-5 text-base">
                Try the live demo
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-line bg-surface p-5">
              <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-fg [&>svg]:size-[18px]">{f.icon}</div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-subtle">Built by Nayanika Sur · MERN + TypeScript</footer>
    </div>
  );
}
