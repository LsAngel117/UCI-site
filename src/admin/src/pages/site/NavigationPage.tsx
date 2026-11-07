/**
 * Public-site navigation (Phase 10D2, docs/08 §14, docs/05 §45).
 *
 * CRUD for the HEADER/FOOTER menus with parent/child hierarchy, visibility,
 * target and location. Reordering is a pair of explicit up/down buttons — no
 * drag-and-drop dependency — and every move sends a normalized position batch
 * to `POST /admin/navigation/reorder`.
 */
import { useEffect, useState } from 'react';
import type {
  NavigationAdminDto,
  NavigationLocation,
} from '@shared/cms';
import {
  createNavigation,
  deleteNavigation,
  listNavigation,
  reorderNavigation,
  updateNavigation,
} from '../../lib/admin-api';
import {
  emptyNavigationForm,
  groupNavigation,
  navigationLocationLabel,
  navigationPagePermissions,
  navigationTargetLabel,
  navigationToForm,
  nextNavigationOrder,
  parentCandidates,
  reorderPayload,
  validateNavigationForm,
  type NavigationForm,
} from '../../lib/admin-ui';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { Dialog } from '../../components/content/Dialog';
import { ConfirmDialog } from '../../components/content/ConfirmDialog';
import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
} from '../../components/content/States';
import { FieldError, Notice } from '../../components/admin/Notice';

interface NoticeState {
  tone: 'success' | 'error' | 'info' | 'warning';
  text: string;
}

interface DialogState {
  mode: 'create' | 'edit';
  item?: NavigationAdminDto;
}

// ---------------------------------------------------------------------------
// Create / edit dialog
// ---------------------------------------------------------------------------

interface NavigationDialogProps {
  mode: 'create' | 'edit';
  item?: NavigationAdminDto;
  rows: readonly NavigationAdminDto[];
  onClose: () => void;
  onSaved: (mode: 'create' | 'edit', item: NavigationAdminDto) => void;
}

