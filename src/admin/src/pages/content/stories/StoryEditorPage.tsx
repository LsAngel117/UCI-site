/**
 * Story create/edit screen (improvement B2, docs/09 §22–§38).
 *
 * One form for `/contenido/historias/nuevo` and `/contenido/historias/:id`.
 * Saving sends the version the editor loaded, so a concurrent edit answers 409
 * and is never silently overwritten. Lifecycle actions are explicit and
 * confirmed, exactly like the API.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { StoryAdminDto } from '@shared/cms';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { describeError } from '../../../lib/errors';
import { formatInstant } from '../../../lib/format';
import {
  archiveStory,
  createStory,
  getStory,
  publishStory,
  scheduleStory,
  updateStory,
} from '../../../lib/stories-api';
import {
  availableStoryLifecycleActions,
  emptyStoryForm,
  formToCreateStoryInput,
  formToUpdateStoryInput,
  normalizeStorySlug,
  storyFormsEqual,
  storyPermissions,
  storyToForm,
  validateStoryForm,
  type StoryFormErrors,
  type StoryFormValues,
} from '../../../lib/stories-form';
import {
  isFutureDateTime,
  isoFromDateTimeLocal,
  toDateTimeLocalValue,
} from '../../../lib/sermons-form';
import { MediaPicker } from '../../../components/content/MediaPicker';
import { ConfirmDialog } from '../../../components/content/ConfirmDialog';
import { Dialog } from '../../../components/content/Dialog';
import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
} from '../../../components/content/States';
import { StatusBadge } from '../../../components/content/StatusBadge';

type LoadState = 'loading' | 'ready' | 'error' | 'notfound';
type ConfirmAction = 'publish' | 'archive';

interface Notice {
  tone: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  required,
  disabled,
  type = 'text',
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  type?: 'text' | 'url' | 'date';
  placeholder?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="field__required"> *</span> : null}
      </label>
      <input
        id={id}
        className="field__input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
      />
      {hint ? (
        <p className="field__help" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function StoryEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const location = useLocation();
  const { hasPermission } = useAuth();
  const permissions = storyPermissions(hasPermission);

  const [loadState, setLoadState] = useState<LoadState>(isNew ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [story, setStory] = useState<StoryAdminDto | null>(null);
  const [values, setValues] = useState<StoryFormValues>(emptyStoryForm);
  const [baseline, setBaseline] = useState<StoryFormValues>(emptyStoryForm);
  const [errors, setErrors] = useState<StoryFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(() => {
    const state = location.state as { created?: boolean } | null;
    return state?.created
      ? {
          tone: 'success',
          message: 'Historia creada como borrador. Revisá el contenido y guardá los cambios.',
        }
      : null;
  });
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloadConfirmOpen, setReloadConfirmOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  const readOnly = !isNew && !permissions.update;
  const canSave = isNew ? permissions.create : permissions.update;
  const dirty = useMemo(() => !storyFormsEqual(values, baseline), [values, baseline]);
  const actions = story ? availableStoryLifecycleActions(story.status, permissions) : [];
  const lifecycleLocked = dirty || saving || readOnly;

  useEffect(() => {
    if (!id) {
      const empty = emptyStoryForm();
      setStory(null);
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

    getStory(id, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        const form = storyToForm(loaded);
        setStory(loaded);
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

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function applyStory(updated: StoryAdminDto) {
    const form = storyToForm(updated);
    setStory(updated);
    setValues(form);
    setBaseline(form);
    setErrors({});
  }

  function changeField<K extends keyof StoryFormValues>(
    field: K,
    value: StoryFormValues[K],
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

    const nextErrors = validateStoryForm(values);
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
        const created = await createStory(formToCreateStoryInput(values));
        setNotice({
          tone: 'success',
          message: 'Historia creada como borrador. Revisá el contenido y guardá los cambios.',
        });
        navigate(`/contenido/historias/${created.id}`, {
          replace: true,
          state: { created: true },
        });
        return;
      }

      if (!story) return;
      const updated = await updateStory(
        story.id,
        formToUpdateStoryInput(values, story.version),
      );
      applyStory(updated);
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
          setConflict(
            'Otra persona guardó esta historia desde que la abriste. Para no pisar su trabajo, no se guardó nada.',
          );
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
      const latest = await getStory(id);
      applyStory(latest);
      setConflict(null);
      setReloadConfirmOpen(false);
      setNotice({
        tone: 'info',
        message: `Se cargó la versión más reciente (versión ${latest.version}). Los cambios locales se descartaron.`,
      });
    } catch (reason) {
      setConflict(describeError(reason));
    } finally {
      setReloading(false);
    }
  }

  async function performAction(action: ConfirmAction) {
    if (!story || actionBusy) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const updated =
        action === 'publish'
          ? await publishStory(story.id)
          : await archiveStory(story.id);
      applyStory(updated);
      setConfirmAction(null);
      setNotice({
        tone: 'success',
        message:
          action === 'publish'
            ? `«${updated.title}» se publicó y ya es visible en el sitio.`
            : `«${updated.title}» se archivó y dejó de ser pública.`,
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
    setScheduleValue(toDateTimeLocalValue(story?.publishAt ?? null));
    setScheduleOpen(true);
  }

  async function confirmSchedule() {
    if (!story || scheduling) return;
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
      const updated = await scheduleStory(story.id, publishAt);
      applyStory(updated);
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
          label="Cargando historia…"
          detail="Estamos leyendo el contenido y su versión actual."
        />
      </section>
    );
  }

  if (loadState === 'notfound') {
    return (
      <section className="page">
        <EmptyPanel
          title="Esa historia no existe"
          message="Puede haber sido eliminada o el enlace está mal formado."
          action={
            <Link className="button button--quiet" to="/contenido/historias">
              Volver a historias
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
          title="No pudimos cargar la historia"
          message={loadError ?? 'Intentá de nuevo en unos minutos.'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </section>
    );
  }

  const title = isNew ? 'Nueva historia' : story?.title ?? 'Editar historia';

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Contenido · Historias</p>
        <div className="page__title-row">
          <h1 className="page__title">{title}</h1>
          {story ? <StatusBadge status={story.status} /> : null}
          {dirty ? <span className="badge badge--dirty">Cambios sin guardar</span> : null}
          {readOnly ? <span className="badge badge--pending">Solo lectura</span> : null}
        </div>
        <p className="page__lede">
          {isNew
            ? 'La historia se crea como borrador. La aprobación editorial y la publicación se confirman por separado.'
            : `Slug público: /historias/${story?.slug ?? ''}. Versión ${story?.version ?? '—'}.`}
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
            Podés ver esta historia, pero tu rol no incluye <code>pages.update</code>.
            El formulario está deshabilitado y el servidor rechazaría cualquier
            intento de guardado.
          </p>
        </div>
      ) : null}

      {conflict ? (
        <ErrorPanel title="Conflicto de versión" message={conflict}>
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

      {story ? (
        <div className="editor-meta">
          <div>
            <span className="editor-meta__label">Estado</span>
            <StatusBadge status={story.status} />
          </div>
          <div>
            <span className="editor-meta__label">Versión</span>
            <span>{story.version}</span>
          </div>
          <div>
            <span className="editor-meta__label">Aprobación</span>
            <span>{story.editorialApproved ? 'Aprobada' : 'Pendiente'}</span>
          </div>
          <div>
            <span className="editor-meta__label">Publicado</span>
            <span>{formatInstant(story.publishedAt)}</span>
          </div>
          <div>
            <span className="editor-meta__label">Programado</span>
            <span>{formatInstant(story.publishAt)}</span>
          </div>
        </div>
      ) : null}

      {story && actions.length > 0 ? (
        <section className="publish-bar" aria-labelledby="story-publish-title">
          <div>
            <h2 className="publish-bar__title" id="story-publish-title">
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
        <div className="form-sections">
          <section className="form-section" aria-labelledby="story-basic">
            <div className="form-section__head">
              <h2 className="form-section__title" id="story-basic">
                Información básica
              </h2>
              <p className="form-section__hint">
                Título, slug y nombre público del protagonista.
              </p>
            </div>
            <div className="form-grid">
              <TextField
                id="story-title"
                label="Título"
                value={values.title}
                onChange={(value) => changeField('title', value)}
                error={errors.title}
                required
                disabled={saving || readOnly}
              />
              <div className="field">
                <label className="field__label" htmlFor="story-slug">
                  Slug
                </label>
                <div className="field__inline">
                  <input
                    id="story-slug"
                    className="field__input field__input--mono"
                    type="text"
                    value={values.slug}
                    onChange={(event) => changeField('slug', event.target.value)}
                    onBlur={() => changeField('slug', normalizeStorySlug(values.slug))}
                    placeholder="una-vida-restaurada"
                    disabled={saving || readOnly}
                    aria-invalid={errors.slug ? true : undefined}
                    aria-describedby={errors.slug ? 'story-slug-error' : undefined}
                  />
                  <button
                    type="button"
                    className="button button--quiet button--small"
                    onClick={() => changeField('slug', normalizeStorySlug(values.title))}
                    disabled={saving || readOnly || values.title.trim().length === 0}
                  >
                    Generar desde el título
                  </button>
                </div>
                {errors.slug ? (
                  <p className="field__error" id="story-slug-error" role="alert">
                    {errors.slug}
                  </p>
                ) : null}
              </div>
              <TextField
                id="story-display-name"
                label="Nombre público"
                value={values.displayName}
                onChange={(value) => changeField('displayName', value)}
                hint="Si lo dejás vacío se usa el título."
                disabled={saving || readOnly}
              />
              <TextField
                id="story-date"
                label="Fecha"
                type="date"
                value={values.date}
                onChange={(value) => changeField('date', value)}
                error={errors.date}
                disabled={saving || readOnly}
              />
            </div>
          </section>

          <section className="form-section" aria-labelledby="story-content">
            <div className="form-section__head">
              <h2 className="form-section__title" id="story-content">
                Testimonio
              </h2>
              <p className="form-section__hint">
                La cita se destaca en los listados; la historia completa se
                publica en el detalle.
              </p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="story-quote">
                Cita destacada
              </label>
              <textarea
                id="story-quote"
                className="field__input field__textarea"
                rows={3}
                value={values.quote}
                onChange={(event) => changeField('quote', event.target.value)}
                disabled={saving || readOnly}
              />
            </div>
            <div className="field">
              <label className="field__label" htmlFor="story-full">
                Historia completa
              </label>
              <textarea
                id="story-full"
                className="field__input field__textarea"
                rows={10}
                value={values.fullStory}
                onChange={(event) => changeField('fullStory', event.target.value)}
                disabled={saving || readOnly}
              />
            </div>
            <MediaPicker
              id="story-cover"
              label="Fotografía"
              accept="IMAGE"
              value={values.coverMediaId}
              onChange={(value) => changeField('coverMediaId', value)}
              description="Retrato o imagen que acompaña la historia."
              disabled={saving || readOnly}
            />
            <div className="field field--checkbox">
              <input
                id="story-approved"
                type="checkbox"
                checked={values.editorialApproved}
                onChange={(event) =>
                  changeField('editorialApproved', event.target.checked)
                }
                disabled={saving || readOnly}
              />
              <label htmlFor="story-approved">
                Aprobación editorial y consentimiento de la persona
              </label>
            </div>
            <div className="field field--checkbox">
              <input
                id="story-featured"
                type="checkbox"
                checked={values.featured}
                onChange={(event) => changeField('featured', event.target.checked)}
                disabled={saving || readOnly}
              />
              <label htmlFor="story-featured">Destacar en el inicio</label>
            </div>
          </section>

          <section className="form-section" aria-labelledby="story-seo">
            <div className="form-section__head">
              <h2 className="form-section__title" id="story-seo">
                SEO
              </h2>
              <p className="form-section__hint">
                Metadatos para buscadores y redes sociales. El canonical por
                defecto es <code>/historias/&lt;slug&gt;</code>.
              </p>
            </div>
            <div className="form-grid">
              <TextField
                id="story-seo-title"
                label="Título SEO"
                value={values.seoTitle}
                onChange={(value) => changeField('seoTitle', value)}
                disabled={saving || readOnly}
              />
              <TextField
                id="story-seo-description"
                label="Descripción SEO"
                value={values.seoDescription}
                onChange={(value) => changeField('seoDescription', value)}
                disabled={saving || readOnly}
              />
            </div>
            <TextField
              id="story-seo-canonical"
              label="URL canónica"
              type="url"
              value={values.seoCanonicalUrl}
              onChange={(value) => changeField('seoCanonicalUrl', value)}
              error={errors.seoCanonicalUrl}
              placeholder="https://uci.example.org/historias/…"
              disabled={saving || readOnly}
            />
            <TextField
              id="story-seo-og-image"
              label="Imagen Open Graph (URL)"
              type="url"
              value={values.seoOgImageUrl}
              onChange={(value) => changeField('seoOgImageUrl', value)}
              error={errors.seoOgImageUrl}
              placeholder="https://…"
              disabled={saving || readOnly}
            />
          </section>
        </div>

        {!readOnly ? (
          <div className="editor-actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={saving || !canSave}
            >
              {saving
                ? 'Guardando…'
                : isNew || story?.status === 'draft'
                  ? 'Guardar borrador'
                  : 'Guardar cambios'}
            </button>
            <Link className="button button--quiet" to="/contenido/historias">
              Volver al listado
            </Link>
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        open={confirmAction === 'publish'}
        title="Publicar esta historia"
        confirmLabel="Publicar ahora"
        busy={actionBusy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void performAction('publish');
        }}
      >
        <p>
          «{story?.title}» será visible en el sitio público de inmediato. Si la
          historia no tiene aprobación editorial, el servidor rechazará la
          publicación.
        </p>
        {actionError ? (
          <p className="form__error" role="alert">
            {actionError}
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmAction === 'archive'}
        title="Archivar esta historia"
        confirmLabel="Archivar"
        busy={actionBusy}
        danger
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => {
          void performAction('archive');
        }}
      >
        <p>
          «{story?.title}» dejará de ser pública. El contenido se conserva y
          podés volver a publicarla después.
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
        description="La historia queda en estado Programado hasta que el proceso de publicación del servidor la promueva."
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
          <label className="field__label" htmlFor="story-schedule">
            Fecha y hora
          </label>
          <input
            id="story-schedule"
            className="field__input"
            type="datetime-local"
            value={scheduleValue}
            onChange={(event) => setScheduleValue(event.target.value)}
            aria-invalid={scheduleError ? true : undefined}
            aria-describedby={scheduleError ? 'story-schedule-error' : undefined}
          />
          {scheduleError ? (
            <p className="field__error" id="story-schedule-error" role="alert">
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
          Se perderán los cambios sin guardar y se cargará la versión más
          reciente del servidor.
        </p>
      </ConfirmDialog>
    </section>
  );
}
