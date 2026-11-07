# Phase 6 — Events & Ministries

**Feature:** Dominios Events (con categorías) y Ministries, reusando el CMS Core
**Estado:** en curso
**Fuente de verdad:** docs/15 §12, docs/05 §11–13, docs/08 §12–13, docs/10 (SEO), docs/11 §9

## Objetivo

Implementar el segundo grupo de módulos de contenido (roadmap §12.1), reusando el CMS Core (lifecycle/publicación/slug/concurrencia), media y el patrón de Sermons.

## Problema

`Event` y `Ministry` existen como esqueletos (slug/title/status/timestamps) sin campos de dominio, sin categorías, sin media ni SEO, sin endpoints admin ni públicos.

## Scope (autorizado)

- **6A — dominio + admin**: enriquecer `Event` (+`EventCategory`), `Ministry`; create/edit/publish/schedule/archive reusando el core; media (portada + MediaReference); SEO.
- **6B — API pública**: events (list/detail/upcoming/filtros) y ministries (list/detail).

**Fuera de scope:** revisions de Event/Ministry (docs/05 §32 habla de "contenido importante"; se reusará lifecycle/publicación/slug/concurrencia/media/SEO, sin tabla de revisiones — documentar la decisión), UI admin (Fase 10), sitio público render (Fase 9).

## Decisiones fijadas

- **Event** agrega: `summary`, `description`, `startAt`/`endAt` (ya), `categoryId` (FK EventCategory SetNull), `locationName`/`address`/`city` (texto; sin modelo Location por ahora — documentar), `coverMediaId` (FK MediaAsset SetNull), `registrationUrl`, `version` (Int default 1, concurrencia), `publishAt`, `featured` (Bool). SEO vía SeoMetadata (entityType 'event').
- **EventCategory**: modelo (id, name, slug @unique, timestamps).
- **Ministry** agrega: `shortDescription`, `description`, `coverMediaId` (FK MediaAsset SetNull), `contactEmail`/`contactPhone` (nullable), `meetingInfo`, `ctaLabel`/`ctaUrl`, `featured`, `version`, SEO (entityType 'ministry').
- **Reuso del core**: lifecycle/publicación/slug/concurrencia (mismo patrón que sermons: adapters Prisma). Portada registra `MediaReference` (entityType 'event'/'ministry', purpose 'cover').
- **Concurrencia**: PATCH requiere `version` → 409 si stale (docs/08 §38).
- **API pública**: SOLO published. Events: list (paginado, filtros upcoming/category/from/to, orden startAt ASC para próximos), detail por slug, upcoming. Ministries: list, detail por slug.
- **Permisos** (docs/11 §9): `events.*` y `ministries.*` (read/create/update/publish/archive/delete donde existan).

## Restricciones

- Frontend no toca Prisma. Authz server-side. No publicado nunca por API pública.
- Reusar el core (no duplicar lifecycle/revisión/slug). Sin secretos. Sin Co-Authored-By.

## Tareas — 6A (dominio + admin)

- [ ] **T1** — Schema: `EventCategory`; campos de `Event` y `Ministry`; migración `events_ministries` + aplicada.
- [ ] **T2** — Contratos `@shared` (EventDto/EventAdminDto/EventCategoryDto/MinistryDto/MinistryAdminDto + inputs; errores existentes).
- [ ] **T3** — Admin Events: list/create/get/update(version)/publish/schedule/archive (reusando el core). MediaReference de portada. SEO upsert.
- [ ] **T4** — Admin Ministries: idem.
- [ ] **T5** — Admin EventCategory (+ endpoints básicos) con permisos.

## Tareas — 6B (API pública)

- [ ] **T6** — `GET /api/v1/events` (solo published; filtros category/from/to/upcoming; paginación; orden) y `GET /api/v1/events/:slug` (SEO + related?). Upcoming events.
- [ ] **T7** — `GET /api/v1/ministries` y `GET /api/v1/ministries/:slug` (solo published, DTO público).
- [ ] **T8** — Tests de regresión (draft oculto, publish visible, slug 404, upcoming, filtros, permisos, MediaReference, SEO).

## Criterios de aceptación

- Editor gestiona Events y Ministries (crear/editar/publicar/programar/archivar) reusando el core.
- Publicados aparecen por API pública; drafts no.
- Portada vía media + reference-aware; SEO persistido.
- `pnpm typecheck` + `pnpm test` verdes.

## Verificación

- `pnpm typecheck`, `pnpm test`, migración aplicada.
- E2E: crear+publicar event/ministry → público; draft oculto; 409 concurrencia.

## Progreso

(se completa por tarea)
