# MusicOS — REST API Specification & Contract

**Document Version:** 1.0.0  
**Base Path:** `/api`  
**Protocol:** HTTPS / REST / JSON  
**Authentication:** Bearer JWT in `Authorization` Header  
**Refresh Token:** HttpOnly `musicos_refresh` cookie  
**API Documentation:** Interactive Swagger UI available at `/api/docs` (non-production environments)

---

## 1. Global Conventions & Standards

### 1.1 HTTP Status Codes
- `200 OK`: Request succeeded; response contains payload.
- `201 Created`: Resource successfully created.
- `204 No Content`: Action succeeded with no response body.
- `400 Bad Request`: Validation failure or malformed payload.
- `401 Unauthorized`: Missing, expired, or invalid JWT access token.
- `403 Forbidden`: Authenticated user lacks required RBAC permission or entitlement.
- `404 Not Found`: Resource does not exist OR belongs to another tenant (probe prevention).
- `409 Conflict`: Business logic violation or resource collision (e.g. scheduling double-booking).
- `422 Unprocessable Entity`: Semantic domain rule violation.
- `429 Too Many Requests`: Rate limit throttled.
- `500 Internal Server Error`: Unhandled backend exception (logged with trace ID).

### 1.2 Standard Error Response Payload
```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Teacher has a conflicting lesson at this time",
  "timestamp": "2026-10-25T19:00:00.000Z",
  "path": "/api/scheduling/lessons/reschedule"
}
```

### 1.3 Pagination Standard
List endpoints accept standardized query parameters:
- `page` (integer, default: 1)
- `limit` (integer, default: 20, max: 100)
- `search` (string, optional case-insensitive filter)
- `sortBy` (string, field name)
- `sortOrder` (`asc` | `desc`)

---

## 2. API Endpoints by Module

### 2.1 Authentication & Sessions (`/api/auth`)
| Method | Path | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/login` | Authenticate with email and password | Public |
| `POST` | `/api/auth/refresh` | Rotate refresh token cookie and mint new JWT | Public (Cookie) |
| `POST` | `/api/auth/logout` | Revoke active session and clear cookie | Authenticated |
| `POST` | `/api/auth/select-tenant` | Select active conservatory and mint tenant-scoped JWT | Authenticated |
| `GET` | `/api/auth/me` | Retrieve current user profile and memberships | Authenticated |
| `POST` | `/api/auth/mfa/generate` | Generate TOTP secret and QR code URL | Authenticated |
| `POST` | `/api/auth/mfa/enable` | Verify TOTP code and activate MFA | Authenticated |
| `POST` | `/api/auth/mfa/challenge` | Complete MFA authentication step | Public (Session) |
| `POST` | `/api/auth/password-reset/request` | Dispatch password reset token email | Public |
| `POST` | `/api/auth/password-reset/confirm` | Reset password using verified token | Public |

### 2.2 Platform Administration (`/api/platform`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/platform/dashboard` | Global SaaS metrics, MRR, tenant counts | Super Admin |
| `GET` | `/api/platform/tenants` | List all platform tenants with status | Super Admin |
| `POST` | `/api/platform/tenants` | Provision a new conservatory tenant | Super Admin |
| `GET` | `/api/platform/tenants/:id` | Detailed tenant dossier, storage, users | Super Admin |
| `PATCH` | `/api/platform/tenants/:id/status` | Suspend, activate, or trial-extend tenant | Super Admin |
| `GET` | `/api/platform/plans` | List SaaS subscription plans | Super Admin |
| `POST` | `/api/platform/support-access` | Request time-limited support access grant | Super Admin |
| `GET` | `/api/platform/support-access/active` | Inspect active support sessions | Super Admin |
| `POST` | `/api/platform/support-access/:id/revoke` | Revoke active support session | Super Admin |

### 2.3 Academics (`/api/academics`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/academics/years` | List academic years for active tenant | Authenticated |
| `POST` | `/api/academics/years` | Create academic year | Admin, Director |
| `GET` | `/api/academics/departments` | List faculties and departments | Authenticated |
| `POST` | `/api/academics/departments` | Create instrument department | Admin, Director |
| `GET` | `/api/academics/programs` | List study programs and instruments | Authenticated |
| `POST` | `/api/academics/programs` | Define new instrument curriculum | Admin, Director |
| `GET` | `/api/academics/levels` | List statutory study levels | Authenticated |

### 2.4 People & Registry (`/api/people`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/people/students` | Search and paginate student registry | Staff |
| `POST` | `/api/people/students` | Register new student with guardian links | Staff |
| `GET` | `/api/people/students/:id` | Complete student dossier | Staff |
| `PATCH` | `/api/people/students/:id` | Update student profile and contacts | Staff |
| `DELETE` | `/api/people/students/:id` | Soft-delete student record | Director |
| `GET` | `/api/people/teachers` | List faculty teachers and specialties | Staff |
| `POST` | `/api/people/teachers` | Register new faculty instructor | Director |
| `GET` | `/api/people/guardians` | Directory of registered parents | Staff |

### 2.5 Scheduling (`/api/scheduling`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/scheduling/calendar` | Fetch lesson occurrences for date range | Staff, Teacher |
| `POST` | `/api/scheduling/series` | Create weekly recurring lesson series | Staff |
| `PATCH` | `/api/scheduling/series/:id` | Update series parameters | Staff |
| `DELETE` | `/api/scheduling/series/:id` | Soft-delete series and future occurrences | Staff |
| `POST` | `/api/scheduling/reschedule` | Reschedule specific lesson occurrence | Staff, Teacher |
| `POST` | `/api/scheduling/cancel` | Cancel lesson with makeup evaluation | Staff, Teacher |
| `GET` | `/api/scheduling/rooms` | List studio rooms with availability | Staff |

