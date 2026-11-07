/**
 * Contact inbox (Phase 11B, docs/08 §19, docs/09 §110, docs/11 §9).
 *
 * Administrative view of the public contact form. The list supports free-text
 * search, status and date filters plus pagination; the detail dialog is the only
 * place where the full message is shown. Nothing on this screen is public, and
 * every request is authorized again by the API (`contact.read` / `contact.manage`).
 * Marking a message handled is a direct action; reopening asks for confirmation
 * because it discards the handled mark.
 */
import { useEffect, useState } from 'react';
import type { PaginationMeta } from '@shared/api';
import type {
  ContactSubmissionDto,
  ContactSubmissionStatus,
} from '@shared/contact';
import {
  getContactSubmission,
  listContactSubmissions,
  updateContactSubmission,
} from '../../lib/admin-api';
import {
  buildContactSubmissionListQuery,
  contactDateRangeError,
  contactFiltersActive,
  contactMessagePreview,
  contactPagePermissions,
  contactStatusAction,
  contactStatusLabel,
  emptyContactFilters,
  type ContactFilters,
} from '../../lib/admin-ui';
import { useAuth } from '../../lib/auth';
import { describeError } from '../../lib/errors';
import { formatInstant } from '../../lib/format';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { Notice, type NoticeTone } from '../../components/admin/Notice';
import { ConfirmDialog } from '../../components/content/ConfirmDialog';
import {
  DataTable,
  type DataTableColumn,
} from '../../components/content/DataTable';
import { Dialog } from '../../components/content/Dialog';
import { FilterBar } from '../../components/content/FilterBar';
import { Pagination } from '../../components/content/Pagination';
import { ErrorPanel, LoadingPanel } from '../../components/content/States';

const PAGE_LIMIT = 20;

interface NoticeState {
  tone: NoticeTone;
  text: string;
}

function ContactStatusBadge({
  status,
}: {
  status: ContactSubmissionStatus;
}) {
  return (
    <span className={`badge badge--contact-${status.toLowerCase()}`}>
      {contactStatusLabel(status)}
    </span>
  );
}

function statusChangeMessage(status: ContactSubmissionStatus): string {
  return status === 'HANDLED'
    ? 'El mensaje quedó marcado como gestionado.'
    : 'El mensaje se reabrió y volvió al estado «Nueva».';
}

// ---------------------------------------------------------------------------
// Detail dialog
// ---------------------------------------------------------------------------

interface ContactDetailDialogProps {
  id: string;
  canManage: boolean;
  onClose: () => void;
  onChanged: (submission: ContactSubmissionDto) => void;
}

