# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# UCI production images (Phase 13, docs/14 §7–§8, §54–§57).
#
# Two runtime targets are published from this multi-stage build:
#
#   web — Astro SSR (dist/server/entry.mjs + dist/client)
#   api — compiled Fastify server (dist-server/server.js) + admin SPA + media
#
# A third `migrate` target keeps the Prisma CLI and `tsx` (seed) for one-off
# `prisma migrate deploy` / `pnpm db:seed` runs. It is never part of the
# long-running runtime images.
#
# Build:
#   docker build -f docker/Dockerfile --target web -t uci-web  .
#   docker build -f docker/Dockerfile --target api -t uci-api  .
#
# Compose builds the same targets from docker-compose.production.yml.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=24
ARG PNPM_VERSION=11.5.0

# --- Toolchain --------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS base
# Global ARGs are only visible to FROM lines; re-declare to use it in RUN.
ARG PNPM_VERSION
WORKDIR /app

# Corepack ships the exact pnpm version pinned in CI/builds. `openssl` is
# required by Prisma's query engine on Alpine; `libc6-compat` keeps prebuilt
# native addons (sharp, @node-rs/argon2) working on musl.
RUN corepack enable && corepack prepare "pnpm@${PNPM_VERSION}" --activate
RUN apk add --no-cache openssl libc6-compat

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    HUSKY=0

# --- Dependencies -----------------------------------------------------------
FROM base AS deps
# pnpm-workspace.yaml carries the allowBuilds policy for Prisma/sharp/esbuild.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build ------------------------------------------------------------------
FROM deps AS build
COPY . .

# Astro bakes `site` into the build, so canonical/OpenGraph/sitemap URLs are
# fixed at image build time. Compose passes the production SITE_URL here.
ARG SITE_URL=https://uci.example.org
ENV SITE_URL=${SITE_URL}

RUN pnpm prisma:generate \
 && pnpm build \
 && pnpm build:server

# --- Migration / seed tooling ----------------------------------------------
# Full development dependency set (Prisma CLI + tsx). One-off only.
FROM build AS migrate
# `node` cannot rewrite root-owned shims, so skip pnpm's pre-run dependency
# verification (node_modules is immutable in this image by design).
RUN printf 'verify-deps-before-run=false\n' > /app/.npmrc \
 && chown node:node /app/.npmrc
USER node
CMD ["pnpm", "prisma", "migrate", "deploy"]

# --- Runtime dependency tree ------------------------------------------------
# Dev dependencies (Astro CLI, Vite, tsx, esbuild, Prisma CLI) are removed
# after the build, leaving only what the two runtime processes import.
FROM build AS runtime
RUN pnpm prune --prod

# --- Web runtime (Astro SSR) -----------------------------------------------
FROM base AS web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4321

COPY --from=runtime /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist/server ./dist/server
COPY --from=build /app/dist/client ./dist/client

USER node
EXPOSE 4321

# `/robots.txt` is a static SSR route: it proves the server is accepting
# requests without depending on the API or database.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4321)+'/robots.txt').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/entry.mjs"]

# --- API runtime (Fastify + admin SPA + media) ------------------------------
FROM base AS api
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    MEDIA_ROOT=/app/media \
    ADMIN_DIST_ROOT=/app/dist/admin

COPY --from=runtime /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/dist/admin ./dist/admin

# The media directory is the mount point for the `media_data` volume. Creating
# it here makes Docker initialise the named volume with `node` ownership.
RUN mkdir -p /app/media && chown -R node:node /app/media /app/dist-server /app/dist/admin

USER node
EXPOSE 8787

# Readiness: 200 alone is not enough — require the DB-backed status to be `ok`.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/v1/health').then(r=>r.json()).then(j=>process.exit(j.status==='ok'?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist-server/server.js"]
