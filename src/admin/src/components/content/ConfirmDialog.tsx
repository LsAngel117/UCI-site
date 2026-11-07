/**
 * Confirmation for consequential actions (docs/09 §31, §37).
 *
 * The copy must state the consequence, never just "¿Estás seguro?". A dangerous
 * action is visually distinct, and the dialog stays open while the request is
 * in flight so the operator cannot double-submit.
 */
import type { ReactNode } from 'react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button
            type="button"
            className="button button--quiet"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${danger ? 'button--danger' : 'button--primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm">{children}</div>
    </Dialog>
  );
}
