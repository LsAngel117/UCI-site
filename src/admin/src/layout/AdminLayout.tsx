/**
 * Authenticated application shell (docs/09 §8–§11, docs/visual/01 §7).
 *
 * Dark navy sidebar + light editorial canvas. The sidebar is permission-aware:
 * it renders only sections resolved from `visibleNav`, so a module the operator
 * cannot use is absent rather than disabled and misleading. On small screens it
 * becomes an off-canvas drawer with a backdrop and Escape-to-close; on desktop
 * the header control collapses it to an icon rail.
 *
 * The header deliberately carries no invented notifications, counts or search:
 * only actions backed by real destinations (public site, session identity,
 * sign-out).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import logoFull from '../../../web/assets/brand/uci-logo-full.png';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { NavIcon } from '../components/admin/NavIcon';
import { useAuth } from '../lib/auth';
import { initials } from '../lib/dashboard';
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
              title={item.label}
              className={({ isActive }) =>
                `nav__group-label${isActive ? ' is-active' : ''}`
              }
              onClick={onNavigate}
            >
              <NavIcon name={item.icon ?? 'list'} className="nav__icon" />
              <span className="nav__label">{item.label}</span>
            </NavLink>
            <ul className="nav__sublist">
              {item.children.map((child) => (
                <li key={child.to}>
                  <NavLink
                    to={child.to}
                    title={child.label}
                    className={({ isActive }) =>
                      `nav__link${isActive ? ' is-active' : ''}`
                    }
                    onClick={onNavigate}
                  >
                    <NavIcon
                      name={child.icon ?? 'list'}
                      className="nav__icon"
                    />
                    <span className="nav__label">{child.label}</span>
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
              title={item.label}
              className={({ isActive }) =>
                `nav__link${isActive ? ' is-active' : ''}`
              }
              onClick={onNavigate}
            >
              <NavIcon name={item.icon ?? 'list'} className="nav__icon" />
              <span className="nav__label">{item.label}</span>
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
  const [collapsed, setCollapsed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasSidebarOpen = useRef(false);

  const navItems = useMemo(() => visibleNav(hasPermission), [hasPermission]);
  const crumbs = useMemo(
    () => breadcrumbsFor(location.pathname),
    [location.pathname],
  );

  // Navigating to another section always closes the mobile drawer.
  useEffect(() => {
    setSidebarOpen(false);
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
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    await logout();
    setLoggingOut(false);
    navigate('/login', { replace: true });
  }

  const siteUrl = publicSiteUrl();
  const isExternalSite = /^https?:\/\//i.test(siteUrl);
  const displayName = user?.name?.trim() || user?.email || '';

  return (
    <div
      className={`shell${sidebarOpen ? ' shell--open' : ''}${
        collapsed ? ' shell--collapsed' : ''
      }`}
    >
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
          <Link className="sidebar__brand-link" to="/" title="Ir al panel">
            <img
              className="sidebar__logo"
              src={logoFull}
              alt="UCI — Unidad Cristiana de Intercesión"
            />
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
          <a
            className="sidebar__site-link"
            href={siteUrl}
            target={isExternalSite ? '_blank' : undefined}
            rel={isExternalSite ? 'noopener noreferrer' : undefined}
          >
            <span className="nav__label">Sitio en línea</span>
            <NavIcon name="external" className="nav__icon nav__icon--small" />
          </a>
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
            <button
              type="button"
              className="sidebar-toggle"
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar"
              aria-label={
                collapsed
                  ? 'Expandir menú lateral'
                  : 'Colapsar menú lateral'
              }
              title={
                collapsed
                  ? 'Expandir menú lateral'
                  : 'Colapsar menú lateral'
              }
              onClick={() => setCollapsed((value) => !value)}
            >
              <NavIcon name="panel-left" className="sidebar-toggle__icon" />
            </button>
            <Link className="header__brand" to="/">
              UCI
              <span className="header__brand-suffix">CMS</span>
            </Link>
          </div>

          <div className="header__actions">
            <a
              className="header__site-link"
              href={siteUrl}
              target={isExternalSite ? '_blank' : undefined}
              rel={isExternalSite ? 'noopener noreferrer' : undefined}
            >
              <span className="nav__label">Ver sitio</span>
              <NavIcon name="external" className="nav__icon nav__icon--small" />
            </a>
            <div className="header__identity">
              <span className="header__avatar" aria-hidden="true">
                {initials(displayName)}
              </span>
              <span className="header__identity-text">
                <span className="header__name">{user?.name ?? ''}</span>
                <span className="header__role">{user?.role ?? ''}</span>
              </span>
            </div>
            <button
              type="button"
              className="button button--quiet button--small header__logout"
              onClick={() => {
                void handleLogout();
              }}
              disabled={loggingOut}
            >
              <NavIcon name="log-out" className="nav__icon nav__icon--small" />
              <span className="nav__label">
                {loggingOut ? 'Saliendo…' : 'Cerrar sesión'}
              </span>
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
