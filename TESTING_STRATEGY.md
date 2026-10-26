# MusicOS — Quality Assurance & Automated Testing Strategy

**Document Version:** 1.0.0  
**Test Automation Stack:** Vitest 4.1 (API & Web Unit / API E2E) + Playwright 1.64 (Browser E2E) + oxlint + TypeScript Compiler  
**Quality Philosophy:** Evidence over claims. Zero placeholder tests. Every core business rule, permission boundary, and financial calculation must be covered by automated tests.

---

## 1. Test Pyramid & Distribution

```
                                  / \
                                 /   \
                                / E2E \       Playwright Browser Smoke Tests
                               / Browser\     (Navigation, Auth, UI Interactions)
                              /-----------\
                             /   API E2E   \   Vitest Full-Stack Integration
                            /  Integration  \  (Prisma, Database, Auth, Multi-Tenancy)
                           /-----------------\
                          /    Unit Tests     \ Vitest Fast Isolated Suites
                         / (Rules, Calc, Math) \ (Finance, Permissions, Entitlements)
                        /-----------------------\
```

---

## 2. Test Suites & Execution Commands

| Scope | Runner / Command | Targets | Execution Time |
|---|---|---|---|
| **Linting & Hygiene** | `npm run lint` | oxlint (API) + `tsc --noEmit` (Web) | ~10s |
| **API Unit Tests** | `npm run test:api` | Domain services, pure rule engines, logging | ~20s |
| **Web Unit Tests** | `npm run test:web` | Angular components, services, i18n, support | ~10s |
| **Full Unit Suite** | `npm test` | All API and Angular unit tests | ~30s |
| **API Integration / E2E**| `npm run test:e2e` | Full API lifecycle with real PostgreSQL | ~120s |
| **Browser E2E Tests** | `npm run test:e2e:web` | Playwright browser smoke test suite | ~60s |
| **Full Quality Gate** | `npm run test:all` | Lint + All Unit + API E2E + Browser E2E | ~240s |

---

## 3. Scope of Testing by Level

### 3.1 Unit Testing (Fast & Isolated)
- **Financial Rules (`finance.rules.spec.ts`):** 14 tests validating integer-cent charge calculations, partial payment distributions, overdue arrears classifications, and credit balance invariants.
- **Permissions & RBAC (`permissions.spec.ts`):** 6 tests validating permission assignment sets across all roles, support mode scopes, and entitlement rules.
- **Entitlements Service (`entitlements.service.spec.ts`):** 29 tests validating student count caps, storage limits, and feature flag resolution per tenant subscription tier.
- **Prisma Client Extensions (`prisma.extension.spec.ts`):** 32 tests verifying transparent soft-deletion filtering (`deletedAt == null`), timestamp stamping, and composite key queries.
- **Assignments Service (`assignments.service.spec.ts`):** 10 tests verifying teacher studio scoping, deadline validation, and student submission states.
- **MFA Service (`mfa.service.spec.ts`):** 10 tests verifying RFC 6238 TOTP generation, secret encryption, challenge verification, and replay rejection.
- **Support Access Service (`support-access.service.spec.ts`):** 16 tests verifying time-limited lifetime bounds, explicit reason recording, and race-safe revocation.

### 3.2 Full-Stack API Integration & E2E Testing
Runs against a live PostgreSQL 17 test database:
- **`app.e2e-spec.ts`:** Verifies absolute tenant data isolation. Confirms that attempting to access a student, lesson, or charge belonging to another conservatory returns `404 Not Found`.
- **`finance.e2e-spec.ts`:** Full financial lifecycle: Charge generation → payment recording → oldest-first allocation → PDF receipt issuance → payment voiding → charge cancellation.
- **`documents.e2e-spec.ts`:** Full document lifecycle: Template instantiation → draft state → official protocol numbering → vector PDF streaming → archiving.
- **`exam-lifecycle.e2e-spec.ts`:** Exam period creation → candidate registration → committee scoring → director approval → public release → statutory minutes draft rendering.
- **`scheduling.e2e-spec.ts` / `attendance.e2e-spec.ts`:** Weekly lesson series materialization, room collision rejection, teacher double-booking prevention, and daily attendance recording.
- **`support-access.e2e-spec.ts`:** Validates that platform super admins cannot read tenant records until granted an explicit support session, and verifies read-only access boundaries.
- **`soft-delete.e2e-spec.ts`:** Verifies soft-deletion across students, lesson series, and announcements, confirming that deleted records are hidden from standard queries and restored completely.

### 3.3 Browser End-to-End Testing (Playwright)
Executes automated browser workflows using real Chromium, Firefox, and WebKit instances:
- **Authentication Flows:** Login failure handling, demo account one-click credentials, and multi-tenant conservatory selector.
- **Role Navigation:** Director dashboard inspection, administrator student registry navigation, and teacher timetable exploration.
- **Interactive Workflows:** Daily attendance marking, announcement creation and soft-deletion, and language switching between Greek and English.
- **Student & Guardian Portal:** Validates that students are strictly restricted from seeing sensitive administrative menus and other students' data.

---

## 4. Concurrency & Integrity Testing

- **Double-Booking Protection:** Automated concurrent requests attempting to book the same studio room at the same time slot execute within serializable database transactions, ensuring exactly one succeeds and the other fails with `409 Conflict`.
- **Atomic Protocol Numbering:** Parallel document issuance requests are subjected to row-level locks (`SELECT ... FOR UPDATE`), guaranteeing zero number skipping and zero duplicate protocol numbers.
- **Idempotent Financial Actions:** Payment recording and webhook processing utilize database-level uniqueness constraints preventing duplicate charges or payments from network retries.
