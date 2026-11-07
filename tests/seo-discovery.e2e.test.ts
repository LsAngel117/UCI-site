/**
 * Phase 8 — SEO & content discovery end-to-end suite (docs/10 §6–§12, §20,
 * docs/08 §18/§20, docs/11 §9).
 *
 * Proves against a real PostgreSQL database that:
 *   - /sitemap.xml lists only published/indexable content with lastmod and
 *     never leaks drafts/archived rows or technical routes;
 *   - /robots.txt disallows admin/panel/api/preview and references the sitemap;
 *   - /api/v1/search returns only published content, is paginated and rejects
 *     an empty query with 400;
 *   - /api/v1/admin/seo enforces seo.read/seo.update and rejects invalid input;
 *   - preview responses keep their noindex header.
 *
 * Skipped when `DATABASE_URL` is absent, like every other e2e suite. Every row
 * created by the suite is deleted (and the site SEO setting restored) in
 * teardown.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { PermissionName } from '@shared/api';
import type { PrismaClient } from '@prisma/client';

const HAS_DB = Boolean(process.env.DATABASE_URL);

let buildServer!: typeof import('@server/app').buildServer;
let loadConfig!: typeof import('@server/config').loadConfig;
let hashPassword!: typeof import('@server/auth/password').hashPassword;
let prisma!: PrismaClient;
let ALL_PERMISSIONS!: readonly PermissionName[];

if (HAS_DB) {
  ({ buildServer } = await import('@server/app'));
  ({ loadConfig } = await import('@server/config'));
  ({ hashPassword } = await import('@server/auth/password'));
  ({ prisma } = await import('@server/db'));
  ({ PERMISSIONS: ALL_PERMISSIONS } = await import('@shared/api'));
}

const RUN = randomUUID().slice(0, 8);
const ADMIN_EMAIL = `seo-admin-${RUN}@uci.local`;
const NO_ROLE_EMAIL = `seo-norole-${RUN}@uci.local`;
const PASSWORD = 'Seo-Phase8-Passw0rd!';

const SITE_URL = loadConfig
  ? loadConfig({ ...process.env, NODE_ENV: 'test' }).siteUrl
  : 'https://uci.example.org';

const pageIds: string[] = [];
const sermonIds: string[] = [];
const eventIds: string[] = [];
const ministryIds: string[] = [];
const seoMetadataIds: string[] = [];
let adminUserId: string;

let originalSeoSetting: { value: unknown } | null = null;

function makeApp(): FastifyInstance {
  return buildServer({
    logger: false,
    config: loadConfig({ ...process.env, NODE_ENV: 'test' }),
  });
}

async function login(app: FastifyInstance, email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD },
  });
  assert.equal(res.statusCode, 200, `login failed: ${res.body}`);
  const setCookie = res.headers['set-cookie'];
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, 'expected a Set-Cookie header');
  return header.split(';')[0]!;
}

function get(
  app: FastifyInstance,
  url: string,
  cookie?: string,
): Promise<{ statusCode: number; body: string; headers: Record<string, unknown> }> {
  return app
    .inject({
      method: 'GET',
      url,
      ...(cookie ? { headers: { cookie } } : {}),
    })
    .then((res) => ({
      statusCode: res.statusCode,
      body: res.body,
      headers: res.headers,
    }));
}

async function patch(
  app: FastifyInstance,
  url: string,
  cookie: string | undefined,
  payload: unknown,
): Promise<{ statusCode: number; body: string }> {
  const res = await app.inject({
    method: 'PATCH',
    url,
    ...(cookie ? { headers: { cookie } } : {}),
    payload: payload as Record<string, unknown>,
  });
  return { statusCode: res.statusCode, body: res.body };
}

async function ensureRoles(): Promise<string> {
  const admin = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: { name: 'ADMIN', description: 'E2E admin role' },
  });
  for (const name of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: { roleId: admin.id, permissionId: permission.id },
      },
      update: {},
      create: { roleId: admin.id, permissionId: permission.id },
    });
  }
  return admin.id;
}

async function createPublishedPage(slug: string, title: string, excerpt: string) {
  const page = await prisma.page.create({
    data: {
      slug,
      title,
      excerpt,
      status: 'published',
      publishedAt: new Date(),
    },
  });
  pageIds.push(page.id);
  return page;
}

describe(
  'SEO & discovery e2e (requires DATABASE_URL)',
  { skip: HAS_DB ? false : 'DATABASE_URL is not set — skipping e2e suite' },
  () => {
    let adminCookie: string;

    before(async () => {
      const adminRoleId = await ensureRoles();
      const passwordHash = await hashPassword(PASSWORD);

      const admin = await prisma.user.upsert({
        where: { email: ADMIN_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: ADMIN_EMAIL,
          passwordHash,
          firstName: 'SEO',
          lastName: 'Admin',
          active: true,
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRoleId } },
        update: {},
        create: { userId: admin.id, roleId: adminRoleId },
      });
      adminUserId = admin.id;

      // A real (active) user with no role: authenticated but unauthorized.
      await prisma.user.upsert({
        where: { email: NO_ROLE_EMAIL },
        update: { passwordHash, active: true },
        create: {
          email: NO_ROLE_EMAIL,
          passwordHash,
          firstName: 'SEO',
          lastName: 'NoRole',
          active: true,
        },
      });

      originalSeoSetting = await prisma.setting.findUnique({
        where: { key: 'seo.site' },
      });

      const loginApp = makeApp();
      try {
        adminCookie = await login(loginApp, ADMIN_EMAIL);
      } finally {
        await loginApp.close();
      }
    });

    after(async () => {
      await prisma.page.deleteMany({ where: { id: { in: pageIds } } });
      await prisma.sermon.deleteMany({ where: { id: { in: sermonIds } } });
      await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
      await prisma.ministry.deleteMany({ where: { id: { in: ministryIds } } });
      await prisma.seoMetadata.deleteMany({ where: { id: { in: seoMetadataIds } } });
      await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
      if (originalSeoSetting) {
        await prisma.setting.upsert({
          where: { key: 'seo.site' },
          update: { value: originalSeoSetting.value as never },
          create: { key: 'seo.site', value: originalSeoSetting.value as never },
        });
      } else {
        await prisma.setting.deleteMany({ where: { key: 'seo.site' } });
      }
      await prisma.session.deleteMany({
        where: { user: { email: { in: [ADMIN_EMAIL, NO_ROLE_EMAIL] } } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ADMIN_EMAIL, NO_ROLE_EMAIL] } },
      });
      await prisma.$disconnect();
    });

    test('sitemap lists only published content with lastmod and excludes drafts/technical routes', async () => {
      const pageSlug = `seo-sitemap-page-${RUN}`;
      const draftSlug = `seo-sitemap-draft-${RUN}`;
      const sermonSlug = `seo-sitemap-sermon-${RUN}`;
      const archivedSermonSlug = `seo-sitemap-archived-${RUN}`;
      const eventSlug = `seo-sitemap-event-${RUN}`;
      const ministrySlug = `seo-sitemap-ministry-${RUN}`;

      const publishedPage = await createPublishedPage(
        pageSlug,
        `Sitemap page ${RUN}`,
        'Página indexable.',
      );
      const draftPage = await prisma.page.create({
        data: { slug: draftSlug, title: `Sitemap draft ${RUN}` },
      });
      pageIds.push(draftPage.id);

      const sermon = await prisma.sermon.create({
        data: {
          slug: sermonSlug,
          title: `Sitemap sermon ${RUN}`,
          status: 'published',
          publishedAt: new Date(),
        },
      });
      sermonIds.push(sermon.id);
      const archivedSermon = await prisma.sermon.create({
        data: {
          slug: archivedSermonSlug,
          title: `Sitemap archived ${RUN}`,
          status: 'archived',
        },
      });
      sermonIds.push(archivedSermon.id);
      const event = await prisma.event.create({
        data: {
          slug: eventSlug,
          title: `Sitemap event ${RUN}`,
          status: 'published',
          publishedAt: new Date(),
        },
      });
      eventIds.push(event.id);
      const ministry = await prisma.ministry.create({
        data: {
          slug: ministrySlug,
          name: `Sitemap ministry ${RUN}`,
          status: 'published',
          publishedAt: new Date(),
        },
      });
      ministryIds.push(ministry.id);

      const app = makeApp();
      try {
        const res = await get(app, '/sitemap.xml');
        assert.equal(res.statusCode, 200);
        assert.match(
          String(res.headers['content-type']),
          /application\/xml/,
        );

        assert.match(res.body, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
        assert.ok(res.body.includes(`<loc>${SITE_URL}/</loc>`), 'homepage is included');
        assert.ok(
          res.body.includes(`<loc>${SITE_URL}/${pageSlug}</loc>`),
          'published page is included',
        );
        assert.ok(
          res.body.includes(`<lastmod>${publishedPage.updatedAt.toISOString()}</lastmod>`),
          'lastmod comes from updatedAt',
        );
        assert.ok(
          res.body.includes(`<loc>${SITE_URL}/sermones/${sermonSlug}</loc>`),
          'published sermon is included',
        );
        assert.ok(
          res.body.includes(`<loc>${SITE_URL}/eventos/${eventSlug}</loc>`),
          'published event is included',
        );
        assert.ok(
          res.body.includes(`<loc>${SITE_URL}/ministerios/${ministrySlug}</loc>`),
          'published ministry is included',
        );

        assert.ok(!res.body.includes(draftSlug), 'draft page is excluded');
        assert.ok(!res.body.includes(archivedSermonSlug), 'archived sermon is excluded');
        assert.ok(!res.body.includes('/admin'), 'admin routes are excluded');
        assert.ok(!res.body.includes('/panel'), 'panel routes are excluded');
        assert.ok(!res.body.includes('/preview'), 'preview routes are excluded');
        assert.ok(!res.body.includes('/api/'), 'API routes are excluded');
      } finally {
        await app.close();
      }
    });

    test('sitemap uses the editorial SeoMetadata canonical override instead of the slug route', async () => {
      const slug = `seo-canonical-${RUN}`;
      const page = await createPublishedPage(
        slug,
        `Canonical page ${RUN}`,
        'Página con canonical editorial.',
      );
      const canonical = `${SITE_URL}/quienes-somos-${RUN}`;
      const seo = await prisma.seoMetadata.create({
        data: { entityType: 'page', entityId: page.id, canonicalUrl: canonical },
      });
      seoMetadataIds.push(seo.id);

      const app = makeApp();
      try {
        const res = await get(app, '/sitemap.xml');
        assert.equal(res.statusCode, 200);
        assert.ok(
          res.body.includes(`<loc>${canonical}</loc>`),
          'editorial canonical is advertised',
        );
        assert.ok(
          !res.body.includes(`<loc>${SITE_URL}/${slug}</loc>`),
          'default slug route is not advertised as a duplicate canonical',
        );
      } finally {
        await app.close();
      }
    });

    test('sitemap excludes published pages whose slug collides with a public or technical route', async () => {
      const colliding = ['admin', 'login', 'nosotros', 'sermones'];
      for (const slug of colliding) {
        await createPublishedPage(
          slug,
          `Collision ${slug} ${RUN}`,
          'Página con slug reservado.',
        );
      }

      const app = makeApp();
      try {
        const res = await get(app, '/sitemap.xml');
        assert.equal(res.statusCode, 200);
        for (const slug of colliding) {
          assert.ok(
            !res.body.includes(`<loc>${SITE_URL}/${slug}</loc>`),
            `reserved slug "${slug}" is excluded`,
          );
        }
      } finally {
        await app.close();
      }
    });    test('robots.txt disallows technical areas and points at the sitemap', async () => {
      const app = makeApp();
      try {
        const res = await get(app, '/robots.txt');
        assert.equal(res.statusCode, 200);
        assert.match(String(res.headers['content-type']), /text\/plain/);
        assert.equal(
          res.body,
          [
            'User-agent: *',
            'Disallow: /admin',
            'Disallow: /panel',
            'Disallow: /api',
            'Disallow: /preview',
            '',
            `Sitemap: ${SITE_URL}/sitemap.xml`,
            '',
          ].join('\n'),
        );
      } finally {
        await app.close();
      }
    });

    test('search returns only published content across all four types with pagination', async () => {
      const token = `Buscable${RUN}`;
      const publishedPage = await createPublishedPage(
        `seo-search-page-${RUN}`,
        `Página ${token}`,
        `Resumen ${token}`,
      );
      const draftPage = await prisma.page.create({
        data: {
          slug: `seo-search-draft-${RUN}`,
          title: `Borrador ${token}`,
          excerpt: `Borrador ${token}`,
        },
      });
      pageIds.push(draftPage.id);
      const sermon = await prisma.sermon.create({
        data: {
          slug: `seo-search-sermon-${RUN}`,
          title: `Sermón ${token}`,
          description: `Predicación ${token}`,
          status: 'published',
          publishedAt: new Date(),
        },
      });
      sermonIds.push(sermon.id);
      const event = await prisma.event.create({
        data: {
          slug: `seo-search-event-${RUN}`,
          title: `Evento ${token}`,
          summary: `Encuentro ${token}`,
          status: 'published',
          publishedAt: new Date(),
        },
      });
      eventIds.push(event.id);
      const ministry = await prisma.ministry.create({
        data: {
          slug: `seo-search-ministry-${RUN}`,
          name: `Ministerio ${token}`,
          shortDescription: `Servicio ${token}`,
          status: 'published',
          publishedAt: new Date(),
        },
      });
      ministryIds.push(ministry.id);

      const app = makeApp();
      try {
        const missing = await get(app, '/api/v1/search');
        assert.equal(missing.statusCode, 400);
        assert.equal(
          (JSON.parse(missing.body) as { error: { code: string } }).error.code,
          'VALIDATION_ERROR',
        );

        const blank = await get(app, '/api/v1/search?q=%20%20');
        assert.equal(blank.statusCode, 400);

        const res = await get(app, `/api/v1/search?q=${token}&limit=100`);
        assert.equal(res.statusCode, 200, res.body);
        const payload = JSON.parse(res.body) as {
          data: Array<{ type: string; id: string; slug: string; title: string; excerpt: string | null }>;
          meta: { page: number; limit: number; total: number; totalPages: number };
        };
        assert.equal(payload.meta.total, 4);
        assert.deepEqual(
          [...new Set(payload.data.map((item) => item.type))].sort(),
          ['EVENT', 'MINISTRY', 'PAGE', 'SERMON'],
        );
        assert.ok(
          payload.data.every((item) => item.slug !== draftPage.slug),
          'draft page never appears',
        );
        assert.ok(payload.data.some((item) => item.slug === publishedPage.slug));
        assert.ok(payload.data.some((item) => item.slug === sermon.slug));
        assert.ok(payload.data.some((item) => item.slug === event.slug));
        assert.ok(payload.data.some((item) => item.slug === ministry.slug));

        const first = await get(app, `/api/v1/search?q=${token}&page=1&limit=2`);
        const second = await get(app, `/api/v1/search?q=${token}&page=2&limit=2`);
        const firstPage = JSON.parse(first.body) as { data: Array<{ id: string }>; meta: { total: number; totalPages: number } };
        const secondPage = JSON.parse(second.body) as { data: Array<{ id: string }> };
        assert.equal(firstPage.data.length, 2);
        assert.equal(secondPage.data.length, 2);
        assert.equal(firstPage.meta.totalPages, 2);
        assert.deepEqual(
          [...firstPage.data, ...secondPage.data].map((item) => item.id).sort(),
          payload.data.map((item) => item.id).sort(),
        );
      } finally {
        await app.close();
      }
    });

    test('search treats LIKE wildcards literally and never 500s on NUL', async () => {
      const token = `Wild${RUN}`;
      const percentPage = await createPublishedPage(
        `seo-wild-percent-${RUN}`,
        `Descuento 50% ${token}`,
        'Porcentaje literal.',
      );
      const underscorePage = await createPublishedPage(
        `seo-wild-underscore-${RUN}`,
        `Guion_bajo ${token}`,
        'Guion bajo literal.',
      );
      await createPublishedPage(
        `seo-wild-plain-${RUN}`,
        `Plano ${token}`,
        'Sin comodines.',
      );

      const app = makeApp();
      try {
        const percent = await get(app, '/api/v1/search?q=%25&limit=100');
        assert.equal(percent.statusCode, 200, percent.body);
        const percentData = JSON.parse(percent.body) as {
          data: Array<{ id: string }>;
          meta: { total: number };
        };
        assert.equal(percentData.meta.total, 1, 'q=% matches only the literal %');
        assert.equal(percentData.data[0]!.id, percentPage.id);

        const underscore = await get(app, '/api/v1/search?q=%5F&limit=100');
        assert.equal(underscore.statusCode, 200, underscore.body);
        const underscoreData = JSON.parse(underscore.body) as {
          data: Array<{ id: string }>;
          meta: { total: number };
        };
        assert.equal(underscoreData.meta.total, 1, 'q=_ matches only the literal _');
        assert.equal(underscoreData.data[0]!.id, underscorePage.id);

        const nul = await get(app, '/api/v1/search?q=%00');
        assert.ok(
          nul.statusCode === 400 || nul.statusCode === 200,
          `NUL must not 500 (got ${nul.statusCode})`,
        );
        if (nul.statusCode === 200) {
          const nulData = JSON.parse(nul.body) as { meta: { total: number } };
          assert.equal(nulData.meta.total, 0);
        }
      } finally {
        await app.close();
      }
    });

    test('admin seo settings require seo.read/seo.update and reject invalid payloads', async () => {
      const app = makeApp();
      const noRoleApp = makeApp();
      try {
        const anonymous = await get(app, '/api/v1/admin/seo');
        assert.equal(anonymous.statusCode, 401);
        assert.equal(
          (JSON.parse(anonymous.body) as { error: { code: string } }).error.code,
          'UNAUTHORIZED',
        );

        const noRoleCookie = await login(noRoleApp, NO_ROLE_EMAIL);
        const forbidden = await get(noRoleApp, '/api/v1/admin/seo', noRoleCookie);
        assert.equal(forbidden.statusCode, 403);
        assert.equal(
          (JSON.parse(forbidden.body) as { error: { code: string } }).error.code,
          'FORBIDDEN',
        );

        const initial = await get(app, '/api/v1/admin/seo', adminCookie);
        assert.equal(initial.statusCode, 200, initial.body);
        const initialData = (JSON.parse(initial.body) as {
          data: { title: string; description: string; defaultOgImage: string | null; robotsDefault: boolean };
        }).data;
        assert.equal(typeof initialData.title, 'string');
        assert.equal(typeof initialData.description, 'string');
        assert.equal(typeof initialData.robotsDefault, 'boolean');

        const updated = await patch(app, '/api/v1/admin/seo', adminCookie, {
          title: `Título ${RUN}`,
          description: `Descripción ${RUN}`,
          defaultOgImage: 'https://cdn.test/og-default.png',
          robotsDefault: false,
        });
        assert.equal(updated.statusCode, 200, updated.body);
        const updatedData = (JSON.parse(updated.body) as {
          data: { title: string; description: string; defaultOgImage: string | null; robotsDefault: boolean };
        }).data;
        assert.deepEqual(updatedData, {
          title: `Título ${RUN}`,
          description: `Descripción ${RUN}`,
          defaultOgImage: 'https://cdn.test/og-default.png',
          robotsDefault: false,
        });

        const reread = await get(app, '/api/v1/admin/seo', adminCookie);
        assert.deepEqual(
          (JSON.parse(reread.body) as { data: unknown }).data,
          updatedData,
        );

        const audit = await prisma.auditLog.findFirst({
          where: {
            actorId: adminUserId,
            action: 'seo.update',
            entityType: 'site',
          },
          orderBy: { createdAt: 'desc' },
        });
        assert.ok(audit, 'a successful PATCH records a seo.update audit row');

        // `robotsDefault: false` is a site-wide indexation kill switch: no
        // URL is advertised in the sitemap while it is off.
        const noindexSitemap = await get(app, '/sitemap.xml');
        assert.equal(noindexSitemap.statusCode, 200);
        assert.match(noindexSitemap.body, /<urlset /);
        assert.ok(
          !noindexSitemap.body.includes('<url>'),
          'sitemap is empty while the site is noindex',
        );

        const invalidType = await patch(app, '/api/v1/admin/seo', adminCookie, {
          robotsDefault: 'yes',
        });
        assert.equal(invalidType.statusCode, 400, invalidType.body);
        assert.equal(
          (JSON.parse(invalidType.body) as { error: { code: string } }).error.code,
          'VALIDATION_ERROR',
        );

        const unknownKey = await patch(app, '/api/v1/admin/seo', adminCookie, {
          notAField: true,
        });
        assert.equal(unknownKey.statusCode, 400);

        const invalidUrl = await patch(app, '/api/v1/admin/seo', adminCookie, {
          defaultOgImage: 'javascript:alert(1)',
        });
        assert.equal(invalidUrl.statusCode, 400);

        for (const malformed of ['https://', 'https:// ', 'https://?x', 'http://']) {
          const res = await patch(app, '/api/v1/admin/seo', adminCookie, {
            defaultOgImage: malformed,
          });
          assert.equal(
            res.statusCode,
            400,
            `defaultOgImage=${JSON.stringify(malformed)} must be rejected, got ${res.statusCode}`,
          );
        }

        const emptyTitle = await patch(app, '/api/v1/admin/seo', adminCookie, {
          title: '   ',
        });
        assert.equal(emptyTitle.statusCode, 400);

        // A rejected payload leaves stored settings untouched.
        const afterInvalid = await get(app, '/api/v1/admin/seo', adminCookie);
        assert.deepEqual(
          (JSON.parse(afterInvalid.body) as { data: unknown }).data,
          updatedData,
        );
      } finally {
        await app.close();
        await noRoleApp.close();
      }
    });

    test('admin seo accepts null and well-formed http(s) image URLs', async () => {
      const app = makeApp();
      try {
        const cleared = await patch(app, '/api/v1/admin/seo', adminCookie, {
          defaultOgImage: null,
        });
        assert.equal(cleared.statusCode, 200, cleared.body);
        assert.equal(
          (JSON.parse(cleared.body) as { data: { defaultOgImage: string | null } })
            .data.defaultOgImage,
          null,
        );

        const valid = await patch(app, '/api/v1/admin/seo', adminCookie, {
          defaultOgImage: 'https://cdn.test/valid-og.png',
        });
        assert.equal(valid.statusCode, 200, valid.body);
        assert.equal(
          (JSON.parse(valid.body) as { data: { defaultOgImage: string | null } })
            .data.defaultOgImage,
          'https://cdn.test/valid-og.png',
        );
      } finally {
        await app.close();
      }
    });

    test('preview responses keep the noindex header', async () => {
      const page = await createPublishedPage(
        `seo-preview-page-${RUN}`,
        `Preview page ${RUN}`,
        'Preview.',
      );
      const app = makeApp();
      try {
        const res = await get(
          app,
          `/api/v1/admin/pages/${page.id}/preview`,
          adminCookie,
        );
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(
          res.headers['x-robots-tag'],
          'noindex, nofollow, noarchive',
        );
      } finally {
        await app.close();
      }
    });
  },
);
