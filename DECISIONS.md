# MusicOS — Architecture Decision Records (ADR)

**Document Version:** 1.0.0  
**Status:** Approved Engineering Decisions  
**Purpose:** Maintain an auditable history of foundational architectural choices, trade-offs, and consequences.

---

## ADR 001: Modular Monolith vs. Distributed Microservices

### Context
Music conservatories require complex transactions spanning student enrollment, recurring scheduling, attendance, and financial ledgers. Introducing distributed microservices at this stage would introduce high operational overhead, distributed transaction failures, network latency, and deployment complexity.

### Decision
Build MusicOS as a **cohesive modular monolith** using NestJS 12. Each domain (academics, people, scheduling, finance, exams, documents, CRM) is isolated in a modular directory with clear service interfaces and bounded contexts.

### Consequences
- **Positive:** ACID transactions across relational boundaries (`prisma.$transaction`), simplified zero-downtime deployments, local developer ergonomics, zero inter-service network serialization.
- **Negative:** Requires rigorous module encapsulation discipline to prevent circular dependencies or accidental leakage of service internals.

---

## ADR 002: Multi-Tenancy via Shared Database & Row-Level Scoping

### Context
The platform must serve hundreds of music schools cost-effectively, ranging from small private academies (50 students) to large metropolitan conservatories (1,000+ students). Dedicated database instances per tenant would cause exorbitant infrastructure costs and slow migration rollouts.

### Decision
Implement a **shared database, shared schema** architecture. Every tenant-owned row carries an indexed `tenantId UUID` column. Tenancy is derived exclusively from verified JWT access tokens, and all queries are strictly filtered by tenant context. Foreign record lookups return `404 Not Found` rather than `403 Forbidden` to prevent tenant probing.

### Consequences
- **Positive:** Cost-effective infrastructure, instantaneous tenant provisioning, single migration pipeline, unified database connection pooling.
- **Negative:** Crucial responsibility placed on database queries and service layers to never omit tenant scoping. Mitigated by ADR 007.

---

## ADR 003: Angular 22 Zoneless Architecture with Signals

### Context
Traditional Angular applications rely on Zone.js for monkey-patching asynchronous browser APIs to trigger global change detection cycles. For high-density, real-time UI components like music timetables, canvas PDF viewers, and audio playback waveform tools, global change detection introduces noticeable UI micro-stutters and performance degradation.

### Decision
Adopt **Angular 22 Standalone Components with Zoneless Signal Reactivity**. State is managed locally using Angular Signals (`signal()`, `computed()`, `effect()`), while asynchronous data streams leverage RxJS.

### Consequences
- **Positive:** Pinpoint change detection with zero Zone.js bundle overhead, exceptional performance during audio and drag-and-drop operations, clean declarative reactivity.
- **Negative:** Developers must adhere to signal-based idioms and avoid legacy imperative property mutation.

---

## ADR 004: JWT In-Memory Access Tokens with HttpOnly Rotating Refresh Cookies

### Context
Storing authentication tokens in browser `localStorage` or `sessionStorage` exposes users to token theft via Cross-Site Scripting (XSS). Conversely, pure server-side session stores increase Redis/DB lookup latency on every API request.

### Decision
Implement a hybrid session architecture:
1. Short-lived (15-minute) JWT access tokens maintained **only in client memory** (lost on tab close).
2. Long-lived (30-day) rotating refresh tokens stored in an `httpOnly`, `Secure`, `SameSite=Strict` cookie (`musicos_refresh`).
3. Refresh calls automatically rotate tokens; token reuse detection immediately revokes the session family.

### Consequences
- **Positive:** Immune to XSS token exfiltration via `localStorage`, zero database lookups for standard API requests, immediate revocability via refresh database records.
- **Negative:** Requires transparent HTTP interceptor logic in Angular to handle silent 401 token refresh retries.

---

## ADR 005: PostgreSQL 17 with UUIDv7 Primary Keys

### Context
Random UUIDv4 primary keys cause B-tree index fragmentation in PostgreSQL due to non-sequential insertions, degrading write throughput on large tables (e.g. attendance, audit logs). Traditional auto-incrementing integers leak business volume and create multi-tenant collision risks.

### Decision
Adopt **UUIDv7** as the primary key standard across all entities. UUIDv7 combines a Unix millisecond timestamp prefix with cryptographically random bits.

