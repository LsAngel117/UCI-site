/**
 * Sermon revision history (docs/09 §36–§37, docs/08 §11.9).
 *
 * Restoring never destroys history: the API applies the old snapshot and
 * records a *new* revision. The panel says that explicitly and blocks restore
 * while the editor has unsaved changes, so a local draft is never silently
 * replaced by a restored version.
 */
import { useEffect, useState } from 'react';
import type { SermonAdminDto, SermonRevisionDto } from '@shared/cms';
import { describeError } from '../../../lib/errors';
import { formatInstant } from '../../../lib/format';
import {
  listSermonRevisions,
  restoreSermonRevision,
} from '../../../lib/sermons-api';
import { ConfirmDialog } from '../../../components/content/ConfirmDialog';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../../../components/content/States';

interface SermonRevisionsPanelProps {
  sermonId: string;
  canRestore: boolean;
  restoreDisabledReason?: string | null;
  onRestored: (sermon: SermonAdminDto) => void;
}

export function SermonRevisionsPanel({
  sermonId,
  canRestore,
  restoreDisabledReason,
  onRestored,
}: SermonRevisionsPanelProps) {
  const [revisions, setRevisions] = useState<SermonRevisionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [target, setTarget] = useState<SermonRevisionDto | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    listSermonRevisions(sermonId, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRevisions(result);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sermonId, reloadKey]);

  async function confirmRestore() {
    if (!target || restoring) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      const updated = await restoreSermonRevision(sermonId, target.id);
      setTarget(null);
      setNotice(
        `Se restauró el contenido de la versión ${target.version}. El historial sigue intacto.`,
      );
      setReloadKey((key) => key + 1);
      onRestored(updated);
    } catch (reason) {
      setRestoreError(describeError(reason));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section className="form-section" aria-labelledby="sermon-revisions">
      <div className="form-section__head">
        <h2 className="form-section__title" id="sermon-revisions">
          Revisiones
        </h2>
        <p className="form-section__hint">
          Cada publicación y restauración crea una revisión nueva. Restaurar no
          borra el historial.
        </p>
      </div>

      {notice ? (
        <div className="form__notice" role="status">
          <p>{notice}</p>
        </div>
      ) : null}

      {loading && revisions.length === 0 ? (
        <LoadingPanel label="Cargando revisiones…" />
      ) : null}

      {error ? (
        <ErrorPanel
          title="No pudimos cargar las revisiones"
          message={error}
          onRetry={() => setReloadKey((key) => key + 1)}
        />
      ) : null}

      {!loading && !error && revisions.length === 0 ? (
        <EmptyPanel
          title="Todavía no hay revisiones"
          message="Se crea una revisión al publicar, programar o restaurar el sermón."
        />
      ) : null}

      {!error && revisions.length > 0 ? (
        <>
          <div className="revisions__toolbar">
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
            >
              Actualizar revisiones
            </button>
          </div>
          <ol className="revisions">
            {revisions.map((revision) => (
              <li className="revision" key={revision.id}>
                <div className="revision__head">
                  <div>
                    <p className="revision__title">
                      Versión {revision.version} · {revision.title}
                    </p>
                    <p className="revision__meta">
                      {formatInstant(revision.createdAt)}
                      {revision.createdById
                        ? ` · autor ${revision.createdById.slice(0, 8)}…`
                        : ' · acción del sistema'}
                    </p>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="button button--quiet button--small"
                      onClick={() =>
                        setExpanded((current) =>
                          current === revision.id ? null : revision.id,
                        )
                      }
                      aria-expanded={expanded === revision.id}
                    >
                      {expanded === revision.id ? 'Ocultar' : 'Ver versión'}
                    </button>
                    {canRestore ? (
                      <button
                        type="button"
                        className="button button--quiet button--small"
                        onClick={() => {
                          setRestoreError(null);
                          setTarget(revision);
                        }}
                        disabled={Boolean(restoreDisabledReason)}
                        title={restoreDisabledReason ?? undefined}
                      >
                        Restaurar
                      </button>
                    ) : null}
                  </div>
                </div>

                {expanded === revision.id ? (
                  <dl className="revision__snapshot">
                    <div>
                      <dt>Título</dt>
                      <dd>{revision.snapshot.title}</dd>
                    </div>
                    <div>
                      <dt>Slug</dt>
                      <dd>/{revision.snapshot.slug}</dd>
                    </div>
                    <div>
                      <dt>Predicador</dt>
                      <dd>
                        {revision.snapshot.preacherName ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Descripción</dt>
                      <dd>{revision.snapshot.description ?? '—'}</dd>
                    </div>
                  </dl>
                ) : null}
              </li>
            ))}
          </ol>
          {restoreDisabledReason ? (
            <p className="field__help">{restoreDisabledReason}</p>
          ) : null}
        </>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        title={`Restaurar la versión ${target?.version ?? ''}`}
        confirmLabel="Restaurar versión"
        busy={restoring}
        danger
        onCancel={() => setTarget(null)}
        onConfirm={() => {
          void confirmRestore();
        }}
      >
        <p>
          Se aplicará el contenido de la versión {target?.version} al sermón
          actual y se creará una revisión nueva. Las revisiones anteriores no se
          eliminan.
        </p>
        {restoreError ? (
          <p className="form__error" role="alert">
            {restoreError}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
