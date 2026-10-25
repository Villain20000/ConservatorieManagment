# Phase 0 — Repository Audit and Gap Analysis

Date: 2026-10-24 · Scope: full specification (sections 1–23) vs. the code currently in this repository.

> This document is the Phase 0 discovery artefact required by section 22.1–22.5: it records what
> exists, what is genuinely verified, what is missing and what is wrong, before any new feature work.

## 1. What the repository already is

A working monorepo (`apps/api` NestJS + Prisma/PostgreSQL, `apps/web` Angular 22 zoneless + Tailwind 4,
`e2e` Playwright) with a **tenant console, student/guardian portal, learning basics and a platform console**.
It is a real full-stack application backed by PostgreSQL — not a mockup — but it covers roughly
**Phase 1 + part of Phase 2/3** of the specification.

### Verified in this session (evidence, not claim)

| Check | Command | Result |
| --- | --- | --- |
| Lint | `npm run lint` | 0 errors, 7 warnings (oxlint) |
| API + web unit tests | `npm test` | API 176/176 (needs PostgreSQL running), Angular suite passes |
| Migrations | `prisma migrate deploy` | 9 migrations, no pending drift |
| Seed | `npm run prisma:seed` | 2 tenants, 44 students, 12 teachers, 1390 lessons, 405 attendance rows |
| API e2e | `vitest --config vitest.config.e2e.ts` | see `TESTING_STRATEGY.md` for the last recorded run |

Environment note: Docker Desktop must be running for PostgreSQL (`npm run db:up`). `psql` is not
installed on the host; all database access goes through Prisma or `docker exec`.

## 2. Specification coverage matrix

Legend: ✅ implemented · 🟡 partial · ❌ missing.

| # | Requirement area | State | Notes |
| --- | --- | --- | --- |
| 1 | Multi-tenant platform core | 🟡 | Tenants, branches, plans, entitlements service, feature guard. No per-tenant settings/custom fields/terminology. |
| 2.1 | Student experience (50) | 🟡 | Profile, schedule, attendance, results, finance, documents, practice tools, **assignments & submissions**. No quizzes, goals, certificates, messaging. |
| 2.2 | Teacher experience (50) | 🟡 | Timetable, attendance, notes, grading, **assignment creation, submission review, grading**. No content uploads, availability, substitutions, leave. |
| 2.3 | Director (50) | 🟡 | Dashboard, finance snapshot, utilisation, at-risk. No staff workload, exam governance UI, budgets, forecasting. |
| 2.4 | Secretariat (50) | 🟡 | Registry, scheduling, finance, attendance, documents. No imports, renewals, waiting lists, appointments. |
| 2.5 | Guardian portal (35) | 🟡 | Multi-child selection, attendance, results, charges, documents, **child assignments incl. grades/feedback**. No payments, consent, requests, appointments. |
| 2.6 | Super Admin (30) | 🟡 | Tenants, status, plans, outbox, audit. No billing records, support access grants, GDPR requests, usage metering. |
| 3.1 | Enrollment CRM (25) | ❌ | Absent. |
| 3.2 | Smart scheduling (20) | 🟡 | Recurrence, conflict detection (teacher/room/student), reschedule, cancel. No holidays, templates, availability, makeups, waitlist, DST-exception surfacing. |
| 3.3 | Document automation (20) | 🟡 | Templates, lifecycle, numbering, PDFs, versions, signatures field. No approvals chain, e-sign adapters, retention, bulk generation, imports. |
| 3.4 | Learning studio (30) | 🟡 | Metronome, tuner, offline PDFs. No rhythm/ear training, repertoire, recordings, annotations, MusicXML. |
| 3.5 | Events & inventory (20) | ❌ | Absent. |
| 3.6 | AI & automation (20) | ❌ | Absent. |
| 4 | Cross-cutting (25) | 🟡 | Command palette absent, saved filters absent, undo partial (soft delete/trash), custom fields absent, onboarding absent, a11y prefs partial. |
| 5 | Design system (26 components) | 🟡 | ~14 shared primitives; no DataTable/FilterBar/Calendar/TimetableGrid/DocumentViewer/AudioPlayer/AnalyticsCard primitives. |
| 6 | Frontend architecture | 🟡 | Feature folders, guards, i18n, typed models. No generated OpenAPI client. |
| 7 | Backend architecture | ✅ | Controller → service → Prisma, global guards, DTO validation, transactional services. |
| 8 | Database design | 🟡 | UUIDv7, tenant columns, unique constraints, indexes, integer cents. Missing: DB-level CHECK constraints, lesson-level holidays, CRM, events, inventory, messaging, approvals, support access, usage metering. |
| 9 | Financial engine | 🟡 | A: charges/payments/allocations/installments/scholarships/refunds-by-void. B: subscription plan only — **no SaaS invoice/payment records**. |
| 10 | GDPR & security | 🟡 | Tenant isolation, Argon2id, refresh rotation, MFA, throttling, audit log, file validation. Missing: support-access grants, DSAR workflow, retention jobs, malware scanning, consent ledger. |
| 11 | Automation engine | 🟡 | DB outbox + processor. No domain event catalogue, no automation rules. |
| 12 | Reporting | 🟡 | Director/admin/teacher dashboards, finance charts. Missing most named reports and SaaS owner metrics. |
| 13 | Tenant SaaS configuration | 🟡 | Locale/timezone/branches/plans. Missing configurable lesson durations, cancellation/makeup policies, notification/document templates per tenant. |
| 14 | Differentiators | ❌ | Correctly deferred. |
| 15 | Roadmap phases | 🟡 | Phase 0 docs were missing (this set); Phase 1–2 largely done; Phase 3 partial. |
| 16 | Workflow | 🟡 | Incremental, but documentation lagged behind code. |
| 17 | Testing | 🟡 | Unit + API e2e + Playwright smoke. No dedicated concurrency/IDOR/tenant-isolation test suite as required. |
| 18 | DevOps | 🟡 | Docker Compose, GH Actions, health, JSON logs, backup scripts. No staging/prod manifests, tracing metrics. |
| 19 | Demo environment | ✅ | Seeded Greek conservatory, 2 tenants, secure non-production seed. |
| 20 | Documentation | ❌ | Only README + backup runbook. This audit adds the required set. |

