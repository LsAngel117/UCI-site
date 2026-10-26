// TEMPORARY FIXTURE - replace with CMS
// Sermons, events, ministries, stories and homepage headings are all
// placeholders. Replace via the CMS integration without touching components.
import type {
  AboutSection,
  Event,
  ExploraMensajesContent,
  FinalCtaContent,
  HeroContent,
  HistoriasContent,
  MinisteriosContent,
  Ministry,
  PillarsSection,
  PrimeraVezContent,
  ProximoServicioContent,
  ProximosEventosContent,
  Sermon,
  SermonSeries,
  Story,
  UltimoSermonContent,
} from '@shared/types';

/**
 * TEMPORARY FIXTURE - replace with CMS
 * Homepage display copy for the sections that already have their real approved
 * structure in docs/04. Keep this centralized so a future CMS section-content
 * endpoint can replace it.
 *
 * Structural copy (section labels, major headings, CTA wording and
 * destinations) is product-controlled per docs/04 §20; only dynamic content
 * (sermons, events, ministries, stories, schedule) changes over time.
 */
export const homepageHeadingsFixture: {
  hero: HeroContent;
  about: AboutSection;
  pillars: PillarsSection;
  proximoServicio: ProximoServicioContent;
  primeraVez: PrimeraVezContent;
  ultimoSermon: UltimoSermonContent;
  exploraMensajes: ExploraMensajesContent;
  proximosEventos: ProximosEventosContent;
  ministerios: MinisteriosContent;
  historias: HistoriasContent;
  finalCta: FinalCtaContent;
} = {
  hero: {
    label: 'BIENVENIDO A UCI',
    headingLineOne: 'UNA IGLESIA',
    headingAccent: 'QUE INTERCEDE.',
    supportingText:
      'Una comunidad que busca a Dios, vive Su Palabra y permanece en oración.',
    primaryCta: { label: 'CONÓCENOS', href: '/nosotros' },
    secondaryCta: { label: 'VER ÚLTIMO SERMÓN', href: '/sermones' },
    // Real asset is imported and injected in `site.ts` (source of truth).
    backgroundImageUrl: null,
  },
  about: {
    label: 'SOMOS UCI',
    heading: 'Una iglesia que intercede',
    body: 'Creemos en una iglesia que permanece en oración, que ama la Palabra de Dios y que camina junta como familia. En UCI cada persona es bienvenida a encontrar su lugar.',
    cta: { label: 'CONÓCENOS MÁS', href: '/nosotros' },
  },
  pillars: {
    label: 'EN UCI',
    heading: 'Te invitamos a...',
    pillars: [],
  },
  proximoServicio: {
    label: 'NOS VEMOS ESTE DOMINGO',
    heading: 'Próximo servicio',
    supportingText:
      'Un espacio para adorar juntos, escuchar la Palabra y orar como familia.',
    cta: { label: 'PLANEA TU VISITA', href: '/soy-nuevo' },
  },
  primeraVez: {
    label: 'SOY NUEVO',
    heading: '¿Es tu primera vez en UCI?',
    supportingText: 'Queremos que te sientas como en casa.',
    blocks: [
      {
        id: 'donde-estamos',
        icon: 'map-pin',
        title: '¿Dónde estamos?',
        body: 'Nos reunimos en nuestra sede principal. Encuentra la dirección exacta y cómo llegar desde donde estés.',
      },
      {
        id: 'cuando-nos-reunimos',
        icon: 'clock',
        title: '¿Cuándo nos reunimos?',
        body: 'Tenemos servicios cada semana. Consulta el día y la hora del próximo encuentro antes de venir.',
      },
      {
        id: 'que-puedes-esperar',
        icon: 'heart',
        title: '¿Qué puedes esperar?',
        body: 'Un servicio cálido con adoración, enseñanza bíblica y un equipo listo para recibirte con los brazos abiertos.',
      },
    ],
    cta: { label: 'QUIERO CONOCER UCI', href: '/soy-nuevo' },
  },
  ultimoSermon: {
    label: 'ÚLTIMO SERMÓN',
    primaryCtaLabel: 'VER SERMÓN',
    secondaryCtaLabel: 'VER NOTAS',
    archiveHref: '/sermones',
  },
  exploraMensajes: {
    label: 'SERMONES',
    heading: 'Explora nuestros mensajes',
    filters: ['Todos', 'Predicadores', 'Series', 'Temas'],
    cta: { label: 'Ver todos los sermones', href: '/sermones' },
  },
  proximosEventos: {
    label: 'LO QUE ESTÁ PASANDO EN UCI',
    heading: 'Próximos eventos',
    emptyMessage: 'No hay eventos próximos.',
    cta: { label: 'VER CALENDARIO', href: '/eventos' },
  },
  ministerios: {
    label: 'MINISTERIOS',
    heading: 'Encuentra tu lugar',
    supportingText: 'Conoce nuestros ministerios y sé parte.',
    cta: { label: 'VER MINISTERIOS', href: '/ministerios' },
  },
  historias: {
    label: 'HISTORIAS',
    heading: 'Dios sigue haciendo historia',
  },
  finalCta: {
    heading: 'Hay un lugar para ti.',
    supportingText: 'Damos el siguiente paso juntos. Te esperamos este domingo.',
    cta: { label: 'PLANEA TU VISITA', href: '/soy-nuevo' },
  },
};

