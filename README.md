# MusicOS

Multi-tenant SaaS for managing Greek music conservatories (ωδεία). MusicOS brings the student registry (φοιτητολόγιο), weekly scheduling, attendance, tuition ledgers, exams, documents and announcements into one bilingual workspace with separate portals for directors, administration, teachers and students.

> **Status:** working MVP covering the foundation, core registry/scheduling and digital operations stages, plus a first slice of the learning workspace and platform console. Greek statutory templates, certificate/diploma issuance, e-invoicing (myDATA) integration and other legal workflows **must be verified against current Ministry of Culture, AADE and GDPR requirements before production use**. Digitally generated PDFs are not automatically legally valid.

## Stack

| Layer | Technology |
| --- | --- |
| Web | Angular 22 (standalone, zoneless, signals), Tailwind CSS 4, Transloco (el/en), ECharts, custom SVG icon set |
| API | NestJS 12 (ESM), class-validator, Swagger, JWT + rotating refresh cookies, Argon2id, throttling, Helmet |
| Data | PostgreSQL 17, Prisma 7, UUIDv7 |
| Quality | Vitest (API unit + e2e, Angular unit), Playwright smoke suite, oxlint, GitHub Actions |

## Repository layout

```
apps/
  api/            NestJS API, Prisma schema/migrations, demo seed
  web/            Angular application (tenant console + student portal + platform console)
e2e/              Playwright browser smoke tests
playwright.config.ts
docker-compose.yml
```

## Architectural Documentation

The platform architecture and specifications are documented across dedicated records:

