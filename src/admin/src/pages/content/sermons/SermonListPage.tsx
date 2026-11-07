/**
 * Sermon archive — the reference list screen (docs/09 §16–§21, §22).
 *
 * Filter → list → quick action, with every action gated by the permissions the
 * server resolved for this session. Publishing from the list is confirmed
 * because it immediately changes what the public site serves.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaginationMeta } from '@shared/api';
import type { SermonAdminDto, SermonListQuery } from '@shared/cms';
import type { ContentStatus } from '@shared/types';
import { useAuth } from '../../../lib/auth';
import { describeError } from '../../../lib/errors';
import { formatCalendarDate, formatInstant, STATUS_OPTIONS } from '../../../lib/format';
import { listSermons, publishSermon } from '../../../lib/sermons-api';
import {
  availableLifecycleActions,
  sermonPermissions,
} from '../../../lib/sermons-form';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { ConfirmDialog } from '../../../components/content/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../../../components/content/DataTable';
import { FilterBar } from '../../../components/content/FilterBar';
import { Pagination } from '../../../components/content/Pagination';
import { StatusBadge } from '../../../components/content/StatusBadge';

export function SermonListPage() {
  const { hasPermission } = useAuth();
  const permissions = sermonPermissions(hasPermission);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<SermonAdminDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [publishTarget, setPublishTarget] = useState<SermonAdminDto | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const filtersActive = search.trim().length > 0 || status !== '';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query: SermonListQuery = {
      page,
      limit: 20,
      status: status === '' ? undefined : status,
      search: debouncedSearch.trim() || undefined,
      sort: 'updatedAt',
      order: 'desc',
    };

    listSermons(query, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setRows(result.data);
        setMeta(result.meta);
        // A filter change can leave the current page past the last one; move
        // back to the last real page instead of showing a misleading empty list.
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
  }, [debouncedSearch, status, page, reloadKey]);

  function resetFilters() {
    setSearch('');
    setStatus('');
    setPage(1);
  }

  async function confirmPublish() {
    if (!publishTarget || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const updated = await publishSermon(publishTarget.id);
      setPublishTarget(null);
      setNotice(`«${updated.title}» se publicó y ya es visible en el sitio.`);
      setReloadKey((key) => key + 1);
    } catch (reason) {
      setPublishError(describeError(reason));
    } finally {
      setPublishing(false);
    }
  }

  const columns: DataTableColumn<SermonAdminDto>[] = [
    {
      key: 'title',
      header: 'Título',
      render: (sermon) => (
        <div className="cell-stack">
          <Link
            className="cell-title"
            to={
              permissions.update
                ? `/contenido/sermones/${sermon.id}`
                : `/contenido/sermones/${sermon.id}/preview`
            }
          >
            {sermon.title}
          </Link>
          <span className="cell-meta">/{sermon.slug}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (sermon) => <StatusBadge status={sermon.status} />,
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (sermon) => formatCalendarDate(sermon.sermonDate),
    },
    {
      key: 'preacher',
      header: 'Predicador',
      render: (sermon) =>
        sermon.preacher?.displayName ?? sermon.preacherName ?? '—',
    },
    {
      key: 'updated',
      header: 'Actualizado',
      render: (sermon) => formatInstant(sermon.updatedAt),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'cell-actions',
      render: (sermon) => {
        const actions = availableLifecycleActions(sermon.status, permissions);
        return (
          <div className="row-actions">
            <Link
              className="button button--quiet button--small"
              to={`/contenido/sermones/${sermon.id}/preview`}
            >
              Ver
            </Link>
            {permissions.update ? (
              <Link
                className="button button--quiet button--small"
                to={`/contenido/sermones/${sermon.id}`}
              >
                Editar
              </Link>
            ) : null}
            {actions.includes('publish') ? (
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => {
                  setPublishError(null);
                  setPublishTarget(sermon);
                }}
              >
                Publicar
              </button>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Contenido</p>
        <div className="page__title-row">
          <h1 className="page__title">Sermones</h1>
          {permissions.create ? (
            <Link className="button button--primary" to="/contenido/sermones/nuevo">
              Nuevo sermón
            </Link>
          ) : null}
        </div>
        <p className="page__lede">
          Archivo editorial de sermones: borradores, publicación, programación y
          revisiones. Las acciones visibles respetan los permisos de tu rol.
        </p>
      </header>

      {notice ? (
        <div className="form__notice" role="status">
          <p>{notice}</p>
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
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            Actualizar
          </button>
        }
      >
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="sermon-search">
            Buscar sermones
          </label>
          <input
            id="sermon-search"
            className="field__input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por título…"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="sermon-status-filter">
            Filtrar por estado
          </label>
          <select
            id="sermon-status-filter"
            className="field__input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <DataTable
        caption="Sermones del archivo editorial"
        columns={columns}
        rows={rows}
        rowKey={(sermon) => sermon.id}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
        emptyTitle={
          filtersActive
            ? 'No hay sermones que coincidan con los filtros'
            : 'Todavía no hay sermones'
        }
        emptyMessage={
          filtersActive
            ? 'Probá con otro término o limpiá los filtros.'
            : permissions.create
              ? 'Creá el primero para empezar el archivo editorial.'
              : 'Cuando tu equipo cree sermones, aparecerán acá.'
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
          ) : permissions.create ? (
            <Link className="button button--primary" to="/contenido/sermones/nuevo">
              Crear sermón
            </Link>
          ) : undefined
        }
      />

      {meta && rows.length > 0 ? (
        <Pagination meta={meta} onPageChange={setPage} noun="sermones" />
      ) : null}

      <ConfirmDialog
        open={publishTarget !== null}
        title="Publicar este sermón"
        confirmLabel="Publicar ahora"
        busy={publishing}
        onCancel={() => setPublishTarget(null)}
        onConfirm={() => {
          void confirmPublish();
        }}
      >
        <p>
          «{publishTarget?.title}» será visible en el sitio público de inmediato.
          Si tenía una publicación programada, se reemplaza.
        </p>
        {publishError ? (
          <p className="form__error" role="alert">
            {publishError}
          </p>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
