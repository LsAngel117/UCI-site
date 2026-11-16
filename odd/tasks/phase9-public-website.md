# Phase 9 — Public Website

**Feature:** Sitio público Astro (SSR) consumiendo el backend
**Estado:** en curso
**Fuente de verdad:** docs/15 §15, docs/04 (home), docs/03 (diseño), docs/08 (API pública), docs/10 (SEO), docs/13 (a11y)

## Objetivo

Implementar el sitio público de producción consumiendo las APIs del CMS (roadmap §15). Modelo de render: **SSR** (decisión del usuario) — Astro corre como servidor Node y consulta la API en cada request (contenido fresco, sin rebuilds).

## Problema

El sitio público Astro existe pero solo tiene el home con **fixtures**; no consume la API real. Faltan las páginas de contenido, el endpoint `settings/public` y el render de SEO/a11y.

## Scope (autorizado)

- **9A**: backend `GET /api/v1/settings/public` (+admin settings +seed); Astro SSR (`@astrojs/node`, `output: 'server'`); API client; wiring del home (dinámico vía API, estructural estático); navegación CMS-driven.
- **9B**: páginas de contenido (`/sermones[/slug]`, `/eventos[/slug]`, `/ministerios[/slug]`, páginas CMS `/[slug]`, `/soy-nuevo`, `/contacto`); SEO/meta/JSON-LD en el frontend; accesibilidad WCAG 2.2 AA.

**Fuera de scope:** UI admin React (Fase 10), contacto backend avanzado (Fase 11), deploy (Fase 13).

## Decisiones fijadas

- **Render**: SSR con `@astrojs/node` (`output: 'server'`). `API_BASE_URL` env (default `http://127.0.0.1:8787`). Astro NO toca Postgres (docs/07 §59).
- **Home**: copy estructural (labels, headings, CTAs, pilares, hero text, giving copy) = estático/product-controlled (docs/04 §20); secciones dinámicas (último sermón, sermones, eventos, ministerios, historias) = API. Service info/church profile/socials = `settings/public`.
- **settings/public**: lectura desde `Setting` key-value (JSON) agregada a un DTO tipado; seed idempotente con los valores actuales (placeholders honestos "por confirmar" donde aplique); admin `GET/PATCH /api/v1/admin/settings` con permisos settings.read/update.
- **SEO frontend**: construir `<title>`, meta description, canonical, OG y JSON-LD desde el `seo` de los DTOs públicos + site config (Fase 8 expone datos en los DTOs; si falta jsonLd, el frontend lo arma). noindex en preview/admin (no se sirven por el sitio).
- **Navegación**: consumir `GET /api/v1/navigation?location=...`.
- **Accesibilidad**: WCAG 2.2 AA (docs/13).

## Restricciones

- Frontend no toca Prisma/Postgres. Solo API HTTP. Sin secretos. Sin Co-Authored-By.
- No romper los 147 tests backend.

## Tareas — 9A

- [ ] **A1** — Backend `GET /api/v1/settings/public` (church profile/schedule/socials/giving desde `Setting`), `GET/PATCH /api/v1/admin/settings` (settings.read/update), seed idempotente. Tests.
- [ ] **A2** — Astro SSR: `@astrojs/node` adapter, `output: 'server'`, `API_BASE_URL`; build/dev funcionan.
- [ ] **A3** — API client (`src/web/lib/api.ts`): fetch tipado de endpoints públicos (sermons/events/ministries/pages/navigation/settings) con manejo de error/404.
- [ ] **A4** — Wire home: secciones dinámicas vía API, estructural estático; service info vía settings/public; navegación vía API. Mantener diseño/tokens.
- [ ] **A5** — Verificación: build SSR + home renderiza con datos reales; typecheck; tests backend verdes.

## Tareas — 9B

- [ ] **B1** — `/sermones` (listado) + `/sermones/[slug]` (detalle, video/relacionados).
- [ ] **B2** — `/eventos` (+`[slug]`), `/ministerios` (+`[slug]`).
- [ ] **B3** — Páginas CMS `/[slug]` (sermones públicas), `/soy-nuevo`, `/contacto`.
- [ ] **B4** — SEO/meta/JSON-LD en el frontend; canonical; robots/noindex coherentes.
- [ ] **B5** — Accesibilidad WCAG 2.2 AA + tests/checks.

## Criterios de aceptación

- El sitio corre en SSR y consume la API; el home muestra contenido real del CMS.
- Navegación CMS-driven; páginas de contenido publicadas accesibles por slug.
- SEO (meta/canonical/OG/JSON-LD) presente; a11y AA.
- `pnpm typecheck`, `pnpm test`, build SSR verdes.

## Verificación

- `pnpm typecheck`, `pnpm test`, `pnpm build` (SSR), E2E de páginas clave.

## Progreso

(se completa por tarea)
