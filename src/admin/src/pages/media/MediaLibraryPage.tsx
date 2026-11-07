/**
 * Media library (Phase 10C, docs/09 §45–§52, docs/12 §13–§15).
 *
 * Grid/list browser with search, filters, sorting and pagination, plus upload,
 * metadata editing, reference inspection and reference-aware deletion. Every
 * mutating control is hidden without the corresponding permission; the API
 * still authorizes each request server-side.
 */
import { useEffect, useState } from 'react';
import type { MediaDto, MediaMimeType, MediaSortField, MediaType } from '@shared/media';
import type { PaginationMeta } from '@shared/api';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import {
  buildMediaListQuery,
  dateRangeError,
  emptyMediaFilters,
  folderLabel,
  formatBytes,
  formatDimensions,
  MEDIA_FOLDER_OPTIONS,
  MEDIA_ORDER_OPTIONS,
  MEDIA_SORT_OPTIONS,
  MEDIA_TYPE_OPTIONS,
  mediaDisplayName,
  mediaFiltersActive,
  mediaMimeOptions,
  mediaPermissions,
  mediaTypeLabel,
  mimeTypeLabel,
  type MediaLibraryFilters,
} from '../../lib/media';
import { listMedia } from '../../lib/media-api';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { DataTable, type DataTableColumn } from '../../components/content/DataTable';
import { FilterBar } from '../../components/content/FilterBar';
import { Pagination } from '../../components/content/Pagination';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../../components/content/States';
import { MediaDeleteDialog } from '../../components/media/MediaDeleteDialog';
import { MediaDetailsDialog } from '../../components/media/MediaDetailsDialog';
import { MediaMetadataDialog } from '../../components/media/MediaMetadataDialog';
import { MediaThumbnail } from '../../components/media/MediaThumbnail';
import { MediaUploadDialog } from '../../components/media/MediaUploadDialog';

const PAGE_LIMIT = 24;

type ViewMode = 'grid' | 'list';

interface Notice {
  tone: 'success' | 'error' | 'info';
  text: string;
}

