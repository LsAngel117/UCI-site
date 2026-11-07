#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# UCI production restore (Phase 13, docs/14 §45–§47).
#
# Restores a database dump produced by deploy/backup.sh and (optionally) the
# matching media archive. The database restore replaces existing schema/data;
# the media restore replaces the contents of the media volume.
#
# Usage:
#   ./deploy/restore.sh --yes backups/db-20260101T031500Z.dump \
#       backups/media-20260101T031500Z.tar.gz
#
# SAFETY: stop the application before restoring so no process writes while the
# database is being replaced:
#   docker compose --env-file .env.production \
#     -f docker-compose.production.yml stop caddy web api
# Then restore, then start the stack again.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

COMPOSE_FILE="${COMPOSE_FILE:-${REPO_ROOT}/docker-compose.production.yml}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env.production}"
DB_SERVICE="${DB_SERVICE:-postgres}"
API_SERVICE="${API_SERVICE:-api}"

usage() {
  cat <<'USAGE'
Usage: restore.sh [--yes] <database.dump> [media.tar.gz]

  --yes    skip the interactive confirmation (for scripted recovery)
USAGE
}

log() { printf '[restore] %s\n' "$*"; }
die() { printf '[restore] ERROR: %s\n' "$*" >&2; exit 1; }

assume_yes=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) assume_yes=true; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    -*) die "unknown option: $1" ;;
    *) break ;;
  esac
done

[[ $# -ge 1 && $# -le 2 ]] || { usage >&2; exit 2; }
db_dump="$1"
media_archive="${2:-}"

command -v docker >/dev/null 2>&1 || die 'docker is not installed or not in PATH.'
[[ -f "$COMPOSE_FILE" ]] || die "compose file not found: $COMPOSE_FILE"
[[ -s "$db_dump" ]] || die "database dump missing or empty: $db_dump"
if [[ -n "$media_archive" ]]; then
  [[ -s "$media_archive" ]] || die "media archive missing or empty: $media_archive"
fi

compose=(docker compose -f "$COMPOSE_FILE")
if [[ -f "$ENV_FILE" ]]; then
  compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
fi

if [[ "$assume_yes" != true ]]; then
  printf '%s\n' \
    'This REPLACES the production database and (if provided) the media volume.' \
    'Make sure the application is stopped and you have a current backup.'
  read -r -p "Type 'restore' to continue: " answer
  [[ "$answer" == 'restore' ]] || die 'aborted.'
fi

log "database <- ${db_dump}"
# Evaluated inside the postgres container (POSTGRES_* come from its env).
# shellcheck disable=SC2016
"${compose[@]}" exec -T "$DB_SERVICE" sh -c \
  'pg_restore --clean --if-exists --no-owner --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  <"$db_dump"

if [[ -n "$media_archive" ]]; then
  log "media <- ${media_archive}"
  "${compose[@]}" exec -T "$API_SERVICE" sh -c \
    'rm -rf /app/media/* && tar -xzf - -C /app' <"$media_archive"
fi

log 'restore complete. Start the stack and verify health:'
log '  docker compose --env-file .env.production -f docker-compose.production.yml up -d'
log '  curl -fsS https://<DOMAIN>/api/v1/health'
