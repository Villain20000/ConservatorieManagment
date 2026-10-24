-- Stage 3 foundations: enums, columns and tables for digital operations.

ALTER TYPE "MembershipRole" ADD VALUE IF NOT EXISTS 'GUARDIAN';
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'DRAFT';
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'GRADING';
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "ExamStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAYMENT_OVERDUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOCUMENT_ISSUED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXAM_APPLICATION_DECIDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXAM_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EXAM_RESULT_READY';

CREATE TYPE "NumberScope" AS ENUM ('RECEIPT', 'DOCUMENT');
CREATE TYPE "ChargeOrigin" AS ENUM ('TUITION', 'REGISTRATION', 'EXAM_FEE', 'MATERIAL', 'OTHER');
CREATE TYPE "ScholarshipType" AS ENUM ('PERCENTAGE', 'FIXED');
CREATE TYPE "ScholarshipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
CREATE TYPE "InstallmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentStatus" AS ENUM ('POSTED', 'VOIDED');
CREATE TYPE "ExamPeriodStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED');
CREATE TYPE "ExamApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "ExamCommitteeRole" AS ENUM ('PRESIDENT', 'EXAMINER', 'MEMBER');
CREATE TYPE "SignatureStatus" AS ENUM ('NONE', 'PENDING', 'SIGNED');
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- Programs
ALTER TABLE "programs" ADD COLUMN "defaultFeeCents" INTEGER;

-- Guardians
ALTER TABLE "guardians" ADD COLUMN "userId" UUID;
ALTER TABLE "guardians" ADD COLUMN "consentRecordedAt" TIMESTAMP(3);

-- Notifications
ALTER TABLE "notifications" ADD COLUMN "dedupeKey" TEXT;

-- Charges
ALTER TABLE "charges" ADD COLUMN "amountCents" INTEGER;
ALTER TABLE "charges" ADD COLUMN "grossAmountCents" INTEGER;
ALTER TABLE "charges" ADD COLUMN "discountAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "charges" ADD COLUMN "discountReason" TEXT;
ALTER TABLE "charges" ADD COLUMN "scholarshipId" UUID;
ALTER TABLE "charges" ADD COLUMN "paidAmountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "charges" ADD COLUMN "origin" "ChargeOrigin" NOT NULL DEFAULT 'TUITION';
ALTER TABLE "charges" ADD COLUMN "installmentPlanId" UUID;
ALTER TABLE "charges" ADD COLUMN "installmentNo" INTEGER;
ALTER TABLE "charges" ADD COLUMN "installmentCount" INTEGER;
ALTER TABLE "charges" ADD COLUMN "enrollmentId" UUID;
ALTER TABLE "charges" ADD COLUMN "sourceKey" TEXT;
ALTER TABLE "charges" ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "charges" ADD COLUMN "cancelledById" UUID;
ALTER TABLE "charges" ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "charges" ADD COLUMN "createdById" UUID;

UPDATE "charges"
SET "amountCents" = ROUND("amount" * 100)::int,
    "grossAmountCents" = ROUND("amount" * 100)::int;

ALTER TABLE "charges" ALTER COLUMN "amountCents" SET NOT NULL;
ALTER TABLE "charges" ALTER COLUMN "grossAmountCents" SET NOT NULL;
ALTER TABLE "charges" DROP COLUMN "amount";

-- Payments
ALTER TABLE "payments" ADD COLUMN "receiptNumber" TEXT;
ALTER TABLE "payments" ADD COLUMN "amountCents" INTEGER;
ALTER TABLE "payments" ADD COLUMN "status" "PaymentStatus" NOT NULL DEFAULT 'POSTED';
ALTER TABLE "payments" ADD COLUMN "recordedById" UUID;
ALTER TABLE "payments" ADD COLUMN "voidedAt" TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN "voidedById" UUID;
ALTER TABLE "payments" ADD COLUMN "voidReason" TEXT;

UPDATE "payments" SET "amountCents" = ROUND("amount" * 100)::int;

ALTER TABLE "payments" ALTER COLUMN "amountCents" SET NOT NULL;
ALTER TABLE "payments" DROP COLUMN "amount";

-- Exams
ALTER TABLE "exams" ADD COLUMN "periodId" UUID;
ALTER TABLE "exams" ADD COLUMN "gradingDeadline" TIMESTAMP(3);
ALTER TABLE "exams" ADD COLUMN "createdById" UUID;
ALTER TABLE "exams" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "exams" ADD COLUMN "publishedById" UUID;

