/**
 * Pagination control for collection screens (docs/09 §20).
 *
 * It renders the documented contract: visible range, current page, total pages,
 * previous/next and direct page jumps. The server caps `limit`, so the UI never
 * asks for more than the API will return.
 */
import type { PaginationMeta } from '@shared/api';
import { pageWindow } from '../../lib/query';

interface PaginationProps {
  meta: PaginationMeta;
  onPageChange: (page: number) => void;
  /** Optional noun for the summary, e.g. "sermones". */
  noun?: string;
}

export function Pagination({ meta, onPageChange, noun = 'resultados' }: PaginationProps) {
  if (meta.total === 0) return null;

  const start = (meta.page - 1) * meta.limit + 1;
  const end = Math.min(meta.total, meta.page * meta.limit);
  const pages = pageWindow(meta.page, meta.totalPages);
  const canPrevious = meta.page > 1;
  const canNext = meta.page < meta.totalPages;

  return (
    <nav className="pagination" aria-label="Paginación de resultados">
      <p className="pagination__summary">
        Mostrando {start}–{end} de {meta.total} {noun}
      </p>
      <div className="pagination__controls">
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={!canPrevious}
        >
          Anterior
        </button>
        <ol className="pagination__pages">
          {pages.map((page, index) =>
            page === null ? (
              <li key={`gap-${index}`} className="pagination__gap" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={page}>
                <button
                  type="button"
                  className={`pagination__page${
                    page === meta.page ? ' is-current' : ''
                  }`}
                  onClick={() => onPageChange(page)}
                  aria-current={page === meta.page ? 'page' : undefined}
                  aria-label={`Página ${page}`}
                >
                  {page}
                </button>
              </li>
            ),
          )}
        </ol>
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={!canNext}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
