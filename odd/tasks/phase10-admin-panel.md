# Phase 10 — Admin Panel

**Feature:** Panel administrativo React (`/panel`) — entorno editorial completo
**Estado:** en curso
**Fuente de verdad:** docs/15 §16, docs/09 (admin panel spec), docs/03 §45 (CMS visual), docs/08 (admin API)

## Objetivo

Implementar el entorno editorial completo (roadmap §16): shell autenticado, dashboard, interfaces de contenido, editor de sermones (referencia), media library y administración. Un editor/admin opera el CMS sin tocar la BD ni intervención de dev.

## Problema

`src/admin/` es un placeholder Vite+React mínimo. No hay login, layout, navegación, ni módulos de gestión.

## Decisiones de arquitectura

- **SPA**: Vite + React 19 en `src/admin/`, build a `dist/admin`. Routing con React Router.
- **Same-origin**: en producción el panel se sirve en el MISMO origen que la API (`/panel` + `/api/v1`) para que la cookie HttpOnly funcione. Sirve `@fastify/static` de `dist/admin` bajo `/panel` (o Caddy en deploy). En dev: Vite dev server con `proxy` `/api` → `http://127.0.0.1:8787`.
- **Auth**: `POST /api/v1/auth/login` setea cookie; `GET /api/v1/auth/me` resuelve sesión+permisos. Nada de tokens en localStorage.
- **Permisos**: UI permission-aware (oculta/deshabilita según `/auth/me`), pero la autorización real es server-side.
- **Estilo**: estructura funcional (docs/03 §45) reusando los tokens de diseño (colores/tipografía) en un layout de app; NO es el sitio cinemático.

## Restricciones

- El frontend admin NO toca Prisma (solo API). Sin secretos. TypeScript strict. Sin Co-Authored-By.
- No romper los 218 tests backend ni el sitio público.

## Sub-fases

### 10A — Shell + login + navegación (esta unidad)
- Vite dev proxy `/api` → API; build a `dist/admin`; servido same-origin en `/panel` (o documentar Caddy).
- Login (`/panel/login`) contra `POST /auth/login`; redirect al shell si autenticado.
- Shell autenticado: layout (sidebar + header + breadcrumbs), user/session controls (logout), notificaciones básicas, responsive.
- Navegación **permission-aware** (según permisos de `/auth/me`).
- Guard de sesión (redirige a login si 401).
- Dashboard stub honesto (sin métricas inventadas — placeholder hasta 10B).

### 10B — Patrones de contenido + Sermon editor (referencia)
- Patrón reutilizable list → filter → detail → edit → preview → publish.
- Sermon editor: básico + contenido + predicador + fecha + scripture + descripción + media + YouTube + SEO + publicación + revisiones + preview + scheduling.

### 10C — Media Library
- grid/list, search, filtros, orden, paginación, upload, edición de metadata, selección/picker, references, borrado con safeguards.

### 10D — Administración
- users, roles, permissions, audit, settings, navigation, SEO (backends ya existen salvo users/roles admin CRUD — verificar).

## Criterios de aceptación (global)

- Un admin/editor autenticado opera el CMS desde `/panel`.
- UI permission-aware; acciones no permitidas ocultas/deshabilitadas.
- Cookie same-origin; sesión persistente y logout.
- `pnpm typecheck` + `pnpm build:admin` + tests backend verdes.

## Progreso

- **10A — completada.** Shell React con login, guard de sesión, navegación
  permission-aware, breadcrumbs, controles de usuario y placeholders honestos.
  - `src/admin/` con React Router (`base: '/panel/'`), cliente API same-origin
    con `credentials: 'include'`, `AuthProvider`/`useAuth` y `RequireAuth`.
  - Dev: Vite proxy `/api` → `http://127.0.0.1:8787`.
  - Prod: decidido servir same-origin con `@fastify/static` desde `dist/admin`
    bajo `/panel` + fallback SPA (docs/14 §19.1). La alternativa Caddy queda
    documentada, no implementada.
  - Dashboard stub sin métricas inventadas; las secciones pendientes indican la
    sub-fase que las entrega (10B/10C/10D).
- **10B — completada.** Patrones de contenido reutilizables y editor de sermones
  como referencia.
  - Patrones en `src/admin/src/components/content/`: `DataTable` genérica con
    estados loading/empty/error, `FilterBar`, `Pagination`, `StatusBadge`,
    `ConfirmDialog`/`Dialog` accesibles y `MediaPicker` básico (la biblioteca
    completa sigue siendo 10C).
  - Rutas: `/contenido/sermones` (listado con búsqueda, estado y paginación),
    `/contenido/sermones/nuevo`, `/contenido/sermones/:id` (editor) y
    `/contenido/sermones/:id/preview`. Acciones de publicar/programar/archivar y
    restaurar revisiones ocultas o deshabilitadas sin permiso.
  - El editor cubre información básica, taxonomía (personas/series/temas),
    escritura, descripción/notas + media, video/audio, SEO y acciones de ciclo
    de vida. El guardado envía `version`; un 409 se muestra como conflicto y
    ofrece descartar cambios locales y recargar.
  - `GET /admin/sermons` admite `search` (título/slug/descripción) además de los
    filtros documentados; se agregó al contrato compartido y al servicio.
  - Helpers puros de formulario/permisos/fechas en
    `tests/admin-sermons.unit.test.ts`; smoke con `app.inject` verificó crear,
    listar con búsqueda, editar, 409 por versión obsoleta y preview noindex.
