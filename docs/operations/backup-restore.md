# Backup and restore

This is the runbook for keeping the conservatory's data recoverable. It is
written for whoever is on call, not for the person who wrote the schema.

**The one rule:** a backup that has never been restored is not a backup, it is
a hope. Every drill in this document ends with `RESTORE VERIFIED` or it is not
finished.

Two scripts do all the work:

| Script | What it does | Safe to run against production? |
| --- | --- | --- |
| `scripts/db-backup.sh` | Dumps the database, tars the document store, checksums both | Yes, read-only on the database |
| `scripts/db-restore-verify.sh` | Restores the newest dump into `musicos_verify` and compares row counts | Yes, never touches `musicos` |

Neither script installs or needs `psql`/`pg_dump` on the host. Every client
command is executed inside the `musicos-db` container, because a host client of
a different major version is a classic way to produce a dump you cannot restore.

---

## 1. What is protected, and what is not

**Backed up**

- The whole `musicos` database, as a Postgres *logical* dump in custom format
  (`pg_dump --format=custom --no-owner --no-acl`). That covers every table:
  tenants, students, guardians, enrollments, charges, payments, document
  records, users, audit logs, and the `_prisma_migrations` history.
- The local document store at `apps/api/var/storage` (or `STORAGE_DIR`), as a
  `.tar.gz`. Issued PDFs and uploads live here on disk, and database rows point
  at them by key. A database-only restore gives you rows that reference files
  nobody has any more.

**Not backed up**

- **No WAL archiving, therefore no point-in-time recovery.** You can only go
  back to the moment of the last dump. If the disk dies at 14:00, everything
  written since 02:00 is gone.
- The Postgres data volume itself, server configuration, `.env` files, secrets,
  mail, application logs, and build output.
- Anything stored outside `STORAGE_DIR` by a future integration.

**Recovery objectives, as they actually stand**

- **RPO** (how much data you can lose) = time since the last successful backup.
  With the nightly schedule below that is up to 24 hours.
- **RTO** (how long recovery takes) = the time to restore the dump, extract the
  storage tarball and run the verification. Do not guess this number: measure it
  in a drill and write it down. It grows with database size and disk speed.

---

## 2. Before you run anything

- The `musicos-db` container is running (`docker compose up -d db`).
- `docker` is on your `PATH`, and you have `bash`, `tar`, `gzip` and
  `sha256sum` (Git Bash on Windows provides all of these).
- You are in the repository root. Both scripts default to `./backups` and
  `apps/api/var/storage`, which are relative paths.
- The database role must be allowed to create databases (`CREATEDB`), because
  the drill creates `musicos_verify` and the real restore creates a fresh
  `musicos`. In the local Docker setup `musicos` is the superuser, so this is
  already true; on a managed Postgres, grant it or run with an admin role via
  `PG_USER`.

