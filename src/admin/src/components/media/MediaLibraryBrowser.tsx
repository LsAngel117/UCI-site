/**
 * Reusable media library browser (Phase 10C, docs/09 §50, docs/12 §14).
 *
 * Powers the reusable picker inside content editors. It renders the real
 * library — search, folder filter, pagination and the documented empty/loading/
 * error states — and returns the selected asset id through `onSelect`. The
 * caller decides whether the selection is stored as an id (content editors) or
 * opens a details panel (library screen).
 */
import { useEffect, useId, useState } from 'react';
import type { MediaDto, MediaType } from '@shared/media';
import { describeError } from '../../lib/errors';
import { listMedia } from '../../lib/media-api';
import {
  buildMediaListQuery,
  emptyMediaFilters,
  folderLabel,
  formatBytes,
  formatDimensions,
  MEDIA_FOLDER_OPTIONS,
  mediaDisplayName,
  mediaTypeLabel,
  shouldFetchMediaLibrary,
  type MediaLibraryFilters,
} from '../../lib/media';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../content/States';
import { Pagination } from '../content/Pagination';
import { MediaThumbnail } from './MediaThumbnail';

interface MediaLibraryBrowserProps {
  /**
   * Gates the fetch: the picker keeps this `false` while its dialog is closed
   * so opening a content editor never hits the media list (C2).
   */
  active?: boolean;
  /** Restrict the browser to one media type (e.g. a sermon cover). */
  accept?: MediaType;
  selectedId?: string;
  onSelect: (asset: MediaDto) => void;
  selectLabel?: string;
  /** Page size; defaults to the picker-friendly 12. */
  limit?: number;
}

export function MediaLibraryBrowser({
  active = true,
  accept,
  selectedId,
  onSelect,
  selectLabel = 'Elegir',
  limit = 12,
}: MediaLibraryBrowserProps) {
  const searchId = useId();
  const folderId = useId();
  const [search, setSearch] = useState('');
  const [folder, setFolder] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MediaDto[]>([]);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    if (!shouldFetchMediaLibrary(active)) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const filters: MediaLibraryFilters = {
      ...emptyMediaFilters(),
      search: debouncedSearch,
      type: accept ?? '',
      folder: folder as MediaLibraryFilters['folder'],
    };

    listMedia(
      buildMediaListQuery(filters, page, limit, 'createdAt', 'desc'),
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setItems(result.data);
        setMeta(result.meta);
        if (result.meta.totalPages > 0 && page > result.meta.totalPages) {
          setPage(result.meta.totalPages);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [active, accept, debouncedSearch, folder, page, limit, reloadKey]);

  return (
    <div className="media-browser">
      <div className="media-browser__filters">
        <div className="field">
          <label className="field__label" htmlFor={searchId}>
            Buscar
          </label>
          <input
            id={searchId}
            className="field__input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Nombre, título o descripción"
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor={folderId}>
            Carpeta
          </label>
          <select
            id={folderId}
            className="field__input"
            value={folder}
            onChange={(event) => {
              setFolder(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas las carpetas</option>
            {MEDIA_FOLDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div aria-live="polite">
        {loading && items.length === 0 ? (
          <LoadingPanel label="Buscando archivos…" />
        ) : null}
        {!loading && error ? (
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
                : accept === 'DOCUMENT'
                  ? 'Probá con otro término o subí un PDF desde la biblioteca multimedia.'
                  : 'Probá con otro término o subí un archivo desde la biblioteca multimedia.'
            }
          />
        ) : null}

        {items.length > 0 ? (
          <ul className="media-grid">
            {items.map((asset) => {
              const selected = asset.id === selectedId;
              return (
                <li key={asset.id} className="media-card">
                  <MediaThumbnail media={asset} />
                  <div className="media-card__body">
                    <p className="media-card__name">{mediaDisplayName(asset)}</p>
                    <p className="media-card__meta">
                      {mediaTypeLabel(asset.type)} · {formatBytes(asset.size)}
                      {asset.width && asset.height
                        ? ` · ${formatDimensions(asset.width, asset.height)}`
                        : ''}
                    </p>
                    {asset.folder ? (
                      <p className="media-card__meta">
                        {folderLabel(asset.folder)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className={`button button--small ${
                      selected ? 'button--primary' : 'button--quiet'
                    }`}
                    onClick={() => onSelect(asset)}
                    aria-pressed={selected}
                  >
                    {selected ? 'Seleccionado' : selectLabel}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {meta && meta.total > 0 ? (
        <Pagination meta={meta} onPageChange={setPage} noun="archivos" />
      ) : null}
      {loading && items.length > 0 ? (
        <p className="table-wrap__status" role="status">
          Actualizando biblioteca…
        </p>
      ) : null}
    </div>
  );
}
