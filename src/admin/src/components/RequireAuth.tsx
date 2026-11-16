/**
 * Session guard for every authenticated route (docs/09 §4, §7).
 *
 * Frontend protection is a UX mechanism, not a security boundary: the API
 * authorizes every request regardless of what the browser renders.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { SessionGate } from './SessionGate';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, sessionError, refresh } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <SessionGate
        title="Verificando tu sesión"
        detail="Estamos comprobando tus permisos de acceso."
        busy
      />
    );
  }

  if (status === 'unavailable') {
    return (
      <SessionGate
        title="No pudimos verificar tu sesión"
        detail={
          sessionError ??
          'El servidor no respondió. Revisá tu conexión e intentá de nuevo.'
        }
        onRetry={() => {
          void refresh();
        }}
      />
    );
  }

  if (status === 'anonymous') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}