### Consequences
- **Positive:** Sequential B-tree indexing with zero fragmentation, client-side generation capability, collision-free global uniqueness, natural chronological sorting.
- **Negative:** Requires UUIDv7 generation utility library on application boot until PostgreSQL native functions land in upcoming distributions.

---

## ADR 006: Integer Cent Monetary Arithmetic

### Context
Floating-point arithmetic (IEEE-754 standard in JavaScript and database `FLOAT`) causes cumulative rounding errors (e.g., `0.1 + 0.2 === 0.30000000000000004`). In a conservatory billing ledger handling thousands of partial tuition payments, rounding discrepancies undermine audit compliance.

### Decision
Store all financial values (charges, payments, allocations, balances, discounts) as **64-bit integer cents** (`cents BIGINT`). Zero floating-point money columns exist in the schema.

### Consequences
- **Positive:** Exact, reproducible arithmetic; zero rounding errors; seamless integration with banking and payment gateway specifications.
- **Negative:** Requires formatting transformations in UI display layers (dividing by 100 for display, multiplying by 100 on form submit).

---

## ADR 007: Composite Foreign Keys for Tenant-Coherence Protection

### Context
In a shared multi-tenant database, application code bugs or raw queries could accidentally link a record in Tenant A to a resource in Tenant B (e.g., assigning a room belonging to Conservatory X to a lesson in Conservatory Y).

### Decision
Enforce database-level **composite foreign keys** across related tenant tables:
`FOREIGN KEY (tenantId, branchId) REFERENCES branches(tenantId, id)`.

### Consequences
- **Positive:** Mathematical guarantee at the database engine level that cross-tenant corruption cannot occur, even if an application query has a defect.
- **Negative:** Requires composite unique indexes on referenced tables, slightly increasing index metadata size.

---

## ADR 008: Audited Read-Only Support Access Grants over Silent Impersonation

### Context
SaaS platforms frequently implement "impersonate user" buttons for customer support. In an educational platform processing minors' personal data and financial records, silent impersonation violates GDPR accountability and creates massive security liability.

### Decision
Strictly forbid silent impersonation. Platform super administrators must request an explicit, time-limited **Support Access Grant** specifying the tenant, operational reason, and duration (maximum 60 minutes). The grant provides read-only access, is recorded in immutable audit logs, and triggers a prominent warning banner across the tenant interface. Both the conservatory director and platform admin can revoke it instantly.

### Consequences
- **Positive:** Complete GDPR compliance, auditable support activities, zero unauthorized data modifications by platform staff.
- **Negative:** Support engineers cannot make changes on behalf of users; they must guide the user or request explicit approval.

---

## ADR 009: Decoupled Transactional Outbox Pattern for Background Jobs

### Context
When business actions trigger emails or background tasks (e.g., student enrollment triggering welcome emails and invoice generation), sending the email directly inside the HTTP request causes slow response times and risks data inconsistency if the email server times out after the database write succeeds.

### Decision
Implement the **Transactional Outbox Pattern**. Business operations write domain messages to an `outbox_messages` table within the primary database transaction. A decoupled background worker polls the outbox and dispatches jobs to Redis / BullMQ for asynchronous execution.

### Consequences
- **Positive:** Guarantees "at-least-once" delivery, instant HTTP response times, zero loss of notifications during external SMTP outages.
- **Negative:** Requires background worker infrastructure and idempotency keys to handle duplicate delivery.

---

## ADR 010: Bilingual Native Internationalization with Greek Authority

### Context
The primary commercial launch market is Greece, which has statutory legal terminology for music conservatories (e.g. Αριθμός Μητρώου, Πατρώνυμο, Πρακτικά Εξετάσεων, Βεβαίωση Σπουδών), but the platform must support international faculty, bilingual families, and future EU expansion.

### Decision
Implement bilingual localization using `@jsverse/transloco` in Angular. Greek (`el`) is the default authoritative locale, with English (`en`) fully supported. All date, time, and currency formats strictly reflect European and Greek cultural conventions (`Europe/Athens`, EUR currency, 24-hour clock).

### Consequences
- **Positive:** Tailored commercial experience for Greek conservatories with instant readiness for global expansion.
- **Negative:** All new UI features must maintain parallel translation keys in both `el.json` and `en.json`.
