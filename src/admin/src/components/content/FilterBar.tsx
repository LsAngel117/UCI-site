/**
 * List filter/search bar (docs/09 §18–§19).
 *
 * Filters are removable one by one (the screen owns the controls) and as a
 * group through "Limpiar filtros". The reset button only appears when at least
 * one filter is active, so the control never looks actionable in a no-op state.
 */
import type { ReactNode } from 'react';

interface FilterBarProps {
  children: ReactNode;
  onReset?: () => void;
  active?: boolean;
  actions?: ReactNode;
}

export function FilterBar({
  children,
  onReset,
  active = false,
  actions,
}: FilterBarProps) {
  return (
    <form
      className="filters"
      role="search"
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="filters__fields">{children}</div>
      <div className="filters__actions">
        {onReset && active ? (
          <button type="button" className="button button--quiet button--small" onClick={onReset}>
            Limpiar filtros
          </button>
        ) : null}
        {actions}
      </div>
    </form>
  );
}
