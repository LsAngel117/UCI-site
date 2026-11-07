/**
 * Authenticated dashboard stub (docs/09 §12–§14, feature doc 10A).
 *
 * Honest by design: no invented metrics. It greets the operator with real
 * data from `/auth/me` and shows only the modules their permissions unlock.
 * The operational overview (counts, activity, scheduled content) is the 10B
 * deliverable and is announced as such.
 */
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { visibleNav, type NavItem } from '../lib/navigation';

function SectionCard({ item }: { item: NavItem }) {
  return (
    <article className="card">
      <div className="card__head">
        <h2 className="card__title">
          <Link to={item.to}>{item.label}</Link>
        </h2>
        {item.phase ? (
          <span className="badge badge--pending">Fase {item.phase}</span>
        ) : null}
      </div>
      {item.description ? (
        <p className="card__description">{item.description}</p>
      ) : null}
      {item.children && item.children.length > 0 ? (
        <ul className="card__links">
          {item.children.map((child) => (
            <li key={child.to}>
              <Link to={child.to}>{child.label}</Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const sections = visibleNav(hasPermission).filter((item) => item.to !== '/');
  const displayName = user?.name?.trim() || user?.email || 'editor';
  const permissionCount = user?.permissions.length ?? 0;

  return (
    <section className="page">
      <header className="page__heading">
        <p className="page__eyebrow">Panel editorial</p>
        <h1 className="page__title">Bienvenido, {displayName}</h1>
        <p className="page__lede">
          Sesión iniciada como <strong>{user?.role ?? 'sin rol'}</strong> con{' '}
          {permissionCount} {permissionCount === 1 ? 'permiso activo' : 'permisos activos'}.
          Desde acá vas a administrar el contenido del sitio.
        </p>
      </header>

      <div className="dashboard__grid">
        <div className="dashboard__sections">
          {sections.length > 0 ? (
            <div className="card-grid">
              {sections.map((item) => (
                <SectionCard key={item.to} item={item} />
              ))}
            </div>
          ) : (
            <div className="panel panel--notice">
              <h2 className="panel__title">Todavía no tenés módulos habilitados</h2>
              <p>
                Tu cuenta está activa, pero ningún rol te otorga permisos de
                contenido. Pedile a un administrador que revise tus permisos.
              </p>
            </div>
          )}

          <div className="panel panel--notice">
            <h2 className="panel__title">Panel en construcción</h2>
            <p>
              La fase 10A habilitó la sesión, la navegación por permisos y el
              acceso a cada módulo. La fase 10B sumó el archivo y el editor de
              sermones en Contenido. El resumen operativo (conteos, actividad
              reciente y contenido programado) todavía no está implementado; las
              secciones restantes muestran un aviso de construcción.
            </p>
          </div>
        </div>

        <aside className="dashboard__aside" aria-label="Tu cuenta">
          <div className="panel">
            <h2 className="panel__title">Tu cuenta</h2>
            <dl className="account">
              <div className="account__row">
                <dt>Nombre</dt>
                <dd>{user?.name || '—'}</dd>
              </div>
              <div className="account__row">
                <dt>Correo</dt>
                <dd>{user?.email || '—'}</dd>
              </div>
              <div className="account__row">
                <dt>Rol</dt>
                <dd>{user?.role || '—'}</dd>
              </div>
              <div className="account__row">
                <dt>Permisos</dt>
                <dd>{permissionCount}</dd>
              </div>
            </dl>
            <p className="panel__footnote">
              Los permisos se resuelven en el servidor en cada solicitud. Lo
              que ves acá refleja la sesión actual.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
