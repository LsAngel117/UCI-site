/**
 * Section landing for fully delivered groups (Phase 10D2).
 *
 * `/sitio` and `/administracion` are links in the sidebar; instead of a dead
 * placeholder they list the modules the current role can open and mark them as
 * available. A section whose children are all hidden is never reachable because
 * `visibleNav` drops it first.
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { visibleNav, type NavItem } from '../lib/navigation';

function ModuleCard({ item }: { item: NavItem }) {
  return (
    <article className="card">
      <div className="card__head">
        <h2 className="card__title">
          <Link to={item.to}>{item.label}</Link>
        </h2>
        <span
          className={
            item.implemented ? 'badge badge--status-published' : 'badge badge--pending'
          }
        >
          {item.implemented ? 'Disponible' : `Fase ${item.phase ?? 'pendiente'}`}
        </span>
      </div>
      {item.description ? (
        <p className="card__description">{item.description}</p>
      ) : null}
    </article>
  );
}

export function SectionIndexPage({ sectionTo }: { sectionTo: string }) {
  const { hasPermission } = useAuth();
  const section = visibleNav(hasPermission).find(
    (item) => item.to === sectionTo,
  );
  const children = section?.children ?? [];

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Panel</p>
        <h1 className="page__title">{section?.label ?? 'Sección'}</h1>
        {section?.description ? (
          <p className="page__lede">{section.description}</p>
        ) : null}
      </header>

      {children.length > 0 ? (
        <div className="card-grid">
          {children.map((item) => (
            <ModuleCard key={item.to} item={item} />
          ))}
        </div>
      ) : (
        <div className="panel panel--notice">
          <h2 className="panel__title">No tenés módulos habilitados acá</h2>
          <p>
            Tu cuenta no incluye permisos de lectura para ninguno de los módulos
            de esta sección.
          </p>
          <Link className="button button--quiet" to="/">
            Volver al panel
          </Link>
        </div>
      )}
    </section>
  );
}