| Document | Purpose & Scope |
| --- | --- |
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | Domain analysis, full capabilities across 6 roles, and module specs |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, NestJS modular monolith, Angular zoneless signals |
| [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) | PostgreSQL 17 relational model, UUIDv7, composite FKs, integer cents |
| [API_SPECIFICATION.md](API_SPECIFICATION.md) | REST API contract, endpoints, DTOs, query parameters, error responses |
| [RBAC_MATRIX.md](RBAC_MATRIX.md) | Permission keys, role mapping, support access grant rules |
| [TENANCY_SECURITY.md](TENANCY_SECURITY.md) | Cryptographic multi-tenancy, JWT/cookies, GDPR & minors privacy |
| [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Visual design tokens, 26 reusable components, WCAG 2.2 AA standards |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Implementation backlog across Phases 0–5, dependency graph |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | Testing pyramid: unit, integration, API e2e, and Playwright suites |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker Compose, production deployment, Caddy proxy, backup runbooks |
| [DECISIONS.md](DECISIONS.md) | Architecture Decision Records (ADRs 001–010) |
| [docs/PHASE0_AUDIT.md](docs/PHASE0_AUDIT.md) | Initial baseline audit and gap analysis |

## Quick start

Requirements: Node.js >= 22.22, Docker.

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:up          # PostgreSQL 17 on localhost:5432
npm run db:migrate     # apply Prisma migrations
npm run db:seed        # two demo conservatories with students, lessons, finance, documents
npm run dev            # API :3000/api and web :4200
```

API documentation is available at <http://localhost:3000/api/docs> outside production.

### Demo accounts

Password for every demo account: `MusicOS2026!`

| Account | Role | Scope |
| --- | --- | --- |
| `superadmin@musicos.test` | Platform Super Admin | Platform console |
| `director@armonia.test` | Director | Ωδείο Αρμονία |
| `admin@armonia.test` | Administration | Ωδείο Αρμονία |
| `teacher@armonia.test` | Teacher | Ωδείο Αρμονία |
| `student@armonia.test` | Student | Ωδείο Αρμονία |
| `guardian@armonia.test` | Guardian | Ωδείο Αρμονία |
| `director@melodia.test` | Director | Ωδείο Μελωδία (trial) |
| `multi@musicos.test` | Teacher | Both conservatories (tenant chooser) |

The login screen also exposes one-click demo buttons in development builds. The Armonia seed includes demo **assignments** (one open with a pending submission, one graded) so the teacher console (/app/assignments) and the student/guardian portal (/app/portal/assignments) have real data out of the box.

## Tenancy and security model

- **Shared schema, strict tenant scoping.** Every tenant-owned row carries `tenantId`. The tenant is derived only from the verified access token, never from request parameters or headers.
- **Foreign identifiers return 404** rather than 403, so tenant existence cannot be probed.
- **Role-based access control.** `DIRECTOR`, `ADMINISTRATOR`, `TEACHER` and `STUDENT` roles map to explicit permissions; a platform flag unlocks the Super Admin console. Guards run globally and services additionally scope every query.
- **Sessions.** 15-minute access JWT kept in memory; rotating opaque refresh token in an `httpOnly` cookie (`musicos_refresh`). Passwords are hashed with Argon2id.
- **Multi-tenant users** receive a membership chooser after login and can switch the active conservatory without re-authenticating.
- **Audit and hygiene.** Sensitive operations are written to audit logs; Helmet, CORS allow-listing, request throttling and validation (whitelist + transform) are enabled.
- **GDPR-aware data model** includes student consent flags for data processing and media. Guardians are modelled separately. Minors' consent and retention policies require legal review before production.

## Implemented scope (MVP)

- **Auth:** login, refresh rotation, logout, tenant selection, role-aware landing.
- **Director dashboard:** enrolment trend, attendance rate, finance snapshot, branch utilisation, at-risk students, today's lessons, announcements.
- **Administrator dashboard:** unmarked lessons, new students, overdue charges, payments, debtors.
- **Teacher workspace:** weekly load, today's lessons, assigned students, attendance highlights.
- **Student portal:** next lesson, weekly schedule, attendance history, results, charges and payments.
- **Registry:** students with guardians, enrollment and status management; teachers with specialities and assigned series; branches, programmes, levels, academic years and rooms.
- **Scheduling:** weekly series generation with conflict checks (teacher, room, students), lesson drawer with notes, reschedule and cancel flows, week grid with branch/teacher/room filters.
- **Attendance:** daily lesson list, per-student statuses (present, absent, late, excused), bulk marking, notes and summary.
- **Finance:** integer-cent ledgers; charges, bulk tuition, payments with automatic oldest-first allocation, receipt PDFs, payment voiding, charge cancellation, installment plans, scholarships with approval, overdue reminders, collection-rate/monthly charts and per-student ledgers.
- **Exams:** periods, exam scheduling and committees, eligibility-checked applications, grading workflow (submit → approve → publish), result rosters, student result history, cancellation guards and draft minutes.
- **Documents:** template catalogue, draft/issue/approve/archive lifecycle, per-tenant protocol numbering, exam-minute drafts, scanned-file attachments, version history and PDF rendering with a draft watermark. Generated documents are issued as drafts until staff explicitly issue them.
- **Notifications:** per-user in-app notifications, read state, and an outbox for queued email delivery.
- **Student and guardian portal:** multi-child guardian selection, next lesson, weekly schedule, attendance, published results, own charges/payments, issued documents and study assignments (submit from the student portal; grades and feedback visible to guardians).
- **Learning workspace:** client-side metronome and tuner, explicitly pinned offline PDFs, and a local practice draft that is never published without human action.
- **Announcements:** role/branch audiences, pinning, editing, deletion, notification fan-out.
- **Platform console:** tenants, subscriptions, plan utilisation, tenant detail (legal/contact/member data) and audit trail.
- **Bilingual UI** (Greek default, English) with light/dark themes and responsive layouts.

## Testing

```bash
npm run lint          # oxlint (API) + tsc (web)
npm test              # API unit tests + Angular unit tests
npm run test:e2e      # API e2e (auth, RBAC, tenant isolation, attendance, finance, exams, documents, portal)
npm run test:e2e:web  # Playwright browser smoke suite (requires seeded database)
npm run test:all      # all of the above
npm run build         # production builds of API and web
```

The Playwright suite builds the API and web app, serves the production bundle through `scripts/serve-web.mjs` (a small static server with an `/api` proxy) and runs against a seeded database. If servers are already listening on ports 3000 and 4200 (for example `npm run dev`), it reuses them for faster iteration. It covers login failures, the multi-tenant chooser, director navigation, language/theme switching, attendance recording, announcement create/delete, tenant switching, student-portal restrictions and the platform console.

CI (`.github/workflows/ci.yml`) runs migrations, seed, lint, unit/e2e tests, production builds and Playwright against a PostgreSQL service.

## Timezone and scheduling

Times are stored in UTC. Weekly series use ISO weekdays (1 = Monday … 7 = Sunday) and `HH:mm` wall-clock times in `Europe/Athens`, materialised into UTC lesson instances. All date-bound logic (today's lessons, week ranges, trends) is computed in Athens time, including around DST boundaries.

## Out of scope / next steps

- Ministry of Culture certificate/diploma templates and legally valid digital signatures; current PDFs are operational documents, not certified public documents.
- Admissions applications pipeline, assignments/submissions, sheet-music library, quizzes and secure messaging.
- myDATA e-invoicing, payment gateways and refunds.
- OIDC/SSO, MFA for privileged accounts, password reset and production email/SMS delivery (the outbox currently uses a logging mailer in development).
- Redis/BullMQ background jobs, Socket.IO live updates, S3 document storage and virus scanning.
- White-label domains/theming, native mobile apps and the full AI assistant surface.
- Full GDPR tooling (DSAR export, retention jobs, consent revocation), pen-testing and formal Greek legal review.

## Environment variables

See `apps/api/.env.example`. Notable values: `DATABASE_URL`, `PORT`, `WEB_ORIGIN`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS`, `COOKIE_SECURE` (enable behind HTTPS in production).
