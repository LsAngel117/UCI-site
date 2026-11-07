/**
 * Honest async states shared by content screens (docs/09 §16–§21).
 *
 * Every state says what actually happened: loading is announced, an error keeps
 * the API message and offers a retry, and an empty list is never dressed up as
 * a populated one. These components are presentational; the API remains the
 * authority on why a request failed.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LoadingPanel({
  label = 'Cargando…',
  detail,
}: {
  label?: string;
  detail?: string;
}) {
  return (
    <div className="state state--loading" role="status" aria-live="polite">
      <span className="state__spinner" aria-hidden="true" />
      <p className="state__title">{label}</p>
      {detail ? <p className="state__detail">{detail}</p> : null}
    </div>
  );
}

export function ErrorPanel({
  title = 'No pudimos cargar la información',
  message,
  onRetry,
  retryLabel = 'Reintentar',
  children,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{title}</p>
      <p className="state__detail">{message}</p>
      {onRetry ? (
        <button type="button" className="button button--quiet" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
      {children}
    </div>
  );
}

export function EmptyPanel({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state state--empty">
      <p className="state__title">{title}</p>
      {message ? <p className="state__detail">{message}</p> : null}
      {action}
    </div>
  );
}

/**
 * In-shell 403. Permission checks in the UI are a convenience; this screen is
 * what a user sees when a route looks accessible but their role does not grant
 * the required permission. The server would reject the requests anyway.
 */
export function ForbiddenPanel({ permission }: { permission: string }) {
  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Acceso restringido</p>
        <h1 className="page__title">No tenés permiso para ver esta sección</h1>
        <p className="page__lede">
          Tu cuenta no incluye el permiso <code>{permission}</code>. Si creés que
          es un error, pedile a un administrador que revise tu rol.
        </p>
      </header>
      <div className="panel panel--notice">
        <p>
          La autorización se valida en el servidor en cada solicitud. Ocultar o
          deshabilitar acciones en el panel es solo una ayuda visual.
        </p>
        <Link className="button button--quiet" to="/">
          Volver al panel
        </Link>
      </div>
    </section>
  );
}
