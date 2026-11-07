// TEMPORARY FIXTURE - replace with CMS
//
// Asset-free structural navigation fallbacks. Kept separate from the image
// fixtures so the pure mapper can be unit-tested without loading binaries.
import type { NavigationItem } from '@shared/types';

function navItem(
  id: string,
  label: string,
  href: string,
  order: number,
): NavigationItem {
  return { id, label, href, order, visible: true };
}

// Base navigation structure is product-controlled (docs/05 §45); the CMS may
// later toggle visibility or update labels, but not restructure it.
export const primaryNavigationFixture: NavigationItem[] = [
  navItem('inicio', 'Inicio', '/', 1),
  navItem('nosotros', 'Nosotros', '/nosotros', 2),
  navItem('sermones', 'Sermones', '/sermones', 3),
  navItem('eventos', 'Eventos', '/eventos', 4),
  navItem('ministerios', 'Ministerios', '/ministerios', 5),
  navItem('contacto', 'Contacto', '/contacto', 6),
];

// TEMPORARY FIXTURE - replace with CMS
export const primaryActionsFixture: NavigationItem[] = [
  navItem('soy-nuevo', 'Soy nuevo', '/soy-nuevo', 1),
  navItem('ver-en-vivo', 'Ver en vivo', '/en-vivo', 2),
];
