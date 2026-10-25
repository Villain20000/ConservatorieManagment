-- Admissions CRM: leads, lead activities, stage enums, notification types.

CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'TRIAL_BOOKED', 'TRIAL_COMPLETED', 'OFFER_SENT', 'ENROLLED', 'LOST');
CREATE TYPE "LeadSource" AS ENUM ('WEB_FORM', 'PHONE', 'WALK_IN', 'REFERRAL', 'CAMPAIGN', 'SOCIAL', 'OTHER');
CREATE TYPE "LeadActivityType" AS ENUM ('NOTE', 'CALL', 'EMAIL', 'MEETING', 'STAGE_CHANGE', 'TRIAL_SCHEDULED', 'FOLLOW_UP', 'CONVERSION');

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRM_LEAD_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRM_FOLLOW_UP_DUE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CRM_CONVERTED';

CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "studentFirstName" TEXT NOT NULL,
    "studentLastName" TEXT NOT NULL,
    "birthDate" DATE,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "relationship" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WEB_FORM',
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "programId" UUID,
    "notes" TEXT,
    "assignedToId" UUID,
    "nextFollowUpAt" TIMESTAMPTZ(3),
    "lostReason" TEXT,
    "consentAt" TIMESTAMP(3),
    "convertedStudentId" UUID,
    "convertedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "actorId" UUID,
    "type" "LeadActivityType" NOT NULL,
    "fromStage" "LeadStage",
    "toStage" "LeadStage",
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_tenantId_stage_idx" ON "leads"("tenantId", "stage");
CREATE INDEX "leads_tenantId_createdAt_idx" ON "leads"("tenantId", "createdAt");
CREATE INDEX "leads_tenantId_nextFollowUpAt_idx" ON "leads"("tenantId", "nextFollowUpAt");
CREATE INDEX "leads_tenantId_deletedAt_idx" ON "leads"("tenantId", "deletedAt");
CREATE UNIQUE INDEX "leads_tenantId_id_key" ON "leads"("tenantId", "id");
CREATE INDEX "lead_activities_tenantId_leadId_createdAt_idx" ON "lead_activities"("tenantId", "leadId", "createdAt");

ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_branchId_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_programId_fkey"
  FOREIGN KEY ("tenantId", "programId") REFERENCES "programs"("tenantId", "id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedStudentId_fkey"
  FOREIGN KEY ("convertedStudentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_tenantId_leadId_fkey"
  FOREIGN KEY ("tenantId", "leadId") REFERENCES "leads"("tenantId", "id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
