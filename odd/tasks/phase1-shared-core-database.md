# Phase 1 — Shared Core & Database

**Feature:** Persistencia y primitivas compartidas del monorepo UCI
**Estado:** en curso
**Fuente de verdad:** docs/15 §7, docs/02 §31–33, docs/08 §25–28/§34–36, docs/07 §58–59

## Objetivo

Establecer la base de persistencia (PostgreSQL vía Prisma) y las primitivas de dominio/contrato compartidas que todos los módulos de negocio van a consumir (roadmap §7.1).

## Problema

Fase 0 dejó el monorepo y los bootstraps listos, pero sin capa de datos. No hay conexión a PostgreSQL, no hay migraciones, y los contratos comunes de API (respuesta, error, paginación, sort) no están codificados en `@shared`.

## Por qué

Es la Fase 1 de la roadmap aprobada. Sin esto, Fase 2 (auth), CMS y los módulos de contenido no tienen dónde persistir.

## Scope (autorizado)

- **Data-access: Prisma** (decisión del usuario). Esquema declarativo, migrations generadas, cliente tipado.
- Connection layer en `src/server` (PrismaClient singleton, no expuesto al frontend).
- `schema.prisma` con la **fundación** de dominio (sin implementar todas las features): UUID, timestamps, convenciones, y tablas base.
- Modelo de respuesta/error/paginación/sort en `@shared` según doc 08 §25–28.
- Migraciones versionadas reproducibles (doc 02 §33).

**Fuera de scope:** auth real (Fase 2), lógica de negocio de módulos (Fases 3+), media subsystem completo.

## Decisiones fijadas

- **ORM**: Prisma (usuario). 
- **UUID**: `uuid()` generados por la API (nunca por clientes) — doc 08 §34.
- **Timestamps**: `created_at`, `updated_at` en todas las tablas; `published_at`/`unpublished_at` en contenido; `created_by`/`updated_by` en entidades auditables — doc 02 §32.
- **Convención naming**: snake_case en BD, camelCase en TS (mapping Prisma).
- **Respuesta**: `{ data, meta }`; **error**: `{ error: { code, message, details? } }`; **paginación**: `page`/`limit` con `meta.{page,limit,total,totalPages}`; **sort**: `sort`/`order` solo campos aprobados (sin SQL inyectable) — doc 08 §25–26.
- **Timezone**: centralizado, no inferido por cada frontend (doc 08 §35).
- **Separación de capas**: tipos de dominio en `@shared` NO exponen tipos de tabla de Prisma (doc 08 §2033).

## Restricciones (docs/07 §59)

- El frontend (Astro/React) NO se conecta directo a Postgres.
- No exponer credenciales de BD al navegador.
- No commitear secretos (DATABASE_URL va en `.env`, no en git).
- Modular monolith: módulos con límites explícitos, sin microservicios.

## Tareas

- [x] **T1** — Instalar Prisma + schema (Prisma 6.19.3, `prisma/schema.prisma` en raíz).
- [x] **T2** — Convenciones base (UUID, timestamps, naming snake_case→camelCase).
- [x] **T3** — 18 tablas de fundación + enum ContentStatus (users/roles/permissions/sessions + esqueleto contenido).
- [x] **T4** — Connection layer (PrismaClient singleton en src/server/db.ts + graceful shutdown).
- [x] **T5** — Contratos @shared (ApiResponse/ApiError/Pagination/Sort + resolveSort allowlist).
- [x] **T6** — Migración inicial reproducible (migrate diff --script → SQL versionado).
- [x] **T7** — Health readiness (degraded sin crashear si BD caída).
- [x] **T8** — .env.example con DATABASE_URL (placeholder).

## Progreso

Completada. Verificación independiente: PASS_WITH_WARNINGS (0 CRITICAL). Typecheck + prisma validate + build verdes. WARNINGs menores resueltos (client pineado exacto, documentación de MediaReference/join tables). PENDIENTE: migración no aplicada contra Postgres real (docker caído en este entorno) — validar `migrate deploy` en primer entorno con docker.
