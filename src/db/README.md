# Database layer (Phase 1)

This directory is the persistence boundary for the Node API. The canonical
Prisma schema and migrations now live at the repo root under `prisma/`
(see `prisma/README.md` for the location decision and conventions). This
directory is retained for domain-specific notes and seed data.

## Enforced conventions (docs/02 §33, docs/14 §35)

- **Migrations are versioned and reproducible** — see `prisma/migrations/`.
  Production schema is never edited by hand.
- **`seed/`** will hold representative, non-production seed data
  (docs/14 §42: seed data must never be mistaken for real content).

## Boundaries that already apply (docs/02 §2, docs/07 §59)

- Frontends (Astro web / React admin) never touch PostgreSQL directly.
- No credentials are stored here; connection info comes from `DATABASE_URL`.

## Current contents (Phase 1)

- `prisma/schema.prisma` — declarative schema (foundation tables).
- `prisma/migrations/` — versioned SQL migrations.
- `src/server/db.ts` — PrismaClient singleton (server only).