Optional environment overrides, for a server where names differ:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PG_CONTAINER` | `musicos-db` | Container running Postgres |
| `PG_USER` | `musicos` | Role used for dump/restore |
| `PG_DB` | `musicos` | Database being dumped |
| `BACKUP_DIR` | `./backups` | Where artefacts are written |
| `STORAGE_DIR` | `apps/api/var/storage` | Local document store |

---

## 3. Taking a backup

```bash
./scripts/db-backup.sh
```

With explicit retention:

```bash
./scripts/db-backup.sh --keep 14
./scripts/db-backup.sh --no-prune      # never delete anything this run
./scripts/db-backup.sh --help
```

Each run creates up to four files in `BACKUP_DIR`, all sharing one UTC
timestamp:

```
musicos-20261025T020000Z.dump                     the database
musicos-20261025T020000Z.dump.sha256              its checksum
musicos-20261025T020000Z.storage.tar.gz           the document store
musicos-20261025T020000Z.storage.tar.gz.sha256    its checksum
```

### What the script verifies before it says "complete"

1. The dump is larger than 1 KB. A 0-byte or stub file is a failure, not a
   backup.
2. `pg_restore --list` can parse the archive and reports at least one object in
   its table of contents. Size alone proves nothing; this proves the file is
   readable by the tool that will restore it.
3. The storage tarball passes `gzip -t`. If someone uploaded a file while `tar`
   was reading it, `tar` exits 1: the archive is still readable, so the run
   warns rather than fails. Exit 2 or worse aborts the backup.
4. A `.sha256` sidecar is written for each artefact, containing the bare file
   name so it stays valid after the directory is copied elsewhere.

If any step fails the script exits non-zero, prints the reason on stderr, and
**deletes the half-written file** so nothing on disk can be mistaken for a good
backup. A dump that failed verification is removed; a dump that passed is kept
even if the storage tarball afterwards fails.

### The database-only case

If `STORAGE_DIR` does not exist or contains no files, the script prints a
warning and produces a **database-only** backup, and the summary says
`NOT INCLUDED`. That is correct for a fresh install where nobody has uploaded
anything yet. Once the conservatory is live, a database-only backup is a
problem: if you expected documents and see that line, treat the run as failed
and investigate before the next night.

### Checking a backup by hand

```bash
cd backups
sha256sum -c musicos-20261025T020000Z.dump.sha256
sha256sum -c musicos-20261025T020000Z.storage.tar.gz.sha256
tar -tzf musicos-20261025T020000Z.storage.tar.gz | head
```

The tarball contains one top-level directory named after the basename of
`STORAGE_DIR` (normally `storage/`). Remember that when extracting — see §5.

---

## 4. Verifying a restore (the drill)

```bash
./scripts/db-restore-verify.sh                    # newest dump in ./backups
./scripts/db-restore-verify.sh --file backups/musicos-20261025T020000Z.dump
```

What it does, in order:

1. Picks the newest `musicos-*.dump` (or the `--file` you gave it) and refuses
   to continue if the file is missing or empty.
2. Verifies the `.sha256` sidecar, if there is one. If the sidecar is missing it
   warns and continues; a backup without a checksum cannot be trusted to be the
   file that was written.
3. Drops `musicos_verify` if it exists, then creates it fresh.
4. Runs `pg_restore --no-owner --no-acl --exit-on-error` into `musicos_verify`.
   `--exit-on-error` matters: a partially restored database must never be
   reported as verified.
5. Compares `count(*)` for `tenants`, `students`, `charges`, `payments` and
   `document_records` between the restored copy and the live database. The
   tolerance is **zero** — exact match. Each table prints `ok` or `MISMATCH`
   with both numbers.
6. Requires `SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT
   NULL` to be greater than zero, so a restored database is one the application
   can actually migrate and start against.
7. Drops `musicos_verify` on success. On failure it **keeps** it, prints the
   database name and the commands to inspect and drop it.

Expected output:

```
Row counts (tolerance: 0, exact match required):
  tenants            ok        source=1 restored=1
  students           ok        source=412 restored=412
  charges            ok        source=5310 restored=5310
  payments           ok        source=3987 restored=3987
  document_records   ok        source=866 restored=866

Migration history:
  _prisma_migrations ok        applied migrations=9

RESTORE VERIFIED (74s)
```

Exit status is 0 only with the `RESTORE VERIFIED` line. Anything else is
`RESTORE FAILED` and a non-zero exit.

**One caveat that produces false failures.** The dump is a snapshot from time
T, but the source counts are read at time T+n. If the API writes to the database
between the two, an exact comparison fails and the drill reports `MISMATCH` even
though the restore was perfect. Run the verification immediately after a backup,
or in a quiet window, or accept that it is only meaningful when the source is
not being written to.

---

## 5. Real restore into the primary database

This is the emergency procedure. It is deliberately slower than it needs to be:
the old database is renamed aside and kept until someone signs off. Nothing is
dropped in place.

```bash
# 0. Work from the repository root.
cd /srv/musicos

