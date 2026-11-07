/**
 * Full-page status gate for the panel: session verification and hard failures.
 * Shared by the auth guard and the login screen so a slow or failed `/auth/me`
 * never flashes the wrong screen (docs/09 §7).
 */
interface SessionGateProps {
  title: string;
  detail?: string;
  busy?: boolean;
  onRetry?: () => void;
}

export function SessionGate({ title, detail, busy, onRetry }: SessionGateProps) {
  return (
    <main className="gate" aria-busy={busy ? true : undefined}>
      <div className="gate__card" role="status" aria-live="polite">
        <span className="gate__brand" aria-hidden="true">
          UCI
        </span>
        <h1 className="gate__title">{title}</h1>
        {detail ? <p className="gate__detail">{detail}</p> : null}
        {onRetry ? (
          <button type="button" className="button button--primary" onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
      </div>
    </main>
  );
}