-- Exam results
ALTER TABLE "exam_results" ADD COLUMN "enteredById" UUID;
ALTER TABLE "exam_results" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "exam_results" ADD COLUMN "approvedById" UUID;
ALTER TABLE "exam_results" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- Document records
ALTER TABLE "document_records" ADD COLUMN "examId" UUID;
ALTER TABLE "document_records" ADD COLUMN "protocolNumber" TEXT;
ALTER TABLE "document_records" ADD COLUMN "templateKey" TEXT;
ALTER TABLE "document_records" ADD COLUMN "templateVersion" INTEGER;
ALTER TABLE "document_records" ADD COLUMN "fileId" UUID;
ALTER TABLE "document_records" ADD COLUMN "issuedById" UUID;
ALTER TABLE "document_records" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "document_records" ADD COLUMN "signatureStatus" "SignatureStatus" NOT NULL DEFAULT 'NONE';

-- New tables
CREATE TABLE "number_sequences" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "scope" "NumberScope" NOT NULL,
    "period" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "enrollmentId" UUID,
    "count" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 30,
    "totalAmountCents" INTEGER NOT NULL,
    "status" "InstallmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scholarships" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "type" "ScholarshipType" NOT NULL,
    "percentage" INTEGER,
    "amountCents" INTEGER,
    "reason" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "status" "ScholarshipStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_periods" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "status" "ExamPeriodStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_periods_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_committee_members" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "teacherId" UUID NOT NULL,
    "role" "ExamCommitteeRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_committee_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_applications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "ExamApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "exam_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "dedupeKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- Indexes and unique constraints
CREATE UNIQUE INDEX "guardians_tenantId_userId_key" ON "guardians"("tenantId", "userId");
CREATE UNIQUE INDEX "notifications_tenantId_userId_dedupeKey_key" ON "notifications"("tenantId", "userId", "dedupeKey");
CREATE UNIQUE INDEX "charges_tenantId_sourceKey_key" ON "charges"("tenantId", "sourceKey");
CREATE INDEX "payments_tenantId_studentId_idx" ON "payments"("tenantId", "studentId");
CREATE INDEX "document_records_tenantId_status_idx" ON "document_records"("tenantId", "status");
CREATE INDEX "exams_tenantId_periodId_idx" ON "exams"("tenantId", "periodId");
CREATE UNIQUE INDEX "number_sequences_tenantId_scope_period_key" ON "number_sequences"("tenantId", "scope", "period");
CREATE UNIQUE INDEX "stored_files_tenantId_storageKey_key" ON "stored_files"("tenantId", "storageKey");
CREATE INDEX "stored_files_tenantId_idx" ON "stored_files"("tenantId");
CREATE INDEX "installment_plans_tenantId_studentId_idx" ON "installment_plans"("tenantId", "studentId");
CREATE INDEX "scholarships_tenantId_studentId_idx" ON "scholarships"("tenantId", "studentId");
CREATE INDEX "scholarships_tenantId_status_idx" ON "scholarships"("tenantId", "status");
CREATE UNIQUE INDEX "payment_allocations_paymentId_chargeId_key" ON "payment_allocations"("paymentId", "chargeId");
CREATE INDEX "payment_allocations_tenantId_chargeId_idx" ON "payment_allocations"("tenantId", "chargeId");
CREATE UNIQUE INDEX "exam_periods_tenantId_name_key" ON "exam_periods"("tenantId", "name");
CREATE INDEX "exam_periods_tenantId_idx" ON "exam_periods"("tenantId");
CREATE UNIQUE INDEX "exam_committee_members_examId_teacherId_role_key" ON "exam_committee_members"("examId", "teacherId", "role");
CREATE INDEX "exam_committee_members_tenantId_teacherId_idx" ON "exam_committee_members"("tenantId", "teacherId");
CREATE UNIQUE INDEX "exam_applications_examId_studentId_key" ON "exam_applications"("examId", "studentId");
CREATE INDEX "exam_applications_tenantId_studentId_idx" ON "exam_applications"("tenantId", "studentId");
CREATE INDEX "exam_applications_tenantId_status_idx" ON "exam_applications"("tenantId", "status");
CREATE UNIQUE INDEX "outbox_messages_dedupeKey_key" ON "outbox_messages"("dedupeKey");
CREATE INDEX "outbox_messages_status_nextAttemptAt_idx" ON "outbox_messages"("status", "nextAttemptAt");

-- Foreign keys
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_scholarshipId_fkey" FOREIGN KEY ("scholarshipId") REFERENCES "scholarships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "charges" ADD CONSTRAINT "charges_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "exam_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exams" ADD CONSTRAINT "exams_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "charges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_periods" ADD CONSTRAINT "exam_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_periods" ADD CONSTRAINT "exam_periods_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_committee_members" ADD CONSTRAINT "exam_committee_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_committee_members" ADD CONSTRAINT "exam_committee_members_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_committee_members" ADD CONSTRAINT "exam_committee_members_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_applications" ADD CONSTRAINT "exam_applications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_applications" ADD CONSTRAINT "exam_applications_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_applications" ADD CONSTRAINT "exam_applications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_applications" ADD CONSTRAINT "exam_applications_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
