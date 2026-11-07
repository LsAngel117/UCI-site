# Phase 7 — Pages & Navigation

**Feature:** Sistema de páginas genéricas + navegación CMS-driven + fundación de redirects
**Estado:** en curso
**Fuente de verdad:** docs/15 §13, docs/08 §10/§14, docs/05 §20/§27/§45, docs/10 (URLs), docs/11 §9

## Objetivo

Implementar el sistema de páginas de propósito general y la navegación del sitio (roadmap §13.1), reusando el CMS Core. Los editores crean/publican páginas sin cambios de código y la navegación pública es CMS-driven.

## Problema

`Page` (slug/title/status/timestamps) y `Navigation` (label/href/order/visible/parent) existen como esqueletos sin contenido estructurado, media, SEO, version, revisiones ni ubicación de navegación.

## Scope (autorizado)

- **7A — dominio + admin**: enriquecer `Page` (+`PageRevision`), `Navigation`; admin pages (create/get/update/publish/archive + revisions + preview) y admin navigation (CRUD + reorder); redirect foundation.
- **7B — API pública**: `GET /api/v1/pages(/:slug)` (solo published), `GET /api/v1/navigation?location=...` (visible, jerárquico), resolución de redirect foundation.

**Fuera de scope:** render del sitio (Fase 9), UI admin (Fase 10), SEO discovery/sitemap (Fase 8).

## Decisiones fijadas

- **Page** agrega: `excerpt String?`, `content Json?` (contenido estructurado editorial), `coverMediaId` (FK MediaAsset SetNull), `version Int @default(1)`, `publishAt DateTime?`, SEO (entityType 'page').
- **PageRevision** (id, pageId, version, title, snapshot Json, createdById, createdAt; @@unique([pageId,version])) — análogo a SermonRevision; reusar el servicio genérico de revisiones.
- **Navigation** agrega: `location String` (p.ej. 'HEADER'/'FOOTER'), `target String?` ('_self'/'_blank'), y mantiene `parentId` (jerarquía), `order`, `visible`, `external`. (Revisar si conviene `group`; si no, location alcanza.)
- **Redirect foundation**: modelo `Redirect` (id, fromPath @unique, toPath, entityType?, entityId?, createdAt). Al cambiar el slug de una página publicada, crear/actualizar un redirect `fromPath=old` → `toPath=new`. El servidor HTTP de redirects es Fase 9; acá: modelo + creación en el cambio de slug + servicio de lookup.
- **Concurrencia**: PATCH pages requiere `version` → 409.
- **Publicación**: páginas con publish/archive (docs/08 §10.6–10.7); reusar lifecycle. `PATCH` nunca publica; `status` explícito ≠ DRAFT → 400 (consistente con Fases 5/6).
- **Preview**: `GET /admin/pages/:id/preview` (auth + permiso, noindex).
- **API pública**: SOLO published (docs/08 §10.1). Navigation pública: solo `visible`, ordenada, jerárquica, por `location`.
- **Permisos** (docs/11 §9): `pages.read/create/update/publish/archive/delete`; `navigation.read/update`.

## Restricciones

- Frontend no toca Prisma. Authz server-side. No publicado nunca por API pública. Reusar core. Sin secretos. Sin Co-Authored-By.

## Tareas — 7A (dominio + admin)

- [ ] **T1** — Schema: Page (+excerpt/content/coverMediaId/version/publishAt), PageRevision, Navigation (+location/target), Redirect. Migración `pages_navigation` + aplicada.
- [ ] **T2** — Contratos @shared (PageDto/PageAdminDto/PageRevisionDto/NavigationDto/NavigationAdminDto + inputs).
- [ ] **T3** — Admin Pages: list/create/get/update(version)/publish/archive/revisions/revision detail/restore/preview; media cover (MediaReference); SEO; revisiones; redirect al cambiar slug.
- [ ] **T4** — Admin Navigation: list/create/patch/delete/reorder con permisos `navigation.read/update`.

## Tareas — 7B (API pública + redirect)

- [ ] **T5** — `GET /api/v1/pages` (solo published) y `GET /api/v1/pages/:slug` (solo published; SEO + content + cover).
- [ ] **T6** — `GET /api/v1/navigation?location=HEADER` (solo visibles, jerárquico, ordenado).
- [ ] **T7** — Redirect foundation: lookup por path (servicio), poblado al cambiar slug.
- [ ] **T8** — Tests de regresión (draft oculto, publish visible, slug 404, navegación jerárquica/visible, redirect creado al cambiar slug, version 409, permisos).

## Criterios de aceptación

- Editor crea/publica páginas con contenido/media/SEO/revisiones; preview funciona; cambiar slug genera redirect.
- `GET /pages/:slug` solo published; navigation pública solo visible y jerárquica.
- `pnpm typecheck` + `pnpm test` verdes.

## Verificación

- `pnpm typecheck`, `pnpm test`, migración aplicada.
- E2E: crear+publicar page → público; draft oculto; navigation por location; redirect al cambiar slug; 409.

## Progreso

(se completa por tarea)
