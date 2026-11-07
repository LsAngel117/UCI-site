# Phase 5 — Sermons (domain completo)

**Feature:** Dominio Sermons completo: data model, media refs, SEO, workflow admin y API pública
**Estado:** en curso
**Fuente de verdad:** docs/15 §11, docs/05 §8, docs/08 §11, docs/10 (SEO), docs/11 §9

## Objetivo

Implementar el tipo de contenido primario y el workflow editorial más importante del CMS (roadmap §11.1), de punta a punta: crear → editar → preview → publicar/programar → aparecer en el sitio público.

## Problema

Fase 3 dejó el workflow editorial (crear/publicar/revisar) pero con un modelo mínimo (title/slug/description/scripture/preacherName). Faltan predicador (Person), serie, temas, portada (media), video/audio externos, notas, SEO y la **API pública**.

## Scope (autorizado)

- **5A — Modelo + admin**: modelos `Person`, `SermonSeries`, `Topic` (+ join); campos de Sermon (preacher, series, topics, coverImage, video, audio, notes, duration, featured); SEO vía `SeoMetadata`; enriquecer create/update admin.
- **5B — API pública**: `GET /api/v1/sermons` (solo publicados, filtros), `GET /api/v1/sermons/:slug` (solo publicados), relacionados; exposición de metadata SEO.

**Fuera de scope:** render del sitio público (Fase 9), UI admin (Fase 10), SEO discovery/sitemap (Fase 8), audio upload binario (audio es externo).

## Decisiones fijadas

- **Person** (predicador): modelo propio (id, firstName, lastName, displayName, role?, photoMediaId?, active). Sermon.preacherId FK (SetNull).
- **SermonSeries**: (id, name, slug @unique, startDate?, endDate?, coverMediaId?). Sermon.seriesId FK (SetNull).
- **Topic**: (id, name, slug @unique) + join `SermonTopic` (many-to-many).
- **Sermon** agrega: `preacherId`, `seriesId`, `coverMediaId` (FK MediaAsset, SetNull), `videoProvider`/`videoExternalId`/`videoUrl` (nullable), `audioUrl` (nullable), `notesMediaId` (FK MediaAsset), `notesContent` (text nullable), `durationMinutes` (Int?), `featured` (Bool default false). (Ya tiene title/slug/description/scripture/preacherName/sermonDate.)
- **Media**: la portada se referencia por `coverMediaId`; además se registra `MediaReference` (entityType 'sermon', purpose 'cover') para el reference-aware delete de Fase 4.
- **SEO**: usar `SeoMetadata` (entityType 'sermon', entityId=sermonId); upsert al guardar. Exponer `canonicalUrl`, title, description, ogImage.
- **Video/audio externos**: nunca binario (docs/05 §8). YouTube: provider/`externalId`/url.
- **API pública**: SOLO `status = published` (docs/08 §11.2). Orden default `sermonDate DESC`. Filtros: search/preacher/from/to/page/limit/sort/order.
- **Relacionados**: mismo series o topics compartidos.
- **Permisos** (docs/11 §9): admin con `sermons.*`; público sin auth.

## Restricciones

- Frontend no toca Prisma. Autorización server-side. Contenido no publicado NUNCA por API pública.
- Sin secretos; sin Co-Authored-By. Binarios vía Fase 4 (no en Postgres).

## Tareas — 5A (modelo + admin)

- [ ] **T1** — Schema: `Person`, `SermonSeries`, `Topic`, `SermonTopic`; campos de `Sermon`; migración `sermons_domain` + aplicada.
- [ ] **T2** — Contratos `@shared` para el dominio (PersonDto, SeriesDto, TopicDto, SermonAdminDto enriquecido, SEO).
- [ ] **T3** — Enriquecer create/update admin (aceptar preacher/series/topics/cover/video/audio/notes/duration/featured/seo) + registrar `MediaReference` de portada.
- [ ] **T4** — SEO: upsert de `SeoMetadata` al guardar; exponer en el DTO admin.
- [ ] **T5** — Servicios/endpoints para Person/Series/Topic (CRUD admin básico o selectores) con permisos.

## Tareas — 5B (API pública)

- [ ] **T6** — `GET /api/v1/sermons` (solo published; filtros search/preacher/from/to/paginación/sort; orden sermonDate DESC).
- [ ] **T7** — `GET /api/v1/sermons/:slug` (solo published; 404 si no publicado/inexistente).
- [ ] **T8** — Relacionados (mismo series/topics) + metadata SEO/canonical + datos para structured data (video → VideoObject).
- [ ] **T9** — Tests de regresión: draft no aparece en público; publish sí; slug; filtros; relacionados; SEO; 404.

## Criterios de aceptación

- Editor crea sermón con predicador/serie/temas/portada/video/SEO → publica → aparece en `GET /api/v1/sermons` y `GET /api/v1/sermons/:slug`.
- Draft/scheduled/archived NO aparecen por API pública.
- Related sermons funcionan.
- SEO persistido y expuesto; datos para VideoObject.
- `pnpm typecheck` + `pnpm test` verdes.

## Verificación

- `pnpm typecheck`, `pnpm test`, migración aplicada.
- E2E: crear+publicar+listar público; draft oculto; slug 404.

## Progreso

(se completa por tarea)
