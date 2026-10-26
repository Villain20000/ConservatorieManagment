# MusicOS — Engineering Guidelines for AI Agents & Developers

Welcome to **MusicOS** (`musicos`). This repository is a production-grade, multi-tenant SaaS platform for music conservatories (primarily Greece, extensible to the EU and globally).

---

## 1. Core Technology Stack

- **Web Frontend:** Angular 22 (standalone, zoneless, signal-based reactivity), Tailwind CSS 4, Transloco (`el` default, `en`), ECharts.
- **Backend API:** NestJS 12 (ESM native), class-validator, Swagger, Argon2id, JWT in memory + rotating refresh cookies (`musicos_refresh`).
- **Database & Persistence:** PostgreSQL 17, Prisma 7, UUIDv7 primary keys, integer-cent currency (`cents BIGINT`).
- **Testing:** Vitest 4.1 (API & Web unit tests, API E2E), Playwright 1.64 (Browser E2E), oxlint.

---

## 2. Fundamental Architectural Invariants

1. **Strict Multi-Tenancy:**
   - Every tenant-scoped entity carries a `tenantId UUID` column.
   - The active tenant is derived **only** from verified access tokens (`request.user.tenantId`).
   - Querying a foreign tenant's entity must return **`404 Not Found`**, never `403 Forbidden` (probe-resistant).
   - Composite foreign keys `(tenantId, resourceId) REFERENCES table(tenantId, id)` are enforced at the database level.

2. **No Silent Impersonation:**
   - Platform super administrators cannot silently impersonate tenants.
   - Troubleshooting requires an audited, time-limited **Support Access Grant** (`POST /api/platform/support-access`) providing read-only access.

3. **Financial Precision:**
   - Zero floating-point money. All monetary balances, charges, and payments are stored in integer cents (`EUR cents`).
   - Oldest-first automatic payment allocation. Reversible payments are soft-voided with mandatory audit reasons.

4. **Greek Conservatory Domain Modeling:**
   - Official Greek study levels (Προκαταρκτική, Κατωτέρα, Μέση, Ανωτέρα, Πτυχίο/Δίπλωμα).
   - Student registry includes statutory Greek attributes (Πατρώνυμο, Αριθμός Μητρώου).
   - Atomic protocol numbering (Αριθμός Πρωτοκόλλου) for official documents.

5. **GDPR & Protection of Minors:**
   - Explicit separation of `Student` and `Guardian` records.
   - Young minors do not require standalone logins; parents access the Guardian Portal.
   - Explicit consent tracking (`consentMedia`, `consentMarketing`) defaulting to `false`.

---

## 3. Essential Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Run both NestJS API (`:3000`) and Angular Web (`:4200`) concurrently |
| `npm run db:up` | Launch PostgreSQL 17 container |
| `npm run db:migrate` | Apply Prisma schema migrations |
| `npm run db:seed` | Seed demo conservatories (Armonia & Melodia) |
| `npm run lint` | Run oxlint on API and TypeScript typecheck on Web |
| `npm test` | Run API and Angular unit test suites |
| `npm run test:e2e` | Run API integration & tenant isolation e2e tests |
| `npm run test:e2e:web` | Run Playwright browser smoke test suite |
| `npm run test:all` | Execute the complete quality gate (unit + e2e + browser) |
| `npm run build` | Compile production bundles for API and Web |

---

## 4. Documentation Map

Refer to these authoritative documents before altering architecture:
- [README.md](README.md): Quick start and demo credentials.
- [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md): Complete PRD across all 6 roles.
- [ARCHITECTURE.md](ARCHITECTURE.md): System architecture and data flow.
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md): PostgreSQL schema & ERD.
- [API_SPECIFICATION.md](API_SPECIFICATION.md): REST API endpoints and contracts.
- [RBAC_MATRIX.md](RBAC_MATRIX.md): Granular permissions and resource scoping.
- [TENANCY_SECURITY.md](TENANCY_SECURITY.md): Security, encryption, and GDPR compliance.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md): Tokens, 26 UI components, and WCAG 2.2 AA standards.
- [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md): Implementation phases and backlog.
- [TESTING_STRATEGY.md](TESTING_STRATEGY.md): Testing pyramid and quality gates.
- [DEPLOYMENT.md](DEPLOYMENT.md): Deployment, Caddy proxy, and backup runbooks.
- [DECISIONS.md](DECISIONS.md): Architectural Decision Records (ADRs 001–010).
