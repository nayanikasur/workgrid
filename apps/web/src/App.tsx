import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { PageLoader } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage, RegisterPage } from './pages/Auth';
import { InvitePage } from './pages/Invite';
import { LandingPage } from './pages/Landing';
import { NotFoundPage } from './pages/NotFound';
import { OnboardingPage } from './pages/Onboarding';

// Workspace screens are split out so visitors to the landing and auth pages
// don't download the charting and drag-and-drop libraries.
const ActivityPage = lazy(() => import('./pages/Activity').then((m) => ({ default: m.ActivityPage })));
const BoardPage = lazy(() => import('./pages/Board').then((m) => ({ default: m.BoardPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.DashboardPage })));
const MembersPage = lazy(() => import('./pages/Members').then((m) => ({ default: m.MembersPage })));
const ProjectsPage = lazy(() => import('./pages/Projects').then((m) => ({ default: m.ProjectsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));

const LAST_ORG_KEY = 'wg-last-org';

export function rememberOrg(slug: string) {
  try {
    localStorage.setItem(LAST_ORG_KEY, slug);
  } catch {
    // Private mode: the user just lands on their first workspace next time.
  }
}

/** Where a signed-in user belongs: their last workspace, their first one, or onboarding. */
export function useHomePath(): string {
  const { orgs } = useAuth();
  let last: string | null = null;
  try {
    last = localStorage.getItem(LAST_ORG_KEY);
  } catch {
    // ignore
  }
  const org = orgs.find((o) => o.slug === last) ?? orgs[0];
  return org ? `/${org.slug}` : '/onboarding';
}

function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <PageLoader />;
  if (status === 'guest') return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

function GuestOnly() {
  const { status } = useAuth();
  const home = useHomePath();
  const next = new URLSearchParams(useLocation().search).get('next');
  if (status === 'loading') return <PageLoader />;
  // Only follow same-site paths, never an absolute URL from the query string.
  if (status === 'authed') return <Navigate to={next?.startsWith('/') && !next.startsWith('//') ? next : home} replace />;
  return <Outlet />;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<GuestOnly />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route element={<RequireAuth />}>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/:orgSlug" element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<BoardPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/billing" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
