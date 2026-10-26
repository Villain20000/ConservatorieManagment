# MusicOS — Multi-Tenancy, Security & GDPR Compliance

**Document Version:** 1.0.0  
**Scope:** Tenant Isolation, Authentication, Application Security, Data Privacy for Minors  
**Compliance Targets:** GDPR (EU Regulation 2016/679), Greek Data Protection Law (Law 4624/2019), OWASP Top 10

---

## 1. Multi-Tenancy Architecture & Data Isolation

MusicOS is designed to host hundreds of independent music conservatories on a shared cloud infrastructure while guaranteeing complete cryptographic and relational isolation.

### 1.1 Tenant Context Resolution
```
[ Incoming Request ]
        |
        v
[ JwtAuthGuard ] ──> Extracts & validates JWT from `Authorization: Bearer <token>`
        |
        v
[ TenantGuard ] ──> Extracts `tenantId` claim embedded in the signed JWT payload
        |
        v
[ Execution Context ] ──> Attaches `TenantContext` to `request.user`
        |
        v
[ Application Service ] ──> Enforces `where: { tenantId, id }` on every database query
```

1. **Token-Derived Tenancy:** The active tenant identifier is **never** accepted from query parameters, request headers (e.g. `X-Tenant-ID`), or request bodies. It is exclusively unpacked from the cryptographically signed JWT.
2. **Probe-Resistant 404 Policy:** If a user attempts to access an entity belonging to another conservatory (e.g. `GET /api/people/students/foreign-uuid`), the backend responds with `404 Not Found` rather than `403 Forbidden`. This eliminates the ability for attackers or competitors to enumerate tenant existence or valid record IDs.
3. **Database-Level Composite Foreign Keys:** In addition to service-level filtering, foreign key constraints are enforced using composite keys `(tenantId, resourceId)`. It is mathematically impossible for an entity in Conservatory A to reference a room, branch, student, or teacher in Conservatory B at the database engine level.

---

## 2. Authentication, Session & Credential Security

### 2.1 Password Security
- **Algorithm:** Argon2id (memory cost: 65,536 KiB, time cost: 3 iterations, parallelism: 4).
- **Complexity Requirements:** Minimum 8 characters, requiring mixed case, numbers, and symbols.
- **Credential Storage:** Raw passwords are never persisted or logged under any circumstance.

### 2.2 Short-Lived Access Tokens & Rotating Refresh Cookies
- **Access Tokens:** 15-minute expiration time. Carries `userId`, `membershipRole`, and active `tenantId`.
- **Refresh Tokens:** 30-day cryptographically random opaque tokens stored exclusively in `httpOnly`, `Secure`, `SameSite=Strict` cookies (`musicos_refresh`).
- **Rotation on Refresh:** Every call to `POST /api/auth/refresh` invalidates the previous refresh token and issues a new one. Attempting to reuse an old refresh token triggers immediate invalidation of the entire session family (replay attack mitigation).
- **Session Revocation:** Active sessions can be terminated individually or en masse (e.g., during password resets) via database revocation.

### 2.3 Multi-Factor Authentication (MFA)
- Implements Time-based One-Time Password (TOTP) compliant with RFC 6238.
- Mandatory for Platform Super Admins and Conservatory Directors.
- TOTP secrets are encrypted at rest.

---

## 3. GDPR & Protection of Minors' Data

Music education institutions predominantly serve minor students. MusicOS incorporates **Privacy by Design and by Default** (Article 25 GDPR).

### 3.1 Strict Separation of Guardian & Minor Records
- **Explicit Relationship Mapping:** Minors are represented by `Student` entities, while legal guardians are modeled independently via `Guardian` records with verified fiscal identity (ΑΦΜ).
- **No Standalone Login for Young Minors:** Children under the statutory digital consent age (15 in Greece under Law 4624/2019) do not require independent credentials. Parents manage educational schedules, billing, and document submissions through the Guardian Portal.
- **Legal Custody & Restricted Visibility:** The system explicitly supports `accessRestricted: true` flags on guardian-student relationships to enforce civil court custody orders, preventing non-custodial parents from accessing a child's whereabouts, schedules, or contact details.

### 3.2 Granular Consent Tracking
- `consentMedia` (BOOLEAN): Explicit parental authorization to record recitals, take photos, or publish performance videos on conservatory social media. Default: **FALSE**.
- `consentMarketing` (BOOLEAN): Consent to receive newsletters or promotional notices. Default: **FALSE**.
- All consent updates are recorded in immutable audit logs capturing the timestamp, acting guardian user, and IP address.

### 3.3 Data Subject Rights (DSAR & Right to be Forgotten)
- **Data Portability (Article 20):** Secretariat staff can export a complete, machine-readable JSON dossier of all personal records, attendance logs, and financial transactions associated with a student.
- **Right to Erasure (Article 17):** Students or guardians can request data deletion. Non-statutory records are permanently purged, while statutory academic records (e.g. official examination minutes required by the Greek Ministry of Culture) are retained under legal obligation exemptions (Article 17(3)(b)), with personal contact details anonymized.

### 3.4 AI Privacy & Human-in-the-Loop Safeguards
1. **Zero Automated Evaluation of Minors:** MusicOS strictly prohibits automated AI grading or evaluation of minors. All student performance critiques and exam marks must originate from licensed human instructors.
2. **Data Minimization:** No personal student names, addresses, or identifiers are transmitted to third-party LLM providers. Workloads are strictly sanitized into anonymized pedagogical contexts (e.g., "Violin student, Suzuki Book 3, struggling with intonation on 3rd position shifts").
3. **Opt-In Only:** AI-assisted administrative tools are tenant-level opt-in features requiring explicit Director approval.

---

## 4. Application Hardening & Defense in Depth

### 4.1 Transport & Network Security
- **HTTPS & TLS 1.3:** Enforced across all environments. Plain HTTP connections are redirected.
- **HTTP Security Headers (Helmet):** Strict `Content-Security-Policy` (CSP), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` (HSTS), and `Referrer-Policy: strict-origin-when-cross-origin`.
- **CORS Allow-Listing:** Strict origin validation matching authorized client domains.

### 4.2 Rate Limiting & Abuse Prevention
- **Authentication Endpoints:** `@nestjs/throttler` limits login and password reset endpoints to 10 requests per minute per IP.
- **Brute-Force Lockout:** Repeated failed login attempts trigger exponential backoff delays.

### 4.3 Secure File Uploads
- **Magic Byte Validation:** Uploaded PDF sheet music and audio files are validated by inspecting binary headers (magic numbers), preventing disguised executable uploads.
- **Size Caps:** Hard limits on uploads (10 MB for PDF scores, 50 MB for practice audio).
- **Time-Limited Signed URLs:** Stored files are never served from public storage buckets. Download links are pre-signed with short expirations (15 minutes).

### 4.4 Comprehensive Audit Logging
Every sensitive action writes an immutable record to the `audit_logs` table:
- `tenantId`, `actorId`, `actorRole`, `action` (e.g., `PAYMENT_VOID`, `STUDENT_DELETE`, `GRADE_PUBLISH`), `entityType`, `entityId`, `ipAddress`, and `metadata` (JSON diff of state changes).
