/**
 * Authenticated sermon preview (docs/09 §34–§35, docs/08 §24).
 *
 * It renders the DTO returned by `GET /admin/sermons/:id/preview`, so unpublished
 * drafts are visible only to an authorised session. The endpoint also sends
 * `X-Robots-Tag: noindex, nofollow, noarchive`; this screen repeats the warning
 * so nobody mistakes a preview for a public URL.
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SermonAdminDto } from '@shared/cms';
import { ApiError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { describeError } from '../../../lib/errors';
import {
  formatCalendarDate,
  formatDuration,
  formatInstant,
  statusLabel,
} from '../../../lib/format';
import { previewSermon } from '../../../lib/sermons-api';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../../../components/content/States';
import { StatusBadge } from '../../../components/content/StatusBadge';

type PreviewState = 'loading' | 'ready' | 'error' | 'notfound';

export function SermonPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const [state, setState] = useState<PreviewState>('loading');
  const [sermon, setSermon] = useState<SermonAdminDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!id) {
      setState('notfound');
      return;
    }
    const controller = new AbortController();
    setState('loading');
    setError(null);

    previewSermon(id, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setSermon(loaded);
        setState('ready');
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && reason.status === 404) {
          setState('notfound');
          return;
        }
        setError(describeError(reason));
        setState('error');
      });

    return () => controller.abort();
  }, [id, reloadKey]);

  if (state === 'loading') {
    return (
      <section className="page">
        <LoadingPanel label="Cargando vista previa…" />
      </section>
    );
  }

  if (state === 'notfound') {
    return (
      <section className="page">
        <EmptyPanel
          title="No hay nada para previsualizar"
          message="El sermón no existe o fue eliminado."
          action={
            <Link className="button button--quiet" to="/contenido/sermones">
              Volver a sermones
            </Link>
          }
        />
      </section>
    );
  }

  if (state === 'error' || !sermon) {
    return (
      <section className="page">
        <ErrorPanel
          title="No pudimos cargar la vista previa"
          message={error ?? 'Intentá de nuevo en unos minutos.'}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      </section>
    );
  }

  const preacher =
    sermon.preacher?.displayName ?? sermon.preacherName ?? 'Predicador sin asignar';

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Contenido · Sermones · Vista previa</p>
        <div className="page__title-row">
          <h1 className="page__title">{sermon.title}</h1>
          <StatusBadge status={sermon.status} />
        </div>
        <p className="page__lede">
          Vista previa autenticada. No es una URL pública: el backend marca esta
          respuesta como <code>noindex, nofollow, noarchive</code>.
        </p>
      </header>

      <div className="preview-actions">
        {hasPermission('sermons.update') ? (
          <Link
            className="button button--primary"
            to={`/contenido/sermones/${sermon.id}`}
          >
            Editar sermón
          </Link>
        ) : null}
        <Link className="button button--quiet" to="/contenido/sermones">
          Volver al listado
        </Link>
      </div>

      <article className="sermon-preview" aria-labelledby="preview-title">
        <header className="sermon-preview__head">
          <p className="sermon-preview__eyebrow">
            {sermon.series?.name ?? 'Sermón'}
          </p>
          <h2 className="sermon-preview__title" id="preview-title">
            {sermon.title}
          </h2>
          <p className="sermon-preview__byline">
            {preacher}
            {sermon.sermonDate ? ` · ${formatCalendarDate(sermon.sermonDate)}` : ''}
            {sermon.durationMinutes !== null
              ? ` · ${formatDuration(sermon.durationMinutes)}`
              : ''}
          </p>
          {sermon.topics.length > 0 ? (
            <ul className="sermon-preview__topics" aria-label="Temas">
              {sermon.topics.map((topic) => (
                <li key={topic.id}>{topic.name}</li>
              ))}
            </ul>
          ) : null}
        </header>

        {sermon.scriptureReference ? (
          <p className="sermon-preview__scripture-ref">
            {sermon.scriptureReference}
          </p>
        ) : null}
        {sermon.scriptureText ? (
          <blockquote className="sermon-preview__scripture">
            {sermon.scriptureText}
          </blockquote>
        ) : null}
        {sermon.description ? (
          <p className="sermon-preview__description">{sermon.description}</p>
        ) : null}
        {sermon.notesContent ? (
          <section className="sermon-preview__section" aria-labelledby="preview-notes">
            <h3 id="preview-notes">Notas del sermón</h3>
            <p className="sermon-preview__body">{sermon.notesContent}</p>
          </section>
        ) : null}

        {(sermon.videoProvider || sermon.videoExternalId || sermon.videoUrl) && (
          <section className="sermon-preview__section" aria-labelledby="preview-video">
            <h3 id="preview-video">Video</h3>
            <dl className="preview-list">
              {sermon.videoProvider ? (
                <div>
                  <dt>Proveedor</dt>
                  <dd>{sermon.videoProvider}</dd>
                </div>
              ) : null}
              {sermon.videoExternalId ? (
                <div>
                  <dt>ID externo</dt>
                  <dd className="mono">{sermon.videoExternalId}</dd>
                </div>
              ) : null}
              {sermon.videoUrl ? (
                <div>
                  <dt>URL</dt>
                  <dd>
                    <a href={sermon.videoUrl} target="_blank" rel="noopener noreferrer">
                      {sermon.videoUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        )}

        {sermon.audioUrl ? (
          <section className="sermon-preview__section" aria-labelledby="preview-audio">
            <h3 id="preview-audio">Audio</h3>
            <a href={sermon.audioUrl} target="_blank" rel="noopener noreferrer">
              {sermon.audioUrl}
            </a>
          </section>
        ) : null}

        <section className="sermon-preview__section" aria-labelledby="preview-seo">
          <h3 id="preview-seo">SEO y publicación</h3>
          <dl className="preview-list">
            <div>
              <dt>Estado</dt>
              <dd>{statusLabel(sermon.status)}</dd>
            </div>
            <div>
              <dt>Versión</dt>
              <dd>{sermon.version}</dd>
            </div>
            <div>
              <dt>Publicado</dt>
              <dd>{formatInstant(sermon.publishedAt)}</dd>
            </div>
            <div>
              <dt>Programado</dt>
              <dd>{formatInstant(sermon.publishAt)}</dd>
            </div>
            <div>
              <dt>Título SEO</dt>
              <dd>{sermon.seo?.title ?? '—'}</dd>
            </div>
            <div>
              <dt>Descripción SEO</dt>
              <dd>{sermon.seo?.description ?? '—'}</dd>
            </div>
            <div>
              <dt>URL canónica</dt>
              <dd>{sermon.seo?.canonicalUrl ?? '—'}</dd>
            </div>
            <div>
              <dt>Imagen Open Graph</dt>
              <dd>{sermon.seo?.ogImageUrl ?? '—'}</dd>
            </div>
          </dl>
        </section>
      </article>
    </section>
  );
}
