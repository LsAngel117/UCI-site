# Production deployment runbook (Phase 13)

Operational guide for deploying UCI to the Oracle Cloud ARM VPS. It prepares
**all artifacts**; it does not perform the deploy. Authority for the
architecture is [`docs/14-deployment-and-environment.md`](../docs/14-deployment-and-environment.md);
the target topology is summarized in
[`docs/15-Implementation Roadmap.md` §19](../docs/15-Implementation%20Roadmap.md).

```text
Internet → Caddy :80/:443 (TLS)
             ├── /api/*, /panel*  → api  (Fastify :8787, admin SPA)
             ├── /media/*         → media_data volume (static)
             └── /*               → web  (Astro SSR :4321)
                        api → postgres:5432 (private network)
```

## 1. Prerequisites (user-owned, not in the repo)

- Oracle A1 VPS (aarch64, Ubuntu 24.04) with Docker Engine + Compose v2.
  Compose ≥ 2.24 is required for `env_file: { required: false }`.
- DNS: `DOMAIN` (and optionally `www.DOMAIN`) A/AAAA records pointing at the VPS.
  Caddy cannot issue a certificate until DNS resolves.
- Host firewall allowing only 22 (restricted), 80 and 443. PostgreSQL is never
  published (docs/14 §58–§59).
- A deployment directory, e.g. `/opt/uci`, containing this repository.
- Real secrets, generated on the server (`openssl rand -hex 32` keeps the
  value URL-safe for `DATABASE_URL`) — never committed.

## 2. Prepare configuration

```bash
cd /opt/uci
cp .env.production.example .env.production
chmod 600 .env.production
# Edit .env.production:
#   DOMAIN, SITE_URL, ACME_EMAIL
#   DATABASE_URL + POSTGRES_PASSWORD   (same strong password)
#   ADMIN_EMAIL + ADMIN_PASSWORD       (initial seed only)
```

Rules:

- `SITE_URL` must be `https://<DOMAIN>` and match the canonical host.
- `DATABASE_URL` must use `postgres` as host (compose network), not localhost.
- `API_BASE_URL` stays `http://api:8787` (server-to-server).
- `TRUST_PROXY=172.16.0.0/12` covers Docker's private network so Caddy's
  `X-Forwarded-For/Proto` are honoured. Never expose the API directly.
- `.env.production` is gitignored; the image never contains it.

## 3. Build images

Always pass the production env file so `SITE_URL` is baked into the Astro build:

```bash
docker compose --env-file .env.production \
  -f docker-compose.production.yml build
```

The build produces the `web`, `api` and `migrate` targets from
`docker/Dockerfile`. Building on the VPS gives native arm64 images and the
correct Prisma/Sharp binaries.

Validate the compose file without starting anything:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml config
```

## 4. Migrations

Apply versioned migrations **before** starting the new application version
(docs/14 §34–§36). The `migrate` service runs in the `tools` profile and is
never started by `up`:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml \
  run --rm migrate
```

This runs `prisma migrate deploy`. It does not seed data.

## 5. Initial seed (once per environment)

Creates roles, permissions and the initial admin user from `ADMIN_EMAIL` /
`ADMIN_PASSWORD`:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml \
  run --rm migrate pnpm db:seed
```

The seed is idempotent. After the first successful run you may remove
`ADMIN_PASSWORD` from `.env.production` (the existing admin is not modified).

## 6. Start the stack

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d
docker compose --env-file .env.production -f docker-compose.production.yml ps
```

Compose starts `postgres`, waits for its health check, then `api`, then `web`
and `caddy`. Caddy obtains TLS automatically on first request once DNS points
at the server.

## 7. Verification

Infrastructure:

```bash
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs -f caddy api
```

Health (inside the network or through Caddy):

