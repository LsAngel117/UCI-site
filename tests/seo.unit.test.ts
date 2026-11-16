/**
 * Phase 8 — pure SEO assembly unit suite (docs/10 §6–§12).
 *
 * `buildSeo` is a deterministic, database-free function so the whole payload
 * (title, description, canonical, Open Graph, robots, breadcrumbs and
 * Schema.org JSON-LD) can be asserted without a server. The sitemap renderer
 * and robots text are pure too, so their exact output is pinned here.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SiteSeoConfig } from '@shared/seo';
import {
  buildCanonicalUrl,
  buildListCanonical,
  buildSeo,
} from '@server/seo/build';
import { buildRobotsTxt } from '@server/seo/robots';
import { isReservedSitemapSlug, renderSitemap } from '@server/seo/sitemap';

const site: SiteSeoConfig = {
  siteUrl: 'https://uci.test',
  siteName: 'Iglesia UCI',
  defaultTitle: 'Iglesia UCI — Inicio',
  defaultDescription: 'Sitio oficial de Iglesia UCI.',
  defaultOgImage: 'https://uci.test/og-default.png',
  robotsDefault: true,
  logoUrl: 'https://uci.test/logo.png',
};

function jsonLdTypes(payload: ReturnType<typeof buildSeo>): string[] {
  return payload.jsonLd.map((entry) => String(entry['@type']));
}

describe('buildSeo', () => {
  test('home emits Organization + WebSite, site defaults and an indexable base canonical', () => {
    const payload = buildSeo('home', { title: '', description: null }, site);

    assert.equal(payload.title, 'Iglesia UCI — Inicio');
    assert.equal(payload.description, 'Sitio oficial de Iglesia UCI.');
    assert.equal(payload.canonicalUrl, 'https://uci.test/');
    assert.equal(payload.openGraph.type, 'website');
    assert.equal(payload.openGraph.url, 'https://uci.test/');
    assert.equal(payload.openGraph.image, 'https://uci.test/og-default.png');
    assert.equal(payload.openGraph.siteName, 'Iglesia UCI');
    assert.deepEqual(payload.robots, { index: true, follow: true });
    assert.deepEqual(payload.breadcrumbs, []);
    assert.deepEqual(jsonLdTypes(payload), ['Organization', 'WebSite']);
  });

  test('page builds a WebPage, a BreadcrumbList and absolute canonical/OG URLs', () => {
    const payload = buildSeo(
      'page',
      {
        title: 'Nosotros',
        slug: 'nosotros',
        excerpt: 'Conocé nuestra historia.',
        coverImageUrl: '/media/nosotros.png',
        updatedAt: '2026-01-02T03:04:05.000Z',
      },
      site,
    );

    assert.equal(payload.title, 'Nosotros | Iglesia UCI');
    assert.equal(payload.description, 'Conocé nuestra historia.');
    assert.equal(payload.canonicalUrl, 'https://uci.test/nosotros');
    assert.equal(payload.openGraph.title, 'Nosotros | Iglesia UCI');
    assert.equal(payload.openGraph.type, 'article');
    assert.equal(payload.openGraph.image, 'https://uci.test/media/nosotros.png');
    assert.deepEqual(payload.robots, { index: true, follow: true });
    assert.deepEqual(
      payload.breadcrumbs.map((crumb) => crumb.name),
      ['Inicio', 'Nosotros'],
    );
    assert.deepEqual(
      payload.breadcrumbs.map((crumb) => crumb.url),
      ['https://uci.test/', 'https://uci.test/nosotros'],
    );
    assert.deepEqual(jsonLdTypes(payload), ['WebPage', 'BreadcrumbList']);
    const webPage = payload.jsonLd[0]!;
    assert.equal(webPage.url, 'https://uci.test/nosotros');
    const breadcrumbList = payload.jsonLd[1]!;
    assert.equal(
      (breadcrumbList.itemListElement as unknown[]).length,
      payload.breadcrumbs.length,
    );
  });

  test('explicit SeoMetadata overrides win verbatim and noindex suppresses indexation', () => {
    const payload = buildSeo(
      'page',
      {
        title: 'Nosotros',
        slug: 'nosotros',
        seo: {
          title: 'Nuestra identidad | UCI',
          description: 'Descripción editorial.',
          canonicalUrl: 'https://uci.test/quienes-somos',
          ogImageUrl: 'https://cdn.test/og.png',
        },
        noindex: true,
      },
      site,
    );

    assert.equal(payload.title, 'Nuestra identidad | UCI');
    assert.equal(payload.description, 'Descripción editorial.');
    assert.equal(payload.canonicalUrl, 'https://uci.test/quienes-somos');
    assert.equal(payload.openGraph.image, 'https://cdn.test/og.png');
    assert.deepEqual(payload.robots, { index: false, follow: false });
    assert.deepEqual(payload.breadcrumbs.map((crumb) => crumb.url), [
      'https://uci.test/',
      'https://uci.test/quienes-somos',
    ]);
  });

  test('site-wide robotsDefault=false makes every payload noindex', () => {
    const payload = buildSeo(
      'page',
      { title: 'Contacto', slug: 'contacto' },
      { ...site, robotsDefault: false },
    );
    assert.deepEqual(payload.robots, { index: false, follow: true });
  });

  test('sermon emits Article + VideoObject + BreadcrumbList when it has a video', () => {
    const payload = buildSeo(
      'sermon',
      {
        title: 'Obediencia y fe',
        slug: 'obediencia-y-fe',
        description: 'Sermón dominical.',
        coverImageUrl: '/media/sermon.png',
        publishedAt: '2026-02-01T10:00:00.000Z',
        updatedAt: '2026-02-02T10:00:00.000Z',
        preacherName: 'Juan Pérez',
        video: { url: 'https://youtu.be/abc123', provider: 'youtube' },
      },
      site,
    );

    assert.equal(payload.canonicalUrl, 'https://uci.test/sermones/obediencia-y-fe');
    assert.deepEqual(
      payload.breadcrumbs.map((crumb) => crumb.name),
      ['Inicio', 'Sermones', 'Obediencia y fe'],
    );
    assert.deepEqual(jsonLdTypes(payload), [
      'Article',
      'VideoObject',
      'BreadcrumbList',
    ]);
    const article = payload.jsonLd[0]!;
    assert.equal(article.headline, 'Obediencia y fe');
    assert.deepEqual(article.author, { '@type': 'Person', name: 'Juan Pérez' });
    const video = payload.jsonLd[1]!;
    assert.equal(video.contentUrl, 'https://youtu.be/abc123');
    assert.equal(video.thumbnailUrl, 'https://uci.test/media/sermon.png');
  });

  test('sermon without a video emits no VideoObject', () => {
    const payload = buildSeo(
      'sermon',
      { title: 'Solo audio', slug: 'solo-audio' },
      site,
    );
    assert.deepEqual(jsonLdTypes(payload), ['Article', 'BreadcrumbList']);
  });

  test('sermon derives a YouTube URL from provider + externalId when url is absent', () => {
    const payload = buildSeo(
      'sermon',
      {
        title: 'Fe viva',
        slug: 'fe-viva',
        video: { url: null, provider: 'youtube', externalId: 'abc123' },
      },
      site,
    );

    assert.deepEqual(jsonLdTypes(payload), [
      'Article',
      'VideoObject',
      'BreadcrumbList',
    ]);
    const video = payload.jsonLd[1]!;
    assert.equal(video.contentUrl, 'https://www.youtube.com/watch?v=abc123');
    assert.equal(video.embedUrl, 'https://www.youtube.com/watch?v=abc123');
  });

  test('sermon emits no VideoObject when no URL can be derived', () => {
    const payload = buildSeo(
      'sermon',
      {
        title: 'Sin fuente',
        slug: 'sin-fuente',
        video: { url: null, provider: 'vimeo', externalId: 'abc123' },
      },
      site,
    );
    assert.deepEqual(jsonLdTypes(payload), ['Article', 'BreadcrumbList']);
  });

  test('event emits Event structured data with location and dates', () => {
    const payload = buildSeo(
      'event',
      {
        title: 'Retiro de jóvenes',
        slug: 'retiro-jovenes',
        summary: 'Un fin de semana juntos.',
        startAt: '2026-03-10T18:00:00.000Z',
        endAt: '2026-03-12T18:00:00.000Z',
        locationName: 'Templo UCI',
        address: 'Av. Siempre Viva 123',
        city: 'Buenos Aires',
      },
      site,
      new Date('2026-03-01T00:00:00.000Z'),
    );

    assert.equal(payload.canonicalUrl, 'https://uci.test/eventos/retiro-jovenes');
    assert.deepEqual(jsonLdTypes(payload), ['Event', 'BreadcrumbList']);
    const event = payload.jsonLd[0]!;
    assert.equal(event.name, 'Retiro de jóvenes');
    assert.equal(event.startDate, '2026-03-10T18:00:00.000Z');
    assert.equal(event.eventStatus, 'https://schema.org/EventScheduled');
    assert.deepEqual(event.location, {
      '@type': 'Place',
      name: 'Templo UCI',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Av. Siempre Viva 123',
        addressLocality: 'Buenos Aires',
      },
    });
  });

  test('event without valid dates emits no eventStatus', () => {
    const payload = buildSeo(
      'event',
      { title: 'Sin fecha', slug: 'sin-fecha' },
      site,
      new Date('2026-03-01T00:00:00.000Z'),
    );

    assert.deepEqual(jsonLdTypes(payload), ['Event', 'BreadcrumbList']);
    const event = payload.jsonLd[0]!;
    assert.equal(event.startDate, undefined);
    assert.equal(event.endDate, undefined);
    assert.equal(event.eventStatus, undefined);
  });

  test('event that already passed emits no eventStatus', () => {
    const payload = buildSeo(
      'event',
      {
        title: 'Evento pasado',
        slug: 'evento-pasado',
        startAt: '2026-01-10T18:00:00.000Z',
        endAt: '2026-01-12T18:00:00.000Z',
      },
      site,
      new Date('2026-03-01T00:00:00.000Z'),
    );

    const event = payload.jsonLd[0]!;
    assert.equal(event.startDate, '2026-01-10T18:00:00.000Z');
    assert.equal(event.eventStatus, undefined);
  });

  test('event with malformed dates emits no eventStatus', () => {
    const payload = buildSeo(
      'event',
      { title: 'Fecha corrupta', slug: 'fecha-corrupta', startAt: 'no-es-fecha' },
      site,
      new Date('2026-03-01T00:00:00.000Z'),
    );

    const event = payload.jsonLd[0]!;
    assert.equal(event.startDate, undefined);
    assert.equal(event.eventStatus, undefined);
  });

  test('ministry emits a breadcrumb list only (no invented schema type)', () => {
    const payload = buildSeo(
      'ministry',
      {
        title: 'Jóvenes',
        slug: 'jovenes',
        shortDescription: 'Encuentros de jóvenes.',
      },
      site,
    );

    assert.equal(payload.canonicalUrl, 'https://uci.test/ministerios/jovenes');
    assert.deepEqual(jsonLdTypes(payload), ['BreadcrumbList']);
    assert.deepEqual(
      payload.breadcrumbs.map((crumb) => crumb.name),
      ['Inicio', 'Ministerios', 'Jóvenes'],
    );
  });
});

describe('canonical helpers', () => {
  test('buildCanonicalUrl normalizes slashes and leaves absolute URLs untouched', () => {
    assert.equal(buildCanonicalUrl('https://uci.test/', '/nosotros/'), 'https://uci.test/nosotros');
    assert.equal(buildCanonicalUrl('https://uci.test', 'nosotros'), 'https://uci.test/nosotros');
    assert.equal(buildCanonicalUrl('https://uci.test', '/'), 'https://uci.test/');
    assert.equal(
      buildCanonicalUrl('https://uci.test', 'https://cdn.test/x'),
      'https://cdn.test/x',
    );
  });

  test('buildListCanonical keeps page 1 on the base URL and ignores filter/sort params', () => {
    assert.equal(
      buildListCanonical('https://uci.test', '/sermones?tema=oracion&page=1', 1),
      'https://uci.test/sermones',
    );
    assert.equal(
      buildListCanonical('https://uci.test', '/sermones/', 2),
      'https://uci.test/sermones?page=2',
    );
    assert.equal(
      buildListCanonical('https://uci.test', '/sermones', 0),
      'https://uci.test/sermones',
    );
  });
});

describe('robots.txt', () => {
  test('disallows admin, panel, api and preview and points at the sitemap', () => {
    assert.equal(
      buildRobotsTxt('https://uci.test'),
      [
        'User-agent: *',
        'Disallow: /admin',
        'Disallow: /panel',
        'Disallow: /api',
        'Disallow: /preview',
        '',
        'Sitemap: https://uci.test/sitemap.xml',
        '',
      ].join('\n'),
    );
  });
});

describe('sitemap rendering', () => {
  test('escapes XML entities and emits loc + lastmod entries', () => {
    const xml = renderSitemap([
      { loc: 'https://uci.test/?a=1&b=2' },
      {
        loc: 'https://uci.test/sermones/fe',
        lastmod: '2026-02-01T10:00:00.000Z',
      },
    ]);

    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(
      xml,
      /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/,
    );
    assert.match(xml, /<loc>https:\/\/uci\.test\/\?a=1&amp;b=2<\/loc>/);
    assert.match(
      xml,
      /<loc>https:\/\/uci\.test\/sermones\/fe<\/loc><lastmod>2026-02-01T10:00:00\.000Z<\/lastmod>/,
    );
  });

  test('reserved technical and public section slugs are excluded', () => {
    for (const slug of [
      'admin',
      'panel',
      'api',
      'preview',
      'login',
      'sermones',
      'eventos',
      'ministerios',
      'soy-nuevo',
      'contacto',
    ]) {
      assert.equal(isReservedSitemapSlug(slug), true, slug);
    }
    // `/nosotros` is an institutional page managed by the Pages module, so it
    // is a real content route and must appear in the sitemap.
    for (const slug of ['nosotros', 'quienes-somos', 'jovenes', 'historia']) {
      assert.equal(isReservedSitemapSlug(slug), false, slug);
    }
  });
});
