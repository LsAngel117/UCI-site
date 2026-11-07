/**
 * Media details + references panel (Phase 10C, docs/09 §49, §51).
 *
 * Selecting an asset opens this panel: preview, storage-derived public URL,
 * editorial metadata and the content records that reference the asset. The
 * delete entry point lives here too, so an operator sees where an asset is used
 * before choosing to remove it.
 */
import { useEffect, useState } from 'react';
import type { MediaDto, MediaReferenceDto } from '@shared/media';
import { describeError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import {
  formatBytes,
  formatDimensions,
  folderLabel,
  mediaDisplayName,
  mediaPreviewUrl,
  mimeTypeLabel,
  mediaTypeLabel,
  referenceEntityLabel,
  thumbnailVariant,
} from '../../lib/media';
import { getMediaReferences } from '../../lib/media-api';
import { Dialog } from '../content/Dialog';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../content/States';

interface MediaDetailsDialogProps {
  asset: MediaDto | null;
  onClose: () => void;
  onEdit: (asset: MediaDto) => void;
  onDelete: (asset: MediaDto) => void;
  canUpdate: boolean;
  canDelete: boolean;
}

export function MediaDetailsDialog({
  asset,
  onClose,
  onEdit,
  onDelete,
  canUpdate,
  canDelete,
}: MediaDetailsDialogProps) {
  const [references, setReferences] = useState<MediaReferenceDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!asset) return;
    setReferences(null);
    setError(null);
    setCopied(false);
  }, [asset]);

  useEffect(() => {
    if (!asset) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    getMediaReferences(asset.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setReferences(result.references);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [asset, reloadKey]);

  async function copyUrl() {
    if (!asset) return;
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const url = asset ? mediaPreviewUrl(asset) : null;
  const storedVariant = asset ? thumbnailVariant(asset) : null;

  return (
    <Dialog
      open={asset !== null}
      onClose={onClose}
      wide
      title={asset ? mediaDisplayName(asset) : 'Detalle del archivo'}
      description="Información del archivo y de los contenidos que lo usan."
      footer={
        asset ? (
          <>
            <button type="button" className="button button--quiet" onClick={onClose}>
              Cerrar
            </button>
            {canDelete ? (
              <button
                type="button"
                className="button button--danger"
                onClick={() => onDelete(asset)}
              >
                Eliminar
              </button>
            ) : null}
            {canUpdate ? (
              <button
                type="button"
                className="button button--primary"
                onClick={() => onEdit(asset)}
              >
                Editar metadata
              </button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {asset ? (
        <div className="media-details">
          <div className="media-details__preview">
            {url ? (
              <img src={url} alt={asset.alt ?? ''} />
            ) : (
              <span className="media-details__filetype">
                {mimeTypeLabel(asset.mimeType)}
              </span>
            )}
          </div>

          <dl className="preview-list">
            <div>
              <dt>Archivo</dt>
              <dd>{asset.filename}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>
                {mediaTypeLabel(asset.type)} · {mimeTypeLabel(asset.mimeType)}
              </dd>
            </div>
            <div>
              <dt>Tamaño</dt>
              <dd>{formatBytes(asset.size)}</dd>
            </div>
            <div>
              <dt>Dimensiones</dt>
              <dd>{formatDimensions(asset.width, asset.height)}</dd>
            </div>
            <div>
              <dt>Carpeta</dt>
              <dd>{folderLabel(asset.folder)}</dd>
            </div>
            <div>
              <dt>Cargado</dt>
              <dd>{formatInstant(asset.createdAt)}</dd>
            </div>
            <div>
              <dt>Actualizado</dt>
              <dd>{formatInstant(asset.updatedAt)}</dd>
            </div>
            {storedVariant ? (
              <div>
                <dt>Miniatura</dt>
                <dd>
                  {storedVariant.label} · {storedVariant.format} ·{' '}
                  {formatDimensions(storedVariant.width, storedVariant.height)}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="field">
            <label className="field__label" htmlFor="media-public-url">
              URL pública
            </label>
            <div className="media-url">
              <input
                id="media-public-url"
                className="field__input field__input--mono"
                type="text"
                value={asset.url}
                readOnly
              />
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => {
                  void copyUrl();
                }}
              >
                {copied ? 'Copiado' : 'Copiar URL'}
              </button>
            </div>
          </div>

          <section className="media-details__section" aria-labelledby="media-metadata-title">
            <h3 className="media-details__title" id="media-metadata-title">
              Metadata editorial
            </h3>
            <dl className="preview-list">
              <div>
                <dt>Título</dt>
                <dd>{asset.title || '—'}</dd>
              </div>
              <div>
                <dt>Texto alternativo</dt>
                <dd>{asset.alt || '—'}</dd>
              </div>
              <div>
                <dt>Epígrafe</dt>
                <dd>{asset.caption || '—'}</dd>
              </div>
              <div>
                <dt>Descripción</dt>
                <dd>{asset.description || '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="media-details__section" aria-labelledby="media-references-title">
            <h3 className="media-details__title" id="media-references-title">
              Usos en el contenido
            </h3>
            {loading && references === null ? (
              <LoadingPanel label="Buscando referencias…" />
            ) : null}
            {error ? (
              <ErrorPanel
                title="No pudimos consultar las referencias"
                message={error}
                onRetry={() => setReloadKey((key) => key + 1)}
              />
            ) : null}
            {!loading && !error && references !== null && references.length === 0 ? (
              <EmptyPanel
                title="Sin referencias"
                message="Ningún contenido del sitio usa este archivo todavía."
              />
            ) : null}
            {references !== null && references.length > 0 ? (
              <ul className="media-references">
                {references.map((reference) => (
                  <li key={reference.id} className="media-reference">
                    <p className="media-reference__entity">
                      {referenceEntityLabel(reference.entityType)}
                    </p>
                    <p className="media-reference__meta">
                      ID {reference.entityId}
                      {reference.purpose ? ` · ${reference.purpose}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      ) : null}
    </Dialog>
  );
}
