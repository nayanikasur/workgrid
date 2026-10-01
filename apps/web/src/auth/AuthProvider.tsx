import type { LoginInput, OrgDTO, RegisterInput, UserDTO } from '@workgrid/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, refreshSession, setAccessToken, setSessionLostHandler, type AuthPayload } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

interface AuthState {
  status: 'loading' | 'authed' | 'guest';
  user: UserDTO | null;
  orgs: OrgDTO[];
}

interface AuthContextValue extends AuthState {
  login: (input: LoginInput) => Promise<AuthPayload>;
  register: (input: RegisterInput) => Promise<AuthPayload>;
  logout: () => Promise<void>;
  /** Re-fetches the workspace list after creating, joining, renaming or leaving one. */
  reloadOrgs: () => Promise<OrgDTO[]>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const GUEST: AuthState = { status: 'guest', user: null, orgs: [] };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, orgs: [] });
  const queryClient = useQueryClient();

  const signIn = useCallback((payload: AuthPayload) => {
    setAccessToken(payload.accessToken);
    setState({ status: 'authed', user: payload.user, orgs: payload.orgs });
    return payload;
  }, []);

  const signOut = useCallback(() => {
    setAccessToken(null);
    disconnectSocket();
    queryClient.clear();
    setState(GUEST);
  }, [queryClient]);

  // Restore the session from the refresh cookie on first load.
  useEffect(() => {
    setSessionLostHandler(signOut);
    void refreshSession().then((payload) => (payload ? signIn(payload) : setState(GUEST)));
  }, [signIn, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      login: async (input) => signIn(await api.post<AuthPayload>('/auth/login', input)),
      register: async (input) => signIn(await api.post<AuthPayload>('/auth/register', input)),
      logout: async () => {
        await api.post('/auth/logout').catch(() => {});
        signOut();
      },
      reloadOrgs: async () => {
        const { orgs } = await api.get<{ orgs: OrgDTO[] }>('/orgs');
        setState((s) => ({ ...s, orgs }));
        return orgs;
      },
    }),
    [state, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For screens that only render once signed in. */
export function useUser(): UserDTO {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires an authenticated session');
  return user;
}
