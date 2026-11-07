/**
 * Phase 9B1 — public content pages helper suite.
 *
 * The archive pages and their SSR routes depend on two pure helpers:
 * `src/web/lib/archive.ts` (query parsing / pagination links) and
 * `src/web/lib/seo.ts` (canonical/Open Graph + Schema.org JSON-LD). Keeping
 * them deterministic means the rules can be asserted without a running API or
 * Astro server (docs/10 §6, §12).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  PublicEventDto,
  PublicMinistryDto,
  PublicSermonDto,
} from '@shared/cms';
import {
  buildArchiveHref,
  MAX_ARCHIVE_PAGE,
  parsePage,
  parseSermonFilters,
} from '@web/lib/archive';
import {
  buildCanonicalUrl,
  buildEventSeo,
  buildListCanonical,
  buildMinistrySeo,
  buildSermonSeo,
  youtubeVideo,
} from '@web/lib/seo';

const SITE_URL = 'https://uci.test';
const SITE_NAME = 'Iglesia UCI';

const sermon: PublicSermonDto = {
  id: 'sermon-1',
  slug: 'la-fe-que-obra',
  title: 'La fe que obra',
  description: 'Un mensaje sobre una fe activa.',
  scriptureReference: 'Santiago 2:14-26',
  scriptureText: 'La fe sin obras es muerta.',
  preacherName: null,
  preacher: {
    id: 'person-1',
    displayName: 'Ana Gómez',
    role: 'Pastora',
    photoUrl: null,
  },
  sermonDate: '2026-04-12T00:00:00.000Z',
  series: { id: 'series-1', name: 'Fe viva', slug: 'fe-viva', coverImageUrl: null },
  topics: [{ id: 'topic-1', name: 'Fe', slug: 'fe' }],
  coverImageUrl: '/media/fe.png',
  coverImageAlt: 'Predicadora en el púlpito',
  video: {
    provider: 'youtube',
    externalId: 'abc123',
    url: null,
  },
  audioUrl: null,
  notesContent: 'Notas del mensaje.',
  notesUrl: null,
  durationMinutes: 42,
  featured: true,
  publishedAt: '2026-04-13T10:00:00.000Z',
  updatedAt: '2026-04-14T10:00:00.000Z',
  seo: {
    title: 'La fe que obra | Iglesia UCI',
    description: 'Una fe que se demuestra con obras.',
    canonicalUrl: `${SITE_URL}/sermones/la-fe-que-obra`,
    ogImageUrl: `${SITE_URL}/media/fe.png`,
  },
};

const event: PublicEventDto = {
  id: 'event-1',
  slug: 'retiro-de-jovenes',
  title: 'Retiro de jóvenes',
  summary: 'Un fin de semana juntos.',
  description: 'Encuentro de jóvenes de UCI.',
  category: { id: 'category-1', name: 'Jóvenes', slug: 'jovenes' },
  startAt: '2026-12-10T15:00:00.000Z',
  endAt: '2026-12-12T20:00:00.000Z',
  locationName: 'Casa UCI',
  address: 'Calle 123 #45-67',
  city: 'Bogotá',
  coverImageUrl: null,
  coverImageAlt: null,
  registrationUrl: 'https://uci.test/registro',
  featured: false,
  publishedAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T10:00:00.000Z',
  seo: {
    title: 'Retiro de jóvenes | Iglesia UCI',
    description: 'Un fin de semana para los jóvenes de UCI.',
    canonicalUrl: `${SITE_URL}/eventos/retiro-de-jovenes`,
    ogImageUrl: null,
  },
};

const ministry: PublicMinistryDto = {
  id: 'ministry-1',
  slug: 'jovenes',
  name: 'Jóvenes',
  shortDescription: 'Encuentros para jóvenes.',
  description: 'Una comunidad de jóvenes que crece en la fe.',
  coverImageUrl: null,
  coverImageAlt: null,
  contactEmail: 'jovenes@uci.test',
  contactPhone: null,
  meetingInfo: 'Viernes 7:00 p. m.',
  ctaLabel: 'Quiero participar',
  ctaUrl: 'https://uci.test/jovenes',
  featured: true,
  publishedAt: '2026-05-01T10:00:00.000Z',
  updatedAt: '2026-05-02T10:00:00.000Z',
  seo: {
    title: 'Jóvenes | Iglesia UCI',
    description: 'Una comunidad de jóvenes que crece en la fe.',
    canonicalUrl: `${SITE_URL}/ministerios/jovenes`,
    ogImageUrl: null,
  },
};

function jsonLdTypes(payload: { jsonLd: Array<Record<string, unknown>> }): string[] {
  return payload.jsonLd.map((entry) => String(entry['@type']));
}

describe('canonical helpers', () => {
  test('buildCanonicalUrl roots paths and keeps absolute URLs', () => {
    assert.equal(buildCanonicalUrl('https://uci.test/', '/sermones/'), 'https://uci.test/sermones');
    assert.equal(buildCanonicalUrl('https://uci.test', 'sermones'), 'https://uci.test/sermones');
    assert.equal(buildCanonicalUrl('https://uci.test', '/'), 'https://uci.test/');
    assert.equal(
      buildCanonicalUrl('https://uci.test', 'https://cdn.test/x.png'),
      'https://cdn.test/x.png',
    );
  });

  test('buildListCanonical ignores filters and only carries pagination', () => {
    assert.equal(
      buildListCanonical('https://uci.test', '/sermones?search=fe&page=1', 1),
      'https://uci.test/sermones',
    );
    assert.equal(
      buildListCanonical('https://uci.test', '/sermones/', 2),
      'https://uci.test/sermones?page=2',
    );
  });
});

describe('youtubeVideo', () => {
  test('derives a privacy-friendly embed URL from a YouTube provider + id', () => {
    assert.deepEqual(
      youtubeVideo({ provider: 'youtube', externalId: 'abc123', url: null }),
      {
        embedUrl: 'https://www.youtube-nocookie.com/embed/abc123',
        watchUrl: 'https://www.youtube.com/watch?v=abc123',
      },
    );
  });

  test('accepts uppercase provider and youtu.be / watch URLs', () => {
    assert.equal(
      youtubeVideo({ provider: 'YOUTUBE', externalId: null, url: 'https://youtu.be/xyz789' })
        ?.embedUrl,
      'https://www.youtube-nocookie.com/embed/xyz789',
    );
    assert.equal(
      youtubeVideo({
        provider: 'youtube',
        externalId: null,
        url: 'https://www.youtube.com/watch?v=xyz789',
      })?.embedUrl,
      'https://www.youtube-nocookie.com/embed/xyz789',
    );
  });

  test('never embeds a non-YouTube provider and handles a missing video', () => {
    assert.equal(
      youtubeVideo({ provider: 'vimeo', externalId: '1', url: 'https://vimeo.com/1' }),
      null,
    );
    assert.equal(youtubeVideo(null), null);
  });
});

describe('sermon SEO', () => {
  test('emits resolved meta, Article + VideoObject + BreadcrumbList', () => {
    const payload = buildSermonSeo(sermon, {
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
    });

    assert.equal(payload.title, 'La fe que obra | Iglesia UCI');
    assert.equal(payload.description, 'Una fe que se demuestra con obras.');
    assert.equal(payload.canonicalUrl, `${SITE_URL}/sermones/la-fe-que-obra`);
    assert.equal(payload.ogImageUrl, `${SITE_URL}/media/fe.png`);
    assert.deepEqual(jsonLdTypes(payload), [
      'Article',
      'VideoObject',
      'BreadcrumbList',
    ]);

    const article = payload.jsonLd[0]!;
    assert.equal(article.headline, 'La fe que obra');
    assert.deepEqual(article.author, { '@type': 'Person', name: 'Ana Gómez' });
    assert.equal(article.datePublished, sermon.publishedAt);

    const video = payload.jsonLd[1]!;
    assert.equal(video.contentUrl, 'https://www.youtube.com/watch?v=abc123');
    assert.equal(video.embedUrl, 'https://www.youtube-nocookie.com/embed/abc123');
    assert.equal(video.thumbnailUrl, `${SITE_URL}/media/fe.png`);

    const breadcrumbs = payload.jsonLd[2]!;
    assert.deepEqual(
      (breadcrumbs.itemListElement as Array<Record<string, unknown>>).map(
        (crumb) => crumb.name,
      ),
      ['Inicio', 'Sermones', 'La fe que obra'],
    );
  });

  test('does not invent a VideoObject when no YouTube reference exists', () => {
    const payload = buildSermonSeo(
      {
        ...sermon,
        video: { provider: 'vimeo', externalId: '123', url: 'https://vimeo.com/123' },
      },
      { siteUrl: SITE_URL, siteName: SITE_NAME },
    );

    assert.deepEqual(jsonLdTypes(payload), ['Article', 'BreadcrumbList']);
  });

  test('appends the site name only once', () => {
    const payload = buildSermonSeo(
      {
        ...sermon,
        seo: { ...sermon.seo, title: 'La fe que obra | Iglesia UCI' },
      },
      { siteUrl: SITE_URL, siteName: SITE_NAME },
    );
    assert.equal(payload.title, 'La fe que obra | Iglesia UCI');
  });

  test('omits the VideoObject when there is no cover thumbnail', () => {
    const payload = buildSermonSeo(
      {
        ...sermon,
        coverImageUrl: null,
        seo: { ...sermon.seo, ogImageUrl: null },
      },
      { siteUrl: SITE_URL, siteName: SITE_NAME },
    );

    assert.deepEqual(jsonLdTypes(payload), ['Article', 'BreadcrumbList']);
    assert.equal(payload.ogImageUrl, null);
  });
});

describe('event SEO', () => {
  test('emits Event + BreadcrumbList with real dates and place', () => {
    const payload = buildEventSeo(event, {
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
      now: new Date('2026-11-15T00:00:00.000Z'),
    });

    assert.equal(payload.canonicalUrl, `${SITE_URL}/eventos/retiro-de-jovenes`);
    assert.deepEqual(jsonLdTypes(payload), ['Event', 'BreadcrumbList']);
    const structured = payload.jsonLd[0]!;
    assert.equal(structured.name, 'Retiro de jóvenes');
    assert.equal(structured.startDate, event.startAt);
    assert.equal(structured.eventStatus, 'https://schema.org/EventScheduled');
    assert.deepEqual(structured.location, {
      '@type': 'Place',
      name: 'Casa UCI',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Calle 123 #45-67',
        addressLocality: 'Bogotá',
      },
    });
  });

  test('a past event keeps its dates but claims no event status', () => {
    const payload = buildEventSeo(event, {
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
      now: new Date('2027-01-15T00:00:00.000Z'),
    });
    assert.equal(payload.jsonLd[0]!.eventStatus, undefined);
    assert.equal(payload.jsonLd[0]!.startDate, event.startAt);
  });

  test('a dateless event emits only the BreadcrumbList, never an Event', () => {
    const payload = buildEventSeo(
      { ...event, startAt: null, endAt: null },
      { siteUrl: SITE_URL, siteName: SITE_NAME },
    );

    assert.deepEqual(jsonLdTypes(payload), ['BreadcrumbList']);
  });
});

describe('ministry SEO', () => {
  test('emits a BreadcrumbList only, without inventing a schema type', () => {
    const payload = buildMinistrySeo(ministry, {
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
    });
    assert.deepEqual(jsonLdTypes(payload), ['BreadcrumbList']);
    assert.equal(payload.canonicalUrl, `${SITE_URL}/ministerios/jovenes`);
  });
});

describe('sermon archive query parsing', () => {
  test('accepts documented filters and a positive page', () => {
    const parsed = parseSermonFilters(
      new URLSearchParams({
        search: '  fe ',
        preacher: 'Ana',
        from: '2026-01-01',
        to: '2026-12-31',
        page: '3',
      }),
    );
    assert.deepEqual(parsed.filters, {
      search: 'fe',
      preacher: 'Ana',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    assert.equal(parsed.page, 3);
    assert.equal(parsed.hasFilters, true);
  });

  test('ignores malformed dates, empty filters and invalid pages', () => {
    const parsed = parseSermonFilters(
      new URLSearchParams({ from: 'not-a-date', to: '2026-13-99', page: '-2', search: '   ' }),
    );
    assert.deepEqual(parsed.filters, {});
    assert.equal(parsed.page, 1);
    assert.equal(parsed.hasFilters, false);
  });

  test('caps huge page values so the API never receives an absurd offset', () => {
    assert.equal(parsePage('999999999999999999999'), 1);
    assert.equal(parsePage('10001'), 1);
    assert.equal(parsePage(String(MAX_ARCHIVE_PAGE)), MAX_ARCHIVE_PAGE);
    assert.equal(parsePage('0'), 1);
    assert.equal(parsePage('1e3'), 1);
    assert.equal(parsePage('2.5'), 1);
    assert.equal(parsePage('3'), 3);
    assert.equal(parsePage(null), 1);
  });

  test('buildArchiveHref preserves filters and only exposes page > 1', () => {
    const search = new URLSearchParams({ search: 'fe', preacher: 'Ana', page: '2' });
    assert.equal(
      buildArchiveHref('/sermones', search, 1),
      '/sermones?search=fe&preacher=Ana',
    );
    assert.equal(
      buildArchiveHref('/sermones', new URLSearchParams(), 3),
      '/sermones?page=3',
    );
  });
});

describe('church-local formatting', () => {
  test('sermon dates keep their calendar day and event instants use Bogotá time', async () => {
    const { formatSermonDate, formatEventDateTime } = await import(
      '@web/lib/format'
    );

    assert.equal(
      formatSermonDate('2026-04-12T00:00:00.000Z'),
      '12 de abril de 2026',
    );
    assert.equal(
      formatEventDateTime('2026-12-10T15:00:00.000Z'),
      '10 de diciembre de 2026, 10:00',
    );
  });

  test('missing or malformed dates format to null instead of inventing a day', async () => {
    const { formatSermonDate, formatEventDateTime } = await import(
      '@web/lib/format'
    );
    assert.equal(formatSermonDate(null), null);
    assert.equal(formatSermonDate('not-a-date'), null);
    assert.equal(formatEventDateTime(null), null);
  });
});