### 2.6 Attendance (`/api/attendance`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/attendance/lessons` | List daily lessons for attendance marking | Staff, Teacher |
| `GET` | `/api/attendance/roster/:lessonId` | Get student attendance roster for lesson | Staff, Teacher |
| `POST` | `/api/attendance/mark` | Record individual student attendance | Staff, Teacher |
| `POST` | `/api/attendance/bulk` | Bulk mark attendance for group class | Staff, Teacher |
| `GET` | `/api/attendance/credits/:studentId` | Inspect valid makeup lesson credits | Staff, Teacher |

### 2.7 Assignments & Submissions (`/api/assignments`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/assignments` | List assignments created by teacher | Teacher, Staff |
| `POST` | `/api/assignments` | Create assignment with study materials | Teacher |
| `GET` | `/api/assignments/:id` | Assignment details and submissions list | Teacher, Staff |
| `POST` | `/api/assignments/:id/submit` | Student practice file/recording submission | Student |
| `POST` | `/api/assignments/submissions/:id/grade` | Grade submission and leave remarks | Teacher |

### 2.8 Examinations (`/api/exams`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/exams/periods` | List formal examination periods | Staff, Teacher |
| `POST` | `/api/exams/periods` | Create new examination period | Admin, Director |
| `GET` | `/api/exams` | List exams with candidates and committees | Staff, Teacher |
| `POST` | `/api/exams` | Create specific exam event | Admin, Director |
| `POST` | `/api/exams/:id/grade` | Submit examiner scores and remarks | Examiner |
| `POST` | `/api/exams/:id/publish` | Formally approve and publish exam results | Director |
| `GET` | `/api/exams/:id/minutes` | Render draft examination board minutes | Staff, Director |

### 2.9 Financial Ledger (`/api/finance`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/finance/overview` | Financial dashboard KPIs and receivables | Director, Admin |
| `GET` | `/api/finance/charges` | List and filter tuition charges | Admin, Director |
| `POST` | `/api/finance/charges` | Post tuition charge to student ledger | Admin, Director |
| `POST` | `/api/finance/charges/bulk` | Batch generate monthly tuition charges | Admin, Director |
| `POST` | `/api/finance/charges/:id/cancel` | Cancel uncollected charge with reason | Admin, Director |
| `GET` | `/api/finance/payments` | List payment receipts and collection history | Admin, Director |
| `POST` | `/api/finance/payments` | Record payment with oldest-first allocation | Admin, Director |
| `POST` | `/api/finance/payments/:id/void` | Void payment and revert allocations | Director |
| `GET` | `/api/finance/payments/:id/receipt` | Download PDF payment receipt | Admin, Director, Guardian |

### 2.10 Digital Documents (`/api/documents`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/documents` | Browse central document repository | Staff |
| `POST` | `/api/documents/draft` | Create draft document from template | Staff |
| `POST` | `/api/documents/:id/issue` | Formally issue document with protocol number | Staff |
| `GET` | `/api/documents/:id/pdf` | Stream rendered vector PDF document | Staff, Permitted Guardian |
| `POST` | `/api/documents/:id/archive` | Archive document | Director |

### 2.11 Admissions CRM (`/api/crm`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/crm/leads` | List and filter leads by stage and source | Staff |
| `POST` | `/api/crm/leads` | Create new prospective student inquiry | Staff, Public Form |
| `GET` | `/api/crm/leads/:id` | Lead dossier and activity timeline | Staff |
| `PATCH` | `/api/crm/leads/:id` | Update lead details and follow-up date | Staff |
| `PATCH` | `/api/crm/leads/:id/stage` | Transition lead to next pipeline stage | Staff |
| `POST` | `/api/crm/leads/:id/activities` | Log call, email, or meeting note | Staff |
| `POST` | `/api/crm/leads/:id/convert` | Convert lead into enrolled student | Staff |
| `DELETE` | `/api/crm/leads/:id` | Soft-delete lead record | Staff |

### 2.12 Student & Guardian Portal (`/api/portal`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/portal/children` | List children linked to guardian account | Guardian |
| `GET` | `/api/portal/overview` | Personal schedule, next lessons, alerts | Student, Guardian |
| `GET` | `/api/portal/schedule` | Student's weekly timetable | Student, Guardian |
| `GET` | `/api/portal/attendance` | Historical attendance log | Student, Guardian |
| `GET` | `/api/portal/assignments` | Active assignments and feedback | Student, Guardian |
| `GET` | `/api/portal/exams` | Published exam grades and results | Student, Guardian |
| `GET` | `/api/portal/finance` | Tuition ledger, charges, and payments | Guardian |
| `GET` | `/api/portal/documents` | Issued certificates of study | Student, Guardian |

### 2.13 Operations, Trash & Health (`/api/trash`, `/api/health`)
| Method | Path | Description | Access |
|---|---|---|---|
| `GET` | `/api/trash` | List soft-deleted entities | Admin, Director |
| `POST` | `/api/trash/:model/:id/restore` | Restore soft-deleted record | Admin, Director |
| `DELETE` | `/api/trash/:model/:id/purge` | Permanently purge record | Director |
| `GET` | `/api/health` | Comprehensive service health check | Public |
| `GET` | `/api/health/liveness` | Kubernetes liveness probe | Public |
| `GET` | `/api/health/readiness` | Database and Redis readiness probe | Public |
