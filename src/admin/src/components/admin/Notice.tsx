/**
 * Shared inline feedback for the administration screens (Phase 10D2).
 *
 * The tone is explicit and the message is always the server's (or the
 * validator's) honest explanation. Errors are announced as alerts; success and
 * informational messages as status regions.
 */
import type { ReactNode } from 'react';

export type NoticeTone = 'success' | 'error' | 'info' | 'warning';

interface NoticeProps {
  tone?: NoticeTone;
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function Notice({
  tone = 'info',
  children,
  onDismiss,
  dismissLabel = 'Cerrar aviso',
}: NoticeProps) {
  return (
    <div
      className={`form__notice form__notice--${tone}`}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <div>{children}</div>
      {onDismiss ? (
        <button
          type="button"
          className="button button--quiet button--small"
          onClick={onDismiss}
        >
          {dismissLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Field-level validation message (never used for server errors). */
export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="field__error" role="alert">
      {children}
    </p>
  );
}
