/**
 * Phase 12C — static accessibility audit (docs/13, docs/15 §18.8).
 *
 * No browser/Playwright/axe is installed, so this suite renders the real SSR
 * site (built `dist/server/entry.mjs`) against the real Fastify API and audits
 * the returned HTML with dependency-free checks:
 *
 *   - a document language and exactly one `<h1>`, with no skipped levels;
 *   - every `<img>` has an `alt`; decorative images are hidden;
 *   - every form control has an associated label;
 *   - every link/button exposes an accessible name;
 *   - the public pages keep the skip link, a global focus ring and a
 *     `prefers-reduced-motion` fallback.
 *
 * The admin panel is a client-rendered SPA, so its login route is audited at
 * the source level (one h1, labelled inputs) plus the served shell (lang,
 * noindex) and its compiled stylesheet (focus/reduced-motion).
 *
 * Skipped when `DATABASE_URL` or the production build is absent.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST_SERVER = join(ROOT, 'dist/server/entry.mjs');
const DIST_ADMIN = join(ROOT, 'dist/admin/index.html');
const HAS_DB = Boolean(process.env.DATABASE_URL);
const HAS_BUILD = existsSync(DIST_SERVER);
const RUN_SERVER_SUITE = HAS_DB && HAS_BUILD;
const HAS_ADMIN_BUILD = existsSync(DIST_ADMIN);

const SERMON_SLUG = 'a11y-static-fixture-sermon';

type Attrs = Record<string, string>;

interface RawTag {
  name: string;
  attrs: Attrs;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

/** Parse a raw attribute string into a lowercase-keyed record. */
function parseAttrs(raw: string): Attrs {
  const attrs: Attrs = {};
  const pattern =
    /([^\s/>"'=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const name = match[1]?.toLowerCase();
    if (!name || name === '/') continue;
    attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function tags(html: string, name: string): RawTag[] {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  const result: RawTag[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    result.push({ name, attrs: parseAttrs(match[1] ?? '') });
  }
  return result;
}

/** Remove comments and raw-text elements that must not be audited as markup. */
function auditHtmlSource(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '');
}

function textOf(fragment: string): string {
  return decodeEntities(fragment.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function imageAltText(fragment: string): string {
  return tags(fragment, 'img')
    .map((tag) => tag.attrs.alt ?? '')
    .filter((alt) => alt.trim().length > 0)
    .join(' ')
    .trim();
}

function elementById(html: string, id: string): string | null {
  const pattern = new RegExp(
    `<([a-z0-9-]+)\\b[^>]*\\bid="${escapeRegExp(id)}"[^>]*>([\\s\\S]*?)</\\1>`,
    'i',
  );
  const match = pattern.exec(html);
  return match?.[2] ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function accessibleName(
  tag: RawTag,
  inner: string,
  html: string,
): string {
  const labelledBy = tag.attrs['aria-labelledby'];
  if (labelledBy) {
    const label = labelledBy
      .split(/\s+/)
      .map((id) => elementById(html, id))
      .filter((value): value is string => value !== null)
      .map(textOf)
      .join(' ')
      .trim();
    if (label) return label;
  }

  const explicit = tag.attrs['aria-label'] ?? tag.attrs.title ?? '';
  if (explicit.trim()) return explicit.trim();

  const text = textOf(inner);
  if (text) return text;

  return imageAltText(inner);
}

function interactiveElements(
  html: string,
  name: 'a' | 'button',
): Array<RawTag & { inner: string }> {
  const pattern = new RegExp(`<${name}\\b([^>]*)>`, 'gi');
  const result: Array<RawTag & { inner: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const start = match.index + match[0].length;
    const close = html.toLowerCase().indexOf(`</${name}>`, start);
    const inner = close === -1 ? '' : html.slice(start, close);
    result.push({
      name,
      attrs: parseAttrs(match[1] ?? ''),
      inner,
    });
  }
  return result;
}

function stylesheetHrefs(html: string): string[] {
  return tags(html, 'link')
    .filter((tag) => (tag.attrs.rel ?? '').includes('stylesheet'))
    .map((tag) => tag.attrs.href ?? '')
    .filter((href) => href.length > 0);
}

function auditStaticHtml(html: string, label: string): string[] {
  const source = auditHtmlSource(html);
  const issues: string[] = [];

  if (!/<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(source)) {
    issues.push(`${label}: <html> is missing a lang attribute`);
  }

  const headings = [
    ...source.matchAll(/<h([1-6])\b/gi),
  ].map((match) => Number(match[1]));
  const h1Count = headings.filter((level) => level === 1).length;
  if (h1Count !== 1) {
    issues.push(`${label}: expected exactly one <h1>, found ${h1Count}`);
  }
  if (headings.length > 0 && headings[0] !== 1) {
    issues.push(`${label}: the first heading must be an <h1>`);
  }
  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1] ?? 1;
    const current = headings[index] ?? 1;
    if (current > previous + 1) {
      issues.push(
        `${label}: heading hierarchy skips h${previous} → h${current}`,
      );
    }
  }

  for (const image of tags(source, 'img')) {
    if (!('alt' in image.attrs)) {
      issues.push(`${label}: <img> is missing alt (${image.attrs.src ?? '?'})`);
      continue;
    }
    if (image.attrs.alt === '' && image.attrs['aria-hidden'] !== 'true') {
      issues.push(
        `${label}: decorative <img> must be aria-hidden (${image.attrs.src ?? '?'})`,
      );
    }
  }

  const labelForIds = new Set(
    tags(source, 'label')
      .map((tag) => tag.attrs.for)
      .filter((value): value is string => Boolean(value)),
  );
  for (const tagName of ['input', 'select', 'textarea'] as const) {
    for (const control of tags(source, tagName)) {
      const type = (control.attrs.type ?? '').toLowerCase();
      if (
        tagName === 'input' &&
        ['hidden', 'submit', 'button', 'reset', 'image'].includes(type)
      ) {
        continue;
      }
      const id = control.attrs.id;
      const labelled =
        Boolean(control.attrs['aria-label']?.trim()) ||
        Boolean(control.attrs['aria-labelledby']?.trim()) ||
        (id !== undefined && labelForIds.has(id));
      if (!labelled) {
        issues.push(
          `${label}: ${tagName}${id ? `#${id}` : ''} has no associated label`,
        );
      }
    }
  }

  for (const link of interactiveElements(source, 'a')) {
    if (!accessibleName(link, link.inner, source)) {
      issues.push(
        `${label}: <a href="${link.attrs.href ?? '?'}"> has no accessible name`,
      );
    }
  }
  for (const button of interactiveElements(source, 'button')) {
    if (!accessibleName(button, button.inner, source)) {
      issues.push(`${label}: <button> has no accessible name`);
    }
  }

  const skipLink = interactiveElements(source, 'a').find((link) =>
    (link.attrs.class ?? '').split(/\s+/).includes('skip-link'),
  );
  if (!skipLink) {
    issues.push(`${label}: missing skip link`);
  } else {
    const target = skipLink.attrs.href ?? '';
    if (!target.startsWith('#')) {
      issues.push(`${label}: skip link must target an in-page id`);
    } else {
      const id = target.slice(1);
      if (!new RegExp(`\\bid="${escapeRegExp(id)}"`, 'i').test(source)) {
        issues.push(`${label}: skip link target #${id} does not exist`);
      }
    }
  }

  return issues;
}

function assertNoIssues(html: string, label: string): void {
  assert.deepEqual(auditStaticHtml(html, label), [], `${label} a11y audit`);
}

async function fetchText(url: string): Promise<{
  status: number;
  headers: Headers;
  text: string;
}> {
  const response = await fetch(url, { redirect: 'manual' });
  return {
    status: response.status,
    headers: response.headers,
    text: await response.text(),
  };
}

function contentType(response: Headers): string {
  return response.get('content-type') ?? '';
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not allocate a port')));
      }
    });
  });
}

