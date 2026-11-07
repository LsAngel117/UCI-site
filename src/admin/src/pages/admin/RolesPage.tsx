/**
 * Roles & permissions (Phase 10D2, docs/08 §9, docs/11 §9).
 *
 * The page renders the complete permission matrix (roles × canonical
 * vocabulary) and edits one role's grants at a time. The ADMIN safeguard —
 * keeping `roles.update` — is warned in the UI and still enforced by the API,
 * whose 409 is shown honestly.
 */
import { Fragment, useEffect, useState } from 'react';
import type { PermissionDto, RoleDto } from '@shared/admin';
import type { PermissionName } from '@shared/api';
import { listPermissions, listRoles, updateRole } from '../../lib/admin-api';
import {
  adminCriticalMessage,
  adminRoleMissingCritical,
  describeAdminMutationError,
  groupPermissions,
  rolePagePermissions,
  togglePermission,
} from '../../lib/admin-ui';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import { Dialog } from '../../components/content/Dialog';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../../components/content/States';
import { Notice } from '../../components/admin/Notice';

interface NoticeState {
  tone: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

interface RolePermissionsDialogProps {
  role: RoleDto;
  permissions: PermissionDto[];
  onClose: () => void;
  onSaved: (role: RoleDto) => void;
}

function RolePermissionsDialog({
  role,
  permissions,
  onClose,
  onSaved,
}: RolePermissionsDialogProps) {
  const canonical = permissions.map((permission) => permission.name);
  const [selected, setSelected] = useState<PermissionName[]>(
    canonical.filter((name) =>
      role.permissions.some((permission) => permission.name === name),
    ),
  );
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const groups = groupPermissions(permissions);
  const missingCritical = adminRoleMissingCritical(role.name, selected);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setServerError(null);
    try {
      // Send the canonical order; the server treats the list as a complete
      // replacement and re-sorts it, but keeping the request stable avoids
      // noisy audit diffs.
      const next = canonical.filter((name) => selected.includes(name));
      const updated = await updateRole(role.id, { permissions: next });
      onSaved(updated);
    } catch (error) {
      setServerError(describeAdminMutationError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={`Permisos de ${role.name}`}
      description="El conjunto marcado reemplaza por completo los permisos actuales del rol."
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              void submit();
            }}
            disabled={busy}
          >
            {busy ? 'Guardando…' : 'Guardar permisos'}
          </button>
        </>
      }
    >
      <div className="role-permissions">
        {groups.map((group) => (
          <fieldset className="role-permissions__group" key={group.key}>
            <legend className="role-permissions__legend">{group.label}</legend>
            {group.permissions.map((permission) => (
              <label className="checkbox" key={permission.name}>
                <input
                  type="checkbox"
                  checked={selected.includes(permission.name)}
                  onChange={() =>
                    setSelected((current) =>
                      togglePermission(current, permission.name),
                    )
                  }
                />
                <span>
                  <span className="checkbox__label mono">
                    {permission.name}
                  </span>
                  {permission.description ? (
                    <span className="field__help">
                      {permission.description}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>

      {missingCritical ? (
        <p className="form__notice form__notice--warning" role="status">
          {adminCriticalMessage()}
        </p>
      ) : null}

      {serverError ? (
        <p className="form__error" role="alert">
          {serverError}
        </p>
      ) : null}
    </Dialog>
  );
}

export function RolesPage() {
  const { hasPermission, refresh } = useAuth();
  const permissionsGranted = rolePagePermissions(hasPermission);

  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [editTarget, setEditTarget] = useState<RoleDto | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    Promise.all([
      listRoles(controller.signal),
      listPermissions(controller.signal),
    ])
      .then(([roleRows, permissionRows]) => {
        if (controller.signal.aborted) return;
        setRoles(roleRows);
        setPermissions(permissionRows);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  const groups = groupPermissions(permissions);

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Administración</p>
        <div className="page__title-row">
          <h1 className="page__title">Roles y permisos</h1>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
        <p className="page__lede">
          Los roles son datos: cada uno agrupa permisos del vocabulario
          canónico. La matriz muestra el estado actual y el editor reemplaza los
          permisos de un rol de forma completa y auditada.
        </p>
      </header>

      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      {!permissionsGranted.update ? (
        <Notice tone="info">
          Tu rol incluye <code>roles.read</code> pero no <code>roles.update</code>:
          la matriz es de solo lectura.
        </Notice>
      ) : null}

      {loading ? (
        <LoadingPanel label="Cargando roles y permisos…" />
      ) : error ? (
        <ErrorPanel
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : roles.length === 0 || permissions.length === 0 ? (
        <EmptyPanel
          title="No hay roles o permisos configurados"
          message="Cuando la base tenga los roles y el vocabulario de permisos, la matriz aparecerá acá."
        />
      ) : (
        <>
          <section className="form-section" aria-labelledby="role-matrix-title">
            <div className="form-section__head">
              <h2 className="form-section__title" id="role-matrix-title">
                Matriz de permisos
              </h2>
              <p className="form-section__hint">
                Las columnas son roles y las filas, permisos. Un ✓ indica que el
                rol tiene el permiso otorgado.
              </p>
            </div>
            <div className="matrix-wrap">
              <table className="matrix-table">
                <caption className="sr-only">
                  Permisos otorgados a cada rol
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Permiso</th>
                    {roles.map((role) => (
                      <th scope="col" key={role.id}>
                        {role.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.key}>
                      <tr className="matrix-table__group">
                        <th scope="colgroup" colSpan={roles.length + 1}>
                          {group.label}
                        </th>
                      </tr>
                      {group.permissions.map((permission) => (
                        <tr key={permission.name}>
                          <th scope="row">
                            <span className="mono">{permission.name}</span>
                          </th>
                          {roles.map((role) => {
                            const granted = role.permissions.some(
                              (entry) => entry.name === permission.name,
                            );
                            return (
                              <td
                                key={role.id}
                                className={granted ? 'is-granted' : undefined}
                              >
                                {granted ? (
                                  <span aria-label="Otorgado">✓</span>
                                ) : (
                                  <span aria-label="No otorgado">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="card-grid">
            {roles.map((role) => (
              <article className="card" key={role.id}>
                <div className="card__head">
                  <h2 className="card__title">{role.name}</h2>
                  <span className="badge badge--role">
                    {role.permissions.length}{' '}
                    {role.permissions.length === 1 ? 'permiso' : 'permisos'}
                  </span>
                </div>
                {role.description ? (
                  <p className="card__description">{role.description}</p>
                ) : null}
                <p className="cell-meta">
                  Actualizado {formatInstant(role.updatedAt)}
                </p>
                <div className="card__links">
                  {permissionsGranted.update ? (
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={() => {
                        setNotice(null);
                        setEditTarget(role);
                      }}
                    >
                      Editar permisos
                    </button>
                  ) : (
                    <span className="cell-meta">Solo lectura</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {editTarget ? (
        <RolePermissionsDialog
          role={editTarget}
          permissions={permissions}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setEditTarget(null);
            setRoles((current) =>
              current.map((role) => (role.id === updated.id ? updated : role)),
            );
            setNotice({
              tone: 'success',
              text: `Los permisos del rol «${updated.name}» se actualizaron.`,
            });
            // The edited role may be the operator's own: re-read the session so
            // the UI reflects the grants the server will actually enforce.
            void refresh();
          }}
        />
      ) : null}
    </section>
  );
}
