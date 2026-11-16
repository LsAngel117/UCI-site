# Phase 0 — Project Foundation

**Feature:** Fundación del monorepo UCI (estructura, bootstraps, límites de arquitectura)
**Estado:** en curso
**Fuente de verdad:** docs/15 §6, docs/02 §4.2 + §9, docs/07 §58–59

## Objetivo

Establecer el esqueleto del proyecto y los límites técnicos compartidos que toda fase posterior necesita (roadmap §6.1). Un solo repositorio, una sola carpeta `src/` con cinco límites internos: `web`, `admin`, `server`, `shared`, `db`. Sin workspaces de pnpm, sin Turborepo/Nx (docs/02 §4.2).

## Problema

El frontend público avanzó por delante del backend. Hoy todo vive en un `src/` plano (Astro) sin los límites que la arquitectura define. Sin esta base, no hay dónde montar el backend, la BD ni el panel admin de forma consistente.

## Por qué

Es la Fase 0 de la roadmap que el usuario aprobó seguir. Es el cimiento que todo lo demás (incluido lo ya construido) va a habitar.

## Scope (autorizado)

- Reorganizar a `src/{web,admin,server,shared,db}`.
- Bootstrap del servidor Node (health endpoint, límites de config/logging/error).
- `src/shared/` con los tipos TS compartidos.
- `src/db/` esqueleto de migraciones (sin tablas — Fase 1).
- `src/admin/` placeholder React (bootstrap mínimo).
- Docker + docker-compose (`uci-app` + `postgres`) + `.env.example`.
- Alinear iconos a **Lucide** (docs/02 §5.1).
- Higiene git: sacar `.astro/` del tracking.

**Fuera de scope:** tablas PostgreSQL, auth real, CMS, media. (Fases 1–4.)

## Restricciones (docs/07 §59 — no violar)

- No conectar Astro/React directamente a PostgreSQL.
- No exponer credenciales de BD al navegador.
- No microservicios, no infraestructura distribuida "por si acaso".
- No publicar contenido no publicado.
- No commitear secretos de producción.
- Single repo, single package.json, sin workspace infraestructure.

## Decisiones fijadas

- **Iconos**: Lucide (docs/02 §5.1). El sistema inline propio se reemplaza por Lucide; se conserva solo lo que Lucide no cubre (glifos de redes).
- **Server runtime**: Node.js + TypeScript. HTTP framework **Fastify** (TS-first, validación por schema alineada con doc 08; plugins mapean a módulos del modular monolith). Dev runner: `tsx`.
- **Admin**: Vite + React (app dedicada en src/admin, docs/02 §6).
- **Shared**: alias `@shared/*` consumible por web/server/admin.
- **Deferidas (docs/07 §58)**: ORM exacto, librería de auth, tablas exactas, endpoints exactos, tool de migraciones → se deciden en sus fases, no ahora. (Phase 0 deja solo el esqueleto de src/db/.)

## Tareas

- [x] **T1** — Reorganizar `src/` → `src/web/` (mover Astro actual, ajustar astro.config `srcDir`, imports relativos).
- [x] **T2** — Crear `src/shared/` con tipos de dominio (mover `src/data/types.ts`).
- [x] **T3** — Bootstrap `src/server/` (Node + TS): `server.ts`, `/api/v1/health`, config, logging, error handling.
- [x] **T4** — Crear `src/db/` (migrations/schema/seed vacíos con README del enfoque).
- [x] **T5** — Bootstrap `src/admin/` (React mínimo renderizable).
- [x] **T6** — `docker-compose.yml` + `docker/` + `.env.example`.
- [x] **T7** — Reemplazar iconos inline por Lucide en el web.
- [x] **T8** — Higiene git: `.astro/` fuera de tracking, `.atl/` en .gitignore.

## Progreso

Completada. Verificación independiente: PASS_WITH_WARNINGS (0 CRITICAL). Health endpoint responde. Typecheck cubre web+server+admin (`pnpm typecheck`). Pendiente para Fase 1: ORM/migraciones, conexión BD, Dockerfile con build compilado del server.
