/**
 * Breadcrumb trail (docs/09 §11). Ancestors are links; the last crumb is the
 * current location and is marked with `aria-current="page"`.
 */
import { Link } from 'react-router-dom';
import type { Breadcrumb } from '../lib/navigation';

export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Ruta de navegación">
      <ol className="breadcrumbs__list">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;
          return (
            <li className="breadcrumbs__item" key={`${crumb.label}-${index}`}>
              {crumb.to && !isLast ? (
                <Link className="breadcrumbs__link" to={crumb.to}>
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className="breadcrumbs__current"
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
