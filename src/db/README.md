# Database layer — skeleton (Phase 0)

This directory holds the persistence boundary for the Node API. In Phase 0 it
is intentionally empty of schema: the exact ORM/data-access library, table
definitions and migration tool are deferred decisions (docs/07 §58) resolved
in Phase 1 (`docs/15` §7).

## Enforced conventions (docs/02 §33, docs/14 §35)

- **Migrations are versioned and reproducible.** Every schema change ships as
  a migration committed to `src/db/migrations/`; production schema is never
  edited by hand.
- **`schema/`** will hold the canonical SQL/type definitions generated or
  reviewed from migrations.
- **`seed/`** will hold representative, non-production seed data
  (docs/14 §42: seed data must never be mistaken for real content).

## Boundaries that already apply (docs/02 §2, docs/07 §59)

- Frontends (Astro web / React admin) never touch PostgreSQL directly.
- No credentials are stored here; connection info comes from `DATABASE_URL`.

## Planned contents (Phase 1)

- Migration tool + initial migration creating the foundation tables.
- Repository interfaces and the database connection layer.
- UUID + timestamp conventions (docs/07 §15, §16).

Nothing here connects to a database yet.
