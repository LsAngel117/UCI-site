/**
 * Reusable media picker (Phase 10C, docs/09 §50, docs/12 §14).
 *
 * It opens the real media library with search, folder filtering and pagination,
 * and stores the canonical asset id — never a URL — so an asset can be replaced
 * without rewriting content. Operators without `media.read` can still paste an
 * id; the server validates that the referenced asset exists.
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { MediaDto, MediaType } from '@shared/media';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import {
  formatBytes,
  formatDimensions,
  mediaDisplayName,
  mediaTypeLabel,
  mediaTypeMismatchMessage,
} from '../../lib/media';
import { getMedia } from '../../lib/media-api';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Dialog } from '../content/Dialog';
import { MediaLibraryBrowser } from '../media/MediaLibraryBrowser';

interface MediaPickerProps {
  id: string;
  label: string;
  description?: string;
  accept: MediaType;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function MediaPicker({
  id,
  label,
  description,
  accept,
  value,
  onChange,
  disabled = false,
}: MediaPickerProps) {
  const { hasPermission } = useAuth();
  const canBrowse = hasPermission('media.read');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<MediaDto | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const debouncedValue = useDebouncedValue(value, 300);

  // Resolve the current id so the field can show the stored asset even when the
  // value came from an existing record instead of a fresh picker selection.
  useEffect(() => {
    if (!canBrowse || !debouncedValue) {
      setSelected(null);
      setLookupError(null);
      return;
    }
    const controller = new AbortController();

    getMedia(debouncedValue, controller.signal)
      .then((asset) => {
        if (controller.signal.aborted) return;
        // The library is filtered by `accept`, but a manually typed id can
        // still point at another type and the server only checks existence.
        const mismatch = mediaTypeMismatchMessage(asset.type, accept);
        setSelected(mismatch ? null : asset);
        setLookupError(mismatch);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setSelected(null);
        // A missing id is normal for a typo in manual mode; only surface other
        // failures (permission/session/network) as an error.
        setLookupError(
          reason instanceof ApiError && reason.status === 404
            ? null
            : describeError(reason),
        );
      });

    return () => controller.abort();
  }, [accept, canBrowse, debouncedValue]);

  function choose(asset: MediaDto) {
    onChange(asset.id);
    setSelected(asset);
    setOpen(false);
  }

  /** Enter in these fields must not implicitly submit the host form. */
  function preventEnterSubmit(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.preventDefault();
  }

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="media-picker">
        <input
          id={id}
          className="field__input field__input--mono"
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={preventEnterSubmit}
          placeholder="ID del archivo multimedia"
          disabled={disabled}
          aria-describedby={description ? `${id}-help` : undefined}
        />
        {canBrowse ? (
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => setOpen(true)}
            disabled={disabled}
          >
            Elegir de la biblioteca
          </button>
        ) : null}
        {value ? (
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => onChange('')}
            disabled={disabled}
          >
            Quitar
          </button>
        ) : null}
      </div>
      {description ? (
        <p className="field__help" id={`${id}-help`}>
          {description}
        </p>
      ) : null}
      {selected && selected.id === value ? (
        <p className="media-picker__selected">
          <span className="media-picker__name">
            {mediaDisplayName(selected)}
          </span>
          <span className="media-picker__meta">
            {mediaTypeLabel(selected.type)} · {formatBytes(selected.size)}
            {selected.width && selected.height
              ? ` · ${formatDimensions(selected.width, selected.height)}`
              : ''}
          </span>
        </p>
      ) : null}
      {lookupError ? (
        <p className="field__error" role="alert">
          {lookupError}
        </p>
      ) : null}
      {!canBrowse ? (
        <p className="field__help">
          Tu rol no incluye <code>media.read</code>, así que podés ingresar el ID
          del archivo si lo conocés. El servidor validará que exista.
        </p>
      ) : null}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        wide
        title={accept === 'IMAGE' ? 'Elegir imagen' : 'Elegir documento'}
        description="La selección guarda el id del archivo; no copia el archivo."
      >
        <MediaLibraryBrowser
          active={open}
          accept={accept}
          selectedId={value}
          onSelect={choose}
          selectLabel="Seleccionar"
        />
      </Dialog>
    </div>
  );
}
