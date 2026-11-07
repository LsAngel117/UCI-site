/**
 * Basic media picker (feature doc 10B; full library is 10C).
 *
 * It lists media through the admin API and stores the canonical asset id, never
 * a URL, so an asset can be replaced without rewriting content. Operators with
 * `media.read` can browse and search; everyone else can still paste an id — the
 * server validates that the referenced asset exists.
 */
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { MediaDto, MediaType } from '@shared/media';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { listMedia } from '../../lib/sermons-api';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { EmptyPanel, ErrorPanel, LoadingPanel } from './States';
import { Dialog } from './Dialog';

interface MediaPickerProps {
  id: string;
  label: string;
  description?: string;
  accept: MediaType;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [items, setItems] = useState<MediaDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MediaDto | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !canBrowse) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listMedia({ type: accept, search: debouncedSearch }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.data);
        setTotal(result.meta.total);
        setSelected(
          result.data.find((asset) => asset.id === value) ?? null,
        );
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [open, canBrowse, accept, debouncedSearch, value, reloadKey]);

  function choose(asset: MediaDto) {
    onChange(asset.id);
    setSelected(asset);
    setOpen(false);
  }

  /** Enter in these fields must not implicitly submit the sermon form. */
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
      {description ? <p className="field__help">{description}</p> : null}
      {selected && selected.id === value ? (
        <p className="media-picker__selected">
          <span className="media-picker__name">{selected.title || selected.filename}</span>
          <span className="media-picker__meta">
            {selected.mimeType} · {formatSize(selected.size)}
          </span>
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
        <div className="field">
          <label className="field__label" htmlFor={`${id}-search`}>
            Buscar en la biblioteca
          </label>
          <input
            id={`${id}-search`}
            className="field__input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={preventEnterSubmit}
            placeholder="Nombre, título o descripción"
          />
        </div>

        <div className="media-grid" aria-live="polite">
          {loading && items.length === 0 ? (
            <LoadingPanel label="Buscando archivos…" />
          ) : null}
          {error ? (
            <ErrorPanel
              title="No pudimos cargar la biblioteca"
              message={error}
              onRetry={() => setReloadKey((key) => key + 1)}
            />
          ) : null}
          {!loading && !error && items.length === 0 ? (
            <EmptyPanel
              title="No hay archivos que coincidan"
              message={
                accept === 'IMAGE'
                  ? 'Probá con otro término o subí una imagen desde la biblioteca multimedia.'
                  : 'Probá con otro término o subí un documento PDF desde la biblioteca multimedia.'
              }
            />
          ) : null}
          {items.map((asset) => (
            <article className="media-card" key={asset.id}>
              <div className="media-card__preview">
                {asset.type === 'IMAGE' ? (
                  <img src={asset.url} alt="" loading="lazy" />
                ) : (
                  <span className="media-card__filetype">PDF</span>
                )}
              </div>
              <div className="media-card__body">
                <p className="media-card__name">{asset.title || asset.filename}</p>
                <p className="media-card__meta">
                  {asset.mimeType} · {formatSize(asset.size)}
                </p>
              </div>
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => choose(asset)}
              >
                {asset.id === value ? 'Seleccionado' : 'Elegir'}
              </button>
            </article>
          ))}
        </div>
        {!loading && !error && total > items.length ? (
          <p className="field__help">
            Mostrando {items.length} de {total} archivos. Usá la búsqueda para
            acotar el resultado.
          </p>
        ) : null}
      </Dialog>
    </div>
  );
}
