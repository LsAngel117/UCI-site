/**
 * Audit log (Phase 10D2, docs/08 §21).
 *
 * Read-only, newest-first log with actor/action/entity/date filters and
 * pagination. Audit rows are immutable through the normal API; the screen never
 * offers an edit or delete action and renders the recorded metadata as-is.
 */
import { useEffect, useState } from 'react';
import type { AuditLogDto } from '@shared/admin';
import type { PaginationMeta } from '@shared/api';
import { listAuditLogs } from '../../lib/admin-api';
import {
  auditDateRangeError,
  auditFiltersActive,
  buildAuditListQuery,
  emptyAuditFilters,
  type AuditFilters,
} from '../../lib/admin-ui';
import { describeError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import {
  DataTable,
  type DataTableColumn,
} from '../../components/content/DataTable';
import { FilterBar } from '../../components/content/FilterBar';
import { Pagination } from '../../components/content/Pagination';
import { Notice } from '../../components/admin/Notice';

const PAGE_LIMIT = 20;

function metadataText(metadata: unknown): string | null {
  if (metadata === null || metadata === undefined) return null;
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

export function AuditPage() {
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters());
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditLogDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const debouncedFilters = useDebouncedValue(filters, 300);
  const dateError = auditDateRangeError(filters.from, filters.to);
  const filtersActive = auditFiltersActive(filters);

  useEffect(() => {
    if (dateError) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    listAuditLogs(
      buildAuditListQuery(debouncedFilters, page, PAGE_LIMIT),
      controller.signal,
    )
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
  }, [debouncedFilters, page, reloadKey, dateError]);

  function resetFilters() {
    setFilters(emptyAuditFilters());
    setPage(1);
  }

  function updateFilter<K extends keyof AuditFilters>(
    key: K,
    value: AuditFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const columns: DataTableColumn<AuditLogDto>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (entry) => formatInstant(entry.createdAt),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (entry) =>
        entry.actor ? (
          <div className="cell-stack">
            <span className="cell-title">{entry.actor.name}</span>
            <span className="cell-meta">{entry.actor.email}</span>
          </div>
        ) : (
          <span className="cell-meta">Sistema</span>
        ),
    },
    {
      key: 'action',
      header: 'Acción',
      render: (entry) => <span className="mono">{entry.action}</span>,
    },
    {
      key: 'entity',
      header: 'Entidad',
      render: (entry) => (
        <div className="cell-stack">
          <span>{entry.entityType}</span>
          {entry.entityId ? (
            <span className="cell-meta mono">{entry.entityId}</span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'metadata',
      header: 'Detalle',
      render: (entry) => {
        const text = metadataText(entry.metadata);
        if (text === null) return <span className="cell-meta">—</span>;
        return (
          <details className="audit-detail">
            <summary>Ver datos</summary>
            <pre className="audit-detail__pre">{text}</pre>
          </details>
        );
      },
    },
  ];

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Administración</p>
        <div className="page__title-row">
          <h1 className="page__title">Auditoría</h1>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => setReloadKey((key) => key + 1)}
            disabled={loading}
          >
            Actualizar
          </button>
        </div>
        <p className="page__lede">
          Registro de cambios del panel, ordenado del más reciente al más
          antiguo. Las entradas son inmutables: esta pantalla solo permite
          consultarlas y filtrarlas.
        </p>
      </header>

      <FilterBar onReset={resetFilters} active={filtersActive}>
        <div className="field field--inline">
          <label className="field__label" htmlFor="audit-actor">
            Actor (id de usuario)
          </label>
          <input
            id="audit-actor"
            className="field__input"
            type="text"
            value={filters.actor}
            onChange={(event) => updateFilter('actor', event.target.value)}
            placeholder="UUID del actor"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="audit-action">
            Acción
          </label>
          <input
            id="audit-action"
            className="field__input"
            type="text"
            value={filters.action}
            onChange={(event) => updateFilter('action', event.target.value)}
            placeholder="p. ej. user.update"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="audit-entity-type">
            Tipo de entidad
          </label>
          <input
            id="audit-entity-type"
            className="field__input"
            type="text"
            value={filters.entityType}
            onChange={(event) => updateFilter('entityType', event.target.value)}
            placeholder="p. ej. USER"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="audit-entity-id">
            Id de entidad
          </label>
          <input
            id="audit-entity-id"
            className="field__input"
            type="text"
            value={filters.entityId}
            onChange={(event) => updateFilter('entityId', event.target.value)}
            placeholder="UUID de la entidad"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="audit-from">
            Desde
          </label>
          <input
            id="audit-from"
            className="field__input"
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
            aria-invalid={dateError ? true : undefined}
          />
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="audit-to">
            Hasta
          </label>
          <input
            id="audit-to"
            className="field__input"
            type="date"
            value={filters.to}
            onChange={(event) => updateFilter('to', event.target.value)}
            aria-invalid={dateError ? true : undefined}
          />
        </div>
      </FilterBar>

      {dateError ? (
        <Notice tone="warning">
          {dateError} La lista muestra el último resultado válido hasta que
          corrijas el rango.
        </Notice>
      ) : null}

      <DataTable
        caption="Registro de auditoría del panel"
        columns={columns}
        rows={rows}
        rowKey={(entry) => entry.id}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
        emptyTitle={
          filtersActive
            ? 'No hay registros que coincidan con los filtros'
            : 'Todavía no hay actividad registrada'
        }
        emptyMessage={
          filtersActive
            ? 'Probá con otros filtros o limpiá la búsqueda.'
            : 'Las acciones administrativas aparecerán acá a medida que ocurran.'
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
          ) : undefined
        }
      />

      {meta && rows.length > 0 ? (
        <Pagination meta={meta} onPageChange={setPage} noun="registros" />
      ) : null}
    </section>
  );
}