const seriesFixture: SermonSeries = {
  id: 'series-oracion',
  name: 'Vida de oración',
  slug: 'vida-de-oracion',
  coverImageUrl: null,
};

const preacherFixture = {
  id: 'person-placeholder',
  firstName: 'Predicador',
  lastName: 'por confirmar',
  displayName: 'Predicador por confirmar',
  photoUrl: null,
  role: 'Predicador',
  publicProfileEnabled: true,
  active: true,
};

// TEMPORARY FIXTURE - replace with CMS
export const sermonsFixture: Sermon[] = [
  {
    id: 'sermon-placeholder-01',
    title: 'Permaneced en oración',
    slug: 'permaneced-en-oracion',
    summary:
      'Un llamado a sostener una vida de intercesión constante y confiada.',
    preacher: preacherFixture,
    date: '2026-09-27',
    series: seriesFixture,
    topics: [{ id: 'topic-oracion', name: 'Oración', slug: 'oracion' }],
    imageUrl: null,
    video: { provider: 'youtube', externalId: 'placeholder', url: '#' },
    notesAvailable: false,
    scripture: '1 Tesalonicenses 5:17',
    scriptureReferences: ['1 Tesalonicenses 5:17', 'Colosenses 4:2'],
    durationMinutes: 42,
    featured: false,
    status: 'draft',
    publishedAt: '2026-09-27T15:00:00Z',
    updatedAt: '2026-09-27T15:00:00Z',
  },
  {
    id: 'sermon-placeholder-02',
    title: 'Una fe que sostiene',
    slug: 'una-fe-que-sostiene',
    summary: 'La fe que permanece firme aun en medio de la prueba.',
    preacher: preacherFixture,
    date: '2026-09-20',
    series: seriesFixture,
    topics: [{ id: 'topic-fe', name: 'Fe', slug: 'fe' }],
    imageUrl: null,
    video: { provider: 'youtube', externalId: 'placeholder', url: '#' },
    notesAvailable: true,
    notesUrl: '#',
    scripture: 'Hebreos 11:1',
    scriptureReferences: ['Hebreos 11:1'],
    durationMinutes: 38,
    featured: false,
    status: 'draft',
    publishedAt: '2026-09-20T15:00:00Z',
    updatedAt: '2026-09-20T15:00:00Z',
  },
  {
    id: 'sermon-placeholder-03',
    title: 'El poder de la intercesión',
    slug: 'el-poder-de-la-intercesion',
    summary: 'Cuando la iglesia ora, algo se mueve en el cielo.',
    preacher: preacherFixture,
    date: '2026-09-13',
    series: seriesFixture,
    topics: [{ id: 'topic-oracion', name: 'Oración', slug: 'oracion' }],
    imageUrl: null,
    video: { provider: 'youtube', externalId: 'placeholder', url: '#' },
    notesAvailable: false,
    scripture: 'Santiago 5:16',
    scriptureReferences: ['Santiago 5:16'],
    durationMinutes: 45,
    featured: false,
    status: 'draft',
    publishedAt: '2026-09-13T15:00:00Z',
    updatedAt: '2026-09-13T15:00:00Z',
  },
  {
    id: 'sermon-placeholder-04',
    title: 'Caminar en comunidad',
    slug: 'caminar-en-comunidad',
    summary: 'Dios nos llamó a caminar juntos, no solos.',
    preacher: preacherFixture,
    date: '2026-09-06',
    series: seriesFixture,
    topics: [{ id: 'topic-comunidad', name: 'Comunidad', slug: 'comunidad' }],
    imageUrl: null,
    video: { provider: 'youtube', externalId: 'placeholder', url: '#' },
    notesAvailable: false,
    scripture: 'Hebreos 10:24-25',
    scriptureReferences: ['Hebreos 10:24-25'],
    durationMinutes: 40,
    featured: false,
    status: 'draft',
    publishedAt: '2026-09-06T15:00:00Z',
    updatedAt: '2026-09-06T15:00:00Z',
  },
];

