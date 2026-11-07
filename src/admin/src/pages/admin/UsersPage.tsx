/**
 * Administrative users (Phase 10D2, docs/08 §8, docs/11 §9).
 *
 * List → search/role/state filters → paginated table, plus create, edit and
 * disable flows. Every mutation is permission-gated in the UI and authorized
 * again by the API; the 409 "last active administrator" safeguard is shown with
 * its own explanation instead of a generic conflict message.
 */
import { useEffect, useState } from 'react';
import type { AdminUserDto, RoleDto } from '@shared/admin';
import type { PaginationMeta } from '@shared/api';
import {
  createAdminUser,
  disableAdminUser,
  listAdminUsers,
  listRoles,
  updateAdminUser,
} from '../../lib/admin-api';
import {
  adminUserPermissions,
  buildUserListQuery,
  describeAdminMutationError,
  emptyUserCreateForm,
  emptyUserFilters,
  PASSWORD_MIN_LENGTH,
  userFiltersActive,
  userToEditForm,
  validateUserCreateForm,
  validateUserEditForm,
  type UserCreateForm,
  type UserCreateFormErrors,
  type UserEditForm,
  type UserFilters,
} from '../../lib/admin-ui';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { ConfirmDialog } from '../../components/content/ConfirmDialog';
import { Dialog } from '../../components/content/Dialog';
import {
  DataTable,
  type DataTableColumn,
} from '../../components/content/DataTable';
import { FilterBar } from '../../components/content/FilterBar';
import { Pagination } from '../../components/content/Pagination';
import { FieldError, Notice } from '../../components/admin/Notice';

const PAGE_LIMIT = 20;