```bash
curl -fsS https://<DOMAIN>/api/v1/health          # {"status":"ok",...}
curl -fsSI https://<DOMAIN>/ | head -n 5          # HTTP/2 200 + HSTS
curl -fsSI https://<DOMAIN>/panel/ | head -n 5    # HTTP/2 200
curl -fsS https://<DOMAIN>/robots.txt
curl -fsS https://<DOMAIN>/sitemap.xml | head
```

Public/admin checks follow docs/15 §19.6: homepage, navigation, sermons,
events, ministries, pages, media, SEO, sitemap, robots; then admin login,
session, permissions, content editing, media upload, publishing, scheduling,
preview and audit.

Media is served by Caddy directly from the `media_data` volume at `/media/*`
with immutable caching. The API also mounts the same directory at `/media` as
a fallback for non-Caddy deployments (`MEDIA_PUBLIC_BASE=/media`); do not point
`MEDIA_PUBLIC_BASE` at an external CDN unless you move the files there.

## 8. Backups (docs/14 §41–§47)

`deploy/backup.sh` dumps PostgreSQL (custom format) and archives the media
volume. It streams from the running containers, so no database port is exposed
and no host `pg_dump` is needed.

```bash
./deploy/backup.sh
BACKUP_DIR=/mnt/backups RETENTION_DAYS=30 ./deploy/backup.sh
```

- `BACKUP_DIR` (default `./backups`), `RETENTION_DAYS` (default 14),
  `COMPOSE_FILE`, `ENV_FILE`, `DB_SERVICE`, `API_SERVICE` are overridable.
- Local backups are not disaster recovery: copy them off the VPS
  (`rsync`, `rclone`) as required by docs/14 §43.
- Suggested cron (daily 03:15 UTC):

```cron
15 3 * * * cd /opt/uci && ./deploy/backup.sh >> /var/log/uci-backup.log 2>&1
15 4 * * * rclone copy /opt/uci/backups remote:uci-backups >> /var/log/uci-backup.log 2>&1
```

Periodically verify a backup can actually be restored (docs/14 §45) on a
non-production database.

### Restore

```bash
# 1. Stop writers
docker compose --env-file .env.production \
  -f docker-compose.production.yml stop caddy web api

# 2. Restore (asks for confirmation unless --yes)
./deploy/restore.sh --yes backups/db-<stamp>.dump backups/media-<stamp>.tar.gz

# 3. Start and verify
docker compose --env-file .env.production \
  -f docker-compose.production.yml up -d
curl -fsS https://<DOMAIN>/api/v1/health
```

`restore.sh` replaces schema/data (`pg_restore --clean --if-exists`) and the
media volume contents. Recovery order is documented in docs/14 §47.

## 9. Rollback

- **Application:** redeploy the previous release (`git checkout <tag>`), then
  rebuild and `up -d`. Images and application code are stateless; media and
  database volumes persist across restarts (docs/14 §39, §97).
- **Database:** migrations are forward-only. There is no automatic down
  migration; restore the last verified dump with `deploy/restore.sh` if a
  migration must be undone (docs/14 §37).
- **Configuration:** keep the previous `.env.production` (600) outside Git.

## 10. Operations notes

- Logs: `docker compose ... logs -f` (json-file, rotated at 10 MB × 5).
  Structured request ids come from Fastify/Caddy (docs/14 §27–§29).
- Restart policy: `unless-stopped`; health checks gate `depends_on`.
- Persistent data: `postgres_data`, `media_data`, `caddy_data`,
  `caddy_config` named volumes. Deleting an app container or re-running `up`
  never removes them.
- Media uploads land in `media_data`; new deploys never overwrite them.
- Scheduled publication runs inside the `api` process (`SCHEDULER_INTERVAL_MS`,
  default 60 s) and does not depend on the panel being open.
- TLS/certificates live in `caddy_data`; keep it backed up if you want to
  avoid re-issuing certificates.
- Security: non-root images, no DB port, only 80/443 published, secrets only
  through `.env.production`, HSTS + app CSP/security headers (docs/11 §44).