export function MediaLibraryPage() {
  const { hasPermission } = useAuth();
  const permissions = mediaPermissions(hasPermission);

  const [view, setView] = useState<ViewMode>('grid');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<MediaType | ''>('');
  const [mimeType, setMimeType] = useState<MediaMimeType | ''>('');
  const [folder, setFolder] = useState<MediaLibraryFilters['folder']>('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [sort, setSort] = useState<MediaSortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<MediaDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MediaDto | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<MediaDto | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaDto | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const dateError = dateRangeError(createdFrom, createdTo);

  const filters: MediaLibraryFilters = {
    search,
    type,
    mimeType,
    folder,
    createdFrom,
    createdTo,
  };
  const filtersActive =
    mediaFiltersActive(filters) || sort !== 'createdAt' || order !== 'desc';

  useEffect(() => {
    if (dateError) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = buildMediaListQuery(
      { ...emptyMediaFilters(), ...filters, search: debouncedSearch },
      page,
      PAGE_LIMIT,
      sort,
      order,
    );

    listMedia(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.data);
        setMeta(result.meta);
        if (result.meta.totalPages > 0 && page > result.meta.totalPages) {
          setPage(result.meta.totalPages);
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setRows([]);
        setMeta(null);
        setError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // `filters` is rebuilt every render; the primitive fields below are the
    // real dependencies (search is deliberately debounced).
  }, [
    debouncedSearch,
    type,
    mimeType,
    folder,
    createdFrom,
    createdTo,
    sort,
    order,
    page,
    reloadKey,
    dateError,
  ]);

  function resetFilters() {
    setSearch('');
    setType('');
    setMimeType('');
    setFolder('');
    setCreatedFrom('');
    setCreatedTo('');
    setSort('createdAt');
    setOrder('desc');
    setPage(1);
  }

  function clearDates() {
    setCreatedFrom('');
    setCreatedTo('');
    setPage(1);
  }

  function handleTypeChange(value: MediaType | '') {
    setType(value);
    setPage(1);
    const allowed = mediaMimeOptions(value).map((option) => option.value);
    if (mimeType !== '' && !allowed.includes(mimeType)) {
      setMimeType('');
    }
  }

  function applyUpdatedMedia(media: MediaDto) {
    setRows((current) =>
      current.map((row) => (row.id === media.id ? media : row)),
    );
    setDetailsTarget((current) =>
      current && current.id === media.id ? media : current,
    );
    setReloadKey((key) => key + 1);
  }

  function handleUploaded(media: MediaDto) {
    setUploadOpen(false);
    setNotice({
      tone: 'success',
      text: `«${mediaDisplayName(media)}» se subió correctamente.`,
    });
    setPage(1);
    setReloadKey((key) => key + 1);
  }

  function handleMetadataSaved(media: MediaDto) {
    setEditTarget(null);
    setNotice({
      tone: 'success',
      text: `Se actualizó la metadata de «${mediaDisplayName(media)}».`,
    });
    applyUpdatedMedia(media);
  }

  function handleDeleted(media: MediaDto) {
    setDeleteTarget(null);
    setNotice({
      tone: 'success',
      text: `«${mediaDisplayName(media)}» se eliminó de la biblioteca.`,
    });
    setReloadKey((key) => key + 1);
  }

  function requestEdit(asset: MediaDto) {
    setDetailsTarget(null);
    setEditTarget(asset);
  }

  function requestDelete(asset: MediaDto) {
    setDetailsTarget(null);
    setDeleteTarget(asset);
  }

  const rowActions = (asset: MediaDto) => (
    <div className="row-actions">
      <button
        type="button"
        className="button button--quiet button--small"
        onClick={() => setDetailsTarget(asset)}
      >
        Detalles
      </button>
      {permissions.update ? (
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => setEditTarget(asset)}
        >
          Editar
        </button>
      ) : null}
      {permissions.delete ? (
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => setDeleteTarget(asset)}
        >
          Eliminar
        </button>
      ) : null}
    </div>
  );

  const columns: DataTableColumn<MediaDto>[] = [
    {
      key: 'file',
      header: 'Archivo',
      render: (asset) => (
        <div className="media-cell">
          <MediaThumbnail media={asset} size="small" />
          <div className="cell-stack">
            <span className="cell-title">{mediaDisplayName(asset)}</span>
            <span className="cell-meta">
              {asset.filename} · {folderLabel(asset.folder)}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (asset) => `${mediaTypeLabel(asset.type)} · ${mimeTypeLabel(asset.mimeType)}`,
    },
    {
      key: 'size',
      header: 'Tamaño',
      render: (asset) => formatBytes(asset.size),
    },
    {
      key: 'dimensions',
      header: 'Dimensiones',
      render: (asset) => formatDimensions(asset.width, asset.height),
    },
    {
      key: 'created',
      header: 'Cargado',
      render: (asset) => formatInstant(asset.createdAt),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'cell-actions',
      render: rowActions,
    },
  ];

  const displayError = error;
  const showGridStates = view === 'grid';

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Multimedia</p>
        <div className="page__title-row">
          <h1 className="page__title">Biblioteca multimedia</h1>
          {permissions.upload ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => setUploadOpen(true)}
            >
              Subir archivo
            </button>
          ) : null}
        </div>
        <p className="page__lede">
          Imágenes y documentos reutilizables del sitio. Buscá, filtrá y
          seleccioná archivos sin volver a subirlos; la metadata y el borrado
          respetan tus permisos.
        </p>
      </header>

      {notice ? (
        <div
          className={`form__notice form__notice--${notice.tone}`}
          role={notice.tone === 'error' ? 'alert' : 'status'}
        >
          <p>{notice.text}</p>
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => setNotice(null)}
          >
            Cerrar aviso
          </button>
        </div>
      ) : null}

      <FilterBar
        onReset={resetFilters}
        active={filtersActive}
        actions={
          <>
            <div className="view-toggle" role="group" aria-label="Vista de la biblioteca">
              <button
                type="button"
                className={`button button--small ${
                  view === 'grid' ? 'button--primary' : 'button--quiet'
                }`}
                aria-pressed={view === 'grid'}
                onClick={() => setView('grid')}
              >
                Grilla
              </button>
              <button
                type="button"
                className={`button button--small ${
                  view === 'list' ? 'button--primary' : 'button--quiet'
                }`}
                aria-pressed={view === 'list'}
                onClick={() => setView('list')}
              >
                Lista
              </button>
            </div>
            <button
              type="button"
              className="button button--quiet button--small"
              onClick={() => setReloadKey((key) => key + 1)}
              disabled={loading}
            >
              Actualizar
            </button>
          </>
        }
      >
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-search">
            Buscar archivos
          </label>
          <input
            id="media-search"
            className="field__input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre, título o descripción…"
          />
        </div>

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-type">
            Filtrar por tipo
          </label>
          <select
            id="media-type"
            className="field__input"
            value={type}
            onChange={(event) =>
              handleTypeChange(event.target.value as MediaType | '')
            }
          >
            <option value="">Todos los tipos</option>
            {MEDIA_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-mime">
            Filtrar por formato
          </label>
          <select
            id="media-mime"
            className="field__input"
            value={mimeType}
            onChange={(event) => {
              setMimeType(event.target.value as MediaMimeType | '');
              setPage(1);
            }}
          >
            <option value="">Todos los formatos</option>
            {mediaMimeOptions(type).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-folder">
            Filtrar por carpeta
          </label>
          <select
            id="media-folder"
            className="field__input"
            value={folder}
            onChange={(event) => {
              setFolder(event.target.value as MediaLibraryFilters['folder']);
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

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-created-from">
            Cargado desde
          </label>
          <input
            id="media-created-from"
            className="field__input"
            type="date"
            value={createdFrom}
            max={createdTo || undefined}
            onChange={(event) => {
              setCreatedFrom(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-created-to">
            Cargado hasta
          </label>
          <input
            id="media-created-to"
            className="field__input"
            type="date"
            value={createdTo}
            min={createdFrom || undefined}
            onChange={(event) => {
              setCreatedTo(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-sort">
            Ordenar por
          </label>
          <select
            id="media-sort"
            className="field__input"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as MediaSortField);
              setPage(1);
            }}
          >
            {MEDIA_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="media-order">
            Dirección del orden
          </label>
          <select
            id="media-order"
            className="field__input"
            value={order}
            onChange={(event) => {
              setOrder(event.target.value as 'asc' | 'desc');
              setPage(1);
            }}
          >
            {MEDIA_ORDER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      {dateError ? (
        <EmptyPanel
          title="Revisá el rango de fechas"
          message={dateError}
          action={
            <button
              type="button"
              className="button button--quiet"
              onClick={clearDates}
            >
              Limpiar fechas
            </button>
          }
        />
      ) : showGridStates ? (
        <div aria-live="polite">
          {loading && rows.length === 0 ? (
            <LoadingPanel label="Cargando biblioteca…" />
          ) : null}
          {!loading && displayError ? (
            <ErrorPanel
              title="No pudimos cargar la biblioteca"
              message={displayError}
              onRetry={() => setReloadKey((key) => key + 1)}
            />
          ) : null}
          {!loading && !displayError && rows.length === 0 ? (
            <EmptyPanel
              title={
                filtersActive
                  ? 'No hay archivos que coincidan con los filtros'
                  : 'Todavía no hay archivos'
              }
              message={
                filtersActive
                  ? 'Probá con otro término, formato o rango de fechas.'
                  : permissions.upload
                    ? 'Subí la primera imagen o documento para reutilizarlo en el sitio.'
                    : 'Cuando tu equipo suba archivos, aparecerán acá.'
              }
              action={
                filtersActive ? (
                  <button
                    type="button"
                    className="button button--quiet"
                    onClick={resetFilters}
                  >
                    Limpiar filtros
                  </button>
                ) : permissions.upload ? (
                  <button
                    type="button"
                    className="button button--primary"
                    onClick={() => setUploadOpen(true)}
                  >
                    Subir archivo
                  </button>
                ) : undefined
              }
            />
          ) : null}
          {rows.length > 0 ? (
            <ul className="media-library-grid" aria-busy={loading ? true : undefined}>
              {rows.map((asset) => (
                <li className="media-tile" key={asset.id}>
                  <button
                    type="button"
                    className="media-tile__preview"
                    onClick={() => setDetailsTarget(asset)}
                    aria-label={`Ver detalle de ${mediaDisplayName(asset)}`}
                  >
                    <MediaThumbnail media={asset} />
                  </button>
                  <div className="media-tile__body">
                    <p className="media-tile__name" title={mediaDisplayName(asset)}>
                      {mediaDisplayName(asset)}
                    </p>
                    <p className="media-tile__meta">
                      {mediaTypeLabel(asset.type)} · {mimeTypeLabel(asset.mimeType)} ·{' '}
                      {formatBytes(asset.size)}
                    </p>
                    <p className="media-tile__meta">
                      {formatDimensions(asset.width, asset.height)} ·{' '}
                      {folderLabel(asset.folder)}
                    </p>
                    <p className="media-tile__filename">{asset.filename}</p>
                  </div>
                  {rowActions(asset)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <DataTable
          caption="Archivos de la biblioteca multimedia"
          columns={columns}
          rows={rows}
          rowKey={(asset) => asset.id}
          loading={loading}
          error={displayError}
          onRetry={() => setReloadKey((key) => key + 1)}
          emptyTitle={
            filtersActive
              ? 'No hay archivos que coincidan con los filtros'
              : 'Todavía no hay archivos'
          }
          emptyMessage={
            filtersActive
              ? 'Probá con otro término, formato o rango de fechas.'
              : permissions.upload
                ? 'Subí el primero para empezar la biblioteca.'
                : 'Cuando tu equipo suba archivos, aparecerán acá.'
          }
          emptyAction={
            filtersActive ? (
              <button
                type="button"
                className="button button--quiet"
                onClick={resetFilters}
              >
                Limpiar filtros
              </button>
            ) : permissions.upload ? (
              <button
                type="button"
                className="button button--primary"
                onClick={() => setUploadOpen(true)}
              >
                Subir archivo
              </button>
            ) : undefined
          }
        />
      )}

      {meta && rows.length > 0 ? (
        <Pagination meta={meta} onPageChange={setPage} noun="archivos" />
      ) : null}

      {permissions.upload ? (
        <MediaUploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleUploaded}
        />
      ) : null}

      <MediaMetadataDialog
        asset={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={handleMetadataSaved}
      />

      <MediaDetailsDialog
        asset={detailsTarget}
        onClose={() => setDetailsTarget(null)}
        onEdit={requestEdit}
        onDelete={requestDelete}
        canUpdate={permissions.update}
        canDelete={permissions.delete}
      />

      <MediaDeleteDialog
        asset={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={handleDeleted}
      />
    </section>
  );
}
