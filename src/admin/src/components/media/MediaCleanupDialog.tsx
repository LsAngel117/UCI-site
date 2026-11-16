/**
 * Orphan media cleanup (improvement B5, docs/12 §18, §60).
 *
 * Safe by construction: opening the dialog always performs a `dryRun` first and
 * shows the exact candidates. Deleting requires a second, explicit
 * confirmation, and the result reports deleted/failed counts honestly.
 */
import { useEffect, useState } from 'react';
import { describeError } from '../../lib/errors';
import {
  cleanupOrphanMedia,
  type MediaCleanupResult,
} from '../../lib/media-api';
import { formatBytes } from '../../lib/media';
import { Dialog } from '../content/Dialog';

interface MediaCleanupDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a real run so the library can refresh its list. */
  onCompleted: (result: MediaCleanupResult) => void;
}

export function MediaCleanupDialog({
  open,
  onClose,
  onCompleted,
}: MediaCleanupDialogProps) {
  const [result, setResult] = useState<MediaCleanupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setResult(null);
    setError(null);
    setLoading(true);

    cleanupOrphanMedia({ dryRun: true })
      .then((preview) => {
        if (!cancelled) setResult(preview);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(describeError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  async function runRealCleanup() {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      const deleted = await cleanupOrphanMedia({ dryRun: false });
      setResult(deleted);
      onCompleted(deleted);
    } catch (reason) {
      setError(describeError(reason));
    } finally {
      setRunning(false);
    }
  }

  const preview = result?.dryRun === true;
  const totalSize = (result?.items ?? []).reduce(
    (sum, item) => sum + item.size,
    0,
  );

  return (
    <Dialog
      open={open}
      title="Limpiar archivos huérfanos"
      description="Archivos sin ninguna referencia en el contenido y con antigüedad suficiente para no ser cargas recientes sin guardar."
      onClose={() => {
        if (!running) onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="button button--quiet"
            onClick={onClose}
            disabled={running}
          >
            {preview ? 'Cancelar' : 'Cerrar'}
          </button>
          {preview ? (
            <button
              type="button"
              className="button button--danger"
              onClick={() => {
                void runRealCleanup();
              }}
              disabled={running || result.candidates === 0}
            >
              {running ? 'Eliminando…' : `Eliminar ${result.candidates} archivos`}
            </button>
          ) : null}
        </>
      }
    >
      <div aria-live="polite">
        {loading ? <p>Revisando archivos sin referencias…</p> : null}

        {error ? (
          <p className="form__error" role="alert">
            {error}
          </p>
        ) : null}

        {result ? (
          <>
            {preview ? (
              <p>
                Encontramos <strong>{result.candidates}</strong>{' '}
                {result.candidates === 1 ? 'archivo' : 'archivos'} sin
                referencias y con más de {result.olderThanDays}{' '}
                {result.olderThanDays === 1 ? 'día' : 'días'} de antigüedad
                {totalSize > 0 ? ` (${formatBytes(totalSize)} en total)` : ''}.
                Todavía no se eliminó nada.
              </p>
            ) : (
              <p>
                Limpieza completada: se eliminaron{' '}
                <strong>{result.deleted}</strong>{' '}
                {result.deleted === 1 ? 'archivo' : 'archivos'} y{' '}
                <strong>{result.filesDeleted}</strong>{' '}
                {result.filesDeleted === 1 ? 'binario' : 'binarios'}.
                {result.failures > 0
                  ? ` ${result.failures} no se pudieron eliminar y quedaron intactos.`
                  : ''}
              </p>
            )}

            {result.candidates === 0 && preview ? (
              <p>No hay huérfanos que limpiar en este momento.</p>
            ) : null}

            {result.items.length > 0 ? (
              <details>
                <summary>Ver detalle ({result.items.length})</summary>
                <ul className="cleanup-list">
                  {result.items.map((item) => (
                    <li key={item.id}>
                      <span className="cleanup-list__name">{item.filename}</span>
                      <span className="cleanup-list__meta">
                        {formatBytes(item.size)}
                        {item.variantCount > 0
                          ? ` · ${item.variantCount} variantes`
                          : ''}
                        {item.action === 'failed' ? ' · falló' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