# 1. Stop the API so nothing is writing and no connections remain.
#    The API is a Node process, not a compose service in this repo:
#      production:  sudo systemctl stop musicos-api   (or kill the node process)
#      development: Ctrl-C the terminal running "npm run dev:api"
#    Confirm nothing is connected before continuing:
#      docker exec musicos-db psql -U musicos -d postgres \
#        -c "SELECT pid, usename, application_name FROM pg_stat_activity WHERE datname = 'musicos';"

# 2. Preserve the current state, even if it looks broken. --no-prune because
#    retention may otherwise delete the very file you are about to need.
./scripts/db-backup.sh --no-prune

# 3. Move the current database aside. ALTER ... RENAME fails if anyone is
#    still connected, which is why step 1 comes first.
docker exec musicos-db psql -U musicos -d postgres -v ON_ERROR_STOP=1 \
  -c 'ALTER DATABASE musicos RENAME TO musicos_before_restore_20261025'

# 4. Create an empty database and restore into it.
docker exec musicos-db createdb -U musicos musicos
docker exec -i musicos-db pg_restore -U musicos -d musicos \
  --no-owner --no-acl --exit-on-error \
  < backups/musicos-20261025T020000Z.dump

# 5. Restore the documents next to the API. The archive holds a single
#    top-level directory (storage/), so extract it into the parent directory.
tar -xzf backups/musicos-20261025T020000Z.storage.tar.gz -C apps/api/var

# 6. Apply any migration that is newer than the dump.
npm run prisma:deploy --workspace apps/api

# 7. Sanity-check before letting users back in.
docker exec musicos-db psql -U musicos -d musicos -c 'SELECT count(*) FROM students;'
docker exec musicos-db psql -U musicos -d musicos -c 'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;'

# 8. Start the API again and log in as a real user.
#      production:  sudo systemctl start musicos-api
#      development: npm run dev
```

Notes that save time in an incident:

- Do **not** use `npm run db:migrate` here. The root script maps to
  `prisma migrate dev`, which is a development command and may reset data. The
  production-safe command is `prisma migrate deploy`, exposed as
  `npm run prisma:deploy --workspace apps/api`.
- `pg_restore --exit-on-error` stops at the first SQL error. Read the message
  before retrying; usually it is a schema mismatch (§8) or a missing extension.
- If the dump predates the running code, step 6 brings the schema forward. If it
  postdates the code, deploy the matching application version instead.

**Do not drop `musicos_before_restore_20261025` until** the API has run for a
full business day and someone has confirmed the ledgers and documents. Then:

```bash
docker exec musicos-db psql -U musicos -d postgres -v ON_ERROR_STOP=1 \
  -c 'DROP DATABASE musicos_before_restore_20261025 WITH (FORCE);'
