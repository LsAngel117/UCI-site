# Phase 2 — Authentication & Authorization

**Feature:** Límite de seguridad: autenticación por sesión + autorización RBAC
**Estado:** en curso
**Fuente de verdad:** docs/15 §8, docs/11 §5–11, docs/08 §7

## Objetivo

Establecer el límite de seguridad antes de exponer funcionalidad protegida del CMS (roadmap §8.1).

## Problema

La Fase 1 creó las tablas `users`/`roles`/`permissions`/`sessions`, pero no hay autenticación ni autorización. Ninguna API protegida puede existir sin este límite.

## Por qué

Es la Fase 2 de la roadmap aprobada. Depende de Fase 1 (hecha).

## Scope (autorizado)

- **Auth**: login, logout, current-session (`/auth/me`), sesiones server-side, hash de password, cookie segura, rotación, expiración, revocación.
- **Authz**: servicio de permisos reutilizable, evaluación por permiso, middleware de rutas protegidas, errores 401/403 correctos.
- **Datos**: seed de roles (ADMIN/EDITOR), permisos (vocabulario docs/11 §9), y usuario admin inicial (vía env, sin password hardcodeado).

**Fuera de scope:** login de frontend/panel UI (Fase 10), CMS content (Fase 3+), password reset completo (nota como follow-up).

## Decisiones fijadas

- **Sesión**: server-side con token opaco aleatorio, guardado como hash (SHA-256) en `sessions.token_hash` (ya existe). Cookie `HttpOnly; Secure; SameSite=Lax` (docs/11 §5.1, §6.2). Rotación de sesión en login (evita fixation, §6.5).
- **Password hashing**: **Argon2id** (docs/11 §5.3). Librería a elegir por el implementador, prefiriendo `@node-rs/argon2` (binarios precompilados, sin node-gyp); fallback `argon2`.
- **Expiración**: lifetime absoluto + idle timeout (docs/11 §6.3) → requiere `lastSeenAt` en `sessions`.
- **Permisos**: vocabulario exacto de docs/11 §9 (`users.read`, `sermons.publish`, `media.upload`, etc.). ADMIN = todos; EDITOR = crear/editar contenido, media, seo; SIN publish/delete/archive/users/roles/audit por default (docs/11 §8.2 + "publishing explícitamente por permiso").
- **Errores**: credenciales inválidas = 401 genérico ("Invalid credentials.", sin revelar si el email existe — docs/11 §5.2); sin permiso = 403 (docs/08 §7.4).
- **Rate limiting**: `@fastify/rate-limit` en login (protección de credenciales, docs/11 §4.1/§18).
- **CSRF**: mitigado por `SameSite=Lax` (bloquea POST cross-site). Token CSRF explícito queda como follow-up de hardening.

## Restricciones (docs/07 §59, docs/11)

- Password hashes NUNCA se devuelven por la API.
- Credenciales NUNCA en localStorage/sessionStorage/URL/JWT cliente (docs/11 §5.1).
- Autorización server-side; la visibilidad del UI NO es autorización (docs/07 §59).
- Sin secretos hardcodeados; el usuario admin inicial sale de env.
- Frontend (web/admin) no toca Prisma (ya respetado).

## Tareas

- [x] **T1** — Schema: añadir `lastSeenAt` (y opcional `ipAddress`/`userAgent`) a `Session`; migración nueva.
- [x] **T2** — Password hashing (Argon2id): módulo `hashPassword`/`verifyPassword` en src/server.
- [x] **T3** — Session infrastructure: crear/validar/rotar/revocar sesión; token opaco + hash en DB.
- [x] **T4** — Auth endpoints: `POST /api/v1/auth/login`, `GET /api/v1/auth/me`, `POST /api/v1/auth/logout` (contratos docs/08 §7).
- [x] **T5** — Cookie: `@fastify/cookie` configurada HttpOnly/Secure/SameSite=Lax; set/clear en login/logout.
- [x] **T6** — Authorization service: resolver user→roles→permissions; `can(user, permission)`.
- [x] **T7** — Middleware de rutas protegidas (`requireAuth`, `requirePermission`) con 401/403 correctos.
- [x] **T8** — Seed: roles ADMIN/EDITOR + permisos (docs/11 §9) + admin inicial vía env (idempotente).
- [x] **T9** — Rate limit en login.
- [x] **T10** — Contratos @shared para auth (LoginRequest, AuthUser, permissions).

## Criterios de aceptación

- Usuario no autenticado no puede acceder a APIs protegidas (401).
- Login válido setea cookie HttpOnly y devuelve el user; login inválido = 401 genérico.
- `/auth/me` devuelve user + permisos; logout invalida la sesión (204).
- Permisos evaluados server-side; insuficientes = 403.
- Password nunca en respuesta; hashes con Argon2id.
- Seed idempotente crea roles/permisos/admin.
- `pnpm typecheck` verde.

## Verificación

- `pnpm typecheck`
- `pnpm prisma validate` + migración aplicada contra Postgres (docker)
- Prueba end-to-end: login → cookie → `/auth/me` → logout (401 después)
- 403 al intentar una acción sin permiso

## Progreso

- T1–T10 completas. Código en `src/server/auth/` (`password.ts`, `session.ts`,
  `permissions.ts`, `authorization.ts`, `middleware.ts`, `routes.ts`,
  `errors.ts`), contratos en `src/shared/api.ts`, TTLs/cookie en
  `src/server/config.ts`, seed idempotente en `prisma/seed.ts` (`pnpm db:seed`).
- Verificación: `prisma validate`/`generate` OK; `pnpm typecheck` 0 errores;
  seed y re-seed idempotentes (40 permisos, ADMIN=40, EDITOR=17); E2E login/me/
  logout/401/403/429 verificado con curl (evidencia en el handoff).
- **Follow-up de hardening pendiente**: token CSRF explícito (hoy solo
  SameSite=Lax), rotación a `prisma.config.ts` (aviso de deprecación Prisma 7),
  y migración de `package.json#prisma.seed`.