function NavigationDialog({
  mode,
  item,
  rows,
  onClose,
  onSaved,
}: NavigationDialogProps) {
  const [form, setForm] = useState<NavigationForm>(() =>
    item
      ? navigationToForm(item)
      : {
          ...emptyNavigationForm('HEADER'),
          order: nextNavigationOrder(rows, 'HEADER', null),
        },
  );
  const [errors, setErrors] = useState<ReturnType<
    typeof validateNavigationForm
  >>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parents = parentCandidates(rows, form.location, item?.id);

  function patch(next: Partial<NavigationForm>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function changeLocation(location: NavigationLocation) {
    setForm((current) => {
      const candidates = parentCandidates(rows, location, item?.id);
      const parentId = candidates.some(
        (candidate) => candidate.id === current.parentId,
      )
        ? current.parentId
        : '';
      return { ...current, location, parentId };
    });
  }

  async function submit() {
    if (busy) return;
    const nextErrors = validateNavigationForm(form);
    setErrors(nextErrors);
    setServerError(null);
    if (Object.keys(nextErrors).length > 0) return;

    const payload = {
      label: form.label.trim(),
      href: form.href.trim(),
      external: form.external,
      location: form.location,
      target: form.target === '' ? null : form.target,
      visible: form.visible,
      parentId: form.parentId === '' ? null : form.parentId,
      order: form.order,
    };

    setBusy(true);
    try {
      const saved =
        mode === 'create'
          ? await createNavigation(payload)
          : await updateNavigation(item!.id, payload);
      onSaved(mode, saved);
    } catch (error) {
      setServerError(describeError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={mode === 'create' ? 'Nuevo enlace de navegación' : 'Editar enlace'}
      description="Los enlaces internos empiezan con «/»; los externos deben ser una URL http(s)."
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
            form="navigation-form"
            className="button button--primary"
            disabled={busy}
          >
            {busy ? 'Guardando…' : 'Guardar enlace'}
          </button>
        </>
      }
    >
      <form
        id="navigation-form"
        className="form-sections"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label className="field__label" htmlFor="nav-label">
              Etiqueta
            </label>
            <input
              id="nav-label"
              className="field__input"
              type="text"
              value={form.label}
              onChange={(event) => patch({ label: event.target.value })}
              aria-invalid={errors.label ? true : undefined}
            />
            {errors.label ? <FieldError>{errors.label}</FieldError> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="nav-href">
              Destino (href)
            </label>
            <input
              id="nav-href"
              className="field__input"
              type="text"
              value={form.href}
              onChange={(event) => patch({ href: event.target.value })}
              placeholder="/nosotros o https://…"
              aria-invalid={errors.href ? true : undefined}
            />
            {errors.href ? <FieldError>{errors.href}</FieldError> : null}
          </div>

          <div className="field">
            <label className="field__label" htmlFor="nav-location">
              Menú
            </label>
            <select
              id="nav-location"
              className="field__input"
              value={form.location}
              onChange={(event) =>
                changeLocation(event.target.value as NavigationLocation)
              }
            >
              <option value="HEADER">Encabezado</option>
              <option value="FOOTER">Pie de página</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="nav-parent">
              Elemento superior
            </label>
            <select
              id="nav-parent"
              className="field__input"
              value={form.parentId}
              onChange={(event) => patch({ parentId: event.target.value })}
            >
              <option value="">Sin elemento superior (nivel principal)</option>
              {parents.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {`${'— '.repeat(candidate.depth)}${candidate.label}`}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="nav-target">
              Comportamiento del enlace
            </label>
            <select
              id="nav-target"
              className="field__input"
              value={form.target}
              onChange={(event) =>
                patch({
                  target: event.target.value as NavigationForm['target'],
                })
              }
            >
              <option value="">Predeterminado</option>
              <option value="_self">Misma pestaña</option>
              <option value="_blank">Nueva pestaña</option>
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="nav-order">
              Orden
            </label>
            <input
              id="nav-order"
              className="field__input"
              type="number"
              min={0}
              step={1}
              value={form.order}
              onChange={(event) =>
                patch({
                  order:
                    event.target.value === ''
                      ? 0
                      : Number(event.target.value),
                })
              }
              aria-invalid={errors.order ? true : undefined}
            />
            {errors.order ? <FieldError>{errors.order}</FieldError> : null}
          </div>
        </div>

        <div className="field">
          <label className="checkbox" htmlFor="nav-external">
            <input
              id="nav-external"
              type="checkbox"
              checked={form.external}
              onChange={(event) => patch({ external: event.target.checked })}
            />
            <span className="checkbox__label">
              Es un enlace externo (otro sitio)
            </span>
          </label>
        </div>

        <div className="field">
          <label className="checkbox" htmlFor="nav-visible">
            <input
              id="nav-visible"
              type="checkbox"
              checked={form.visible}
              onChange={(event) => patch({ visible: event.target.checked })}
            />
            <span className="checkbox__label">
              Visible en el sitio público
            </span>
          </label>
        </div>

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
// Tree
// ---------------------------------------------------------------------------

interface NavigationTreeProps {
  nodes: ReturnType<typeof groupNavigation>[number]['nodes'];
  rows: readonly NavigationAdminDto[];
  canUpdate: boolean;
  busyId: string | null;
  onMove: (item: NavigationAdminDto, direction: 'up' | 'down') => void;
  onEdit: (item: NavigationAdminDto) => void;
  onDelete: (item: NavigationAdminDto) => void;
}

function NavigationTree({
  nodes,
  rows,
  canUpdate,
  busyId,
  onMove,
  onEdit,
  onDelete,
}: NavigationTreeProps) {
  return (
    <ul className="nav-tree">
      {nodes.map((node) => {
        const item = node.item;
        const canMoveUp = reorderPayload(rows, item.id, 'up') !== null;
        const canMoveDown = reorderPayload(rows, item.id, 'down') !== null;
        const busy = busyId === item.id;
        return (
          <li key={item.id}>
            <div className="nav-tree__row">
              <div className="nav-tree__main">
                <span className="nav-tree__label">{item.label}</span>
                <span className="cell-meta mono">{item.href}</span>
                <span className="badge-row">
                  <span className="badge badge--role">Orden {item.order}</span>
                  <span className="badge badge--role">
                    {navigationTargetLabel(item.target)}
                  </span>
                  {item.external ? (
                    <span className="badge badge--role">Externo</span>
                  ) : null}
                  {!item.visible ? (
                    <span className="badge badge--state-inactive">Oculto</span>
                  ) : null}
                </span>
              </div>
              {canUpdate ? (
                <div className="row-actions">
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => onMove(item, 'up')}
                    disabled={!canMoveUp || busy}
                    aria-label={`Subir ${item.label}`}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => onMove(item, 'down')}
                    disabled={!canMoveDown || busy}
                    aria-label={`Bajar ${item.label}`}
                  >
                    Bajar
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => onEdit(item)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => onDelete(item)}
                  >
                    Eliminar
                  </button>
                </div>
              ) : null}
            </div>
            {node.children.length > 0 ? (
              <div className="nav-tree__children">
                <NavigationTree
                  nodes={node.children}
                  rows={rows}
                  canUpdate={canUpdate}
                  busyId={busyId}
                  onMove={onMove}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function NavigationPage() {
  const { hasPermission } = useAuth();
  const permissions = navigationPagePermissions(hasPermission);

  const [rows, setRows] = useState<NavigationAdminDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<NavigationAdminDto | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listNavigation(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRows(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reloadKey]);

  const groups = groupNavigation(rows);

  function success(message: string) {
    setNotice({ tone: 'success', text: message });
    setReloadKey((key) => key + 1);
  }

  async function move(
    item: NavigationAdminDto,
    direction: 'up' | 'down',
  ) {
    const items = reorderPayload(rows, item.id, direction);
    if (!items) return;
    setBusyId(item.id);
    setNotice(null);
    try {
      await reorderNavigation({ items });
      success(`El orden de «${item.label}» se actualizó.`);
    } catch (reason) {
      setNotice({ tone: 'error', text: describeError(reason) });
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteNavigation(deleteTarget.id);
      const label = deleteTarget.label;
      setDeleteTarget(null);
      success(`El enlace «${label}» se eliminó del menú.`);
    } catch (reason) {
      setDeleteError(describeError(reason));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Sitio</p>
        <div className="page__title-row">
          <h1 className="page__title">Navegación</h1>
          {permissions.update ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setDialog({ mode: 'create' })}
            >
              Nuevo enlace
            </button>
          ) : null}
        </div>
        <p className="page__lede">
          Menús del encabezado y pie del sitio público, con jerarquía, orden,
          visibilidad y comportamiento del enlace. El sitio solo publica los
          enlaces visibles.
        </p>
      </header>

      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      {!permissions.update ? (
        <Notice tone="info">
          Tu rol incluye <code>navigation.read</code> pero no{' '}
          <code>navigation.update</code>: la navegación es de solo lectura.
        </Notice>
      ) : null}

      {loading ? (
        <LoadingPanel label="Cargando navegación…" />
      ) : error ? (
        <ErrorPanel
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : rows.length === 0 ? (
        <EmptyPanel
          title="Los menús todavía no tienen enlaces"
          message={
            permissions.update
              ? 'Creá el primer enlace del encabezado o pie de página.'
              : 'Cuando un editor agregue enlaces, aparecerán acá.'
          }
          action={
            permissions.update ? (
              <button
                type="button"
                className="button button--primary"
                onClick={() => setDialog({ mode: 'create' })}
              >
                Nuevo enlace
              </button>
            ) : undefined
          }
        />
      ) : (
        groups.map((group) => (
          <section
            className="form-section"
            key={group.location}
            aria-labelledby={`nav-group-${group.location}`}
          >
            <div className="form-section__head">
              <h2
                className="form-section__title"
                id={`nav-group-${group.location}`}
              >
                {navigationLocationLabel(group.location)}
              </h2>
              <p className="form-section__hint">
                {group.nodes.length === 0
                  ? 'Este menú no tiene enlaces todavía.'
                  : `${group.nodes.length} enlace${
                      group.nodes.length === 1 ? '' : 's'
                    } de nivel principal.`}
              </p>
            </div>
            {group.nodes.length > 0 ? (
              <NavigationTree
                nodes={group.nodes}
                rows={rows}
                canUpdate={permissions.update}
                busyId={busyId}
                onMove={(item, direction) => {
                  void move(item, direction);
                }}
                onEdit={(item) => {
                  setNotice(null);
                  setDialog({ mode: 'edit', item });
                }}
                onDelete={(item) => {
                  setDeleteError(null);
                  setDeleteTarget(item);
                }}
              />
            ) : null}
          </section>
        ))
      )}

      {dialog ? (
        <NavigationDialog
          mode={dialog.mode}
          item={dialog.item}
          rows={rows}
          onClose={() => setDialog(null)}
          onSaved={(mode, saved) => {
            setDialog(null);
            success(
              mode === 'create'
                ? `El enlace «${saved.label}» se creó.`
                : `El enlace «${saved.label}» se actualizó.`,
            );
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar enlace"
        confirmLabel="Eliminar enlace"
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          void confirmDelete();
        }}
      >
        <p>
          «{deleteTarget?.label}» se eliminará de la navegación del{' '}
          {deleteTarget?.location === 'FOOTER' ? 'pie de página' : 'encabezado'}.
        </p>
        <p>
          Los enlaces que dependían de él no se borran: pasan a ser de nivel
          principal.
        </p>
        {deleteError ? (
          <p className="form__error" role="alert">
            {deleteError}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