interface NoticeState {
  tone: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

// ---------------------------------------------------------------------------
// Create dialog
// ---------------------------------------------------------------------------

interface CreateUserDialogProps {
  roles: RoleDto[];
  canAssignRoles: boolean;
  onClose: () => void;
  onCreated: (user: AdminUserDto) => void;
}

function CreateUserDialog({
  roles,
  canAssignRoles,
  onClose,
  onCreated,
}: CreateUserDialogProps) {
  const [form, setForm] = useState<UserCreateForm>(emptyUserCreateForm());
  const [errors, setErrors] = useState<UserCreateFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(name: string) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(name)
        ? current.roles.filter((role) => role !== name)
        : [...current.roles, name],
    }));
  }

  async function submit() {
    if (busy) return;
    const nextErrors = validateUserCreateForm(form);
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const created = await createAdminUser({
        email: form.email.trim(),
        name: form.name.trim(),
        password: form.password,
        ...(canAssignRoles ? { roles: form.roles } : {}),
      });
      onCreated(created);
    } catch (error) {
      setServerError(describeAdminMutationError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title="Nueva cuenta"
      description="La contraseña se guarda cifrada con Argon2id y nunca vuelve al panel."
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
            type="submit"
            form="create-user-form"
            className="button button--primary"
            disabled={busy}
          >
            {busy ? 'Creando…' : 'Crear cuenta'}
          </button>
        </>
      }
    >
      <form
        id="create-user-form"
        className="form-sections"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="new-user-email">
              Correo electrónico
            </label>
            <input
              id="new-user-email"
              className="field__input"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? 'new-user-email-error' : undefined}
            />
            {errors.email ? (
              <div id="new-user-email-error">
                <FieldError>{errors.email}</FieldError>
              </div>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="new-user-name">
              Nombre visible
            </label>
            <input
              id="new-user-name"
              className="field__input"
              type="text"
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? 'new-user-name-error' : undefined}
            />
            {errors.name ? (
              <div id="new-user-name-error">
                <FieldError>{errors.name}</FieldError>
              </div>
            ) : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="new-user-password">
              Contraseña inicial
            </label>
            <input
              id="new-user-password"
              className="field__input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={
                errors.password
                  ? 'new-user-password-error'
                  : 'new-user-password-help'
              }
            />
            <p className="field__help" id="new-user-password-help">
              Mínimo {PASSWORD_MIN_LENGTH} caracteres. El servidor valida la
              longitud y aplica el hash.
            </p>
            {errors.password ? (
              <div id="new-user-password-error">
                <FieldError>{errors.password}</FieldError>
              </div>
            ) : null}
          </div>
        </div>

        {canAssignRoles ? (
          <fieldset className="field">
            <legend className="field__label">Roles</legend>
            {roles.length > 0 ? (
              <div className="checkbox-grid">
                {roles.map((role) => (
                  <label className="checkbox" key={role.id}>
                    <input
                      type="checkbox"
                      checked={form.roles.includes(role.name)}
                      onChange={() => toggleRole(role.name)}
                    />
                    <span>
                      <span className="checkbox__label">{role.name}</span>
                      {role.description ? (
                        <span className="field__help">{role.description}</span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="field__help">
                No hay roles disponibles para asignar. La cuenta se creará sin
                rol y un administrador podrá asignarlo después.
              </p>
            )}
          </fieldset>
        ) : (
          <p className="field__help">
            Tu rol no incluye <code>roles.read</code>, así que no podés asignar
            roles desde acá. La cuenta se creará sin rol.
          </p>
        )}

        {serverError ? (
          <p className="form__error" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

interface EditUserDialogProps {
  user: AdminUserDto;
  roles: RoleDto[];
  canAssignRoles: boolean;
  onClose: () => void;
  onSaved: (user: AdminUserDto) => void;
}

function EditUserDialog({
  user,
  roles,
  canAssignRoles,
  onClose,
  onSaved,
}: EditUserDialogProps) {
  const [form, setForm] = useState<UserEditForm>(userToEditForm(user));
  const [errors, setErrors] = useState<{ name?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleRole(name: string) {
    setForm((current) => ({
      ...current,
      roles: current.roles.includes(name)
        ? current.roles.filter((role) => role !== name)
        : [...current.roles, name],
    }));
  }

  async function submit() {
    if (busy) return;
    const nextErrors = validateUserEditForm(form);
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    try {
      const updated = await updateAdminUser(user.id, {
        name: form.name.trim(),
        active: form.active,
        ...(canAssignRoles ? { roles: form.roles } : {}),
      });
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
      title={`Editar ${user.name || user.email}`}
      description="La contraseña no se cambia desde este formulario: es un flujo separado y auditable."
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
            type="submit"
            form="edit-user-form"
            className="button button--primary"
            disabled={busy}
          >
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      }
    >
      <form
        id="edit-user-form"
        className="form-sections"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="field">
          <label className="field__label" htmlFor="edit-user-email">
            Correo electrónico
          </label>
          <input
            id="edit-user-email"
            className="field__input"
            type="email"
            value={user.email}
            readOnly
            disabled
          />
          <p className="field__help">
            El correo es la identidad de la cuenta y no se edita desde acá.
          </p>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="edit-user-name">
            Nombre visible
          </label>
          <input
            id="edit-user-name"
            className="field__input"
            type="text"
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'edit-user-name-error' : undefined}
          />
          {errors.name ? (
            <div id="edit-user-name-error">
              <FieldError>{errors.name}</FieldError>
            </div>
          ) : null}
        </div>

        <div className="field">
          <label className="checkbox" htmlFor="edit-user-active">
            <input
              id="edit-user-active"
              type="checkbox"
              checked={form.active}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  active: event.target.checked,
                }))
              }
            />
            <span className="checkbox__label">Cuenta activa</span>
          </label>
          <p className="field__help">
            Al desactivar la cuenta se revocan todas sus sesiones activas. El
            último administrador activo no puede desactivarse.
          </p>
        </div>

        {canAssignRoles ? (
          <fieldset className="field">
            <legend className="field__label">Roles</legend>
            <div className="checkbox-grid">
              {roles.map((role) => (
                <label className="checkbox" key={role.id}>
                  <input
                    type="checkbox"
                    checked={form.roles.includes(role.name)}
                    onChange={() => toggleRole(role.name)}
                  />
                  <span>
                    <span className="checkbox__label">{role.name}</span>
                    {role.description ? (
                      <span className="field__help">{role.description}</span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            <p className="field__help">
              Quitar el rol ADMIN o desactivar la cuenta del último
              administrador activo es rechazado por el servidor.
            </p>
          </fieldset>
        ) : (
          <p className="field__help">
            Tu rol no incluye <code>roles.read</code>: los roles no se pueden
            modificar desde acá.
          </p>
        )}

        {serverError ? (
          <p className="form__error" role="alert">
            {serverError}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function UsersPage() {
  const { hasPermission } = useAuth();
  const permissions = adminUserPermissions(hasPermission);
  const canLoadRoles = hasPermission('roles.read');

  const [filters, setFilters] = useState<UserFilters>(emptyUserFilters());
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AdminUserDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserDto | null>(null);
  const [disableTarget, setDisableTarget] = useState<AdminUserDto | null>(null);
  const [disabling, setDisabling] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const filtersActive = userFiltersActive(filters);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = buildUserListQuery(
      { ...filters, search: debouncedSearch },
      page,
      PAGE_LIMIT,
    );

    listAdminUsers(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.data);
        setMeta(result.meta);
        if (result.meta.totalPages > 0 && page > result.meta.totalPages) {
          setPage(result.meta.totalPages);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedSearch, filters.active, filters.role, page, reloadKey]);

  useEffect(() => {
    if (!canLoadRoles) return;
    const controller = new AbortController();
    setRolesError(null);
    listRoles(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRoles(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setRolesError(describeError(reason));
      });
    return () => controller.abort();
  }, [canLoadRoles]);

  function resetFilters() {
    setFilters(emptyUserFilters());
    setPage(1);
  }

  function afterMutation(message: string) {
    setNotice({ tone: 'success', text: message });
    setReloadKey((key) => key + 1);
  }

  async function confirmDisable() {
    if (!disableTarget || disabling) return;
    setDisabling(true);
    setDisableError(null);
    try {
      const updated = await disableAdminUser(disableTarget.id);
      setDisableTarget(null);
      afterMutation(
        `La cuenta «${updated.name || updated.email}» quedó deshabilitada y sus sesiones se revocaron.`,
      );
    } catch (reason) {
      setDisableError(describeAdminMutationError(reason));
    } finally {
      setDisabling(false);
    }
  }

  const columns: DataTableColumn<AdminUserDto>[] = [
    {
      key: 'user',
      header: 'Cuenta',
      render: (user) => (
        <div className="cell-stack">
          <span className="cell-title">{user.name || 'Sin nombre'}</span>
          <span className="cell-meta">{user.email}</span>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Roles',
      render: (user) =>
        user.roles.length > 0 ? (
          <div className="badge-row">
            {user.roles.map((role) => (
              <span className="badge badge--role" key={role.id}>
                {role.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="cell-meta">Sin rol</span>
        ),
    },
    {
      key: 'active',
      header: 'Estado',
      render: (user) => (
        <span
          className={`badge badge--state-${
            user.active ? 'active' : 'inactive'
          }`}
        >
          {user.active ? 'Activa' : 'Deshabilitada'}
        </span>
      ),
    },
    {
      key: 'updated',
      header: 'Actualizada',
      render: (user) => formatInstant(user.updatedAt),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'cell-actions',
      render: (user) => (
        <div className="row-actions">
          {permissions.update ? (
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => {
                setNotice(null);
                setEditTarget(user);
              }}
            >
              Editar
            </button>
          ) : null}
          {permissions.disable && user.active ? (
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => {
                setDisableError(null);
                setDisableTarget(user);
              }}
            >
              Deshabilitar
            </button>
          ) : null}
          {!permissions.update && !permissions.disable ? (
            <span className="cell-meta">Solo lectura</span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Administración</p>
        <div className="page__title-row">
          <h1 className="page__title">Usuarios</h1>
          {permissions.create ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setCreateOpen(true)}
            >
              Nueva cuenta
            </button>
          ) : null}
        </div>
        <p className="page__lede">
          Cuentas del panel, sus roles y su estado de acceso. Las acciones
          visibles respetan los permisos de tu rol y el servidor las vuelve a
          autorizar en cada solicitud.
        </p>
      </header>

      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      {rolesError ? (
        <Notice tone="warning">
          No pudimos cargar los roles para filtrar o asignar: {rolesError} La
          lista de usuarios sigue disponible.
        </Notice>
      ) : null}

      <FilterBar
        onReset={resetFilters}
        active={filtersActive}
        actions={
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            Actualizar
          </button>
        }
      >
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="user-search">
            Buscar usuarios
          </label>
          <input
            id="user-search"
            className="field__input"
            type="search"
            value={filters.search}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                search: event.target.value,
              }));
              setPage(1);
            }}
            placeholder="Buscar por nombre o correo…"
          />
        </div>
        {canLoadRoles ? (
          <div className="field field--inline">
            <label className="field__label sr-only" htmlFor="user-role-filter">
              Filtrar por rol
            </label>
            <select
              id="user-role-filter"
              className="field__input"
              value={filters.role}
              onChange={(event) => {
                setFilters((current) => ({
                  ...current,
                  role: event.target.value,
                }));
                setPage(1);
              }}
            >
              <option value="">Todos los roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.name}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="user-state-filter">
            Filtrar por estado
          </label>
          <select
            id="user-state-filter"
            className="field__input"
            value={filters.active}
            onChange={(event) => {
              setFilters((current) => ({
                ...current,
                active: event.target.value as UserFilters['active'],
              }));
              setPage(1);
            }}
          >
            <option value="">Todas las cuentas</option>
            <option value="true">Solo activas</option>
            <option value="false">Solo deshabilitadas</option>
          </select>
        </div>
      </FilterBar>

      <DataTable
        caption="Cuentas del panel administrativo"
        columns={columns}
        rows={rows}
        rowKey={(user) => user.id}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
        emptyTitle={
          filtersActive
            ? 'No hay cuentas que coincidan con los filtros'
            : 'Todavía no hay cuentas'
        }
        emptyMessage={
          filtersActive
            ? 'Probá con otro término o limpiá los filtros.'
            : permissions.create
              ? 'Creá la primera cuenta para que el equipo acceda al panel.'
              : 'Cuando un administrador cree cuentas, aparecerán acá.'
        }
        emptyAction={
          filtersActive ? (
            <button
              type="button"
              className="button button--quiet"
              onClick={resetFilters}
            >
              Limpiar filtros
            </button>
          ) : undefined
        }
      />

      {meta && rows.length > 0 ? (
        <Pagination meta={meta} onPageChange={setPage} noun="cuentas" />
      ) : null}

      {createOpen ? (
        <CreateUserDialog
          roles={roles}
          canAssignRoles={canLoadRoles}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            afterMutation(`La cuenta «${created.name || created.email}» se creó.`);
          }}
        />
      ) : null}

      {editTarget ? (
        <EditUserDialog
          user={editTarget}
          roles={roles}
          canAssignRoles={canLoadRoles}
          onClose={() => setEditTarget(null)}
          onSaved={(updated) => {
            setEditTarget(null);
            afterMutation(
              `La cuenta «${updated.name || updated.email}» se actualizó.`,
            );
          }}
        />
      ) : null}

      <ConfirmDialog
        open={disableTarget !== null}
        title="Deshabilitar cuenta"
        confirmLabel="Deshabilitar cuenta"
        busy={disabling}
        danger
        onCancel={() => {
          if (!disabling) setDisableTarget(null);
        }}
        onConfirm={() => {
          void confirmDisable();
        }}
      >
        <p>
          «{disableTarget?.name || disableTarget?.email}» dejará de poder
          iniciar sesión y se revocarán todas sus sesiones activas.
        </p>
        <p>La acción queda registrada en la auditoría del panel.</p>
        {disableError ? (
          <p className="form__error" role="alert">
            {disableError}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
