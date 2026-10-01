import type { ApiErrorBody, OrgDTO, UserDTO } from '@workgrid/shared';

export const API_ORIGIN: string = import.meta.env.VITE_API_URL ?? '';

export interface AuthPayload {
  user: UserDTO;
  orgs: OrgDTO[];
  accessToken: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** The access token lives in memory only; the httpOnly refresh cookie restores it after a reload. */
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

let onSessionLost: () => void = () => {};
export const setSessionLostHandler = (handler: () => void) => {
  onSessionLost = handler;
};

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API_ORIGIN}/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function toError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(res.status, body?.error.code ?? 'unknown', body?.error.message ?? 'Something went wrong', body?.error.details);
}

let refreshing: Promise<AuthPayload | null> | null = null;

/** Single-flight: concurrent 401s (and StrictMode's double effect) share one refresh call. */
export function refreshSession(): Promise<AuthPayload | null> {
  refreshing ??= send('POST', '/auth/refresh')
    .then(async (res) => {
      if (!res.ok) return null;
      const payload = (await res.json()) as AuthPayload;
      accessToken = payload.accessToken;
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await send(method, path, body);
    // An expired access token is refreshed transparently, once.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      if (await refreshSession()) {
        res = await send(method, path, body);
      } else {
        accessToken = null;
        onSessionLost();
      }
    }
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection.');
  }
  if (!res.ok) throw await toError(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
