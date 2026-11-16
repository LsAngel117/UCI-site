/**
 * Stories archive (improvement B2, docs/09 §16–§21).
 *
 * Filter → list → quick publish, with every control gated by the `pages.*`
 * permissions the server resolved. The server remains the authority.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PaginationMeta } from '@shared/api';
import type { StoryAdminDto, StoryListQuery } from '@shared/cms';
import type { ContentStatus } from '@shared/types';
import { useAuth } from '../../../lib/auth';
import { describeError } from '../../../lib/errors';
import { formatCalendarDate, formatInstant } from '../../../lib/format';
import { listStories, publishStory } from '../../../lib/stories-api';
import {
  availableStoryLifecycleActions,
  storyPermissions,
} from '../../../lib/stories-form';
import { useDebouncedValue } from '../../../lib/useDebouncedValue';
import { ConfirmDialog } from '../../../components/content/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../../../components/content/DataTable';
import { FilterBar } from '../../../components/content/FilterBar';
import { Pagination } from '../../../components/content/Pagination';
import { StatusBadge } from '../../../components/content/StatusBadge';

export function StoryListPage() {
  const { hasPermission } = useAuth();
  const permissions = storyPermissions(hasPermission);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus | ''>('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<StoryAdminDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [publishTarget, setPublishTarget] = useState<StoryAdminDto | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 300);
  const filtersActive = search.trim().length > 0 || status !== '';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query: StoryListQuery = {
      page,
      limit: 20,
      status: status === '' ? undefined : status,
      search: debouncedSearch.trim() || undefined,
      sort: 'updatedAt',
      order: 'desc',
    };

    listStories(query, controller.signal)
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
    if (!publishTarget.editorialApproved) {
      setPublishError(
        'Esta historia no tiene aprobación editorial. Marcá la aprobación y guardá antes de publicar.',
      );
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const updated = await publishStory(publishTarget.id);
      setPublishTarget(null);
      setNotice(`«${updated.title}» se publicó y ya es visible en el sitio.`);
      setReloadKey((key) => key + 1);
    } catch (reason) {
      setPublishError(describeError(reason));
    } finally {
      setPublishing(false);
    }
  }

  const columns: DataTableColumn<StoryAdminDto>[] = [
    {
      key: 'title',
      header: 'Historia',
      render: (story) => (
        <div className="cell-stack">
          <Link
            className="cell-title"
            to={
              permissions.update
                ? `/contenido/historias/${story.id}`
                : `/contenido/historias/${story.id}`
            }
          >
            {story.title}
          </Link>
          <span className="cell-meta">/{story.slug}</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (story) => <StatusBadge status={story.status} />,
    },
    {
      key: 'approved',
      header: 'Aprobación',
      render: (story) =>
        story.editorialApproved ? (
          <span className="badge badge--status-published">Aprobada</span>
        ) : (
          <span className="badge badge--pending">Pendiente</span>
        ),
    },
    {
      key: 'featured',
      header: 'Destacada',
      render: (story) => (story.featured ? 'Sí' : '—'),
    },
    {
      key: 'date',
      header: 'Fecha',
      render: (story) => formatCalendarDate(story.date),
    },
    {
      key: 'updated',
      header: 'Actualizado',
      render: (story) => formatInstant(story.updatedAt),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'cell-actions',
      render: (story) => {
        const actions = availableStoryLifecycleActions(story.status, permissions);
        return (
          <div className="row-actions">
            {permissions.update ? (
              <Link
                className="button button--quiet button--small"
                to={`/contenido/historias/${story.id}`}
              >
                Editar
              </Link>
            ) : (
              <Link
                className="button button--quiet button--small"
                to={`/contenido/historias/${story.id}`}
              >
                Ver
              </Link>
            )}
            {actions.includes('publish') ? (
              <button
                type="button"
                className="button button--quiet button--small"
                onClick={() => {
                  setPublishError(null);
                  setPublishTarget(story);
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
          <h1 className="page__title">Historias</h1>
          {permissions.create ? (
            <Link className="button button--primary" to="/contenido/historias/nuevo">
              Nueva historia
            </Link>
          ) : null}
        </div>
        <p className="page__lede">
          Testimonios y experiencias de la comunidad. Solo las historias
          publicadas y con aprobación editorial son visibles en el sitio.
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
          <label className="field__label sr-only" htmlFor="story-search">
            Buscar historias
          </label>
          <input
            id="story-search"
            className="field__input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por título o nombre…"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="story-status-filter">
            Filtrar por estado
          </label>
          <select
            id="story-status-filter"
            className="field__input"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ContentStatus | '');
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="draft">Borrador</option>
            <option value="scheduled">Programado</option>
            <option value="published">Publicado</option>
            <option value="unpublished">Despublicado</option>
            <option value="archived">Archivado</option>
          </select>
        </div>
      </FilterBar>

      <DataTable
        caption="Archivo de historias"
        columns={columns}
        rows={rows}
        rowKey={(story) => story.id}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
        emptyTitle={
          filtersActive ? 'No hay historias con esos filtros' : 'Aún no hay historias'
        }
        emptyMessage={
          filtersActive
            ? 'Probá con otra búsqueda o quitá los filtros.'
            : 'Creá la primera historia para empezar el archivo de testimonios.'
        }
        emptyAction={
          permissions.create ? (
            <Link className="button button--primary" to="/contenido/historias/nuevo">
              Nueva historia
            </Link>
          ) : undefined
        }
      />

      {meta ? (
        <Pagination meta={meta} onPageChange={setPage} noun="historias" />
      ) : null}

      <ConfirmDialog
        open={publishTarget !== null}
        title="Publicar esta historia"
        confirmLabel="Publicar ahora"
        busy={publishing}
        onCancel={() => setPublishTarget(null)}
        onConfirm={() => {
          void confirmPublish();
        }}
      >
        <p>
          «{publishTarget?.title}» será visible en el sitio público de inmediato.
          La historia ya debe estar aprobada editorialmente.
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
