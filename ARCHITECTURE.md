# MusicOS — System Architecture & Technical Design

**Document Version:** 1.0.0  
**Target Environments:** Local (Docker Compose), Staging, Production  
**Stack Overview:** Angular 22 (Zoneless, Signals) + Tailwind CSS 4 + NestJS 12 (ESM) + PostgreSQL 17 + Prisma 7 + Redis / BullMQ

---

## 1. High-Level Architectural Vision

MusicOS is engineered as a **modular monolith** optimized for enterprise-grade reliability, strict multi-tenant security, predictable performance, and maintainable domain boundaries.

```
                           +---------------------------------------+
                           |             Web Clients               |
                           |  (Desktop, Tablet, Responsive PWA)   |
                           +-------------------+-------------------+
                                               |
                                     HTTPS / WSS / REST
                                               |
                                               v
                           +---------------------------------------+
                           |       Reverse Proxy / Cloudflare      |
                           |       (TLS, WAF, Edge Rate-Limits)    |
                           +-------------------+-------------------+
                                               |
                                               v
                           +---------------------------------------+
                           |          NestJS 12 API Monolith       |
                           |  - Global Guards (JWT, Tenant, RBAC)  |
                           |  - Feature Modules (Academics, etc.)  |
                           |  - BullMQ Queue Producers / Consumers |
                           +---------+-------------------+---------+
                                     |                   |
                     Database I/O    |                   | Redis Commands
                     (Prisma 7 Client|                   | (ioredis)
                                     v                   v
                    +--------------------+      +--------------------+
                    |   PostgreSQL 17    |      |    Redis Cache     |
                    |   (Relational DB,  |      |   & BullMQ State   |
                    |   UUIDv7, JSONB)   |      |                    |
                    +--------------------+      +--------------------+
                                     |
                                     | Outbox Worker
                                     v
                        +----------------------------+
                        | External Integration Adapters
                        | - Transactional Mail (SMTP)
                        | - S3-Compatible Object Store
                        | - E-Signature Providers
                        | - Certified Invoicing (AADE)
                        +----------------------------+
```

---

## 2. Multi-Tenancy & Security Architecture

### 2.1 Shared Schema with Strict Row-Level Scoping
MusicOS adopts a **shared database, shared schema** architecture. Every tenant-owned table explicitly includes a `tenantId UUID` column:
- **No Client-Supplied Tenant Identifiers:** The active tenant identifier is derived exclusively from the cryptographically verified JWT access token.
- **Probe-Resistant 404s:** When an actor requests a resource belonging to another conservatory, the API returns `404 Not Found` rather than `403 Forbidden`, preventing tenant existence enumeration.
- **Database Composite Foreign Keys:** Relational integrity is enforced at the database level with composite foreign keys `(tenantId, resourceId) REFERENCES parentTable(tenantId, id)`. This mathematically prevents a record in Tenant A from referencing a room, teacher, or branch in Tenant B.

### 2.2 Authentication & Session Flow
- **Access Credentials:** 15-minute short-lived JSON Web Tokens (JWT) kept in frontend memory.
- **Refresh Credentials:** 30-day rotating opaque tokens stored in `httpOnly`, `SameSite=Strict`, `Secure` cookies (`musicos_refresh`).
- **Session Revocation:** Refresh tokens are tracked in the database (`sessions` table) and revoked on password reset or explicit logout.
- **Password Security:** Hashed with Argon2id using OWASP-recommended parameters (memory cost, iterations, parallelism).
- **Multi-Factor Authentication (MFA):** Mandatory TOTP (RFC 6238) for Super Admin and Director roles; optional for teachers and secretariat.
- **Multi-Tenant Membership:** Users can belong to multiple conservatories. Upon login, users select an active tenant, minting a tenant-scoped session token.

### 2.3 Super Admin Support Access Mode
Direct, silent impersonation of tenants is architecturally forbidden. Super administrators must request a time-limited, audited **Support Access Grant**:
1. Super admin initiates a support request specifying the `tenantId`, `reason`, and requested duration (maximum 60 minutes).
2. The grant is logged to an immutable audit record and active support banner displays across the UI.
3. Access is strictly read-only and can be immediately revoked by either the tenant director or the super admin.

---

## 3. Backend Architecture (NestJS 12)

The backend is built as an ESM-native NestJS application structured around cohesive domain modules.

### 3.1 Architectural Layering
Every module strictly adheres to a unidirectional data flow:
```
[ HTTP Request ]
       |
       v
[ Controller ]
  - Swagger Documentation
  - DTO Validation (`ValidationPipe`, whitelist, transform)
  - HTTP Status Mapping
       |
       v
[ Application Service ]
  - Tenant Context Resolution (`TenantContext`)
  - RBAC & Entitlement Checks
  - Transaction Orchestration (`prisma.$transaction`)
  - Outbox Notification Dispatch
       |
       v
[ Domain Logic / Rules Engine ]
  - Pure Calculations (e.g. `finance.rules.ts`, timetable conflict engine)
  - State Machine Transition Validation
       |
       v
[ Database Persistence ]
  - Prisma 7 Extended Client
  - Soft-delete filtering (`deletedAt == null`)
  - Automated Audit Logging
```

