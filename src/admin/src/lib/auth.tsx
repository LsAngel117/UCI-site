/**
 * Session + permission context for the admin panel (docs/09 §7).
 *
 * The API is the authority: on mount the provider calls `GET /auth/me`, and
 * every permission check reads the set resolved server-side. There are no
 * tokens in storage — the browser sends the HttpOnly cookie automatically
 * because every request uses `credentials: 'include'` (docs/09 §5).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CurrentUserResponse, PermissionName } from '@shared/api';
import {
  ApiError,
  login as loginRequest,
  logout as logoutRequest,
  me as meRequest,
} from './api';

/**
 * `unavailable` means the session could not be verified for a reason other
 * than "not signed in" (network/5xx). It is distinct from `anonymous` so the
 * UI can offer a retry instead of wrongly showing the login form.
 */
export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'anonymous'
  | 'unavailable';

export interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUserResponse | null;
  /** Human-readable reason when `status === 'unavailable'`. */
  sessionError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (permission: PermissionName) => boolean;
  hasAnyPermission: (permissions: readonly PermissionName[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'No pudimos verificar tu sesión.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus('loading');
    setSessionError(null);
    try {
      const current = await meRequest();
      setUser(current);
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      if (error instanceof ApiError && error.isUnauthorized) {
        setStatus('anonymous');
      } else {
        setSessionError(messageFor(error));
        setStatus('unavailable');
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    await loginRequest({ email, password });
    // Login returns the identity only; permissions come from `/auth/me`, the
    // single source the whole UI trusts (docs/09 §7).
    const current = await meRequest();
    setUser(current);
    setSessionError(null);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } catch (error) {
      // A 401 means the session was already gone — still a successful sign-out.
      // For other failures we sign out locally anyway so the operator is never
      // trapped in a session they asked to close.
      if (!(error instanceof ApiError && error.isUnauthorized)) {
        setSessionError(messageFor(error));
      }
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const hasPermission = useCallback(
    (permission: PermissionName) =>
      user?.permissions.includes(permission) ?? false,
    [user],
  );

  const hasAnyPermission = useCallback(
    (permissions: readonly PermissionName[]) =>
      permissions.some((permission) =>
        user?.permissions.includes(permission),
      ),
    [user],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      sessionError,
      login,
      logout,
      refresh,
      hasPermission,
      hasAnyPermission,
    }),
    [
      status,
      user,
      sessionError,
      login,
      logout,
      refresh,
      hasPermission,
      hasAnyPermission,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
