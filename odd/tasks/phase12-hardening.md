# Phase 12 — Integration & Hardening

**Feature:** Endurecer y verificar el sistema como conjunto antes de producción
**Estado:** en curso
**Fuente de verdad:** docs/15 §18, docs/11 (security), docs/12 (media), docs/10 (SEO), docs/13 (a11y)

## Objetivo

Llevar el sistema a estado coherente y quitar riesgos de integración antes de producción (roadmap §18).

## Scope

- **12A — Seguridad**: security headers, **CSP**, **CSRF/origin check** para mutaciones con cookie, CORS (same-origin), exposición de errores, revisión de output encoding/secret handling.
- **12B — Contenido/Media/SEO + flujos E2E**: verificar slug uniqueness, publicación/programación, revisiones, concurrencia, preview isolation (content); upload limits/MIME/firma/filenames/storage/URLs/references/orphans (media); canonical/sitemap/robots/structured/indexability/redirects/broken links (SEO); verificación end-to-end de los flujos editorial/evento/página.
- **12C — Accesibilidad + Performance**: revisión a11y (teclado/focus/semántica/contraste/reduced-motion; lo posible sin browser), performance (tamaño de respuestas, variantes, lazy, caching, JS de cliente, eficiencia de queries).

## Decisiones (12A)
- **Security headers** en Fastify y en el sitio Astro SSR: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (o frame-ancestors), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` mínima, `Strict-Transport-Security` (solo prod/HTTPS), y `Content-Security-Policy` razonable (self; permitir YouTube frames e imágenes de media; evitar romper Astro/SPA — validar que no rompa el sitio ni el panel).
- **CSRF**: además de `SameSite=Lax`, para mutaciones (POST/PATCH/PUT/DELETE) autenticadas por cookie, exigir `Origin`/`Referer` same-origin (o un header custom que el browser no pueda setear cross-site). Rechazar CSRF con 403. No romper el panel (el SPA es same-origin).
- **CORS**: same-origin only; sin CORS permisivo.
- **Errores**: nunca exponer stack/trace/internals al cliente (ya hay envelope genérico; verificar).

## Restricciones
- No romper 371 tests ni el sitio/panel. Sin secretos. TS strict. Sin Co-Authored-By.

## Tareas — 12A
- [ ] T1 — Security headers (Fastify + Astro SSR) + CSP validado (no rompe sitios).
- [ ] T2 — CSRF/origin check en mutaciones cookie-auth (403 cross-origin) sin romper panel/sitio.
- [ ] T3 — CORS same-origin + error exposure review.
- [ ] T4 — Tests/regresión + smoke (headers presentes, mutación cross-origin rechazada, same-origin OK).

## Progreso

(se completa por sub-fase)
