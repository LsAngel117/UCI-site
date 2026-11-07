/**
 * Reference-aware delete confirmation (Phase 10C, docs/09 §51, docs/12 §15).
 *
 * The dialog loads the asset's references before offering deletion. If the
 * server answers `409 MEDIA_REFERENCED`, the dialog stays open, shows where the
 * asset is used and only then offers the forced delete as a second, explicit
 * confirmation. Authorization remains server-side (`media.delete`).
 */
import { useEffect, useState } from 'react';
import type { MediaDto, MediaReferenceDto } from '@shared/media';
import { describeError } from '../../lib/errors';
import {
  describeMediaError,
  isMediaReferenced,
  mediaDisplayName,
  referenceEntityLabel,
} from '../../lib/media';
import { deleteMedia, getMediaReferences } from '../../lib/media-api';
import { ConfirmDialog } from '../content/ConfirmDialog';
import { LoadingPanel } from '../content/States';

interface MediaDeleteDialogProps {
  asset: MediaDto | null;
  onClose: () => void;
  onDeleted: (asset: MediaDto) => void;
}

export function MediaDeleteDialog({
  asset,
  onClose,
  onDeleted,
}: MediaDeleteDialogProps) {
  const [references, setReferences] = useState<MediaReferenceDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [referencesError, setReferencesError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedByServer, setBlockedByServer] = useState(false);

  useEffect(() => {
    if (!asset) {
      setReferences(null);
      setReferencesError(null);
      setError(null);
      setBlockedByServer(false);
      return;
    }
    const controller = new AbortController();
    setReferences(null);
    setReferencesError(null);
    setError(null);
    setBlockedByServer(false);
    setLoading(true);

    getMediaReferences(asset.id, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setReferences(result.references);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setReferencesError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [asset, reloadKey]);

  async function confirmDelete() {
    if (!asset || deleting) return;
    const force =
      blockedByServer || (references !== null && references.length > 0);

    setDeleting(true);
    setError(null);
    try {
      await deleteMedia(asset.id, force);
      onDeleted(asset);
    } catch (reason) {
      if (isMediaReferenced(reason)) {
        setBlockedByServer(true);
        setError(
          'El archivo todavía está en uso. Revisá las referencias y volvé a confirmar si querés eliminarlo de todos modos.',
        );
        setReloadKey((key) => key + 1);
      } else {
        setError(describeMediaError(reason));
      }
    } finally {
      setDeleting(false);
    }
  }

  const referenceCount = references?.length ?? 0;
  const forceMode = blockedByServer || referenceCount > 0;
  const title = forceMode
    ? 'Eliminar archivo en uso'
    : 'Eliminar archivo';
  const confirmLabel = forceMode
    ? 'Eliminar de todos modos'
    : 'Eliminar archivo';

  return (
    <ConfirmDialog
      open={asset !== null}
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel="Cancelar"
      busy={deleting}
      danger
      onCancel={onClose}
      onConfirm={() => {
        void confirmDelete();
      }}
    >
      <p>
        Vas a eliminar «{asset ? mediaDisplayName(asset) : ''}» de la biblioteca.
        Esta acción no se puede deshacer y el archivo dejará de servirse en el
        sitio público.
      </p>

      {loading ? <LoadingPanel label="Buscando referencias…" /> : null}

      {referencesError ? (
        <p className="form__error" role="alert">
          No pudimos consultar las referencias: {referencesError} Podés intentar
          la eliminación; si el servidor la bloquea, te mostraremos el detalle.
        </p>
      ) : null}

      {!loading && references !== null ? (
        forceMode ? (
          <>
            <p className="form__error" role="alert">
              Este archivo se usa en {referenceCount}{' '}
              {referenceCount === 1 ? 'contenido' : 'contenidos'}. Al forzar la
              eliminación, esas referencias se quitan y el contenido que lo use
              quedará sin el archivo.
            </p>
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
          </>
        ) : (
          <p className="field__help">
            No hay contenido que use este archivo.
          </p>
        )
      ) : null}

      {!loading && references === null && blockedByServer ? (
        <p className="form__error" role="alert">
          El servidor bloqueó la eliminación porque el archivo está en uso. No
          pudimos cargar el detalle de las referencias, pero podés eliminarlo de
          todos modos si estás seguro.
        </p>
      ) : null}

      {error ? (
        <p className="form__error" role="alert">
          {error}
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
