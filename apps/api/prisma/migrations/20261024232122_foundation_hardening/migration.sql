-- CreateEnum
CREATE TYPE "CalendarDayKind" AS ENUM ('HOLIDAY', 'CLOSED', 'MAKEUP_DAY');

-- CreateEnum
CREATE TYPE "SubscriptionInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('SUCCEED', 'FAILED', 'PENDING');

-- CreateEnum
CREATE TYPE "SupportAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('DATA_PROCESSING', 'MEDIA_PUBLICATION', 'RECORDINGS', 'PHOTOGRAPHY', 'MARKETING', 'THIRD_PARTY_SHARING');

-- CreateEnum
CREATE TYPE "ConsentAction" AS ENUM ('GRANTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "DsarRequestType" AS ENUM ('ACCESS', 'PORTABILITY', 'ERASURE', 'RECTIFICATION');

-- CreateEnum
CREATE TYPE "DsarRequestStatus" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "SubscriptionInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "externalId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'SUCCEED',
    "method" TEXT,
    "failureCode" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_days" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "date" DATE NOT NULL,
    "kind" "CalendarDayKind" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_access_grants" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "ticketRef" TEXT,
    "status" "SupportAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "action" "ConsentAction" NOT NULL,
    "recordedById" UUID,
    "legalBasis" TEXT,
    "evidence" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsar_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "studentId" UUID,
    "type" "DsarRequestType" NOT NULL,
    "status" "DsarRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "requestedBy" TEXT NOT NULL,
    "notes" TEXT,
    "completedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsar_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "statusCode" INTEGER,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_externalId_key" ON "subscription_invoices"("externalId");

-- CreateIndex
CREATE INDEX "subscription_invoices_status_dueAt_idx" ON "subscription_invoices"("status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_subscriptionId_number_key" ON "subscription_invoices"("subscriptionId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_payments_externalId_key" ON "subscription_payments"("externalId");

-- CreateIndex
CREATE INDEX "subscription_payments_invoiceId_attemptedAt_idx" ON "subscription_payments"("invoiceId", "attemptedAt");

-- CreateIndex
CREATE INDEX "calendar_days_tenantId_date_idx" ON "calendar_days"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_days_tenantId_branchId_date_kind_key" ON "calendar_days"("tenantId", "branchId", "date", "kind");

-- CreateIndex
CREATE INDEX "support_access_grants_tenantId_status_expiresAt_idx" ON "support_access_grants"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "consent_events_tenantId_studentId_purpose_recordedAt_idx" ON "consent_events"("tenantId", "studentId", "purpose", "recordedAt");

-- CreateIndex
CREATE INDEX "dsar_requests_tenantId_status_dueAt_idx" ON "dsar_requests"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_tenantId_scope_key_key" ON "idempotency_keys"("tenantId", "scope", "key");

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "subscription_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_days" ADD CONSTRAINT "calendar_days_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬ Integrity constraints Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬Ξ²β€β‚¬
-- Prisma cannot express CHECK constraints, but PostgreSQL enforces them at all
-- times. They are the last line of defence described in section 8: a service
-- bug must not be able to persist impossible state. Everything below uses only
-- column-level, deterministic expressions, so it is valid in a row CHECK.
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_time_order_chk" CHECK ("endsAt" > "startsAt");
ALTER TABLE "lessons" ADD CONSTRAINT "lessons_duration_sane_chk" CHECK ("endsAt" - "startsAt" <= INTERVAL '12 hours');

ALTER TABLE "lesson_series" ADD CONSTRAINT "lesson_series_weekday_chk" CHECK ("weekday" BETWEEN 1 AND 7);
ALTER TABLE "lesson_series" ADD CONSTRAINT "lesson_series_duration_chk" CHECK ("durationMinutes" BETWEEN 5 AND 480);
ALTER TABLE "lesson_series" ADD CONSTRAINT "lesson_series_validity_chk" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE "lesson_series" ADD CONSTRAINT "lesson_series_start_time_chk" CHECK ("startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE "charges" ADD CONSTRAINT "charges_amounts_non_negative_chk" CHECK ("amountCents" >= 0 AND "grossAmountCents" >= 0 AND "discountAmountCents" >= 0);
ALTER TABLE "charges" ADD CONSTRAINT "charges_paid_within_amount_chk" CHECK ("paidAmountCents" >= 0 AND "paidAmountCents" <= "amountCents");
ALTER TABLE "charges" ADD CONSTRAINT "charges_void_consistency_chk" CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL));
ALTER TABLE "charges" ADD CONSTRAINT "charges_paid_status_chk" CHECK ("status" <> 'PAID' OR "paidAmountCents" = "amountCents");

ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive_chk" CHECK ("amountCents" > 0);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "allocations_amount_positive_chk" CHECK ("amountCents" > 0);

ALTER TABLE "exam_results" ADD CONSTRAINT "exam_results_grade_range_chk" CHECK ("grade" IS NULL OR ("grade" >= 0 AND "grade" <= 100));
-- NOTE: no "published implies approved" constraint. The seeded historical rows
-- and the exam lifecycle intentionally publish results that were entered by the
-- committee without a second approval record; approval is enforced by
-- ExamsService before publishing, and adding the DB check would reject that
-- legitimate legacy state.

ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_period_chk" CHECK ("endedAt" IS NULL OR "endedAt" >= "enrolledAt");
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_period_chk" CHECK ("endsOn" > "startsOn");
ALTER TABLE "exam_periods" ADD CONSTRAINT "exam_periods_period_chk" CHECK ("endsOn" >= "startsOn");

ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_count_chk" CHECK ("count" BETWEEN 1 AND 24 AND "intervalDays" BETWEEN 1 AND 366);
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_percentage_chk" CHECK ("percentage" IS NULL OR ("percentage" BETWEEN 0 AND 100));
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_validity_chk" CHECK ("validTo" IS NULL OR "validTo" >= "validFrom");

ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_reason_chk" CHECK (length(btrim("reason")) >= 5);
ALTER TABLE "support_access_grants" ADD CONSTRAINT "support_access_grants_expiry_chk" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_amounts_chk" CHECK ("subtotalCents" >= 0 AND "taxCents" >= 0 AND "totalCents" = "subtotalCents" + "taxCents");
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_period_chk" CHECK ("periodEnd" > "periodStart");
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_amount_chk" CHECK ("amountCents" > 0);

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_capacity_chk" CHECK ("capacity" > 0);
ALTER TABLE "plans" ADD CONSTRAINT "plans_price_chk" CHECK ("priceMonthly" >= 0);

ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_chk" CHECK ("size" > 0);
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$');
ALTER TABLE "document_records" ADD CONSTRAINT "document_records_approved_consistency_chk" CHECK (("approvedAt" IS NULL) = ("approvedById" IS NULL));
