/**
 * Idempotent seed for the public site structure (Phase 7/9 defaults).
 *
 * The mockup-approved navigation is editorial data owned by the CMS, not by
 * the frontend fixture. Without it the public header renders no links (the
 * public navigation endpoint returns an empty menu). This seed only fills a
 * menu that is still empty: once an editor has rows for a location, the seed
 * never touches them, so manual labels, ordering and visibility survive.
 *
 * `/nosotros` is an institutional page managed through the Pages module
 * (docs/05 §20). It is created as a published page so the primary navigation
 * never points at a 404. Existing rows are never overwritten.
 */
import type { PrismaClient } from '@prisma/client';
import { prisma } from '@server/db';

interface NavigationSeedItem {
  label: string;
  href: string;
}

const PRIMARY_NAVIGATION: NavigationSeedItem[] = [
  { label: 'Inicio', href: '/' },
  { label: 'Nosotros', href: '/nosotros' },
  { label: 'Sermones', href: '/sermones' },
  { label: 'Eventos', href: '/eventos' },
  { label: 'Ministerios', href: '/ministerios' },
  { label: 'Contacto', href: '/contacto' },
];

const ABOUT_PAGE = {
  slug: 'nosotros',
  title: 'Nosotros',
  excerpt:
    'Una comunidad que cree en el poder de la oración, en la autoridad de la Palabra de Dios y en el llamado de cada persona a vivir una relación genuina con Cristo.',
  content: {
    blocks: [
      {
        type: 'paragraph',
        text: 'Iglesia UCI — Unidad Cristiana de Intercesión es una comunidad que cree en el poder de la oración, en la autoridad de la Palabra de Dios y en el llamado de cada persona a vivir una relación genuina con Cristo.',
      },
      { type: 'heading', level: 2, text: 'Lo que nos define' },
      {
        type: 'paragraph',
        text: 'Creemos en una iglesia que permanece en oración, que ama la Palabra de Dios y que camina junta como familia. En UCI cada persona es bienvenida a encontrar su lugar.',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Adoramos a Dios con todo nuestro corazón.',
          'Crecemos por medio de Su Palabra.',
          'Creemos en el poder de una iglesia que ora.',
        ],
      },
      { type: 'heading', level: 3, text: 'Nuestro llamado' },
      {
        type: 'paragraph',
        text: 'Interceder por nuestra ciudad, acompañar a las familias y formar discípulos que vivan el evangelio en lo cotidiano.',
      },
      {
        type: 'cta',
        label: 'Planea tu visita',
        href: '/soy-nuevo',
      },
    ],
  },
};

/** Fill a menu only when that location has no rows yet. */
async function seedNavigationLocation(
  db: PrismaClient,
  location: 'HEADER' | 'FOOTER',
): Promise<void> {
  const existing = await db.navigation.count({ where: { location } });
  if (existing > 0) return;

  await db.navigation.createMany({
    data: PRIMARY_NAVIGATION.map((item, index) => ({
      label: item.label,
      href: item.href,
      external: false,
      location,
      target: null,
      order: index + 1,
      visible: true,
    })),
  });
}

export async function seedSiteStructure(
  db: PrismaClient = prisma,
): Promise<void> {
  await seedNavigationLocation(db, 'HEADER');
  await seedNavigationLocation(db, 'FOOTER');

  await db.page.upsert({
    where: { slug: ABOUT_PAGE.slug },
    update: {},
    create: {
      slug: ABOUT_PAGE.slug,
      title: ABOUT_PAGE.title,
      excerpt: ABOUT_PAGE.excerpt,
      content: ABOUT_PAGE.content,
      status: 'published',
      publishedAt: new Date(),
    },
  });
}
