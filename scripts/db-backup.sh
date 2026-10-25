#!/usr/bin/env bash
#
# db-backup.sh -- nightly logical backup for MusicOS.
#
# Why: student records, the fee ledger and every issued document live in a
# single Postgres volume. There is no WAL archiving, so a logical dump plus the
# local document store *is* the recovery story. This script produces both, and
# refuses to report success unless it can read the dump back.
#
# Every client command runs inside the container: the host has no psql/pg_dump
# installed, and installing one would add a version-skew risk for no benefit.
#
# Companion: scripts/db-restore-verify.sh. A dump nobody restored is not a
# backup -- run the verifier after changing anything here.

set -euo pipefail

PG_CONTAINER="${PG_CONTAINER:-musicos-db}"
PG_USER="${PG_USER:-musicos}"
PG_DB="${PG_DB:-musicos}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
STORAGE_DIR="${STORAGE_DIR:-apps/api/var/storage}"

DEFAULT_KEEP=14
KEEP="$DEFAULT_KEEP"
PRUNE=1

# Holds the artefact currently being written. The EXIT trap deletes it if we
# die mid-write, so a failed run never leaves a file that looks like a backup.
PENDING=""

usage() {
  printf 'Usage: %s [options]\n\n' "${0##*/}"
  printf 'Create a verified dump of the MusicOS database and, when present,\n'
  printf 'a tarball of the local document store.\n\n'
  printf 'Options:\n'
  printf '  --keep N      Keep the N most recent backups, prune the rest (default %s)\n' "$DEFAULT_KEEP"
  printf '  --no-prune    Keep every backup, never delete anything\n'
  printf '  -h, --help    Show this help\n\n'
  printf 'Environment (all optional):\n'
  printf '  PG_CONTAINER  Docker container running Postgres  (default %s)\n' "musicos-db"
  printf '  PG_USER       Database role used for the dump    (default %s)\n' "musicos"
  printf '  PG_DB         Database to dump                   (default %s)\n' "musicos"
  printf '  BACKUP_DIR    Where artefacts are written        (default ./backups)\n'
  printf '  STORAGE_DIR   Local document store               (default apps/api/var/storage)\n\n'
  printf 'Artefacts (one timestamp per run, all in BACKUP_DIR):\n'
  printf '  musicos-<stamp>.dump                custom-format pg_dump\n'
  printf '  musicos-<stamp>.dump.sha256         checksum sidecar\n'
  printf '  musicos-<stamp>.storage.tar.gz      document store (when non-empty)\n'
  printf '  musicos-<stamp>.storage.tar.gz.sha256\n\n'
  printf 'Verify a sidecar later with: cd backups && sha256sum -c musicos-<stamp>.dump.sha256\n'
}

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
warn() { printf '[%s] WARNING: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  printf '[%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
  exit 1
}

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -n "${PENDING:-}" ] && [ -f "$PENDING" ]; then
    printf '[%s] Removing incomplete artefact: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PENDING" >&2
    rm -f -- "$PENDING"
  fi
  return "$status"
}
trap cleanup EXIT

file_size() {
  # wc -c is the only byte count that is stable across GNU, BSD and Git Bash.
  wc -c < "$1" | tr -d '[:space:]'
}

human_size() {
  awk -v b="$1" 'BEGIN {
    split("B KB MB GB TB", unit, " ");
    i = 1;
    while (b >= 1024 && i < 5) { b /= 1024; i++ }
    if (i == 1) printf "%d %s", b, unit[i];
    else printf "%.1f %s", b, unit[i];
  }'
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    die "Neither sha256sum nor shasum is available; cannot write checksums."
  fi
}

write_checksum() {
  local file=$1 dir base
  dir=$(dirname "$file")
  base=$(basename "$file")
  # Record the bare file name, not the absolute path, so the sidecar stays
  # valid when the directory is copied to another host or archive bucket.
  (
    cd "$dir" || exit 1
    printf '%s  %s\n' "$(sha256_of "$base")" "$base" > "$base.sha256"
  )
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
      --keep)
        [ "$#" -ge 2 ] || die "--keep needs a number"
        KEEP="$2"
        shift 2
        ;;
      --keep=*)
        KEEP="${1#*=}"
        shift
        ;;
      --no-prune)
        PRUNE=0
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

  case "$KEEP" in
    '' | *[!0-9]*) die "--keep must be a positive integer, got '$KEEP'" ;;
  esac
  if [ "$KEEP" -lt 1 ]; then
    die "--keep must be at least 1"
  fi
}