| 4 | Rank 4 in §4 below (assignments & submissions) was delivered on 2026-10-25: Prisma tables + tenant-coherent FKs, `/assignments` API with per-teacher scoping, submit/grade flows, notifications, audit events, seed data, teacher page and student/guardian portal page. 10 new service unit tests; suite 192 API + 4 web passing. |

## 3. Correctness and security findings (priority order)

These are **defects found in existing code**, not missing features.

1. **P1 — No database-level integrity constraints.** Money and status invariants (e.g. `paidAmountCents >= 0`,
   `endsAt > startsAt`, `durationMinutes > 0`, `levelId`/`program` tenant coherence) are enforced only in
   services. A CHECK constraint layer is required by section 8.
2. **P1 — Cross-tenant referential coherence is not enforced.** A `LessonSeries` can reference a `roomId` from
   another tenant at the database level; only the service checks it. Add composite-FK protection where feasible.
3. **P1 — Super Admin has no support-access grant model.** Section 2.6 forbids silent impersonation; tenant data is
   currently reachable through super-admin endpoints with no time-limited, audited grant. Needs `SupportAccessGrant`.
4. **P2 — SaaS billing is a display model only.** `Subscription` has no invoices, payment attempts, or lifecycle
   events; section 9B is not satisfied.
5. **P2 — No consent/legal-basis ledger.** Student consent booleans exist, but no immutable record of who gave
   consent, for what purpose, when, and how it was withdrawn (section 10).
6. **P2 — Scheduling ignores holidays and academic terms.** Weekly materialisation generates lessons on
   holidays; term boundaries are not modelled (section 3.2).
7. **P2 — Payment idempotency depends on client `sourceKey` only**; webhook/bank-import paths need an explicit
   `idempotencyKey` table (section 11).
8. **P3 — Test-suite coupling.** `numbering.service.spec.ts` is a database integration test living in the unit suite,
   so `npm test` fails when PostgreSQL is down. It should move to the e2e config.
9. **P3 — oxlint warnings** (7): unused constant, useless spread, etc.

## 4. Prioritised feature matrix (what to build next)

Score = value × risk-reduction ÷ effort. Ordered so that each row is a releasable vertical slice.

| Rank | Slice | Why now | Spec refs |
| --- | --- | --- | --- |
| 1 | **Foundation hardening**: DB CHECK constraints, tenant-coherence FKs, idempotency table, holidays/term calendar for scheduling, test-suite separation | Protects every later feature; enables pilot claim in section 23 | 8, 11, 17 |
| 2 | **Super Admin support access**: explicit, audited, time-limited grants; platform billing records (subscription invoices + payment attempts) | Legal/security prerequisite for real customers | 2.6, 9B, 10 |
| 3 | **Consent & privacy ledger**: consent events, DSAR export request workflow, retention rules | Greek/EU minors data | 10 |
| 4 | ~~Assignments & submissions~~ **DONE 2026-10-25** (see §2 notes). |
| 5 | **Admissions CRM** (lead → enrolled pipeline) | Revenue driver, standalone module | 3.1 |
| 6 | **Events & inventory** | Section 3.5, depends on rooms/assets | 3.5 |
| 7 | **Messaging** (conversations, safe parent-teacher comms) | Moderation & minors | 2.5 |
| 8 | **Learning studio expansion** (rhythm/ear training, repertoire, recordings) | Differentiator, Phase 5 start | 3.4 |
| 9 | **AI assistance** with review gates and quotas | Only after 1–8 | 3.6 |

## 5. Documented assumptions (reversible, made without asking)

- **A1** Greek default locale, `Europe/Athens`, EUR with integer cents everywhere.
- **A2** One `MembershipRole` per (user, tenant) is kept for now; multi-role is modelled in the roadmap as
  `RoleAssignment` without breaking existing tokens.
- **A3** SaaS billing stays provider-abstracted with an internal ledger; no live payment provider is wired until
  credentials and AADE capability review exist.
- **A4** "Pilot ready" means section 23 items 1–13 verified in CI on a seeded database, with legal items
  (myDATA, statutory certificates) explicitly marked as pending external validation.

## 6. Questions that would materially change design (deferred, not blocking)

1. Which e-signature provider and invoice provider will be contracted (affects adapter contracts only)?
2. Which Greek statutory certificate set must the first pilot issue (affects templates only)?

> Until answered, adapters stay behind interfaces and no feature is labelled legally compliant.
