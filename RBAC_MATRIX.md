# MusicOS — Role-Based Access Control (RBAC) & Permissions Matrix

**Document Version:** 1.0.0  
**Scope:** Multi-Tenant Role Governance & Resource Scoping  
**Enforcement:** NestJS Global Guards (`JwtAuthGuard`, `TenantGuard`, `RolesGuard`, `PermissionsGuard`) + Application Service Scoping

---

## 1. Permission Architecture & Taxonomy

MusicOS enforces authorization at two independent levels:
1. **Endpoint Permission Verification:** The authenticated user's active membership role must possess the explicit permission string required by the route.
2. **Resource-Level Service Scoping:** Even with read/write permissions, services strictly scope database queries to prevent unauthorized lateral data access (e.g., a teacher can only view and grade their own assigned students).

---

## 2. Granular Permissions Matrix

| Permission Key | Description | Super Admin | Director | Administrator | Teacher | Student | Guardian | Support (Grant) |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `platform.manage` | Global tenant lifecycle, plans & health | **YES** | NO | NO | NO | NO | NO | NO |
| `students.read` | View student registry & profiles | (Via Grant) | **YES** | **YES** | **Scoped** | NO | NO | **YES** |
| `students.write` | Create, update, or archive students | NO | **YES** | **YES** | NO | NO | NO | NO |
| `teachers.read` | View faculty registry & specialties | (Via Grant) | **YES** | **YES** | NO | NO | NO | **YES** |
| `teachers.write` | Register or update faculty contracts | NO | **YES** | NO | NO | NO | NO | NO |
| `academics.read` | View departments, programs & levels | (Via Grant) | **YES** | **YES** | NO | NO | NO | **YES** |
| `academics.write` | Configure curricula, years & courses | NO | **YES** | **YES** | NO | NO | NO | NO |
| `schedule.read` | View master schedule & timetables | (Via Grant) | **YES** | **YES** | **Scoped** | **Scoped** | NO | **YES** |
| `schedule.write` | Create series, reschedule, cancel | NO | **YES** | **YES** | NO | NO | NO | NO |
| `attendance.read` | Inspect attendance rosters & history | (Via Grant) | **YES** | **YES** | **Scoped** | **Scoped** | NO | **YES** |
| `attendance.write` | Mark attendance, lateness & makeups | NO | **YES** | **YES** | **Scoped** | NO | NO | NO |
| `finance.read` | View charges, payments & debtors | (Via Grant) | **YES** | **YES** | NO | NO | NO | **YES** |
| `finance.write` | Post charges, record payments | NO | **YES** | **YES** | NO | NO | NO | NO |
| `finance.approve` | Void payments, grant scholarships | NO | **YES** | NO | NO | NO | NO | NO |
| `exams.read` | View exam periods, rosters & marks | (Via Grant) | **YES** | **YES** | **Scoped** | NO | NO | **YES** |
| `exams.write` | Create exam events & committees | NO | **YES** | **YES** | NO | NO | NO | NO |
| `exams.grade` | Submit examiner scores & feedback | NO | **YES** | NO | **Scoped** | NO | NO | NO |
| `exams.approve` | Formally approve & publish exam results | NO | **YES** | NO | NO | NO | NO | NO |
| `documents.read` | View document catalog & records | (Via Grant) | **YES** | **YES** | **Scoped** | NO | NO | **YES** |
| `documents.write` | Create draft & issue numbered docs | NO | **YES** | **YES** | NO | NO | NO | NO |
| `reports.read` | Access executive & analytics reports | (Via Grant) | **YES** | **YES** | NO | NO | NO | **YES** |
| `announcements.read`| View school announcements | (Via Grant) | **YES** | **YES** | **YES** | **YES** | **YES** | **YES** |
| `announcements.write`| Publish announcements & alerts | NO | **YES** | **YES** | **Scoped** | NO | NO | NO |
| `privacy.read` | Inspect consent & GDPR audit trails | (Via Grant) | **YES** | **YES** | NO | NO | NO | **YES** |
| `privacy.manage` | Process DSAR exports & deletions | NO | **YES** | **YES** | NO | NO | NO | NO |
| `settings.manage` | Modify tenant settings & branding | NO | **YES** | NO | NO | NO | NO | NO |
| `portal.read` | Access personal educational portal | NO | **YES** | NO | **YES** | **YES** | **YES** | NO |

---

## 3. Resource-Level Scoping Rules

### 3.1 Teacher Scoping
- **Student Profiles:** Teachers can only retrieve dossiers and contact details for students enrolled in their private studios or assigned group classes.
- **Attendance Register:** Teachers can only view and mark attendance rosters for lessons where they are designated as the instructor.
- **Assignments:** Teachers can only view, edit, and grade assignments created under their instructor ID.
- **Exams:** Teachers can only input scores for exam candidates when appointed to the examination committee board.

### 3.2 Student Scoping
- **Identity Isolation:** Students can only view their own schedule, personal attendance, submitted assignments, and approved examination marks.
- **Zero Lateral Access:** Inquiries for peer students or non-assigned lesson details return `404 Not Found`.

### 3.3 Guardian Scoping
- **Multi-Child Relationship Filtering:** Guardians can only access information for children where an active `StudentGuardian` record links their account.
- **Legal Restriction Guardrails:** If custody or court restrictions flag a guardian as non-custodial (`accessRestricted: true`), financial and academic dossiers are automatically blocked by the portal service.
- **Minor Child Accounts:** Young minor students do not require independent credentials; guardians manage communications, consent, and scheduling on their behalf.

---

## 4. Super Admin Support Access Mode

1. **Zero Silent Impersonation:** Super admins possess `platform.manage` permissions, but are cryptographically denied access to tenant endpoints (`/api/people/*`, `/api/finance/*`, etc.) by default.
2. **Explicit Justification:** To assist a client, the super admin must submit a formal request via `POST /api/platform/support-access` providing:
   - Target `tenantId`
   - Mandatory operational justification (e.g., "Assisting Director with exam minute draft #1042")
   - Requested duration (strictly bounded between 5 and 60 minutes).
3. **Audited Read-Only Scope:** An active support grant provides `SUPPORT_PERMISSIONS` (all `.read` permissions across the tenant). All write, update, and approve permissions remain strictly blocked.
4. **Immediate Revocability:** Both the conservatory director and platform administrators can terminate the session prematurely via `POST /api/platform/support-access/:id/revoke`.