```

Keep the dump file itself for at least one retention cycle after that.

---

## 6. Schedule

### Linux server (cron)

Nightly at 02:00, logging to a file that logrotate should pick up:

```
# /etc/cron.d/musicos-backup
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin
0 2 * * * musicos cd /srv/musicos && ./scripts/db-backup.sh --keep 14 >> /var/log/musicos/backup.log 2>&1
```

- Put it in `/etc/cron.d/` with the user field (as above), or in the service
  account's own crontab with `crontab -e` (no user field there).
- Cron starts with a minimal `PATH`. That is why the file sets `PATH`
  explicitly; if `docker` lives elsewhere, add its directory.
- Cron does not rotate logs. Add a `logrotate` rule or the file grows forever.
- Set `MAILTO=` to an address someone reads, so a failing run is not silent.

An optional second line, at 03:00, gives you a nightly restore proof:

```
0 3 * * * musicos cd /srv/musicos && ./scripts/db-restore-verify.sh >> /var/log/musicos/verify.log 2>&1
```

That is cheap insurance, but it is not a substitute for the monthly manual
drill in §7 — a script cannot tell you whether the documents open.

### Windows host (Task Scheduler)

The pilot may run on a Windows machine. Create a task with:

- **Program/script:** `C:\Program Files\Git\bin\bash.exe`
- **Add arguments:**
  `-lc "cd /c/srv/musicos && ./scripts/db-backup.sh --keep 14 >> backups/backup.log 2>&1"`
- **Start in:** `C:\srv\musicos`
- **Trigger:** daily, 02:00
- **Settings:** "Run task as soon as possible after a scheduled start is missed"

`-l` makes it a login shell so `docker` is on `PATH`. Two Windows-specific
traps:

1. **Docker Desktop must be running.** If it is not, the container does not
   exist and the script exits with "Container 'musicos-db' is not running".
   That is a loud failure by design — but it means the task must run as the
   account that starts Docker Desktop, and it will not work when that user is
   logged off unless Docker is configured as a service.
2. Paths inside the `-lc` string are Git Bash paths (`/c/...`), not `C:\...`.

Check the history in Task Scheduler after the first night; "Last Run Result"
must be `0x0`.

---

## 7. Retention, and the data protection duty

**Policy: 14 daily backups**, pruned automatically. `--keep N` changes the
number for one run; `--no-prune` disables deletion entirely.

Pruning only ever considers files matching `musicos-*.dump` directly inside
`BACKUP_DIR`, and it deletes each artefact of a pruned run by exact name — the
dump, its sidecar, the storage tarball and its sidecar. It never removes a
directory and never touches anything outside `BACKUP_DIR`.

**These archives are full of personal data about children.** Student names,
dates of birth, guardian contact details, medical notes, payment history and
scanned identity documents. Treat a backup file exactly like the production
database:

- **Encrypt at rest.** The scripts do **not** encrypt; they write plaintext.
  Put `BACKUP_DIR` on an encrypted volume (LUKS, BitLocker, or an encrypted
  object-store bucket), or pipe through `age`/`gpg` before the file leaves the
  host. An unencrypted dump on a laptop or a USB stick is a reportable breach
  waiting to happen.
- **Restrict access.** Only the operators who need it, and only the backup
  directory — not a shared drive the whole staff can browse.
- **Delete on schedule.** GDPR Art. 5(1)(e) (storage limitation) means keeping
  every nightly dump forever is itself a compliance problem. Fourteen days is
  the retention decision; honour it.
- **GDPR Art. 32** requires appropriate technical measures for confidentiality
  and integrity — encryption plus access control is the minimum here.
- Backups are in scope for **Art. 15 (access)** and **Art. 17 (erasure)**
  requests. Note in your processing record (Art. 30) that backups exist, where
  they are, and how long they are kept, so a request can be answered honestly.
- Copying a dump to a personal device, or to a cloud account nobody approved,
  makes that provider a processor. Don't.

---

## 8. Restore drills

**Monthly, on a fixed date.** A drill is:

1. `./scripts/db-backup.sh` — fresh artefact.
2. `./scripts/db-restore-verify.sh` — must print `RESTORE VERIFIED`.
3. Open two or three restored documents from the extracted tarball and confirm
   they are the real PDFs, not placeholders.
4. Record the drill.

A drill **must be recorded**. A verification nobody wrote down cannot be shown
to an auditor, a parent or an insurer. Record at least:

| Field | Example |
| --- | --- |
| Date and operator | 2026-11-02, A. Papadopoulos |
| Dump file and checksum | `musicos-20261102T020000Z.dump`, `3f9c…` |
| Postgres version (source and target) | 17.2 / 17.2 |
| Row counts checked | 5 tables, all `ok` |
| Wall-clock duration | 74 s |
| Outcome | `RESTORE VERIFIED` |
| Follow-up actions | none |

Keep the record with the pilot's operational documents, not in a chat thread.
If a drill fails, the drill is not "done" until the cause is fixed and a later
drill passes.

---

## 9. Failure modes

### The dump succeeds but there is no storage tarball

*Symptom:* the summary says `storage  NOT INCLUDED -- database-only backup`, or
a warning that `STORAGE_DIR` is missing or empty.

*Cause:* `STORAGE_DIR` is wrong (the API writes to a different directory), the
directory is empty because uploads go somewhere else, or the API runs in a
container with its own volume that this script cannot see.

*Action:* find where the API actually writes (the `STORAGE_DIR` environment
variable of the API process) and point the script at the same path. Until then,
every restore will produce database rows whose documents are gone — the
`stored_files` table will reference keys with no file behind them. Compare
`SELECT count(*) FROM stored_files;` against the number of files under
`STORAGE_DIR` to size the damage.

### Restoring into a database with a different major version

*Symptom:* `pg_restore: error: unsupported version (1.15) in file header`, or
errors about `pg_catalog` functions that do not exist.

*Cause:* the dump was written by a newer `pg_dump` than the server you are
restoring into. Custom-format archives are forward-compatible only in one
direction: a newer `pg_restore` can usually read an older archive, not the
reverse.

*Action:* restore with the same image tag the dump came from
(`postgres:17-alpine` here). Both scripts log the client and server versions
they used at the start of a run — keep those lines in the log. If you must move versions, restore into a
matching throwaway container, then `pg_dump` again from there with the target
version's binary.

### Unique-constraint surprises after restoring an old dump into a newer schema

*Symptom:* `pg_restore: error: could not execute query … duplicate key value
violates unique constraint`.

*Cause:* the dump is older than the running schema. New migrations added unique
indexes or backfilled columns, and the old rows violate them. This is also what
happens if you restore *on top of* a database that already has data instead of
into an empty one.

*Action:* always restore into a freshly created, empty database (§5 step 4),
then run `prisma migrate deploy` to bring the schema forward. Never restore into
a database that still holds rows. If the conflict is in business data rather
than schema — for example duplicate document numbers in `number_sequences` —
stop and involve whoever owns the numbering rules; do not "fix" it with
`ON CONFLICT DO NOTHING`, which silently discards financial records.

### `ALTER DATABASE ... RENAME` fails with "is being accessed by other users"

*Cause:* the API, a `psql` session, or a connection pool still holds a
connection. Prisma keeps idle connections open.

*Action:* stop the API first (§5 step 1) and close your own sessions. Check with
`SELECT pid, usename, application_name FROM pg_stat_activity WHERE datname =
'musicos';`. Do not use `pg_terminate_backend` on the live database unless you
have stopped the application — it will just reconnect.

### A failed drill left `musicos_verify` behind

That is intentional: the wreckage is kept so you can look at it.

```bash
docker exec -it musicos-db psql -U musicos -d musicos_verify
# then, when finished:
docker exec musicos-db psql -U musicos -d postgres \
  -c 'DROP DATABASE "musicos_verify" WITH (FORCE);'
