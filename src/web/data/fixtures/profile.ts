// TEMPORARY FIXTURE - replace with CMS
// Placeholder institutional information only. Address, coordinates, phone and
// social links are deliberately non-production values (docs/04 §6.6).
import pillarAdoramos from '../../assets/home/pillar-adoramos.png';
import pillarAprendemos from '../../assets/home/pillar-aprendemos.png';
import pillarIntercedemos from '../../assets/home/pillar-intercedemos.png';
import type {
  ChurchProfile,
  GivingConfig,
  Location,
  NavigationItem,
  Pillar,
  SocialLink,
} from '@shared/types';

const TEMP_LOCATION: Location = {
  id: 'loc-primary',
  name: 'Sede principal (placeholder)',
  address: 'Dirección por confirmar',
  city: 'Villavicencio',
  state: 'Meta',
  country: 'Colombia',
  coordinates: { latitude: 4.142, longitude: -73.6266 },
  mapUrl: 'https://maps.google.com/',
  // Placeholder data: structured data must not publish it as real.
  confirmed: false,
  isPrimary: true,
  active: true,
};

const TEMP_SOCIAL_LINKS: SocialLink[] = [
  { platform: 'instagram', label: 'Instagram', url: '#' },
  { platform: 'facebook', label: 'Facebook', url: '#' },
  { platform: 'youtube', label: 'YouTube', url: '#' },
];

export const churchProfileFixture: ChurchProfile = {
  name: 'Iglesia UCI',
  fullName: 'Iglesia UCI — Unidad Cristiana de Intercesión',
  shortDescription:
    'Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.',
  institutionalDescription:
    'Somos una iglesia que cree en el poder de la intercesión y en una vida transformada por la Palabra de Dios.',
  mission:
    'Llevar el mensaje de Jesús a nuestra ciudad y acompañar a las personas en su crecimiento espiritual.',
  vision:
    'Ser una iglesia que intercede, que adora con sinceridad y que forma discípulos.',
  motto: 'Una iglesia que intercede.',
  phone: '+57 000 000 0000',
  whatsapp: '+57 000 000 0000',
  email: 'contacto@uci.example.org',
  location: TEMP_LOCATION,
  logoFullUrl: null,
  logoCompactUrl: null,
  institutionalImageUrl: null,
  socialLinks: TEMP_SOCIAL_LINKS,
};

// TEMPORARY FIXTURE - replace with CMS
// The three pillars are structurally fixed per docs/04 §8; only their copy and
// imagery are content-configurable.
export const pillarsFixture: Pillar[] = [
  {
    id: 'adoramos',
    name: 'ADORAMOS',
    description: 'Exaltamos a Dios con todo nuestro corazón.',
    imageUrl: pillarAdoramos,
  },
  {
    id: 'aprendemos',
    name: 'APRENDEMOS',
    description: 'Crecemos por medio de Su Palabra.',
    imageUrl: pillarAprendemos,
  },
  {
    id: 'intercedemos',
    name: 'INTERCEDEMOS',
    description: 'Creemos en el poder de una iglesia que ora.',
    imageUrl: pillarIntercedemos,
  },
];

// TEMPORARY FIXTURE - replace with CMS
export const givingConfigFixture: GivingConfig = {
  title: 'UNA IGLESIA GENEROSA',
  message:
    'Tu generosidad nos permite continuar sirviendo, llevando el mensaje y acompañando a nuestra comunidad.',
  ctaLabel: 'QUIERO DAR',
  // No official giving mechanism has been configured yet, so no link is shown.
  url: null,
};

function navItem(
  id: string,
  label: string,
  href: string,
  order: number,
): NavigationItem {
  return { id, label, href, order, visible: true };
}

// TEMPORARY FIXTURE - replace with CMS
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