// TEMPORARY FIXTURE - replace with CMS
export const eventsFixture: Event[] = [
  {
    id: 'event-placeholder-01',
    title: 'Noche de oración',
    slug: 'noche-de-oracion',
    summary: 'Un espacio para buscar a Dios juntos como iglesia.',
    description:
      'Únete a una noche dedicada a la oración y la intercesión comunitaria.',
    imageUrl: null,
    category: { id: 'cat-oracion', name: 'Oración', slug: 'oracion' },
    startDate: '2026-10-09',
    startTime: '19:00',
    endTime: '21:00',
    location: {
      id: 'loc-primary',
      name: 'Sede principal (placeholder)',
      address: 'Dirección por confirmar',
      city: 'Villavicencio',
      state: 'Meta',
      country: 'Colombia',
      coordinates: { latitude: 4.142, longitude: -73.6266 },
      mapUrl: 'https://maps.google.com/',
      confirmed: false,
      isPrimary: true,
      active: true,
    },
    featured: false,
    status: 'draft',
  },
  {
    id: 'event-placeholder-02',
    title: 'Culto familiar',
    slug: 'culto-familiar',
    summary: 'Una mañana para compartir en familia.',
    description: 'Actividad pensada para todas las edades de la familia UCI.',
    imageUrl: null,
    category: { id: 'cat-comunidad', name: 'Comunidad', slug: 'comunidad' },
    startDate: '2026-10-18',
    startTime: '10:00',
    location: {
      id: 'loc-primary',
      name: 'Sede principal (placeholder)',
      address: 'Dirección por confirmar',
      city: 'Villavicencio',
      state: 'Meta',
      country: 'Colombia',
      coordinates: { latitude: 4.142, longitude: -73.6266 },
      mapUrl: 'https://maps.google.com/',
      confirmed: false,
      isPrimary: true,
      active: true,
    },
    featured: false,
    status: 'draft',
  },
];

// TEMPORARY FIXTURE - replace with CMS
// Ministry list must never be invented by the frontend (docs/05 §13); these
// placeholders exist only so the section has structural content to render.
export const ministriesFixture: Ministry[] = [
  {
    id: 'ministry-placeholder-01',
    name: 'Ministerio de oración',
    slug: 'oracion',
    shortDescription: 'Intercedemos por la iglesia y la ciudad.',
    description: 'Un equipo dedicado a la oración y la intercesión.',
    imageUrl: null,
    leaders: [],
    featured: false,
    status: 'draft',
  },
  {
    id: 'ministry-placeholder-02',
    name: 'Ministerio de jóvenes',
    slug: 'jovenes',
    shortDescription: 'Una generación que sigue a Jesús.',
    description: 'Comunidad de jóvenes que crecen en fe y propósito.',
    imageUrl: null,
    leaders: [],
    featured: false,
    status: 'draft',
  },
  {
    id: 'ministry-placeholder-03',
    name: 'Ministerio de niños',
    slug: 'ninos',
    shortDescription: 'Formamos a los más pequeños en la Palabra.',
    description: 'Ambiente seguro y divertido para que los niños aprendan de Dios.',
    imageUrl: null,
    leaders: [],
    featured: false,
    status: 'draft',
  },
];

// TEMPORARY FIXTURE - replace with CMS
export const storiesFixture: Story[] = [
  {
    id: 'story-placeholder-01',
    title: 'Una historia de oración respondida',
    displayName: 'Nombre por confirmar',
    quote:
      'Dios nos mostró que la oración no cambia solo las circunstancias, también nos cambia a nosotros.',
    fullStory:
      'Este es un testimonio temporal usado para maquetar la sección de historias. El contenido real debe ser autorizado por UCI antes de publicarse.',
    imageUrl: null,
    date: '2026-09-01',
    editorialApproved: false,
    featured: true,
    status: 'draft',
  },
];