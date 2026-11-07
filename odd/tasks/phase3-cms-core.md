# Phase 3 — CMS Core

**Feature:** Fundación editorial reutilizable (lifecycle, revisiones, publicación) probada con Sermons
**Estado:** en curso
**Fuente de verdad:** docs/15 §9, docs/05 §28–33, docs/08 §7/§23/§24/§38, docs/11 §9/§14/§15

## Objetivo

Crear la fundación editorial reutilizable que todos los módulos de contenido necesitan (roadmap §9.1), y probarla con **Sermons** (el primer contenido representativo) usando el workflow completo **sin duplicar la lógica del core** (§9.9).

## Problema

Fases 1–2 dieron persistencia y seguridad, pero no hay ningún flujo editorial: no existe crear borrador, publicar, programar, archivar, versionar, previsualizar ni concurrencia optimista. Los módulos de contenido (Fases 5+) no tienen base reutilizable.

## Scope (autorizado)

**CMS core (reutilizable):**
- lifecycle: draft / publish / schedule / archive / unpublish-restore.
- revisiones: creación (snapshot), listado, detalle, restauración (crea nueva revisión, no destruye historial).
- servicio de publicación (valida + crea revisión + cambia estado + registra auditoría).
- fundación de programación (`publishAt` + estado scheduled + función de publicación de vencidos; job real = follow-up).
- previsualización (auth + permiso, nunca público, no indexable).
- gestión de slug (normalizar/validar/único).
- concurrencia optimista (`version` → 409).
- DTOs y patrones de acción editorial compartidos.

**Sermons (prueba del core):** endpoints admin que usan el core (CRUD + publish/schedule/archive + revisions + preview), con `requirePermission('sermons.*')`, audit log.

**Fuera de scope:** media subsystem (Fase 4), SEO completo/YouTube/sitio público de sermones (Fase 5), app admin React (Fase 10). El `Sermon` tendrá solo los campos editoriales mínimos; media/SEO se agregan después.

## Decisiones fijadas

- **Snapshot de revisión**: `SermonRevision.snapshot Json` con el contenido completo en esa versión (+ `version`, `createdBy`). Restaurar = crear nueva revisión desde el snapshot y aplicarla al Sermon.
- **Concurrencia**: `Sermon.version Int @default(1)`; PATCH incluye `version`; si no coincide → **409** código `CONFLICT` (docs/08 §38).
- **Programación**: `Sermon.publishAt DateTime?`; `POST /schedule` setea publishAt + status `scheduled`. Función `publishDueSermons()` provista; el job/cron queda como follow-up.
- **Slug**: normalizar (minúsculas, guiones), validar formato, único por colección; duplicado → **409** `SLUG_TAKEN`. Seguimiento de redirects = follow-up SEO (Fase 8).
- **Preview**: `GET /api/v1/admin/sermons/:id/preview` con `requireAuth` + permiso `sermons.read`; nunca público, no indexable, sin URL pública permanente (docs/08 §24, docs/11 §15).
- **Permisos**: vocabulario docs/11 §9 (`sermons.read/create/update/publish/archive/delete`). Publish/schedule/archive requieren `sermons.publish`/`sermons.archive` (EDITOR no los tiene → 403).
- **Auditoría**: cada acción editorial escribe en `audit_logs` (docs/08 §23, docs/05 §33).
- **Publicación server-side**: `PATCH` nunca cambia el estado; solo las acciones explícitas publish/schedule/archive (docs/08 §22–23).

## Restricciones

- El frontend (web/admin) NO toca Prisma.
- Autorización server-side (los endpoints usan `requirePermission`).
- Contenido no publicado NUNCA por API pública.
- Sin secretos; sin Co-Authored-By.

## Tareas

- [ ] **T1** — Schema: `Sermon` + `version`, `publishAt`, campos editoriales mínimos (description, scriptureReference, preacherName, sermonDate). `SermonRevision` + `snapshot Json`. Migración nueva + aplicada.
- [ ] **T2** — Contratos `@shared`: DTOs de contenido (SermonAdminDto, Create/Update), acciones editoriales, `ContentStatus`, paginación admin, códigos de error (CONFLICT, SLUG_TAKEN, NOT_FOUND).
- [ ] **T3** — Servicio de slug (normalizar/validar/único).
- [ ] **T4** — Servicio de revisión (crear snapshot, listar, obtener, restaurar → nueva revisión).
- [ ] **T5** — Servicio de lifecycle/publicación (publish/schedule/archive/unpublish con validaciones + auditoría).
- [ ] **T6** — Concurrencia optimista (guard de version → 409) + `publishDueSermons()` (foundation).
- [ ] **T7** — Endpoints admin de Sermons (list/create/get/update/publish/schedule/archive/revisions/revision detail/restore/preview) con `requirePermission`.
- [ ] **T8** — Auditoría de acciones editoriales (`audit_logs`).
- [ ] **T9** — Tests de regresión (node:test): workflow completo, 409 por version, revisión restaurada, 403 sin permiso, preview no público, slug duplicado.

## Criterios de aceptación

- Un editor (permiso) puede: crear borrador → editar (con version) → publicar/programar/archivar → listar revisiones → restaurar.
- `PATCH` con version vieja → 409. `PATCH` nunca publica.
- Un usuario sin `sermons.publish` → 403 al publicar.
- Preview requiere auth y no expone contenido publicado públicamente.
- Core reutilizable: la lógica de lifecycle/revisión NO vive en el módulo sermons (solo lo consume).
- `pnpm typecheck` + `pnpm test` verdes.

## Verificación

- `pnpm typecheck`, `pnpm test` (con DATABASE_URL).
- Migración aplicada; E2E del workflow por HTTP.
- 409 concurrencia, 403 permisos, revisión restaurada.

## Progreso

(se completa por tarea)