function ContactDetailDialog({
  id,
  canManage,
  onClose,
  onChanged,
}: ContactDetailDialogProps) {
  const [row, setRow] = useState<ContactSubmissionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmReopen, setConfirmReopen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    getContactSubmission(id, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRow(result);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setLoadError(describeError(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [id, reloadKey]);

  async function applyStatus(status: ContactSubmissionStatus) {
    if (!row || busy) return;
    setBusy(true);
    setActionError(null);
    setConfirmReopen(false);
    try {
      const updated = await updateContactSubmission(row.id, { status });
      setRow(updated);
      onChanged(updated);
    } catch (reason) {
      setActionError(describeError(reason));
    } finally {
      setBusy(false);
    }
  }

  const action = row ? contactStatusAction(row.status) : null;

  return (
    <>
      <Dialog
        open
        title={row ? `Mensaje de ${row.name}` : 'Mensaje de contacto'}
        description={
          row ? `Recibido el ${formatInstant(row.createdAt)}` : undefined
        }
        onClose={busy ? () => undefined : onClose}
        footer={
          <>
            <button
              type="button"
              className="button button--quiet"
              onClick={onClose}
              disabled={busy}
            >
              Cerrar
            </button>
            {row && canManage && action ? (
              <button
                type="button"
                className={
                  action.next === 'HANDLED'
                    ? 'button button--primary'
                    : 'button button--quiet'
                }
                disabled={busy}
                onClick={() => {
                  if (action.confirm) {
                    setActionError(null);
                    setConfirmReopen(true);
                  } else {
                    void applyStatus(action.next);
                  }
                }}
              >
                {busy ? 'Procesando…' : action.label}
              </button>
            ) : null}
          </>
        }
      >
        {loading ? <LoadingPanel label="Cargando mensaje…" /> : null}

        {!loading && loadError ? (
          <ErrorPanel
            title="No pudimos cargar el mensaje"
            message={loadError}
            onRetry={() => setReloadKey((key) => key + 1)}
          />
        ) : null}

        {!loading && row ? (
          <>
            <dl className="contact-detail">
              <div>
                <dt>Nombre</dt>
                <dd>{row.name}</dd>
              </div>
              <div>
                <dt>Correo</dt>
                <dd>
                  <a href={`mailto:${row.email}`}>{row.email}</a>
                </dd>
              </div>
              <div>
                <dt>Estado</dt>
                <dd>
                  <ContactStatusBadge status={row.status} />
                </dd>
              </div>
              <div>
                <dt>Recibido</dt>
                <dd>{formatInstant(row.createdAt)}</dd>
              </div>
              <div>
                <dt>Gestionado</dt>
                <dd>{row.handledAt ? formatInstant(row.handledAt) : '—'}</dd>
              </div>
            </dl>

            <div className="contact-message">
              <h3 className="panel__title">Mensaje</h3>
              <p className="contact-message__body">{row.message}</p>
            </div>

            {!canManage ? (
              <p className="field__help">
                Tu rol no incluye <code>contact.manage</code>, así que podés
                leer el mensaje pero no cambiar su estado.
              </p>
            ) : null}

            {actionError ? (
              <p className="form__error" role="alert">
                {actionError}
              </p>
            ) : null}
          </>
        ) : null}
      </Dialog>

      {row && action ? (
        <ConfirmDialog
          open={confirmReopen}
          title="Reabrir mensaje"
          confirmLabel="Reabrir mensaje"
          busy={busy}
          onCancel={() => {
            if (!busy) setConfirmReopen(false);
          }}
          onConfirm={() => {
            void applyStatus(action.next);
          }}
        >
          <p>
            «{row.name}» volverá a figurar como «Nueva» y se quitará la marca de
            gestión.
          </p>
          <p>La acción queda registrada en la auditoría del panel.</p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ContactPage() {
  const { hasPermission } = useAuth();
  const permissions = contactPagePermissions(hasPermission);

  const [filters, setFilters] = useState<ContactFilters>(emptyContactFilters());
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<ContactSubmissionDto[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const dateError = contactDateRangeError(filters.from, filters.to);
  const filtersActive = contactFiltersActive(filters);

  useEffect(() => {
    if (dateError) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const query = buildContactSubmissionListQuery(
      { ...filters, search: debouncedSearch },
      page,
      PAGE_LIMIT,
    );

    listContactSubmissions(query, controller.signal)
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
  }, [
    debouncedSearch,
    filters.status,
    filters.from,
    filters.to,
    page,
    reloadKey,
    dateError,
  ]);

  function resetFilters() {
    setFilters(emptyContactFilters());
    setPage(1);
  }

  function updateFilter<K extends keyof ContactFilters>(
    key: K,
    value: ContactFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function afterStatusChange(updated: ContactSubmissionDto) {
    setRows((current) =>
      current.map((row) => (row.id === updated.id ? updated : row)),
    );
    setNotice({ tone: 'success', text: statusChangeMessage(updated.status) });
    setReloadKey((key) => key + 1);
  }

  const columns: DataTableColumn<ContactSubmissionDto>[] = [
    {
      key: 'createdAt',
      header: 'Fecha',
      render: (row) => formatInstant(row.createdAt),
    },
    {
      key: 'name',
      header: 'Nombre',
      render: (row) => <span className="cell-title">{row.name}</span>,
    },
    {
      key: 'email',
      header: 'Correo',
      render: (row) => <span className="cell-meta">{row.email}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      render: (row) => <ContactStatusBadge status={row.status} />,
    },
    {
      key: 'message',
      header: 'Mensaje',
      render: (row) => (
        <span className="contact-preview" title={row.message}>
          {contactMessagePreview(row.message)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      className: 'cell-actions',
      render: (row) => (
        <div className="row-actions">
          <button
            type="button"
            className="button button--quiet button--small"
            onClick={() => {
              setNotice(null);
              setDetailId(row.id);
            }}
          >
            Ver detalle
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Administración</p>
        <div className="page__title-row">
          <h1 className="page__title">Contacto</h1>
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
          Mensajes enviados desde el formulario público. Solo se muestran acá:
          el sitio público nunca expone los registros de contacto.
        </p>
      </header>

      {notice ? (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Notice>
      ) : null}

      <FilterBar onReset={resetFilters} active={filtersActive}>
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="contact-search">
            Buscar mensajes
          </label>
          <input
            id="contact-search"
            className="field__input"
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Buscar por nombre, correo o mensaje…"
          />
        </div>
        <div className="field field--inline">
          <label className="field__label sr-only" htmlFor="contact-status">
            Filtrar por estado
          </label>
          <select
            id="contact-status"
            className="field__input"
            value={filters.status}
            onChange={(event) =>
              updateFilter(
                'status',
                event.target.value as ContactFilters['status'],
              )
            }
          >
            <option value="">Todos los estados</option>
            <option value="NEW">Nuevas</option>
            <option value="HANDLED">Gestionadas</option>
          </select>
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="contact-from">
            Desde
          </label>
          <input
            id="contact-from"
            className="field__input"
            type="date"
            value={filters.from}
            onChange={(event) => updateFilter('from', event.target.value)}
            aria-invalid={dateError ? true : undefined}
          />
        </div>
        <div className="field field--inline">
          <label className="field__label" htmlFor="contact-to">
            Hasta
          </label>
          <input
            id="contact-to"
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
        caption="Mensajes recibidos desde el formulario de contacto"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((key) => key + 1)}
        emptyTitle={
          filtersActive
            ? 'No hay mensajes que coincidan con los filtros'
            : 'Todavía no hay mensajes de contacto'
        }
        emptyMessage={
          filtersActive
            ? 'Probá con otro término o limpiá los filtros.'
            : 'Los mensajes enviados desde el sitio público aparecerán acá.'
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
        <Pagination meta={meta} onPageChange={setPage} noun="mensajes" />
      ) : null}

      {detailId ? (
        <ContactDetailDialog
          id={detailId}
          canManage={permissions.manage}
          onClose={() => setDetailId(null)}
          onChanged={(updated) => afterStatusChange(updated)}
        />
      ) : null}
    </section>
  );
}
