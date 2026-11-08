# Improvements — mejoras menores pendientes

**Feature:** timezone configurable, Story backend, sermon rich content, media orphan cleanup, password reset, E2E navegador
**Estado:** en curso

## Lotes

### Lote A — Backend/data
- **Timezone**: `APP_TIMEZONE` env (default America/Bogota) en config; usado por scheduling; expuesto en `settings/public` (`timezone`); auditoría/fechas de iglesia coherentes.
- **Story backend**: modelo `Story` (+`StoryRevision`? no; sin revisiones), admin (list/create/get/update/publish/archive, version→409) reusando el CMS core, media cover + SEO, y API pública (`GET /api/v1/stories(/:slug)`, solo published). Migración.
- **Sermon rich content**: campo `content Json?` en Sermon (bloques), aceptado en create/update admin, expuesto en admin + público. Reusar el normalizador de bloques (`page-content`).
- **Media orphan cleanup**: `cleanupOrphanMedia({olderThanDays, dryRun})` que borra assets sin referencias (fila+variantes+archivos) con guardas; cableado al scheduler con `MEDIA_ORPHAN_CLEANUP_DAYS` (opt-in; default deshabilitado o dry-run) + log.
- **Password reset**: modelo `PasswordResetToken` (tokenHash, userId, expiresAt, usedAt) + `POST /api/v1/auth/password-reset/request` (best-effort email, respuesta genérica) y `POST /api/v1/auth/password-reset/confirm` (token+newPassword, Argon2id, revoca sesiones, audit). Rate limit.

### Lote B — Frontend
- Timezone en `src/web/lib/format.ts` (usar `settings.timezone`).
- Story: páginas públicas (`/historias` + `[slug]`?) o sección del home conectada a `GET /stories`; admin UI de Stories.
- Sermon rich content: editor de bloques (reusar `page-content`) en el Sermon editor + render en el detalle público.
- Password reset UI: `/panel/login` → "olvidé mi contraseña" + página de reset.
- Media library: acción de limpieza de huérfanos (si hay endpoint) o mostrar orphans.

### Lote C — E2E navegador
- Playwright + tests E2E básicos (login panel, sitio público, publicar sermón). Si la descarga de navegadores está bloqueada offline, documentar y dejar config lista.

## Restricciones
- No romper tests existentes; verificar por lote; commit por lote; push final.
- Sin secretos. TS strict. Sin Co-Authored-By.

## Progreso
(en curso)
