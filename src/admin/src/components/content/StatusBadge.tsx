/**
 * Status indicator for editorial content (docs/09 §21).
 *
 * The label is always present, so status never depends on color alone. The
 * modifier only adds a visual accent for faster scanning.
 */
import type { ContentStatus } from '@shared/types';
import { statusLabel } from '../../lib/format';

export function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className={`badge badge--status badge--status-${status}`}>
      {statusLabel(status)}
    </span>
  );
}