async function waitForUrl(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        await response.arrayBuffer();
        return;
      }
      lastError = new Error(`${url} responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for ${url}`);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

describe('admin login source accessibility', () => {
  const source = readFileSync(
    join(ROOT, 'src/admin/src/pages/LoginPage.tsx'),
    'utf8',
  );

  test('renders one h1 and a labelled control for every input', () => {
    const h1s = source.match(/<h1\b/g) ?? [];
    assert.equal(h1s.length, 1, 'the login route must own exactly one h1');

    const inputs = [...source.matchAll(/<input\b([\s\S]*?)\/>/g)];
    assert.ok(inputs.length >= 2, 'expected email and password inputs');

    for (const [, raw] of inputs) {
      const attrs = parseAttrs(raw ?? '');
      const id = attrs.id;
      assert.ok(id, 'every login input needs a stable id');
      assert.match(
        source,
        new RegExp(`<label\\b[^>]*htmlFor=["']${escapeRegExp(id!)}["']`),
        `input #${id} must have a matching <label htmlFor>`,
      );
    }

    assert.deepEqual(
      source.match(/<img\b/g) ?? [],
      [],
      'the login route does not need images',
    );
  });
});

describe(
  'rendered public pages accessibility (requires DATABASE_URL + build)',
  { skip: RUN_SERVER_SUITE ? false : 'DATABASE_URL or dist/server build is absent' },
  () => {
    let api: FastifyInstance | null = null;
    let prisma: PrismaClient | null = null;
    let astro: ChildProcess | null = null;
    let astroOutput = '';
    let apiBase = '';
    let siteBase = '';
    let mediaRoot = '';

    before(async () => {
      const [{ buildServer }, { loadConfig }, database] = await Promise.all([
        import('@server/app'),
        import('@server/config'),
        import('@server/db'),
      ]);
      const db = database.prisma;
      prisma = db;

      mediaRoot = await mkdtemp(join(tmpdir(), 'uci-a11y-media-'));
      await writeFile(join(mediaRoot, 'fixture.txt'), 'fixture');

      const apiPort = await getFreePort();
      const astroPort = await getFreePort();
      apiBase = `http://127.0.0.1:${apiPort}`;
      siteBase = `http://127.0.0.1:${astroPort}`;

      const config = loadConfig({
        ...process.env,
        NODE_ENV: 'test',
        SITE_URL: siteBase,
        MEDIA_ROOT: mediaRoot,
      });
      api = buildServer({ logger: false, config });
      await api.listen({ host: '127.0.0.1', port: apiPort });

      await db.sermon.deleteMany({ where: { slug: SERMON_SLUG } });
      await db.sermon.create({
        data: {
          slug: SERMON_SLUG,
          title: 'Sermón de auditoría accesible',
          description: 'Un mensaje de prueba para la auditoría estática.',
          scriptureReference: 'Santiago 1:22',
          scriptureText: 'Poned por obra la palabra.',
          preacherName: 'Equipo UCI',
          sermonDate: new Date('2026-01-04T15:00:00.000Z'),
          status: 'published',
          publishedAt: new Date('2026-01-05T15:00:00.000Z'),
        },
      });

      astro = spawn(process.execPath, [DIST_SERVER], {
        cwd: ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: String(astroPort),
          API_BASE_URL: apiBase,
          SITE_URL: siteBase,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      astro.stdout?.on('data', (chunk: Buffer) => {
        astroOutput += chunk.toString();
      });
      astro.stderr?.on('data', (chunk: Buffer) => {
        astroOutput += chunk.toString();
      });
      astro.once('exit', (code) => {
        if (code !== null && code !== 0) {
          astroOutput += `\nAstro server exited with code ${code}`;
        }
      });

      await waitForUrl(`${siteBase}/`);
    });

    after(async () => {
      if (astro !== null && astro.exitCode === null) {
        astro.kill('SIGTERM');
        await Promise.race([once(astro, 'exit'), delay(5_000)]);
        if (astro.exitCode === null) astro.kill('SIGKILL');
      }
      await api?.close();
      if (prisma !== null) {
        await prisma.sermon.deleteMany({ where: { slug: SERMON_SLUG } });
        await prisma.$disconnect();
      }
      if (mediaRoot) await rm(mediaRoot, { recursive: true, force: true });
    });

    test('public HTML is revalidated and hashed assets are immutable', async () => {
      const home = await fetchText(`${siteBase}/`);
      assert.equal(home.status, 200, astroOutput);
      assert.match(contentType(home.headers), /text\/html/);
      assert.match(
        home.headers.get('cache-control') ?? '',
        /no-cache/,
        'HTML must be revalidated by the browser',
      );
      assert.match(home.headers.get('cache-control') ?? '', /must-revalidate/);

      const stylesheet = stylesheetHrefs(home.text)[0];
      assert.ok(stylesheet, 'the homepage must link its compiled stylesheet');
      const cssUrl = new URL(stylesheet!, `${siteBase}/`).href;
      const css = await fetchText(cssUrl);
      assert.equal(css.status, 200);
      assert.match(
        css.headers.get('cache-control') ?? '',
        /public,\s*max-age=31536000,\s*immutable/,
      );
    });

    test('key public pages pass the static a11y audit', async () => {
      const pages = [
        ['home', '/'],
        ['sermons', '/sermones'],
        ['sermon detail', `/sermones/${SERMON_SLUG}`],
        ['events', '/eventos'],
        ['ministries', '/ministerios'],
        ['contact', '/contacto'],
        ['newcomer', '/soy-nuevo'],
      ] as const;

      for (const [label, path] of pages) {
        const page = await fetchText(`${siteBase}${path}`);
        assert.equal(page.status, 200, `${label}: ${astroOutput}`);
        assertNoIssues(page.text, label);
      }
    });

    test('the compiled stylesheet keeps global focus and reduced-motion rules', async () => {
      const home = await fetchText(`${siteBase}/`);
      const stylesheet = stylesheetHrefs(home.text)[0];
      assert.ok(stylesheet);
      const css = await fetchText(new URL(stylesheet!, `${siteBase}/`).href);
      assert.match(css.text, /:focus-visible/, 'global focus ring is required');
      assert.match(
        css.text,
        /prefers-reduced-motion:\s*reduce/,
        'reduced-motion fallback is required',
      );
    });

    test('private API responses are not cacheable', async () => {
      const response = await fetch(`${apiBase}/api/v1/auth/me`);
      assert.equal(response.status, 401);
      assert.match(
        response.headers.get('cache-control') ?? '',
        /no-store/,
        'authenticated API responses must not be stored',
      );
    });

    test('public media is served with an explicit shared-cache window', async () => {
      const response = await fetch(`${apiBase}/media/fixture.txt`);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get('cache-control') ?? '',
        /public/,
      );
      assert.match(response.headers.get('cache-control') ?? '', /max-age=/);
      assert.match(response.headers.get('cache-control') ?? '', /immutable/);
    });

    test(
      'the panel login shell keeps lang, noindex and an accessible stylesheet',
      { skip: HAS_ADMIN_BUILD ? false : 'dist/admin build is absent' },
      async () => {
        const shell = await fetchText(`${apiBase}/panel/login`);
        assert.equal(shell.status, 200);
        assert.match(shell.text, /<html\b[^>]*\blang="es"/);
        assert.match(shell.text, /name="robots"\s+content="noindex/);
        assert.match(
          shell.headers.get('cache-control') ?? '',
          /no-cache|must-revalidate/,
        );

        const stylesheet = stylesheetHrefs(shell.text)[0];
        assert.ok(stylesheet, 'the panel shell must link its stylesheet');
        const cssUrl = new URL(stylesheet!, `${apiBase}/`).href;
        const css = await fetchText(cssUrl);
        assert.equal(css.status, 200);
        assert.match(css.headers.get('cache-control') ?? '', /immutable/);
        assert.match(css.text, /:focus-visible/);
        assert.match(css.text, /prefers-reduced-motion:\s*reduce/);
      },
    );
  },
);
