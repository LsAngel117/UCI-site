/**
 * Accessible modal wrapper built on the native `<dialog>` element.
 *
 * Native dialogs give focus trapping, Escape handling and a modal backdrop for
 * free; we only add the panel's chrome and a deterministic close callback. Used
 * by confirmations, scheduling and the media picker (docs/13 §accessibility).
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  /** Extra class for wider dialogs (the media picker). */
  wide?: boolean;
}

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  wide,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click whose target is the dialog itself is a backdrop click.
        if (event.target === event.currentTarget) onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="dialog__panel">
        <header className="dialog__head">
          <div>
            <h2 className="dialog__title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="dialog__description">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="dialog__close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        {children ? <div className="dialog__body">{children}</div> : null}
        {footer ? <footer className="dialog__footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
