/**
 * Phase 9B2 — CMS page rendering + SEO helpers.
 *
 * The dynamic `/{slug}` route trusts neither the stored JSON nor arbitrary
 * URLs: `normalizePageContent` reduces content to a closed set of safe blocks,
 * and `buildPageSeo` produces the head/JSON-LD from the resolved public DTO.
 * These pure rules are asserted without a running API or Astro server.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PublicPageDetailDto } from '@shared/cms';
import {
  isSafeLinkHref,
  normalizePageContent,
} from '@web/lib/page-content';
import { buildPageSeo, buildStaticPageJsonLd } from '@web/lib/seo';

const SITE_URL = 'https://uci.test';
const SITE_NAME = 'Iglesia UCI';

const page: PublicPageDetailDto = {
  id: 'page-1',
  slug: 'nosotros',
  title: 'Nosotros',
  excerpt: 'Conoce nuestra historia.',
  content: null,
  coverImageUrl: '/media/iglesia.jpg',
  coverImageAlt: 'Iglesia UCI reunida',
  publishedAt: '2026-01-10T10:00:00.000Z',
  updatedAt: '2026-02-11T10:00:00.000Z',
  seo: {
    title: 'Nosotros | Iglesia UCI',
    description: 'Quiénes somos y qué creemos.',
    canonicalUrl: `${SITE_URL}/nosotros`,
    ogImageUrl: `${SITE_URL}/media/iglesia.jpg`,
  },
};

function jsonLdTypes(payload: { jsonLd: Array<Record<string, unknown>> }): string[] {
  return payload.jsonLd.map((entry) => String(entry['@type']));
}

describe('safe page content', () => {
  test('maps the documented block contract to safe display blocks', () => {
    const blocks = normalizePageContent({
      blocks: [
        { type: 'heading', text: ' Bienvenido ', level: 3 },
        { type: 'paragraph', text: 'Un párrafo.' },
        { type: 'list', ordered: true, items: ['Uno', 'Dos'] },
        { type: 'quote', text: 'Cita', cite: 'Referencia' },
        { type: 'cta', label: 'Conócenos', href: '/nosotros' },
        { type: 'image', src: '/media/foto.jpg', alt: 'Foto' },
      ],
    });

    assert.deepEqual(blocks, [
      { type: 'heading', level: 3, text: 'Bienvenido' },
      { type: 'paragraph', text: 'Un párrafo.' },
      { type: 'list', ordered: true, items: ['Uno', 'Dos'] },
      { type: 'quote', text: 'Cita', cite: 'Referencia' },
      { type: 'cta', label: 'Conócenos', href: '/nosotros', external: false },
      { type: 'image', src: '/media/foto.jpg', alt: 'Foto' },
    ]);
  });

  test('drops unknown block types and unsafe URLs', () => {
    const blocks = normalizePageContent({
      blocks: [
        { type: 'html', text: '<script>alert(1)</script>' },
        { type: 'cta', label: 'Malicioso', href: 'javascript:alert(1)' },
        { type: 'cta', label: 'Protocolo relativo', href: '//evil.test/x' },
        { type: 'image', src: 'data:image/svg+xml,<svg/>', alt: 'x' },
        { type: 'cta', label: 'Correo', href: 'mailto:hola@uci.test' },
        { type: 'cta', label: 'Externo', href: 'https://uci.test/x' },
        { type: 'paragraph', text: 'Texto seguro' },
      ],
    });

    assert.deepEqual(blocks, [
      {
        type: 'cta',
        label: 'Correo',
        href: 'mailto:hola@uci.test',
        external: false,
      },
      {
        type: 'cta',
        label: 'Externo',
        href: 'https://uci.test/x',
        external: true,
      },
      { type: 'paragraph', text: 'Texto seguro' },
    ]);
  });

  test('supports a sections shape without becoming a page builder', () => {
    const blocks = normalizePageContent({
      sections: [
        {
          heading: 'Nuestra historia',
          paragraphs: ['Primer párrafo.', 'Segundo párrafo.'],
          items: ['Dato uno', 'Dato dos'],
        },
      ],
    });

    assert.deepEqual(blocks, [
      { type: 'heading', level: 2, text: 'Nuestra historia' },
      { type: 'paragraph', text: 'Primer párrafo.' },
      { type: 'paragraph', text: 'Segundo párrafo.' },
      {
        type: 'list',
        ordered: false,
        items: ['Dato uno', 'Dato dos'],
      },
    ]);
  });

  test('never renders raw HTML keys and handles empty content honestly', () => {
    assert.deepEqual(
      normalizePageContent({ html: '<h1>Inyectado</h1>' }),
      [],
    );
    assert.deepEqual(normalizePageContent(null), []);
    assert.deepEqual(normalizePageContent({}), []);
  });

  test('accepts only root-relative and explicitly safe protocols', () => {
    assert.equal(isSafeLinkHref('/nosotros'), true);
    assert.equal(isSafeLinkHref('https://uci.test'), true);
    assert.equal(isSafeLinkHref('mailto:hola@uci.test'), true);
    assert.equal(isSafeLinkHref('tel:+573001234567'), true);
    assert.equal(isSafeLinkHref('javascript:alert(1)'), false);
    assert.equal(isSafeLinkHref('data:text/html,x'), false);
    assert.equal(isSafeLinkHref('//evil.test'), false);
    assert.equal(isSafeLinkHref(''), false);
  });
});

describe('CMS page SEO', () => {
  test('emits WebPage + BreadcrumbList and resolved meta', () => {
    const payload = buildPageSeo(page, {
      siteUrl: SITE_URL,
      siteName: SITE_NAME,
    });

    assert.equal(payload.title, 'Nosotros | Iglesia UCI');
    assert.equal(payload.description, 'Quiénes somos y qué creemos.');
    assert.equal(payload.canonicalUrl, `${SITE_URL}/nosotros`);
    assert.equal(payload.ogImageUrl, `${SITE_URL}/media/iglesia.jpg`);
    assert.deepEqual(jsonLdTypes(payload), ['WebPage', 'BreadcrumbList']);

    const webPage = payload.jsonLd[0]!;
    assert.equal(webPage.name, 'Nosotros');
    assert.equal(webPage.datePublished, page.publishedAt);
    assert.equal(webPage.dateModified, page.updatedAt);

    const breadcrumbs = payload.jsonLd[1]!;
    assert.deepEqual(
      (breadcrumbs.itemListElement as Array<Record<string, unknown>>).map(
        (crumb) => crumb.name,
      ),
      ['Inicio', 'Nosotros'],
    );
  });

  test('falls back to the slug route when the canonical is missing', () => {
    const payload = buildPageSeo(
      {
        ...page,
        seo: { ...page.seo, canonicalUrl: '' },
      },
      { siteUrl: SITE_URL, siteName: SITE_NAME },
    );
    assert.equal(payload.canonicalUrl, `${SITE_URL}/nosotros`);
  });

  test('static institutional pages emit a WebPage and a top-level trail', () => {
    const jsonLd = buildStaticPageJsonLd({
      name: 'Contacto',
      description: 'Escríbenos.',
      path: '/contacto',
      siteUrl: SITE_URL,
    });

    assert.deepEqual(
      jsonLd.map((entry) => entry['@type']),
      ['WebPage', 'BreadcrumbList'],
    );
    assert.equal(jsonLd[0]!.url, `${SITE_URL}/contacto`);
  });
});
