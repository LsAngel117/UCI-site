/**
 * Content section landing (feature doc 10B).
 *
 * The sidebar group label links here, so it must not be a dead placeholder: it
 * lists the content modules the current role can see and marks which ones are
 * already available versus which phase delivers them. It never pretends a
 * pending module is usable.
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { visibleNav, type NavItem } from '../../lib/navigation';

/** Modules with a real screen behind the link. */
const AVAILABLE_PATHS: ReadonlySet<string> = new Set([
  '/contenido/sermones',
  '/contenido/historias',
]);

function ModuleCard({ item }: { item: NavItem }) {
  const available = AVAILABLE_PATHS.has(item.to);
  return (
    <article className="card">
      <div className="card__head">
        <h2 className="card__title">
          <Link to={item.to}>{item.label}</Link>
        </h2>
        <span className={available ? 'badge badge--status-published' : 'badge badge--pending'}>
          {available ? 'Disponible' : `Fase ${item.phase ?? 'pendiente'}`}
        </span>
      </div>
      {item.description ? (
        <p className="card__description">{item.description}</p>
      ) : null}
    </article>
  );
}

export function ContentIndexPage() {
  const { hasPermission } = useAuth();
  const section = visibleNav(hasPermission).find((item) => item.to === '/contenido');
  const children = section?.children ?? [];

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Contenido</p>
        <h1 className="page__title">Contenido del sitio</h1>
        <p className="page__lede">
          Módulos editoriales a los que tu rol tiene acceso. Los sermones ya
          cuentan con archivo, editor, publicación y revisiones.
        </p>
      </header>

      {children.length > 0 ? (
        <div className="card-grid">
          {children.map((item) => (
            <ModuleCard key={item.to} item={item} />
          ))}
        </div>
      ) : (
        <div className="panel panel--notice">
          <h2 className="panel__title">No tenés módulos de contenido habilitados</h2>
          <p>
            Tu cuenta no incluye permisos de lectura para sermones, páginas,
            eventos ni ministerios.
          </p>
        </div>
      )}
    </section>
  );
}