```

`WITH (FORCE)` disconnects leftover sessions. It needs Postgres 13 or newer;
this deployment runs 17. On an older server, drop the option and disconnect
manually.

### The scheduled task fails and nobody notices

*Symptom:* no new files in `BACKUP_DIR` for several days.

*Action:* alert on the absence of a backup, not on the script's exit code.
A simple check is "newest `musicos-*.dump` older than 36 hours → page someone".
Without that, cron's silence looks exactly like success. Also check the
`MAILTO` address or the Task Scheduler history is actually being read.

---

## 10. Multi-instance caveat

The API uses `@nestjs/schedule` for in-process cron jobs (for example the
overdue-fee sweep at 05:00 Europe/Athens in
`apps/api/src/modules/finance/finance.scheduler.ts`). In-process schedulers
assume **exactly one API instance**. With two replicas, every scheduled job
runs twice, and two backup jobs racing for the same `BACKUP_DIR` will interleave
files and prune each other's work.

This is why backups here are driven by the host (cron or Task Scheduler) rather
than by the application. If you scale the API horizontally:

- keep the backup job outside the API, or make it hold a Postgres advisory lock
  so only one instance proceeds;
- set `SCHEDULER_ENABLED=false` on all but one instance, which the existing
  scheduler already honours, so fee sweeps and notifications do not double-fire;
- remember that `STORAGE_DIR` must then be a shared volume, not a per-instance
  local directory, or a restore will only recover the documents written by one
  replica.