prune_backups() {
  local keep=$1
  local -a found=()
  local -a sorted=()
  local f base suffix target removed=0 excess i

  # Timestamps are fixed width and UTC, so lexical order is chronological.
  for f in "$BACKUP_DIR"/musicos-*.dump; do
    [ -f "$f" ] || continue
    found+=("$f")
  done

  if [ "${#found[@]}" -eq 0 ]; then
    return 0
  fi
  mapfile -t sorted < <(printf '%s\n' "${found[@]}" | sort)

  excess=$(( ${#sorted[@]} - keep ))
  if [ "$excess" -le 0 ]; then
    log "Prune: ${#sorted[@]} backup(s) present, keeping $keep -- nothing to delete."
    return 0
  fi

  for ((i = 0; i < excess; i++)); do
    base="${sorted[$i]%.dump}"
    for suffix in '.dump' '.dump.sha256' '.storage.tar.gz' '.storage.tar.gz.sha256'; do
      target="${base}${suffix}"
      # Only ever delete inside BACKUP_DIR, and only exact files we named.
      case "$target" in
        "$BACKUP_DIR"/*) ;;
        *) die "Refusing to delete outside BACKUP_DIR: $target" ;;
      esac
      if [ -f "$target" ]; then
        rm -f -- "$target"
        removed=$((removed + 1))
        log "Pruned: $target"
      fi
    done
  done

  log "Prune: removed $removed file(s) from $((excess)) old backup(s)."
}

main() {
  parse_args "$@"
  require_tools

  mkdir -p "$BACKUP_DIR"

  local stamp dump_file storage_file storage_included=0
  local dump_bytes toc toc_entries server_version

  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  dump_file="$BACKUP_DIR/musicos-$stamp.dump"
  storage_file="$BACKUP_DIR/musicos-$stamp.storage.tar.gz"

  if [ -e "$dump_file" ]; then
    die "Refusing to overwrite existing file: $dump_file (wait one second and retry)"
  fi

  # Record both versions: a dump that is newer than the server you will restore
  # into is unreadable, and this line is the first thing to check afterwards.
  log "pg_dump: $(docker exec "$PG_CONTAINER" pg_dump --version)"
  server_version=$(docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d "$PG_DB" -tA \
    -c 'SHOW server_version;' 2>/dev/null | tr -d '[:space:]' || true)
  log "Server: ${server_version:-unknown}"
  log "Dumping '$PG_DB' from container '$PG_CONTAINER'..."

  PENDING="$dump_file"
  docker exec "$PG_CONTAINER" pg_dump \
    -U "$PG_USER" \
    -d "$PG_DB" \
    --format=custom \
    --no-owner \
    --no-acl > "$dump_file"

  dump_bytes=$(file_size "$dump_file")
  if [ "$dump_bytes" -le 1024 ]; then
    die "Dump is only $dump_bytes bytes, which cannot be a real database. Aborting."
  fi

  # An empty or truncated archive still has a plausible size, so prove that
  # pg_restore can actually parse the table of contents.
  if ! toc=$(docker exec -i "$PG_CONTAINER" pg_restore --list < "$dump_file" 2>/dev/null); then
    die "pg_restore --list cannot read '$dump_file'. The dump is corrupt."
  fi
  toc_entries=$(printf '%s\n' "$toc" | grep -c '^[0-9]' || true)
  if [ "${toc_entries:-0}" -eq 0 ]; then
    die "pg_restore --list reports no objects in '$dump_file'. The dump is empty."
  fi

  write_checksum "$dump_file"
  PENDING=""
  log "Dump ok: $toc_entries archive entries, $dump_bytes bytes."

  # Uploaded PDFs and scans live on disk, not in Postgres. A database-only
  # backup restores rows that point at files nobody has any more.
  if [ ! -d "$STORAGE_DIR" ]; then
    warn "STORAGE_DIR '$STORAGE_DIR' does not exist -- this backup is DATABASE-ONLY."
  elif [ -z "$(find "$STORAGE_DIR" -type f -print -quit 2>/dev/null)" ]; then
    warn "STORAGE_DIR '$STORAGE_DIR' holds no files -- this backup is DATABASE-ONLY."
  else
    local tar_status=0
    PENDING="$storage_file"
    log "Archiving document store '$STORAGE_DIR'..."
    # tar exits 1 when a file changed while it was being read, which happens
    # whenever someone uploads during the backup. The archive is still usable,
    # so warn instead of failing the night; exit 2+ is a real error.
    tar -czf "$storage_file" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")" || tar_status=$?
    if [ "$tar_status" -gt 1 ]; then
      die "tar failed to archive '$STORAGE_DIR' (exit $tar_status)."
    fi
    if [ "$tar_status" -eq 1 ]; then
      warn "tar reported a file changing while it was read; the archive is readable but one upload may be inconsistent."
    fi
    if ! gzip -t "$storage_file" 2>/dev/null; then
      die "Storage archive '$storage_file' failed its gzip integrity check."
    fi
    write_checksum "$storage_file"
    PENDING=""
    storage_included=1
    log "Document store ok: $(human_size "$(file_size "$storage_file")")."
  fi

  if [ "$PRUNE" -eq 1 ]; then
    prune_backups "$KEEP"
  else
    log "Prune: skipped (--no-prune)."
  fi

  printf '\n'
  printf 'Backup complete: %s\n' "$stamp"
  printf '  %-10s %s  (%s)\n' 'dump' "$dump_file" "$(human_size "$(file_size "$dump_file")")"
  printf '  %-10s %s\n' 'checksum' "$dump_file.sha256"
  if [ "$storage_included" -eq 1 ]; then
    printf '  %-10s %s  (%s)\n' 'storage' "$storage_file" "$(human_size "$(file_size "$storage_file")")"
    printf '  %-10s %s\n' 'checksum' "$storage_file.sha256"
  else
    printf '  %-10s %s\n' 'storage' 'NOT INCLUDED -- database-only backup'
  fi
  printf '\n'
  printf 'Retention policy: keep the %s most recent backups in %s' "$KEEP" "$BACKUP_DIR"
  if [ "$PRUNE" -eq 1 ]; then
    printf ' (pruning enabled for this run).\n'
  else
    printf ' (pruning disabled for this run).\n'
  fi
  printf 'These archives contain personal data about minors. Store them\n'
  printf 'encrypted at rest, restrict access, and delete them on schedule\n'
  printf '(GDPR Art. 5(1)(e) and Art. 32).\n'
  printf '\nNext: scripts/db-restore-verify.sh --file %s\n' "$dump_file"
}

main "$@"
