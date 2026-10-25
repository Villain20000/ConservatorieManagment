#!/usr/bin/env bash
#
# db-restore-verify.sh -- prove that a backup can actually be restored.
#
# Why: a dump nobody has restored is not a backup, it is a hope. This script
# restores the newest dump into a throwaway database, compares row counts
# against the live database, and refuses to claim success on any doubt.
#
# It never writes to the primary database: everything happens in a scratch
# database called musicos_verify, which is dropped on success and deliberately
# kept on failure so the wreckage can be inspected.
#
# Exit status is 0 only when the restore and every assertion succeeded.

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-musicos-db}"
PG_USER="${PG_USER:-musicos}"
PG_DB="${PG_DB:-musicos}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
SCRATCH_DB="${SCRATCH_DB:-musicos_verify}"

# The tables a conservatory cannot afford to lose. Add new core tables here
# when the schema grows, otherwise a restore can silently lose them.
TABLES=(tenants students charges payments document_records)

FILE_ARG=""
FAILED=0
SCRATCH_CREATED=0
RESTORE_LOG=""
DUMP=""
START_SECONDS=$SECONDS

usage() {
  printf 'Usage: %s [options]\n\n' "${0##*/}"
  printf 'Restore a MusicOS dump into a scratch database and assert that the\n'
  printf 'row counts match the live database. Nothing is written to %s.\n\n' "$PG_DB"
  printf 'Options:\n'
  printf '  --file PATH   Verify this dump instead of the newest one in BACKUP_DIR\n'
  printf '  -h, --help    Show this help\n\n'
  printf 'Environment (all optional):\n'
  printf '  PG_CONTAINER  Docker container running Postgres  (default musicos-db)\n'
  printf '  PG_USER       Database role                      (default musicos)\n'
  printf '  PG_DB         Source database to compare against (default musicos)\n'
  printf '  BACKUP_DIR    Where dumps are read from          (default ./backups)\n'
  printf '  SCRATCH_DB    Throwaway database name            (default musicos_verify)\n\n'
  printf 'On success the scratch database is dropped. On failure it is kept,\n'
  printf 'and the exact commands to inspect and drop it are printed.\n'
}

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
  exit 1
}

finish() {
  local status=$?
  printf '\n'
  if [ "$status" -eq 0 ]; then
    printf 'RESTORE VERIFIED (%ss)\n' "$((SECONDS - START_SECONDS))"
  else
    printf 'RESTORE FAILED\n' >&2
    if [ "${SCRATCH_CREATED:-0}" -eq 1 ]; then
      printf 'Scratch database "%s" was left in place for inspection.\n' "$SCRATCH_DB" >&2
      printf '  docker exec -it %s psql -U %s -d %s\n' "$PG_CONTAINER" "$PG_USER" "$SCRATCH_DB" >&2
      printf 'Drop it once you are done:\n' >&2
      printf '  docker exec %s psql -U %s -d postgres -c "DROP DATABASE \\"%s\\" WITH (FORCE);"\n' \
        "$PG_CONTAINER" "$PG_USER" "$SCRATCH_DB" >&2
    fi
  fi
  if [ -n "${RESTORE_LOG:-}" ] && [ -f "$RESTORE_LOG" ]; then
    if [ "$status" -ne 0 ]; then
      printf 'pg_restore log: %s\n' "$RESTORE_LOG" >&2
    else
      rm -f -- "$RESTORE_LOG"
    fi
  fi
  return "$status"
}
trap finish EXIT

query_scalar() {
  # -tA gives one bare value with no padding, which is what we compare.
  local db=$1 sql=$2
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$db" -tA -v ON_ERROR_STOP=1 -c "$sql" 2>/dev/null \
    | tr -d '[:space:]'
}

count_rows() {
  local db=$1 table=$2
  query_scalar "$db" "SELECT count(*) FROM \"$table\";"
}

validate_names() {
  case "$SCRATCH_DB" in
    '' | *[!A-Za-z0-9_]*) die "SCRATCH_DB must be a plain identifier, got '$SCRATCH_DB'" ;;
    postgres | template0 | template1) die "SCRATCH_DB may not be a system database" ;;
  esac
  if [ "$SCRATCH_DB" = "$PG_DB" ]; then
    die "SCRATCH_DB must differ from PG_DB; refusing to restore over the live database"
  fi
}

require_tools() {
  command -v docker >/dev/null 2>&1 || die "docker is not on PATH."
  local running
  running=$(docker inspect --format '{{.State.Running}}' "$PG_CONTAINER" 2>/dev/null || true)
  if [ "$running" != "true" ]; then
    die "Container '$PG_CONTAINER' is not running. Start it with: docker compose up -d db"
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --file)
        [ "$#" -ge 2 ] || die "--file needs a path"
        FILE_ARG="$2"
        shift 2
        ;;
      --file=*)
        FILE_ARG="${1#*=}"
        shift
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1 (try --help)"
        ;;
    esac
  done
}

