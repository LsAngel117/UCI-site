// TEMPORARY FIXTURE - replace with CMS
//
// Asset-free structural fallbacks for the institutional profile and the giving
// call-to-action. Kept in a separate module (no image imports) so the pure
// settings → domain mappers can be unit-tested without loading binaries.
//
// Honesty rules (docs/04 §6.6, §24):
// - the location name/address are placeholders "por confirmar" and stay
//   unconfirmed, so structured data never publishes them as real;
// - contact details and social links are empty: the site must never show an
//   invented phone/email or a fictitious `#` social link.
import type {
  ChurchProfile,
  GivingConfig,
  Location,
} from '@shared/types';

const TEMP_LOCATION: Location = {
  id: 'loc-primary',
  name: '',
  address: 'Dirección por confirmar',
  city: 'Villavicencio',
  state: 'Meta',
  country: 'Colombia',
  coordinates: { latitude: 4.142, longitude: -73.6266 },
  mapUrl: '',
  // Placeholder data: structured data must not publish it as real.
  confirmed: false,
  isPrimary: true,
  active: true,
};

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
  phone: '',
  whatsapp: '',
  email: '',
  location: TEMP_LOCATION,
  logoFullUrl: null,
  logoCompactUrl: null,
  institutionalImageUrl: null,
  socialLinks: [],
};

// TEMPORARY FIXTURE - replace with CMS
export const givingConfigFixture: GivingConfig = {
  title: 'UNA IGLESIA GENEROSA',
  message:
    'Tu generosidad nos permite continuar sirviendo, llevando el mensaje y acompañando a nuestra comunidad.',
  ctaLabel: 'QUIERO DAR',
  // No official giving mechanism has been configured yet, so no link is shown.
  url: null,
};
