/**
 * Sermon create/edit screen (docs/09 §22–§38).
 *
 * One form for both modes: `/contenido/sermones/nuevo` and
 * `/contenido/sermones/:id`. Saving sends the `version` the editor loaded, so a
 * concurrent edit is answered with a 409 and never silently overwritten; the
 * screen then offers an explicit "discard and reload" path. Lifecycle actions
 * are separate confirmed operations, exactly like the API (docs/08 §22).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SermonAdminDto } from '@shared/cms';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { describeError } from '../../../lib/errors';
import { formatInstant } from '../../../lib/format';
import {
  archiveSermon,
  createSermon,
  getSermon,
  listPeople,
  listSeries,
  listTopics,
  publishSermon,
  scheduleSermon,
  updateSermon,
} from '../../../lib/sermons-api';
import {
  availableLifecycleActions,
  emptySermonForm,
  formToCreateInput,
  formToUpdateInput,
  formsEqual,
  isFutureDateTime,
  isoFromDateTimeLocal,
  sermonPermissions,
  sermonToForm,
  toDateTimeLocalValue,
  validateSermonForm,
  type SermonFormErrors,
  type SermonFormValues,
} from '../../../lib/sermons-form';
import { ConfirmDialog } from '../../../components/content/ConfirmDialog';
import { Dialog } from '../../../components/content/Dialog';
import { ErrorPanel, EmptyPanel, LoadingPanel } from '../../../components/content/States';
import { StatusBadge } from '../../../components/content/StatusBadge';
import { SermonForm, type SermonTaxonomy } from './SermonForm';
import { SermonRevisionsPanel } from './SermonRevisionsPanel';

type LoadState = 'loading' | 'ready' | 'error' | 'notfound';
type NoticeTone = 'success' | 'warning' | 'error' | 'info';

interface EditorNotice {
  tone: NoticeTone;
  message: string;
}

interface EditorLocationState {
  created?: boolean;
}

interface ConflictState {
  message: string;
}

type ConfirmAction = 'publish' | 'archive';

const EMPTY_TAXONOMY: SermonTaxonomy = {
  people: [],
  series: [],
  topics: [],
  loading: true,
  error: null,
};

export function SermonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const permissions = sermonPermissions(hasPermission);

  const [loadState, setLoadState] = useState<LoadState>(isNew ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sermon, setSermon] = useState<SermonAdminDto | null>(null);
  const [values, setValues] = useState<SermonFormValues>(emptySermonForm);
  const [baseline, setBaseline] = useState<SermonFormValues>(emptySermonForm);
  const [errors, setErrors] = useState<SermonFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<EditorNotice | null>(() => {
    const state = location.state as EditorLocationState | null;
    return state?.created
      ? {
          tone: 'success',
          message: 'Sermón creado como borrador. Revisá el contenido y guardá los cambios.',
        }
      : null;
  });
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [taxonomy, setTaxonomy] = useState<SermonTaxonomy>(EMPTY_TAXONOMY);
  const [taxonomyKey, setTaxonomyKey] = useState(0);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const readOnly = !isNew && !permissions.update;
  const canSave = isNew ? permissions.create : permissions.update;
  const dirty = useMemo(() => !formsEqual(values, baseline), [values, baseline]);
  const actions = sermon
    ? availableLifecycleActions(sermon.status, permissions)
    : [];
  const lifecycleLocked = dirty || saving || readOnly;

  // Load the sermon being edited. `reloadKey` is also used after a conflict
  // reload, so the reset is always explicit and user-initiated.
  useEffect(() => {
    if (!id) {
      const empty = emptySermonForm();
      setSermon(null);
      setValues(empty);
      setBaseline(empty);
      setErrors({});
      setLoadState('ready');
      setLoadError(null);
      return;
    }

    const controller = new AbortController();
    setLoadState('loading');
    setLoadError(null);

    getSermon(id, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        const form = sermonToForm(loaded);
        setSermon(loaded);
        setValues(form);
        setBaseline(form);
        setErrors({});
        setLoadState('ready');
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 404) {
          setLoadState('notfound');
          return;
        }
        setLoadError(describeError(reason));
        setLoadState('error');
      });

    return () => controller.abort();
  }, [id, reloadKey]);

  // Taxonomy is independent from the sermon: a failure never blocks editing,
  // but the selects stay empty and the form says why.
  useEffect(() => {
    const controller = new AbortController();
    setTaxonomy((current) => ({ ...current, loading: true, error: null }));

    Promise.allSettled([
      listPeople({}, controller.signal),
      listSeries({}, controller.signal),
      listTopics({}, controller.signal),
    ]).then((results) => {
      if (controller.signal.aborted) return;
      const [people, series, topics] = results;
      const failures = results.flatMap((result) =>
        result.status === 'rejected' ? [describeError(result.reason)] : [],
      );
      setTaxonomy((current) => ({
        // Keep whatever loaded successfully before: a transient failure must
        // not make an existing selection look empty (and save it as such).
        people: people.status === 'fulfilled' ? people.value.data : current.people,
        series: series.status === 'fulfilled' ? series.value.data : current.series,
        topics: topics.status === 'fulfilled' ? topics.value.data : current.topics,
        loading: false,
        error:
          failures.length > 0
            ? failures[0] ?? 'No pudimos cargar parte de la taxonomía.'
            : null,
      }));
    });

    return () => controller.abort();
  }, [taxonomyKey]);

  // Browser-level guard for a refresh/close with unsaved changes (docs/09 §38).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // In-app guard: React Router's data-router blocker is unavailable with the
  // plain BrowserRouter used by 10A, so intercept same-tab link clicks while the
  // form is dirty and ask before letting the navigation continue.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      if (anchor.getAttribute('target') === '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      const leave = window.confirm(
        'Tenés cambios sin guardar. ¿Querés salir sin guardar?',
      );
      if (!leave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  function applySermon(updated: SermonAdminDto) {
    const form = sermonToForm(updated);
    setSermon(updated);
    setValues(form);
    setBaseline(form);
    setErrors({});
  }

  function changeField<K extends keyof SermonFormValues>(
    field: K,
    value: SermonFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSave(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!canSave || saving) return;

    const nextErrors = validateSermonForm(values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice({
        tone: 'error',
        message: 'Revisá los campos marcados antes de guardar.',
      });
      return;
    }

    setSaving(true);
    setNotice(null);
    setConflict(null);

    try {
      if (isNew) {
        const created = await createSermon(formToCreateInput(values));
        setNotice({
          tone: 'success',
          message: 'Sermón creado como borrador. Revisá el contenido y guardá los cambios.',
        });
        navigate(`/contenido/sermones/${created.id}`, {
          replace: true,
          state: { created: true } satisfies EditorLocationState,
        });
        return;
      }

      if (!sermon) return;
      const updated = await updateSermon(
        sermon.id,
        formToUpdateInput(values, sermon.version),
      );
      applySermon(updated);
      setNotice({
        tone: 'success',
        message: `Cambios guardados. Versión actual: ${updated.version}.`,
      });
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        if (reason.code === 'SLUG_TAKEN') {
          setErrors((current) => ({
            ...current,
            slug: 'Ese slug ya está en uso. Probá con otro.',
          }));
          setNotice({
            tone: 'error',
            message: 'No se guardó: el slug elegido ya está en uso.',
          });
        } else {
          setConflict({
            message:
              'Otra persona guardó este sermón desde que lo abriste. Para no pisar su trabajo, no se guardó nada.',
          });
          setNotice({
            tone: 'warning',
            message: 'Conflicto de versión: tus cambios siguen en el formulario.',
          });
        }
      } else if (reason instanceof ApiError && reason.status === 404) {
        setLoadState('notfound');
      } else {
        setNotice({ tone: 'error', message: describeError(reason) });
      }
    } finally {
      setSaving(false);
    }
  }

  async function reloadLatest() {
    if (!id || reloading) return;
    setReloading(true);
    try {
      const latest = await getSermon(id);
      applySermon(latest);
      setConflict(null);
      setReloadConfirmOpen(false);
      setNotice({
        tone: 'info',
        message: `Se cargó la versión más reciente (versión ${latest.version}). Los cambios locales se descartaron.`,
      });
    } catch (reason) {
      setConflict({ message: describeError(reason) });
    } finally {
      setReloading(false);
    }
  }

  async function performAction(action: ConfirmAction) {
    if (!sermon || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const updated =
        action === 'publish'
          ? await publishSermon(sermon.id)
          : await archiveSermon(sermon.id);
      applySermon(updated);
      setConfirmAction(null);
      setNotice({
        tone: 'success',
        message:
          action === 'publish'
            ? `«${updated.title}» se publicó y ya es visible en el sitio.`
            : `«${updated.title}» se archivó y dejó de ser público.`,
      });
    } catch (reason) {
      setActionError(describeError(reason));
    } finally {
      setActionBusy(false);
    }
  }

  function openSchedule() {
    setActionError(null);
    setScheduleError(null);
    setScheduleValue(toDateTimeLocalValue(sermon?.publishAt ?? null));
    setScheduleOpen(true);
  }

  async function confirmSchedule() {
    if (!sermon || scheduling) return;
    if (!isFutureDateTime(scheduleValue)) {
      setScheduleError('Elegí una fecha y hora futuras.');
      return;
    }
    const publishAt = isoFromDateTimeLocal(scheduleValue);
    if (!publishAt) {
      setScheduleError('La fecha y hora no son válidas.');
      return;
    }

    setScheduling(true);
    setScheduleError(null);
    try {
      const updated = await scheduleSermon(sermon.id, publishAt);
      applySermon(updated);
      setScheduleOpen(false);
      setNotice({
        tone: 'success',
        message: `Publicación programada para ${formatInstant(updated.publishAt)}.`,
      });
    } catch (reason) {
      setScheduleError(describeError(reason));
    } finally {
      setScheduling(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <section className="page">
        <LoadingPanel
          label="Cargando sermón…"
          detail="Estamos leyendo el contenido y su versión actual."
        />
      </section>
    );
  }

  if (loadState === 'notfound') {
    return (
      <section className="page">
        <EmptyPanel
          title="Ese sermón no existe"
          message="Puede haber sido eliminado o el enlace está mal formado."
          action={
            <Link className="button button--quiet" to="/contenido/sermones">
              Volver a sermones
            </Link>
          }
        />
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="page">
        <ErrorPanel
          title="No pudimos cargar el sermón"
          message={loadError ?? 'Intentá de nuevo en unos minutos.'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </section>
    );
  }

  const title = isNew ? 'Nuevo sermón' : sermon?.title ?? 'Editar sermón';

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Contenido · Sermones</p>
        <div className="page__title-row">
          <h1 className="page__title">{title}</h1>
          {sermon ? <StatusBadge status={sermon.status} /> : null}
          {dirty ? <span className="badge badge--dirty">Cambios sin guardar</span> : null}
          {readOnly ? <span className="badge badge--pending">Solo lectura</span> : null}
        </div>
        <p className="page__lede">
          {isNew
            ? 'El sermón se crea como borrador. Las acciones de publicación aparecen después del primer guardado.'
            : `Slug público: /sermones/${sermon?.slug ?? ''}. Versión ${sermon?.version ?? '—'}.`}
        </p>
      </header>

      {notice ? (
        <div
          className={`form__notice form__notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <p>{notice.message}</p>
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => setNotice(null)}
          >
            Cerrar aviso
          </button>
        </div>
      ) : null}

      {readOnly ? (
        <div className="panel panel--notice">
          <p>
            Podés ver este sermón, pero tu rol no incluye <code>sermons.update</code>.
            El formulario está deshabilitado y el servidor rechazaría cualquier
            intento de guardado.
          </p>
        </div>
      ) : null}

      {conflict ? (
        <ErrorPanel title="Conflicto de versión" message={conflict.message}>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setReloadConfirmOpen(true)}
            disabled={reloading}
          >
            Descartar mis cambios y recargar
          </button>
        </ErrorPanel>
      ) : null}

      {sermon ? (
        <div className="editor-meta">
          <div>
            <span className="editor-meta__label">Estado</span>
            <StatusBadge status={sermon.status} />
          </div>
          <div>
            <span className="editor-meta__label">Versión</span>
            <span>{sermon.version}</span>
          </div>
          <div>
            <span className="editor-meta__label">Publicado</span>
            <span>{formatInstant(sermon.publishedAt)}</span>
          </div>
          <div>
            <span className="editor-meta__label">Programado</span>
            <span>{formatInstant(sermon.publishAt)}</span>
          </div>
          <div>
            <span className="editor-meta__label">Actualizado</span>
            <span>{formatInstant(sermon.updatedAt)}</span>
          </div>
        </div>
      ) : null}

      {sermon && actions.length > 0 ? (
        <section className="publish-bar" aria-labelledby="publish-bar-title">
          <div>
            <h2 className="publish-bar__title" id="publish-bar-title">
              Publicación
            </h2>
            <p className="publish-bar__hint">
              {dirty
                ? 'Tenés cambios sin guardar. Guardá antes de publicar, programar o archivar.'
                : 'Estas acciones cambian el estado editorial de inmediato.'}
            </p>
          </div>
          <div className="row-actions">
            {actions.includes('publish') ? (
              <button
                type="button"
                className="button button--primary button--small"
                onClick={() => {
                  setActionError(null);
                  setConfirmAction('publish');
                }}
                disabled={lifecycleLocked}
              >
                Publicar
              </button>
            ) : null}
            {actions.includes('schedule') ? (
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={openSchedule}
                disabled={lifecycleLocked}
              >
                Programar
              </button>
            ) : null}
            {actions.includes('archive') ? (
              <button
                type="button"
                className="button button--danger button--small"
                onClick={() => {
                  setActionError(null);
                  setConfirmAction('archive');
                }}
                disabled={lifecycleLocked}
              >
                Archivar
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <form className="editor" onSubmit={handleSave} noValidate>
        <SermonForm
          values={values}
          errors={errors}
          taxonomy={taxonomy}
          disabled={saving || readOnly}
          onChange={changeField}
          onRetryTaxonomy={() => setTaxonomyKey((key) => key + 1)}
        />

        {!readOnly ? (
          <div className="editor-actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={saving || !canSave}
            >
              {saving
                ? 'Guardando…'
                : isNew || sermon?.status === 'draft'
                  ? 'Guardar borrador'
                  : 'Guardar cambios'}
            </button>
            <Link className="button button--quiet" to="/contenido/sermones">
              Volver al listado
            </Link>
            {sermon ? (
              <Link
                className="button button--quiet"
                to={`/contenido/sermones/${sermon.id}/preview`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Vista previa
              </Link>
            ) : null}
          </div>
        ) : null}
      </form>

      {sermon ? (
        <SermonRevisionsPanel
          sermonId={sermon.id}
          canRestore={permissions.update}
          restoreDisabledReason={
            dirty ? 'Guardá o descartá los cambios locales antes de restaurar.' : null
          }
          onRestored={(updated) => {
            applySermon(updated);
            setNotice({
              tone: 'info',
              message: `Se restauró la versión y el sermón quedó en la versión ${updated.version}.`,
            });
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmAction === 'publish'}
        title="Publicar este sermón"
        confirmLabel="Publicar ahora"
        busy={actionBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void performAction('publish');
        }}
      >
        <p>
          «{sermon?.title}» será visible en el sitio público de inmediato. Si
          tenía una publicación programada, se reemplaza.
        </p>
        {actionError ? (
          <p className="form__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmAction === 'archive'}
        title="Archivar este sermón"
        confirmLabel="Archivar"
        busy={actionBusy}
        danger
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void performAction('archive');
        }}
      >
        <p>
          «{sermon?.title}» dejará de ser público. El contenido y sus revisiones
          se conservan y podés volver a publicarlo después.
        </p>
        {actionError ? (
          <p className="form__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </ConfirmDialog>

      <Dialog
        open={scheduleOpen}
        title="Programar publicación"
        description="El sermón queda en estado Programado hasta que el proceso de publicación del servidor lo promueva."
        onClose={() => {
          if (!scheduling) setScheduleOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setScheduleOpen(false)}
              disabled={scheduling}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="button button--primary"
              onClick={() => {
                void confirmSchedule();
              }}
              disabled={scheduling}
            >
              {scheduling ? 'Programando…' : 'Programar'}
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field__label" htmlFor="sermon-publish-at">
            Fecha y hora de publicación
          </label>
          <input
            id="sermon-publish-at"
            className="field__input"
            type="datetime-local"
            value={scheduleValue}
            onChange={(event) => setScheduleValue(event.target.value)}
            min={toDateTimeLocalValue(new Date().toISOString())}
            disabled={scheduling}
            aria-invalid={scheduleError ? true : undefined}
            aria-describedby={scheduleError ? 'sermon-publish-at-error' : undefined}
          />
          <p className="field__help">
            Se interpreta en la zona horaria de tu navegador y se envía como
            instante ISO-8601.
          </p>
          {scheduleError ? (
            <p className="field__error" id="sermon-publish-at-error" role="alert">
              {scheduleError}
            </p>
          ) : null}
        </div>
      </Dialog>

      <ConfirmDialog
        open={reloadConfirmOpen}
        title="Descartar cambios locales"
        confirmLabel="Descartar y recargar"
        busy={reloading}
        danger
        onCancel={() => setReloadConfirmOpen(false)}
        onConfirm={() => {
          void reloadLatest();
        }}
      >
        <p>
          Se descartarán los cambios que todavía no guardaste y se cargará la
          versión más reciente del servidor. Esta acción no modifica el sermón
          guardado.
        </p>
      </ConfirmDialog>
    </section>
  );
}
