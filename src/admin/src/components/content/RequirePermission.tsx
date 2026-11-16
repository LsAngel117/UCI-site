/**
 * Route-level permission guard for content modules (docs/09 §7, docs/11 §9).
 *
 * This is a UX boundary only: hiding a screen does not authorize anything, the
 * API still evaluates the session and permissions on every request.
 */
import type { ReactNode } from 'react';
import type { PermissionName } from '@shared/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenPanel } from './States';

export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionName;
  children: ReactNode;
}) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) {
    return <ForbiddenPanel permission={permission} />;
  }
  return <>{children}</>;
}

/**
 * Any-of variant for section landing pages whose children have different
 * permissions (an operator with only `seo.read` still reaches `/sitio`).
 */
export function RequireAnyPermission({
  permissions,
  children,
}: {
  permissions: readonly PermissionName[];
  children: ReactNode;
}) {
  const { hasAnyPermission } = useAuth();
  if (!hasAnyPermission(permissions)) {
    return <ForbiddenPanel permission={permissions.join(' | ')} />;
  }
  return <>{children}</>;
}
