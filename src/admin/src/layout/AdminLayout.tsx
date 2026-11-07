/**
 * Authenticated application shell (docs/09 §8–§11).
 *
 * Sidebar + header + breadcrumbs. The sidebar is permission-aware: it renders
 * only sections resolved from `visibleNav`, so a module the operator cannot use
 * is absent rather than disabled and misleading. On small screens the sidebar
 * becomes an off-canvas drawer with a backdrop and Escape-to-close.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useAuth } from '../lib/auth';
import {
  breadcrumbsFor,
  visibleNav,
  type NavItem,
} from '../lib/navigation';

/**
 * Public site entry. Same origin in production (`/`), Astro dev server in
 * development. Overridable with `VITE_PUBLIC_SITE_URL`.
 */
function publicSiteUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_SITE_URL as
    | string
    | undefined;
  if (configured) return configured;
  return import.meta.env.DEV ? 'http://localhost:4321' : '/';
}

function SidebarItems({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate: () => void;
}) {
  return (
    <ul className="nav__list">
      {items.map((item) =>
        item.children && item.children.length > 0 ? (
          <li className="nav__group" key={item.to}>
            <NavLink
              to={item.to}
              end
              className={({ isActive }) =>
                `nav__group-label${isActive ? ' is-active' : ''}`
              }
              onClick={onNavigate}
            >
              {item.label}
            </NavLink>
            <ul className="nav__sublist">
              {item.children.map((child) => (
                <li key={child.to}>
                  <NavLink
                    to={child.to}
                    className={({ isActive }) =>
                      `nav__link${isActive ? ' is-active' : ''}`
                    }
                    onClick={onNavigate}
                  >
                    {child.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </li>
        ) : (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `nav__link${isActive ? ' is-active' : ''}`
              }
              onClick={onNavigate}
            >
              {item.label}
            </NavLink>
          </li>
        ),
      )}
    </ul>
  );
}

export function AdminLayout() {
  const { user, hasPermission, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const wasSidebarOpen = useRef(false);

  const navItems = useMemo(() => visibleNav(hasPermission), [hasPermission]);
  const crumbs = useMemo(
    () => breadcrumbsFor(location.pathname),
    [location.pathname],
  );

  // Navigating to another section always closes transient overlays.
  useEffect(() => {
    setSidebarOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  // A closed off-canvas drawer must not keep focus off-screen, and opening it
  // must move focus inside so keyboard and screen-reader users land in the
  // menu (the drawer is hidden with `visibility` while closed on mobile).
  useEffect(() => {
    if (sidebarOpen) {
      sidebarRef.current?.focus();
    } else if (wasSidebarOpen.current) {
      menuButtonRef.current?.focus();
    }
    wasSidebarOpen.current = sidebarOpen;
  }, [sidebarOpen]);

  useEffect(() => {
    if (!sidebarOpen && !notificationsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (sidebarOpen) setSidebarOpen(false);
      if (notificationsOpen) setNotificationsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen, notificationsOpen]);

  // Dismiss the notifications popover on an outside click.
  useEffect(() => {
    if (!notificationsOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [notificationsOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    navigate('/login', { replace: true });
  }

  const siteUrl = publicSiteUrl();
  const isExternalSite = /^https?:\/\//i.test(siteUrl);

  return (
    <div className={`shell${sidebarOpen ? ' shell--open' : ''}`}>
      <a className="skip-link" href="#admin-main">
        Saltar al contenido
      </a>

      <div
        className="shell__backdrop"
        aria-hidden="true"
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className="sidebar"
        id="admin-sidebar"
        ref={sidebarRef}
        tabIndex={-1}
      >
        <div className="sidebar__brand">
          <Link className="sidebar__wordmark" to="/">
            UCI
          </Link>
          <span className="sidebar__subtitle">Panel editorial</span>
        </div>

        <nav aria-label="Secciones del panel">
          <SidebarItems
            items={navItems}
            onNavigate={() => setSidebarOpen(false)}
          />
        </nav>

        <div className="sidebar__footer">
          <span className="sidebar__footer-name">Iglesia UCI</span>
          <span className="sidebar__footer-detail">
            Unidad Cristiana de Intercesión
          </span>
        </div>
      </aside>

      <div className="shell__body">
        <header className="header">
          <div className="header__leading">
            <button
              type="button"
              className="menu-button"
              ref={menuButtonRef}
              aria-expanded={sidebarOpen}
              aria-controls="admin-sidebar"
              aria-label={sidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <span className="menu-button__bars" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </button>
            <Link className="header__brand" to="/">
              UCI
              <span className="header__brand-suffix">Panel</span>
            </Link>
          </div>

          <div className="header__actions">
            <a
              className="header__site-link"
              href={siteUrl}
              target={isExternalSite ? '_blank' : undefined}
              rel={isExternalSite ? 'noopener noreferrer' : undefined}
            >
              Ver sitio
            </a>
            <div className="header__notifications" ref={notificationsRef}>
              <button
                type="button"
                className="notifications-button"
                aria-expanded={notificationsOpen}
                aria-controls="admin-notifications"
                aria-label="Notificaciones"
                onClick={() => setNotificationsOpen((open) => !open)}
              >
                <span className="notifications-button__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" focusable="false">
                    <path
                      d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M10.3 20a2 2 0 0 0 3.4 0"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="notifications-button__label">Notificaciones</span>
              </button>
              <div
                className="notifications"
                id="admin-notifications"
                role="region"
                aria-label="Notificaciones"
                hidden={!notificationsOpen}
              >
                <h2 className="notifications__title">Notificaciones</h2>
                <p className="notifications__empty">Sin notificaciones</p>
                <p className="notifications__note">
                  Los avisos del panel aparecerán acá cuando haya operaciones
                  que los generen.
                </p>
              </div>
            </div>
            <div className="header__identity">
              <span className="header__name">{user?.name ?? ''}</span>
              <span className="header__role">{user?.role ?? ''}</span>
            </div>
            <button
              type="button"
              className="button button--quiet"
              onClick={() => {
                void handleLogout();
              }}
              disabled={loggingOut}
            >
              {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
            </button>
          </div>
        </header>

        <main className="main" id="admin-main" tabIndex={-1}>
          <Breadcrumbs items={crumbs} />
          <div className="main__content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