### 3.2 Backend Module Taxonomy
```
apps/api/src/
  common/             Cross-cutting decorators, guards, exceptions, DTOs, entitlements
  config/             Environment variable schemas and type-safe configuration
  database/           Prisma service, client extensions, and connection pooling
  infrastructure/     Transactional mailer, template renderer, PDF generator
  modules/
    auth/             Authentication, refresh token rotation, MFA, password reset
    platform/         Super Admin console, tenant provisioning, support access grants
    tenants/          Tenant settings, branding, branch configuration, entitlements
    academics/        Departments, instruments, study levels, academic years, courses
    people/           Students, guardians, teachers, contracts, relationships
    scheduling/       Lesson series, occurrences, room reservations, conflict engine
    attendance/       Daily attendance register, lateness tracking, makeup credit ledger
    assignments/      Weekly assignments, student submissions, file review, grading
    exams/            Exam periods, committee formation, applications, results, minutes
    finance/          Charges, payments, oldest-first allocation, receipts, discounts
    documents/        Template catalog, protocol numbering, vector PDF rendering
    announcements/    Broadcast announcements, audience targeting, pin lifecycle
    dashboard/        Aggregated executive, teacher, and secretariat KPIs
    portal/           Secure endpoints tailored for students and parents
    crm/              Admissions CRM leads, activities, pipeline stages, conversion
    trash/            Centralized soft-delete recovery and permanent purge operations
    health/           Kubernetes/Docker liveness and readiness probe endpoints
```

---

## 4. Frontend Architecture (Angular 22 Standalone)

The frontend is constructed using modern Angular standalone components, signals, and Tailwind CSS 4.

### 4.1 Core Design Patterns
- **Zoneless Signal Reactivity:** Eliminates Zone.js overhead; leverages Angular Signals (`signal()`, `computed()`, `effect()`) for granular UI updates.
- **Feature-Driven Directory Structure:** Clean separation of concerns with lazy-loaded route modules.
- **Route Guards & Permissions:** Multi-tier route resolution verifying authentication, active tenant selection, and granular RBAC permissions.
- **Centralized Error & Notification Handling:** Global HTTP interceptors managing 401 refresh token retry loops, 403 access alerts, and 404 resource notifications.
- **Bilingual Internationalization (Transloco):** Native runtime switching between Greek (`el`) and English (`en`), with Greek as the authoritative default.

### 4.2 Frontend Directory Structure
```
apps/web/src/app/
  core/               Authentication services, token management, HTTP interceptors, i18n
  layouts/            AppShell, Topbar, Sidebar, PortalShell, SupportModeBanner
  shared/             Reusable UI primitives (Buttons, Modals, Tables, Status Badges)
  features/
    auth/             Login, tenant selector, MFA challenge, password recovery
    dashboard/        Director, administrator, and teacher dashboard widgets
    students/         Student registry, registration forms, student dossier
    teachers/         Faculty directory, availability editor, teaching timetable
    academics/        Academic years, department hierarchies, curriculum programs
    schedule/         Interactive master calendar, lesson drawer, conflict alerts
    attendance/       Daily attendance register, bulk confirmation, makeup credits
    assignments/      Teacher assignment creator, submission grading workspace
    exams/            Exam period setup, committee management, grading rosters
    finance/          Student ledgers, charge generator, payment recorder, receipts
    documents/        Document catalog, template editor, protocol number registry
    announcements/    School-wide announcement management
    crm/              Admissions pipeline board, lead activity timeline
    portal/           Student and Guardian multi-child learning & billing portal
    practice/         Interactive metronome, chromatic tuner, sheet music viewer
    platform/         Super Admin tenant provisioning and support access tools
    settings/         Conservatory settings, branch management, fee schedules
```

---

## 5. Database Architecture & Data Integrity

### 5.1 Storage & Performance Specifications
- **PostgreSQL 17:** Primary transactional data store leveraging relational integrity and JSONB where flexibility is required.
- **UUIDv7 Primary Keys:** Time-ordered, cryptographically unique 128-bit identifiers ensuring natural chronological indexing without table fragmentation.
- **Integer Cent Arithmetic:** All financial balances, charges, and payments are strictly stored as 64-bit integers (`cents`), eliminating IEEE-754 floating-point rounding errors.
- **Atomic Protocol Numbering:** Sequence-based, gapless document and receipt numbering maintained via database-level transactional locks (`SELECT ... FOR UPDATE`).
- **Soft Deletion (`deletedAt`):** Accidental deletion protection across all primary entities; automatic exclusion via Prisma client extensions.

### 5.2 Transactional Outbox Pattern
Background notifications and emails use a transactional outbox table (`outbox_messages`). Domain events are written to the database within the primary business transaction. A reliable worker processes the outbox and dispatches jobs to Redis / BullMQ, ensuring zero message loss if an external SMTP or push service fails.

---

## 6. Resilience, Scalability & DevOps

- **Containerization:** Production Docker images with non-root runtime users and multi-stage builds.
- **Zero-Downtime Database Migrations:** Backward-compatible Prisma migrations deployed during CI/CD pipelines.
- **Observability:** Structured JSON logging, Prometheus-compatible health endpoints (`/api/health`), and OpenTelemetry trace context propagation.
- **Disaster Recovery:** Automated daily pg_dump backups with verified encryption and tested restore runbooks.
