# Phase 11 — Contact & Supporting Features

**Feature:** Visibilidad admin de contacto + notificación por email + auditoría de login
**Estado:** en curso
**Fuente de verdad:** docs/15 §17, docs/08 §19 (contact), docs/11 §31–32 (audit), §? (email), docs/11 §9

## Objetivo

Completar las capacidades de soporte para interacción pública y operación admin (roadmap §17).

## Estado previo (ya hecho)
- Formulario público + validación server-side + rate-limit por IP + persistencia en `ContactSubmission` (Fase 9B2).
- Búsqueda (Fase 8), Settings (Fase 9A), Audit-read (Fase 10D1).

## Scope (falta)
- **Admin de submissions**: leer/gestionar las submissions de contacto (list, filtros, paginación, marcar gestionada). Endpoint admin + UI. Permission: añadir `contact.read` (y `contact.manage`) al vocabulario (docs/11 §9 permite extenderlo). NO exponer registros públicamente (docs/08 §19).
- **Notificación por email** (opcional, foundation): abstracción `EmailProvider` + implementación dev/no-op que loguea (sin SMTP real por ahora; env `EMAIL_PROVIDER`). Al recibir contacto, enviar notificación al admin configurado si está habilitado. Sin secretos en código.
- **Auditoría de login/seguridad**: registrar `auth.login` (éxito), `auth.login_failed` (fallo genérico, sin revelar), `auth.logout` en `audit_logs` (docs/11 §31–32).

## Decisiones
- Rutas admin: `/api/v1/admin/contact-submissions` (list/get/PATCH status mark-handled). 
- Email: provider pluggable; dev provider loguea (no envía); en prod se configura SMTP/API en Fase 13. La submission se persiste SIEMPRE (aunque el email falle); el email es best-effort (no rompe el 201).
- Audit login: éxito y fallo (mensaje genérico; no loguear password).

## Restricciones
- Authz server-side. Sin secretos. Sin exponer submissions público. TS strict. Sin Co-Authored-By. No romper 341 tests.

## Tareas
- [ ] **T1** — Permission `contact.read`/`contact.manage` (vocabulario docs/11 §9 extendido) + seed/roles.
- [ ] **T2** — Backend `GET/PATCH /api/v1/admin/contact-submissions` (list filtros/paginación, get, PATCH status handled), authorization.
- [ ] **T3** — EmailProvider abstraction + dev logger + env; invocación best-effort en POST /contact.
- [ ] **T4** — Audit de login/logout/login-failed.
- [x] **T5** — UI admin: página `/panel/administracion/contacto` (list, detalle, marcar gestionada), permission-aware.
- [ ] **T6** — Tests de regresión.

## Criterios de aceptación
- Admin con `contact.read` ve/las submissions; sin permiso 403.
- Submissions nunca públicas.
- Contacto dispara email best-effort (dev loguea) sin romper el 201 si falla.
- Login éxito/fallo/logout auditados.
- `pnpm typecheck` + `pnpm test` + build verdes.

## Progreso

- 11A (backend): endpoints admin list/get/PATCH, email best-effort y auditoría de login implementados.
- 11B (UI, esta fase): página `/panel/administracion/contacto` con lista filtrable
  (search/status/from/to), paginación, estados, detalle en dialog y acciones
  «Marcar gestionada»/«Reabrir» según `contact.manage`. Ítem de navegación y
  rutas permission-aware actualizados; docs/08 §19.1, docs/09 §110 y docs/11 §9
  documentan el contrato y la proyección de permisos.
