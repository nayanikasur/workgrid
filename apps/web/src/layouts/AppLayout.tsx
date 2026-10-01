import { PLANS } from '@workgrid/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Check, ChevronsUpDown, FolderKanban, LayoutDashboard, LogOut, Menu, Moon, Plus, Settings, Sun, Users } from 'lucide-react';
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { rememberOrg } from '@/App';
import { useAuth, useUser } from '@/auth/AuthProvider';
import { Avatar, Badge, Button, Logo, PageLoader } from '@/components/ui';
import { OrgContext, buildOrgContext, keys, useOrg } from '@/lib/org';
import { useProjects } from '@/lib/queries';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';
import { NotFoundPage } from '@/pages/NotFound';

/** Keeps the socket in this org's room and flags when project rooms may be joined. */
function useOrgRealtime(slug: string | undefined): boolean {
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!slug) return;
    const socket = getSocket();
    // Runs on the first connect and again after every reconnect.
    const join = () => {
      setReady(false);
      socket.emit('org:join', slug, (ok) => setReady(ok));
    };
    const onProjectChanged = () => void queryClient.invalidateQueries({ queryKey: keys.projects(slug) });

    socket.on('connect', join);
    socket.on('project:changed', onProjectChanged);
    if (socket.connected) join();
    else socket.connect();

    return () => {
      socket.off('connect', join);
      socket.off('project:changed', onProjectChanged);
      setReady(false);
    };
  }, [slug, queryClient]);

  return ready;
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try {
      localStorage.setItem('wg-theme', next ? 'dark' : 'light');
    } catch {
      // The choice just won't persist.
    }
    setDark(next);
  };
  return { dark, toggle };
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onOutside]);
  return ref;
}

function OrgSwitcher() {
  const { org } = useOrg();
  const { orgs } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white">
          {org.name[0]?.toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{org.name}</span>
          <span className="block text-xs text-subtle">{PLANS[org.plan].name} plan</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-subtle" />
      </button>

      {open && (
        <div role="menu" className="animate-pop absolute top-full right-0 left-0 z-30 mt-1 rounded-lg border border-line bg-raised p-1 shadow-pop">
          <p className="px-2 py-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">Workspaces</p>
          {orgs.map((o) => (
            <Link
              key={o.id}
              to={`/${o.slug}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover"
            >
              <span className="flex size-5 items-center justify-center rounded bg-brand-soft text-[10px] font-semibold text-brand-fg">
                {o.name[0]?.toUpperCase()}
              </span>
              <span className="flex-1 truncate">{o.name}</span>
              {o.id === org.id && <Check className="size-4 text-brand-fg" />}
            </Link>
          ))}
          <div className="my-1 border-t border-line" />
          <Link to="/onboarding" role="menuitem" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-hover hover:text-fg">
            <Plus className="size-4" /> Create workspace
          </Link>
        </div>
      )}
    </div>
  );
}

function NavItem({ to, end, icon, children }: { to: string; end?: boolean; icon: ReactNode; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors [&>svg]:size-4 [&>svg]:shrink-0',
          isActive ? 'bg-brand-soft text-brand-fg' : 'text-muted hover:bg-hover hover:text-fg',
        )
      }
    >
      {icon}
      <span className="truncate">{children}</span>
    </NavLink>
  );
}

function Sidebar() {
  const { org, can } = useOrg();
  const user = useUser();
  const { logout } = useAuth();
  const { dark, toggle } = useTheme();
  const { data: projects } = useProjects();
  const root = `/${org.slug}`;
  const active = projects?.filter((p) => !p.archived) ?? [];

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <OrgSwitcher />

      <nav className="space-y-0.5" aria-label="Workspace">
        <NavItem to={root} end icon={<LayoutDashboard />}>
          Dashboard
        </NavItem>
        <NavItem to={`${root}/projects`} end icon={<FolderKanban />}>
          Projects
        </NavItem>
        <NavItem to={`${root}/members`} icon={<Users />}>
          Members
        </NavItem>
        {can('audit:read') && (
          <NavItem to={`${root}/activity`} icon={<Activity />}>
            Activity
          </NavItem>
        )}
        <NavItem to={`${root}/settings`} icon={<Settings />}>
          Settings
        </NavItem>
      </nav>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <p className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">Projects</p>
        <div className="space-y-0.5">
          {active.map((p) => (
            <NavItem key={p.id} to={`${root}/projects/${p.id}`} icon={<span className="size-2.5! rounded-sm" style={{ backgroundColor: p.color }} />}>
              {p.name}
            </NavItem>
          ))}
          {projects && active.length === 0 && <p className="px-2 py-1 text-xs text-subtle">No projects yet</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Avatar name={user.name} color={user.avatarColor} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <Badge className="mt-0.5 capitalize">{org.role}</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void logout()} aria-label="Sign out">
          <LogOut className="size-4" />
        </Button>
      </div>
    </div>
  );
}

export function AppLayout() {
  const { orgSlug } = useParams();
  const { orgs } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const org = orgs.find((o) => o.slug === orgSlug);
  const realtimeReady = useOrgRealtime(org?.slug);
  const ctx = useMemo(() => (org ? buildOrgContext(org, realtimeReady) : null), [org, realtimeReady]);

  useEffect(() => {
    if (org) rememberOrg(org.slug);
  }, [org]);
  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (!ctx) {
    return <NotFoundPage title="Workspace not found" description="It may have been deleted, or you may not be a member." onBack={() => navigate('/')} />;
  }

  return (
    <OrgContext.Provider value={ctx}>
      <div className="flex h-full">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-surface md:block">
          <Sidebar />
        </aside>

        {menuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="animate-fade absolute inset-0 bg-black/50" onClick={() => setMenuOpen(false)} aria-hidden />
            <aside className="relative h-full w-64 border-r border-line bg-surface">
              <Sidebar />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
            <Logo className="text-sm" />
          </header>
          <main className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </OrgContext.Provider>
  );
}

/** Standard padded page body; the board opts out to use the full width. */
export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-8', className)}>{children}</div>;
}
