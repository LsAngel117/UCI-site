# Phase 8 — SEO & Content Discovery

**Feature:** Servicio de SEO, sitemap dinámico, robots, búsqueda y settings SEO
**Estado:** en curso
**Fuente de verdad:** docs/15 §14, docs/10 (SEO spec), docs/08 §(admin seo/search), docs/11 §9

## Objetivo

Integrar el sistema de SEO y descubrimiento una vez que los modelos de contenido y las URLs públicas son estables (roadmap §14.1). El backend provee los datos de SEO; el **render** de `<meta>`/JSON-LD es Fase 9.

## Problema

Los DTOs públicos ya exponen `seo`/canonical parcialmente, pero no hay un servicio unificado de SEO, ni sitemap dinámico, ni robots.txt, ni búsqueda, ni settings SEO de sitio.

## Scope (autorizado)

- **Servicio de SEO** (backend, reutilizable): para una entidad pública (page/sermon/event/ministry) produce un payload SEO completo: title, description, canonicalUrl, Open Graph (title/description/url/image/type), robots (index/noindex), breadcrumbs, y structured data JSON-LD apropiado (Organization, WebSite, WebPage, Article, Event, BreadcrumbList, VideoObject — solo si el contenido lo justifica).
- **Sitemap dinámico**: `GET /sitemap.xml` generado desde contenido publicado (pages/sermons/events/ministries) con `lastmod`; excluye admin/login/preview/drafts/archivados/no-indexables/duplicados.
- **robots.txt**: `GET /robots.txt` (disallow admin/panel/api/preview; referencia el sitemap).
- **Búsqueda**: `GET /api/v1/search?q=...` sobre contenido publicado (Postgres inicial, sin Elasticsearch), resultados agrupados + paginación.
- **Admin SEO settings**: `GET/PATCH /api/v1/admin/seo` (defaults de sitio: título, descripción, OG image default, robots default). Permiso `seo.read/update`.
- **Reglas de indexabilidad**: preview/drafts/admin noindex; sitemap excluye.

**Fuera de scope:** render de `<meta>`/JSON-LD en el sitio (Fase 9), sitemap de Astro (el frontend puede consumir el endpoint), UI admin (Fase 10).

## Decisiones fijadas

- **Origen**: `siteUrl` (SITE_URL) para canonical/OG absolutos.
- **SEO assembly**: función pura/reutilizable `buildSeo(entityType, entity, siteConfig)` que combina `SeoMetadata` (si existe) + defaults del sitio + contenido. Determinista y testeable.
- **Sitemap**: `GET /sitemap.xml` (XML) servido por Fastify, o JSON en `GET /api/v1/seo/sitemap`. Elegí XML estándar (con `lastmod`). Solo URLs públicas indexables.
- **robots.txt**: `GET /robots.txt` texto plano.
- **Search**: Postgres `ILIKE`/`tsvector` simple sobre title/description de entidades publicadas; devuelve `{ data: { sermons, events, ministries, pages }, meta }` o lista unificada con `type`. Paginación.
- **Settings SEO**: persistir en `SeoMetadata` con `entityType='site'`/`entityId='site'` o en un `Setting`; documentar. Endpoints admin con `seo.read/update`.
- **Pagination SEO**: helper para canonical/self de listas paginadas (query strings no crean páginas canónicas distintas) — expuesto para Fase 9.
- **noindex**: preview ya noindex (Fase 5); drafts/admin excluidos de sitemap/robots.

## Restricciones

- Frontend no toca Prisma. Authz server-side. Solo contenido publicado en sitemap/search. Sin secretos. Sin Co-Authored-By.

## Tareas

- [ ] **T1** — `src/server/seo/build.ts`: servicio de assembly SEO (metadata + OG + robots + breadcrumbs + JSON-LD por tipo). Contratos `@shared/seo.ts`.
- [ ] **T2** — `GET /sitemap.xml` dinámico (published indexables + lastmod; excluye admin/preview/drafts).
- [ ] **T3** — `GET /robots.txt` (disallow admin/panel/api/preview; sitemap ref).
- [ ] **T4** — `GET /api/v1/search?q=` (publicado; agrupado/paginado; Postgres).
- [ ] **T5** — `GET/PATCH /api/v1/admin/seo` (settings de sitio; permiso seo.read/update).
- [ ] **T6** — Reglas de indexabilidad + pagination canonical helper + noindex en preview.
- [ ] **T7** — Tests de regresión (sitemap solo published, robots, search solo published, seo assembly por tipo, structured data, noindex).

## Criterios de aceptación

- `GET /sitemap.xml` incluye solo URLs públicas indexables; excluye admin/preview/drafts/archivados.
- `GET /robots.txt` correcto.
- `GET /api/v1/search?q=` solo devuelve publicados.
- SEO assembly produce metadata/OG/canonical/JSON-LD por tipo.
- Settings SEO persistidos y editables con permiso.
- `pnpm typecheck` + `pnpm test` verdes.

## Verificación

- `pnpm typecheck`, `pnpm test`, E2E sitemap/robots/search/seo assembly, build.

## Progreso

(se completa por tarea)