resolve_dump() {
  if [ -n "$FILE_ARG" ]; then
    [ -f "$FILE_ARG" ] || die "No such file: $FILE_ARG"
    DUMP="$FILE_ARG"
    return 0
  fi

  local -a found=()
  local f
  for f in "$BACKUP_DIR"/musicos-*.dump; do
    [ -f "$f" ] || continue
    found+=("$f")
  done
  if [ "${#found[@]}" -eq 0 ]; then
    die "No musicos-*.dump files in '$BACKUP_DIR'. Run scripts/db-backup.sh first."
  fi
  # Timestamps are fixed width UTC, so the last name sorted is the newest.
  mapfile -t found < <(printf '%s\n' "${found[@]}" | sort)
  DUMP="${found[${#found[@]}-1]}"
}

verify_checksum() {
  local sidecar="$DUMP.sha256"
  if [ ! -f "$sidecar" ]; then
    warn "No checksum sidecar at '$sidecar'; skipping the integrity check."
    return 0
  fi
  log "Verifying checksum..."
  if command -v sha256sum >/dev/null 2>&1; then
    ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$sidecar")" >/dev/null 2>&1 ) \
      || die "Checksum mismatch for '$DUMP'. The file is corrupt or was modified."
  elif command -v shasum >/dev/null 2>&1; then
    ( cd "$(dirname "$DUMP")" && shasum -a 256 -c "$(basename "$sidecar")" >/dev/null 2>&1 ) \
      || die "Checksum mismatch for '$DUMP'. The file is corrupt or was modified."
  else
    warn "Neither sha256sum nor shasum is available; skipping the integrity check."
  fi
}

drop_scratch() {
  # FORCE terminates leftover sessions from an earlier failed drill; without it
  # a stale connection makes the drop fail and every later run unusable.
  docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -q -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE);" >/dev/null
}

check_table() {
  local table=$1 source_count scratch_count
  if ! source_count=$(count_rows "$PG_DB" "$table"); then
    printf '  %-18s MISSING in source database "%s"\n' "$table" "$PG_DB"
    FAILED=1
    return 0
  fi
  if ! scratch_count=$(count_rows "$SCRATCH_DB" "$table"); then
    printf '  %-18s MISSING in restored database "%s"\n' "$table" "$SCRATCH_DB"
    FAILED=1
    return 0
  fi
  if [ "$source_count" = "$scratch_count" ]; then
    printf '  %-18s ok        source=%s restored=%s\n' "$table" "$source_count" "$scratch_count"
  else
    printf '  %-18s MISMATCH  source=%s restored=%s\n' "$table" "$source_count" "$scratch_count"
    FAILED=1
  fi
  return 0
}

main() {
  parse_args "$@"
  require_tools
  validate_names

  resolve_dump
  [ -s "$DUMP" ] || die "Dump '$DUMP' is empty."

  log "Dump: $(cd "$(dirname "$DUMP")" && pwd)/$(basename "$DUMP") ($(wc -c < "$DUMP" | tr -d '[:space:]') bytes)"
  log "pg_restore: $(docker exec "$PG_CONTAINER" pg_restore --version)"
  log "Server: $(query_scalar postgres 'SHOW server_version;')"
  verify_checksum

  log "Dropping scratch database '$SCRATCH_DB' if it exists..."
  drop_scratch

  log "Creating scratch database '$SCRATCH_DB'..."
  docker exec "$PG_CONTAINER" createdb -U "$PG_USER" "$SCRATCH_DB"
  SCRATCH_CREATED=1

  RESTORE_LOG=$(mktemp -t musicos-restore-XXXXXX.log 2>/dev/null || printf '%s' "${TMPDIR:-/tmp}/musicos-restore-$$.log")
  log "Restoring into '$SCRATCH_DB' (this is the part that used to be untested)..."
  # --exit-on-error: a half-restored database must never be reported as verified.
  if ! docker exec -i "$PG_CONTAINER" pg_restore \
    -U "$PG_USER" \
    -d "$SCRATCH_DB" \
    --no-owner \
    --no-acl \
    --exit-on-error < "$DUMP" 2> "$RESTORE_LOG"; then
    printf 'pg_restore reported errors; last lines:\n' >&2
    tail -n 20 "$RESTORE_LOG" >&2 || true
    die "pg_restore failed for '$DUMP'."
  fi

  printf '\nRow counts (tolerance: 0, exact match required):\n'
  local table
  for table in "${TABLES[@]}"; do
    check_table "$table"
  done

  printf '\nMigration history:\n'
  local migrations
  if ! migrations=$(query_scalar "$SCRATCH_DB" 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;'); then
    printf '  %-18s MISSING or unreadable\n' '_prisma_migrations'
    FAILED=1
  elif [ "${migrations:-0}" -gt 0 ]; then
    printf '  %-18s ok        applied migrations=%s\n' '_prisma_migrations' "$migrations"
  else
    printf '  %-18s MISMATCH  no applied migrations found\n' '_prisma_migrations'
    FAILED=1
  fi

  if [ "$FAILED" -ne 0 ]; then
    die "Restore completed but the assertions failed. See above."
  fi

  log "All assertions passed; dropping scratch database '$SCRATCH_DB'."
  drop_scratch
  SCRATCH_CREATED=0
}

main "$@"
