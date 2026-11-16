#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# UCI production backup (Phase 13, docs/14 §41–§45).
#
# Dumps the PostgreSQL database (custom format) and archives the media volume.
# Both operations stream out of the running compose containers, so no database
# port is exposed and no host PostgreSQL client is needed.
#
# Usage:
#   ./deploy/backup.sh
#   BACKUP_DIR=/mnt/backups RETENTION_DAYS=30 ./deploy/backup.sh
#
# Suggested cron (daily 03:15, then sync off-host — see deploy/README.md):
#   15 3 * * * cd /opt/uci && ./deploy/backup.sh >> /var/log/uci-backup.log 2>&1
#
# Local backups are NOT disaster recovery on their own (docs/14 §43): copy
# them to a different machine/object storage.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-${REPO_ROOT}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DB_SERVICE="${DB_SERVICE:-postgres}"
API_SERVICE="${API_SERVICE:-api}"

log() { printf '[backup] %s\n' "$*"; }
die() { printf '[backup] ERROR: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die 'docker is not installed or not in PATH.'
[[ -f "$COMPOSE_FILE" ]] || die "compose file not found: $COMPOSE_FILE"

umask 077
mkdir -p "$BACKUP_DIR"

compose=(docker compose -f "$COMPOSE_FILE")
if [[ -f "$ENV_FILE" ]]; then
  compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
db_file="${BACKUP_DIR}/db-${stamp}.dump"
media_file="${BACKUP_DIR}/media-${stamp}.tar.gz"
db_partial="${db_file}.partial"
media_partial="${media_file}.partial"

cleanup() {
  rm -f -- "$db_partial" "$media_partial"
}
trap cleanup EXIT

log "database -> ${db_file}"
# The single-quoted command is evaluated inside the postgres container, where
# POSTGRES_USER/POSTGRES_DB are provided by its environment.
# shellcheck disable=SC2016
"${compose[@]}" exec -T "$DB_SERVICE" sh -c \
  'pg_dump --format=custom --compress=9 --no-owner --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  >"$db_partial"
[[ -s "$db_partial" ]] || die 'database dump is empty.'
mv -- "$db_partial" "$db_file"

log "media -> ${media_file}"
"${compose[@]}" exec -T "$API_SERVICE" tar -czf - -C /app media >"$media_partial"
[[ -s "$media_partial" ]] || die 'media archive is empty.'
mv -- "$media_partial" "$media_file"

log "retaining ${RETENTION_DAYS} days in ${BACKUP_DIR}"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -print -delete

log "done: $(basename "$db_file") $(basename "$media_file")"
log 'remember to copy backups off-host (docs/14 §43).'
