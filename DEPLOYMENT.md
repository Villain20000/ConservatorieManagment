# MusicOS — DevOps, Deployment & Infrastructure Guide

**Document Version:** 1.0.0  
**Target Environments:** Local Development, Staging, Production  
**Infrastructure Philosophy:** Cost-conscious, reproducible, containerized architecture. Monolith with PostgreSQL and Redis. No premature Kubernetes complexity.

---

## 1. Environment Topology

```
                       [ Internet Traffic / Users ]
                                    |
                                    v
                       [ Cloudflare / Edge DNS ]
                        - DDoS Mitigation & WAF
                        - TLS Termination
                                    |
                                    v
                     [ Caddy / Nginx Reverse Proxy ]
                      - Let's Encrypt SSL
                      - Static Asset Cache (/index.html, .js, .css)
                      - API Proxy (/api -> :3000)
                                    |
                +-------------------+-------------------+
                |                                       |
                v                                       v
     [ Angular Web App ]                      [ NestJS API Service ]
     (Static HTML5 / PWA)                     (Node.js 22 Runtime)
                                                        |
                                +-----------------------+-----------------------+
                                |                                               |
                                v                                               v
                     [ PostgreSQL 17 DB ]                              [ Redis Cache / BullMQ ]
                     (Primary Relational Store)                        (Job Queues & Session Cache)
```

---

## 2. Local Development Stack (Docker Compose)

### 2.1 Services Overview (`docker-compose.yml`)
- **`postgres`:** PostgreSQL 17 Alpine running on port `5432` with healthcheck probe.
- **`redis`:** In-memory store for BullMQ background queues.
- **`mailpit`:** (Profile: `mail`) Mock SMTP server running on port `1025` with web UI on port `8025`.

### 2.2 Quick Start Commands
```bash
# 1. Install workspace dependencies
npm install

# 2. Configure environment variables
cp apps/api/.env.example apps/api/.env

# 3. Launch local database
npm run db:up

# 4. Deploy schema migrations
npm run db:migrate

# 5. Seed demonstration dataset (Armonia & Melodia conservatories)
npm run db:seed

# 6. Start API (:3000) and Web (:4200) concurrently
npm run dev
```

---

## 3. Environment Variable Configuration

The API validates all environment configuration on boot using a strict schema:

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Runtime environment mode | `development` / `production` |
| `PORT` | API listening port | `3000` |
| `DATABASE_URL` | PostgreSQL connection pool URI | `postgresql://musicos:musicos@localhost:5432/musicos` |
| `JWT_SECRET` | Secret key for signing short-lived access JWTs | Min. 32-character high-entropy string |
| `JWT_EXPIRES_IN` | Access token lifetime | `15m` |
| `REFRESH_COOKIE_SECRET` | Secret for verifying refresh cookies | Min. 32-character high-entropy string |
| `COOKIE_DOMAIN` | Domain for setting SameSite auth cookies | `localhost` or `.musicos.gr` |
| `STORAGE_DRIVER` | File storage provider adapter | `local` / `s3` |
| `STORAGE_LOCAL_PATH` | Local filesystem path for uploaded files | `./var/storage` |
| `SMTP_HOST` | Transactional email server host | `localhost` |
| `SMTP_PORT` | SMTP port | `1025` (local) / `587` (TLS) |
| `SMTP_USER`, `SMTP_PASS` | SMTP authentication credentials | Secret |
| `APP_ORIGIN` | Allowed client origin for CORS | `http://localhost:4200` |

---

## 4. Production Deployment & Build Workflow

### 4.1 Production Builds
```bash
# Build API distribution (outputs to apps/api/dist)
npm run build:api

# Build Web distribution (outputs to apps/web/dist/web)
npm run build:web
```

### 4.2 Database Migration Pipeline
Schema migrations are strictly executed via Prisma CLI in CI/CD before updating application code:
```bash
# Apply pending production migrations safely
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
```

### 4.3 Production Static Serving & Proxying (Caddyfile Example)
```caddy
musicos.gr, www.musicos.gr {
    encode gzip zstd

    # Serve compiled Angular static frontend
    root * /var/www/musicos/apps/web/dist/web/browser
    file_server

    # Forward API and Swagger requests to NestJS
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # Fallback to index.html for Angular HTML5 routing
    try_files {path} /index.html
}
```

---

## 5. Health Probes, Observability & Graceful Shutdown

- **Liveness Probe (`GET /api/health/liveness`):** Validates that the Node.js event loop is responsive.
- **Readiness Probe (`GET /api/health/readiness`):** Verifies active database connection pool health.
- **Structured JSON Logging:** In production, logs output standardized JSON with timestamps, log levels, tenant context, and request IDs.
- **Graceful Shutdown:** The NestJS API hooks into `SIGTERM` and `SIGINT`, draining active HTTP connections and waiting for open Prisma transactions to commit before terminating.

---

## 6. Backup & Disaster Recovery Runbook

Full operational backup and restoration procedures are documented in detail in `docs/operations/backup-restore.md`.
- **Nightly Logical Snapshots:** Automated `pg_dump` with custom format compression.
- **Off-Site Replication:** Encrypted snapshots replicated to geographically separate object storage.
- **Restore Verification:** Automated test restore executed weekly into an isolated staging container to verify backup integrity.
