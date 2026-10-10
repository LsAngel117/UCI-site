# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# UCI application image — multi-stage (docs/14 §55).
#
# Phase 0 placeholder: the build stage produces the public web bundle and the
# runtime stage stages it alongside the source. The compiled server entrypoint
# and a real `CMD` land in Phase 1, when the server gets a build step.
# ---------------------------------------------------------------------------

# --- Build stage ----------------------------------------------------------
FROM node:24-alpine AS build
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- Runtime stage --------------------------------------------------------
FROM node:24-alpine
WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# Dev deps (including `tsx`) are kept for now because the server runs through
# `tsx` until it gains a production build in Phase 1.
RUN pnpm install --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src

EXPOSE 8787

# TODO(Phase 1): run the compiled server instead of the tsx dev bootstrap.
CMD ["pnpm", "start:server"]
