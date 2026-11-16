# Phase 13 — Production Deployment (artefactos)

**Feature:** Artefactos de despliegue a producción (sin ejecutar el deploy)
**Estado:** en curso
**Fuente de verdad:** docs/15 §19, docs/14 (deployment), docs/11 §44 (deployment security), docs/12 §(storage/backup)

## Objetivo

Preparar TODOS los artefactos necesarios para desplegar el MVP al VPS Oracle según docs/14/§15. **NO se ejecuta el deploy** (falta VPS/dominio/DNS del usuario). Se entrega todo listo para que el usuario lo aplique.

## Topología objetivo (docs/15 §19.4)

```text
Internet → Caddy (TLS)
  ├── / (publico)      → Astro SSR (contenedor web)
  ├── /api, /panel     → Fastify (contenedor api; sirve admin SPA + API + media)
  └── Postgres (privado) + media storage (volumen)
```

## Artefactos a crear
- **Dockerfile multi-target** (`docker/Dockerfile` o `Dockerfile`): targets `web` (Astro SSR) y `api` (Fastify compilado + admin build). Multi-stage, node:24-alpine, non-root user, solo artefactos de runtime.
- **Build del server**: script `build:server` (compilar `src/server` a JS ejecutable, p.ej. esbuild bundle → `dist-server/server.js`) porque hoy corre con `tsx` (dev). Ajustar para que `node dist-server/server.js` funcione con path aliases resueltos.
- **docker-compose producción** (`docker-compose.production.yml`): servicios `postgres` (privado, volumen, healthcheck), `api`, `web`, `caddy`; volúmenes `postgres_data`, `media_data`; env; sin exponer Postgres. `caddy` en 80/443.
- **Caddyfile** (`deploy/Caddyfile`): TLS automático, rutas `/api/*` y `/panel/*` → api; `/media/*` → api (o caddy sirve media_data); resto → web; headers de seguridad base (complementando los de la app); healthchecks.
- **`.env.production.example`**: SITE_URL (real), API_BASE_URL, DATABASE_URL, POSTGRES_*, SESSION_*, TRUST_PROXY, EMAIL_PROVIDER/CONTACT_NOTIFY_TO, ADMIN_EMAIL/PASSWORD (para seed inicial), MEDIA_ROOT, SCHEDULER_INTERVAL_MS, NODE_ENV=production, HOST/PORT. Solo placeholders, sin secretos reales.
- **Backups**: `deploy/backup.sh` (pg_dump + tar/rsync de media) y `deploy/restore.sh`, con cron sugerido; documentar retención.
- **Runbook** (`deploy/README.md`): pasos de despliegue (preparar env, migraciones `prisma migrate deploy`, seed inicial, levantar compose, verificación pública/admin/infra, rollback, backups). Referenciar docs/14.
- **Healthchecks**: usar `/api/v1/health` (api) y un endpoint del sitio web; compose `healthcheck`.
- **Ajustes de seguridad de deploy**: `NODE_ENV=production`, `trustProxy`, secretos solo por env, Postgres no expuesto, media en volumen persistente.

## Restricciones
- NO ejecutar deploy real ni tocar el VPS. Validar artefactos localmente (`docker compose config`, builds, shellcheck si aplica) sin desplegar.
- Sin secretos reales (solo placeholders). No romper 422 tests ni el build actual.
- TS strict. Sin Co-Authored-By.

## Criterios de aceptación
- `docker compose -f docker-compose.production.yml config` válido.
- `pnpm build` + `pnpm build:admin` + `pnpm build:server` exit 0.
- Imágenes Docker construibles (si docker disponible) o al menos Dockerfile válido/validado.
- Runbook claro; backups scripts ejecutables; `.env.production.example` completo.
- 422 tests siguen verdes.

## Progreso

(se completa por tarea)
