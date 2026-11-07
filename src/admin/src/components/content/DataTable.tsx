/**
 * Generic content list table (docs/09 §16–§21).
 *
 * One table component owns the four list states — loading, error, empty and
 * populated — so every content module gives the operator the same honest
 * feedback. Columns are defined by the screen; the table never assumes fields.
 */
import type { ReactNode } from 'react';
import { EmptyPanel, ErrorPanel, LoadingPanel } from './States';

export interface DataTableColumn<T> {
  /** Stable key used for React and the header cell. */
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Optional class for column-specific alignment. */
  className?: string;
}

interface DataTableProps<T> {
  caption: string;
  columns: ReadonlyArray<DataTableColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyMessage,
  emptyAction,
}: DataTableProps<T>) {
  if (loading && rows.length === 0) {
    return <LoadingPanel label="Cargando contenido…" />;
  }

  if (error) {
    return (
      <ErrorPanel
        title="No pudimos cargar la lista"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyPanel title={emptyTitle} message={emptyMessage} action={emptyAction} />
    );
  }

  return (
    <div className="table-wrap" aria-busy={loading ? true : undefined}>
      <table className="data-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.className}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.className}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {loading ? (
        <p className="table-wrap__status" role="status">
          Actualizando lista…
        </p>
      ) : null}
    </div>
  );
}
