# Phase 4 — Media Subsystem

**Feature:** Arquitectura de media (storage abstraction, uploads, librería, variantes, references, video externo)
**Estado:** en curso
**Fuente de verdad:** docs/15 §10, docs/12, docs/08 §15–16, docs/11 §9/§23/§25/§41

## Objetivo

Implementar la arquitectura de media ANTES de que los módulos de contenido dependan de manejo de archivos ad-hoc (roadmap §10.1). PostgreSQL guarda metadata y references, NUNCA binarios.

## Problema

Hoy no hay forma de subir/almacenar/referenciar archivos. Los sermones (Fase 3) no tienen portada; los módulos de contenido (Fases 5+) necesitarían ad-hoc file handling sin esto.

## Scope (autorizado)

- **MediaStorage** (abstracción): `put/get/delete/exists/getPublicUrl`.
- **FilesystemStorage**: implementación inicial en disco (path por env, NUNCA hardcodeado).
- **Media repository + MediaService**.
- **Upload pipeline** seguro (multipart): validar MIME + tamaño, generar storage key seguro (NUNCA el filename del usuario), persistir binario vía storage, metadata en Postgres.
- **Metadata de media** (modelo extendido).
- **Image variants** (sharp): thumbnail + responsive + WebP/AVIF.
- **Reference tracking** + **deletion reference-aware**.
- **Media Library API** (docs/08 §15).
- **External video (YouTube)**: metadata separada, nunca binario subido.
- **Servir URLs públicas** de media.

**Fuera de scope:** UI de la librería (Fase 10), integración con formularios de contenido (Fases 5+), providers cloud (S3/R2/Cloudinary — solo la abstracción debe permitirlos).

## Decisiones fijadas

- **Storage**: interfaz `MediaStorage`; implementación `FilesystemStorage` (provider `filesystem`). Root desde env `MEDIA_ROOT` (default `./media`, gitignored). `MEDIA_PUBLIC_BASE` (default `/media`) para URLs. NUNCA `/opt/...` hardcodeado (docs/12 §7).
- **Servir públicos**: `@fastify/static` montando `MEDIA_ROOT` en `${MEDIA_PUBLIC_BASE}` (dev). En prod el reverse proxy (Caddy) puede servirlos.
- **Tipos permitidos**: imágenes `image/jpeg`, `image/png`, `image/webp`, `image/gif`, y `application/pdf`. **SVG NO habilitado** por ahora (requiere sanitización, docs/12 §25).
- **Tamaño máximo**: env `MEDIA_MAX_UPLOAD_BYTES` (default 10 MB).
- **Storage key**: generado por la app, versioned/content-addressed: `{folder}/{YYYY}/{MM}/{uuid}.{ext}` (nunca el filename original). El `filename` original se guarda como metadata.
- **Variantes**: `sharp` genera thumbnail + widths responsive + WebP. Metadata de variantes persistida (tabla `MediaVariant` o `variants Json`). No generar docenas de variantes (docs/12 §23).
- **Deletion reference-aware**: si hay `MediaReference` → **409** (código `MEDIA_REFERENCED`) salvo `?force=true` con permiso `media.delete` (docs/08 §15.5).
- **External video**: modelo separado (provider/externalId/url/thumbnailUrl), NUNCA se sube binario (docs/08 §16, docs/15 §10.8).
- **Permisos** (docs/11 §9): `media.read` (list/get/references), `media.upload`, `media.update`, `media.delete`.

## Restricciones

- Binarios NUNCA en PostgreSQL (docs/12 §3).
- No confiar en el filename del usuario como path (docs/08 §15.3).
- Frontend no toca Prisma. Autorización server-side.
- Sin secretos; sin Co-Authored-By.

## Tareas

- [x] **T1** — Schema: extender `MediaAsset` (`type`, `storageKey @unique`, `provider`, `title`, `description`, `caption`, `folder?`) y crear `MediaVariant` (mediaAssetId, label, format, storageKey, url, width, height, size). Migración nueva + aplicada (`20261106220703_media_subsystem`).
- [x] **T2** — `src/server/media/storage.ts`: interfaz `MediaStorage` + `FilesystemStorage` (put/get/delete/exists/getPublicUrl) con keys sanitizadas (path-traversal safe).
- [x] **T3** — `src/server/media/service.ts`: upload (validar MIME/tamaño, generar key, persistir binario, metadata), get, list (filtros/paginación), update metadata, delete (reference-aware), references.
- [x] **T4** — Image processing (`sharp`): generar thumbnail + responsive widths + WebP; persistir variantes. Solo para imágenes.
- [x] **T5** — Endpoints `admin/media` (list/get/upload multipart/patch/delete/references) con `requireAuth` + `requirePermission(media.*)`.
- [x] **T6** — Servir públicos: `@fastify/static` en `MEDIA_PUBLIC_BASE`.
- [x] **T7** — External video model (shared + validación), separado de uploads.
- [x] **T8** — Contratos `@shared/media.ts`: MediaDto, UploadResponse, variantes, categorías, error codes (`MEDIA_REFERENCED`, `UNSUPPORTED_MEDIA_TYPE`, `FILE_TOO_LARGE`).
- [x] **T9** — Tests de regresión (node:test): upload válido, rechazo por MIME/tamaño, key no usa filename, delete con referencia → 409, force delete, references list, variants generadas, 401/403.

## Criterios de aceptación

- Un usuario con `media.upload` sube una imagen válida → metadata persistida + archivo en disco (no en Postgres) + variantes.
- Archivo con MIME/tamaño inválido → 422/400.
- Storage key NO deriva del filename del usuario.
- Delete con references activas → 409; con `force` + permiso → borra.
- `GET /admin/media/:id/references` lista los usos.
- URL pública sirve el archivo.
- Reemplazar el provider no cambia el dominio (abstracción).
- `pnpm typecheck` + `pnpm test` verdes.

## Verificación

- `pnpm typecheck`, `pnpm test` (con DATABASE_URL).
- E2E upload multipart + get + references + delete 409.
- `pnpm astro build`.

## Progreso

Implementado y verificado (typecheck, 65 tests, build, E2E curl multipart).

Decisiones de implementación:
- `MediaType` = `IMAGE | DOCUMENT`. `EXTERNAL_VIDEO` no es un tipo de asset: no tiene binario local.
- `url` se guarda como caché, pero los DTOs la derivan siempre de `storageKey` + provider; cambiar de provider no cambia el dominio.
- External video: contrato compartido `ExternalVideo` + `parseExternalVideo()`; **sin tabla** hasta que un módulo de contenido necesite una entidad propia. Es metadata del contenido consumidor, no un asset.
- Variantes: `thumbnail` (320), `small` (640), `medium` (1280), solo WebP, sin upscaling ni docenas de derivados.
- Logo/URL pública: `FilesystemStorage.getPublicUrl()` usa `MEDIA_PUBLIC_BASE`; `@fastify/static` monta `MEDIA_ROOT` solo cuando el base es un path local.
